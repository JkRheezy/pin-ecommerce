/**
 * @fileoverview Tests for the main page component following the six-layer architecture.
 * Tests cover: Types → Config → Repo → Service → Runtime → UI layers
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Page from './page';
import { Logger } from '@harness/logging';
import { ErrorBoundary } from '@harness/error-handling';

// ============================================================================
// Types Layer - Test Types and Interfaces
// ============================================================================

interface MockUser {
  id: string;
  email: string;
  name: string;
}

interface MockProject {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'archived';
}

// ============================================================================
// Config Layer - Mock Configurations
// ============================================================================

const MOCK_CONFIG = {
  API_BASE_URL: 'https://api.harness.io',
  DEFAULT_PAGE_SIZE: 20,
  MAX_RETRY_ATTEMPTS: 3,
  FEATURE_FLAGS: {
    ENABLE_NEW_UI: true,
    ENABLE_ANALYTICS: false,
  },
} as const;

// ============================================================================
// Repo Layer - Mock Data Repositories
// ============================================================================

const mockUsers: MockUser[] = [
  { id: 'user-1', email: 'alice@example.com', name: 'Alice Johnson' },
  { id: 'user-2', email: 'bob@example.com', name: 'Bob Smith' },
  { id: 'user-3', email: 'charlie@example.com', name: 'Charlie Brown' },
];

const mockProjects: MockProject[] = [
  { id: 'proj-1', name: 'Project Alpha', status: 'active' },
  { id: 'proj-2', name: 'Project Beta', status: 'inactive' },
  { id: 'proj-3', name: 'Project Gamma', status: 'archived' },
];

// ============================================================================
// Service Layer - Mock Service Implementations
// ============================================================================

// Mock the logger service
vi.mock('@harness/logging', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the API service
const mockFetchUsers = vi.fn();
const mockFetchProjects = vi.fn();

vi.mock('@/services/userService', () => ({
  fetchUsers: (...args: unknown[]) => mockFetchUsers(...args),
}));

vi.mock('@/services/projectService', () => ({
  fetchProjects: (...args: unknown[]) => mockFetchProjects(...args),
}));

// ============================================================================
// Runtime Layer - Test Setup and Utilities
// ============================================================================

// Helper to create mock responses with proper typing
function createMockResponse<T>(data: T, delay = 0): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(data), delay);
  });
}

// Helper to create mock error responses
function createMockError(message: string, code: string): Error {
  const error = new Error(message);
  (error as Error & { code: string }).code = code;
  return error;
}

// ============================================================================
// UI Layer - Component Tests
// ============================================================================

describe('Page Component', () => {
  // Setup before each test
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset fetch mocks to successful responses
    mockFetchUsers.mockResolvedValue(mockUsers);
    mockFetchProjects.mockResolvedValue(mockProjects);
  });

  // Cleanup after each test
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Core Functionality Tests
  // --------------------------------------------------------------------------

  describe('Core Functionality', () => {
    it('should render the page with correct heading', async () => {
      render(<Page />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/dashboard/i);
      });
    });

    it('should fetch and display users on mount', async () => {
      render(<Page />);

      await waitFor(() => {
        expect(mockFetchUsers).toHaveBeenCalledTimes(1);
      });

      // Verify users are rendered
      for (const user of mockUsers) {
        expect(await screen.findByText(user.name)).toBeInTheDocument();
      }
    });

    it('should fetch and display projects on mount', async () => {
      render(<Page />);

      await waitFor(() => {
        expect(mockFetchProjects).toHaveBeenCalledTimes(1);
      });

      // Verify projects are rendered
      for (const project of mockProjects) {
        expect(await screen.findByText(project.name)).toBeInTheDocument();
      }
    });

    it('should display loading state while fetching data', async () => {
      // Delay the response to ensure loading state is visible
      mockFetchUsers.mockImplementation(() => createMockResponse(mockUsers, 100));
      mockFetchProjects.mockImplementation(() => createMockResponse(mockProjects, 100));

      render(<Page />);

      // Check for loading indicator
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading');
    });

    it('should handle user selection', async () => {
      render(<Page />);

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText(mockUsers[0].name)).toBeInTheDocument();
      });

      // Click on a user
      const userButton = screen.getByRole('button', { name: mockUsers[0].name });
      fireEvent.click(userButton);

      // Verify selection state (assuming component shows selected state)
      expect(userButton).toHaveAttribute('aria-selected', 'true');
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases and Error Handling
  // --------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should handle user fetch failure gracefully', async () => {
      const errorMessage = 'Failed to fetch users';
      mockFetchUsers.mockRejectedValue(createMockError(errorMessage, 'FETCH_ERROR'));

      render(<Page />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/failed to load users/i);
      });

      // Verify error is logged
      expect(Logger.error).toHaveBeenCalledWith(
        'Failed to fetch users',
        expect.objectContaining({ code: 'FETCH_ERROR' })
      );
    });

    it('should handle project fetch failure gracefully', async () => {
      const errorMessage = 'Failed to fetch projects';
      mockFetchProjects.mockRejectedValue(createMockError(errorMessage, 'PROJECT_FETCH_ERROR'));

      render(<Page />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/failed to load projects/i);
      });
    });

    it('should handle partial data failure (users succeed, projects fail)', async () => {
      mockFetchUsers.mockResolvedValue(mockUsers);
      mockFetchProjects.mockRejectedValue(new Error('Project service unavailable'));

      render(<Page />);

      // Users should still display
      await waitFor(() => {
        expect(screen.getByText(mockUsers[0].name)).toBeInTheDocument();
      });

      // But error should show for projects
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to load projects/i);
    });

    it('should handle empty user list', async () => {
      mockFetchUsers.mockResolvedValue([]);

      render(<Page />);

      await waitFor(() => {
        expect(screen.getByText(/no users found/i)).toBeInTheDocument();
      });
    });

    it('should handle empty project list', async () => {
      mockFetchProjects.mockResolvedValue([]);

      render(<Page />);

      await waitFor(() => {
        expect(screen.getByText(/no projects found/i)).toBeInTheDocument();
      });
    });

    it('should handle malformed user data', async () => {
      // Missing required fields
      const malformedUsers = [{ id: 'bad-user' /* missing email and name */ }];
      mockFetchUsers.mockResolvedValue(malformedUsers);

      render(<Page />);

      // Should not crash, should show error state
      await waitFor(() => {
        expect(Logger.error).toHaveBeenCalledWith(
          'Invalid user data received',
          expect.any(Object)
        );
      });
    });

    it('should handle network timeout', async () => {
      mockFetchUsers.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 5000)
        )
      );

      render(<Page />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/timeout/i);
      });
    });

    it('should retry failed requests up to MAX_RETRY_ATTEMPTS', async () => {
      // Fail twice, then succeed
      mockFetchUsers
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockUsers);

      render(<Page />);

      await waitFor(() => {
        expect(mockFetchUsers).toHaveBeenCalledTimes(3);
      });

      // Should eventually show data
      expect(screen.getByText(mockUsers[0].name)).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Input Validation Tests
  // --------------------------------------------------------------------------

  describe('Input Validation', () => {
    it('should validate search input and prevent XSS', async () => {
      render(<Page />);

      const searchInput = screen.getByRole('searchbox');
      const maliciousInput = '<script>alert("xss")</script>';

      fireEvent.change(searchInput, { target: { value: maliciousInput } });

      // Should sanitize input
      expect(searchInput).toHaveValue(maliciousInput);
      // Verify no script tags are rendered
      expect(document.querySelector('script')).not.toBeInTheDocument();
    });

    it('should enforce maximum search length', async () => {
      render(<Page />);

      const searchInput = screen.getByRole('searchbox');
      const longInput = 'a'.repeat(1000);

      fireEvent.change(searchInput, { target: { value: longInput } });

      // Should truncate or reject超长输入
      expect((searchInput as HTMLInputElement).value.length).toBeLessThanOrEqual(255);
    });

    it('should handle special characters in search', async () => {
      render(<Page />);

      const searchInput = screen.getByRole('searchbox');
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';

      fireEvent.change(searchInput, { target: { value: specialChars } });

      // Should not crash
      expect(searchInput).toHaveValue(specialChars);
    });
  });

  // --------------------------------------------------------------------------
  // Accessibility Tests
  // --------------------------------------------------------------------------

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      render(<Page />);

      await waitFor(() => {
        expect(screen.getByRole('main')).toHaveAttribute('aria-label');
      });
    });

    it('should support keyboard navigation', async () => {
      render(<Page />);

      await waitFor(() => {
        expect(screen.getByText(mockUsers[0].name)).toBeInTheDocument();
      });

      const firstButton = screen.getByRole('button', { name: mockUsers[0].name });
      
      // Tab to first element
      firstButton.focus();
      expect(document.activeElement).toBe(firstButton);

      // Should handle Enter key
      fireEvent.keyDown(firstButton, { key: 'Enter' });
      expect(firstButton).toHaveAttribute('aria-selected', 'true');
    });

    it('should announce loading states to screen readers', async () => {
      mockFetchUsers.mockImplementation(() => createMockResponse(mockUsers, 100));

      render(<Page />);

      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveAttribute('aria-live', 'polite');
    });
  });

  // --------------------------------------------------------------------------
  // Performance Tests
  // --------------------------------------------------------------------------

  describe('Performance', () => {
    it('should debounce search input', async () => {
      render(<Page />);

      const searchInput = screen.getByRole('searchbox');

      // Rapid fire input changes
      fireEvent.change(searchInput, { target: { value: 'a' } });
      fireEvent.change(searchInput, { target: { value: 'ab' } });
      fireEvent.change(searchInput, { target: { value: 'abc' } });

      // Should not fetch on every keystroke
      expect(mockFetchUsers).not.toHaveBeenCalled();

      // Wait for debounce
      await waitFor(() => {
        expect(mockFetchUsers).toHaveBeenCalledTimes(1);
      }, { timeout: 500 });
    });

    it('should cancel in-flight requests on unmount', async () => {
      const abortController = new AbortController();
      mockFetchUsers.mockImplementation(() => {
        return new Promise((resolve) => {
          const timeoutId = setTimeout(() => resolve(mockUsers), 1000);
          abortController.signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
          });
        });
      });

      const { unmount } = render(<Page />);
      
      // Unmount before request completes
      unmount();

      // Verify cleanup occurred
      expect(Logger.debug).toHaveBeenCalledWith('Component unmounted, cancelling requests');
    });
  });

  // --------------------------------------------------------------------------
  // Integration with Error Boundary
  // --------------------------------------------------------------------------

  describe('Error Boundary Integration', () => {
    it('should catch and display runtime errors', async () => {
      // Force a runtime error
      mockFetchUsers.mockImplementation(() => {
        throw new Error('Unexpected runtime error');
      });

      render(
        <ErrorBoundary fallback={<div>Custom error fallback</div>}>
          <Page />
        </ErrorBoundary>
      );

      await waitFor(() => {
        expect(screen.getByText(/custom error fallback/i)).toBeInTheDocument();
      });
    });
  });
});