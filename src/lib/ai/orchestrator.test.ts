import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Orchestrator, OrchestratorConfig, OrchestratorError } from './orchestrator';
import { Logger } from '../logging/logger';
import { Telemetry } from '../telemetry/telemetry';
import { Step, StepResult, StepStatus } from './types';
import { ValidationError } from '../errors/validation-error';

// Mock dependencies
jest.mock('../logging/logger');
jest.mock('../telemetry/telemetry');

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;
  let mockLogger: jest.Mocked<Logger>;
  let mockTelemetry: jest.Mocked<Telemetry>;
  let config: OrchestratorConfig;

  beforeEach(() => {
    mockLogger = new Logger('Orchestrator') as jest.Mocked<Logger>;
    mockTelemetry = new Telemetry() as jest.Mocked<Telemetry>;
    
    config = {
      maxRetries: 3,
      timeoutMs: 5000,
      enableTelemetry: true,
    };

    orchestrator = new Orchestrator(config, mockLogger, mockTelemetry);
  });

  describe('constructor', () => {
    it('should create orchestrator with valid config', () => {
      expect(orchestrator).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Orchestrator initialized',
        expect.objectContaining({ config })
      );
    });

    it('should throw ValidationError when config is invalid', () => {
      const invalidConfig = { maxRetries: -1 } as OrchestratorConfig;
      
      expect(() => new Orchestrator(invalidConfig, mockLogger, mockTelemetry))
        .toThrow(ValidationError);
    });

    it('should use default config when partial config provided', () => {
      const partialConfig = { maxRetries: 5 } as OrchestratorConfig;
      const orch = new Orchestrator(partialConfig, mockLogger, mockTelemetry);
      
      expect(orch).toBeDefined();
    });
  });

  describe('execute', () => {
    const createMockStep = (
      name: string,
      executeFn: () => Promise<StepResult> = async () => ({ status: StepStatus.SUCCESS, data: {} })
    ): Step => ({
      name,
      execute: jest.fn(executeFn),
      rollback: jest.fn(async () => ({ status: StepStatus.SUCCESS })),
    });

    it('should execute single step successfully', async () => {
      const step = createMockStep('test-step');
      const result = await orchestrator.execute([step]);

      expect(result.status).toBe(StepStatus.SUCCESS);
      expect(step.execute).toHaveBeenCalledTimes(1);
      expect(mockTelemetry.track).toHaveBeenCalledWith(
        'orchestrator.step.completed',
        expect.any(Object)
      );
    });

    it('should execute multiple steps in sequence', async () => {
      const executionOrder: string[] = [];
      const step1 = createMockStep('step-1', async () => {
        executionOrder.push('step-1');
        return { status: StepStatus.SUCCESS, data: { value: 1 } };
      });
      const step2 = createMockStep('step-2', async () => {
        executionOrder.push('step-2');
        return { status: StepStatus.SUCCESS, data: { value: 2 } };
      });

      const result = await orchestrator.execute([step1, step2]);

      expect(result.status).toBe(StepStatus.SUCCESS);
      expect(executionOrder).toEqual(['step-1', 'step-2']);
      expect(result.stepResults).toHaveLength(2);
    });

    it('should pass previous step data to next step', async () => {
      const step1 = createMockStep('step-1', async () => ({
        status: StepStatus.SUCCESS,
        data: { userId: '123' },
      }));
      const step2 = createMockStep('step-2', async (ctx) => ({
        status: StepStatus.SUCCESS,
        data: { ...ctx.previousData, processed: true },
      }));

      await orchestrator.execute([step1, step2]);

      // Verify step2 received step1's data through context
      expect(step2.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          previousData: expect.objectContaining({ userId: '123' }),
        })
      );
    });

    it('should retry failed steps up to maxRetries', async () => {
      const step = createMockStep('failing-step', async () => {
        throw new Error('Transient error');
      });

      await expect(orchestrator.execute([step])).rejects.toThrow(OrchestratorError);
      expect(step.execute).toHaveBeenCalledTimes(config.maxRetries);
    });

    it('should succeed on retry when step recovers', async () => {
      let attempts = 0;
      const step = createMockStep('recovering-step', async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return { status: StepStatus.SUCCESS, data: { recovered: true } };
      });

      const result = await orchestrator.execute([step]);

      expect(result.status).toBe(StepStatus.SUCCESS);
      expect(attempts).toBe(3);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Retry'),
        expect.any(Object)
      );
    });

    it('should trigger rollback on step failure when configured', async () => {
      const step1 = createMockStep('step-1', async () => ({
        status: StepStatus.SUCCESS,
        data: { created: true },
      }));
      const step2 = createMockStep('step-2', async () => {
        throw new Error('Fatal error');
      });

      await expect(orchestrator.execute([step1, step2])).rejects.toThrow();

      // Rollback should be called in reverse order for completed steps
      expect(step2.rollback).not.toHaveBeenCalled(); // step2 never completed
      expect(step1.rollback).toHaveBeenCalledTimes(1);
    });

    it('should handle rollback failures gracefully', async () => {
      const step1 = createMockStep('step-1', async () => ({
        status: StepStatus.SUCCESS,
        data: {},
      }));
      step1.rollback = jest.fn(async () => {
        throw new Error('Rollback failed');
      });

      const step2 = createMockStep('step-2', async () => {
        throw new Error('Step failed');
      });

      await expect(orchestrator.execute([step1, step2])).rejects.toThrow();

      // Should log rollback failure but still throw original error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Rollback failed'),
        expect.any(Object)
      );
    });

    it('should respect timeout and abort long-running steps', async () => {
      const slowStep = createMockStep('slow-step', async () => {
        await new Promise(resolve => setTimeout(resolve, config.timeoutMs + 100));
        return { status: StepStatus.SUCCESS, data: {} };
      });

      await expect(orchestrator.execute([slowStep])).rejects.toThrow('timeout');
    });

    it('should skip remaining steps when step returns SKIP_REMAINING', async () => {
      const step1 = createMockStep('step-1', async () => ({
        status: StepStatus.SKIP_REMAINING,
        data: { earlyExit: true },
      }));
      const step2 = createMockStep('step-2');

      const result = await orchestrator.execute([step1, step2]);

      expect(result.status).toBe(StepStatus.SUCCESS);
      expect(step1.execute).toHaveBeenCalledTimes(1);
      expect(step2.execute).not.toHaveBeenCalled();
    });

    it('should handle empty step array', async () => {
      const result = await orchestrator.execute([]);

      expect(result.status).toBe(StepStatus.SUCCESS);
      expect(result.stepResults).toHaveLength(0);
    });

    it('should validate step definitions', async () => {
      const invalidStep = { name: 'invalid' } as Step; // Missing execute

      await expect(orchestrator.execute([invalidStep])).rejects.toThrow(ValidationError);
    });

    it('should emit events for step lifecycle', async () => {
      const events: string[] = [];
      orchestrator.on('step:start', (name) => events.push(`start:${name}`));
      orchestrator.on('step:complete', (name) => events.push(`complete:${name}`));

      const step = createMockStep('evented-step');
      await orchestrator.execute([step]);

      expect(events).toContain('start:evented-step');
      expect(events).toContain('complete:evented-step');
    });

    it('should aggregate telemetry metrics', async () => {
      const step1 = createMockStep('step-1');
      const step2 = createMockStep('step-2');

      await orchestrator.execute([step1, step2]);

      expect(mockTelemetry.track).toHaveBeenCalledWith(
        'orchestrator.execution.completed',
        expect.objectContaining({
          totalSteps: 2,
          successfulSteps: 2,
          failedSteps: 0,
          totalDurationMs: expect.any(Number),
        })
      );
    });
  });

  describe('pause and resume', () => {
    it('should pause execution and preserve state', async () => {
      const step1 = createMockStep('step-1', async () => ({
        status: StepStatus.SUCCESS,
        data: { checkpoint: 'data' },
      }));
      const step2 = createMockStep('step-2');

      // Start execution
      const executionPromise = orchestrator.execute([step1, step2]);
      
      // Pause after first step
      orchestrator.pause();

      const state = orchestrator.getState();
      expect(state.isPaused).toBe(true);
      expect(state.completedSteps).toContain('step-1');
    });

    it('should resume from paused state', async () => {
      const savedState = {
        completedSteps: ['step-1'],
        stepData: { 'step-1': { preserved: 'data' } },
        isPaused: true,
      };

      orchestrator.restoreState(savedState);
      
      const step2 = createMockStep('step-2', async (ctx) => ({
        status: StepStatus.SUCCESS,
        data: { ...ctx.previousData, step2: 'done' },
      }));

      const result = await orchestrator.resume([step2]);

      expect(result.status).toBe(StepStatus.SUCCESS);
      // step-2 should receive preserved data from step-1
      expect(step2.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          previousData: expect.objectContaining({ preserved: 'data' }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('should wrap unknown errors in OrchestratorError', async () => {
      const step = createMockStep('error-step', async () => {
        throw 'String error'; // Non-Error throw
      });

      await expect(orchestrator.execute([step])).rejects.toThrow(OrchestratorError);
    });

    it('should preserve error context through retries', async () => {
      const errors: Error[] = [];
      const step = createMockStep('failing-step', async () => {
        const err = new Error(`Attempt ${errors.length + 1}`);
        errors.push(err);
        throw err;
      });

      try {
        await orchestrator.execute([step]);
      } catch (e) {
        const orchestratorError = e as OrchestratorError;
        expect(orchestratorError.attemptCount).toBe(config.maxRetries);
        expect(orchestratorError.errors).toHaveLength(config.maxRetries);
      }
    });
  });

  describe('concurrency control', () => {
    it('should respect maxConcurrency config', async () => {
      const concurrentConfig = { ...config, maxConcurrency: 2 };
      const concurrentOrchestrator = new Orchestrator(
        concurrentConfig,
        mockLogger,
        mockTelemetry
      );

      let concurrentExecutions = 0;
      let maxConcurrent = 0;

      const createConcurrentStep = (name: string): Step => ({
        name,
        execute: async () => {
          concurrentExecutions++;
          maxConcurrent = Math.max(maxConcurrent, concurrentExecutions);
          await new Promise(resolve => setTimeout(resolve, 50));
          concurrentExecutions--;
          return { status: StepStatus.SUCCESS, data: {} };
        },
        rollback: async () => ({ status: StepStatus.SUCCESS }),
      });

      const steps = Array.from({ length: 5 }, (_, i) => createConcurrentStep(`step-${i}`));
      
      // Note: This tests concurrent execution within a single orchestrator run
      // Actual implementation may vary based on step dependencies
      await concurrentOrchestrator.execute(steps);

      expect(maxConcurrent).toBeLessThanOrEqual(concurrentConfig.maxConcurrency);
    });
  });
});