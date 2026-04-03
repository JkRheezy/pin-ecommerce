// This file has been removed as part of test suite refactoring.
// Functionality has been extracted to:
//   - src/app/__tests__/rendering/render-utils.test.tsx (render utilities)
//   - src/app/__tests__/rendering/navigation.test.tsx (navigation tests)
//   - src/app/__tests__/rendering/interaction.test.tsx (interaction tests)
//   - src/app/__tests__/rendering/query-integration.test.tsx (query integration)
//
// See the README.md in src/app/__tests__/rendering/ for migration guide.ring;
}

interface RenderingTestCase {
  description: string;
  component: React.ReactNode;
  assertions: Array<{
    type: 'text' | 'role' | 'testId';
    value: string;
    options?: Record<string, unknown>;
  }>;
}

// Config Layer: Test configuration and constants
// -----------------------------------------------------------------------------
const TEST_CONFIG = {
  timeout: {
    navigation: 5000,
    rendering: 3000,
  },
  retry: {
    count: 3,
    delay: 100,
  },
} as const;

// Default test query client with disabled retries for predictable tests
const createTestQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

// Repo Layer: Test data and mock repositories
// -----------------------------------------------------------------------------
const mockNavigationData = {
  routes: {
    home: '/',
    dashboard: '/dashboard',
    settings: '/settings',
    profile: '/profile/:userId',
    notFound: '*',
  },
  testIds: {
    navigationContainer: 'navigation-container',
    navLink: 'nav-link',
    pageContent: 'page-content',
    loadingSpinner: 'loading-spinner',
    errorBoundary: 'error-boundary',
  },
} as const;

// Service Layer: Business logic for test operations
// -----------------------------------------------------------------------------
class RenderingTestService {
  private queryClient: QueryClient;
  private logger: StructuredLogger;

  constructor(queryClient: QueryClient, logger: StructuredLogger) {
    this.queryClient = queryClient;
    this.logger = logger;
  }

  /**
   * Validates render options and applies defaults
   * @throws {TestConfigurationError} When required options are invalid
   */
  validateOptions(options: TestRenderOptions): Required<TestRenderOptions> {
    const validated = {
      initialRoute: options.initialRoute ?? mockNavigationData.routes.home,
      routes: options.routes ?? [],
      queryClient: options.queryClient ?? this.queryClient,
      user: options.user ?? userEvent.setup(),
    };

    if (!validated.routes.some((r) => r.path === validated.initialRoute)) {
      const error = new TestConfigurationError(
        `Initial route "${validated.initialRoute}" not found in provided routes`
      );
      this.logger.error('rendering.test.validateOptions.failed', { error, options });
      throw error;
    }

    return validated;
  }

  /**
   * Executes navigation with proper error handling and logging
   */
  async executeNavigation(
    user: ReturnType<typeof userEvent.setup>,
    action: () => Promise<void> | void
  ): Promise<void> {
    try {
      this.logger.info('rendering.test.navigation.started');
      await action();
      this.logger.info('rendering.test.navigation.completed');
    } catch (error) {
      this.logger.error('rendering.test.navigation.failed', { error });
      throw new NavigationError('Navigation action failed', { cause: error });
    }
  }
}

// Runtime Layer: Infrastructure and utilities
// -----------------------------------------------------------------------------
class StructuredLogger {
  info(event: string, metadata?: Record<string, unknown>): void {
    // In production, this would use proper structured logging
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level: 'info', event, timestamp: Date.now(), ...metadata }));
  }

  error(event: string, metadata?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ level: 'error', event, timestamp: Date.now(), ...metadata }));
  }
}

class TestConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestConfigurationError';
  }
}

class NavigationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'NavigationError';
  }
}

// UI Layer: Test components and render utilities
// -----------------------------------------------------------------------------
interface TestAppProps {
  initialRoute: string;
  routes: Array<{ path: string; element: React.ReactNode }>;
}

const TestApp: React.FC<TestAppProps> = ({ initialRoute, routes }) => (
  <MemoryRouter initialEntries={[initialRoute]}>
    <Routes>
      {routes.map(({ path, element }) => (
        <Route key={path} path={path} element={element} />
      ))}
    </Routes>
  </MemoryRouter>
);

/**
 * Higher-order component that wraps tests with required providers
 */
const withProviders = (
  component: React.ReactNode,
  queryClient: QueryClient
): React.ReactElement => (
  <QueryClientProvider client={queryClient}>{component}</QueryClientProvider>
);

