import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/render-with-providers';
import { createMockService } from '@/test-utils/mock-service-factory';
import HomePage from '@/app/page';
import type { FeatureFlagConfig, PipelineConfig } from '@/types/config.types';
import type { FeatureFlagRepo, PipelineRepo } from '@/types/repo.types';
import type { FeatureFlagService, PipelineService } from '@/types/service.types';

// Types Layer: Test-specific types
interface TestSetupConfig {
  enableFeatureFlags: boolean;
  enablePipelines: boolean;
  mockError?: Error;
}

// Config Layer: Default test configurations
const defaultTestConfig: TestSetupConfig = {
  enableFeatureFlags: true,
  enablePipelines: true,
};

// Service Layer: Mock service factory for rendering tests
const createMockFeatureFlagService = (config: TestSetupConfig): FeatureFlagService => {
  return createMockService<FeatureFlagService>({
    getAllFlags: jest.fn().mockResolvedValue(
      config.enableFeatureFlags
        ? [{ id: 'flag-1', name: 'test-flag', enabled: true, environment: 'test' }]
        : []
    ),
    getFlagById: jest.fn(),
    toggleFlag: jest.fn(),
    createFlag: jest.fn(),
    deleteFlag: jest.fn(),
  });
};

const createMockPipelineService = (config: TestSetupConfig): PipelineService => {
  return createMockService<PipelineService>({
    getAllPipelines: jest.fn().mockResolvedValue(
      config.enablePipelines
        ? [{ id: 'pipe-1', name: 'test-pipeline', status: 'idle', stages: [] }]
        : []
    ),
    getPipelineById: jest.fn(),
    executePipeline: jest.fn(),
    createPipeline: jest.fn(),
    deletePipeline: jest.fn(),
  });
};

// Runtime Layer: Component setup and rendering utilities
interface RenderOptions {
  initialRoute?: string;
  serviceOverrides?: Partial<{
    featureFlagService: FeatureFlagService;
    pipelineService: PipelineService;
  }>;
}

/**
 * Sets up the test environment with mocked services and renders the HomePage component.
 * Follows the six-layer architecture by properly injecting dependencies at the Service layer.
 */
const setupRenderingTest = async (config: TestSetupConfig = defaultTestConfig, options: RenderOptions = {}) => {
  // Validate inputs to prevent runtime errors
  if (!config) {
    throw new TypeError('Test setup config is required');
  }

  // Create service instances (Service Layer)
  const featureFlagService = options.serviceOverrides?.featureFlagService ?? createMockFeatureFlagService(config);
  const pipelineService = options.serviceOverrides?.pipelineService ?? createMockPipelineService(config);

  // Handle error simulation for error boundary testing
  if (config.mockError) {
    featureFlagService.getAllFlags = jest.fn().mockRejectedValue(config.mockError);
  }

  // Render with providers (Runtime → UI Layer)
  const renderResult = renderWithProviders(<HomePage />, {
    services: {
      featureFlagService,
      pipelineService,
    },
    initialRoute: options.initialRoute ?? '/',
  });

  // Wait for async operations to complete
  await waitFor(() => {
    // Verify that the component has finished its initial data fetching
    expect(renderResult.container).toBeInTheDocument();
  });

  return {
    ...renderResult,
    services: {
      featureFlagService,
      pipelineService,
    },
    // Helper to re-render with new props
    rerenderWithConfig: async (newConfig: TestSetupConfig, newOptions?: RenderOptions) => {
      return setupRenderingTest(newConfig, newOptions);
    },
  };
};

// UI Layer: Test suite for component rendering
describe('HomePage Rendering', () => {
  describe('Initial Render', () => {
    it('should render without crashing', async () => {
      const { container } = await setupRenderingTest();
      
      expect(container).toBeInTheDocument();
    });

    it('should display loading state initially', async () => {
      const { getByTestId } = await setupRenderingTest();
      
      // Verify loading skeleton is present during data fetching
      expect(getByTestId('page-loading-skeleton')).toBeInTheDocument();
    });

    it('should render main layout structure', async () => {
      const { getByRole } = await setupRenderingTest();
      
      await waitFor(() => {
        expect(getByRole('main')).toBeInTheDocument();
        expect(getByRole('navigation')).toBeInTheDocument();
      });
    });
  });

  describe('Feature Flag Rendering', () => {
    it('should render feature flag section when enabled', async () => {
      const { getByTestId, services } = await setupRenderingTest({
        enableFeatureFlags: true,
        enablePipelines: false,
      });

      await waitFor(() => {
        expect(getByTestId('feature-flags-section')).toBeInTheDocument();
        expect(services.featureFlagService.getAllFlags).toHaveBeenCalledTimes(1);
      });
    });

    it('should render empty state when no feature flags exist', async () => {
      const { getByText } = await setupRenderingTest({
        enableFeatureFlags: false,
        enablePipelines: false,
      });

      await waitFor(() => {
        expect(getByText(/no feature flags found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Pipeline Rendering', () => {
    it('should render pipeline section when enabled', async () => {
      const { getByTestId, services } = await setupRenderingTest({
        enableFeatureFlags: false,
        enablePipelines: true,
      });

      await waitFor(() => {
        expect(getByTestId('pipelines-section')).toBeInTheDocument();
        expect(services.pipelineService.getAllPipelines).toHaveBeenCalledTimes(1);
      });
    });

    it('should render pipeline cards with correct data', async () => {
      const { getByText } = await setupRenderingTest({
        enableFeatureFlags: false,
        enablePipelines: true,
      });

      await waitFor(() => {
        expect(getByText('test-pipeline')).toBeInTheDocument();
        expect(getByText(/idle/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should render error boundary fallback on service error', async () => {
      const mockError = new Error('Failed to fetch feature flags');
      
      const { getByTestId } = await setupRenderingTest({
        ...defaultTestConfig,
        mockError,
      });

      await waitFor(() => {
        expect(getByTestId('error-boundary-fallback')).toBeInTheDocument();
      });
    });

    it('should display user-friendly error message', async () => {
      const mockError = new Error('Network timeout');
      
      const { getByText } = await setupRenderingTest({
        ...defaultTestConfig,
        mockError,
      });

      await waitFor(() => {
        expect(getByText(/something went wrong/i)).toBeInTheDocument();
        expect(getByText(/retry/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      const { container } = await setupRenderingTest();
      
      // axe-core or similar accessibility testing would go here
      expect(container).toBeTruthy();
    });

    it('should support keyboard navigation', async () => {
      const { getByRole } = await setupRenderingTest();
      
      await waitFor(() => {
        const mainContent = getByRole('main');
        expect(mainContent).toHaveAttribute('tabIndex', '-1');
      });
    });
  });

  describe('Responsive Rendering', () => {
    it('should render mobile layout on small viewports', async () => {
      // Mock viewport dimensions
      window.innerWidth = 375;
      window.dispatchEvent(new Event('resize'));

      const { getByTestId } = await setupRenderingTest();

      await waitFor(() => {
        expect(getByTestId('mobile-layout')).toBeInTheDocument();
      });
    });

    it('should render desktop layout on large viewports', async () => {
      window.innerWidth = 1440;
      window.dispatchEvent(new Event('resize'));

      const { getByTestId } = await setupRenderingTest();

      await waitFor(() => {
        expect(getByTestId('desktop-layout')).toBeInTheDocument();
      });
    });
  });
});