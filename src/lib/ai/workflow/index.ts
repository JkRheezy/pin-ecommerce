/**
 * Workflow Module Index
 * 
 * Re-exports all workflow-related functionality following the six-layer architecture.
 * This module serves as the public API surface for the workflow system.
 * 
 * Layer: Repo (Repository/Module Interface)
 */

// ==========================================
// Types Layer Exports
// ==========================================

export type {
  // Core workflow types
  WorkflowDefinition,
  WorkflowStep,
  WorkflowStepType,
  WorkflowContext,
  WorkflowExecution,
  WorkflowExecutionStatus,
  WorkflowTrigger,
  WorkflowTriggerType,
  
  // Step-specific types
  StepInput,
  StepOutput,
  StepConfig,
  StepValidationResult,
  
  // Execution types
  ExecutionMetadata,
  ExecutionError,
  ExecutionLog,
  
  // Hook types
  WorkflowHooks,
  StepLifecycleHooks,
} from './types';

// ==========================================
// Config Layer Exports
// ==========================================

export {
  // Workflow configuration defaults
  DEFAULT_WORKFLOW_CONFIG,
  WORKFLOW_STEP_TIMEOUT_MS,
  MAX_WORKFLOW_RETRIES,
  
  // Validation schemas
  workflowDefinitionSchema,
  workflowStepSchema,
  validateWorkflowConfig,
} from './config';

export type {
  WorkflowConfig,
  WorkflowEngineConfig,
} from './config';

// ==========================================
// Repo Layer Exports
// ==========================================

export {
  // Workflow repository
  WorkflowRepository,
  createWorkflowRepository,
  
  // Execution repository
  WorkflowExecutionRepository,
  createWorkflowExecutionRepository,
  
  // Storage adapters
  InMemoryWorkflowStorage,
  PersistentWorkflowStorage,
} from './repo';

export type {
  WorkflowStorage,
  WorkflowQueryOptions,
  WorkflowExecutionQueryOptions,
} from './repo';

// ==========================================
// Service Layer Exports
// ==========================================

export {
  // Core workflow engine
  WorkflowEngine,
  createWorkflowEngine,
  
  // Step executors
  BaseStepExecutor,
  createStepExecutor,
  
  // Workflow compiler
  WorkflowCompiler,
  compileWorkflow,
  
  // Workflow validator
  WorkflowValidator,
  validateWorkflow,
} from './service';

export type {
  WorkflowEngineOptions,
  StepExecutorContext,
  CompiledWorkflow,
  ValidationReport,
} from './service';

// ==========================================
// Runtime Layer Exports
// ==========================================

export {
  // Runtime environment
  WorkflowRuntime,
  createWorkflowRuntime,
  
  // Context providers
  WorkflowContextProvider,
  createContextProvider,
  
  // State management
  WorkflowStateManager,
  createStateManager,
  
  // Event handling
  WorkflowEventBus,
  createWorkflowEventBus,
} from './runtime';

export type {
  RuntimeEnvironment,
  RuntimeContext,
  StateSnapshot,
  WorkflowEvent,
  WorkflowEventHandler,
} from './runtime';

// ==========================================
// UI Layer Exports (if applicable)
// ==========================================

export {
  // React hooks (if React is available)
  useWorkflow,
  useWorkflowExecution,
  useWorkflowStep,
  
  // Utilities for UI integration
  formatWorkflowStatus,
  getWorkflowProgress,
} from './ui';

export type {
  UseWorkflowOptions,
  UseWorkflowReturn,
  WorkflowUIState,
} from './ui';

// ==========================================
// Error Handling
// ==========================================

export {
  // Custom error classes
  WorkflowError,
  WorkflowValidationError,
  WorkflowExecutionError,
  WorkflowStepError,
  WorkflowTimeoutError,
  
  // Error codes
  WorkflowErrorCode,
  
  // Error utilities
  isWorkflowError,
  formatWorkflowError,
} from './errors';

// ==========================================
// Utilities
// ==========================================

export {
  // Workflow utilities
  generateWorkflowId,
  generateExecutionId,
  cloneWorkflow,
  mergeWorkflowContext,
  
  // Step utilities
  createStepId,
  parseStepReference,
  resolveStepDependencies,
  
  // Logging utilities
  createWorkflowLogger,
  withWorkflowLogging,
} from './utils';

// ==========================================
// Constants
// ==========================================

export {
  WORKFLOW_VERSION,
  SUPPORTED_STEP_TYPES,
  WORKFLOW_EVENTS,
} from './constants';