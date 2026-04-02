import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PickerAgent, PickerAgentConfig, PickerAgentDependencies, PickerAgentInput, PickerAgentOutput } from './PickerAgent';
import { Logger } from '@harness/logging';
import { MetricsCollector } from '@harness/metrics';
import { FeatureFlagClient } from '@harness/ff-client';
import { AIProvider } from '../providers/AIProvider';
import { ToolRegistry } from '../tools/ToolRegistry';
import { ValidationError, AIProcessingError } from '../errors';
import { AgentState } from '../types/AgentTypes';

// Mock dependencies
const createMockLogger = (): jest.Mocked<Logger> => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn().mockReturnThis(),
});

const createMockMetricsCollector = (): jest.Mocked<MetricsCollector> => ({
  recordCounter: jest.fn(),
  recordHistogram: jest.fn(),
  recordGauge: jest.fn(),
  startTimer: jest.fn().mockReturnValue(jest.fn()),
});

const createMockFeatureFlagClient = (): jest.Mocked<FeatureFlagClient> => ({
  isEnabled: jest.fn().mockResolvedValue(true),
  getVariation: jest.fn().mockResolvedValue(true),
  close: jest.fn().mockResolvedValue(undefined),
});

const createMockAIProvider = (): jest.Mocked<AIProvider> => ({
  generateCompletion: jest.fn(),
  generateEmbedding: jest.fn(),
  getModelInfo: jest.fn(),
  validateRequest: jest.fn(),
});

const createMockToolRegistry = (): jest.Mocked<ToolRegistry> => ({
  register: jest.fn(),
  get: jest.fn(),
  list: jest.fn().mockReturnValue([]),
  execute: jest.fn(),
  has: jest.fn().mockReturnValue(false),
});

