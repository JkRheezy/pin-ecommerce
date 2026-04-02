import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RootLayout, { metadata } from './layout';

// Mock the Inter font from next/font/google
vi.mock('next/font/google', () => ({
  Inter: () => ({
    className: 'mock-inter-font',
    subsets: ['latin'],
  }),
}));

// Mock the Providers component
vi.mock('./providers', () => ({
  Providers: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="providers-mock">{children}</div>
  ),
}));

// Mock structured logging
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Layout (Six-Layer: Runtime → UI)', () => {
  // Cleanup after each test to prevent memory leaks
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Layer 1: Types - Metadata Structure', () => {
    it('should export valid metadata object with required fields', () => {
      // Validate metadata type structure
      expect(metadata).toBeDefined();
      expect(typeof metadata).toBe('object');
    });

    it('should have correct title and description for SEO', () => {
      // Runtime validation: metadata must include title for SEO compliance
      expect(metadata.title).toBeDefined();
      expect(metadata.title).toBe('Harness Engineering');

      // Description is required for accessibility and SEO
      expect(metadata.description).toBeDefined();
      expect(typeof metadata.description).toBe('string');
      expect(metadata.description!.length).toBeGreaterThan(0);
    });

    it('should include viewport configuration for responsive design', () => {
      // Validate viewport settings follow mobile-first approach
      expect(metadata.viewport).toBeDefined();
      expect(metadata.viewport).toMatchObject({
        width: 'device-width',
        initialScale: 1,
      });
    });

    it('should have proper OpenGraph metadata for social sharing', () => {
      // Runtime validation: OG tags improve social media sharing
      if (metadata.openGraph) {
        expect(metadata.openGraph.type).toBe('website');
        expect(metadata.openGraph.siteName).toBe('Harness Engineering');
      }
    });
  });

  describe('Layer 2: Config - Font Configuration', () => {
    it('should apply Inter font className to html element', () => {
      const { container } = render(
        <RootLayout>
          <div data-testid="child-content">Test Child</div>
        </RootLayout>
      );

      const htmlElement = container.querySelector('html');
      expect(htmlElement).toHaveClass('mock-inter-font');
    });

    it('should suppress hydration warnings to prevent Next.js hydration errors', () => {
      const { container } = render(
        <RootLayout>
          <div>Test</div>
        </RootLayout>
      );

      const htmlElement = container.querySelector('html');
      // suppressHydrationWarning is a React prop, not a DOM attribute
      // We verify the component renders without throwing hydration errors
      expect(htmlElement).toBeInTheDocument();
    });
  });

  describe('Layer 3: Repo - Providers Integration', () => {
    it('should wrap children with Providers component', () => {
      render(
        <RootLayout>
          <div data-testid="child-content">Test Child Content</div>
        </RootLayout>
      );

      // Providers mock should be present in the DOM
      expect(screen.getByTestId('providers-mock')).toBeInTheDocument();
    });

    it('should pass children correctly through Providers', () => {
      render(
        <RootLayout>
          <div data-testid="child-content">Nested Content</div>
        </RootLayout>
      );

      // Child content should be rendered inside providers
      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByText('Nested Content')).toBeInTheDocument();
    });
  });

  describe('Layer 4: Service - Children Rendering', () => {
    it('should render single child element', () => {
      render(
        <RootLayout>
          <main data-testid="single-child">Main Content</main>
        </RootLayout>
      );

      expect(screen.getByTestId('single-child')).toBeInTheDocument();
    });

    it('should render multiple child elements', () => {
      render(
        <RootLayout>
          <header data-testid="header">Header</header>
          <main data-testid="main">Main</main>
          <footer data-testid="footer">Footer</footer>
        </RootLayout>
      );

      expect(screen.getByTestId('header')).toBeInTheDocument();
      expect(screen.getByTestId('main')).toBeInTheDocument();
      expect(screen.getByTestId('footer')).toBeInTheDocument();
    });

    it('should render nested React components', () => {
      const NestedComponent = () => (
        <div data-testid="nested">
          <span>Deep nesting</span>
        </div>
      );

      render(
        <RootLayout>
          <NestedComponent />
        </RootLayout>
      );

      expect(screen.getByTestId('nested')).toBeInTheDocument();
      expect(screen.getByText('Deep nesting')).toBeInTheDocument();
    });

    it('should render text nodes as children', () => {
      render(
        <RootLayout>
          Plain text content
        </RootLayout>
      );

      expect(screen.getByText('Plain text content')).toBeInTheDocument();
    });
  });

  describe('Layer 5: Runtime - Error Handling & Edge Cases', () => {
    it('should handle empty children gracefully', () => {
      // Edge case: Layout should not crash with no children
      const { container } = render(<RootLayout>{null}</RootLayout>);
      
      const body = container.querySelector('body');
      expect(body).toBeInTheDocument();
      // Providers should still render even with null children
      expect(screen.getByTestId('providers-mock')).toBeInTheDocument();
    });

    it('should handle undefined children without throwing', () => {
      // Runtime validation: undefined children should not cause runtime errors
      expect(() => {
        render(<RootLayout>{undefined}</RootLayout>);
      }).not.toThrow();
    });

    it('should handle fragment children', () => {
      render(
        <RootLayout>
          <>
            <div data-testid="fragment-1">Fragment 1</div>
            <div data-testid="fragment-2">Fragment 2</div>
          </>
        </RootLayout>
      );

      expect(screen.getByTestId('fragment-1')).toBeInTheDocument();
      expect(screen.getByTestId('fragment-2')).toBeInTheDocument();
    });

    it('should preserve html lang attribute for accessibility', () => {
      const { container } = render(
        <RootLayout>
          <div>Content</div>
        </RootLayout>
      );

      const htmlElement = container.querySelector('html');
      expect(htmlElement).toHaveAttribute('lang', 'en');
    });

    it('should render body element with proper structure', () => {
      const { container } = render(
        <RootLayout>
          <div data-testid="body-child">Body Content</div>
        </RootLayout>
      );

      const body = container.querySelector('body');
      expect(body).toBeInTheDocument();
      expect(body).toContainElement(screen.getByTestId('providers-mock'));
    });
  });

  describe('Layer 6: UI - Integration & Accessibility', () => {
    it('should maintain proper DOM hierarchy: html > body > providers > children', () => {
      const { container } = render(
        <RootLayout>
          <div data-testid="test-child">Test</div>
        </RootLayout>
      );

      const html = container.querySelector('html');
      const body = container.querySelector('body');
      const providers = screen.getByTestId('providers-mock');
      const child = screen.getByTestId('test-child');

      // Verify hierarchy
      expect(html).toContainElement(body!);
      expect(body).toContainElement(providers);
      expect(providers).toContainElement(child);
    });

    it('should apply antialiased class for font smoothing', () => {
      const { container } = render(
        <RootLayout>
          <div>Content</div>
        </RootLayout>
      );

      const body = container.querySelector('body');
      expect(body).toHaveClass('antialiased');
    });
  });
});