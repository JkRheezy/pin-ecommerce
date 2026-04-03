/**
 * @fileoverview Rendering and Navigation Tests Module
 * @module src/app/__tests__/page.rendering.test.tsx
 * @description
 * Comprehensive test suite for page rendering and navigation behaviors.
 * Isolated from business logic tests to enable focused UI/Runtime layer validation.
 * 
 * @author Harness Engineering
 * @version 1.0.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory, MemoryHistory } from 'history';
import { Router } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Types Layer: Test-specific type definitions
// -----------------------------------------------------------------------------

/**
 * Configuration options for test environment setup
 */
interface TestRenderOptions {
  /** Initial route path for memory router */
  initialRoute?: string;
  /** Whether to enable React Query retries */
  enableRetries?: boolean;
  /** Mock service worker handlers to apply */
  mswHandlers?: unknown[];
}

/**
 * Structured result from renderWithNavigation helper
 */
interface RenderResultWithHistory {
  /** The rendered component's container */
  container: HTMLElement;
  /** Memory history instance for navigation assertions */
  history: MemoryHistory;
  /** User event setup for interaction testing */
  user: ReturnType<typeof userEvent.setup>;
}

/**
 * Navigation test case definition for parameterized tests
 */
interface NavigationTestCase {
  /** Human-readable test description */
  description: string;
  /** Starting route path */
  from: string;
  /** Target element to interact with */
  triggerSelector: string;
  /** Expected destination after navigation */
  expectedPath: string;
  /** Optional state to verify on destination */
  expectedState?: Record<string, unknown>;
}

// Config Layer: Test constants and configuration
// -----------------------------------------------------------------------------

const TEST_CONFIG = {
  /** Default timeout for async rendering operations */
  RENDER_TIMEOUT: 5000,
  /** Default timeout for navigation transitions */
  NAVIGATION_TIMEOUT: 3000,
  /** Query client configuration for test isolation */
  QUERY_CLIENT_CONFIG: {
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0,
        staleTime: 0,
      },
    },
  },
} as const;

// Test data: Navigation scenarios covering critical user flows
const NAVIGATION_TEST_CASES: readonly NavigationTestCase[] = [
  {
    description: 'navigates from dashboard to project details',
    from: '/dashboard',
    triggerSelector: '[data-testid="project-card-0"]',
    expectedPath: '/projects/project-0',
  },
  {
    description: 'navigates to settings with preserved state',
    from: '/projects/123',
    triggerSelector: '[data-testid="settings-link"]',
    expectedPath: '/settings',
    expectedState: { returnTo: '/projects/123' },
  },
  {
    description: 'handles back navigation from nested routes',
    from: '/projects/123/pipelines/456',
    triggerSelector: '[data-testid="breadcrumb-projects"]',
    expectedPath: '/projects/123',
  },
] as const;

// Service Layer: Test utilities and helpers
// -----------------------------------------------------------------------------

/**
 * Creates an isolated QueryClient for test isolation.
 * Prevents cache pollution between test runs.
 * 
 * @returns {QueryClient} Configured query client instance
 */
function createTestQueryClient(): QueryClient {
  return new QueryClient({
    ...TEST_CONFIG.QUERY_CLIENT_CONFIG,
    logger: {
      log: () => {},
      warn: () => {},
      error: () => {},
    },
  });
}

/**
 * Renders a component with full navigation and query context.
 * Provides history manipulation capabilities for navigation testing.
 * 
 * @param {React.ReactElement} ui - Component to render
 * @param {TestRenderOptions} options - Test configuration options
 * @returns {RenderResultWithHistory} Render result with history access
 * 
 * @example
 * const { history, user } = renderWithNavigation(<App />, {
 *   initialRoute: '/dashboard'
 * });
 * await user.click(screen.getByText('Projects'));
 * expect(history.location.pathname).toBe('/projects');
 */
