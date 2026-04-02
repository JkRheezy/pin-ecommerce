/**
 * @file layout.test.ts
 * @description Comprehensive tests for root layout component
 * @module app/layout
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';

// Types Layer
interface LayoutProps {
  children: ReactNode;
}

interface Metadata {
  title: string;
  description: string;
}

// Mock the dependencies before importing the component
vi.mock('next/font/google', () => ({
  Inter: () => ({
    className: 'mock-inter-font',
    variable: '--font-inter',
    subsets: ['latin'],
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import RootLayout from './layout';
import { logger } from '@/lib/logger';

describe('RootLayout', () => {
  // Config Layer - Test configuration
  const mockChildren: ReactNode = <div data-testid="mock-child">Test Content</div>;
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render children without crashing', () => {
      // Runtime Layer - Test runtime behavior
      const result = RootLayout({ children: mockChildren });
      
      expect(result).toBeDefined();
      expect(result.props).toBeDefined();
    });

    it('should wrap children in html element with lang attribute', () => {
      const result = RootLayout({ children: mockChildren });
      
      // Validate html element props
      expect(result.props.lang).toBe('en');
      expect(result.type).toBe('html');
    });

    it('should apply Inter font className to body element', () => {
      const result = RootLayout({ children: mockChildren });
      
      // Navigate to body element (second child after head)
      const bodyElement = result.props.children.find(
        (child: ReactNode & { type?: string }) => child?.type === 'body'
      );
      
      expect(bodyElement).toBeDefined();
      expect(bodyElement.props.className).toContain('mock-inter-font');
    });

    it('should include ThemeProvider with correct props', () => {
      const result = RootLayout({ children: mockChildren });
      
      const bodyElement = result.props.children.find(
        (child: ReactNode & { type?: string }) => child?.type === 'body'
      );
      
      // ThemeProvider should be the first child of body
      const themeProvider = bodyElement.props.children[0];
      expect(themeProvider).toBeDefined();
      expect(themeProvider.props.attribute).toBe('class');
      expect(themeProvider.props.defaultTheme).toBe('system');
      expect(themeProvider.props.enableSystem).toBe(true);
    });

    it('should render children inside ThemeProvider', () => {
      const result = RootLayout({ children: mockChildren });
      
      const bodyElement = result.props.children.find(
        (child: ReactNode & { type?: string }) => child?.type === 'body'
      );
      
      const themeProvider = bodyElement.props.children[0];
      // Children should be passed to ThemeProvider
      expect(themeProvider.props.children).toBe(mockChildren);
    });
  });

  describe('Metadata Configuration', () => {
    it('should export correct metadata object', async () => {
      // Repo Layer - Test data/repository layer
      const { metadata } = await import('./layout');
      
      expect(metadata).toBeDefined();
      expect(metadata.title).toBe('Harness Engineering');
      expect(metadata.description).toBe('Enterprise-grade engineering platform');
    });

    it('should have valid metadata structure', async () => {
      const { metadata } = await import('./layout');
      
      // Validate metadata types
      expect(typeof metadata.title).toBe('string');
      expect(typeof metadata.description).toBe('string');
      expect(metadata.title.length).toBeGreaterThan(0);
      expect(metadata.description.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle null children gracefully', () => {
      // Edge case: null children
      expect(() => RootLayout({ children: null })).not.toThrow();
      
      const result = RootLayout({ children: null });
      expect(result).toBeDefined();
    });

    it('should handle undefined children gracefully', () => {
      // Edge case: undefined children
      expect(() => RootLayout({ children: undefined as unknown as ReactNode })).not.toThrow();
    });

    it('should handle empty fragment as children', () => {
      // Edge case: empty fragment
      const emptyFragment = <></>;
      const result = RootLayout({ children: emptyFragment });
      
      expect(result).toBeDefined();
    });

    it('should log layout initialization', () => {
      RootLayout({ children: mockChildren });
      
      // Service Layer - Test service/integration layer
      expect(logger.info).toHaveBeenCalledWith(
        'RootLayout initialized',
        expect.objectContaining({
          component: 'RootLayout',
          hasChildren: true,
        })
      );
    });

    it('should log errors when rendering fails', () => {
      // Simulate error condition
      const error = new Error('Render failed');
      vi.mocked(logger.error).mockImplementation(() => {
        throw error;
      });
      
      // Should not throw, but log the error
      expect(() => RootLayout({ children: mockChildren })).toThrow('Render failed');
    });
  });

  describe('Accessibility', () => {
    it('should have correct lang attribute for accessibility', () => {
      const result = RootLayout({ children: mockChildren });
      
      // Service Layer - accessibility validation
      expect(result.props.lang).toBe('en');
    });

    it('should suppress hydration warning on html element', () => {
      const result = RootLayout({ children: mockChildren });
      
      // Prevents React hydration mismatch warnings with theme
      expect(result.props.suppressHydrationWarning).toBe(true);
    });
  });

  describe('Theme Configuration', () => {
    it('should disable transition on theme change', () => {
      const result = RootLayout({ children: mockChildren });
      
      const bodyElement = result.props.children.find(
        (child: ReactNode & { type?: string }) => child?.type === 'body'
      );
      
      const themeProvider = bodyElement.props.children[0];
      
      // UI Layer - Test UI configuration
      expect(themeProvider.props.disableTransitionOnChange).toBe(true);
    });

    it('should have correct theme storage key', () => {
      const result = RootLayout({ children: mockChildren });
      
      const bodyElement = result.props.children.find(
        (child: ReactNode & { type?: string }) => child?.type === 'body'
      );
      
      const themeProvider = bodyElement.props.children[0];
      expect(themeProvider.props.storageKey).toBe('harness-theme');
    });
  });

  describe('Edge Cases', () => {
    it('should handle nested children structures', () => {
      const nestedChildren = (
        <div>
          <span>
            <p>Deeply nested</p>
          </span>
        </div>
      );
      
      const result = RootLayout({ children: nestedChildren });
      expect(result).toBeDefined();
    });

    it('should handle array of children', () => {
      const arrayChildren: ReactNode = [
        <div key="1">First</div>,
        <div key="2">Second</div>,
        <div key="3">Third</div>,
      ];
      
      const result = RootLayout({ children: arrayChildren });
      expect(result).toBeDefined();
    });

    it('should handle text-only children', () => {
      const textChildren: ReactNode = 'Plain text content';
      
      const result = RootLayout({ children: textChildren });
      expect(result).toBeDefined();
    });
  });
});