/**
 * Test Helpers Module
 * 
 * Provides general utility functions for testing across the application.
 * Follows the six-layer architecture: Types → Config → Repo → Service → Runtime → UI
 * 
 * @module test-helpers
 */

import React, { ReactElement } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { configureStore, EnhancedStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';

// ============================================================================
// TYPES LAYER
// ============================================================================

/**
 * Configuration options for creating a test Redux store
 */
export interface TestStoreConfig {
  /** Initial state for the store */
  initialState?: Record<string, unknown>;
  /** Reducers to include in the store */
  reducers?: Record<string, unknown>;
  /** Enable Redux DevTools in test environment */
  devTools?: boolean;
}

/**
 * Options for rendering a component with test providers
 */
export interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Route configuration for MemoryRouter */
  routerProps?: MemoryRouterProps;
  /** Redux store configuration */
  storeConfig?: TestStoreConfig;
  /** Pre-configured store instance */
  store?: EnhancedStore;
}

/**
 * Extended render result with additional test utilities
 */
export interface CustomRenderResult extends RenderResult {
  /** The Redux store instance used in the render */
  store: EnhancedStore;
}

/**
 * Mock API response structure
 */
export interface MockApiResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

/**
 * Options for creating mock API responses
 */
export interface MockApiOptions {
  /** Delay in milliseconds before resolving */
  delay?: number;
  /** Whether the request should fail */
  shouldFail?: boolean;
  /** Error message for failed requests */
  errorMessage?: string;
  /** HTTP status code for the response */
  statusCode?: number;
}

// ============================================================================
// CONFIG LAYER
// ============================================================================

const DEFAULT_MOCK_DELAY = 0;
const DEFAULT_MOCK_STATUS = 200;

// ============================================================================
// SERVICE LAYER - Test Store Factory
// ============================================================================

/**
 * Creates a test Redux store with optional preloaded state and reducers.
 * 
 * @param config - Configuration for the test store
 * @returns Configured Redux store for testing
 * @throws Error if store creation fails
 */
export function createTestStore(config: TestStoreConfig = {}): EnhancedStore {
  const { initialState = {}, reducers = {}, devTools = false } = config;

  try {
    // Create a minimal root reducer if none provided
    const rootReducer = Object.keys(reducers).length > 0
      ? reducers
      : { _test: (state = {}) => state };

    const store = configureStore({
      reducer: rootReducer,
      preloadedState: initialState,
      devTools,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
          immutableCheck: false,
        }),
    });

    return store;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to create test store: ${errorMessage}`);
  }
}

// ============================================================================
// SERVICE LAYER - Mock API Factory
// ============================================================================

/**
 * Creates a mock API response with configurable delay and error handling.
 * 
 * @param data - The data to return in the response
 * @param options - Configuration options for the mock response
 * @returns Promise that resolves to a mock API response
 */
export function createMockApiResponse<T>(
  data: T,
  options: MockApiOptions = {}
): Promise<MockApiResponse<T>> {
  const {
    delay = DEFAULT_MOCK_DELAY,
    shouldFail = false,
    errorMessage = 'Mock API Error',
    statusCode = DEFAULT_MOCK_STATUS,
  } = options;

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldFail) {
        reject(new Error(errorMessage));
        return;
      }

      resolve({
        data,
        status: statusCode,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      });
    }, delay);
  });
}

/**
 * Creates a mock API error response.
 * 
 * @param message - Error message
 * @param statusCode - HTTP status code
 * @returns Promise that rejects with an error
 */
export function createMockApiError(
  message: string = 'Internal Server Error',
  statusCode: number = 500
): Promise<never> {
  const error = new Error(message);
  (error as Error & { statusCode: number }).statusCode = statusCode;
  return Promise.reject(error);
}

// ============================================================================
// RUNTIME LAYER - Custom Render
// ============================================================================

/**
 * Creates a test wrapper component with all necessary providers.
 * 
 * @param options - Configuration for the wrapper
 * @returns Wrapper component with providers
 */
function createTestWrapper(options: CustomRenderOptions = {}) {
  const {
    routerProps = { initialEntries: ['/'] },
    storeConfig,
    store: providedStore,
  } = options;

  // Use provided store or create a new one
  const store = providedStore ?? createTestStore(storeConfig);

  return function TestWrapper({ children }: { children: React.ReactNode }): ReactElement {
    return (
      <Provider store={store}>
        <MemoryRouter {...routerProps}>
          {children}
        </MemoryRouter>
      </Provider>
    );
  };
}

/**
 * Renders a component with all necessary test providers (Redux, Router).
 * 
 * @param ui - The component to render
 * @param options - Render options including store and router configuration
 * @returns Render result with additional store reference
 * @throws Error if rendering fails
 */
export function renderWithProviders(
  ui: ReactElement,
  options: CustomRenderOptions = {}
): CustomRenderResult {
  try {
    const { store: providedStore, storeConfig, ...renderOptions } = options;
    
    // Determine which store to use
    const store = providedStore ?? createTestStore(storeConfig);
    
    // Create wrapper with the determined store
    const Wrapper = createTestWrapper({ ...options, store });

    const renderResult = render(ui, {
      wrapper: Wrapper,
      ...renderOptions,
    });

    return {
      ...renderResult,
      store,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to render with providers: ${errorMessage}`);
  }
}

