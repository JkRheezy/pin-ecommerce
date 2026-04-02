// src/lib/ai/picker-agent.test.ts
// Layer: Service - Tests for the Picker Agent service

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import {
  createPickerAgent,
  type PickerAgent,
  type PickerAgentConfig,
  type PickerAgentDependencies,
  type PickerSelection,
  type PickerContext,
  PickerAgentError,
  PickerAgentErrorCode,
} from './picker-agent';
import type { Logger } from '../logging/types';
import type { AIClient } from './types';

// -----------------------------------------------------------------------------
// Types Layer - Test Fixtures and Mocks
// -----------------------------------------------------------------------------

interface TestFixture {
  mockLogger: Logger;
  mockAIClient: AIClient;
  validConfig: PickerAgentConfig;
  validContext: PickerContext;
}

// -----------------------------------------------------------------------------
// Config Layer - Test Setup Helpers
// -------------------------------------------------------------------

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

function createMockAIClient(): AIClient {
  return {
    complete: vi.fn(),
    stream: vi.fn(),
    embed: vi.fn(),
  };
}

function createTestFixture(): TestFixture {
  return {
    mockLogger: createMockLogger(),
    mockAIClient: createMockAIClient(),
    validConfig: {
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 500,
      timeoutMs: 30000,
    },
    validContext: {
      availableOptions: ['option-a', 'option-b', 'option-c'],
      selectionCriteria: 'Select the best option for production use',
      previousSelections: [],
      metadata: {
        requestId: 'test-request-123',
        timestamp: new Date().toISOString(),
      },
    },
  };
}

// -----------------------------------------------------------------------------
// Service Layer - Test Suite
// -----------------------------------------------------------------------------

