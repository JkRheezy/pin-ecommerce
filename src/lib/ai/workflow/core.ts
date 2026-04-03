/**
 * Core Workflow Orchestration Module
 * 
 * This module provides the main workflow orchestration logic for AI workflows
 * following the six-layer architecture pattern.
 * 
 * Layer: Service (coordinates between Repo and Runtime layers)
 */

import { z } from 'zod';
import { Logger } from '@harness/logging';
import { Result, ok, err } from '@harness/result';

// ============================================================================
// Types Layer
// ============================================================================

/**
 * Unique identifier for a workflow execution
 */
export type WorkflowExecutionId = string & { __brand: 'WorkflowExecutionId' };

/**
 * Workflow status states
 */
export enum WorkflowStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Base workflow context passed through all steps
 */
export interface WorkflowContext {
  readonly executionId: WorkflowExecutionId;
  readonly workflowId: string;
  readonly correlationId: string;
  readonly startedAt: Date;
  readonly metadata: Record<string, unknown>;
}

/**
 * Result of a single workflow step execution
 */
export interface StepResult<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: WorkflowError;
  readonly durationMs: number;
}

/**
 * Structured workflow error
 */
export class WorkflowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = false,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}

/**
 * Workflow step definition
 */
export interface WorkflowStep<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly name: string;
  readonly execute: (input: TInput, context: WorkflowContext) => Promise<Result<TOutput, WorkflowError>>;
  readonly compensate?: (output: TOutput, context: WorkflowContext) => Promise<Result<void, WorkflowError>>;
  readonly retryPolicy?: RetryPolicy;
}

/**
 * Retry policy for failed steps
 */
export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly backoffMs: number;
  readonly maxBackoffMs: number;
  readonly exponential: boolean;
}

/**
 * Workflow definition composed of steps
 */
export interface WorkflowDefinition {
  readonly id: string;
  readonly version: string;
  readonly steps: readonly WorkflowStep[];
  readonly onError?: (error: WorkflowError, context: WorkflowContext) => Promise<void>;
}

/**
 * Execution record for persistence
 */
export interface WorkflowExecutionRecord {
  readonly executionId: WorkflowExecutionId;
  readonly workflowId: string;
  readonly status: WorkflowStatus;
  readonly currentStepIndex: number;
  readonly stepResults: readonly StepResult[];
  readonly context: WorkflowContext;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt?: Date;
}

// ============================================================================
// Config Layer
// ============================================================================

/**
 * Workflow orchestrator configuration
 */
export interface WorkflowOrchestratorConfig {
  readonly defaultRetryPolicy: RetryPolicy;
  readonly maxConcurrentExecutions: number;
  readonly stepTimeoutMs: number;
  readonly enableCompensation: boolean;
}

const DefaultConfig: WorkflowOrchestratorConfig = {
  defaultRetryPolicy: {
    maxAttempts: 3,
    backoffMs: 1000,
    maxBackoffMs: 30000,
    exponential: true,
  },
  maxConcurrentExecutions: 100,
  stepTimeoutMs: 300000, // 5 minutes
  enableCompensation: true,
};

// ============================================================================
// Repository Layer (Interface)
// ============================================================================

/**
 * Repository interface for workflow execution persistence
 */
export interface WorkflowExecutionRepository {
  save(record: WorkflowExecutionRecord): Promise<Result<void, Error>>;
  findById(executionId: WorkflowExecutionId): Promise<Result<WorkflowExecutionRecord | null, Error>>;
  updateStatus(
    executionId: WorkflowExecutionId,
    status: WorkflowStatus,
    updates?: Partial<WorkflowExecutionRecord>
  ): Promise<Result<void, Error>>;
  listActive(): Promise<Result<WorkflowExecutionRecord[], Error>>;
}

// ============================================================================
// Service Layer - Core Orchestration Logic
// ============================================================================

/**
 * Dependencies injected into the orchestrator
 */
export interface OrchestratorDependencies {
  readonly repository: WorkflowExecutionRepository;
  readonly logger: Logger;
  readonly config?: Partial<WorkflowOrchestratorConfig>;
}

/**
 * Main workflow orchestrator class
 * 
 * Responsible for coordinating workflow execution, managing state transitions,
 * handling retries, and ensuring proper error handling and compensation.
 */
export class WorkflowOrchestrator {
  private readonly config: WorkflowOrchestratorConfig;
  private readonly logger: Logger;
  private readonly repository: WorkflowExecutionRepository;
  private readonly activeExecutions: Map<WorkflowExecutionId, AbortController>;

  constructor(deps: OrchestratorDependencies) {
    this.config = { ...DefaultConfig, ...deps.config };
    this.logger = deps.logger.child({ component: 'WorkflowOrchestrator' });
    this.repository = deps.repository;
    this.activeExecutions = new Map();
  }

