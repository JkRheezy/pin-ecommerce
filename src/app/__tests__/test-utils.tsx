/**
 * Test Utilities Barrel File
 * 
 * Re-exports all testing utilities from their respective modules.
 * This maintains a clean API surface while allowing modular organization.
 * 
 * @module test-utils
 * @layer Runtime
 */

// ============================================================================
// Types Layer Exports
// ============================================================================

export type {
  TestContext,
  TestFixtures,
  MockResponse,
  MockService,
  RenderOptions,
  UserEventInstance,
} from './test-utils/types';

// ============================================================================
// Config Layer Exports
// ============================================================================

export {
  TEST_TIMEOUTS,
  MOCK_DEFAULTS,
  API_BASE_URLS,
  FIXTURE_PATHS,
} from './test-utils/config';

// ============================================================================
// Repo Layer Exports
// ============================================================================

export {
  createMockRepository,
  createMockStore,
  createMockQueryClient,
  resetMockRepositories,
} from './test-utils/repo';

// ============================================================================
// Service Layer Exports
// ============================================================================

export {
  mockApiService,
  mockAuthService,
  mockFeatureFlagService,
  createMockServiceResponse,
  createMockServiceError,
} from './test-utils/service';

// ============================================================================
// Runtime Layer Exports
// ============================================================================

export {
  // Component rendering
  renderWithProviders,
  renderHookWithProviders,
  
  // User interactions
  createUserEvent,
  
  // Test setup/teardown
  setupTestEnvironment,
  cleanupTestEnvironment,
  
  // Wait utilities
  waitForLoadingToFinish,
  waitForApiCall,
  
  // Assertion helpers
  expectToHaveBeenCalledWith,
  expectToHaveBeenCalledOnce,
} from './test-utils/runtime';

// ============================================================================
// UI Layer Exports
// ============================================================================

export {
  // Mock UI components
  MockRouter,
  MockThemeProvider,
  MockToastProvider,
  
  // UI test helpers
  getByTestIdSafe,
  queryAllByRoleSafe,
  fillFormFields,
  clickAndConfirm,
} from './test-utils/ui';

// ============================================================================
// Error Handling Utilities
// ============================================================================

export {
  suppressExpectedErrors,
  captureConsoleErrors,
  assertErrorLogged,
} from './test-utils/error-handling';

// ============================================================================
// Validation Utilities
// ============================================================================

export {
  validateTestSetup,
  validateMockData,
  validateRenderResult,
} from './test-utils/validation';