// Types Layer
interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  imageUrl: string;
  inStock: boolean;
  category: string;
}

interface ProductDisplayConfig {
  showPrice: boolean;
  showDescription: boolean;
  imageSize: 'small' | 'medium' | 'large';
  currencyCode: string;
}

interface ProductDisplayProps {
  product: Product;
  config: ProductDisplayConfig;
  onAddToCart?: (productId: string) => void;
  onViewDetails?: (productId: string) => void;
}

// Config Layer
const DEFAULT_PRODUCT_CONFIG: ProductDisplayConfig = {
  showPrice: true,
  showDescription: true,
  imageSize: 'medium',
  currencyCode: 'USD',
};

// Validation helper for product data
function validateProduct(product: unknown): product is Product {
  if (!product || typeof product !== 'object') {
    return false;
  }
  
  const p = product as Record<string, unknown>;
  
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.price === 'number' &&
    typeof p.description === 'string' &&
    typeof p.imageUrl === 'string' &&
    typeof p.inStock === 'boolean' &&
    typeof p.category === 'string'
  );
}

// Service Layer - Formatting utilities
function formatPrice(price: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    }).format(price);
  } catch (error) {
    // Fallback formatting if Intl fails
    return `$${price.toFixed(2)}`;
  }
}

function getImageSizeClass(size: ProductDisplayConfig['imageSize']): string {
  const sizeMap = {
    small: 'h-32 w-32',
    medium: 'h-48 w-48',
    large: 'h-64 w-64',
  };
  return sizeMap[size] || sizeMap.medium;
}

// Runtime Layer - Component (simplified for test context)
// This would normally be a React component, here we define the render logic for testing
function renderProductDisplay(props: ProductDisplayProps): string {
  const { product, config, onAddToCart, onViewDetails } = props;
  
  // Validate inputs at runtime
  if (!validateProduct(product)) {
    throw new Error('Invalid product data provided to ProductDisplay');
  }
  
  const mergedConfig = { ...DEFAULT_PRODUCT_CONFIG, ...config };
  const imageClass = getImageSizeClass(mergedConfig.imageSize);
  const formattedPrice = formatPrice(product.price, mergedConfig.currencyCode);
  
  // Build component output (simplified HTML representation for testing)
  const parts: string[] = [];
  
  parts.push(`<div class="product-card" data-product-id="${product.id}">`);
  parts.push(`  <img src="${product.imageUrl}" alt="${product.name}" class="${imageClass}" />`);
  parts.push(`  <h3 class="product-name">${product.name}</h3>`);
  
  if (mergedConfig.showPrice) {
    parts.push(`  <p class="product-price">${formattedPrice}</p>`);
  }
  
  if (mergedConfig.showDescription) {
    parts.push(`  <p class="product-description">${product.description}</p>`);
  }
  
  parts.push(`  <span class="product-stock-status">${product.inStock ? 'In Stock' : 'Out of Stock'}</span>`);
  
  if (onViewDetails) {
    parts.push(`  <button class="view-details-btn" data-action="view-details">View Details</button>`);
  }
  
  if (onAddToCart && product.inStock) {
    parts.push(`  <button class="add-to-cart-btn" data-action="add-to-cart">Add to Cart</button>`);
  }
  
  parts.push('</div>');
  
  return parts.join('\n');
}

// ============================================
// TEST MODULE: src/app/__tests__/products.test.tsx
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger for structured logging in tests
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

// Test fixtures - centralized test data following DRY principle
const createMockProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'prod-001',
  name: 'Test Product',
  price: 99.99,
  description: 'A test product description',
  imageUrl: 'https://example.com/image.jpg',
  inStock: true,
  category: 'electronics',
  ...overrides,
});

const createMockConfig = (overrides: Partial<ProductDisplayConfig> = {}): ProductDisplayConfig => ({
  showPrice: true,
  showDescription: true,
  imageSize: 'medium',
  currencyCode: 'USD',
  ...overrides,
});

