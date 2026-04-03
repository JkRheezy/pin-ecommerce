/**
 * @fileoverview Interaction Tests Module for Product Card Component
 * @description Tests user interactions including click, hover, focus, and keyboard events
 * @module src/app/__tests__/product-card/interactions.test
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductCard } from '../../components/product-card';
import type { Product } from '../../types/product';
import { createMockProduct } from '../fixtures/product-fixtures';
import { InteractionError } from '../../errors/interaction-error';
import { logger } from '../../utils/logger';

// =============================================================================
// TYPES (Layer 1)
// =============================================================================

/**
 * Test context for interaction tests
 */
interface InteractionTestContext {
  product: Product;
  onAddToCart: jest.Mock;
  onViewDetails: jest.Mock;
  onFavoriteToggle: jest.Mock;
  user: ReturnType<typeof userEvent.setup>;
}

/**
 * Interaction test suite configuration
 */
interface InteractionTestConfig {
  waitForDebounce?: boolean;
  simulateNetworkDelay?: boolean;
}

// =============================================================================
// CONFIG (Layer 2)
// =============================================================================

const TEST_CONFIG: InteractionTestConfig = {
  waitForDebounce: true,
  simulateNetworkDelay: false,
};

const SELECTORS = {
  card: '[data-testid="product-card"]',
  addToCartButton: '[data-testid="add-to-cart-button"]',
  viewDetailsLink: '[data-testid="view-details-link"]',
  favoriteButton: '[data-testid="favorite-button"]',
  image: '[data-testid="product-image"]',
  price: '[data-testid="product-price"]',
  title: '[data-testid="product-title"]',
  tooltip: '[data-testid="product-tooltip"]',
} as const;

// =============================================================================
// REPO (Layer 3) - Test Helpers
// =============================================================================

/**
 * Repository of test setup utilities
 */
class InteractionTestRepo {
  /**
   * Creates a standardized test context
   */
  static createContext(overrides?: Partial<Product>): InteractionTestContext {
    const product = createMockProduct(overrides);
    
    return {
      product,
      onAddToCart: jest.fn(),
      onViewDetails: jest.fn(),
      onFavoriteToggle: jest.fn(),
      user: userEvent.setup(),
    };
  }

  /**
   * Renders ProductCard with test context
   */
  static renderWithContext(context: InteractionTestContext): ReturnType<typeof render> {
    return render(
      <ProductCard
        product={context.product}
        onAddToCart={context.onAddToCart}
        onViewDetails={context.onViewDetails}
        onFavoriteToggle={context.onFavoriteToggle}
      />
    );
  }

  /**
   * Waits for debounced operations to complete
   */
  static async waitForDebounce(ms: number = 300): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// SERVICE (Layer 4) - Test Orchestration
// =============================================================================

/**
 * Service layer for complex interaction test scenarios
 */
class InteractionTestService {
  /**
   * Executes click interaction with proper error handling
   */
  static async executeClick(
    element: HTMLElement,
    context: InteractionTestContext,
    options?: { doubleClick?: boolean }
  ): Promise<void> {
    try {
      if (options?.doubleClick) {
        await context.user.dblClick(element);
      } else {
        await context.user.click(element);
      }
    } catch (error) {
      logger.error('Click interaction failed', { error, element: element.dataset.testid });
      throw new InteractionError('Click interaction failed', { cause: error });
    }
  }

  /**
   * Executes hover interaction with tooltip verification
   */
  static async executeHover(
    element: HTMLElement,
    context: InteractionTestContext
  ): Promise<boolean> {
    try {
      await context.user.hover(element);
      
      // Wait for potential tooltip animation
      await waitFor(() => {
        const tooltip = screen.queryByTestId('product-tooltip');
        return tooltip !== null;
      }, { timeout: 1000, interval: 50 });

      return screen.queryByTestId('product-tooltip') !== null;
    } catch (error) {
      logger.warn('Hover interaction did not trigger tooltip', { 
        element: element.dataset.testid,
        error 
      });
      return false;
    }
  }

