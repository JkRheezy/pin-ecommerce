/**
 * Utils Module for Workflow Helper Functions
 * 
 * This module provides utility functions for workflow management
 * following the six-layer architecture pattern.
 * 
 * Layer: Service (Layer 4) - Business logic utilities
 */

import { z } from 'zod';
import { logger } from '@/lib/logging';
import { Result, ok, err } from '@/lib/types/result';
import { WorkflowError, WorkflowErrorCode } from '@/lib/ai/workflow/types';

// =============================================================================
// Types (Layer 1)
// =============================================================================

/**
 * Workflow node status enumeration
 */
export enum WorkflowNodeStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/**
 * Workflow execution context
 */
export interface WorkflowContext {
  workflowId: string;
  executionId: string;
  userId: string;
  startedAt: Date;
  metadata: Record<string, unknown>;
}

/**
 * Retry configuration for workflow operations
 */
export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
  maxBackoffMs: number;
  retryableErrors: string[];
}

// =============================================================================
// Validation Schemas
// =============================================================================

const workflowContextSchema = z.object({
  workflowId: z.string().uuid(),
  executionId: z.string().uuid(),
  userId: z.string().min(1),
  startedAt: z.date(),
  metadata: z.record(z.unknown()).default({}),
});

const retryConfigSchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(3),
  backoffMs: z.number().int().min(100).default(1000),
  maxBackoffMs: z.number().int().min(1000).default(30000),
  retryableErrors: z.array(z.string()).default([]),
});

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  backoffMs: 1000,
  maxBackoffMs: 30000,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'NETWORK_ERROR'],
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Validates workflow context with structured error handling
 * 
 * @param context - The workflow context to validate
 * @returns Result containing validated context or error
 */
export function validateWorkflowContext(
  context: unknown
): Result<WorkflowContext, WorkflowError> {
  const parseResult = workflowContextSchema.safeParse(context);

  if (!parseResult.success) {
    const errorMessage = parseResult.error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join(', ');

    logger.warn('Workflow context validation failed', {
      error: errorMessage,
      context,
    });

    return err({
      code: WorkflowErrorCode.INVALID_CONTEXT,
      message: `Invalid workflow context: ${errorMessage}`,
      details: parseResult.error.flatten(),
    });
  }

  return ok(parseResult.data);
}

/**
 * Calculates exponential backoff delay with jitter
 * 
 * Uses the formula: min(maxBackoff, baseBackoff * 2^attempt) + randomJitter
 * This prevents thundering herd problems in distributed systems
 * 
 * @param attempt - Current attempt number (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  config: Partial<RetryConfig> = {}
): number {
  const validatedConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  
  // Calculate exponential delay: base * 2^attempt
  const exponentialDelay = validatedConfig.backoffMs * Math.pow(2, attempt);
  
  // Cap at maximum backoff
  const cappedDelay = Math.min(exponentialDelay, validatedConfig.maxBackoffMs);
  
  // Add jitter (±25%) to prevent synchronized retries
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  
  const finalDelay = Math.floor(cappedDelay + jitter);
  
  logger.debug('Calculated backoff delay', {
    attempt,
    baseDelay: validatedConfig.backoffMs,
    exponentialDelay,
    cappedDelay,
    jitter,
    finalDelay,
  });

  return finalDelay;
}

/**
 * Determines if an error is retryable based on configuration
 * 
 * @param error - The error to check
 * @param config - Retry configuration
 * @returns True if the error should be retried
 */
export function isRetryableError(
  error: unknown,
  config: Partial<RetryConfig> = {}
): boolean {
  const validatedConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  
  if (!(error instanceof Error)) {
    return false;
  }

  // Check if error message or code matches retryable patterns
  const errorIdentifier = error.code || error.name || error.message;
  
  const isRetryable = validatedConfig.retryableErrors.some(pattern => 
    errorIdentifier.toLowerCase().includes(pattern.toLowerCase())
  );

  logger.debug('Checked error retryability', {
    errorName: error.name,
    errorCode: error.code,
    errorMessage: error.message,
    isRetryable,
    retryablePatterns: validatedConfig.retryableErrors,
  });

  return isRetryable;
}

/**
 * Generates a unique workflow execution identifier
 * 
 * Combines timestamp, random component, and workflow ID hash
 * to ensure uniqueness across distributed systems
 * 
 * @param workflowId - The parent workflow ID
 * @returns Unique execution identifier
 */
export function generateExecutionId(workflowId: string): string {
  const timestamp = Date.now().toString(36);
  const randomComponent = Math.random().toString(36).substring(2, 8);
  const workflowHash = workflowId.slice(-6);
  
  const executionId = `exec_${timestamp}_${randomComponent}_${workflowHash}`;
  
  logger.debug('Generated execution ID', {
    workflowId,
    executionId,
    components: { timestamp, randomComponent, workflowHash },
  });

  return executionId;
}

/**
 * Merges workflow metadata with conflict resolution
 * 
 * Implements deep merge with last-write-wins strategy for conflicts
 * 
 * @param base - Base metadata object
 * @param override - Override metadata object
 * @returns Merged metadata
 */
