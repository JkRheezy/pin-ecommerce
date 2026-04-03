/**
 * Test Utilities Module
 * 
 * Shared setup, mocks, and helper functions for testing.
 * Layer: Runtime (test runtime utilities)
 */

import React, { ReactElement } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';
import { vi } from 'vitest';

// ==========================================
// Types Layer: Test Configuration Types
// ==========================================

/**
 * Configuration for custom render wrapper
 */
export interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Initial route for MemoryRouter */
  initialRoute?: string;
  /** Router initial entries */
  initialEntries?: MemoryRouterProps['initialEntries'];
  /** Query client configuration overrides */
  queryClientConfig?: ConstructorParameters<typeof QueryClient>[0];
  /** Additional wrapper components */
  wrappers?: Array<React.ComponentType<{ children: React.ReactNode }>>;
}

/**
 * Mock service configuration for dependency injection
 */
export interface MockServiceConfig {
  /** Service name to mock */
  serviceName: string;
  /** Mock implementation */
  mockImplementation: Record<string, unknown>;
  /** Whether to spy on original implementation */
  spyOnOriginal?: boolean;
}

/**
 * Test data factory function type
 */
export type TestDataFactory<T, Args extends unknown[] = []> = (...args: Args) => T;

// ==========================================
// Config Layer: Default Configurations
// ==========================================

/**
 * Default query client config for tests
 * Disables retries and sets short stale time for predictable tests
 */
export const DEFAULT_TEST_QUERY_CLIENT_CONFIG: ConstructorParameters<typeof QueryClient>[0] = {
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 0,
      cacheTime: 0,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
};

// ==========================================
// Service Layer: Mock Services and Helpers
// ==========================================

/**
 * Creates a mock logger that captures all log levels
 */
export function createMockLogger(): {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  getLogs: () => { level: string; message: unknown; meta?: unknown }[];
  clear: () => void;
} {
  const logs: { level: string; message: unknown; meta?: unknown }[] = [];

  const createLogFn = (level: string) => 
    vi.fn((message: unknown, meta?: unknown) => {
      logs.push({ level, message, meta });
    });

  return {
    debug: createLogFn('debug'),
    info: createLogFn('info'),
    warn: createLogFn('warn'),
    error: createLogFn('error'),
    getLogs: () => [...logs],
    clear: () => {
      logs.length = 0;
    },
  };
}

/**
 * Creates a mock API client with configurable responses
 */
export function createMockApiClient<T = unknown>() {
  const mockResponses = new Map<string, T>();
  const mockErrors = new Map<string, Error>();

  return {
    /**
     * Register a successful response for a given endpoint
     */
    mockResponse: (endpoint: string, data: T): void => {
      mockResponses.set(endpoint, data);
      mockErrors.delete(endpoint);
    },

    /**
     * Register an error response for a given endpoint
     */
    mockError: (endpoint: string, error: Error): void => {
      mockErrors.set(endpoint, error);
      mockResponses.delete(endpoint);
    },

    /**
     * Simulated GET request
     */
    get: vi.fn(async (endpoint: string): Promise<T> => {
      if (mockErrors.has(endpoint)) {
        throw mockErrors.get(endpoint);
      }
      if (mockResponses.has(endpoint)) {
        return mockResponses.get(endpoint) as T;
      }
      throw new Error(`No mock configured for endpoint: ${endpoint}`);
    }),

    /**
     * Simulated POST request
     */
    post: vi.fn(async (endpoint: string, _body: unknown): Promise<T> => {
      if (mockErrors.has(endpoint)) {
        throw mockErrors.get(endpoint);
      }
      if (mockResponses.has(endpoint)) {
        return mockResponses.get(endpoint) as T;
      }
      throw new Error(`No mock configured for endpoint: ${endpoint}`);
    }),

    /**
     * Clear all registered mocks
     */
    clearMocks: (): void => {
      mockResponses.clear();
      mockErrors.clear();
    },
  };
}

/**
 * Factory for creating paginated response mocks
 */
export function createPaginatedResponseFactory<T>() {
  return (
    items: T[],
    options: {
      page?: number;
      pageSize?: number;
      totalItems?: number;
    } = {}
  ) => {
    const { page = 1, pageSize = 10, totalItems = items.length } = options;

    return {
      data: items,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
        hasNextPage: page * pageSize < totalItems,
        hasPreviousPage: page > 1,
      },
    };
  };
}

// ==========================================
// Runtime Layer: Custom Render and Setup
// ==========================================

