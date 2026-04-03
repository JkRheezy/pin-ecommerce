import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { Mock } from 'jest-mock';
import {
  WorkflowEngine,
  WorkflowStep,
  WorkflowContext,
  WorkflowResult,
  WorkflowStatus,
  StepStatus,
  WorkflowConfig,
  WorkflowError,
  WorkflowErrorCode,
} from './workflow';
import { Logger } from '../logging/logger';

// Mock the logger
jest.mock('../logging/logger');

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    engine = new WorkflowEngine(mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerStep', () => {
    it('should register a step successfully', () => {
      const step: WorkflowStep = {
        id: 'test-step',
        name: 'Test Step',
        execute: jest.fn(),
      };

      engine.registerStep(step);

      // Verify step is registered by trying to execute it
      expect(() => engine.getStep('test-step')).not.toThrow();
    });

    it('should throw error when registering duplicate step id', () => {
      const step: WorkflowStep = {
        id: 'duplicate-step',
        name: 'Duplicate Step',
        execute: jest.fn(),
      };

      engine.registerStep(step);

      expect(() => engine.registerStep(step)).toThrow(
        new WorkflowError(
          WorkflowErrorCode.STEP_ALREADY_EXISTS,
          'Step with id "duplicate-step" already exists'
        )
      );
    });

    it('should throw error for invalid step configuration', () => {
      const invalidStep = {
        id: '',
        name: 'Invalid Step',
        execute: jest.fn(),
      } as WorkflowStep;

      expect(() => engine.registerStep(invalidStep)).toThrow(
        new WorkflowError(
          WorkflowErrorCode.INVALID_STEP_CONFIG,
          'Step id is required and must be non-empty'
        )
      );
    });
  });

  describe('executeWorkflow', () => {
    const createMockConfig = (): WorkflowConfig => ({
      id: 'test-workflow',
      name: 'Test Workflow',
      steps: ['step-1', 'step-2'],
      timeoutMs: 5000,
    });

    it('should execute workflow successfully with all steps', async () => {
      const mockExecute1 = jest.fn().mockResolvedValue({ success: true, data: { value: 1 } });
      const mockExecute2 = jest.fn().mockResolvedValue({ success: true, data: { value: 2 } });

      engine.registerStep({
        id: 'step-1',
        name: 'Step 1',
        execute: mockExecute1,
      });

      engine.registerStep({
        id: 'step-2',
        name: 'Step 2',
        execute: mockExecute2,
      });

      const config = createMockConfig();
      const context: WorkflowContext = { input: { test: true } };

      const result = await engine.executeWorkflow(config, context);

      expect(result.status).toBe(WorkflowStatus.COMPLETED);
      expect(result.steps['step-1'].status).toBe(StepStatus.COMPLETED);
      expect(result.steps['step-2'].status).toBe(StepStatus.COMPLETED);
      expect(mockExecute1).toHaveBeenCalledWith(expect.objectContaining({ input: { test: true } }));
      expect(mockExecute2).toHaveBeenCalledWith(expect.objectContaining({ step1: { value: 1 } }));
    });

    it('should handle step failure and stop execution', async () => {
      const mockExecute1 = jest.fn().mockRejectedValue(new Error('Step failed'));
      const mockExecute2 = jest.fn();

      engine.registerStep({
        id: 'step-1',
        name: 'Step 1',
        execute: mockExecute1,
      });

      engine.registerStep({
        id: 'step-2',
        name: 'Step 2',
        execute: mockExecute2,
      });

      const config = createMockConfig();
      const context: WorkflowContext = {};

      const result = await engine.executeWorkflow(config, context);

      expect(result.status).toBe(WorkflowStatus.FAILED);
      expect(result.steps['step-1'].status).toBe(StepStatus.FAILED);
      expect(result.steps['step-1'].error).toBe('Step failed');
      expect(mockExecute2).not.toHaveBeenCalled();
    });

    it('should respect step dependencies', async () => {
      const executionOrder: string[] = [];

      engine.registerStep({
        id: 'step-a',
        name: 'Step A',
        execute: async () => {
          executionOrder.push('a');
          return { success: true };
        },
      });

      engine.registerStep({
        id: 'step-b',
        name: 'Step B',
        dependencies: ['step-a'],
        execute: async () => {
          executionOrder.push('b');
          return { success: true };
        },
      });

      engine.registerStep({
        id: 'step-c',
        name: 'Step C',
        dependencies: ['step-a'],
        execute: async () => {
          executionOrder.push('c');
          return { success: true };
        },
      });

      const config: WorkflowConfig = {
        id: 'dependency-workflow',
        name: 'Dependency Workflow',
        steps: ['step-a', 'step-b', 'step-c'],
      };

      await engine.executeWorkflow(config, {});

      // Step A must execute before B and C
      expect(executionOrder.indexOf('a')).toBeLessThan(executionOrder.indexOf('b'));
      expect(executionOrder.indexOf('a')).toBeLessThan(executionOrder.indexOf('c'));
    });

    it('should throw error for missing step in workflow', async () => {
      const config: WorkflowConfig = {
        id: 'invalid-workflow',
        name: 'Invalid Workflow',
        steps: ['non-existent-step'],
      };

      await expect(engine.executeWorkflow(config, {})).rejects.toThrow(
        new WorkflowError(
          WorkflowErrorCode.STEP_NOT_FOUND,
          'Step "non-existent-step" not found'
        )
      );
    });

    it('should handle workflow timeout', async () => {
      engine.registerStep({
        id: 'slow-step',
        name: 'Slow Step',
        execute: async () => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return { success: true };
        },
      });

      const config: WorkflowConfig = {
        id: 'timeout-workflow',
        name: 'Timeout Workflow',
        steps: ['slow-step'],
        timeoutMs: 100, // Very short timeout
      };

      await expect(engine.executeWorkflow(config, {})).rejects.toThrow(
        new WorkflowError(
          WorkflowErrorCode.TIMEOUT_EXCEEDED,
          'Workflow "timeout-workflow" exceeded timeout of 100ms'
        )
      );
    });

    it('should support conditional step execution', async () => {
      const mockExecute = jest.fn().mockResolvedValue({ success: true });

      engine.registerStep({
        id: 'conditional-step',
        name: 'Conditional Step',
        condition: (ctx) => ctx.shouldRun === true,
        execute: mockExecute,
      });

      const config: WorkflowConfig = {
        id: 'conditional-workflow',
        name: 'Conditional Workflow',
        steps: ['conditional-step'],
      };

      // Should skip when condition is false
      let result = await engine.executeWorkflow(config, { shouldRun: false });
      expect(mockExecute).not.toHaveBeenCalled();
      expect(result.steps['conditional-step'].status).toBe(StepStatus.SKIPPED);

      // Should execute when condition is true
      result = await engine.executeWorkflow(config, { shouldRun: true });
      expect(mockExecute).toHaveBeenCalled();
      expect(result.steps['conditional-step'].status).toBe(StepStatus.COMPLETED);
    });

    it('should retry failed steps when configured', async () => {
      let attempts = 0;
      const mockExecute = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return { success: true, data: { recovered: true } };
      });

      engine.registerStep({
        id: 'retry-step',
        name: 'Retry Step',
        retryConfig: {
          maxAttempts: 3,
          backoffMs: 10,
        },
        execute: mockExecute,
      });

      const config: WorkflowConfig = {
        id: 'retry-workflow',
        name: 'Retry Workflow',
        steps: ['retry-step'],
      };

      const result = await engine.executeWorkflow(config, {});

      expect(attempts).toBe(3);
      expect(result.steps['retry-step'].status).toBe(StepStatus.COMPLETED);
      expect(result.steps['retry-step'].attempts).toBe(3);
    });

    it('should fail after max retries exceeded', async () => {
      const mockExecute = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      engine.registerStep({
        id: 'failing-step',
        name: 'Failing Step',
        retryConfig: {
          maxAttempts: 2,
          backoffMs: 10,
        },
        execute: mockExecute,
      });

      const config: WorkflowConfig = {
        id: 'max-retry-workflow',
        name: 'Max Retry Workflow',
        steps: ['failing-step'],
      };

      const result = await engine.executeWorkflow(config, {});

      expect(mockExecute).toHaveBeenCalledTimes(2);
      expect(result.steps['failing-step'].status).toBe(StepStatus.FAILED);
      expect(result.status).toBe(WorkflowStatus.FAILED);
    });
  });

  describe('WorkflowContext propagation', () => {
    it('should accumulate step outputs in context', async () => {
      engine.registerStep({
        id: 'step-1',
        name: 'Step 1',
        execute: async () => ({ success: true, data: { userId: '123' } }),
      });

      engine.registerStep({
        id: 'step-2',
        name: 'Step 2',
        execute: async (ctx) => {
          // Step 2 should have access to step 1's output
          expect(ctx.step1).toEqual({ userId: '123' });
          return { success: true, data: { userName: 'John' } };
        },
      });

      const config: WorkflowConfig = {
        id: 'context-workflow',
        name: 'Context Workflow',
        steps: ['step-1', 'step-2'],
      };

      await engine.executeWorkflow(config, { initial: 'data' });
    });
  });

  describe('logging', () => {
    it('should log workflow start and completion', async () => {
      engine.registerStep({
        id: 'simple-step',
        name: 'Simple Step',
        execute: async () => ({ success: true }),
      });

      const config: WorkflowConfig = {
        id: 'logging-workflow',
        name: 'Logging Workflow',
        steps: ['simple-step'],
      };

      await engine.executeWorkflow(config, {});

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting workflow',
        expect.objectContaining({ workflowId: 'logging-workflow' })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Workflow completed',
        expect.objectContaining({ workflowId: 'logging-workflow', status: WorkflowStatus.COMPLETED })
      );
    });

    it('should log step failures with context', async () => {
      const error = new Error('Step error');
      engine.registerStep({
        id: 'failing-step',
        name: 'Failing Step',
        execute: async () => {
          throw error;
        },
      });

      const config: WorkflowConfig = {
        id: 'error-workflow',
        name: 'Error Workflow',
        steps: ['failing-step'],
      };

      await engine.executeWorkflow(config, {});

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Step execution failed',
        expect.objectContaining({
          stepId: 'failing-step',
          error: 'Step error',
        })
      );
    });
  });

  describe('WorkflowError', () => {
    it('should create error with correct code and message', () => {
      const error = new WorkflowError(WorkflowErrorCode.TIMEOUT_EXCEEDED, 'Timeout occurred');

      expect(error.code).toBe(WorkflowErrorCode.TIMEOUT_EXCEEDED);
      expect(error.message).toBe('Timeout occurred');
      expect(error.name).toBe('WorkflowError');
    });

    it('should be identifiable as WorkflowError', () => {
      const error = new WorkflowError(WorkflowErrorCode.STEP_NOT_FOUND, 'Not found');

      expect(error instanceof WorkflowError).toBe(true);
      expect(WorkflowError.isWorkflowError(error)).toBe(true);
    });
  });
});