/**
 * Workflow Configuration Module
 * 
 * Layer: Config (Layer 2)
 * 
 * This module defines workflow-related configuration, constants, and default values
 * for the AI workflow engine. All configuration values are validated at runtime
 * and include sensible defaults.
 */

import { z } from 'zod';
import { getLogger } from '@harness/logging';

const logger = getLogger('WorkflowConfig');

// =============================================================================
// Types (Layer 1 - referenced, defined in types.ts)
// =============================================================================

/**
 * Workflow execution timeout configuration
 */
export interface TimeoutConfig {
  /** Default timeout for workflow execution in milliseconds */
  defaultTimeoutMs: number;
  /** Maximum allowed timeout in milliseconds */
  maxTimeoutMs: number;
  /** Minimum allowed timeout in milliseconds */
  minTimeoutMs: number;
  /** Timeout for individual step execution */
  stepTimeoutMs: number;
}

/**
 * Retry configuration for workflow steps
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay between retries in milliseconds */
  baseDelayMs: number;
  /** Maximum delay between retries in milliseconds */
  maxDelayMs: number;
  /** Exponential backoff multiplier */
  backoffMultiplier: number;
}

/**
 * Workflow engine configuration
 */
export interface WorkflowEngineConfig {
  /** Timeout configuration */
  timeouts: TimeoutConfig;
  /** Retry configuration */
  retries: RetryConfig;
  /** Maximum number of concurrent workflows */
  maxConcurrentWorkflows: number;
  /** Whether to enable workflow persistence */
  enablePersistence: boolean;
  /** Default workflow version */
  defaultVersion: string;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const timeoutConfigSchema = z.object({
  defaultTimeoutMs: z.number().int().positive().default(300000), // 5 minutes
  maxTimeoutMs: z.number().int().positive().default(3600000),    // 1 hour
  minTimeoutMs: z.number().int().positive().default(1000),       // 1 second
  stepTimeoutMs: z.number().int().positive().default(60000),     // 1 minute
}).refine(
  (data) => data.minTimeoutMs <= data.defaultTimeoutMs && data.defaultTimeoutMs <= data.maxTimeoutMs,
  { message: 'Timeouts must satisfy: min <= default <= max' }
);

const retryConfigSchema = z.object({
  maxRetries: z.number().int().min(0).max(10).default(3),
  baseDelayMs: z.number().int().positive().default(1000),
  maxDelayMs: z.number().int().positive().default(60000),
  backoffMultiplier: z.number().positive().default(2),
}).refine(
  (data) => data.baseDelayMs <= data.maxDelayMs,
  { message: 'baseDelayMs must be <= maxDelayMs' }
);

const workflowEngineConfigSchema = z.object({
  timeouts: timeoutConfigSchema.default({}),
  retries: retryConfigSchema.default({}),
  maxConcurrentWorkflows: z.number().int().positive().default(100),
  enablePersistence: z.boolean().default(true),
  defaultVersion: z.string().min(1).default('1.0.0'),
});

// =============================================================================
// Constants
// =============================================================================

/**
 * Workflow status constants
 */
export const WORKFLOW_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout',
} as const;

export type WorkflowStatus = typeof WORKFLOW_STATUS[keyof typeof WORKFLOW_STATUS];

/**
 * Step status constants
 */
export const STEP_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  RETRYING: 'retrying',
} as const;

export type StepStatus = typeof STEP_STATUS[keyof typeof STEP_STATUS];

/**
 * Event types for workflow engine
 */
export const WORKFLOW_EVENTS = {
  WORKFLOW_STARTED: 'workflow:started',
  WORKFLOW_COMPLETED: 'workflow:completed',
  WORKFLOW_FAILED: 'workflow:failed',
  WORKFLOW_CANCELLED: 'workflow:cancelled',
  STEP_STARTED: 'step:started',
  STEP_COMPLETED: 'step:completed',
  STEP_FAILED: 'step:failed',
  STEP_RETRYING: 'step:retrying',
} as const;

export type WorkflowEvent = typeof WORKFLOW_EVENTS[keyof typeof WORKFLOW_EVENTS];

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Readonly<WorkflowEngineConfig> = {
  timeouts: {
    defaultTimeoutMs: 300000,  // 5 minutes
    maxTimeoutMs: 3600000,     // 1 hour
    minTimeoutMs: 1000,        // 1 second
    stepTimeoutMs: 60000,      // 1 minute
  },
  retries: {
    maxRetries: 3,
    baseDelayMs: 1000,         // 1 second
    maxDelayMs: 60000,         // 1 minute
    backoffMultiplier: 2,
  },
  maxConcurrentWorkflows: 100,
  enablePersistence: true,
  defaultVersion: '1.0.0',
} as const;

// =============================================================================
// Configuration Factory
// =============================================================================

/**
 * Validates and creates a workflow engine configuration
 * 
 * @param partialConfig - Partial configuration to merge with defaults
 * @returns Validated workflow engine configuration
 * @throws Error if configuration is invalid
 */
