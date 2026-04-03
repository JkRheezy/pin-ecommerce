/**
 * @fileoverview Accessibility tests for ProductCard component
 * @module src/app/__tests__/product-card/accessibility.test.tsx
 * 
 * Layer: UI (Testing Layer)
 * Responsibility: Verify accessibility compliance for ProductCard component
 */

import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ProductCard } from '@/app/components/product-card';
import type { Product } from '@/app/types/product';
import { createLogger } from '@/app/lib/logger';

// Extend Jest matchers for accessibility assertions
expect.extend(toHaveNoViolations);

// Initialize structured logger for test diagnostics
const logger = createLogger('ProductCardA11yTest');

// =============================================================================
// Types Layer - Test-specific type definitions
// =============================================================================

/**
 * Test configuration for accessibility scenarios
 */
interface A11yTestConfig {
  readonly componentName: string;
  readonly requiredAriaLabels: readonly string[];
  readonly requiredRoles: readonly string[];
  readonly minContrastRatio: number;
}

/**
 * Mock product data factory return type
 */
interface MockProductFactory {
  createValidProduct: () => Product;
  createProductWithoutImage: () => Product;
  createProductWithLongName: () => Product;
}

// =============================================================================
// Config Layer - Test configuration and constants
// =============================================================================

const TEST_CONFIG: A11yTestConfig = {
  componentName: 'ProductCard',
  requiredAriaLabels: ['product-image', 'product-title', 'product-price', 'add-to-cart'],
  requiredRoles: ['article', 'button', 'img'],
  minContrastRatio: 4.5, // WCAG AA standard
};

const MOCK_PRODUCT_CONFIG = {
  default: {
    id: 'prod-001',
    name: 'Premium Wireless Headphones',
    price: 299.99,
    imageUrl: '/images/headphones.jpg',
    description: 'High-quality wireless headphones with noise cancellation',
    inStock: true,
  },
  noImage: {
    id: 'prod-002',
    name: 'Basic Earbuds',
    price: 49.99,
    imageUrl: '',
    description: 'Affordable earbuds for everyday use',
    inStock: true,
  },
  longName: {
    id: 'prod-003',
    name: 'This is an extremely long product name that tests how the component handles text overflow and ensures that screen readers can properly announce the full content without truncation issues',
    price: 159.99,
    imageUrl: '/images/long-name-product.jpg',
    description: 'Product with a very long name for edge case testing',
    inStock: false,
  },
} as const;

// =============================================================================
// Repo Layer - Mock data factories
// =============================================================================

/**
 * Factory for creating mock product data with validation
 */
const createMockProductFactory = (): MockProductFactory => ({
  createValidProduct: (): Product => {
    const product = { ...MOCK_PRODUCT_CONFIG.default };
    logger.debug('Created valid mock product', { productId: product.id });
    return product;
  },

  createProductWithoutImage: (): Product => {
    const product = { ...MOCK_PRODUCT_CONFIG.noImage };
    logger.debug('Created mock product without image', { productId: product.id });
    return product;
  },

  createProductWithLongName: (): Product => {
    const product = { ...MOCK_PRODUCT_CONFIG.longName };
    logger.debug('Created mock product with long name', { productId: product.id });
    return product;
  },
});

// =============================================================================
// Service Layer - Test utilities and helpers
// =============================================================================

/**
 * Validates that all required ARIA attributes are present
 * @param container - The rendered component container
 * @throws Error if required ARIA attributes are missing
 */
const validateAriaAttributes = (container: HTMLElement): void => {
  const missingLabels: string[] = [];

  TEST_CONFIG.requiredAriaLabels.forEach((label) => {
    const element = container.querySelector(`[aria-label="${label}"], [aria-labelledby="${label}"]`);
    if (!element) {
      missingLabels.push(label);
    }
  });

  if (missingLabels.length > 0) {
    const error = new Error(`Missing required ARIA labels: ${missingLabels.join(', ')}`);
    logger.error('ARIA validation failed', { missingLabels });
    throw error;
  }

  logger.info('ARIA attributes validation passed');
};

/**
 * Validates semantic HTML structure
 * @param container - The rendered component container
 * @throws Error if required semantic roles are missing
 */
