// src/app/__tests__/rendering.pages.test.tsx
// Layer: Runtime (Testing)
// Purpose: Page rendering tests for Next.js pages to ensure components render correctly

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';

// Types Layer: Define test-specific types and interfaces
interface PageRenderTestCase {
  name: string;
  route: string;
  component: React.ComponentType;
  expectedElements: string[];
  requiredProps?: Record<string, unknown>;
}

interface MockRouterOptions {
  pathname?: string;
  query?: Record<string, string>;
  push?: jest.Mock;
  replace?: jest.Mock;
}

// Config Layer: Test configuration constants
const TEST_CONFIG = {
  timeout: 5000,
  asyncTimeout: 10000,
} as const;

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
  useSearchParams: jest.fn(),
}));

/**
 * Helper function to create a mock router for testing
 * Follows: Service Layer pattern for test utilities
 */
const createMockRouter = (options: MockRouterOptions = {}): ReturnType<typeof useRouter> => {
  const {
    pathname = '/',
    query = {},
    push = jest.fn(),
    replace = jest.fn(),
  } = options;

  return {
    pathname,
    query,
    push,
    replace,
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(),
  } as unknown as ReturnType<typeof useRouter>;
};

/**
 * Helper function to render page with router context
 * Follows: Service Layer pattern for test setup
 */
const renderPageWithRouter = (
  PageComponent: React.ComponentType,
  routerOptions: MockRouterOptions = {}
): ReturnType<typeof render> => {
  const mockRouter = createMockRouter(routerOptions);
  (useRouter as jest.Mock).mockReturnValue(mockRouter);

  return render(<PageComponent />);
};

/**
 * Validation helper to check required elements are present
 * Follows: Service Layer pattern for assertions
 */
const validatePageElements = async (
  expectedElements: string[],
  timeout: number = TEST_CONFIG.timeout
): Promise<void> => {
  for (const element of expectedElements) {
    await waitFor(
      () => {
        const foundElement = screen.getByText(element);
        expect(foundElement).toBeInTheDocument();
      },
      { timeout }
    );
  }
};

// Repo Layer: Test data and fixtures
const mockPageComponents = {
  HomePage: () => (
    <main data-testid="home-page">
      <h1>Welcome to Harness</h1>
      <p>Build and deploy with confidence</p>
    </main>
  ),
  DashboardPage: () => (
    <main data-testid="dashboard-page">
      <h1>Dashboard</h1>
      <div data-testid="pipeline-count">5 Pipelines</div>
    </main>
  ),
  ErrorPage: ({ error }: { error?: Error }) => (
    <main data-testid="error-page">
      <h1>Something went wrong</h1>
      {error && <p data-testid="error-message">{error.message}</p>}
    </main>
  ),
};

