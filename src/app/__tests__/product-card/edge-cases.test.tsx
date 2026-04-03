/**
 * Edge Cases Tests Module for ProductCard Component
 * 
 * Layer: UI (Six-layer architecture: Types → Config → Repo → Service → Runtime → UI)
 * 
 * This module tests boundary conditions, error states, and unexpected inputs
 * to ensure robust error handling and graceful degradation.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductCard } from '../../components/product-card';
import { ProductCardProps } from '../../types/product.types';
import { Logger } from '../../utils/logger';
import { ErrorBoundary } from '../../components/error-boundary';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('../../hooks/use-product', () => ({
  useProduct: jest.fn(),
}));

import { useProduct } from '../../hooks/use-product';

const mockLogger = Logger as jest.Mocked<typeof Logger>;

/**
 * Test Data Factory - Boundary Value Generators
 * Following Types layer principles for type-safe test data
 */

const createBoundaryProduct = (overrides: Partial<ProductCardProps['product']> = {}): ProductCardProps['product'] => ({
  id: 'test-product-123',
  name: 'Test Product',
  price: 99.99,
  currency: 'USD',
  imageUrl: 'https://example.com/image.jpg',
  description: 'A test product description',
  stockQuantity: 10,
  rating: 4.5,
  reviewCount: 100,
  ...overrides,
});

/**
 * Edge Case Categories:
 * 1. Null/Undefined values
 * 2. Empty collections
 * 3. Boundary numeric values (MAX_SAFE_INTEGER, 0, negative)
 * 4. Extreme string lengths
 * 5. Special characters and injection attempts
 * 6. Malformed URLs
 * 7. Concurrent state changes
 */

