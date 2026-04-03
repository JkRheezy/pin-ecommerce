/**
 * Hero/Landing Section Tests
 * 
 * Tests for the main landing page hero section following the six-layer architecture:
 * Types → Config → Repo → Service → Runtime → UI
 * 
 * Layer: UI (Presentation layer tests)
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeroSection } from '@/app/sections/HeroSection';
import { HeroConfig } from '@/app/config/hero.config';
import { Logger } from '@/app/services/logger.service';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';

// Mock the logger service
jest.mock('@/app/services/logger.service', () => ({
  Logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock the hero configuration
jest.mock('@/app/config/hero.config', () => ({
  HeroConfig: {
    title: 'Welcome to Harness',
    subtitle: 'Build and deploy with confidence',
    ctaPrimary: {
      label: 'Get Started',
      href: '/signup',
      testId: 'hero-cta-primary',
    },
    ctaSecondary: {
      label: 'Learn More',
      href: '/docs',
      testId: 'hero-cta-secondary',
    },
    features: [
      { icon: 'rocket', title: 'Fast Deployments', description: 'Deploy in seconds' },
      { icon: 'shield', title: 'Secure by Default', description: 'Enterprise-grade security' },
    ],
  },
}));

// Type definitions for test fixtures
interface HeroTestFixture {
  title: string;
  subtitle: string;
  ctas: {
    primary: { label: string; href: string };
    secondary: { label: string; href: string };
  };
}

/**
 * Test fixture factory following Repository pattern
 * Creates consistent test data for hero section tests
 */
const createHeroFixture = (overrides?: Partial<HeroTestFixture>): HeroTestFixture => ({
  title: HeroConfig.title,
  subtitle: HeroConfig.subtitle,
  ctas: {
    primary: {
      label: HeroConfig.ctaPrimary.label,
      href: HeroConfig.ctaPrimary.href,
    },
    secondary: {
      label: HeroConfig.ctaSecondary.label,
      href: HeroConfig.ctaSecondary.href,
    },
  },
  ...overrides,
});

