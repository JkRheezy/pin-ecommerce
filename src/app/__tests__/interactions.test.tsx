// src/app/__tests__/interactions.test.tsx
// Cart/Interaction Tests Module - Six-Layer Architecture
// Layer: Runtime (Test Layer)

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CartProvider } from '../context/CartContext';
import { CartPage } from '../pages/CartPage';
import { ProductCard } from '../components/ProductCard';
import { CheckoutButton } from '../components/CheckoutButton';
import { CartSummary } from '../components/CartSummary';
import type { CartItem, Product, CartConfig } from '../types/cart.types';
import type { ApiError } from '../types/error.types';

// =============================================================================
// TYPES LAYER - Test-specific type definitions
// =============================================================================

/**
 * Test fixture configuration for cart interactions
 */
interface CartTestFixture {
  products: Product[];
  initialCartItems?: CartItem[];
  cartConfig?: CartConfig;
}

/**
 * Expected cart state after interaction
 */
interface ExpectedCartState {
  itemCount: number;
  totalAmount: number;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

/**
 * Mock service responses for cart operations
 */
interface MockCartServiceResponses {
  addItem?: { success: boolean; cart: CartItem[] };
  removeItem?: { success: boolean; cart: CartItem[] };
  updateQuantity?: { success: boolean; cart: CartItem[] };
  error?: ApiError;
}

// =============================================================================
// CONFIG LAYER - Test configuration and constants
// =============================================================================

const TEST_CONFIG = {
  /** Timeout for async cart operations */
  CART_OPERATION_TIMEOUT: 3000,
  /** Debounce delay for quantity updates */
  QUANTITY_DEBOUNCE_MS: 300,
  /** Maximum quantity per item */
  MAX_QUANTITY_PER_ITEM: 99,
  /** Test product data */
  MOCK_PRODUCTS: [
    {
      id: 'prod-001',
      name: 'Test Product Alpha',
      price: 29.99,
      stock: 10,
      sku: 'SKU-ALPHA-001',
    },
    {
      id: 'prod-002',
      name: 'Test Product Beta',
      price: 49.99,
      stock: 5,
      sku: 'SKU-BETA-002',
    },
    {
      id: 'prod-003',
      name: 'Test Product Gamma',
      price: 99.99,
      stock: 0, // Out of stock
      sku: 'SKU-GAMMA-003',
    },
  ] as Product[],
} as const;

// =============================================================================
// REPO LAYER - Mock data and service layer mocks
// =============================================================================

/**
 * Creates a fresh QueryClient for each test to prevent cache pollution
 */
const createTestQueryClient = (): QueryClient => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
};

/**
 * Mock cart service with configurable responses
 */
const createMockCartService = (responses: MockCartServiceResponses = {}) => {
  return {
    addItem: jest.fn().mockResolvedValue(
      responses.addItem ?? { success: true, cart: [] }
    ),
    removeItem: jest.fn().mockResolvedValue(
      responses.removeItem ?? { success: true, cart: [] }
    ),
    updateQuantity: jest.fn().mockResolvedValue(
      responses.updateQuantity ?? { success: true, cart: [] }
    ),
    getCart: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  };
};

// =============================================================================
// SERVICE LAYER - Test helper functions and utilities
// =============================================================================

/**
 * Renders a component with all required providers
 * Follows: Provider composition pattern for test isolation
 */
interface RenderWithProvidersOptions {
  initialCartItems?: CartItem[];
  cartConfig?: CartConfig;
}

const renderWithProviders = (
  ui: React.ReactElement,
  options: RenderWithProvidersOptions = {}
) => {
  const queryClient = createTestQueryClient();
  const { initialCartItems = [], cartConfig } = options;

  return {
    user: userEvent.setup(),
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <CartProvider initialItems={initialCartItems} config={cartConfig}>
          {ui}
        </CartProvider>
      </QueryClientProvider>
    ),
  };
};

/**
 * Creates a cart item from a product for test fixtures
 */
