// Types Layer: Test types and fixtures
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ProductIdeaGenerator, ProductIdeaInput, ProductIdeaOutput } from './ProductIdeaGenerator';
import { AIProvider, AIResponse, AIError } from '../../providers/AIProvider';
import { StructuredLogger } from '../../../logging/StructuredLogger';
import { ValidationError } from '../../../errors/ValidationError';

// Config Layer: Test configuration
const TEST_CONFIG = {
  maxRetries: 3,
  timeoutMs: 5000,
  defaultCategory: 'general',
} as const;

// Test fixtures following taste invariants
const validInputFixture: ProductIdeaInput = {
  category: 'productivity',
  constraints: ['budget-friendly', 'mobile-first'],
  targetAudience: 'remote workers',
  problemStatement: 'difficulty managing time across multiple time zones',
};

const aiResponseFixture: AIResponse<ProductIdeaOutput> = {
  data: {
    title: 'TimeZone Sync Pro',
    description: 'A smart calendar that automatically adjusts meeting times based on all participants\' time zones with visual overlap indicators.',
    keyFeatures: ['Auto-timezone detection', 'Visual overlap heatmap', 'Smart scheduling suggestions'],
    targetMarket: 'Remote teams and freelancers',
    differentiation: 'Unlike competitors, shows real-time availability overlap at a glance',
  },
  metadata: {
    model: 'gpt-4',
    tokensUsed: 342,
    latencyMs: 890,
  },
};

// Mock implementations following Repo Layer pattern
class MockAIProvider implements AIProvider {
  private shouldFail: boolean = false;
  private failureCount: number = 0;
  private maxFailures: number = 0;

  setFailureMode(maxFailures: number = 0): void {
    this.shouldFail = maxFailures > 0;
    this.maxFailures = maxFailures;
    this.failureCount = 0;
  }

  async generateStructured<T>(prompt: string, schema: unknown): Promise<AIResponse<T>> {
    if (this.shouldFail && this.failureCount < this.maxFailures) {
      this.failureCount++;
      throw new AIError('PROVIDER_ERROR', 'Simulated AI provider failure');
    }
    return aiResponseFixture as AIResponse<T>;
  }

  async generateText(prompt: string): Promise<string> {
    throw new Error('Not implemented in mock');
  }
}

