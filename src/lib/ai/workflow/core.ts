/**
 * Workflow Core Module
 * 
 * Orchestrates the main workflow execution lifecycle following the six-layer architecture.
 * Layer: Service (coordinates between Repo and Runtime layers)
 */

import { z } from 'zod';
import { Logger } from '@/lib/logging';
import { Result, ok, err } from '@/lib/result';
import { WorkflowConfig, WorkflowConfigSchema } from './types';
import { WorkflowRepository } from './repo';
import { WorkflowRuntime } from './runtime';

// -----------------------------------------------------------------------------
// Types Layer
// -----------------------------------------------------------------------------

/**
 * Unique identifier for workflow executions
 */
type WorkflowExecutionId = string & { __brand: 'WorkflowExecutionId' };

/**
 * Possible states of a workflow execution
 */
enum WorkflowExecutionState {
  Pending = 'PENDING',
  Running = 'RUNNING',
  Paused = 'PAUSED',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
  Cancelled = 'CANCELLED',
}

/**
 * Context passed through workflow execution stages
 */
interface WorkflowContext {
  executionId: WorkflowExecutionId;
  config: WorkflowConfig;
  state: WorkflowExecutionState;
  metadata: Record<string, unknown>;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Error types specific to workflow orchestration
 */
enum WorkflowErrorCode {
  InvalidConfig = 'INVALID_CONFIG',
  ExecutionNotFound = 'EXECUTION_NOT_FOUND',
  ExecutionAlreadyRunning = 'EXECUTION_ALREADY_RUNNING',
  RuntimeError = 'RUNTIME_ERROR',
  StepFailed = 'STEP_FAILED',
  TimeoutExceeded = 'TIMEOUT_EXCEEDED',
  CancellationFailed = 'CANCELLATION_FAILED',
}

interface WorkflowError {
  code: WorkflowErrorCode;
  message: string;
  cause?: Error;
  context?: Partial<WorkflowContext>;
}

// -----------------------------------------------------------------------------
// Config Layer
// -----------------------------------------------------------------------------

/**
 * Configuration for the workflow orchestrator
 */
interface OrchestratorConfig {
  /** Maximum concurrent executions allowed */
  maxConcurrentExecutions: number;
  /** Default timeout for workflow execution in milliseconds */
  defaultTimeoutMs: number;
  /** Whether to enable automatic retry on failure */
  enableRetry: boolean;
  /** Maximum retry attempts */
  maxRetries: number;
}

const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  maxConcurrentExecutions: 10,
  defaultTimeoutMs: 300000, // 5 minutes
  enableRetry: true,
  maxRetries: 3,
};

// -----------------------------------------------------------------------------
// Service Layer
// -----------------------------------------------------------------------------

/**
 * Core workflow orchestrator responsible for managing workflow lifecycle
 */
class WorkflowOrchestrator {
  private readonly logger: Logger;
  private readonly config: OrchestratorConfig;
  private readonly repository: WorkflowRepository;
  private readonly runtime: WorkflowRuntime;
  
  /** Active executions tracked by execution ID */
  private readonly activeExecutions: Map<WorkflowExecutionId, AbortController>;
  /** Semaphore for controlling concurrent execution limit */
  private runningCount: number;

  constructor(
    repository: WorkflowRepository,
    runtime: WorkflowRuntime,
    config: Partial<OrchestratorConfig> = {},
    logger: Logger = new Logger('WorkflowOrchestrator')
  ) {
    this.repository = repository;
    this.runtime = runtime;
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    this.logger = logger;
    this.activeExecutions = new Map();
    this.runningCount = 0;
  }

