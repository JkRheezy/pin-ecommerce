import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { WorkflowEngine, WorkflowStep, WorkflowContext, WorkflowResult } from './workflow';
import { Logger } from '../logging/logger';
import { ValidationError } from '../errors/validation-error';
import { WorkflowError } from '../errors/workflow-error';

// Mock the logger
jest.mock('../logging/logger');

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = new Logger('WorkflowEngine') as jest.Mocked<Logger>;
    engine = new WorkflowEngine(mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerStep', () => {
    it('should register a valid workflow step', () => {
      // Arrange
      const step: WorkflowStep = {
        id: 'test-step',
        name: 'Test Step',
        execute: jest.fn(),
      };

      // Act
      engine.registerStep(step);

      // Assert
      const registeredStep = engine.getStep('test-step');
      expect(registeredStep).toBe(step);
    });

    it('should throw ValidationError when registering step without id', () => {
      // Arrange
      const step = {
        name: 'Invalid Step',
        execute: jest.fn(),
      } as unknown as WorkflowStep;

      // Act & Assert
      expect(() => engine.registerStep(step)).toThrow(ValidationError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to register workflow step: missing required field "id"'
      );
    });

    it('should throw ValidationError when registering step without execute function', () => {
      // Arrange
      const step = {
        id: 'invalid-step',
        name: 'Invalid Step',
      } as unknown as WorkflowStep;

      // Act & Assert
      expect(() => engine.registerStep(step)).toThrow(ValidationError);
    });

    it('should throw ValidationError when registering duplicate step id', () => {
      // Arrange
      const step: WorkflowStep = {
        id: 'duplicate-step',
        name: 'Duplicate Step',
        execute: jest.fn(),
      };

      // Act
      engine.registerStep(step);

      // Assert
      expect(() => engine.registerStep(step)).toThrow(ValidationError);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attempted to register duplicate workflow step: duplicate-step'
      );
    });
  });

  describe('executeWorkflow', () => {
    it('should execute a single step workflow successfully', async () => {
      // Arrange
      const mockExecute = jest.fn().mockResolvedValue({ success: true, data: { result: 'done' } });
      const step: WorkflowStep = {
        id: 'single-step',
        name: 'Single Step',
        execute: mockExecute,
      };

      engine.registerStep(step);

      const context: WorkflowContext = {
        workflowId: 'test-workflow',
        input: { value: 42 },
        metadata: { userId: 'user-123' },
      };

      // Act
      const result: WorkflowResult = await engine.executeWorkflow(['single-step'], context);

      // Assert
      expect(mockExecute).toHaveBeenCalledWith(context, expect.any(Object));
      expect(result.success).toBe(true);
      expect(result.stepResults).toHaveLength(1);
      expect(result.stepResults[0].stepId).toBe('single-step');
      expect(result.stepResults[0].success).toBe(true);
    });

    it('should execute multiple steps in sequence', async () => {
      // Arrange
      const executionOrder: string[] = [];

      const step1: WorkflowStep = {
        id: 'step-1',
        name: 'First Step',
        execute: jest.fn().mockImplementation(async (ctx) => {
          executionOrder.push('step-1');
          return { success: true, data: { step: 1 } };
        }),
      };

      const step2: WorkflowStep = {
        id: 'step-2',
        name: 'Second Step',
        execute: jest.fn().mockImplementation(async (ctx) => {
          executionOrder.push('step-2');
          return { success: true, data: { step: 2 } };
        }),
      };

      const step3: WorkflowStep = {
        id: 'step-3',
        name: 'Third Step',
        execute: jest.fn().mockImplementation(async (ctx) => {
          executionOrder.push('step-3');
          return { success: true, data: { step: 3 } };
        }),
      };

      engine.registerStep(step1);
      engine.registerStep(step2);
      engine.registerStep(step3);

      const context: WorkflowContext = {
        workflowId: 'sequential-workflow',
        input: {},
      };

      // Act
      const result = await engine.executeWorkflow(['step-1', 'step-2', 'step-3'], context);

      // Assert
      expect(executionOrder).toEqual(['step-1', 'step-2', 'step-3']);
      expect(result.success).toBe(true);
      expect(result.stepResults).toHaveLength(3);
    });

    it('should pass context with previous step results to subsequent steps', async () => {
      // Arrange
      const step1: WorkflowStep = {
        id: 'data-producer',
        name: 'Data Producer',
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: { producedValue: 'important-data' },
        }),
      };

      const step2: WorkflowStep = {
        id: 'data-consumer',
        name: 'Data Consumer',
        execute: jest.fn().mockImplementation(async (ctx, stepContext) => {
          // Access previous step results from stepContext
          const previousResults = stepContext.getPreviousResults();
          return {
            success: true,
            data: { received: previousResults['data-producer']?.data },
          };
        }),
      };

      engine.registerStep(step1);
      engine.registerStep(step2);

      const context: WorkflowContext = {
        workflowId: 'context-test',
        input: { initial: 'data' },
      };

      // Act
      const result = await engine.executeWorkflow(['data-producer', 'data-consumer'], context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.stepResults[1].data).toEqual({
        received: { producedValue: 'important-data' },
      });
    });

    it('should stop execution on step failure when continueOnError is false', async () => {
      // Arrange
      const step1: WorkflowStep = {
        id: 'success-step',
        name: 'Success Step',
        execute: jest.fn().mockResolvedValue({ success: true }),
      };

      const step2: WorkflowStep = {
        id: 'failing-step',
        name: 'Failing Step',
        execute: jest.fn().mockRejectedValue(new Error('Step failed')),
      };

      const step3: WorkflowStep = {
        id: 'never-executed',
        name: 'Never Executed',
        execute: jest.fn().mockResolvedValue({ success: true }),
      };

      engine.registerStep(step1);
      engine.registerStep(step2);
      engine.registerStep(step3);

      const context: WorkflowContext = {
        workflowId: 'failure-test',
        input: {},
        options: { continueOnError: false },
      };

      // Act
      const result = await engine.executeWorkflow(['success-step', 'failing-step', 'never-executed'], context);

      // Assert
      expect(result.success).toBe(false);
      expect(result.stepResults).toHaveLength(2); // Third step should not execute
      expect(step3.execute).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Workflow step failing-step failed'),
        expect.any(Error)
      );
    });

    it('should continue execution on step failure when continueOnError is true', async () => {
      // Arrange
      const step1: WorkflowStep = {
        id: 'step-a',
        name: 'Step A',
        execute: jest.fn().mockResolvedValue({ success: true }),
      };

      const step2: WorkflowStep = {
        id: 'failing-step',
        name: 'Failing Step',
        execute: jest.fn().mockRejectedValue(new Error('Step failed')),
      };

      const step3: WorkflowStep = {
        id: 'step-b',
        name: 'Step B',
        execute: jest.fn().mockResolvedValue({ success: true }),
      };

      engine.registerStep(step1);
      engine.registerStep(step2);
      engine.registerStep(step3);

      const context: WorkflowContext = {
        workflowId: 'continue-test',
        input: {},
        options: { continueOnError: true },
      };

      // Act
      const result = await engine.executeWorkflow(['step-a', 'failing-step', 'step-b'], context);

      // Assert
      expect(result.success).toBe(false); // Overall workflow still reports failure
      expect(result.stepResults).toHaveLength(3); // All steps executed
      expect(step3.execute).toHaveBeenCalled();
    });

    it('should throw WorkflowError when step is not registered', async () => {
      // Arrange
      const context: WorkflowContext = {
        workflowId: 'missing-step-test',
        input: {},
      };

      // Act & Assert
      await expect(
        engine.executeWorkflow(['non-existent-step'], context)
      ).rejects.toThrow(WorkflowError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Workflow step not found: non-existent-step'
      );
    });

    it('should throw ValidationError for empty step list', async () => {
      // Arrange
      const context: WorkflowContext = {
        workflowId: 'empty-workflow',
        input: {},
      };

      // Act & Assert
      await expect(engine.executeWorkflow([], context)).rejects.toThrow(ValidationError);
    });

    it('should apply timeout from step configuration', async () => {
      // Arrange
      const slowStep: WorkflowStep = {
        id: 'slow-step',
        name: 'Slow Step',
        timeout: 100, // 100ms timeout
        execute: jest.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 200))
        ),
      };

      engine.registerStep(slowStep);

      const context: WorkflowContext = {
        workflowId: 'timeout-test',
        input: {},
      };

      // Act & Assert
      await expect(
        engine.executeWorkflow(['slow-step'], context)
      ).rejects.toThrow(WorkflowError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Workflow step slow-step timed out after 100ms')
      );
    });

    it('should support conditional step execution based on context', async () => {
      // Arrange
      const conditionalStep: WorkflowStep = {
        id: 'conditional-step',
        name: 'Conditional Step',
        condition: (ctx) => ctx.input.shouldRun === true,
        execute: jest.fn().mockResolvedValue({ success: true }),
      };

      const alwaysRunStep: WorkflowStep = {
        id: 'always-run',
        name: 'Always Run',
        execute: jest.fn().mockResolvedValue({ success: true }),
      };

      engine.registerStep(conditionalStep);
      engine.registerStep(alwaysRunStep);

      // Act - condition is false
      const skipResult = await engine.executeWorkflow(
        ['conditional-step', 'always-run'],
        { workflowId: 'skip-test', input: { shouldRun: false } }
      );

      // Assert
      expect(conditionalStep.execute).not.toHaveBeenCalled();
      expect(skipResult.stepResults).toHaveLength(1);
      expect(skipResult.stepResults[0].stepId).toBe('always-run');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Skipping step conditional-step: condition not met'
      );

      // Act - condition is true
      jest.clearAllMocks();
      const runResult = await engine.executeWorkflow(
        ['conditional-step', 'always-run'],
        { workflowId: 'run-test', input: { shouldRun: true } }
      );

      // Assert
      expect(conditionalStep.execute).toHaveBeenCalled();
      expect(runResult.stepResults).toHaveLength(2);
    });

    it('should handle step retry logic on failure', async () => {
      // Arrange
      let attemptCount = 0;
      const flakyStep: WorkflowStep = {
        id: 'flaky-step',
        name: 'Flaky Step',
        retryCount: 2,
        retryDelay: 10, // 10ms for fast tests
        execute: jest.fn().mockImplementation(async () => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error(`Attempt ${attemptCount} failed`);
          }
          return { success: true, data: { attempts: attemptCount } };
        }),
      };

      engine.registerStep(flakyStep);

      const context: WorkflowContext = {
        workflowId: 'retry-test',
        input: {},
      };

      // Act
      const result = await engine.executeWorkflow(['flaky-step'], context);

      // Assert
      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3);
      expect(flakyStep.execute).toHaveBeenCalledTimes(3);
      expect(mockLogger.warn).toHaveBeenCalledTimes(2); // Two retry warnings
    });

    it('should fail after exhausting all retries', async () => {
      // Arrange
      const failingStep: WorkflowStep = {
        id: 'always-fails',
        name: 'Always Fails',
        retryCount: 2,
        retryDelay: 5,
        execute: jest.fn().mockRejectedValue(new Error('Persistent failure')),
      };

      engine.registerStep(failingStep);

      const context: WorkflowContext = {
        workflowId: 'exhausted-retry-test',
        input: {},
      };

      // Act
      const result = await engine.executeWorkflow(['always-fails'], context);

      // Assert
      expect(result.success).toBe(false);
      expect(failingStep.execute).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(result.stepResults[0].error).toContain('Persistent failure');
    });

    it('should properly clean up resources on workflow completion', async () => {
      // Arrange
      const cleanupMock = jest.fn();
      const stepWithCleanup: WorkflowStep = {
        id: 'cleanup-step',
        name: 'Cleanup Step',
        execute: jest.fn().mockResolvedValue({ success: true }),
        cleanup: cleanupMock,
      };

      engine.registerStep(stepWithCleanup);

      const context: WorkflowContext = {
        workflowId: 'cleanup-test',
        input: {},
      };

      // Act
      await engine.executeWorkflow(['cleanup-step'], context);

      // Assert
      expect(cleanupMock).toHaveBeenCalled();
    });

    it('should execute cleanup even when step fails', async () => {
      // Arrange
      const cleanupMock = jest.fn();
      const failingStepWithCleanup: WorkflowStep = {
        id: 'failing-with-cleanup',
        name: 'Failing With Cleanup',
        execute: jest.fn().mockRejectedValue(new Error('Execution failed')),
        cleanup: cleanupMock,
      };

      engine.registerStep(failingStepWithCleanup);

      const context: WorkflowContext = {
        workflowId: 'cleanup-on-failure-test',
        input: {},
      };

      // Act
      await engine.executeWorkflow(['failing-with-cleanup'], context);

      // Assert
      expect(cleanupMock).toHaveBeenCalled();
    });

    it('should track workflow execution metrics', async () => {
      // Arrange
      const step: WorkflowStep = {
        id: 'metrics-step',
        name: 'Metrics Step',
        execute: jest.fn().mockImplementation(async () => {
          // Simulate some work
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { success: true };
        }),
      };

      engine.registerStep(step);

      const context: WorkflowContext = {
        workflowId: 'metrics-test',
        input: {},
      };

      // Act
      const startTime = Date.now();
      const result = await engine.executeWorkflow(['metrics-step'], context);
      const endTime = Date.now();

      // Assert
      expect(result.metrics).toBeDefined();
      expect(result.metrics?.totalDuration).toBeGreaterThanOrEqual(10);
      expect(result.metrics?.totalDuration).toBeLessThanOrEqual(endTime - startTime + 50); // Allow some buffer
      expect(result.metrics?.stepCount).toBe(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Workflow metrics-test completed'),
        expect.objectContaining({
          duration: expect.any(Number),
          success: true,
        })
      );
    });
  });

  describe('WorkflowContext validation', () => {
    it('should validate required context fields', () => {
      // Arrange & Act & Assert
      expect(() => {
        // Missing workflowId
        const invalidContext = {
          input: {},
        } as WorkflowContext;
        engine.validateContext(invalidContext);
      }).toThrow(ValidationError);
    });

    it('should apply default options when not provided', () => {
      // Arrange
      const context: WorkflowContext = {
        workflowId: 'test',
        input: {},
        // options not provided
      };

      // Act
      const validatedContext = engine.validateContext(context);

      // Assert
      expect(validatedContext.options).toEqual({
        continueOnError: false,
        timeout: 30000,
        maxConcurrency: 1,
      });
    });
  });

  describe('getWorkflowStatus', () => {
    it('should return status for running workflow', async () => {
      // Arrange
      const slowStep: WorkflowStep = {
        id: 'very-slow-step',
        name: 'Very Slow Step',
        execute: jest.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 1000))
        ),
      };

      engine.registerStep(slowStep);

      const context: WorkflowContext = {
        workflowId: 'status-test',
        input: {},
      };

      // Start workflow but don't await
      const workflowPromise = engine.executeWorkflow(['very-slow-step'], context);

      // Act
      const status = engine.getWorkflowStatus('status-test');

      // Assert
      expect(status).toBeDefined();
      expect(status?.state).toBe('running');
      expect(status?.currentStepId).toBe('very-slow-step');

      // Cleanup
      await workflowPromise.catch(() => {}); // Ignore result
    });

    it('should return undefined for non-existent workflow', () => {
      // Act
      const status = engine.getWorkflowStatus('non-existent');

      // Assert
      expect(status).toBeUndefined();
    });
  });

  describe('cancelWorkflow', () => {
    it('should cancel a running workflow', async () => {
      // Arrange
      const step: WorkflowStep = {
        id: 'cancellable-step',
        name: 'Cancellable Step',
        execute: jest.fn().mockImplementation(async (ctx, stepCtx) => {
          // Check for cancellation signal
          while (!stepCtx.isCancelled()) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          throw new Error('Workflow was cancelled');
        }),
      };

      engine.registerStep(step);

      const context: WorkflowContext = {
        workflowId: 'cancel-test',
        input: {},
      };

      // Start workflow
      const workflowPromise = engine.executeWorkflow(['cancellable-step'], context);

      // Small delay to ensure workflow starts
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Act
      const cancelled = engine.cancelWorkflow('cancel-test');

      // Assert
      expect(cancelled).toBe(true);

      const result = await workflowPromise;
      expect(result.success).toBe(false);
      expect(result.cancelled).toBe(true);
    });

    it('should return false when cancelling non-existent workflow', () => {
      // Act
      const cancelled = engine.cancelWorkflow('non-existent');

      // Assert
      expect(cancelled).toBe(false);
    });
  });
});