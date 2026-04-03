/**
 * Test Utility Types Module
 * 
 * This module provides type definitions for test utilities following the six-layer architecture.
 * Located at: Types layer (Layer 1)
 * 
 * These types support testing infrastructure across Repo, Service, and Runtime layers.
 */

import type { ReactElement } from 'react';
import type { RenderOptions, RenderResult } from '@testing-library/react';

// ============================================================================
// Core Test Infrastructure Types
// ============================================================================

/**
 * Represents the possible states of a test execution
 */
export enum TestExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PASSED = 'passed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  TIMEOUT = 'timeout',
}

/**
 * Severity levels for test failures, used for categorization and reporting
 */
export enum TestFailureSeverity {
  CRITICAL = 'critical',    // Blocks release, core functionality broken
  HIGH = 'high',            // Major feature affected
  MEDIUM = 'medium',        // Minor feature affected, workaround exists
  LOW = 'low',              // Cosmetic or edge case issue
  INFO = 'info',            // Informational, no functional impact
}

// ============================================================================
// Mock and Stub Types
// ============================================================================

/**
 * Generic type for creating typed mocks of any function
 * Follows the pattern: Mock<T> where T is the function signature
 */
export type Mock<T extends (...args: unknown[]) => unknown> = jest.Mock<ReturnType<T>, Parameters<T>>;

/**
 * Configuration for creating mock implementations
 * Used in Service layer testing
 */
export interface MockConfig<T = unknown> {
  /** Default return value for the mock */
  defaultReturn?: T;
  /** Sequence of return values for multiple calls */
  returnSequence?: T[];
  /** Implementation function for complex mocking */
  implementation?: (...args: unknown[]) => T;
  /** Whether to track call history */
  trackCalls?: boolean;
  /** Delay in ms for async mocks */
  delayMs?: number;
  /** Error to throw (for error case testing) */
  errorToThrow?: Error;
}

/**
 * Represents a mocked module with typed exports
 * Used for repository and service mocking
 */
export type MockedModule<TModule> = {
  [K in keyof TModule]: TModule[K] extends (...args: infer A) => infer R
    ? jest.Mock<R, A>
    : TModule[K];
};

// ============================================================================
// Test Data Factory Types
// ============================================================================

/**
 * Builder pattern for creating test data with overrides
 * Supports the Repo layer testing patterns
 */
export type TestDataBuilder<T, TOverrides = Partial<T>> = {
  /** Build the final object with all defaults and overrides applied */
  build(): T;
  /** Create a new builder with overrides merged */
  with(overrides: TOverrides): TestDataBuilder<T, TOverrides>;
  /** Build multiple instances */
  buildMany(count: number): T[];
};

/**
 * Factory function type for creating test data builders
 */
export type TestDataFactory<T, TOverrides = Partial<T>> = (
  defaults?: TOverrides
) => TestDataBuilder<T, TOverrides>;

/**
 * Options for generating random test data
 */
export interface RandomDataOptions {
  /** Seed for reproducible random generation */
  seed?: string;
  /** Locale for localized data generation */
  locale?: string;
  /** Whether to include null/undefined values */
  includeNulls?: boolean;
  /** Maximum depth for nested object generation */
  maxDepth?: number;
}

// ============================================================================
// Component Testing Types (UI Layer)
// ============================================================================

/**
 * Extended render options for component testing
 * Integrates with testing-library patterns
 */
export interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Route path for router testing */
  route?: string;
  /** Initial router entries */
  initialEntries?: string[];
  /** Custom wrapper component */
  wrapper?: React.ComponentType<{ children: React.ReactNode }>;
  /** Whether to wrap with common providers */
  withProviders?: boolean;
  /** Initial state for state management testing */
  initialState?: Record<string, unknown>;
}

/**
 * Result of custom render with additional utilities
 */
export interface CustomRenderResult extends RenderResult {
  /** Access to history object for navigation testing */
  history?: {
    location: { pathname: string; search: string; hash: string };
    push: (path: string) => void;
    goBack: () => void;
  };
}

/**
 * Props for creating test wrapper components
 */
