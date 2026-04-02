import { describe, it, expect } from 'vitest';
import {
  PickerAgentConfig,
  PickerAgentInput,
  PickerAgentOutput,
  PickerAgentError,
  PickerAgentState,
  PickerSelectionStrategy,
  PickerValidationResult,
  isPickerAgentConfig,
  isPickerAgentInput,
  isPickerAgentOutput,
  isPickerAgentError,
  isPickerSelectionStrategy,
  createPickerAgentConfig,
  createPickerAgentInput,
  PICKER_AGENT_ERROR_CODES,
} from './types';

/**
 * Comprehensive test suite for Picker Agent types
 * 
 * Tests cover:
 * - Type definitions and interfaces
 * - Type guards with valid and invalid inputs
 * - Edge cases and boundary conditions
 * - Factory functions for creating instances
 */

describe('PickerAgentConfig', () => {
  describe('type definition', () => {
    it('should accept valid config with all required fields', () => {
      const config: PickerAgentConfig = {
        agentId: 'test-picker-001',
        name: 'Test Picker Agent',
        version: '1.0.0',
        selectionStrategy: PickerSelectionStrategy.SMART,
        maxSelections: 5,
        minConfidence: 0.75,
        timeoutMs: 30000,
        retryPolicy: {
          maxRetries: 3,
          backoffMs: 1000,
        },
      };

      expect(config.agentId).toBe('test-picker-001');
      expect(config.selectionStrategy).toBe(PickerSelectionStrategy.SMART);
    });

    it('should accept config with optional fields omitted', () => {
      const config: PickerAgentConfig = {
        agentId: 'minimal-picker',
        name: 'Minimal Picker',
        version: '1.0.0',
        selectionStrategy: PickerSelectionStrategy.RANDOM,
      };

      expect(config.maxSelections).toBeUndefined();
      expect(config.minConfidence).toBeUndefined();
    });

    it('should accept config with all selection strategies', () => {
      const strategies = Object.values(PickerSelectionStrategy);

      strategies.forEach((strategy) => {
        const config: PickerAgentConfig = {
          agentId: `picker-${strategy}`,
          name: `Picker ${strategy}`,
          version: '1.0.0',
          selectionStrategy: strategy,
        };

        expect(config.selectionStrategy).toBe(strategy);
      });
    });
  });

  describe('isPickerAgentConfig type guard', () => {
    it('should return true for valid config objects', () => {
      const validConfig = {
        agentId: 'test-001',
        name: 'Test Agent',
        version: '1.0.0',
        selectionStrategy: 'smart',
      };

      expect(isPickerAgentConfig(validConfig)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isPickerAgentConfig(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isPickerAgentConfig(undefined)).toBe(false);
    });

    it('should return false for non-object types', () => {
      expect(isPickerAgentConfig('string')).toBe(false);
      expect(isPickerAgentConfig(123)).toBe(false);
      expect(isPickerAgentConfig(true)).toBe(false);
      expect(isPickerAgentConfig([])).toBe(false);
    });

    it('should return false for objects missing required fields', () => {
      expect(isPickerAgentConfig({})).toBe(false);
      expect(isPickerAgentConfig({ agentId: 'test' })).toBe(false);
      expect(isPickerAgentConfig({ agentId: 'test', name: 'Test' })).toBe(false);
    });

    it('should return false for objects with wrong field types', () => {
      expect(isPickerAgentConfig({
        agentId: 123,
        name: 'Test',
        version: '1.0.0',
        selectionStrategy: 'smart',
      })).toBe(false);

      expect(isPickerAgentConfig({
        agentId: 'test',
        name: 'Test',
        version: '1.0.0',
        selectionStrategy: 123,
      })).toBe(false);
    });

    it('should return false for invalid selection strategy', () => {
      expect(isPickerAgentConfig({
        agentId: 'test',
        name: 'Test',
        version: '1.0.0',
        selectionStrategy: 'invalid-strategy',
      })).toBe(false);
    });

    it('should validate nested retryPolicy structure', () => {
      const configWithInvalidRetry = {
        agentId: 'test',
        name: 'Test',
        version: '1.0.0',
        selectionStrategy: 'smart',
        retryPolicy: {
          maxRetries: 'three', // Should be number
        },
      };

      expect(isPickerAgentConfig(configWithInvalidRetry)).toBe(false);
    });
  });

  describe('createPickerAgentConfig factory', () => {
    it('should create config with default values', () => {
      const config = createPickerAgentConfig({
        agentId: 'factory-test',
        name: 'Factory Test',
      });

      expect(config.agentId).toBe('factory-test');
      expect(config.name).toBe('Factory Test');
      expect(config.version).toBe('1.0.0');
      expect(config.selectionStrategy).toBe(PickerSelectionStrategy.SMART);
      expect(config.maxSelections).toBe(10);
      expect(config.minConfidence).toBe(0.5);
      expect(config.timeoutMs).toBe(30000);
    });

    it('should override defaults with provided values', () => {
      const config = createPickerAgentConfig({
        agentId: 'custom',
        name: 'Custom',
        version: '2.0.0',
        selectionStrategy: PickerSelectionStrategy.RANDOM,
        maxSelections: 20,
      });

      expect(config.version).toBe('2.0.0');
      expect(config.selectionStrategy).toBe(PickerSelectionStrategy.RANDOM);
      expect(config.maxSelections).toBe(20);
    });

    it('should throw error for invalid agentId', () => {
      expect(() => createPickerAgentConfig({
        agentId: '',
        name: 'Test',
      })).toThrow('agentId must be a non-empty string');

      expect(() => createPickerAgentConfig({
        agentId: '   ',
        name: 'Test',
      })).toThrow('agentId must be a non-empty string');
    });

    it('should throw error for invalid name', () => {
      expect(() => createPickerAgentConfig({
        agentId: 'test',
        name: '',
      })).toThrow('name must be a non-empty string');
    });

    it('should throw error for negative maxSelections', () => {
      expect(() => createPickerAgentConfig({
        agentId: 'test',
        name: 'Test',
        maxSelections: -1,
      })).toThrow('maxSelections must be a positive integer');
    });

    it('should throw error for out-of-range minConfidence', () => {
      expect(() => createPickerAgentConfig({
        agentId: 'test',
        name: 'Test',
        minConfidence: 1.5,
      })).toThrow('minConfidence must be between 0 and 1');

      expect(() => createPickerAgentConfig({
        agentId: 'test',
        name: 'Test',
        minConfidence: -0.1,
      })).toThrow('minConfidence must be between 0 and 1');
    });
  });
});

describe('PickerAgentInput', () => {
  describe('type definition', () => {
    it('should accept valid input with candidates', () => {
      const input: PickerAgentInput = {
        requestId: 'req-001',
        candidates: [
          { id: 'c1', value: 'option1', score: 0.9 },
          { id: 'c2', value: 'option2', score: 0.8 },
        ],
        context: {
          userId: 'user-123',
          sessionId: 'sess-456',
        },
      };

      expect(input.candidates).toHaveLength(2);
      expect(input.requestId).toBe('req-001');
    });

    it('should accept input without optional context', () => {
      const input: PickerAgentInput = {
        requestId: 'req-002',
        candidates: [{ id: 'c1', value: 'only-option' }],
      };

      expect(input.context).toBeUndefined();
    });

    it('should accept empty candidates array', () => {
      const input: PickerAgentInput = {
        requestId: 'req-003',
        candidates: [],
      };

      expect(input.candidates).toEqual([]);
    });
  });

  describe('isPickerAgentInput type guard', () => {
    it('should return true for valid input objects', () => {
      const validInput = {
        requestId: 'req-001',
        candidates: [{ id: 'c1', value: 'test' }],
      };

      expect(isPickerAgentInput(validInput)).toBe(true);
    });

    it('should return false for null or undefined', () => {
      expect(isPickerAgentInput(null)).toBe(false);
      expect(isPickerAgentInput(undefined)).toBe(false);
    });

    it('should return false for non-object types', () => {
      expect(isPickerAgentInput('input')).toBe(false);
      expect(isPickerAgentInput(123)).toBe(false);
    });

    it('should return false for missing required fields', () => {
      expect(isPickerAgentInput({})).toBe(false);
      expect(isPickerAgentInput({ requestId: 'req' })).toBe(false);
      expect(isPickerAgentInput({ candidates: [] })).toBe(false);
    });

    it('should return false for non-array candidates', () => {
      expect(isPickerAgentInput({
        requestId: 'req',
        candidates: 'not-an-array',
      })).toBe(false);
    });

    it('should return false for invalid candidate structure', () => {
      expect(isPickerAgentInput({
        requestId: 'req',
        candidates: [{ id: 'c1' }], // missing value
      })).toBe(false);

      expect(isPickerAgentInput({
        requestId: 'req',
        candidates: [{ value: 'test' }], // missing id
      })).toBe(false);
    });

    it('should validate candidate score is number when present', () => {
      expect(isPickerAgentInput({
        requestId: 'req',
        candidates: [{ id: 'c1', value: 'test', score: 'high' }],
      })).toBe(false);
    });
  });

  describe('createPickerAgentInput factory', () => {
    it('should create input with required fields', () => {
      const input = createPickerAgentInput({
        requestId: 'factory-req',
        candidates: [{ id: 'c1', value: 'test' }],
      });

      expect(input.requestId).toBe('factory-req');
      expect(input.candidates).toHaveLength(1);
    });

    it('should auto-generate requestId if not provided', () => {
      const input = createPickerAgentInput({
        candidates: [{ id: 'c1', value: 'test' }],
      });

      expect(input.requestId).toMatch(/^req-[a-z0-9-]+$/);
    });

    it('should throw error for empty candidates array', () => {
      expect(() => createPickerAgentInput({
        requestId: 'test',
        candidates: [],
      })).toThrow('candidates array cannot be empty');
    });

    it('should throw error for invalid candidate structure', () => {
      expect(() => createPickerAgentInput({
        requestId: 'test',
        candidates: [{ id: 'c1' } as any], // missing value
      })).toThrow('each candidate must have id and value');
    });
  });
});

describe('PickerAgentOutput', () => {
  describe('type definition', () => {
    it('should accept valid output with selections', () => {
      const output: PickerAgentOutput = {
        requestId: 'req-001',
        selections: [
          { candidateId: 'c1', confidence: 0.95, reason: 'Best match' },
        ],
        metadata: {
          processingTimeMs: 150,
          strategyUsed: PickerSelectionStrategy.SMART,
        },
      };

      expect(output.selections[0].confidence).toBe(0.95);
    });

    it('should accept output with multiple selections', () => {
      const output: PickerAgentOutput = {
        requestId: 'req-002',
        selections: [
          { candidateId: 'c1', confidence: 0.9 },
          { candidateId: 'c2', confidence: 0.85 },
          { candidateId: 'c3', confidence: 0.8 },
        ],
      };

      expect(output.selections).toHaveLength(3);
    });
  });

  describe('isPickerAgentOutput type guard', () => {
    it('should return true for valid output objects', () => {
      const validOutput = {
        requestId: 'req-001',
        selections: [{ candidateId: 'c1', confidence: 0.9 }],
      };

      expect(isPickerAgentOutput(validOutput)).toBe(true);
    });

    it('should return false for null or undefined', () => {
      expect(isPickerAgentOutput(null)).toBe(false);
      expect(isPickerAgentOutput(undefined)).toBe(false);
    });

    it('should return false for missing required fields', () => {
      expect(isPickerAgentOutput({})).toBe(false);
      expect(isPickerAgentOutput({ requestId: 'req' })).toBe(false);
    });

    it('should return false for invalid selection structure', () => {
      expect(isPickerAgentOutput({
        requestId: 'req',
        selections: [{ candidateId: 'c1' }], // missing confidence
      })).toBe(false);

      expect(isPickerAgentOutput({
        requestId: 'req',
        selections: [{ confidence: 0.9 }], // missing candidateId
      })).toBe(false);
    });

    it('should return false for out-of-range confidence values', () => {
      expect(isPickerAgentOutput({
        requestId: 'req',
        selections: [{ candidateId: 'c1', confidence: 1.5 }],
      })).toBe(false);

      expect(isPickerAgentOutput({
        requestId: 'req',
        selections: [{ candidateId: 'c1', confidence: -0.1 }],
      })).toBe(false);
    });

    it('should validate metadata when present', () => {
      expect(isPickerAgentOutput({
        requestId: 'req',
        selections: [{ candidateId: 'c1', confidence: 0.9 }],
        metadata: {
          processingTimeMs: 'fast', // should be number
        },
      })).toBe(false);
    });
  });
});

describe('PickerAgentError', () => {
  describe('type definition', () => {
    it('should accept valid error with code', () => {
      const error: PickerAgentError = {
        code: PICKER_AGENT_ERROR_CODES.NO_CANDIDATES,
        message: 'No candidates available for selection',
        requestId: 'req-001',
        timestamp: new Date().toISOString(),
      };

      expect(error.code).toBe(PICKER_AGENT_ERROR_CODES.NO_CANDIDATES);
    });

    it('should accept error with optional details', () => {
      const error: PickerAgentError = {
        code: PICKER_AGENT_ERROR_CODES.VALIDATION_FAILED,
        message: 'Validation failed',
        details: {
          field: 'candidates',
          issue: 'empty array',
        },
      };

      expect(error.details).toBeDefined();
    });
  });

  describe('isPickerAgentError type guard', () => {
    it('should return true for valid error objects', () => {
      const validError = {
        code: 'NO_CANDIDATES',
        message: 'No candidates',
      };

      expect(isPickerAgentError(validError)).toBe(true);
    });

    it('should return false for null or undefined', () => {
      expect(isPickerAgentError(null)).toBe(false);
      expect(isPickerAgentError(undefined)).toBe(false);
    });

    it('should return false for invalid error codes', () => {
      expect(isPickerAgentError({
        code: 'UNKNOWN_ERROR',
        message: 'Unknown',
      })).toBe(false);
    });

    it('should return false for missing message', () => {
      expect(isPickerAgentError({
        code: 'NO_CANDIDATES',
      })).toBe(false);
    });

    it('should validate all error codes', () => {
      const validCodes = Object.values(PICKER_AGENT_ERROR_CODES);

      validCodes.forEach((code) => {
        const error = {
          code,
          message: 'Test error',
        };

        expect(isPickerAgentError(error)).toBe(true);
      });
    });
  });
});

describe('PickerSelectionStrategy', () => {
  describe('isPickerSelectionStrategy type guard', () => {
    it('should return true for all valid strategies', () => {
      const strategies = Object.values(PickerSelectionStrategy);

      strategies.forEach((strategy) => {
        expect(isPickerSelectionStrategy(strategy)).toBe(true);
      });
    });

    it('should return false for invalid strategies', () => {
      expect(isPickerSelectionStrategy('invalid')).toBe(false);
      expect(isPickerSelectionStrategy('')).toBe(false);
      expect(isPickerSelectionStrategy(123)).toBe(false);
      expect(isPickerSelectionStrategy(null)).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isPickerSelectionStrategy('SMART')).toBe(false);
      expect(isPickerSelectionStrategy('Smart')).toBe(false);
    });
  });
});