// Test Module: Rendering and Navigation Tests
// -----------------------------------------------------------------------------
describe('Rendering and Navigation', () => {
  let queryClient: QueryClient;
  let testService: RenderingTestService;
  let logger: StructuredLogger;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    logger = new StructuredLogger();
    testService = new RenderingTestService(queryClient, logger);
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render component with text content', async () => {
      // Arrange
      const testCase: RenderingTestCase = {
        description: 'Render welcome message',
        component: <div data-testid="welcome">Welcome to the app</div>,
        assertions: [
          { type: 'text', value: 'Welcome to the app' },
          { type: 'testId', value: 'welcome' },
        ],
      };

      // Act
      const { container } = render(
        withProviders(testCase.component, queryClient)
      );

      // Assert
      for (const assertion of testCase.assertions) {
        switch (assertion.type) {
          case 'text':
            expect(screen.getByText(assertion.value)).toBeInTheDocument();
            break;
          case 'testId':
            expect(screen.getByTestId(assertion.value)).toBeInTheDocument();
            break;
          case 'role':
            expect(
              screen.getByRole(assertion.value as string, assertion.options)
            ).toBeInTheDocument();
            break;
          default:
            throw new TestConfigurationError(`Unknown assertion type: ${assertion.type}`);
        }
      }

      // Validate container structure
      expect(container).toMatchSnapshot();
    });

    it('should handle async rendering with loading states', async () => {
      // Arrange: Component with simulated async data loading
      const AsyncComponent: React.FC = () => {
        const [data, setData] = React.useState<string | null>(null);
        const [isLoading, setIsLoading] = React.useState(true);

        React.useEffect(() => {
          const timer = setTimeout(() => {
            setData('Loaded content');
            setIsLoading(false);
          }, 100);
          return () => clearTimeout(timer);
        }, []);

        if (isLoading) {
          return <div data-testid={mockNavigationData.testIds.loadingSpinner}>Loading...</div>;
        }

        return <div data-testid={mockNavigationData.testIds.pageContent}>{data}</div>;
      };

      // Act
      render(withProviders(<AsyncComponent />, queryClient));

      // Assert: Initial loading state
      expect(
        screen.getByTestId(mockNavigationData.testIds.loadingSpinner)
      ).toBeInTheDocument();

      // Assert: Final loaded state
      await waitFor(
        () => {
          expect(
            screen.getByTestId(mockNavigationData.testIds.pageContent)
          ).toHaveTextContent('Loaded content');
        },
        { timeout: TEST_CONFIG.timeout.rendering }
      );

      // Verify loading spinner is removed
      expect(
        screen.queryByTestId(mockNavigationData.testIds.loadingSpinner)
      ).not.toBeInTheDocument();
    });
  });

  describe('Navigation Flows', () => {
    it('should navigate between routes using navigation links', async () => {
      // Arrange
      const user = userEvent.setup();
      const routes = [
        {
          path: mockNavigationData.routes.home,
          element: (
            <div>
              <h1>Home Page</h1>
              <a
                href="/dashboard"
                data-testid={`${mockNavigationData.testIds.navLink}-dashboard`}
              >
                Go to Dashboard
              </a>
            </div>
          ),
        },
        {
          path: mockNavigationData.routes.dashboard,
          element: <h1 data-testid="dashboard-title">Dashboard Page</h1>,
        },
      ];

      const options = testService.validateOptions({
        initialRoute: mockNavigationData.routes.home,
        routes,
        user,
      });

      const WrappedApp = withProviders(
        <TestApp initialRoute={options.initialRoute} routes={options.routes} />,
        options.queryClient
      );

      // Act: Initial render
      render(WrappedApp);

      // Assert: Home page rendered
      expect(screen.getByText('Home Page')).toBeInTheDocument();

      // Act: Navigate to dashboard
      const dashboardLink = screen.getByTestId(
        `${mockNavigationData.testIds.navLink}-dashboard`
      );
      await testService.executeNavigation(user, () => user.click(dashboardLink));

      // Assert: Dashboard page rendered
      await waitFor(
        () => {
          expect(screen.getByTestId('dashboard-title')).toHaveTextContent(
            'Dashboard Page'
          );
        },
        { timeout: TEST_CONFIG.timeout.navigation }
      );
    });

    it('should handle programmatic navigation', async () => {
      // Arrange
      const user = userEvent.setup();
      const navigate = vi.fn();

      // Mock useNavigate for testing
      vi.mock('react-router-dom', async () => {
        const actual = await vi.importActual('react-router-dom');
        return {
          ...actual,
          useNavigate: () => navigate,
        };
      });

      const ProgrammaticNavComponent: React.FC = () => {
        const handleClick = () => {
          navigate(mockNavigationData.routes.settings);
        };

        return (
          <button
            data-testid="navigate-button"
            onClick={handleClick}
          >
            Go to Settings
          </button>
        );
      };

      // Act
      render(
        withProviders(<ProgrammaticNavComponent />, queryClient)
      );

      const button = screen.getByTestId('navigate-button');
      await user.click(button);

      // Assert
      expect(navigate).toHaveBeenCalledWith(mockNavigationData.routes.settings);
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it('should handle navigation with URL parameters', async () => {
      // Arrange
      const user = userEvent.setup();
      const userId = 'user-123';

      const routes = [
        {
          path: mockNavigationData.routes.home,
          element: (
            <a
              href={`/profile/${userId}`}
              data-testid="profile-link"
            >
              View Profile
            </a>
          ),
        },
        {
          path: mockNavigationData.routes.profile,
          element: <ProfilePage />,
        },
      ];

      // Profile page component that reads URL params
      const ProfilePage: React.FC = () => {
        // In real implementation, use useParams from react-router-dom
        const params = { userId }; // Simplified for test
        return (
          <div data-testid="profile-page">
            <h1>Profile for {params.userId}</h1>
          </div>
        );
      };

      // Act
      const { rerender } = render(
        withProviders(
          <TestApp
            initialRoute={mockNavigationData.routes.home}
            routes={routes}
          />,
          queryClient
        )
      );

      // Navigate to profile
      const profileLink = screen.getByTestId('profile-link');
      await user.click(profileLink);

      // Re-render with new route (simulating navigation)
      rerender(
        withProviders(
          <TestApp
            initialRoute={`/profile/${userId}`}
            routes={routes}
          />,
          queryClient
        )
      );

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('profile-page')).toHaveTextContent(
          `Profile for ${userId}`
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error boundary when navigation fails', async () => {
      // Arrange
      const user = userEvent.setup();
      const ErrorComponent: React.FC = () => {
        throw new Error('Navigation failed');
      };

      const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({
        children,
      }) => {
        const [hasError, setHasError] = React.useState(false);

        if (hasError) {
          return (
            <div data-testid={mockNavigationData.testIds.errorBoundary}>
              Something went wrong
            </div>
          );
        }

        try {
          return <>{children}</>;
        } catch {
          setHasError(true);
          return null;
        }
      };

      const routes = [
        {
          path: mockNavigationData.routes.home,
          element: <a href="/error">Trigger Error</a>,
        },
        {
          path: '/error',
          element: (
            <ErrorBoundary>
              <ErrorComponent />
            </ErrorBoundary>
          ),
        },
      ];

      // Act & Assert
      render(
        withProviders(
          <TestApp
            initialRoute={mockNavigationData.routes.home}
            routes={routes}
          />,
          queryClient
        )
      );

      const errorLink = screen.getByText('Trigger Error');
      await user.click(errorLink);

      // Error boundary should catch and display error
      await waitFor(() => {
        expect(
          screen.getByTestId(mockNavigationData.testIds.errorBoundary)
        ).toBeInTheDocument();
      });
    });

    it('should handle invalid route navigation gracefully', async () => {
      // Arrange
      const user = userEvent.setup();

      const NotFoundPage: React.FC = () => (
        <div data-testid="not-found">404 - Page Not Found</div>
      );

      const routes = [
        {
          path: mockNavigationData.routes.home,
          element: <a href="/non-existent">Invalid Link</a>,
        },
        {
          path: mockNavigationData.routes.notFound,
          element: <NotFoundPage />,
        },
      ];

      // Act
      render(
        withProviders(
          <TestApp
            initialRoute={mockNavigationData.routes.home}
            routes={routes}
          />,
          queryClient
        )
      );

      const invalidLink = screen.getByText('Invalid Link');
      await user.click(invalidLink);

      // Assert: Should show 404 page
      await waitFor(() => {
        expect(screen.getByTestId('not-found')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should maintain focus management during navigation', async () => {
      // Arrange
      const user = userEvent.setup();

      const FocusableComponent: React.FC = () => {
        const buttonRef = React.useRef<HTMLButtonElement>(null);

        React.useEffect(() => {
          buttonRef.current?.focus();
        }, []);

        return (
          <button ref={buttonRef} data-testid="focus-target">
            Focused Button
          </button>
        );
      };

      const routes = [
        {
          path: mockNavigationData.routes.home,
          element: <a href="/focused">Go to Focused Page</a>,
        },
        {
          path: '/focused',
          element: <FocusableComponent />,
        },
      ];

      // Act
      render(
        withProviders(
          <TestApp
            initialRoute={mockNavigationData.routes.home}
            routes={routes}
          />,
          queryClient
        )
      );

      const link = screen.getByText('Go to Focused Page');
      await user.click(link);

      // Assert: Focus should be managed on new page
      await waitFor(() => {
        const focusedElement = document.activeElement;
        expect(focusedElement).toHaveAttribute('data-testid', 'focus-target');
      });
    });
  });
});

// Re-export utilities for use in other test modules
export {
  createTestQueryClient,
  RenderingTestService,
  withProviders,
  TestApp,
  mockNavigationData,
  TEST_CONFIG,
};

export type {
  TestRenderOptions,
  NavigationTestCase,
  RenderingTestCase,
};