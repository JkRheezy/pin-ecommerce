import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';

// Types Layer: Define test-specific types
interface TestContext {
  mockRouter: {
    push: ReturnType<typeof vi.fn>;
    replace: ReturnType<typeof vi.fn>;
  };
  mockLogger: {
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };
}

// Mock the next/navigation module before importing the component
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

// Mock structured logger
vi.mock('@harness/logging', () => ({
  createLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Import after mocks are set up
import { useRouter, useSearchParams } from 'next/navigation';
import { createLogger } from '@harness/logging';
import Page from './page';

describe('Page Component', () => {
  // Config Layer: Test configuration
  const TEST_CONFIG = {
    defaultRedirect: '/dashboard',
    errorRedirect: '/error',
    loadingDelay: 100,
  } as const;

  let context: TestContext;

  beforeEach(() => {
    // Setup fresh mocks for each test
    context = {
      mockRouter: {
        push: vi.fn(),
        replace: vi.fn(),
      },
      mockLogger: {
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      },
    };

    // Configure mocks
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue(context.mockRouter);
    (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue({
      get: vi.fn().mockReturnValue(null),
    });
    (createLogger as ReturnType<typeof vi.fn>).mockReturnValue(context.mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Service Layer: Core functionality tests
  describe('Rendering', () => {
    it('should render loading state initially', () => {
      render(<Page />);
      
      // Verify loading indicator is present
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should render without crashing', () => {
      const { container } = render(<Page />);
      expect(container).toBeTruthy();
    });
  });

  describe('Navigation', () => {
    it('should redirect to dashboard on successful load', async () => {
      render(<Page />);

      // Wait for the redirect to occur
      await waitFor(() => {
        expect(context.mockRouter.replace).toHaveBeenCalledWith(TEST_CONFIG.defaultRedirect);
      }, { timeout: TEST_CONFIG.loadingDelay * 2 });
    });

    it('should handle custom redirect from search params', async () => {
      const customRedirect = '/custom-path';
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue({
        get: vi.fn().mockImplementation((key: string) => 
          key === 'redirect' ? customRedirect : null
        ),
      });

      render(<Page />);

      await waitFor(() => {
        expect(context.mockRouter.replace).toHaveBeenCalledWith(customRedirect);
      });
    });

    it('should validate redirect URL to prevent open redirect vulnerabilities', async () => {
      // Malicious redirect attempt
      const maliciousRedirect = 'https://evil.com/phishing';
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue({
        get: vi.fn().mockImplementation((key: string) => 
          key === 'redirect' ? maliciousRedirect : null
        ),
      });

      render(<Page />);

      // Should fall back to default redirect, not use malicious URL
      await waitFor(() => {
        expect(context.mockRouter.replace).toHaveBeenCalledWith(TEST_CONFIG.defaultRedirect);
      });
    });
  });

  // Runtime Layer: Error handling and edge cases
  describe('Error Handling', () => {
    it('should handle router errors gracefully', async () => {
      const routerError = new Error('Router navigation failed');
      context.mockRouter.replace.mockImplementation(() => {
        throw routerError;
      });

      render(<Page />);

      await waitFor(() => {
        expect(context.mockLogger.error).toHaveBeenCalledWith(
          'Navigation failed',
          expect.objectContaining({
            error: routerError.message,
          })
        );
      });
    });

    it('should handle missing router context', () => {
      (useRouter as ReturnType<typeof vi.fn>).mockReturnValue(null);

      // Should not throw, should handle gracefully
      expect(() => render(<Page />)).not.toThrow();
    });

    it('should handle search params parsing errors', async () => {
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue({
        get: vi.fn().mockImplementation(() => {
          throw new Error('Search params access denied');
        }),
      });

      render(<Page />);

      // Should fall back to default behavior
      await waitFor(() => {
        expect(context.mockRouter.replace).toHaveBeenCalledWith(TEST_CONFIG.defaultRedirect);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty redirect parameter', async () => {
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue({
        get: vi.fn().mockImplementation((key: string) => 
          key === 'redirect' ? '' : null
        ),
      });

      render(<Page />);

      await waitFor(() => {
        expect(context.mockRouter.replace).toHaveBeenCalledWith(TEST_CONFIG.defaultRedirect);
      });
    });

    it('should handle whitespace-only redirect parameter', async () => {
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue({
        get: vi.fn().mockImplementation((key: string) => 
          key === 'redirect' ? '   ' : null
        ),
      });

      render(<Page />);

      await waitFor(() => {
        expect(context.mockRouter.replace).toHaveBeenCalledWith(TEST_CONFIG.defaultRedirect);
      });
    });

    it('should handle relative path with leading slash', async () => {
      const relativePath = '/settings/profile';
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue({
        get: vi.fn().mockImplementation((key: string) => 
          key === 'redirect' ? relativePath : null
        ),
      });

      render(<Page />);

      await waitFor(() => {
        expect(context.mockRouter.replace).toHaveBeenCalledWith(relativePath);
      });
    });

    it('should reject javascript: protocol URLs', async () => {
      const xssAttempt = 'javascript:alert("xss")';
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue({
        get: vi.fn().mockImplementation((key: string) => 
          key === 'redirect' ? xssAttempt : null
        ),
      });

      render(<Page />);

      await waitFor(() => {
        expect(context.mockRouter.replace).toHaveBeenCalledWith(TEST_CONFIG.defaultRedirect);
        expect(context.mockLogger.error).toHaveBeenCalledWith(
          'Invalid redirect URL rejected',
          expect.any(Object)
        );
      });
    });

    it('should reject data: protocol URLs', async () => {
      const dataUrlAttempt = 'data:text/html,<script>alert("xss")</script>';
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue({
        get: vi.fn().mockImplementation((key: string) => 
          key === 'redirect' ? dataUrlAttempt : null
        ),
      });

      render(<Page />);

      await waitFor(() => {
        expect(context.mockRouter.replace).toHaveBeenCalledWith(TEST_CONFIG.defaultRedirect);
      });
    });

    it('should handle component unmount during async operation', async () => {
      const { unmount } = render(<Page />);
      
      // Unmount before async operations complete
      unmount();

      // Should not throw or log errors after unmount
      await waitFor(() => {
        expect(context.mockLogger.error).not.toHaveBeenCalledWith(
          'Navigation failed',
          expect.any(Object)
        );
      });
    });

    it('should handle rapid re-renders', async () => {
      const { rerender } = render(<Page />);
      
      // Rapid re-renders should not cause multiple redirects
      rerender(<Page />);
      rerender(<Page />);
      rerender(<Page />);

      await waitFor(() => {
        // Should only redirect once due to useEffect cleanup
        expect(context.mockRouter.replace).toHaveBeenCalledTimes(1);
      });
    });
  });

  // UI Layer: Accessibility and user experience tests
  describe('Accessibility', () => {
    it('should have proper ARIA attributes on loading indicator', () => {
      render(<Page />);
      
      const loadingElement = screen.getByRole('status');
      expect(loadingElement).toHaveAttribute('aria-live', 'polite');
    });

    it('should maintain focus management during loading', () => {
      render(<Page />);
      
      // Loading state should be announced to screen readers
      expect(screen.getByText(/loading/i)).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('Logging', () => {
    it('should log navigation attempts at debug level', async () => {
      render(<Page />);

      await waitFor(() => {
        expect(context.mockLogger.debug).toHaveBeenCalledWith(
          'Initiating page load',
          expect.any(Object)
        );
      });
    });

    it('should log successful navigation at info level', async () => {
      render(<Page />);

      await waitFor(() => {
        expect(context.mockLogger.info).toHaveBeenCalledWith(
          'Redirecting to dashboard',
          expect.objectContaining({
            target: TEST_CONFIG.defaultRedirect,
          })
        );
      });
    });
  });
});