export function mergeWorkflowMetadata(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    // Deep merge for nested objects
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof merged[key] === 'object' &&
      merged[key] !== null &&
      !Array.isArray(merged[key])
    ) {
      merged[key] = mergeWorkflowMetadata(
        merged[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      // Last-write-wins for primitives and arrays
      merged[key] = value;
    }
  }

  logger.debug('Merged workflow metadata', {
    baseKeys: Object.keys(base),
    overrideKeys: Object.keys(override),
    resultKeys: Object.keys(merged),
  });

  return merged;
}

/**
 * Safely serializes workflow state for persistence
 * 
 * Handles circular references and non-serializable values
 * 
 * @param state - State object to serialize
 * @returns JSON string or error result
 */
export function serializeWorkflowState(
  state: unknown
): Result<string, WorkflowError> {
  try {
    // Custom replacer to handle special cases
    const replacer = (_key: string, value: unknown): unknown => {
      // Handle BigInt
      if (typeof value === 'bigint') {
        return { __type: 'BigInt', value: value.toString() };
      }
      
      // Handle Date
      if (value instanceof Date) {
        return { __type: 'Date', value: value.toISOString() };
      }
      
      // Handle Set
      if (value instanceof Set) {
        return { __type: 'Set', value: Array.from(value) };
      }
      
      // Handle Map
      if (value instanceof Map) {
        return { __type: 'Map', value: Array.from(value.entries()) };
      }
      
      // Handle undefined
      if (value === undefined) {
        return { __type: 'Undefined' };
      }

      return value;
    };

    const serialized = JSON.stringify(state, replacer);

    logger.debug('Serialized workflow state', {
      sizeBytes: serialized.length,
      preview: serialized.slice(0, 200),
    });

    return ok(serialized);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown serialization error';
    
    logger.error('Failed to serialize workflow state', {
      error: message,
      stateType: typeof state,
    });

    return err({
      code: WorkflowErrorCode.SERIALIZATION_FAILED,
      message: `State serialization failed: ${message}`,
      cause: error,
    });
  }
}

/**
 * Deserializes workflow state with type restoration
 * 
 * @param serialized - JSON string to deserialize
 * @returns Restored state object or error result
 */
export function deserializeWorkflowState<T = unknown>(
  serialized: string
): Result<T, WorkflowError> {
  try {
    // Custom reviver to restore special types
    const reviver = (_key: string, value: unknown): unknown => {
      if (typeof value === 'object' && value !== null && '__type' in value) {
        const typedValue = value as { __type: string; value?: unknown };
        
        switch (typedValue.__type) {
          case 'BigInt':
            return BigInt(typedValue.value as string);
          case 'Date':
            return new Date(typedValue.value as string);
          case 'Set':
            return new Set(typedValue.value as unknown[]);
          case 'Map':
            return new Map(typedValue.value as [unknown, unknown][]);
          case 'Undefined':
            return undefined;
          default:
            return value;
        }
      }
      
      return value;
    };

    const deserialized = JSON.parse(serialized, reviver) as T;

    logger.debug('Deserialized workflow state', {
      inputSize: serialized.length,
      resultType: typeof deserialized,
    });

    return ok(deserialized);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown deserialization error';
    
    logger.error('Failed to deserialize workflow state', {
      error: message,
      inputPreview: serialized.slice(0, 200),
    });

    return err({
      code: WorkflowErrorCode.DESERIALIZATION_FAILED,
      message: `State deserialization failed: ${message}`,
      cause: error,
    });
  }
}

/**
 * Creates a timeout promise that rejects after specified duration
 * 
 * Useful for implementing operation timeouts in workflow steps
 * 
 * @param ms - Timeout duration in milliseconds
 * @param operationName - Name of the operation for error context
 * @returns Promise that rejects after timeout
 */
export function createTimeoutPromise(ms: number, operationName: string): Promise<never> {
  return new Promise((_, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new WorkflowError(
          WorkflowErrorCode.TIMEOUT,
          `Operation '${operationName}' timed out after ${ms}ms`
        )
      );
    }, ms);

    // Prevent Node.js from keeping process alive for this timeout
    if (typeof timeoutId.unref === 'function') {
      timeoutId.unref();
    }
  });
}

/**
 * Executes a promise with timeout and proper cleanup
 * 
 * @param promise - Promise to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Name for error context
 * @returns Result of the promise or timeout error
 */
export async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<Result<T, WorkflowError>> {
  try {
    const result = await Promise.race([
      promise,
      createTimeoutPromise(timeoutMs, operationName),
    ]);

    return ok(result);
  } catch (error) {
    if (error instanceof WorkflowError && error.code === WorkflowErrorCode.TIMEOUT) {
      logger.warn('Workflow operation timed out', {
        operationName,
        timeoutMs,
      });
      return err(error);
    }

    const message = error instanceof Error ? error.message : 'Operation failed';
    
    logger.error('Workflow operation failed', {
      operationName,
      error: message,
    });

    return err({
      code: WorkflowErrorCode.EXECUTION_FAILED,
      message: `Operation '${operationName}' failed: ${message}`,
      cause: error,
    });
  }
}

// =============================================================================
// Export Default Configuration
// =============================================================================

export const WorkflowUtils = {
  DEFAULT_RETRY_CONFIG,
  validateWorkflowContext,
  calculateBackoffDelay,
  isRetryableError,
  generateExecutionId,
  mergeWorkflowMetadata,
  serializeWorkflowState,
  deserializeWorkflowState,
  createTimeoutPromise,
  executeWithTimeout,
} as const;