import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { BaseAgent, AgentState } from './base-agent';
import type { IAgentConfig, IAgentContext, IAgentMessage, IAgentResponse, IAgentTool } from '../types/agent.types';
import { AgentError, AgentErrorCode } from '../errors/agent-error';
import { Logger } from '../logging/logger';

// Mock the logger to avoid actual logging during tests
vi.mock('../logging/logger', () => ({
  Logger: {
    getInstance: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

// Mock tool for testing
const createMockTool = (name: string, executeResult: unknown = 'mock-result'): IAgentTool => ({
  name,
  description: `Mock tool: ${name}`,
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: vi.fn().mockResolvedValue(executeResult),
});

// Mock config factory
const createMockConfig = (overrides: Partial<IAgentConfig> = {}): IAgentConfig => ({
  id: 'test-agent-id',
  name: 'TestAgent',
  model: 'gpt-4',
  maxTokens: 1000,
  temperature: 0.7,
  systemPrompt: 'You are a test agent.',
  tools: [],
  ...overrides,
});

// Mock context factory
const createMockContext = (overrides: Partial<IAgentContext> = {}): IAgentContext => ({
  requestId: 'test-request-123',
  userId: 'user-456',
  sessionId: 'session-789',
  metadata: {},
  ...overrides,
});

describe('BaseAgent', () => {
  let mockConfig: IAgentConfig;
  let mockContext: IAgentContext;
  let agent: BaseAgent;

  beforeEach(() => {
    mockConfig = createMockConfig();
    mockContext = createMockContext();
    agent = new BaseAgent(mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Layer 1: Types - Configuration Validation', () => {
    it('should throw AgentError when config is missing required fields', () => {
      // Test missing id
      expect(() => new BaseAgent({ ...mockConfig, id: '' })).toThrow(AgentError);
      expect(() => new BaseAgent({ ...mockConfig, id: '' })).toThrow('Agent ID is required');

      // Test missing name
      expect(() => new BaseAgent({ ...mockConfig, name: '' })).toThrow(AgentError);
      expect(() => new BaseAgent({ ...mockConfig, name: '' })).toThrow('Agent name is required');

      // Test missing model
      expect(() => new BaseAgent({ ...mockConfig, model: '' })).toThrow(AgentError);
      expect(() => new BaseAgent({ ...mockConfig, model: '' })).toThrow('Model is required');
    });

    it('should validate temperature bounds', () => {
      // Temperature below 0 should be clamped or throw
      const lowTempConfig = createMockConfig({ temperature: -0.5 });
      expect(() => new BaseAgent(lowTempConfig)).toThrow(AgentError);

      // Temperature above 2 should be clamped or throw
      const highTempConfig = createMockConfig({ temperature: 2.5 });
      expect(() => new BaseAgent(highTempConfig)).toThrow(AgentError);
    });

    it('should validate maxTokens is positive', () => {
      const invalidConfig = createMockConfig({ maxTokens: 0 });
      expect(() => new BaseAgent(invalidConfig)).toThrow(AgentError);

      const negativeConfig = createMockConfig({ maxTokens: -100 });
      expect(() => new BaseAgent(negativeConfig)).toThrow(AgentError);
    });

    it('should accept valid configuration', () => {
      expect(() => new BaseAgent(mockConfig)).not.toThrow();
    });
  });

  describe('Layer 2: Config - Agent Initialization', () => {
    it('should initialize with correct default state', () => {
      expect(agent.getState()).toBe(AgentState.IDLE);
      expect(agent.getId()).toBe(mockConfig.id);
      expect(agent.getName()).toBe(mockConfig.name);
    });

    it('should register tools from config during initialization', () => {
      const mockTool = createMockTool('test-tool');
      const configWithTools = createMockConfig({ tools: [mockTool] });
      const agentWithTools = new BaseAgent(configWithTools);

      expect(agentWithTools.getTool('test-tool')).toBe(mockTool);
    });

    it('should prevent duplicate tool registration', () => {
      const mockTool = createMockTool('duplicate-tool');
      const configWithTools = createMockConfig({ tools: [mockTool, mockTool] });

      expect(() => new BaseAgent(configWithTools)).toThrow(AgentError);
      expect(() => new BaseAgent(configWithTools)).toThrow('Tool already registered');
    });

    it('should validate tool names are non-empty', () => {
      const invalidTool = createMockTool('');
      const configWithInvalidTool = createMockConfig({ tools: [invalidTool] });

      expect(() => new BaseAgent(configWithInvalidTool)).toThrow(AgentError);
    });
  });

  describe('Layer 3: Repo - State Management', () => {
    it('should transition through valid state changes', () => {
      // Initial state
      expect(agent.getState()).toBe(AgentState.IDLE);

      // Transition to PROCESSING
      agent.setState(AgentState.PROCESSING);
      expect(agent.getState()).toBe(AgentState.PROCESSING);

      // Transition to COMPLETED
      agent.setState(AgentState.COMPLETED);
      expect(agent.getState()).toBe(AgentState.COMPLETED);

      // Reset to IDLE
      agent.setState(AgentState.IDLE);
      expect(agent.getState()).toBe(AgentState.IDLE);
    });

    it('should throw on invalid state transitions', () => {
      // Cannot go from IDLE directly to COMPLETED
      expect(() => agent.setState(AgentState.COMPLETED)).toThrow(AgentError);

      // Set to PROCESSING first
      agent.setState(AgentState.PROCESSING);

      // Cannot go from PROCESSING to IDLE (must go through COMPLETED or ERROR)
      expect(() => agent.setState(AgentState.IDLE)).toThrow(AgentError);
    });

    it('should handle ERROR state from any active state', () => {
      agent.setState(AgentState.PROCESSING);
      agent.setState(AgentState.ERROR);
      expect(agent.getState()).toBe(AgentState.ERROR);

      // Can reset from ERROR to IDLE
      agent.setState(AgentState.IDLE);
      expect(agent.getState()).toBe(AgentState.IDLE);
    });

    it('should track state history for debugging', () => {
      agent.setState(AgentState.PROCESSING);
      agent.setState(AgentState.COMPLETED);
      agent.setState(AgentState.IDLE);

      const history = agent.getStateHistory();
      expect(history).toHaveLength(4); // Initial + 3 transitions
      expect(history[0].state).toBe(AgentState.IDLE);
      expect(history[1].state).toBe(AgentState.PROCESSING);
      expect(history[2].state).toBe(AgentState.COMPLETED);
      expect(history[3].state).toBe(AgentState.IDLE);
    });
  });

  describe('Layer 4: Service - Message Processing', () => {
    it('should process a simple message successfully', async () => {
      const message: IAgentMessage = {
        role: 'user',
        content: 'Hello, agent!',
        timestamp: new Date(),
      };

      const response = await agent.process(message, mockContext);

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(response.metadata.requestId).toBe(mockContext.requestId);
      expect(agent.getState()).toBe(AgentState.COMPLETED);
    });

    it('should throw when processing while already busy', async () => {
      const message: IAgentMessage = {
        role: 'user',
        content: 'Test message',
        timestamp: new Date(),
      };

      // Start first processing (mock to stay in PROCESSING)
      const processPromise = agent.process(message, mockContext);

      // Attempt second processing should fail
      await expect(agent.process(message, mockContext)).rejects.toThrow(AgentError);
      await expect(agent.process(message, mockContext)).rejects.toThrow('Agent is busy');

      // Complete the first request
      await processPromise;
    });

    it('should handle empty message content', async () => {
      const emptyMessage: IAgentMessage = {
        role: 'user',
        content: '',
        timestamp: new Date(),
      };

      await expect(agent.process(emptyMessage, mockContext)).rejects.toThrow(AgentError);
      await expect(agent.process(emptyMessage, mockContext)).rejects.toThrow('Message content is required');
    });

    it('should validate context has required fields', async () => {
      const message: IAgentMessage = {
        role: 'user',
        content: 'Test',
        timestamp: new Date(),
      };

      const invalidContext = { ...mockContext, requestId: '' };
      await expect(agent.process(message, invalidContext)).rejects.toThrow(AgentError);
    });

    it('should maintain conversation history', async () => {
      const messages: IAgentMessage[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
        { role: 'user', content: 'Message 2', timestamp: new Date() },
      ];

      for (const message of messages) {
        await agent.process(message, mockContext);
      }

      const history = agent.getConversationHistory();
      expect(history).toHaveLength(4); // 2 user messages + 2 assistant responses
    });

    it('should respect max history limit', async () => {
      const configWithLimit = createMockConfig({ maxHistoryLength: 2 });
      const limitedAgent = new BaseAgent(configWithLimit);

      const messages: IAgentMessage[] = Array.from({ length: 5 }, (_, i) => ({
        role: 'user',
        content: `Message ${i + 1}`,
        timestamp: new Date(),
      }));

      for (const message of messages) {
        await limitedAgent.process(message, mockContext);
      }

      const history = limitedAgent.getConversationHistory();
      expect(history.length).toBeLessThanOrEqual(4); // max 2 exchanges = 4 messages
    });
  });

  describe('Layer 5: Runtime - Tool Execution', () => {
    it('should execute registered tools', async () => {
      const mockTool = createMockTool('calculator', 42);
      const configWithTool = createMockConfig({ tools: [mockTool] });
      const toolAgent = new BaseAgent(configWithTool);

      const result = await toolAgent.executeTool('calculator', { expression: '2+2' }, mockContext);

      expect(result).toBe(42);
      expect(mockTool.execute).toHaveBeenCalledWith({ expression: '2+2' }, mockContext);
    });

    it('should throw when executing unknown tool', async () => {
      await expect(agent.executeTool('unknown-tool', {}, mockContext)).rejects.toThrow(AgentError);
      await expect(agent.executeTool('unknown-tool', {}, mockContext)).rejects.toThrow('Tool not found');
    });

    it('should handle tool execution errors', async () => {
      const errorTool: IAgentTool = {
        name: 'error-tool',
        description: 'Tool that throws',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn().mockRejectedValue(new Error('Tool failed')),
      };

      const configWithErrorTool = createMockConfig({ tools: [errorTool] });
      const errorAgent = new BaseAgent(configWithErrorTool);

      await expect(errorAgent.executeTool('error-tool', {}, mockContext)).rejects.toThrow(AgentError);
    });

    it('should validate tool parameters against schema', async () => {
      const schemaTool: IAgentTool = {
        name: 'schema-tool',
        description: 'Tool with schema',
        parameters: {
          type: 'object',
          properties: {
            requiredParam: { type: 'string' },
          },
          required: ['requiredParam'],
        },
        execute: vi.fn().mockResolvedValue('success'),
      };

      const configWithSchemaTool = createMockConfig({ tools: [schemaTool] });
      const schemaAgent = new BaseAgent(configWithSchemaTool);

      // Missing required parameter
      await expect(schemaAgent.executeTool('schema-tool', {}, mockContext)).rejects.toThrow(AgentError);

      // Valid parameters
      await expect(schemaAgent.executeTool('schema-tool', { requiredParam: 'value' }, mockContext)).resolves.toBe('success');
    });

    it('should enforce tool execution timeout', async () => {
      const slowTool: IAgentTool = {
        name: 'slow-tool',
        description: 'Tool that takes too long',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 10000))),
      };

      const configWithSlowTool = createMockConfig({ tools: [slowTool], toolTimeoutMs: 100 });
      const slowAgent = new BaseAgent(configWithSlowTool);

      await expect(slowAgent.executeTool('slow-tool', {}, mockContext)).rejects.toThrow(AgentError);
      await expect(slowAgent.executeTool('slow-tool', {}, mockContext)).rejects.toThrow('timeout');
    });
  });

  describe('Layer 6: UI - Response Formatting', () => {
    it('should format response with metadata', async () => {
      const message: IAgentMessage = {
        role: 'user',
        content: 'Test',
        timestamp: new Date(),
      };

      const response = await agent.process(message, mockContext);

      expect(response).toMatchObject<IAgentResponse>({
        content: expect.any(String),
        role: 'assistant',
        metadata: {
          requestId: mockContext.requestId,
          agentId: mockConfig.id,
          agentName: mockConfig.name,
          timestamp: expect.any(Date),
          tokensUsed: expect.any(Number),
          processingTimeMs: expect.any(Number),
        },
      });
    });

    it('should include tool calls in response when tools are used', async () => {
      const mockTool = createMockTool('search', 'search results');
      const configWithTool = createMockConfig({ tools: [mockTool] });
      const toolAgent = new BaseAgent(configWithTool);

      // Mock the process method to simulate tool usage
      const originalProcess = toolAgent.process.bind(toolAgent);
      toolAgent.process = vi.fn().mockImplementation(async (msg, ctx) => {
        const response = await originalProcess(msg, ctx);
        return {
          ...response,
          toolCalls: [
            {
              toolName: 'search',
              parameters: { query: 'test' },
              result: 'search results',
            },
          ],
        };
      });

      const message: IAgentMessage = {
        role: 'user',
        content: 'Search for something',
        timestamp: new Date(),
      };

      const response = await toolAgent.process(message, mockContext);

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].toolName).toBe('search');
    });

    it('should handle streaming responses', async () => {
      const streamingConfig = createMockConfig({ streaming: true });
      const streamingAgent = new BaseAgent(streamingConfig);

      const message: IAgentMessage = {
        role: 'user',
        content: 'Stream this',
        timestamp: new Date(),
      };

      const chunks: string[] = [];
      const onChunk = (chunk: string) => chunks.push(chunk);

      const response = await streamingAgent.process(message, mockContext, { onChunk });

      expect(chunks.length).toBeGreaterThan(0);
      expect(response.content).toBe(chunks.join(''));
    });
  });

  describe('Error Handling', () => {
    it('should wrap unknown errors in AgentError', async () => {
      // Force an internal error by mocking a method
      vi.spyOn(agent as unknown as { internalProcess: () => Promise<never> }, 'internalProcess').mockRejectedValue(
        new Error('Unexpected internal error')
      );

      const message: IAgentMessage = {
        role: 'user',
        content: 'Trigger error',
        timestamp: new Date(),
      };

      await expect(agent.process(message, mockContext)).rejects.toThrow(AgentError);
    });

    it('should preserve error codes for known errors', async () => {
      const specificError = new AgentError(
        'Specific error',
        AgentErrorCode.CONFIGURATION_ERROR,
        { detail: 'extra info' }
      );

      vi.spyOn(agent as unknown as { internalProcess: () => Promise<never> }, 'internalProcess').mockRejectedValue(
        specificError
      );

      const message: IAgentMessage = {
        role: 'user',
        content: 'Trigger specific error',
        timestamp: new Date(),
      };

      await expect(agent.process(message, mockContext)).rejects.toMatchObject({
        code: AgentErrorCode.CONFIGURATION_ERROR,
        details: { detail: 'extra info' },
      });
    });

    it('should transition to ERROR state on failure', async () => {
      vi.spyOn(agent as unknown as { internalProcess: () => Promise<never> }, 'internalProcess').mockRejectedValue(
        new Error('Process failed')
      );

      const message: IAgentMessage = {
        role: 'user',
        content: 'Trigger failure',
        timestamp: new Date(),
      };

      await expect(agent.process(message, mockContext)).rejects.toThrow();
      expect(agent.getState()).toBe(AgentState.ERROR);
    });

    it('should allow recovery from ERROR state', async () => {
      // Force error state
      agent.setState(AgentState.PROCESSING);
      agent.setState(AgentState.ERROR);

      // Reset should work
      agent.reset();
      expect(agent.getState()).toBe(AgentState.IDLE);
      expect(agent.getConversationHistory()).toHaveLength(0);
    });
  });

  describe('Logging', () => {
    it('should log state transitions', () => {
      const logger = Logger.getInstance();
      agent.setState(AgentState.PROCESSING);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('State transition'),
        expect.any(Object)
      );
    });

    it('should log tool executions', async () => {
      const logger = Logger.getInstance();
      const mockTool = createMockTool('logged-tool');
      const configWithTool = createMockConfig({ tools: [mockTool] });
      const loggedAgent = new BaseAgent(configWithTool);

      await loggedAgent.executeTool('logged-tool', {}, mockContext);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Executing tool'),
        expect.objectContaining({ toolName: 'logged-tool' })
      );
    });

    it('should log errors with context', async () => {
      const logger = Logger.getInstance();
      const errorTool: IAgentTool = {
        name: 'failing-tool',
        description: 'Tool that fails',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn().mockRejectedValue(new Error('Execution failed')),
      };

      const configWithFailingTool = createMockConfig({ tools: [errorTool] });
      const failingAgent = new BaseAgent(configWithFailingTool);

      await expect(failingAgent.executeTool('failing-tool', {}, mockContext)).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Tool execution failed'),
        expect.objectContaining({
          toolName: 'failing-tool',
          error: expect.any(String),
        })
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent reset during processing', async () => {
      const message: IAgentMessage = {
        role: 'user',
        content: 'Long running task',
        timestamp: new Date(),
      };

      // Start processing
      const processPromise = agent.process(message, mockContext);

      // Attempt reset while processing
      agent.reset();

      // Should complete processing but state might be inconsistent
      await processPromise;

      // After explicit reset, should be clean
      agent.reset();
      expect(agent.getState()).toBe(AgentState.IDLE);
    });

    it('should handle very long messages', async () => {
      const longMessage: IAgentMessage = {
        role: 'user',
        content: 'a'.repeat(100000),
        timestamp: new Date(),
      };

      // Should either process or throw a specific error, not crash
      await expect(agent.process(longMessage, mockContext)).resolves.toBeDefined();
    });

    it('should handle special characters in messages', async () => {
      const specialMessage: IAgentMessage = {
        role: 'user',
        content: 'Hello \n\t\r!@#$%^&*()_+{}|:"<>?`~[]\\;\',./',
        timestamp: new Date(),
      };

      const response = await agent.process(specialMessage, mockContext);
      expect(response.content).toBeDefined();
    });

    it('should handle tool with circular reference in result', async () => {
      const circularResult: Record<string, unknown> = { value: 'test' };
      circularResult.self = circularResult;

      const circularTool = createMockTool('circular', circularResult);
      const configWithCircularTool = createMockConfig({ tools: [circularTool] });
      const circularAgent = new BaseAgent(configWithCircularTool);

      // Should handle circular reference gracefully
      const result = await circularAgent.executeTool('circular', {}, mockContext);
      expect(result).toBeDefined();
    });

    it('should validate timestamp is not in future', async () => {
      const futureMessage: IAgentMessage = {
        role: 'user',
        content: 'From the future',
        timestamp: new Date(Date.now() + 86400000), // Tomorrow
      };

      await expect(agent.process(futureMessage, mockContext)).rejects.toThrow(AgentError);
    });
  });
});