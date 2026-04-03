/**
 * AI Orchestrator Module
 * 
 * This module serves as the central coordination layer for AI-driven workflows
 * in the Harness Engineering environment. It manages the execution of AI tasks,
 * handles state transitions, and provides observability into the orchestration process.
 * 
 * Architecture Layer: Service Layer (Layer 4)
 * Responsibilities:
 * - Coordinate between AI providers and business logic
 * - Manage workflow state and execution context
 * - Handle retries, timeouts, and circuit breaking
 * - Provide structured logging and metrics
 */

import { Logger } from '@/lib/logging';
import { Result, ok, err } from '@/lib/types/result';
import { 
  OrchestratorConfig, 
  OrchestratorState, 
  TaskDefinition, 
  TaskResult, 
  WorkflowContext,
  OrchestratorError,
  OrchestratorErrorCode
} from './types';
import { TaskQueue } from './task-queue';
import { StateManager } from './state-manager';
import { ProviderRegistry } from './provider-registry';

// Config layer imports
import { getOrchestratorConfig } from '@/config/orchestrator';

// Repo layer imports
import { WorkflowRepository } from '@/repo/workflow';

const logger = new Logger('AI.Orchestrator');

/**
 * Core orchestrator class responsible for managing AI workflow execution.
 * 
 * This class follows the singleton pattern to ensure consistent state management
 * across the application lifecycle. It provides thread-safe operations for
 * concurrent workflow execution.
 */
export class AIOrchestrator {
  private static instance: AIOrchestrator | null = null;
  private readonly config: OrchestratorConfig;
  private readonly state: StateManager;
  private readonly queue: TaskQueue;
  private readonly providers: ProviderRegistry;
  private readonly repository: WorkflowRepository;
  private isInitialized: boolean = false;
  private isShuttingDown: boolean = false;

  /**
   * Private constructor to enforce singleton pattern.
   * Use AIOrchestrator.getInstance() to obtain the orchestrator instance.
   */
  private constructor(config: OrchestratorConfig) {
    this.config = config;
    this.state = new StateManager(config.state);
    this.queue = new TaskQueue(config.queue);
    this.providers = new ProviderRegistry(config.providers);
    this.repository = new WorkflowRepository(config.repository);
  }

  /**
   * Returns the singleton instance of the orchestrator.
   * Initializes the instance on first call with configuration from the config layer.
   */
  public static getInstance(): AIOrchestrator {
    if (!AIOrchestrator.instance) {
      const config = getOrchestratorConfig();
      AIOrchestrator.instance = new AIOrchestrator(config);
      logger.info('AIOrchestrator instance created');
    }
    return AIOrchestrator.instance;
  }

  /**
   * Resets the singleton instance. Primarily used for testing.
   * WARNING: This will terminate any running workflows.
   */
  public static resetInstance(): void {
    if (AIOrchestrator.instance) {
      AIOrchestrator.instance.shutdown().catch((error) => {
        logger.error('Error during orchestrator reset', { error });
      });
    }
    AIOrchestrator.instance = null;
    logger.info('AIOrchestrator instance reset');
  }

  /**
   * Initializes the orchestrator and its dependencies.
   * Must be called before executing any workflows.
   */
  public async initialize(): Promise<Result<void, OrchestratorError>> {
    if (this.isInitialized) {
      logger.warn('Orchestrator already initialized');
      return ok(undefined);
    }

    if (this.isShuttingDown) {
      return err({
        code: OrchestratorErrorCode.INVALID_STATE,
        message: 'Cannot initialize orchestrator while shutting down',
        recoverable: false
      });
    }

    try {
      // Initialize dependencies in order of dependency chain
      const initResults = await Promise.all([
        this.state.initialize(),
        this.queue.initialize(),
        this.providers.initialize(),
        this.repository.connect()
      ]);

      // Check for any initialization failures
      const failures = initResults.filter((r): r is Result<never, OrchestratorError> => !r.success);
      if (failures.length > 0) {
        const firstError = (failures[0] as Result<never, OrchestratorError>).error;
        throw new Error(`Dependency initialization failed: ${firstError.message}`);
      }

      this.isInitialized = true;
      logger.info('AIOrchestrator initialized successfully', {
        maxConcurrentTasks: this.config.maxConcurrentTasks,
        defaultTimeoutMs: this.config.defaultTimeoutMs
      });

      return ok(undefined);
    } catch (error) {
      const orchestratorError: OrchestratorError = {
        code: OrchestratorErrorCode.INITIALIZATION_FAILED,
        message: error instanceof Error ? error.message : 'Unknown initialization error',
        cause: error,
        recoverable: false
      };

      logger.error('Failed to initialize orchestrator', { error: orchestratorError });
      return err(orchestratorError);
    }
  }

