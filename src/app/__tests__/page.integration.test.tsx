/**
 * @file page.integration.test.tsx
 * @description Integration tests for the main page component following six-layer architecture
 * @layer UI (Layer 6) - Integration tests validate cross-layer interactions
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Layer 1: Types - Import domain types for test assertions
import type { 
  Pipeline, 
  PipelineExecution, 
  ExecutionStatus,
  PaginationResponse 
} from '@/types/domain.types';

// Layer 2: Config - Import configuration for test setup
import { APP_CONFIG } from '@/config/app.config';
import { QUERY_KEYS } from '@/config/query-keys.config';

// Layer 3: Repo - Mock repository layer for controlled test environment
import * as pipelineRepo from '@/repo/pipeline.repo';
import * as executionRepo from '@/repo/execution.repo';

// Layer 4: Service - Mock service layer for business logic
import * as pipelineService from '@/service/pipeline.service';
import * as executionService from '@/service/execution.service';

// Layer 5: Runtime - Import runtime utilities
import { logger } from '@/runtime/logger.runtime';
import { metrics } from '@/runtime/metrics.runtime';

// Layer 6: UI - Component under test
import MainPage from '@/app/page';

// ============================================================================
// Test Setup & Utilities
// ============================================================================

/**
 * Creates a fresh QueryClient for each test to prevent cache pollution
 */
const createTestQueryClient = (): QueryClient => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Disable retries for faster test failures
        staleTime: 0, // Always fetch fresh data
        gcTime: 0, // Immediate garbage collection
      },
      mutations: {
        retry: false,
      },
    },
    logger: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  });
};

/**
 * Factory function for creating mock pipeline data
 */
const createMockPipeline = (overrides?: Partial<Pipeline>): Pipeline => ({
  id: `pipeline-${Math.random().toString(36).substr(2, 9)}`,
  name: 'Test Pipeline',
  description: 'A test pipeline for integration testing',
  projectId: 'test-project',
  orgId: 'test-org',
  tags: ['test', 'integration'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: 'test-user',
  lastUpdatedBy: 'test-user',
  yaml: 'pipeline:\n  name: Test Pipeline\n',
  ...overrides,
});

/**
 * Factory function for creating mock execution data
 */
const createMockExecution = (overrides?: Partial<PipelineExecution>): PipelineExecution => ({
  id: `exec-${Math.random().toString(36).substr(2, 9)}`,
  pipelineId: 'pipeline-123',
  projectId: 'test-project',
  orgId: 'test-org',
  status: 'RUNNING' as ExecutionStatus,
  startTime: new Date().toISOString(),
  endTime: undefined,
  triggerType: 'MANUAL',
  triggeredBy: 'test-user',
  planExecutionId: `plan-${Math.random().toString(36).substr(2, 9)}`,
  stages: [],
  ...overrides,
});

/**
 * Wrapper component providing all necessary context providers
 */
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = createTestQueryClient();
  
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        {children}
      </MemoryRouter>
      {/* Devtools disabled in test environment */}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
};

// ============================================================================
// Mock Setup
// ============================================================================

// Mock repository layer
vi.mock('@/repo/pipeline.repo', () => ({
  fetchPipelines: vi.fn(),
  fetchPipelineById: vi.fn(),
  createPipeline: vi.fn(),
  updatePipeline: vi.fn(),
  deletePipeline: vi.fn(),
}));

vi.mock('@/repo/execution.repo', () => ({
  fetchExecutions: vi.fn(),
  fetchExecutionById: vi.fn(),
  triggerExecution: vi.fn(),
  cancelExecution: vi.fn(),
}));

// Mock service layer
vi.mock('@/service/pipeline.service', () => ({
  validatePipelineYaml: vi.fn(),
  enrichPipelineData: vi.fn(),
  calculatePipelineHealth: vi.fn(),
}));

vi.mock('@/service/execution.service', () => ({
  pollExecutionStatus: vi.fn(),
  aggregateExecutionMetrics: vi.fn(),
  formatExecutionDuration: vi.fn(),
}));

// Mock runtime utilities
vi.mock('@/runtime/logger.runtime', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/runtime/metrics.runtime', () => ({
  metrics: {
    record: vi.fn(),
    increment: vi.fn(),
    timing: vi.fn(),
  },
}));

// ============================================================================
// Integration Test Suite
// ============================================================================

