/**
 * AI Orchestrator - Main entry point
 * 
 * This module serves as the primary interface for the AI orchestration system,
 * re-exporting functionality from the six-layer architecture.
 * 
 * Six-Layer Architecture:
 * - Types: Core type definitions and interfaces
 * - Config: Configuration and environment settings
 * - Repo: Data access and persistence layer
 * - Service: Business logic and domain operations
 * - Runtime: Execution environment and task management
 * - UI: User interface components and adapters
 */

// ==========================================
// Layer 1: Types - Core type definitions
// ==========================================
export type {
  // Orchestrator types
  OrchestratorConfig,
  OrchestratorState,
  OrchestratorEvent,
  OrchestratorEventType,
  
  // Task types
  Task,
  TaskStatus,
  TaskPriority,
  TaskDefinition,
  TaskResult,
  
  // Agent types
  Agent,
  AgentCapability,
  AgentMessage,
  AgentRole,
  
  // Pipeline types
  Pipeline,
  PipelineStage,
  PipelineConfig,
  
  // Execution types
  ExecutionContext,
  ExecutionResult,
  ExecutionError,
  ExecutionMetrics,
  
  // Event types
  EventHandler,
  EventSubscription,
  EventEmitter,
} from './types';

// ==========================================
// Layer 2: Config - Configuration management
// ==========================================
export {
  // Configuration objects
  defaultConfig,
  loadConfig,
  mergeConfig,
  
  // Environment helpers
  getEnvironment,
  isDevelopment,
  isProduction,
  
  // Validation
  validateConfig,
  ConfigValidationError,
} from './config';

export type {
  EnvironmentConfig,
  RuntimeConfig,
  AgentConfig,
  LoggingConfig,
} from './config';

// ==========================================
// Layer 3: Repo - Data access layer
// ==========================================
export {
  // Task repository
  TaskRepository,
  InMemoryTaskRepository,
  PersistentTaskRepository,
  
  // State repository
  StateRepository,
  InMemoryStateRepository,
  
  // Event store
  EventStore,
  InMemoryEventStore,
  
  // Repository factory
  createRepository,
} from './repo';

// ==========================================
// Layer 4: Service - Business logic layer
// ==========================================
export {
  // Task service
  TaskService,
  createTaskService,
  
  // Agent service
  AgentService,
  createAgentService,
  
  // Pipeline service
  PipelineService,
  createPipelineService,
  
  // Execution service
  ExecutionService,
  createExecutionService,
  
  // Orchestrator service (main)
  OrchestratorService,
  createOrchestratorService,
} from './service';

// ==========================================
// Layer 5: Runtime - Execution environment
// ==========================================
export {
  // Runtime manager
  RuntimeManager,
  createRuntimeManager,
  
  // Worker pool
  WorkerPool,
  createWorkerPool,
  
  // Scheduler
  TaskScheduler,
  createTaskScheduler,
  
  // Resource manager
  ResourceManager,
  createResourceManager,
  
  // Health monitor
  HealthMonitor,
  createHealthMonitor,
} from './runtime';

// ==========================================
// Layer 6: UI - User interface layer
// ==========================================
export {
  // API adapters
  createApiAdapter,
  createGraphQLAdapter,
  createRESTAdapter,
  
  // WebSocket handlers
  createWebSocketHandler,
  
  // CLI interface
  createCLIInterface,
  
  // React hooks (if applicable)
  useOrchestrator,
  useTask,
  useAgent,
} from './ui';

// ==========================================
// Main Orchestrator Class
// ==========================================

import { Logger } from '@harness/logging';
import { 
  OrchestratorConfig, 
  OrchestratorState,
  ExecutionContext,
  ExecutionResult,
} from './types';
import { loadConfig, validateConfig, ConfigValidationError } from './config';
import { createRepository, TaskRepository, StateRepository } from './repo';
import { createOrchestratorService, OrchestratorService } from './service';
import { createRuntimeManager, RuntimeManager } from './runtime';

/**
 * Main Orchestrator class that coordinates all layers
 * 
 * This is the primary interface for consumers of the orchestration system.
 * It handles initialization, configuration, and provides high-level methods
 * for task execution and management.
 */
export class Orchestrator {
  private readonly logger: Logger;
  private readonly config: OrchestratorConfig;
  private readonly service: OrchestratorService;
  private readonly runtime: RuntimeManager;
  private readonly taskRepo: TaskRepository;
  private readonly stateRepo: StateRepository;
  private initialized: boolean = false;