  /**
   * Initiates a new workflow execution
   * 
   * Validates configuration, acquires execution slot, and delegates to runtime.
   * Returns immediately with execution ID; actual execution runs asynchronously.
   */
  async startWorkflow(
    config: unknown,
    metadata: Record<string, unknown> = {}
  ): Promise<Result<WorkflowExecutionId, WorkflowError>> {
    // Validate input configuration using schema
    const parseResult = WorkflowConfigSchema.safeParse(config);
    if (!parseResult.success) {
      this.logger.warn('Workflow configuration validation failed', {
        errors: parseResult.error.errors,
      });
      return err({
        code: WorkflowErrorCode.InvalidConfig,
        message: 'Invalid workflow configuration',
        cause: parseResult.error,
      });
    }

    const validatedConfig = parseResult.data;

    // Check concurrent execution limit
    if (this.runningCount >= this.config.maxConcurrentExecutions) {
      this.logger.warn('Max concurrent executions reached', {
        current: this.runningCount,
        max: this.config.maxConcurrentExecutions,
      });
      return err({
        code: WorkflowErrorCode.ExecutionAlreadyRunning,
        message: `Maximum concurrent executions (${this.config.maxConcurrentExecutions}) reached`,
      });
    }

    // Persist execution record and generate ID
    const executionId = await this.repository.createExecution(
      validatedConfig,
      metadata
    ) as WorkflowExecutionId;

    // Initialize execution context
    const context: WorkflowContext = {
      executionId,
      config: validatedConfig,
      state: WorkflowExecutionState.Pending,
      metadata,
      startedAt: new Date(),
    };

    // Acquire execution slot and start async execution
    this.runningCount++;
    const abortController = new AbortController();
    this.activeExecutions.set(executionId, abortController);

    // Delegate to runtime without awaiting - fire and forget pattern
    this.executeWorkflowInternal(context, abortController.signal).catch((error) => {
      // Unhandled errors in async execution are logged but don't affect the start response
      this.logger.error('Unhandled error in workflow execution', {
        executionId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    this.logger.info('Workflow execution started', { executionId, config: validatedConfig.name });
    return ok(executionId);
  }

  /**
   * Internal execution handler - coordinates with runtime layer
   * 
   * This method manages the full lifecycle: PENDING → RUNNING → [COMPLETED|FAILED]
   */
  private async executeWorkflowInternal(
    context: WorkflowContext,
    signal: AbortSignal
  ): Promise<void> {
    try {
      // Transition to running state
      context.state = WorkflowExecutionState.Running;
      await this.repository.updateExecutionState(context.executionId, context.state);

      // Set up timeout handling
      const timeoutMs = context.config.timeoutMs ?? this.config.defaultTimeoutMs;
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Workflow execution timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        
        // Clean up timeout if execution completes normally
        signal.addEventListener('abort', () => clearTimeout(timeoutId));
      });

      // Execute workflow via runtime layer with race against timeout
      const executionPromise = this.runtime.execute(context.config, signal, (stepResult) => {
        // Progress callback - persist intermediate state
        this.repository.recordStepResult(context.executionId, stepResult).catch((err) => {
          this.logger.error('Failed to record step result', {
            executionId: context.executionId,
            error: err,
          });
        });
      });

      // Race between successful execution and timeout
      await Promise.race([executionPromise, timeoutPromise]);

      // Success path
      context.state = WorkflowExecutionState.Completed;
      context.completedAt = new Date();
      await this.repository.updateExecutionState(
        context.executionId,
        context.state,
        { completedAt: context.completedAt }
      );

      this.logger.info('Workflow execution completed successfully', {
        executionId: context.executionId,
        durationMs: context.completedAt.getTime() - context.startedAt.getTime(),
      });

    } catch (error) {
      await this.handleExecutionError(context, error);
    } finally {
      // Always clean up resources
      this.activeExecutions.delete(context.executionId);
      this.runningCount--;
    }
  }

  /**
   * Centralized error handling for workflow execution failures
   */
  private async handleExecutionError(
    context: WorkflowContext,
    error: unknown
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes('timed out');

    context.state = WorkflowExecutionState.Failed;
    context.completedAt = new Date();

    const workflowError: WorkflowError = {
      code: isTimeout ? WorkflowErrorCode.TimeoutExceeded : WorkflowErrorCode.RuntimeError,
      message: errorMessage,
      cause: error instanceof Error ? error : undefined,
      context: { ...context },
    };

    // Persist failure state
    await this.repository.updateExecutionState(
      context.executionId,
      context.state,
      {
        completedAt: context.completedAt,
        error: workflowError,
      }
    );

    this.logger.error('Workflow execution failed', {
      executionId: context.executionId,
      errorCode: workflowError.code,
      errorMessage,
      durationMs: context.completedAt.getTime() - context.startedAt.getTime(),
    });

    // Trigger retry if enabled and applicable
    if (this.shouldRetry(workflowError, context)) {
      await this.attemptRetry(context);
    }
  }

  /**
   * Determines if a failed execution should be retried
   */
  private shouldRetry(error: WorkflowError, context: WorkflowContext): boolean {
    if (!this.config.enableRetry) return false;
    if (error.code === WorkflowErrorCode.TimeoutExceeded) return false; // Don't retry timeouts
    
    const retryCount = (context.metadata.retryCount as number) ?? 0;
    return retryCount < this.config.maxRetries;
  }

  /**
   * Attempts to retry a failed workflow execution
   */
  private async attemptRetry(originalContext: WorkflowContext): Promise<void> {
    const retryCount = ((originalContext.metadata.retryCount as number) ?? 0) + 1;
    
    this.logger.info('Attempting workflow retry', {
      originalExecutionId: originalContext.executionId,
      retryCount,
      maxRetries: this.config.maxRetries,
    });

    // Create new execution with incremented retry count
    const retryMetadata = {
      ...originalContext.metadata,
      retryCount,
      originalExecutionId: originalContext.executionId,
    };

    const retryResult = await this.startWorkflow(originalContext.config, retryMetadata);
    
    if (retryResult.isErr()) {
      this.logger.error('Failed to initiate retry', {
        originalExecutionId: originalContext.executionId,
        error: retryResult.error,
      });
    }
  }

  /**
   * Cancels an in-progress workflow execution
   */
  async cancelWorkflow(
    executionId: WorkflowExecutionId
  ): Promise<Result<void, WorkflowError>> {
    const controller = this.activeExecutions.get(executionId);
    
    if (!controller) {
      // Check if execution exists but is not active
      const execution = await this.repository.getExecution(executionId);
      if (!execution) {
        return err({
          code: WorkflowErrorCode.ExecutionNotFound,
          message: `Execution ${executionId} not found`,
        });
      }
      
      if (execution.state !== WorkflowExecutionState.Running) {
        return err({
          code: WorkflowErrorCode.CancellationFailed,
          message: `Cannot cancel execution in ${execution.state} state`,
        });
      }

      // Execution should be active but isn't tracked - inconsistent state
      this.logger.error('Execution in running state but not tracked', { executionId });
      return err({
        code: WorkflowErrorCode.CancellationFailed,
        message: 'Execution state inconsistency detected',
      });
    }

    // Signal cancellation to runtime
    controller.abort();
    
    // Update persisted state
    await this.repository.updateExecutionState(
      executionId,
      WorkflowExecutionState.Cancelled,
      { cancelledAt: new Date() }
    );

    this.logger.info('Workflow execution cancelled', { executionId });
    return ok(undefined);
  }

  /**
   * Retrieves current status of a workflow execution
   */
  async getExecutionStatus(
    executionId: WorkflowExecutionId
  ): Promise<Result<WorkflowContext, WorkflowError>> {
    const execution = await this.repository.getExecution(executionId);
    
    if (!execution) {
      return err({
        code: WorkflowErrorCode.ExecutionNotFound,
        message: `Execution ${executionId} not found`,
      });
    }

    return ok(execution as WorkflowContext);
  }

  /**
   * Returns metrics about current orchestrator state
   */
  getMetrics(): {
    activeExecutions: number;
    maxConcurrent: number;
    executionIds: WorkflowExecutionId[];
  } {
    return {
      activeExecutions: this.runningCount,
      maxConcurrent: this.config.maxConcurrentExecutions,
      executionIds: Array.from(this.activeExecutions.keys()),
    };
  }
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export {
  WorkflowOrchestrator,
  WorkflowExecutionState,
  WorkflowErrorCode,
  type WorkflowExecutionId,
  type WorkflowContext,
  type WorkflowError,
  type OrchestratorConfig,
};

// Factory function for dependency injection
export function createWorkflowOrchestrator(
  repository: WorkflowRepository,
  runtime: WorkflowRuntime,
  config?: Partial<OrchestratorConfig>,
  logger?: Logger
): WorkflowOrchestrator {
  return new WorkflowOrchestrator(repository, runtime, config, logger);
}