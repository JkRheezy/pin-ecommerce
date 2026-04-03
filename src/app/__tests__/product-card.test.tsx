/**
 * @deprecated This monolithic test file has been extracted into smaller, focused test files:
 * - ProductCard.rendering.test.tsx
 * - ProductCard.interaction.test.tsx
 * - ProductCard.loading.test.tsx
 * - ProductCard.error.test.tsx
 * 
 * Please use the extracted test files instead.
 * This file is kept for reference only and will be removed in a future update.
 */

// Tests extracted - see individual test files in __tests__/product-card/uctId: ProductId = 'prod-123';
  
  const mockPrice: Money = {
    amount: 2999,
    currency: 'USD',
    formatted: '$29.99'
  };

  const mockProduct: Product = {
    id: mockProductId,
    name: 'Premium Widget',
    description: 'A high-quality widget for all your needs',
    price: mockPrice,
    imageUrl: 'https://cdn.example.com/widget.png',
    inStock: true,
    category: 'widgets',
    tags: ['premium', 'bestseller'],
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15')
  };

  const mockOutOfStockProduct: Product = {
    ...mockProduct,
    id: 'prod-456',
    name: 'Limited Widget',
    inStock: false
  };

  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Initialize mock logger with structured logging
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    } as unknown as jest.Mocked<Logger>;

    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Layer 1: Types Validation', () => {
    it('should accept valid Product type props', () => {
      // Arrange & Act: Render with complete valid product
      const { container } = render(
        <ProductCard product={mockProduct} onAddToCart={jest.fn()} />
      );

      // Assert: Component renders without type errors
      expect(container.querySelector('[data-testid="product-card"]')).toBeInTheDocument();
    });

    it('should handle optional product fields gracefully', () => {
      // Arrange: Product with minimal required fields
      const minimalProduct: Product = {
        id: 'prod-minimal',
        name: 'Basic Product',
        price: mockPrice,
        inStock: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Act
      render(<ProductCard product={minimalProduct} onAddToCart={jest.fn()} />);

      // Assert: Renders with fallback values for optional fields
      expect(screen.getByText('Basic Product')).toBeInTheDocument();
    });
  });

  describe('Layer 2: Config Integration', () => {
    it('should apply product configuration settings', () => {
      // Arrange: Mock config with custom settings
      const mockConfig = {
        showDiscountBadge: true,
        enableQuickAdd: true,
        imagePlaceholder: '/placeholder.png'
      };
      
      (ProductConfig.getInstance as jest.Mock).mockReturnValue({
        getConfig: jest.fn().mockReturnValue(mockConfig)
      });

      // Act
      render(
        <ProductCard 
          product={mockProduct} 
          onAddToCart={jest.fn()}
          config={mockConfig}
        />
      );

      // Assert: Config-driven features are rendered
      expect(screen.getByTestId('quick-add-button')).toBeInTheDocument();
    });

    it('should handle missing configuration gracefully', () => {
      // Arrange: No config provided
      (ProductConfig.getInstance as jest.Mock).mockReturnValue({
        getConfig: jest.fn().mockReturnValue(null)
      });

      // Act & Assert: Should not throw, uses defaults
      expect(() => {
        render(<ProductCard product={mockProduct} onAddToCart={jest.fn()} />);
      }).not.toThrow();
    });
  });

  describe('Layer 3: Repository Pattern', () => {
    it('should fetch product data through repository layer', async () => {
      // Arrange: Mock repository response
      const mockRepo = {
        getById: jest.fn().mockResolvedValue(mockProduct),
        cache: {
          get: jest.fn().mockReturnValue(null),
          set: jest.fn()
        }
      };
      
      (ProductRepo.getInstance as jest.Mock).mockReturnValue(mockRepo);

      // Act: Render with productId trigger fetch
      render(
        <ProductCard 
          productId={mockProductId}
          onAddToCart={jest.fn()}
        />
      );

      // Assert: Repository was called with correct ID
      await waitFor(() => {
        expect(mockRepo.getById).toHaveBeenCalledWith(mockProductId);
      });
    });

    it('should use cached product data when available', async () => {
      // Arrange: Cache hit scenario
      const mockRepo = {
        getById: jest.fn(),
        cache: {
          get: jest.fn().mockReturnValue(mockProduct),
          set: jest.fn()
        }
      };
      
      (ProductRepo.getInstance as jest.Mock).mockReturnValue(mockRepo);

      // Act
      render(
        <ProductCard 
          productId={mockProductId}
          onAddToCart={jest.fn()}
        />
      );

      // Assert: Cache was checked, no fetch needed
      expect(mockRepo.cache.get).toHaveBeenCalledWith(mockProductId);
      expect(mockRepo.getById).not.toHaveBeenCalled();
    });
  });

  describe('Layer 4: Service Layer', () => {
    it('should validate product through service before render', async () => {
      // Arrange: Service validation mock
      const mockService = {
        validateProduct: jest.fn().mockReturnValue({ valid: true, errors: [] }),
        formatPrice: jest.fn().mockReturnValue('$29.99')
      };
      
      (ProductService.getInstance as jest.Mock).mockReturnValue(mockService);

      // Act
      render(<ProductCard product={mockProduct} onAddToCart={jest.fn()} />);

      // Assert: Validation service was invoked
      expect(mockService.validateProduct).toHaveBeenCalledWith(mockProduct);
    });

    it('should handle service validation failures', async () => {
      // Arrange: Invalid product scenario
      const mockService = {
        validateProduct: jest.fn().mockReturnValue({
          valid: false,
          errors: [{ field: 'price', message: 'Invalid price format' }]
        })
      };
      
      (ProductService.getInstance as jest.Mock).mockReturnValue(mockService);

      // Act
      const { container } = render(
        <ProductCard product={mockProduct} onAddToCart={jest.fn()} />
      );

      // Assert: Error state rendered
      expect(container.querySelector('[data-testid="validation-error"]')).toBeInTheDocument();
    });
  });

  describe('Layer 5: Runtime Behavior', () => {
    it('should handle add to cart action with proper error handling', async () => {
      // Arrange
      const mockOnAddToCart = jest.fn().mockResolvedValue(undefined);
      
      render(<ProductCard product={mockProduct} onAddToCart={mockOnAddToCart} />);

      // Act: Click add to cart
      const addButton = screen.getByTestId('add-to-cart-button');
      fireEvent.click(addButton);

      // Assert: Handler called with correct product
      await waitFor(() => {
        expect(mockOnAddToCart).toHaveBeenCalledWith(mockProduct);
      });
    });

    it('should handle async add to cart failures gracefully', async () => {
      // Arrange: Simulate network failure
      const mockError = new Error('Network timeout');
      const mockOnAddToCart = jest.fn().mockRejectedValue(mockError);
      
      render(<ProductCard product={mockProduct} onAddToCart={mockOnAddToCart} />);

      // Act
      const addButton = screen.getByTestId('add-to-cart-button');
      fireEvent.click(addButton);

      // Assert: Error logged and UI shows error state
      await waitFor(() => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to add product to cart',
          expect.objectContaining({
            productId: mockProductId,
            error: mockError.message
          })
        );
      });
    });

    it('should debounce rapid add to cart clicks', async () => {
      // Arrange
      jest.useFakeTimers();
      const mockOnAddToCart = jest.fn().mockResolvedValue(undefined);
      
      render(<ProductCard product={mockProduct} onAddToCart={mockOnAddToCart} />);

      // Act: Rapid clicks
      const addButton = screen.getByTestId('add-to-cart-button');
      fireEvent.click(addButton);
      fireEvent.click(addButton);
      fireEvent.click(addButton);

      // Fast-forward debounce timer
      jest.advanceTimersByTime(300);

      // Assert: Only one call made
      expect(mockOnAddToCart).toHaveBeenCalledTimes(1);
      
      jest.useRealTimers();
    });
  });

  describe('Layer 6: UI Presentation', () => {
    it('should render product information correctly', () => {
      // Act
      render(<ProductCard product={mockProduct} onAddToCart={jest.fn()} />);

      // Assert: All product details visible
      expect(screen.getByText('Premium Widget')).toBeInTheDocument();
      expect(screen.getByText('A high-quality widget for all your needs')).toBeInTheDocument();
      expect(screen.getByText('$29.99')).toBeInTheDocument();
    });

    it('should render skeleton loading state', () => {
      // Act
      render(<ProductCardSkeleton />);

      // Assert: Skeleton elements present
      expect(screen.getByTestId('product-skeleton')).toBeInTheDocument();
      expect(screen.getByTestId('skeleton-image')).toBeInTheDocument();
      expect(screen.getByTestId('skeleton-text')).toBeInTheDocument();
    });

    it('should render error state with retry option', () => {
      // Arrange
      const mockOnRetry = jest.fn();
      const errorMessage = 'Failed to load product';

      // Act
      render(
        <ProductCardError 
          message={errorMessage}
          onRetry={mockOnRetry}
        />
      );

      // Assert: Error UI visible
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
      
      // Act: Click retry
      fireEvent.click(screen.getByTestId('retry-button'));
      
      // Assert: Retry handler called
      expect(mockOnRetry).toHaveBeenCalled();
    });

    it('should disable add to cart for out of stock products', () => {
      // Act
      render(
        <ProductCard 
          product={mockOutOfStockProduct} 
          onAddToCart={jest.fn()} 
        />
      );

      // Assert
      const addButton = screen.getByTestId('add-to-cart-button');
      expect(addButton).toBeDisabled();
      expect(screen.getByText('Out of Stock')).toBeInTheDocument();
    });

    it('should handle image loading errors with fallback', () => {
      // Act
      render(<ProductCard product={mockProduct} onAddToCart={jest.fn()} />);

      // Simulate image error
      const image = screen.getByAltText('Premium Widget');
      fireEvent.error(image);

      // Assert: Fallback image shown
      expect(screen.getByTestId('image-fallback')).toBeInTheDocument();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null product prop gracefully', () => {
      // Act & Assert: Should render error state, not crash
      const { container } = render(
        <ProductCard 
          product={null as unknown as Product} 
          onAddToCart={jest.fn()} 
        />
      );
      
      expect(container.querySelector('[data-testid="product-error"]')).toBeInTheDocument();
    });

    it('should handle extremely long product names', () => {
      // Arrange: Product with very long name
      const longNameProduct: Product = {
        ...mockProduct,
        name: 'A'.repeat(200)
      };

      // Act
      render(<ProductCard product={longNameProduct} onAddToCart={jest.fn()} />);

      // Assert: Name truncated with ellipsis
      const nameElement = screen.getByTestId('product-name');
      expect(nameElement).toHaveClass('truncate');
    });

    it('should sanitize HTML in product description', () => {
      // Arrange: Product with potential XSS
      const xssProduct: Product = {
        ...mockProduct,
        description: '<script>alert("xss")</script>Safe description'
      };

      // Act
      render(<ProductCard product={xssProduct} onAddToCart={jest.fn()} />);

      // Assert: Script tag not rendered as HTML
      expect(screen.queryByText('alert("xss")')).not.toBeInTheDocument();
    });

    it('should handle currency formatting edge cases', () => {
      // Arrange: Various price formats
      const testCases: Money[] = [
        { amount: 0, currency: 'USD', formatted: '$0.00' },
        { amount: 999999, currency: 'USD', formatted: '$9,999.99' },
        { amount: -100, currency: 'USD', formatted: '-$1.00' } // Invalid but handled
      ];

      testCases.forEach((price, index) => {
        const product: Product = {
          ...mockProduct,
          id: `prod-${index}`,
          price
        };

        // Act
        const { unmount } = render(
          <ProductCard product={product} onAddToCart={jest.fn()} />
        );

        // Assert: Price displayed (specific formatting tested in service layer)
        expect(screen.getByTestId('product-price')).toBeInTheDocument();
        
        unmount();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      // Act
      render(<ProductCard product={mockProduct} onAddToCart={jest.fn()} />);

      // Assert
      expect(screen.getByRole('article')).toHaveAttribute(
        'aria-label',
        'Product: Premium Widget'
      );
      expect(screen.getByRole('button', { name: /add to cart/i })).toBeInTheDocument();
    });

    it('should support keyboard navigation', () => {
      // Act
      render(<ProductCard product={mockProduct} onAddToCart={jest.fn()} />);

      // Assert: Tab navigation works
      const card = screen.getByTestId('product-card');
      card.focus();
      expect(document.activeElement).toBe(card);

      // Tab to add button
      fireEvent.keyDown(card, { key: 'Tab' });
      const addButton = screen.getByTestId('add-to-cart-button');
      expect(addButton).toHaveFocus();
    });

    it('should announce stock status to screen readers', () => {
      // Act
      render(
        <ProductCard 
          product={mockOutOfStockProduct} 
          onAddToCart={jest.fn()} 
        />
      );

      // Assert
      const stockIndicator = screen.getByTestId('stock-status');
      expect(stockIndicator).toHaveAttribute('aria-live', 'polite');
      expect(stockIndicator).toHaveTextContent('Out of Stock');
    });
  });
});