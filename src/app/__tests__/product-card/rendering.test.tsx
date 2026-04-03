/**
 * @fileoverview Rendering tests for ProductCard component
 * @module src/app/__tests__/product-card/rendering.test
 * 
 * Tests basic rendering scenarios for the ProductCard component following
 * the six-layer architecture: Types → Config → Repo → Service → Runtime → UI
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ProductCard } from '@/app/components/product-card';
import { ProductCardTypes } from '@/app/types/product-card.types';
import { TestConfig } from '@/app/config/test.config';
import { StructuredLogger } from '@/app/services/logging/structured-logger.service';

// ============================================================================
// Types Layer - Test-specific type definitions
// ============================================================================

/**
 * Test scenario configuration for rendering tests
 */
interface RenderingTestScenario {
  readonly name: string;
  readonly props: ProductCardTypes.Props;
  readonly expected: {
    readonly elements: readonly string[];
    readonly visibility: boolean;
  };
}

// ============================================================================
// Config Layer - Test configuration and constants
// ============================================================================

const TEST_CONFIG = {
  ...TestConfig,
  componentName: 'ProductCard',
  testModule: 'rendering',
  timeouts: {
    render: 5000,
    async: 3000,
  },
} as const;

const MOCK_LOGGER = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as StructuredLogger;

// ============================================================================
// Repo Layer - Test data and fixtures
// ============================================================================

const VALID_PRODUCT: ProductCardTypes.Product = {
  id: 'prod-001',
  name: 'Premium Wireless Headphones',
  price: 299.99,
  currency: 'USD',
  imageUrl: 'https://cdn.example.com/images/headphones.jpg',
  rating: 4.5,
  reviewCount: 128,
  inStock: true,
  badge: 'BESTSELLER',
} as const;

const MINIMAL_PRODUCT: ProductCardTypes.Product = {
  id: 'prod-002',
  name: 'Basic USB Cable',
  price: 9.99,
  currency: 'USD',
  imageUrl: 'https://cdn.example.com/images/cable.jpg',
  inStock: true,
} as const;

const OUT_OF_STOCK_PRODUCT: ProductCardTypes.Product = {
  ...VALID_PRODUCT,
  id: 'prod-003',
  inStock: false,
} as const;

const RENDERING_SCENARIOS: readonly RenderingTestScenario[] = [
  {
    name: 'renders complete product with all optional fields',
    props: { product: VALID_PRODUCT, logger: MOCK_LOGGER },
    expected: {
      elements: ['image', 'name', 'price', 'rating', 'badge', 'stock-indicator'],
      visibility: true,
    },
  },
  {
    name: 'renders minimal product with required fields only',
    props: { product: MINIMAL_PRODUCT, logger: MOCK_LOGGER },
    expected: {
      elements: ['image', 'name', 'price', 'stock-indicator'],
      visibility: true,
    },
  },
  {
    name: 'renders out of stock state correctly',
    props: { product: OUT_OF_STOCK_PRODUCT, logger: MOCK_LOGGER },
    expected: {
      elements: ['out-of-stock-overlay', 'disabled-actions'],
      visibility: true,
    },
  },
] as const;

// ============================================================================
// Service Layer - Test utilities and helpers
// ============================================================================

/**
 * Validates product data before rendering to prevent runtime errors
 * @param product - Product data to validate
 * @throws {ProductCardTypes.ValidationError} When required fields are missing
 */
function validateProductData(product: unknown): asserts product is ProductCardTypes.Product {
  const requiredFields: readonly (keyof ProductCardTypes.Product)[] = [
    'id',
    'name',
    'price',
    'currency',
    'imageUrl',
    'inStock',
  ];

  if (!product || typeof product !== 'object') {
    throw new ProductCardTypes.ValidationError('Product must be an object');
  }

  const missingFields = requiredFields.filter(
    field => !(field in product) || (product as Record<string, unknown>)[field] === undefined
  );

  if (missingFields.length > 0) {
    throw new ProductCardTypes.ValidationError(
      `Missing required fields: ${missingFields.join(', ')}`
    );
  }

  // Validate price is non-negative
  const price = (product as ProductCardTypes.Product).price;
  if (typeof price !== 'number' || price < 0 || !Number.isFinite(price)) {
    throw new ProductCardTypes.ValidationError('Price must be a non-negative finite number');
  }
}

/**
 * Renders ProductCard with error boundary for safe test execution
 */