export interface TestWrapperProps {
  children: ReactElement;
  /** Additional context providers to wrap */
  providers?: React.ComponentType<{ children: React.ReactNode }>[];
}

// ============================================================================
// Async Testing Types
// ============================================================================

/**
 * Represents an async operation state for testing
 * Used across Service and Runtime layers
 */
export interface AsyncTestState<T, E = Error> {
  /** Current execution status */
  status: 'idle' | 'loading' | 'success' | 'error';
  /** Resolved data when successful */
  data: T | null;
  /** Error when failed */
  error: E | null;
  /** Whether the operation has been executed */
  hasExecuted: boolean;
}

/**
 * Options for controlling async test behavior
 */
export interface AsyncTestOptions {
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Whether to suppress unhandled rejection warnings */
  suppressWarnings?: boolean;
  /** Number of retry attempts */
  retries?: number;
  /** Delay between retries */
  retryDelayMs?: number;
}

/**
 * Type for async test assertions
 */
export type AsyncAssertion<T> = (
  getter: () => T | Promise<T>,
  expected: T,
  options?: AsyncTestOptions
) => Promise<void>;

// ============================================================================
// Error Testing Types
// ============================================================================

/**
 * Structured error information for test failures
 */
export interface TestErrorInfo {
  /** Error message */
  message: string;
  /** Error code or type */
  code: string;
  /** Severity classification */
  severity: TestFailureSeverity;
  /** Layer where error occurred (per six-layer architecture) */
  layer: 'Types' | 'Config' | 'Repo' | 'Service' | 'Runtime' | 'UI';
  /** Original error that caused this failure */
  cause?: Error;
  /** Additional context for debugging */
  context?: Record<string, unknown>;
  /** Stack trace (sanitized for test output) */
  stackTrace?: string;
}

/**
 * Expected error shape for error case testing
 */
export interface ExpectedError {
  /** Expected error type/class */
  type?: new (...args: unknown[]) => Error;
  /** Expected error message (string or regex) */
  message?: string | RegExp;
  /** Expected error code */
  code?: string;
  /** Custom validation function */
  validator?: (error: Error) => boolean;
}

// ============================================================================
// Test Lifecycle Types
// ============================================================================

/**
 * Hooks for test lifecycle management
 */
export interface TestLifecycleHooks {
  /** Setup before all tests in suite */
  beforeAll?: () => Promise<void> | void;
  /** Setup before each test */
  beforeEach?: () => Promise<void> | void;
  /** Cleanup after each test */
  afterEach?: () => Promise<void> | void;
  /** Cleanup after all tests in suite */
  afterAll?: () => Promise<void> | void;
}

/**
 * Configuration for test suite organization
 */
export interface TestSuiteConfig {
  /** Display name for the test suite */
  displayName: string;
  /** Whether tests run in isolation */
  isolated?: boolean;
  /** Timeout for tests in this suite */
  timeoutMs?: number;
  /** Lifecycle hooks */
  hooks?: TestLifecycleHooks;
  /** Tags for test categorization */
  tags?: string[];
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extracts the resolved type from a Promise
 */
export type ResolvedType<T> = T extends Promise<infer R> ? R : T;

/**
 * Makes all properties optional at any depth
 * Useful for partial test data
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Requires all properties to be defined
 * Useful for ensuring complete test fixtures
 */
export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P];
};

/**
 * Type guard for checking if value is a TestErrorInfo
 */
export function isTestErrorInfo(value: unknown): value is TestErrorInfo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    'code' in value &&
    'severity' in value &&
    'layer' in value
  );
}

/**
 * Type guard for checking test execution status
 */
export function isTerminalStatus(
  status: TestExecutionStatus
): status is
  | TestExecutionStatus.PASSED
  | TestExecutionStatus.FAILED
  | TestExecutionStatus.SKIPPED
  | TestExecutionStatus.TIMEOUT {
  return (
    status === TestExecutionStatus.PASSED ||
    status === TestExecutionStatus.FAILED ||
    status === TestExecutionStatus.SKIPPED ||
    status === TestExecutionStatus.TIMEOUT
  );
}