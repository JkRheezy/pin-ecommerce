/**
 * Utils module for orchestrator helper functions
 * Layer: Service (Layer 4)
 * 
 * Provides utility functions for AI orchestrator operations including
 * validation, transformation, and common operations.
 */

import { logger } from '@harness/logging';
import { 
  OrchestratorConfig, 
  OrchestratorInput, 
  OrchestratorResult,
  ValidationError,
  OrchestratorError 
} from './types';

/**
 * Validates orchestrator configuration
 * @param config - The configuration to validate
 * @throws ValidationError if configuration is invalid
 */
export function validateOrchestratorConfig(config: unknown): asserts config is OrchestratorConfig {
  if (!config || typeof config !== 'object') {
    throw new ValidationError('Config must be a non-null object');
  }

  const cfg = config as Record<string, unknown>;

  // Validate required fields
  if (!cfg.name || typeof cfg.name !== 'string') {
    throw new ValidationError('Config must have a valid name string');
  }

  if (!cfg.version || typeof cfg.version !== 'string') {
    throw new ValidationError('Config must have a valid version string');
  }

  // Validate timeout if provided
  if (cfg.timeout !== undefined) {
    if (typeof cfg.timeout !== 'number' || cfg.timeout < 0) {
      throw new ValidationError('Timeout must be a positive number');
    }
  }

  // Validate retry policy if provided
  if (cfg.retryPolicy) {
    validateRetryPolicy(cfg.retryPolicy);
  }

  logger.debug('Orchestrator config validated successfully', { name: cfg.name });
}

/**
 * Validates retry policy configuration
 * @param policy - The retry policy to validate
 * @throws ValidationError if policy is invalid
 */
function validateRetryPolicy(policy: unknown): void {
  if (!policy || typeof policy !== 'object') {
    throw new ValidationError('Retry policy must be a non-null object');
  }

  const p = policy as Record<string, unknown>;

  if (p.maxRetries !== undefined && (typeof p.maxRetries !== 'number' || p.maxRetries < 0)) {
    throw new ValidationError('maxRetries must be a non-negative number');
  }

  if (p.backoffMs !== undefined && (typeof p.backoffMs !== 'number' || p.backoffMs < 0)) {
    throw new ValidationError('backoffMs must be a non-negative number');
  }
}

/**
 * Validates orchestrator input
 * @param input - The input to validate
 * @throws ValidationError if input is invalid
 */
export function validateOrchestratorInput(input: unknown): asserts input is OrchestratorInput {
  if (!input || typeof input !== 'object') {
    throw new ValidationError('Input must be a non-null object');
  }

  const inp = input as Record<string, unknown>;

  if (!inp.prompt || typeof inp.prompt !== 'string' || inp.prompt.trim().length === 0) {
    throw new ValidationError('Input must have a non-empty prompt string');
  }

  // Validate optional context
  if (inp.context !== undefined && typeof inp.context !== 'object') {
    throw new ValidationError('Context must be an object if provided');
  }

  // Validate optional parameters
  if (inp.parameters !== undefined && typeof inp.parameters !== 'object') {
    throw new ValidationError('Parameters must be an object if provided');
  }

  logger.debug('Orchestrator input validated successfully');
}

/**
 * Creates a standardized orchestrator result
 * @param data - The result data
 * @param metadata - Optional metadata
 * @returns Standardized orchestrator result
 */
export function createResult<T>(
  data: T,
  metadata?: Record<string, unknown>
): OrchestratorResult<T> {
  return {
    success: true,
    data,
    metadata: {
      timestamp: Date.now(),
      ...metadata,
    },
  };
}

/**
 * Creates a standardized orchestrator error result
 * @param error - The error that occurred
 * @param context - Additional context about the error
 * @returns Standardized error result
 */
export function createErrorResult(
  error: Error,
  context?: Record<string, unknown>
): OrchestratorResult<never> {
  const isOrchestratorError = error instanceof OrchestratorError;
  
  logger.error('Orchestrator operation failed', {
    error: error.message,
    type: error.constructor.name,
    isOrchestratorError,
    ...context,
  });

  return {
    success: false,
    error: {
      message: error.message,
      code: isOrchestratorError ? (error as OrchestratorError).code : 'UNKNOWN_ERROR',
      details: context,
    },
    metadata: {
      timestamp: Date.now(),
    },
  };
}