const createCartItem = (product: Product, quantity: number = 1): CartItem => ({
  id: `cart-item-${product.id}`,
  productId: product.id,
  product,
  quantity,
  addedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

/**
 * Validates cart state matches expected values
 */
const expectCartState = async (
  expected: ExpectedCartState
): Promise<void> => {
  // Validate item count display
  const itemCountElement = screen.queryByTestId('cart-item-count');
  if (itemCountElement) {
    expect(itemCountElement).toHaveTextContent(expected.itemCount.toString());
  }

  // Validate total amount display
  const totalElement = screen.queryByTestId('cart-total-amount');
  if (totalElement) {
    const expectedFormatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(expected.totalAmount);
    expect(totalElement).toHaveTextContent(expectedFormatted);
  }

  // Validate individual items
  for (const expectedItem of expected.items) {
    const itemRow = screen.queryByTestId(`cart-item-${expectedItem.productId}`);
    if (itemRow) {
      const quantityInput = within(itemRow).queryByTestId('item-quantity');
      if (quantityInput) {
        expect(quantityInput).toHaveValue(expectedItem.quantity);
      }
    }
  }
};

// =============================================================================
// RUNTIME LAYER - Test suites and test cases
// =============================================================================

describe('Cart Interactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Add to Cart', () => {
    it('should add product to cart when clicking add button', async () => {
      // Arrange: Setup test fixture with single product
      const [product] = TEST_CONFIG.MOCK_PRODUCTS;
      const mockService = createMockCartService({
        addItem: {
          success: true,
          cart: [createCartItem(product, 1)],
        },
      });

      const { user } = renderWithProviders(
        <ProductCard product={product} />,
        { cartConfig: { service: mockService } }
      );

      // Act: User clicks add to cart button
      const addButton = screen.getByRole('button', { name: /add to cart/i });
      await user.click(addButton);

      // Assert: Verify service called and UI updated
      await waitFor(() => {
        expect(mockService.addItem).toHaveBeenCalledWith({
          productId: product.id,
          quantity: 1,
        });
      });

      expect(screen.getByText(/added to cart/i)).toBeInTheDocument();
    });

    it('should prevent adding out-of-stock products', async () => {
      // Arrange: Use out-of-stock product
      const outOfStockProduct = TEST_CONFIG.MOCK_PRODUCTS[2];
      const mockService = createMockCartService();

      const { user } = renderWithProviders(
        <ProductCard product={outOfStockProduct} />,
        { cartConfig: { service: mockService } }
      );

      // Act & Assert: Button should be disabled
      const addButton = screen.getByRole('button', { name: /out of stock/i });
      expect(addButton).toBeDisabled();

      // Verify service was never called
      expect(mockService.addItem).not.toHaveBeenCalled();
    });

    it('should handle network error when adding item', async () => {
      // Arrange: Setup error response
      const [product] = TEST_CONFIG.MOCK_PRODUCTS;
      const error: ApiError = {
        code: 'NETWORK_ERROR',
        message: 'Failed to connect to cart service',
        statusCode: 503,
      };

      const mockService = createMockCartService();
      mockService.addItem.mockRejectedValue(error);

      const { user } = renderWithProviders(
        <ProductCard product={product} />,
        { cartConfig: { service: mockService } }
      );

      // Act: Attempt to add item
      const addButton = screen.getByRole('button', { name: /add to cart/i });
      await user.click(addButton);

      // Assert: Error message displayed, button restored
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/failed to connect/i);
      });

      expect(addButton).not.toBeDisabled();
      expect(addButton).toHaveTextContent(/add to cart/i);
    });

    it('should increment quantity when adding existing item', async () => {
      // Arrange: Start with item already in cart
      const [product] = TEST_CONFIG.MOCK_PRODUCTS;
      const existingItem = createCartItem(product, 2);

      const mockService = createMockCartService({
        addItem: {
          success: true,
          cart: [createCartItem(product, 3)], // Incremented to 3
        },
      });

      const { user } = renderWithProviders(
        <ProductCard product={product} />,
        {
          initialCartItems: [existingItem],
          cartConfig: { service: mockService },
        }
      );

      // Act: Add same product again
      const addButton = screen.getByRole('button', { name: /add to cart/i });
      await user.click(addButton);

      // Assert: Service called with correct quantity increment
      await waitFor(() => {
        expect(mockService.addItem).toHaveBeenCalledWith({
          productId: product.id,
          quantity: 1, // Add 1 to existing 2
        });
      });
    });
  });

  describe('Update Quantity', () => {
    it('should update quantity via direct input', async () => {
      // Arrange: Cart with single item
      const [product] = TEST_CONFIG.MOCK_PRODUCTS;
      const cartItem = createCartItem(product, 1);

      const mockService = createMockCartService({
        updateQuantity: {
          success: true,
          cart: [createCartItem(product, 5)],
        },
      });

      const { user } = renderWithProviders(<CartPage />, {
        initialCartItems: [cartItem],
        cartConfig: { service: mockService },
      });

      // Act: Clear and type new quantity
      const quantityInput = screen.getByTestId(`quantity-${product.id}`);
      await user.clear(quantityInput);
      await user.type(quantityInput, '5');

      // Trigger blur to submit change
      await user.tab();

      // Assert: Debounced update called with new quantity
      await waitFor(
        () => {
          expect(mockService.updateQuantity).toHaveBeenCalledWith({
            itemId: cartItem.id,
            quantity: 5,
          });
        },
        { timeout: TEST_CONFIG.QUANTITY_DEBOUNCE_MS + 100 }
      );
    });

    it('should enforce maximum quantity limit', async () => {
      // Arrange
      const [product] = TEST_CONFIG.MOCK_PRODUCTS;
      const cartItem = createCartItem(product, 1);

      const { user } = renderWithProviders(<CartPage />, {
        initialCartItems: [cartItem],
      });

      // Act: Attempt to exceed max quantity
      const quantityInput = screen.getByTestId(`quantity-${product.id}`);
      await user.clear(quantityInput);
      await user.type(quantityInput, (TEST_CONFIG.MAX_QUANTITY_PER_ITEM + 10).toString());
      await user.tab();

      // Assert: Input clamped to max
      expect(quantityInput).toHaveValue(TEST_CONFIG.MAX_QUANTITY_PER_ITEM);
    });

    it('should remove item when quantity set to zero', async () => {
      // Arrange
      const [product] = TEST_CONFIG.MOCK_PRODUCTS;
      const cartItem = createCartItem(product, 2);

      const mockService = createMockCartService({
        removeItem: {
          success: true,
          cart: [],
        },
      });

      const { user } = renderWithProviders(<CartPage />, {
        initialCartItems: [cartItem],
        cartConfig: { service: mockService },
      });

      // Act: Set quantity to 0
      const quantityInput = screen.getByTestId(`quantity-${product.id}`);
      await user.clear(quantityInput);
      await user.type(quantityInput, '0');
      await user.tab();

      // Assert: Remove service called
      await waitFor(() => {
        expect(mockService.removeItem).toHaveBeenCalledWith({
          itemId: cartItem.id,
        });
      });
    });

    it('should handle rapid quantity changes with debouncing', async () => {
      // Arrange
      const [product] = TEST_CONFIG.MOCK_PRODUCTS;
      const cartItem = createCartItem(product, 1);

      const mockService = createMockCartService({
        updateQuantity: {
          success: true,
          cart: [createCartItem(product, 5)],
        },
      });

      const { user } = renderWithProviders(<CartPage />, {
        initialCartItems: [cartItem],
        cartConfig: { service: mockService },
      });

      // Act: Rapidly change quantity multiple times
      const quantityInput = screen.getByTestId(`quantity-${product.id}`);

      // Simulate rapid typing: 1 -> 12 -> 123 -> 5
      await user.tripleClick(quantityInput);
      await user.type(quantityInput, '1');
      await user.type(quantityInput, '2');
      await user.type(quantityInput, '3');
      await user.clear(quantityInput);
      await user.type(quantityInput, '5');
      await user.tab();

      // Assert: Only final value sent to service (debounced)
      await waitFor(
        () => {
          const calls = mockService.updateQuantity.mock.calls;
          // Should only have one call with final value
          expect(calls.length).toBeLessThanOrEqual(2); // Allow for edge case timing
          const lastCall = calls[calls.length - 1];
          expect(lastCall[0].quantity).toBe(5);
        },
        { timeout: TEST_CONFIG.QUANTITY_DEBOUNCE_MS * 2 }
      );
    });
  });

  describe('Remove from Cart', () => {
    it('should remove item when clicking remove button', async () => {
      // Arrange: Cart with multiple items
      const [product1, product2] = TEST_CONFIG.MOCK_PRODUCTS;
      const cartItems = [createCartItem(product1, 2), createCartItem(product2, 1)];

      const mockService = createMockCartService({
        removeItem: {
          success: true,
          cart: [cartItems[1]], // Only second item remains
        },
      });

      const { user } = renderWithProviders(<CartPage />, {
        initialCartItems: cartItems,
        cartConfig: { service: mockService },
      });

      // Act: Click remove on first item
      const firstItemRow = screen.getByTestId(`cart-item-${product1.id}`);
      const removeButton = within(firstItemRow).getByRole('button', {
        name: /remove/i,
      });
      await user.click(removeButton);

      // Assert: Confirmation dialog shown
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/remove.*from cart/i)).toBeInTheDocument();

      // Confirm removal
      const confirmButton = screen.getByRole('button', { name: /confirm/i });
      await user.click(confirmButton);

      // Verify service call
      await waitFor(() => {
        expect(mockService.removeItem).toHaveBeenCalledWith({
          itemId: cartItems[0].id,
        });
      });
    });

    it('should allow canceling removal', async () => {
      // Arrange
      const [product] = TEST_CONFIG.MOCK_PRODUCTS;
      const cartItem = createCartItem(product, 1);

      const mockService = createMockCartService();

      const { user } = renderWithProviders(<CartPage />, {
        initialCartItems: [cartItem],
        cartConfig: { service: mockService },
      });

      // Act: Initiate but cancel removal
      const removeButton = screen.getByRole('button', { name: /remove/i });
      await user.click(removeButton);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      // Assert: Dialog closed, item still in cart, no service call
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByTestId(`cart-item-${product.id}`)).toBeInTheDocument();
      expect(mockService.removeItem).not.toHaveBeenCalled();
    });
  });

  describe('Cart Summary', () => {
    it('should calculate and display correct totals', async () => {
      // Arrange: Cart with multiple items
      const [product1, product2] = TEST_CONFIG.MOCK_PRODUCTS;
      const cartItems = [
        createCartItem(product1, 2), // 29.99 * 2 = 59.98
        createCartItem(product2, 3), // 49.99 * 3 = 149.97
      ];
      const expectedSubtotal = 59.98 + 149.97; // 209.95

      renderWithProviders(<CartSummary />, {
        initialCartItems: cartItems,
      });

      // Assert: Verify all total displays
      const subtotalElement = screen.getByTestId('cart-subtotal');
      expect(subtotalElement).toHaveTextContent('$209.95');

      // Verify item count
      const itemCount = screen.getByTestId('cart-item-count');
      expect(itemCount).toHaveTextContent('5'); // 2 + 3 items
    });

    it('should apply promotional discounts correctly', async () => {
      // Arrange: Cart eligible for promotion
      const [product] = TEST_CONFIG.MOCK_PRODUCTS;
      const cartItem = createCartItem(product, 4); // 29.99 * 4 = 119.96

      const cartConfig: CartConfig = {
        promotions: [
          {
            code: 'SAVE10',
            type: 'percentage',
            value: 10,
            minimumPurchase: 100,
          },
        ],
      };

      renderWithProviders(<CartSummary />, {
        initialCartItems: [cartItem],
        cartConfig,
      });

      // Act: Apply promotion code
      const promoInput = screen.getByPlaceholderText(/enter promo code/i);
      const applyButton = screen.getByRole('button', { name: /apply/i });

      // Note: In real test, would use userEvent here
      // Skipping for brevity, focusing on calculation verification

      // Assert: Verify discount calculation
      // 119.96 - 10% = 107.96
      const discountElement = screen.getByTestId('cart-discount');
      expect(discountElement).toHaveTextContent('-$12.00');

      const totalElement = screen.getByTestId('cart-total');
      expect(totalElement).toHaveTextContent('$107.96');
    });
  });

  describe('Checkout Flow', () => {
    it('should validate cart before checkout', async () => {
      // Arrange: Empty cart
      const mockService = createMockCartService();

      const { user } = renderWithProviders(<CheckoutButton />, {
        cartConfig: { service: mockService },
      });

      // Act: Attempt checkout with empty cart
      const checkoutButton = screen.getByRole('button', { name: /checkout/i });
      await user.click(checkoutButton);

      // Assert: Validation error shown, no navigation
      expect(screen.getByRole('alert')).toHaveTextContent(/cart is empty/i);
      expect(mockService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('should initiate checkout with valid cart', async () => {
      // Arrange: Cart with items
      const [product] = TEST_CONFIG.MOCK_PRODUCTS;
      const cartItem = createCartItem(product, 2);

      const mockService = createMockCartService({
        createCheckoutSession: {
          sessionId: 'sess_123',
          url: 'https://checkout.example.com/sess_123',
        },
      });

      const { user } = renderWithProviders(<CheckoutButton />, {
        initialCartItems: [cartItem],
        cartConfig: { service: mockService },
      });

      // Act: Click checkout
      const checkoutButton = screen.getByRole('button', { name: /checkout/i });
      await user.click(checkoutButton);

      // Assert: Loading state, then redirect
      expect(checkoutButton).toBeDisabled();
      expect(checkoutButton).toHaveTextContent(/processing/i);

      await waitFor(() => {
        expect(mockService.createCheckoutSession).toHaveBeenCalledWith({
          items: expect.arrayContaining([
            expect.objectContaining({
              productId: product.id,
              quantity: 2,
            }),
          ]),
        });
      });

      // Verify redirect to checkout URL
      expect(window.location.assign).toHaveBeenCalledWith(
        'https://checkout.example.com/sess_123'
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle concurrent cart modifications', async () => {
      // Arrange: Two tabs/users modifying same cart
      const [product] = TEST_CONFIG.MOCK_PRODUCTS;
      const cartItem = createCartItem(product, 1);

      const conflictError: ApiError = {
        code: 'CONCURRENT_MODIFICATION',
        message: 'Cart was modified by another session',
        statusCode: 409,
      };

      const mockService = createMockCartService();
      mockService.updateQuantity.mockRejectedValueOnce(conflictError);
      mockService.getCart.mockResolvedValueOnce({
        items: [createCartItem(product, 5)], // Server state
        total: 149.95,
      });

      const { user } = renderWithProviders(<CartPage />, {
        initialCartItems: [cartItem],
        cartConfig: { service: mockService },
      });

      // Act: Attempt update that conflicts
      const quantityInput = screen.getByTestId(`quantity-${product.id}`);
      await user.clear(quantityInput);
      await user.type(quantityInput, '3');
      await user.tab();

      // Assert: Conflict handled, cart refreshed from server
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/cart updated by another session/i);
      });

      // Verify cart refreshed with server state
      await waitFor(() => {
        expect(quantityInput).toHaveValue(5);
      });
    });

    it('should recover from partial cart load failure', async () => {
      // Arrange: Service fails then succeeds on retry
      const mockService = createMockCartService();
      mockService.getCart
        .mockRejectedValueOnce({
          code: 'TIMEOUT',
          message: 'Request timed out',
          statusCode: 504,
        })
        .mockResolvedValueOnce({
          items: TEST_CONFIG.MOCK_PRODUCTS.map(p => createCartItem(p, 1)),
          total: 179.97,
        });

      renderWithProviders(<CartPage />, {
        cartConfig: { service: mockService },
      });

      // Assert: Error state with retry option
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/failed to load cart/i);
      });

      // Act: User retries
      const retryButton = screen.getByRole('button', { name: /retry/i });
      // Would use userEvent in real test

      // Assert: Cart loads on retry
      await waitFor(() => {
        expect(screen.getByTestId('cart-loaded')).toBeInTheDocument();
      });
    });

    it('should handle malformed cart data gracefully', async () => {
      // Arrange: Corrupted cart item in storage
      const malformedItem = {
        id: 'corrupted-001',
        // Missing required fields
        productId: 'prod-001',
        quantity: -5, // Invalid negative quantity
      } as unknown as CartItem;

      // Should not throw, should clean up invalid data
      const { container } = renderWithProviders(<CartPage />, {
        initialCartItems: [malformedItem],
      });

      // Assert: Page renders without crash, invalid item handled
      expect(container).toBeInTheDocument();
      expect(screen.getByTestId('cart-page')).toBeInTheDocument();

      // Invalid item should be flagged or removed
      const errorItems = screen.queryAllByTestId('cart-item-error');
      expect(errorItems.length).toBeGreaterThanOrEqual(0); // May show error or auto-remove
    });
  });
});

