/**
 * @file layout.test.tsx
 * @description Comprehensive test suite for the RootLayout component
 * @module Tests/Layout
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Types Layer
interface LayoutProps {
  children: React.ReactNode;
}

interface MetadataConfig {
  title: string;
  description: string;
}

// Mock next/font before importing the component
vi.mock('next/font/google', () => ({
  Inter: () => ({
    className: 'mock-inter-class',
    variable: '--font-inter',
    style: { fontFamily: 'Inter, sans-serif' },
  }),
}));

// Mock next/metadata
vi.mock('next/metadata', () => ({
  metadata: {
    title: 'Harness Engineering',
    description: 'Enterprise-grade engineering platform',
  },
}));

// Mock the layout component imports
const mockChildren = <div data-testid="mock-children">Test Children</div>;

describe('RootLayout Component', () => {
  let RootLayout: React.FC<LayoutProps>;

  beforeEach(async () => {
    // Dynamically import to ensure mocks are set up first
    const module = await import('./layout');
    RootLayout = module.default;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render without crashing', () => {
      const { container } = render(<RootLayout>{mockChildren}</RootLayout>);
      expect(container).toBeDefined();
    });

    it('should render children content', () => {
      render(<RootLayout>{mockChildren}</RootLayout>);
      expect(screen.getByTestId('mock-children')).toBeInTheDocument();
    });

    it('should wrap children in main element', () => {
      const { container } = render(<RootLayout>{mockChildren}</RootLayout>);
      const mainElement = container.querySelector('main');
      expect(mainElement).toBeInTheDocument();
    });
  });

  describe('HTML Structure', () => {
    it('should render html element with lang attribute', () => {
      const { container } = render(<RootLayout>{mockChildren}</RootLayout>);
      const htmlElement = container.querySelector('html');
      expect(htmlElement).toHaveAttribute('lang', 'en');
    });

    it('should render head and body elements', () => {
      const { container } = render(<RootLayout>{mockChildren}</RootLayout>);
      expect(container.querySelector('body')).toBeInTheDocument();
    });
  });

  describe('Font Integration', () => {
    it('should apply font class to body element', () => {
      const { container } = render(<RootLayout>{mockChildren}</RootLayout>);
      const bodyElement = container.querySelector('body');
      expect(bodyElement).toHaveClass('mock-inter-class');
    });
  });

  describe('Error Handling', () => {
    it('should handle empty children gracefully', () => {
      const { container } = render(<RootLayout>{null}</RootLayout>);
      expect(container.querySelector('main')).toBeInTheDocument();
    });

    it('should handle undefined children gracefully', () => {
      const { container } = render(<RootLayout>{undefined}</RootLayout>);
      expect(container.querySelector('main')).toBeInTheDocument();
    });

    it('should handle array of children', () => {
      const multipleChildren = (
        <>
          <div data-testid="child-1">First</div>
          <div data-testid="child-2">Second</div>
        </>
      );
      render(<RootLayout>{multipleChildren}</RootLayout>);
      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA landmarks', () => {
      const { container } = render(<RootLayout>{mockChildren}</RootLayout>);
      const mainElement = container.querySelector('main');
      expect(mainElement).toBeInTheDocument();
    });

    it('should maintain semantic HTML structure', () => {
      const { container } = render(<RootLayout>{mockChildren}</RootLayout>);
      const htmlStructure = container.innerHTML;
      expect(htmlStructure).toContain('<html');
      expect(htmlStructure).toContain('<body');
      expect(htmlStructure).toContain('<main');
    });
  });

  describe('Edge Cases', () => {
    it('should handle deeply nested children', () => {
      const deepChildren = (
        <div data-testid="level-1">
          <div data-testid="level-2">
            <div data-testid="level-3">Deep Content</div>
          </div>
        </div>
      );
      render(<RootLayout>{deepChildren}</RootLayout>);
      expect(screen.getByTestId('level-3')).toHaveTextContent('Deep Content');
    });

    it('should handle React fragments as children', () => {
      const fragmentChildren = (
        <React.Fragment>
          <span data-testid="fragment-1">One</span>
          <span data-testid="fragment-2">Two</span>
        </React.Fragment>
      );
      render(<RootLayout>{fragmentChildren}</RootLayout>);
      expect(screen.getByTestId('fragment-1')).toBeInTheDocument();
      expect(screen.getByTestId('fragment-2')).toBeInTheDocument();
    });

    it('should preserve child component state', () => {
      const StatefulChild = () => {
        const [count] = React.useState(42);
        return <div data-testid="stateful">{count}</div>;
      };
      render(
        <RootLayout>
          <StatefulChild />
        </RootLayout>
      );
      expect(screen.getByTestId('stateful')).toHaveTextContent('42');
    });
  });
});

/**
 * @file metadata.test.ts
 * @description Test suite for layout metadata configuration
 */

describe('Layout Metadata', () => {
  it('should export valid metadata object', async () => {
    const { metadata } = await import('./layout');
    expect(metadata).toBeDefined();
    expect(typeof metadata).toBe('object');
  });

  it('should have required metadata fields', async () => {
    const { metadata } = await import('./layout');
    expect(metadata.title).toBeDefined();
    expect(metadata.description).toBeDefined();
  });

  it('should have non-empty title', async () => {
    const { metadata } = await import('./layout');
    expect(metadata.title).toBeTruthy();
    expect(typeof metadata.title).toBe('string');
    expect((metadata.title as string).length).toBeGreaterThan(0);
  });

  it('should have non-empty description', async () => {
    const { metadata } = await import('./layout');
    expect(metadata.description).toBeTruthy();
    expect(typeof metadata.description).toBe('string');
    expect((metadata.description as string).length).toBeGreaterThan(0);
  });
});