/**
 * Orchestrator Index Module
 * 
 * Central re-export point for all orchestrator-related modules.
 * Follows the six-layer architecture pattern for clean dependency management.
 * 
 * @module ai/orchestrator
 */

// ==========================================
// Types Layer (Layer 1)
// ==========================================

export type {
  OrchestratorConfig,
  OrchestratorState,
  OrchestratorEvent,
  OrchestratorResult,
  TaskPriority,
  ExecutionStrategy,
} from './types';

// ==========================================
// Config Layer (Layer 2)
// ==========================================

export {
  DEFAULT_ORCHESTRATOR_CONFIG,
  ORCHESTRATOR_VALIDATION_SCHEMA,
  loadOrchestratorConfig,
  validateOrchestratorConfig,
} from './config';

// ==========================================
// Repo Layer (Layer 3)
// ==========================================

export {
  OrchestratorRepository,
  type OrchestratorRepositoryOptions,
  type PersistedState,
} from './repo';

// ==========================================
// Service Layer (Layer 4)
// ==========================================

export {
  OrchestratorService,
  type ServiceDependencies,
  type ServiceOptions,
} from './service';

// ==========================================
// Runtime Layer (Layer 5)
// ==========================================

export {
  OrchestratorRuntime,
  type RuntimeContext,
  type RuntimeHooks,
} from './runtime';

// ==========================================
// UI Layer (Layer 6) - Optional exports for UI integration
// ==========================================

export {
  useOrchestrator,
  type OrchestratorHookOptions,
  type OrchestratorUIState,
} from './ui';

// ==========================================
// Factory & Convenience Exports
// ==========================================

import { OrchestratorService } from './service';
import { OrchestratorRuntime } from './runtime';
import { loadOrchestratorConfig } from './config';
import type { OrchestratorConfig } from './types';
import { logger } from '@/lib/logger';

/**
 * Factory function to create a fully configured orchestrator runtime.
 * This is the recommended entry point for most use cases.
 * 
 * @param config - Optional partial configuration, will be merged with defaults
 * @returns Configured OrchestratorRuntime instance ready for execution
 * @throws {ConfigValidationError} If configuration is invalid
 * @throws {ServiceInitializationError} If service layer fails to initialize
 * 
 * @example
 *