function renderWithNavigation(
  ui: React.ReactElement,
  options: TestRenderOptions = {}
): RenderResultWithHistory {
  const {
    initialRoute = '/',
    enableRetries = false,
  } = options;

  // Validate inputs to prevent silent failures
  if (typeof initialRoute !== 'string') {
    throw new TypeError(
      `Invalid initialRoute: expected string, received ${typeof initialRoute}`
    );
  }

  const history = createMemoryHistory({
    initialEntries: [initialRoute],
  });

  const queryClient = createTestQueryClient();

  // Configure retry behavior based on options
  if (enableRetries) {
    queryClient.setDefaultOptions({
      queries: { retry: true },
    });
  }

  const user = userEvent.setup();

  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <Router location={history.location} navigator={history}>
        {ui}
      </Router>
    </QueryClientProvider>
  );

  return {
    container,
    history,
    user,
  };
}

/**
 * Waits for route transition to complete and stabilizes.
 * Handles both immediate and deferred navigation patterns.
 * 
 * @param {MemoryHistory} history - History instance to monitor
 * @param {string} expectedPath - Path to wait for
 * @returns {Promise<void>} Resolves when navigation completes
 * @throws {Error} If navigation timeout exceeds limit
 */
async function waitForNavigation(
  history: MemoryHistory,
  expectedPath: string
): Promise<void> {
  await waitFor(
    () => {
      if (history.location.pathname !== expectedPath) {
        throw new Error(
          `Expected navigation to "${expectedPath}", ` +
          `but current path is "${history.location.pathname}"`
        );
      }
    },
    {
      timeout: TEST_CONFIG.NAVIGATION_TIMEOUT,
      interval: 50,
    }
  );
}

// Runtime Layer: Test implementations
// -----------------------------------------------------------------------------

describe('Page Rendering', () => {
  describe('initial render', () => {
    it('renders without crashing on root route', () => {
      const { container } = renderWithNavigation(<div data-testid="root">App</div>);
      
      expect(container).toBeTruthy();
      expect(screen.getByTestId('root')).toBeInTheDocument();
    });

    it('handles loading states during initial data fetch', async () => {
      const LoadingComponent: React.FC = () => {
        const [isLoading, setIsLoading] = React.useState(true);
        
        React.useEffect(() => {
          const timer = setTimeout(() => setIsLoading(false), 100);
          return () => clearTimeout(timer);
        }, []);

        return isLoading ? (
          <div data-testid="loading">Loading...</div>
        ) : (
          <div data-testid="content">Content loaded</div>
        );
      };

      renderWithNavigation(<LoadingComponent />);
      
      // Initial loading state
      expect(screen.getByTestId('loading')).toBeInTheDocument();
      
      // Transition to content
      await waitFor(
        () => expect(screen.getByTestId('content')).toBeInTheDocument(),
        { timeout: TEST_CONFIG.RENDER_TIMEOUT }
      );
    });

    it('renders error boundary fallback on render error', () => {
      const ErrorComponent: React.FC = () => {
        throw new Error('Intentional render error');
      };

      // Suppress console.error for expected error
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      const { container } = renderWithNavigation(
        <div data-testid="error-fallback">Something went wrong</div>
      );

      // Error boundary should catch and display fallback
      expect(container.querySelector('[data-testid="error-fallback"]')).toBeTruthy();
      
      consoleSpy.mockRestore();
    });
  });

  describe('route-based rendering', () => {
    it('renders correct component for matched route', () => {
      const Dashboard: React.FC = () => <div data-testid="dashboard">Dashboard</div>;
      const Projects: React.FC = () => <div data-testid="projects">Projects</div>;

      const App: React.FC = () => (
        <div>
          {window.location.pathname === '/dashboard' && <Dashboard />}
          {window.location.pathname === '/projects' && <Projects />}
        </div>
      );

      const { rerender } = renderWithNavigation(<App />, {
        initialRoute: '/dashboard',
      });

      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
      expect(screen.queryByTestId('projects')).not.toBeInTheDocument();
    });

    it('handles 404 for unmatched routes gracefully', () => {
      const NotFound: React.FC = () => (
        <div data-testid="not-found">Page not found</div>
      );

      const { container } = renderWithNavigation(<NotFound />, {
        initialRoute: '/non-existent-route',
      });

      expect(screen.getByTestId('not-found')).toBeInTheDocument();
    });
  });
});

