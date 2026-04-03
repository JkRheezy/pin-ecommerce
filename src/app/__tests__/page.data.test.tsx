/**
 * @file page.data.test.tsx
 * @description Data fetching and state management tests following the six-layer architecture
 * @layer Tests (extends Runtime layer)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Types Layer - Domain types for test data
interface PipelineExecution {
  id: string;
  pipelineId: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'ABORTED';
  startTime: number;
  endTime?: number;
  stages: ExecutionStage[];
}

interface ExecutionStage {
  id: string;
  name: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'ABORTED';
  startTime: number;
  endTime?: number;
}

interface PageDataState {
  executions: PipelineExecution[];
  isLoading: boolean;
  error: Error | null;
  hasNextPage: boolean;
  totalCount: number;
}

interface FetchExecutionsParams {
  page: number;
  pageSize: number;
  pipelineId?: string;
  status?: PipelineExecution['status'];
}

// Config Layer - Test configuration
const TEST_CONFIG = {
  API_BASE_URL: '/api/v1',
  DEFAULT_PAGE_SIZE: 20,
  MAX_RETRY_ATTEMPTS: 3,
  STALE_TIME: 5 * 60 * 1000, // 5 minutes
} as const;

// Mock Service Layer
const mockFetchExecutions = vi.fn();
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

// Repo Layer - Data access abstraction
class ExecutionRepository {
  private baseUrl: string;
  private logger: typeof mockLogger;

  constructor(baseUrl: string, logger: typeof mockLogger) {
    this.baseUrl = baseUrl;
    this.logger = logger;
  }

  /**
   * Fetches pipeline executions with pagination and filtering
   * @throws {Error} When API request fails or returns invalid data
   */
  async fetchExecutions(params: FetchExecutionsParams): Promise<{
    data: PipelineExecution[];
    totalCount: number;
    hasNextPage: boolean;
  }> {
    this.logger.info('Fetching executions', { params });

    const queryParams = new URLSearchParams({
      page: String(params.page),
      pageSize: String(params.pageSize),
    });

    if (params.pipelineId) {
      queryParams.append('pipelineId', params.pipelineId);
    }
    if (params.status) {
      queryParams.append('status', params.status);
    }

    const url = `${this.baseUrl}/executions?${queryParams.toString()}`;

    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      // Validate response structure
      if (!Array.isArray(result.data)) {
        throw new Error('Invalid response format: data must be an array');
      }

      this.logger.info('Executions fetched successfully', {
        count: result.data.length,
        totalCount: result.totalCount,
      });

      return {
        data: result.data,
        totalCount: result.totalCount,
        hasNextPage: result.hasNextPage,
      };
    } catch (error) {
      this.logger.error('Failed to fetch executions', { error, params });
      throw error instanceof Error ? error : new Error('Unknown error occurred');
    }
  }
}

// Service Layer - Business logic
class ExecutionService {
  private repository: ExecutionRepository;
  private logger: typeof mockLogger;

  constructor(repository: ExecutionRepository, logger: typeof mockLogger) {
    this.repository = repository;
    this.logger = logger;
  }

  /**
   * Validates fetch parameters before making request
   */
  private validateParams(params: FetchExecutionsParams): void {
    if (params.page < 0) {
      throw new Error('Page must be non-negative');
    }
    if (params.pageSize < 1 || params.pageSize > 100) {
      throw new Error('Page size must be between 1 and 100');
    }
  }

  /**
   * Fetches executions with validation and error transformation
   */
  async getExecutions(params: FetchExecutionsParams): Promise<{
    data: PipelineExecution[];
    totalCount: number;
    hasNextPage: boolean;
  }> {
    this.validateParams(params);
    return this.repository.fetchExecutions(params);
  }

  /**
   * Calculates execution duration in milliseconds
   */
  calculateDuration(execution: PipelineExecution): number | undefined {
    if (!execution.endTime) return undefined;
    return execution.endTime - execution.startTime;
  }

