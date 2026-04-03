import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkflowConfig, WorkflowStep, WorkflowContext } from '../types/workflow.types';
import { WorkflowService } from '../services/workflow.service';
import { WorkflowError, WorkflowErrorCode } from '../errors/workflow.error';

/**
 * Types Layer: Test fixtures and type definitions for workflow error handling tests
 */
interface ErrorTestFixture {
  name: string;
  config: WorkflowConfig;
  expectedError: WorkflowErrorCode;
  context?: Partial<WorkflowContext>;
}

/**
 * Config Layer: Test configuration constants
 */
const MOCK_STEP_TIMEOUT_MS = 100;
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Service Layer: Workflow error handling test suite
 */
describe('WorkflowService - Error Handling', () => {
  let workflowService: WorkflowService;

  beforeEach(() => {
    workflowService = new WorkflowService({
      timeoutMs: MOCK_STEP_TIMEOUT_MS,
      maxRetries: MAX_RETRY_ATTEMPTS,
    });
    vi.clearAllMocks();
  });

  /**
   * Runtime Layer: Invalid configuration error tests
   */
  describe('Configuration Validation Errors', () => {
    const invalidConfigFixtures: ErrorTestFixture[] = [
      {
        name: 'throws WORKFLOW_INVALID_CONFIG when steps array is empty',
        config: { id: 'empty-workflow', steps: [] },
        expectedError: WorkflowErrorCode.WORKFLOW_INVALID_CONFIG,
      },
      {
        name: 'throws WORKFLOW_INVALID_CONFIG when step ID is missing',
        config: {
          id: 'missing-step-id',
          steps: [{ type: 'transform', handler: async () => ({}) } as WorkflowStep],
        },
        expectedError: WorkflowErrorCode.WORKFLOW_INVALID_CONFIG,
      },
      {
        name: 'throws WORKFLOW_INVALID_CONFIG when duplicate step IDs exist',
        config: {
          id: 'duplicate-ids',
          steps: [
            { id: 'step-1', type: 'transform', handler: async () => ({}) },
            { id: 'step-1', type: 'filter', handler: async () => ({}) },
          ] as WorkflowStep[],
        },
        expectedError: WorkflowErrorCode.WORKFLOW_INVALID_CONFIG,
      },
      {
        name: 'throws WORKFLOW_INVALID_CONFIG when circular dependency detected',
        config: {
          id: 'circular-deps',
          steps: [
            { id: 'step-a', type: 'transform', dependsOn: ['step-b'], handler: async () => ({}) },
            { id: 'step-b', type: 'transform', dependsOn: ['step-a'], handler: async () => ({}) },
          ] as WorkflowStep[],
        },
        expectedError: WorkflowErrorCode.WORKFLOW_INVALID_CONFIG,
      },
    ];

    it.each(invalidConfigFixtures)('$name', async ({ config, expectedError }) => {
      // Act & Assert: Verify proper error is thrown with correct code
      await expect(workflowService.execute(config, {})).rejects.toThrow(
        expect.objectContaining({
          code: expectedError,
          workflowId: config.id,
        })
      );
    });
  });

  /**
   * Runtime Layer: Step execution error tests
   */
  describe('Step Execution Errors', () => {
    it('throws WORKFLOW_STEP_FAILED when step handler throws', async () => {
      // Arrange: Create workflow with failing step
      const failingStep: WorkflowStep = {
        id: 'failing-step',
        type: 'transform',
        handler: async () => {
          throw new Error('Step execution failed');
        },
      };

      const config: WorkflowConfig = {
        id: 'test-workflow',
        steps: [failingStep],
      };

      // Act & Assert: Verify step failure is properly wrapped
      const error = await workflowService.execute(config, {}).catch((e) => e);

      expect(error).toBeInstanceOf(WorkflowError);
      expect(error.code).toBe(WorkflowErrorCode.WORKFLOW_STEP_FAILED);
      expect(error.stepId).toBe('failing-step');
      expect(error.cause).toBeInstanceOf(Error);
      expect(error.cause.message).toBe('Step execution failed');
    });

    it('throws WORKFLOW_STEP_TIMEOUT when step exceeds timeout', async () => {
      // Arrange: Create slow step that exceeds timeout
      const slowStep: WorkflowStep = {
        id: 'slow-step',
        type: 'transform',
        handler: async () => {
          // Simulate long-running operation
          await new Promise((resolve) => setTimeout(resolve, MOCK_STEP_TIMEOUT_MS * 2));
          return { result: 'completed' };
        },
      };

      const config: WorkflowConfig = {
        id: 'timeout-workflow',
        steps: [slowStep],
      };

      // Act & Assert: Verify timeout error is thrown
      await expect(workflowService.execute(config, {})).rejects.toThrow(
        expect.objectContaining({
          code: WorkflowErrorCode.WORKFLOW_STEP_TIMEOUT,
          stepId: 'slow-step',
        })
      );
    });

    it('retries failed steps up to MAX_RETRY_ATTEMPTS before failing', async () => {
      // Arrange: Track call count for retry verification
      let callCount = 0;
      const flakyStep: WorkflowStep = {
        id: 'flaky-step',
        type: 'transform',
        handler: async () => {
          callCount++;
          if (callCount < MAX_RETRY_ATTEMPTS) {
            throw new Error(`Attempt ${callCount} failed`);
          }
          return { success: true };
        },
      };

      const config: WorkflowConfig = {
        id: 'retry-workflow',
        steps: [flakyStep],
      };

      // Act: Execute workflow
      const result = await workflowService.execute(config, {});

      // Assert: Verify retries occurred and final result succeeded
      expect(callCount).toBe(MAX_RETRY_ATTEMPTS);
      expect(result).toEqual({ success: true });
    });

    it('throws WORKFLOW_STEP_FAILED after exhausting all retries', async () => {
      // Arrange: Create consistently failing step
      const failingStep: WorkflowStep = {
        id: 'always-fails',
        type: 'transform',
        handler: async () => {
          throw new Error('Persistent failure');
        },
      };

      const config: WorkflowConfig = {
        id: 'exhausted-retry-workflow',
        steps: [failingStep],
      };

      // Act & Assert: Verify retry exhaustion
      const error = await workflowService.execute(config, {}).catch((e) => e);

      expect(error.code).toBe(WorkflowErrorCode.WORKFLOW_STEP_FAILED);
      expect(error.retryCount).toBe(MAX_RETRY_ATTEMPTS);
    });
  });

  /**
   * Runtime Layer: Context and state error tests
   */
  describe('Context and State Errors', () => {
    it('throws WORKFLOW_INVALID_CONTEXT when context validation fails', async () => {
      // Arrange: Create step with context validator
      const config: WorkflowConfig = {
        id: 'context-validation-workflow',
        steps: [
          {
            id: 'validate-context',
            type: 'validator',
            validateContext: (ctx) => {
              if (!ctx.requiredField) {
                throw new Error('Missing required field');
              }
              return true;
            },
            handler: async () => ({ validated: true }),
          } as WorkflowStep,
        ],
      };

      // Act & Assert: Verify context validation error
      await expect(workflowService.execute(config, {})).rejects.toThrow(
        expect.objectContaining({
          code: WorkflowErrorCode.WORKFLOW_INVALID_CONTEXT,
          stepId: 'validate-context',
        })
      );
    });

    it('throws WORKFLOW_STATE_CORRUPTED when state mutation is detected', async () => {
      // Arrange: Create step that attempts to mutate frozen state
      const config: WorkflowConfig = {
        id: 'immutable-state-workflow',
        steps: [
          {
            id: 'mutate-state',
            type: 'transform',
            handler: async (ctx, state) => {
              // Attempt to mutate frozen state object
              (state as Record<string, unknown>).newProperty = 'value';
              return state;
            },
          } as WorkflowStep,
        ],
      };

      // Act & Assert: Verify state corruption is detected
      await expect(workflowService.execute(config, { initial: 'data' })).rejects.toThrow(
        expect.objectContaining({
          code: WorkflowErrorCode.WORKFLOW_STATE_CORRUPTED,
        })
      );
    });
  });

  /**
   * Runtime Layer: Dependency and orchestration error tests
   */
  describe('Dependency and Orchestration Errors', () => {
    it('throws WORKFLOW_DEPENDENCY_MISSING when required step output is unavailable', async () => {
      // Arrange: Create workflow with missing dependency output
      const config: WorkflowConfig = {
        id: 'missing-dep-workflow',
        steps: [
          {
            id: 'producer',
            type: 'transform',
            handler: async () => ({ output: null }), // Missing expected output
          },
          {
            id: 'consumer',
            type: 'transform',
            dependsOn: ['producer'],
            requiredOutput: ['mandatoryField'],
            handler: async (ctx, state, deps) => {
              // Attempt to access missing field
              const value = deps.producer.mandatoryField;
              return { value };
            },
          } as WorkflowStep,
        ],
      };

      // Act & Assert: Verify dependency error
      await expect(workflowService.execute(config, {})).rejects.toThrow(
        expect.objectContaining({
          code: WorkflowErrorCode.WORKFLOW_DEPENDENCY_MISSING,
          stepId: 'consumer',
          missingDependency: 'mandatoryField',
        })
      );
    });

    it('throws WORKFLOW_ORCHESTRATION_FAILED when parallel execution fails', async () => {
      // Arrange: Create parallel steps where one fails
      const config: WorkflowConfig = {
        id: 'parallel-fail-workflow',
        steps: [
          {
            id: 'parallel-1',
            type: 'transform',
            handler: async () => ({ success: true }),
          },
          {
            id: 'parallel-2',
            type: 'transform',
            handler: async () => {
              throw new Error('Parallel step failed');
            },
          },
        ],
        executionMode: 'parallel',
      };

      // Act & Assert: Verify orchestration handles partial failure
      const error = await workflowService.execute(config, {}).catch((e) => e);

      expect(error.code).toBe(WorkflowErrorCode.WORKFLOW_ORCHESTRATION_FAILED);
      expect(error.failedSteps).toContain('parallel-2');
      expect(error.completedSteps).toContain('parallel-1');
    });
  });

  /**
   * Runtime Layer: Recovery and compensation error tests
   */
  describe('Recovery and Compensation Errors', () => {
    it('throws WORKFLOW_COMPENSATION_FAILED when compensation handler errors', async () => {
      // Arrange: Create step with failing compensation
      const config: WorkflowConfig = {
        id: 'compensation-fail-workflow',
        steps: [
          {
            id: 'compensatable-step',
            type: 'transaction',
            handler: async () => {
              throw new Error('Primary action failed');
            },
            compensate: async () => {
              throw new Error('Compensation also failed');
            },
          } as WorkflowStep,
        ],
      };

      // Act & Assert: Verify compensation failure is tracked
      const error = await workflowService.execute(config, {}).catch((e) => e);

      expect(error.code).toBe(WorkflowErrorCode.WORKFLOW_COMPENSATION_FAILED);
      expect(error.originalError.code).toBe(WorkflowErrorCode.WORKFLOW_STEP_FAILED);
    });

    it('executes compensation for all completed steps on failure', async () => {
      // Arrange: Track compensation calls
      const compensatedSteps: string[] = [];
      const config: WorkflowConfig = {
        id: 'full-compensation-workflow',
        steps: [
          {
            id: 'step-1',
            type: 'transaction',
            handler: async () => ({ completed: true }),
            compensate: async () => {
              compensatedSteps.push('step-1');
            },
          } as WorkflowStep,
          {
            id: 'step-2',
            type: 'transaction',
            handler: async () => ({ completed: true }),
            compensate: async () => {
              compensatedSteps.push('step-2');
            },
          } as WorkflowStep,
          {
            id: 'step-3',
            type: 'transaction',
            handler: async () => {
              throw new Error('Final step fails');
            },
            compensate: async () => {
              compensatedSteps.push('step-3');
            },
          } as WorkflowStep,
        ],
      };

      // Act: Execute and catch expected failure
      await workflowService.execute(config, {}).catch(() => {
        // Expected to fail
      });

      // Assert: Verify compensation ran in reverse order for completed steps
      expect(compensatedSteps).toEqual(['step-2', 'step-1']);
    });
  });

  /**
   * Runtime Layer: Error serialization and logging tests
   */
  describe('Error Serialization and Logging', () => {
    it('serializes WorkflowError to structured log format', async () => {
      // Arrange: Create and capture error
      const config: WorkflowConfig = {
        id: 'error-serialization-workflow',
        steps: [
          {
            id: 'error-step',
            type: 'transform',
            handler: async () => {
              throw new Error('Serializable error');
            },
          },
        ],
      };

      // Act: Execute and serialize error
      const error = await workflowService.execute(config, {}).catch((e) => e);
      const serialized = error.toJSON();

      // Assert: Verify structured format matches logging requirements
      expect(serialized).toMatchObject({
        code: WorkflowErrorCode.WORKFLOW_STEP_FAILED,
        workflowId: 'error-serialization-workflow',
        stepId: 'error-step',
        timestamp: expect.any(String),
        stack: expect.any(String),
        cause: {
          message: 'Serializable error',
          stack: expect.any(String),
        },
      });
    });

    it('includes correlation ID in error for distributed tracing', async () => {
      // Arrange: Create workflow with correlation context
      const correlationId = 'test-correlation-123';
      const config: WorkflowConfig = {
        id: 'tracing-workflow',
        steps: [
          {
            id: 'traced-step',
            type: 'transform',
            handler: async () => {
              throw new Error('Traced error');
            },
          },
        ],
      };

      // Act: Execute with correlation context
      const error = await workflowService
        .execute(config, {}, { correlationId })
        .catch((e) => e);

      // Assert: Verify tracing metadata preserved
      expect(error.correlationId).toBe(correlationId);
      expect(error.toJSON().correlationId).toBe(correlationId);
    });
  });
});