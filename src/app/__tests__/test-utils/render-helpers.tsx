/**
 * Render Helpers Module
 * 
 * Custom render functions for testing React components with Harness-Engineering
 * testing infrastructure. Follows the six-layer architecture pattern.
 * 
 * Layer: Service (testing utilities)
 */

import React, { ReactElement } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';
import { ThemeProvider } from '@harness/design-system';

// Types Layer: Define custom render options and context configuration
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Initial route for MemoryRouter */
  initialRoute?: string;
  /** Route entries for MemoryRouter */
  routeEntries?: MemoryRouterProps['initialEntries'];
  /** Query client configuration for React Query */
  queryClientConfig?: ConstructorParameters<typeof QueryClient>[0];
  /** Whether to wrap with ThemeProvider */
  withTheme?: boolean;
  /** Custom wrapper component */
  wrapper?: React.ComponentType<{ children: React.ReactNode }>;
}

interface RenderHelpersConfig {
  /** Default query client options */
  defaultQueryClientOptions: ConstructorParameters<typeof QueryClient>[0];
  /** Default route for tests */
  defaultRoute: string;
}

// Config Layer: Default configuration values
const DEFAULT_CONFIG: RenderHelpersConfig = {
  defaultQueryClientOptions: {
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
      },
    },
  },
  defaultRoute: '/',
};

/**
 * Creates a configured QueryClient for testing
 * 
 * @param config - Optional query client configuration overrides
 * @returns Configured QueryClient instance
 */
function createTestQueryClient(
  config: ConstructorParameters<typeof QueryClient>[0] = {}
): QueryClient {
  try {
    const mergedConfig = {
      ...DEFAULT_CONFIG.defaultQueryClientOptions,
      ...config,
      defaultOptions: {
        ...DEFAULT_CONFIG.defaultQueryClientOptions.defaultOptions,
        ...config.defaultOptions,
      },
    };

    return new QueryClient(mergedConfig);
  } catch (error) {
    throw new Error(
      `Failed to create test QueryClient: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Creates the wrapper component hierarchy for tests
 * 
 * @param options - Custom render options
 * @returns Wrapper component with providers
 */
function createTestWrapper(
  options: CustomRenderOptions
): React.ComponentType<{ children: React.ReactNode }> {
  const {
    initialRoute = DEFAULT_CONFIG.defaultRoute,
    routeEntries,
    queryClientConfig,
    withTheme = true,
    wrapper: CustomWrapper,
  } = options;

  // Validate route configuration
  if (routeEntries && initialRoute !== DEFAULT_CONFIG.defaultRoute) {
    throw new Error(
      'Cannot specify both routeEntries and initialRoute. Use routeEntries for full control.'
    );
  }

  const queryClient = createTestQueryClient(queryClientConfig);

  return function TestWrapper({ children }: { children: React.ReactNode }): ReactElement {
    // Build the provider stack from innermost to outermost
    let wrappedChildren = children;

    // Apply custom inner wrapper if provided
    if (CustomWrapper) {
      wrappedChildren = <CustomWrapper>{wrappedChildren}</CustomWrapper>;
    }

    // Wrap with QueryClientProvider for React Query support
    wrappedChildren = (
      <QueryClientProvider client={queryClient}>
        {wrappedChildren}
      </QueryClientProvider>
    );

    // Wrap with ThemeProvider if enabled
    if (withTheme) {
      wrappedChildren = <ThemeProvider>{wrappedChildren}</ThemeProvider>;
    }

    // Wrap with MemoryRouter for routing support
    const routerProps: MemoryRouterProps = routeEntries
      ? { initialEntries: routeEntries }
      : { initialEntries: [initialRoute] };

    wrappedChildren = <MemoryRouter {...routerProps}>{wrappedChildren}</MemoryRouter>;

    return <>{wrappedChildren}</>;
  };
}

/**
 * Custom render function that wraps components with testing providers
 * 
 * Follows the Service layer pattern by providing a configured interface
 * to the underlying Runtime (React Testing Library).
 * 
 * @param ui - React element to render
 * @param options - Custom render options
 * @returns RenderResult with additional utilities
 * 
 * @example
 * const { getByText } = customRender(<MyComponent />, {
 *   initialRoute: '/dashboard',
 *   withTheme: true,
 * });
 */
export function customRender(
  ui: ReactElement,
  options: CustomRenderOptions = {}
): RenderResult {
  // Validate input
  if (!React.isValidElement(ui)) {
    throw new Error('customRender: ui must be a valid React element');
  }

  try {
    const Wrapper = createTestWrapper(options);

    return render(ui, {
      ...options,
      wrapper: Wrapper,
    });
  } catch (error) {
    // Structured error handling following logging principles
    const errorMessage = error instanceof Error ? error.message : 'Unknown render error';
    throw new Error(`customRender failed: ${errorMessage}`);
  }
}

/**
 * Async render helper for components with suspense boundaries
 * 
 * @param ui - React element to render
 * @param options - Custom render options
 * @returns Promise resolving to RenderResult
 */
export async function customRenderAsync(
  ui: ReactElement,
  options: CustomRenderOptions = {}
): Promise<RenderResult> {
  const result = customRender(ui, options);

  // Wait for any pending microtasks (useful for suspense)
  await new Promise((resolve) => setTimeout(resolve, 0));

  return result;
}

/**
 * Hook render helper for testing custom hooks
 * 
 * @param hook - Hook function to test
 * @param options - Custom render options
 * @returns Object with result and rerender function
 */
export function renderHook<TProps, TResult>(
  hook: (props: TProps) => TResult,
  options: CustomRenderOptions & { initialProps?: TProps } = {}
): {
  result: { current: TResult };
  rerender: (props?: TProps) => void;
  unmount: () => void;
} {
  const { initialProps, ...renderOptions } = options;

  let result: { current: TResult };

  const TestComponent: React.FC<{ hookProps: TProps }> = ({ hookProps }) => {
    result = { current: hook(hookProps) };
    return null;
  };

  const { rerender: rtlRerender, unmount } = customRender(
    <TestComponent hookProps={initialProps as TProps} />,
    renderOptions
  );

  const rerender = (props?: TProps): void => {
    rtlRerender(<TestComponent hookProps={props ?? (initialProps as TProps)} />);
  };

  // Type assertion needed due to React render timing
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { result: result!, rerender, unmount };
}

// Re-export testing-library utilities for convenience
export { screen, waitFor, within, fireEvent, userEvent } from '@testing-library/react';

// Export types for consumers
export type { CustomRenderOptions, RenderHelpersConfig };