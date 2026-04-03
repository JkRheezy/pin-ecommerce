/**
 * @fileoverview Test Helpers - General utility functions for testing
 * @module app/__tests__/test-helpers
 * 
 * This module provides reusable test utilities following the six-layer architecture.
 * Layer: Service (test infrastructure layer)
 */

import { faker } from '@faker-js/faker';
import type { Logger } from '../../types/logging';
import { createMockLogger } from './mocks/logger.mock';

// ============================================================================
// Types Layer - Test Helper Types
// ============================================================================

/**
 * Configuration options for generating test data
 */
export interface TestDataConfig {
  /** Seed for deterministic random generation */
  seed?: number;
  /** Locale for faker data generation */
  locale?: string;
  /** Whether to include optional fields */
  includeOptional?: boolean;
}

/**
 * Factory function type for creating test entities
 */
export type EntityFactory<T> = (overrides?: Partial<T>, config?: TestDataConfig) => T;

/**
 * Mock setup result with cleanup function
 */
export interface MockSetupResult<T> {
  /** The mock instance */
  mock: T;
  /** Cleanup function to restore original state */
  cleanup: () => void;
  /** Reset function to clear mock state */
  reset: () => void;
}

/**
 * Async test wrapper options
 */
export interface AsyncTestOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Whether to expect rejection */
  expectRejection?: boolean;
  /** Expected error type */
  expectedErrorType?: new (...args: unknown[]) => Error;
}

// ============================================================================
// Service Layer - Test Data Generation
// ============================================================================

/**
 * Initialize faker with consistent seeding for reproducible tests
 * @param config - Test data configuration
 * @returns Initialized faker instance configuration
 */
export function initializeTestData(config: TestDataConfig = {}): Required<TestDataConfig> {
  const { seed = 12345, locale = 'en', includeOptional = true } = config;
  
  // Set seed for deterministic generation
  faker.seed(seed);
  
  // Set locale if different from default
  if (locale !== 'en') {
    faker.setLocale(locale);
  }
  
  return { seed, locale, includeOptional };
}

/**
 * Reset faker seed to ensure test isolation
 * @param seed - New seed value (defaults to random)
 */
export function resetTestDataSeed(seed: number = Date.now()): void {
  faker.seed(seed);
}

/**
 * Generate a unique identifier for test entities
 * @param prefix - Optional prefix for the ID
 * @returns Unique string identifier
 */
export function generateTestId(prefix: string = 'test'): string {
  return `${prefix}_${faker.string.alphanumeric(12)}_${Date.now()}`;
}

/**
 * Create a timestamp within a reasonable test range
 * @param options - Options for timestamp generation
 * @returns ISO timestamp string
 */
export function generateTestTimestamp(options: { 
  daysAgo?: number; 
  daysFromNow?: number;
} = {}): string {
  const { daysAgo = 0, daysFromNow = 0 } = options;
  
  const date = new Date();
  
  if (daysAgo > 0) {
    date.setDate(date.getDate() - daysAgo);
  } else if (daysFromNow > 0) {
    date.setDate(date.getDate() + daysFromNow);
  }
  
  return date.toISOString();
}

// ============================================================================
// Service Layer - Mock Management
// ============================================================================

/**
 * Create a mock logger with test-appropriate configuration
 * @returns Mock logger instance
 */
export function createTestLogger(): Logger {
  return createMockLogger({
    level: 'error', // Only log errors during tests to reduce noise
    silent: process.env.CI === 'true', // Silent in CI
  });
}

/**
 * Setup and teardown helper for managing mock state
 * @param setupFn - Function to create the mock
 * @returns Mock setup result with cleanup
 */
export function setupMock<T>(setupFn: () => T): MockSetupResult<T> {
  const originalEnv = { ...process.env };
  let mock: T;
  
  try {
    mock = setupFn();
  } catch (error) {
    throw new TestHelperError('Failed to setup mock', { cause: error });
  }
  
  return {
    mock,
    cleanup: () => {
      process.env = originalEnv;
    },
    reset: () => {
      // Reset common mock properties if they exist
      const mockAny = mock as Record<string, unknown>;
      if (typeof mockAny.mockClear === 'function') {
        (mockAny.mockClear as () => void)();
      }
      if (typeof mockAny.mockReset === 'function') {
        (mockAny.mockReset as () => void)();
      }
    },
  };
}

// ============================================================================
// Service Layer - Async Testing Utilities
// ============================================================================

/**
 * Custom error class for test helper failures
 */