describe('PickerValidationResult', () => {
  describe('type behavior', () => {
    it('should handle valid result', () => {
      const result: PickerValidationResult = {
        valid: true,
      };

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should handle invalid result with errors', () => {
      const result: PickerValidationResult = {
        valid: false,
        errors: [
          { field: 'candidates', message: 'At least one candidate required' },
          { field: 'requestId', message: 'requestId is required' },
        ],
      };

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it('should handle invalid result with single error', () => {
      const result: PickerValidationResult = {
        valid: false,
        errors: [{ field: 'timeout', message: 'timeout must be positive' }],
      };

      expect(result.errors?.[0].field).toBe('timeout');
    });
  });
});

describe('PickerAgentState', () => {
  describe('type behavior', () => {
    it('should handle idle state', () => {
      const state: PickerAgentState = {
        status: 'idle',
        lastUpdated: Date.now(),
      };

      expect(state.status).toBe('idle');
    });

    it('should handle processing state with request info', () => {
      const state: PickerAgentState = {
        status: 'processing',
        currentRequestId: 'req-001',
        startTime: Date.now(),
        lastUpdated: Date.now(),
      };

      expect(state.status).toBe('processing');
      expect(state.currentRequestId).toBe('req-001');
    });

    it('should handle completed state with output reference', () => {
      const state: PickerAgentState = {
        status: 'completed',
        requestId: 'req-001',
        outputRef: 'output-123',
        lastUpdated: Date.now(),
      };

      expect(state.status).toBe('completed');
    });

    it('should handle error state with error details', () => {
      const state: PickerAgentState = {
        status: 'error',
        errorCode: PICKER_AGENT_ERROR_CODES.TIMEOUT,
        errorMessage: 'Request timed out',
        lastUpdated: Date.now(),
      };

      expect(state.status).toBe('error');
    });
  });
});

describe('Edge cases and boundary conditions', () => {
  it('should handle very long strings', () => {
    const longId = 'a'.repeat(1000);
    const config = createPickerAgentConfig({
      agentId: longId,
      name: longId,
    });

    expect(config.agentId).toHaveLength(1000);
  });

  it('should handle special characters in strings', () => {
    const specialChars = 'test-123_abc.~!@#$%^&*()';
    const config = createPickerAgentConfig({
      agentId: specialChars,
      name: specialChars,
    });

    expect(config.agentId).toBe(specialChars);
  });

  it('should handle unicode characters', () => {
    const unicode = '测试-🎉-émoji';
    const config = createPickerAgentConfig({
      agentId: 'unicode-test',
      name: unicode,
    });

    expect(config.name).toBe(unicode);
  });

  it('should handle boundary confidence values', () => {
    const config1 = createPickerAgentConfig({
      agentId: 'test',
      name: 'Test',
      minConfidence: 0,
    });

    const config2 = createPickerAgentConfig({
      agentId: 'test',
      name: 'Test',
      minConfidence: 1,
    });

    expect(config1.minConfidence).toBe(0);
    expect(config2.minConfidence).toBe(1);
  });

  it('should handle large candidate arrays', () => {
    const candidates = Array.from({ length: 10000 }, (_, i) => ({
      id: `c${i}`,
      value: `value-${i}`,
      score: Math.random(),
    }));

    const input = createPickerAgentInput({
      requestId: 'bulk-test',
      candidates,
    });

    expect(input.candidates).toHaveLength(10000);
  });

  it('should handle deeply nested objects', () => {
    const config = createPickerAgentConfig({
      agentId: 'nested-test',
      name: 'Nested Test',
      customConfig: {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
              },
            },
          },
        },
      } as any,
    });

    expect((config as any).customConfig.level1.level2.level3.level4.value).toBe('deep');
  });

  it('should handle circular references gracefully in type guards', () => {
    const obj: any = { agentId: 'test', name: 'Test', version: '1.0.0', selectionStrategy: 'smart' };
    obj.self = obj;

    // Type guard should not throw on circular reference
    expect(() => isPickerAgentConfig(obj)).not.toThrow();
  });

  it('should handle prototype pollution attempts', () => {
    const malicious = JSON.parse('{"agentId":"test","name":"Test","version":"1.0.0","selectionStrategy":"smart","__proto__":{"polluted":true}}');

    expect(isPickerAgentConfig(malicious)).toBe(true);
    // Ensure prototype was not actually polluted
    expect(({} as any).polluted).toBeUndefined();
  });
});