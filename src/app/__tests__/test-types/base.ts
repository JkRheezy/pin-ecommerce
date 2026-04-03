/**
 * @fileoverview Core test type definitions for the Harness Engineering testing framework.
 * This module defines the foundational types used across all test layers following
 * the six-layer architecture (Types → Config → Repo → Service → Runtime → UI).
 */

import { z } from 'zod';
import { Logger } from '../../logging/logger';

// ============================================================================
// Layer 1: Types - Core primitive type definitions
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
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * Schema for validating TestId format
 * Enforces UUID v4 format with test- prefix
 */
export const TestIdSchema = z
  .string()
  .regex(/^test-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  .transform((val): TestId => val as TestId)
  .brand('TestId');

/**
 * Schema for test metadata validation
 */
export const TestMetadataSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().max(1024).optional(),
  author: z.string().email(),
  createdAt: z.date(),
  updatedAt: z.date(),
  tags: z.array(z.string().min(1).max(64)).max(32),
  severity: z.nativeEnum(TestSeverity).default(TestSeverity.MEDIUM),
});

/**
 * Schema for test execution configuration
 */
export const TestExecutionConfigSchema = z.object({
  timeoutMs: z.number().int().positive().max(300000).default(30000),
  retries: z.number().int().nonnegative().max(5).default(0),
  parallel: z.boolean().default(false),
  dependencies: z.array(TestIdSchema).default([]),
  environment: z.record(z.string()).default({}),
});

// ============================================================================
// Layer 1: Types - Complex Type Definitions
// ============================================================================

/**
 * Test metadata information
 */
export type TestMetadata = z.infer<typeof TestMetadataSchema>;

/**
 * Test execution configuration
 */
export type TestExecutionConfig = z.infer<typeof TestExecutionConfigSchema>;

/**
 * Test error information with structured context
 */
export interface TestError {
  readonly code: string;
  readonly message: string;
  readonly stack?: string;
  readonly cause?: TestError;
  readonly context: Record<string, unknown>;
  readonly timestamp: Date;
}

/**
 * Test assertion result
 */
export interface TestAssertion {
  readonly name: string;
  readonly passed: boolean;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly message?: string;
  readonly durationMs: number;
}

/**
 * Complete test result information
 */
export interface TestResult {
  readonly id: TestId;
  readonly status: TestStatus;
  readonly metadata: TestMetadata;
  readonly config: TestExecutionConfig;
  readonly assertions: ReadonlyArray<TestAssertion>;
  readonly error?: TestError;
  readonly startedAt: Date;
  readonly completedAt?: Date;
  readonly durationMs?: number;
  readonly logs: ReadonlyArray<TestLogEntry>;
}

/**
 * Structured log entry for test execution
 */
export interface TestLogEntry {
  readonly timestamp: Date;
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly message: string;
  readonly context?: Record<string, unknown>;
}

// ============================================================================
// Error Handling - TestError Factory Functions
// ============================================================================

/**
 * Creates a standardized TestError with proper context
 * @param code - Error code for categorization
 * @param message - Human-readable error message
 * @param context - Additional contextual information
 * @param cause - Optional underlying cause error
 * @returns Structured TestError object
 */
export function createTestError(
  code: string,
  message: string,
  context: Record<string, unknown> = {},
  cause?: TestError
): TestError {
  return {
    code,
    message,
    context: {
      ...context,
      _errorVersion: '1.0',
    },
    cause,
    timestamp: new Date(),
  };
}

/**
 * Creates a TestError from an unknown caught value
 * Handles cases where the thrown value may not be an Error instance
 * @param error - Unknown error value from catch block
 * @param defaultCode - Error code to use if not extractable
 * @param context - Additional context to attach
 * @returns Properly structured TestError
 */
export function normalizeTestError(
  error: unknown,
  defaultCode: string = 'UNKNOWN_ERROR',
  context: Record<string, unknown> = {}
): TestError {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    // Already a TestError-like object
    return createTestError(
      String((error as TestError).code),
      String((error as TestError).message),
      { ...context, originalError: error },
      (error as TestError).cause
    );
  }

  if (error instanceof Error) {
    return createTestError(
      defaultCode,
      error.message,
      { ...context, originalStack: error.stack },
      undefined
    );
  }

  // Handle primitive thrown values (strings, numbers, etc.)
  return createTestError(
    defaultCode,
    `Unexpected error: ${String(error)}`,
    { ...context, originalErrorType: typeof error, originalError: error }
  );
}

// ============================================================================
// Utility Types for Test Framework
// ============================================================================

/**
 * Type for test fixture data with strict immutability
 */
export type TestFixture<T> = Readonly<{
  setup: () => Promise<T> | T;
  teardown: (fixture: T) => Promise<void> | void;
  validate?: (fixture: T) => boolean;
}>;

/**
 * Type for async test operations with cancellation support
 */
export interface CancellableOperation<T> {
  readonly promise: Promise<T>;
  readonly cancel: (reason?: string) => void;
  readonly isCancelled: () => boolean;
}

/**
 * Union type for all test entity types in the system
 */
export type TestEntity = TestMetadata | TestResult | TestError | TestAssertion;

/**
 * Type guard to check if a value is a valid TestId
 */
export function isTestId(value: unknown): value is TestId {
  return TestIdSchema.safeParse(value).success;
}

/**
 * Type guard to check if a value is a valid TestResult
 */
export function isTestResult(value: unknown): value is TestResult {
  if (!value || typeof value !== 'object') return false;
  
  const candidate = value as Partial<TestResult>;
  return (
    isTestId(candidate.id) &&
    Object.values(TestStatus).includes(candidate.status as TestStatus) &&
    candidate.metadata !== undefined &&
    candidate.assertions !== undefined &&
    Array.isArray(candidate.assertions)
  );
}

// ============================================================================
// Constants and Configuration
// ============================================================================

/**
 * Default test execution limits
 */
export const TEST_LIMITS = {
  MAX_TIMEOUT_MS: 300000,      // 5 minutes
  MAX_RETRIES: 5,
  MAX_TAGS: 32,
  MAX_TAG_LENGTH: 64,
  MAX_NAME_LENGTH: 256,
  MAX_DESCRIPTION_LENGTH: 1024,
  MAX_DEPENDENCIES: 100,
  MAX_LOG_ENTRIES: 10000,
} as const;

/**
 * Test status transition rules - defines valid status changes
 */
export const VALID_STATUS_TRANSITIONS: Readonly<Record<TestStatus, ReadonlyArray<TestStatus>>> = {
  [TestStatus.PENDING]: [TestStatus.RUNNING, TestStatus.SKIPPED],
  [TestStatus.RUNNING]: [TestStatus.PASSED, TestStatus.FAILED, TestStatus.TIMEOUT, TestStatus.ERROR],
  [TestStatus.PASSED]: [],
  [TestStatus.FAILED]: [],
  [TestStatus.SKIPPED]: [],
  [TestStatus.TIMEOUT]: [],
  [TestStatus.ERROR]: [],
} as const;

// ============================================================================
// Logger Integration
// ============================================================================

/**
 * Logger instance for test-types module
 * Uses structured logging instead of console.log per Harness standards
 */
const logger = Logger.getLogger('test-types');

/**
 * Logs test type operations with proper context
 */
export function logTestOperation(
  operation: string,
  testId: TestId | undefined,
  details: Record<string, unknown>
): void {
  logger.info({
    message: `Test operation: ${operation}`,
    testId: testId ?? 'unknown',
    operation,
    ...details,
  });
}