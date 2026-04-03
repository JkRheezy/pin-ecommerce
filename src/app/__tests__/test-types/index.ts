/**
 * Test Types Module
 * 
 * This module serves as the central export point for all test-related types
 * following the six-layer architecture pattern.
 * 
 * Layer: Types (Layer 1)
 * Purpose: Define type contracts for test infrastructure
 */

// =============================================================================
// Base Test Types
// =============================================================================

/**
 * Represents the lifecycle state of a test execution
 */
export enum TestExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
  TIMEOUT = 'TIMEOUT',
  ERROR = 'ERROR',
}

/**
 * Severity levels for test categorization
 */
export enum TestSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/**
 * Categories for test organization
 */
export enum TestCategory {
  UNIT = 'UNIT',
  INTEGRATION = 'INTEGRATION',
  E2E = 'E2E',
  CONTRACT = 'CONTRACT',
  PERFORMANCE = 'PERFORMANCE',
  SECURITY = 'SECURITY',
  ACCESSIBILITY = 'ACCESSIBILITY',
}

// =============================================================================
// Core Test Interfaces
// =============================================================================

/**
 * Unique identifier for test entities
 */
export type TestId = string & { readonly __brand: 'TestId' };

/**
 * Base interface for all test entities
 */
export interface TestEntity {
  readonly id: TestId;
  readonly name: string;
  readonly description?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Represents a single test case definition
 */
export interface TestCase extends TestEntity {
  readonly category: TestCategory;
  readonly severity: TestSeverity;
  readonly tags: ReadonlyArray<string>;
  readonly timeoutMs: number;
  readonly retries: number;
  readonly dependencies: ReadonlyArray<TestId>;
}

/**
 * Configuration for test execution environment
 */
export interface TestEnvironmentConfig {
  readonly nodeEnv: 'test' | 'development' | 'production';
  readonly mockExternalServices: boolean;
  readonly databaseUrl?: string;
  readonly redisUrl?: string;
  readonly featureFlags: Readonly<Record<string, boolean>>;
}

/**
 * Result of a single test execution
 */
export interface TestResult {
  readonly testId: TestId;
  readonly status: TestExecutionStatus;
  readonly durationMs: number;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly error?: TestError;
  readonly logs: ReadonlyArray<TestLogEntry>;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * Structured error information for test failures
 */
export interface TestError {
  readonly message: string;
  readonly stack?: string;
  readonly code?: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly context?: Readonly<Record<string, unknown>>;
}

/**
 * Individual log entry from test execution
 */
export interface TestLogEntry {
  readonly timestamp: Date;
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly message: string;
  readonly source?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

// =============================================================================
// Test Suite Types
// =============================================================================

/**
 * Collection of related test cases
 */
export interface TestSuite extends TestEntity {
  readonly testCases: ReadonlyArray<TestCase>;
  readonly beforeAll?: TestHook;
  readonly afterAll?: TestHook;
  readonly beforeEach?: TestHook;
  readonly afterEach?: TestHook;
  readonly parallel: boolean;
  readonly maxConcurrency: number;
}

/**
 * Lifecycle hook for test setup/teardown
 */
export interface TestHook {
  readonly name: string;
  readonly timeoutMs: number;
  readonly fn: () => Promise<void> | void;
}

// =============================================================================
// Test Runner Types
// =============================================================================

/**
 * Configuration for test runner execution
 */
export interface TestRunnerConfig {
  readonly suite: TestSuite;
  readonly environment: TestEnvironmentConfig;
  readonly reporters: ReadonlyArray<TestReporter>;
  readonly filters: TestFilter;
  readonly failFast: boolean;
  readonly shuffle: boolean;
  readonly seed?: number;
}

/**
 * Filter criteria for test selection
 */
export interface TestFilter {
  readonly includeTags?: ReadonlyArray<string>;
  readonly excludeTags?: ReadonlyArray<string>;
  readonly includeCategories?: ReadonlyArray<TestCategory>;
  readonly excludeCategories?: ReadonlyArray<TestCategory>;
  readonly includeSeverities?: ReadonlyArray<TestSeverity>;
  readonly testNamePattern?: RegExp;
}

/**
 * Interface for test result reporters
 */
export interface TestReporter {
  readonly name: string;
  onRunStart(runInfo: TestRunInfo): Promise<void> | void;
  onTestStart(testCase: TestCase): Promise<void> | void;
  onTestComplete(result: TestResult): Promise<void> | void;
  onRunComplete(summary: TestRunSummary): Promise<void> | void;
}

/**
 * Information about a test run
 */
export interface TestRunInfo {
  readonly runId: string;
  readonly startedAt: Date;
  readonly totalTests: number;
  readonly config: TestRunnerConfig;
}

/**
 * Summary statistics for completed test run
 */
export interface TestRunSummary {
  readonly runId: string;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly totalDurationMs: number;
  readonly results: ReadonlyArray<TestResult>;
  readonly stats: TestRunStats;
}

/**
 * Statistical breakdown of test results
 */
export interface TestRunStats {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly pending: number;
  readonly successRate: number;
  readonly averageDurationMs: number;
  readonly slowestTest?: TestResult;
  readonly fastestTest?: TestResult;
}

// =============================================================================
// Mock and Stub Types
// =============================================================================

/**
 * Type for creating mock functions with proper typing
 */
export type MockFunction<T extends (...args: unknown[]) => unknown> = jest.Mock<
  ReturnType<T>,
  Parameters<T>
>;

/**
 * Configuration for mock service creation
 */
export interface MockServiceConfig<T> {
  readonly name: string;
  readonly methods: ReadonlyArray<keyof T>;
  readonly defaultValues?: Partial<Record<keyof T, unknown>>;
  readonly throwOnUnmocked?: boolean;
}

/**
 * Factory for creating type-safe test fixtures
 */
export interface FixtureFactory<T> {
  readonly name: string;
  create(overrides?: Partial<T>): T;
  createMany(count: number, overrides?: Partial<T>): ReadonlyArray<T>;
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Makes all properties optional at any depth
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extracts the resolved type from a Promise
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Type guard for validating test results
 */
export function isTestResult(value: unknown): value is TestResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'testId' in value &&
    'status' in value &&
    'durationMs' in value &&
    Object.values(TestExecutionStatus).includes(
      (value as TestResult).status as TestExecutionStatus
    )
  );
}

/**
 * Type guard for test error validation
 */
export function isTestError(value: unknown): value is TestError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as TestError).message === 'string'
  );
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Creates a type-safe TestId
 */
