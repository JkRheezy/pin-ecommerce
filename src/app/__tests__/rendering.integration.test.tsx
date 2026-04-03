/**
 * @file rendering.integration.test.tsx
 * @description Integration tests for complex rendering scenarios
 * @module app/__tests__
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Types Layer
import type {
  PipelineConfig,
  ExecutionContext,
  RenderNode,
  ValidationResult,
  ErrorBoundaryState,
} from '@harness/types';

// Config Layer
import { TEST_TIMEOUTS, RENDER_LIMITS } from '@harness/config';
import { getTestConfig } from '@harness/config/test-config';

// Repo Layer
import { createMockPipelineRepo } from '@harness/repo/__mocks__/pipeline-repo';

// Service Layer
import { RenderingService } from '@harness/services/rendering-service';
import { ValidationService } from '@harness/services/validation-service';
import { TelemetryService } from '@harness/services/telemetry-service';

// Runtime Layer
import { RuntimeProvider } from '@harness/runtime/runtime-provider';
import { ErrorBoundary } from '@harness/runtime/error-boundary';

// UI Layer
import { PipelineCanvas } from '@harness/ui/pipeline-canvas';
import { NodeRenderer } from '@harness/ui/node-renderer';
import { ComplexNode } from '@harness/ui/nodes/complex-node';

// Test utilities
import { createLogger } from '@harness/utils/logger';
import { generateMockExecutionContext } from '../__fixtures__/execution-context.fixtures';

const logger = createLogger('RenderingIntegrationTest');

// ============================================================================
// Types
// ============================================================================

interface TestScenario {
  name: string;
  description: string;
  setup: () => Promise<TestContext>;
  teardown?: () => Promise<void>;
}

interface TestContext {
  queryClient: QueryClient;
  pipelineRepo: ReturnType<typeof createMockPipelineRepo>;
  renderingService: RenderingService;
  validationService: ValidationService;
  telemetryService: TelemetryService;
}

interface ComplexRenderNode extends RenderNode {
  nestedChildren?: RenderNode[];
  conditionalRender?: boolean;
  asyncDataSource?: string;
  validationRules?: Array<{
    type: string;
    constraint: unknown;
  }>;
}

// ============================================================================
// Test Setup Helpers
// ============================================================================

/**
 * Creates a properly configured QueryClient for testing
 */
function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * Renders a component with all required providers
 */
function renderWithProviders(
  ui: React.ReactElement,
  options: {
    route?: string;
    initialEntries?: string[];
  } = {}
): ReturnType<typeof render> & { user: ReturnType<typeof userEvent.setup> } {
  const { route = '/', initialEntries = [route] } = options;
  const queryClient = createTestQueryClient();
  const user = userEvent.setup();

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <RuntimeProvider config={getTestConfig()}>
          <ErrorBoundary
            fallback={<div data-testid="error-boundary">Something went wrong</div>}
            onError={(error) => logger.error('Error boundary caught error', { error })}
          >
            {children}
          </ErrorBoundary>
        </RuntimeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );

  return {
    ...render(ui, { wrapper: Wrapper }),
    user,
  };
}

/**
 * Creates a complex nested node structure for testing
 */
function createComplexNodeTree(depth: number, breadth: number): ComplexRenderNode {
  const createNode = (level: number, index: number): ComplexRenderNode => ({
    id: `node-${level}-${index}`,
    type: level === 0 ? 'root' : `level-${level}`,
    data: {
      label: `Node ${level}-${index}`,
      metadata: {
        createdAt: new Date().toISOString(),
        complexity: level * breadth + index,
      },
    },
    nestedChildren:
      level < depth
        ? Array.from({ length: breadth }, (_, i) => createNode(level + 1, i))
        : undefined,
    conditionalRender: level % 2 === 0,
    asyncDataSource: level > 0 ? `api/nodes/${level}-${index}` : undefined,
    validationRules:
      level > 0
        ? [
            { type: 'required', constraint: true },
            { type: 'maxLength', constraint: 100 },
          ]
        : undefined,
  });

  return createNode(0, 0);
}

// ============================================================================
// Test Scenarios
// ============================================================================