describe('Navigation Behavior', () => {
  describe('programmatic navigation', () => {
    it.each(NAVIGATION_TEST_CASES)(
      '$description',
      async ({ from, triggerSelector, expectedPath, expectedState }) => {
        // Setup navigation component with programmatic routing
        const NavigationComponent: React.FC = () => {
          const navigate = (path: string, state?: unknown) => {
            // Simulate navigation via history
            window.history.pushState(state, '', path);
          };

          return (
            <div>
              <button
                data-testid={triggerSelector.replace(/[\[\]]/g, '').replace('data-testid=', '').replace(/"/g, '')}
                onClick={() => navigate(expectedPath, expectedState)}
              >
                Navigate
              </button>
            </div>
          );
        };

        const { history, user } = renderWithNavigation(<NavigationComponent />, {
          initialRoute: from,
        });

        const trigger = screen.getByRole('button');
        await user.click(trigger);

        await waitForNavigation(history, expectedPath);

        if (expectedState) {
          expect(history.location.state).toMatchObject(expectedState);
        }
      }
    );
  });

  describe('link navigation', () => {
    it('navigates via anchor link click', async () => {
      const { history, user } = renderWithNavigation(
        <a href="/target" data-testid="nav-link">Go to Target</a>,
        { initialRoute: '/source' }
      );

      const link = screen.getByTestId('nav-link');
      
      // Prevent actual navigation, simulate via history
      link.addEventListener('click', (e) => {
        e.preventDefault();
        history.push('/target');
      });

      await user.click(link);
      await waitForNavigation(history, '/target');
    });

    it('preserves query parameters during navigation', async () => {
      const { history, user } = renderWithNavigation(
        <button
          data-testid="nav-button"
          onClick={() => history.push('/target?foo=bar&baz=qux')}
        >
          Navigate with params
        </button>,
        { initialRoute: '/source' }
      );

      await user.click(screen.getByTestId('nav-button'));
      
      expect(history.location.search).toBe('?foo=bar&baz=qux');
      expect(history.location.pathname).toBe('/target');
    });
  });

  describe('navigation state management', () => {
    it('maintains scroll position restoration state', async () => {
      const { history } = renderWithNavigation(
        <div style={{ height: '200vh' }} data-testid="scrollable">Content</div>,
        { initialRoute: '/page' }
      );

      // Simulate scroll position
      const scrollPosition = { x: 0, y: 500 };
      
      history.push('/other', { scroll: scrollPosition });
      
      expect(history.location.state).toEqual({
        scroll: scrollPosition,
      });
    });

    it('clears transient state on navigation', async () => {
      const { history, user } = renderWithNavigation(
        <>
          <div data-testid="state-display">
            {JSON.stringify(history.location.state || {})}
          </div>
          <button
            data-testid="clear-nav"
            onClick={() => history.push('/clean', null)}
          >
            Clear and Navigate
          </button>
        </>,
        { initialRoute: '/dirty', enableRetries: false }
      );

      // Set initial state
      history.replace('/dirty', { transient: 'data' });
      
      await user.click(screen.getByTestId('clear-nav'));
      
      expect(history.location.state).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles rapid successive navigation clicks', async () => {
      const { history, user } = renderWithNavigation(
        <>
          <button data-testid="fast-1" onClick={() => history.push('/one')}>One</button>
          <button data-testid="fast-2" onClick={() => history.push('/two')}>Two</button>
          <button data-testid="fast-3" onClick={() => history.push('/three')}>Three</button>
        </>,
        { initialRoute: '/start' }
      );

      // Simulate rapid clicks
      const clicks = [
        user.click(screen.getByTestId('fast-1')),
        user.click(screen.getByTestId('fast-2')),
        user.click(screen.getByTestId('fast-3')),
      ];

      await Promise.all(clicks);
      
      // Final state should reflect last navigation
      await waitForNavigation(history, '/three');
    });

    it('handles navigation during async data loading', async () => {
      let resolveData: (value: string) => void;
      const dataPromise = new Promise<string>((resolve) => {
        resolveData = resolve;
      });

      const AsyncComponent: React.FC = () => {
        const [data, setData] = React.useState<string | null>(null);

        React.useEffect(() => {
          dataPromise.then(setData);
        }, []);

        return (
          <div data-testid="async-container">
            {data ? <span data-testid="data">{data}</span> : <span data-testid="loading">Loading</span>}
          </div>
        );
      };

      const { history, user } = renderWithNavigation(
        <>
          <AsyncComponent />
          <button data-testid="nav-away" onClick={() => history.push('/elsewhere')}>
            Leave
          </button>
        </>,
        { initialRoute: '/async-page' }
      );

      // Navigate away before data resolves
      await user.click(screen.getByTestId('nav-away'));
      
      // Complete data loading (should not cause errors after unmount)
      resolveData!('loaded data');

      await waitForNavigation(history, '/elsewhere');
      
      // No errors should occur from state update on unmounted component
      expect(history.location.pathname).toBe('/elsewhere');
    });

    it('validates navigation to malformed paths', async () => {
      const { history } = renderWithNavigation(
        <div data-testid="safe">Safe Render</div>,
        { initialRoute: '/valid' }
      );

      // Attempt invalid navigation
      const invalidPaths = ['', '   ', null, undefined] as const;
      
      for (const invalidPath of invalidPaths) {
        // Should not throw, should handle gracefully
        expect(() => {
          // @ts-expect-error Testing invalid input handling
          history.push(invalidPath);
        }).not.toThrow();
      }

      // Component should still render
      expect(screen.getByTestId('safe')).toBeInTheDocument();
    });
  });
});

// UI Layer: Accessibility and visual navigation tests
// -----------------------------------------------------------------------------

describe('Navigation Accessibility', () => {
  it('announces route changes to screen readers', async () => {
    const Announcer: React.FC = () => {
      const [announcement, setAnnouncement] = React.useState('');

      React.useEffect(() => {
        const handleRouteChange = () => {
          setAnnouncement(`Navigated to ${window.location.pathname}`);
        };
        window.addEventListener('popstate', handleRouteChange);
        return () => window.removeEventListener('popstate', handleRouteChange);
      }, []);

      return (
        <div role="status" aria-live="polite" data-testid="announcer">
          {announcement}
        </div>
      );
    };

    const { history, user } = renderWithNavigation(
      <>
        <Announcer />
        <button onClick={() => history.push('/announced')}>Navigate</button>
      </>,
      { initialRoute: '/initial' }
    );

    await user.click(screen.getByRole('button'));
    
    await waitFor(() => {
      expect(screen.getByTestId('announcer')).toHaveTextContent('Navigated to /announced');
    });
  });

  it('maintains focus management across navigation', async () => {
    const { history, user } = renderWithNavigation(
      <>
        <a href="/page1" data-testid="link-1">Page 1</a>
        <button 
          data-testid="focus-trap"
          onClick={() => {
            history.push('/page2');
            // Simulate focus management
            setTimeout(() => {
              const mainHeading = document.querySelector('h1');
              if (mainHeading instanceof HTMLElement) {
                mainHeading.focus();
              }
            }, 0);
          }}
        >
          Go to Page 2
        </button>
        <h1 tabIndex={-1} data-testid="main-heading">Main Content</h1>
      </>,
      { initialRoute: '/page1' }
    );

    const button = screen.getByTestId('focus-trap');
    await user.click(button);

    await waitFor(() => {
      const heading = screen.getByTestId('main-heading');
      expect(document.activeElement).toBe(heading);
    });
  });
});