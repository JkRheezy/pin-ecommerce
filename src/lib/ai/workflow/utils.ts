/**
 * @fileoverview AI Workflow Utilities
 * @module src/lib/ai/workflow/utils
 * 
 * This module provides helper functions and validators for the AI Workflow system.
 * It follows the six-layer architecture pattern, serving as a utility layer
 * that supports Service and Runtime layers.
 */

import { z } from 'zod';
import { createLogger } from '@harness/logging';
import { HarnessError, ErrorCode } from '@harness/errors';

// Types Layer: Core type definitions for the utils module
// ============================================

/**
 * Validation result type for structured validation responses
 */
export interface ValidationResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly errors?: ReadonlyArray<string>;
}

/**
 * Retry configuration for async operations
 */
export interface RetryConfig {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
  readonly retryableErrors?: ReadonlyArray<string | ErrorConstructor>;
}

/**
 * Default retry configuration for AI operations
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'],
} as const;

/**
 * Pagination parameters for list operations
 */
export interface PaginationParams {
  readonly page: number;
  readonly limit: number;
}

/**
 * Paginated result structure
 */
export interface PaginatedResult<T> {
  readonly items: ReadonlyArray<T>;
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly hasMore: boolean;
}

// Config Layer: Zod schemas for runtime validation
// ============================================

/**
 * Schema for validating workflow identifiers
 */
export const WorkflowIdSchema = z.string()
  .min(1, 'Workflow ID cannot be empty')
  .max(128, 'Workflow ID exceeds maximum length')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Workflow ID contains invalid characters');

/**
 * Schema for validating version strings (semver)
 */
export const VersionSchema = z.string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
    'Invalid semantic version format'
  );

/**
 * Schema for pagination parameters
 */
export const PaginationParamsSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

/**
 * Schema for retry configuration
 */
export const RetryConfigSchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(3),
  baseDelayMs: z.number().int().min(0).default(1000),
  maxDelayMs: z.number().int().min(0).default(30000),
  backoffMultiplier: z.number().min(1).default(2),
  retryableErrors: z.array(z.union([z.string(), z.function()])).optional(),
});

// Service Layer: Helper functions and validators
// ============================================

const logger = createLogger('ai:workflow:utils');

/**
 * Validates data against a Zod schema and returns a structured result
 * 
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns ValidationResult with success status and parsed data or errors
 * 
 * @example
 * const result = validateSchema(WorkflowIdSchema, 'my-workflow-123');
 * if (result.success) {
 *   console.log(result.data); // 'my-workflow-123'
 * } else {
 *   console.error(result.errors); // ['Error message']
 * }
 */
export function validateSchema<T>(schema: z.ZodType<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  const errors = result.error.errors.map(err => 
    `${err.path.join('.')}: ${err.message}`
  );

  logger.debug('Schema validation failed', { errors, data });

  return {
    success: false,
    errors,
  };
}

/**
 * Validates data and throws a HarnessError on failure
 * 
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @param context - Additional context for error messages
 * @returns Validated data
 * @throws HarnessError when validation fails
 */
export function validateOrThrow<T>(
  schema: z.ZodType<T>, 
  data: unknown, 
  context?: string
): T {
  const result = validateSchema(schema, data);
  
  if (!result.success) {
    const message = context 
      ? `Validation failed for ${context}: ${result.errors?.join(', ')}`
      : `Validation failed: ${result.errors?.join(', ')}`;
    
    throw new HarnessError(ErrorCode.VALIDATION_ERROR, message, {
      validationErrors: result.errors,
      context,
    });
  }

  return result.data as T;
}

/**
 * Executes an async function with exponential backoff retry logic
 * 
 * @param operation - Async function to execute
 * @param config - Retry configuration
 * @returns Result of the operation
 * @throws Last error encountered after all retries exhausted
 * 
 * @example
 * const result = await withRetry(
 *   () => fetchWorkflowData(id),
 *   { maxAttempts: 3, baseDelayMs: 1000 }
 * );
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const { maxAttempts, baseDelayMs, maxDelayMs, backoffMultiplier, retryableErrors } = fullConfig;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.debug('Attempting operation', { attempt, maxAttempts });
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if error is retryable
      const isRetryable = retryableErrors?.some(errType => {
        if (typeof errType === 'string') {
          return lastError?.message?.includes(errType) || (lastError as { code?: string })?.code === errType;
        }
        return lastError instanceof errType;
      }) ?? true; // Default to retryable if no specific errors specified

      if (!isRetryable || attempt === maxAttempts) {
        logger.error('Operation failed, no more retries', {
          attempt,
          error: lastError.message,
          isRetryable,
        });
        throw lastError;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs
      );
      const jitteredDelay = delay * (0.5 + Math.random() * 0.5); // Add 0-50% jitter

      logger.warn('Operation failed, retrying', {
        attempt,
        nextAttempt: attempt + 1,
        delayMs: Math.round(jitteredDelay),
        error: lastError.message,
      });

      await sleep(jitteredDelay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new HarnessError(ErrorCode.UNKNOWN_ERROR, 'Retry loop exited unexpectedly');
}

/**
 * Creates a paginated result from a full dataset
 * 
 * @param items - Full array of items
 * @param params - Pagination parameters
 * @returns Paginated result with metadata
 */
export function paginate<T>(
  items: ReadonlyArray<T>,
  params: PaginationParams
): PaginatedResult<T> {
  const validatedParams = validateOrThrow(PaginationParamsSchema, params, 'pagination params');
  const { page, limit } = validatedParams;

  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedItems = items.slice(startIndex, endIndex);

  return {
    items: Object.freeze(paginatedItems),
    total: items.length,
    page,
    limit,
    hasMore: endIndex < items.length,
  };
}

