/**
 * layout.test.tsx
 * Layer: Runtime (Tests)
 * Tests for the RootLayout component and metadata configuration
 */

import { render } from '@testing-library/react';
import { ReactNode } from 'react';
import RootLayout, { metadata } from './layout';

// Mock the Inter font from next/font/google
jest.mock('next/font/google', () => ({
  Inter: jest.fn(() => ({
    className: 'mock-inter-class',
    subsets: ['latin'],
  })),
}));

// Mock the Toaster component from sonner
jest.mock('sonner', () => ({
  Toaster: jest.fn(() => <div data-testid="mock-toaster">Toaster</div>),
}));

describe('Layout - Metadata', () => {
  it('should have correct title metadata', () => {
    expect(metadata.title).toBe('Harness Engineering');
  });

  it('should have correct description metadata', () => {
    expect(metadata.description).toBe('Internal engineering platform for Harness');
  });

  it('should have metadata object defined', () => {
    expect(metadata).toBeDefined();
    expect(typeof metadata).toBe('object');
  });
});

describe('Layout - RootLayout Component', () => {
  const mockChildren: ReactNode = <div data-testid="mock-children">Test Children</div>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <RootLayout>{mockChildren}</RootLayout>
    );
    
    expect(container).toBeTruthy();
  });

  it('should render children content', () => {
    const { getByTestId } = render(
      <RootLayout>{mockChildren}</RootLayout>
    );
    
    expect(getByTestId('mock-children')).toBeInTheDocument();
    expect(getByTestId('mock-children').textContent).toBe('Test Children');
  });

  it('should render Toaster component', () => {
    const { getByTestId } = render(
      <RootLayout>{mockChildren}</RootLayout>
    );
    
    expect(getByTestId('mock-toaster')).toBeInTheDocument();
  });

  it('should apply Inter font class to body element', () => {
    const { container } = render(
      <RootLayout>{mockChildren}</RootLayout>
    );
    
    const bodyElement = container.querySelector('body');
    expect(bodyElement).toHaveClass('mock-inter-class');
  });

  it('should render html element with lang attribute', () => {
    const { container } = render(
      <RootLayout>{mockChildren}</RootLayout>
    );
    
    const htmlElement = container.querySelector('html');
    expect(htmlElement).toHaveAttribute('lang', 'en');
  });

  it('should suppress hydration warning on html element', () => {
    const { container } = render(
      <RootLayout>{mockChildren}</RootLayout>
    );
    
    const htmlElement = container.querySelector('html');
    expect(htmlElement).toHaveAttribute('suppressHydrationWarning');
  });
});

describe('Layout - Edge Cases', () => {
  it('should handle empty children', () => {
    const { container } = render(<RootLayout>{null}</RootLayout>);
    
    expect(container.querySelector('body')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="mock-toaster"]')).toBeInTheDocument();
  });

  it('should handle multiple children', () => {
    const multipleChildren = (
      <>
        <div data-testid="child-1">First Child</div>
        <div data-testid="child-2">Second Child</div>
        <div data-testid="child-3">Third Child</div>
      </>
    );

    const { getByTestId } = render(<RootLayout>{multipleChildren}</RootLayout>);
    
    expect(getByTestId('child-1')).toBeInTheDocument();
    expect(getByTestId('child-2')).toBeInTheDocument();
    expect(getByTestId('child-3')).toBeInTheDocument();
  });

  it('should handle nested children components', () => {
    const NestedComponent = () => (
      <div data-testid="nested-parent">
        <span data-testid="nested-child">Nested Content</span>
      </div>
    );

    const { getByTestId } = render(
      <RootLayout>
        <NestedComponent />
      </RootLayout>
    );
    
    expect(getByTestId('nested-parent')).toBeInTheDocument();
    expect(getByTestId('nested-child')).toBeInTheDocument();
  });

  it('should preserve children order', () => {
    const orderedChildren = (
      <>
        <div data-testid="first">First</div>
        <div data-testid="second">Second</div>
      </>
    );

    const { container } = render(<RootLayout>{orderedChildren}</RootLayout>);
    
    const body = container.querySelector('body');
    const children = body?.children;
    
    // Filter out the Toaster mock
    const contentChildren = Array.from(children || []).filter(
      (child) => child.getAttribute('data-testid') !== 'mock-toaster'
    );
    
    expect(contentChildren[0]).toHaveAttribute('data-testid', 'first');
    expect(contentChildren[1]).toHaveAttribute('data-testid', 'second');
  });

  it('should handle React fragments as children', () => {
    const fragmentChildren = (
      <>
        <span>Fragment Item 1</span>
        <span>Fragment Item 2</span>
      </>
    );

    const { container } = render(<RootLayout>{fragmentChildren}</RootLayout>);
    
    const spans = container.querySelectorAll('span');
    expect(spans).toHaveLength(2);
  });

  it('should handle string children', () => {
    const { getByText } = render(<RootLayout>Plain Text Content</RootLayout>);
    
    expect(getByText('Plain Text Content')).toBeInTheDocument();
  });

  it('should handle number children', () => {
    const { getByText } = render(<RootLayout>{42}</RootLayout>);
    
    expect(getByText('42')).toBeInTheDocument();
  });

  it('should handle boolean children (renders nothing)', () => {
    const { container } = render(<RootLayout>{true}{false}</RootLayout>);
    
    // Boolean children should not render anything visible
    expect(container.querySelector('body')).toBeInTheDocument();
  });
});