export class TestHelperError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TestHelperError';
    
    // Maintain proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TestHelperError);
    }
  }
}

/**
 * Safely execute an async operation in tests with proper error handling
 * @param operation - Async operation to execute
 * @param options - Test execution options
 * @returns Result of the operation
 */
export async function runAsyncTest<T>(
  operation: () => Promise<T>,
  options: AsyncTestOptions = {}
): Promise<T | Error> {
  const { 
    timeout = 5000, 
    expectRejection = false,
    expectedErrorType 
  } = options;

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new TestHelperError(`Test timed out after ${timeout}ms`)), timeout);
  });

  try {
    const result = await Promise.race([operation(), timeoutPromise]);
    
    if (expectRejection) {
      throw new TestHelperError('Expected operation to reject but it resolved', { result });
    }
    
    return result;
  } catch (error) {
    if (!expectRejection) {
      throw error;
    }
    
    if (expectedErrorType && !(error instanceof expectedErrorType)) {
      throw new TestHelperError(
        `Expected error type ${expectedErrorType.name} but got ${error.constructor.name}`,
        { actualError: error }
      );
    }
    
    return error instanceof Error ? error : new TestHelperError(String(error));
  }
}

/**
 * Wait for a condition to be met with polling
 * @param condition - Function that returns true when condition is met
 * @param options - Polling configuration
 * @returns True when condition is met
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  options: {
    interval?: number;
    timeout?: number;
    message?: string;
  } = {}
): Promise<boolean> {
  const { 
    interval = 50, 
    timeout = 5000,
    message = 'Condition was not met within timeout'
  } = options;

  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const result = await condition();
      if (result) {
        return true;
      }
    } catch (error) {
      // Continue polling on error
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new TestHelperError(message, { timeout, interval });
}

// ============================================================================
// Service Layer - Test Environment Utilities
// ============================================================================

/**
 * Check if running in CI environment
 * @returns True if in CI environment
 */
export function isCI(): boolean {
  return process.env.CI === 'true' || 
         process.env.GITHUB_ACTIONS === 'true' ||
         process.env.JENKINS_URL !== undefined;
}

/**
 * Get test environment configuration
 * @returns Environment configuration object
 */
export function getTestEnvironment(): {
  isCI: boolean;
  isDebug: boolean;
  logLevel: string;
  timeout: number;
} {
  return {
    isCI: isCI(),
    isDebug: process.env.DEBUG === 'true',
    logLevel: process.env.LOG_LEVEL || 'error',
    timeout: parseInt(process.env.TEST_TIMEOUT || '5000', 10),
  };
}

/**
 * Suppress console output during test execution
 * @param fn - Function to execute with suppressed output
 * @returns Result of the function
 */
export async function suppressConsole<T>(fn: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const noop = () => {};
  
  console.log = noop;
  console.error = noop;
  console.warn = noop;
  
  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }
}

// ============================================================================
// Service Layer - Assertion Helpers
// ============================================================================

/**
 * Type guard to check if value is a non-null object
 * @param value - Value to check
 * @returns Type predicate for non-null object
 */
export function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Assert that a value is defined (not null or undefined)
 * @param value - Value to check
 * @param message - Optional error message
 * @returns The value with null/undefined removed from type
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string = 'Expected value to be defined'
): T {
  if (value === null || value === undefined) {
    throw new TestHelperError(message, { value });
  }
  return value;
}

/**
 * Create a matcher for partial object comparison
 * @param expected - Expected partial object
 * @returns Matcher function for array find/filter
 */
export function matchPartial<T extends Record<string, unknown>>(
  expected: Partial<T>
): (item: T) => boolean {
  return (item: T): boolean => {
    return Object.entries(expected).every(([key, value]) => {
      return item[key] === value;
    });
  };
}

// ============================================================================
// Config Layer - Test Configuration
// ============================================================================

/**
 * Default test configuration values
 */
export const TEST_DEFAULTS = {
  /** Default timeout for async operations */
  TIMEOUT: 5000,
  /** Default pagination limit for list tests */
  PAGE_SIZE: 20,
  /** Default retry attempts for flaky operations */
  RETRY_ATTEMPTS: 3,
  /** Default retry delay in milliseconds */
  RETRY_DELAY: 100,
} as const;

/**
 * Merge user config with test defaults
 * @param userConfig - User provided configuration
 * @returns Merged configuration
 */
export function mergeTestConfig<T extends Record<string, unknown>>(
  userConfig: Partial<T>
): T {
  return {
    ...TEST_DEFAULTS,
    ...userConfig,
  } as unknown as T;
}