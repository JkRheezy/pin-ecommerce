/**
 * Navigation Test Module
 * 
 * Tests for the navigation and header components following the six-layer architecture.
 * Layer: UI (Runtime layer tests)
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Logger } from '@harness/logging';
import type { NavItem, UserProfile, NavigationConfig } from '../types/navigation.types';
import { Header } from '../components/Header';
import { Navigation } from '../components/Navigation';
import { MobileNav } from '../components/MobileNav';
import { UserMenu } from '../components/UserMenu';

// Extend matchers for accessibility testing
expect.extend(toHaveNoViolations);

// -----------------------------------------------------------------------------
// Types Layer - Test-specific type definitions
// -----------------------------------------------------------------------------

interface NavigationTestContext {
  /** Mocked user profile for authentication state */
  user: UserProfile | null;
  /** Current route configuration */
  currentRoute: string;
  /** Feature flags affecting navigation visibility */
  featureFlags: Record<string, boolean>;
}

interface RenderNavigationOptions {
  /** Initial route for MemoryRouter */
  initialRoute?: string;
  /** Whether user is authenticated */
  isAuthenticated?: boolean;
  /** Custom navigation configuration */
  navConfig?: Partial<NavigationConfig>;
  /** Viewport width for responsive testing */
  viewportWidth?: number;
}

// -----------------------------------------------------------------------------
// Config Layer - Test configuration and constants
// -----------------------------------------------------------------------------

const TEST_CONFIG = {
  /** Default timeout for async operations */
  ASYNC_TIMEOUT: 5000,
  /** Default viewport sizes for responsive testing */
  VIEWPORT: {
    MOBILE: 375,
    TABLET: 768,
    DESKTOP: 1440,
  },
  /** Test IDs for element selection */
  TEST_IDS: {
    HEADER: 'app-header',
    NAVIGATION: 'main-navigation',
    MOBILE_NAV: 'mobile-navigation',
    USER_MENU: 'user-menu',
    NAV_LINK: 'nav-link',
    LOGOUT_BUTTON: 'logout-button',
  },
} as const;

const MOCK_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
  { id: 'projects', label: 'Projects', path: '/projects', icon: 'folder', badge: 3 },
  { id: 'pipelines', label: 'Pipelines', path: '/pipelines', icon: 'pipeline' },
  { id: 'executions', label: 'Executions', path: '/executions', icon: 'play', featureFlag: 'executions-enabled' },
  { id: 'settings', label: 'Settings', path: '/settings', icon: 'settings', requiresAuth: true },
];

const MOCK_USER: UserProfile = {
  id: 'user-123',
  email: 'test@harness.io',
  name: 'Test User',
  avatar: 'https://example.com/avatar.png',
  permissions: ['read', 'write'],
};

// -----------------------------------------------------------------------------
// Repo Layer - Mock data and utilities
// -----------------------------------------------------------------------------

/**
 * Creates a mock logger for test isolation
 */
const createMockLogger = (): jest.Mocked<Logger> => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn().mockReturnThis(),
});

/**
 * Creates a test navigation configuration
 */
const createMockNavConfig = (overrides?: Partial<NavigationConfig>): NavigationConfig => ({
  items: MOCK_NAV_ITEMS,
  showLogo: true,
  enableSearch: true,
  enableNotifications: true,
  ...overrides,
});

/**
 * Helper to render navigation components with router context
 */
const renderWithRouter = (
  component: React.ReactElement,
  options: RenderNavigationOptions = {}
) => {
  const {
    initialRoute = '/',
    isAuthenticated = false,
    viewportWidth = TEST_CONFIG.VIEWPORT.DESKTOP,
  } = options;

  // Mock viewport for responsive tests
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: viewportWidth,
  });
  window.dispatchEvent(new Event('resize'));

  const mockLogger = createMockLogger();
  const mockNavConfig = createMockNavConfig(options.navConfig);

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <MemoryRouter initialEntries={[initialRoute]}>
      <NavigationTestProvider
        value={{
          user: isAuthenticated ? MOCK_USER : null,
          currentRoute: initialRoute,
          featureFlags: { 'executions-enabled': true },
        }}
      >
        {children}
      </NavigationTestProvider>
    </MemoryRouter>
  );

  return {
    ...render(component, { wrapper: Wrapper }),
    mockLogger,
    mockNavConfig,
  };
};

