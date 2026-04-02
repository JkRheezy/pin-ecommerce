/**
 * Test Utilities Module
 * 
 * Shared test helpers and setup utilities following the six-layer architecture.
 * This module provides common testing infrastructure for all test layers.
 * 
 * Layer: Repo → Service → Runtime (Test Infrastructure)
 */

import React, { ReactElement } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';
import type { Logger } from '../types/logger.types';

// ============================================
// TYPES LAYER: Test Utility Types
// ============================================

/**
 * Configuration options for test wrapper setup
 */
export interface TestWrapperConfig {
  /** Initial route for MemoryRouter */
  initialRoute?: string;
  /** Route entries for MemoryRouter */
  initialEntries?: MemoryRouterProps['initialEntries'];
  /** Initial index in history stack */
  initialIndex?: number;
  /** Query client options override */
  queryClientOptions?: ConstructorParameters<typeof QueryClient>[0];
  /** Additional wrapper components (outer to inner order) */
  wrappers?: React.ComponentType<{ children: React.ReactNode }>[];
}

/**
 * Extended render options with test-specific configuration
 */
export interface ExtendedRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Test wrapper configuration */
  wrapperConfig?: TestWrapperConfig;
}

/**
 * Mock service configuration for dependency injection in tests
 */
export interface MockServiceConfig<T = unknown> {
  /** Service identifier or token */
  serviceId: string | symbol;
  /** Mock implementation */
  mockImplementation: T;
  /** Whether to restore original after test */
  restoreAfterTest?: boolean;
}

/**
 * Test context for managing test state and cleanup
 */
export interface TestContext {
  /** Unique test identifier */
  testId: string;
  /** Created at timestamp */
  createdAt: Date;
  /** Cleanup functions to run after test */
  cleanupFns: Array<() => void | Promise<void>>;
  /** Registered mock services */
  mockServices: Map<string | symbol, unknown>;
}

// ============================================
// CONFIG LAYER: Default Configurations
// ============================================

/**
 * Default query client configuration for tests
 * Disables retries and refetching for predictable test behavior
 */
const DEFAULT_QUERY_CLIENT_CONFIG: ConstructorParameters<typeof QueryClient>[0] = {
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
    mutations: {
      retry: false,
    },
  },
};

/**
 * Default test wrapper configuration
 */
const DEFAULT_WRAPPER_CONFIG: TestWrapperConfig = {
  initialRoute: '/',
  initialEntries: ['/'],
  initialIndex: 0,
  queryClientOptions: DEFAULT_QUERY_CLIENT_CONFIG,
  wrappers: [],
};

// ============================================
// REPO LAYER: Test Data Builders and Factories
// ============================================

/**
 * Factory function for creating typed test data builders
 */
export function createBuilder<T extends Record<string, unknown>>(
  defaults: T
): {
  build: (overrides?: Partial<T>) => T;
  buildMany: (count: number, overrides?: Partial<T> | ((index: number) => Partial<T>)) => T[];
} {
  return {
    build: (overrides: Partial<T> = {}): T => {
      // Validate overrides don't contain undefined values that might mask bugs
      const validatedOverrides = Object.entries(overrides).reduce((acc, [key, value]) => {
        if (value === undefined && key in defaults && defaults[key] !== undefined) {
          // Allow explicit undefined only if default is also undefined
          acc[key as keyof T] = value as T[keyof T];
        } else {
          acc[key as keyof T] = value as T[keyof T];
        }
        return acc;
      }, {} as Partial<T>);

      return { ...defaults, ...validatedOverrides };
    },
    buildMany: (count: number, overrides: Partial<T> | ((index: number) => Partial<T>) = {}): T[] => {
      if (count < 0) {
        throw new Error(`Cannot build negative count: ${count}`);
      }
      
      return Array.from({ length: count }, (_, index) => {
        const resolvedOverrides = typeof overrides === 'function' 
          ? overrides(index) 
          : overrides;
        return { ...defaults, ...resolvedOverrides };
      });
    },
  };
}

/**
 * Async data builder for complex test data scenarios
 */
export async function createAsyncBuilder<T extends Record<string, unknown>>(
  defaults: T,
  asyncDefaults: Partial<Record<keyof T, () => Promise<T[keyof T]>>>
): Promise<{ build: (overrides?: Partial<T>) => Promise<T> }> {
  // Resolve all async defaults
  const resolvedDefaults: Partial<T> = {};
  
  for (const [key, factory] of Object.entries(asyncDefaults)) {
    if (factory) {
      try {
        resolvedDefaults[key as keyof T] = await factory() as T[keyof T];
      } catch (error) {
        throw new Error(`Failed to resolve async default for key "${key}": ${(error as Error).message}`);
      }
    }
  }

  return {
    build: async (overrides: Partial<T> = {}): Promise<T> => {
      // Apply any async overrides
      const asyncOverrides: Partial<T> = {};
      for (const [key, value] of Object.entries(overrides)) {
        if (value instanceof Promise) {
          try {
            asyncOverrides[key as keyof T] = await value as T[keyof T];
          } catch (error) {
            throw new Error(`Failed to resolve async override for key "${key}": ${(error as Error).message}`);
          }
        }
      }

      return { ...defaults, ...resolvedDefaults, ...overrides, ...asyncOverrides };
    },
  };
}

// ============================================
// SERVICE LAYER: Test Context and Lifecycle Management
// ============================================

/**
 * Create a new test context for isolated test execution
 */