describe('ProductDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Types Layer - Data Validation', () => {
    it('should validate complete product objects', () => {
      const validProduct = createMockProduct();
      expect(validateProduct(validProduct)).toBe(true);
    });

    it('should reject invalid product objects', () => {
      const invalidProducts = [
        null,
        undefined,
        {},
        { id: '123' }, // Missing required fields
        { ...createMockProduct(), price: '99.99' }, // Wrong type for price
        { ...createMockProduct(), inStock: 'yes' }, // Wrong type for inStock
      ];

      invalidProducts.forEach((product) => {
        expect(validateProduct(product)).toBe(false);
      });
    });

    it('should handle edge case product values', () => {
      const edgeCaseProduct = createMockProduct({
        name: '', // Empty string
        price: 0, // Zero price
        description: '', // Empty description
      });
      
      expect(validateProduct(edgeCaseProduct)).toBe(true);
    });
  });

  describe('Config Layer - Default Configuration', () => {
    it('should use default config when partial config provided', () => {
      const partialConfig: Partial<ProductDisplayConfig> = { showPrice: false };
      const mergedConfig = { ...DEFAULT_PRODUCT_CONFIG, ...partialConfig };
      
      expect(mergedConfig.showPrice).toBe(false);
      expect(mergedConfig.showDescription).toBe(true); // From default
      expect(mergedConfig.imageSize).toBe('medium'); // From default
    });

    it('should override all defaults when full config provided', () => {
      const fullConfig: ProductDisplayConfig = {
        showPrice: false,
        showDescription: false,
        imageSize: 'large',
        currencyCode: 'EUR',
      };
      
      const mergedConfig = { ...DEFAULT_PRODUCT_CONFIG, ...fullConfig };
      expect(mergedConfig).toEqual(fullConfig);
    });
  });

  describe('Service Layer - Formatting Utilities', () => {
    describe('formatPrice', () => {
      it('should format price in USD correctly', () => {
        expect(formatPrice(99.99, 'USD')).toBe('$99.99');
      });

      it('should format price in EUR correctly', () => {
        expect(formatPrice(99.99, 'EUR')).toBe('€99.99');
      });

      it('should handle zero price', () => {
        expect(formatPrice(0, 'USD')).toBe('$0.00');
      });

      it('should handle large prices', () => {
        expect(formatPrice(999999.99, 'USD')).toBe('$999,999.99');
      });

      it('should fallback on invalid currency code', () => {
        // Invalid currency should still produce output via fallback
        const result = formatPrice(99.99, 'INVALID');
        expect(result).toContain('99.99');
      });
    });

    describe('getImageSizeClass', () => {
      it('should return correct classes for each size', () => {
        expect(getImageSizeClass('small')).toBe('h-32 w-32');
        expect(getImageSizeClass('medium')).toBe('h-48 w-48');
        expect(getImageSizeClass('large')).toBe('h-64 w-64');
      });

      it('should default to medium for invalid size', () => {
        // @ts-expect-error Testing invalid input
        expect(getImageSizeClass('invalid')).toBe('h-48 w-48');
      });
    });
  });

  describe('Runtime Layer - Component Rendering', () => {
    it('should render complete product display', () => {
      const product = createMockProduct();
      const config = createMockConfig();
      
      const output = renderProductDisplay({ product, config });
      
      expect(output).toContain('data-product-id="prod-001"');
      expect(output).toContain('Test Product');
      expect(output).toContain('$99.99');
      expect(output).toContain('A test product description');
      expect(output).toContain('In Stock');
    });

    it('should hide price when config.showPrice is false', () => {
      const product = createMockProduct();
      const config = createMockConfig({ showPrice: false });
      
      const output = renderProductDisplay({ product, config });
      
      expect(output).not.toContain('product-price');
      expect(output).not.toContain('$99.99');
    });

    it('should hide description when config.showDescription is false', () => {
      const product = createMockProduct();
      const config = createMockConfig({ showDescription: false });
      
      const output = renderProductDisplay({ product, config });
      
      expect(output).not.toContain('product-description');
    });

    it('should apply correct image size class', () => {
      const product = createMockProduct();
      const config = createMockConfig({ imageSize: 'large' });
      
      const output = renderProductDisplay({ product, config });
      
      expect(output).toContain('h-64 w-64');
    });

    it('should show out of stock status', () => {
      const product = createMockProduct({ inStock: false });
      const config = createMockConfig();
      
      const output = renderProductDisplay({ product, config });
      
      expect(output).toContain('Out of Stock');
    });

    it('should disable add to cart when out of stock', () => {
      const product = createMockProduct({ inStock: false });
      const config = createMockConfig();
      const onAddToCart = vi.fn();
      
      const output = renderProductDisplay({ product, config, onAddToCart });
      
      expect(output).not.toContain('add-to-cart-btn');
    });

    it('should include view details button when handler provided', () => {
      const product = createMockProduct();
      const config = createMockConfig();
      const onViewDetails = vi.fn();
      
      const output = renderProductDisplay({ product, config, onViewDetails });
      
      expect(output).toContain('view-details-btn');
      expect(output).toContain('data-action="view-details"');
    });

    it('should include add to cart button when handler provided and in stock', () => {
      const product = createMockProduct({ inStock: true });
      const config = createMockConfig();
      const onAddToCart = vi.fn();
      
      const output = renderProductDisplay({ product, config, onAddToCart });
      
      expect(output).toContain('add-to-cart-btn');
      expect(output).toContain('data-action="add-to-cart"');
    });

    it('should throw error for invalid product data', () => {
      const invalidProduct = { id: '123' } as Product; // Type cast to test runtime validation
      const config = createMockConfig();
      
      expect(() => {
        renderProductDisplay({ product: invalidProduct, config });
      }).toThrow('Invalid product data provided to ProductDisplay');
    });

    it('should handle missing optional callbacks gracefully', () => {
      const product = createMockProduct();
      const config = createMockConfig();
      
      // Should not throw when callbacks are undefined
      expect(() => {
        renderProductDisplay({ product, config });
      }).not.toThrow();
    });
  });

  describe('Integration - Full Component Flow', () => {
    it('should handle complete product lifecycle', () => {
      const product = createMockProduct({
        id: 'prod-integration-001',
        name: 'Integration Test Product',
        price: 199.99,
      });
      
      const config = createMockConfig({
        imageSize: 'small',
        currencyCode: 'GBP',
      });
      
      const onAddToCart = vi.fn();
      const onViewDetails = vi.fn();
      
      const output = renderProductDisplay({
        product,
        config,
        onAddToCart,
        onViewDetails,
      });
      
      // Verify all layers integrated correctly
      expect(output).toContain('prod-integration-001');
      expect(output).toContain('Integration Test Product');
      expect(output).toContain('h-32 w-32'); // Small image size
      expect(output).toContain('£199.99'); // GBP formatting
      expect(output).toContain('view-details-btn');
      expect(output).toContain('add-to-cart-btn');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle products with special characters in name', () => {
      const product = createMockProduct({
        name: 'Product <script>alert("xss")</script> & More',
      });
      const config = createMockConfig();
      
      const output = renderProductDisplay({ product, config });
      
      // Should contain the text (in real implementation, would be escaped)
      expect(output).toContain('Product');
    });

    it('should handle very long descriptions', () => {
      const longDescription = 'A'.repeat(1000);
      const product = createMockProduct({ description: longDescription });
      const config = createMockConfig();
      
      const output = renderProductDisplay({ product, config });
      
      expect(output).toContain(longDescription);
    });

    it('should handle negative prices gracefully', () => {
      const product = createMockProduct({ price: -50 });
      const config = createMockConfig();
      
      const output = renderProductDisplay({ product, config });
      
      // Should still render (business logic may handle this elsewhere)
      expect(output).toContain('-$50.00');
    });
  });
});