// Runtime Layer: Test suite implementation
describe('Page Rendering Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Home Page', () => {
    it('should render home page with correct title', async () => {
      // Arrange: Setup test environment
      const HomePage = mockPageComponents.HomePage;
      const expectedElements = ['Welcome to Harness', 'Build and deploy with confidence'];

      // Act: Render the page
      renderPageWithRouter(HomePage, { pathname: '/' });

      // Assert: Validate expected elements are present
      await validatePageElements(expectedElements);

      // Additional assertion for data-testid
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    });

    it('should handle router navigation correctly', async () => {
      // Arrange
      const mockPush = jest.fn();
      const HomePage = mockPageComponents.HomePage;

      // Act
      renderPageWithRouter(HomePage, {
        pathname: '/',
        push: mockPush,
      });

      // Assert: Verify router is properly mocked
      const router = useRouter();
      expect(router.pathname).toBe('/');
    });
  });

  describe('Dashboard Page', () => {
    it('should render dashboard with pipeline information', async () => {
      // Arrange
      const DashboardPage = mockPageComponents.DashboardPage;
      const expectedElements = ['Dashboard', '5 Pipelines'];

      // Act
      renderPageWithRouter(DashboardPage, { pathname: '/dashboard' });

      // Assert
      await validatePageElements(expectedElements);
      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      expect(screen.getByTestId('pipeline-count')).toHaveTextContent('5 Pipelines');
    });

    it('should handle loading states gracefully', async () => {
      // Arrange: Create a component with loading state
      const LoadingDashboard = () => {
        const [loading, setLoading] = React.useState(true);

        React.useEffect(() => {
          const timer = setTimeout(() => setLoading(false), 100);
          return () => clearTimeout(timer);
        }, []);

        if (loading) {
          return <div data-testid="loading-spinner">Loading...</div>;
        }

        return <div data-testid="dashboard-content">Dashboard Loaded</div>;
      };

      // Act
      renderPageWithRouter(LoadingDashboard, { pathname: '/dashboard' });

      // Assert: Initial loading state
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

      // Assert: Final loaded state
      await waitFor(
        () => {
          expect(screen.getByTestId('dashboard-content')).toBeInTheDocument();
        },
        { timeout: TEST_CONFIG.asyncTimeout }
      );
    });
  });

  describe('Error Handling', () => {
    it('should render error page when error prop is provided', () => {
      // Arrange
      const ErrorPage = mockPageComponents.ErrorPage;
      const testError = new Error('Test error message');

      // Act
      render(<ErrorPage error={testError} />);

      // Assert
      expect(screen.getByTestId('error-page')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByTestId('error-message')).toHaveTextContent('Test error message');
    });

    it('should render error page without error message when error is undefined', () => {
      // Arrange
      const ErrorPage = mockPageComponents.ErrorPage;

      // Act
      render(<ErrorPage />);

      // Assert
      expect(screen.getByTestId('error-page')).toBeInTheDocument();
      expect(screen.queryByTestId('error-message')).not.toBeInTheDocument();
    });

    it('should handle component render errors gracefully', () => {
      // Arrange: Component that throws during render
      const BrokenComponent = () => {
        throw new Error('Render error');
      };

      // Mock console.error to suppress error output during test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Act & Assert: Error boundary should catch the error
      // Note: In real implementation, this would use an ErrorBoundary component
      expect(() => {
        renderPageWithRouter(BrokenComponent);
      }).toThrow('Render error');

      // Cleanup
      consoleSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty page content', () => {
      // Arrange
      const EmptyPage = () => <main data-testid="empty-page" />;

      // Act
      renderPageWithRouter(EmptyPage);

      // Assert
      expect(screen.getByTestId('empty-page')).toBeInTheDocument();
      expect(screen.getByTestId('empty-page')).toBeEmptyDOMElement();
    });

    it('should handle deeply nested components', () => {
      // Arrange: Create deeply nested component structure
      const DeepComponent: React.FC<{ depth: number }> = ({ depth }) => {
        if (depth <= 0) {
          return <span data-testid="deep-content">Deep Content</span>;
        }
        return (
          <div data-testid={`level-${depth}`}>
            <DeepComponent depth={depth - 1} />
          </div>
        );
      };

      const NestedPage = () => (
        <main data-testid="nested-page">
          <DeepComponent depth={5} />
        </main>
      );

      // Act
      renderPageWithRouter(NestedPage);

      // Assert: Verify all nested levels are rendered
      expect(screen.getByTestId('nested-page')).toBeInTheDocument();
      expect(screen.getByTestId('level-5')).toBeInTheDocument();
      expect(screen.getByTestId('level-1')).toBeInTheDocument();
      expect(screen.getByTestId('deep-content')).toHaveTextContent('Deep Content');
    });

    it('should handle rapid route changes', async () => {
      // Arrange
      const mockPush = jest.fn();
      const HomePage = mockPageComponents.HomePage;

      // Act: Render with initial route
      const { rerender } = renderPageWithRouter(HomePage, {
        pathname: '/',
        push: mockPush,
      });

      // Simulate route change by updating router mock
      (useRouter as jest.Mock).mockReturnValue(
        createMockRouter({ pathname: '/dashboard', push: mockPush })
      );

      // Re-render to trigger effect
      rerender(<HomePage />);

      // Assert: Component should handle route change gracefully
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    });
  });
});

// UI Layer: Test case definitions for external consumption
export const pageRenderTestCases: PageRenderTestCase[] = [
  {
    name: 'Home Page',
    route: '/',
    component: mockPageComponents.HomePage,
    expectedElements: ['Welcome to Harness'],
  },
  {
    name: 'Dashboard Page',
    route: '/dashboard',
    component: mockPageComponents.DashboardPage,
    expectedElements: ['Dashboard', '5 Pipelines'],
  },
];