/**
 * Test Utilities Module
 * 
 * Shared test helpers and mocks for the product-card component suite.
 * Follows the six-layer architecture pattern with proper TypeScript types.
 * 
 * Layer: Config (Test Configuration)
 */

import { render, RenderOptions, RenderResult } from '@testing-library/react';
import React, { ReactElement, ReactNode } from 'react';
import { ProductCardProps, ProductStatus } from '../../types/product.types';

// =============================================================================
// TYPES (Layer 1: Types)
// =============================================================================

/**
 * Configuration options for mock product generation
 */
interface MockProductOptions {
  /** Override default product ID */
  id?: string;
  /** Override default product name */
  name?: string;
  /** Override default product status */
  status?: ProductStatus;
  /** Override default price */
  price?: number;
  /** Include optional description */
  description?: string;
  /** Simulate error state */
  hasError?: boolean;
}

/**
 * Extended render options with custom providers
 */
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Mock product data to inject */
  initialProduct?: Partial<ProductCardProps>;
  /** Simulate loading state */
  isLoading?: boolean;
}

/**
 * Result of custom render with additional utilities
 */
interface CustomRenderResult extends RenderResult {
  /** Get the mock product data used in render */
  getMockProduct: () => ProductCardProps;
}

// =============================================================================
// MOCK FACTORIES (Layer 2: Config)
// =============================================================================

/**
 * Default mock product with valid data
 * Invariant: All required fields must be populated
 */
const DEFAULT_MOCK_PRODUCT: ProductCardProps = {
  id: 'prod-test-001',
  name: 'Test Product',
  status: ProductStatus.ACTIVE,
  price: 99.99,
  description: 'A test product for unit testing',
  onStatusChange: jest.fn(),
  onDelete: jest.fn(),
};

/**
 * Creates a mock product with configurable overrides
 * 
 * @param options - Configuration options for mock generation
 * @returns Valid ProductCardProps with applied overrides
 * @throws Never - Returns safe defaults for all undefined values
 */
export function createMockProduct(options: MockProductOptions = {}): ProductCardProps {
  // Validate input to prevent injection of invalid status values
  const validatedStatus = Object.values(ProductStatus).includes(options.status as ProductStatus)
    ? options.status
    : DEFAULT_MOCK_PRODUCT.status;

  return {
    ...DEFAULT_MOCK_PRODUCT,
    id: options.id ?? `prod-test-${Math.random().toString(36).substr(2, 9)}`,
    name: options.name ?? DEFAULT_MOCK_PRODUCT.name,
    status: validatedStatus as ProductStatus,
    price: options.price ?? DEFAULT_MOCK_PRODUCT.price,
    description: options.description ?? DEFAULT_MOCK_PRODUCT.description,
    // Always provide fresh mock functions to prevent test pollution
    onStatusChange: jest.fn(),
    onDelete: jest.fn(),
  };
}

/**
 * Collection of edge-case mock products for boundary testing
 */
export const EDGE_CASE_PRODUCTS = {
  /** Product with minimum valid price */
  minimumPrice: createMockProduct({ price: 0.01 }),
  
  /** Product with maximum realistic price */
  maximumPrice: createMockProduct({ price: 999999.99 }),
  
  /** Product with empty description */
  noDescription: createMockProduct({ description: '' }),
  
  /** Product with very long name */
  longName: createMockProduct({ 
    name: 'A'.repeat(200) 
  }),
  
  /** Product in archived status */
  archived: createMockProduct({ 
    status: ProductStatus.ARCHIVED 
  }),
  
  /** Product in pending status */
  pending: createMockProduct({ 
    status: ProductStatus.PENDING 
  }),
} as const;

// =============================================================================
// TEST WRAPPER (Layer 5: Runtime - Test Environment)
// =============================================================================

/**
 * Test wrapper component providing required context providers
 */
interface TestWrapperProps {
  children: ReactNode;
  initialProduct?: Partial<ProductCardProps>;
  isLoading?: boolean;
}

