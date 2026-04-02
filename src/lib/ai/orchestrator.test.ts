/**
 * @file orchestrator.test.ts
 * @description Comprehensive test suite for the AI Orchestrator service
 * @follows Harness-Engineering six-layer architecture (Service Layer)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Orchestrator, OrchestratorConfig, OrchestrationResult } from './orchestrator';
import { Logger } from '../logging/logger';
import { ValidationError, OrchestrationError } from '../errors/custom-errors';
import { AIProvider, AIRequest, AIResponse } from '../types/ai-types';
import { Task, TaskStatus, TaskPriority } from '../types/task-types';

// ============================================================================
// Types Layer: Test Fixtures and Mocks
// ============================================================================

interface MockProviderConfig {
  name: string;
  latencyMs: number;
  shouldFail: boolean;
  failureMessage?: string;
}

// ============================================================================
// Repo Layer: Mock Implementations
// ============================================================================

/**
 * Creates a mock AI provider for testing
 */
const createMockProvider = (config: MockProviderConfig): AIProvider => ({
  name: config.name,
  generate: vi.fn(async (request: AIRequest): Promise<AIResponse> => {
    if (config.shouldFail) {
      throw new Error(config.failureMessage || `${config.name} failed`);
    }
    
    // Simulate latency
    await new Promise(resolve => setTimeout(resolve, config.latencyMs));
    
    return {
      content: `Response from ${config.name} for: ${request.prompt}`,
      metadata: {
        provider: config.name,
        latencyMs: config.latencyMs,
        tokensUsed: 100,
      },
    };
  }),
  healthCheck: vi.fn(async (): Promise<boolean> => !config.shouldFail),
});

