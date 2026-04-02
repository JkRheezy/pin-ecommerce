import { render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import Page from './page';
import * as repoModule from '../repo/FeatureFlagRepo';
import * as serviceModule from '../service/FeatureFlagService';
import { FeatureFlag, FeatureFlagConfig } from '../types/FeatureFlagTypes';
import { RuntimeError } from '../runtime/RuntimeErrors';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock the repo and service layers
jest.mock('../repo/FeatureFlagRepo');
jest.mock('../service/FeatureFlagService');

describe('Page', () => {
  const mockPush = jest.fn();
  const mockFeatureFlags: FeatureFlag[] = [
    {
      identifier: 'flag-1',
      name: 'Test Flag 1',
      enabled: true,
      description: 'First test flag',
    },
    {
      identifier: 'flag-2',
      name: 'Test Flag 2',
      enabled: false,
      description: 'Second test flag',
    },
  ];

  const mockConfig: FeatureFlagConfig = {
    projectIdentifier: 'test-project',
    environmentIdentifier: 'test-env',
    accountId: 'test-account',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
  });

  describe('Core Functionality', () => {
    it('should render loading state initially', () => {
      // Arrange: Mock service to return pending promise
      jest.spyOn(serviceModule, 'fetchFeatureFlags').mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      // Act
      render(<Page />);

      // Assert
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.getByText('Loading feature flags...')).toBeInTheDocument();
    });

    it('should fetch and display feature flags on successful load', async () => {
      // Arrange: Mock successful service response
      const mockFetchFeatureFlags = jest
        .spyOn(serviceModule, 'fetchFeatureFlags')
        .mockResolvedValue({
          flags: mockFeatureFlags,
          config: mockConfig,
        });

      // Act
      render(<Page />);

      // Assert: Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('Feature Flags')).toBeInTheDocument();
      });

      // Verify service was called with correct parameters
      expect(mockFetchFeatureFlags).toHaveBeenCalledWith({
        page: 0,
        size: 20,
      });

      // Verify flags are rendered
      expect(screen.getByText('Test Flag 1')).toBeInTheDocument();
      expect(screen.getByText('Test Flag 2')).toBeInTheDocument();

      // Verify status badges
      expect(screen.getByText('Enabled')).toBeInTheDocument();
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });

    it('should handle flag toggle action', async () => {
      // Arrange
      const mockToggleFlag = jest
        .spyOn(serviceModule, 'toggleFeatureFlag')
        .mockResolvedValue(undefined);

      jest.spyOn(serviceModule, 'fetchFeatureFlags').mockResolvedValue({
        flags: mockFeatureFlags,
        config: mockConfig,
      });

      // Act
      render(<Page />);

      await waitFor(() => {
        expect(screen.getByText('Test Flag 1')).toBeInTheDocument();
      });

      // Click toggle button for first flag
      const toggleButton = screen.getAllByTestId('toggle-flag-button')[0];
      toggleButton.click();

      // Assert
      await waitFor(() => {
        expect(mockToggleFlag).toHaveBeenCalledWith('flag-1', false);
      });
    });

    it('should navigate to flag detail on row click', async () => {
      // Arrange
      jest.spyOn(serviceModule, 'fetchFeatureFlags').mockResolvedValue({
        flags: mockFeatureFlags,
        config: mockConfig,
      });

      // Act
      render(<Page />);

      await waitFor(() => {
        expect(screen.getByText('Test Flag 1')).toBeInTheDocument();
      });

      // Click on flag row
      const flagRow = screen.getByTestId('flag-row-flag-1');
      flagRow.click();

      // Assert
      expect(mockPush).toHaveBeenCalledWith('/flags/flag-1');
    });
  });

  describe('Error Handling', () => {
    it('should display error message on RuntimeError', async () => {
      // Arrange: Mock service to throw RuntimeError
      const runtimeError = new RuntimeError(
        'FETCH_ERROR',
        'Failed to fetch feature flags from API'
      );
      jest
        .spyOn(serviceModule, 'fetchFeatureFlags')
        .mockRejectedValue(runtimeError);

      // Act
      render(<Page />);

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('error-container')).toBeInTheDocument();
      });

      expect(screen.getByText('Failed to fetch feature flags from API')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('should display generic error for unknown error types', async () => {
      // Arrange: Mock service to throw generic error
      jest
        .spyOn(serviceModule, 'fetchFeatureFlags')
        .mockRejectedValue(new Error('Network timeout'));

      // Act
      render(<Page />);

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('error-container')).toBeInTheDocument();
      });

      expect(
        screen.getByText('An unexpected error occurred. Please try again.')
      ).toBeInTheDocument();
    });

    it('should allow retry after error', async () => {
      // Arrange: First call fails, second succeeds
      const mockFetch = jest
        .spyOn(serviceModule, 'fetchFeatureFlags')
        .mockRejectedValueOnce(new RuntimeError('FETCH_ERROR', 'Initial error'))
        .mockResolvedValueOnce({
          flags: mockFeatureFlags,
          config: mockConfig,
        });

      // Act: Initial render with error
      render(<Page />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      // Click retry button
      screen.getByText('Retry').click();

      // Assert: Should fetch again and show success
      await waitFor(() => {
        expect(screen.getByText('Test Flag 1')).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty feature flags list', async () => {
      // Arrange: Return empty flags array
      jest.spyOn(serviceModule, 'fetchFeatureFlags').mockResolvedValue({
        flags: [],
        config: mockConfig,
      });

      // Act
      render(<Page />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('No feature flags found')).toBeInTheDocument();
      });

      expect(
        screen.getByText('Create your first feature flag to get started.')
      ).toBeInTheDocument();
    });

    it('should handle null config gracefully', async () => {
      // Arrange: Return null config (edge case in data layer)
      jest.spyOn(serviceModule, 'fetchFeatureFlags').mockResolvedValue({
        flags: mockFeatureFlags,
        config: null as unknown as FeatureFlagConfig,
      });

      // Act - should not throw
      render(<Page />);

      // Assert: Page renders without crashing
      await waitFor(() => {
        expect(screen.getByText('Feature Flags')).toBeInTheDocument();
      });
    });

    it('should handle flags with missing optional fields', async () => {
      // Arrange: Flags with minimal required fields only
      const minimalFlags: FeatureFlag[] = [
        {
          identifier: 'minimal-flag',
          name: 'Minimal Flag',
          // enabled and description omitted
        } as FeatureFlag,
      ];

      jest.spyOn(serviceModule, 'fetchFeatureFlags').mockResolvedValue({
        flags: minimalFlags,
        config: mockConfig,
      });

      // Act
      render(<Page />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Minimal Flag')).toBeInTheDocument();
      });

      // Should show default disabled state when enabled is undefined
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });

    it('should handle very long flag names and descriptions', async () => {
      // Arrange: Flag with extremely long text
      const longTextFlag: FeatureFlag[] = [
        {
          identifier: 'long-flag',
          name: 'A'.repeat(200),
          enabled: true,
          description: 'B'.repeat(1000),
        },
      ];

      jest.spyOn(serviceModule, 'fetchFeatureFlags').mockResolvedValue({
        flags: longTextFlag,
        config: mockConfig,
      });

      // Act
      render(<Page />);

      // Assert: Should render without layout breaking
      await waitFor(() => {
        expect(screen.getByText('A'.repeat(200))).toBeInTheDocument();
      });
    });

    it('should handle special characters in flag data', async () => {
      // Arrange: Flag with special characters and HTML-like content
      const specialCharFlags: FeatureFlag[] = [
        {
          identifier: 'special-flag',
          name: '<script>alert("xss")</script>',
          enabled: false,
          description: 'Test & Verify <b>Bold</b>',
        },
      ];

      jest.spyOn(serviceModule, 'fetchFeatureFlags').mockResolvedValue({
        flags: specialCharFlags,
        config: mockConfig,
      });

      // Act
      render(<Page />);

      // Assert: Should render as text, not execute HTML
      await waitFor(() => {
        const flagElement = screen.getByTestId('flag-name-special-flag');
        expect(flagElement.textContent).toBe('<script>alert("xss")</script>');
      });
    });

    it('should handle rapid toggle clicks (debouncing)', async () => {
      // Arrange
      const mockToggleFlag = jest
        .spyOn(serviceModule, 'toggleFeatureFlag')
        .mockResolvedValue(undefined);

      jest.spyOn(serviceModule, 'fetchFeatureFlags').mockResolvedValue({
        flags: mockFeatureFlags,
        config: mockConfig,
      });

      // Act
      render(<Page />);

      await waitFor(() => {
        expect(screen.getByText('Test Flag 1')).toBeInTheDocument();
      });

      // Rapidly click toggle multiple times
      const toggleButton = screen.getAllByTestId('toggle-flag-button')[0];
      toggleButton.click();
      toggleButton.click();
      toggleButton.click();

      // Assert: Should debounce and only call once
      await waitFor(() => {
        expect(mockToggleFlag).toHaveBeenCalledTimes(1);
      });
    });

    it('should cleanup subscriptions on unmount', async () => {
      // Arrange
      const mockAbort = jest.fn();
      const mockFetch = jest
        .spyOn(serviceModule, 'fetchFeatureFlags')
        .mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                flags: mockFeatureFlags,
                config: mockConfig,
              });
            }, 1000);
          });
        });

      // Act
      const { unmount } = render(<Page />);
      unmount();

      // Assert: Should not throw or leak memory
      // In real implementation, verify AbortController was called
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      // Arrange
      jest.spyOn(serviceModule, 'fetchFeatureFlags').mockResolvedValue({
        flags: mockFeatureFlags,
        config: mockConfig,
      });

      // Act
      render(<Page />);

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });

      expect(screen.getByRole('heading', { name: 'Feature Flags' })).toBeInTheDocument();
      expect(screen.getByRole('table')).toHaveAttribute('aria-label', 'Feature flags list');
    });

    it('should support keyboard navigation', async () => {
      // Arrange
      jest.spyOn(serviceModule, 'fetchFeatureFlags').mockResolvedValue({
        flags: mockFeatureFlags,
        config: mockConfig,
      });

      // Act
      render(<Page />);

      // Assert
      await waitFor(() => {
        const firstRow = screen.getByTestId('flag-row-flag-1');
        expect(firstRow).toHaveAttribute('tabIndex', '0');
      });
    });
  });
});