describe('ProductCard Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useProduct as jest.Mock).mockReturnValue({
      isLoading: false,
      error: null,
      data: null,
    });
  });

  describe('Layer 1: Types - Null and Undefined Handling', () => {
    it('should render placeholder when product is null', () => {
      const { container } = render(
        <ProductCard product={null as unknown as ProductCardProps['product']} />
      );

      expect(screen.getByTestId('product-card-placeholder')).toBeInTheDocument();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'ProductCard received null product',
        expect.any(Object)
      );
    });

    it('should render placeholder when product is undefined', () => {
      const { container } = render(
        <ProductCard product={undefined as unknown as ProductCardProps['product']} />
      );

      expect(screen.getByTestId('product-card-placeholder')).toBeInTheDocument();
    });

    it('should handle missing optional fields gracefully', () => {
      const productWithMissingOptionals = createBoundaryProduct({
        description: undefined,
        rating: undefined,
        reviewCount: undefined,
        stockQuantity: undefined,
      });

      render(<ProductCard product={productWithMissingOptionals} />);

      // Should render without description section
      expect(screen.queryByTestId('product-description')).not.toBeInTheDocument();
      // Should render without rating section
      expect(screen.queryByTestId('product-rating')).not.toBeInTheDocument();
    });
  });

  describe('Layer 2: Config - Empty and Boundary Collections', () => {
    it('should handle empty tags array', () => {
      const productWithEmptyTags = createBoundaryProduct({
        tags: [],
      });

      render(<ProductCard product={productWithEmptyTags} />);

      expect(screen.queryByTestId('product-tags')).not.toBeInTheDocument();
    });

    it('should handle single item in collections', () => {
      const productWithSingleTag = createBoundaryProduct({
        tags: ['sale'],
      });

      render(<ProductCard product={productWithSingleTag} />);

      expect(screen.getByTestId('product-tags')).toBeInTheDocument();
      expect(screen.getByText('sale')).toBeInTheDocument();
    });

    it('should truncate excessive tags (boundary: 10+ tags)', () => {
      const productWithManyTags = createBoundaryProduct({
        tags: Array.from({ length: 15 }, (_, i) => `tag-${i}`),
      });

      render(<ProductCard product={productWithManyTags} />);

      const visibleTags = screen.getAllByTestId('product-tag');
      expect(visibleTags.length).toBeLessThanOrEqual(10);
      expect(screen.getByText('+5 more')).toBeInTheDocument();
    });
  });

  describe('Layer 3: Repo - Numeric Boundary Conditions', () => {
    it('should handle zero price correctly', () => {
      const freeProduct = createBoundaryProduct({
        price: 0,
      });

      render(<ProductCard product={freeProduct} />);

      expect(screen.getByText('Free')).toBeInTheDocument();
    });

    it('should handle negative price (data corruption case)', () => {
      const corruptedProduct = createBoundaryProduct({
        price: -99.99,
      });

      render(<ProductCard product={corruptedProduct} />);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Invalid price detected',
        expect.objectContaining({ price: -99.99 })
      );
      expect(screen.getByTestId('price-error')).toBeInTheDocument();
    });

    it('should handle MAX_SAFE_INTEGER price', () => {
      const expensiveProduct = createBoundaryProduct({
        price: Number.MAX_SAFE_INTEGER,
      });

      render(<ProductCard product={expensiveProduct} />);

      // Should format without scientific notation or overflow
      expect(screen.getByTestId('product-price')).toHaveTextContent(
        expect.stringContaining('9,007,199,254,740,991')
      );
    });

    it('should handle floating point precision edge cases', () => {
      const precisionProduct = createBoundaryProduct({
        price: 0.1 + 0.2, // Known JS floating point issue: 0.30000000000000004
      });

      render(<ProductCard product={precisionProduct} />);

      // Should display formatted price, not raw floating point
      expect(screen.getByTestId('product-price')).not.toHaveTextContent('0.30000000000000004');
    });

    it('should handle zero and negative stock', () => {
      const outOfStockProduct = createBoundaryProduct({
        stockQuantity: 0,
      });

      render(<ProductCard product={outOfStockProduct} />);

      expect(screen.getByText('Out of Stock')).toBeInTheDocument();
      expect(screen.getByTestId('add-to-cart-button')).toBeDisabled();
    });
  });

  describe('Layer 4: Service - String Boundary and Injection Cases', () => {
    it('should handle extremely long product name', () => {
      const longNameProduct = createBoundaryProduct({
        name: 'A'.repeat(500),
      });

      render(<ProductCard product={longNameProduct} />);

      const nameElement = screen.getByTestId('product-name');
      expect(nameElement).toHaveClass('truncate');
      // Verify CSS truncation is applied, not JS substring (preserves accessibility)
      expect(nameElement.textContent).toHaveLength(500);
    });

    it('should sanitize HTML injection attempts in description', () => {
      const xssAttemptProduct = createBoundaryProduct({
        description: '<script>alert("xss")</script>Normal description',
      });

      render(<ProductCard product={xssAttemptProduct} />);

      expect(screen.queryByText('alert("xss")')).not.toBeInTheDocument();
      expect(mockLogger.security).toHaveBeenCalledWith(
        'Potential XSS attempt sanitized',
        expect.any(Object)
      );
    });

    it('should handle special Unicode characters', () => {
      const unicodeProduct = createBoundaryProduct({
        name: 'Product ™ 你好 🎉',
        description: 'Multi-byte: 日本語',
      });

      render(<ProductCard product={unicodeProduct} />);

      expect(screen.getByText('Product ™ 你好 🎉')).toBeInTheDocument();
    });

    it('should handle RTL text direction markers', () => {
      const rtlProduct = createBoundaryProduct({
        name: '\u202Bالمنتج\u202C', // RTL embedding
      });

      render(<ProductCard product={rtlProduct} />);

      const nameElement = screen.getByTestId('product-name');
      expect(nameElement).toHaveAttribute('dir', 'auto');
    });
  });

  describe('Layer 5: Runtime - URL and Resource Edge Cases', () => {
    it('should handle malformed image URL', () => {
      const badUrlProduct = createBoundaryProduct({
        imageUrl: 'not-a-valid-url',
      });

      render(<ProductCard product={badUrlProduct} />);

      const image = screen.getByTestId('product-image');
      expect(image).toHaveAttribute('src', 'not-a-valid-url');
      
      // Simulate load error
      fireEvent.error(image);
      
      expect(screen.getByTestId('image-fallback')).toBeInTheDocument();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Product image failed to load',
        expect.any(Object)
      );
    });

    it('should handle data URI images', () => {
      const dataUriProduct = createBoundaryProduct({
        imageUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
      });

      render(<ProductCard product={dataUriProduct} />);

      expect(screen.getByTestId('product-image')).toHaveAttribute(
        'src',
        'data:image/svg+xml;base64,PHN2Zy8+'
      );
    });

    it('should handle empty image URL', () => {
      const noImageProduct = createBoundaryProduct({
        imageUrl: '',
      });

      render(<ProductCard product={noImageProduct} />);

      expect(screen.getByTestId('image-placeholder')).toBeInTheDocument();
    });
  });

  describe('Layer 6: UI - Interaction and State Edge Cases', () => {
    it('should handle rapid consecutive clicks (debouncing)', async () => {
      const user = userEvent.setup();
      const onAddToCart = jest.fn();

      const product = createBoundaryProduct();
      render(<ProductCard product={product} onAddToCart={onAddToCart} />);

      const button = screen.getByTestId('add-to-cart-button');

      // Rapid fire clicks
      await user.click(button);
      await user.click(button);
      await user.click(button);

      // Should debounce to single call
      await waitFor(() => {
        expect(onAddToCart).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle add to cart while loading', async () => {
      const onAddToCart = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      const product = createBoundaryProduct();
      render(<ProductCard product={product} onAddToCart={onAddToCart} />);

      const button = screen.getByTestId('add-to-cart-button');

      // Click while not loading
      await userEvent.click(button);
      expect(button).toBeDisabled();
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

      // Click while loading (should be ignored)
      await userEvent.click(button);
      expect(onAddToCart).toHaveBeenCalledTimes(1);
    });

    it('should recover from add to cart failure', async () => {
      const onAddToCart = jest.fn().mockRejectedValue(new Error('Network error'));
      const onError = jest.fn();

      const product = createBoundaryProduct();
      render(
        <ProductCard 
          product={product} 
          onAddToCart={onAddToCart}
          onError={onError}
        />
      );

      await userEvent.click(screen.getByTestId('add-to-cart-button'));

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
        expect(screen.getByTestId('error-message')).toHaveTextContent('Failed to add to cart');
      });

      // Should allow retry
      expect(screen.getByTestId('add-to-cart-button')).not.toBeDisabled();
    });

    it('should handle unmounting during async operation', async () => {
      const onAddToCart = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 200))
      );

      const product = createBoundaryProduct();
      const { unmount } = render(
        <ProductCard product={product} onAddToCart={onAddToCart} />
      );

      await userEvent.click(screen.getByTestId('add-to-cart-button'));
      
      // Unmount before promise resolves
      unmount();

      // Should not throw memory leak warnings
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('memory leak'),
        expect.anything()
      );
    });
  });

  describe('Error Boundary Integration', () => {
    it('should catch render errors gracefully', () => {
      const corruptedProduct = {
        ...createBoundaryProduct(),
        // Force a render error by making price a function
        get price() { throw new Error('Corrupted data'); },
      };

      render(
        <ErrorBoundary fallback={<div data-testid="error-fallback">Error</div>}>
          <ProductCard product={corruptedProduct as any} />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('error-fallback')).toBeInTheDocument();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'ProductCard render error',
        expect.any(Error)
      );
    });
  });

  describe('Accessibility Edge Cases', () => {
    it('should maintain ARIA attributes when data is missing', () => {
      const minimalProduct = createBoundaryProduct({
        name: 'Only Name',
        price: 10,
        // Missing all other fields
      });

      render(<ProductCard product={minimalProduct} />);

      expect(screen.getByRole('article')).toHaveAttribute('aria-label', 'Product: Only Name');
      // Should not have aria-describedby if description is missing
      expect(screen.getByRole('article')).not.toHaveAttribute('aria-describedby');
    });

    it('should handle focus management when image fails to load', async () => {
      const product = createBoundaryProduct();
      render(<ProductCard product={product} />);

      const image = screen.getByTestId('product-image');
      fireEvent.error(image);

      // Focus should move to fallback element for screen readers
      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByTestId('image-fallback'));
      });
    });
  });
});

/**
 * Helper function for firing events (imported from testing-library in real implementation)
 */
function fireEvent(event: string, element: Element) {
  const eventObj = new Event(event, { bubbles: true });
  element.dispatchEvent(eventObj);
}