export function createWorkflowConfig(
  partialConfig: Partial<WorkflowEngineConfig> = {}
): WorkflowEngineConfig {
  try {
    const mergedConfig = {
      ...DEFAULT_CONFIG,
      ...partialConfig,
      timeouts: {
        ...DEFAULT_CONFIG.timeouts,
        ...partialConfig.timeouts,
      },
      retries: {
        ...DEFAULT_CONFIG.retries,
        ...partialConfig.retries,
      },
    };

    const validated = workflowEngineConfigSchema.parse(mergedConfig);
    
    logger.debug('Workflow configuration created successfully', {
      maxConcurrentWorkflows: validated.maxConcurrentWorkflows,
      enablePersistence: validated.enablePersistence,
    });

    return validated;
  } catch (error) {
    logger.error('Failed to create workflow configuration', { error });
    
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new Error(`Invalid workflow configuration: ${issues}`);
    }
    
    throw new Error('Failed to create workflow configuration: unknown error');
  }
}

/**
 * Gets environment-based configuration overrides
 * 
 * @returns Configuration values from environment variables
 */
export function getEnvConfig(): Partial<WorkflowEngineConfig> {
  const config: Partial<WorkflowEngineConfig> = {};

  // Parse timeout overrides from environment
  if (process.env.WORKFLOW_DEFAULT_TIMEOUT_MS) {
    config.timeouts = {
      ...config.timeouts,
      defaultTimeoutMs: parseInt(process.env.WORKFLOW_DEFAULT_TIMEOUT_MS, 10),
    };
  }

  if (process.env.WORKFLOW_MAX_TIMEOUT_MS) {
    config.timeouts = {
      ...config.timeouts,
      maxTimeoutMs: parseInt(process.env.WORKFLOW_MAX_TIMEOUT_MS, 10),
    };
  }

  if (process.env.WORKFLOW_STEP_TIMEOUT_MS) {
    config.timeouts = {
      ...config.timeouts,
      stepTimeoutMs: parseInt(process.env.WORKFLOW_STEP_TIMEOUT_MS, 10),
    };
  }

  // Parse retry overrides from environment
  if (process.env.WORKFLOW_MAX_RETRIES) {
    config.retries = {
      ...config.retries,
      maxRetries: parseInt(process.env.WORKFLOW_MAX_RETRIES, 10),
    };
  }

  if (process.env.WORKFLOW_BASE_DELAY_MS) {
    config.retries = {
      ...config.retries,
      baseDelayMs: parseInt(process.env.WORKFLOW_BASE_DELAY_MS, 10),
    };
  }

  // Parse other overrides
  if (process.env.WORKFLOW_MAX_CONCURRENT) {
    config.maxConcurrentWorkflows = parseInt(process.env.WORKFLOW_MAX_CONCURRENT, 10);
  }

  if (process.env.WORKFLOW_ENABLE_PERSISTENCE !== undefined) {
    config.enablePersistence = process.env.WORKFLOW_ENABLE_PERSISTENCE === 'true';
  }

  if (process.env.WORKFLOW_DEFAULT_VERSION) {
    config.defaultVersion = process.env.WORKFLOW_DEFAULT_VERSION;
  }

  return config;
}

/**
 * Creates configuration from environment variables with validation
 * 
 * @returns Validated workflow engine configuration
 */
export function createConfigFromEnv(): WorkflowEngineConfig {
  const envConfig = getEnvConfig();
  return createWorkflowConfig(envConfig);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculates retry delay using exponential backoff with jitter
 * 
 * @param attempt - Current retry attempt (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds before next retry
 */
export function calculateRetryDelay(attempt: number, config: RetryConfig): number {
  // Calculate exponential backoff: baseDelay * (multiplier ^ attempt)
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  
  // Apply maximum delay cap
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  
  // Add jitter (±25%) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  const finalDelay = Math.max(0, Math.floor(cappedDelay + jitter));
  
  logger.debug('Calculated retry delay', {
    attempt,
    baseDelay: config.baseDelayMs,
    exponentialDelay,
    cappedDelay,
    finalDelay,
  });
  
  return finalDelay;
}

/**
 * Checks if a workflow status is terminal (no further state changes possible)
 * 
 * @param status - Workflow status to check
 * @returns True if status is terminal
 */
export function isTerminalStatus(status: WorkflowStatus): boolean {
  return [
    WORKFLOW_STATUS.COMPLETED,
    WORKFLOW_STATUS.FAILED,
    WORKFLOW_STATUS.CANCELLED,
    WORKFLOW_STATUS.TIMEOUT,
  ].includes(status);
}

/**
 * Checks if a step status allows retry
 * 
 * @param status - Step status to check
 * @returns True if step can be retried
 */
export function isRetryableStatus(status: StepStatus): boolean {
  return status === STEP_STATUS.FAILED || status === STEP_STATUS.RETRYING;
}