/**
 * Executes a function with timeout
 * @param fn - The function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param context - Context for error messages
 * @returns Promise that resolves with function result or rejects on timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  context: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new OrchestratorError(
        `Operation '${context}' timed out after ${timeoutMs}ms`,
        'TIMEOUT_ERROR'
      ));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Retries an async operation with exponential backoff
 * @param fn - The function to retry
 * @param maxRetries - Maximum number of retry attempts
 * @param backoffMs - Initial backoff in milliseconds
 * @param context - Context for logging
 * @returns Promise that resolves with function result
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  backoffMs: number,
  context: string
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      
      if (attempt > 0) {
        logger.info(`Operation '${context}' succeeded after ${attempt} retries`);
      }
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) {
        logger.error(`Operation '${context}' failed after ${maxRetries} retries`, {
          lastError: lastError.message,
        });
        throw lastError;
      }

      const delay = backoffMs * Math.pow(2, attempt);
      logger.warn(`Operation '${context}' failed, retrying in ${delay}ms`, {
        attempt: attempt + 1,
        maxRetries,
        error: lastError.message,
      });
      
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new Error('Retry loop exited unexpectedly');
}

/**
 * Sleeps for specified duration
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sanitizes input string to prevent injection attacks
 * @param input - The input to sanitize
 * @returns Sanitized string
 */
export function sanitizeInput(input: string): string {
  // Remove control characters and limit length
  return input
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
    .slice(0, 10000); // Limit to 10k characters
}

/**
 * Merges partial config with defaults
 * @param partial - Partial configuration provided by user
 * @param defaults - Default configuration values
 * @returns Merged configuration
 */
export function mergeWithDefaults<T extends Record<string, unknown>>(
  partial: Partial<T>,
  defaults: T
): T {
  const merged = { ...defaults };
  
  for (const key of Object.keys(partial) as Array<keyof T>) {
    const value = partial[key];
    if (value !== undefined) {
      if (
        typeof value === 'object' && 
        value !== null && 
        !Array.isArray(value) &&
        typeof merged[key] === 'object'
      ) {
        // Deep merge for nested objects
        merged[key] = mergeWithDefaults(
          value as Record<string, unknown>,
          merged[key] as Record<string, unknown>
        ) as T[keyof T];
      } else {
        merged[key] = value as T[keyof T];
      }
    }
  }
  
  return merged;
}

/**
 * Measures execution time of an async function
 * @param fn - The function to measure
 * @param name - Name for logging
 * @returns Tuple of [result, durationMs]
 */
export async function measureExecutionTime<T>(
  fn: () => Promise<T>,
  name: string
): Promise<[T, number]> {
  const start = performance.now();
  
  try {
    const result = await fn();
    const duration = Math.round(performance.now() - start);
    
    logger.debug(`Operation '${name}' completed`, { durationMs: duration });
    
    return [result, duration];
  } catch (error) {
    const duration = Math.round(performance.now() - start);
    
    logger.warn(`Operation '${name}' failed`, { 
      durationMs: duration,
      error: error instanceof Error ? error.message : String(error),
    });
    
    throw error;
  }
}

/**
 * Safely parses JSON with error handling
 * @param json - The JSON string to parse
 * @param context - Context for error messages
 * @returns Parsed object or null if parsing fails
 */
export function safeJsonParse<T>(json: string, context: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    logger.warn(`Failed to parse JSON in '${context}'`, {
      error: error instanceof Error ? error.message : String(error),
      preview: json.slice(0, 100),
    });
    return null;
  }
}

/**
 * Formats error for external consumption (removes sensitive details)
 * @param error - The error to format
 * @returns Safe error object
 */
export function formatErrorForExternal(error: Error): { message: string; code: string } {
  // Don't expose internal details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return {
    message: isDevelopment 
      ? error.message 
      : 'An internal error occurred',
    code: error instanceof OrchestratorError 
      ? error.code 
      : 'INTERNAL_ERROR',
  };
}