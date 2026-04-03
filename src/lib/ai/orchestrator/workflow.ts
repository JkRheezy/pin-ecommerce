/**
 * Workflow Module
 * 
 * Six-Layer Architecture: Types → Config → Repo → Service → Runtime → UI
 * Layer: Service (Layer 4) - Orchestrates workflow-specific logic
 * 
 * This module provides workflow orchestration capabilities for AI operations,
 * managing workflow lifecycle, state transitions, and execution coordination.
 */

import { z } from 'zod';
import { logger } from '@/lib/logging';
import { Result, ok, err } from '@/lib/result';
import { createError, ErrorCode } from '@/lib/errors';

// ============================================================================
// TYPES (Layer 1)
// ============================================================================

/**
 * Unique identifier for a workflow instance
 */
export type WorkflowId = string & { readonly __brand: 'WorkflowId' };

/**
 * Workflow execution status
 */
export const WorkflowStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type WorkflowStatus = typeof WorkflowStatus[keyof typeof WorkflowStatus];

/**
 * Workflow step definition
 */
export interface WorkflowStep<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly dependencies: readonly string[];
  readonly execute: (input: TInput, context: WorkflowContext) => Promise<Result<TOutput, WorkflowError>>;
  readonly retryPolicy?: RetryPolicy;
  readonly timeoutMs?: number;
}

/**
 * Retry policy for workflow steps
 */
export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly backoffMs: number;
  readonly maxBackoffMs: number;
  readonly exponential: boolean;
}

/**
 * Workflow context passed to each step execution
 */
export interface WorkflowContext {
  readonly workflowId: WorkflowId;
  readonly correlationId: string;
  readonly startedAt: Date;
  readonly stepResults: ReadonlyMap<string, unknown>;
  readonly metadata: ReadonlyRecord<string, unknown>;
  readonly signal: AbortSignal;
}

/**
 * Workflow definition
 */
export interface WorkflowDefinition<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description?: string;
  readonly steps: readonly WorkflowStep[];
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;
  readonly defaultRetryPolicy?: RetryPolicy;
  readonly globalTimeoutMs?: number;
}

/**
 * Workflow instance state
 */
export interface WorkflowInstance<TInput = unknown, TOutput = unknown> {
  readonly id: WorkflowId;
  readonly definitionId: string;
  readonly definitionVersion: string;
  readonly status: WorkflowStatus;
  readonly input: TInput;
  readonly output?: TOutput;
  readonly currentStepId?: string;
  readonly completedSteps: readonly string[];
  readonly failedSteps: ReadonlyMap<string, WorkflowError>;
  readonly stepOutputs: ReadonlyMap<string, unknown>;
  readonly startedAt: Date;
  readonly completedAt?: Date;
  readonly error?: WorkflowError;
  readonly metadata: ReadonlyRecord<string, unknown>;
}

/**
 * Workflow error type
 */
export interface WorkflowError {
  readonly code: string;
  readonly message: string;
  readonly stepId?: string;
  readonly cause?: unknown;
  readonly recoverable: boolean;
}

/**
 * Workflow execution options
 */
export interface WorkflowExecutionOptions {
  readonly correlationId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly abortSignal?: AbortSignal;
  readonly priority?: number;
}

// ============================================================================
// CONFIG (Layer 2)
// ============================================================================

/**
 * Default retry policy configuration
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: 1000,
  maxBackoffMs: 30000,
  exponential: true,
} as const;

/**
 * Default workflow timeout (5 minutes)
 */
export const DEFAULT_WORKFLOW_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Workflow module configuration
 */
export interface WorkflowModuleConfig {
  readonly enableMetrics: boolean;
  readonly maxConcurrentWorkflows: number;
  readonly defaultRetryPolicy: RetryPolicy;
  readonly defaultTimeoutMs: number;
}

/**
 * Default module configuration
 */
export const DEFAULT_CONFIG: WorkflowModuleConfig = {
  enableMetrics: true,
  maxConcurrentWorkflows: 100,
  defaultRetryPolicy: DEFAULT_RETRY_POLICY,
  defaultTimeoutMs: DEFAULT_WORKFLOW_TIMEOUT_MS,
} as const;

