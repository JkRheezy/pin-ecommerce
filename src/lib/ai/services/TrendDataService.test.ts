/**
 * TrendDataService.test.ts
 * Unit tests for the TrendDataService following the six-layer architecture
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TrendDataService } from './TrendDataService';
import { TrendDataRepo } from '../repo/TrendDataRepo';
import { TrendDataConfig } from '../config/TrendDataConfig';
import { 
  TrendData, 
  TrendDataQuery, 
  TrendDataResult,
  TrendGranularity,
  TrendMetricType 
} from '../types/TrendData.types';
import { HarnessLogger } from '@harness/logging';
import { ValidationError, NotFoundError } from '../types/errors';

// Mock dependencies
vi.mock('../repo/TrendDataRepo');
vi.mock('@harness/logging');

describe('TrendDataService', () => {
  let service: TrendDataService;
  let mockRepo: jest.Mocked<TrendDataRepo>;
  let mockLogger: jest.Mocked<HarnessLogger>;

  // Test fixtures
  const mockTrendData: TrendData = {
    id: 'trend-123',
    metricType: TrendMetricType.DEPLOYMENT_FREQUENCY,
    granularity: TrendGranularity.DAILY,
    timestamp: new Date('2024-01-15T00:00:00Z'),
    value: 42,
    metadata: {
      projectId: 'proj-456',
      orgId: 'org-789'
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockQuery: TrendDataQuery = {
    metricType: TrendMetricType.DEPLOYMENT_FREQUENCY,
    granularity: TrendGranularity.DAILY,
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-31T23:59:59Z'),
    filters: {
      projectId: 'proj-456'
    }
  };

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create mock instances
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    } as unknown as jest.Mocked<HarnessLogger>;

    mockRepo = {
      findByQuery: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      aggregateTrends: vi.fn()
    } as unknown as jest.Mocked<TrendDataRepo>;

    // Initialize service with mocked dependencies
    service = new TrendDataService({
      repo: mockRepo,
      logger: mockLogger,
      config: new TrendDataConfig({
        maxQueryRangeDays: 90,
        defaultGranularity: TrendGranularity.DAILY
      })
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Layer 1: Types Validation', () => {
    it('should validate TrendGranularity enum values', () => {
      const validGranularities = Object.values(TrendGranularity);
      expect(validGranularities).toContain(TrendGranularity.HOURLY);
      expect(validGranularities).toContain(TrendGranularity.DAILY);
      expect(validGranularities).toContain(TrendGranularity.WEEKLY);
      expect(validGranularities).toContain(TrendGranularity.MONTHLY);
    });

    it('should validate TrendMetricType enum values', () => {
      const validMetrics = Object.values(TrendMetricType);
      expect(validMetrics).toContain(TrendMetricType.DEPLOYMENT_FREQUENCY);
      expect(validMetrics).toContain(TrendMetricType.LEAD_TIME);
      expect(validMetrics).toContain(TrendMetricType.MTTR);
      expect(validMetrics).toContain(TrendMetricType.CHANGE_FAILURE_RATE);
    });
  });

  describe('Layer 2: Config Integration', () => {
    it('should respect maxQueryRangeDays configuration', async () => {
      const invalidQuery: TrendDataQuery = {
        ...mockQuery,
        startTime: new Date('2023-01-01T00:00:00Z'), // More than 90 days ago
        endTime: new Date('2024-01-31T23:59:59Z')
      };

      await expect(service.getTrendData(invalidQuery))
        .rejects
        .toThrow(ValidationError);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Query range exceeds maximum allowed days',
        expect.objectContaining({
          maxDays: 90,
          actualDays: expect.any(Number)
        })
      );
    });

    it('should apply default granularity when not specified', async () => {
      const queryWithoutGranularity: Partial<TrendDataQuery> = {
        metricType: TrendMetricType.DEPLOYMENT_FREQUENCY,
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-31T23:59:59Z')
      };

      mockRepo.findByQuery.mockResolvedValue([mockTrendData]);

      await service.getTrendData(queryWithoutGranularity as TrendDataQuery);

      expect(mockRepo.findByQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          granularity: TrendGranularity.DAILY // Default from config
        })
      );
    });
  });

  describe('Layer 3: Repo Integration', () => {
    it('should call repo.findByQuery with validated parameters', async () => {
      const expectedResult: TrendDataResult = {
        data: [mockTrendData],
        totalCount: 1,
        hasMore: false,
        nextCursor: undefined
      };

      mockRepo.findByQuery.mockResolvedValue([mockTrendData]);

      const result = await service.getTrendData(mockQuery);

      expect(mockRepo.findByQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          metricType: mockQuery.metricType,
          granularity: mockQuery.granularity,
          startTime: mockQuery.startTime,
          endTime: mockQuery.endTime
        })
      );
      expect(result.data).toHaveLength(1);
    });

    it('should handle repo errors with proper logging', async () => {
      const dbError = new Error('Connection failed');
      mockRepo.findByQuery.mockRejectedValue(dbError);

      await expect(service.getTrendData(mockQuery))
        .rejects
        .toThrow('Failed to retrieve trend data');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error fetching trend data from repository',
        expect.objectContaining({
          error: dbError.message,
          query: expect.any(Object)
        })
      );
    });

    it('should handle empty results gracefully', async () => {
      mockRepo.findByQuery.mockResolvedValue([]);

      const result = await service.getTrendData(mockQuery);

      expect(result.data).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('Layer 4: Service Business Logic', () => {
    describe('getTrendData', () => {
      it('should validate query parameters before processing', async () => {
        const invalidQuery = {
          ...mockQuery,
          startTime: new Date('2024-02-01T00:00:00Z'),
          endTime: new Date('2024-01-01T00:00:00Z') // End before start
        };

        await expect(service.getTrendData(invalidQuery))
          .rejects
          .toThrow(ValidationError);
      });

      it('should calculate pagination correctly', async () => {
        const paginatedQuery: TrendDataQuery = {
          ...mockQuery,
          limit: 10,
          cursor: 'cursor-123'
        };

        const mockData = Array(10).fill(null).map((_, i) => ({
          ...mockTrendData,
          id: `trend-${i}`
        }));

        mockRepo.findByQuery.mockResolvedValue(mockData);

        const result = await service.getTrendData(paginatedQuery);

        expect(result.data).toHaveLength(10);
        expect(result.hasMore).toBe(true); // Assuming repo indicates more data
      });

      it('should apply data transformation when specified', async () => {
        const queryWithTransform: TrendDataQuery = {
          ...mockQuery,
          transform: 'normalize'
        };

        mockRepo.findByQuery.mockResolvedValue([mockTrendData]);

        const result = await service.getTrendData(queryWithTransform);

        // Verify transformation was applied (implementation specific)
        expect(result.data[0]).toHaveProperty('normalizedValue');
      });
    });

    describe('aggregateTrends', () => {
      it('should call repo.aggregateTrends with proper aggregation config', async () => {
        const aggregationConfig = {
          groupBy: ['projectId'],
          aggregations: ['avg', 'max', 'min']
        };

        mockRepo.aggregateTrends.mockResolvedValue([
          { projectId: 'proj-456', avg: 42, max: 100, min: 10 }
        ]);

        const result = await service.aggregateTrends(mockQuery, aggregationConfig);

        expect(mockRepo.aggregateTrends).toHaveBeenCalledWith(
          expect.any(Object),
          aggregationConfig
        );
        expect(result).toHaveLength(1);
      });
    });

    describe('createTrendData', () => {
      it('should validate input data before creation', async () => {
        const invalidData = {
          metricType: 'INVALID_TYPE', // Invalid enum value
          value: -1 // Negative value not allowed
        };

        await expect(service.createTrendData(invalidData as any))
          .rejects
          .toThrow(ValidationError);
      });

      it('should enrich data with timestamps before saving', async () => {
        const newTrendData = {
          metricType: TrendMetricType.DEPLOYMENT_FREQUENCY,
          granularity: TrendGranularity.DAILY,
          value: 50,
          metadata: { projectId: 'proj-999' }
        };

        mockRepo.create.mockResolvedValue({
          ...mockTrendData,
          ...newTrendData,
          id: 'new-trend-123'
        });

        const result = await service.createTrendData(newTrendData);

        expect(mockRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date)
          })
        );
        expect(result.id).toBeDefined();
      });
    });

    describe('updateTrendData', () => {
      it('should throw NotFoundError when trend does not exist', async () => {
        mockRepo.findById.mockResolvedValue(null);

        await expect(service.updateTrendData('non-existent-id', { value: 100 }))
          .rejects
          .toThrow(NotFoundError);
      });

      it('should prevent updates to immutable fields', async () => {
        mockRepo.findById.mockResolvedValue(mockTrendData);

        await expect(
          service.updateTrendData('trend-123', {
            id: 'new-id', // Should not be updatable
            createdAt: new Date() // Should not be updatable
          } as any)
        ).rejects.toThrow(ValidationError);
      });
    });

    describe('deleteTrendData', () => {
      it('should perform soft delete by default', async () => {
        mockRepo.findById.mockResolvedValue(mockTrendData);
        mockRepo.update.mockResolvedValue({
          ...mockTrendData,
          deletedAt: new Date()
        });

        await service.deleteTrendData('trend-123');

        expect(mockRepo.update).toHaveBeenCalledWith(
          'trend-123',
          expect.objectContaining({
            deletedAt: expect.any(Date)
          })
        );
      });

      it('should support hard delete when specified', async () => {
        mockRepo.findById.mockResolvedValue(mockTrendData);
        mockRepo.delete.mockResolvedValue(undefined);

        await service.deleteTrendData('trend-123', { hardDelete: true });

        expect(mockRepo.delete).toHaveBeenCalledWith('trend-123');
        expect(mockRepo.update).not.toHaveBeenCalled();
      });
    });
  });

  describe('Layer 5: Runtime Behavior', () => {
    it('should handle concurrent requests without data corruption', async () => {
      const promises = Array(5).fill(null).map((_, i) => 
        service.getTrendData({
          ...mockQuery,
          filters: { ...mockQuery.filters, requestId: `req-${i}` }
        })
      );

      mockRepo.findByQuery.mockResolvedValue([mockTrendData]);

      const results = await Promise.all(promises);

      // All requests should complete successfully
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.data).toHaveLength(1);
      });
    });

    it('should implement request timeout handling', async () => {
      mockRepo.findByQuery.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 10000)) // Simulate slow query
      );

      const serviceWithTimeout = new TrendDataService({
        repo: mockRepo,
        logger: mockLogger,
        config: new TrendDataConfig({
          requestTimeoutMs: 100 // Very short timeout for testing
        })
      });

      await expect(serviceWithTimeout.getTrendData(mockQuery))
        .rejects
        .toThrow('Request timeout');
    });

    it('should implement circuit breaker pattern for repo failures', async () => {
      // Simulate repeated failures
      mockRepo.findByQuery.mockRejectedValue(new Error('DB Error'));

      // First 5 calls should attempt the repo
      for (let i = 0; i < 5; i++) {
        await expect(service.getTrendData(mockQuery)).rejects.toThrow();
      }

      // 6th call should trigger circuit breaker
      await expect(service.getTrendData(mockQuery))
        .rejects
        .toThrow('Circuit breaker is open');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Circuit breaker opened due to repeated failures',
        expect.any(Object)
      );
    });
  });

  describe('Layer 6: UI/Consumer Contract', () => {
    it('should return data in expected format for UI consumption', async () => {
      mockRepo.findByQuery.mockResolvedValue([mockTrendData]);

      const result = await service.getTrendData(mockQuery);

      // Verify response structure matches UI expectations
      expect(result).toMatchObject({
        data: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            metricType: expect.any(String),
            value: expect.any(Number),
            timestamp: expect.any(Date)
          })
        ]),
        totalCount: expect.any(Number),
        hasMore: expect.any(Boolean)
      });
    });

    it('should support cursor-based pagination for infinite scroll', async () => {
      const firstPageQuery: TrendDataQuery = {
        ...mockQuery,
        limit: 2
      };

      const mockData = [
        { ...mockTrendData, id: 'trend-1' },
        { ...mockTrendData, id: 'trend-2' },
        { ...mockTrendData, id: 'trend-3' }
      ];

      mockRepo.findByQuery.mockResolvedValue(mockData.slice(0, 2));

      const firstPage = await service.getTrendData(firstPageQuery);

      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.nextCursor).toBeDefined();

      // Simulate fetching next page
      mockRepo.findByQuery.mockResolvedValue(mockData.slice(2));
      
      const secondPage = await service.getTrendData({
        ...firstPageQuery,
        cursor: firstPage.nextCursor
      });

      expect(secondPage.data).toHaveLength(1);
      expect(secondPage.hasMore).toBe(false);
    });

    it('should provide metadata for chart rendering', async () => {
      mockRepo.findByQuery.mockResolvedValue([mockTrendData]);

      const result = await service.getTrendData(mockQuery, {
        includeChartMetadata: true
      });

      expect(result.chartMetadata).toMatchObject({
        yAxisMin: expect.any(Number),
        yAxisMax: expect.any(Number),
        suggestedGranularity: expect.any(String),
        dataPoints: expect.any(Number)
      });
    });
  });

  describe('Error Handling', () => {
    it('should wrap unknown errors in service-specific error', async () => {
      mockRepo.findByQuery.mockRejectedValue('string error'); // Non-Error rejection

      await expect(service.getTrendData(mockQuery))
        .rejects
        .toThrow('Unexpected error in TrendDataService');
    });

    it('should preserve error context for debugging', async () => {
      const originalError = new Error('Original DB error');
      mockRepo.findByQuery.mockRejectedValue(originalError);

      try {
        await service.getTrendData(mockQuery);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.cause).toBe(originalError);
        expect(error.context).toMatchObject({
          service: 'TrendDataService',
          operation: 'getTrendData',
          query: expect.any(Object)
        });
      }
    });
  });

  describe('Logging', () => {
    it('should log successful operations at info level', async () => {
      mockRepo.findByQuery.mockResolvedValue([mockTrendData]);

      await service.getTrendData(mockQuery);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Successfully retrieved trend data',
        expect.objectContaining({
          recordCount: 1,
          queryDurationMs: expect.any(Number)
        })
      );
    });

    it('should include correlation IDs in logs', async () => {
      const correlationId = 'corr-abc-123';
      
      await service.getTrendData(mockQuery, { correlationId });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          correlationId
        })
      );
    });
  });
});