describe('MainPage Integration Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
    vi.resetAllMocks();
  });

  // --------------------------------------------------------------------------
  // Initial Load & Rendering
  // --------------------------------------------------------------------------

  describe('Initial Load', () => {
    it('should render loading state while fetching initial data', async () => {
      // Arrange: Delay repository response to observe loading state
      vi.mocked(pipelineRepo.fetchPipelines).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      // Act
      render(
        <TestWrapper>
          <MainPage />
        </TestWrapper>
      );

      // Assert: Verify loading indicator is present
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByText(/loading pipelines/i)).toBeInTheDocument();
    });

    it('should render main page with all sections after successful data load', async () => {
      // Arrange: Setup successful data fetch
      const mockPipelines: PaginationResponse<Pipeline> = {
        data: [createMockPipeline(), createMockPipeline({ name: 'Second Pipeline' })],
        pagination: {
          page: 1,
          pageSize: 10,
          totalItems: 2,
          totalPages: 1,
        },
      };

      const mockExecutions: PaginationResponse<PipelineExecution> = {
        data: [createMockExecution(), createMockExecution({ status: 'SUCCESS' })],
        pagination: {
          page: 1,
          pageSize: 10,
          totalItems: 2,
          totalPages: 1,
        },
      };

      vi.mocked(pipelineRepo.fetchPipelines).mockResolvedValue(mockPipelines);
      vi.mocked(executionRepo.fetchExecutions).mockResolvedValue(mockExecutions);

      // Act
      render(
        <TestWrapper>
          <MainPage />
        </TestWrapper>
      );

      // Assert: Wait for data to load and verify all sections
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /pipelines/i })).toBeInTheDocument();
      });

      expect(screen.getByText('Test Pipeline')).toBeInTheDocument();
      expect(screen.getByText('Second Pipeline')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /recent executions/i })).toBeInTheDocument();
      
      // Verify structured logging was called
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('MainPage mounted'),
        expect.any(Object)
      );
    });

    it('should handle empty state when no pipelines exist', async () => {
      // Arrange: Empty data response
      const emptyResponse: PaginationResponse<Pipeline> = {
        data: [],
        pagination: {
          page: 1,
          pageSize: 10,
          totalItems: 0,
          totalPages: 0,
        },
      };

      vi.mocked(pipelineRepo.fetchPipelines).mockResolvedValue(emptyResponse);
      vi.mocked(executionRepo.fetchExecutions).mockResolvedValue({
        data: [],
        pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
      });

      // Act
      render(
        <TestWrapper>
          <MainPage />
        </TestWrapper>
      );

      // Assert: Verify empty state UI
      await waitFor(() => {
        expect(screen.getByText(/no pipelines found/i)).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /create pipeline/i })).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should display error boundary fallback on critical error', async () => {
      // Arrange: Force a repository error
      const error = new Error('Failed to fetch pipelines');
      vi.mocked(pipelineRepo.fetchPipelines).mockRejectedValue(error);

      // Act
      render(
        <TestWrapper>
          <MainPage />
        </TestWrapper>
      );

      // Assert: Verify error state is displayed
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText(/failed to load pipelines/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      
      // Verify error logging
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch pipelines'),
        expect.objectContaining({ error: expect.any(Error) })
      );
    });

    it('should recover from error when retry button is clicked', async () => {
      // Arrange: First call fails, second succeeds
      const mockPipeline = createMockPipeline();
      vi.mocked(pipelineRepo.fetchPipelines)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: [mockPipeline],
          pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
        });

      const user = userEvent.setup();

      // Act: Render and trigger error
      render(
        <TestWrapper>
          <MainPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });

      // Click retry
      await user.click(screen.getByRole('button', { name: /retry/i }));

      // Assert: Data loads successfully after retry
      await waitFor(() => {
        expect(screen.getByText(mockPipeline.name)).toBeInTheDocument();
      });

      // Verify metrics tracking
      expect(metrics.increment).toHaveBeenCalledWith('page.retry.success');
    });

    it('should handle partial data failure gracefully', async () => {
      // Arrange: Pipelines succeed but executions fail
      const mockPipeline = createMockPipeline();
      vi.mocked(pipelineRepo.fetchPipelines).mockResolvedValue({
        data: [mockPipeline],
        pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
      });
      vi.mocked(executionRepo.fetchExecutions).mockRejectedValue(
        new Error('Executions service unavailable')
      );

      // Act
      render(
        <TestWrapper>
          <MainPage />
        </TestWrapper>
      );

      // Assert: Pipelines display despite executions failure
      await waitFor(() => {
        expect(screen.getByText(mockPipeline.name)).toBeInTheDocument();
      });

      // Executions section shows error state
      expect(screen.getByText(/unable to load executions/i)).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // User Interactions
  // --------------------------------------------------------------------------

  describe('User Interactions', () => {
    it('should navigate to pipeline detail when pipeline card is clicked', async () => {
      // Arrange
      const mockPipeline = createMockPipeline({ id: 'pipeline-detail-123' });
      vi.mocked(pipelineRepo.fetchPipelines).mockResolvedValue({
        data: [mockPipeline],
        pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
      });
      vi.mocked(executionRepo.fetchExecutions).mockResolvedValue({
        data: [],
        pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
      });

      const user = userEvent.setup();

      // Act
      render(
        <TestWrapper>
          <MainPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(mockPipeline.name)).toBeInTheDocument();
      });

      const pipelineCard = screen.getByTestId(`pipeline-card-${mockPipeline.id}`);
      await user.click(pipelineCard);

      // Assert: Navigation triggered (in real app, would verify URL change)
      expect(metrics.record).toHaveBeenCalledWith('pipeline.view', {
        pipelineId: mockPipeline.id,
      });
    });

    it('should open create pipeline modal when create button is clicked', async () => {
      // Arrange
      vi.mocked(pipelineRepo.fetchPipelines).mockResolvedValue({
        data: [],
        pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
      });

      const user = userEvent.setup();

      // Act
      render(
        <TestWrapper>
          <MainPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create pipeline/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /create pipeline/i }));

      // Assert: Modal is displayed
      expect(screen.getByRole('dialog', { name: /create new pipeline/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/pipeline name/i)).toBeInTheDocument();
    });

    it('should trigger execution when run button is clicked', async () => {
      // Arrange
      const mockPipeline = createMockPipeline({ id: 'pipeline-run-123' });
      const mockExecution = createMockExecution({ 
        pipelineId: mockPipeline.id,
        status: 'QUEUED',
      });

      vi.mocked(pipelineRepo.fetchPipelines).mockResolvedValue({
        data: [mockPipeline],
        pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
      });
      vi.mocked(executionRepo.triggerExecution).mockResolvedValue(mockExecution);

      const user = userEvent.setup();

      // Act
      render(
        <TestWrapper>
          <MainPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(mockPipeline.name)).toBeInTheDocument();
      });

      const runButton = screen.getByRole('button', { name: /run pipeline/i });
      await user.click(runButton);

      // Assert: Execution triggered and UI updated
      await waitFor(() => {
        expect(executionRepo.triggerExecution).toHaveBeenCalledWith({
          pipelineId: mockPipeline.id,
        });
      });

      expect(screen.getByText(/execution queued/i)).toBeInTheDocument();
      expect(logger.info).toHaveBeenCalledWith(
        'Pipeline execution triggered',
        expect.objectContaining({ pipelineId: mockPipeline.id })
      );
    });

    it('should handle search input with debouncing', async () => {
      // Arrange
      vi.useFakeTimers({ shouldAdvanceTime: true });
      
      const mockPipelines = [
        createMockPipeline({ name: 'Frontend Build' }),
        createMockPipeline({ name: 'Backend Deploy' }),
      ];

      vi.mocked(pipelineRepo.fetchPipelines).mockResolvedValue({
        data: mockPipelines,
        pagination: { page: 1, pageSize: 10, totalItems: 2, totalPages: 1 },
      });

      const user = userEvent.setup({ delay: null });

      // Act
      render(
        <TestWrapper>
          <MainPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search pipelines/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search pipelines/i);
      await user.type(searchInput, 'frontend');

      // Fast-forward past debounce delay
      vi.advanceTimersByTime(APP_CONFIG.searchDebounceMs + 50);

      // Assert: Search API called with debounced value
      await waitFor(() => {
        expect(pipelineRepo.fetchPipelines).toHaveBeenCalledWith(
          expect.objectContaining({ search: 'frontend' })
        );
      });

      vi.useRealTimers();
    });
  });

  // --------------------------------------------------------------------------
  // Real-time Updates
  // --------------------------------------------------------------------------

  describe('Real-time Updates', () => {
    it('should update execution status when receiving WebSocket message', async () => {
      // Arrange: Setup initial execution in RUNNING state
      const mockExecution = createMockExecution({ 
        id: 'exec-ws-123',
        status: 'RUNNING',
      });

      vi.mocked(executionRepo.fetchExecutions).mockResolvedValue({
        data: [mockExecution],
        pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
      });

      // Mock WebSocket message handler
      const wsCallbacks: Record<string, Function> = {};
      vi.mock('@/runtime/websocket.runtime', () => ({
        websocket: {
          subscribe: (channel: string, callback: Function) => {
            wsCallbacks[channel] = callback;
            return () => { delete wsCallbacks[channel]; };
          },
        },
      }));

      // Act: Render with initial data
      render(
        <TestWrapper>
          <MainPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/running/i)).toBeInTheDocument();
      });

      // Simulate WebSocket status update
      const updatedExecution = { ...mockExecution, status: 'SUCCESS' as ExecutionStatus };
      wsCallbacks[`execution:${mockExecution.id}`]?.(updatedExecution);

      // Assert: UI reflects updated status
      await waitFor(() => {
        expect(screen.getByText(/success/i)).toBeInTheDocument();
      });

      expect(metrics.increment).toHaveBeenCalledWith('execution.status.update');
    });
  });

  // --------------------------------------------------------------------------
  // Performance & Accessibility
  // --------------------------------------------------------------------------

  describe('Performance & Accessibility', () => {
    it('should meet accessibility standards', async () => {
      // Arrange
      vi.mocked(pipelineRepo.fetchPipelines).mockResolvedValue({
        data: [createMockPipeline()],
        pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
      });

      const { container } = render(
        <TestWrapper>
          <MainPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });

      // Assert: Core accessibility requirements
      expect(container.querySelector('main')).toHaveAttribute('aria-label');
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      
      // All interactive elements have accessible names
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveAccessibleName();
      });
    });

    it('should cancel in-flight requests on unmount', async () => {
      // Arrange: Slow request that won't complete before unmount
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
      
      vi.mocked(pipelineRepo.fetchPipelines).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000))
      );

      // Act
      const { unmount } = render(
        <TestWrapper>
          <MainPage />
        </TestWrapper>
      );

      // Unmount before request completes
      unmount();

      // Assert: Abort was signaled
      expect(abortSpy).toHaveBeenCalled();
      
      abortSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle malformed API response gracefully', async () => {
      // Arrange: API returns unexpected structure
      vi.mocked(pipelineRepo.fetchPipelines).mockResolvedValue({
        // Missing required pagination fields
        data: [{ invalid: 'structure' } as unknown as Pipeline],
      } as unknown as PaginationResponse<Pipeline>);

      // Act & Assert: Should not crash, should show error state
      render(
        <TestWrapper>
          <MainPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid pipeline data structure'),
        expect.any(Object)
      );
    });

    it('should handle extremely long pipeline names', async () => {
      // Arrange: Pipeline with very long name
      const longName = 'A'.repeat(200);
      const mockPipeline = createMockPipeline({ name: longName });

      vi.mocked(pipelineRepo.fetchPipelines).mockResolvedValue({
        data: [mockPipeline],
        pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
      });

      // Act
      render(
        <TestWrapper>
          <MainPage />
        </TestWrapper>
      );

      // Assert: Name is truncated with tooltip for full text
      await waitFor(() => {
        const nameElement = screen.getByText(longName);
        expect(nameElement).toHaveAttribute('title', longName);
      });
    });

    it('should handle rapid successive actions correctly', async () => {
      // Arrange
      const mockPipeline = createMockPipeline();
      vi.mocked(pipelineRepo.fetchPipelines).mockResolvedValue({
        data: [mockPipeline],
        pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
      });

      // Mock slow execution trigger
      let resolveTrigger: (value: PipelineExecution) => void;
      vi.mocked(executionRepo.triggerExecution).mockImplementation(() => 
        new Promise((resolve) => { resolveTrigger = resolve; })
      );

      const user = userEvent.setup();

      // Act
      render(
        <TestWrapper>
          <MainPage />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run pipeline/i })).toBeInTheDocument();
      });

      const runButton = screen.getByRole('button', { name: /run pipeline/i });

      // Click rapidly multiple times
      await user.click(runButton);
      await user.click(runButton);
      await user.click(runButton);

      // Assert: Only one API call made (debounced/throttled)
      expect(executionRepo.triggerExecution).toHaveBeenCalledTimes(1);
      
      // Button shows loading state
      expect(runButton).toHaveAttribute('aria-busy', 'true');
      expect(runButton).toBeDisabled();
    });
  });
});