/**
 * @file TrendDataService.test.ts
 * @description Comprehensive test suite for TrendDataService
 * @layer Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { TrendDataService } from './TrendDataService';
import { TrendDataRepository } from '../repositories/TrendDataRepository';
import { TrendDataConfig } from '../config/TrendDataConfig';
import type {
  TrendData,
  TrendDataQuery,
  TrendDataResult,
  TrendDataError,
  TimeRange,
  TrendMetric,
  TrendAggregation,
} from '../types/TrendDataTypes';
import { Logger } from '@harness/logging';

// Mock dependencies
vi.mock('../repositories/TrendDataRepository');
vi.mock('../config/TrendDataConfig');
vi.mock('@harness/logging');

describe('TrendDataService', () => {
  let service: TrendDataService;
  let mockRepository: jest.Mocked<TrendDataRepository>;
  let mockConfig: jest.Mocked<TrendDataConfig>;
  let mockLogger: jest.Mocked<Logger>;

  // Test fixtures
  const validTimeRange: TimeRange = {
    start: new Date('2024-01-01T00:00:00Z'),
    end: new Date('2024-01-31T23:59:59Z'),
  };

  const validQuery: TrendDataQuery = {
    metric: 'deployment_frequency' as TrendMetric,
    timeRange: validTimeRange,
    aggregation: 'daily' as TrendAggregation,
    filters: { environment: 'production' },
  };

  const mockTrendData: TrendData[] = [
    {
      timestamp: new Date('2024-01-01T00:00:00Z'),
      value: 42,
      metric: 'deployment_frequency' as TrendMetric,
      metadata: { environment: 'production' },
    },
    {
      timestamp: new Date('2024-01-02T00:00:00Z'),
      value: 38,
      metric: 'deployment_frequency' as TrendMetric,
      metadata: { environment: 'production' },
    },
  ];

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Initialize mock logger
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as jest.Mocked<Logger>;

    // Initialize mock config
    mockConfig = {
      getMaxQueryRange: vi.fn().mockReturnValue(90),
      getDefaultAggregation: vi.fn().mockReturnValue('daily'),
      getCacheTTL: vi.fn().mockReturnValue(300),
      isMetricEnabled: vi.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<TrendDataConfig>;

    // Initialize mock repository
    mockRepository = {
      fetchTrendData: vi.fn(),
      fetchAggregatedTrendData: vi.fn(),
      healthCheck: vi.fn(),
    } as unknown as jest.Mocked<TrendDataRepository>;

    // Initialize service with mocked dependencies
    service = new TrendDataService({
      repository: mockRepository,
      config: mockConfig,
      logger: mockLogger,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with valid dependencies', () => {
      expect(service).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'TrendDataService initialized'
      );
    });

    it('should throw error when repository is not provided', () => {
      expect(() => {
        new TrendDataService({
          repository: undefined as unknown as TrendDataRepository,
          config: mockConfig,
          logger: mockLogger,
        });
      }).toThrow('TrendDataRepository is required');
    });

    it('should throw error when config is not provided', () => {
      expect(() => {
        new TrendDataService({
          repository: mockRepository,
          config: undefined as unknown as TrendDataConfig,
          logger: mockLogger,
        });
      }).toThrow('TrendDataConfig is required');
    });

    it('should throw error when logger is not provided', () => {
      expect(() => {
        new TrendDataService({
          repository: mockRepository,
          config: mockConfig,
          logger: undefined as unknown as Logger,
        });
      }).toThrow('Logger is required');
    });
  });

  describe('getTrendData', () => {
    it('should return trend data for valid query', async () => {
      // Arrange
      const mockResult: TrendDataResult = {
        data: mockTrendData,
        totalCount: 2,
        hasMore: false,
      };
      mockRepository.fetchTrendData.mockResolvedValue(mockResult);

      // Act
      const result = await service.getTrendData(validQuery);

      // Assert
      expect(result).toEqual(mockResult);
      expect(mockRepository.fetchTrendData).toHaveBeenCalledWith(validQuery);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Fetching trend data',
        expect.objectContaining({ metric: validQuery.metric })
      );
    });

    it('should apply default aggregation when not specified', async () => {
      // Arrange
      const queryWithoutAggregation: TrendDataQuery = {
        ...validQuery,
        aggregation: undefined,
      };
      const mockResult: TrendDataResult = {
        data: mockTrendData,
        totalCount: 2,
        hasMore: false,
      };
      mockRepository.fetchTrendData.mockResolvedValue(mockResult);

      // Act
      await service.getTrendData(queryWithoutAggregation);

      // Assert
      expect(mockRepository.fetchTrendData).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregation: 'daily',
        })
      );
    });

    it('should throw error for invalid time range', async () => {
      // Arrange
      const invalidQuery: TrendDataQuery = {
        ...validQuery,
        timeRange: {
          start: new Date('2024-01-31T00:00:00Z'),
          end: new Date('2024-01-01T00:00:00Z'), // End before start
        },
      };

      // Act & Assert
      await expect(service.getTrendData(invalidQuery)).rejects.toThrow(
        'Invalid time range: end date must be after start date'
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should throw error when time range exceeds maximum', async () => {
      // Arrange
      const longTimeRange: TimeRange = {
        start: new Date('2023-01-01T00:00:00Z'),
        end: new Date('2024-12-31T23:59:59Z'), // More than 90 days
      };
      const queryWithLongRange: TrendDataQuery = {
        ...validQuery,
        timeRange: longTimeRange,
      };

      // Act & Assert
      await expect(service.getTrendData(queryWithLongRange)).rejects.toThrow(
        'Time range exceeds maximum allowed range of 90 days'
      );
    });

    it('should throw error for disabled metric', async () => {
      // Arrange
      mockConfig.isMetricEnabled.mockReturnValue(false);

      // Act & Assert
      await expect(service.getTrendData(validQuery)).rejects.toThrow(
        `Metric '${validQuery.metric}' is not enabled`
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attempted to fetch disabled metric',
        expect.any(Object)
      );
    });

    it('should handle repository errors gracefully', async () => {
      // Arrange
      const repositoryError = new Error('Database connection failed');
      mockRepository.fetchTrendData.mockRejectedValue(repositoryError);

      // Act & Assert
      await expect(service.getTrendData(validQuery)).rejects.toThrow(
        'Failed to fetch trend data: Database connection failed'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error fetching trend data',
        expect.objectContaining({
          error: repositoryError.message,
        })
      );
    });

    it('should validate required metric field', async () => {
      // Arrange
      const invalidQuery: TrendDataQuery = {
        ...validQuery,
        metric: '' as TrendMetric,
      };

      // Act & Assert
      await expect(service.getTrendData(invalidQuery)).rejects.toThrow(
        'Metric is required'
      );
    });

    it('should validate required timeRange field', async () => {
      // Arrange
      const invalidQuery: TrendDataQuery = {
        ...validQuery,
        timeRange: undefined as unknown as TimeRange,
      };

      // Act & Assert
      await expect(service.getTrendData(invalidQuery)).rejects.toThrow(
        'TimeRange is required'
      );
    });
  });

  describe('getAggregatedTrendData', () => {
    it('should return aggregated data for valid query', async () => {
      // Arrange
      const aggregatedData: TrendData[] = [
        {
          timestamp: new Date('2024-01-01T00:00:00Z'),
          value: 40, // Averaged value
          metric: 'deployment_frequency' as TrendMetric,
          metadata: { aggregated: true },
        },
      ];
      mockRepository.fetchAggregatedTrendData.mockResolvedValue(aggregatedData);

      // Act
      const result = await service.getAggregatedTrendData(validQuery, 'weekly');

      // Assert
      expect(result).toEqual(aggregatedData);
      expect(mockRepository.fetchAggregatedTrendData).toHaveBeenCalledWith(
        validQuery,
        'weekly'
      );
    });

    it('should throw error for unsupported aggregation type', async () => {
      // Act & Assert
      await expect(
        service.getAggregatedTrendData(validQuery, 'invalid_aggregation' as TrendAggregation)
      ).rejects.toThrow("Unsupported aggregation type: 'invalid_aggregation'");
    });

    it('should handle empty aggregation result', async () => {
      // Arrange
      mockRepository.fetchAggregatedTrendData.mockResolvedValue([]);

      // Act
      const result = await service.getAggregatedTrendData(validQuery, 'monthly');

      // Assert
      expect(result).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No aggregated data found for query',
        expect.any(Object)
      );
    });
  });

  describe('validateQuery', () => {
    it('should return true for valid query', () => {
      // Act
      const isValid = (service as any).validateQuery(validQuery);

      // Assert
      expect(isValid).toBe(true);
    });

    it('should return false for query with missing metric', () => {
      // Arrange
      const invalidQuery = { ...validQuery, metric: undefined as unknown as TrendMetric };

      // Act
      const isValid = (service as any).validateQuery(invalidQuery);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should return false for query with invalid date objects', () => {
      // Arrange
      const invalidQuery: TrendDataQuery = {
        ...validQuery,
        timeRange: {
          start: new Date('invalid'),
          end: new Date('2024-01-31T00:00:00Z'),
        },
      };

      // Act
      const isValid = (service as any).validateQuery(invalidQuery);

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe('calculateTrendDirection', () => {
    it('should return "increasing" for upward trend', () => {
      // Arrange
      const increasingData: TrendData[] = [
        { ...mockTrendData[0], value: 10 },
        { ...mockTrendData[1], value: 20 },
      ];

      // Act
      const direction = service.calculateTrendDirection(increasingData);

      // Assert
      expect(direction).toBe('increasing');
    });

    it('should return "decreasing" for downward trend', () => {
      // Arrange
      const decreasingData: TrendData[] = [
        { ...mockTrendData[0], value: 20 },
        { ...mockTrendData[1], value: 10 },
      ];

      // Act
      const direction = service.calculateTrendDirection(decreasingData);

      // Assert
      expect(direction).toBe('decreasing');
    });

    it('should return "stable" for flat trend', () => {
      // Arrange
      const stableData: TrendData[] = [
        { ...mockTrendData[0], value: 15 },
        { ...mockTrendData[1], value: 15 },
      ];

      // Act
      const direction = service.calculateTrendDirection(stableData);

      // Assert
      expect(direction).toBe('stable');
    });

    it('should throw error for empty data array', () => {
      // Act & Assert
      expect(() => service.calculateTrendDirection([])).toThrow(
        'Cannot calculate trend direction for empty data array'
      );
    });

    it('should throw error for single data point', () => {
      // Act & Assert
      expect(() => service.calculateTrendDirection([mockTrendData[0]])).toThrow(
        'At least two data points required to calculate trend direction'
      );
    });
  });

  describe('calculateStatistics', () => {
    it('should calculate correct statistics for data array', () => {
      // Arrange
      const data: TrendData[] = [
        { ...mockTrendData[0], value: 10 },
        { ...mockTrendData[1], value: 20 },
        { ...mockTrendData[0], value: 30 },
      ];

      // Act
      const stats = service.calculateStatistics(data);

      // Assert
      expect(stats).toEqual({
        mean: 20,
        median: 20,
        min: 10,
        max: 30,
        stdDev: expect.any(Number),
        count: 3,
      });
    });

    it('should handle single data point', () => {
      // Arrange
      const singleData: TrendData[] = [{ ...mockTrendData[0], value: 42 }];

      // Act
      const stats = service.calculateStatistics(singleData);

      // Assert
      expect(stats.stdDev).toBe(0);
      expect(stats.mean).toBe(42);
    });

    it('should throw error for empty data array', () => {
      // Act & Assert
      expect(() => service.calculateStatistics([])).toThrow(
        'Cannot calculate statistics for empty data array'
      );
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when repository is available', async () => {
      // Arrange
      mockRepository.healthCheck.mockResolvedValue({ healthy: true });

      // Act
      const health = await service.healthCheck();

      // Assert
      expect(health).toEqual({ healthy: true, service: 'TrendDataService' });
    });

    it('should return unhealthy status when repository check fails', async () => {
      // Arrange
      mockRepository.healthCheck.mockRejectedValue(new Error('DB unreachable'));

      // Act
      const health = await service.healthCheck();

      // Assert
      expect(health).toEqual({
        healthy: false,
        service: 'TrendDataService',
        error: 'DB unreachable',
      });
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should wrap errors with proper context', async () => {
      // Arrange
      const originalError = new Error('Original error');
      mockRepository.fetchTrendData.mockRejectedValue(originalError);

      // Act & Assert
      try {
        await service.getTrendData(validQuery);
        fail('Expected error to be thrown');
      } catch (error) {
        const trendError = error as TrendDataError;
        expect(trendError.message).toContain('Failed to fetch trend data');
        expect(trendError.code).toBe('TREND_DATA_FETCH_ERROR');
        expect(trendError.originalError).toBe(originalError);
      }
    });

    it('should handle timeout errors specifically', async () => {
      // Arrange
      const timeoutError = new Error('Query timeout');
      timeoutError.name = 'TimeoutError';
      mockRepository.fetchTrendData.mockRejectedValue(timeoutError);

      // Act & Assert
      await expect(service.getTrendData(validQuery)).rejects.toThrow(
        'Trend data query timed out'
      );
    });
  });

  describe('caching behavior', () => {
    it('should cache repeated identical queries', async () => {
      // Arrange
      const mockResult: TrendDataResult = {
        data: mockTrendData,
        totalCount: 2,
        hasMore: false,
      };
      mockRepository.fetchTrendData.mockResolvedValue(mockResult);

      // Act
      await service.getTrendData(validQuery);
      await service.getTrendData(validQuery); // Same query again

      // Assert
      expect(mockRepository.fetchTrendData).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Returning cached trend data'
      );
    });

    it('should bypass cache when cache flag is false', async () => {
      // Arrange
      const mockResult: TrendDataResult = {
        data: mockTrendData,
        totalCount: 2,
        hasMore: false,
      };
      mockRepository.fetchTrendData.mockResolvedValue(mockResult);

      // Act
      await service.getTrendData(validQuery);
      await service.getTrendData({ ...validQuery, useCache: false });

      // Assert
      expect(mockRepository.fetchTrendData).toHaveBeenCalledTimes(2);
    });
  });
});