/**
 * Product Grid Section Tests
 * 
 * Tests for the product grid page component following the six-layer architecture.
 * Layer: UI (Runtime layer testing)
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import ProductsPage from '../page';
import { Product, ProductFilter } from '@/types/product';
import { AppError, ErrorCode } from '@/types/error';
import { logger } from '@/lib/logger';

// Mock dependencies
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/services/productService', () => ({
  fetchProducts: jest.fn(),
  fetchProductCategories: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

import { fetchProducts, fetchProductCategories } from '@/services/productService';
import { useSearchParams, useRouter } from 'next/navigation';

// Test fixtures following Types layer patterns
const mockProducts: Product[] = [
  {
    id: 'prod-001',
    name: 'Premium Widget',
    description: 'A high-quality widget for all your needs',
    price: 29.99,
    category: 'widgets',
    inStock: true,
    sku: 'WDG-001',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'prod-002',
    name: 'Basic Gadget',
    description: 'Simple and reliable gadget',
    price: 9.99,
    category: 'gadgets',
    inStock: false,
    sku: 'GDG-001',
    createdAt: '2024-01-10T00:00:00Z',
    updatedAt: '2024-01-10T00:00:00Z',
  },
  {
    id: 'prod-003',
    name: 'Deluxe Tool',
    description: 'Professional grade tool',
    price: 149.99,
    category: 'tools',
    inStock: true,
    sku: 'TL-001',
    createdAt: '2024-01-20T00:00:00Z',
    updatedAt: '2024-01-20T00:00:00Z',
  },
];

const mockCategories = ['widgets', 'gadgets', 'tools', 'accessories'];

// Helper to create QueryClient with test configuration
const createTestQueryClient = (): QueryClient => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
    },
  });
};

// Wrapper component for providers
const TestWrapper = ({ children }: { children: ReactNode }): JSX.Element => {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('ProductsPage', () => {
  // Setup mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    (useSearchParams as jest.Mock).mockReturnValue({
      get: jest.fn().mockReturnValue(null),
      toString: jest.fn().mockReturnValue(''),
    });
    
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
    });
    
    (fetchProducts as jest.Mock).mockResolvedValue({
      products: mockProducts,
      total: mockProducts.length,
      page: 1,
      pageSize: 20,
    });
    
    (fetchProductCategories as jest.Mock).mockResolvedValue(mockCategories);
  });

  describe('Initial Render', () => {
    it('should render loading state initially', () => {
      // Delay resolution to ensure loading state is visible
      (fetchProducts as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      expect(screen.getByTestId('product-grid-skeleton')).toBeInTheDocument();
    });

    it('should render product grid after data loads', async () => {
      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('product-grid')).toBeInTheDocument();
      });

      // Verify all products are rendered
      mockProducts.forEach(product => {
        expect(screen.getByText(product.name)).toBeInTheDocument();
      });
    });

    it('should render category filters', async () => {
      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('category-filters')).toBeInTheDocument();
      });

      // Verify categories are rendered
      mockCategories.forEach(category => {
        expect(screen.getByLabelText(category)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should render error state when product fetch fails', async () => {
      const appError = new AppError(
        'Failed to load products',
        ErrorCode.SERVICE_UNAVAILABLE,
        503
      );
      
      (fetchProducts as jest.Mock).mockRejectedValue(appError);

      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
      });

      expect(screen.getByText('Failed to load products')).toBeInTheDocument();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch products',
        expect.objectContaining({
          error: appError,
          context: 'ProductsPage',
        })
      );
    });

    it('should render error state when categories fetch fails', async () => {
      const appError = new AppError(
        'Failed to load categories',
        ErrorCode.NETWORK_ERROR,
        500
      );
      
      (fetchProductCategories as jest.Mock).mockRejectedValue(appError);
      // Products should still load
      (fetchProducts as jest.Mock).mockResolvedValue({
        products: mockProducts,
        total: mockProducts.length,
        page: 1,
        pageSize: 20,
      });

      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('product-grid')).toBeInTheDocument();
      });

      // Categories error should be logged but not block product display
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch categories',
        expect.objectContaining({
          error: appError,
          context: 'ProductsPage',
        })
      );
    });

    it('should allow retry after error', async () => {
      const appError = new AppError(
        'Network error',
        ErrorCode.NETWORK_ERROR,
        503
      );
      
      (fetchProducts as jest.Mock)
        .mockRejectedValueOnce(appError)
        .mockResolvedValueOnce({
          products: mockProducts,
          total: mockProducts.length,
          page: 1,
          pageSize: 20,
        });

      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByTestId('product-grid')).toBeInTheDocument();
      });

      expect(fetchProducts).toHaveBeenCalledTimes(2);
    });
  });

  describe('Filtering', () => {
    it('should filter products by category', async () => {
      const routerPush = jest.fn();
      (useRouter as jest.Mock).mockReturnValue({
        push: routerPush,
        replace: jest.fn(),
      });

      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('category-filters')).toBeInTheDocument();
      });

      const widgetsCheckbox = screen.getByLabelText('widgets');
      fireEvent.click(widgetsCheckbox);

      // Verify URL update
      await waitFor(() => {
        expect(routerPush).toHaveBeenCalledWith(
          expect.stringContaining('category=widgets')
        );
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Category filter applied',
        expect.objectContaining({
          category: 'widgets',
          context: 'ProductsPage',
        })
      );
    });

    it('should filter products by in-stock status', async () => {
      const routerPush = jest.fn();
      (useRouter as jest.Mock).mockReturnValue({
        push: routerPush,
        replace: jest.fn(),
      });

      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('stock-filter')).toBeInTheDocument();
      });

      const inStockCheckbox = screen.getByLabelText(/in stock only/i);
      fireEvent.click(inStockCheckbox);

      await waitFor(() => {
        expect(routerPush).toHaveBeenCalledWith(
          expect.stringContaining('inStock=true')
        );
      });
    });

    it('should apply multiple filters simultaneously', async () => {
      const routerPush = jest.fn();
      (useRouter as jest.Mock).mockReturnValue({
        push: routerPush,
        replace: jest.fn(),
      });

      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('category-filters')).toBeInTheDocument();
      });

      // Apply category filter
      fireEvent.click(screen.getByLabelText('widgets'));
      
      // Apply price range filter
      const minPriceInput = screen.getByPlaceholderText(/min price/i);
      fireEvent.change(minPriceInput, { target: { value: '10' } });

      await waitFor(() => {
        const calls = routerPush.mock.calls;
        const lastCall = calls[calls.length - 1][0];
        expect(lastCall).toContain('category=widgets');
        expect(lastCall).toContain('minPrice=10');
      });
    });
  });

  describe('Search Functionality', () => {
    it('should search products by name', async () => {
      const routerPush = jest.fn();
      (useRouter as jest.Mock).mockReturnValue({
        push: routerPush,
        replace: jest.fn(),
      });

      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('search-input')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search products/i);
      fireEvent.change(searchInput, { target: { value: 'widget' } });

      // Debounced search
      await waitFor(() => {
        expect(routerPush).toHaveBeenCalledWith(
          expect.stringContaining('search=widget')
        );
      }, { timeout: 500 });

      expect(logger.debug).toHaveBeenCalledWith(
        'Search query updated',
        expect.objectContaining({
          query: 'widget',
          context: 'ProductsPage',
        })
      );
    });

    it('should clear search when clear button clicked', async () => {
      (useSearchParams as jest.Mock).mockReturnValue({
        get: jest.fn((key: string) => key === 'search' ? 'widget' : null),
        toString: jest.fn().mockReturnValue('search=widget'),
      });

      const routerPush = jest.fn();
      (useRouter as jest.Mock).mockReturnValue({
        push: routerPush,
        replace: jest.fn(),
      });

      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('search-input')).toBeInTheDocument();
      });

      const clearButton = screen.getByRole('button', { name: /clear search/i });
      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(routerPush).toHaveBeenCalledWith(
          expect.not.stringContaining('search=')
        );
      });
    });
  });

  describe('Pagination', () => {
    it('should render pagination when products exceed page size', async () => {
      const manyProducts = Array.from({ length: 50 }, (_, i) => ({
        ...mockProducts[0],
        id: `prod-${String(i + 1).padStart(3, '0')}`,
        name: `Product ${i + 1}`,
      }));

      (fetchProducts as jest.Mock).mockResolvedValue({
        products: manyProducts.slice(0, 20),
        total: manyProducts.length,
        page: 1,
        pageSize: 20,
      });

      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('pagination')).toBeInTheDocument();
      });

      expect(screen.getByText(/showing 1-20 of 50/i)).toBeInTheDocument();
    });

    it('should navigate to next page', async () => {
      const routerPush = jest.fn();
      (useRouter as jest.Mock).mockReturnValue({
        push: routerPush,
        replace: jest.fn(),
      });

      (fetchProducts as jest.Mock).mockResolvedValue({
        products: mockProducts,
        total: 50,
        page: 1,
        pageSize: 20,
      });

      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('pagination')).toBeInTheDocument();
      });

      const nextButton = screen.getByRole('button', { name: /next page/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(routerPush).toHaveBeenCalledWith(
          expect.stringContaining('page=2')
        );
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Page navigation',
        expect.objectContaining({
          fromPage: 1,
          toPage: 2,
          context: 'ProductsPage',
        })
      );
    });
  });

  describe('Sorting', () => {
    it('should sort products by price ascending', async () => {
      const routerPush = jest.fn();
      (useRouter as jest.Mock).mockReturnValue({
        push: routerPush,
        replace: jest.fn(),
      });

      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('sort-select')).toBeInTheDocument();
      });

      const sortSelect = screen.getByLabelText(/sort by/i);
      fireEvent.change(sortSelect, { target: { value: 'price:asc' } });

      await waitFor(() => {
        expect(routerPush).toHaveBeenCalledWith(
          expect.stringContaining('sort=price:asc')
        );
      });
    });

    it('should sort products by name descending', async () => {
      const routerPush = jest.fn();
      (useRouter as jest.Mock).mockReturnValue({
        push: routerPush,
        replace: jest.fn(),
      });

      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('sort-select')).toBeInTheDocument();
      });

      const sortSelect = screen.getByLabelText(/sort by/i);
      fireEvent.change(sortSelect, { target: { value: 'name:desc' } });

      await waitFor(() => {
        expect(routerPush).toHaveBeenCalledWith(
          expect.stringContaining('sort=name:desc')
        );
      });
    });
  });

  describe('Empty States', () => {
    it('should render empty state when no products match filters', async () => {
      (fetchProducts as jest.Mock).mockResolvedValue({
        products: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });

      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      });

      expect(screen.getByText(/no products found/i)).toBeInTheDocument();
    });

    it('should render empty state for initial no products', async () => {
      (fetchProducts as jest.Mock).mockResolvedValue({
        products: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });

      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      });

      expect(screen.getByText(/no products available/i)).toBeInTheDocument();
      expect(logger.info).toHaveBeenCalledWith(
        'No products found',
        expect.objectContaining({
          context: 'ProductsPage',
        })
      );
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels on filter controls', async () => {
      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('product-grid')).toBeInTheDocument();
      });

      // Verify ARIA attributes
      expect(screen.getByRole('main')).toHaveAttribute('aria-label', 'Products');
      expect(screen.getByTestId('category-filters')).toHaveAttribute(
        'aria-label',
        'Filter by category'
      );
    });

    it('should support keyboard navigation for filters', async () => {
      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('category-filters')).toBeInTheDocument();
      });

      const firstCheckbox = screen.getAllByRole('checkbox')[0];
      firstCheckbox.focus();

      // Tab navigation
      fireEvent.keyDown(firstCheckbox, { key: 'Tab' });
      expect(document.activeElement).not.toBe(firstCheckbox);
    });
  });

  describe('Performance', () => {
    it('should debounce search input', async () => {
      jest.useFakeTimers();
      const routerPush = jest.fn();
      (useRouter as jest.Mock).mockReturnValue({
        push: routerPush,
        replace: jest.fn(),
      });

      render(
        <TestWrapper>
          <ProductsPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('search-input')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search products/i);
      
      // Rapid typing
      fireEvent.change(searchInput, { target: { value: 'w' } });
      fireEvent.change(searchInput, { target: { value: 'wi' } });
      fireEvent.change(searchInput, { target: { value: 'wid' } });
      fireEvent.change(searchInput, { target: { value: 'widg' } });

      // Should not have called router yet
      expect(routerPush).not.toHaveBeenCalled();

      // Fast-forward past debounce
      jest.advanceTimersByTime(400);

      // Should only have one call with final value
      await waitFor(() => {
        expect(routerPush).toHaveBeenCalledTimes(1);
        expect(routerPush).toHaveBeenCalledWith(
          expect.stringContaining('search=widg')
        );
      });

      jest.useRealTimers();
    });
  });
});