export function createTestId(id: string): TestId {
  if (!id || typeof id !== 'string') {
    throw new Error('TestId must be a non-empty string');
  }
  return id as TestId;
}

/**
 * Creates a default test environment configuration
 */
export function createDefaultTestEnvironment(): TestEnvironmentConfig {
  return {
    nodeEnv: 'test',
    mockExternalServices: true,
    featureFlags: {},
  };
}

/**
 * Creates an empty test result for initialization
 */
export function createEmptyTestResult(testId: TestId): TestResult {
  const now = new Date();
  return {
    testId,
    status: TestExecutionStatus.PENDING,
    durationMs: 0,
    startedAt: now,
    completedAt: now,
    logs: [],
    metadata: {},
  };
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Base error class for test-related errors
 */
export class TestErrorException extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TestErrorException';
    Object.setPrototypeOf(this, TestErrorException.prototype);
  }

  toJSON(): TestError {
    return {
      message: this.message,
      code: this.code,
      stack: this.stack,
      context: this.context,
    };
  }
}

/**
 * Error thrown when test configuration is invalid
 */
export class TestConfigurationError extends TestErrorException {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TEST_CONFIG_ERROR', context);
    this.name = 'TestConfigurationError';
    Object.setPrototypeOf(this, TestConfigurationError.prototype);
  }
}

/**
 * Error thrown when test execution fails
 */
export class TestExecutionError extends TestErrorException {
  constructor(
    message: string,
    public readonly testId: TestId,
    context?: Record<string, unknown>
  ) {
    super(message, 'TEST_EXECUTION_ERROR', context);
    this.name = 'TestExecutionError';
    Object.setPrototypeOf(this, TestExecutionError.prototype);
  }
}

// =============================================================================
// Constants
// =============================================================================

export const TEST_CONSTANTS = {
  DEFAULT_TIMEOUT_MS: 5000,
  MAX_RETRIES: 3,
  MAX_CONCURRENCY: 10,
  SLOW_TEST_THRESHOLD_MS: 1000,
} as const;

// =============================================================================
// Re-exports (if this module grows, sub-modules can be created)
// =============================================================================

// Future exports can be organized as:
// export * from './matchers';
// export * from './fixtures';
// export * from './utils';