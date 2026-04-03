// src/app/__tests__/page.interaction.test.tsx
// Layer: UI (Tests) - User interaction tests for the main page component
// These tests verify user interactions are handled correctly and produce expected outcomes

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import HomePage from '../page';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useLogger } from '@/hooks/useLogger';
import type { UserEventInstance } from '@testing-library/user-event';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface MockFeatureFlags {
  isEnabled: (flag: string) => boolean;
  flags: Record<string, boolean>;
}

interface MockLogger {
  info: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
}

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------

// Mock the feature flags hook
vi.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: vi.fn(),
}));

// Mock the logger hook
vi.mock('@/hooks/useLogger', () => ({
  useLogger: vi.fn(),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// -----------------------------------------------------------------------------
// Test Suite: User Interactions
// -----------------------------------------------------------------------------

describe('HomePage - User Interactions', () => {
  let mockLogger: MockLogger;
  let mockFeatureFlags: MockFeatureFlags;
  let user: UserEventInstance;

  beforeEach(() => {
    // Setup user event with pointer map for advanced interactions
    user = userEvent.setup({
      pointerMap: [
        { name: 'MouseLeft', pointerType: 'mouse', button: 'primary' },
      ],
    });

    // Initialize mock logger with structured logging interface
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    // Initialize mock feature flags with default disabled state
    mockFeatureFlags = {
      isEnabled: vi.fn().mockReturnValue(false),
      flags: {},
    };

    // Apply mocks
    (useLogger as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockLogger);
    (useFeatureFlags as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockFeatureFlags);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Test: Button Click Interactions
  // ---------------------------------------------------------------------------

  describe('Button Click Interactions', () => {
    it('should handle primary action button click with proper logging', async () => {
      // Arrange: Render component with feature flag enabled
      mockFeatureFlags.isEnabled.mockImplementation((flag: string) => flag === 'new-dashboard-ui');
      render(<HomePage />);

      const primaryButton = screen.getByRole('button', { name: /get started/i });

      // Act: Simulate user click using user-event for realistic interaction
      await user.click(primaryButton);

      // Assert: Verify interaction was logged with structured context
      await waitFor(() => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          'user_interaction:button_clicked',
          expect.objectContaining({
            buttonId: 'primary-cta',
            buttonText: 'Get Started',
            timestamp: expect.any(String),
          })
        );
      });
    });

    it('should handle button click with error recovery', async () => {
      // Arrange: Setup logger to throw on first call to test error handling
      mockLogger.info
        .mockRejectedValueOnce(new Error('Logging service unavailable'))
        .mockResolvedValue(undefined);

      render(<HomePage />);

      const primaryButton = screen.getByRole('button', { name: /get started/i });

      // Act & Assert: Click should not propagate error to user
      await expect(user.click(primaryButton)).resolves.not.toThrow();

      // Verify error was logged but UI remained functional
      await waitFor(() => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          'user_interaction:logging_failed',
          expect.objectContaining({
            originalAction: 'button_clicked',
            error: 'Logging service unavailable',
          })
        );
      });
    });

    it('should debounce rapid button clicks', async () => {
      // Arrange: Enable debounce feature flag
      mockFeatureFlags.isEnabled.mockImplementation(
        (flag: string) => flag === 'enable-click-debounce'
      );

      const handleAction = vi.fn();
      vi.mocked(useFeatureFlags).mockImplementation(() => ({
        ...mockFeatureFlags,
        flags: { 'enable-click-debounce': true },
      }));

      render(<HomePage />);

      const button = screen.getByRole('button', { name: /submit/i });

      // Act: Simulate rapid clicks (5 clicks in quick succession)
      await user.click(button);
      await user.click(button);
      await user.click(button);
      await user.click(button);
      await user.click(button);

      // Assert: Only one action should be triggered due to debounce
      await waitFor(
        () => {
          expect(mockLogger.info).toHaveBeenCalledTimes(1);
        },
        { timeout: 1000 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Test: Form Input Interactions
  // ---------------------------------------------------------------------------

  describe('Form Input Interactions', () => {
    it('should handle text input with validation feedback', async () => {
      render(<HomePage />);

      const emailInput = screen.getByRole('textbox', { name: /email/i });

      // Act: Type valid email address
      await user.type(emailInput, 'user@example.com');

      // Assert: Input value updated and validation passed
      expect(emailInput).toHaveValue('user@example.com');

      // Verify interaction logged with input metadata (not value for privacy)
      await waitFor(() => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          'user_interaction:input_changed',
          expect.objectContaining({
            fieldId: 'email',
            fieldType: 'email',
            validationStatus: 'valid',
            valueLength: 16, // Log length only, not actual value
          })
        );
      });
    });

    it('should handle invalid input with error state', async () => {
      render(<HomePage />);

      const emailInput = screen.getByRole('textbox', { name: /email/i });
      const submitButton = screen.getByRole('button', { name: /submit/i });

      // Act: Type invalid email and attempt submit
      await user.type(emailInput, 'invalid-email');
      await user.click(submitButton);

      // Assert: Error state displayed and logged
      const errorMessage = await screen.findByRole('alert');
      expect(errorMessage).toHaveTextContent(/invalid email format/i);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'user_interaction:validation_failed',
        expect.objectContaining({
          fieldId: 'email',
          errorType: 'format_invalid',
        })
      );
    });

    it('should handle keyboard navigation through form fields', async () => {
      render(<HomePage />);

      const emailInput = screen.getByRole('textbox', { name: /email/i });
      const nameInput = screen.getByRole('textbox', { name: /name/i });

      // Act: Tab through fields using keyboard
      await user.click(emailInput); // Focus email
      await user.keyboard('{Tab}'); // Tab to next field

      // Assert: Focus moved to name input
      expect(nameInput).toHaveFocus();

      // Verify keyboard navigation logged for accessibility tracking
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'user_interaction:keyboard_navigation',
        expect.objectContaining({
          fromField: 'email',
          toField: 'name',
          navigationType: 'tab',
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Test: Modal/Dialog Interactions
  // ---------------------------------------------------------------------------

  describe('Modal Interactions', () => {
    it('should open modal on trigger click and log interaction', async () => {
      render(<HomePage />);

      const openModalButton = screen.getByRole('button', { name: /open settings/i });

      // Act: Open modal
      await user.click(openModalButton);

      // Assert: Modal is displayed with proper ARIA attributes
      const modal = await screen.findByRole('dialog');
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveAttribute('aria-modal', 'true');

      // Verify modal open logged
      expect(mockLogger.info).toHaveBeenCalledWith(
        'user_interaction:modal_opened',
        expect.objectContaining({
          modalId: 'settings-modal',
          triggerElement: 'open-settings-button',
        })
      );
    });

    it('should close modal on escape key press', async () => {
      render(<HomePage />);

      // Open modal first
      await user.click(screen.getByRole('button', { name: /open settings/i }));
      const modal = await screen.findByRole('dialog');

      // Act: Press escape key
      await user.keyboard('{Escape}');

      // Assert: Modal closed and logged
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'user_interaction:modal_closed',
        expect.objectContaining({
          modalId: 'settings-modal',
          closeMethod: 'escape_key',
        })
      );
    });

    it('should trap focus within modal when open', async () => {
      render(<HomePage />);

      // Open modal
      await user.click(screen.getByRole('button', { name: /open settings/i }));
      await screen.findByRole('dialog');

      // Get focusable elements within modal
      const saveButton = screen.getByRole('button', { name: /save/i });
      const cancelButton = screen.getByRole('button', { name: /cancel/i });

      // Act: Tab through all focusable elements
      await user.click(saveButton);
      await user.keyboard('{Tab}');
      await user.keyboard('{Tab}');
      await user.keyboard('{Tab}');

      // Assert: Focus cycles back to first element (focus trap)
      expect(saveButton).toHaveFocus();
    });
  });

  // ---------------------------------------------------------------------------
  // Test: Async Operation Interactions
  // ---------------------------------------------------------------------------

  describe('Async Operation Interactions', () => {
    it('should show loading state during async operation', async () => {
      render(<HomePage />);

      const asyncButton = screen.getByRole('button', { name: /fetch data/i });

      // Act: Trigger async operation
      await user.click(asyncButton);

      // Assert: Loading state immediately shown
      expect(asyncButton).toBeDisabled();
      expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');

      // Verify loading state logged
      expect(mockLogger.info).toHaveBeenCalledWith(
        'user_interaction:async_operation_started',
        expect.objectContaining({
          operationId: expect.any(String),
          operationType: 'data_fetch',
        })
      );
    });

    it('should handle async operation success with feedback', async () => {
      render(<HomePage />);

      const asyncButton = screen.getByRole('button', { name: /fetch data/i });

      // Act: Complete async operation
      await user.click(asyncButton);

      // Wait for completion
      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      // Assert: Success feedback shown
      const successAlert = screen.getByRole('alert');
      expect(successAlert).toHaveAttribute('data-status', 'success');

      // Verify success logged with duration
      expect(mockLogger.info).toHaveBeenCalledWith(
        'user_interaction:async_operation_completed',
        expect.objectContaining({
          operationType: 'data_fetch',
          status: 'success',
          durationMs: expect.any(Number),
        })
      );
    });

    it('should handle async operation failure with retry option', async () => {
      // Arrange: Mock fetch to fail
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      render(<HomePage />);

      const asyncButton = screen.getByRole('button', { name: /fetch data/i });

      // Act: Trigger failing operation
      await user.click(asyncButton);

      // Wait for error state
      const errorAlert = await screen.findByRole('alert');
      expect(errorAlert).toHaveAttribute('data-status', 'error');

      // Assert: Retry button available
      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();

      // Verify error logged with retry context
      expect(mockLogger.error).toHaveBeenCalledWith(
        'user_interaction:async_operation_failed',
        expect.objectContaining({
          operationType: 'data_fetch',
          error: 'Network error',
          retryAvailable: true,
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Test: Accessibility Interactions
  // ---------------------------------------------------------------------------

  describe('Accessibility Interactions', () => {
    it('should announce dynamic content changes to screen readers', async () => {
      render(<HomePage />);

      const updateButton = screen.getByRole('button', { name: /update content/i });

      // Act: Trigger content update
      await user.click(updateButton);

      // Assert: Live region updated for screen reader announcement
      const liveRegion = screen.getByRole('status', { live: 'polite' });
      expect(liveRegion).toHaveTextContent(/content updated/i);
    });

    it('should maintain focus management during dynamic updates', async () => {
      render(<HomePage />);

      const addItemButton = screen.getByRole('button', { name: /add item/i });

      // Act: Add new item to list
      await user.click(addItemButton);

      // Assert: Focus moved to new item for keyboard navigation
      const newItem = await screen.findByRole('listitem', { name: /item-3/i });
      const deleteButton = within(newItem).getByRole('button', { name: /delete/i });
      expect(deleteButton).toHaveFocus();
    });

    it('should handle high contrast mode preference', async () => {
      // Arrange: Mock matchMedia for high contrast preference
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-contrast: high)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      render(<HomePage />);

      // Assert: High contrast styles applied
      const mainContainer = screen.getByRole('main');
      expect(mainContainer).toHaveClass('high-contrast');
    });
  });
});

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Helper to query within a specific element container
 * Follows Testing Library's within pattern for scoped queries
 */
function within(element: HTMLElement) {
  return {
    getByRole: (role: string, options?: Record<string, unknown>) => {
      const results = element.querySelectorAll(`[role="${role}"]`);
      if (options?.name) {
        const namedResult = Array.from(results).find(
          (el) => el.getAttribute('aria-label') === options.name || el.textContent?.includes(options.name as string)
        );
        if (!namedResult) {
          throw new Error(`Unable to find element with role="${role}" and name="${options.name}"`);
        }
        return namedResult as HTMLElement;
      }
      if (results.length === 0) {
        throw new Error(`Unable to find element with role="${role}"`);
      }
      return results[0] as HTMLElement;
    },
  };
}