// Service Layer: Test suite for ProductIdeaGenerator
describe('ProductIdeaGenerator', () => {
  let mockProvider: MockAIProvider;
  let mockLogger: StructuredLogger;
  let generator: ProductIdeaGenerator;

  beforeEach(() => {
    // Runtime Layer: Initialize dependencies for each test
    mockProvider = new MockAIProvider();
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as StructuredLogger;

    generator = new ProductIdeaGenerator({
      provider: mockProvider,
      logger: mockLogger,
      config: {
        maxRetries: TEST_CONFIG.maxRetries,
        timeoutMs: TEST_CONFIG.timeoutMs,
      },
    });
  });

  describe('Input Validation', () => {
    it('should throw ValidationError when category is empty', async () => {
      const invalidInput = { ...validInputFixture, category: '' };
      
      await expect(generator.generate(invalidInput)).rejects.toThrow(ValidationError);
      await expect(generator.generate(invalidInput)).rejects.toThrow('Category is required');
    });

    it('should throw ValidationError when problemStatement exceeds max length', async () => {
      const invalidInput = {
        ...validInputFixture,
        problemStatement: 'a'.repeat(1001), // Assuming max is 1000
      };

      await expect(generator.generate(invalidInput)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when constraints array is empty', async () => {
      const invalidInput = { ...validInputFixture, constraints: [] };

      await expect(generator.generate(invalidInput)).rejects.toThrow(ValidationError);
    });

    it('should accept valid input with optional fields omitted', async () => {
      const minimalInput: ProductIdeaInput = {
        category: 'productivity',
        constraints: ['simple'],
        problemStatement: 'test problem',
      };

      mockProvider.setFailureMode(0);
      const result = await generator.generate(minimalInput);

      expect(result).toBeDefined();
      expect(result.title).toBe(aiResponseFixture.data.title);
    });
  });

  describe('Successful Generation', () => {
    it('should return structured product idea on successful AI call', async () => {
      const result = await generator.generate(validInputFixture);

      expect(result).toMatchObject({
        title: expect.any(String),
        description: expect.any(String),
        keyFeatures: expect.any(Array),
        targetMarket: expect.any(String),
        differentiation: expect.any(String),
      });
    });

    it('should include all required output fields', async () => {
      const result = await generator.generate(validInputFixture);

      expect(result.keyFeatures.length).toBeGreaterThan(0);
      expect(result.title.length).toBeGreaterThan(0);
      expect(result.description.length).toBeGreaterThan(0);
    });

    it('should log successful generation with metadata', async () => {
      await generator.generate(validInputFixture);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Product idea generated successfully',
        expect.objectContaining({
          category: validInputFixture.category,
          latencyMs: expect.any(Number),
          tokensUsed: expect.any(Number),
        })
      );
    });
  });

  describe('Error Handling and Retries', () => {
    it('should retry on transient AI provider errors', async () => {
      // Simulate 2 failures then success
      mockProvider.setFailureMode(2);

      const result = await generator.generate(validInputFixture);

      expect(result).toBeDefined();
      expect(result.title).toBe(aiResponseFixture.data.title);
    });

    it('should throw after max retries exceeded', async () => {
      // Simulate more failures than max retries
      mockProvider.setFailureMode(TEST_CONFIG.maxRetries + 1);

      await expect(generator.generate(validInputFixture)).rejects.toThrow(
        'Failed to generate product idea after maximum retries'
      );
    });

    it('should log each retry attempt', async () => {
      mockProvider.setFailureMode(1);

      try {
        await generator.generate(validInputFixture);
      } catch {
        // Expected to succeed on retry
      }

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'AI provider error, attempting retry',
        expect.objectContaining({
          attempt: expect.any(Number),
          error: expect.any(String),
        })
      );
    });

    it('should handle timeout errors gracefully', async () => {
      // Create provider that simulates timeout
      const slowProvider: AIProvider = {
        async generateStructured<T>(): Promise<AIResponse<T>> {
          return new Promise((_, reject) => {
            setTimeout(() => reject(new AIError('TIMEOUT', 'Request timed out')), TEST_CONFIG.timeoutMs + 100);
          });
        },
        async generateText(): Promise<string> {
          throw new Error('Not implemented');
        },
      };

      const slowGenerator = new ProductIdeaGenerator({
        provider: slowProvider,
        logger: mockLogger,
        config: { maxRetries: 1, timeoutMs: TEST_CONFIG.timeoutMs },
      });

      await expect(slowGenerator.generate(validInputFixture)).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in input safely', async () => {
      const specialInput: ProductIdeaInput = {
        ...validInputFixture,
        problemStatement: 'Problem with "quotes" and <html> & special chars',
      };

      const result = await generator.generate(specialInput);
      expect(result).toBeDefined();
    });

    it('should handle unicode characters in input', async () => {
      const unicodeInput: ProductIdeaInput = {
        ...validInputFixture,
        problemStatement: 'Problème avec des caractères unicode 🚀 日本語',
      };

      const result = await generator.generate(unicodeInput);
      expect(result).toBeDefined();
    });

    it('should sanitize and truncate overly long AI responses', async () => {
      const longResponseProvider: AIProvider = {
        async generateStructured<T>(): Promise<AIResponse<T>> {
          return {
            data: {
              title: 'A'.repeat(500), // Exceeds typical limits
              description: 'B'.repeat(5000),
              keyFeatures: Array(100).fill('feature'),
              targetMarket: 'C'.repeat(500),
              differentiation: 'D'.repeat(500),
            } as unknown as T,
            metadata: { model: 'gpt-4', tokensUsed: 1000, latencyMs: 500 },
          };
        },
        async generateText(): Promise<string> {
          throw new Error('Not implemented');
        },
      };

      const generatorWithLongResponse = new ProductIdeaGenerator({
        provider: longResponseProvider,
        logger: mockLogger,
        config: { maxRetries: 1, timeoutMs: TEST_CONFIG.timeoutMs },
      });

      const result = await generatorWithLongResponse.generate(validInputFixture);
      
      // Verify truncation occurred
      expect(result.title.length).toBeLessThan(500);
      expect(result.description.length).toBeLessThan(5000);
    });
  });

  describe('Prompt Construction', () => {
    it('should build prompt with all input fields', async () => {
      const buildPromptSpy = jest.spyOn(generator as any, 'buildPrompt');
      
      await generator.generate(validInputFixture);

      expect(buildPromptSpy).toHaveReturnedWith(
        expect.stringContaining(validInputFixture.category)
      );
      expect(buildPromptSpy).toHaveReturnedWith(
        expect.stringContaining(validInputFixture.problemStatement)
      );
      expect(buildPromptSpy).toHaveReturnedWith(
        expect.stringContaining(validInputFixture.constraints[0])
      );
    });

    it('should include target audience when provided', async () => {
      const buildPromptSpy = jest.spyOn(generator as any, 'buildPrompt');
      
      await generator.generate(validInputFixture);

      expect(buildPromptSpy).toHaveReturnedWith(
        expect.stringContaining(validInputFixture.targetAudience!)
      );
    });
  });
});