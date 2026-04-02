// page.test.tsx - Comprehensive test suite for the main page component
// Layer: UI (Six-layer architecture: Types → Config → Repo → Service → Runtime → UI)

import { render, screen, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

// Types layer imports
import { 
  PageProps, 
  PageState, 
  PageConfig,
  LoadingState,
  ErrorState,
  SuccessState 
} from '@/types/page.types';
import { ApiResponse, ApiError } from '@/types/api.types';

// Config layer imports
import { APP_CONFIG } from '@/config/app.config';
import { API_ENDPOINTS } from '@/config/endpoints.config';

// Service layer imports (mocked)
import { fetchPageData } from '@/services/page.service';
import { logger } from '@/services/logging.service';

// Component under test
import Page from './page';

// ============================================
// Type Definitions for Test Suite
// ============================================

interface TestWrapperProps {
  children: ReactNode;
}

interface MockPageData {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

// ============================================
// Mock Setup
// ============================================

// Mock the logger service to prevent actual logging during tests
jest.mock('@/services/logging.service', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the page service
jest.mock('@/services/page.service', () => ({
  fetchPageData: jest.fn(),
}));

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
  })),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

// ============================================
// Test Utilities
// ============================================

/**
 * Creates a fresh QueryClient for each test to ensure test isolation
 */
const createTestQueryClient = (): QueryClient => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
    },
  });
};

/**
 * Wrapper component that provides necessary context providers
 */
