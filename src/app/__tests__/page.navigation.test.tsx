/**
 * @file src/app/__tests__/page.navigation.test.tsx
 * @description Test module for navigation and header functionality
 * @module Tests/Navigation
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import { axe, toHaveNoViolations } from 'jest-axe';

// Types Layer: Test-specific type definitions
import type { RenderOptions } from '@testing-library/react';
import type { History } from 'history';

// Config Layer: Test configuration and mocks
import { TestProviders } from '@tests/utils/test-providers';
import { mockNavigationConfig } from '@tests/mocks/config/navigation.mock';
import { mockLogger } from '@tests/mocks/services/logger.mock';

// Repo Layer: Mock data repositories
import { mockUserRepository } from '@tests/mocks/repos/user.mock';

// Service Layer: Mock services
import { NavigationService } from '@app/services/navigation.service';
import { AuthService } from '@app/services/auth.service';

// Runtime Layer: Components under test
import { Header } from '@app/components/layout/Header';
import { Navigation } from '@app/components/layout/Navigation';
import { UserMenu } from '@app/components/user/UserMenu';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// =============================================================================
// Types
// =============================================================================

interface NavigationTestContext {
  history: History;
  navigationService: NavigationService;
  authService: AuthService;
}

interface RenderNavigationOptions extends Omit<RenderOptions, 'wrapper'> {
  initialRoute?: string;
  isAuthenticated?: boolean;
  userRole?: 'admin' | 'user' | 'guest';
}

// =============================================================================
// Test Setup
// =============================================================================

describe('Navigation and Header Tests', () => {
  let context: NavigationTestContext;
  let loggerSpy: jest.SpyInstance;

  beforeEach(() => {
    // Initialize structured logger mock
    loggerSpy = jest.spyOn(mockLogger, 'info').mockImplementation(() => {});

    // Initialize services with proper dependency injection
    const authService = new AuthService({
      userRepository: mockUserRepository,
      logger: mockLogger,
    });

    const navigationService = new NavigationService({
      config: mockNavigationConfig,
      logger: mockLogger,
      authService,
    });

    context = {
      history: createMemoryHistory(),
      navigationService,
      authService,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    loggerSpy.mockRestore();
  });

  // =============================================================================
  // Helper Functions
  // =============================================================================

  /**
   * Renders navigation components with test providers
   * @param ui - React element to render
   * @param options - Test rendering options
   * @returns Rendered component utilities
   */
  const renderWithNavigation = (
    ui: React.ReactElement,
    options: RenderNavigationOptions = {}
  ) => {
    const {
      initialRoute = '/',
      isAuthenticated = false,
      userRole = 'guest',
      ...renderOptions
    } = options;

    // Set initial authentication state
    if (isAuthenticated) {
      context.authService.setAuthenticated(true, { role: userRole });
    }

    // Reset history to initial route
    context.history.push(initialRoute);

    const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <TestProviders
        history={context.history}
        navigationService={context.navigationService}
        authService={context.authService}
      >
        <Router location={context.history.location} navigator={context.history}>
          {children}
        </Router>
      </TestProviders>
    );

    return {
      ...render(ui, { wrapper: Wrapper, ...renderOptions }),
      history: context.history,
      navigationService: context.navigationService,
    };
  };

  // =============================================================================
  // Header Component Tests
  // =============================================================================

  describe('Header Component', () => {
    it('should render header with logo and navigation', () => {
      const { container } = renderWithNavigation(<Header />);

      // Validate logo presence
      const logo = screen.getByRole('img', { name: /company logo/i });
      expect(logo).toBeInTheDocument();

      // Validate navigation landmark
      const navigation = screen.getByRole('navigation');
      expect(navigation).toBeInTheDocument();

      // Validate header structure
      const header = container.querySelector('header');
      expect(header).toHaveAttribute('data-testid', 'app-header');
    });

    it('should toggle mobile menu on hamburger click', async () => {
      renderWithNavigation(<Header />);

      // Mobile menu should be initially hidden
      const mobileMenu = screen.queryByTestId('mobile-navigation');
      expect(mobileMenu).not.toBeVisible();

      // Click hamburger button
      const menuButton = screen.getByRole('button', { name: /toggle menu/i });
      fireEvent.click(menuButton);

      // Mobile menu should be visible
      await waitFor(() => {
        expect(screen.getByTestId('mobile-navigation')).toBeVisible();
      });

      // Verify logging of user interaction
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Mobile menu toggled',
        expect.objectContaining({ action: 'toggle', state: 'open' })
      );
    });

    it('should display user menu when authenticated', () => {
      renderWithNavigation(<Header />, { isAuthenticated: true, userRole: 'user' });

      const userMenu = screen.getByTestId('user-menu-trigger');
      expect(userMenu).toBeInTheDocument();

      // Verify user avatar or initials are displayed
      const userAvatar = screen.getByRole('img', { name: /user avatar/i });
      expect(userAvatar).toBeInTheDocument();
    });

    it('should display login button when not authenticated', () => {
      renderWithNavigation(<Header />, { isAuthenticated: false });

      const loginButton = screen.getByRole('button', { name: /sign in/i });
      expect(loginButton).toBeInTheDocument();

      // User menu should not be present
      expect(screen.queryByTestId('user-menu-trigger')).not.toBeInTheDocument();
    });

    it('should meet accessibility standards', async () => {
      const { container } = renderWithNavigation(<Header />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should handle keyboard navigation correctly', () => {
      renderWithNavigation(<Header />);

      const menuItems = screen.getAllByRole('link');
      const firstItem = menuItems[0];

      // Focus first menu item
      firstItem.focus();
      expect(document.activeElement).toBe(firstItem);

      // Tab through menu items
      fireEvent.keyDown(firstItem, { key: 'Tab' });
      
      // Verify focus management
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Keyboard navigation event',
        expect.any(Object)
      );
    });
  });

  // =============================================================================
  // Navigation Component Tests
  // =============================================================================

  describe('Navigation Component', () => {
    it('should render all navigation items from config', () => {
      renderWithNavigation(<Navigation />);

      // Validate all configured navigation items are rendered
      mockNavigationConfig.items.forEach((item) => {
        const navLink = screen.getByRole('link', { name: item.label });
        expect(navLink).toBeInTheDocument();
        expect(navLink).toHaveAttribute('href', item.path);
      });
    });

    it('should highlight active navigation item based on current route', () => {
      renderWithNavigation(<Navigation />, { initialRoute: '/dashboard' });

      const activeLink = screen.getByRole('link', { name: /dashboard/i });
      expect(activeLink).toHaveAttribute('aria-current', 'page');
      expect(activeLink).toHaveClass('active');
    });

    it('should filter navigation items based on user role', () => {
      renderWithNavigation(<Navigation />, {
        isAuthenticated: true,
        userRole: 'user',
      });

      // Admin-only items should be hidden for regular users
      const adminItem = screen.queryByRole('link', { name: /admin panel/i });
      expect(adminItem).not.toBeInTheDocument();

      // User-accessible items should be visible
      const userItem = screen.getByRole('link', { name: /my account/i });
      expect(userItem).toBeInTheDocument();
    });

    it('should handle navigation item click with proper logging', () => {
      const { history } = renderWithNavigation(<Navigation />);

      const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
      fireEvent.click(dashboardLink);

      // Verify navigation occurred
      expect(history.location.pathname).toBe('/dashboard');

      // Verify structured logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Navigation item clicked',
        expect.objectContaining({
          target: '/dashboard',
          label: 'Dashboard',
        })
      );
    });

    it('should render dropdown menus for items with children', async () => {
      renderWithNavigation(<Navigation />);

      // Find dropdown trigger
      const dropdownTrigger = screen.getByRole('button', {
        name: /resources/i,
      });

      // Dropdown should be initially closed
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      // Open dropdown
      fireEvent.click(dropdownTrigger);

      // Dropdown menu should be visible with child items
      await waitFor(() => {
        const menu = screen.getByRole('menu');
        expect(menu).toBeInTheDocument();
      });

      // Verify child items
      const childItems = screen.getAllByRole('menuitem');
      expect(childItems.length).toBeGreaterThan(0);
    });

    it('should handle navigation errors gracefully', async () => {
      // Simulate navigation service error
      jest
        .spyOn(context.navigationService, 'validateRoute')
        .mockRejectedValue(new Error('Invalid route'));

      const { history } = renderWithNavigation(<Navigation />);

      // Attempt navigation
      const invalidLink = screen.getByRole('link', { name: /invalid route/i });
      fireEvent.click(invalidLink);

      // Wait for error handling
      await waitFor(() => {
        // Verify error logging
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Navigation failed',
          expect.objectContaining({
            error: expect.any(Error),
            route: expect.any(String),
          })
        );
      });

      // Should redirect to error page or fallback
      expect(history.location.pathname).toBe('/error');
    });
  });

  // =============================================================================
  // User Menu Tests
  // =============================================================================

  describe('User Menu Component', () => {
    it('should render user information correctly', () => {
      const mockUser = {
        name: 'John Doe',
        email: 'john.doe@example.com',
        avatar: 'https://example.com/avatar.jpg',
      };

      mockUserRepository.getCurrentUser.mockResolvedValue(mockUser);

      renderWithNavigation(<UserMenu />, { isAuthenticated: true });

      expect(screen.getByText(mockUser.name)).toBeInTheDocument();
      expect(screen.getByText(mockUser.email)).toBeInTheDocument();
    });

    it('should handle logout action', async () => {
      const logoutSpy = jest.spyOn(context.authService, 'logout');

      renderWithNavigation(<UserMenu />, { isAuthenticated: true });

      // Open user menu
      const menuTrigger = screen.getByTestId('user-menu-trigger');
      fireEvent.click(menuTrigger);

      // Click logout
      const logoutButton = await screen.findByRole('button', { name: /logout/i });
      fireEvent.click(logoutButton);

      // Verify logout was called
      expect(logoutSpy).toHaveBeenCalled();

      // Verify navigation to login page
      await waitFor(() => {
        expect(context.history.location.pathname).toBe('/login');
      });
    });

    it('should close menu on outside click', async () => {
      renderWithNavigation(
        <div>
          <UserMenu />
          <div data-testid="outside-element">Outside</div>
        </div>,
        { isAuthenticated: true }
      );

      // Open menu
      const menuTrigger = screen.getByTestId('user-menu-trigger');
      fireEvent.click(menuTrigger);

      // Verify menu is open
      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });

      // Click outside
      const outsideElement = screen.getByTestId('outside-element');
      fireEvent.mouseDown(outsideElement);

      // Menu should be closed
      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });
  });

  // =============================================================================
  // Integration Tests
  // =============================================================================

  describe('Navigation Integration', () => {
    it('should maintain navigation state across route changes', async () => {
      const { history } = renderWithNavigation(
        <>
          <Header />
          <Navigation />
        </>,
        { initialRoute: '/' }
      );

      // Navigate through multiple routes
      const routes = ['/dashboard', '/profile', '/settings'];
      
      for (const route of routes) {
        history.push(route);
        
        await waitFor(() => {
          expect(history.location.pathname).toBe(route);
        });

        // Verify navigation state is maintained
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Route changed',
          expect.objectContaining({ from: expect.any(String), to: route })
        );
      }
    });

    it('should handle browser back/forward navigation', async () => {
      const { history } = renderWithNavigation(
        <>
          <Header />
          <Navigation />
        </>,
        { initialRoute: '/' }
      );

      // Navigate to multiple pages
      history.push('/page1');
      history.push('/page2');

      // Simulate back button
      history.goBack();
      await waitFor(() => {
        expect(history.location.pathname).toBe('/page1');
      });

      // Simulate forward button
      history.goForward();
      await waitFor(() => {
        expect(history.location.pathname).toBe('/page2');
      });
    });

    it('should sync navigation state with URL parameters', async () => {
      const { history } = renderWithNavigation(<Navigation />, {
        initialRoute: '/search?query=test&filter=active',
      });

      // Verify navigation reflects URL state
      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toHaveValue('test');

      // Verify filter state
      const activeFilter = screen.getByRole('button', { name: /active/i });
      expect(activeFilter).toHaveAttribute('aria-pressed', 'true');
    });
  });

  // =============================================================================
  // Edge Cases and Error Handling
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle missing navigation configuration gracefully', () => {
      // Override with empty config
      context.navigationService.setConfig({ items: [] });

      renderWithNavigation(<Navigation />);

      // Should render empty navigation without errors
      const navigation = screen.getByRole('navigation');
      expect(navigation).toBeInTheDocument();
      expect(navigation.children.length).toBe(0);

      // Should log warning
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Empty navigation configuration',
        expect.any(Object)
      );
    });

    it('should handle rapid navigation clicks', async () => {
      const { history } = renderWithNavigation(<Navigation />);

      const links = screen.getAllByRole('link');

      // Rapidly click multiple links
      links.forEach((link) => {
        fireEvent.click(link);
      });

      // Should only process last navigation
      await waitFor(() => {
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Navigation debounced',
          expect.any(Object)
        );
      });
    });

    it('should handle navigation with special characters in URLs', () => {
      const specialRoutes = [
        '/path%20with%20spaces',
        '/path-with-unicode-ñ',
        '/path?param=value&other=test',
      ];

      specialRoutes.forEach((route) => {
        const { history } = renderWithNavigation(<Navigation />, {
          initialRoute: route,
        });

        expect(history.location.pathname + history.location.search).toBe(route);
      });
    });

    it('should recover from navigation service failures', async () => {
      // Simulate service failure
      jest
        .spyOn(context.navigationService, 'getNavigationItems')
        .mockImplementation(() => {
          throw new Error('Service unavailable');
        });

      renderWithNavigation(<Navigation />);

      // Should display error boundary fallback
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/navigation error/i);
      });

      // Should provide retry mechanism
      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
    });
  });
});