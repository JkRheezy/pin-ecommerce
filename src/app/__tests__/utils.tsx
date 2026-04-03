/**
 * Test Utilities Module (Backward Compatibility Re-exports)
 * 
 * This module re-exports from the new modular test utilities for backward compatibility.
 * @deprecated Import directly from the new modules:
 *   - `src/app/__tests__/utils/types` for types
 *   - `src/app/__tests__/utils/config` for configuration
 *   - `src/app/__tests__/utils/render` for render helpers
 * 
 * @module src/app/__tests__/utils
 */

// Re-export from types module
export type { 
  TestProviderConfig,
  TestRenderOptions,
  CustomRenderResult
} from './utils/types';

// Re-export from config module
export {
  createTestQueryClient,
  defaultTestConfig,
  mergeTestConfig
} from './utils/config';

// Re-export from render module
export {
  createTestWrapper,
  customRender,
  renderWithRouter,
  renderWithQueryClient
} from './utils/render';

// Re-export commonly used testing-library utilities for convenience
export { render, screen, waitFor, fireEvent } from '@testing-library/react';

/*
 * NOTE: This file is maintained for backward compatibility.
 * New code should import directly from the specific utility modules.
 * This file will be removed in a future major version.
 */

/**
 * Extended render options with provider configuration
 */
export interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Provider configuration for test wrapper */
  providers?: TestProviderConfig;
}

/**
 * Mock data factory function type
 */
export type MockFactory<T, Args extends unknown[] = []> = (...args: Args) => T;

/**
 * Async test helper result type
 */
export type AsyncTestResult<T> = Promise<{ success: true; data: T } | { success: false; error: Error }>;

// Config Layer: Default configurations
// =====================================

const logger = Logger.getInstance('TestUtils');

/**
 * Default query client configuration for tests
 * Disables retries and sets short stale time for predictable test behavior
 */
export const createTestQueryClient = (): QueryClient => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
};

/**
 * Default test provider configuration
 */
export const defaultTestConfig: Required<TestProviderConfig> = {
  router: { initialEntries: ['/'] },
  queryClient: createTestQueryClient(),
  theme: 'light',
};

// Repo Layer: Data access and mocking utilities
// ==============================================

/**
 * Creates a mock API response with proper typing
 * 
 * @template T - The type of data in the response
 * @param data - The response data
 * @param status - HTTP status code (default: 200)
 * @returns Mocked API response object
 */
export function createMockApiResponse<T>(data: T, status = 200): { data: T; status: number; ok: boolean } {
  return {
    data,
    status,
    ok: status >= 200 && status < 300,
  };
}

/**
 * Creates a mock API error response
 * 
 * @param message - Error message
 * @param status - HTTP status code (default: 500)
 * @returns Mocked API error response
 */
export function createMockApiError(message: string, status = 500): { error: Error; status: number; ok: false } {
  const error = new Error(message);
  return {
    error,
    status,
    ok: false,
  };
}

/**
 * Factory for generating mock data with validation
 * 
 * @template T - The type of mock data to generate
 * @param baseFactory - Base factory function
 * @param overrides - Partial overrides for the generated data
 * @returns Validated mock data
 */
export function createMock<T extends Record<string, unknown>>(
  baseFactory: MockFactory<T>,
  overrides: Partial<T> = {}
): T {
  try {
    const base = baseFactory();
    const merged = { ...base, ...overrides };
    
    // Validate required fields are present
    const missingFields = Object.keys(base).filter(key => !(key in merged));
    if (missingFields.length > 0) {
      throw new Error(`Mock data missing required fields: ${missingFields.join(', ')}`);
    }
    
    return merged;
  } catch (error) {
    logger.error('Failed to create mock data', { error, overrides });
    throw error;
  }
}

// Service Layer: Business logic test helpers
// ==========================================

/**
 * Waits for a condition to be met with timeout
 * 
 * @param condition - Function that returns true when condition is met
 * @param timeout - Maximum wait time in ms (default: 5000)
 * @param interval - Check interval in ms (default: 50)
 * @returns Promise that resolves when condition is met
 * @throws Error if timeout is reached
 */