// ============================================================================
// RUNTIME LAYER - Async Test Helpers
// ============================================================================

/**
 * Waits for a specified duration. Useful for testing debounced operations.
 * 
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after the delay
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Advances timers and flushes pending promises. Useful for testing async operations.
 * 
 * @returns Promise that resolves when all pending operations complete
 */
export async function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Creates a controlled promise for testing async states.
 * 
 * @returns Object with promise and control functions
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

  // Non-null assertion is safe here as the promise executor runs synchronously
  return {
    promise,
    resolve: resolveFn!,
    reject: rejectFn!,
  };
}

// ============================================================================
// RUNTIME LAYER - Form Test Helpers
// ============================================================================

/**
 * Generates mock form data for testing form components.
 * 
 * @param overrides - Values to override in the default mock data
 * @returns Mock form data object
 */
export function createMockFormData<T extends Record<string, unknown>>(
  defaults: T,
  overrides: Partial<T> = {}
): T {
  return {
    ...defaults,
    ...overrides,
  };
}

/**
 * Simulates user typing into an input field with proper events.
 * 
 * @param element - The input element to type into
 * @param value - The value to type
 */
export function simulateTyping(element: HTMLElement, value: string): void {
  // Focus the element first
  element.focus();
  
  // Clear existing value if any
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = '';
  }

  // Simulate typing each character
  for (const char of value) {
    const keyDownEvent = new KeyboardEvent('keydown', {
      key: char,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(keyDownEvent);

    const keyPressEvent = new KeyboardEvent('keypress', {
      key: char,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(keyPressEvent);

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value += char;
    }

    const inputEvent = new Event('input', {
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(inputEvent);

    const keyUpEvent = new KeyboardEvent('keyup', {
      key: char,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(keyUpEvent);
  }

  // Final change event
  const changeEvent = new Event('change', {
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(changeEvent);
}

// ============================================================================
// RUNTIME LAYER - Mock Data Generators
// ============================================================================

/**
 * Generates a unique identifier for test data.
 * 
 * @param prefix - Optional prefix for the identifier
 * @returns Unique string identifier
 */
export function generateTestId(prefix: string = 'test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Creates a mock date string in ISO format.
 * 
 * @param daysOffset - Number of days from now (negative for past, positive for future)
 * @returns ISO date string
 */
export function createMockDate(daysOffset: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString();
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Safely extracts an error message from an unknown error value.
 * 
 * @param error - The error value to extract message from
 * @returns Human-readable error message
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'An unknown error occurred';
}

/**
 * Asserts that a function throws an error with specific properties.
 * 
 * @param fn - Function expected to throw
 * @param expectedMessage - Expected error message (optional)
 * @throws Error if the function does not throw as expected
 */
export async function expectToThrow(
  fn: () => unknown | Promise<unknown>,
  expectedMessage?: string | RegExp
): Promise<void> {
  let thrown = false;
  let actualError: unknown;

  try {
    await fn();
  } catch (error) {
    thrown = true;
    actualError = error;
  }

  if (!thrown) {
    throw new Error('Expected function to throw, but it did not');
  }

  if (expectedMessage !== undefined) {
    const actualMessage = extractErrorMessage(actualError);
    
    if (expectedMessage instanceof RegExp) {
      if (!expectedMessage.test(actualMessage)) {
        throw new Error(
          `Expected error message to match ${expectedMessage.toString()}, but got: "${actualMessage}"`
        );
      }
    } else if (actualMessage !== expectedMessage) {
      throw new Error(
        `Expected error message "${expectedMessage}", but got: "${actualMessage}"`
      );
    }
  }
}

// ============================================================================
// EXPORT DEFAULTS
// ============================================================================

// Re-export testing library utilities for convenience
export { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
export { userEvent } from '@testing-library/user-event';