// ============================================================================
// REPO (Layer 3) - Type definitions for persistence layer
// ============================================================================

/**
 * Repository interface for workflow persistence
 * (Actual implementation would be in a separate file)
 */
export interface WorkflowRepository {
  save(instance: WorkflowInstance): Promise<Result<void, WorkflowError>>;
  load(id: WorkflowId): Promise<Result<WorkflowInstance | null, WorkflowError>>;
  updateStatus(
    id: WorkflowId,
    status: WorkflowStatus,
    updates?: Partial<WorkflowInstance>
  ): Promise<Result<void, WorkflowError>>;
  list(options: ListWorkflowsOptions): Promise<Result<readonly WorkflowInstance[], WorkflowError>>;
}

export interface ListWorkflowsOptions {
  readonly status?: WorkflowStatus;
  readonly definitionId?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly startedAfter?: Date;
  readonly startedBefore?: Date;
}

// ============================================================================
// SERVICE (Layer 4) - Core workflow orchestration logic
// ============================================================================

/**
 * Workflow engine service that orchestrates workflow execution
 */
export class WorkflowEngine {
  private readonly definitions = new Map<string, WorkflowDefinition>();
  private readonly activeWorkflows = new Map<WorkflowId, AbortController>();
  private readonly config: WorkflowModuleConfig;
  private repository?: WorkflowRepository;

