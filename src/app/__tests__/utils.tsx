/**
 * Test Utilities Module
 * 
 * Shared test helpers for the Harness-Engineering application.
 * Follows the six-layer architecture: Types → Config → Repo → Service → Runtime → UI
 * 
 * @module src/app/__tests__/utils
 */

import React, { ReactElement } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, Store } from '@reduxjs/toolkit';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';

// =============================================================================
// TYPES LAYER
// =============================================================================

/**
 * Configuration options for creating a test store
 */
interface TestStoreConfig {
  /** Initial state to hydrate the store with */
  initialState?: Record<string, unknown>;
  /** Reducers to include in the store */
  reducers?: Record<string, unknown>;
  /** Enable Redux DevTools in test environment */
  devTools?: boolean;
}

/**
 * Options for rendering a component with test providers
 */
interface TestRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Router configuration for MemoryRouter */
  routerProps?: MemoryRouterProps;
  /** Store configuration for Redux Provider */
  storeConfig?: TestStoreConfig;
  /** Custom wrapper component */
  wrapper?: React.ComponentType<{ children: React.ReactNode }>;
}

/**
 * Extended render result with additional test utilities
 */
interface TestRenderResult extends RenderResult {
  /** The Redux store instance used in this render */
  store: Store;
}

/**
 * Mock API response structure
 */
interface MockApiResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers?: Record<string, string>;
}

/**
 * Error types for test utilities
 */
enum TestUtilErrorCode {
  STORE_CREATION_FAILED = 'STORE_CREATION_FAILED',
  RENDER_FAILED = 'RENDER_FAILED',
  MOCK_API_ERROR = 'MOCK_API_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

/**
 * Custom error class for test utilities
 */
class TestUtilError extends Error {
  constructor(
    public readonly code: TestUtilErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TestUtilError';
    Object.setPrototypeOf(this, TestUtilError.prototype);
  }
}

// =============================================================================
// CONFIG LAYER
// =============================================================================

/**
 * Default test store configuration
 */
const DEFAULT_STORE_CONFIG: TestStoreConfig = {
  initialState: {},
  reducers: {},
  devTools: false,
};

/**
 * Default router configuration for tests
 */
const DEFAULT_ROUTER_PROPS: MemoryRouterProps = {
  initialEntries: ['/'],
  initialIndex: 0,
};

// =============================================================================
// SERVICE LAYER
// =============================================================================

/**
 * Creates a mock Redux store for testing
 * 
 * @param config - Store configuration options
 * @returns Configured Redux store instance
 * @throws {TestUtilError} When store creation fails
 */
function createTestStore(config: TestStoreConfig = {}): Store {
  const mergedConfig = { ...DEFAULT_STORE_CONFIG, ...config };
  
  try {
    // Validate reducers
    if (!mergedConfig.reducers || Object.keys(mergedConfig.reducers).length === 0) {
      // Use a dummy reducer if none provided to prevent Redux errors
      mergedConfig.reducers = {
        _test: (state = {}) => state,
      };
    }

    const store = configureStore({
      reducer: mergedConfig.reducers as Record<string, unknown>,
      preloadedState: mergedConfig.initialState,
      devTools: mergedConfig.devTools,
      // Disable middleware warnings in test environment
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
          immutableCheck: false,
        }),
    });

    return store;
  } catch (error) {
    throw new TestUtilError(
      TestUtilErrorCode.STORE_CREATION_FAILED,
      'Failed to create test store',
      error
    );
  }
}

/**
 * Creates a test wrapper component with all necessary providers
 * 
 * @param options - Test render options
 * @returns Wrapper component with providers
 */
function createTestWrapper(options: TestRenderOptions): React.FC<{ children: React.ReactNode }> {
  const { storeConfig, routerProps, wrapper: CustomWrapper } = options;
  
  // Create store if Redux is needed
  const store = storeConfig ? createTestStore(storeConfig) : null;
  
  const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    let wrappedChildren = children;

    // Apply router wrapper
    wrappedChildren = (
      <MemoryRouter {...(routerProps || DEFAULT_ROUTER_PROPS)}>
        {wrappedChildren}
      </MemoryRouter>
    );

    // Apply Redux wrapper if store exists
    if (store) {
      wrappedChildren = <Provider store={store}>{wrappedChildren}</Provider>;
    }

    // Apply custom wrapper if provided
    if (CustomWrapper) {
      wrappedChildren = <CustomWrapper>{wrappedChildren}</CustomWrapper>;
    }

    return <>{wrappedChildren}</>;
  };

  // Attach store to wrapper for access in return value
  (TestWrapper as unknown as { store: Store }).store = store as Store;
  
  return TestWrapper;
}

// =============================================================================
// RUNTIME LAYER
// =============================================================================

/**
 * Renders a React component with test providers
 * 
 * This utility wraps components with necessary providers (Redux, Router)
 * and returns enhanced render result with store access.
 * 
 * @param ui - React element to render
 * @param options - Test render options
 * @returns Extended render result with store reference
 * @throws {TestUtilError} When rendering fails
 * 
 * @example
 *