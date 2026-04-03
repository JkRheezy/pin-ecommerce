/**
 * Test Utilities Module
 * 
 * Shared test helpers and utilities following the six-layer architecture.
 * Layer: Runtime (test runtime utilities)
 */

import React, { ReactElement } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, EnhancedStore } from '@reduxjs/toolkit';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';

// Types Layer: Test-specific type definitions
// ===========================================

/**
 * Configuration for creating a mock store in tests
 */
export interface MockStoreConfig {
  /** Initial state slices to merge into default state */
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
  /** Store configuration for Redux provider */
  storeConfig?: MockStoreConfig;
  /** Router configuration for MemoryRouter */
  routerConfig?: MemoryRouterProps;
  /** Additional wrapper components */
  wrappers?: React.ComponentType<{ children: React.ReactNode }>[];
}

/**
 * Extended render result with store reference
 */
export interface CustomRenderResult extends RenderResult {
  /** Reference to the Redux store instance */
  store: EnhancedStore;
}

/**
 * Mock API response structure
 */
export interface MockApiResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers?: Record<string, string>;
}

/**
 * Error types for test utilities
 */
export class TestUtilityError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'TestUtilityError';
    Object.setPrototypeOf(this, TestUtilityError.prototype);
  }
}

// Config Layer: Default configurations
// ====================================

const DEFAULT_MOCK_STORE_CONFIG: MockStoreConfig = {
  initialState: {},
  reducers: {},
  devTools: false,
};

const DEFAULT_ROUTER_CONFIG: MemoryRouterProps = {
  initialEntries: ['/'],
};

// Service Layer: Core test utility functions
// ==========================================

/**
 * Creates a mock Redux store for testing
 * 
 * @param config - Store configuration options
 * @returns Configured Redux store instance
 * @throws TestUtilityError if store creation fails
 */
export function createMockStore(config: MockStoreConfig = {}): EnhancedStore {
  const mergedConfig = { ...DEFAULT_MOCK_STORE_CONFIG, ...config };
  
  try {
    return configureStore({
      reducer: mergedConfig.reducers ?? {},
      preloadedState: mergedConfig.initialState,
      devTools: mergedConfig.devTools,
    });
  } catch (error) {
    throw new TestUtilityError('Failed to create mock store', error);
  }
}

/**
 * Creates a mock API response with proper typing
 * 
 * @param data - Response data payload
 * @param status - HTTP status code (default: 200)
 * @param headers - Optional response headers
 * @returns Typed mock API response
 */
export function createMockApiResponse<T>(
  data: T,
  status: number = 200,
  headers?: Record<string, string>
): MockApiResponse<T> {
  // Validate status code range
  if (status < 100 || status > 599) {
    throw new TestUtilityError(`Invalid HTTP status code: ${status}`);
  }

  return {
    data,
    status,
    statusText: getStatusText(status),
    headers: headers ?? { 'content-type': 'application/json' },
  };
}

/**
 * Delays execution for async testing scenarios
 * 
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after delay
 */
