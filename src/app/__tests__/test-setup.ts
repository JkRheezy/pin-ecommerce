/**
 * Test Setup - Configuration and utilities for test environment
 * Layer: Runtime (Test Runtime)
 * 
 * This module provides centralized test configuration, mocking utilities,
 * and setup/teardown hooks for consistent test execution.
 */

import { vi, type Mock } from 'vitest';
import type { Logger } from '../types/logger.types';
import type { Config } from '../config/config.types';

// ============================================================================
// Types
// ============================================================================

/**
 * Test environment configuration
 */
export interface TestEnvironmentConfig {
  /** Enable debug logging during tests */
  debug: boolean;
  /** Mock external API calls */
  mockExternalApis: boolean;
  /** Test timeout in milliseconds */
  timeoutMs: number;
  /** Environment name */
  env: 'test' | 'integration' | 'e2e';
}

/**
 * Mock factory function type
 */
export type MockFactory<T> = () => Mock<T>;

/**
 * Test context passed to test functions
 */
export interface TestContext {
  /** Mock logger instance */
  logger: Logger;
  /** Test configuration */
  config: TestEnvironmentConfig;
  /** Cleanup functions to run after test */
  cleanup: (() => void | Promise<void>)[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_TEST_CONFIG: TestEnvironmentConfig = {
  debug: process.env.TEST_DEBUG === 'true',
  mockExternalApis: true,
  timeoutMs: 5000,
  env: (process.env.TEST_ENV as TestEnvironmentConfig['env']) ?? 'test',
};

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Creates a mock logger that captures log calls for assertions
 */
export function createMockLogger(): Logger {
  const logs: Record<string, unknown[][]> = {
    debug: [],
    info: [],
    warn: [],
    error: [],
  };

  const logger: Logger & { getLogs: () => typeof logs; clearLogs: () => void } = {
    debug: vi.fn((...args: unknown[]) => {
      logs.debug.push(args);
    }),
    info: vi.fn((...args: unknown[]) => {
      logs.info.push(args);
    }),
    warn: vi.fn((...args: unknown[]) => {
      logs.warn.push(args);
    }),
    error: vi.fn((...args: unknown[]) => {
      logs.error.push(args);
    }),
    child: vi.fn(function(this: Logger, _bindings: Record<string, unknown>) {
      // Return same logger for simplicity in tests
      return this;
    }),
    getLogs: () => ({ ...logs }),
    clearLogs: () => {
      logs.debug = [];
      logs.info = [];
      logs.warn = [];
      logs.error = [];
    },
  };

  return logger;
}

/**
 * Creates a mock configuration for testing
 */
export function createMockConfig(overrides?: Partial<Config>): Config {
  return {
    appName: 'test-app',
    version: '0.0.0-test',
    environment: 'test',
    logLevel: 'error',
    ...overrides,
  } as Config;
}

// ============================================================================
// Setup Functions
// ============================================================================

/**
 * Initializes the test environment with proper configuration
 * 
 * @param customConfig - Optional configuration overrides
 * @returns Configured test context
 */
export function setupTestEnvironment(
  customConfig?: Partial<TestEnvironmentConfig>
): TestContext {
  const config: TestEnvironmentConfig = {
    ...DEFAULT_TEST_CONFIG,
    ...customConfig,
  };

  // Validate configuration
  if (config.timeoutMs < 0) {
    throw new Error('Test timeout must be non-negative');
  }

  const context: TestContext = {
    logger: createMockLogger(),
    config,
    cleanup: [],
  };

  // Configure global test timeout if running in Vitest
  if (typeof vi !== 'undefined' && config.timeoutMs) {
    vi.setConfig({ testTimeout: config.timeoutMs });
  }

  return context;
}

/**
 * Registers a cleanup function to run after tests
 * 
 * @param context - Test context
 * @param cleanupFn - Function to run during cleanup
 */
export function registerCleanup(
  context: TestContext,
  cleanupFn: () => void | Promise<void>
): void {
  context.cleanup.push(cleanupFn);
}

/**
 * Executes all registered cleanup functions
 * 
 * @param context - Test context
 */
export async function runCleanup(context: TestContext): Promise<void> {
  const errors: Error[] = [];

  // Run cleanup in reverse order (LIFO)
  for (const cleanupFn of [...context.cleanup].reverse()) {
    try {
      await cleanupFn();
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // Clear cleanup array
  context.cleanup = [];

  // Report any cleanup errors
  if (errors.length > 0) {
    const errorMessage = errors.map(e => e.message).join('; ');
    throw new Error(`Cleanup failed with ${errors.length} error(s): ${errorMessage}`);
  }
}

// ============================================================================
// Vitest Integration
// ============================================================================

/**
 * Sets up beforeEach and afterEach hooks for consistent test isolation
 * 
 * @param options - Setup options
 * @returns Function to create fresh context for each test
 */
export function setupTestHooks(options?: {
  config?: Partial<TestEnvironmentConfig>;
}): () => TestContext {
  let context: TestContext | undefined;

  beforeEach(() => {
    context = setupTestEnvironment(options?.config);
  });

  afterEach(async () => {
    if (context) {
      await runCleanup(context);
      context = undefined;
    }
  });

  return () => {
    if (!context) {
      throw new Error('Test context not initialized - ensure setupTestHooks is called at module level');
    }
    return context;
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Waits for a specified duration with proper cleanup support
 * 
 * @param ms - Milliseconds to wait
 * @param context - Optional test context for cleanup registration
 * @returns Promise that resolves after the delay
 */
export function wait(
  ms: number,
  context?: TestContext
): Promise<void> {
  if (ms < 0) {
    throw new Error('Wait duration must be non-negative');
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);

    // Register cleanup to clear timeout if test ends early
    if (context) {
      registerCleanup(context, () => {
        clearTimeout(timeoutId);
      });
    }
  });
}

/**
 * Creates a controlled promise for testing async operations
 * 
 * @template T - Type of the resolved value
 * @returns Object with promise, resolve, and reject controls
 */
export function createControlledPromise<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolveFn: (value: T) => void;
  let rejectFn: (error: Error) => void;

  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  // Non-null assertion safe because Promise executor runs synchronously
  return {
    promise,
    resolve: resolveFn!,
    reject: rejectFn!,
  };
}

/**
 * Suppresses console output during test execution
 * 
 * @param fn - Function to execute with suppressed output
 * @returns Result of the function
 */
export async function suppressConsole<T>(fn: () => T | Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;

  // Replace with no-op functions
  console.log = vi.fn();
  console.error = vi.fn();
  console.warn = vi.fn();
  console.info = vi.fn();

  try {
    return await fn();
  } finally {
    // Restore original functions
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
  }
}

// ============================================================================
// Export for convenience
// ============================================================================

export {
  DEFAULT_TEST_CONFIG,
};