// ============================================================================
// Service Layer: Test Suite
// ============================================================================

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;
  let mockLogger: Logger;
  let mockProviders: Map<string, AIProvider>;

  beforeEach(() => {
    // Setup structured logger mock
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    // Setup provider registry
    mockProviders = new Map([
      ['fast-provider', createMockProvider({ name: 'fast-provider', latencyMs: 10, shouldFail: false })],
      ['slow-provider', createMockProvider({ name: 'slow-provider', latencyMs: 100, shouldFail: false })],
      ['failing-provider', createMockProvider({ name: 'failing-provider', latencyMs: 10, shouldFail: true, failureMessage: 'Provider unavailable' })],
    ]);

    const config: OrchestratorConfig = {
      providers: mockProviders,
      defaultProvider: 'fast-provider',
      fallbackEnabled: true,
      maxRetries: 3,
      timeoutMs: 5000,
      logger: mockLogger,
    };

    orchestrator = new Orchestrator(config);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Configuration Validation Tests
  // ==========================================================================

  describe('Configuration Validation', () => {
    it('should throw ValidationError when providers map is empty', () => {
      const invalidConfig: OrchestratorConfig = {
        providers: new Map(),
        defaultProvider: 'any-provider',
        logger: mockLogger,
      };

      expect(() => new Orchestrator(invalidConfig)).toThrow(ValidationError);
      expect(() => new Orchestrator(invalidConfig)).toThrow('At least one AI provider must be configured');
    });

    it('should throw ValidationError when default provider does not exist', () => {
      const invalidConfig: OrchestratorConfig = {
        providers: mockProviders,
        defaultProvider: 'non-existent-provider',
        logger: mockLogger,
      };

      expect(() => new Orchestrator(invalidConfig)).toThrow(ValidationError);
      expect(() => new Orchestrator(invalidConfig)).toThrow('Default provider "non-existent-provider" not found in configured providers');
    });

    it('should throw ValidationError when timeout is non-positive', () => {
      const invalidConfig: OrchestratorConfig = {
        providers: mockProviders,
        defaultProvider: 'fast-provider',
        timeoutMs: 0,
        logger: mockLogger,
      };

      expect(() => new Orchestrator(invalidConfig)).toThrow(ValidationError);
    });

    it('should use default values for optional configuration', () => {
      const minimalConfig: OrchestratorConfig = {
        providers: mockProviders,
        defaultProvider: 'fast-provider',
        logger: mockLogger,
      };

      const instance = new Orchestrator(minimalConfig);
      expect(instance).toBeDefined();
      // Verify defaults through behavior testing
    });
  });

  // ==========================================================================
  // Basic Orchestration Tests
  // ==========================================================================

  describe('Basic Orchestration', () => {
    it('should successfully execute a task with default provider', async () => {
      const task: Task = {
        id: 'test-task-1',
        type: 'code-generation',
        prompt: 'Generate a TypeScript interface',
        priority: TaskPriority.NORMAL,
        status: TaskStatus.PENDING,
      };

      const result: OrchestrationResult = await orchestrator.execute(task);

      expect(result.success).toBe(true);
      expect(result.content).toContain('Response from fast-provider');
      expect(result.providerUsed).toBe('fast-provider');
      expect(result.latencyMs).toBeGreaterThanOrEqual(10);
      expect(result.attempts).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should route to specified provider when provider hint is given', async () => {
      const task: Task = {
        id: 'test-task-2',
        type: 'code-generation',
        prompt: 'Generate code',
        priority: TaskPriority.NORMAL,
        status: TaskStatus.PENDING,
        providerHint: 'slow-provider',
      };

      const result: OrchestrationResult = await orchestrator.execute(task);

      expect(result.success).toBe(true);
      expect(result.providerUsed).toBe('slow-provider');
      expect(result.latencyMs).toBeGreaterThanOrEqual(100);
    });

    it('should include metadata in the response', async () => {
      const task: Task = {
        id: 'test-task-3',
        type: 'analysis',
        prompt: 'Analyze this code',
        priority: TaskPriority.HIGH,
        status: TaskStatus.PENDING,
      };

      const result: OrchestrationResult = await orchestrator.execute(task);

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.tokensUsed).toBe(100);
      expect(result.metadata?.provider).toBe('fast-provider');
    });
  });

  // ==========================================================================
  // Fallback and Retry Tests
  // ==========================================================================

  describe('Fallback and Retry Logic', () => {
    it('should fallback to next available provider on failure', async () => {
      // Create orchestrator with failing default
      const failingDefault = createMockProvider({ 
        name: 'failing-default', 
        latencyMs: 10, 
        shouldFail: true,
        failureMessage: 'Default failed',
      });

      const providers = new Map([
        ['failing-default', failingDefault],
        ['fallback-provider', createMockProvider({ name: 'fallback-provider', latencyMs: 10, shouldFail: false })],
      ]);

      const config: OrchestratorConfig = {
        providers,
        defaultProvider: 'failing-default',
        fallbackEnabled: true,
        logger: mockLogger,
      };

      const testOrchestrator = new Orchestrator(config);

      const task: Task = {
        id: 'fallback-test',
        type: 'generation',
        prompt: 'Test fallback',
        priority: TaskPriority.NORMAL,
        status: TaskStatus.PENDING,
      };

      const result: OrchestrationResult = await testOrchestrator.execute(task);

      expect(result.success).toBe(true);
      expect(result.providerUsed).toBe('fallback-provider');
      expect(result.attempts).toBe(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Default failed');
    });

    it('should retry the same provider up to maxRetries before failing', async () => {
      const flakyProvider = createMockProvider({
        name: 'flaky-provider',
        latencyMs: 5,
        shouldFail: true,
        failureMessage: 'Transient error',
      });

      // Override generate to succeed on third attempt
      let attemptCount = 0;
      flakyProvider.generate = vi.fn(async (request: AIRequest): Promise<AIResponse> => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Transient error');
        }
        return {
          content: 'Success after retries',
          metadata: { provider: 'flaky-provider', latencyMs: 5, tokensUsed: 50 },
        };
      });

      const providers = new Map([['flaky-provider', flakyProvider]]);
      const config: OrchestratorConfig = {
        providers,
        defaultProvider: 'flaky-provider',
        maxRetries: 3,
        fallbackEnabled: false,
        logger: mockLogger,
      };

      const testOrchestrator = new Orchestrator(config);

      const task: Task = {
        id: 'retry-test',
        type: 'generation',
        prompt: 'Test retries',
        priority: TaskPriority.NORMAL,
        status: TaskStatus.PENDING,
      };

      const result: OrchestrationResult = await testOrchestrator.execute(task);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(attemptCount).toBe(3);
    });

    it('should throw OrchestrationError when all providers fail', async () => {
      const allFailingProviders = new Map([
        ['fail-1', createMockProvider({ name: 'fail-1', latencyMs: 1, shouldFail: true })],
        ['fail-2', createMockProvider({ name: 'fail-2', latencyMs: 1, shouldFail: true })],
      ]);

      const config: OrchestratorConfig = {
        providers: allFailingProviders,
        defaultProvider: 'fail-1',
        fallbackEnabled: true,
        maxRetries: 1,
        logger: mockLogger,
      };

      const testOrchestrator = new Orchestrator(config);

      const task: Task = {
        id: 'total-failure-test',
        type: 'generation',
        prompt: 'This will fail',
        priority: TaskPriority.NORMAL,
        status: TaskStatus.PENDING,
      };

      await expect(testOrchestrator.execute(task)).rejects.toThrow(OrchestrationError);
      await expect(testOrchestrator.execute(task)).rejects.toThrow('All AI providers failed');
    });
  });

  // ==========================================================================
  // Timeout and Cancellation Tests
  // ==========================================================================

  describe('Timeout Handling', () => {
    it('should respect timeout configuration and abort slow requests', async () => {
      const slowProvider = createMockProvider({
        name: 'very-slow-provider',
        latencyMs: 10000, // 10 seconds
        shouldFail: false,
      });

      const providers = new Map([
        ['very-slow-provider', slowProvider],
        ['fast-backup', createMockProvider({ name: 'fast-backup', latencyMs: 10, shouldFail: false })],
      ]);

      const config: OrchestratorConfig = {
        providers,
        defaultProvider: 'very-slow-provider',
        timeoutMs: 50, // 50ms timeout
        fallbackEnabled: true,
        logger: mockLogger,
      };

      const testOrchestrator = new Orchestrator(config);

      const task: Task = {
        id: 'timeout-test',
        type: 'generation',
        prompt: 'Slow request',
        priority: TaskPriority.NORMAL,
        status: TaskStatus.PENDING,
      };

      const result: OrchestrationResult = await testOrchestrator.execute(task);

      expect(result.success).toBe(true);
      expect(result.providerUsed).toBe('fast-backup');
      expect(result.errors).toContainEqual(expect.stringContaining('timeout'));
    });

    it('should throw OrchestrationError when all providers timeout', async () => {
      const slowProvider = createMockProvider({
        name: 'always-slow',
        latencyMs: 10000,
        shouldFail: false,
      });

      const providers = new Map([['always-slow', slowProvider]]);
      const config: OrchestratorConfig = {
        providers,
        defaultProvider: 'always-slow',
        timeoutMs: 50,
        fallbackEnabled: false,
        logger: mockLogger,
      };

      const testOrchestrator = new Orchestrator(config);

      const task: Task = {
        id: 'all-timeout-test',
        type: 'generation',
        prompt: 'Will timeout',
        priority: TaskPriority.NORMAL,
        status: TaskStatus.PENDING,
      };

      await expect(testOrchestrator.execute(task)).rejects.toThrow(OrchestrationError);
    });
  });

  // ==========================================================================
  // Priority and Queue Management Tests
  // ==========================================================================

  describe('Priority Handling', () => {
    it('should process HIGH priority tasks before NORMAL priority', async () => {
      const executionOrder: string[] = [];
      
      const trackingProvider = createMockProvider({
        name: 'tracking-provider',
        latencyMs: 1,
        shouldFail: false,
      });

      // Override to track execution order
      trackingProvider.generate = vi.fn(async (request: AIRequest): Promise<AIResponse> => {
        executionOrder.push(request.metadata?.taskId as string);
        return {
          content: 'done',
          metadata: { provider: 'tracking-provider', latencyMs: 1, tokensUsed: 10 },
        };
      });

      const providers = new Map([['tracking-provider', trackingProvider]]);
      const config: OrchestratorConfig = {
        providers,
        defaultProvider: 'tracking-provider',
        logger: mockLogger,
      };

      const testOrchestrator = new Orchestrator(config);

      // Queue tasks in reverse priority order
      const normalTask: Task = {
        id: 'normal-task',
        type: 'generation',
        prompt: 'Normal',
        priority: TaskPriority.NORMAL,
        status: TaskStatus.PENDING,
      };

      const highTask: Task = {
        id: 'high-task',
        type: 'generation',
        prompt: 'High',
        priority: TaskPriority.HIGH,
        status: TaskStatus.PENDING,
      };

      // Execute both and verify high priority processes first
      const promises = [
        testOrchestrator.execute(normalTask),
        testOrchestrator.execute(highTask),
      ];

      await Promise.all(promises);

      const highIndex = executionOrder.indexOf('high-task');
      const normalIndex = executionOrder.indexOf('normal-task');
      
      expect(highIndex).toBeLessThan(normalIndex);
    });
  });

  // ==========================================================================
  // Health Check and Provider Management Tests
  // ==========================================================================

  describe('Health Checks', () => {
    it('should return health status for all providers', async () => {
      const health = await orchestrator.healthCheck();

      expect(health).toHaveProperty('fast-provider');
      expect(health).toHaveProperty('slow-provider');
      expect(health).toHaveProperty('failing-provider');
      
      expect(health['fast-provider']).toBe(true);
      expect(health['slow-provider']).toBe(true);
      expect(health['failing-provider']).toBe(false);
    });

    it('should skip unhealthy providers in fallback chain', async () => {
      const healthAwareOrchestrator = new Orchestrator({
        providers: mockProviders,
        defaultProvider: 'failing-provider', // Start with unhealthy
        fallbackEnabled: true,
        logger: mockLogger,
      });

      // Pre-check health to mark failing-provider as unhealthy
      await healthAwareOrchestrator.healthCheck();

      const task: Task = {
        id: 'health-aware-test',
        type: 'generation',
        prompt: 'Skip unhealthy',
        priority: TaskPriority.NORMAL,
        status: TaskStatus.PENDING,
      };

      const result: OrchestrationResult = await healthAwareOrchestrator.execute(task);

      expect(result.success).toBe(true);
      expect(result.providerUsed).not.toBe('failing-provider');
    });
  });

  // ==========================================================================
  // Error Handling and Edge Cases
  // ==========================================================================

  describe('Error Handling', () => {
    it('should handle malformed task input gracefully', async () => {
      const invalidTask = {
        id: 'invalid',
        // Missing required fields
      } as unknown as Task;

      await expect(orchestrator.execute(invalidTask)).rejects.toThrow(ValidationError);
    });

    it('should sanitize sensitive data from error messages', async () => {
      const providerWithSecrets = createMockProvider({
        name: 'secret-leaker',
        latencyMs: 1,
        shouldFail: true,
        failureMessage: 'Error: api_key=sk-12345, token=abc123',
      });

      const providers = new Map([['secret-leaker', providerWithSecrets]]);
      const config: OrchestratorConfig = {
        providers,
        defaultProvider: 'secret-leaker',
        logger: mockLogger,
      };

      const testOrchestrator = new Orchestrator(config);

      const task: Task = {
        id: 'secret-test',
        type: 'generation',
        prompt: 'test',
        priority: TaskPriority.NORMAL,
        status: TaskStatus.PENDING,
      };

      try {
        await testOrchestrator.execute(task);
        fail('Should have thrown');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).not.toContain('sk-12345');
        expect(message).not.toContain('abc123');
        expect(message).toContain('[REDACTED]');
      }
    });

    it('should handle concurrent task execution safely', async () => {
      const concurrentProvider = createMockProvider({
        name: 'concurrent-provider',
        latencyMs: 10,
        shouldFail: false,
      });

      let concurrentCalls = 0;
      let maxConcurrent = 0;

      concurrentProvider.generate = vi.fn(async (request: AIRequest): Promise<AIResponse> => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        await new Promise(resolve => setTimeout(resolve, 10));
        concurrentCalls--;
        return {
          content: 'concurrent result',
          metadata: { provider: 'concurrent-provider', latencyMs: 10, tokensUsed: 10 },
        };
      });

      const providers = new Map([['concurrent-provider', concurrentProvider]]);
      const config: OrchestratorConfig = {
        providers,
        defaultProvider: 'concurrent-provider',
        logger: mockLogger,
      };

      const testOrchestrator = new Orchestrator(config);

      // Execute 10 tasks concurrently
      const tasks = Array.from({ length: 10 }, (_, i) => ({
        id: `concurrent-${i}`,
        type: 'generation',
        prompt: `Task ${i}`,
        priority: TaskPriority.NORMAL,
        status: TaskStatus.PENDING,
      } as Task));

      const results = await Promise.all(tasks.map(t => testOrchestrator.execute(t)));

      expect(results).toHaveLength(10);
      expect(results.every(r => r.success)).toBe(true);
      // Verify no race conditions occurred
      expect(concurrentCalls).toBe(0); // All completed
    });
  });

  // ==========================================================================
  // Logging and Observability Tests
  // ==========================================================================

  describe('Logging and Observability', () => {
    it('should log task execution lifecycle events', async () => {
      const task: Task = {
        id: 'logging-test',
        type: 'generation',
        prompt: 'Test logging',
        priority: TaskPriority.NORMAL,
        status: TaskStatus.PENDING,
      };

      await orchestrator.execute(task);

      // Verify structured logging calls
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'logging-test' }),
        'Task execution started'
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'logging-test',
          providerUsed: 'fast-provider',
          success: true,
        }),
        'Task execution completed'
      );
    });

    it('should log errors with proper context', async () => {
      const errorProvider = createMockProvider({
        name: 'error-provider',
        latencyMs: 1,
        shouldFail: true,
        failureMessage: 'Critical failure',
      });

      const providers = new Map([
        ['error-provider', errorProvider],
        ['backup', createMockProvider({ name: 'backup', latencyMs: 1, shouldFail: false })],
      ]);

      const config: OrchestratorConfig = {
        providers,
        defaultProvider: 'error-provider',
        fallbackEnabled: true,
        logger: mockLogger,
      };

      const testOrchestrator = new Orchestrator(config);

      const task: Task = {
        id: 'error-logging-test',
        type: 'generation',
        prompt: 'Test error logging',
        priority: TaskPriority.NORMAL,
        status: TaskStatus.PENDING,
      };

      await testOrchestrator.execute(task);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'error-logging-test',
          provider: 'error-provider',
          error: 'Critical failure',
        }),
        'Provider failed, attempting fallback'
      );
    });
  });

  // ==========================================================================
  // Performance and Metrics Tests
  // ==========================================================================

  describe('Performance Metrics', () => {
    it('should track and expose execution metrics', async () => {
      const task: Task = {
        id: 'metrics-test',
        type: 'generation',
        prompt: 'Test metrics',
        priority: TaskPriority.NORMAL,
        status: TaskStatus.PENDING,
      };

      await orchestrator.execute(task);

      const metrics = orchestrator.getMetrics();

      expect(metrics).toHaveProperty('totalTasks');
      expect(metrics).toHaveProperty('successfulTasks');
      expect(metrics).toHaveProperty('failedTasks');
      expect(metrics).toHaveProperty('averageLatencyMs');
      expect(metrics).toHaveProperty('providerDistribution');

      expect(metrics.totalTasks).toBeGreaterThan(0);
      expect(metrics.successfulTasks).toBeGreaterThan(0);
    });

    it('should calculate provider distribution correctly', async () => {
      // Execute multiple tasks to generate distribution data
      const tasks: Task[] = [
        {
          id: 'dist-1',
          type: 'generation',
          prompt: 'Task 1',
          priority: TaskPriority.NORMAL,
          status: TaskStatus.PENDING,
          providerHint: 'fast-provider',
        },
        {
          id: 'dist-2',
          type: 'generation',
          prompt: 'Task 2',
          priority: TaskPriority.NORMAL,
          status: TaskStatus.PENDING,
          providerHint: 'slow-provider',
        },
      ];

      await Promise.all(tasks.map(t => orchestrator.execute(t)));

      const metrics = orchestrator.getMetrics();

      expect(metrics.providerDistribution).toHaveProperty('fast-provider');
      expect(metrics.providerDistribution).toHaveProperty('slow-provider');
      expect(metrics.providerDistribution['fast-provider']).toBeGreaterThan(0);
      expect(metrics.providerDistribution['slow-provider']).toBeGreaterThan(0);
    });
  });
});