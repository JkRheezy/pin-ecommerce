/**
 * @fileoverview Barrel export for __tests__ directory
 * Centralizes test utilities, mocks, and fixtures for clean imports across the test suite
 * @module app/__tests__
 */

// Types Layer - Test type definitions
export type { TestContext, MockConfig, TestFixture } from './types';

// Config Layer - Test configuration and setup
export { testConfig, getTestEnvironment } from './config';

// Repo Layer - Mock data and fixtures
export { mockRepositories, createMockRepo } from './mocks/repositories';
export { defaultFixtures, loadFixture } from './fixtures';

// Service Layer - Mock services and utilities
export { mockServices, createMockService } from './mocks/services';
export { testLogger, createTestLogger } from './utils/logger';

// Runtime Layer - Test runtime utilities
export { setupTestEnvironment, teardownTestEnvironment } from './utils/setup';
export { createTestServer, TestServer } from './utils/server';

// UI Layer - Component testing utilities (if applicable)
export { renderWithProviders, screen, waitFor } from './utils/testing-library';

// Re-export common testing utilities
export { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';