export function createTestContext(prefix: string = 'test'): TestContext {
  const testId = `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  return {
    testId,
    createdAt: new Date(),
    cleanupFns: [],
    mockServices: new Map(),
  };
}

/**
 * Register a cleanup function to run after test completion
 */
export function registerCleanup(context: TestContext, cleanupFn: () => void | Promise<void>): void {
  context.cleanupFns.push(cleanupFn);
}

/**
 * Execute all registered cleanup functions
 */
export async function runCleanup(context: TestContext): Promise<void> {
  const errors: Error[] = [];
  
  // Run cleanup in reverse order (LIFO)
  for (const cleanupFn of [...context.cleanupFns].reverse()) {
    try {
      await cleanupFn();
    } catch (error) {
      errors.push(error as Error);
    }
  }

  // Clear cleanup registry
  context.cleanupFns.length = 0;

  if (errors.length > 0) {
    const aggregatedError = new Error(
      `Cleanup failed with ${errors.length} error(s):\n${errors.map(e => e.message).join('\n')}`
    );
    throw aggregatedError;
  }
}

/**
 * Mock logger for test environments
 * Captures log entries for assertions without polluting test output
 */
export function createMockLogger(): Logger & { getLogs: () => LogEntry[]; clearLogs: () => void } {
  const logs: LogEntry[] = [];

  const createLogEntry = (
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): LogEntry => ({
    level,
    message,
    metadata,
    timestamp: new Date(),
  });

  return {
    debug: (message: string, metadata?: Record<string, unknown>) => {
      logs.push(createLogEntry('debug', message, metadata));
    },
    info: (message: string, metadata?: Record<string, unknown>) => {
      logs.push(createLogEntry('info', message, metadata));
    },
    warn: (message: string, metadata?: Record<string, unknown>) => {
      logs.push(createLogEntry('warn', message, metadata));
    },
    error: (message: string, error?: Error, metadata?: Record<string, unknown>) => {
      logs.push(createLogEntry('error', message, { ...metadata, error: error?.message, stack: error?.stack }));
    },
    getLogs: () => [...logs],
    clearLogs: () => {
      logs.length = 0;
    },
  };
}

// ============================================
// RUNTIME LAYER: React Component Rendering Utilities
// ============================================

/**
 * Create a test wrapper component with all providers
 */
function createTestWrapper(config: TestWrapperConfig = DEFAULT_WRAPPER_CONFIG): React.FC<{ children: React.ReactNode }> {
  const mergedConfig = { ...DEFAULT_WRAPPER_CONFIG, ...config };
  
  // Create query client for this test instance
  const queryClient = new QueryClient(mergedConfig.queryClientOptions);

  const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Compose wrappers from outermost to innermost
    const WrapperChain = [
      // Router wrapper
      ({ children: innerChildren }: { children: React.ReactNode }) => (
        <MemoryRouter
          initialEntries={mergedConfig.initialEntries}
          initialIndex={mergedConfig.initialIndex}
        >
          {innerChildren}
        </MemoryRouter>
      ),
      // Query client wrapper
      ({ children: innerChildren }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {innerChildren}
        </QueryClientProvider>
      ),
      // Custom wrappers (applied in order)
      ...(mergedConfig.wrappers || []),
    ];

    // Compose all wrappers
    return WrapperChain.reduceRight(
      (acc, Wrapper) => <Wrapper>{acc}</Wrapper>,
      children
    );
  };

  // Attach query client for test access
  (TestWrapper as TestWrapperWithClient).queryClient = queryClient;
  
  return TestWrapper;
}

interface TestWrapperWithClient extends React.FC<{ children: React.ReactNode }> {
  queryClient: QueryClient;
}

/**
 * Custom render function with test providers
 */
export function renderWithProviders(
  ui: ReactElement,
  options: ExtendedRenderOptions = {}
): RenderResult & { queryClient: QueryClient } {
  const { wrapperConfig, ...renderOptions } = options;
  
  const Wrapper = createTestWrapper(wrapperConfig);
  const rendered = render(ui, { wrapper: Wrapper, ...renderOptions });

  return {
    ...rendered,
    queryClient: (Wrapper as TestWrapperWithClient).queryClient,
  };
}

/**
 * Wait for async operations to settle
 * Useful for testing components with async effects
 */
export async function waitForAsyncOperations(
  timeoutMs: number = 1000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkComplete = () => {
      // Check if we've exceeded timeout
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Async operations did not complete within ${timeoutMs}ms`));
        return;
      }

      // Use setImmediate to yield control and allow microtasks to process
      setImmediate(() => {
        // Additional check could be added here for specific conditions
        resolve();
      });
    };

    checkComplete();
  });
}

// ============================================
// UI LAYER: Component-Specific Test Helpers
// ============================================

/**
 * Helper to test async component states
 */
export async function testAsyncComponentState<T>(
  renderFn: () => Promise<T>,
  expectations: {
    loadingState?: () => void | Promise<void>;
    successState: (result: T) => void | Promise<void>;
    errorState?: (error: Error) => void | Promise<void>;
    timeoutMs?: number;
  }
): Promise<void> {
  const { loadingState, successState, errorState, timeoutMs = 5000 } = expectations;

  // Track loading state if provided
  if (loadingState) {
    await loadingState();
  }

  try {
    const result = await Promise.race([
      renderFn(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Async operation timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    
    await successState(result);
  } catch (error) {
    if (errorState) {
      await errorState(error as Error);
    } else {
      throw error;
    }
  }
}

// ============================================
// TYPES: Supporting type definitions
// ============================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

// ============================================
// EXPORTS: Module public API
// ============================================

/**
 * Re-export testing library utilities for convenience
 */
export { screen, waitFor, within, fireEvent, userEvent } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

// Type exports
export type { 
  TestWrapperConfig, 
  ExtendedRenderOptions, 
  MockServiceConfig, 
  TestContext,
  LogEntry,
  LogLevel,
};