  /**
   * Executes a single AI task within a workflow context.
   * 
   * @param task - The task definition to execute
   * @param context - The workflow execution context
   * @returns The task result or an error
   */
  public async executeTask(
    task: TaskDefinition,
    context: WorkflowContext
  ): Promise<Result<TaskResult, OrchestratorError>> {
    this.validateReady();

    // Validate inputs
    const validationResult = this.validateTask(task);
    if (!validationResult.success) {
      return err(validationResult.error);
    }

    const taskId = this.generateTaskId();
    const startTime = Date.now();

    logger.info('Starting task execution', {
      taskId,
      taskType: task.type,
      workflowId: context.workflowId
    });

    try {
      // Update state to RUNNING
      await this.state.transition(taskId, OrchestratorState.RUNNING, {
        task,
        context,
        startedAt: new Date(startTime)
      });

      // Enqueue task with timeout handling
      const timeoutMs = task.timeoutMs ?? this.config.defaultTimeoutMs;
      const queueResult = await this.queue.enqueue(taskId, task, timeoutMs);

      if (!queueResult.success) {
        await this.state.transition(taskId, OrchestratorState.FAILED, {
          error: queueResult.error
        });
        return err(queueResult.error);
      }

      // Execute through appropriate provider
      const providerResult = await this.providers.execute(task, context);

      if (!providerResult.success) {
        await this.handleTaskFailure(taskId, providerResult.error, task, context);
        return err(providerResult.error);
      }

      // Update state to COMPLETED
      const durationMs = Date.now() - startTime;
      const result: TaskResult = {
        taskId,
        output: providerResult.value,
        metadata: {
          durationMs,
          tokensUsed: providerResult.value.tokensUsed,
          model: providerResult.value.model
        }
      };

      await this.state.transition(taskId, OrchestratorState.COMPLETED, { result });

      logger.info('Task completed successfully', {
        taskId,
        durationMs,
        workflowId: context.workflowId
      });

      return ok(result);

    } catch (error) {
      const orchestratorError = this.wrapError(error, OrchestratorErrorCode.EXECUTION_FAILED);
      await this.handleTaskFailure(taskId, orchestratorError, task, context);
      return err(orchestratorError);
    }
  }

  /**
   * Executes a workflow consisting of multiple dependent tasks.
   * Handles task dependency resolution and parallel execution where possible.
   * 
   * @param tasks - Array of task definitions with dependencies
   * @param context - The workflow execution context
   * @returns Array of task results in execution order
   */
  public async executeWorkflow(
    tasks: TaskDefinition[],
    context: WorkflowContext
  ): Promise<Result<TaskResult[], OrchestratorError>> {
    this.validateReady();

    if (!tasks.length) {
      return err({
        code: OrchestratorErrorCode.INVALID_INPUT,
        message: 'Workflow must contain at least one task',
        recoverable: true
      });
    }

    const workflowId = context.workflowId;
    const results: TaskResult[] = [];
    const completedTasks = new Set<string>();
    const pendingTasks = new Map<string, TaskDefinition>();

    logger.info('Starting workflow execution', {
      workflowId,
      taskCount: tasks.length
    });

    // Build dependency graph
    for (const task of tasks) {
      pendingTasks.set(task.id, task);
    }

    // Validate no circular dependencies exist
    const cycleCheck = this.detectCircularDependencies(tasks);
    if (!cycleCheck.success) {
      return err(cycleCheck.error);
    }

    try {
      while (pendingTasks.size > 0) {
        // Find tasks with satisfied dependencies
        const readyTasks = this.getReadyTasks(pendingTasks, completedTasks);

        if (readyTasks.length === 0 && pendingTasks.size > 0) {
          // This should not happen if cycle detection passed
          return err({
            code: OrchestratorErrorCode.DEPENDENCY_ERROR,
            message: 'Deadlock detected in workflow dependencies',
            recoverable: false
          });
        }

        // Execute ready tasks in parallel with concurrency limit
        const executionBatch = readyTasks.slice(0, this.config.maxConcurrentTasks);
        const batchResults = await Promise.all(
          executionBatch.map(task => 
            this.executeTaskWithContext(task, context, completedTasks, results)
          )
        );

        // Process results and update state
        for (const result of batchResults) {
          if (!result.success) {
            // Check if we should continue on failure based on task configuration
            const failedTask = executionBatch.find(t => 
              result.error?.message?.includes(t.id)
            );
            
            if (!failedTask?.continueOnFailure) {
              await this.repository.saveWorkflowState(workflowId, {
                results,
                failedAt: new Date(),
                error: result.error
              });
              return err(result.error);
            }

            logger.warn('Task failed but continuing workflow', {
              taskId: failedTask.id,
              workflowId
            });
          }
        }

        // Remove completed tasks from pending
        for (const task of executionBatch) {
          pendingTasks.delete(task.id);
        }
      }

      // Persist final workflow state
      await this.repository.saveWorkflowState(workflowId, {
        results,
        completedAt: new Date()
      });

      logger.info('Workflow completed successfully', {
        workflowId,
        taskCount: results.length
      });

      return ok(results);

    } catch (error) {
      const orchestratorError = this.wrapError(error, OrchestratorErrorCode.WORKFLOW_FAILED);
      
      await this.repository.saveWorkflowState(workflowId, {
        results,
        failedAt: new Date(),
        error: orchestratorError
      });

      logger.error('Workflow execution failed', {
        workflowId,
        error: orchestratorError
      });

      return err(orchestratorError);
    }
  }