  /**
   * Checks if execution can be retried
   */
  canRetry(execution: PipelineExecution): boolean {
    return execution.status === 'FAILED' || execution.status === 'ABORTED';
  }
}

// Runtime Layer - React hooks and state management
interface UseExecutionsOptions {
  pipelineId?: string;
  status?: PipelineExecution['status'];
  pageSize?: number;
}

const createWrapper = (queryClient: QueryClient) => {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
};

function useExecutions(options: UseExecutionsOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: TEST_CONFIG.STALE_TIME,
        retry: TEST_CONFIG.MAX_RETRY_ATTEMPTS,
      },
    },
  });

  const repository = new ExecutionRepository(TEST_CONFIG.API_BASE_URL, mockLogger);
  const service = new ExecutionService(repository, mockLogger);

  const {
    pipelineId,
    status,
    pageSize = TEST_CONFIG.DEFAULT_PAGE_SIZE,
  } = options;

  // Main query for fetching executions
  const query = useInfiniteQuery({
    queryKey: ['executions', { pipelineId, status }],
    queryFn: async ({ pageParam = 0 }) => {
      return service.getExecutions({
        page: pageParam,
        pageSize,
        pipelineId,
        status,
      });
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasNextPage) return undefined;
      return allPages.length;
    },
  });

  // Derived state
  const executions = query.data?.pages.flatMap(page => page.data) ?? [];
  const totalCount = query.data?.pages[0]?.totalCount ?? 0;

  // Computed properties
  const runningExecutions = executions.filter(e => e.status === 'RUNNING');
  const failedExecutions = executions.filter(e => e.status === 'FAILED');

  return {
    // Data
    executions,
    totalCount,
    hasNextPage: query.hasNextPage,
    
    // Status
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    
    // Actions
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    
    // Derived
    runningExecutions,
    failedExecutions,
    runningCount: runningExecutions.length,
    failedCount: failedExecutions.length,
  };
}

// Import required for the hook implementation
import { useInfiniteQuery } from '@tanstack/react-query';