  constructor(config?: Partial<OrchestratorConfig>) {
    this.logger = new Logger('Orchestrator');
    
    try {
      // Load and validate configuration
      const baseConfig = loadConfig();
      this.config = mergeConfig(baseConfig, config || {});
      validateConfig(this.config);
      
      this.logger.info('Initializing orchestrator', { 
        environment: this.config.environment,
        version: this.config.version,
      });
      
      // Initialize repositories (Layer 3)
      const repositories = createRepository(this.config.persistence);
      this.taskRepo = repositories.task;
      this.stateRepo = repositories.state;
      
      // Initialize runtime (Layer 5)
      this.runtime = createRuntimeManager(this.config.runtime);
      
      // Initialize service layer (Layer 4)
      this.service = createOrchestratorService({
        config: this.config,
        taskRepo: this.taskRepo,
        stateRepo: this.stateRepo,
        runtime: this.runtime,
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize orchestrator', { error });
      throw new OrchestratorInitializationError(
        'Failed to initialize orchestrator',
        { cause: error }
      );
    }
  }

  /**
   * Initialize the orchestrator and all its dependencies
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Orchestrator already initialized');
      return;
    }

    try {
      this.logger.info('Starting orchestrator initialization');
      
      // Initialize runtime environment
      await this.runtime.initialize();
      
      // Initialize service layer
      await this.service.initialize();
      
      // Restore state if persistence is enabled
      if (this.config.persistence.enabled) {
        await this.restoreState();
      }
      
      this.initialized = true;
      this.logger.info('Orchestrator initialized successfully');
      
    } catch (error) {
      this.logger.error('Orchestrator initialization failed', { error });
      throw new OrchestratorInitializationError(
        'Initialization failed',
        { cause: error }
      );
    }
  }

  /**
   * Execute a task with the given context
   */
  async execute<T = unknown>(
    taskId: string,
    context: ExecutionContext
  ): Promise<ExecutionResult<T>> {
    this.ensureInitialized();
    
    try {
      this.logger.info('Executing task', { taskId, context });
      return await this.service.execute<T>(taskId, context);
    } catch (error) {
      this.logger.error('Task execution failed', { taskId, error });
      throw new TaskExecutionError(`Task ${taskId} execution failed`, {
        taskId,
        cause: error,
      });
    }
  }

  /**
   * Submit a task for asynchronous execution
   */
  async submit(taskDefinition: TaskDefinition): Promise<string> {
    this.ensureInitialized();
    
    try {
      const taskId = await this.service.submit(taskDefinition);
      this.logger.info('Task submitted', { taskId, type: taskDefinition.type });
      return taskId;
    } catch (error) {
      this.logger.error('Task submission failed', { error });
      throw new TaskSubmissionError('Failed to submit task', { cause: error });
    }
  }

  /**
   * Get the current state of the orchestrator
   */
  getState(): OrchestratorState {
    this.ensureInitialized();
    return this.service.getState();
  }

  /**
   * Gracefully shutdown the orchestrator
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      this.logger.info('Starting orchestrator shutdown');
      
      // Persist state if needed
      if (this.config.persistence.enabled) {
        await this.persistState();
      }
      
      // Shutdown services in reverse order
      await this.service.shutdown();
      await this.runtime.shutdown();
      
      this.initialized = false;
      this.logger.info('Orchestrator shutdown complete');
      
    } catch (error) {
      this.logger.error('Error during shutdown', { error });
      // Don't throw on shutdown errors, just log them
    }
  }

  /**
   * Check if the orchestrator is healthy
   */
  async healthCheck(): Promise<HealthStatus> {
    const runtimeHealth = await this.runtime.healthCheck();
    const serviceHealth = await this.service.healthCheck();
    
    return {
      status: runtimeHealth.healthy && serviceHealth.healthy ? 'healthy' : 'unhealthy',
      runtime: runtimeHealth,
      service: serviceHealth,
      timestamp: new Date().toISOString(),
    };
  }

  // ==========================================
  // Private helper methods
  // ==========================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new OrchestratorNotInitializedError(
        'Orchestrator must be initialized before use. Call initialize() first.'
      );
    }
  }

  private async restoreState(): Promise<void> {
    try {
      const state = await this.stateRepo.load();
      if (state) {
        await this.service.restoreState(state);
        this.logger.info('State restored successfully');
      }
    } catch (error) {
      this.logger.error('Failed to restore state', { error });
      // Continue without restored state
    }
  }

  private async persistState(): Promise<void> {
    try {
      const state = this.service.getState();
      await this.stateRepo.save(state);
      this.logger.info('State persisted successfully');
    } catch (error) {
      this.logger.error('Failed to persist state', { error });
    }
  }
}

// ==========================================
// Error Classes
// ==========================================

export class OrchestratorError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'OrchestratorError';
  }
}

export class OrchestratorInitializationError extends OrchestratorError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'OrchestratorInitializationError';
  }
}

export class OrchestratorNotInitializedError extends OrchestratorError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'OrchestratorNotInitializedError';
  }
}

export class TaskExecutionError extends OrchestratorError {
  constructor(
    message: string,
    public readonly context: { taskId?: string; cause?: unknown }
  ) {
    super(message, { cause: context.cause });
    this.name = 'TaskExecutionError';
  }
}

export class TaskSubmissionError extends OrchestratorError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TaskSubmissionError';
  }
}

// ==========================================
// Types (local to this module)
// ==========================================

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  runtime: { healthy: boolean; details?: Record<string, unknown> };
  service: { healthy: boolean; details?: Record<string, unknown> };
  timestamp: string;
}

// ==========================================
// Factory function
// ==========================================

/**
 * Create and initialize a new Orchestrator instance
 */
export async function createOrchestrator(
  config?: Partial<OrchestratorConfig>
): Promise<Orchestrator> {
  const orchestrator = new Orchestrator(config);
  await orchestrator.initialize();
  return orchestrator;
}

// Default export
export default Orchestrator;