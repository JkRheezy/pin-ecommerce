import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  WorkflowConfig,
  WorkflowError,
  WorkflowErrorCode,
  WorkflowResult,
  WorkflowState,
  WorkflowStep,
  WorkflowStepConfig,
} from '../types';
import {
  WorkflowExecutionError,
  WorkflowValidationError,
  WorkflowTimeoutError,
  WorkflowStateError,
} from '../errors';
import {
  executeWorkflow,
  validateWorkflowConfig,
  createWorkflowStep,
  WorkflowExecutor,
} from '../workflow';

// -----------------------------------------------------------------------------
// Types Layer - Test Fixtures
// -----------------------------------------------------------------------------

/**
 * Mock workflow step for testing error scenarios
 */
interface MockStepContext {
  attemptCount: number;
  shouldFail: boolean;
  failWithError?: Error;
}

/**
 * Test fixture for workflow configurations
 */
const createMockWorkflowConfig = (overrides?: Partial<WorkflowConfig>): WorkflowConfig => ({
  id: 'test-workflow',
  name: 'Test Workflow',
  version: '1.0.0',
  steps: [],
  retryPolicy: {
    maxAttempts: 3,
    backoffMultiplier: 2,
    initialDelayMs: 100,
    maxDelayMs: 5000,
  },
  timeoutMs: 30000,
  ...overrides,
});

/**
 * Test fixture for workflow step configurations
 */