const scenarios: TestScenario[] = [
  {
    name: 'deeply-nested-rendering',
    description: 'Tests rendering of deeply nested node structures (5 levels deep)',
    setup: async () => {
      const queryClient = createTestQueryClient();
      const pipelineRepo = createMockPipelineRepo();
      const telemetryService = new TelemetryService({ enabled: false });
      const validationService = new ValidationService({ telemetryService });
      const renderingService = new RenderingService({
        validationService,
        telemetryService,
        maxDepth: RENDER_LIMITS.MAX_NESTING_DEPTH,
      });

      return {
        queryClient,
        pipelineRepo,
        renderingService,
        validationService,
        telemetryService,
      };
    },
  },
  {
    name: 'conditional-rendering-with-state',
    description: 'Tests nodes that conditionally render based on runtime state',
    setup: async () => {
      const queryClient = createTestQueryClient();
      const pipelineRepo = createMockPipelineRepo();
      const telemetryService = new TelemetryService({ enabled: false });
      const validationService = new ValidationService({ telemetryService });
      const renderingService = new RenderingService({
        validationService,
        telemetryService,
      });

      return {
        queryClient,
        pipelineRepo,
        renderingService,
        validationService,
        telemetryService,
      };
    },
  },
  {
    name: 'async-data-loading',
    description: 'Tests rendering with async data sources and loading states',
    setup: async () => {
      const queryClient = createTestQueryClient();
      const pipelineRepo = createMockPipelineRepo();
      const telemetryService = new TelemetryService({ enabled: false });
      const validationService = new ValidationService({ telemetryService });
      const renderingService = new RenderingService({
        validationService,
        telemetryService,
        enableAsyncLoading: true,
      });

      return {
        queryClient,
        pipelineRepo,
        renderingService,
        validationService,
        telemetryService,
      };
    },
  },
  {
    name: 'error-recovery',
    description: 'Tests error boundaries and recovery mechanisms',
    setup: async () => {
      const queryClient = createTestQueryClient();
      const pipelineRepo = createMockPipelineRepo();
      const telemetryService = new TelemetryService({ enabled: false });
      const validationService = new ValidationService({ telemetryService });
      const renderingService = new RenderingService({
        validationService,
        telemetryService,
        strictMode: true,
      });

      return {
        queryClient,
        pipelineRepo,
        renderingService,
        validationService,
        telemetryService,
      };
    },
  },
];

// ============================================================================
// Test Suite
// ============================================================================

