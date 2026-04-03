/**
 * Test Renderer Module
 * 
 * Provides utilities for rendering React components in tests with proper
 * Harness-Engineering six-layer architecture compliance.
 * 
 * Layer: Repo (Testing Infrastructure)
 */

import * as React from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';

// ============================================================================
// TYPES (Layer 1)
// ============================================================================

/**
 * Configuration options for the test renderer
 */
export interface TestRendererConfig {
  /** Whether to wrap component with QueryClientProvider */
  withQueryClient?: boolean;
  /** Initial route for MemoryRouter */
  initialRoute?: string;
  /** Additional router props */
  routerProps?: Omit<MemoryRouterProps, 'initialEntries'>;
  /** Custom query client options */
  queryClientOptions?: ConstructorParameters<typeof QueryClient>[0];
}

/**
 * Extended render options combining Testing Library options with our config
 */
export interface ExtendedRenderOptions extends RenderOptions {
  /** Test renderer configuration */
  config?: TestRendererConfig;
}

/**
 * Wrapper props for the test provider wrapper
 */
interface TestProviderWrapperProps {
  children: React.ReactNode;
  config: TestRendererConfig;
}

// ============================================================================
// CONFIG (Layer 2)
// ============================================================================

/**
 * Default configuration for test renderer
 */
const DEFAULT_CONFIG: Required<TestRendererConfig> = {
  withQueryClient: true,
  initialRoute: '/',
  routerProps: {},
  queryClientOptions: {
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  },
};

// ============================================================================
// REPO (Layer 3) - Core Implementation
// ============================================================================

/**
 * Creates a QueryClient instance with test-optimized settings
 * 
 * @param options - Optional query client configuration
 * @returns Configured QueryClient instance
 */
export function createTestQueryClient(
  options: ConstructorParameters<typeof QueryClient>[0] = {}
): QueryClient {
  return new QueryClient({
    ...DEFAULT_CONFIG.queryClientOptions,
    ...options,
  });
}

/**
 * Inner wrapper component that provides all test providers
 * 
 * Note: Order matters here - Router should be outermost, then QueryClient
 * to allow navigation to affect data fetching
 */
const TestProviderWrapper: React.FC<TestProviderWrapperProps> = ({
  children,
  config,
}) => {
  // Merge config with defaults
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Create query client instance (must be stable across renders)
  const queryClientRef = React.useRef<QueryClient | null>(null);
  
  if (!queryClientRef.current && mergedConfig.withQueryClient) {
    queryClientRef.current = createTestQueryClient(mergedConfig.queryClientOptions);
  }

  // Build the provider chain from inside out
  let wrappedChildren = children;

  // Wrap with QueryClientProvider if enabled
  if (mergedConfig.withQueryClient && queryClientRef.current) {
    wrappedChildren = (
      <QueryClientProvider client={queryClientRef.current}>
        {wrappedChildren}
      </QueryClientProvider>
    );
  }

  // Wrap with MemoryRouter (outermost to capture all navigation)
  wrappedChildren = (
    <MemoryRouter
      initialEntries={[mergedConfig.initialRoute]}
      {...mergedConfig.routerProps}
    >
      {wrappedChildren}
    </MemoryRouter>
  );

  return wrappedChildren;
};

/**
 * Custom render function that wraps components with test providers
 * 
 * This follows the Testing Library pattern while adding Harness-specific
 * provider configuration for consistent test environments.
 * 
 * @param ui - React element to render
 * @param options - Extended render options
 * @returns RenderResult with added utilities
 * 
 * @example
 *