  /**
   * Gracefully shuts down the orchestrator, completing or canceling pending tasks.
   */
  public async shutdown(): Promise<Result<void, OrchestratorError>> {
    if (!this.isInitialized || this.isShuttingDown) {
      return ok(undefined);
    }

    this.isShuttingDown = true;
    logger.info('Initiating orchestrator shutdown');

    try {
      // Signal queue to stop accepting new tasks
      await this.queue.drain();

      // Wait for running tasks to complete or timeout
      const gracefulTimeout = this.config.shutdownTimeoutMs ?? 30000;
      await Promise.race([
        this.state.waitForIdle(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Shutdown timeout')), gracefulTimeout)
        )
      ]);

      // Cleanup resources in reverse initialization order
      await Promise.all([
        this.repository.disconnect(),
        this.providers.shutdown(),
        this.queue.shutdown(),
        this.state.shutdown()
      ]);

      this.isInitialized = false;
      this.isShuttingDown = false;

      logger.info('Orchestrator shutdown complete');
      return ok(undefined);

    } catch (error) {
      const orchestratorError = this.wrapError(error, OrchestratorErrorCode.SHUTDOWN_FAILED);
      logger.error('Error during orchestrator shutdown', { error: orchestratorError });
      return err(orchestratorError);
    }
  }

