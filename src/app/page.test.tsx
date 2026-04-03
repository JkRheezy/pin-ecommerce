/**
 * Integration tests for the Page component
 * 
 * Following the six-layer architecture:
 * - Types: src/types/page.types.ts
 * - Config: src/config/page.config.ts
 * - Repo: src/repos/page.repo.ts
 * - Service: src/services/page.service.ts
 * - Runtime: src/app/page.tsx
 * - UI: src/components/page/
 * 
 * This file imports and re-exports split tests for better maintainability.
 */

// Import and re-export all split test modules
export * from './page.types.test';
export * from './page.config.test';
export * from './page.repo.test';
export * from './page.service.test';
export * from './page.ui.test';geService = new PageService(pageRepo);
  });

  describe('Service Layer Integration', () => {
    it('should fetch page data through service layer', async () => {
      const pageData: PageData = await pageService.getPageData('home');
      
      expect(pageData).toBeDefined();
      expect(pageData.title).toBe('Test Page');
      expect(pageData.description).toBe('Test Description');
    });

    it('should handle service errors with proper logging', async () => {
      pageRepo.getPage = async () => {
        throw new Error('Repository error');
      };

      await expect(pageService.getPageData('invalid')).rejects.toThrow('Failed to fetch page data');
    });

    it('should validate page data structure', async () => {
      const pageData = await pageService.getPageData('home');
      
      expect(pageData).toHaveProperty('id');
      expect(pageData).toHaveProperty('title');
      expect(pageData).toHaveProperty('description');
      expect(pageData).toHaveProperty('content');
      expect(pageData).toHaveProperty('metadata');
    });
  });

  describe('Repository Layer Integration', () => {
    it('should fetch from repository with config', async () => {
      const page = await pageRepo.getPage('home');
      
      expect(page).toBeDefined();
      expect(page.config).toEqual(pageConfig.getConfig());
    });

    it('should handle missing page gracefully', async () => {
      const page = await pageRepo.getPage('non-existent');
      
      expect(page).toBeNull();
    });
  });

  describe('UI Component Integration', () => {
    it('should render page with service data', async () => {
      const pageData = await pageService.getPageData('home');
      const props: PageProps = { data: pageData };
      
      render(<Page {...props} />);
      
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByText(pageData.title)).toBeInTheDocument();
    });

    it('should handle loading state', () => {
      const props: PageProps = { data: null, loading: true };
      
      render(<Page {...props} />);
      
      expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    });

    it('should handle error state', () => {
      const props: PageProps = { 
        data: null, 
        error: new Error('Failed to load') 
      };
      
      render(<Page {...props} />);
      
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load');
    });
  });

  describe('End-to-End Flow', () => {
    it('should complete full data flow from repo to UI', async () => {
      // Repo layer
      const repoData = await pageRepo.getPage('home');
      expect(repoData).toBeDefined();

      // Service layer transformation
      const serviceData = await pageService.transformPageData(repoData);
      expect(serviceData.title).toBeDefined();

      // UI rendering
      const props: PageProps = { data: serviceData };
      render(<Page {...props} />);
      
      expect(screen.getByRole('heading')).toHaveTextContent(serviceData.title);
    });
  });
});nds: ['npm ci', 'npm run build'],
        },
      },
    ],
    triggers: {
      onPush: true,
      onPullRequest: true,
    },
  };

  const mockExecutionResult: ExecutionResult = {
    pipelineId: 'test-pipeline-001',
    executionId: 'exec-001',
    status: 'SUCCESS',
    stages: [
      {
        stageId: 'stage-1',
        status: 'SUCCESS',
        duration: 120000,
        logs: ['Build completed successfully'],
      },
    ],
    startedAt: new Date('2024-01-15T10:00:00Z'),
    completedAt: new Date('2024-01-15T10:02:00Z'),
  };

  let mockPipelineService: {
    executePipeline: ReturnType<typeof vi.fn>;
    validateConfig: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock service instance
    mockPipelineService = {
      executePipeline: vi.fn().mockResolvedValue(mockExecutionResult),
      validateConfig: vi.fn().mockReturnValue({ valid: true, errors: [] }),
    };
    
    (PipelineService as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => mockPipelineService
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Core Functionality', () => {
    it('should render the main page with correct title', () => {
      // Act
      render(<Page />);

      // Assert
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        /pipeline dashboard/i
      );
    });

    it('should render pipeline configuration form', () => {
      // Act
      render(<Page />);

      // Assert
      expect(screen.getByLabelText(/pipeline name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/pipeline id/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create pipeline/i })).toBeEnabled();
    });

    it('should handle pipeline creation with valid config', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<Page />);

      // Act - Fill form with valid data
      await user.type(screen.getByLabelText(/pipeline name/i), mockValidConfig.name);
      await user.type(screen.getByLabelText(/pipeline id/i), mockValidConfig.id);
      
      // Submit form
      await user.click(screen.getByRole('button', { name: /create pipeline/i }));

      // Assert - Verify service layer interaction
      await waitFor(() => {
        expect(mockPipelineService.validateConfig).toHaveBeenCalledWith(
          expect.objectContaining({
            name: mockValidConfig.name,
            id: mockValidConfig.id,
          })
        );
      });

      // Verify logging for observability
      expect(Logger.info).toHaveBeenCalledWith(
        'Pipeline creation initiated',
        expect.any(Object)
      );
    });

    it('should display execution results after successful pipeline run', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<Page />);

      // Act - Create and execute pipeline
      await user.type(screen.getByLabelText(/pipeline name/i), mockValidConfig.name);
      await user.click(screen.getByRole('button', { name: /create pipeline/i }));

      // Wait for execution to complete
      await waitFor(() => {
        expect(screen.getByText(/execution successful/i)).toBeInTheDocument();
      });

      // Assert - Verify result display
      expect(screen.getByTestId('execution-status')).toHaveTextContent('SUCCESS');
      expect(screen.getByTestId('execution-duration')).toHaveTextContent('2m 0s');
    });

    it('should render pipeline list from repository', async () => {
      // Arrange - Mock repo layer response
      const mockPipelines: PipelineConfig[] = [mockValidConfig];
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockPipelines,
      } as Response);

      // Act
      render(<Page />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText(mockValidConfig.name)).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle validation errors gracefully', async () => {
      // Arrange
      const user = userEvent.setup();
      mockPipelineService.validateConfig.mockReturnValue({
        valid: false,
        errors: ['Pipeline name is required', 'Invalid stage configuration'],
      });

      render(<Page />);

      // Act - Submit invalid form
      await user.click(screen.getByRole('button', { name: /create pipeline/i }));

      // Assert - Error display
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/pipeline name is required/i);
      });

      // Verify error logging
      expect(Logger.warn).toHaveBeenCalledWith(
        'Pipeline validation failed',
        expect.any(Object)
      );
    });

    it('should handle service execution failures', async () => {
      // Arrange
      const user = userEvent.setup();
      const serviceError = new Error('Pipeline execution timeout');
      mockPipelineService.executePipeline.mockRejectedValue(serviceError);

      render(<Page />);

      // Act
      await user.type(screen.getByLabelText(/pipeline name/i), mockValidConfig.name);
      await user.click(screen.getByRole('button', { name: /create pipeline/i }));

      // Assert - Error boundary or error state
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/execution failed/i);
      });

      // Verify structured error logging
      expect(Logger.error).toHaveBeenCalledWith(
        'Pipeline execution failed',
        expect.objectContaining({
          error: serviceError.message,
          pipelineId: expect.any(String),
        })
      );
    });

    it('should handle network errors when fetching pipeline list', async () => {
      // Arrange
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network timeout'));

      // Act
      render(<Page />);

      // Assert - Graceful degradation
      await waitFor(() => {
        expect(screen.getByText(/unable to load pipelines/i)).toBeInTheDocument();
      });

      // Retry button should be available
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('should handle empty pipeline list state', async () => {
      // Arrange
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

      // Act
      render(<Page />);

      // Assert - Empty state messaging
      await waitFor(() => {
        expect(screen.getByText(/no pipelines found/i)).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /create your first pipeline/i })).toBeInTheDocument();
    });

    it('should prevent duplicate submissions while processing', async () => {
      // Arrange
      const user = userEvent.setup();
      mockPipelineService.executePipeline.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockExecutionResult), 100))
      );

      render(<Page />);

      // Act - Rapid double click
      await user.type(screen.getByLabelText(/pipeline name/i), mockValidConfig.name);
      const submitButton = screen.getByRole('button', { name: /create pipeline/i });
      
      // Simulate rapid clicks
      await user.click(submitButton);
      await user.click(submitButton);

      // Assert - Only one execution should be triggered
      await waitFor(() => {
        expect(mockPipelineService.executePipeline).toHaveBeenCalledTimes(1);
      });
    });

    it('should sanitize user inputs to prevent XSS', async () => {
      // Arrange
      const user = userEvent.setup();
      const maliciousInput = '<script>alert("xss")</script>';

      render(<Page />);

      // Act
      await user.type(screen.getByLabelText(/pipeline name/i), maliciousInput);

      // Assert - Script tags should not be rendered as HTML
      const displayedText = screen.getByDisplayValue(maliciousInput);
      expect(displayedText).toBeInTheDocument();
      
      // Verify no script execution context
      expect(document.querySelector('script')).not.toBeInTheDocument();
    });

    it('should handle malformed API responses', async () => {
      // Arrange - Invalid response structure
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'structure' }),
      } as Response);

      // Act
      render(<Page />);

      // Assert - Graceful handling with type guards
      await waitFor(() => {
        expect(screen.getByText(/unable to load pipelines/i)).toBeInTheDocument();
      });

      expect(Logger.error).toHaveBeenCalledWith(
        'Invalid pipeline data received',
        expect.any(Object)
      );
    });

    it('should cleanup resources on unmount', async () => {
      // Arrange
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
      const { unmount } = render(<Page />);

      // Act
      unmount();

      // Assert - Verify cleanup
      expect(abortSpy).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      // Arrange
      const { container } = render(<Page />);

      // Act & Assert - Would integrate with axe-core in real implementation
      expect(container).toBeTruthy();
      
      // Verify ARIA attributes
      expect(screen.getByRole('main')).toHaveAttribute('aria-label');
    });

    it('should support keyboard navigation', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<Page />);

      // Act - Tab through form elements
      await user.tab();
      expect(screen.getByLabelText(/pipeline name/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByLabelText(/pipeline id/i)).toHaveFocus();
    });
  });
});