function renderWithErrorBoundary(props: ProductCardTypes.Props): ReturnType<typeof render> {
  try {
    validateProductData(props.product);
    return render(<ProductCard {...props} />);
  } catch (error) {
    MOCK_LOGGER.error('Failed to render ProductCard', {
      error: error instanceof Error ? error.message : String(error),
      productId: (props.product as ProductCardTypes.Product | undefined)?.id,
    });
    throw error;
  }
}

// ============================================================================
// Runtime Layer - Test execution
// ============================================================================

describe(`${TEST_CONFIG.componentName} - ${TEST_CONFIG.testModule}`, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    RENDERING_SCENARIOS.forEach(scenario => {
      it(scenario.name, () => {
        // Act: Render component with scenario props
        const { container } = renderWithErrorBoundary(scenario.props);

        // Assert: Verify all expected elements are present
        scenario.expected.elements.forEach(elementTestId => {
          const element = screen.queryByTestId(`product-card-${elementTestId}`);
          expect(element).toBeInTheDocument();
        });

        // Verify logger was called for render tracking
        expect(MOCK_LOGGER.debug).toHaveBeenCalledWith(
          'ProductCard rendered',
          expect.objectContaining({
            productId: scenario.props.product.id,
            hasBadge: !!scenario.props.product.badge,
          })
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('throws validation error for null product', () => {
      // Arrange: Invalid props
      const invalidProps = {
        product: null as unknown as ProductCardTypes.Product,
        logger: MOCK_LOGGER,
      };

      // Act & Assert: Expect validation to throw
      expect(() => renderWithErrorBoundary(invalidProps)).toThrow(
        ProductCardTypes.ValidationError
      );
      expect(MOCK_LOGGER.error).toHaveBeenCalled();
    });

    it('throws validation error for missing required fields', () => {
      // Arrange: Product missing required 'price' field
      const invalidProduct = {
        id: 'invalid',
        name: 'Invalid Product',
        // price is missing
        currency: 'USD',
        imageUrl: 'https://example.com/image.jpg',
        inStock: true,
      } as unknown as ProductCardTypes.Product;

      // Act & Assert
      expect(() => renderWithErrorBoundary({
        product: invalidProduct,
        logger: MOCK_LOGGER,
      })).toThrow('Missing required fields: price');
    });

    it('throws validation error for negative price', () => {
      // Arrange: Product with invalid price
      const invalidProduct = {
        ...MINIMAL_PRODUCT,
        price: -10.99,
      };

      // Act & Assert
      expect(() => renderWithErrorBoundary({
        product: invalidProduct,
        logger: MOCK_LOGGER,
      })).toThrow('Price must be a non-negative finite number');
    });

    it('handles image loading error gracefully', () => {
      // Arrange: Spy on image error handler
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Act: Render with broken image URL
      const productWithBrokenImage = {
        ...VALID_PRODUCT,
        imageUrl: 'https://invalid-url/image.jpg',
      };

      renderWithErrorBoundary({
        product: productWithBrokenImage,
        logger: MOCK_LOGGER,
        onImageError: vi.fn(),
      });

      // Assert: Component should still render without image
      expect(screen.getByTestId('product-card-name')).toHaveTextContent(productWithBrokenImage.name);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Accessibility', () => {
    it('renders with proper ARIA attributes', () => {
      // Act
      renderWithErrorBoundary({
        product: VALID_PRODUCT,
        logger: MOCK_LOGGER,
      });

      // Assert: Verify accessibility attributes
      const card = screen.getByRole('article');
      expect(card).toHaveAttribute('aria-label', expect.stringContaining(VALID_PRODUCT.name));
      
      const image = screen.getByRole('img');
      expect(image).toHaveAttribute('alt', expect.stringContaining(VALID_PRODUCT.name));
    });

    it('announces out of stock status to screen readers', () => {
      // Act
      renderWithErrorBoundary({
        product: OUT_OF_STOCK_PRODUCT,
        logger: MOCK_LOGGER,
      });

      // Assert
      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveTextContent(/out of stock|unavailable/i);
    });
  });

  describe('Performance', () => {
    it('renders within acceptable time threshold', async () => {
      // Act: Measure render time
      const startTime = performance.now();
      
      renderWithErrorBoundary({
        product: VALID_PRODUCT,
        logger: MOCK_LOGGER,
      });
      
      const renderTime = performance.now() - startTime;

      // Assert: Render should complete within timeout
      expect(renderTime).toBeLessThan(TEST_CONFIG.timeouts.render);
      
      MOCK_LOGGER.info('Render performance measured', {
        renderTimeMs: renderTime,
        productId: VALID_PRODUCT.id,
      });
    });
  });
});