export async function waitForCondition(
  condition: () => boolean,
  timeout = 5000,
  interval = 50
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Suppresses expected console errors during test execution
 * Use sparingly and only for expected errors
 * 
 * @param fn - Function to execute with suppressed errors
 * @param expectedPatterns - Patterns of expected error messages to suppress
 * @returns Result of the executed function
 */
export async function withSuppressedConsoleErrors<T>(
  fn: () => Promise<T>,
  expectedPatterns: RegExp[] = []
): Promise<T> {
  const originalError = console.error;
  const suppressedErrors: Error[] = [];
  
  console.error = (...args: unknown[]) => {
    const message = args.join(' ');
    const isExpected = expectedPatterns.some(pattern => pattern.test(message));
    
    if (!isExpected) {
      originalError.apply(console, args);
    } else {
      suppressedErrors.push(new Error(message));
    }
  };
  
  try {
    const result = await fn();
    return result;
  } finally {
    console.error = originalError;
    
    if (suppressedErrors.length > 0) {
      logger.debug('Suppressed expected console errors', { count: suppressedErrors.length });
    }
  }
}

/**
 * Creates a deferred promise for testing async operations
 * 
 * @template T - The type of the deferred value
 * @returns Object with promise, resolve, and reject functions
 */
export function createDeferred<T>(): {
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
  
  return {
    promise,
    resolve: resolveFn!,
    reject: rejectFn!,
  };
}

// Runtime Layer: Component rendering and interaction
// ==================================================

/**
 * Creates a test wrapper component with all required providers
 * 
 * @param config - Provider configuration
 * @returns Wrapper component
 */
function createTestWrapper(config: Required<TestProviderConfig>): React.FC<{ children: React.ReactNode }> {
  const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
      <QueryClientProvider client={config.queryClient}>
        <MemoryRouter {...config.router}>
          <ThemeProvider theme={config.theme}>
            {children}
          </ThemeProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
  
  TestWrapper.displayName = 'TestWrapper';
  return TestWrapper;
}

/**
 * Custom render function with provider wrapper
 * 
 * @param ui - React element to render
 * @param options - Extended render options
 * @returns Render result with additional utilities
 */
export function renderWithProviders(
  ui: ReactElement,
  options: CustomRenderOptions = {}
): RenderResult {
  const { providers = {}, ...renderOptions } = options;
  
  // Merge with defaults, ensuring all required fields are present
  const config: Required<TestProviderConfig> = {
    router: providers.router ?? defaultTestConfig.router,
    queryClient: providers.queryClient ?? defaultTestConfig.queryClient,
    theme: providers.theme ?? defaultTestConfig.theme,
  };
  
  const Wrapper = createTestWrapper(config);
  
  try {
    return render(ui, { wrapper: Wrapper, ...renderOptions });
  } catch (error) {
    logger.error('Failed to render with providers', { error, providers });
    throw error;
  }
}

/**
 * Simulates user authentication state in tests
 * 
 * @param user - User data to set as authenticated
 */
export function mockAuthenticatedUser(user: { id: string; email: string; name?: string }): void {
  // Store in localStorage for persistence across test scenarios
  try {
    localStorage.setItem('test:user', JSON.stringify(user));
  } catch (error) {
    logger.error('Failed to mock authenticated user', { error, user });
    throw error;
  }
}

/**
 * Clears mocked authentication state
 */
export function clearMockAuthentication(): void {
  try {
    localStorage.removeItem('test:user');
  } catch (error) {
    logger.error('Failed to clear mock authentication', { error });
    throw error;
  }
}

// UI Layer: DOM interaction helpers
// ==================================

/**
 * Finds element by data-testid with proper error handling
 * 
 * @param container - Container element to search within
 * @param testId - data-testid attribute value
 * @returns Found element or null
 */
export function findByTestId(container: HTMLElement, testId: string): HTMLElement | null {
  if (!container) {
    logger.warn('Container is null or undefined');
    return null;
  }
  
  return container.querySelector(`[data-testid="${testId}"]`);
}

/**
 * Creates a typed change event for form inputs
 * 
 * @param value - Value to set
 * @returns Partial change event object
 */
export function createChangeEvent(value: string): { target: { value: string } } {
  return {
    target: { value },
  };
}

/**
 * Mocks file upload for testing file inputs
 * 
 * @param fileName - Name of the file
 * @param content - File content
 * @param type - MIME type
 * @returns Mock File object
 */
export function createMockFile(fileName: string, content: string, type: string): File {
  const blob = new Blob([content], { type });
  return new File([blob], fileName, { type });
}

// Re-export testing-library utilities for convenience
export { screen, waitFor, fireEvent, within } from '@testing-library/react';
export { userEvent } from '@testing-library/user-event';