/**
 * Creates a test query client with isolated cache
 */
export function createTestQueryClient(
  config: ConstructorParameters<typeof QueryClient>[0] = {}
): QueryClient {
  return new QueryClient({
    ...DEFAULT_TEST_QUERY_CLIENT_CONFIG,
    ...config,
  });
}

/**
 * Composes multiple wrapper components into a single wrapper
 */
function composeWrappers(
  wrappers: Array<React.ComponentType<{ children: React.ReactNode }>>
): React.ComponentType<{ children: React.ReactNode }> {
  return function ComposedWrapper({ children }: { children: React.ReactNode }) {
    return wrappers.reduceRight(
      (acc, Wrapper) => <Wrapper>{acc}</Wrapper>,
      children
    );
  };
}

/**
 * Custom render function with providers
 * Wraps component with QueryClientProvider and MemoryRouter
 */
export function customRender(
  ui: ReactElement,
  options: CustomRenderOptions = {}
): RenderResult & { queryClient: QueryClient } {
  const {
    initialRoute = '/',
    initialEntries = [initialRoute],
    queryClientConfig,
    wrappers = [],
    ...renderOptions
  } = options;

  const queryClient = createTestQueryClient(queryClientConfig);

  const AllProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const baseWrappers = [
      ({ children: c }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{c}</QueryClientProvider>
      ),
      ({ children: c }: { children: React.ReactNode }) => (
        <MemoryRouter initialEntries={initialEntries}>{c}</MemoryRouter>
      ),
      ...wrappers,
    ];

    const Composed = composeWrappers(baseWrappers);
    return <Composed>{children}</Composed>;
  };

  const result = render(ui, { wrapper: AllProviders, ...renderOptions });

  return {
    ...result,
    queryClient,
  };
}

/**
 * Re-export testing library utilities with custom render
 */
export * from '@testing-library/react';
export { customRender as render };

// ==========================================
// UI Layer: Component-Specific Helpers
// ==========================================

/**
 * Waits for async operations to complete
 * Useful for testing loading states
 */
export async function waitForAsyncOperations(
  timeout: number = 1000
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, timeout));
}

/**
 * Simulates user permission levels for testing access control
 */
export function mockUserPermissions(
  permissions: string[]
): { hasPermission: (permission: string) => boolean } {
  const permissionSet = new Set(permissions);

  return {
    hasPermission: (permission: string): boolean => permissionSet.has(permission),
  };
}

/**
 * Creates a resize observer mock for component dimension testing
 */
export function createResizeObserverMock(): void {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
}

/**
 * Mocks matchMedia for responsive component testing
 */
export function mockMatchMedia(query: string, matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches: q === query ? matches : false,
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// ==========================================
// Error Handling: Test Error Utilities
// ==========================================

/**
 * Custom error class for test-specific errors
 */
export class TestSetupError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TestSetupError';
    Object.setPrototypeOf(this, TestSetupError.prototype);
  }
}

/**
 * Asserts that a function throws an error matching expected criteria
 */
export async function assertThrows<T extends Error>(
  fn: () => Promise<unknown> | unknown,
  expectedError?: Partial<T>
): Promise<T> {
  try {
    await fn();
    throw new TestSetupError('Expected function to throw, but it did not');
  } catch (error) {
    if (error instanceof TestSetupError) {
      throw error;
    }

    if (expectedError) {
      for (const [key, value] of Object.entries(expectedError)) {
        if ((error as T)[key as keyof T] !== value) {
          throw new TestSetupError(
            `Expected error.${key} to be ${value}, but got ${(error as T)[key as keyof T]}`,
            { expected: expectedError, actual: error }
          );
        }
      }
    }

    return error as T;
  }
}

// ==========================================
// Setup and Teardown Helpers
// ==========================================

/**
 * Global test setup - call in beforeAll or setupFiles
 */
export function setupTestEnvironment(): void {
  createResizeObserverMock();
  
  // Suppress console errors during tests unless explicitly testing error handling
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const message = String(args[0] ?? '');
    // Allow React act() warnings and other expected errors
    if (
      message.includes('Warning: ReactDOM.render') ||
      message.includes('act(')
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

/**
 * Global test teardown - call in afterAll
 */
export function teardownTestEnvironment(): void {
  // Cleanup any global mocks or state
  vi.restoreAllMocks();
}

/**
 * Resets all test state between tests
 */
export function resetTestState(): void {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
}