const createMockStepConfig = (overrides?: Partial<WorkflowStepConfig>): WorkflowStepConfig => ({
  id: 'test-step',
  name: 'Test Step',
  type: 'transform',
  dependencies: [],
  timeoutMs: 5000,
  retryable: true,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Service Layer - Workflow Error Handling Tests
// -----------------------------------------------------------------------------

describe('Workflow Error Handling', () => {
  let mockLogger: {
    error: jest.Mock;
    warn: jest.Mock;
    info: jest.Mock;
    debug: jest.Mock;
  };

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };
  });

  describe('WorkflowValidationError', () => {
    it('should throw WorkflowValidationError for invalid workflow config', () => {
      const invalidConfig = createMockWorkflowConfig({
        id: '', // Invalid: empty ID
        steps: [],
      });

      expect(() => validateWorkflowConfig(invalidConfig)).toThrow(WorkflowValidationError);
      expect(() => validateWorkflowConfig(invalidConfig)).toThrow('Workflow ID is required');
    });

    it('should throw WorkflowValidationError for duplicate step IDs', () => {
      const config = createMockWorkflowConfig({
        steps: [
          createMockStepConfig({ id: 'step-1' }),
          createMockStepConfig({ id: 'step-1' }), // Duplicate
        ],
      });

      expect(() => validateWorkflowConfig(config)).toThrow(WorkflowValidationError);
      expect(() => validateWorkflowConfig(config)).toThrow('Duplicate step ID: step-1');
    });

    it('should throw WorkflowValidationError for circular dependencies', () => {
      const config = createMockWorkflowConfig({
        steps: [
          createMockStepConfig({
            id: 'step-a',
            dependencies: ['step-b'],
          }),
          createMockStepConfig({
            id: 'step-b',
            dependencies: ['step-a'], // Circular
          }),
        ],
      });

      expect(() => validateWorkflowConfig(config)).toThrow(WorkflowValidationError);
      expect(() => validateWorkflowConfig(config)).toThrow('Circular dependency detected');
    });

    it('should include validation details in error context', () => {
      const invalidConfig = createMockWorkflowConfig({
        timeoutMs: -1, // Invalid: negative timeout
      });

      try {
        validateWorkflowConfig(invalidConfig);
        fail('Expected validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowValidationError);
        const validationError = error as WorkflowValidationError;
        expect(validationError.code).toBe(WorkflowErrorCode.INVALID_CONFIG);
        expect(validationError.details).toHaveProperty('field', 'timeoutMs');
        expect(validationError.details).toHaveProperty('value', -1);
      }
    });
  });

  describe('WorkflowExecutionError', () => {
    it('should throw WorkflowExecutionError when step execution fails', async () => {
      const failingStep = createWorkflowStep({
        ...createMockStepConfig({ id: 'failing-step' }),
        execute: jest.fn().mockRejectedValue(new Error('Step execution failed')),
      });

      const config = createMockWorkflowConfig({
        steps: [failingStep],
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });

      await expect(executor.execute({})).rejects.toThrow(WorkflowExecutionError);
    });

    it('should include step context in execution error', async () => {
      const originalError = new Error('Database connection lost');
      const failingStep = createWorkflowStep({
        ...createMockStepConfig({ id: 'db-step', name: 'Database Query' }),
        execute: jest.fn().mockRejectedValue(originalError),
      });

      const config = createMockWorkflowConfig({
        steps: [failingStep],
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });

      try {
        await executor.execute({});
        fail('Expected execution error');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowExecutionError);
        const execError = error as WorkflowExecutionError;
        expect(execError.code).toBe(WorkflowErrorCode.EXECUTION_FAILED);
        expect(execError.stepId).toBe('db-step');
        expect(execError.stepName).toBe('Database Query');
        expect(execError.cause).toBe(originalError);
      }
    });

    it('should capture stack trace from original error', async () => {
      const originalError = new Error('Original error');
      originalError.stack = 'Error: Original error\n    at Test.method (file.ts:10:5)';

      const failingStep = createWorkflowStep({
        ...createMockStepConfig({ id: 'stack-step' }),
        execute: jest.fn().mockRejectedValue(originalError),
      });

      const config = createMockWorkflowConfig({
        steps: [failingStep],
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });

      try {
        await executor.execute({});
        fail('Expected execution error');
      } catch (error) {
        const execError = error as WorkflowExecutionError;
        expect(execError.stack).toContain('Original error');
        expect(execError.stack).toContain('file.ts:10:5');
      }
    });
  });

  describe('WorkflowTimeoutError', () => {
    it('should throw WorkflowTimeoutError when step exceeds timeout', async () => {
      const slowStep = createWorkflowStep({
        ...createMockStepConfig({
          id: 'slow-step',
          timeoutMs: 50, // Very short timeout
        }),
        execute: jest.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 1000)) // Slow execution
        ),
      });

      const config = createMockWorkflowConfig({
        steps: [slowStep],
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });

      await expect(executor.execute({})).rejects.toThrow(WorkflowTimeoutError);
    });

    it('should include timeout duration in error message', async () => {
      const slowStep = createWorkflowStep({
        ...createMockStepConfig({
          id: 'slow-step',
          timeoutMs: 100,
        }),
        execute: jest.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 5000))
        ),
      });

      const config = createMockWorkflowConfig({
        steps: [slowStep],
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });

      try {
        await executor.execute({});
        fail('Expected timeout error');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowTimeoutError);
        const timeoutError = error as WorkflowTimeoutError;
        expect(timeoutError.code).toBe(WorkflowErrorCode.TIMEOUT);
        expect(timeoutError.timeoutMs).toBe(100);
        expect(timeoutError.message).toContain('100ms');
      }
    });

    it('should throw WorkflowTimeoutError for overall workflow timeout', async () => {
      const slowStep = createWorkflowStep({
        ...createMockStepConfig({ id: 'slow-step' }),
        execute: jest.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 5000))
        ),
      });

      const config = createMockWorkflowConfig({
        steps: [slowStep],
        timeoutMs: 100, // Short overall timeout
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });

      await expect(executor.execute({})).rejects.toThrow(WorkflowTimeoutError);
    });
  });

  describe('WorkflowStateError', () => {
    it('should throw WorkflowStateError for invalid state transitions', () => {
      const executor = new WorkflowExecutor(
        createMockWorkflowConfig(),
        { logger: mockLogger }
      );

      // Attempt invalid transition: COMPLETED -> RUNNING
      executor.setState(WorkflowState.COMPLETED);

      expect(() => executor.setState(WorkflowState.RUNNING)).toThrow(WorkflowStateError);
    });

    it('should include current and target state in error', () => {
      const executor = new WorkflowExecutor(
        createMockWorkflowConfig(),
        { logger: mockLogger }
      );

      executor.setState(WorkflowState.FAILED);

      try {
        executor.setState(WorkflowState.PENDING);
        fail('Expected state error');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowStateError);
        const stateError = error as WorkflowStateError;
        expect(stateError.code).toBe(WorkflowErrorCode.INVALID_STATE);
        expect(stateError.currentState).toBe(WorkflowState.FAILED);
        expect(stateError.targetState).toBe(WorkflowState.PENDING);
      }
    });

    it('should allow valid state transitions', () => {
      const executor = new WorkflowExecutor(
        createMockWorkflowConfig(),
        { logger: mockLogger }
      );

      // Valid transitions
      expect(() => executor.setState(WorkflowState.RUNNING)).not.toThrow();
      expect(() => executor.setState(WorkflowState.PAUSED)).not.toThrow();
      expect(() => executor.setState(WorkflowState.RUNNING)).not.toThrow();
      expect(() => executor.setState(WorkflowState.COMPLETED)).not.toThrow();
    });
  });

  describe('Retry Logic and Error Recovery', () => {
    it('should retry failed steps according to retry policy', async () => {
      const executeMock = jest.fn();
      // Fail twice, then succeed
      executeMock
        .mockRejectedValueOnce(new Error('Attempt 1 failed'))
        .mockRejectedValueOnce(new Error('Attempt 2 failed'))
        .mockResolvedValueOnce({ success: true });

      const retryableStep = createWorkflowStep({
        ...createMockStepConfig({
          id: 'retryable-step',
          retryable: true,
        }),
        execute: executeMock,
      });

      const config = createMockWorkflowConfig({
        steps: [retryableStep],
        retryPolicy: {
          maxAttempts: 3,
          backoffMultiplier: 1,
          initialDelayMs: 10, // Fast for testing
          maxDelayMs: 100,
        },
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });
      const result = await executor.execute({});

      expect(executeMock).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
    });

    it('should not retry non-retryable steps', async () => {
      const executeMock = jest.fn().mockRejectedValue(new Error('Fatal error'));

      const nonRetryableStep = createWorkflowStep({
        ...createMockStepConfig({
          id: 'fatal-step',
          retryable: false, // Non-retryable
        }),
        execute: executeMock,
      });

      const config = createMockWorkflowConfig({
        steps: [nonRetryableStep],
        retryPolicy: {
          maxAttempts: 3,
          backoffMultiplier: 2,
          initialDelayMs: 10,
          maxDelayMs: 100,
        },
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });

      await expect(executor.execute({})).rejects.toThrow(WorkflowExecutionError);
      expect(executeMock).toHaveBeenCalledTimes(1); // No retries
    });

    it('should throw after max retry attempts exceeded', async () => {
      const executeMock = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      const failingStep = createWorkflowStep({
        ...createMockStepConfig({
          id: 'failing-step',
          retryable: true,
        }),
        execute: executeMock,
      });

      const config = createMockWorkflowConfig({
        steps: [failingStep],
        retryPolicy: {
          maxAttempts: 2,
          backoffMultiplier: 1,
          initialDelayMs: 10,
          maxDelayMs: 100,
        },
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });

      await expect(executor.execute({})).rejects.toThrow(WorkflowExecutionError);

      // Initial attempt + 1 retry = 2 calls
      expect(executeMock).toHaveBeenCalledTimes(2);
    });

    it('should apply exponential backoff between retries', async () => {
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;

      // Mock setTimeout to capture delays
      jest.spyOn(global, 'setTimeout').mockImplementation(
        (callback: () => void, delay?: number) => {
          if (delay) delays.push(delay);
          return originalSetTimeout(callback, 0);
        }
      );

      const executeMock = jest.fn();
      executeMock
        .mockRejectedValueOnce(new Error('Attempt 1'))
        .mockRejectedValueOnce(new Error('Attempt 2'))
        .mockResolvedValueOnce({ success: true });

      const step = createWorkflowStep({
        ...createMockStepConfig({ id: 'backoff-step', retryable: true }),
        execute: executeMock,
      });

      const config = createMockWorkflowConfig({
        steps: [step],
        retryPolicy: {
          maxAttempts: 3,
          backoffMultiplier: 2,
          initialDelayMs: 100,
          maxDelayMs: 1000,
        },
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });
      await executor.execute({});

      // Should have delays: 100ms, 200ms (100 * 2)
      expect(delays).toHaveLength(2);
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);

      jest.restoreAllMocks();
    });
  });

  describe('Error Logging and Observability', () => {
    it('should log errors with structured context', async () => {
      const error = new Error('Test error');
      const failingStep = createWorkflowStep({
        ...createMockStepConfig({ id: 'logged-step' }),
        execute: jest.fn().mockRejectedValue(error),
      });

      const config = createMockWorkflowConfig({
        id: 'test-workflow-123',
        steps: [failingStep],
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });

      try {
        await executor.execute({ input: 'test' });
      } catch {
        // Expected to throw
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: 'test-workflow-123',
          stepId: 'logged-step',
          errorCode: WorkflowErrorCode.EXECUTION_FAILED,
          errorMessage: 'Test error',
          attemptCount: expect.any(Number),
        }),
        'Workflow step execution failed'
      );
    });

    it('should log retry attempts at warn level', async () => {
      const executeMock = jest.fn();
      executeMock
        .mockRejectedValueOnce(new Error('Retryable failure'))
        .mockResolvedValueOnce({ success: true });

      const step = createWorkflowStep({
        ...createMockStepConfig({ id: 'retry-step', retryable: true }),
        execute: executeMock,
      });

      const config = createMockWorkflowConfig({
        steps: [step],
        retryPolicy: {
          maxAttempts: 2,
          backoffMultiplier: 1,
          initialDelayMs: 10,
          maxDelayMs: 100,
        },
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });
      await executor.execute({});

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          stepId: 'retry-step',
          attemptNumber: 1,
          nextAttemptDelayMs: 10,
        }),
        'Retrying workflow step after failure'
      );
    });

    it('should log workflow completion at info level', async () => {
      const step = createWorkflowStep({
        ...createMockStepConfig({ id: 'success-step' }),
        execute: jest.fn().mockResolvedValue({ result: 'success' }),
      });

      const config = createMockWorkflowConfig({
        id: 'success-workflow',
        steps: [step],
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });
      await executor.execute({});

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: 'success-workflow',
          durationMs: expect.any(Number),
          finalState: WorkflowState.COMPLETED,
        }),
        'Workflow execution completed'
      );
    });
  });

  describe('Error Result Structure', () => {
    it('should return structured error result on failure', async () => {
      const failingStep = createWorkflowStep({
        ...createMockStepConfig({ id: 'fail-step' }),
        execute: jest.fn().mockRejectedValue(new Error('Step failed')),
      });

      const config = createMockWorkflowConfig({
        steps: [failingStep],
      });

      const executor = new WorkflowExecutor(config, {
        logger: mockLogger,
        continueOnError: true, // Don't throw, return error result
      });

      const result: WorkflowResult = await executor.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe(WorkflowErrorCode.EXECUTION_FAILED);
      expect(result.error?.stepId).toBe('fail-step');
      expect(result.error?.message).toBe('Step failed');
      expect(result.completedSteps).toEqual([]);
      expect(result.failedStep).toBe('fail-step');
    });

    it('should include partial results when steps fail mid-workflow', async () => {
      const successStep = createWorkflowStep({
        ...createMockStepConfig({ id: 'step-1' }),
        execute: jest.fn().mockResolvedValue({ output1: 'data1' }),
      });

      const failingStep = createWorkflowStep({
        ...createMockStepConfig({ id: 'step-2', dependencies: ['step-1'] }),
        execute: jest.fn().mockRejectedValue(new Error('Step 2 failed')),
      });

      const config = createMockWorkflowConfig({
        steps: [successStep, failingStep],
      });

      const executor = new WorkflowExecutor(config, {
        logger: mockLogger,
        continueOnError: true,
      });

      const result: WorkflowResult = await executor.execute({});

      expect(result.success).toBe(false);
      expect(result.partialResults).toEqual({
        'step-1': { output1: 'data1' },
      });
      expect(result.completedSteps).toEqual(['step-1']);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle empty workflow gracefully', async () => {
      const config = createMockWorkflowConfig({
        steps: [],
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });
      const result = await executor.execute({});

      expect(result.success).toBe(true);
      expect(result.completedSteps).toEqual([]);
    });

    it('should handle step throwing non-Error object', async () => {
      const weirdStep = createWorkflowStep({
        ...createMockStepConfig({ id: 'weird-step' }),
        execute: jest.fn().mockRejectedValue('String error'), // Not an Error
      });

      const config = createMockWorkflowConfig({
        steps: [weirdStep],
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });

      try {
        await executor.execute({});
        fail('Expected error');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowExecutionError);
        const execError = error as WorkflowExecutionError;
        expect(execError.message).toBe('String error');
      }
    });

    it('should handle step throwing null', async () => {
      const nullStep = createWorkflowStep({
        ...createMockStepConfig({ id: 'null-step' }),
        execute: jest.fn().mockRejectedValue(null),
      });

      const config = createMockWorkflowConfig({
        steps: [nullStep],
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });

      try {
        await executor.execute({});
        fail('Expected error');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowExecutionError);
        const execError = error as WorkflowExecutionError;
        expect(execError.message).toBe('Unknown error');
      }
    });

    it('should handle concurrent step execution failures', async () => {
      const step1 = createWorkflowStep({
        ...createMockStepConfig({ id: 'parallel-1' }),
        execute: jest.fn().mockRejectedValue(new Error('Parallel 1 failed')),
      });

      const step2 = createWorkflowStep({
        ...createMockStepConfig({ id: 'parallel-2' }),
        execute: jest.fn().mockRejectedValue(new Error('Parallel 2 failed')),
      });

      const config = createMockWorkflowConfig({
        steps: [step1, step2], // No dependencies, run in parallel
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });

      await expect(executor.execute({})).rejects.toThrow(WorkflowExecutionError);

      // Both should have been attempted
      expect(step1.execute).toHaveBeenCalled();
      expect(step2.execute).toHaveBeenCalled();
    });

    it('should respect max delay cap in backoff calculation', async () => {
      const delays: number[] = [];
      jest.spyOn(global, 'setTimeout').mockImplementation(
        (callback: () => void, delay?: number) => {
          if (delay) delays.push(delay);
          return setTimeout(callback, 0);
        }
      );

      const executeMock = jest.fn().mockRejectedValue(new Error('Fail'));

      const step = createWorkflowStep({
        ...createMockStepConfig({ id: 'cap-step', retryable: true }),
        execute: executeMock,
      });

      const config = createMockWorkflowConfig({
        steps: [step],
        retryPolicy: {
          maxAttempts: 5,
          backoffMultiplier: 10,
          initialDelayMs: 100,
          maxDelayMs: 500, // Cap at 500ms
        },
      });

      const executor = new WorkflowExecutor(config, { logger: mockLogger });

      try {
        await executor.execute({});
      } catch {
        // Expected
      }

      // Delays should be: 100, 200, 400, 500 (capped), 500 (capped)
      expect(delays).toEqual([100, 200, 400, 500, 500]);

      jest.restoreAllMocks();
    });
  });
});