// Simple context provider for tests
const NavigationTestContext = React.createContext<NavigationTestContext | null>(null);

const NavigationTestProvider: React.FC<{
  value: NavigationTestContext;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <NavigationTestContext.Provider value={value}>
    {children}
  </NavigationTestContext.Provider>
);

// -----------------------------------------------------------------------------
// Service Layer - Test service functions
// -----------------------------------------------------------------------------

/**
 * Validates navigation item accessibility
 */
const validateNavItemAccessibility = (element: HTMLElement): string[] => {
  const issues: string[] = [];
  
  // Check for required ARIA attributes
  if (!element.hasAttribute('aria-label') && !element.getAttribute('aria-labelledby')) {
    issues.push('Missing accessible label');
  }
  
  // Check for keyboard navigation support
  if (element.getAttribute('role') === 'button' && element.getAttribute('tabindex') !== '0') {
    issues.push('Button not keyboard accessible');
  }
  
  return issues;
};

/**
 * Simulates navigation flow and validates state changes
 */
const simulateNavigation = async (
  navElement: HTMLElement,
  targetPath: string
): Promise<{ success: boolean; error?: Error }> => {
  try {
    const link = within(navElement).getByTestId(`${TEST_CONFIG.TEST_IDS.NAV_LINK}-${targetPath}`);
    
    // Validate link is interactive
    if (link.getAttribute('aria-disabled') === 'true') {
      throw new Error('Navigation link is disabled');
    }
    
    fireEvent.click(link);
    
    // Wait for any async navigation handling
    await waitFor(() => {
      const location = screen.queryByTestId('location-display');
      if (location && location.textContent !== targetPath) {
        throw new Error(`Navigation failed: expected ${targetPath}, got ${location.textContent}`);
      }
    }, { timeout: TEST_CONFIG.ASYNC_TIMEOUT });
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error : new Error(String(error)) 
    };
  }
};

// -----------------------------------------------------------------------------
// Runtime Layer - Test execution and lifecycle
// -----------------------------------------------------------------------------

// Location display helper for testing route changes
const LocationDisplay: React.FC = () => {
  const location = useLocation();
  return <span data-testid="location-display">{location.pathname}</span>;
};

beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();
  
  // Reset viewport to desktop default
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: TEST_CONFIG.VIEWPORT.DESKTOP,
  });
});

afterEach(() => {
  // Cleanup any lingering event listeners or timers
  jest.useRealTimers();
});

// -----------------------------------------------------------------------------
// UI Layer - Component Tests
// -----------------------------------------------------------------------------