describe('HeroSection', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering (UI Layer)', () => {
    it('should render hero section with correct title and subtitle', () => {
      // Arrange: Setup test fixture
      const fixture = createHeroFixture();

      // Act: Render component
      render(
        <ErrorBoundary>
          <HeroSection />
        </ErrorBoundary>
      );

      // Assert: Verify content is displayed
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(fixture.title);
      expect(screen.getByText(fixture.subtitle)).toBeInTheDocument();
    });

    it('should render both CTA buttons with correct labels and hrefs', () => {
      // Arrange
      const fixture = createHeroFixture();

      // Act
      render(
        <ErrorBoundary>
          <HeroSection />
        </ErrorBoundary>
      );

      // Assert: Verify primary CTA
      const primaryCta = screen.getByTestId('hero-cta-primary');
      expect(primaryCta).toHaveTextContent(fixture.ctas.primary.label);
      expect(primaryCta).toHaveAttribute('href', fixture.ctas.primary.href);

      // Assert: Verify secondary CTA
      const secondaryCta = screen.getByTestId('hero-cta-secondary');
      expect(secondaryCta).toHaveTextContent(fixture.ctas.secondary.label);
      expect(secondaryCta).toHaveAttribute('href', fixture.ctas.secondary.href);
    });

    it('should render feature list with icons and descriptions', () => {
      // Act
      render(
        <ErrorBoundary>
          <HeroSection />
        </ErrorBoundary>
      );

      // Assert: Verify features are rendered
      HeroConfig.features.forEach((feature) => {
        expect(screen.getByText(feature.title)).toBeInTheDocument();
        expect(screen.getByText(feature.description)).toBeInTheDocument();
      });
    });
  });

  describe('User Interactions (Runtime Layer)', () => {
    it('should handle primary CTA click and log interaction', async () => {
      // Arrange
      const user = userEvent.setup();
      render(
        <ErrorBoundary>
          <HeroSection />
        </ErrorBoundary>
      );

      // Act: Click primary CTA
      const primaryCta = screen.getByTestId('hero-cta-primary');
      await user.click(primaryCta);

      // Assert: Verify logging service was called
      await waitFor(() => {
        expect(Logger.info).toHaveBeenCalledWith(
          'Hero CTA clicked',
          expect.objectContaining({
            ctaType: 'primary',
            href: HeroConfig.ctaPrimary.href,
          })
        );
      });
    });

    it('should handle secondary CTA click and log interaction', async () => {
      // Arrange
      const user = userEvent.setup();
      render(
        <ErrorBoundary>
          <HeroSection />
        </ErrorBoundary>
      );

      // Act: Click secondary CTA
      const secondaryCta = screen.getByTestId('hero-cta-secondary');
      await user.click(secondaryCta);

      // Assert: Verify logging service was called
      await waitFor(() => {
        expect(Logger.info).toHaveBeenCalledWith(
          'Hero CTA clicked',
          expect.objectContaining({
            ctaType: 'secondary',
            href: HeroConfig.ctaSecondary.href,
          })
        );
      });
    });

    it('should support keyboard navigation for accessibility', async () => {
      // Arrange
      const user = userEvent.setup();
      render(
        <ErrorBoundary>
          <HeroSection />
        </ErrorBoundary>
      );

      // Act: Tab to primary CTA and activate with Enter
      await user.tab(); // Focus first interactive element
      await user.keyboard('{Enter}');

      // Assert: Verify interaction was logged
      await waitFor(() => {
        expect(Logger.info).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling (Service Layer)', () => {
    it('should catch and log rendering errors via ErrorBoundary', () => {
      // Arrange: Create a component that throws
      const ThrowingComponent: React.FC = () => {
        throw new Error('Test render error');
      };

      // Act & Assert: Verify error boundary catches the error
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // Verify error was logged
      expect(Logger.error).toHaveBeenCalledWith(
        'Hero section error',
        expect.objectContaining({
          error: expect.any(Error),
        })
      );
    });

    it('should display fallback UI when error occurs', () => {
      // Arrange
      const ThrowingComponent: React.FC = () => {
        throw new Error('Test error');
      };

      // Act
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // Assert: Verify fallback UI is shown
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });

  describe('Configuration (Config Layer)', () => {
    it('should use configuration from HeroConfig for all displayed content', () => {
      // Act
      render(
        <ErrorBoundary>
          <HeroSection />
        </ErrorBoundary>
      );

      // Assert: Verify all content matches configuration
      expect(screen.getByText(HeroConfig.title)).toBeInTheDocument();
      expect(screen.getByText(HeroConfig.subtitle)).toBeInTheDocument();
      expect(screen.getByText(HeroConfig.ctaPrimary.label)).toBeInTheDocument();
      expect(screen.getByText(HeroConfig.ctaSecondary.label)).toBeInTheDocument();
    });

    it('should handle missing optional configuration gracefully', () => {
      // Arrange: Temporarily modify config to remove optional fields
      const originalConfig = { ...HeroConfig };
      (HeroConfig as any).subtitle = undefined;

      // Act
      render(
        <ErrorBoundary>
          <HeroSection />
        </ErrorBoundary>
      );

      // Assert: Component still renders without subtitle
      expect(screen.getByText(HeroConfig.title)).toBeInTheDocument();

      // Cleanup: Restore original config
      Object.assign(HeroConfig, originalConfig);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels for screen readers', () => {
      // Act
      render(
        <ErrorBoundary>
          <HeroSection />
        </ErrorBoundary>
      );

      // Assert: Verify main landmark
      const mainSection = screen.getByRole('banner');
      expect(mainSection).toBeInTheDocument();

      // Verify CTA buttons have accessible names
      expect(screen.getByTestId('hero-cta-primary')).toHaveAccessibleName();
      expect(screen.getByTestId('hero-cta-secondary')).toHaveAccessibleName();
    });

    it('should maintain focus management during interactions', async () => {
      // Arrange
      const user = userEvent.setup();
      render(
        <ErrorBoundary>
          <HeroSection />
        </ErrorBoundary>
      );

      // Act: Tab through interactive elements
      await user.tab();
      const firstFocused = document.activeElement;

      await user.tab();
      const secondFocused = document.activeElement;

      // Assert: Focus moved to different elements
      expect(firstFocused).not.toBe(secondFocused);
    });
  });
});