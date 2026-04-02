/**
 * Base Agent Tests
 * 
 * Tests for the BaseAgent class following the six-layer architecture.
 * Layer: Service (Layer 4) - Business logic testing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseAgent, AgentConfig, AgentState, AgentMessage, AgentResult } from './base-agent';
import { Logger } from '../logging/logger';
import { ValidationError } from '../errors/validation-error';
import { TimeoutError } from '../errors/timeout-error';

// Mock dependencies
vi.mock('../logging/logger', () => ({
  Logger: {
    getInstance: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(function() { return this; })
    }))
  }
}));

describe('BaseAgent', () => {
  // Test fixtures following Type layer (Layer 1) patterns
  const createValidConfig = (): AgentConfig => ({
    id: 'test-agent-001',
    name: 'TestAgent',
    version: '1.0.0',
    maxRetries: 3,
    timeoutMs: 5000,
    capabilities: ['test-capability'],
    metadata: {
      description: 'Test agent for unit tests',
      author: 'test-suite'
    }
  });

  let mockLogger: ReturnType<typeof Logger.getInstance>;

  beforeEach(() => {
    mockLogger = Logger.getInstance();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Configuration Layer (Layer 2)', () => {
    it('should initialize with valid configuration', () => {
      const config = createValidConfig();
      const agent = new BaseAgent(config);

      expect(agent.getId()).toBe(config.id);
      expect(agent.getName()).toBe(config.name);
      expect(agent.getState()).toBe(AgentState.IDLE);
    });

    it('should throw ValidationError for missing required config fields', () => {
      const invalidConfig = {
        id: '',
        name: '',
        version: ''
      } as AgentConfig;

      expect(() => new BaseAgent(invalidConfig)).toThrow(ValidationError);
    });

    it('should apply default values for optional configuration', () => {
      const minimalConfig: AgentConfig = {
        id: 'minimal-agent',
        name: 'MinimalAgent',
        version: '1.0.0'
      };

      const agent = new BaseAgent(minimalConfig);

      expect(agent.getConfig().maxRetries).toBe(3); // Default value
      expect(agent.getConfig().timeoutMs).toBe(30000); // Default value
    });

    it('should validate capability format', () => {
      const configWithInvalidCapabilities = createValidConfig();
      configWithInvalidCapabilities.capabilities = ['', 'valid-cap', '   '];

      expect(() => new BaseAgent(configWithInvalidCapabilities)).toThrow(ValidationError);
    });
  });

  describe('State Management', () => {
    it('should transition through valid state lifecycle', async () => {
      const agent = new BaseAgent(createValidConfig());

      // Initial state
      expect(agent.getState()).toBe(AgentState.IDLE);

      // Transition to RUNNING
      await agent.initialize();
      expect(agent.getState()).toBe(AgentState.READY);

      // Execute and verify RUNNING state
      const executionPromise = agent.execute({ type: 'test', payload: {} });
      expect(agent.getState()).toBe(AgentState.RUNNING);

      await executionPromise;
      expect(agent.getState()).toBe(AgentState.READY);

      // Terminate
      await agent.terminate();
      expect(agent.getState()).toBe(AgentState.TERMINATED);
    });

    it('should prevent invalid state transitions', async () => {
      const agent = new BaseAgent(createValidConfig());

      // Cannot execute without initialization
      await expect(agent.execute({ type: 'test', payload: {} }))
        .rejects.toThrow('Agent not initialized');

      // Cannot initialize twice
      await agent.initialize();
      await expect(agent.initialize()).rejects.toThrow('Agent already initialized');
    });

    it('should track state history for debugging', async () => {
      const agent = new BaseAgent(createValidConfig());
      
      await agent.initialize();
      await agent.execute({ type: 'test', payload: {} });
      await agent.terminate();

      const history = agent.getStateHistory();
      expect(history).toHaveLength(4);
      expect(history[0].state).toBe(AgentState.IDLE);
      expect(history[history.length - 1].state).toBe(AgentState.TERMINATED);
    });
  });

  describe('Execution Layer (Service - Layer 4)', () => {
    it('should execute message and return structured result', async () => {
      const agent = new BaseAgent(createValidConfig());
      await agent.initialize();

      const message: AgentMessage = {
        type: 'compute',
        payload: { input: 42 },
        correlationId: 'corr-123',
        timestamp: new Date()
      };

      const result = await agent.execute(message);

      expect(result.success).toBe(true);
      expect(result.correlationId).toBe(message.correlationId);
      expect(result.data).toBeDefined();
      expect(result.metadata.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle execution errors with proper error wrapping', async () => {
      const agent = new BaseAgent(createValidConfig());
      await agent.initialize();

      // Override executeImplementation to simulate error
      vi.spyOn(agent as any, 'executeImplementation').mockRejectedValue(
        new Error('Simulated failure')
      );

      const message: AgentMessage = {
        type: 'failing-operation',
        payload: {},
        correlationId: 'corr-error-001'
      };

      const result = await agent.execute(message);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('EXECUTION_ERROR');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should enforce timeout on long-running operations', async () => {
      const config = createValidConfig();
      config.timeoutMs = 100; // Very short timeout

      const agent = new BaseAgent(config);
      await agent.initialize();

      // Simulate slow operation
      vi.spyOn(agent as any, 'executeImplementation').mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 500))
      );

      const message: AgentMessage = {
        type: 'slow-operation',
        payload: {}
      };

      await expect(agent.execute(message)).rejects.toThrow(TimeoutError);
    });

    it('should implement retry logic with exponential backoff', async () => {
      const config = createValidConfig();
      config.maxRetries = 2;

      const agent = new BaseAgent(config);
      await agent.initialize();

      const executeImpl = vi.spyOn(agent as any, 'executeImplementation');
      executeImpl
        .mockRejectedValueOnce(new Error('Transient error 1'))
        .mockRejectedValueOnce(new Error('Transient error 2'))
        .mockResolvedValue({ success: true, data: 'recovered' });

      const message: AgentMessage = {
        type: 'retry-test',
        payload: {}
      };

      const result = await agent.execute(message);

      expect(result.success).toBe(true);
      expect(executeImpl).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Retry attempt'),
        expect.any(Object)
      );
    });

    it('should fail after max retries exceeded', async () => {
      const config = createValidConfig();
      config.maxRetries = 1;

      const agent = new BaseAgent(config);
      await agent.initialize();

      vi.spyOn(agent as any, 'executeImplementation').mockRejectedValue(
        new Error('Persistent failure')
      );

      const message: AgentMessage = {
        type: 'always-fails',
        payload: {}
      };

      const result = await agent.execute(message);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MAX_RETRIES_EXCEEDED');
    });
  });

  describe('Message Handling', () => {
    it('should validate incoming messages before processing', async () => {
      const agent = new BaseAgent(createValidConfig());
      await agent.initialize();

      const invalidMessages = [
        { payload: {} }, // Missing type
        { type: 123, payload: {} }, // Invalid type
        { type: 'test' }, // Missing payload
        { type: 'test', payload: null } // Null payload
      ];

      for (const invalidMsg of invalidMessages) {
        await expect(agent.execute(invalidMsg as AgentMessage))
          .rejects.toThrow(ValidationError);
      }
    });

    it('should support capability-based message routing', async () => {
      const config = createValidConfig();
      config.capabilities = ['math', 'text-processing'];

      const agent = new BaseAgent(config);
      await agent.initialize();

      // Mock capability check
      const canHandleSpy = vi.spyOn(agent as any, 'canHandleMessage');
      canHandleSpy.mockImplementation((msg: AgentMessage) => {
        return config.capabilities?.includes(msg.type) ?? false;
      });

      const validMessage: AgentMessage = {
        type: 'math',
        payload: { operation: 'add', values: [1, 2] }
      };

      const invalidMessage: AgentMessage = {
        type: 'image-processing', // Not in capabilities
        payload: {}
      };

      expect(await agent.canHandle(validMessage)).toBe(true);
      expect(await agent.canHandle(invalidMessage)).toBe(false);
    });
  });

  describe('Event System (Runtime - Layer 5)', () => {
    it('should emit lifecycle events', async () => {
      const agent = new BaseAgent(createValidConfig());
      const eventHandler = vi.fn();

      agent.on('stateChange', eventHandler);
      agent.on('messageReceived', eventHandler);
      agent.on('executionComplete', eventHandler);

      await agent.initialize();
      
      const message: AgentMessage = {
        type: 'test',
        payload: {},
        correlationId: 'event-test-001'
      };
      
      await agent.execute(message);

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'stateChange',
          from: AgentState.IDLE,
          to: AgentState.READY
        })
      );

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'messageReceived',
          correlationId: 'event-test-001'
        })
      );
    });

    it('should support error event emission', async () => {
      const agent = new BaseAgent(createValidConfig());
      await agent.initialize();

      const errorHandler = vi.fn();
      agent.on('error', errorHandler);

      vi.spyOn(agent as any, 'executeImplementation').mockRejectedValue(
        new Error('Test error')
      );

      await agent.execute({ type: 'error-test', payload: {} });

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'error',
          error: expect.any(Error)
        })
      );
    });
  });

  describe('Metrics and Observability', () => {
    it('should track execution metrics', async () => {
      const agent = new BaseAgent(createValidConfig());
      await agent.initialize();

      // Execute multiple messages
      for (let i = 0; i < 3; i++) {
        await agent.execute({
          type: 'test',
          payload: { index: i },
          correlationId: `metric-test-${i}`
        });
      }

      const metrics = agent.getMetrics();

      expect(metrics.totalExecutions).toBe(3);
      expect(metrics.successfulExecutions).toBe(3);
      expect(metrics.failedExecutions).toBe(0);
      expect(metrics.averageExecutionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should calculate error rates correctly', async () => {
      const agent = new BaseAgent(createValidConfig());
      await agent.initialize();

      vi.spyOn(agent as any, 'executeImplementation')
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'));

      // One success, two failures
      await agent.execute({ type: 'test', payload: {}, correlationId: '1' });
      await agent.execute({ type: 'test', payload: {}, correlationId: '2' });
      await agent.execute({ type: 'test', payload: {}, correlationId: '3' });

      const metrics = agent.getMetrics();
      expect(metrics.errorRate).toBeCloseTo(0.667, 2); // 2/3 failures
    });
  });

  describe('Cleanup and Resource Management', () => {
    it('should clean up resources on terminate', async () => {
      const agent = new BaseAgent(createValidConfig());
      await agent.initialize();

      const cleanupSpy = vi.spyOn(agent as any, 'cleanup');

      await agent.terminate();

      expect(cleanupSpy).toHaveBeenCalled();
      expect(agent.getState()).toBe(AgentState.TERMINATED);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Agent terminated successfully',
        expect.any(Object)
      );
    });

    it('should reject new messages after termination', async () => {
      const agent = new BaseAgent(createValidConfig());
      await agent.initialize();
      await agent.terminate();

      await expect(
        agent.execute({ type: 'late-message', payload: {} })
      ).rejects.toThrow('Agent has been terminated');
    });

    it('should handle cleanup errors gracefully', async () => {
      const agent = new BaseAgent(createValidConfig());
      await agent.initialize();

      vi.spyOn(agent as any, 'cleanup').mockRejectedValue(
        new Error('Cleanup failed')
      );

      // Should not throw, but log error
      await expect(agent.terminate()).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle concurrent execution requests', async () => {
      const agent = new BaseAgent(createValidConfig());
      await agent.initialize();

      // Mock slow execution
      vi.spyOn(agent as any, 'executeImplementation').mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 50))
      );

      const messages: AgentMessage[] = Array.from({ length: 3 }, (_, i) => ({
        type: 'concurrent',
        payload: { index: i },
        correlationId: `concurrent-${i}`
      }));

      // Queue concurrent requests
      const promises = messages.map(msg => agent.execute(msg));

      const results = await Promise.all(promises);

      // All should complete successfully (queued execution)
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should handle very large payloads', async () => {
      const agent = new BaseAgent(createValidConfig());
      await agent.initialize();

      const largePayload = {
        data: 'x'.repeat(10 * 1024 * 1024) // 10MB string
      };

      const result = await agent.execute({
        type: 'large-payload',
        payload: largePayload
      });

      expect(result.success).toBe(true);
    });

    it('should sanitize sensitive data in logs', async () => {
      const agent = new BaseAgent(createValidConfig());
      await agent.initialize();

      const messageWithSecrets: AgentMessage = {
        type: 'auth',
        payload: {
          username: 'user',
          password: 'secret123',
          apiKey: 'sk-live-abc123',
          token: 'bearer-token-here'
        }
      };

      await agent.execute(messageWithSecrets);

      // Verify logger was called with sanitized data
      const logCalls = (mockLogger.debug as ReturnType<typeof vi.fn>).mock.calls;
      const hasSensitiveData = logCalls.some(call => 
        JSON.stringify(call).includes('secret123') ||
        JSON.stringify(call).includes('sk-live')
      );

      expect(hasSensitiveData).toBe(false);
    });

    it('should handle circular references in payload', async () => {
      const agent = new BaseAgent(createValidConfig());
      await agent.initialize();

      const circular: any = { name: 'circular' };
      circular.self = circular;

      // Should not throw on circular reference
      await expect(
        agent.execute({ type: 'circular', payload: circular })
      ).resolves.not.toThrow();
    });
  });
});