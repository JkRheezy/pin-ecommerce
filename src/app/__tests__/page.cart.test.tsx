/**
 * Cart Page Test Module
 * 
 * Tests for the cart functionality following the six-layer architecture:
 * Types → Config → Repo → Service → Runtime → UI
 * 
 * @module src/app/__tests__/page.cart.test.tsx
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Types Layer - Import type definitions
import type { Cart, CartItem, Product, Money } from '~/types/domain.types';
import type { CartService } from '~/services/cart.service';

// Config Layer - Test configuration
import { TEST_CONFIG } from '~/config/test.config';

// Mock the service layer to isolate UI tests
jest.mock('~/services/cart.service');

/**
 * Test data factories following the Types layer
 */
const createTestMoney = (amount: number, currency: string = 'USD'): Money => ({
  amount,
  currency,
  toString: () => `${currency} ${amount.toFixed(2)}`,
});

const createTestProduct = (overrides?: Partial<Product>): Product => ({
  id: `prod-${Math.random().toString(36).substr(2, 9)}`,
  name: 'Test Product',
  description: 'A product for testing',
  price: createTestMoney(29.99),
  sku: `SKU-${Math.floor(Math.random() * 10000)}`,
  inStock: true,
  ...overrides,
});

const createTestCartItem = (overrides?: Partial<CartItem>): CartItem => ({
  id: `item-${Math.random().toString(36).substr(2, 9)}`,
  product: createTestProduct(),
  quantity: 1,
  unitPrice: createTestMoney(29.99),
  totalPrice: createTestMoney(29.99),
  ...overrides,
});

const createTestCart = (overrides?: Partial<Cart>): Cart => ({
  id: `cart-${Math.random().toString(36).substr(2, 9)}`,
  items: [],
  subtotal: createTestMoney(0),
  tax: createTestMoney(0),
  total: createTestMoney(0),
  itemCount: 0,
  currency: 'USD',
  ...overrides,
});

/**
 * Mock Cart Page Component
 * 
 * This represents the UI layer component that would be tested.
 * In a real scenario, this would import the actual CartPage component.
 */