describe('PickerAgent', () => {
  let pickerAgent: PickerAgent;
  let mockLogger: jest.Mocked<Logger>;
  let mockMetrics: jest.Mocked<MetricsCollector>;
  let mockFeatureFlags: jest.Mocked<FeatureFlagClient>;
  let mockAIProvider: jest.Mocked<AIProvider>;
  let mockToolRegistry: jest.Mocked<ToolRegistry>;
  let config: PickerAgentConfig;
  let dependencies: PickerAgentDependencies;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Initialize mocks
    mockLogger = createMockLogger();
    mockMetrics = createMockMetricsCollector();
    mockFeatureFlags = createMockFeatureFlagClient();
    mockAIProvider = createMockAIProvider();
    mockToolRegistry = createMockToolRegistry();

    // Default configuration
    config = {
      maxRetries: 3,
      timeoutMs: 30000,
      modelConfig: {
        model: 'gpt-4',
        temperature: 0.1,
        maxTokens: 500,
      },
      selectionCriteria: {
        maxSelections: 5,
        minConfidence: 0.7,
      },
    };

    // Assemble dependencies following the six-layer architecture
    // Config layer → Service layer injection
    dependencies = {
      logger: mockLogger,
      metrics: mockMetrics,
      featureFlags: mockFeatureFlags,
      aiProvider: mockAIProvider,
      toolRegistry: mockToolRegistry,
    };

    // Instantiate the agent (Runtime layer)
    pickerAgent = new PickerAgent(config, dependencies);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create PickerAgent with valid config and dependencies', () => {
      expect(pickerAgent).toBeDefined();
      expect(pickerAgent.getState()).toBe(AgentState.IDLE);
    });

    it('should throw ValidationError when config is invalid', () => {
      const invalidConfig = { ...config, maxRetries: -1 };

      expect(() => new PickerAgent(invalidConfig, dependencies)).toThrow(ValidationError);
    });

    it('should throw ValidationError when required dependencies are missing', () => {
      const invalidDeps = { ...dependencies, aiProvider: undefined as unknown as AIProvider };

      expect(() => new PickerAgent(config, invalidDeps)).toThrow(ValidationError);
    });

    it('should initialize with custom logger child context', () => {
      new PickerAgent(config, dependencies);

      expect(mockLogger.child).toHaveBeenCalledWith({ agent: 'PickerAgent' });
    });
  });

  describe('execute', () => {
    const validInput: PickerAgentInput = {
      options: [
        { id: 'opt-1', label: 'Option 1', metadata: { priority: 'high' } },
        { id: 'opt-2', label: 'Option 2', metadata: { priority: 'medium' } },
        { id: 'opt-3', label: 'Option 3', metadata: { priority: 'low' } },
      ],
      context: 'Select the highest priority option',
      constraints: {
        maxSelections: 2,
        requiredIds: ['opt-1'],
      },
    };

    const mockAIResponse = {
      selections: [
        { id: 'opt-1', confidence: 0.95, reasoning: 'Highest priority' },
        { id: 'opt-2', confidence: 0.8, reasoning: 'Medium priority fallback' },
      ],
      explanation: 'Selected based on priority metadata',
    };

    it('should successfully execute picking with valid input', async () => {
      // Arrange: Setup AI provider mock response
      mockAIProvider.generateCompletion.mockResolvedValue({
        content: JSON.stringify(mockAIResponse),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'gpt-4',
      });

      // Act: Execute the agent
      const result: PickerAgentOutput = await pickerAgent.execute(validInput);

      // Assert: Verify the output structure and values
      expect(result).toBeDefined();
      expect(result.selections).toHaveLength(2);
      expect(result.selections[0].id).toBe('opt-1');
      expect(result.selections[0].confidence).toBe(0.95);
      expect(result.explanation).toBe(mockAIResponse.explanation);
      expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);

      // Verify state transitions: IDLE → PROCESSING → COMPLETED
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ state: AgentState.PROCESSING }),
        'PickerAgent state transition'
      );
    });

    it('should validate input options are non-empty', async () => {
      const invalidInput: PickerAgentInput = {
        ...validInput,
        options: [],
      };

      await expect(pickerAgent.execute(invalidInput)).rejects.toThrow(ValidationError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(ValidationError) }),
        'Input validation failed'
      );
    });

    it('should enforce maxSelections constraint from config', async () => {
      const inputWithTooManyConstraints: PickerAgentInput = {
        ...validInput,
        constraints: { maxSelections: 10 }, // Exceeds config.maxSelections of 5
      };

      mockAIProvider.generateCompletion.mockResolvedValue({
        content: JSON.stringify({
          selections: Array(10).fill(null).map((_, i) => ({
            id: `opt-${i}`,
            confidence: 0.9,
            reasoning: 'Test',
          })),
        }),
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        model: 'gpt-4',
      });

      const result = await pickerAgent.execute(inputWithTooManyConstraints);

      // Should cap selections to config maximum
      expect(result.selections.length).toBeLessThanOrEqual(config.selectionCriteria.maxSelections);
    });

    it('should handle AI provider timeout with retry logic', async () => {
      // Simulate timeout on first two attempts, success on third
      mockAIProvider.generateCompletion
        .mockRejectedValueOnce(new Error('Request timeout'))
        .mockRejectedValueOnce(new Error('Request timeout'))
        .mockResolvedValueOnce({
          content: JSON.stringify(mockAIResponse),
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          model: 'gpt-4',
        });

      const result = await pickerAgent.execute(validInput);

      expect(result.selections).toHaveLength(2);
      expect(mockAIProvider.generateCompletion).toHaveBeenCalledTimes(3);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 1 }),
        'Retrying after AI provider error'
      );
    });

    it('should throw AIProcessingError when max retries exceeded', async () => {
      mockAIProvider.generateCompletion.mockRejectedValue(new Error('Persistent failure'));

      await expect(pickerAgent.execute(validInput)).rejects.toThrow(AIProcessingError);
      expect(mockAIProvider.generateCompletion).toHaveBeenCalledTimes(config.maxRetries);
      expect(mockMetrics.recordCounter).toHaveBeenCalledWith(
        'picker_agent.failure',
        1,
        expect.any(Object)
      );
    });

    it('should handle malformed AI response with fallback', async () => {
      mockAIProvider.generateCompletion.mockResolvedValue({
        content: 'invalid json',
        usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
        model: 'gpt-4',
      });

      // Should attempt to parse and fall back to safe defaults
      const result = await pickerAgent.execute(validInput);

      expect(result.selections).toEqual([]);
      expect(result.explanation).toContain('Failed to parse');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ rawContent: 'invalid json' }),
        'Failed to parse AI response, using fallback'
      );
    });

    it('should filter selections below minimum confidence threshold', async () => {
      const lowConfidenceResponse = {
        selections: [
          { id: 'opt-1', confidence: 0.95, reasoning: 'High confidence' },
          { id: 'opt-2', confidence: 0.5, reasoning: 'Low confidence' }, // Below 0.7 threshold
          { id: 'opt-3', confidence: 0.65, reasoning: 'Borderline' }, // Below 0.7 threshold
        ],
      };

      mockAIProvider.generateCompletion.mockResolvedValue({
        content: JSON.stringify(lowConfidenceResponse),
        usage: { promptTokens: 100, completionTokens: 80, totalTokens: 180 },
        model: 'gpt-4',
      });

      const result = await pickerAgent.execute(validInput);

      // Only high confidence selection should remain
      expect(result.selections).toHaveLength(1);
      expect(result.selections[0].id).toBe('opt-1');
    });

    it('should respect requiredIds constraints', async () => {
      const inputWithRequired: PickerAgentInput = {
        ...validInput,
        constraints: { requiredIds: ['opt-1', 'opt-3'] },
      };

      const responseMissingRequired = {
        selections: [
          { id: 'opt-2', confidence: 0.9, reasoning: 'Not required but selected' },
        ],
      };

      mockAIProvider.generateCompletion.mockResolvedValue({
        content: JSON.stringify(responseMissingRequired),
        usage: { promptTokens: 100, completionTokens: 40, totalTokens: 140 },
        model: 'gpt-4',
      });

      const result = await pickerAgent.execute(inputWithRequired);

      // Should inject missing required selections with warning
      const requiredSelection = result.selections.find(s => s.id === 'opt-1');
      expect(requiredSelection).toBeDefined();
      expect(requiredSelection?.confidence).toBe(1.0); // Required items get max confidence
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ missingRequiredIds: ['opt-1', 'opt-3'] }),
        'AI response missing required selections, injecting with max confidence'
      );
    });

    it('should record metrics for successful execution', async () => {
      mockAIProvider.generateCompletion.mockResolvedValue({
        content: JSON.stringify(mockAIResponse),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'gpt-4',
      });

      await pickerAgent.execute(validInput);

      expect(mockMetrics.recordHistogram).toHaveBeenCalledWith(
        'picker_agent.latency_ms',
        expect.any(Number),
        expect.any(Object)
      );
      expect(mockMetrics.recordCounter).toHaveBeenCalledWith(
        'picker_agent.success',
        1,
        expect.any(Object)
      );
    });

    it('should check feature flag before using advanced features', async () => {
      mockFeatureFlags.isEnabled.mockResolvedValue(false);

      const advancedConfig: PickerAgentConfig = {
        ...config,
        enableSemanticRanking: true, // Requires feature flag
      };

      const advancedAgent = new PickerAgent(advancedConfig, dependencies);
      
      mockAIProvider.generateCompletion.mockResolvedValue({
        content: JSON.stringify(mockAIResponse),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'gpt-4',
      });

      await advancedAgent.execute(validInput);

      expect(mockFeatureFlags.isEnabled).toHaveBeenCalledWith('AI_PICKER_SEMANTIC_RANKING');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Semantic ranking disabled by feature flag'
      );
    });

    it('should handle concurrent execution requests safely', async () => {
      mockAIProvider.generateCompletion.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          content: JSON.stringify(mockAIResponse),
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          model: 'gpt-4',
        };
      });

      // Execute two calls concurrently
      const [result1, result2] = await Promise.all([
        pickerAgent.execute(validInput),
        pickerAgent.execute(validInput),
      ]);

      expect(result1.selections).toHaveLength(2);
      expect(result2.selections).toHaveLength(2);
      // Each should have independent state
      expect(mockLogger.debug).toHaveBeenCalledTimes(expect.any(Number));
    });
  });

  describe('abort', () => {
    it('should abort ongoing execution', async () => {
      const input: PickerAgentInput = {
        options: [{ id: '1', label: 'Test' }],
        context: 'Test context',
      };

      // Start execution but don't await
      const executionPromise = pickerAgent.execute(input);

      // Immediately abort
      pickerAgent.abort();

      await expect(executionPromise).rejects.toThrow('Execution aborted');
      expect(pickerAgent.getState()).toBe(AgentState.ABORTED);
    });

    it('should be safe to call abort when not executing', () => {
      expect(() => pickerAgent.abort()).not.toThrow();
      expect(pickerAgent.getState()).toBe(AgentState.IDLE);
    });
  });

  describe('reset', () => {
    it('should reset agent state to IDLE', async () => {
      // Put agent in error state by causing a failure
      mockAIProvider.generateCompletion.mockRejectedValue(new Error('Fail'));

      try {
        await pickerAgent.execute({
          options: [{ id: '1', label: 'Test' }],
          context: 'Test',
        });
      } catch {
        // Expected
      }

      expect(pickerAgent.getState()).toBe(AgentState.ERROR);

      pickerAgent.reset();

      expect(pickerAgent.getState()).toBe(AgentState.IDLE);
      expect(mockLogger.info).toHaveBeenCalledWith('PickerAgent reset to IDLE state');
    });
  });

  describe('getState', () => {
    it('should return current agent state', () => {
      expect(pickerAgent.getState()).toBe(AgentState.IDLE);
    });
  });

  describe('private methods (via integration)', () => {
    it('should build correct prompt for AI provider', async () => {
      const input: PickerAgentInput = {
        options: [
          { id: 'a', label: 'Alpha', metadata: { tags: ['important'] } },
          { id: 'b', label: 'Beta' },
        ],
        context: 'Choose the important one',
        constraints: { maxSelections: 1 },
      };

      mockAIProvider.generateCompletion.mockResolvedValue({
        content: JSON.stringify({ selections: [{ id: 'a', confidence: 0.9 }] }),
        usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
        model: 'gpt-4',
      });

      await pickerAgent.execute(input);

      // Verify the prompt construction by checking the call arguments
      const callArgs = mockAIProvider.generateCompletion.mock.calls[0][0];
      expect(callArgs.prompt).toContain('Alpha');
      expect(callArgs.prompt).toContain('important');
      expect(callArgs.prompt).toContain('Choose the important one');
      expect(callArgs.modelConfig).toEqual(config.modelConfig);
    });

    it('should validate AI response schema strictly', async () => {
      const invalidSchemaResponse = {
        selections: [
          { id: 'opt-1' }, // Missing confidence and reasoning
        ],
      };

      mockAIProvider.generateCompletion.mockResolvedValue({
        content: JSON.stringify(invalidSchemaResponse),
        usage: { promptTokens: 100, completionTokens: 30, totalTokens: 130 },
        model: 'gpt-4',
      });

      const result = await pickerAgent.execute({
        options: [{ id: 'opt-1', label: 'Test' }],
        context: 'Test',
      });

      // Should fill in defaults for missing fields
      expect(result.selections[0].confidence).toBe(config.selectionCriteria.minConfidence);
      expect(result.selections[0].reasoning).toBe('No reasoning provided');
    });
  });
});