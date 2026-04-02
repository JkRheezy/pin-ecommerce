/**
 * @file layout.test.ts
 * @description Tests for the RootLayout component and metadata configuration
 * @module app
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// Types Layer: Define test-specific types
interface LayoutProps {
  children: React.ReactNode;
}

interface MetadataConfig {
  title: string;
  description: string;
  keywords: string[];
}

// Config Layer: Test configuration constants
const TEST_CONFIG = {
  defaultTitle: 'Harness Engineering',
  defaultDescription: 'Enterprise-grade engineering platform',
  expectedKeywords: ['harness', 'engineering', 'platform', 'ci/cd'],
} as const;

// Mock next/font before importing the layout
vi.mock('next/font/google', () => ({
  Inter: () => ({
    className: 'mock-inter-font',
    variable: '--font-inter',
    style: { fontFamily: 'Inter, sans-serif' },
  }),
}));

// Mock next/metadata for isolated testing
vi.mock('next/metadata', () => ({
  metadata: {
    title: TEST_CONFIG.defaultTitle,
    description: TEST_CONFIG.defaultDescription,
  },
}));

// Import after mocks are established
// Note: We import dynamically to ensure mocks are applied
const loadLayoutModule = async () => {
  const module = await import('./layout');
  return module;
};

describe('Layout Module', () => {
  describe('Metadata Configuration', () => {
    it('should export valid metadata object', async () => {
      const { metadata } = await loadLayoutModule();
      
      expect(metadata).toBeDefined();
      expect(typeof metadata).toBe('object');
    });

    it('should have required metadata fields', async () => {
      const { metadata } = await loadLayoutModule();
      
      expect(metadata.title).toBeDefined();
      expect(metadata.description).toBeDefined();
      expect(typeof metadata.title).toBe('string');
      expect(typeof metadata.description).toBe('string');
    });

    it('should have non-empty title and description', async () => {
      const { metadata } = await loadLayoutModule();
      
      expect(metadata.title).not.toBe('');
      expect(metadata.description).not.toBe('');
      expect(metadata.title.length).toBeGreaterThan(0);
      expect(metadata.description.length).toBeGreaterThan(0);
    });

    it('should match expected default values', async () => {
      const { metadata } = await loadLayoutModule();
      
      expect(metadata.title).toBe(TEST_CONFIG.defaultTitle);
      expect(metadata.description).toBe(TEST_CONFIG.defaultDescription);
    });
  });

  describe('RootLayout Component', () => {
    let RootLayout: React.FC<LayoutProps>;

    beforeEach(async () => {
      const module = await loadLayoutModule();
      RootLayout = module.default;
    });

    it('should render without crashing', () => {
      const { container } = render(
        <RootLayout>
          <div data-testid="test-child">Test Content</div>
        </RootLayout>
      );
      
      expect(container).toBeTruthy();
    });

    it('should render children content', () => {
      const testContent = 'Test Child Content';
      const { getByText } = render(
        <RootLayout>
          <span>{testContent}</span>
        </RootLayout>
      );
      
      expect(getByText(testContent)).toBeInTheDocument();
    });

    it('should wrap children in proper HTML structure', () => {
      const { container } = render(
        <RootLayout>
          <div data-testid="test-child">Content</div>
        </RootLayout>
      );
      
      // Should have html and body elements
      const htmlElement = container.querySelector('html');
      const bodyElement = container.querySelector('body');
      
      expect(htmlElement).toBeInTheDocument();
      expect(bodyElement).toBeInTheDocument();
    });

    it('should apply font class to body element', () => {
      const { container } = render(
        <RootLayout>
          <div>Content</div>
        </RootLayout>
      );
      
      const bodyElement = container.querySelector('body');
      expect(bodyElement).toHaveClass('mock-inter-font');
    });

    it('should preserve child component hierarchy', () => {
      const { container } = render(
        <RootLayout>
          <main>
            <section>
              <article>Nested Content</article>
            </section>
          </main>
        </RootLayout>
      );
      
      const article = container.querySelector('article');
      expect(article).toBeInTheDocument();
      expect(article?.textContent).toBe('Nested Content');
    });

    it('should handle multiple children', () => {
      const { container } = render(
        <RootLayout>
          <header>Header</header>
          <main>Main</main>
          <footer>Footer</footer>
        </RootLayout>
      );
      
      expect(container.querySelector('header')).toBeInTheDocument();
      expect(container.querySelector('main')).toBeInTheDocument();
      expect(container.querySelector('footer')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    let RootLayout: React.FC<LayoutProps>;

    beforeEach(async () => {
      const module = await loadLayoutModule();
      RootLayout = module.default;
    });

    it('should handle empty children gracefully', () => {
      // React fragments are valid children
      const { container } = render(<RootLayout>{null}</RootLayout>);
      expect(container.querySelector('body')).toBeInTheDocument();
    });

    it('should handle undefined children', () => {
      const { container } = render(<RootLayout>{undefined}</RootLayout>);
      expect(container.querySelector('body')).toBeInTheDocument();
    });

    it('should handle React fragments as children', () => {
      const { container } = render(
        <RootLayout>
          <>
            <div>Fragment Child 1</div>
            <div>Fragment Child 2</div>
          </>
        </RootLayout>
      );
      
      expect(container.textContent).toContain('Fragment Child 1');
      expect(container.textContent).toContain('Fragment Child 2');
    });

    it('should handle deeply nested component trees', () => {
      const DeepComponent: React.FC<{ depth: number }> = ({ depth }) => {
        if (depth <= 0) return <span>Deep Content</span>;
        return (
          <div>
            <DeepComponent depth={depth - 1} />
          </div>
        );
      };

      const { getByText } = render(
        <RootLayout>
          <DeepComponent depth={50} />
        </RootLayout>
      );
      
      expect(getByText('Deep Content')).toBeInTheDocument();
    });

    it('should handle special characters in children', () => {
      const specialContent = '<script>alert("xss")</script> & "quotes" \'apostrophes\'';
      const { getByText } = render(
        <RootLayout>
          <div>{specialContent}</div>
        </RootLayout>
      );
      
      // Content should be escaped properly by React
      expect(getByText(specialContent)).toBeInTheDocument();
    });

    it('should handle very long content without breaking', () => {
      const longContent = 'a'.repeat(10000);
      const { getByText } = render(
        <RootLayout>
          <div>{longContent}</div>
        </RootLayout>
      );
      
      expect(getByText(longContent)).toBeInTheDocument();
    });

    it('should handle rapid re-renders', () => {
      const { rerender, container } = render(
        <RootLayout>
          <div>Version 1</div>
        </RootLayout>
      );
      
      for (let i = 2; i <= 10; i++) {
        rerender(
          <RootLayout>
            <div>Version {i}</div>
          </RootLayout>
        );
      }
      
      expect(container.textContent).toContain('Version 10');
    });

    it('should maintain stable HTML structure across renders', () => {
      const { container, rerender } = render(
        <RootLayout>
          <div>Initial</div>
        </RootLayout>
      );
      
      const initialHtml = container.innerHTML;
      
      rerender(
        <RootLayout>
          <div>Updated</div>
        </RootLayout>
      );
      
      // Structure should remain valid HTML
      expect(container.querySelector('html')).toBeInTheDocument();
      expect(container.querySelector('body')).toBeInTheDocument();
    });

    it('should handle children with error boundaries', () => {
      // Component that throws during render
      const ErrorComponent: React.FC = () => {
        throw new Error('Test error');
      };

      // Error boundary to catch it
      class ErrorBoundary extends React.Component<
        { children: React.ReactNode },
        { hasError: boolean }
      > {
        constructor(props: { children: React.ReactNode }) {
          super(props);
          this.state = { hasError: false };
        }

        static getDerivedStateFromError() {
          return { hasError: true };
        }

        render() {
          if (this.state.hasError) {
            return <div>Error caught</div>;
          }
          return this.props.children;
        }
      }

      const { getByText } = render(
        <RootLayout>
          <ErrorBoundary>
            <ErrorComponent />
          </ErrorBoundary>
        </RootLayout>
      );
      
      expect(getByText('Error caught')).toBeInTheDocument();
    });
  });

  describe('Type Safety', () => {
    it('should have proper TypeScript exports', async () => {
      const module = await loadLayoutModule();
      
      // Verify exports exist and have correct types
      expect(typeof module.default).toBe('function');
      expect(typeof module.metadata).toBe('object');
    });

    it('should accept valid ReactNode children', async () => {
      const { default: RootLayout } = await loadLayoutModule();
      
      // These should all type-check (we verify at runtime)
      const validChildren = [
        'string',
        123,
        <div key="1">element</div>,
        null,
        undefined,
        ['array', 'of', 'items'],
      ];

      validChildren.forEach((child, index) => {
        const { container } = render(
          <RootLayout>{child}</RootLayout>
        );
        expect(container).toBeTruthy();
      });
    });
  });
});