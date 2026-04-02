/**
 * Hero Section Test Module
 * 
 * Tests for the Hero/Banner component following the six-layer architecture.
 * Layer: UI (Runtime layer testing)
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { HeroSection } from '../components/hero-section';
import { HeroConfig } from '../config/hero-config';
import { HeroType } from '../types/hero-types';
import { Logger } from '../utils/logger';

// Mock the logger to avoid polluting test output
jest.mock('../utils/logger', () => ({
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('HeroSection Component', () => {
  // Valid hero configuration for testing
  const validHeroConfig: HeroConfig = {
    id: 'test-hero-001',
    type: HeroType.PRIMARY,
    title: 'Welcome to Harness',
    subtitle: 'Build and deploy with confidence',
    ctaText: 'Get Started',
    ctaLink: '/get-started',
    backgroundImage: '/images/hero-bg.jpg',
    isEnabled: true,
    priority: 1,
  };

  // Minimal valid configuration
  const minimalHeroConfig: HeroConfig = {
    id: 'test-hero-002',
    type: HeroType.SECONDARY,
    title: 'Simple Hero',
    isEnabled: true,
  };

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup after each test
    jest.restoreAllMocks();
  });

  describe('Layer 1: Types Validation', () => {
    it('should validate HeroType enum values', () => {
      // Verify all expected hero types exist
      expect(HeroType.PRIMARY).toBe('primary');
      expect(HeroType.SECONDARY).toBe('secondary');
      expect(HeroType.BANNER).toBe('banner');
      expect(HeroType.VIDEO).toBe('video');
    });

    it('should accept valid HeroConfig structure', () => {
      const config: HeroConfig = {
        ...validHeroConfig,
      };
      expect(config.id).toBeDefined();
      expect(config.title).toBeDefined();
      expect(config.type).toBeDefined();
    });
  });

  describe('Layer 2: Config Validation', () => {
    it('should handle missing optional config properties gracefully', () => {
      render(<HeroSection config={minimalHeroConfig} />);
      
      // Should render without optional subtitle, ctaText, etc.
      expect(screen.getByText('Simple Hero')).toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('should throw error for invalid config (missing required id)', () => {
      const invalidConfig = {
        ...validHeroConfig,
        id: undefined,
      } as unknown as HeroConfig;

      // Expect component to handle invalid config gracefully
      expect(() => {
        render(<HeroSection config={invalidConfig} />);
      }).toThrowError(/Invalid hero configuration: id is required/);
    });

    it('should throw error for invalid config (missing required title)', () => {
      const invalidConfig = {
        ...validHeroConfig,
        title: '',
      };

      expect(() => {
        render(<HeroSection config={invalidConfig} />);
      }).toThrowError(/Invalid hero configuration: title is required/);
    });
  });

  describe('Layer 3-4: Component Rendering & Service Integration', () => {
    it('should render hero with all provided content', () => {
      render(<HeroSection config={validHeroConfig} />);

      // Verify main content renders
      expect(screen.getByText('Welcome to Harness')).toBeInTheDocument();
      expect(screen.getByText('Build and deploy with confidence')).toBeInTheDocument();
      
      // Verify CTA button renders with correct link
      const ctaButton = screen.getByRole('link', { name: 'Get Started' });
      expect(ctaButton).toBeInTheDocument();
      expect(ctaButton).toHaveAttribute('href', '/get-started');
    });

    it('should apply correct CSS classes based on hero type', () => {
      const { container } = render(<HeroSection config={validHeroConfig} />);
      
      // Primary hero should have primary styling class
      const heroElement = container.querySelector('.hero-section');
      expect(heroElement).toHaveClass('hero--primary');
    });

    it('should render secondary hero type with different styling', () => {
      const secondaryConfig: HeroConfig = {
        ...validHeroConfig,
        type: HeroType.SECONDARY,
      };

      const { container } = render(<HeroSection config={secondaryConfig} />);
      
      const heroElement = container.querySelector('.hero-section');
      expect(heroElement).toHaveClass('hero--secondary');
    });

    it('should render banner type with compact styling', () => {
      const bannerConfig: HeroConfig = {
        ...validHeroConfig,
        type: HeroType.BANNER,
      };

      const { container } = render(<HeroSection config={bannerConfig} />);
      
      const heroElement = container.querySelector('.hero-section');
      expect(heroElement).toHaveClass('hero--banner');
    });
  });

  describe('Layer 5: Runtime Behavior', () => {
    it('should handle CTA click events', async () => {
      const onCtaClick = jest.fn();
      
      render(
        <HeroSection 
          config={validHeroConfig} 
          onCtaClick={onCtaClick}
        />
      );

      const ctaButton = screen.getByRole('link', { name: 'Get Started' });
      fireEvent.click(ctaButton);

      await waitFor(() => {
        expect(onCtaClick).toHaveBeenCalledTimes(1);
      });
    });

    it('should not render when hero is disabled', () => {
      const disabledConfig: HeroConfig = {
        ...validHeroConfig,
        isEnabled: false,
      };

      const { container } = render(<HeroSection config={disabledConfig} />);
      
      // Component should return null or empty when disabled
      expect(container.firstChild).toBeNull();
    });

    it('should handle missing background image gracefully', () => {
      const configWithoutImage: HeroConfig = {
        ...validHeroConfig,
        backgroundImage: undefined,
      };

      const { container } = render(<HeroSection config={configWithoutImage} />);
      
      // Should render without background image styling
      const heroElement = container.querySelector('.hero-section');
      expect(heroElement).not.toHaveStyle({
        backgroundImage: expect.any(String),
      });
    });

    it('should lazy load background image when specified', () => {
      const configWithLazyLoad: HeroConfig = {
        ...validHeroConfig,
        lazyLoadImage: true,
      };

      render(<HeroSection config={configWithLazyLoad} />);
      
      // Verify lazy loading attribute is applied
      const heroElement = screen.getByTestId('hero-section');
      expect(heroElement).toHaveAttribute('data-lazy-load', 'true');
    });
  });

  describe('Layer 6: UI/UX Interactions', () => {
    it('should support keyboard navigation for CTA', () => {
      render(<HeroSection config={validHeroConfig} />);

      const ctaButton = screen.getByRole('link', { name: 'Get Started' });
      
      // Verify button is focusable
      ctaButton.focus();
      expect(ctaButton).toHaveFocus();
      
      // Simulate Enter key press
      fireEvent.keyDown(ctaButton, { key: 'Enter', code: 'Enter' });
    });

    it('should render with proper ARIA attributes for accessibility', () => {
      render(<HeroSection config={validHeroConfig} />);

      const heroElement = screen.getByRole('banner');
      expect(heroElement).toHaveAttribute('aria-label', 'Welcome to Harness');
    });

    it('should handle responsive layout changes', () => {
      // Mock window resize for responsive testing
      global.innerWidth = 768;
      global.dispatchEvent(new Event('resize'));

      const { container } = render(<HeroSection config={validHeroConfig} />);
      
      const heroElement = container.querySelector('.hero-section');
      expect(heroElement).toHaveClass('hero--responsive');
    });

    it('should display loading state while image loads', () => {
      const configWithSlowImage: HeroConfig = {
        ...validHeroConfig,
        backgroundImage: '/large-image.jpg',
      };

      render(<HeroSection config={configWithSlowImage} />);
      
      // Should show loading indicator while image loads
      expect(screen.getByTestId('hero-loading')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should log error when image fails to load', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      const configWithBrokenImage: HeroConfig = {
        ...validHeroConfig,
        backgroundImage: '/broken-image.jpg',
      };

      render(<HeroSection config={configWithBrokenImage} />);

      // Simulate image load error
      const imgElement = screen.getByTestId('hero-background');
      fireEvent.error(imgElement);

      await waitFor(() => {
        expect(Logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to load hero background image'),
          expect.any(Object)
        );
      });

      consoleErrorSpy.mockRestore();
    });

    it('should render fallback content when critical error occurs', () => {
      // Force an error by passing null config (edge case)
      const { container } = render(
        <HeroSection config={null as unknown as HeroConfig} />
      );

      // Should render error fallback or empty state gracefully
      expect(container.textContent).toContain('Unable to display hero section');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long title text', () => {
      const longTitleConfig: HeroConfig = {
        ...validHeroConfig,
        title: 'A'.repeat(200),
      };

      render(<HeroSection config={longTitleConfig} />);
      
      const titleElement = screen.getByText('A'.repeat(200));
      expect(titleElement).toBeInTheDocument();
      expect(titleElement).toHaveClass('hero-title--truncated');
    });

    it('should handle special characters in content', () => {
      const specialCharConfig: HeroConfig = {
        ...validHeroConfig,
        title: '<script>alert("xss")</script>',
        subtitle: 'Special chars: & < > " \'',
      };

      render(<HeroSection config={specialCharConfig} />);
      
      // Content should be escaped, not rendered as HTML
      expect(screen.getByText(/<script>/)).toBeInTheDocument();
      expect(document.querySelector('script')).not.toBeInTheDocument();
    });

    it('should handle rapid prop changes', async () => {
      const { rerender } = render(<HeroSection config={validHeroConfig} />);

      // Rapidly change config
      for (let i = 0; i < 5; i++) {
        rerender(
          <HeroSection 
            config={{
              ...validHeroConfig,
              title: `Updated Title ${i}`,
            }}
          />
        );
      }

      await waitFor(() => {
        expect(screen.getByText('Updated Title 4')).toBeInTheDocument();
      });
    });
  });
});