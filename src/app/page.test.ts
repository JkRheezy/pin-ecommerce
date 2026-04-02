// src/app/page.test.ts
// Runtime Layer - Unit tests for page component
// Tests the main page component rendering and behavior

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Home from './page';
import { Logger } from '@harness/logging';

// Types Layer - Test fixture types
interface TestFixture {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
}

// Mock dependencies at Config Layer
vi.mock('@harness/logging', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(),
    toString: vi.fn(),
  }),
}));

// Service Layer - Mock service responses
const mockFetchData = vi.fn();

vi.mock('@/services/dataService', () => ({
  fetchDashboardData: () => mockFetchData(),
}));

describe('Home Page Component', () => {
  // Test fixtures
  const mockFixtures: TestFixture[] = [
    {
      id: 'fixture-1',
      name: 'Test Fixture Alpha',
      description: 'First test fixture for validation',
      isActive: true,
    },
    {
      id: 'fixture-2',
      name: 'Test Fixture Beta',
      description: 'Second test fixture for edge cases',
      isActive: false,
    },
  ];

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    
    // Default successful response
    mockFetchData.mockResolvedValue({
      data: mockFixtures,
      totalCount: mockFixtures.length,
      page: 1,
      pageSize: 10,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render the page title correctly', async () => {
      // Arrange & Act
      render(<Home />);

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
          'Dashboard'
        );
      });
    });

    it('should display loading state while fetching data', () => {
      // Arrange - delay the resolution to test loading state
      mockFetchData.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      // Act
      render(<Home />);

      // Assert
      expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    });

    it('should render data table when data is loaded', async () => {
      // Arrange & Act
      render(<Home />);

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      // Verify fixture data is rendered
      mockFixtures.forEach((fixture) => {
        expect(screen.getByText(fixture.name)).toBeInTheDocument();
      });
    });

    it('should render empty state when no data is available', async () => {
      // Arrange
      mockFetchData.mockResolvedValue({
        data: [],
        totalCount: 0,
        page: 1,
        pageSize: 10,
      });

      // Act
      render(<Home />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('No data available')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message when data fetch fails', async () => {
      // Arrange
      const errorMessage = 'Failed to fetch dashboard data';
      mockFetchData.mockRejectedValue(new Error(errorMessage));

      // Act
      render(<Home />);

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Unable to load data. Please try again.'
        );
      });

      // Verify error was logged
      expect(Logger.error).toHaveBeenCalledWith(
        'Failed to load dashboard data',
        expect.objectContaining({
          error: expect.any(Error),
        })
      );
    });

    it('should provide retry functionality on error', async () => {
      // Arrange
      mockFetchData.mockRejectedValueOnce(new Error('Network error'));

      // Act
      render(<Home />);

      // Wait for error state
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // Reset mock for successful retry
      mockFetchData.mockResolvedValueOnce({
        data: mockFixtures,
        totalCount: mockFixtures.length,
        page: 1,
        pageSize: 10,
      });

      // Click retry button
      const retryButton = screen.getByRole('button', { name: /retry/i });
      await userEvent.click(retryButton);

      // Assert - should show loading and then data
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });
    });
  });

  describe('User Interactions', () => {
    it('should handle search input changes', async () => {
      // Arrange
      render(<Home />);
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      const searchInput = screen.getByRole('searchbox');

      // Act
      await userEvent.type(searchInput, 'Alpha');

      // Assert - debounced search should trigger
      await waitFor(
        () => {
          expect(mockFetchData).toHaveBeenCalledWith(
            expect.objectContaining({
              searchTerm: 'Alpha',
            })
          );
        },
        { timeout: 500 } // Account for debounce delay
      );
    });

    it('should handle pagination changes', async () => {
      // Arrange
      mockFetchData.mockResolvedValue({
        data: mockFixtures,
        totalCount: 25, // Multiple pages
        page: 1,
        pageSize: 10,
      });

      render(<Home />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      // Act - click next page
      const nextButton = screen.getByRole('button', { name: /next page/i });
      await userEvent.click(nextButton);

      // Assert
      await waitFor(() => {
        expect(mockFetchData).toHaveBeenCalledWith(
          expect.objectContaining({
            page: 2,
            pageSize: 10,
          })
        );
      });
    });

    it('should handle row selection', async () => {
      // Arrange
      const onRowSelect = vi.fn();
      render(<Home onRowSelect={onRowSelect} />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      // Act - click on first row
      const firstRow = screen.getAllByRole('row')[1]; // Skip header row
      await userEvent.click(firstRow);

      // Assert
      expect(onRowSelect).toHaveBeenCalledWith(mockFixtures[0]);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      // Arrange & Act
      render(<Home />);

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
        expect(screen.getByRole('table')).toHaveAttribute(
          'aria-label',
          'Dashboard data table'
        );
      });
    });

    it('should support keyboard navigation', async () => {
      // Arrange
      render(<Home />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      const firstRow = screen.getAllByRole('row')[1];

      // Act - focus and activate with keyboard
      firstRow.focus();
      await userEvent.keyboard('{Enter}');

      // Assert - row should be interactive
      expect(firstRow).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed API response gracefully', async () => {
      // Arrange - API returns unexpected structure
      mockFetchData.mockResolvedValue({
        unexpectedField: 'value',
      });

      // Act
      render(<Home />);

      // Assert - should not crash, show empty state
      await waitFor(() => {
        expect(screen.getByText('No data available')).toBeInTheDocument();
      });

      expect(Logger.error).toHaveBeenCalled();
    });

    it('should handle very long text in cells', async () => {
      // Arrange
      const longText = 'A'.repeat(500);
      mockFetchData.mockResolvedValue({
        data: [
          {
            id: 'long-text',
            name: longText,
            description: longText,
            isActive: true,
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 10,
      });

      // Act
      render(<Home />);

      // Assert - should render without layout issues
      await waitFor(() => {
        const cell = screen.getByText(longText);
        expect(cell).toBeInTheDocument();
        expect(cell).toHaveClass('truncate'); // Should have truncation class
      });
    });

    it('should cancel in-flight requests on unmount', async () => {
      // Arrange
      const abortController = new AbortController();
      mockFetchData.mockImplementation(() => {
        return new Promise((resolve) => {
          // Simulate slow request
          setTimeout(() => {
            resolve({
              data: mockFixtures,
              totalCount: mockFixtures.length,
              page: 1,
              pageSize: 10,
            });
          }, 1000);
        });
      });

      const { unmount } = render(<Home />);

      // Act - unmount before request completes
      unmount();

      // Assert - no state update warnings should occur
      // (This is verified by React Testing Library's cleanup)
      expect(Logger.debug).toHaveBeenCalledWith(
        'Component unmounted, cancelling pending requests'
      );
    });
  });
});