describe('PickerAgent', () => {
  let fixture: TestFixture;
  let agent: PickerAgent;

  beforeEach(() => {
    fixture = createTestFixture();
    const deps: PickerAgentDependencies = {
      logger: fixture.mockLogger,
      aiClient: fixture.mockAIClient,
    };
    agent = createPickerAgent(fixture.validConfig, deps);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Construction Tests
  // ---------------------------------------------------------------------------

  describe('createPickerAgent', () => {
    it('should create agent with valid config and dependencies', () => {
      const deps: PickerAgentDependencies = {
        logger: fixture.mockLogger,
        aiClient: fixture.mockAIClient,
      };

      const result = createPickerAgent(fixture.validConfig, deps);

      expect(result).toBeDefined();
      expect(typeof result.select).toBe('function');
      expect(typeof result.selectMultiple).toBe('function');
      expect(typeof result.validateSelection).toBe('function');
    });

    it('should throw PickerAgentError for missing logger', () => {
      const deps = {
        logger: undefined as unknown as Logger,
        aiClient: fixture.mockAIClient,
      };

      expect(() => createPickerAgent(fixture.validConfig, deps)).toThrow(
        PickerAgentError
      );
    });

    it('should throw PickerAgentError for missing AI client', () => {
      const deps = {
        logger: fixture.mockLogger,
        aiClient: undefined as unknown as AIClient,
      };

      expect(() => createPickerAgent(fixture.validConfig, deps)).toThrow(
        PickerAgentError
      );
    });

    it('should apply default config values when partial config provided', () => {
      const partialConfig: Partial<PickerAgentConfig> = {
        model: 'gpt-3.5-turbo',
      };
      const deps: PickerAgentDependencies = {
        logger: fixture.mockLogger,
        aiClient: fixture.mockAIClient,
      };

      const result = createPickerAgent(partialConfig as PickerAgentConfig, deps);

      expect(result).toBeDefined();
      // Verify defaults were applied through behavior
      expect(fixture.mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('PickerAgent initialized'),
        expect.any(Object)
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Single Selection Tests
  // ---------------------------------------------------------------------------

  describe('select', () => {
    it('should return valid selection for single option request', async () => {
      const expectedSelection: PickerSelection = {
        selectedId: 'option-b',
        confidence: 0.85,
        reasoning: 'Option B provides the best balance of performance and reliability',
      };

      (fixture.mockAIClient.complete as Mock).mockResolvedValue({
        content: JSON.stringify(expectedSelection),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
      });

      const result = await agent.select(fixture.validContext);

      expect(result).toEqual(expectedSelection);
      expect(fixture.mockAIClient.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          model: fixture.validConfig.model,
          temperature: fixture.validConfig.temperature,
          maxTokens: fixture.validConfig.maxTokens,
        })
      );
    });

    it('should throw PickerAgentError when no options available', async () => {
      const emptyContext: PickerContext = {
        ...fixture.validContext,
        availableOptions: [],
      };

      await expect(agent.select(emptyContext)).rejects.toThrow(PickerAgentError);
      await expect(agent.select(emptyContext)).rejects.toMatchObject({
        code: PickerAgentErrorCode.NO_OPTIONS_AVAILABLE,
      });
    });

    it('should throw PickerAgentError when AI client fails', async () => {
      (fixture.mockAIClient.complete as Mock).mockRejectedValue(
        new Error('Network timeout')
      );

      await expect(agent.select(fixture.validContext)).rejects.toThrow(
        PickerAgentError
      );
      await expect(agent.select(fixture.validContext)).rejects.toMatchObject({
        code: PickerAgentErrorCode.AI_CLIENT_ERROR,
      });
    });

    it('should throw PickerAgentError for invalid JSON response', async () => {
      (fixture.mockAIClient.complete as Mock).mockResolvedValue({
        content: 'not valid json',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
        finishReason: 'stop',
      });

      await expect(agent.select(fixture.validContext)).rejects.toThrow(
        PickerAgentError
      );
      await expect(agent.select(fixture.validContext)).rejects.toMatchObject({
        code: PickerAgentErrorCode.INVALID_RESPONSE,
      });
    });

    it('should throw PickerAgentError when selected option not in available list', async () => {
      const invalidSelection: PickerSelection = {
        selectedId: 'unknown-option',
        confidence: 0.9,
        reasoning: 'This option is not valid',
      };

      (fixture.mockAIClient.complete as Mock).mockResolvedValue({
        content: JSON.stringify(invalidSelection),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
      });

      await expect(agent.select(fixture.validContext)).rejects.toThrow(
        PickerAgentError
      );
      await expect(agent.select(fixture.validContext)).rejects.toMatchObject({
        code: PickerAgentErrorCode.INVALID_SELECTION,
      });
    });

    it('should handle timeout and abort signal', async () => {
      const abortController = new AbortController();

      (fixture.mockAIClient.complete as Mock).mockImplementation(
        async (_params, options) => {
          // Simulate checking for abort signal
          if (options?.signal?.aborted) {
            throw new Error('Aborted');
          }
          // Simulate long-running operation
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            content: JSON.stringify({
              selectedId: 'option-a',
              confidence: 0.8,
              reasoning: 'Selected',
            }),
            usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
            finishReason: 'stop',
          };
        }
      );

      // Abort immediately
      abortController.abort();

      await expect(
        agent.select(fixture.validContext, { signal: abortController.signal })
      ).rejects.toThrow();
    });

    it('should include previous selections in context when provided', async () => {
      const contextWithHistory: PickerContext = {
        ...fixture.validContext,
        previousSelections: [
          { selectedId: 'option-a', timestamp: '2024-01-01T00:00:00Z' },
        ],
      };

      (fixture.mockAIClient.complete as Mock).mockResolvedValue({
        content: JSON.stringify({
          selectedId: 'option-b',
          confidence: 0.9,
          reasoning: 'Avoiding recently used option',
        }),
        usage: { promptTokens: 150, completionTokens: 50, totalTokens: 200 },
        finishReason: 'stop',
      });

      await agent.select(contextWithHistory);

      // Verify the prompt includes previous selection context
      const callArgs = (fixture.mockAIClient.complete as Mock).mock.calls[0];
      expect(callArgs[0].messages[0].content).toContain('option-a');
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple Selection Tests
  // ---------------------------------------------------------------------------

  describe('selectMultiple', () => {
    it('should return multiple valid selections', async () => {
      const expectedSelections: PickerSelection[] = [
        {
          selectedId: 'option-b',
          confidence: 0.9,
          reasoning: 'Primary recommendation',
        },
        {
          selectedId: 'option-c',
          confidence: 0.75,
          reasoning: 'Secondary recommendation',
        },
      ];

      (fixture.mockAIClient.complete as Mock).mockResolvedValue({
        content: JSON.stringify({ selections: expectedSelections }),
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        finishReason: 'stop',
      });

      const result = await agent.selectMultiple(fixture.validContext, { maxSelections: 2 });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expectedSelections[0]);
      expect(result[1]).toEqual(expectedSelections[1]);
    });

    it('should limit selections to maxSelections parameter', async () => {
      const manySelections: PickerSelection[] = Array.from({ length: 5 }, (_, i) => ({
        selectedId: `option-${i}`,
        confidence: 0.8 - i * 0.1,
        reasoning: `Selection ${i}`,
      }));

      (fixture.mockAIClient.complete as Mock).mockResolvedValue({
        content: JSON.stringify({ selections: manySelections }),
        usage: { promptTokens: 300, completionTokens: 200, totalTokens: 500 },
        finishReason: 'stop',
      });

      const result = await agent.selectMultiple(fixture.validContext, { maxSelections: 3 });

      expect(result).toHaveLength(3);
      // Should be sorted by confidence descending
      expect(result[0].confidence).toBeGreaterThanOrEqual(result[1].confidence);
    });

    it('should throw PickerAgentError when maxSelections exceeds available options', async () => {
      await expect(
        agent.selectMultiple(fixture.validContext, { maxSelections: 10 })
      ).rejects.toThrow(PickerAgentError);
    });

    it('should handle empty selection list from AI', async () => {
      (fixture.mockAIClient.complete as Mock).mockResolvedValue({
        content: JSON.stringify({ selections: [] }),
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
        finishReason: 'stop',
      });

      const result = await agent.selectMultiple(fixture.validContext, { maxSelections: 2 });

      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Validation Tests
  // ---------------------------------------------------------------------------

  describe('validateSelection', () => {
    it('should return true for valid selection', () => {
      const selection: PickerSelection = {
        selectedId: 'option-a',
        confidence: 0.8,
        reasoning: 'Valid choice',
      };

      const result = agent.validateSelection(selection, fixture.validContext);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should return false for selection not in available options', () => {
      const selection: PickerSelection = {
        selectedId: 'invalid-option',
        confidence: 0.8,
        reasoning: 'Invalid choice',
      };

      const result = agent.validateSelection(selection, fixture.validContext);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('not in available options')
      );
    });

    it('should return false for confidence out of range', () => {
      const selection: PickerSelection = {
        selectedId: 'option-a',
        confidence: 1.5, // Invalid: > 1
        reasoning: 'Invalid confidence',
      };

      const result = agent.validateSelection(selection, fixture.validContext);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('confidence')
      );
    });

    it('should return false for negative confidence', () => {
      const selection: PickerSelection = {
        selectedId: 'option-a',
        confidence: -0.1,
        reasoning: 'Invalid confidence',
      };

      const result = agent.validateSelection(selection, fixture.validContext);

      expect(result.valid).toBe(false);
    });

    it('should return false for empty reasoning', () => {
      const selection: PickerSelection = {
        selectedId: 'option-a',
        confidence: 0.8,
        reasoning: '',
      };

      const result = agent.validateSelection(selection, fixture.validContext);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('reasoning')
      );
    });

    it('should collect multiple validation errors', () => {
      const selection: PickerSelection = {
        selectedId: 'invalid-option',
        confidence: -0.5,
        reasoning: '',
      };

      const result = agent.validateSelection(selection, fixture.validContext);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Logging Tests
  // ---------------------------------------------------------------------------

  describe('logging', () => {
    it('should log selection attempt at debug level', async () => {
      (fixture.mockAIClient.complete as Mock).mockResolvedValue({
        content: JSON.stringify({
          selectedId: 'option-a',
          confidence: 0.8,
          reasoning: 'Test',
        }),
        usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
        finishReason: 'stop',
      });

      await agent.select(fixture.validContext);

      expect(fixture.mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Selection attempt'),
        expect.objectContaining({
          requestId: fixture.validContext.metadata.requestId,
          optionCount: 3,
        })
      );
    });

    it('should log successful selection at info level', async () => {
      (fixture.mockAIClient.complete as Mock).mockResolvedValue({
        content: JSON.stringify({
          selectedId: 'option-a',
          confidence: 0.8,
          reasoning: 'Test',
        }),
        usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
        finishReason: 'stop',
      });

      await agent.select(fixture.validContext);

      expect(fixture.mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Selection completed'),
        expect.objectContaining({
          selectedId: 'option-a',
          confidence: 0.8,
        })
      );
    });

    it('should log errors with context', async () => {
      (fixture.mockAIClient.complete as Mock).mockRejectedValue(
        new Error('API Error')
      );

      await expect(agent.select(fixture.validContext)).rejects.toThrow();

      expect(fixture.mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Selection failed'),
        expect.objectContaining({
          error: expect.any(String),
          requestId: fixture.validContext.metadata.requestId,
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle single available option', async () => {
      const singleOptionContext: PickerContext = {
        ...fixture.validContext,
        availableOptions: ['only-option'],
      };

      (fixture.mockAIClient.complete as Mock).mockResolvedValue({
        content: JSON.stringify({
          selectedId: 'only-option',
          confidence: 1.0,
          reasoning: 'Only available option',
        }),
        usage: { promptTokens: 30, completionTokens: 20, totalTokens: 50 },
        finishReason: 'stop',
      });

      const result = await agent.select(singleOptionContext);

      expect(result.selectedId).toBe('only-option');
      expect(result.confidence).toBe(1.0);
    });

    it('should handle very long option identifiers', async () => {
      const longId = 'a'.repeat(1000);
      const longContext: PickerContext = {
        ...fixture.validContext,
        availableOptions: [longId, 'normal-id'],
      };

      (fixture.mockAIClient.complete as Mock).mockResolvedValue({
        content: JSON.stringify({
          selectedId: longId,
          confidence: 0.9,
          reasoning: 'Selected long ID',
        }),
        usage: { promptTokens: 200, completionTokens: 50, totalTokens: 250 },
        finishReason: 'stop',
      });

      const result = await agent.select(longContext);

      expect(result.selectedId).toBe(longId);
    });

    it('should handle special characters in option IDs', async () => {
      const specialIds = ['opt-ion_1', 'option.2', 'option/3', 'option:4'];
      const specialContext: PickerContext = {
        ...fixture.validContext,
        availableOptions: specialIds,
      };

      (fixture.mockAIClient.complete as Mock).mockResolvedValue({
        content: JSON.stringify({
          selectedId: 'opt-ion_1',
          confidence: 0.85,
          reasoning: 'Selected special ID',
        }),
        usage: { promptTokens: 100, completionTokens: 40, totalTokens: 140 },
        finishReason: 'stop',
      });

      const result = await agent.select(specialContext);

      expect(specialIds).toContain(result.selectedId);
    });

    it('should handle AI response with extra fields gracefully', async () => {
      const responseWithExtra = {
        selectedId: 'option-a',
        confidence: 0.8,
        reasoning: 'Valid',
        extraField: 'should be ignored',
        nested: { data: 'ignored' },
      };

      (fixture.mockAIClient.complete as Mock).mockResolvedValue({
        content: JSON.stringify(responseWithExtra),
        usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        finishReason: 'stop',
      });

      const result = await agent.select(fixture.validContext);

      expect(result.selectedId).toBe('option-a');
      expect(result).not.toHaveProperty('extraField');
    });

    it('should handle concurrent selection requests', async () => {
      const contexts: PickerContext[] = [
        { ...fixture.validContext, metadata: { ...fixture.validContext.metadata, requestId: 'req-1' } },
        { ...fixture.validContext, metadata: { ...fixture.validContext.metadata, requestId: 'req-2' } },
        { ...fixture.validContext, metadata: { ...fixture.validContext.metadata, requestId: 'req-3' } },
      ];

      let callCount = 0;
      (fixture.mockAIClient.complete as Mock).mockImplementation(async () => {
        callCount++;
        return {
          content: JSON.stringify({
            selectedId: `option-${callCount}`,
            confidence: 0.8,
            reasoning: `Selection ${callCount}`,
          }),
          usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
          finishReason: 'stop',
        };
      });

      const results = await Promise.all(contexts.map((ctx) => agent.select(ctx)));

      expect(results).toHaveLength(3);
      expect(new Set(results.map((r) => r.selectedId)).size).toBe(3);
    });
  });
});