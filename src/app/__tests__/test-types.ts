/**
 * Test Types Layer
 * 
 * This file contains all TypeScript types, interfaces, and type utilities
 * for the test infrastructure. Following the six-layer architecture,
 * this is the foundational Types layer with no external dependencies.
 */

import { z } from 'zod';

// ============================================================================
// Base Type Definitions
// ============================================================================

/**
 * Unique identifier for test entities
 */
export type TestId = string & { readonly __brand: 'TestId' };

/**
 * Test execution status states
 */
export enum TestStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
  TIMEOUT = 'TIMEOUT',
  ERROR = 'ERROR',
}

/**
 * Severity levels for test failures
 */
export enum TestSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  INFO = 'INFO',
}

// ============================================================================
// Core Test Interfaces
// ============================================================================

/**
 * Base interface for all test entities
 */
export interface TestEntity {
  readonly id: TestId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Test case definition
 */
export interface TestCase extends TestEntity {
  readonly name: string;
  readonly description: string;
  readonly tags: ReadonlyArray<string>;
  readonly timeoutMs: number;
  readonly retries: number;
  readonly dependencies: ReadonlyArray<TestId>;
}

/**
 * Test suite containing multiple test cases
 */
export interface TestSuite extends TestEntity {
  readonly name: string;
  readonly description: string;
  readonly testCases: ReadonlyArray<TestCase>;
  readonly setupHook?: TestHook;
  readonly teardownHook?: TestHook;
  readonly parallel: boolean;
  readonly maxConcurrency: number;
}

/**
 * Test execution result
 */
export interface TestResult extends TestEntity {
  readonly testCaseId: TestId;
  readonly status: TestStatus;
  readonly durationMs: number;
  readonly error?: TestError;
  readonly logs: ReadonlyArray<TestLogEntry>;
  readonly metadata: TestResultMetadata;
}

/**
 * Test execution context
 */
export interface TestContext {
  readonly suiteId: TestId;
  readonly caseId: TestId;
  readonly runId: TestRunId;
  readonly environment: TestEnvironment;
  readonly variables: ReadonlyMap<string, unknown>;
}

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * Test hook function signature
 */
export type TestHook = (context: TestContext) => Promise<void> | void;

/**
 * Test function signature
 */
export type TestFunction = (context: TestContext) => Promise<void> | void;

/**
 * Unique identifier for test runs
 */
export type TestRunId = string & { readonly __brand: 'TestRunId' };

/**
 * Test environment configuration
 */
export interface TestEnvironment {
  readonly name: string;
  readonly url: string;
  readonly credentials?: TestCredentials;
  readonly headers?: ReadonlyRecord<string, string>;
}

/**
 * Test credentials
 */
export interface TestCredentials {
  readonly username: string;
  readonly password: string; // In production, use secure credential management
  readonly apiKey?: string;
}

/**
 * Test error details
 */
export interface TestError {
  readonly message: string;
  readonly stack?: string;
  readonly code: string;
  readonly severity: TestSeverity;
  readonly timestamp: Date;
  readonly context?: Record<string, unknown>;
}

/**
 * Test log entry
 */
export interface TestLogEntry {
  readonly timestamp: Date;
  readonly level: LogLevel;
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Log levels for test output
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Test result metadata
 */
export interface TestResultMetadata {
  readonly browser?: string;
  readonly os?: string;
  readonly nodeVersion?: string;
  readonly customFields: ReadonlyRecord<string, unknown>;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Immutable record type
 */
export type ReadonlyRecord<K extends string | number | symbol, V> = Readonly<Record<K, V>>;

/**
 * Nullable type helper
 */
export type Nullable<T> = T | null;

/**
 * Optional type helper
 */
export type Optional<T> = T | undefined;

/**
 * Deep readonly type
 */
export type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

/**
 * Async function type
 */
export type AsyncFunction<TArgs extends unknown[] = [], TReturn = void> = (
  ...args: TArgs
) => Promise<TReturn>;

/**
 * Test matcher result
 */
export interface MatcherResult {
  readonly pass: boolean;
  readonly message: () => string;
  readonly actual: unknown;
  readonly expected: unknown;
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * Schema for validating test IDs
 */
export const TestIdSchema = z.string().min(1).max(256).brand<'TestId'>();

/**
 * Schema for test status enum validation
 */
export const TestStatusSchema = z.nativeEnum(TestStatus);

/**
 * Schema for test case validation
 */
export const TestCaseSchema = z.object({
  id: TestIdSchema,
  name: z.string().min(1).max(256),
  description: z.string().max(2000),
  tags: z.array(z.string()),
  timeoutMs: z.number().int().positive().default(30000),
  retries: z.number().int().nonnegative().default(0),
  dependencies: z.array(TestIdSchema).default([]),
  createdAt: z.date(),
  updatedAt: z.date(),
}) satisfies z.ZodType<TestCase>;

/**
 * Schema for test result validation
 */
export const TestResultSchema = z.object({
  id: TestIdSchema,
  testCaseId: TestIdSchema,
  status: TestStatusSchema,
  durationMs: z.number().int().nonnegative(),
  error: z
    .object({
      message: z.string(),
      stack: z.string().optional(),
      code: z.string(),
      severity: z.nativeEnum(TestSeverity),
      timestamp: z.date(),
      context: z.record(z.unknown()).optional(),
    })
    .optional(),
  logs: z.array(
    z.object({
      timestamp: z.date(),
      level: z.nativeEnum(LogLevel),
      message: z.string(),
      metadata: z.record(z.unknown()).optional(),
    })
  ),
  metadata: z.object({
    browser: z.string().optional(),
    os: z.string().optional(),
    nodeVersion: z.string().optional(),
    customFields: z.record(z.unknown()).default({}),
  }),
  createdAt: z.date(),
  updatedAt: z.date(),
}) satisfies z.ZodType<TestResult>;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if value is a valid TestId
 */
export function isTestId(value: unknown): value is TestId {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

/**
 * Type guard to check if value is a valid TestStatus
 */
export function isTestStatus(value: unknown): value is TestStatus {
  return Object.values(TestStatus).includes(value as TestStatus);
}

/**
 * Type guard to check if value is a valid TestError
 */
export function isTestError(value: unknown): value is TestError {
  if (typeof value !== 'object' || value === null) return false;
  const err = value as Partial<TestError>;
  return (
    typeof err.message === 'string' &&
    typeof err.code === 'string' &&
    isTestSeverity(err.severity) &&
    err.timestamp instanceof Date
  );
}

/**
 * Type guard to check if value is a valid TestSeverity
 */
export function isTestSeverity(value: unknown): value is TestSeverity {
  return Object.values(TestSeverity).includes(value as TestSeverity);
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base error class for test-related errors
 */
export class TestErrorClass extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly severity: TestSeverity = TestSeverity.HIGH,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TestError';
    Object.setPrototypeOf(this, TestErrorClass.prototype);
  }

  toJSON(): TestError {
    return {
      message: this.message,
      stack: this.stack,
      code: this.code,
      severity: this.severity,
      timestamp: new Date(),
      context: this.context,
    };
  }
}

/**
 * Validation error for test configuration issues
 */
export class TestValidationError extends TestErrorClass {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TEST_VALIDATION_ERROR', TestSeverity.CRITICAL, context);
    this.name = 'TestValidationError';
  }
}

/**
 * Execution error for test runtime failures
 */
export class TestExecutionError extends TestErrorClass {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TEST_EXECUTION_ERROR', TestSeverity.HIGH, context);
    this.name = 'TestExecutionError';
  }
}

/**
 * Timeout error for test timeout scenarios
 */
export class TestTimeoutError extends TestErrorClass {
  constructor(timeoutMs: number, context?: Record<string, unknown>) {
    super(
      `Test timed out after ${timeoutMs}ms`,
      'TEST_TIMEOUT_ERROR',
      TestSeverity.HIGH,
      { ...context, timeoutMs }
    );
    this.name = 'TestTimeoutError';
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a branded TestId from a string
 * @throws {TestValidationError} if the id is invalid
 */
export function createTestId(id: string): TestId {
  const result = TestIdSchema.safeParse(id);
  if (!result.success) {
    throw new TestValidationError('Invalid test ID', { id, errors: result.error.errors });
  }
  return result.data as TestId;
}

/**
 * Creates a new TestRunId
 */
export function createTestRunId(): TestRunId {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}` as TestRunId;
}

/**
 * Creates a test log entry
 */
export function createTestLogEntry(
  level: LogLevel,
  message: string,
  metadata?: Record<string, unknown>
): TestLogEntry {
  return Object.freeze({
    timestamp: new Date(),
    level,
    message,
    metadata,
  });
}

// ============================================================================
// Constants
// ============================================================================

export const TEST_CONSTANTS = {
  DEFAULT_TIMEOUT_MS: 30000,
  MAX_TIMEOUT_MS: 300000,
  DEFAULT_RETRIES: 0,
  MAX_RETRIES: 5,
  MAX_CONCURRENCY: 10,
  MAX_TEST_NAME_LENGTH: 256,
  MAX_DESCRIPTION_LENGTH: 2000,
} as const;

// ============================================================================
// Type Utilities for Generic Testing
// ============================================================================

/**
 * Extracts the resolved type from a Promise
 */
export type Awaited<T> = T extends Promise<infer R> ? R : T;

/**
 * Extracts array element type
 */
export type ElementType<T extends readonly unknown[]> = T extends readonly (infer E)[] ? E : never;

/**
 * Makes specific properties required
 */
export type RequiredProps<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Makes specific properties optional
 */
export type OptionalProps<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Event handler type for test events
 */
export type TestEventHandler<TEvent = unknown> = (event: TEvent) => void | Promise<void>;

/**
 * Test event map for type-safe event handling
 */
export interface TestEventMap {
  'test:start': { testCaseId: TestId; timestamp: Date };
  'test:end': { testCaseId: TestId; result: TestResult; timestamp: Date };
  'test:error': { testCaseId: TestId; error: TestError; timestamp: Date };
  'suite:start': { suiteId: TestId; timestamp: Date };
  'suite:end': { suiteId: TestId; results: ReadonlyArray<TestResult>; timestamp: Date };
}

/**
 * Type-safe event name
 */
export type TestEventName = keyof TestEventMap;

/**
 * Type-safe event payload
 */
export type TestEventPayload<T extends TestEventName> = TestEventMap[T];