  /**
   * Returns current orchestrator health status.
   */
  public async healthCheck(): Promise<Result<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, unknown>;
  }, OrchestratorError>> {
    if (!this.isInitialized) {
      return ok({
        status: 'unhealthy',
        details: { reason: 'Not initialized' }
      });
    }

    const [queueHealth, stateHealth, providerHealth] = await Promise.all([
      this.queue.healthCheck(),
      this.state.healthCheck(),
      this.providers.healthCheck()
    ]);

    const unhealthy = [queueHealth, stateHealth, providerHealth].filter(h => !h.healthy);

    if (unhealthy.length === 0) {
      return ok({
        status: 'healthy',
        details: {
          queue: queueHealth.metrics,
          state: stateHealth.metrics,
          providers: providerHealth.metrics
        }
      });
    }

    if (unhealthy.length < 3) {
      return ok({
        status: 'degraded',
        details: {
          failedComponents: unhealthy.map(h => h.component),
          queue: queueHealth.metrics,
          state: stateHealth.metrics,
          providers: providerHealth.metrics
        }
      });
    }

    return ok({
      status: 'unhealthy',
      details: {
        reason: 'All subsystems reporting unhealthy',
        queue: queueHealth.metrics,
        state: stateHealth.metrics,
        providers: providerHealth.metrics
      }
    });
  }

  // Private helper methods

  private validateReady(): void {
    if (!this.isInitialized) {
      throw new Error('Orchestrator not initialized. Call initialize() first.');
    }
    if (this.isShuttingDown) {
      throw new Error('Orchestrator is shutting down.');
    }
  }

  private validateTask(task: TaskDefinition): Result<void, OrchestratorError> {
    if (!task.id || typeof task.id !== 'string') {
      return err({
        code: OrchestratorErrorCode.INVALID_INPUT,
        message: 'Task must have a valid string id',
        recoverable: true
      });
    }

    if (!task.type || typeof task.type !== 'string') {
      return err({
        code: OrchestratorErrorCode.INVALID_INPUT,
        message: 'Task must have a valid type',
        recoverable: true
      });
    }

    if (!task.prompt && !task.template) {
      return err({
        code: OrchestratorErrorCode.INVALID_INPUT,
        message: 'Task must have either a prompt or template',
        recoverable: true
      });
    }

    return ok(undefined);
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async handleTaskFailure(
    taskId: string,
    error: OrchestratorError,
    task: TaskDefinition,
    context: WorkflowContext
  ): Promise<void> {
    await this.state.transition(taskId, OrchestratorState.FAILED, { error });

    // Check retry policy
    const retryCount = await this.state.getRetryCount(taskId);
    const maxRetries = task.maxRetries ?? this.config.defaultMaxRetries;

    if (retryCount < maxRetries && error.recoverable) {
      logger.info('Scheduling task retry', {
        taskId,
        attempt: retryCount + 1,
        maxRetries
      });

      await this.state.incrementRetryCount(taskId);
      // Retry will be handled by queue's retry mechanism
    } else {
      logger.error('Task failed permanently', {
        taskId,
        error: error.message,
        workflowId: context.workflowId
      });
    }
  }

  private detectCircularDependencies(
    tasks: TaskDefinition[]
  ): Result<void, OrchestratorError> {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    const hasCycle = (taskId: string): boolean => {
      visited.add(taskId);
      recursionStack.add(taskId);

      const task = taskMap.get(taskId);
      if (task?.dependencies) {
        for (const depId of task.dependencies) {
          if (!visited.has(depId)) {
            if (hasCycle(depId)) return true;
          } else if (recursionStack.has(depId)) {
            return true;
          }
        }
      }

      recursionStack.delete(taskId);
      return false;
    };

    for (const task of tasks) {
      if (!visited.has(task.id)) {
        if (hasCycle(task.id)) {
          return err({
            code: OrchestratorErrorCode.INVALID_INPUT,
            message: `Circular dependency detected involving task: ${task.id}`,
            recoverable: true
          });
        }
      }
    }

    return ok(undefined);
  }

  private getReadyTasks(
    pending: Map<string, TaskDefinition>,
    completed: Set<string>
  ): TaskDefinition[] {
    const ready: TaskDefinition[] = [];

    for (const task of pending.values()) {
      const deps = task.dependencies ?? [];
      const depsSatisfied = deps.every(depId => completed.has(depId));

      if (depsSatisfied) {
        ready.push(task);
      }
    }

    // Sort by priority if specified
    return ready.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  private async executeTaskWithContext(
    task: TaskDefinition,
    context: WorkflowContext,
    completedTasks: Set<string>,
    results: TaskResult[]
  ): Promise<Result<void, OrchestratorError>> {
    // Inject results from dependencies into context
    const dependencyResults: Record<string, unknown> = {};
    if (task.dependencies) {
      for (const depId of task.dependencies) {
        const depResult = results.find(r => r.taskId.includes(depId));
        if (depResult) {
          dependencyResults[depId] = depResult.output;
        }
      }
    }

    const enrichedContext: WorkflowContext = {
      ...context,
      dependencyResults,
      previousResults: results
    };

    const result = await this.executeTask(task, enrichedContext);

    if (result.success) {
      completedTasks.add(task.id);
      results.push(result.value);
      return ok(undefined);
    }

    return err(result.error);
  }

  private wrapError(
    error: unknown,
    code: OrchestratorErrorCode
  ): OrchestratorError {
    return {
      code,
      message: error instanceof Error ? error.message : 'Unknown error',
      cause: error,
      recoverable: code !== OrchestratorErrorCode.INITIALIZATION_FAILED &&
                  code !== OrchestratorErrorCode.SHUTDOWN_FAILED
    };
  }
}

// Export factory function for dependency injection scenarios
export function createOrchestrator(config?: Partial<OrchestratorConfig>): AIOrchestrator {
  if (config) {
    // Create new instance with custom config (for testing)
    const baseConfig = getOrchestratorConfig();
    return new AIOrchestrator({ ...baseConfig, ...config });
  }
  return AIOrchestrator.getInstance();
}