  /**
   * Start a new workflow execution
   * 
   * Creates execution record, initializes context, and begins step processing.
   * Returns immediately with execution ID; processing continues asynchronously.
   */
  async startWorkflow(
    workflow: WorkflowDefinition,
    initialInput: unknown,
    metadata: Record<string, unknown> = {}
  ): Promise<Result<WorkflowExecutionId, WorkflowError>> {
    // Validate workflow definition
    const validationResult = this.validateWorkflow(workflow);
    if (!validationResult.success) {
      return err(validationResult.error);
    }

    // Check concurrent execution limits
    if (this.activeExecutions.size >= this.config.maxConcurrentExecutions) {
      return err(
        new WorkflowError(
          'Maximum concurrent executions reached',
          'CONCURRENCY_LIMIT_EXCEEDED',
          true
        )
      );
    }

    const executionId = this.generateExecutionId();
    const context: WorkflowContext = {
      executionId,
      workflowId: workflow.id,
      correlationId: this.generateCorrelationId(),
      startedAt: new Date(),
      metadata,
    };

    const record: WorkflowExecutionRecord = {
      executionId,
      workflowId: workflow.id,
      status: WorkflowStatus.PENDING,
      currentStepIndex: 0,
      stepResults: [],
      context,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Persist initial record
    const saveResult = await this.repository.save(record);
    if (!saveResult.success) {
      this.logger.error('Failed to save workflow execution', {
        executionId,
        error: saveResult.error.message,
      });
      return err(
        new WorkflowError(
          'Failed to persist workflow execution',
          'PERSISTENCE_ERROR',
          false,
          saveResult.error
        )
      );
    }

    // Start execution asynchronously
    this.executeWorkflow(workflow, record, initialInput).catch((error) => {
      this.logger.error('Unhandled workflow execution error', {
        executionId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return ok(executionId);
  }

  /**
   * Resume a paused or failed workflow execution
   * 
   * Retrieves execution state and continues from current step.
   */
  async resumeWorkflow(
    executionId: WorkflowExecutionId,
    workflow: WorkflowDefinition
  ): Promise<Result<void, WorkflowError>> {
    const findResult = await this.repository.findById(executionId);
    if (!findResult.success) {
      return err(
        new WorkflowError(
          'Failed to retrieve workflow execution',
          'PERSISTENCE_ERROR',
          false,
          findResult.error
        )
      );
    }

    const record = findResult.data;
    if (!record) {
      return err(
        new WorkflowError(
          `Workflow execution not found: ${executionId}`,
          'EXECUTION_NOT_FOUND',
          false
        )
      );
    }

    if (record.status !== WorkflowStatus.PAUSED && record.status !== WorkflowStatus.FAILED) {
      return err(
        new WorkflowError(
          `Cannot resume workflow in status: ${record.status}`,
          'INVALID_STATUS_TRANSITION',
          false
        )
      );
    }

    // Resume from last known state
    this.executeWorkflow(workflow, record, undefined, true).catch((error) => {
      this.logger.error('Unhandled workflow resume error', {
        executionId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return ok(undefined);
  }

  /**
   * Cancel a running workflow execution
   * 
   * Signals abort to active execution and triggers compensation if enabled.
   */
  async cancelWorkflow(executionId: WorkflowExecutionId): Promise<Result<void, WorkflowError>> {
    const controller = this.activeExecutions.get(executionId);
    if (!controller) {
      // Check if execution exists but isn't active
      const findResult = await this.repository.findById(executionId);
      if (!findResult.success) {
        return err(
          new WorkflowError(
            'Failed to retrieve workflow execution',
            'PERSISTENCE_ERROR',
            false,
            findResult.error
          )
        );
      }

      if (!findResult.data) {
        return err(
          new WorkflowError(
            `Workflow execution not found: ${executionId}`,
            'EXECUTION_NOT_FOUND',
            false
          )
        );
      }

      // Already completed or cancelled
      if (
        findResult.data.status === WorkflowStatus.COMPLETED ||
        findResult.data.status === WorkflowStatus.CANCELLED
      ) {
        return ok(undefined);
      }

      // Update status to cancelled
      await this.repository.updateStatus(executionId, WorkflowStatus.CANCELLED, {
        completedAt: new Date(),
      });
      return ok(undefined);
    }

    // Signal abort to running execution
    controller.abort();
    return ok(undefined);
  }

  /**
   * Main workflow execution loop
   * 
   * Processes each step sequentially, handling retries, errors, and compensation.
   * This is the core orchestration logic that manages the workflow lifecycle.
   */
  private async executeWorkflow(
    workflow: WorkflowDefinition,
    record: WorkflowExecutionRecord,
    initialInput: unknown | undefined,
    isResume: boolean = false
  ): Promise<void> {
    const abortController = new AbortController();
    this.activeExecutions.set(record.executionId, abortController);

    const executionLogger = this.logger.child({
      executionId: record.executionId,
      workflowId: workflow.id,
    });

    executionLogger.info('Starting workflow execution', {
      stepCount: workflow.steps.length,
      isResume,
    });

    try {
      // Update status to running
      await this.repository.updateStatus(record.executionId, WorkflowStatus.RUNNING);
      
      let currentInput: unknown = initialInput;
      const stepResults: StepResult[] = [...record.stepResults];
      const completedSteps: Array<{ step: WorkflowStep; output: unknown }> = [];

      // Process steps starting from current index
      for (
        let i = record.currentStepIndex;
        i < workflow.steps.length;
        i++
      ) {
        // Check for cancellation
        if (abortController.signal.aborted) {
          executionLogger.info('Workflow execution cancelled');
          await this.handleCancellation(workflow, completedSteps, record.context);
          return;
        }

        const step = workflow.steps[i];
        const stepLogger = executionLogger.child({ stepId: step.id, stepIndex: i });

        stepLogger.info('Executing workflow step');

        // Execute step with retry logic
        const stepResult = await this.executeStepWithRetry(
          step,
          currentInput,
          record.context,
          stepLogger
        );

        // Update execution record with progress
        stepResults.push(stepResult);
        await this.repository.updateStatus(record.executionId, WorkflowStatus.RUNNING, {
          currentStepIndex: i + 1,
          stepResults,
          updatedAt: new Date(),
        });

        if (!stepResult.success) {
          stepLogger.error('Step execution failed', {
            errorCode: stepResult.error?.code,
            errorMessage: stepResult.error?.message,
          });

          // Attempt compensation for completed steps
          if (this.config.enableCompensation) {
            await this.compensateSteps(completedSteps, record.context, stepLogger);
          }

          // Update final status
          const finalStatus = stepResult.error?.recoverable
            ? WorkflowStatus.PAUSED
            : WorkflowStatus.FAILED;

          await this.repository.updateStatus(record.executionId, finalStatus, {
            stepResults,
            completedAt: new Date(),
          });

          // Call workflow error handler if defined
          if (workflow.onError && stepResult.error) {
            await workflow.onError(stepResult.error, record.context);
          }

          return;
        }

        // Step succeeded - store for potential compensation
        completedSteps.push({ step, output: stepResult.data });
        currentInput = stepResult.data;

        stepLogger.info('Step completed successfully', {
          durationMs: stepResult.durationMs,
        });
      }

      // All steps completed successfully
      executionLogger.info('Workflow execution completed successfully');
      await this.repository.updateStatus(record.executionId, WorkflowStatus.COMPLETED, {
        stepResults,
        completedAt: new Date(),
      });

    } catch (error) {
      executionLogger.error('Unexpected workflow execution error', {
        error: error instanceof Error ? error.message : String(error),
      });

      await this.repository.updateStatus(record.executionId, WorkflowStatus.FAILED, {
        completedAt: new Date(),
      });

      throw error; // Re-throw for top-level error handling
    } finally {
      this.activeExecutions.delete(record.executionId);
    }
  }

  /**
   * Execute a single step with retry logic
   * 
   * Applies the step's retry policy or falls back to default configuration.
   * Wraps execution in a timeout to prevent indefinite hangs.
   */
  private async executeStepWithRetry(
    step: WorkflowStep,
    input: unknown,
    context: WorkflowContext,
    logger: Logger
  ): Promise<StepResult> {
    const retryPolicy = step.retryPolicy ?? this.config.defaultRetryPolicy;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
      try {
        // Execute with timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`Step timeout after ${this.config.stepTimeoutMs}ms`)),
            this.config.stepTimeoutMs
          );
        });

        const result = await Promise.race([
          step.execute(input, context),
          timeoutPromise,
        ]);

        if (result.success) {
          return {
            success: true,
            data: result.data,
            durationMs: Date.now() - startTime,
          };
        }

        // Execution returned error result
        if (attempt === retryPolicy.maxAttempts || !result.error?.recoverable) {
          return {
            success: false,
            error: result.error,
            durationMs: Date.now() - startTime,
          };
        }

        // Retryable error - wait and retry
        const delayMs = this.calculateBackoff(retryPolicy, attempt);
        logger.warn('Step failed, retrying', {
          attempt,
          maxAttempts: retryPolicy.maxAttempts,
          delayMs,
          errorCode: result.error.code,
        });
        await this.delay(delayMs);

      } catch (error) {
        const wrappedError = new WorkflowError(
          error instanceof Error ? error.message : 'Step execution failed',
          'STEP_EXECUTION_ERROR',
          attempt < retryPolicy.maxAttempts,
          error instanceof Error ? error : undefined
        );

        if (attempt === retryPolicy.maxAttempts) {
          return {
            success: false,
            error: wrappedError,
            durationMs: Date.now() - startTime,
          };
        }

        const delayMs = this.calculateBackoff(retryPolicy, attempt);
        logger.warn('Step threw exception, retrying', {
          attempt,
          maxAttempts: retryPolicy.maxAttempts,
          delayMs,
          error: wrappedError.message,
        });
        await this.delay(delayMs);
      }
    }

    // Should not reach here, but TypeScript needs a return
    return {
      success: false,
      error: new WorkflowError('Max retries exceeded', 'MAX_RETRIES_EXCEEDED', false),
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Calculate backoff delay with optional exponential increase
   */
  private calculateBackoff(policy: RetryPolicy, attempt: number): number {
    if (!policy.exponential) {
      return Math.min(policy.backoffMs, policy.maxBackoffMs);
    }
    const delay = policy.backoffMs * Math.pow(2, attempt - 1);
    return Math.min(delay, policy.maxBackoffMs);
  }

  /**
   * Execute compensation for completed steps in reverse order
   * 
   * This ensures system consistency by undoing partial work when a workflow fails.
   * Compensation failures are logged but don't prevent status updates.
   */
  private async compensateSteps(
    completedSteps: Array<{ step: WorkflowStep; output: unknown }>,
    context: WorkflowContext,
    logger: Logger
  ): Promise<void> {
    logger.info('Starting compensation for completed steps', {
      stepCount: completedSteps.length,
    });

    // Process in reverse order (LIFO)
    for (let i = completedSteps.length - 1; i >= 0; i--) {
      const { step, output } = completedSteps[i];
      
      if (!step.compensate) {
        logger.debug('Step has no compensation handler, skipping', { stepId: step.id });
        continue;
      }

      try {
        const result = await step.compensate(output, context);
        if (result.success) {
          logger.info('Step compensation succeeded', { stepId: step.id });
        } else {
          logger.error('Step compensation failed', {
            stepId: step.id,
            error: result.error?.message,
          });
        }
      } catch (error) {
        logger.error('Step compensation threw exception', {
          stepId: step.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Handle workflow cancellation by compensating completed steps
   */
  private async handleCancellation(
    workflow: WorkflowDefinition,
    completedSteps: Array<{ step: WorkflowStep; output: unknown }>,
    context: WorkflowContext
  ): Promise<void> {
    if (this.config.enableCompensation) {
      await this.compensateSteps(
        completedSteps,
        context,
        this.logger.child({ executionId: context.executionId })
      );
    }

    await this.repository.updateStatus(context.executionId, WorkflowStatus.CANCELLED, {
      completedAt: new Date(),
    });
  }

  /**
   * Validate workflow definition structure
   */
  private validateWorkflow(workflow: WorkflowDefinition): Result<void, WorkflowError> {
    if (!workflow.id || typeof workflow.id !== 'string') {
      return err(new WorkflowError('Workflow must have a valid id', 'INVALID_WORKFLOW', false));
    }

    if (!workflow.version || typeof workflow.version !== 'string') {
      return err(new WorkflowError('Workflow must have a valid version', 'INVALID_WORKFLOW', false));
    }

    if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
      return err(new WorkflowError('Workflow must have at least one step', 'INVALID_WORKFLOW', false));
    }

    const stepIds = new Set<string>();
    for (const step of workflow.steps) {
      if (!step.id || typeof step.id !== 'string') {
        return err(new WorkflowError('All steps must have valid ids', 'INVALID_WORKFLOW', false));
      }
      if (stepIds.has(step.id)) {
        return err(new WorkflowError(`Duplicate step id: ${step.id}`, 'INVALID_WORKFLOW', false));
      }
      stepIds.add(step.id);
    }

    return ok(undefined);
  }

  /**
   * Generate unique execution identifier
   */
  private generateExecutionId(): WorkflowExecutionId {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` as WorkflowExecutionId;
  }

  /**
   * Generate correlation identifier for tracing
   */
  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Promise-based delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory and Export
// ============================================================================

/**
 * Create a configured workflow orchestrator instance
 */
export function createWorkflowOrchestrator(deps: OrchestratorDependencies): WorkflowOrchestrator {
  return new WorkflowOrchestrator(deps);
}

// Re-export types for consumers
export type {
  WorkflowOrchestratorConfig,
  OrchestratorDependencies,
  WorkflowStep,
  WorkflowDefinition,
  WorkflowContext,
  StepResult,
  WorkflowExecutionRecord,
  RetryPolicy,
};