describe('Rendering Integration Tests', () => {
  let currentContext: TestContext | null = null;

  afterEach(async () => {
    if (currentContext) {
      // Clean up any pending operations
      currentContext.queryClient.clear();
      await currentContext.telemetryService.flush();
      currentContext = null;
    }
  });

  describe('Deeply Nested Rendering', () => {
    beforeAll(async () => {
      const scenario = scenarios.find((s) => s.name === 'deeply-nested-rendering');
      if (!scenario) throw new Error('Scenario not found');
      currentContext = await scenario.setup();
    });

    it('should render 5-level deep nested structure without performance degradation', async () => {
      // Arrange: Create deeply nested tree
      const complexTree = createComplexNodeTree(5, 3); // 3^5 = 243 leaf nodes
      const executionContext = generateMockExecutionContext();

      // Act: Render the complex tree
      const startTime = performance.now();
      const { container } = renderWithProviders(
        <PipelineCanvas
          rootNode={complexTree}
          executionContext={executionContext}
          renderingService={currentContext!.renderingService}
        />
      );
      const renderTime = performance.now() - startTime;

      // Assert: Verify all levels are rendered
      expect(renderTime).toBeLessThan(TEST_TIMEOUTS.RENDER_PERFORMANCE);
      expect(screen.getByTestId('node-0-0')).toBeInTheDocument();

      // Verify nested children are rendered
      for (let level = 1; level <= 5; level++) {
        const node = screen.getByTestId(`node-${level}-0`);
        expect(node).toBeInTheDocument();
      }

      // Verify leaf nodes count
      const allNodes = container.querySelectorAll('[data-testid^="node-"]');
      expect(allNodes.length).toBeGreaterThanOrEqual(243);
    }, TEST_TIMEOUTS.INTEGRATION);

    it('should handle max depth exceeded gracefully', async () => {
      // Arrange: Create tree exceeding max depth
      const tooDeepTree = createComplexNodeTree(10, 2);

      // Act & Assert: Should render with truncation warning
      renderWithProviders(
        <PipelineCanvas
          rootNode={tooDeepTree}
          executionContext={generateMockExecutionContext()}
          renderingService={currentContext!.renderingService}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('depth-warning')).toBeInTheDocument();
      });

      const warning = screen.getByTestId('depth-warning');
      expect(warning).toHaveTextContent(/maximum depth exceeded/i);
    });
  });

  describe('Conditional Rendering with State', () => {
    beforeAll(async () => {
      const scenario = scenarios.find((s) => s.name === 'conditional-rendering-with-state');
      if (!scenario) throw new Error('Scenario not found');
      currentContext = await scenario.setup();
    });

    it('should conditionally render nodes based on runtime state changes', async () => {
      // Arrange: Create nodes with conditional rendering
      const conditionalNode: ComplexRenderNode = {
        id: 'conditional-root',
        type: 'conditional-container',
        data: { condition: 'featureFlag.enabled' },
        nestedChildren: [
          {
            id: 'conditional-child',
            type: 'feature-component',
            data: { feature: 'new-ui' },
            conditionalRender: true,
          },
        ],
      };

      const { user } = renderWithProviders(
        <PipelineCanvas
          rootNode={conditionalNode}
          executionContext={generateMockExecutionContext({
            featureFlags: { 'new-ui': false },
          })}
          renderingService={currentContext!.renderingService}
        />
      );

      // Assert: Child should not be visible initially
      expect(screen.queryByTestId('conditional-child')).not.toBeInTheDocument();

      // Act: Toggle feature flag
      const toggleButton = screen.getByTestId('feature-toggle');
      await user.click(toggleButton);

      // Assert: Child should now be visible
      await waitFor(() => {
        expect(screen.getByTestId('conditional-child')).toBeInTheDocument();
      });
    });

    it('should handle rapid state changes without visual inconsistencies', async () => {
      // Arrange: Create component with frequent updates
      const dynamicNode: ComplexRenderNode = {
        id: 'dynamic-root',
        type: 'dynamic-container',
        data: { updateInterval: 100 },
        nestedChildren: Array.from({ length: 10 }, (_, i) => ({
          id: `dynamic-${i}`,
          type: 'counter',
          data: { initialValue: i },
        })),
      };

      const { user } = renderWithProviders(
        <PipelineCanvas
          rootNode={dynamicNode}
          executionContext={generateMockExecutionContext()}
          renderingService={currentContext!.renderingService}
        />
      );

      // Act: Rapidly trigger updates
      const updateButtons = screen.getAllByTestId(/update-dynamic-\d+/);
      for (const button of updateButtons.slice(0, 5)) {
        await user.click(button);
      }

      // Assert: No duplicate or missing elements
      const renderedCounters = screen.getAllByTestId(/dynamic-\d+/);
      const uniqueIds = new Set(renderedCounters.map((el) => el.dataset.testid));
      expect(uniqueIds.size).toBe(renderedCounters.length);
    });
  });

  describe('Async Data Loading', () => {
    beforeAll(async () => {
      const scenario = scenarios.find((s) => s.name === 'async-data-loading');
      if (!scenario) throw new Error('Scenario not found');
      currentContext = await scenario.setup();
    });

    it('should show loading states while async data is fetching', async () => {
      // Arrange: Create node with async data source
      const asyncNode: ComplexRenderNode = {
        id: 'async-root',
        type: 'async-container',
        asyncDataSource: 'api/pipelines/123',
        data: { fallback: 'Loading pipeline data...' },
        nestedChildren: [],
      };

      // Mock delayed response
      currentContext!.pipelineRepo.mockDelay(500);
      currentContext!.pipelineRepo.mockResponse('api/pipelines/123', {
        data: { name: 'Test Pipeline', stages: 5 },
      });

      renderWithProviders(
        <PipelineCanvas
          rootNode={asyncNode}
          executionContext={generateMockExecutionContext()}
          renderingService={currentContext!.renderingService}
        />
      );

      // Assert: Loading state shown
      expect(screen.getByTestId('async-loading')).toBeInTheDocument();
      expect(screen.getByText(/loading pipeline data/i)).toBeInTheDocument();

      // Assert: Data loaded after delay
      await waitFor(
        () => {
          expect(screen.getByTestId('async-content')).toBeInTheDocument();
          expect(screen.getByText('Test Pipeline')).toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    });

    it('should handle concurrent async data requests', async () => {
      // Arrange: Multiple async nodes
      const concurrentNodes: ComplexRenderNode = {
        id: 'concurrent-root',
        type: 'async-container',
        nestedChildren: Array.from({ length: 5 }, (_, i) => ({
          id: `async-child-${i}`,
          type: 'async-component',
          asyncDataSource: `api/data/${i}`,
          data: { index: i },
        })),
      };

      // Mock all responses
      for (let i = 0; i < 5; i++) {
        currentContext!.pipelineRepo.mockResponse(`api/data/${i}`, {
          data: { value: `data-${i}` },
        });
      }

      renderWithProviders(
        <PipelineCanvas
          rootNode={concurrentNodes}
          executionContext={generateMockExecutionContext()}
          renderingService={currentContext!.renderingService}
        />
      );

      // Assert: All loading states shown initially
      const loadingIndicators = screen.getAllByTestId(/async-loading-\d+/);
      expect(loadingIndicators).toHaveLength(5);

      // Assert: All data loaded
      await waitFor(() => {
        for (let i = 0; i < 5; i++) {
          expect(screen.getByTestId(`async-content-${i}`)).toBeInTheDocument();
          expect(screen.getByText(`data-${i}`)).toBeInTheDocument();
        }
      });
    });

    it('should handle async errors with retry mechanism', async () => {
      // Arrange: Node with failing async source
      const failingNode: ComplexRenderNode = {
        id: 'failing-async',
        type: 'async-container',
        asyncDataSource: 'api/unstable',
        data: {},
      };

      // Mock failure then success
      let attemptCount = 0;
      currentContext!.pipelineRepo.mockResponse('api/unstable', () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Network error');
        }
        return { data: { recovered: true } };
      });

      const { user } = renderWithProviders(
        <PipelineCanvas
          rootNode={failingNode}
          executionContext={generateMockExecutionContext()}
          renderingService={currentContext!.renderingService}
        />
      );

      // Assert: Error state shown
      await waitFor(() => {
        expect(screen.getByTestId('async-error')).toBeInTheDocument();
      });

      // Act: Click retry
      const retryButton = screen.getByTestId('retry-button');
      await user.click(retryButton);

      // Assert: Success after retry
      await waitFor(() => {
        expect(screen.getByTestId('async-content')).toBeInTheDocument();
      });
      expect(attemptCount).toBe(3);
    });
  });

  describe('Error Recovery', () => {
    beforeAll(async () => {
      const scenario = scenarios.find((s) => s.name === 'error-recovery');
      if (!scenario) throw new Error('Scenario not found');
      currentContext = await scenario.setup();
    });

    it('should catch and recover from render errors using error boundaries', async () => {
      // Arrange: Create component that throws during render
      const ErrorThrowingComponent: React.FC = () => {
        throw new Error('Intentional render error');
      };

      const problematicNode: ComplexRenderNode = {
        id: 'error-root',
        type: 'error-test-container',
        nestedChildren: [
          {
            id: 'error-child',
            type: 'error-thrower',
            // This will be replaced with actual error-throwing component
          } as ComplexRenderNode,
        ],
      };

      // Mock the rendering service to inject error component
      jest.spyOn(currentContext!.renderingService, 'renderNode').mockImplementation((node) => {
        if (node.type === 'error-thrower') {
          return <ErrorThrowingComponent key={node.id} />;
        }
        return <div key={node.id} data-testid={node.id}>{node.data?.label}</div>;
      });

      renderWithProviders(
        <PipelineCanvas
          rootNode={problematicNode}
          executionContext={generateMockExecutionContext()}
          renderingService={currentContext!.renderingService}
        />
      );

      // Assert: Error boundary caught the error
      await waitFor(() => {
        expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
      });
    });

    it('should preserve sibling node state when one node errors', async () => {
      // Arrange: Multiple siblings where one fails
      const siblingsWithError: ComplexRenderNode = {
        id: 'sibling-root',
        type: 'sibling-container',
        nestedChildren: [
          { id: 'healthy-1', type: 'stable', data: { value: 1 } },
          { id: 'failing', type: 'unstable', data: { shouldError: true } },
          { id: 'healthy-2', type: 'stable', data: { value: 2 } },
        ],
      };

      let renderCount = 0;
      jest.spyOn(currentContext!.renderingService, 'renderNode').mockImplementation((node) => {
        if (node.type === 'unstable' && node.data?.shouldError && renderCount === 0) {
          renderCount++;
          throw new Error('First render error');
        }
        return (
          <div key={node.id} data-testid={node.id} data-value={node.data?.value}>
            {node.data?.label || node.id}
          </div>
        );
      });

      renderWithProviders(
        <PipelineCanvas
          rootNode={siblingsWithError}
          executionContext={generateMockExecutionContext()}
          renderingService={currentContext!.renderingService}
        />
      );

      // Assert: Healthy siblings still rendered
      expect(screen.getByTestId('healthy-1')).toBeInTheDocument();
      expect(screen.getByTestId('healthy-2')).toBeInTheDocument();

      // Assert: Failed node shows fallback
      expect(screen.getByTestId('error-fallback-failing')).toBeInTheDocument();
    });

    it('should handle validation errors during render', async () => {
      // Arrange: Node with invalid configuration
      const invalidNode: ComplexRenderNode = {
        id: 'invalid-node',
        type: 'validated-component',
        data: { requiredField: null }, // Invalid: required field is null
        validationRules: [{ type: 'required', constraint: 'requiredField' }],
      };

      // Mock validation to fail
      jest.spyOn(currentContext!.validationService, 'validate').mockReturnValue({
        valid: false,
        errors: [{ field: 'requiredField', message: 'Field is required' }],
      });

      renderWithProviders(
        <PipelineCanvas
          rootNode={invalidNode}
          executionContext={generateMockExecutionContext()}
          renderingService={currentContext!.renderingService}
        />
      );

      // Assert: Validation error displayed
      await waitFor(() => {
        expect(screen.getByTestId('validation-error')).toBeInTheDocument();
      });

      const errorMessage = screen.getByTestId('validation-error-message');
      expect(errorMessage).toHaveTextContent(/field is required/i);
    });
  });

  describe('Performance and Memory', () => {
    it('should not leak memory with frequent re-renders', async () => {
      const scenario = scenarios.find((s) => s.name === 'conditional-rendering-with-state');
      currentContext = await scenario!.setup();

      // Arrange: Component that re-renders frequently
      const { unmount } = renderWithProviders(
        <PipelineCanvas
          rootNode={createComplexNodeTree(3, 2)}
          executionContext={generateMockExecutionContext()}
          renderingService={currentContext!.renderingService}
        />
      );

      // Act: Force multiple re-renders
      for (let i = 0; i < 50; i++) {
        currentContext!.queryClient.invalidateQueries();
        await waitFor(() => Promise.resolve());
      }

      // Cleanup
      unmount();

      // Assert: No pending operations (would indicate memory leak)
      expect(currentContext!.queryClient.isFetching()).toBe(0);
    });

    it('should virtualize large lists efficiently', async () => {
      const scenario = scenarios.find((s) => s.name === 'deeply-nested-rendering');
      currentContext = await scenario!.setup();

      // Arrange: Very large list
      const largeList: ComplexRenderNode = {
        id: 'large-list',
        type: 'virtual-list',
        data: { itemCount: 10000, itemHeight: 50 },
        nestedChildren: Array.from({ length: 10000 }, (_, i) => ({
          id: `item-${i}`,
          type: 'list-item',
          data: { index: i, content: `Item ${i}` },
        })),
      };

      const { container } = renderWithProviders(
        <PipelineCanvas
          rootNode={largeList}
          executionContext={generateMockExecutionContext()}
          renderingService={currentContext!.renderingService}
        />
      );

      // Assert: Only visible items rendered (virtualization working)
      const renderedItems = container.querySelectorAll('[data-testid^="item-"]');
      expect(renderedItems.length).toBeLessThan(100); // Much less than 10000

      // Assert: First and last visible items correct
      expect(screen.getByTestId('item-0')).toBeInTheDocument();
      expect(screen.queryByTestId('item-9999')).not.toBeInTheDocument();
    });
  });
});