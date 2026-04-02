/**
 * @file workflow.test.ts
 * @description Comprehensive test suite for workflow orchestration layer
 * @module Tests/AI/Workflow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  WorkflowConfig,
  WorkflowStep,
  WorkflowContext,
  WorkflowResult,
  StepHandler,
  StepTransition,
  WorkflowState,
} from './types';
import { WorkflowEngine } from './workflow';
import { createLogger } from '@/lib/utils/logger';
import { WorkflowError, WorkflowValidationError, WorkflowExecutionError } from './errors';

// Mock dependencies
vi.mock('@/lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function () {
      return this;
    }),
  })),
}));

vi.mock('./errors', () => ({
  WorkflowError: class WorkflowError extends Error {
    constructor(message: string, public readonly code: string) {
      super(message);
      this.name = 'WorkflowError';
    }
  },
  WorkflowValidationError: class WorkflowValidationError extends Error {
    constructor(message: string, public readonly details: unknown) {
      super(message);
      this.name = 'WorkflowValidationError';
    }
  },
  WorkflowExecutionError: class WorkflowExecutionError extends Error {
    constructor(message: string, public readonly stepId: string, public readonly cause?: Error) {
      super(message);
      this.name = 'WorkflowExecutionError';
    }
  },
}));

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Creates a mock workflow step for testing
 */
const createMockStep = (overrides: Partial<WorkflowStep> = {}): WorkflowStep => ({
  id: 'test-step',
  name: 'Test Step',
  handler: 'testHandler',
  config: {},
  transitions: [],
  ...overrides,
});

/**
 * Creates a mock workflow configuration for testing
 */
const createMockConfig = (overrides: Partial<WorkflowConfig> = {}): WorkflowConfig => ({
  id: 'test-workflow',
  name: 'Test Workflow',
  version: '1.0.0',
  steps: [createMockStep()],
  initialStep: 'test-step',
  ...overrides,
});

/**
 * Creates a mock workflow context for testing
 */
const createMockContext = (overrides: Partial<WorkflowContext> = {}): WorkflowContext => ({
  workflowId: 'test-workflow',
  executionId: 'exec-123',
  input: {},
  state: {},
  metadata: {
    startedAt: new Date(),
    attempt: 1,
  },
  ...overrides,
});

/**
 * Creates a mock step handler for testing
 */
const createMockHandler = (result: unknown = { success: true }): StepHandler => ({
  execute: vi.fn().mockResolvedValue(result),
  validate: vi.fn().mockResolvedValue(true),
  rollback: vi.fn().mockResolvedValue(undefined),
});

