import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockedFunction } from 'vitest';
import { Orchestrator } from '../Orchestrator';
import { Logger } from '../../logging/Logger';
import { ValidationError } from '../../errors/ValidationError';
import { RuntimeError } from '../../errors/RuntimeError';
import type {
  OrchestratorConfig,
  OrchestratorState,
  Task,
  TaskResult,
  ExecutionContext,
  ExecutionPlan,
} from '../types';

// Mock dependencies
vi.mock('../../logging/Logger');
vi.mock('../TaskRegistry', () => ({
  TaskRegistry: {
    getInstance: vi.fn(() => ({
      getTask: vi.fn(),
      registerTask: vi.fn(),
    })),
  },
}));
vi.mock('../ExecutionEngine', () => ({
  ExecutionEngine: vi.fn().mockImplementation(() => ({
    execute: vi.fn(),
    abort: vi.fn(),
    getState: vi.fn(),
  })),
}));

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;
  let mockLogger: Logger;
  let mockConfig: OrchestratorConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    (Logger.getInstance as MockedFunction<typeof Logger.getInstance>).mockReturnValue(mockLogger);

    // Setup default config
    mockConfig = {
      maxConcurrentTasks: 5,
      defaultTimeoutMs: 30000,
      retryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 2,
        initialDelayMs: 1000,
      },
      enableMetrics: true,
    };

    orchestrator = new Orchestrator(mockConfig);
  });

  describe('Layer 1: Types - Configuration Validation', () => {
    it('should validate required configuration properties', () => {
      const invalidConfig = {
        maxConcurrentTasks: -1, // Invalid: negative number
        defaultTimeoutMs: 0,    // Invalid: zero timeout
      } as OrchestratorConfig;

      expect(() => new Orchestrator(invalidConfig)).toThrow(ValidationError);
    });

    it('should apply default values for optional config', () => {
      const minimalConfig: Partial<OrchestratorConfig> = {
        maxConcurrentTasks: 3,
      };

      const instance = new Orchestrator(minimalConfig as OrchestratorConfig);

      // Access internal config through reflection for testing
      const internalConfig = (instance as unknown as { config: OrchestratorConfig }).config;
      
      expect(internalConfig.defaultTimeoutMs).toBeDefined();
      expect(internalConfig.retryPolicy).toBeDefined();
    });

    it('should validate retry policy constraints', () => {
      const invalidRetryConfig: OrchestratorConfig = {
        ...mockConfig,
        retryPolicy: {
          maxRetries: -1,  // Invalid
          backoffMultiplier: 0,  // Invalid
          initialDelayMs: -100,  // Invalid
        },
      };

      expect(() => new Orchestrator(invalidRetryConfig)).toThrow(ValidationError);
    });
  });

  describe('Layer 2: Config - State Management', () => {
    it('should initialize with IDLE state', () => {
      const state = orchestrator.getState();
      
      expect(state.status).toBe('IDLE');
      expect(state.activeTasks).toBe(0);
      expect(state.completedTasks).toBe(0);
      expect(state.failedTasks).toBe(0);
    });

    it('should maintain immutable state snapshots', () => {
      const state1 = orchestrator.getState();
      const state2 = orchestrator.getState();

      // States should be deep equal but different references
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('should track state transitions correctly', () => {
      const transitions: OrchestratorState['status'][] = [];
      
      // Subscribe to state changes
      orchestrator.onStateChange((state) => {
        transitions.push(state.status);
      });

      // Trigger state change
      orchestrator.initialize();

      expect(transitions).toContain('INITIALIZING');
      expect(transitions).toContain('READY');
    });
  });

  describe('Layer 3: Repo - Task Registry Integration', () => {
    it('should register tasks with valid schemas', () => {
      const task: Task = {
        id: 'test-task-1',
        name: 'TestTask',
        handler: vi.fn(),
        schema: {
          input: { type: 'object', required: ['data'] },
          output: { type: 'object' },
        },
      };

      expect(() => orchestrator.registerTask(task)).not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Task registered'),
        expect.objectContaining({ taskId: task.id })
      );
    });

    it('should reject duplicate task registrations', () => {
      const task: Task = {
        id: 'duplicate-task',
        name: 'DuplicateTask',
        handler: vi.fn(),
      };

      orchestrator.registerTask(task);

      expect(() => orchestrator.registerTask(task)).toThrow(ValidationError);
    });

    it('should validate task schema before registration', () => {
      const invalidTask = {
        id: 'invalid-task',
        // Missing required 'name' field
        handler: vi.fn(),
      } as Task;

      expect(() => orchestrator.registerTask(invalidTask)).toThrow(ValidationError);
    });
  });

  describe('Layer 4: Service - Execution Planning', () => {
    it('should create valid execution plan from task graph', () => {
      const tasks: Task[] = [
        { id: 'task-a', name: 'TaskA', handler: vi.fn(), dependencies: [] },
        { id: 'task-b', name: 'TaskB', handler: vi.fn(), dependencies: ['task-a'] },
        { id: 'task-c', name: 'TaskC', handler: vi.fn(), dependencies: ['task-a'] },
      ];

      const context: ExecutionContext = {
        input: { data: 'test' },
        metadata: { requestId: 'req-123' },
      };

      const plan = orchestrator.createExecutionPlan(tasks, context);

      expect(plan).toMatchObject<Partial<ExecutionPlan>>({
        id: expect.any(String),
        tasks: expect.any(Array),
        context: expect.any(Object),
        createdAt: expect.any(Date),
      });

      // Verify topological ordering
      const taskOrder = plan.tasks.map(t => t.id);
      expect(taskOrder.indexOf('task-a')).toBeLessThan(taskOrder.indexOf('task-b'));
      expect(taskOrder.indexOf('task-a')).toBeLessThan(taskOrder.indexOf('task-c'));
    });

    it('should detect circular dependencies in task graph', () => {
      const tasks: Task[] = [
        { id: 'task-a', name: 'TaskA', handler: vi.fn(), dependencies: ['task-c'] },
        { id: 'task-b', name: 'TaskB', handler: vi.fn(), dependencies: ['task-a'] },
        { id: 'task-c', name: 'TaskC', handler: vi.fn(), dependencies: ['task-b'] },
      ];

      expect(() => orchestrator.createExecutionPlan(tasks, {} as ExecutionContext))
        .toThrow(ValidationError);
    });

    it('should handle empty task list gracefully', () => {
      const plan = orchestrator.createExecutionPlan([], { input: {} } as ExecutionContext);
      
      expect(plan.tasks).toHaveLength(0);
      expect(plan.estimatedDurationMs).toBe(0);
    });
  });

  describe('Layer 5: Runtime - Execution Engine', () => {
    it('should execute plan with proper concurrency control', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true });
      
      const tasks: Task[] = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        name: `Task${i}`,
        handler: mockHandler,
        dependencies: [],
      }));

      const plan = orchestrator.createExecutionPlan(tasks, {
        input: {},
        metadata: { requestId: 'test-123' },
      });

      // Track concurrent executions
      let concurrentExecutions = 0;
      let maxConcurrent = 0;

      mockHandler.mockImplementation(async () => {
        concurrentExecutions++;
        maxConcurrent = Math.max(maxConcurrent, concurrentExecutions);
        await new Promise(r => setTimeout(r, 10));
        concurrentExecutions--;
        return { success: true };
      });

      await orchestrator.execute(plan);

      // Should respect maxConcurrentTasks limit
      expect(maxConcurrent).toBeLessThanOrEqual(mockConfig.maxConcurrentTasks);
    });

    it('should handle task failures with retry logic', async () => {
      const failingHandler = vi.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValueOnce({ success: true });

      const task: Task = {
        id: 'retry-task',
        name: 'RetryTask',
        handler: failingHandler,
        retryPolicy: { maxRetries: 3 },
      };

      const plan = orchestrator.createExecutionPlan([task], {
        input: {},
        metadata: {},
      });

      const result = await orchestrator.execute(plan);

      expect(failingHandler).toHaveBeenCalledTimes(3);
      expect(result.results['retry-task'].status).toBe('SUCCESS');
    });

    it('should abort execution on critical failure when configured', async () => {
      const criticalTask: Task = {
        id: 'critical-task',
        name: 'CriticalTask',
        handler: vi.fn().mockRejectedValue(new Error('Critical failure')),
        isCritical: true,
      };

      const dependentTask: Task = {
        id: 'dependent-task',
        name: 'DependentTask',
        handler: vi.fn(),
        dependencies: ['critical-task'],
      };

      const plan = orchestrator.createExecutionPlan(
        [criticalTask, dependentTask],
        { input: {}, metadata: {}, abortOnCriticalFailure: true }
      );

      const result = await orchestrator.execute(plan);

      expect(result.status).toBe('FAILED');
      expect(result.results['dependent-task'].status).toBe('SKIPPED');
    });

    it('should enforce timeout on long-running tasks', async () => {
      const slowTask: Task = {
        id: 'slow-task',
        name: 'SlowTask',
        handler: vi.fn().mockImplementation(
          () => new Promise(resolve => setTimeout(resolve, 5000))
        ),
        timeoutMs: 100, // 100ms timeout
      };

      const plan = orchestrator.createExecutionPlan([slowTask], {
        input: {},
        metadata: {},
      });

      const result = await orchestrator.execute(plan);

      expect(result.results['slow-task'].status).toBe('TIMEOUT');
      expect(result.results['slow-task'].error).toBeInstanceOf(RuntimeError);
    });

    it('should provide progress updates during execution', async () => {
      const progressUpdates: number[] = [];
      
      orchestrator.onProgressUpdate((progress) => {
        progressUpdates.push(progress.percentage);
      });

      const tasks: Task[] = Array.from({ length: 5 }, (_, i) => ({
        id: `task-${i}`,
        name: `Task${i}`,
        handler: vi.fn().mockResolvedValue({ done: true }),
        dependencies: [],
      }));

      const plan = orchestrator.createExecutionPlan(tasks, {
        input: {},
        metadata: {},
      });

      await orchestrator.execute(plan);

      // Progress should monotonically increase
      for (let i = 1; i < progressUpdates.length; i++) {
        expect(progressUpdates[i]).toBeGreaterThanOrEqual(progressUpdates[i - 1]);
      }
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    });
  });

  describe('Layer 6: UI - Result Formatting', () => {
    it('should format execution results for consumption', () => {
      const rawResult: TaskResult = {
        taskId: 'test-task',
        status: 'SUCCESS',
        output: { data: { nested: { value: 42 } } },
        metrics: {
          startTime: new Date('2024-01-01T00:00:00Z'),
          endTime: new Date('2024-01-01T00:00:01Z'),
          memoryPeakBytes: 1024 * 1024,
        },
      };

      const formatted = orchestrator.formatResult(rawResult, {
        includeMetrics: true,
        flattenOutput: false,
      });

      expect(formatted).toMatchObject({
        id: 'test-task',
        status: 'success',
        data: expect.any(Object),
        performance: expect.objectContaining({
          durationMs: 1000,
          memoryMb: 1,
        }),
      });
    });

    it('should flatten nested output when requested', () => {
      const rawResult: TaskResult = {
        taskId: 'test-task',
        status: 'SUCCESS',
        output: { 
          level1: { 
            level2: { 
              level3: 'deep-value' 
            } 
          } 
        },
      };

      const formatted = orchestrator.formatResult(rawResult, {
        flattenOutput: true,
        flattenSeparator: '_',
      });

      expect(formatted.data).toHaveProperty('level1_level2_level3', 'deep-value');
    });

    it('should handle error result formatting', () => {
      const errorResult: TaskResult = {
        taskId: 'failed-task',
        status: 'FAILED',
        error: new RuntimeError('Something went wrong', { code: 'ERR_001' }),
        output: null,
      };

      const formatted = orchestrator.formatResult(errorResult, {
        includeStackTrace: true,
      });

      expect(formatted).toMatchObject({
        status: 'error',
        error: expect.objectContaining({
          message: 'Something went wrong',
          code: 'ERR_001',
          stack: expect.any(String),
        }),
      });
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should handle concurrent execution requests safely', async () => {
      const plan = orchestrator.createExecutionPlan(
        [{ id: 'task-1', name: 'Task1', handler: vi.fn().mockResolvedValue({}) }],
        { input: {}, metadata: {} }
      );

      // Start multiple executions simultaneously
      const executions = Promise.all([
        orchestrator.execute(plan),
        orchestrator.execute(plan),
        orchestrator.execute(plan),
      ]);

      // Should not throw, should queue or handle appropriately
      await expect(executions).resolves.toBeDefined();
    });

    it('should clean up resources on disposal', async () => {
      const cleanupSpy = vi.fn();
      
      // Register cleanup handler
      orchestrator.onDispose(cleanupSpy);

      await orchestrator.dispose();

      expect(cleanupSpy).toHaveBeenCalled();
      expect(orchestrator.getState().status).toBe('DISPOSED');
    });

    it('should reject operations after disposal', async () => {
      await orchestrator.dispose();

      expect(() => orchestrator.initialize()).toThrow(RuntimeError);
      expect(() => orchestrator.execute({} as ExecutionPlan)).toThrow(RuntimeError);
    });

    it('should handle malformed task outputs gracefully', async () => {
      const badTask: Task = {
        id: 'bad-task',
        name: 'BadTask',
        handler: vi.fn().mockResolvedValue(undefined), // Undefined output
      };

      const plan = orchestrator.createExecutionPlan([badTask], {
        input: {},
        metadata: {},
      });

      // Should not throw, should mark as failed with proper error
      const result = await orchestrator.execute(plan);
      
      expect(result.results['bad-task'].status).toBe('FAILED');
      expect(result.results['bad-task'].error).toBeDefined();
    });

    it('should validate context input deeply', () => {
      const invalidContext = {
        input: null, // Invalid: null input
        metadata: {
          requestId: 123, // Invalid: should be string
        },
      } as unknown as ExecutionContext;

      expect(() => orchestrator.createExecutionPlan([], invalidContext))
        .toThrow(ValidationError);
    });
  });

  describe('Metrics & Observability', () => {
    it('should collect execution metrics when enabled', async () => {
      const task: Task = {
        id: 'metric-task',
        name: 'MetricTask',
        handler: vi.fn().mockResolvedValue({ result: 'ok' }),
      };

      const plan = orchestrator.createExecutionPlan([task], {
        input: {},
        metadata: {},
      });

      const result = await orchestrator.execute(plan);

      expect(result.metrics).toBeDefined();
      expect(result.metrics?.totalDurationMs).toBeGreaterThan(0);
      expect(result.metrics?.taskMetrics).toHaveProperty('metric-task');
    });

    it('should emit structured logs for all operations', async () => {
      const task: Task = {
        id: 'log-task',
        name: 'LogTask',
        handler: vi.fn().mockResolvedValue({}),
      };

      orchestrator.registerTask(task);

      // Verify structured logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Task registered successfully',
        expect.objectContaining({
          taskId: 'log-task',
          taskName: 'LogTask',
          layer: 'REPO',
        })
      );
    });

    it('should track custom metrics via callbacks', async () => {
      const customMetrics: Record<string, number> = {};

      orchestrator.onMetric((name, value) => {
        customMetrics[name] = value;
      });

      const task: Task = {
        id: 'custom-metric-task',
        name: 'CustomMetricTask',
        handler: vi.fn().mockResolvedValue({ customValue: 42 }),
      };

      const plan = orchestrator.createExecutionPlan([task], {
        input: {},
        metadata: {},
      });

      await orchestrator.execute(plan);

      expect(Object.keys(customMetrics).length).toBeGreaterThan(0);
    });
  });
});