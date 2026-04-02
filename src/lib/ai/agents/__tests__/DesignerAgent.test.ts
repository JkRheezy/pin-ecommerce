/**
 * DesignerAgent.test.ts
 * Tests for the DesignerAgent class following the six-layer architecture
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DesignerAgent } from '../DesignerAgent';
import { DesignConfig, DesignPattern, DesignOutput } from '../../../types/ai/DesignTypes';
import { ConfigService } from '../../../service/config/ConfigService';
import { Logger } from '../../../service/logging/Logger';
import { AIRepository } from '../../../repo/ai/AIRepository';

// Mock dependencies
jest.mock('../../../service/config/ConfigService');
jest.mock('../../../service/logging/Logger');
jest.mock('../../../repo/ai/AIRepository');

describe('DesignerAgent', () => {
  let designerAgent: DesignerAgent;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockLogger: jest.Mocked<Logger>;
  let mockAIRepository: jest.Mocked<AIRepository>;

  const validDesignConfig: DesignConfig = {
    pattern: DesignPattern.MODULAR,
    constraints: {
      maxComplexity: 10,
      preferredLanguages: ['TypeScript', 'Python'],
      architecturalStyle: 'hexagonal'
    },
    context: {
      existingPatterns: ['repository', 'factory'],
      teamSize: 5,
      scalability: 'high'
    }
  };

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Initialize mocked dependencies
    mockConfigService = new ConfigService() as jest.Mocked<ConfigService>;
    mockLogger = new Logger() as jest.Mocked<Logger>;
    mockAIRepository = new AIRepository() as jest.Mocked<AIRepository>;

    // Setup default mock implementations
    mockConfigService.getDesignConfig.mockReturnValue(validDesignConfig);
    mockLogger.info = jest.fn();
    mockLogger.error = jest.fn();
    mockLogger.debug = jest.fn();
    mockAIRepository.generateDesign.mockResolvedValue({
      components: [],
      relationships: [],
      recommendations: []
    });

    // Create DesignerAgent instance with mocked dependencies
    designerAgent = new DesignerAgent({
      configService: mockConfigService,
      logger: mockLogger,
      aiRepository: mockAIRepository
    });
  });

  describe('Layer 1: Types - Input Validation', () => {
    it('should validate DesignConfig structure on initialization', () => {
      const invalidConfig = {
        pattern: 'INVALID_PATTERN',
        constraints: null
      } as unknown as DesignConfig;

      mockConfigService.getDesignConfig.mockReturnValue(invalidConfig);

      expect(() => {
        new DesignerAgent({
          configService: mockConfigService,
          logger: mockLogger,
          aiRepository: mockAIRepository
        });
      }).toThrow('Invalid DesignConfig: pattern must be a valid DesignPattern enum');
    });

    it('should accept valid DesignConfig with all optional fields', () => {
      const fullConfig: DesignConfig = {
        ...validDesignConfig,
        metadata: {
          version: '1.0.0',
          author: 'test-author',
          timestamp: new Date()
        }
      };

      mockConfigService.getDesignConfig.mockReturnValue(fullConfig);

      expect(() => {
        new DesignerAgent({
          configService: mockConfigService,
          logger: mockLogger,
          aiRepository: mockAIRepository
        });
      }).not.toThrow();
    });
  });

  describe('Layer 2: Config - Configuration Management', () => {
    it('should load configuration from ConfigService on initialization', () => {
      new DesignerAgent({
        configService: mockConfigService,
        logger: mockLogger,
        aiRepository: mockAIRepository
      });

      expect(mockConfigService.getDesignConfig).toHaveBeenCalledTimes(1);
    });

    it('should apply configuration overrides when provided', () => {
      const overrideConfig: Partial<DesignConfig> = {
        pattern: DesignPattern.MICROSERVICES
      };

      designerAgent = new DesignerAgent({
        configService: mockConfigService,
        logger: mockLogger,
        aiRepository: mockAIRepository,
        configOverride: overrideConfig
      });

      // Verify that override takes precedence
      expect(designerAgent.getCurrentPattern()).toBe(DesignPattern.MICROSERVICES);
    });

    it('should handle missing configuration gracefully', () => {
      mockConfigService.getDesignConfig.mockReturnValue(undefined as unknown as DesignConfig);

      expect(() => {
        new DesignerAgent({
          configService: mockConfigService,
          logger: mockLogger,
          aiRepository: mockAIRepository
        });
      }).toThrow('ConfigurationError: DesignConfig is required');
    });
  });

  describe('Layer 3: Repo - Data Access', () => {
    it('should call AIRepository with validated parameters', async () => {
      const requirements = 'Design a scalable user authentication system';
      
      await designerAgent.generateDesign(requirements);

      expect(mockAIRepository.generateDesign).toHaveBeenCalledWith(
        expect.objectContaining({
          requirements,
          pattern: validDesignConfig.pattern,
          constraints: validDesignConfig.constraints
        })
      );
    });

    it('should handle repository errors with proper error transformation', async () => {
      const repositoryError = new Error('AI service unavailable');
      mockAIRepository.generateDesign.mockRejectedValue(repositoryError);

      await expect(designerAgent.generateDesign('test requirements'))
        .rejects
        .toThrow('DesignGenerationError: Failed to generate design - AI service unavailable');
    });

    it('should retry on transient repository failures', async () => {
      // First call fails, second succeeds
      mockAIRepository.generateDesign
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({
          components: [{ name: 'AuthService', type: 'service' }],
          relationships: [],
          recommendations: ['Use JWT tokens']
        });

      const result = await designerAgent.generateDesign('test', { retries: 1 });

      expect(mockAIRepository.generateDesign).toHaveBeenCalledTimes(2);
      expect(result.components).toHaveLength(1);
    });
  });

  describe('Layer 4: Service - Business Logic', () => {
    it('should validate requirements before processing', async () => {
      const emptyRequirements = '';
      
      await expect(designerAgent.generateDesign(emptyRequirements))
        .rejects
        .toThrow('ValidationError: Requirements cannot be empty');
    });

    it('should enrich design output with pattern-specific recommendations', async () => {
      const mockOutput: DesignOutput = {
        components: [
          { name: 'API Gateway', type: 'gateway' },
          { name: 'User Service', type: 'microservice' }
        ],
        relationships: [
          { from: 'API Gateway', to: 'User Service', type: 'http' }
        ],
        recommendations: []
      };

      mockAIRepository.generateDesign.mockResolvedValue(mockOutput);

      const result = await designerAgent.generateDesign('microservices architecture');

      // Verify microservices-specific enrichment
      expect(result.recommendations).toContain(
        expect.stringContaining('service discovery')
      );
      expect(result.recommendations).toContain(
        expect.stringContaining('circuit breaker')
      );
    });

    it('should calculate complexity score based on components and relationships', async () => {
      const complexDesign: DesignOutput = {
        components: Array(10).fill(null).map((_, i) => ({
          name: `Component${i}`,
          type: 'service'
        })),
        relationships: Array(20).fill(null).map((_, i) => ({
          from: `Component${i % 10}`,
          to: `Component${(i + 1) % 10}`,
          type: 'async'
        })),
        recommendations: []
      };

      mockAIRepository.generateDesign.mockResolvedValue(complexDesign);

      const result = await designerAgent.generateDesign('complex system');

      // Complexity = components * 1 + relationships * 0.5
      expect(result.complexityScore).toBe(20); // 10 + 20*0.5
    });

    it('should enforce max complexity constraint from config', async () => {
      const exceedingDesign: DesignOutput = {
        components: Array(20).fill(null).map((_, i) => ({
          name: `Component${i}`,
          type: 'service'
        })),
        relationships: [],
        recommendations: []
      };

      mockAIRepository.generateDesign.mockResolvedValue(exceedingDesign);

      await expect(designerAgent.generateDesign('too complex'))
        .rejects
        .toThrow('ConstraintError: Design complexity 20 exceeds maximum 10');
    });
  });

  describe('Layer 5: Runtime - Execution Context', () => {
    it('should execute within timeout constraints', async () => {
      const slowDesign = new Promise<DesignOutput>((resolve) => {
        setTimeout(() => resolve({
          components: [],
          relationships: [],
          recommendations: []
        }), 10000); // 10 seconds
      });

      mockAIRepository.generateDesign.mockReturnValue(slowDesign);

      await expect(
        designerAgent.generateDesign('test', { timeoutMs: 100 })
      ).rejects.toThrow('TimeoutError: Design generation exceeded 100ms');
    });

    it('should support cancellation via abort signal', async () => {
      const abortController = new AbortController();
      
      const pendingDesign = designerAgent.generateDesign('test', {
        signal: abortController.signal
      });

      // Cancel immediately
      abortController.abort();

      await expect(pendingDesign)
        .rejects
        .toThrow('CancellationError: Design generation was cancelled');
    });

    it('should track execution metrics', async () => {
      const startTime = Date.now();
      
      await designerAgent.generateDesign('test with metrics');

      const metrics = designerAgent.getLastExecutionMetrics();
      
      expect(metrics).toMatchObject({
        durationMs: expect.any(Number),
        repositoryCalls: 1,
        cacheHits: expect.any(Number)
      });
      expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
      expect(metrics.durationMs).toBeLessThan(Date.now() - startTime + 1000);
    });
  });

  describe('Layer 6: UI - Presentation (Output Formatting)', () => {
    it('should format design output for different output modes', async () => {
      const designOutput: DesignOutput = {
        components: [{ name: 'TestService', type: 'service' }],
        relationships: [],
        recommendations: ['Use dependency injection']
      };

      mockAIRepository.generateDesign.mockResolvedValue(designOutput);

      // JSON mode (default)
      const jsonResult = await designerAgent.generateDesign('test');
      expect(typeof jsonResult).toBe('object');
      expect(jsonResult).toHaveProperty('components');

      // Markdown mode
      const mdResult = await designerAgent.generateDesign('test', {
        outputFormat: 'markdown'
      });
      expect(typeof mdResult).toBe('string');
      expect(mdResult).toContain('# Design');
      expect(mdResult).toContain('## Components');
    });

    it('should include visual diagram data when requested', async () => {
      const designOutput: DesignOutput = {
        components: [
          { name: 'A', type: 'service', position: { x: 0, y: 0 } },
          { name: 'B', type: 'database', position: { x: 100, y: 0 } }
        ],
        relationships: [{ from: 'A', to: 'B', type: 'persist' }],
        recommendations: []
      };

      mockAIRepository.generateDesign.mockResolvedValue(designOutput);

      const result = await designerAgent.generateDesign('test', {
        includeDiagram: true
      });

      expect(result.diagram).toBeDefined();
      expect(result.diagram?.nodes).toHaveLength(2);
      expect(result.diagram?.edges).toHaveLength(1);
    });

    it('should sanitize output for security', async () => {
      const maliciousOutput: DesignOutput = {
        components: [{
          name: '<script>alert("xss")</script>',
          type: 'service'
        }],
        relationships: [],
        recommendations: []
      };

      mockAIRepository.generateDesign.mockResolvedValue(maliciousOutput);

      const result = await designerAgent.generateDesign('test', {
        outputFormat: 'html',
        sanitize: true
      });

      // Verify HTML sanitization
      expect(result.components[0].name).not.toContain('<script>');
      expect(result.components[0].name).toContain('&lt;script&gt;');
    });
  });

  describe('Error Handling', () => {
    it('should log all errors with structured logging', async () => {
      const error = new Error('Test error');
      mockAIRepository.generateDesign.mockRejectedValue(error);

      try {
        await designerAgent.generateDesign('test');
      } catch (e) {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Design generation failed',
        expect.objectContaining({
          error: 'Test error',
          requirements: 'test',
          pattern: validDesignConfig.pattern
        })
      );
    });

    it('should provide actionable error messages', async () => {
      mockAIRepository.generateDesign.mockRejectedValue(
        new Error('Rate limit exceeded')
      );

      await expect(designerAgent.generateDesign('test'))
        .rejects
        .toThrow('Rate limit exceeded. Please retry after 60 seconds or upgrade your plan.');
    });

    it('should maintain state consistency on partial failures', async () => {
      // Simulate partial failure where some components are generated
      mockAIRepository.generateDesign.mockRejectedValue(
        new Error('Partial failure after component generation')
      );

      const initialState = designerAgent.getState();

      try {
        await designerAgent.generateDesign('test');
      } catch (e) {
        // Expected
      }

      // State should be rolled back to initial
      expect(designerAgent.getState()).toEqual(initialState);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long requirements', async () => {
      const longRequirements = 'a'.repeat(100000);
      
      await expect(designerAgent.generateDesign(longRequirements))
        .rejects
        .toThrow('ValidationError: Requirements exceed maximum length of 10000 characters');
    });

    it('should handle special characters in requirements', async () => {
      const specialRequirements = 'Design with emojis 🎨 and unicode 日本語';
      
      mockAIRepository.generateDesign.mockResolvedValue({
        components: [],
        relationships: [],
        recommendations: []
      });

      const result = await designerAgent.generateDesign(specialRequirements);
      expect(result).toBeDefined();
    });

    it('should handle concurrent design requests', async () => {
      const requests = Array(5).fill(null).map((_, i) => 
        designerAgent.generateDesign(`request ${i}`)
      );

      const results = await Promise.all(requests);
      
      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result.requestId).toBeDefined();
      });
    });

    it('should handle empty AI response gracefully', async () => {
      mockAIRepository.generateDesign.mockResolvedValue(null as unknown as DesignOutput);

      await expect(designerAgent.generateDesign('test'))
        .rejects
        .toThrow('EmptyResponseError: AI repository returned empty design');
    });
  });
});