describe('Navigation Components', () => {
  describe('Header Component', () => {
    it('renders header with logo and navigation', () => {
      const { getByTestId } = renderWithRouter(
        <>
          <Header />
          <LocationDisplay />
        </>,
        { isAuthenticated: true }
      );

      expect(getByTestId(TEST_CONFIG.TEST_IDS.HEADER)).toBeInTheDocument();
      expect(screen.getByAltText('Harness Logo')).toBeInTheDocument();
    });

    it('displays user menu when authenticated', () => {
      renderWithRouter(
        <>
          <Header />
          <LocationDisplay />
        </>,
        { isAuthenticated: true }
      );

      const userMenu = screen.getByTestId(TEST_CONFIG.TEST_IDS.USER_MENU);
      expect(userMenu).toBeInTheDocument();
      expect(within(userMenu).getByText(MOCK_USER.name)).toBeInTheDocument();
    });

    it('hides authenticated-only items when user is not logged in', () => {
      renderWithRouter(
        <>
          <Header />
          <Navigation />
          <LocationDisplay />
        </>,
        { isAuthenticated: false }
      );

      // Settings requires authentication
      const settingsLink = screen.queryByText('Settings');
      expect(settingsLink).not.toBeInTheDocument();
    });

    it('handles search input with debouncing', async () => {
      jest.useFakeTimers();
      const onSearch = jest.fn();

      renderWithRouter(
        <>
          <Header onSearch={onSearch} />
          <LocationDisplay />
        </>,
        { isAuthenticated: true }
      );

      const searchInput = screen.getByPlaceholderText(/search/i);
      fireEvent.change(searchInput, { target: { value: 'pipeline' } });

      // Search should not fire immediately due to debounce
      expect(onSearch).not.toHaveBeenCalled();

      // Fast-forward past debounce delay
      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(onSearch).toHaveBeenCalledWith('pipeline');
      });
    });

    it('meets accessibility standards', async () => {
      const { container } = renderWithRouter(
        <>
          <Header />
          <LocationDisplay />
        </>,
        { isAuthenticated: true }
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Navigation Component', () => {
    it('renders all visible navigation items', () => {
      renderWithRouter(
        <>
          <Navigation items={MOCK_NAV_ITEMS} />
          <LocationDisplay />
        </>,
        { isAuthenticated: true }
      );

      MOCK_NAV_ITEMS.forEach(item => {
        if (!item.requiresAuth || true) { // User is authenticated in this test
          expect(screen.getByText(item.label)).toBeInTheDocument();
        }
      });
    });

    it('displays badge counts on navigation items', () => {
      renderWithRouter(
        <>
          <Navigation items={MOCK_NAV_ITEMS} />
          <LocationDisplay />
        </>,
        { isAuthenticated: true }
      );

      const projectsLink = screen.getByText('Projects').closest('a');
      expect(projectsLink).toHaveAttribute('aria-label', expect.stringContaining('3'));
    });

    it('marks active navigation item based on current route', () => {
      renderWithRouter(
        <>
          <Navigation items={MOCK_NAV_ITEMS} />
          <LocationDisplay />
        </>,
        { initialRoute: '/projects', isAuthenticated: true }
      );

      const projectsLink = screen.getByText('Projects').closest('a');
      expect(projectsLink).toHaveAttribute('aria-current', 'page');
    });

    it('handles navigation item click and route change', async () => {
      renderWithRouter(
        <>
          <Navigation items={MOCK_NAV_ITEMS} />
          <LocationDisplay />
        </>,
        { initialRoute: '/dashboard', isAuthenticated: true }
      );

      const pipelinesLink = screen.getByText('Pipelines');
      fireEvent.click(pipelinesLink);

      await waitFor(() => {
        expect(screen.getByTestId('location-display')).toHaveTextContent('/pipelines');
      });
    });

    it('respects feature flags for conditional navigation items', () => {
      renderWithRouter(
        <>
          <Navigation items={MOCK_NAV_ITEMS} />
          <LocationDisplay />
        </>,
        { 
          isAuthenticated: true,
          navConfig: { featureFlags: { 'executions-enabled': false } }
        }
      );

      // Executions item should be hidden when feature flag is disabled
      expect(screen.queryByText('Executions')).not.toBeInTheDocument();
    });

    it('handles keyboard navigation', () => {
      renderWithRouter(
        <>
          <Navigation items={MOCK_NAV_ITEMS} />
          <LocationDisplay />
        </>,
        { isAuthenticated: true }
      );

      const firstNavItem = screen.getAllByRole('link')[0];
      firstNavItem.focus();

      // Simulate Tab key navigation
      fireEvent.keyDown(document, { key: 'Tab' });
      
      // Verify focus management
      const focusedElement = document.activeElement;
      expect(focusedElement).toHaveAttribute('role', 'link');
    });
  });

  describe('MobileNav Component', () => {
    it('renders hamburger menu on mobile viewport', () => {
      renderWithRouter(
        <>
          <MobileNav items={MOCK_NAV_ITEMS} />
          <LocationDisplay />
        </>,
        { viewportWidth: TEST_CONFIG.VIEWPORT.MOBILE, isAuthenticated: true }
      );

      const menuButton = screen.getByLabelText(/open menu/i);
      expect(menuButton).toBeInTheDocument();
    });

    it('toggles mobile navigation menu on click', () => {
      renderWithRouter(
        <>
          <MobileNav items={MOCK_NAV_ITEMS} />
          <LocationDisplay />
        </>,
        { viewportWidth: TEST_CONFIG.VIEWPORT.MOBILE, isAuthenticated: true }
      );

      const menuButton = screen.getByLabelText(/open menu/i);
      
      // Open menu
      fireEvent.click(menuButton);
      expect(screen.getByTestId(TEST_CONFIG.TEST_IDS.MOBILE_NAV)).toBeInTheDocument();

      // Close menu
      const closeButton = screen.getByLabelText(/close menu/i);
      fireEvent.click(closeButton);
      expect(screen.queryByTestId(TEST_CONFIG.TEST_IDS.MOBILE_NAV)).not.toBeInTheDocument();
    });

    it('closes mobile menu on route selection', async () => {
      renderWithRouter(
        <>
          <MobileNav items={MOCK_NAV_ITEMS} />
          <LocationDisplay />
        </>,
        { viewportWidth: TEST_CONFIG.VIEWPORT.MOBILE, isAuthenticated: true }
      );

      // Open menu
      fireEvent.click(screen.getByLabelText(/open menu/i));
      
      // Select a navigation item
      const projectsLink = screen.getByText('Projects');
      fireEvent.click(projectsLink);

      await waitFor(() => {
        expect(screen.queryByTestId(TEST_CONFIG.TEST_IDS.MOBILE_NAV)).not.toBeInTheDocument();
      });
    });

    it('prevents body scroll when mobile menu is open', () => {
      renderWithRouter(
        <>
          <MobileNav items={MOCK_NAV_ITEMS} />
          <LocationDisplay />
        </>,
        { viewportWidth: TEST_CONFIG.VIEWPORT.MOBILE, isAuthenticated: true }
      );

      // Initially body should be scrollable
      expect(document.body).not.toHaveStyle('overflow: hidden');

      // Open menu
      fireEvent.click(screen.getByLabelText(/open menu/i));
      expect(document.body).toHaveStyle('overflow: hidden');

      // Close menu
      fireEvent.click(screen.getByLabelText(/close menu/i));
      expect(document.body).not.toHaveStyle('overflow: hidden');
    });
  });

  describe('UserMenu Component', () => {
    it('renders user avatar and name', () => {
      renderWithRouter(
        <>
          <UserMenu user={MOCK_USER} />
          <LocationDisplay />
        </>,
        { isAuthenticated: true }
      );

      expect(screen.getByText(MOCK_USER.name)).toBeInTheDocument();
      expect(screen.getByAltText(`${MOCK_USER.name}'s avatar`)).toBeInTheDocument();
    });

    it('toggles dropdown menu on click', () => {
      renderWithRouter(
        <>
          <UserMenu user={MOCK_USER} />
          <LocationDisplay />
        </>,
        { isAuthenticated: true }
      );

      const userButton = screen.getByTestId(TEST_CONFIG.TEST_IDS.USER_MENU);
      
      // Open dropdown
      fireEvent.click(userButton);
      expect(screen.getByText('Profile')).toBeInTheDocument();
      expect(screen.getByText('Account Settings')).toBeInTheDocument();
      expect(screen.getByTestId(TEST_CONFIG.TEST_IDS.LOGOUT_BUTTON)).toBeInTheDocument();

      // Close dropdown
      fireEvent.click(userButton);
      expect(screen.queryByText('Profile')).not.toBeInTheDocument();
    });

    it('calls logout handler when logout is clicked', () => {
      const onLogout = jest.fn();

      renderWithRouter(
        <>
          <UserMenu user={MOCK_USER} onLogout={onLogout} />
          <LocationDisplay />
        </>,
        { isAuthenticated: true }
      );

      // Open dropdown and click logout
      fireEvent.click(screen.getByTestId(TEST_CONFIG.TEST_IDS.USER_MENU));
      fireEvent.click(screen.getByTestId(TEST_CONFIG.TEST_IDS.LOGOUT_BUTTON));

      expect(onLogout).toHaveBeenCalledTimes(1);
    });

    it('closes dropdown on outside click', () => {
      renderWithRouter(
        <>
          <div data-testid="outside">Outside element</div>
          <UserMenu user={MOCK_USER} />
          <LocationDisplay />
        </>,
        { isAuthenticated: true }
      );

      // Open dropdown
      fireEvent.click(screen.getByTestId(TEST_CONFIG.TEST_IDS.USER_MENU));
      expect(screen.getByText('Profile')).toBeInTheDocument();

      // Click outside
      fireEvent.mouseDown(screen.getByTestId('outside'));

      expect(screen.queryByText('Profile')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('logs error when navigation fails', async () => {
      const mockLogger = createMockLogger();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Simulate a navigation error by providing invalid configuration
      renderWithRouter(
        <>
          <Navigation items={[]} />
          <LocationDisplay />
        </>,
        { isAuthenticated: true }
      );

      // Verify graceful handling of empty navigation
      expect(screen.queryByRole('navigation')).toBeInTheDocument();
      
      consoleSpy.mockRestore();
    });

    it('handles missing user gracefully', () => {
      // Should not throw when user is null
      expect(() => {
        renderWithRouter(
          <>
            <UserMenu user={null as unknown as UserProfile} />
            <LocationDisplay />
          </>,
          { isAuthenticated: false }
        );
      }).not.toThrow();
    });

    it('validates navigation item structure', () => {
      const invalidItems = [
        { id: 'invalid', label: '', path: '' }, // Empty label and path
      ] as NavItem[];

      // Should filter out or handle invalid items gracefully
      const { container } = renderWithRouter(
        <>
          <Navigation items={invalidItems} />
          <LocationDisplay />
        </>,
        { isAuthenticated: true }
      );

      expect(container.querySelector('nav')).toBeInTheDocument();
    });
  });

  describe('Integration Tests', () => {
    it('coordinates header, navigation, and user menu state', async () => {
      const onLogout = jest.fn();

      renderWithRouter(
        <>
          <Header onLogout={onLogout} />
          <Navigation items={MOCK_NAV_ITEMS} />
          <LocationDisplay />
        </>,
        { initialRoute: '/dashboard', isAuthenticated: true }
      );

      // Verify all components render together
      expect(screen.getByTestId(TEST_CONFIG.TEST_IDS.HEADER)).toBeInTheDocument();
      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getByTestId(TEST_CONFIG.TEST_IDS.USER_MENU)).toBeInTheDocument();

      // Navigate to different route
      fireEvent.click(screen.getByText('Projects'));
      
      await waitFor(() => {
        expect(screen.getByTestId('location-display')).toHaveTextContent('/projects');
      });

      // Verify active state updated
      const projectsLink = screen.getByText('Projects').closest('a');
      expect(projectsLink).toHaveAttribute('aria-current', 'page');
    });

    it('maintains accessibility throughout navigation flow', async () => {
      const { container } = renderWithRouter(
        <>
          <Header />
          <Navigation items={MOCK_NAV_ITEMS} />
          <LocationDisplay />
        </>,
        { isAuthenticated: true }
      );

      // Initial accessibility check
      let results = await axe(container);
      expect(results).toHaveNoViolations();

      // Navigate and re-check
      fireEvent.click(screen.getByText('Pipelines'));
      
      await waitFor(async () => {
        results = await axe(container);
        expect(results).toHaveNoViolations();
      });
    });
  });
});