export function delay(ms: number): Promise<void> {
  if (ms < 0) {
    throw new TestUtilityError('Delay duration must be non-negative');
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a deferred promise for testing async operations
 * Useful for testing loading states and race conditions
 * 
 * @returns Deferred promise controller
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolveFn: (value: T) => void;
  let rejectFn: (reason: unknown) => void;

  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  return {
    promise,
    resolve: resolveFn!,
    reject: rejectFn!,
  };
}

// Runtime Layer: React testing utilities
// ======================================

/**
 * Combines multiple wrapper components into a single wrapper
 * 
 * @param wrappers - Array of wrapper components
 * @returns Combined wrapper component
 */
function combineWrappers(
  wrappers: React.ComponentType<{ children: React.ReactNode }>[]
): React.ComponentType<{ children: React.ReactNode }> {
  return function CombinedWrapper({ children }: { children: React.ReactNode }) {
    return wrappers.reduceRight(
      (acc, Wrapper) => <Wrapper>{acc}</Wrapper>,
      children
    );
  };
}

/**
 * Custom render function with providers
 * Wraps React Testing Library's render with common providers
 * 
 * @param ui - Component to render
 * @param options - Render and provider options
 * @returns Render result with store reference
 * @throws TestUtilityError if rendering fails
 */
export function renderWithProviders(
  ui: ReactElement,
  options: CustomRenderOptions = {}
): CustomRenderResult {
  const { storeConfig, routerConfig, wrappers = [], ...renderOptions } = options;

  // Create store if config provided
  const store = storeConfig ? createMockStore(storeConfig) : createMockStore();

  // Build provider wrappers
  const providerWrappers: React.ComponentType<{ children: React.ReactNode }>[] = [
    // Redux Provider
    ({ children }) => <Provider store={store}>{children}</Provider>,
    // Router Provider
    ({ children }) => (
      <MemoryRouter {...(routerConfig ?? DEFAULT_ROUTER_CONFIG)}>
        {children}
      </MemoryRouter>
    ),
    // Additional custom wrappers
    ...wrappers,
  ];

  const AllProviders = combineWrappers(providerWrappers);

  try {
    const renderResult = render(ui, {
      wrapper: AllProviders,
      ...renderOptions,
    });

    return {
      ...renderResult,
      store,
    };
  } catch (error) {
    throw new TestUtilityError('Failed to render component with providers', error);
  }
}

/**
 * Waits for an element to be removed from the DOM
 * Useful for testing loading spinners and transitions
 * 
 * @param callback - Function that returns the element
 * @param timeout - Maximum wait time in ms (default: 4500)
 * @returns Promise that resolves when element is removed
 */
export async function waitForElementToBeRemoved<T>(
  callback: (() => T) | T,
  timeout: number = 4500
): Promise<void> {
  const { waitForElementToBeRemoved: rtlWaitForRemoved } = await import(
    '@testing-library/react'
  );
  
  try {
    await rtlWaitForRemoved(callback, { timeout });
  } catch (error) {
    throw new TestUtilityError('Element was not removed within timeout', error);
  }
}

// UI Layer: DOM interaction helpers
// =================================

/**
 * Simulates user typing with proper events
 * Fires input, change, and blur events in sequence
 * 
 * @param element - Input element to type into
 * @param value - Value to type
 * @throws TestUtilityError if element is invalid
 */
export function simulateTyping(element: HTMLElement, value: string): void {
  if (!element) {
    throw new TestUtilityError('Cannot simulate typing: element is null or undefined');
  }

  // Validate element is an input-like element
  const validTags = ['INPUT', 'TEXTAREA', 'SELECT'];
  const isContentEditable = element.getAttribute('contenteditable') === 'true';
  
  if (!validTags.includes(element.tagName) && !isContentEditable) {
    throw new TestUtilityError(
      `Cannot simulate typing: element must be input, textarea, select, or contenteditable. Got: ${element.tagName}`
    );
  }

  // Fire events in sequence to mimic real user behavior
  const inputEvent = new Event('input', { bubbles: true });
  const changeEvent = new Event('change', { bubbles: true });
  const blurEvent = new Event('blur', { bubbles: true });

  // Set value and dispatch events
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = value;
  } else if (isContentEditable) {
    element.textContent = value;
  }

  element.dispatchEvent(inputEvent);
  element.dispatchEvent(changeEvent);
  element.dispatchEvent(blurEvent);
}

/**
 * Generates a unique test ID with optional prefix
 * Useful for creating isolated test identifiers
 * 
 * @param prefix - Optional prefix for the ID
 * @returns Unique test identifier
 */
export function generateTestId(prefix: string = 'test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

// Helper functions
// ================

/**
 * Maps HTTP status codes to status text
 * 
 * @param status - HTTP status code
 * @returns Status text description
 */
function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };

  return statusTexts[status] || 'Unknown Status';
}

// Re-export testing library utilities for convenience
export { screen, waitFor, within } from '@testing-library/react';
export { userEvent } from '@testing-library/user-event';