/**
 * Safely parses JSON with proper error handling
 * 
 * @param jsonString - String to parse
 * @param fallback - Optional fallback value on parse failure
 * @returns Parsed object or fallback
 * @throws HarnessError if parsing fails and no fallback provided
 */
export function safeJsonParse<T>(jsonString: string, fallback?: T): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    const parseError = error instanceof Error ? error : new Error(String(error));
    logger.warn('JSON parse failed', { 
      error: parseError.message, 
      input: jsonString.substring(0, 100), // Log only first 100 chars
      hasFallback: fallback !== undefined,
    });

    if (fallback !== undefined) {
      return fallback;
    }

    throw new HarnessError(
      ErrorCode.PARSE_ERROR,
      `Failed to parse JSON: ${parseError.message}`,
      { input: jsonString.substring(0, 1000) }
    );
  }
}

/**
 * Deep freezes an object to make it immutable
 * 
 * @param obj - Object to freeze
 * @returns Deeply frozen object
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj as Readonly<T>;
  }

  const propNames = Object.getOwnPropertyNames(obj);
  
  for (const name of propNames) {
    const value = (obj as Record<string, unknown>)[name];
    if (value !== null && typeof value === 'object') {
      deepFreeze(value);
    }
  }

  return Object.freeze(obj);
}

/**
 * Generates a unique identifier with optional prefix
 * 
 * @param prefix - Optional prefix for the ID
 * @returns Unique identifier string
 */
export function generateId(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 11);
  const id = `${timestamp}-${random}`;
  
  return prefix ? `${prefix}-${id}` : id;
}

/**
 * Validates that a value is a non-empty string
 * 
 * @param value - Value to check
 * @param name - Name of the field for error messages
 * @returns The validated string
 * @throws HarnessError if validation fails
 */
export function assertNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HarnessError(
      ErrorCode.VALIDATION_ERROR,
      `${name} must be a non-empty string`
    );
  }
  return value.trim();
}

/**
 * Validates that a value is a positive integer
 * 
 * @param value - Value to check
 * @param name - Name of the field for error messages
 * @returns The validated number
 * @throws HarnessError if validation fails
 */
export function assertPositiveInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new HarnessError(
      ErrorCode.VALIDATION_ERROR,
      `${name} must be a positive integer`
    );
  }
  return value;
}

// Runtime Layer: Low-level utility functions
// ============================================

/**
 * Promise-based sleep function for delays
 * 
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a timeout promise that rejects after specified duration
 * 
 * @param ms - Timeout duration in milliseconds
 * @param message - Optional custom error message
 * @returns Promise that rejects after timeout
 */
export function createTimeout(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new HarnessError(
        ErrorCode.TIMEOUT_ERROR,
        message ?? `Operation timed out after ${ms}ms`
      ));
    }, ms);
  });
}

/**
 * Executes a promise with a timeout
 * 
 * @param promise - Promise to execute
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise result or throws timeout error
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    createTimeout(timeoutMs),
  ]);
}

/**
 * Memoizes a function with TTL-based cache expiration
 * 
 * @param fn - Function to memoize
 * @param ttlMs - Time-to-live in milliseconds
 * @returns Memoized function
 */
export function memoizeWithTTL<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
  ttlMs: number
): (...args: TArgs) => TReturn {
  const cache = new Map<string, { value: TReturn; expiry: number }>();

  return (...args: TArgs): TReturn => {
    const key = JSON.stringify(args);
    const cached = cache.get(key);

    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }

    const value = fn(...args);
    cache.set(key, { value, expiry: Date.now() + ttlMs });
    
    // Clean up expired entries periodically
    if (cache.size > 100) {
      const now = Date.now();
      for (const [k, v] of cache.entries()) {
        if (v.expiry <= now) {
          cache.delete(k);
        }
      }
    }

    return value;
  };
}

/**
 * Formats a duration in milliseconds to human-readable string
 * 
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "1h 30m 45s")
 */
export function formatDuration(ms: number): string {
  if (ms < 0) return '0ms';
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Sanitizes a string for safe logging (removes potential PII)
 * 
 * @param str - String to sanitize
 * @returns Sanitized string
 */
export function sanitizeForLogging(str: string): string {
  // Remove email patterns
  let sanitized = str.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    '[EMAIL]'
  );
  
  // Remove potential API keys/tokens (alphanumeric strings > 20 chars)
  sanitized = sanitized.replace(
    /\b[a-zA-Z0-9_-]{20,}\b/g,
    '[TOKEN]'
  );

  return sanitized;
}

// UI Layer: Formatting and presentation helpers
// ============================================

/**
 * Truncates text with ellipsis if it exceeds max length
 * 
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength - 3)}...`;
}

/**
 * Formats a number as a percentage string
 * 
 * @param value - Number between 0 and 1
 * @param decimals - Number of decimal places
 * @returns Formatted percentage string
 */
export function formatPercent(value: number, decimals: number = 1): string {
  const clamped = Math.max(0, Math.min(1, value));
  return `${(clamped * 100).toFixed(decimals)}%`;
}

/**
 * Converts a camelCase string to kebab-case
 * 
 * @param str - camelCase string
 * @returns kebab-case string
 */
export function camelToKebab(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Groups an array of objects by a key
 * 
 * @param array - Array to group
 * @param key - Key to group by
 * @returns Grouped object
 */
export function groupBy<T extends Record<string, unknown>>(
  array: ReadonlyArray<T>,
  key: keyof T
): Record<string, ReadonlyArray<T>> {
  return array.reduce((groups, item) => {
    const groupKey = String(item[key]);
    return {
      ...groups,
      [groupKey]: [...(groups[groupKey] || []), item],
    };
  }, {} as Record<string, ReadonlyArray<T>>);
}