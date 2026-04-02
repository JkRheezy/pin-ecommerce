/**
 * MarketerAgent.test.ts
 *
 * Tests for the MarketerAgent class following the six-layer architecture.
 * Layer: Service (tests Service layer functionality)
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MarketerAgent } from '../MarketerAgent';
import { AgentConfig, AgentInput, AgentOutput, AgentStatus } from '../../types/AgentTypes';
import { MarketingStrategy, CampaignConfig } from '../../types/MarketingTypes';
import { Logger } from '../../utils/Logger';
import { ValidationError, AgentExecutionError } from '../../errors/AgentErrors';

// Mock dependencies
jest.mock('../../utils/Logger');
jest.mock('../../services/MarketingService');

describe('MarketerAgent', () => {
  let agent: MarketerAgent;
  let mockLogger: jest.Mocked<Logger>;
  let validConfig: AgentConfig;

  beforeEach(() => {
    // Arrange: Setup test environment
    mockLogger = new Logger('MarketerAgent') as jest.Mocked<Logger>;
    mockLogger.info = jest.fn();
    mockLogger.error = jest.fn();
    mockLogger.debug = jest.fn();

    validConfig = {
      id: 'test-marketer-agent',
      name: 'TestMarketerAgent',
      version: '1.0.0',
      capabilities: ['campaign_generation', 'audience_analysis', 'content_strategy'],
      maxRetries: 3,
      timeoutMs: 30000,
    };

    agent = new MarketerAgent(validConfig);
    (agent as unknown as { logger: Logger }).logger = mockLogger;
  });

  afterEach(() => {
    // Cleanup: Clear all mocks after each test
    jest.clearAllMocks();
  });

  describe('Constructor (Config Layer)', () => {
    it('should create agent with valid config', () => {
      // Act & Assert
      expect(agent).toBeDefined();
      expect(agent.getStatus()).toBe(AgentStatus.INITIALIZED);
    });

    it('should throw ValidationError when config is missing required fields', () => {
      // Arrange
      const invalidConfig = {
        id: 'test-agent',
        // Missing required fields: name, version, capabilities
      } as unknown as AgentConfig;

      // Act & Assert
      expect(() => new MarketerAgent(invalidConfig)).toThrow(ValidationError);
    });

    it('should throw ValidationError when capabilities array is empty', () => {
      // Arrange
      const configWithEmptyCapabilities: AgentConfig = {
        ...validConfig,
        capabilities: [],
      };

      // Act & Assert
      expect(() => new MarketerAgent(configWithEmptyCapabilities)).toThrow(ValidationError);
    });
  });

  describe('Initialize (Runtime Layer)', () => {
    it('should initialize successfully with valid marketing strategy', async () => {
      // Arrange
      const strategy: MarketingStrategy = {
        targetAudience: 'enterprise_saas',
        brandVoice: 'professional',
        channels: ['email', 'linkedin', 'content_marketing'],
        budgetAllocation: {
          email: 0.3,
          linkedin: 0.4,
          content_marketing: 0.3,
        },
      };

      // Act
      await agent.initialize({ strategy });

      // Assert
      expect(agent.getStatus()).toBe(AgentStatus.READY);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'MarketerAgent initialized successfully',
        expect.objectContaining({ agentId: validConfig.id })
      );
    });

    it('should throw ValidationError when strategy is invalid', async () => {
      // Arrange
      const invalidStrategy = {
        targetAudience: '', // Empty string should fail validation
        brandVoice: 'casual',
      } as MarketingStrategy;

      // Act & Assert
      await expect(agent.initialize({ strategy: invalidStrategy })).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('Execute (Service Layer)', () => {
    beforeEach(async () => {
      // Setup: Initialize agent before each execution test
      const strategy: MarketingStrategy = {
        targetAudience: 'startup_founders',
        brandVoice: 'innovative',
        channels: ['twitter', 'newsletter'],
        budgetAllocation: { twitter: 0.6, newsletter: 0.4 },
      };
      await agent.initialize({ strategy });
    });

    it('should execute campaign generation task successfully', async () => {
      // Arrange
      const input: AgentInput = {
        taskType: 'campaign_generation',
        payload: {
          campaignName: 'Q4 Product Launch',
          objectives: ['brand_awareness', 'lead_generation'],
          durationDays: 30,
        },
        metadata: {
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
        },
      };

      // Act
      const result: AgentOutput = await agent.execute(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('campaign');
      expect(result.data.campaign).toHaveProperty('id');
      expect(result.data.campaign).toHaveProperty('contentCalendar');
      expect(result.executionTimeMs).toBeGreaterThan(0);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Executing campaign generation',
        expect.objectContaining({ taskType: input.taskType })
      );
    });

    it('should execute audience analysis task successfully', async () => {
      // Arrange
      const input: AgentInput = {
        taskType: 'audience_analysis',
        payload: {
          segmentId: 'segment-456',
          analysisDepth: 'detailed',
          includeCompetitorInsights: true,
        },
        metadata: {
          requestId: 'req-789',
          timestamp: new Date().toISOString(),
        },
      };

      // Act
      const result: AgentOutput = await agent.execute(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('audienceProfile');
      expect(result.data.audienceProfile).toHaveProperty('demographics');
      expect(result.data.audienceProfile).toHaveProperty('psychographics');
    });

    it('should handle unsupported task types gracefully', async () => {
      // Arrange
      const input: AgentInput = {
        taskType: 'unsupported_task' as unknown as AgentInput['taskType'],
        payload: {},
        metadata: { requestId: 'req-999', timestamp: new Date().toISOString() },
      };

      // Act & Assert
      await expect(agent.execute(input)).rejects.toThrow(AgentExecutionError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Task execution failed',
        expect.objectContaining({ taskType: input.taskType })
      );
    });

    it('should retry on transient failures and succeed', async () => {
      // Arrange
      const input: AgentInput = {
        taskType: 'campaign_generation',
        payload: { campaignName: 'Retry Test' },
        metadata: { requestId: 'req-retry', timestamp: new Date().toISOString() },
      };

      // Mock internal method to fail twice then succeed
      let callCount = 0;
      const originalMethod = (agent as unknown as { generateCampaign: () => Promise<unknown> }).generateCampaign;
      (agent as unknown as { generateCampaign: () => Promise<unknown> }).generateCampaign = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Transient error'));
        }
        return Promise.resolve({ id: 'campaign-123', name: 'Retry Test' });
      });

      // Act
      const result = await agent.execute(input);

      // Assert
      expect(result.success).toBe(true);
      expect(callCount).toBe(3); // Initial + 2 retries
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Retry attempt'),
        expect.any(Object)
      );
    });

    it('should fail after max retries exceeded', async () => {
      // Arrange
      const input: AgentInput = {
        taskType: 'campaign_generation',
        payload: { campaignName: 'Fail Test' },
        metadata: { requestId: 'req-fail', timestamp: new Date().toISOString() },
      };

      // Mock to always fail
      (agent as unknown as { generateCampaign: () => Promise<unknown> }).generateCampaign = jest
        .fn()
        .mockRejectedValue(new Error('Persistent error'));

      // Act & Assert
      await expect(agent.execute(input)).rejects.toThrow(AgentExecutionError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Max retries exceeded',
        expect.objectContaining({ maxRetries: validConfig.maxRetries })
      );
    });

    it('should respect timeout configuration', async () => {
      // Arrange
      const slowConfig: AgentConfig = { ...validConfig, timeoutMs: 100 };
      const slowAgent = new MarketerAgent(slowConfig);

      const input: AgentInput = {
        taskType: 'campaign_generation',
        payload: { campaignName: 'Slow Campaign' },
        metadata: { requestId: 'req-slow', timestamp: new Date().toISOString() },
      };

      // Mock slow operation
      (slowAgent as unknown as { generateCampaign: () => Promise<unknown> }).generateCampaign = jest
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 200)));

      // Act & Assert
      await expect(slowAgent.execute(input)).rejects.toThrow(AgentExecutionError);
    });
  });

  describe('GetCapabilities (Types Layer)', () => {
    it('should return all configured capabilities', () => {
      // Act
      const capabilities = agent.getCapabilities();

      // Assert
      expect(capabilities).toEqual(validConfig.capabilities);
      expect(capabilities).toContain('campaign_generation');
      expect(capabilities).toContain('audience_analysis');
      expect(capabilities).toContain('content_strategy');
    });
  });

  describe('ValidateCampaignConfig (Repo Layer)', () => {
    it('should validate complete campaign configuration', () => {
      // Arrange
      const campaignConfig: CampaignConfig = {
        name: 'Summer Sale 2024',
        startDate: '2024-06-01',
        endDate: '2024-08-31',
        budget: 50000,
        channels: ['email', 'social_media'],
        goals: [
          { metric: 'impressions', target: 1000000 },
          { metric: 'conversions', target: 5000 },
        ],
      };

      // Act
      const isValid = agent.validateCampaignConfig(campaignConfig);

      // Assert
      expect(isValid).toBe(true);
    });

    it('should reject campaign with invalid date range', () => {
      // Arrange: End date before start date
      const invalidCampaignConfig: CampaignConfig = {
        name: 'Invalid Campaign',
        startDate: '2024-12-01',
        endDate: '2024-01-01', // Before start date
        budget: 10000,
        channels: ['email'],
        goals: [{ metric: 'clicks', target: 1000 }],
      };

      // Act
      const isValid = agent.validateCampaignConfig(invalidCampaignConfig);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject campaign with negative budget', () => {
      // Arrange
      const invalidCampaignConfig: CampaignConfig = {
        name: 'Negative Budget Campaign',
        startDate: '2024-06-01',
        endDate: '2024-07-01',
        budget: -5000, // Negative budget
        channels: ['email'],
        goals: [{ metric: 'revenue', target: 10000 }],
      };

      // Act
      const isValid = agent.validateCampaignConfig(invalidCampaignConfig);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject campaign with empty channels array', () => {
      // Arrange
      const invalidCampaignConfig: CampaignConfig = {
        name: 'No Channels Campaign',
        startDate: '2024-06-01',
        endDate: '2024-07-01',
        budget: 10000,
        channels: [], // Empty channels
        goals: [{ metric: 'engagement', target: 500 }],
      };

      // Act
      const isValid = agent.validateCampaignConfig(invalidCampaignConfig);

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe('Dispose (Runtime Layer)', () => {
    it('should cleanup resources and set status to disposed', async () => {
      // Arrange
      await agent.initialize({
        strategy: {
          targetAudience: 'test',
          brandVoice: 'test',
          channels: ['test'],
          budgetAllocation: { test: 1.0 },
        },
      });

      // Act
      await agent.dispose();

      // Assert
      expect(agent.getStatus()).toBe(AgentStatus.DISPOSED);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'MarketerAgent disposed',
        expect.objectContaining({ agentId: validConfig.id })
      );
    });

    it('should handle multiple dispose calls gracefully', async () => {
      // Act
      await agent.dispose();
      await agent.dispose(); // Second dispose should not throw

      // Assert
      expect(agent.getStatus()).toBe(AgentStatus.DISPOSED);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null input gracefully', async () => {
      // Act & Assert
      await expect(agent.execute(null as unknown as AgentInput)).rejects.toThrow(
        ValidationError
      );
    });

    it('should handle undefined payload gracefully', async () => {
      // Arrange
      const input: AgentInput = {
        taskType: 'campaign_generation',
        payload: undefined as unknown as Record<string, unknown>,
        metadata: { requestId: 'req-undefined', timestamp: new Date().toISOString() },
      };

      // Act & Assert
      await expect(agent.execute(input)).rejects.toThrow(ValidationError);
    });

    it('should handle very large payload sizes', async () => {
      // Arrange: Create large payload
      const largePayload = {
        campaignName: 'Big Campaign',
        contentItems: Array(10000).fill({ text: 'a'.repeat(1000) }),
      };

      const input: AgentInput = {
        taskType: 'campaign_generation',
        payload: largePayload,
        metadata: { requestId: 'req-large', timestamp: new Date().toISOString() },
      };

      // Act
      const result = await agent.execute(input);

      // Assert
      expect(result.success).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Processing large payload'),
        expect.any(Object)
      );
    });

    it('should handle concurrent execution requests', async () => {
      // Arrange
      await agent.initialize({
        strategy: {
          targetAudience: 'concurrent_test',
          brandVoice: 'test',
          channels: ['test'],
          budgetAllocation: { test: 1.0 },
        },
      });

      const inputs: AgentInput[] = Array(5)
        .fill(null)
        .map((_, i) => ({
          taskType: 'campaign_generation',
          payload: { campaignName: `Concurrent ${i}` },
          metadata: { requestId: `req-concurrent-${i}`, timestamp: new Date().toISOString() },
        }));

      // Act
      const results = await Promise.all(inputs.map((input) => agent.execute(input)));

      // Assert
      expect(results).toHaveLength(5);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });
});