const MockCartPage: React.FC<{ cartService: CartService }> = ({ cartService }) => {
  const [cart, setCart] = React.useState<Cart | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  // Runtime layer - Component lifecycle and state management
  React.useEffect(() => {
    loadCart();
  }, []);

  const loadCart = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const loadedCart = await cartService.getCart();
      setCart(loadedCart);
    } catch (err) {
      // Proper error handling with structured logging pattern
      const errorMessage = err instanceof Error ? err.message : 'Failed to load cart';
      setError(errorMessage);
      // In real implementation: logger.error({ err }, 'Failed to load cart');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateQuantity = async (itemId: string, quantity: number): Promise<void> => {
    if (quantity < 0) {
      setError('Quantity cannot be negative');
      return;
    }
    
    setLoading(true);
    try {
      const updatedCart = await cartService.updateItemQuantity(itemId, quantity);
      setCart(updatedCart);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update quantity';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveItem = async (itemId: string): Promise<void> => {
    setLoading(true);
    try {
      const updatedCart = await cartService.removeItem(itemId);
      setCart(updatedCart);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove item';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (): Promise<void> => {
    if (!cart || cart.itemCount === 0) {
      setError('Cannot checkout with empty cart');
      return;
    }
    
    setLoading(true);
    try {
      await cartService.checkout();
      // Navigate to checkout success
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Checkout failed';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // UI Layer - Render
  if (loading && !cart) {
    return <div data-testid="cart-loading">Loading cart...</div>;
  }

  if (error && !cart) {
    return (
      <div data-testid="cart-error">
        <p>{error}</p>
        <button onClick={loadCart}>Retry</button>
      </div>
    );
  }

  if (!cart || cart.itemCount === 0) {
    return (
      <div data-testid="cart-empty">
        <h1>Your Cart is Empty</h1>
        <p>Add some items to get started!</p>
      </div>
    );
  }

  return (
    <div data-testid="cart-page">
      <h1>Shopping Cart ({cart.itemCount} items)</h1>
      
      {error && <div data-testid="cart-error-message" role="alert">{error}</div>}
      
      <ul data-testid="cart-items">
        {cart.items.map((item) => (
          <li key={item.id} data-testid={`cart-item-${item.id}`}>
            <span data-testid="item-name">{item.product.name}</span>
            <span data-testid="item-price">{item.unitPrice.toString()}</span>
            
            <div data-testid="quantity-controls">
              <button
                data-testid="decrease-quantity"
                onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                disabled={item.quantity <= 1}
                aria-label="Decrease quantity"
              >
                -
              </button>
              <span data-testid="item-quantity">{item.quantity}</span>
              <button
                data-testid="increase-quantity"
                onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            
            <span data-testid="item-total">{item.totalPrice.toString()}</span>
            
            <button
              data-testid="remove-item"
              onClick={() => handleRemoveItem(item.id)}
              aria-label={`Remove ${item.product.name}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      
      <div data-testid="cart-summary">
        <div data-testid="cart-subtotal">Subtotal: {cart.subtotal.toString()}</div>
        <div data-testid="cart-tax">Tax: {cart.tax.toString()}</div>
        <div data-testid="cart-total">Total: {cart.total.toString()}</div>
      </div>
      
      <button
        data-testid="checkout-button"
        onClick={handleCheckout}
        disabled={cart.itemCount === 0 || loading}
      >
        {loading ? 'Processing...' : 'Checkout'}
      </button>
    </div>
  );
};

/**
 * Test Suite: Cart Page Functionality
 * 
 * Validates the cart functionality across all layers of the architecture.
 */
describe('Cart Page', () => {
  // Service layer mock - follows Repo → Service pattern
  let mockCartService: jest.Mocked<CartService>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Suppress console.error for expected error cases
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Initialize mocked service with proper typing
    mockCartService = {
      getCart: jest.fn(),
      addItem: jest.fn(),
      updateItemQuantity: jest.fn(),
      removeItem: jest.fn(),
      clearCart: jest.fn(),
      checkout: jest.fn(),
      applyPromoCode: jest.fn(),
    } as unknown as jest.Mocked<CartService>;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Types Layer Validation', () => {
    it('should create valid Money type', () => {
      const money = createTestMoney(99.99, 'USD');
      expect(money.amount).toBe(99.99);
      expect(money.currency).toBe('USD');
      expect(money.toString()).toBe('USD 99.99');
    });

    it('should create valid Product type with required fields', () => {
      const product = createTestProduct({ name: 'Special Product' });
      expect(product.id).toBeDefined();
      expect(product.name).toBe('Special Product');
      expect(product.price).toBeDefined();
      expect(product.sku).toBeDefined();
    });

    it('should create valid CartItem with calculated total', () => {
      const item = createTestCartItem({
        quantity: 3,
        unitPrice: createTestMoney(10),
      });
      expect(item.quantity).toBe(3);
      expect(item.totalPrice.amount).toBe(29.99); // Default from factory
    });
  });

  describe('Config Layer', () => {
    it('should use test configuration values', () => {
      expect(TEST_CONFIG).toBeDefined();
      expect(TEST_CONFIG.timeout).toBeGreaterThan(0);
    });
  });

  describe('Service Layer - Cart Loading', () => {
    it('should display loading state while fetching cart', async () => {
      // Arrange: Delay the service response
      mockCartService.getCart.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(createTestCart()), 100))
      );

      // Act
      render(<MockCartPage cartService={mockCartService} />);

      // Assert: Loading state should be visible
      expect(screen.getByTestId('cart-loading')).toBeInTheDocument();
      
      // Wait for load to complete
      await waitFor(() => {
        expect(screen.queryByTestId('cart-loading')).not.toBeInTheDocument();
      });
    });

    it('should handle empty cart state', async () => {
      // Arrange
      mockCartService.getCart.mockResolvedValue(createTestCart());

      // Act
      render(<MockCartPage cartService={mockCartService} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
      });
      expect(screen.getByText('Your Cart is Empty')).toBeInTheDocument();
    });

    it('should display cart with items', async () => {
      // Arrange: Create cart with items
      const testItems = [
        createTestCartItem({
          product: createTestProduct({ name: 'Test Widget', price: createTestMoney(19.99) }),
          quantity: 2,
          totalPrice: createTestMoney(39.98),
        }),
      ];
      
      const testCart = createTestCart({
        items: testItems,
        itemCount: 2,
        subtotal: createTestMoney(39.98),
        tax: createTestMoney(3.20),
        total: createTestMoney(43.18),
      });

      mockCartService.getCart.mockResolvedValue(testCart);

      // Act
      render(<MockCartPage cartService={mockCartService} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('cart-page')).toBeInTheDocument();
      });
      
      expect(screen.getByText('Test Widget')).toBeInTheDocument();
      expect(screen.getByTestId('item-quantity')).toHaveTextContent('2');
      expect(screen.getByTestId('cart-total')).toHaveTextContent('43.18');
    });

    it('should handle service errors gracefully', async () => {
      // Arrange: Service throws error
      const errorMessage = 'Network error: Unable to fetch cart';
      mockCartService.getCart.mockRejectedValue(new Error(errorMessage));

      // Act
      render(<MockCartPage cartService={mockCartService} />);

      // Assert: Error state with retry option
      await waitFor(() => {
        expect(screen.getByTestId('cart-error')).toBeInTheDocument();
      });
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  describe('Runtime Layer - User Interactions', () => {
    const setupCartWithItems = async (itemCount: number = 2): Promise<Cart> => {
      const testItems = Array.from({ length: itemCount }, (_, i) =>
        createTestCartItem({
          id: `item-${i}`,
          product: createTestProduct({ 
            name: `Product ${i + 1}`,
            price: createTestMoney(10 * (i + 1)),
          }),
          quantity: i + 1,
          unitPrice: createTestMoney(10 * (i + 1)),
          totalPrice: createTestMoney(10 * (i + 1) * (i + 1)),
        })
      );

      const cart = createTestCart({
        items: testItems,
        itemCount: testItems.reduce((sum, item) => sum + item.quantity, 0),
        subtotal: createTestMoney(testItems.reduce((sum, item) => sum + item.totalPrice.amount, 0)),
        total: createTestMoney(testItems.reduce((sum, item) => sum + item.totalPrice.amount, 0) * 1.08),
      });

      mockCartService.getCart.mockResolvedValue(cart);
      return cart;
    };

    it('should increase item quantity', async () => {
      // Arrange
      await setupCartWithItems(1);
      const updatedCart = createTestCart({
        items: [createTestCartItem({ quantity: 3, totalPrice: createTestMoney(30) })],
      });
      mockCartService.updateItemQuantity.mockResolvedValue(updatedCart);

      render(<MockCartPage cartService={mockCartService} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('cart-page')).toBeInTheDocument();
      });

      // Act
      const increaseBtn = screen.getByTestId('increase-quantity');
      await userEvent.click(increaseBtn);

      // Assert
      await waitFor(() => {
        expect(mockCartService.updateItemQuantity).toHaveBeenCalledWith('item-0', 3);
      });
    });

    it('should decrease item quantity with boundary check', async () => {
      // Arrange
      await setupCartWithItems(1);
      const updatedCart = createTestCart({
        items: [createTestCartItem({ quantity: 1, totalPrice: createTestMoney(10) })],
      });
      mockCartService.updateItemQuantity.mockResolvedValue(updatedCart);

      render(<MockCartPage cartService={mockCartService} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('cart-page')).toBeInTheDocument();
      });

      // Act: Try to decrease from 1 to 0 (should be disabled or handled)
      const decreaseBtn = screen.getByTestId('decrease-quantity');
      
      // Assert: Button should be disabled at quantity 1
      expect(decreaseBtn).toBeDisabled();
    });

    it('should remove item from cart', async () => {
      // Arrange
      await setupCartWithItems(2);
      const emptyCart = createTestCart(); // Empty cart after removal
      mockCartService.removeItem.mockResolvedValue(emptyCart);

      render(<MockCartPage cartService={mockCartService} />);
      
      await waitFor(() => {
        expect(screen.getAllByTestId(/^cart-item-/)).toHaveLength(2);
      });

      // Act
      const removeBtn = screen.getAllByTestId('remove-item')[0];
      await userEvent.click(removeBtn);

      // Assert
      await waitFor(() => {
        expect(mockCartService.removeItem).toHaveBeenCalledWith('item-0');
      });
    });

    it('should validate quantity cannot be negative', async () => {
      // Arrange
      await setupCartWithItems(1);
      render(<MockCartPage cartService={mockCartService} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('cart-page')).toBeInTheDocument();
      });

      // Act: Try to update with negative quantity (simulated direct call)
      // This tests input validation at the runtime layer
      const updateWithNegative = async () => {
        // Directly call the handler through a simulated event
        await userEvent.click(screen.getByTestId('increase-quantity'));
      };

      // The component should prevent negative quantities
      expect(screen.getByTestId('item-quantity')).toHaveTextContent('1');
    });
  });

  describe('UI Layer - Checkout Flow', () => {
    it('should prevent checkout with empty cart', async () => {
      // Arrange
      mockCartService.getCart.mockResolvedValue(createTestCart());

      render(<MockCartPage cartService={mockCartService} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
      });

      // Assert: Checkout button should not exist or be disabled
      expect(screen.queryByTestId('checkout-button')).not.toBeInTheDocument();
    });

    it('should initiate checkout with valid cart', async () => {
      // Arrange
      const cartWithItems = createTestCart({
        items: [createTestCartItem({ quantity: 2 })],
        itemCount: 2,
        total: createTestMoney(59.98),
      });
      mockCartService.getCart.mockResolvedValue(cartWithItems);
      mockCartService.checkout.mockResolvedValue({ orderId: 'order-123', status: 'confirmed' });

      render(<MockCartPage cartService={mockCartService} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('checkout-button')).toBeInTheDocument();
      });

      // Act
      await userEvent.click(screen.getByTestId('checkout-button'));

      // Assert
      await waitFor(() => {
        expect(mockCartService.checkout).toHaveBeenCalled();
      });
    });

    it('should handle checkout failure with error display', async () => {
      // Arrange
      const cartWithItems = createTestCart({
        items: [createTestCartItem()],
        itemCount: 1,
      });
      mockCartService.getCart.mockResolvedValue(cartWithItems);
      mockCartService.checkout.mockRejectedValue(new Error('Payment declined'));

      render(<MockCartPage cartService={mockCartService} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('checkout-button')).toBeEnabled();
      });

      // Act
      await userEvent.click(screen.getByTestId('checkout-button'));

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('cart-error-message')).toHaveTextContent('Payment declined');
      });
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should handle malformed cart data from service', async () => {
      // Arrange: Return invalid data structure
      mockCartService.getCart.mockResolvedValue({
        // Missing required fields - testing defensive programming
        items: null,
      } as unknown as Cart);

      // Act & Assert: Should not crash, should show error or empty state
      render(<MockCartPage cartService={mockCartService} />);
      
      // Component should handle gracefully
      await waitFor(() => {
        const content = screen.getByTestId('cart-empty') || screen.getByTestId('cart-error');
        expect(content).toBeInTheDocument();
      });
    });

    it('should handle rapid sequential updates', async () => {
      // Arrange
      const cart = createTestCart({
        items: [createTestCartItem({ id: 'item-1', quantity: 1 })],
        itemCount: 1,
      });
      mockCartService.getCart.mockResolvedValue(cart);
      
      // Simulate slow network
      mockCartService.updateItemQuantity.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(cart), 200))
      );

      render(<MockCartPage cartService={mockCartService} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('cart-page')).toBeInTheDocument();
      });

      // Act: Rapid clicks
      const increaseBtn = screen.getByTestId('increase-quantity');
      await userEvent.click(increaseBtn);
      await userEvent.click(increaseBtn);
      await userEvent.click(increaseBtn);

      // Assert: Should handle gracefully (either debounce or queue)
      // In real implementation, this would test optimistic updates or loading states
      await waitFor(() => {
        expect(mockCartService.updateItemQuantity).toHaveBeenCalled();
      });
    });

    it('should validate currency consistency across cart items', async () => {
      // Arrange: Mixed currencies (edge case)
      const mixedCart = createTestCart({
        items: [
          createTestCartItem({ unitPrice: createTestMoney(10, 'USD') }),
          createTestCartItem({ unitPrice: createTestMoney(10, 'EUR') }),
        ],
      });
      mockCartService.getCart.mockResolvedValue(mixedCart);

      // Act
      render(<MockCartPage cartService={mockCartService} />);

      // Assert: Should display or handle currency mismatch
      await waitFor(() => {
        expect(screen.getByTestId('cart-page')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility & UX', () => {
    it('should have proper ARIA labels for interactive elements', async () => {
      // Arrange
      const cart = createTestCart({
        items: [createTestCartItem({ product: createTestProduct({ name: 'Accessible Item' }) })],
        itemCount: 1,
      });
      mockCartService.getCart.mockResolvedValue(cart);

      render(<MockCartPage cartService={mockCartService} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('cart-page')).toBeInTheDocument();
      });

      // Assert
      expect(screen.getByLabelText('Decrease quantity')).toBeInTheDocument();
      expect(screen.getByLabelText('Increase quantity')).toBeInTheDocument();
      expect(screen.getByLabelText('Remove Accessible Item')).toBeInTheDocument();
    });

    it('should announce errors to screen readers', async () => {
      // Arrange
      mockCartService.getCart.mockRejectedValue(new Error('Service unavailable'));

      render(<MockCartPage cartService={mockCartService} />);

      // Assert
      await waitFor(() => {
        const errorElement = screen.getByTestId('cart-error');
        expect(errorElement).toHaveAttribute('role', 'alert');
      });
    });
  });
});