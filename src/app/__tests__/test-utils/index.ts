/**
 * Test Utilities Index Module
 * 
 * Re-exports all test utilities from submodules following the six-layer architecture.
 * This module serves as the single entry point for all testing utilities in the application.
 * 
 * Layer: Service (Test Infrastructure)
 */

// Types Layer - Test type definitions
export type {
  MockResponse,
  MockRequest,
  TestContext,
  TestFixture,
  MockServiceConfig,
} from './types';

// Config Layer - Test configuration utilities
export {
  getTestConfig,
  setTestEnvironment,
  TEST_DEFAULTS,
} from './config';

// Repo Layer - Mock data and repositories
export {
  createMockRepository,
  seedTestData,
  clearTestData,
  MockRepositoryFactory,
} from './repository';

// Service Layer - Mock services and handlers
export {
  createMockService,
  mockHarnessAPI,
  mockAuthService,
  ServiceMockBuilder,
} from './service';

// Runtime Layer - Test environment setup
export {
  setupTestEnvironment,
  teardownTestEnvironment,
  createTestServer,
  TestEnvironment,
} from './runtime';

// UI Layer - Component testing utilities
export {
  renderWithProviders,
  createMockStore,
  userEventSetup,
  screenQueries,
} from './ui';

// Re-export commonly used testing libraries for convenience
export { 
  render, 
  screen, 
  waitFor,
  within,
} from '@testing-library/react';

export { 
  userEvent 
} from '@testing-library/user-event';

export {
  http,
  HttpResponse,
  delay,
} from 'msw';

// Error handling utilities
export {
  createTestError,
  assertErrorThrown,
  expectAsyncError,
  TestErrorBoundary,
} from './error-handling';

/**
 * Initialize all test utilities for a test suite.
 * This should be called in your test setup file.
 * 
 * @throws {TestInitializationError} If initialization fails
 */
export async function initializeTestUtils(): Promise<void> {
  try {
    const { setupTestEnvironment } = await import('./runtime');
    await setupTestEnvironment();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new TestInitializationError(`Failed to initialize test utilities: ${errorMessage}`);
  }
}

/**
 * Custom error class for test initialization failures
 */
export class TestInitializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestInitializationError';
    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TestInitializationError);
    }
  }
}