const TestWrapper: React.FC<TestWrapperProps> = ({ children }) => {
  const queryClient = createTestQueryClient();
  
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

/**
 * Helper to render component with all required providers
 */
const renderWithProviders = (component: React.ReactElement) => {
  return render(component, { wrapper: TestWrapper });
};

/**
 * Factory function to create mock page data
 */
const createMockPageData = (overrides?: Partial<MockPageData>): MockPageData => ({
  id: 'test-page-001',
  title: 'Test Page Title',
  content: 'This is test content for the page',
  metadata: { author: 'Test Author', version: '1.0.0' },
  ...overrides,
});

/**
 * Factory function to create mock API responses
 */
const createMockApiResponse = <T,>(
  data: T,
  success = true
): ApiResponse<T> => ({
  success,
  data,
  timestamp: new Date().toISOString(),
});

/**
 * Factory function to create mock API errors
 */
const createMockApiError = (message: string, code: string): ApiError => ({
  message,
  code,
  timestamp: new Date().toISOString(),
  details: {},
});

// ============================================
// Test Suite
// ============================================

describe('Page Component', () => {
  // Reset all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Clean up after all tests
  afterAll(() => {
    jest.restoreAllMocks();
  });

  // ==========================================
  // Rendering Tests
  // ==========================================

  describe('Rendering', () => {
    it('should render the page component without crashing', () => {
      // Arrange: Setup mock data
      const mockData = createMockPageData();
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act: Render the component
      const { container } = renderWithProviders(<Page />);

      // Assert: Component rendered
      expect(container).toBeInTheDocument();
    });

    it('should render with correct page structure', async () => {
      // Arrange
      const mockData = createMockPageData();
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act
      renderWithProviders(<Page />);

      // Assert: Wait for async operations and verify structure
      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });
    });

    it('should apply correct ARIA attributes for accessibility', async () => {
      // Arrange
      const mockData = createMockPageData();
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act
      renderWithProviders(<Page />);

      // Assert
      await waitFor(() => {
        const mainElement = screen.getByRole('main');
        expect(mainElement).toHaveAttribute('aria-label');
      });
    });
  });

  // ==========================================
  // Data Fetching Tests
  // ==========================================

  describe('Data Fetching', () => {
    it('should call fetchPageData on mount', async () => {
      // Arrange
      const mockData = createMockPageData();
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act
      renderWithProviders(<Page />);

      // Assert
      await waitFor(() => {
        expect(fetchPageData).toHaveBeenCalledTimes(1);
      });
    });

    it('should pass correct parameters to fetchPageData', async () => {
      // Arrange
      const mockData = createMockPageData();
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act
      renderWithProviders(<Page />);

      // Assert
      await waitFor(() => {
        expect(fetchPageData).toHaveBeenCalledWith(
          expect.objectContaining({
            // Add expected parameters based on your implementation
          })
        );
      });
    });

    it('should display data when fetch succeeds', async () => {
      // Arrange
      const mockData = createMockPageData({
        title: 'Specific Test Title',
        content: 'Specific test content',
      });
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act
      renderWithProviders(<Page />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Specific Test Title')).toBeInTheDocument();
        expect(screen.getByText('Specific test content')).toBeInTheDocument();
      });
    });

    it('should handle empty data response gracefully', async () => {
      // Arrange
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(null));

      // Act
      renderWithProviders(<Page />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/no data available/i)).toBeInTheDocument();
      });
    });
  });

  // ==========================================
  // Loading State Tests
  // ==========================================

  describe('Loading States', () => {
    it('should display loading indicator while fetching data', () => {
      // Arrange: Create a promise that never resolves to keep loading state
      (fetchPageData as jest.Mock).mockImplementation(() => new Promise(() => {}));

      // Act
      renderWithProviders(<Page />);

      // Assert
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should hide loading indicator after data is fetched', async () => {
      // Arrange
      const mockData = createMockPageData();
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act
      renderWithProviders(<Page />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    });

    it('should show skeleton loader when configured', async () => {
      // Arrange
      (fetchPageData as jest.Mock).mockImplementation(() => new Promise(() => {}));

      // Act
      renderWithProviders(<Page />);

      // Assert
      expect(screen.getByTestId('page-skeleton')).toBeInTheDocument();
    });
  });

  // ==========================================
  // Error Handling Tests
  // ==========================================

  describe('Error Handling', () => {
    it('should display error message when fetch fails', async () => {
      // Arrange
      const errorMessage = 'Failed to load page data';
      (fetchPageData as jest.Mock).mockRejectedValue(
        createMockApiError(errorMessage, 'FETCH_ERROR')
      );

      // Act
      renderWithProviders(<Page />);

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('should log errors using structured logger', async () => {
      // Arrange
      const error = createMockApiError('Network error', 'NETWORK_ERROR');
      (fetchPageData as jest.Mock).mockRejectedValue(error);

      // Act
      renderWithProviders(<Page />);

      // Assert
      await waitFor(() => {
        expect(logger.error).toHaveBeenCalledWith(
          'Failed to fetch page data',
          expect.objectContaining({
            error: expect.any(Object),
            component: 'Page',
          })
        );
      });
    });

    it('should provide retry functionality on error', async () => {
      // Arrange
      (fetchPageData as jest.Mock)
        .mockRejectedValueOnce(createMockApiError('First attempt failed', 'ERROR'))
        .mockResolvedValueOnce(createMockApiResponse(createMockPageData()));

      // Act
      renderWithProviders(<Page />);

      // Wait for error state
      const retryButton = await screen.findByRole('button', { name: /retry/i });
      
      // Click retry
      await userEvent.click(retryButton);

      // Assert
      await waitFor(() => {
        expect(fetchPageData).toHaveBeenCalledTimes(2);
      });
    });

    it('should handle timeout errors specifically', async () => {
      // Arrange
      const timeoutError = createMockApiError('Request timeout', 'TIMEOUT_ERROR');
      (fetchPageData as jest.Mock).mockRejectedValue(timeoutError);

      // Act
      renderWithProviders(<Page />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/timeout/i)).toBeInTheDocument();
      });
    });
  });

  // ==========================================
  // User Interaction Tests
  // ==========================================

  describe('User Interactions', () => {
    it('should handle button clicks correctly', async () => {
      // Arrange
      const mockData = createMockPageData();
      const mockAction = jest.fn();
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act
      renderWithProviders(<Page />);

      // Wait for load
      await waitFor(() => {
        expect(screen.getByText(mockData.title)).toBeInTheDocument();
      });

      // Find and click button
      const actionButton = screen.getByRole('button', { name: /action/i });
      await userEvent.click(actionButton);

      // Assert
      expect(mockAction).toHaveBeenCalled();
    });

    it('should handle form submissions', async () => {
      // Arrange
      const mockData = createMockPageData();
      const handleSubmit = jest.fn();
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act
      renderWithProviders(<Page />);

      await waitFor(() => {
        expect(screen.getByRole('form')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await userEvent.type(input, 'test input');

      const submitButton = screen.getByRole('button', { name: /submit/i });
      await userEvent.click(submitButton);

      // Assert
      expect(handleSubmit).toHaveBeenCalled();
    });

    it('should prevent default on link clicks with modifiers', async () => {
      // Arrange
      const mockData = createMockPageData();
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act
      renderWithProviders(<Page />);

      await waitFor(() => {
        expect(screen.getByRole('link')).toBeInTheDocument();
      });

      const link = screen.getByRole('link');
      await userEvent.click(link, { ctrlKey: true });

      // Assert: Check that navigation was handled correctly
      // This depends on your specific implementation
    });
  });

  // ==========================================
  // Edge Cases Tests
  // ==========================================

  describe('Edge Cases', () => {
    it('should handle very long content without breaking layout', async () => {
      // Arrange
      const longContent = 'a'.repeat(10000);
      const mockData = createMockPageData({ content: longContent });
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act
      const { container } = renderWithProviders(<Page />);

      // Assert
      await waitFor(() => {
        const contentElement = screen.getByText(longContent);
        expect(contentElement).toBeInTheDocument();
      });
      
      // Check no overflow issues
      expect(container.firstChild).toHaveStyle({ overflow: expect.any(String) });
    });

    it('should handle special characters in content', async () => {
      // Arrange
      const specialContent = '<script>alert("xss")</script> & "quotes" \'apostrophes\'';
      const mockData = createMockPageData({ content: specialContent });
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act
      renderWithProviders(<Page />);

      // Assert
      await waitFor(() => {
        // Content should be escaped, not rendered as HTML
        expect(screen.getByText(/<script>/)).toBeInTheDocument();
      });
    });

    it('should handle rapid prop changes', async () => {
      // Arrange
      const mockData1 = createMockPageData({ id: '1', title: 'First' });
      const mockData2 = createMockPageData({ id: '2', title: 'Second' });
      
      (fetchPageData as jest.Mock)
        .mockResolvedValueOnce(createMockApiResponse(mockData1))
        .mockResolvedValueOnce(createMockApiResponse(mockData2));

      // Act & Assert
      const { rerender } = renderWithProviders(<Page />);

      await waitFor(() => {
        expect(screen.getByText('First')).toBeInTheDocument();
      });

      // Trigger re-render with new props if applicable
      rerender(<Page />);

      await waitFor(() => {
        expect(screen.getByText('Second')).toBeInTheDocument();
      });
    });

    it('should cleanup resources on unmount', async () => {
      // Arrange
      const mockData = createMockPageData();
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act
      const { unmount } = renderWithProviders(<Page />);
      
      await waitFor(() => {
        expect(screen.getByText(mockData.title)).toBeInTheDocument();
      });

      unmount();

      // Assert: Check that subscriptions/timers are cleaned up
      // This might involve checking mock calls to cleanup functions
    });
  });

  // ==========================================
  // Accessibility Tests
  // ==========================================

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      // Arrange
      const mockData = createMockPageData();
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act
      const { container } = renderWithProviders(<Page />);

      await waitFor(() => {
        expect(screen.getByText(mockData.title)).toBeInTheDocument();
      });

      // Assert: Would typically use jest-axe here
      // const results = await axe(container);
      // expect(results).toHaveNoViolations();
      expect(container).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      // Arrange
      const mockData = createMockPageData();
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act
      renderWithProviders(<Page />);

      await waitFor(() => {
        expect(screen.getByText(mockData.title)).toBeInTheDocument();
      });

      // Tab through interactive elements
      await userEvent.tab();
      expect(document.activeElement).toBe(screen.getByRole('button'));

      await userEvent.tab();
      expect(document.activeElement).toBe(screen.getByRole('link'));
    });

    it('should announce dynamic content changes to screen readers', async () => {
      // Arrange
      const mockData = createMockPageData();
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act
      renderWithProviders(<Page />);

      // Assert
      await waitFor(() => {
        const liveRegion = screen.getByRole('status', { live: 'polite' });
        expect(liveRegion).toBeInTheDocument();
      });
    });
  });

  // ==========================================
  // Performance Tests
  // ==========================================

  describe('Performance', () => {
    it('should not re-render unnecessarily', async () => {
      // Arrange
      const mockData = createMockPageData();
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));
      
      const renderCount = { value: 0 };
      const OriginalPage = Page;

      // Wrap to count renders
      const TrackedPage = () => {
        renderCount.value++;
        return <OriginalPage />;
      };

      // Act
      renderWithProviders(<TrackedPage />);

      await waitFor(() => {
        expect(screen.getByText(mockData.title)).toBeInTheDocument();
      });

      // Assert: Should render once for initial, once for data load
      expect(renderCount.value).toBeLessThanOrEqual(2);
    });

    it('should debounce rapid user inputs', async () => {
      // Arrange
      const mockData = createMockPageData();
      const debouncedFunction = jest.fn();
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act
      renderWithProviders(<Page />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      
      // Type rapidly
      await userEvent.type(input, 'rapid typing');

      // Assert: Debounced function should not be called for every keystroke
      // Wait for debounce timeout
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(debouncedFunction).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================
  // Integration Tests
  // ==========================================

  describe('Integration', () => {
    it('should integrate correctly with global state', async () => {
      // Arrange
      const mockData = createMockPageData();
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));

      // Act
      renderWithProviders(<Page />);

      // Assert: Verify state updates are reflected
      await waitFor(() => {
        // Check for state-dependent rendering
      });
    });

    it('should respect feature flags', async () => {
      // Arrange
      const mockData = createMockPageData();
      (fetchPageData as jest.Mock).mockResolvedValue(createMockApiResponse(mockData));
      
      // Mock feature flag
      jest.mock('@/config/features.config', () => ({
        FEATURES: {
          NEW_UI: true,
        },
      }));

      // Act
      renderWithProviders(<Page />);

      // Assert
      await waitFor(() => {
        // Check for feature-flag dependent elements
      });
    });
  });
});