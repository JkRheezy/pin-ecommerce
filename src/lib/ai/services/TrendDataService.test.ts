import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TrendDataService } from './TrendDataService';
import { TrendDataRepository } from '../repositories/TrendDataRepository';
import { Logger } from '../../logging/Logger';
import type {
  TrendData,
  TrendDataQuery,
  TrendDataConfig,
  TimeRange,
  TrendMetric,
  TrendAnalysisResult,
} from '../types/TrendDataTypes';

// Mock dependencies
jest.mock('../repositories/TrendDataRepository');
jest.mock('../../logging/Logger');

describe('TrendDataService', () => {
  let service: TrendDataService;
  let mockRepository: jest.Mocked<TrendDataRepository>;
  let mockLogger: jest.Mocked<Logger>;

  // Test fixtures
  const validTimeRange: TimeRange = {
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-31T23:59:59Z'),
  };

  const validConfig: TrendDataConfig = {
    metricTypes: ['cpu', 'memory', 'disk'],
    aggregationInterval: '1h',
    includeForecast: true,
    confidenceLevel: 0.95,
  };

  const mockTrendData: TrendData[] = [
    {
      timestamp: new Date('2024-01-01T00:00:00Z'),
      metric: 'cpu',
      value: 45.5,
      metadata: { host: 'server-1' },
    },
    {
      timestamp: new Date('2024-01-01T01:00:00Z'),
      metric: 'cpu',
      value: 52.3,
      metadata: { host: 'server-1' },
    },
  ];

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Create mock instances
    mockRepository = new TrendDataRepository() as jest.Mocked<TrendDataRepository>;
    mockLogger = new Logger('TrendDataService') as jest.Mocked<Logger>;

    // Initialize service with mocked dependencies
    service = new TrendDataService(mockRepository, mockLogger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided dependencies', () => {
      const newService = new TrendDataService(mockRepository, mockLogger);
      expect(newService).toBeDefined();
      expect(newService).toBeInstanceOf(TrendDataService);
    });

    it('should throw error if repository is not provided', () => {
      expect(() => {
        new TrendDataService(undefined as unknown as TrendDataRepository, mockLogger);
      }).toThrow('TrendDataRepository is required');
    });

    it('should throw error if logger is not provided', () => {
      expect(() => {
        new TrendDataService(mockRepository, undefined as unknown as Logger);
      }).toThrow('Logger is required');
    });
  });

  describe('getTrendData', () => {
    const validQuery: TrendDataQuery = {
      timeRange: validTimeRange,
      metrics: ['cpu', 'memory'],
      filters: { host: 'server-1' },
    };

    it('should successfully retrieve trend data for valid query', async () => {
      // Arrange
      mockRepository.fetchTrendData.mockResolvedValue(mockTrendData);

      // Act
      const result = await service.getTrendData(validQuery);

      // Assert
      expect(result).toEqual(mockTrendData);
      expect(mockRepository.fetchTrendData).toHaveBeenCalledWith(validQuery);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Fetching trend data',
        expect.objectContaining({ query: validQuery })
      );
    });

    it('should throw error for invalid time range', async () => {
      // Arrange
      const invalidQuery: TrendDataQuery = {
        ...validQuery,
        timeRange: {
          startTime: new Date('2024-01-31T00:00:00Z'),
          endTime: new Date('2024-01-01T00:00:00Z'), // End before start
        },
      };

      // Act & Assert
      await expect(service.getTrendData(invalidQuery)).rejects.toThrow(
        'Invalid time range: endTime must be after startTime'
      );
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockRepository.fetchTrendData).not.toHaveBeenCalled();
    });

    it('should throw error for empty metrics array', async () => {
      // Arrange
      const invalidQuery: TrendDataQuery = {
        ...validQuery,
        metrics: [],
      };

      // Act & Assert
      await expect(service.getTrendData(invalidQuery)).rejects.toThrow(
        'At least one metric must be specified'
      );
    });

    it('should throw error for metrics array exceeding limit', async () => {
      // Arrange
      const invalidQuery: TrendDataQuery = {
        ...validQuery,
        metrics: Array(101).fill('metric'), // Exceeds 100 limit
      };

      // Act & Assert
      await expect(service.getTrendData(invalidQuery)).rejects.toThrow(
        'Metrics array exceeds maximum limit of 100'
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
          query: validQuery,
        })
      );
    });

    it('should apply default filters when not provided', async () => {
      // Arrange
      const queryWithoutFilters: TrendDataQuery = {
        timeRange: validTimeRange,
        metrics: ['cpu'],
      };
      mockRepository.fetchTrendData.mockResolvedValue(mockTrendData);

      // Act
      await service.getTrendData(queryWithoutFilters);

      // Assert
      expect(mockRepository.fetchTrendData).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: {},
        })
      );
    });
  });

  describe('analyzeTrends', () => {
    it('should successfully analyze trends with valid config', async () => {
      // Arrange
      const mockAnalysisResult: TrendAnalysisResult = {
        trend: 'increasing',
        slope: 2.5,
        correlation: 0.85,
        forecast: [
          { timestamp: new Date('2024-02-01T00:00:00Z'), predictedValue: 60.0 },
        ],
        confidenceInterval: { lower: 55.0, upper: 65.0 },
      };
      mockRepository.fetchTrendData.mockResolvedValue(mockTrendData);
      mockRepository.calculateTrendAnalysis.mockResolvedValue(mockAnalysisResult);

      // Act
      const result = await service.analyzeTrends(validTimeRange, validConfig);

      // Assert
      expect(result).toEqual(mockAnalysisResult);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting trend analysis',
        expect.objectContaining({
          timeRange: validTimeRange,
          config: validConfig,
        })
      );
    });

    it('should throw error for invalid confidence level', async () => {
      // Arrange
      const invalidConfig: TrendDataConfig = {
        ...validConfig,
        confidenceLevel: 1.5, // Invalid: must be between 0 and 1
      };

      // Act & Assert
      await expect(service.analyzeTrends(validTimeRange, invalidConfig)).rejects.toThrow(
        'Confidence level must be between 0 and 1'
      );
    });

    it('should throw error for unsupported aggregation interval', async () => {
      // Arrange
      const invalidConfig: TrendDataConfig = {
        ...validConfig,
        aggregationInterval: 'invalid' as unknown as TrendDataConfig['aggregationInterval'],
      };

      // Act & Assert
      await expect(service.analyzeTrends(validTimeRange, invalidConfig)).rejects.toThrow(
        'Unsupported aggregation interval: invalid'
      );
    });

    it('should handle empty dataset gracefully', async () => {
      // Arrange
      mockRepository.fetchTrendData.mockResolvedValue([]);

      // Act
      const result = await service.analyzeTrends(validTimeRange, validConfig);

      // Assert
      expect(result).toEqual({
        trend: 'insufficient_data',
        slope: 0,
        correlation: 0,
        forecast: [],
        confidenceInterval: null,
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Insufficient data for trend analysis',
        expect.any(Object)
      );
    });

    it('should skip forecast calculation when disabled in config', async () => {
      // Arrange
      const configWithoutForecast: TrendDataConfig = {
        ...validConfig,
        includeForecast: false,
      };
      mockRepository.fetchTrendData.mockResolvedValue(mockTrendData);
      mockRepository.calculateTrendAnalysis.mockResolvedValue({
        trend: 'stable',
        slope: 0,
        correlation: 0.1,
        forecast: [],
        confidenceInterval: null,
      });

      // Act
      const result = await service.analyzeTrends(validTimeRange, configWithoutForecast);

      // Assert
      expect(result.forecast).toEqual([]);
      expect(mockRepository.calculateForecast).not.toHaveBeenCalled();
    });
  });

  describe('aggregateMetrics', () => {
    const mockMetrics: TrendMetric[] = [
      { name: 'cpu', value: 45.5, weight: 1.0 },
      { name: 'cpu', value: 52.3, weight: 1.0 },
      { name: 'memory', value: 78.0, weight: 0.8 },
    ];

    it('should calculate weighted average correctly', () => {
      // Act
      const result = service.aggregateMetrics(mockMetrics, 'weighted_average');

      // Assert
      expect(result).toBeCloseTo(57.89, 2);
    });

    it('should calculate simple average correctly', () => {
      // Act
      const result = service.aggregateMetrics(mockMetrics, 'average');

      // Assert
      expect(result).toBeCloseTo(58.6, 1);
    });

    it('should calculate maximum correctly', () => {
      // Act
      const result = service.aggregateMetrics(mockMetrics, 'max');

      // Assert
      expect(result).toBe(78.0);
    });

    it('should calculate minimum correctly', () => {
      // Act
      const result = service.aggregateMetrics(mockMetrics, 'min');

      // Assert
      expect(result).toBe(45.5);
    });

    it('should throw error for empty metrics array', () => {
      // Act & Assert
      expect(() => {
        service.aggregateMetrics([], 'average');
      }).toThrow('Cannot aggregate empty metrics array');
    });

    it('should throw error for unsupported aggregation method', () => {
      // Act & Assert
      expect(() => {
        service.aggregateMetrics(mockMetrics, 'invalid_method' as unknown as string);
      }).toThrow('Unsupported aggregation method: invalid_method');
    });

    it('should handle metrics with zero weights', () => {
      // Arrange
      const metricsWithZeroWeight: TrendMetric[] = [
        { name: 'cpu', value: 50.0, weight: 0 },
        { name: 'cpu', value: 60.0, weight: 1.0 },
      ];

      // Act
      const result = service.aggregateMetrics(metricsWithZeroWeight, 'weighted_average');

      // Assert
      expect(result).toBe(60.0);
    });
  });

  describe('validateTrendData', () => {
    it('should return true for valid trend data', () => {
      // Act
      const result = service.validateTrendData(mockTrendData[0]);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing timestamp', () => {
      // Arrange
      const invalidData = { ...mockTrendData[0], timestamp: undefined };

      // Act
      const result = service.validateTrendData(invalidData as unknown as TrendData);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Timestamp is required');
    });

    it('should detect invalid timestamp', () => {
      // Arrange
      const invalidData = { ...mockTrendData[0], timestamp: 'invalid-date' };

      // Act
      const result = service.validateTrendData(invalidData as unknown as TrendData);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid timestamp format');
    });

    it('should detect missing metric name', () => {
      // Arrange
      const invalidData = { ...mockTrendData[0], metric: '' };

      // Act
      const result = service.validateTrendData(invalidData);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Metric name is required');
    });

    it('should detect out-of-range value', () => {
      // Arrange
      const invalidData = { ...mockTrendData[0], value: -1 };

      // Act
      const result = service.validateTrendData(invalidData);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Value must be non-negative');
    });

    it('should detect NaN value', () => {
      // Arrange
      const invalidData = { ...mockTrendData[0], value: NaN };

      // Act
      const result = service.validateTrendData(invalidData);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Value must be a valid number');
    });

    it('should collect multiple validation errors', () => {
      // Arrange
      const invalidData = {
        timestamp: 'invalid',
        metric: '',
        value: -5,
      };

      // Act
      const result = service.validateTrendData(invalidData as unknown as TrendData);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('exportTrendData', () => {
    const exportQuery: TrendDataQuery = {
      timeRange: validTimeRange,
      metrics: ['cpu'],
    };

    it('should export data in JSON format', async () => {
      // Arrange
      mockRepository.fetchTrendData.mockResolvedValue(mockTrendData);

      // Act
      const result = await service.exportTrendData(exportQuery, 'json');

      // Assert
      expect(result.format).toBe('json');
      expect(result.data).toEqual(JSON.stringify(mockTrendData, null, 2));
      expect(result.contentType).toBe('application/json');
    });

    it('should export data in CSV format', async () => {
      // Arrange
      mockRepository.fetchTrendData.mockResolvedValue(mockTrendData);

      // Act
      const result = await service.exportTrendData(exportQuery, 'csv');

      // Assert
      expect(result.format).toBe('csv');
      expect(result.contentType).toBe('text/csv');
      expect(result.data).toContain('timestamp,metric,value');
      expect(result.data).toContain('cpu,45.5');
    });

    it('should throw error for unsupported export format', async () => {
      // Act & Assert
      await expect(
        service.exportTrendData(exportQuery, 'xml' as unknown as 'json' | 'csv')
      ).rejects.toThrow('Unsupported export format: xml');
    });

    it('should handle large datasets with pagination', async () => {
      // Arrange
      const largeDataset = Array(1000).fill(mockTrendData[0]);
      mockRepository.fetchTrendData.mockResolvedValue(largeDataset);

      // Act
      const result = await service.exportTrendData(exportQuery, 'json');

      // Assert
      expect(result.data).toBeDefined();
      expect(result.recordCount).toBe(1000);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Exporting large dataset',
        expect.objectContaining({ recordCount: 1000 })
      );
    });
  });

  describe('cache management', () => {
    it('should cache trend data results', async () => {
      // Arrange
      mockRepository.fetchTrendData.mockResolvedValue(mockTrendData);

      // Act
      await service.getTrendData({
        timeRange: validTimeRange,
        metrics: ['cpu'],
      });
      await service.getTrendData({
        timeRange: validTimeRange,
        metrics: ['cpu'],
      });

      // Assert
      expect(mockRepository.fetchTrendData).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith('Cache hit for trend data query');
    });

    it('should invalidate cache on demand', () => {
      // Act
      service.invalidateCache();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('Trend data cache invalidated');
    });

    it('should respect cache TTL', async () => {
      // Arrange
      jest.useFakeTimers();
      mockRepository.fetchTrendData.mockResolvedValue(mockTrendData);

      // Act
      await service.getTrendData({
        timeRange: validTimeRange,
        metrics: ['cpu'],
      });

      // Advance time beyond cache TTL (5 minutes)
      jest.advanceTimersByTime(6 * 60 * 1000);

      await service.getTrendData({
        timeRange: validTimeRange,
        metrics: ['cpu'],
      });

      // Assert
      expect(mockRepository.fetchTrendData).toHaveBeenCalledTimes(2);
      expect(mockLogger.debug).toHaveBeenCalledWith('Cache miss: entry expired');

      jest.useRealTimers();
    });
  });

  describe('performance monitoring', () => {
    it('should track query execution time', async () => {
      // Arrange
      mockRepository.fetchTrendData.mockResolvedValue(mockTrendData);

      // Act
      await service.getTrendData({
        timeRange: validTimeRange,
        metrics: ['cpu'],
      });

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Trend data query completed',
        expect.objectContaining({
          durationMs: expect.any(Number),
          recordCount: expect.any(Number),
        })
      );
    });

    it('should log slow queries', async () => {
      // Arrange
      mockRepository.fetchTrendData.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockTrendData), 2000);
          })
      );

      // Act
      await service.getTrendData({
        timeRange: validTimeRange,
        metrics: ['cpu'],
      });

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Slow trend data query detected',
        expect.objectContaining({
          durationMs: expect.any(Number),
          thresholdMs: 1000,
        })
      );
    });
  });
});