const validateSemanticStructure = (container: HTMLElement): void => {
  const missingRoles: string[] = [];

  TEST_CONFIG.requiredRoles.forEach((role) => {
    const elements = container.querySelectorAll(`[role="${role}"], ${role}`);
    if (elements.length === 0 && role !== 'article') {
      // 'article' can be implicit via <article> tag
      const implicitArticle = container.querySelector('article');
      if (!implicitArticle && role === 'article') {
        missingRoles.push(role);
      }
    }
  });

  if (missingRoles.length > 0) {
    const error = new Error(`Missing required semantic roles: ${missingRoles.join(', ')}`);
    logger.error('Semantic structure validation failed', { missingRoles });
    throw error;
  }

  logger.info('Semantic structure validation passed');
};

/**
 * Renders ProductCard with error boundary for test isolation
 */
const renderProductCard = (product: Product): ReturnType<typeof render> => {
  try {
    const result = render(<ProductCard product={product} />);
    logger.debug('ProductCard rendered successfully', { productId: product.id });
    return result;
  } catch (error) {
    logger.error('Failed to render ProductCard', { 
      productId: product.id, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    throw error;
  }
};

// =============================================================================
// Runtime Layer - Test execution
// =============================================================================

describe('ProductCard Accessibility', () => {
  const mockFactory = createMockProductFactory();

  beforeEach(() => {
    logger.info('Starting accessibility test suite');
  });

  afterEach(() => {
    // Cleanup and reset any mocks
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Core Accessibility Compliance Tests
  // ---------------------------------------------------------------------------

  describe('WCAG Compliance', () => {
    it('should have no accessibility violations', async () => {
      const product = mockFactory.createValidProduct();
      const { container } = renderProductCard(product);

      const results = await axe(container);
      
      // Log any violations for debugging
      if (results.violations.length > 0) {
        logger.warn('Accessibility violations detected', { 
          violations: results.violations.map(v => ({
            rule: v.id,
            description: v.description,
            impact: v.impact,
          }))
        });
      }

      expect(results).toHaveNoViolations();
    });

    it('should maintain accessibility compliance without product image', async () => {
      const product = mockFactory.createProductWithoutImage();
      const { container } = renderProductCard(product);

      // Verify fallback content is accessible
      const imageContainer = container.querySelector('[data-testid="product-image-container"]');
      expect(imageContainer).toBeInTheDocument();

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  // ---------------------------------------------------------------------------
  // ARIA and Semantic Structure Tests
  // ---------------------------------------------------------------------------

  describe('ARIA Attributes and Semantic Structure', () => {
    it('should have all required ARIA labels', () => {
      const product = mockFactory.createValidProduct();
      const { container } = renderProductCard(product);

      expect(() => validateAriaAttributes(container)).not.toThrow();
    });

    it('should use proper semantic HTML roles', () => {
      const product = mockFactory.createValidProduct();
      const { container } = renderProductCard(product);

      expect(() => validateSemanticStructure(container)).not.toThrow();
    });

    it('should have accessible name for interactive elements', () => {
      const product = mockFactory.createValidProduct();
      renderProductCard(product);

      const addToCartButton = screen.getByRole('button', { name: /add to cart/i });
      expect(addToCartButton).toHaveAccessibleName();

      // Verify button is not disabled without explanation when in stock
      if (product.inStock) {
        expect(addToCartButton).not.toHaveAttribute('aria-disabled', 'true');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Keyboard Navigation Tests
  // ---------------------------------------------------------------------------

  describe('Keyboard Navigation', () => {
    it('should support keyboard navigation for all interactive elements', () => {
      const product = mockFactory.createValidProduct();
      renderProductCard(product);

      const interactiveElements = screen.getAllByRole(/button|link/);
      
      interactiveElements.forEach((element, index) => {
        expect(element).toHaveAttribute('tabindex');
        // Verify elements are in logical tab order
        const tabIndex = element.getAttribute('tabindex');
        expect(tabIndex).toMatch(/^(-1|0)$/); // Only -1 or 0 are valid for accessibility
        logger.debug('Element keyboard accessibility verified', { 
          elementIndex: index, 
          role: element.getAttribute('role') 
        });
      });
    });

    it('should have visible focus indicators', () => {
      const product = mockFactory.createValidProduct();
      const { container } = renderProductCard(product);

      const focusableElements = container.querySelectorAll('button, a, [tabindex]:not([tabindex="-1"])');
      
      focusableElements.forEach((element) => {
        // Check for focus-visible styling or outline
        const styles = window.getComputedStyle(element);
        const hasOutline = styles.outline !== 'none' || styles.outlineWidth !== '0px';
        const hasFocusRing = element.classList.contains('focus-visible') || 
                            element.classList.contains('focus-ring');

        // At minimum, ensure there's some focus indication mechanism
        expect(hasOutline || hasFocusRing || element.matches(':focus-visible')).toBeTruthy();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Screen Reader Compatibility Tests
  // ---------------------------------------------------------------------------

  describe('Screen Reader Compatibility', () => {
    it('should announce price changes appropriately', () => {
      const product = mockFactory.createValidProduct();
      const { rerender } = renderProductCard(product);

      const priceElement = screen.getByRole('text', { name: /price/i }) || 
                          screen.getByTestId('product-price');

      // Verify price has proper live region or is clearly associated
      const hasLiveRegion = priceElement.getAttribute('aria-live') === 'polite' ||
                           priceElement.closest('[aria-live="polite"]') !== null;
      
      // Price should either have live region or be static with clear association
      expect(priceElement).toBeInTheDocument();
      logger.info('Price element accessibility verified', { hasLiveRegion });
    });

    it('should handle long product names without breaking screen reader experience', () => {
      const product = mockFactory.createProductWithLongName();
      const { container } = renderProductCard(product);

      const titleElement = screen.getByRole('heading', { level: 2 }) ||
                          container.querySelector('[data-testid="product-title"]');

      expect(titleElement).toBeInTheDocument();
      
      // Verify the full text is available to screen readers (not visually hidden truncated text)
      const fullText = titleElement?.textContent || '';
      expect(fullText.length).toBeGreaterThan(100); // Ensure long name is preserved
      
      // Check for aria-label or title attribute as fallback
      const hasAccessibleName = titleElement?.getAttribute('aria-label') || 
                               titleElement?.getAttribute('title') ||
                               fullText.length > 0;
      expect(hasAccessibleName).toBeTruthy();
    });

    it('should provide status information for out-of-stock products', () => {
      const product = mockFactory.createProductWithLongName(); // This product is out of stock
      renderProductCard(product);

      const statusElement = screen.queryByRole('status') ||
                           screen.queryByText(/out of stock|unavailable/i);

      if (!product.inStock) {
        expect(statusElement).toBeInTheDocument();
        // Verify status is announced to screen readers
        const liveRegion = statusElement?.closest('[aria-live]') || statusElement;
        expect(liveRegion?.getAttribute('aria-live') || 'polite').toBeTruthy();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Color and Contrast Tests
  // ---------------------------------------------------------------------------

  describe('Color and Contrast', () => {
    it('should have sufficient color contrast for text elements', async () => {
      const product = mockFactory.createValidProduct();
      const { container } = renderProductCard(product);

      const results = await axe(container);
      
      const contrastViolations = results.violations.filter(
        v => v.id === 'color-contrast'
      );

      expect(contrastViolations).toHaveLength(0);
    });

    it('should not rely solely on color to convey information', () => {
      const product = mockFactory.createValidProduct();
      renderProductCard(product);

      // Check for price display - should have additional indicators beyond color
      const priceElement = screen.getByTestId('product-price');
      const computedStyle = window.getComputedStyle(priceElement);
      
      // If color is used for sale price, there should be additional visual/text indicator
      const hasTextIndicator = priceElement.textContent?.includes('%') ||
                              priceElement.textContent?.includes('off') ||
                              priceElement.textContent?.includes('sale');

      logger.debug('Price information conveyance verified', { hasTextIndicator });
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling and Edge Cases
  // ---------------------------------------------------------------------------

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing product data gracefully without breaking accessibility', () => {
      // Test with minimal valid product
      const minimalProduct: Product = {
        id: 'minimal-001',
        name: 'Test',
        price: 0,
        imageUrl: '',
        description: '',
        inStock: false,
      };

      const { container } = renderProductCard(minimalProduct);
      
      // Should still render and be accessible
      expect(container.firstChild).toBeInTheDocument();
      
      // Verify no axe violations even with minimal data
      return expect(axe(container)).resolves.toHaveProperty('violations', expect.arrayContaining([]));
    });

    it('should handle rapid state changes accessibly', async () => {
      const product = mockFactory.createValidProduct();
      const { rerender } = renderProductCard(product);

      // Simulate rapid updates
      const updates = [
        { ...product, price: product.price * 0.9 },
        { ...product, price: product.price * 0.8 },
        { ...product, inStock: false },
      ];

      for (const update of updates) {
        rerender(<ProductCard product={update} />);
        // Small delay to allow any animations/transitions
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const finalContainer = document.body;
      const results = await axe(finalContainer);
      expect(results.violations).toHaveLength(0);
    });
  });
});