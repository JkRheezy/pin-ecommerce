/**
 * @fileoverview Unit tests for workflow execution logic
 * @module lib/ai/workflow.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '@/lib/logging';
import type { WorkflowConfig, WorkflowStep, WorkflowContext, WorkflowResult } from '@/types/workflow';
import { WorkflowExecutionError, WorkflowValidationError } from '@/types/errors';
import { WorkflowService } from '@/lib/ai/workflow';

// Mock dependencies
vi.mock('@/lib/logging', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('WorkflowService', () => {
  let workflowService: WorkflowService;

  beforeEach(() => {
    workflowService = new WorkflowService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateWorkflowConfig', () => {
    it('should validate a correct workflow configuration', () => {
      // Arrange: Create a valid workflow config
      const validConfig: WorkflowConfig = {
        id: 'test-workflow',
        name: 'Test Workflow',
        version: '1.0.0',
        steps: [
          {
            id: 'step-1',
            type: 'transform',
            config: { operation: 'uppercase' },
          },
        ],
      };

      // Act & Assert: Should not throw
      expect(() => workflowService.validateWorkflowConfig(validConfig)).not.toThrow();
    });

    it('should throw WorkflowValidationError for missing required fields', () => {
      // Arrange: Create an invalid config missing required fields
      const invalidConfig = {
        id: 'test-workflow',
        // Missing 'name' and 'steps'
      } as unknown as WorkflowConfig;

      // Act & Assert: Should throw validation error with specific message
      expect(() => workflowService.validateWorkflowConfig(invalidConfig)).toThrow(
        WorkflowValidationError
      );
      expect(() => workflowService.validateWorkflowConfig(invalidConfig)).toThrow(
        /Workflow config missing required fields: name, steps/
      );
    });

    it('should throw WorkflowValidationError for empty steps array', () => {
      // Arrange: Config with empty steps
      const configWithEmptySteps: WorkflowConfig = {
        id: 'test-workflow',
        name: 'Test Workflow',
        version: '1.0.0',
        steps: [],
      };

      // Act & Assert
      expect(() => workflowService.validateWorkflowConfig(configWithEmptySteps)).toThrow(
        WorkflowValidationError
      );
      expect(() => workflowService.validateWorkflowConfig(configWithEmptySteps)).toThrow(
        /Workflow must have at least one step/
      );
    });

    it('should throw WorkflowValidationError for duplicate step IDs', () => {
      // Arrange: Config with duplicate step IDs
      const configWithDuplicateSteps: WorkflowConfig = {
        id: 'test-workflow',
        name: 'Test Workflow',
        version: '1.0.0',
        steps: [
          { id: 'step-1', type: 'transform', config: {} },
          { id: 'step-1', type: 'filter', config: {} }, // Duplicate ID
        ],
      };

      // Act & Assert
      expect(() => workflowService.validateWorkflowConfig(configWithDuplicateSteps)).toThrow(
        WorkflowValidationError
      );
      expect(() => workflowService.validateWorkflowConfig(configWithDuplicateSteps)).toThrow(
        /Duplicate step IDs found: step-1/
      );
    });
  });

  describe('executeWorkflow', () => {
    const mockContext: WorkflowContext = {
      executionId: 'exec-123',
      timestamp: new Date('2024-01-15T10:00:00Z'),
      metadata: {
        userId: 'user-456',
        requestId: 'req-789',
      },
    };

    it('should execute a single-step workflow successfully', async () => {
      // Arrange: Simple workflow with one transform step
      const workflowConfig: WorkflowConfig = {
        id: 'simple-workflow',
        name: 'Simple Transform',
        version: '1.0.0',
        steps: [
          {
            id: 'transform-step',
            type: 'transform',
            config: { operation: 'uppercase', field: 'message' },
          },
        ],
      };

      const inputData = { message: 'hello world' };
      const expectedOutput = { message: 'HELLO WORLD' };

      // Mock the step execution
      vi.spyOn(workflowService as any, 'executeStep').mockResolvedValue(expectedOutput);

      // Act: Execute the workflow
      const result: WorkflowResult = await workflowService.executeWorkflow(
        workflowConfig,
        inputData,
        mockContext
      );

      // Assert: Verify successful execution
      expect(result.success).toBe(true);
      expect(result.data).toEqual(expectedOutput);
      expect(result.executionId).toBe(mockContext.executionId);
      expect(result.stepResults).toHaveLength(1);
      expect(result.stepResults[0].stepId).toBe('transform-step');
      expect(result.stepResults[0].success).toBe(true);

      // Verify logging
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Workflow execution started',
          workflowId: 'simple-workflow',
          executionId: 'exec-123',
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Workflow execution completed',
          workflowId: 'simple-workflow',
          executionId: 'exec-123',
          durationMs: expect.any(Number),
        })
      );
    });

    it('should execute multi-step workflow with data passing between steps', async () => {
      // Arrange: Multi-step workflow where output of step 1 feeds into step 2
      const workflowConfig: WorkflowConfig = {
        id: 'multi-step-workflow',
        name: 'Multi Step Pipeline',
        version: '1.0.0',
        steps: [
          {
            id: 'extract-step',
            type: 'extract',
            config: { source: 'api', endpoint: '/users' },
          },
          {
            id: 'transform-step',
            type: 'transform',
            config: { operation: 'filter', condition: 'active' },
            dependsOn: ['extract-step'],
          },
          {
            id: 'load-step',
            type: 'load',
            config: { destination: 'database', table: 'users' },
            dependsOn: ['transform-step'],
          },
        ],
      };

      const stepOutputs = new Map([
        ['extract-step', { users: [{ id: 1, name: 'Alice', active: true }] }],
        ['transform-step', { users: [{ id: 1, name: 'Alice' }] }],
        ['load-step', { inserted: 1, failed: 0 }],
      ]);

      // Mock step execution to return predetermined outputs
      vi.spyOn(workflowService as any, 'executeStep').mockImplementation(
        async (step: WorkflowStep, input: unknown) => {
          const output = stepOutputs.get(step.id);
          if (!output) {
            throw new WorkflowExecutionError(`Unknown step: ${step.id}`);
          }
          return output;
        }
      );

      // Act
      const result = await workflowService.executeWorkflow(
        workflowConfig,
        {},
        mockContext
      );

      // Assert: All steps executed in order
      expect(result.success).toBe(true);
      expect(result.stepResults).toHaveLength(3);
      expect(result.data).toEqual({ inserted: 1, failed: 0 });

      // Verify step execution order
      const executeStepSpy = vi.mocked(workflowService['executeStep']);
      expect(executeStepSpy).toHaveBeenCalledTimes(3);
      expect(executeStepSpy.mock.calls[0][0].id).toBe('extract-step');
      expect(executeStepSpy.mock.calls[1][0].id).toBe('transform-step');
      expect(executeStepSpy.mock.calls[2][0].id).toBe('load-step');
    });

    it('should handle step execution failure with proper error context', async () => {
      // Arrange: Workflow where a step will fail
      const workflowConfig: WorkflowConfig = {
        id: 'failing-workflow',
        name: 'Failing Workflow',
        version: '1.0.0',
        steps: [
          { id: 'step-1', type: 'transform', config: {} },
          { id: 'step-2', type: 'api-call', config: { timeout: 5000 } },
        ],
      };

      const stepError = new Error('API timeout exceeded');
      
      vi.spyOn(workflowService as any, 'executeStep').mockImplementation(
        async (step: WorkflowStep) => {
          if (step.id === 'step-2') {
            throw stepError;
          }
          return { processed: true };
        }
      );

      // Act & Assert: Should throw with detailed context
      await expect(
        workflowService.executeWorkflow(workflowConfig, {}, mockContext)
      ).rejects.toThrow(WorkflowExecutionError);

      await expect(
        workflowService.executeWorkflow(workflowConfig, {}, mockContext)
      ).rejects.toThrow(/Step 'step-2' failed: API timeout exceeded/);

      // Verify error logging
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Workflow step failed',
          stepId: 'step-2',
          stepType: 'api-call',
          error: 'API timeout exceeded',
          executionId: 'exec-123',
        })
      );
    });

    it('should respect step dependencies and execute in topological order', async () => {
      // Arrange: Complex dependency graph
      // A -> B -> D
      // A -> C -> D
      const workflowConfig: WorkflowConfig = {
        id: 'dependency-workflow',
        name: 'Dependency Test',
        version: '1.0.0',
        steps: [
          { id: 'A', type: 'start', config: {} },
          { id: 'B', type: 'process', config: {}, dependsOn: ['A'] },
          { id: 'C', type: 'process', config: {}, dependsOn: ['A'] },
          { id: 'D', type: 'merge', config: {}, dependsOn: ['B', 'C'] },
        ],
      };

      const executionOrder: string[] = [];
      
      vi.spyOn(workflowService as any, 'executeStep').mockImplementation(
        async (step: WorkflowStep, input: unknown, context: WorkflowContext, dependencies: Map<string, unknown>) => {
          executionOrder.push(step.id);
          
          // Verify dependencies are available
          if (step.id === 'B' || step.id === 'C') {
            expect(dependencies.has('A')).toBe(true);
          }
          if (step.id === 'D') {
            expect(dependencies.has('B')).toBe(true);
            expect(dependencies.has('C')).toBe(true);
          }
          
          return { step: step.id };
        }
      );

      // Act
      await workflowService.executeWorkflow(workflowConfig, {}, mockContext);

      // Assert: Verify topological order
      expect(executionOrder[0]).toBe('A'); // A must be first
      expect(executionOrder[3]).toBe('D'); // D must be last
      expect(executionOrder).toContain('B');
      expect(executionOrder).toContain('C');
      
      // B and C can be in any order, but both before D
      const bIndex = executionOrder.indexOf('B');
      const cIndex = executionOrder.indexOf('C');
      const dIndex = executionOrder.indexOf('D');
      expect(bIndex).toBeLessThan(dIndex);
      expect(cIndex).toBeLessThan(dIndex);
    });

    it('should detect circular dependencies and throw error', async () => {
      // Arrange: Workflow with circular dependency A -> B -> C -> A
      const workflowConfig: WorkflowConfig = {
        id: 'circular-workflow',
        name: 'Circular Dependency',
        version: '1.0.0',
        steps: [
          { id: 'A', type: 'start', config: {}, dependsOn: ['C'] },
          { id: 'B', type: 'process', config: {}, dependsOn: ['A'] },
          { id: 'C', type: 'process', config: {}, dependsOn: ['B'] },
        ],
      };

      // Act & Assert
      await expect(
        workflowService.executeWorkflow(workflowConfig, {}, mockContext)
      ).rejects.toThrow(WorkflowValidationError);

      await expect(
        workflowService.executeWorkflow(workflowConfig, {}, mockContext)
      ).rejects.toThrow(/Circular dependency detected/);
    });

    it('should handle timeout for long-running steps', async () => {
      // Arrange: Step with short timeout
      const workflowConfig: WorkflowConfig = {
        id: 'timeout-workflow',
        name: 'Timeout Test',
        version: '1.0.0',
        steps: [
          {
            id: 'slow-step',
            type: 'long-running',
            config: { timeout: 100 }, // 100ms timeout
          },
        ],
      };

      // Mock slow execution
      vi.spyOn(workflowService as any, 'executeStep').mockImplementation(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 200)); // 200ms execution
          return { completed: true };
        }
      );

      // Act & Assert
      await expect(
        workflowService.executeWorkflow(workflowConfig, {}, mockContext)
      ).rejects.toThrow(WorkflowExecutionError);

      await expect(
        workflowService.executeWorkflow(workflowConfig, {}, mockContext)
      ).rejects.toThrow(/Step 'slow-step' timed out after 100ms/);
    });

    it('should support conditional step execution based on input data', async () => {
      // Arrange: Workflow with conditional step
      const workflowConfig: WorkflowConfig = {
        id: 'conditional-workflow',
        name: 'Conditional Test',
        version: '1.0.0',
        steps: [
          { id: 'always-run', type: 'start', config: {} },
          {
            id: 'conditional-step',
            type: 'process',
            config: {},
            condition: (data: unknown) => {
              const d = data as { shouldProcess?: boolean };
              return d.shouldProcess === true;
            },
          },
          { id: 'final-step', type: 'end', config: {} },
        ],
      };

      const executeStepSpy = vi.spyOn(workflowService as any, 'executeStep')
        .mockResolvedValue({ processed: true });

      // Act: Execute with condition = true
      await workflowService.executeWorkflow(
        workflowConfig,
        { shouldProcess: true },
        mockContext
      );

      // Assert: All 3 steps executed
      expect(executeStepSpy).toHaveBeenCalledTimes(3);

      // Act: Execute with condition = false
      vi.clearAllMocks();
      await workflowService.executeWorkflow(
        workflowConfig,
        { shouldProcess: false },
        mockContext
      );

      // Assert: Only 2 steps executed (conditional step skipped)
      expect(executeStepSpy).toHaveBeenCalledTimes(2);
      const calledStepIds = executeStepSpy.mock.calls.map(call => call[0].id);
      expect(calledStepIds).toContain('always-run');
      expect(calledStepIds).toContain('final-step');
      expect(calledStepIds).not.toContain('conditional-step');

      // Verify logging for skipped step
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Step skipped due to condition',
          stepId: 'conditional-step',
        })
      );
    });

    it('should collect and report step metrics', async () => {
      // Arrange
      const workflowConfig: WorkflowConfig = {
        id: 'metrics-workflow',
        name: 'Metrics Test',
        version: '1.0.0',
        steps: [
          { id: 'step-1', type: 'fast', config: {} },
          { id: 'step-2', type: 'slow', config: {} },
        ],
      };

      vi.spyOn(workflowService as any, 'executeStep').mockImplementation(
        async (step: WorkflowStep) => {
          // Simulate different execution times
          const delay = step.id === 'step-1' ? 10 : 50;
          await new Promise(resolve => setTimeout(resolve, delay));
          return { step: step.id };
        }
      );

      // Act
      const result = await workflowService.executeWorkflow(
        workflowConfig,
        {},
        mockContext
      );

      // Assert: Verify metrics collection
      expect(result.metrics).toBeDefined();
      expect(result.metrics?.totalDurationMs).toBeGreaterThanOrEqual(60);
      expect(result.metrics?.stepMetrics).toHaveLength(2);
      
      const step1Metrics = result.metrics?.stepMetrics.find(m => m.stepId === 'step-1');
      const step2Metrics = result.metrics?.stepMetrics.find(m => m.stepId === 'step-2');
      
      expect(step1Metrics?.durationMs).toBeGreaterThanOrEqual(10);
      expect(step2Metrics?.durationMs).toBeGreaterThanOrEqual(50);
    });

    it('should handle workflow cancellation', async () => {
      // Arrange: Long-running workflow
      const workflowConfig: WorkflowConfig = {
        id: 'cancellable-workflow',
        name: 'Cancellation Test',
        version: '1.0.0',
        steps: [
          { id: 'step-1', type: 'start', config: {} },
          { id: 'step-2', type: 'long-running', config: {} },
          { id: 'step-3', type: 'end', config: {} },
        ],
      };

      const abortController = new AbortController();

      vi.spyOn(workflowService as any, 'executeStep').mockImplementation(
        async (step: WorkflowStep, _input: unknown, _context: WorkflowContext, _deps: Map<string, unknown>, signal: AbortSignal) => {
          if (step.id === 'step-2') {
            // Simulate long operation that checks for cancellation
            for (let i = 0; i < 100; i++) {
              if (signal.aborted) {
                throw new Error('Step cancelled');
              }
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          }
          return { step: step.id };
        }
      );

      // Act: Start execution and cancel after 50ms
      const executionPromise = workflowService.executeWorkflow(
        workflowConfig,
        {},
        { ...mockContext, abortSignal: abortController.signal }
      );

      setTimeout(() => abortController.abort(), 50);

      // Assert
      await expect(executionPromise).rejects.toThrow(WorkflowExecutionError);
      await expect(executionPromise).rejects.toThrow(/Workflow cancelled/);
    });
  });

  describe('executeStep', () => {
    it('should execute transform step with correct handler', async () => {
      // Arrange
      const step: WorkflowStep = {
        id: 'transform-test',
        type: 'transform',
        config: { operation: 'uppercase' },
      };
      const input = { text: 'hello' };

      const transformHandler = vi.fn().mockResolvedValue({ text: 'HELLO' });
      vi.spyOn(workflowService as any, 'getStepHandler').mockReturnValue(transformHandler);

      // Act
      const result = await (workflowService as any).executeStep(
        step,
        input,
        mockContext,
        new Map()
      );

      // Assert
      expect(transformHandler).toHaveBeenCalledWith(input, step.config, mockContext, expect.any(Map));
      expect(result).toEqual({ text: 'HELLO' });
    });

    it('should throw for unsupported step type', async () => {
      // Arrange
      const step: WorkflowStep = {
        id: 'unknown-step',
        type: 'unsupported-type' as any,
        config: {},
      };

      vi.spyOn(workflowService as any, 'getStepHandler').mockReturnValue(undefined);

      // Act & Assert
      await expect(
        (workflowService as any).executeStep(step, {}, mockContext, new Map())
      ).rejects.toThrow(WorkflowExecutionError);

      await expect(
        (workflowService as any).executeStep(step, {}, mockContext, new Map())
      ).rejects.toThrow(/No handler registered for step type: unsupported-type/);
    });

    it('should wrap non-Error throws in WorkflowExecutionError', async () => {
      // Arrange
      const step: WorkflowStep = {
        id: 'error-step',
        type: 'transform',
        config: {},
      };

      vi.spyOn(workflowService as any, 'getStepHandler').mockImplementation(() => {
        throw 'String error'; // Not an Error instance
      });

      // Act & Assert
      await expect(
        (workflowService as any).executeStep(step, {}, mockContext, new Map())
      ).rejects.toThrow(WorkflowExecutionError);

      await expect(
        (workflowService as any).executeStep(step, {}, mockContext, new Map())
      ).rejects.toThrow(/Step 'error-step' failed: String error/);
    });
  });

  describe('registerStepHandler', () => {
    it('should register custom step handler', async () => {
      // Arrange
      const customHandler = vi.fn().mockResolvedValue({ custom: true });
      
      // Act
      workflowService.registerStepHandler('custom-type', customHandler);

      // Assert: Handler is available
      const retrievedHandler = (workflowService as any).getStepHandler('custom-type');
      expect(retrievedHandler).toBe(customHandler);
    });

    it('should throw when registering handler for existing type without override', () => {
      // Arrange
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      // Act
      workflowService.registerStepHandler('my-type', handler1);

      // Assert: Cannot register without override
      expect(() => {
        workflowService.registerStepHandler('my-type', handler2);
      }).toThrow(/Handler already registered for step type: my-type/);

      // Can register with override
      expect(() => {
        workflowService.registerStepHandler('my-type', handler2, true);
      }).not.toThrow();
    });
  });

  describe('retry logic', () => {
    it('should retry failed steps according to retry policy', async () => {
      // Arrange: Step that fails twice then succeeds
      const step: WorkflowStep = {
        id: 'retry-step',
        type: 'api-call',
        config: {},
        retryPolicy: {
          maxRetries: 3,
          backoffMs: 10,
          retryableErrors: ['ETIMEDOUT', 'ECONNRESET'],
        },
      };

      let attemptCount = 0;
      const handler = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          const error = new Error('ETIMEDOUT');
          (error as any).code = 'ETIMEDOUT';
          throw error;
        }
        return { success: true, attempts: attemptCount };
      });

      vi.spyOn(workflowService as any, 'getStepHandler').mockReturnValue(handler);

      // Act
      const result = await (workflowService as any).executeStepWithRetry(
        step,
        {},
        mockContext,
        new Map()
      );

      // Assert
      expect(result).toEqual({ success: true, attempts: 3 });
      expect(handler).toHaveBeenCalledTimes(3);
      
      // Verify retry logging
      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Step failed, retrying',
          stepId: 'retry-step',
          attempt: expect.any(Number),
          maxRetries: 3,
        })
      );
    });

    it('should not retry non-retryable errors', async () => {
      // Arrange: Step with non-retryable error
      const step: WorkflowStep = {
        id: 'no-retry-step',
        type: 'validate',
        config: {},
        retryPolicy: {
          maxRetries: 3,
          backoffMs: 10,
          retryableErrors: ['ETIMEDOUT'],
        },
      };

      const handler = vi.fn().mockImplementation(() => {
        const error = new Error('VALIDATION_FAILED');
        (error as any).code = 'VALIDATION_FAILED';
        throw error;
      });

      vi.spyOn(workflowService as any, 'getStepHandler').mockReturnValue(handler);

      // Act & Assert
      await expect(
        (workflowService as any).executeStepWithRetry(step, {}, mockContext, new Map())
      ).rejects.toThrow(/VALIDATION_FAILED/);

      // Should not retry
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should respect maxRetries limit', async () => {
      // Arrange: Step that always fails
      const step: WorkflowStep = {
        id: 'always-fail',
        type: 'api-call',
        config: {},
        retryPolicy: {
          maxRetries: 2,
          backoffMs: 5,
          retryableErrors: ['ERROR'],
        },
      };

      const handler = vi.fn().mockRejectedValue(
        Object.assign(new Error('ERROR'), { code: 'ERROR' })
      );

      vi.spyOn(workflowService as any, 'getStepHandler').mockReturnValue(handler);

      // Act & Assert
      await expect(
        (workflowService as any).executeStepWithRetry(step, {}, mockContext, new Map())
      ).rejects.toThrow(/Step 'always-fail' failed after 3 attempts/);

      // Initial attempt + 2 retries = 3 total
      expect(handler).toHaveBeenCalledTimes(3);
    });
  });
});