// Test Suite
describe('Page Data - Data Fetching and State Management', () => {
  let queryClient: QueryClient;

  // Mock data factory
  const createMockExecution = (overrides: Partial<PipelineExecution> = {}): PipelineExecution => ({
    id: `exec-${Math.random().toString(36).substr(2, 9)}`,
    pipelineId: 'pipeline-123',
    status: 'SUCCESS',
    startTime: Date.now() - 3600000,
    endTime: Date.now(),
    stages: [],
    ...overrides,
  });

  const createMockResponse = (count: number, hasNextPage: boolean) => ({
    data: Array.from({ length: count }, (_, i) => 
      createMockExecution({ id: `exec-${i}` })
    ),
    totalCount: count + (hasNextPage ? 10 : 0),
    hasNextPage,
  });

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 0,
        },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('Repository Layer', () => {
    it('should fetch executions with correct query parameters', async () => {
      const mockResponse = createMockResponse(2, false);
      mockFetchExecutions.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });
      
      global.fetch = mockFetchExecutions;

      const repository = new ExecutionRepository(TEST_CONFIG.API_BASE_URL, mockLogger);
      const result = await repository.fetchExecutions({
        page: 0,
        pageSize: 20,
        pipelineId: 'pipeline-123',
        status: 'SUCCESS',
      });

      expect(mockFetchExecutions).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/executions?page=0&pageSize=20&pipelineId=pipeline-123&status=SUCCESS')
      );
      expect(result.data).toHaveLength(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Executions fetched successfully',
        expect.any(Object)
      );
    });

    it('should throw error for non-ok response', async () => {
      mockFetchExecutions.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });
      global.fetch = mockFetchExecutions;

      const repository = new ExecutionRepository(TEST_CONFIG.API_BASE_URL, mockLogger);
      
      await expect(
        repository.fetchExecutions({ page: 0, pageSize: 20 })
      ).rejects.toThrow('HTTP error! status: 500');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch executions',
        expect.any(Object)
      );
    });

    it('should throw error for invalid response format', async () => {
      mockFetchExecutions.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'format' }),
      });
      global.fetch = mockFetchExecutions;

      const repository = new ExecutionRepository(TEST_CONFIG.API_BASE_URL, mockLogger);
      
      await expect(
        repository.fetchExecutions({ page: 0, pageSize: 20 })
      ).rejects.toThrow('Invalid response format: data must be an array');
    });
  });

  describe('Service Layer', () => {
    let service: ExecutionService;
    let repository: ExecutionRepository;

    beforeEach(() => {
      repository = new ExecutionRepository(TEST_CONFIG.API_BASE_URL, mockLogger);
      service = new ExecutionService(repository, mockLogger);
    });

    it('should validate page parameter', async () => {
      await expect(
        service.getExecutions({ page: -1, pageSize: 20 })
      ).rejects.toThrow('Page must be non-negative');
    });

    it('should validate page size parameter', async () => {
      await expect(
        service.getExecutions({ page: 0, pageSize: 0 })
      ).rejects.toThrow('Page size must be between 1 and 100');

      await expect(
        service.getExecutions({ page: 0, pageSize: 101 })
      ).rejects.toThrow('Page size must be between 1 and 100');
    });

    it('should calculate execution duration correctly', () => {
      const execution = createMockExecution({
        startTime: 1000,
        endTime: 5000,
      });

      expect(service.calculateDuration(execution)).toBe(4000);
    });

    it('should return undefined for running execution duration', () => {
      const execution = createMockExecution({
        status: 'RUNNING',
        endTime: undefined,
      });

      expect(service.calculateDuration(execution)).toBeUndefined();
    });

    it('should determine retry eligibility', () => {
      expect(service.canRetry(createMockExecution({ status: 'FAILED' }))).toBe(true);
      expect(service.canRetry(createMockExecution({ status: 'ABORTED' }))).toBe(true);
      expect(service.canRetry(createMockExecution({ status: 'SUCCESS' }))).toBe(false);
      expect(service.canRetry(createMockExecution({ status: 'RUNNING' }))).toBe(false);
    });
  });

  describe('Runtime Layer - useExecutions Hook', () => {
    const setupHook = (options: UseExecutionsOptions = {}) => {
      return renderHook(() => useExecutions(options), {
        wrapper: createWrapper(queryClient),
      });
    };

    it('should initialize with loading state', async () => {
      const mockResponse = createMockResponse(0, false);
      mockFetchExecutions.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100)).then(() => ({
          ok: true,
          json: async () => mockResponse,
        }))
      );
      global.fetch = mockFetchExecutions;

      const { result } = setupHook();

      // Initial state
      expect(result.current.isLoading).toBe(true);
      expect(result.current.executions).toEqual([]);
      expect(result.current.error).toBeNull();

      // Wait for data to load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should fetch and display executions', async () => {
      const mockResponse = createMockResponse(3, false);
      mockFetchExecutions.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });
      global.fetch = mockFetchExecutions;

      const { result } = setupHook();

      await waitFor(() => {
        expect(result.current.executions).toHaveLength(3);
      });

      expect(result.current.totalCount).toBe(3);
      expect(result.current.hasNextPage).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle pagination with hasNextPage', async () => {
      const page1Response = createMockResponse(20, true);
      const page2Response = createMockResponse(10, false);
      
      mockFetchExecutions
        .mockResolvedValueOnce({
          ok: true,
          json: async () => page1Response,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => page2Response,
        });
      global.fetch = mockFetchExecutions;

      const { result } = setupHook({ pageSize: 20 });

      await waitFor(() => {
        expect(result.current.executions).toHaveLength(20);
      });

      expect(result.current.hasNextPage).toBe(true);

      // Fetch next page
      await act(async () => {
        await result.current.fetchNextPage();
      });

      await waitFor(() => {
        expect(result.current.executions).toHaveLength(30);
      });

      expect(result.current.hasNextPage).toBe(false);
    });

    it('should filter executions by status', async () => {
      const mockResponse = {
        data: [
          createMockExecution({ status: 'RUNNING' }),
          createMockExecution({ status: 'RUNNING' }),
          createMockExecution({ status: 'SUCCESS' }),
        ],
        totalCount: 3,
        hasNextPage: false,
      };

      mockFetchExecutions.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });
      global.fetch = mockFetchExecutions;

      const { result } = setupHook({ status: 'RUNNING' });

      await waitFor(() => {
        expect(result.current.executions).toHaveLength(3);
      });

      expect(result.current.runningCount).toBe(2);
      expect(result.current.failedCount).toBe(0);
    });

    it('should handle API errors gracefully', async () => {
      mockFetchExecutions.mockRejectedValueOnce(new Error('Network error'));
      global.fetch = mockFetchExecutions;

      const { result } = setupHook();

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      expect(result.current.error?.message).toBe('Network error');
      expect(result.current.isLoading).toBe(false);
    });

    it('should refetch data when called', async () => {
      const mockResponse = createMockResponse(2, false);
      mockFetchExecutions.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      global.fetch = mockFetchExecutions;

      const { result } = setupHook();

      await waitFor(() => {
        expect(result.current.executions).toHaveLength(2);
      });

      // Clear and refetch
      await act(async () => {
        await result.current.refetch();
      });

      expect(mockFetchExecutions).toHaveBeenCalledTimes(2);
    });

    it('should apply pipelineId filter in query key', async () => {
      const mockResponse = createMockResponse(1, false);
      mockFetchExecutions.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      global.fetch = mockFetchExecutions;

      const { result, rerender } = renderHook(
        ({ pipelineId }: { pipelineId: string }) => useExecutions({ pipelineId }),
        {
          wrapper: createWrapper(queryClient),
          initialProps: { pipelineId: 'pipeline-1' },
        }
      );

      await waitFor(() => {
        expect(result.current.executions).toHaveLength(1);
      });

      // Change pipelineId - should trigger new fetch
      rerender({ pipelineId: 'pipeline-2' });

      await waitFor(() => {
        expect(mockFetchExecutions).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty response', async () => {
      mockFetchExecutions.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [], totalCount: 0, hasNextPage: false }),
      });
      global.fetch = mockFetchExecutions;

      const { result } = renderHook(() => useExecutions(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.executions).toEqual([]);
      expect(result.current.totalCount).toBe(0);
      expect(result.current.hasNextPage).toBe(false);
    });

    it('should handle malformed execution data gracefully', async () => {
      const mockResponse = {
        data: [
          { id: '1', status: 'SUCCESS' }, // Missing required fields
          createMockExecution({ id: '2' }),
        ],
        totalCount: 2,
        hasNextPage: false,
      };

      mockFetchExecutions.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });
      global.fetch = mockFetchExecutions;

      const { result } = renderHook(() => useExecutions(), {
        wrapper: createWrapper(queryClient),
      });

      // Should not throw, but may have incomplete data
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.executions).toHaveLength(2);
    });

    it('should handle concurrent fetch requests', async () => {
      let resolveFirst: (value: any) => void;
      let resolveSecond: (value: any) => void;

      const firstPromise = new Promise(resolve => { resolveFirst = resolve; });
      const secondPromise = new Promise(resolve => { resolveSecond = resolve; });

      mockFetchExecutions
        .mockReturnValueOnce(firstPromise)
        .mockReturnValueOnce(secondPromise);
      global.fetch = mockFetchExecutions;

      const { result } = renderHook(() => useExecutions(), {
        wrapper: createWrapper(queryClient),
      });

      // Trigger multiple rapid requests
      act(() => {
        result.current.refetch();
      });

      // Resolve first request
      resolveFirst!({
        ok: true,
        json: async () => createMockResponse(1, false),
      });

      await waitFor(() => {
        expect(result.current.executions).toHaveLength(1);
      });
    });
  });
});