// =============================================================================
// Test Suite: WorkflowEngine
// =============================================================================

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  let mockLogger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createLogger('test');
    engine = new WorkflowEngine();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Layer 1: Types - Type Safety and Validation
  // ===========================================================================

  describe('Types Layer', () => {
    it('should enforce WorkflowConfig type constraints', () => {
      const config = createMockConfig({
        id: 'typed-workflow',
        version: '2.0.0',
        steps: [
          createMockStep({ id: 'step-1', handler: 'handler1' }),
          createMockStep({ id: 'step-2', handler: 'handler2' }),
        ],
      });

      // TypeScript compile-time check: config must have required fields
      expect(config.id).toBeDefined();
      expect(config.steps).toBeInstanceOf(Array);
      expect(config.initialStep).toBeDefined();
    });

    it('should enforce WorkflowContext type constraints', () => {
      const context = createMockContext({
        input: { userId: 'user-123' },
        state: { currentStep: 'step-1' },
      });

      expect(context.workflowId).toBe('test-workflow');
      expect(context.executionId).toMatch(/^exec-/);
      expect(context.metadata.startedAt).toBeInstanceOf(Date);
    });

    it('should enforce StepTransition type constraints', () => {
      const transition: StepTransition = {
        condition: 'success',
        targetStep: 'next-step',
        transform: (data: unknown) => data,
      };

      expect(transition.condition).toBeDefined();
      expect(transition.targetStep).toBeDefined();
    });
  });

  // ===========================================================================
  // Layer 2: Config - Configuration Management
  // ===========================================================================

  describe('Config Layer', () => {
    it('should validate workflow configuration on registration', async () => {
      const config = createMockConfig({
        id: 'valid-config',
        steps: [
          createMockStep({ id: 'start', handler: 'startHandler' }),
          createMockStep({ id: 'end', handler: 'endHandler' }),
        ],
        initialStep: 'start',
      });

      await expect(engine.registerWorkflow(config)).resolves.not.toThrow();
    });

    it('should reject invalid workflow configuration', async () => {
      const invalidConfig = createMockConfig({
        id: 'invalid-config',
        steps: [], // Empty steps array is invalid
      });

      await expect(engine.registerWorkflow(invalidConfig)).rejects.toThrow(
        WorkflowValidationError
      );
    });

    it('should reject duplicate workflow registration', async () => {
      const config = createMockConfig({ id: 'duplicate-workflow' });

      await engine.registerWorkflow(config);
      await expect(engine.registerWorkflow(config)).rejects.toThrow(
        WorkflowValidationError
      );
    });

    it('should validate step references in transitions', async () => {
      const config = createMockConfig({
        id: 'bad-transitions',
        steps: [
          createMockStep({
            id: 'step-1',
            transitions: [
              { condition: 'success', targetStep: 'non-existent-step' },
            ],
          }),
        ],
      });

      await expect(engine.registerWorkflow(config)).rejects.toThrow(
        WorkflowValidationError
      );
    });
  });

  // ===========================================================================
  // Layer 3: Repo - State Persistence and Retrieval
  // ===========================================================================

  describe('Repo Layer', () => {
    it('should persist workflow state after each step', async () => {
      const config = createMockConfig({
        id: 'stateful-workflow',
        steps: [
          createMockStep({ id: 'step-1', handler: 'handler1' }),
          createMockStep({ id: 'step-2', handler: 'handler2' }),
        ],
      });

      const mockPersist = vi.fn().mockResolvedValue(undefined);
      engine.setStatePersistence(mockPersist);

      await engine.registerWorkflow(config);
      const context = createMockContext();

      await engine.execute(config.id, context);

      expect(mockPersist).toHaveBeenCalled();
      expect(mockPersist.mock.calls[0][0]).toMatchObject({
        workflowId: config.id,
        executionId: context.executionId,
      });
    });

    it('should retrieve persisted state on resume', async () => {
      const savedState: WorkflowState = {
        currentStep: 'step-2',
        data: { previousResult: 'value' },
        completedSteps: ['step-1'],
      };

      const mockRetrieve = vi.fn().mockResolvedValue(savedState);
      engine.setStateRetrieval(mockRetrieve);

      const result = await engine.resume('test-workflow', 'exec-123');

      expect(mockRetrieve).toHaveBeenCalledWith('test-workflow', 'exec-123');
      expect(result.context.state).toEqual(savedState.data);
    });

    it('should handle state persistence failures gracefully', async () => {
      const config = createMockConfig();
      const mockPersist = vi.fn().mockRejectedValue(new Error('DB connection lost'));

      engine.setStatePersistence(mockPersist);

      await engine.registerWorkflow(config);
      const context = createMockContext();

      await expect(engine.execute(config.id, context)).rejects.toThrow(
        WorkflowExecutionError
      );
    });
  });

  // ===========================================================================
  // Layer 4: Service - Business Logic and Orchestration
  // ===========================================================================

  describe('Service Layer', () => {
    it('should execute steps in sequence', async () => {
      const executionOrder: string[] = [];

      const step1 = createMockStep({
        id: 'step-1',
        handler: 'handler1',
        transitions: [{ condition: 'success', targetStep: 'step-2' }],
      });

      const step2 = createMockStep({
        id: 'step-2',
        handler: 'handler2',
      });

      const config = createMockConfig({
        id: 'sequential-workflow',
        steps: [step1, step2],
        initialStep: 'step-1',
      });

      const handler1 = createMockHandler({ status: 'complete', next: 'step-2' });
      const handler2 = createMockHandler({ status: 'done' });

      handler1.execute = vi.fn().mockImplementation(async () => {
        executionOrder.push('step-1');
        return { status: 'complete' };
      });

      handler2.execute = vi.fn().mockImplementation(async () => {
        executionOrder.push('step-2');
        return { status: 'done' };
      });

      engine.registerHandler('handler1', handler1);
      engine.registerHandler('handler2', handler2);

      await engine.registerWorkflow(config);
      await engine.execute(config.id, createMockContext());

      expect(executionOrder).toEqual(['step-1', 'step-2']);
    });

    it('should handle conditional branching based on step results', async () => {
      const step1 = createMockStep({
        id: 'decision-step',
        handler: 'decisionHandler',
        transitions: [
          { condition: 'approved', targetStep: 'approval-path' },
          { condition: 'rejected', targetStep: 'rejection-path' },
        ],
      });

      const config = createMockConfig({
        id: 'branching-workflow',
        steps: [
          step1,
          createMockStep({ id: 'approval-path', handler: 'approvalHandler' }),
          createMockStep({ id: 'rejection-path', handler: 'rejectionHandler' }),
        ],
        initialStep: 'decision-step',
      });

      const decisionHandler = createMockHandler({ decision: 'approved' });
      const approvalHandler = createMockHandler();
      const rejectionHandler = createMockHandler();

      engine.registerHandler('decisionHandler', decisionHandler);
      engine.registerHandler('approvalHandler', approvalHandler);
      engine.registerHandler('rejectionHandler', rejectionHandler);

      await engine.registerWorkflow(config);
      await engine.execute(config.id, createMockContext());

      expect(approvalHandler.execute).toHaveBeenCalled();
      expect(rejectionHandler.execute).not.toHaveBeenCalled();
    });

    it('should execute step validation before execution', async () => {
      const step = createMockStep({
        id: 'validated-step',
        handler: 'validatedHandler',
      });

      const handler = createMockHandler();
      handler.validate = vi.fn().mockResolvedValue(false); // Validation fails

      engine.registerHandler('validatedHandler', handler);

      const config = createMockConfig({
        id: 'validation-workflow',
        steps: [step],
      });

      await engine.registerWorkflow(config);

      await expect(engine.execute(config.id, createMockContext())).rejects.toThrow(
        WorkflowValidationError
      );

      expect(handler.validate).toHaveBeenCalled();
      expect(handler.execute).not.toHaveBeenCalled();
    });

    it('should support parallel step execution', async () => {
      const config = createMockConfig({
        id: 'parallel-workflow',
        steps: [
          createMockStep({
            id: 'fork-step',
            handler: 'forkHandler',
            parallel: true,
            parallelSteps: ['parallel-1', 'parallel-2', 'parallel-3'],
          }),
          createMockStep({ id: 'parallel-1', handler: 'handler1' }),
          createMockStep({ id: 'parallel-2', handler: 'handler2' }),
          createMockStep({ id: 'parallel-3', handler: 'handler3' }),
          createMockStep({ id: 'join-step', handler: 'joinHandler' }),
        ],
      });

      const handlers = {
        forkHandler: createMockHandler(),
        handler1: createMockHandler({ result: 1 }),
        handler2: createMockHandler({ result: 2 }),
        handler3: createMockHandler({ result: 3 }),
        joinHandler: createMockHandler(),
      };

      Object.entries(handlers).forEach(([name, handler]) => {
        engine.registerHandler(name, handler);
      });

      await engine.registerWorkflow(config);
      const result = await engine.execute(config.id, createMockContext());

      // All parallel handlers should be called
      expect(handlers.handler1.execute).toHaveBeenCalled();
      expect(handlers.handler2.execute).toHaveBeenCalled();
      expect(handlers.handler3.execute).toHaveBeenCalled();

      // Join step should receive aggregated results
      expect(handlers.joinHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          parallelResults: expect.arrayContaining([
            expect.objectContaining({ result: expect.any(Number) }),
          ]),
        })
      );
    });
  });

  // ===========================================================================
  // Layer 5: Runtime - Execution Environment and Error Handling
  // ===========================================================================

  describe('Runtime Layer', () => {
    it('should handle step execution errors with retry logic', async () => {
      const step = createMockStep({
        id: 'flaky-step',
        handler: 'flakyHandler',
        retryPolicy: {
          maxAttempts: 3,
          backoffMs: 100,
          retryableErrors: ['TransientError'],
        },
      });

      const handler = createMockHandler();
      let attemptCount = 0;

      handler.execute = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          const error = new Error('Transient failure');
          error.name = 'TransientError';
          throw error;
        }
        return { success: true };
      });

      engine.registerHandler('flakyHandler', handler);

      const config = createMockConfig({
        id: 'retry-workflow',
        steps: [step],
      });

      await engine.registerWorkflow(config);
      const result = await engine.execute(config.id, createMockContext());

      expect(attemptCount).toBe(3);
      expect(handler.execute).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
    });

    it('should execute rollback on failure when configured', async () => {
      const step1 = createMockStep({
        id: 'step-1',
        handler: 'compensatableHandler',
        compensatingStep: 'rollback-1',
      });

      const step2 = createMockStep({
        id: 'step-2',
        handler: 'failingHandler',
      });

      const config = createMockConfig({
        id: 'saga-workflow',
        steps: [step1, step2],
      });

      const compensatableHandler = createMockHandler();
      const rollbackHandler = createMockHandler();
      const failingHandler = createMockHandler();

      failingHandler.execute = vi.fn().mockRejectedValue(new Error('Step failed'));

      engine.registerHandler('compensatableHandler', compensatableHandler);
      engine.registerHandler('rollback-1', rollbackHandler);
      engine.registerHandler('failingHandler', failingHandler);

      await engine.registerWorkflow(config);

      await expect(engine.execute(config.id, createMockContext())).rejects.toThrow();

      // Rollback should be executed for completed steps
      expect(rollbackHandler.execute).toHaveBeenCalled();
    });

    it('should enforce step timeout', async () => {
      const step = createMockStep({
        id: 'slow-step',
        handler: 'slowHandler',
        timeoutMs: 100, // 100ms timeout
      });

      const handler = createMockHandler();
      handler.execute = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 500)) // Takes 500ms
      );

      engine.registerHandler('slowHandler', handler);

      const config = createMockConfig({
        id: 'timeout-workflow',
        steps: [step],
      });

      await engine.registerWorkflow(config);

      await expect(engine.execute(config.id, createMockContext())).rejects.toThrow(
        WorkflowExecutionError
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      const config = createMockConfig();
      
      // Simulate internal engine error
      vi.spyOn(engine as unknown as { validateConfig: () => void }, 'validateConfig').mockImplementation(() => {
        throw new Error('Unexpected internal error');
      });

      await expect(engine.registerWorkflow(config)).rejects.toThrow(WorkflowError);
    });

    it('should support workflow cancellation', async () => {
      const config = createMockConfig({
        id: 'cancellable-workflow',
        steps: [
          createMockStep({ id: 'long-step', handler: 'longHandler' }),
        ],
      });

      const handler = createMockHandler();
      handler.execute = vi.fn().mockImplementation(async (ctx: WorkflowContext) => {
        // Check for cancellation signal
        if (ctx.signals?.cancelled) {
          throw new Error('Workflow cancelled');
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return { completed: true };
      });

      engine.registerHandler('longHandler', handler);

      await engine.registerWorkflow(config);

      const executionPromise = engine.execute(config.id, createMockContext());

      // Cancel after 50ms
      setTimeout(() => engine.cancel('cancellable-workflow', 'exec-123'), 50);

      await expect(executionPromise).rejects.toThrow('cancelled');
    });
  });

  // ===========================================================================
  // Layer 6: UI - Result Formatting and Observability
  // ===========================================================================

  describe('UI Layer', () => {
    it('should return structured workflow result', async () => {
      const config = createMockConfig({
        id: 'result-workflow',
        steps: [createMockStep({ id: 'final-step', handler: 'resultHandler' })],
      });

      const handler = createMockHandler({
        output: { processedData: 'value', count: 42 },
      });

      engine.registerHandler('resultHandler', handler);

      await engine.registerWorkflow(config);
      const result: WorkflowResult = await engine.execute(config.id, createMockContext());

      expect(result).toMatchObject({
        success: true,
        workflowId: config.id,
        executionId: expect.any(String),
        finalState: expect.any(Object),
        completedAt: expect.any(Date),
        metrics: {
          durationMs: expect.any(Number),
          stepsExecuted: expect.any(Number),
        },
      });
    });

    it('should provide execution progress events', async () => {
      const progressEvents: Array<{ stepId: string; status: string }> = [];

      const config = createMockConfig({
        id: 'progress-workflow',
        steps: [
          createMockStep({ id: 'step-1', handler: 'handler1' }),
          createMockStep({ id: 'step-2', handler: 'handler2' }),
        ],
      });

      engine.onProgress((event) => {
        progressEvents.push({
          stepId: event.stepId,
          status: event.status,
        });
      });

      engine.registerHandler('handler1', createMockHandler());
      engine.registerHandler('handler2', createMockHandler());

      await engine.registerWorkflow(config);
      await engine.execute(config.id, createMockContext());

      expect(progressEvents).toHaveLength(4); // 2 steps × 2 events (start, complete)
      expect(progressEvents[0]).toEqual({ stepId: 'step-1', status: 'started' });
      expect(progressEvents[progressEvents.length - 1]).toEqual({
        stepId: 'step-2',
        status: 'completed',
      });
    });

    it('should format error results for UI consumption', async () => {
      const config = createMockConfig({
        id: 'error-workflow',
        steps: [createMockStep({ id: 'error-step', handler: 'errorHandler' })],
      });

      const handler = createMockHandler();
      handler.execute = vi.fn().mockRejectedValue(
        new WorkflowExecutionError('Processing failed', 'error-step', new Error('DB error'))
      );

      engine.registerHandler('errorHandler', handler);

      await engine.registerWorkflow(config);

      try {
        await engine.execute(config.id, createMockContext());
      } catch (error) {
        // Error should be structured for UI display
        expect(error).toMatchObject({
          message: expect.stringContaining('Processing failed'),
          stepId: 'error-step',
          recoverable: expect.any(Boolean),
          suggestedAction: expect.any(String),
        });
      }
    });

    it('should support execution tracing for debugging', async () => {
      const config = createMockConfig({
        id: 'traceable-workflow',
        steps: [createMockStep({ id: 'traced-step', handler: 'tracedHandler' })],
      });

      engine.enableTracing(true);

      const handler = createMockHandler({ result: 'data' });
      engine.registerHandler('tracedHandler', handler);

      await engine.registerWorkflow(config);
      const result = await engine.execute(config.id, createMockContext());

      expect(result.trace).toBeDefined();
      expect(result.trace).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            timestamp: expect.any(Date),
            stepId: expect.any(String),
            durationMs: expect.any(Number),
            input: expect.any(Object),
            output: expect.any(Object),
          }),
        ])
      );
    });
  });

  // ===========================================================================
  // Edge Cases and Integration Tests
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle empty workflow (single step)', async () => {
      const config = createMockConfig({
        id: 'minimal-workflow',
        steps: [createMockStep({ id: 'only-step', handler: 'simpleHandler' })],
      });

      engine.registerHandler('simpleHandler', createMockHandler({ done: true }));

      await engine.registerWorkflow(config);
      const result = await engine.execute(config.id, createMockContext());

      expect(result.success).toBe(true);
      expect(result.metrics.stepsExecuted).toBe(1);
    });

    it('should handle circular workflow detection', async () => {
      const config = createMockConfig({
        id: 'circular-workflow',
        steps: [
          createMockStep({
            id: 'a',
            handler: 'handlerA',
            transitions: [{ condition: 'loop', targetStep: 'b' }],
          }),
          createMockStep({
            id: 'b',
            handler: 'handlerB',
            transitions: [{ condition: 'back', targetStep: 'a' }],
          }),
        ],
        initialStep: 'a',
      });

      await expect(engine.registerWorkflow(config)).rejects.toThrow(
        WorkflowValidationError
      );
    });

    it('should handle deeply nested workflow execution', async () => {
      const depth = 10;
      const steps: WorkflowStep[] = [];

      for (let i = 0; i < depth; i++) {
        steps.push(
          createMockStep({
            id: `deep-step-${i}`,
            handler: `deepHandler${i}`,
            transitions:
              i < depth - 1 ? [{ condition: 'next', targetStep: `deep-step-${i + 1}` }] : [],
          })
        );
      }

      const config = createMockConfig({
        id: 'deep-workflow',
        steps,
        initialStep: 'deep-step-0',
      });

      steps.forEach((step, i) => {
        engine.registerHandler(
          `deepHandler${i}`,
          createMockHandler({ level: i })
        );
      });

      await engine.registerWorkflow(config);
      const result = await engine.execute(config.id, createMockContext());

      expect(result.success).toBe(true);
      expect(result.metrics.stepsExecuted).toBe(depth);
    });

    it('should handle concurrent workflow executions', async () => {
      const config = createMockConfig({
        id: 'concurrent-workflow',
        steps: [createMockStep({ id: 'concurrent-step', handler: 'concurrentHandler' })],
      });

      let concurrentExecutions = 0;
      let maxConcurrent = 0;

      const handler = createMockHandler();
      handler.execute = vi.fn().mockImplementation(async () => {
        concurrentExecutions++;
        maxConcurrent = Math.max(maxConcurrent, concurrentExecutions);
        await new Promise((resolve) => setTimeout(resolve, 50));
        concurrentExecutions--;
        return { executed: true };
      });

      engine.registerHandler('concurrentHandler', handler);
      await engine.registerWorkflow(config);

      // Execute 5 workflows concurrently
      const executions = Array(5)
        .fill(null)
        .map((_, i) =>
          engine.execute(config.id, createMockContext({ executionId: `exec-${i}` }))
        );

      await Promise.all(executions);

      expect(maxConcurrent).toBeGreaterThan(1);
      expect(handler.execute).toHaveBeenCalledTimes(5);
    });

    it('should sanitize sensitive data in logs and results', async () => {
      const config = createMockConfig({
        id: 'sensitive-workflow',
        steps: [createMockStep({ id: 'auth-step', handler: 'authHandler' })],
      });

      const handler = createMockHandler({
        token: 'secret-token-123',
        password: 'hunter2',
        user: { name: 'John', ssn: '123-45-6789' },
      });

      engine.registerHandler('authHandler', handler);

      await engine.registerWorkflow(config);
      const result = await engine.execute(
        config.id,
        createMockContext({ input: { apiKey: 'sk-live-abc123' } })
      );

      // Verify sensitive fields are redacted
      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain('secret-token-123');
      expect(resultStr).not.toContain('hunter2');
      expect(resultStr).not.toContain('123-45-6789');
      expect(resultStr).not.toContain('sk-live-abc123');
    });
  });
});