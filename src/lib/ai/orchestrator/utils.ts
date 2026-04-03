/**
 * Utils Module for Orchestrator Helper Functions
 * 
 * Layer: Service (Layer 4)
 * 
 * This module provides utility functions for the AI orchestrator,
 * including task parsing, validation, and transformation helpers.
 */

import { logger } from '@harness/logging';
import { 
  OrchestratorTask, 
  TaskStatus, 
  TaskPriority,
  TaskValidationResult,
  TaskExecutionContext,
  OrchestratorError,
  OrchestratorErrorCode
} from './types';

// =============================================================================
// Types Layer (Layer 1) - Local type definitions for utilities
// =============================================================================

interface ParsedTaskInput {
  raw: unknown;
  sanitized: string;
  metadata: Record<string, unknown>;
}

interface TaskMetrics {
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validates a task object against required schema
 * Returns detailed validation result with error messages
 */
export function validateTask(task: unknown): TaskValidationResult {
  const errors: string[] = [];
  
  if (!task || typeof task !== 'object') {
    return {
      isValid: false,
      errors: ['Task must be a non-null object']
    };
  }

  const taskObj = task as Record<string, unknown>;

  // Required field checks
  if (!taskObj.id || typeof taskObj.id !== 'string') {
    errors.push('Task must have a valid string id');
  }

  if (!taskObj.type || typeof taskObj.type !== 'string') {
    errors.push('Task must have a valid string type');
  }

  // Priority validation
  const validPriorities: TaskPriority[] = ['low', 'medium', 'high', 'critical'];
  if (taskObj.priority && !validPriorities.includes(taskObj.priority as TaskPriority)) {
    errors.push(`Priority must be one of: ${validPriorities.join(', ')}`);
  }

  // Status validation
  const validStatuses: TaskStatus[] = ['pending', 'running', 'completed', 'failed', 'cancelled'];
  if (taskObj.status && !validStatuses.includes(taskObj.status as TaskStatus)) {
    errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
  }

  logger.debug('Task validation completed', {
    taskId: taskObj.id,
    isValid: errors.length === 0,
    errorCount: errors.length
  });

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Type guard to check if value is a valid OrchestratorTask
 */
export function isValidTask(task: unknown): task is OrchestratorTask {
  const validation = validateTask(task);
  return validation.isValid;
}

// =============================================================================
// Input Sanitization and Parsing
// =============================================================================

/**
 * Parses and sanitizes raw task input
 * Handles various input formats and normalizes to string
 */
export function parseTaskInput(input: unknown): ParsedTaskInput {
  let sanitized: string;
  const metadata: Record<string, unknown> = {};

  try {
    if (input === null || input === undefined) {
      sanitized = '';
    } else if (typeof input === 'string') {
      // Trim and remove potentially dangerous characters
      sanitized = input.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    } else if (typeof input === 'object') {
      // Serialize objects to JSON for consistent handling
      sanitized = JSON.stringify(input);
      metadata.originalType = 'object';
    } else {
      // Convert primitives to string
      sanitized = String(input);
      metadata.originalType = typeof input;
    }

    // Enforce maximum length to prevent memory issues
    const MAX_INPUT_LENGTH = 100000;
    if (sanitized.length > MAX_INPUT_LENGTH) {
      logger.warn('Task input truncated due to length', {
        originalLength: sanitized.length,
        maxLength: MAX_INPUT_LENGTH
      });
      sanitized = sanitized.substring(0, MAX_INPUT_LENGTH);
      metadata.wasTruncated = true;
    }

    return {
      raw: input,
      sanitized,
      metadata
    };
  } catch (error) {
    logger.error('Failed to parse task input', { error });
    throw new OrchestratorError(
      OrchestratorErrorCode.INVALID_INPUT,
      'Failed to parse task input',
      { originalError: error }
    );
  }
}

// =============================================================================
// Task Transformation Helpers
// =============================================================================

/**
 * Creates a task execution context with default values and validation
 */
export function createExecutionContext(
  task: OrchestratorTask,
  overrides?: Partial<TaskExecutionContext>
): TaskExecutionContext {
  const context: TaskExecutionContext = {
    taskId: task.id,
    correlationId: generateCorrelationId(),
    startTime: Date.now(),
    timeoutMs: 30000, // Default 30 second timeout
    retryCount: 0,
    maxRetries: 3,
    ...overrides
  };

  logger.debug('Created execution context', {
    taskId: context.taskId,
    correlationId: context.correlationId
  });

  return context;
}

/**
 * Generates a unique correlation ID for tracing requests across services
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 11);
  return `${timestamp}-${random}`;
}

/**
 * Calculates task metrics from creation to completion
 */
export function calculateTaskMetrics(task: OrchestratorTask): TaskMetrics {
  const metrics: TaskMetrics = {
    createdAt: task.createdAt || Date.now()
  };

  if (task.startedAt) {
    metrics.startedAt = task.startedAt;
  }

  if (task.completedAt) {
    metrics.completedAt = task.completedAt;
    
    // Calculate duration if we have both start and end times
    const endTime = task.completedAt;
    const startTime = task.startedAt || task.createdAt;
    metrics.duration = endTime - startTime;
  }

  return metrics;
}

// =============================================================================
// Error Handling Helpers
// =============================================================================

/**
 * Creates a standardized error from various error types
 */
export function normalizeError(error: unknown): OrchestratorError {
  if (error instanceof OrchestratorError) {
    return error;
  }

  if (error instanceof Error) {
    return new OrchestratorError(
      OrchestratorErrorCode.UNKNOWN_ERROR,
      error.message,
      { stack: error.stack }
    );
  }

  return new OrchestratorError(
    OrchestratorErrorCode.UNKNOWN_ERROR,
    'An unknown error occurred',
    { originalError: error }
  );
}

/**
 * Determines if an error is retryable based on error code
 */
export function isRetryableError(error: unknown): boolean {
  const normalizedError = normalizeError(error);
  
  const retryableCodes: OrchestratorErrorCode[] = [
    OrchestratorErrorCode.TIMEOUT,
    OrchestratorErrorCode.SERVICE_UNAVAILABLE,
    OrchestratorErrorCode.RATE_LIMITED
  ];

  return retryableCodes.includes(normalizedError.code);
}

// =============================================================================
// Priority and Scheduling Helpers
// =============================================================================

/**
 * Calculates task priority score for queue ordering
 * Higher score = higher priority
 */
export function calculatePriorityScore(task: OrchestratorTask): number {
  const priorityWeights: Record<TaskPriority, number> = {
    critical: 1000,
    high: 100,
    medium: 10,
    low: 1
  };

  const baseScore = priorityWeights[task.priority] || 1;
  
  // Age factor: older tasks get slight priority boost (prevents starvation)
  const ageMs = Date.now() - (task.createdAt || Date.now());
  const ageBonus = Math.min(ageMs / 60000, 50); // Max 50 point bonus for age
  
  return baseScore + ageBonus;
}

/**
 * Sorts tasks by priority score (descending)
 */
export function sortByPriority(tasks: OrchestratorTask[]): OrchestratorTask[] {
  return [...tasks].sort((a, b) => {
    const scoreA = calculatePriorityScore(a);
    const scoreB = calculatePriorityScore(b);
    return scoreB - scoreA;
  });
}

// =============================================================================
// Timeout and Concurrency Helpers
// =============================================================================

/**
 * Creates a promise that rejects after specified timeout
 */
export function createTimeoutPromise<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context?: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(
        new OrchestratorError(
          OrchestratorErrorCode.TIMEOUT,
          `Operation timed out after ${timeoutMs}ms`,
          { context }
        )
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Implements semaphore pattern for limiting concurrent operations
 */
export class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(initialPermits: number) {
    this.permits = initialPermits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    } else {
      this.permits++;
    }
  }

  async runWithPermit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// =============================================================================
// Logging and Debugging Helpers
// =============================================================================

/**
 * Safely serializes task for logging (removes sensitive data)
 */
export function sanitizeForLogging(task: OrchestratorTask): Record<string, unknown> {
  const sensitiveKeys = ['apiKey', 'token', 'password', 'secret', 'credential'];
  
  const sanitized = { ...task };
  
  // Deep clone and sanitize
  const sanitizeObject = (obj: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = sanitizeObject(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  };

  return sanitizeObject(sanitized as Record<string, unknown>);
}

/**
 * Formats duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(2);
  return `${minutes}m ${seconds}s`;
}