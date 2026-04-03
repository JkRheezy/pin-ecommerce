/**
 * @fileoverview Test render utilities and custom render functions
 * @module app/__tests__/test-render
 * @layer Runtime
 */

import type { ReactElement, ReactNode } from 'react';
import type { RenderOptions, RenderResult } from '@testing-library/react';
import { render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event/dist/types/setup/setup';

// -----------------------------------------------------------------------------
// Types Layer
// -----------------------------------------------------------------------------

/**
 * Custom render options extending RTL's RenderOptions
 */
export interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Initial route for router context */
  initialRoute?: string;
  /** Custom wrapper component */
  wrapper?: (props: { children: ReactNode }) => ReactElement;
  /** Whether to enable user event setup */
  setupUserEvent?: boolean;
}

/**
 * Extended render result with utility methods
 */
export interface CustomRenderResult extends RenderResult {
  /** Pre-configured user event instance */
  user: UserEvent;
  /** Navigate to a specific route */
  navigate: (path: string) => Promise<void>;
  /** Get element within a specific container */
  getWithin: (container: HTMLElement) => ReturnType<typeof within>;
}

/**
 * Test context configuration
 */
interface TestContextConfig {
  /** Feature flags state */
  featureFlags?: Record<string, boolean>;
  /** User permissions */
  permissions?: string[];
  /** Theme preference */
  theme?: 'light' | 'dark' | 'system';
}

// -----------------------------------------------------------------------------
// Config Layer
// -----------------------------------------------------------------------------

/**
 * Default test context configuration
 */
const DEFAULT_TEST_CONFIG: TestContextConfig = {
  featureFlags: {},
  permissions: [],
  theme: 'light',
};

/**
 * Test environment validation
 */
function validateTestEnvironment(): void {
  if (typeof window === 'undefined') {
    throw new Error('test-render utilities must be used in a DOM environment');
  }
}

// -----------------------------------------------------------------------------
// Service Layer
// -----------------------------------------------------------------------------

/**
 * Creates a test wrapper with all required providers
 */
function createTestWrapper(config: TestContextConfig = DEFAULT_TEST_CONFIG) {
  return function TestWrapper({ children }: { children: ReactNode }): ReactElement {
    // Combine all providers - order matters (innermost to outermost)
    const Wrapper = ({ children: wrappedChildren }: { children: ReactNode }) => (
      <>{wrappedChildren}</>
    );

    return <Wrapper>{children}</Wrapper>;
  };
}

/**
 * Sets up user event with recommended configuration
 */
function setupUserEventInstance(): UserEvent {
  return userEvent.setup({
    advanceTimers: jest.advanceTimersByTime,
    applyAccept: false,
    skipHover: true,
  });
}

// -----------------------------------------------------------------------------
// Runtime Layer
// -----------------------------------------------------------------------------

/**
 * Custom render function with extended capabilities
 * 
 * @param ui - React element to render
 * @param options - Custom render options
 * @returns Extended render result with user event and navigation utilities
 * 
 * @example
 * const { user, getByRole } = render(<MyComponent />, {
 *   initialRoute: '/dashboard',
 *   setupUserEvent: true,
 * });
 * await user.click(getByRole('button'));
 */
export function render(
  ui: ReactElement,
  options: CustomRenderOptions = {}
): CustomRenderResult {
  validateTestEnvironment();

  const {
    initialRoute = '/',
    wrapper: CustomWrapper,
    setupUserEvent = true,
    ...rtlOptions
  } = options;

  // Validate inputs
  if (initialRoute && typeof initialRoute !== 'string') {
    throw new TypeError('initialRoute must be a string');
  }

  // Build wrapper chain
  const TestWrapper = createTestWrapper();
  
  const Wrapper = CustomWrapper 
    ? ({ children }: { children: ReactNode }) => (
        <TestWrapper>
          <CustomWrapper>{children}</CustomWrapper>
        </TestWrapper>
      )
    : TestWrapper;

  // Perform render
  const renderResult = rtlRender(ui, {
    wrapper: Wrapper,
    ...rtlOptions,
  });

  // Setup user event if requested
  const user = setupUserEvent ? setupUserEventInstance() : (null as unknown as UserEvent);

  // Navigation utility (mock implementation)
  const navigate = async (path: string): Promise<void> => {
    if (typeof path !== 'string') {
      throw new TypeError('Navigation path must be a string');
    }
    // In real implementation, this would interact with router
    window.history.pushState({}, '', path);
    // Trigger popstate for router listeners
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  // Get within utility
  const getWithin = (container: HTMLElement) => {
    if (!(container instanceof HTMLElement)) {
      throw new TypeError('Container must be an HTMLElement');
    }
    return within(container);
  };

  return {
    ...renderResult,
    user,
    navigate,
    getWithin,
  };
}

/**
 * Renders a hook within the test context
 * 
 * @param hook - Hook function to test
 * @param options - Render options
 * @returns Hook result and rerender utility
 * 
 * @example
 * const { result } = renderHook(() => useCounter(), {
 *   initialProps: { initial: 0 },
 * });
 * expect(result.current.count).toBe(0);
 */
export function renderHook<TProps, TResult>(
  hook: (props: TProps) => TResult,
  options: {
    initialProps?: TProps;
    wrapper?: (props: { children: ReactNode }) => ReactElement;
  } = {}
): {
  result: { current: TResult };
  rerender: (props?: TProps) => void;
  unmount: () => void;
} {
  validateTestEnvironment();

  let result: TResult;
  const { initialProps, wrapper: CustomWrapper } = options;

  const TestComponent = (props: TProps): null => {
    result = hook(props);
    return null;
  };

  const { rerender: rtlRerender, unmount } = render(
    <TestComponent {...(initialProps as TProps)} />,
    { wrapper: CustomWrapper }
  );

  // Type assertion needed due to render timing
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const hookResult = { current: result! };

  const rerender = (props?: TProps): void => {
    rtlRerender(<TestComponent {...(props ?? (initialProps as TProps))} />);
    hookResult.current = result;
  };

  return {
    result: hookResult,
    rerender,
    unmount,
  };
}

/**
 * Creates a test session with isolated context
 * Useful for tests that need complete isolation
 * 
 * @param config - Test context configuration
 * @returns Session utilities
 */
export function createTestSession(config: TestContextConfig = {}) {
  const mergedConfig = { ...DEFAULT_TEST_CONFIG, ...config };

  return {
    config: mergedConfig,
    render: (ui: ReactElement, options?: Omit<CustomRenderOptions, 'wrapper'>) =>
      render(ui, {
        ...options,
        wrapper: createTestWrapper(mergedConfig),
      }),
    cleanup: (): void => {
      // Custom cleanup logic if needed
    },
  };
}

// -----------------------------------------------------------------------------
// Re-exports for convenience
// -----------------------------------------------------------------------------

export { screen, within, userEvent };
export type { UserEvent };

// Default export for flexible importing
export default render;