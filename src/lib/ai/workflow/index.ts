/**
 * Workflow Module Index Barrel
 *
 * Re-exports all workflow-related modules following the six-layer architecture.
 * This provides a clean public API for consuming workflow functionality.
 *
 * @module ai/workflow
 */

// ==================== Types Layer ====================
// Core type definitions for workflows
export type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowContext,
  WorkflowExecutionState,
  WorkflowStepResult,
  WorkflowValidationError,
  WorkflowExecutionOptions,
  WorkflowStepType,
  WorkflowStatus,
} from './types';

// ==================== Config Layer ====================
// Configuration schemas and defaults
export {
  WORKFLOW_DEFAULTS,
  WORKFLOW_VALIDATION_RULES,
  WORKFLOW_EXECUTION_LIMITS,
} from './config';

export type {
  WorkflowConfig,
  WorkflowExecutionConfig,
} from './config';

// ==================== Repo Layer ====================
// Data access and persistence
export {
  WorkflowRepository,
  WorkflowExecutionRepository,
} from './repo';

export type {
  WorkflowRepositoryOptions,
  WorkflowExecutionRepositoryOptions,
} from './repo';

// ==================== Service Layer ====================
// Business logic and orchestration
export {
  WorkflowService,
  WorkflowOrchestrator,
  WorkflowValidator,
} from './service';

export type {
  WorkflowServiceOptions,
  WorkflowOrchestratorOptions,
  WorkflowValidatorOptions,
} from './service';

// ==================== Runtime Layer ====================
// Execution engine and step handlers
export {
  WorkflowRuntime,
  WorkflowStepExecutor,
  WorkflowContextManager,
} from './runtime';

export type {
  WorkflowRuntimeOptions,
  WorkflowStepExecutorOptions,
  WorkflowContextManagerOptions,
} from './runtime';

// ==================== UI Layer ====================
// Presentation and interaction components (if applicable)
export {
  WorkflowRenderer,
  WorkflowStatusIndicator,
} from './ui';

export type {
  WorkflowRendererOptions,
  WorkflowStatusIndicatorProps,
} from './ui';

// ==================== Error Handling ====================
// Centralized error types for workflow operations
export {
  WorkflowError,
  WorkflowValidationError as WorkflowValidationErrorClass,
  WorkflowExecutionError,
  WorkflowNotFoundError,
  WorkflowStepError,
} from './errors';

// ==================== Utilities ====================
// Shared helper functions
export {
  generateWorkflowId,
  sanitizeWorkflowInput,
  validateWorkflowStep,
  serializeWorkflowState,
  deserializeWorkflowState,
} from './utils';

/**
 * Initialize the workflow module with optional configuration overrides.
 * This should be called once during application startup.
 *
 * @param config - Optional configuration overrides
 * @returns Initialized workflow service instance
 * @throws {WorkflowError} If initialization fails
 */
export { initializeWorkflowModule } from './init';

/**
 * Default export for convenience when importing the entire module
 */
export { WorkflowModule as default } from './module';