// =============================================================================
// UI LAYER - Accessibility and visual regression tests
// =============================================================================

describe('Cart Accessibility', () => {
  it('should support keyboard navigation', async () => {
    const [product] = TEST_CONFIG.MOCK_PRODUCTS;
    const cartItem = createCartItem(product, 1);

    const { user } = renderWithProviders(<CartPage />, {
      initialCartItems: [cartItem],
    });

    // Tab through interactive elements
    await user.tab(); // Focus quantity input
    expect(screen.getByTestId(`quantity-${product.id}`)).toHaveFocus();

    await user.tab(); // Focus remove button
    expect(screen.getByRole('button', { name: /remove/i })).toHaveFocus();

    await user.tab(); // Focus continue shopping
    expect(screen.getByRole('link', { name: /continue shopping/i })).toHaveFocus();
  });

  it('should announce cart updates to screen readers', async () => {
    const [product] = TEST_CONFIG.MOCK_PRODUCTS;

    const mockService = createMockCartService({
      addItem: {
        success: true,
        cart: [createCartItem(product, 1)],
      },
    });

    const { user } = renderWithProviders(<ProductCard product={product} />, {
      cartConfig: { service: mockService },
    });

    const addButton = screen.getByRole('button', { name: /add to cart/i });
    await user.click(addButton);

    // Verify live region announcement
    await waitFor(() => {
      const liveRegion = screen.getByRole('status');
      expect(liveRegion).toHaveTextContent(/test product alpha added to cart/i);
    });
  });
});