  /**
   * Executes keyboard navigation sequence
   */
  static async executeKeyboardNavigation(
    context: InteractionTestContext,
    sequence: string[]
  ): Promise<void> {
    for (const key of sequence) {
      await context.user.keyboard(key);
      
      // Small delay between keystrokes for realistic simulation
      await InteractionTestRepo.waitForDebounce(50);
    }
  }

  /**
   * Verifies callback was invoked with expected arguments
   */
  static verifyCallback(
    mockFn: jest.Mock,
    expectedCalls: number,
    expectedArg?: unknown
  ): void {
    expect(mockFn).toHaveBeenCalledTimes(expectedCalls);
    
    if (expectedArg !== undefined && expectedCalls > 0) {
      expect(mockFn).toHaveBeenLastCalledWith(expectedArg);
    }
  }
}

// =============================================================================
// RUNTIME (Layer 5) - Test Execution
// =============================================================================

describe('ProductCard Interactions', () => {
  let context: InteractionTestContext;

  beforeEach(() => {
    context = InteractionTestRepo.createContext();
    logger.info('Test context initialized', { productId: context.product.id });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Click Interactions
  // ---------------------------------------------------------------------------

  describe('Click Interactions', () => {
    it('should trigger add to cart on button click', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      const addButton = screen.getByTestId('add-to-cart-button');

      // Act
      await InteractionTestService.executeClick(addButton, context);

      // Assert
      InteractionTestService.verifyCallback(
        context.onAddToCart,
        1,
        context.product.id
      );
    });

    it('should trigger view details on card click', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      const card = screen.getByTestId('product-card');

      // Act
      await InteractionTestService.executeClick(card, context);

      // Assert
      InteractionTestService.verifyCallback(
        context.onViewDetails,
        1,
        context.product.id
      );
    });

    it('should toggle favorite state on favorite button click', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      const favoriteButton = screen.getByTestId('favorite-button');

      // Act - First click to favorite
      await InteractionTestService.executeClick(favoriteButton, context);

      // Assert
      InteractionTestService.verifyCallback(
        context.onFavoriteToggle,
        1,
        { productId: context.product.id, isFavorite: true }
      );

      // Act - Second click to unfavorite
      await InteractionTestService.executeClick(favoriteButton, context);

      // Assert
      InteractionTestService.verifyCallback(
        context.onFavoriteToggle,
        2,
        { productId: context.product.id, isFavorite: false }
      );
    });

    it('should handle rapid successive clicks with debouncing', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      const addButton = screen.getByTestId('add-to-cart-button');

      // Act - Rapid clicks
      await context.user.click(addButton);
      await context.user.click(addButton);
      await context.user.click(addButton);

      // Wait for debounce
      await InteractionTestRepo.waitForDebounce(350);

      // Assert - Should only trigger once due to debounce
      expect(context.onAddToCart).toHaveBeenCalledTimes(1);
    });

    it('should handle double-click appropriately', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      const card = screen.getByTestId('product-card');

      // Act
      await InteractionTestService.executeClick(card, context, { doubleClick: true });

      // Assert - Double click should still trigger single click handler
      // or have specific double-click behavior
      expect(context.onViewDetails).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Hover Interactions
  // ---------------------------------------------------------------------------

  describe('Hover Interactions', () => {
    it('should display tooltip on image hover', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      const image = screen.getByTestId('product-image');

      // Act
      const tooltipShown = await InteractionTestService.executeHover(image, context);

      // Assert
      expect(tooltipShown).toBe(true);
      expect(screen.getByTestId('product-tooltip')).toHaveTextContent(
        context.product.name
      );
    });

    it('should hide tooltip on mouse leave', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      const image = screen.getByTestId('product-image');
      const card = screen.getByTestId('product-card');

      // Act - Hover then unhover
      await context.user.hover(image);
      await context.user.unhover(card);

      // Assert
      await waitFor(() => {
        expect(screen.queryByTestId('product-tooltip')).not.toBeInTheDocument();
      });
    });

    it('should apply hover styles to card container', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      const card = screen.getByTestId('product-card');

      // Act
      await context.user.hover(card);

      // Assert - Check for hover class or style
      expect(card).toHaveClass('hover:shadow-lg');
      expect(card).toHaveClass('hover:scale-[1.02]');
    });

    it('should show quick actions on hover', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      const card = screen.getByTestId('product-card');

      // Act
      await context.user.hover(card);

      // Assert
      const quickActions = screen.getByTestId('quick-actions');
      expect(quickActions).toBeVisible();
      expect(quickActions).toHaveClass('opacity-100');
    });
  });

  // ---------------------------------------------------------------------------
  // Focus Interactions
  // ---------------------------------------------------------------------------

  describe('Focus Interactions', () => {
    it('should handle tab navigation through interactive elements', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);

      // Act - Tab through elements
      await InteractionTestService.executeKeyboardNavigation(context, [
        '[Tab]', // Focus card
        '[Tab]', // Focus favorite button
        '[Tab]', // Focus add to cart
      ]);

      // Assert
      expect(screen.getByTestId('add-to-cart-button')).toHaveFocus();
    });

    it('should show focus ring on keyboard focus', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      const button = screen.getByTestId('add-to-cart-button');

      // Act - Focus via keyboard (not click)
      await context.user.tab();
      await context.user.tab();

      // Assert
      expect(button).toHaveClass('focus:ring-2');
      expect(button).toHaveClass('focus:ring-primary');
    });

    it('should trigger action on Enter key when focused', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      const button = screen.getByTestId('add-to-cart-button');

      // Act - Focus and press Enter
      await context.user.click(button); // Focus
      await context.user.keyboard('{Enter}');

      // Assert
      expect(context.onAddToCart).toHaveBeenCalled();
    });

    it('should trap focus within modal when details are expanded', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      const viewLink = screen.getByTestId('view-details-link');

      // Act - Open details (simulated modal behavior)
      await context.user.click(viewLink);

      // Assert - First focusable element in modal should be focused
      const modal = screen.getByTestId('product-details-modal');
      expect(modal).toBeInTheDocument();
      
      // Tab should cycle within modal
      const firstFocusable = screen.getByTestId('modal-close-button');
      expect(firstFocusable).toHaveFocus();
    });
  });

  // ---------------------------------------------------------------------------
  // Keyboard Interactions
  // ---------------------------------------------------------------------------

  describe('Keyboard Interactions', () => {
    it('should handle Space key for button activation', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      const favoriteButton = screen.getByTestId('favorite-button');

      // Act
      favoriteButton.focus();
      await context.user.keyboard(' ');

      // Assert
      expect(context.onFavoriteToggle).toHaveBeenCalled();
    });

    it('should handle Escape to close expanded view', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      await context.user.click(screen.getByTestId('view-details-link'));

      // Act
      await context.user.keyboard('{Escape}');

      // Assert
      await waitFor(() => {
        expect(screen.queryByTestId('product-details-modal')).not.toBeInTheDocument();
      });
    });

    it('should support arrow key navigation for image gallery', async () => {
      // Arrange
      const productWithGallery = createMockProduct({
        images: [{ url: '/img1.jpg' }, { url: '/img2.jpg' }, { url: '/img3.jpg' }],
      });
      context = InteractionTestRepo.createContext(productWithGallery);
      InteractionTestRepo.renderWithContext(context);

      const gallery = screen.getByTestId('image-gallery');

      // Act - Navigate with arrow keys
      gallery.focus();
      await context.user.keyboard('{ArrowRight}');
      await context.user.keyboard('{ArrowRight}');

      // Assert
      const activeImage = screen.getByTestId('gallery-image-active');
      expect(activeImage).toHaveAttribute('src', '/img3.jpg');
    });
  });

  // ---------------------------------------------------------------------------
  // Touch Interactions (Mobile)
  // ---------------------------------------------------------------------------

  describe('Touch Interactions', () => {
    it('should handle touch start and end events', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      const card = screen.getByTestId('product-card');

      // Act - Simulate touch
      fireEvent.touchStart(card);
      fireEvent.touchEnd(card);

      // Assert - Should trigger click handler on touch devices
      expect(context.onViewDetails).toHaveBeenCalled();
    });

    it('should prevent ghost clicks after touch', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      const button = screen.getByTestId('add-to-cart-button');

      // Act - Touch then immediate click (ghost click scenario)
      fireEvent.touchStart(button);
      fireEvent.touchEnd(button);
      fireEvent.click(button); // Ghost click

      // Assert - Should only trigger once
      await InteractionTestRepo.waitForDebounce(350);
      expect(context.onAddToCart).toHaveBeenCalledTimes(1);
    });

    it('should handle long press for context menu', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      const card = screen.getByTestId('product-card');

      // Act - Long press simulation
      fireEvent.touchStart(card);
      await InteractionTestRepo.waitForDebounce(500); // Hold for 500ms
      fireEvent.touchEnd(card);

      // Assert
      expect(screen.getByTestId('context-menu')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should handle null callback gracefully', async () => {
      // Arrange - Render without optional callback
      render(<ProductCard product={context.product} onAddToCart={context.onAddToCart} />);
      const favoriteButton = screen.queryByTestId('favorite-button');

      // Assert - Button should not render if callback not provided
      expect(favoriteButton).not.toBeInTheDocument();
    });

    it('should recover from interaction errors', async () => {
      // Arrange - Mock failing callback
      const failingCallback = jest.fn().mockImplementation(() => {
        throw new Error('Network error');
      });
      context = {
        ...InteractionTestRepo.createContext(),
        onAddToCart: failingCallback,
      };
      InteractionTestRepo.renderWithContext(context);

      const button = screen.getByTestId('add-to-cart-button');

      // Act & Assert - Should not crash, error should be caught
      await expect(
        InteractionTestService.executeClick(button, context)
      ).rejects.toThrow(InteractionError);

      // Component should still be interactive
      expect(button).toBeInTheDocument();
      expect(button).not.toBeDisabled();
    });

    it('should disable interactions during loading state', async () => {
      // Arrange - Render with loading state
      render(
        <ProductCard
          product={context.product}
          onAddToCart={context.onAddToCart}
          isLoading={true}
        />
      );

      const button = screen.getByTestId('add-to-cart-button');

      // Assert
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
    });
  });

  // ---------------------------------------------------------------------------
  // Accessibility
  // ---------------------------------------------------------------------------

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);

      // Assert
      expect(screen.getByTestId('product-card')).toHaveAttribute(
        'aria-label',
        expect.stringContaining(context.product.name)
      );
      expect(screen.getByTestId('add-to-cart-button')).toHaveAttribute(
        'aria-label',
        `Add ${context.product.name} to cart`
      );
    });

    it('should announce state changes to screen readers', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);
      const favoriteButton = screen.getByTestId('favorite-button');

      // Act
      await context.user.click(favoriteButton);

      // Assert
      const liveRegion = screen.getByRole('status');
      expect(liveRegion).toHaveTextContent(/added to favorites|removed from favorites/i);
    });

    it('should maintain focus visibility', async () => {
      // Arrange
      InteractionTestRepo.renderWithContext(context);

      // Act - Tab through all interactive elements
      const interactiveElements = [
        'favorite-button',
        'view-details-link',
        'add-to-cart-button',
      ];

      for (let i = 0; i < interactiveElements.length; i++) {
        await context.user.tab();
        const element = screen.getByTestId(interactiveElements[i]);
        expect(element).toHaveFocus();
        expect(element).toHaveClass('focus-visible:ring-2');
      }
    });
  });
});

// =============================================================================
// UI (Layer 6) - Test Reporting & Utilities
// =============================================================================

/**
 * Custom matcher for interaction state verification
 */
expect.extend({
  toHaveInteractionState(received: HTMLElement, state: 'idle' | 'hover' | 'active' | 'focus') {
    const classList = received.className;
    const hasState = classList.includes(`state-${state}`) || 
                     (state === 'hover' && classList.includes('hover:')) ||
                     (state === 'focus' && received.matches(':focus-visible'));

    return {
      message: () => `expected element to have ${state} state`,
      pass: hasState,
    };
  },
});

// Extend TypeScript declarations for custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveInteractionState(state: 'idle' | 'hover' | 'active' | 'focus'): R;
    }
  }
}