  constructor(config: Partial<WorkflowModuleConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the repository for workflow persistence
   */
  setRepository(repository: WorkflowRepository): void {
    this.repository = repository;
  }

  /**
   * Register a workflow definition
   */
  registerDefinition<TInput, TOutput>(
    definition: WorkflowDefinition<TInput, TOutput>
  ): Result<void, WorkflowError> {
    const key = `${definition.id}@${definition.version}`;
    
    if (this.definitions.has(key)) {
      return err({
        code: 'DEFINITION_EXISTS',
        message: `Workflow definition ${key} already registered`,
        recoverable: false,
      });
    }

    // Validate step dependencies form a valid DAG
    const validationResult = this.validateDependencyGraph(definition.steps);
    if (!validationResult.success) {
      return err({
        code: 'INVALID_DEPENDENCIES',
        message: validationResult.error,
        recoverable: false,
      });
    }

    this.definitions.set(key, definition as WorkflowDefinition);
    
    logger.info('Workflow definition registered', {
      workflowId: definition.id,
      version: definition.version,
      stepCount: definition.steps.length,
    });

    return ok(undefined);
  }

  /**
   * Start a new workflow instance
   */
  async start<TInput, TOutput>(
    definitionId: string,
    version: string,
    input: TInput,
    options: WorkflowExecutionOptions = {}
  ): Promise<Result<WorkflowInstance<TInput, TOutput>, WorkflowError>> {
    const key = `${definitionId}@${version}`;
    const definition = this.definitions.get(key);

    if (!definition) {
      return err({
        code: 'DEFINITION_NOT_FOUND',
        message: `Workflow definition ${key} not found`,
        recoverable: false,
      });
    }

    // Validate input against schema
    const parseResult = definition.inputSchema.safeParse(input);
    if (!parseResult.success) {
      return err({
        code: 'INVALID_INPUT',
        message: `Input validation failed: ${parseResult.error.message}`,
        recoverable: false,
      });
    }

    const workflowId = this.generateWorkflowId();
    const correlationId = options.correlationId ?? this.generateCorrelationId();
    
    // Create abort controller for this workflow
    const abortController = new AbortController();
    if (options.abortSignal) {
      options.abortSignal.addEventListener('abort', () => abortController.abort());
    }
    this.activeWorkflows.set(workflowId, abortController);

    const instance: WorkflowInstance<TInput, TOutput> = {
      id: workflowId,
      definitionId,
      definitionVersion: version,
      status: WorkflowStatus.PENDING,
      input: parseResult.data,
      completedSteps: [],
      failedSteps: new Map(),
      stepOutputs: new Map(),
      startedAt: new Date(),
      metadata: Object.freeze(options.metadata ?? {}),
    };

    // Persist initial state
    if (this.repository) {
      const saveResult = await this.repository.save(instance);
      if (!saveResult.success) {
        this.activeWorkflows.delete(workflowId);
        return err(saveResult.error);
      }
    }

    logger.info('Workflow started', {
      workflowId,
      correlationId,
      definitionId,
      version,
    });

    // Begin execution asynchronously
    this.executeWorkflow(instance, definition as WorkflowDefinition, abortController.signal, correlationId)
      .catch(error => {
        logger.error('Unhandled workflow execution error', {
          workflowId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return ok(instance);
  }

  /**
   * Cancel a running workflow
   */
  async cancel(workflowId: WorkflowId): Promise<Result<void, WorkflowError>> {
    const controller = this.activeWorkflows.get(workflowId);
    
    if (!controller) {
      // Check if workflow exists in repository
      if (this.repository) {
        const loadResult = await this.repository.load(workflowId);
        if (!loadResult.success) {
          return err(loadResult.error);
        }
        if (!loadResult.data) {
          return err({
            code: 'WORKFLOW_NOT_FOUND',
            message: `Workflow ${workflowId} not found`,
            recoverable: false,
          });
        }
        if (loadResult.data.status === WorkflowStatus.COMPLETED || 
            loadResult.data.status === WorkflowStatus.FAILED ||
            loadResult.data.status === WorkflowStatus.CANCELLED) {
          return err({
            code: 'WORKFLOW_TERMINATED',
            message: `Workflow ${workflowId} is already in terminal state: ${loadResult.data.status}`,
            recoverable: false,
          });
        }
      }
      
      return err({
        code: 'WORKFLOW_NOT_ACTIVE',
        message: `Workflow ${workflowId} is not active`,
        recoverable: false,
      });
    }

    controller.abort();
    this.activeWorkflows.delete(workflowId);

    if (this.repository) {
      const updateResult = await this.repository.updateStatus(
        workflowId,
        WorkflowStatus.CANCELLED,
        { completedAt: new Date() }
      );
      if (!updateResult.success) {
        return err(updateResult.error);
      }
    }

    logger.info('Workflow cancelled', { workflowId });

    return ok(undefined);
  }

  /**
   * Get workflow instance by ID
   */
  async getWorkflow(workflowId: WorkflowId): Promise<Result<WorkflowInstance | null, WorkflowError>> {
    if (!this.repository) {
      return err({
        code: 'REPOSITORY_NOT_CONFIGURED',
        message: 'Workflow repository not configured',
        recoverable: false,
      });
    }

    return this.repository.load(workflowId);
  }

  /**
   * Main workflow execution loop
   */
  private async executeWorkflow<TInput, TOutput>(
    instance: WorkflowInstance<TInput, TOutput>,
    definition: WorkflowDefinition<TInput, TOutput>,
    signal: AbortSignal,
    correlationId: string
  ): Promise<void> {
    const startTime = Date.now();
    const timeoutMs = definition.globalTimeoutMs ?? this.config.defaultTimeoutMs;

    try {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.activeWorkflows.get(instance.id)?.abort();
      }, timeoutMs);

      // Update status to running
      await this.updateInstanceStatus(instance.id, WorkflowStatus.RUNNING);

      const context: WorkflowContext = {
        workflowId: instance.id,
        correlationId,
        startedAt: instance.startedAt,
        stepResults: instance.stepOutputs,
        metadata: instance.metadata,
        signal,
      };

      // Build execution plan (topological sort of steps)
      const executionOrder = this.topologicalSort(definition.steps);
      
      // Execute steps in order
      for (const step of executionOrder) {
        if (signal.aborted) {
          throw new Error('Workflow cancelled');
        }

        // Check if all dependencies are satisfied
        const depsSatisfied = step.dependencies.every(dep => 
          instance.completedSteps.includes(dep)
        );

        if (!depsSatisfied) {
          const failedDeps = step.dependencies.filter(dep => 
            instance.failedSteps.has(dep)
          );

          if (failedDeps.length > 0) {
            throw new Error(`Dependencies failed: ${failedDeps.join(', ')}`);
          }

          // Skip this step, dependencies not yet ready (shouldn't happen with proper topo sort)
          continue;
        }

        // Update current step
        await this.updateInstance(instance.id, { currentStepId: step.id });

        // Execute step with retry logic
        const stepResult = await this.executeStepWithRetry(
          step,
          instance.input,
          context,
          definition.defaultRetryPolicy ?? this.config.defaultRetryPolicy
        );

        if (!stepResult.success) {
          // Step failed
          const newFailedSteps = new Map(instance.failedSteps);
          newFailedSteps.set(step.id, stepResult.error);

          instance = {
            ...instance,
            failedSteps: newFailedSteps,
            status: WorkflowStatus.FAILED,
            error: stepResult.error,
            completedAt: new Date(),
          };

          await this.persistInstance(instance);
          this.activeWorkflows.delete(instance.id);
          clearTimeout(timeoutId);

          logger.error('Workflow step failed', {
            workflowId: instance.id,
            stepId: step.id,
            error: stepResult.error,
          });

          return;
        }

        // Step succeeded
        const newCompletedSteps = [...instance.completedSteps, step.id];
        const newStepOutputs = new Map(instance.stepOutputs);
        newStepOutputs.set(step.id, stepResult.data);

        instance = {
          ...instance,
          completedSteps: newCompletedSteps,
          stepOutputs: newStepOutputs,
        };

        await this.persistInstance(instance);
      }

      // All steps completed - validate and set output
      const finalOutput = this.constructWorkflowOutput(instance, definition);
      const outputParseResult = definition.outputSchema.safeParse(finalOutput);

      if (!outputParseResult.success) {
        const error: WorkflowError = {
          code: 'INVALID_OUTPUT',
          message: `Output validation failed: ${outputParseResult.error.message}`,
          recoverable: false,
        };

        instance = {
          ...instance,
          status: WorkflowStatus.FAILED,
          error,
          completedAt: new Date(),
        };
      } else {
        instance = {
          ...instance,
          status: WorkflowStatus.COMPLETED,
          output: outputParseResult.data,
          completedAt: new Date(),
        };
      }

      await this.persistInstance(instance);
      clearTimeout(timeoutId);
      this.activeWorkflows.delete(instance.id);

      const duration = Date.now() - startTime;
      logger.info('Workflow completed', {
        workflowId: instance.id,
        status: instance.status,
        durationMs: duration,
        stepsCompleted: instance.completedSteps.length,
      });

    } catch (error) {
      clearTimeout(timeoutId);
      this.activeWorkflows.delete(instance.id);

      const workflowError: WorkflowError = {
        code: error instanceof Error && error.message === 'Workflow cancelled' 
          ? 'CANCELLED' 
          : 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        recoverable: false,
      };

      instance = {
        ...instance,
        status: workflowError.code === 'CANCELLED' ? WorkflowStatus.CANCELLED : WorkflowStatus.FAILED,
        error: workflowError,
        completedAt: new Date(),
      };

      await this.persistInstance(instance);

      logger.error('Workflow execution failed', {
        workflowId: instance.id,
        error: workflowError,
      });
    }
  }

  /**
   * Execute a single step with retry logic
   */
  private async executeStepWithRetry<TInput, TOutput>(
    step: WorkflowStep<TInput, TOutput>,
    input: TInput,
    context: WorkflowContext,
    retryPolicy: RetryPolicy
  ): Promise<Result<TOutput, WorkflowError>> {
    const { maxAttempts, backoffMs, maxBackoffMs, exponential } = retryPolicy;
    
    let lastError: WorkflowError | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Check for cancellation before each attempt
        if (context.signal.aborted) {
          return err({
            code: 'CANCELLED',
            message: 'Step execution cancelled',
            stepId: step.id,
            recoverable: false,
          });
        }

        logger.debug('Executing workflow step', {
          workflowId: context.workflowId,
          stepId: step.id,
          attempt,
        });

        const result = await this.executeStepWithTimeout(step, input, context);

        if (result.success) {
          if (attempt > 1) {
            logger.info('Workflow step succeeded after retry', {
              workflowId: context.workflowId,
              stepId: step.id,
              attempts: attempt,
            });
          }
          return result;
        }

        lastError = result.error;

        // Don't retry if error is not recoverable
        if (!lastError.recoverable) {
          return result;
        }

      } catch (error) {
        lastError = {
          code: 'STEP_EXECUTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
          stepId: step.id,
          recoverable: true,
        };
      }

      // Calculate backoff for next attempt
      if (attempt < maxAttempts) {
        const backoff = exponential
          ? Math.min(backoffMs * Math.pow(2, attempt - 1), maxBackoffMs)
          : backoffMs;

        logger.warn('Workflow step failed, retrying', {
          workflowId: context.workflowId,
          stepId: step.id,
          attempt,
          nextAttemptInMs: backoff,
          error: lastError,
        });

        await this.delay(backoff);
      }
    }

    return err({
      ...lastError!,
      message: `Step failed after ${maxAttempts} attempts: ${lastError!.message}`,
    });
  }

  /**
   * Execute step with timeout support
   */
  private async executeStepWithTimeout<TInput, TOutput>(
    step: WorkflowStep<TInput, TOutput>,
    input: TInput,
    context: WorkflowContext
  ): Promise<Result<TOutput, WorkflowError>> {
    if (!step.timeoutMs) {
      return step.execute(input, context);
    }

    return Promise.race([
      step.execute(input, context),
      new Promise<Result<TOutput, WorkflowError>>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Step timeout after ${step.timeoutMs}ms`));
        }, step.timeoutMs);
      }),
    ]);
  }

  /**
   * Validate that step dependencies form a valid DAG (no cycles)
   */
  private validateDependencyGraph(steps: readonly WorkflowStep[]): Result<void, string> {
    const stepIds = new Set(steps.map(s => s.id));
    const adjacencyList = new Map<string, Set<string>>();

    // Build adjacency list
    for (const step of steps) {
      adjacencyList.set(step.id, new Set(step.dependencies));
      
      // Validate all dependencies exist
      for (const dep of step.dependencies) {
        if (!stepIds.has(dep)) {
          return { success: false, error: `Step ${step.id} depends on unknown step ${dep}` };
        }
      }
    }

    // Detect cycles using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);

      const neighbors = adjacencyList.get(node) ?? new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const stepId of stepIds) {
      if (!visited.has(stepId)) {
        if (hasCycle(stepId)) {
          return { success: false, error: `Cycle detected in dependency graph at step ${stepId}` };
        }
      }
    }

    return { success: true, error: undefined as unknown as string };
  }

  /**
   * Topological sort of steps based on dependencies
   */
  private topologicalSort(steps: readonly WorkflowStep[]): WorkflowStep[] {
    const inDegree = new Map<string, number>();
    const stepMap = new Map(steps.map(s => [s.id, s]));
    const dependents = new Map<string, string[]>();

    // Initialize
    for (const step of steps) {
      inDegree.set(step.id, step.dependencies.length);
      dependents.set(step.id, []);
    }

    // Build reverse adjacency list
    for (const step of steps) {
      for (const dep of step.dependencies) {
        dependents.get(dep)!.push(step.id);
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const result: WorkflowStep[] = [];

    while (queue.length > 0) {
      const id = queue.shift()!;
      const step = stepMap.get(id)!;
      result.push(step);

      for (const dependentId of dependents.get(id)!) {
        const newDegree = inDegree.get(dependentId)! - 1;
        inDegree.set(dependentId, newDegree);
        if (newDegree === 0) {
          queue.push(dependentId);
        }
      }
    }

    if (result.length !== steps.length) {
      throw new Error('Cycle detected in workflow steps');
    }

    return result;
  }

  /**
   * Construct final workflow output from step results
   */
  private constructWorkflowOutput<TInput, TOutput>(
    instance: WorkflowInstance<TInput, TOutput>,
    definition: WorkflowDefinition<TInput, TOutput>
  ): unknown {
    // Default behavior: aggregate all step outputs into an object
    // Workflows can override this by having a final step that produces the output
    const outputs: Record<string, unknown> = {};
    
    for (const [stepId, output] of instance.stepOutputs) {
      outputs[stepId] = output;
    }

    return outputs;
  }

  /**
   * Update workflow instance status
   */
  private async updateInstanceStatus(
    id: WorkflowId,
    status: WorkflowStatus
  ): Promise<void> {
    if (this.repository) {
      await this.repository.updateStatus(id, status);
    }
  }

  /**
   * Update workflow instance fields
   */
  private async updateInstance(
    id: WorkflowId,
    updates: Partial<WorkflowInstance>
  ): Promise<void> {
    if (this.repository) {
      await this.repository.updateStatus(id, updates.status ?? WorkflowStatus.RUNNING, updates);
    }
  }

  /**
   * Persist workflow instance
   */
  private async persistInstance(instance: WorkflowInstance): Promise<void> {
    if (this.repository) {
      await this.repository.save(instance);
    }
  }

  /**
   * Generate unique workflow ID
   */
  private generateWorkflowId(): WorkflowId {
    return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` as WorkflowId;
  }

  /**
   * Generate correlation ID
   */
  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay utility for retry backoff
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// RUNTIME (Layer 5) - Factory and runtime utilities
// ============================================================================

/**
 * Create a configured workflow engine instance
 */
export function createWorkflowEngine(
  config?: Partial<WorkflowModuleConfig>
): WorkflowEngine {
  return new WorkflowEngine(config);
}

/**
 * Global workflow engine instance (singleton pattern)
 */
let globalEngine: WorkflowEngine | null = null;

/**
 * Get or create the global workflow engine
 */
export function getWorkflowEngine(): WorkflowEngine {
  if (!globalEngine) {
    globalEngine = createWorkflowEngine();
  }
  return globalEngine;
}

/**
 * Reset the global workflow engine (useful for testing)
 */
export function resetWorkflowEngine(): void {
  globalEngine = null;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a workflow step with type-safe input/output
 */
export function createStep<TInput, TOutput>(config: {
  id: string;
  name: string;
  description?: string;
  dependencies?: string[];
  retryPolicy?: RetryPolicy;
  timeoutMs?: number;
  execute: (input: TInput, context: WorkflowContext) => Promise<Result<TOutput, WorkflowError>>;
}): WorkflowStep<TInput, TOutput> {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    dependencies: config.dependencies ?? [],
    retryPolicy: config.retryPolicy,
    timeoutMs: config.timeoutMs,
    execute: config.execute,
  };
}

/**
 * Create a workflow definition with type-safe schemas
 */
export function createWorkflowDefinition<TInput, TOutput>(config: {
  id: string;
  version: string;
  name: string;
  description?: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  steps: WorkflowStep[];
  defaultRetryPolicy?: RetryPolicy;
  globalTimeoutMs?: number;
}): WorkflowDefinition<TInput, TOutput> {
  return {
    id: config.id,
    version: config.version,
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    steps: config.steps,
    defaultRetryPolicy: config.defaultRetryPolicy,
    globalTimeoutMs: config.globalTimeoutMs,
  };
}

/**
 * Helper to create a recoverable workflow error
 */
export function recoverableError(
  code: string,
  message: string,
  stepId?: string,
  cause?: unknown
): WorkflowError {
  return { code, message, stepId, cause, recoverable: true };
}

/**
 * Helper to create a non-recoverable workflow error
 */
export function fatalError(
  code: string,
  message: string,
  stepId?: string,
  cause?: unknown
): WorkflowError {
  return { code, message, stepId, cause, recoverable: false };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if a value is a valid workflow status
 */
export function isWorkflowStatus(value: unknown): value is WorkflowStatus {
  return typeof value === 'string' && Object.values(WorkflowStatus).includes(value as WorkflowStatus);
}

/**
 * Check if a workflow is in a terminal state
 */
export function isTerminalStatus(status: WorkflowStatus): boolean {
  return status === WorkflowStatus.COMPLETED ||
         status === WorkflowStatus.FAILED ||
         status === WorkflowStatus.CANCELLED;
}

/**
 * Check if a workflow is active (can be cancelled)
 */
export function isActiveStatus(status: WorkflowStatus): boolean {
  return status === WorkflowStatus.PENDING ||
         status === WorkflowStatus.RUNNING ||
         status === WorkflowStatus.PAUSED;
}