const TestWrapper: React.FC<TestWrapperProps> = ({ 
  children, 
  initialProduct,
  isLoading = false,
}) => {
  // In a real implementation, this would wrap with:
  // - ThemeProvider
  // - QueryClientProvider (for React Query)
  // - Router context
  // - Any other required providers
  
  if (isLoading) {
    return (
      <div data-testid="loading-skeleton">
        {children}
      </div>
    );
  }

  return <>{children}</>;
};

// =============================================================================
// CUSTOM RENDER (Layer 6: UI - Test Interface)
// =============================================================================

/**
 * Custom render function with test utilities
 * 
 * @param ui - Component to render
 * @param options - Custom render configuration
 * @returns Render result with extended utilities
 */
export function renderWithProduct(
  ui: ReactElement,
  options: CustomRenderOptions = {}
): CustomRenderResult {
  const { initialProduct, isLoading, ...renderOptions } = options;
  
  // Generate stable mock product for this render
  const mockProduct = createMockProduct(initialProduct);

  const Wrapper: React.FC<{ children: ReactNode }> = ({ children }) => (
    <TestWrapper 
      initialProduct={initialProduct} 
      isLoading={isLoading}
    >
      {children}
    </TestWrapper>
  );

  const result = render(ui, {
    wrapper: Wrapper,
    ...renderOptions,
  });

  return {
    ...result,
    getMockProduct: () => mockProduct,
  };
}

// =============================================================================
// ASYNC HELPERS (Layer 3: Service - Test Services)
// =============================================================================

/**
 * Waits for async operations with proper error handling
 * 
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after delay
 */
export function waitForAsync(ms: number = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simulates a failed API call for error boundary testing
 * 
 * @param message - Error message to throw
 * @returns Never - Always throws
 */
export function simulateApiError(message: string = 'Test API Error'): never {
  const error = new Error(message);
  error.name = 'TestApiError';
  // Preserve stack trace for debugging
  Error.captureStackTrace?.(error, simulateApiError);
  throw error;
}

// =============================================================================
// MATCHERS & ASSERTIONS (Layer 4: Service - Test Assertions)
// =============================================================================

/**
 * Custom matchers for product-specific assertions
 */
export const productMatchers = {
  /**
   * Asserts that element displays correct price formatting
   */
  toHaveFormattedPrice: (element: HTMLElement, expectedPrice: number): boolean => {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(expectedPrice);
    
    return element.textContent?.includes(formatted) ?? false;
  },

  /**
   * Asserts that product has required accessibility attributes
   */
  toHaveProductAccessibility: (element: HTMLElement): boolean => {
    const hasRole = element.getAttribute('role') === 'article';
    const hasLabel = element.getAttribute('aria-label')?.includes('Product') ?? false;
    return hasRole && hasLabel;
  },
};

// =============================================================================
// ERROR HANDLING UTILITIES
// =============================================================================

/**
 * Safely executes test callback with error logging
 * 
 * @param testFn - Test function to execute
 * @param context - Additional context for error logging
 */
export async function safeTest(
  testFn: () => Promise<void> | void,
  context: string = 'unknown test'
): Promise<void> {
  try {
    await testFn();
  } catch (error) {
    // Structured logging for test failures
    const errorInfo = {
      context,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : String(error),
    };
    
    // In test environment, log to stderr for visibility
    process.stderr.write(`[TEST ERROR] ${JSON.stringify(errorInfo, null, 2)}\n`);
    throw error; // Re-throw to fail test
  }
}

// =============================================================================
// EXPORT CONVENIENCE OBJECT
// =============================================================================

/**
 * Consolidated test utilities export
 */
export const TestUtils = {
  createMockProduct,
  renderWithProduct,
  waitForAsync,
  simulateApiError,
  matchers: productMatchers,
  edgeCases: EDGE_CASE_PRODUCTS,
  safeTest,
} as const;

// Type exports for consumer modules
export type {
  MockProductOptions,
  CustomRenderOptions,
  CustomRenderResult,
  TestWrapperProps,
};