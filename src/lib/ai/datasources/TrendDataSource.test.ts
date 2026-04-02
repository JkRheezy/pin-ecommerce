import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TrendDataSource } from './TrendDataSource';
import { TrendService } from '../services/TrendService';
import { TrendConfig } from '../config/TrendConfig';
import { TrendType, TimeRange, TrendDataPoint, TrendQueryOptions } from '../types/TrendTypes';
import { Logger } from '@harness/logging';

// Mock dependencies
jest.mock('../services/TrendService');
jest.mock('../config/TrendConfig');
jest.mock('@harness/logging');

describe('TrendDataSource', () => {
  let trendDataSource: TrendDataSource;
  let mockTrendService: jest.Mocked<TrendService>;
  let mockLogger: jest.Mocked<Logger>;

  // Test fixtures
  const validTimeRange: TimeRange = {
    start: new Date('2024-01-01T00:00:00Z'),
    end: new Date('2024-01-31T23:59:59Z'),
  };

  const validDataPoints: TrendDataPoint[] = [
    { timestamp: new Date('2024-01-01'), value: 100, label: 'Day 1' },
    { timestamp: new Date('2024-01-02'), value: 150, label: 'Day 2' },
    { timestamp: new Date('2024-01-03'), value: 120, label: 'Day 3' },
  ];

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Setup mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    (Logger.getLogger as jest.Mock).mockReturnValue(mockLogger);

    // Setup mock trend service
    mockTrendService = {
      fetchTrends: jest.fn(),
      validateTimeRange: jest.fn(),
      aggregateData: jest.fn(),
    } as unknown as jest.Mocked<TrendService>;

    (TrendService as jest.MockedClass<typeof TrendService>).mockImplementation(() => mockTrendService);

    // Initialize TrendDataSource with default config
    const defaultConfig = new TrendConfig({
      maxDataPoints: 1000,
      defaultTimeRange: validTimeRange,
      supportedTypes: [TrendType.LINEAR, TrendType.EXPONENTIAL, TrendType.SEASONAL],
    });

    trendDataSource = new TrendDataSource(defaultConfig);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Layer 1: Types - Validation and type safety tests
   */
  describe('Type Validation', () => {
    it('should validate TrendType enum values', () => {
      const validTypes = Object.values(TrendType);
      expect(validTypes).toContain(TrendType.LINEAR);
      expect(validTypes).toContain(TrendType.EXPONENTIAL);
      expect(validTypes).toContain(TrendType.SEASONAL);
      expect(validTypes).toContain(TrendType.CUSTOM);
    });

    it('should validate TimeRange structure', () => {
      const timeRange: TimeRange = {
        start: new Date(),
        end: new Date(),
      };

      expect(timeRange).toHaveProperty('start');
      expect(timeRange).toHaveProperty('end');
      expect(timeRange.start instanceof Date).toBe(true);
      expect(timeRange.end instanceof Date).toBe(true);
    });

    it('should validate TrendDataPoint structure', () => {
      const dataPoint: TrendDataPoint = {
        timestamp: new Date(),
        value: 42,
        label: 'test',
        metadata: { source: 'test' },
      };

      expect(dataPoint).toHaveProperty('timestamp');
      expect(dataPoint).toHaveProperty('value');
      expect(typeof dataPoint.value).toBe('number');
    });
  });

  /**
   * Layer 2: Config - Configuration handling tests
   */
  describe('Configuration', () => {
    it('should initialize with valid configuration', () => {
      const config = new TrendConfig({
        maxDataPoints: 500,
        defaultTimeRange: validTimeRange,
        cacheEnabled: true,
        cacheTTL: 300000,
      });

      const dataSource = new TrendDataSource(config);
      expect(dataSource).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'TrendDataSource initialized with config',
        expect.any(Object)
      );
    });

    it('should throw error for invalid maxDataPoints configuration', () => {
      expect(() => {
        new TrendConfig({
          maxDataPoints: -1,
          defaultTimeRange: validTimeRange,
        });
      }).toThrow('maxDataPoints must be a positive integer');
    });

    it('should throw error for invalid time range in config', () => {
      expect(() => {
        new TrendConfig({
          maxDataPoints: 100,
          defaultTimeRange: {
            start: new Date('2024-12-31'),
            end: new Date('2024-01-01'), // End before start
          },
        });
      }).toThrow('Invalid default time range: end must be after start');
    });

    it('should apply default values for optional config properties', () => {
      const config = new TrendConfig({
        maxDataPoints: 100,
        defaultTimeRange: validTimeRange,
      });

      expect(config.cacheEnabled).toBe(false);
      expect(config.cacheTTL).toBe(60000); // Default 1 minute
    });
  });

  /**
   * Layer 3: Repo - Data repository and persistence tests
   */
  describe('Data Repository', () => {
    it('should fetch data from repository with valid query options', async () => {
      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
        granularity: 'daily',
      };

      mockTrendService.fetchTrends.mockResolvedValue(validDataPoints);

      const result = await trendDataSource.fetch(queryOptions);

      expect(mockTrendService.fetchTrends).toHaveBeenCalledWith(queryOptions);
      expect(result).toEqual(validDataPoints);
      expect(result).toHaveLength(3);
    });

    it('should cache results when cache is enabled', async () => {
      const configWithCache = new TrendConfig({
        maxDataPoints: 100,
        defaultTimeRange: validTimeRange,
        cacheEnabled: true,
        cacheTTL: 300000,
      });

      const dataSourceWithCache = new TrendDataSource(configWithCache);
      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
      };

      mockTrendService.fetchTrends.mockResolvedValue(validDataPoints);

      // First call should hit the service
      await dataSourceWithCache.fetch(queryOptions);
      expect(mockTrendService.fetchTrends).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await dataSourceWithCache.fetch(queryOptions);
      expect(mockTrendService.fetchTrends).toHaveBeenCalledTimes(1); // Still 1, cache hit
    });

    it('should invalidate cache after TTL expires', async () => {
      jest.useFakeTimers();

      const configWithCache = new TrendConfig({
        maxDataPoints: 100,
        defaultTimeRange: validTimeRange,
        cacheEnabled: true,
        cacheTTL: 1000, // 1 second TTL
      });

      const dataSourceWithCache = new TrendDataSource(configWithCache);
      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
      };

      mockTrendService.fetchTrends.mockResolvedValue(validDataPoints);

      // First call
      await dataSourceWithCache.fetch(queryOptions);
      expect(mockTrendService.fetchTrends).toHaveBeenCalledTimes(1);

      // Advance time past TTL
      jest.advanceTimersByTime(1500);

      // Second call should hit service again (cache expired)
      await dataSourceWithCache.fetch(queryOptions);
      expect(mockTrendService.fetchTrends).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  /**
   * Layer 4: Service - Business logic tests
   */
  describe('Service Layer', () => {
    it('should aggregate data points correctly', async () => {
      const rawData: TrendDataPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 10 },
        { timestamp: new Date('2024-01-01'), value: 20 },
        { timestamp: new Date('2024-01-02'), value: 30 },
      ];

      const aggregatedData: TrendDataPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 30 }, // Sum of 10 + 20
        { timestamp: new Date('2024-01-02'), value: 30 },
      ];

      mockTrendService.fetchTrends.mockResolvedValue(rawData);
      mockTrendService.aggregateData.mockReturnValue(aggregatedData);

      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
        aggregation: 'sum',
      };

      const result = await trendDataSource.fetch(queryOptions);

      expect(mockTrendService.aggregateData).toHaveBeenCalledWith(
        rawData,
        'sum',
        expect.any(Object)
      );
      expect(result).toEqual(aggregatedData);
    });

    it('should filter data by value range when specified', async () => {
      const rawData: TrendDataPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 10 },
        { timestamp: new Date('2024-01-02'), value: 50 },
        { timestamp: new Date('2024-01-03'), value: 100 },
      ];

      mockTrendService.fetchTrends.mockResolvedValue(rawData);

      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
        valueRange: { min: 20, max: 80 },
      };

      const result = await trendDataSource.fetch(queryOptions);

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(50);
    });

    it('should handle empty result sets gracefully', async () => {
      mockTrendService.fetchTrends.mockResolvedValue([]);

      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
      };

      const result = await trendDataSource.fetch(queryOptions);

      expect(result).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No data points found for query',
        expect.any(Object)
      );
    });
  });

  /**
   * Layer 5: Runtime - Execution and error handling tests
   */
  describe('Runtime Error Handling', () => {
    it('should handle service errors with proper logging', async () => {
      const serviceError = new Error('Database connection failed');
      mockTrendService.fetchTrends.mockRejectedValue(serviceError);

      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
      };

      await expect(trendDataSource.fetch(queryOptions)).rejects.toThrow(
        'Failed to fetch trend data: Database connection failed'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error fetching trend data',
        expect.objectContaining({
          error: serviceError.message,
          queryOptions,
        })
      );
    });

    it('should validate time range before fetching', async () => {
      mockTrendService.validateTimeRange.mockReturnValue(false);

      const invalidTimeRange: TimeRange = {
        start: new Date('2024-12-31'),
        end: new Date('2024-01-01'),
      };

      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: invalidTimeRange,
      };

      await expect(trendDataSource.fetch(queryOptions)).rejects.toThrow(
        'Invalid time range provided'
      );
    });

    it('should enforce max data points limit', async () => {
      const excessiveData: TrendDataPoint[] = Array(2000).fill(null).map((_, i) => ({
        timestamp: new Date(`2024-01-${(i % 30) + 1}`),
        value: i,
      }));

      mockTrendService.fetchTrends.mockResolvedValue(excessiveData);

      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
      };

      await expect(trendDataSource.fetch(queryOptions)).rejects.toThrow(
        'Data points exceed maximum limit of 1000'
      );
    });

    it('should handle network timeouts gracefully', async () => {
      mockTrendService.fetchTrends.mockRejectedValue(
        new Error('Request timeout after 30000ms')
      );

      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
        timeout: 30000,
      };

      await expect(trendDataSource.fetch(queryOptions)).rejects.toThrow(
        'Request timeout after 30000ms'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Trend data fetch timeout',
        expect.any(Object)
      );
    });

    it('should retry on transient failures', async () => {
      mockTrendService.fetchTrends
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockResolvedValue(validDataPoints);

      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
        retryCount: 3,
      };

      const result = await trendDataSource.fetch(queryOptions);

      expect(mockTrendService.fetchTrends).toHaveBeenCalledTimes(3);
      expect(result).toEqual(validDataPoints);
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries exceeded', async () => {
      mockTrendService.fetchTrends.mockRejectedValue(
        new Error('Persistent failure')
      );

      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
        retryCount: 2,
      };

      await expect(trendDataSource.fetch(queryOptions)).rejects.toThrow(
        'Failed to fetch trend data after 2 retries: Persistent failure'
      );
    });
  });

  /**
   * Layer 6: UI - Data transformation and presentation tests
   */
  describe('UI Data Transformation', () => {
    it('should format data for chart visualization', async () => {
      mockTrendService.fetchTrends.mockResolvedValue(validDataPoints);

      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
        format: 'chart',
      };

      const result = await trendDataSource.fetchFormatted(queryOptions);

      expect(result).toHaveProperty('labels');
      expect(result).toHaveProperty('datasets');
      expect(result.labels).toEqual(['Day 1', 'Day 2', 'Day 3']);
      expect(result.datasets[0].data).toEqual([100, 150, 120]);
    });

    it('should format data for table visualization', async () => {
      mockTrendService.fetchTrends.mockResolvedValue(validDataPoints);

      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
        format: 'table',
      };

      const result = await trendDataSource.fetchFormatted(queryOptions);

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('date');
      expect(result[0]).toHaveProperty('value');
      expect(result[0]).toHaveProperty('change');
    });

    it('should apply custom formatting function when provided', async () => {
      mockTrendService.fetchTrends.mockResolvedValue(validDataPoints);

      const customFormatter = (data: TrendDataPoint[]) => ({
        total: data.reduce((sum, d) => sum + d.value, 0),
        average: data.reduce((sum, d) => sum + d.value, 0) / data.length,
        count: data.length,
      });

      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
        customFormatter,
      };

      const result = await trendDataSource.fetchFormatted(queryOptions);

      expect(result).toEqual({
        total: 370,
        average: 370 / 3,
        count: 3,
      });
    });

    it('should handle null/undefined values in data formatting', async () => {
      const dataWithNulls: TrendDataPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 100, label: 'Day 1' },
        { timestamp: new Date('2024-01-02'), value: null as unknown as number, label: 'Day 2' },
        { timestamp: new Date('2024-01-03'), value: 120, label: 'Day 3' },
      ];

      mockTrendService.fetchTrends.mockResolvedValue(dataWithNulls);

      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
        format: 'chart',
        nullHandling: 'interpolate',
      };

      const result = await trendDataSource.fetchFormatted(queryOptions);

      expect(result.datasets[0].data[1]).toBe(110); // Interpolated value between 100 and 120
    });
  });

  /**
   * Edge Cases and Boundary Tests
   */
  describe('Edge Cases', () => {
    it('should handle single data point', async () => {
      const singlePoint: TrendDataPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 42 },
      ];

      mockTrendService.fetchTrends.mockResolvedValue(singlePoint);

      const result = await trendDataSource.fetch({
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
      });

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(42);
    });

    it('should handle very large values without overflow', async () => {
      const largeValues: TrendDataPoint[] = [
        { timestamp: new Date('2024-01-01'), value: Number.MAX_SAFE_INTEGER },
        { timestamp: new Date('2024-01-02'), value: Number.MAX_SAFE_INTEGER },
      ];

      mockTrendService.fetchTrends.mockResolvedValue(largeValues);

      const result = await trendDataSource.fetch({
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
      });

      expect(result[0].value).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle very small decimal values', async () => {
      const smallValues: TrendDataPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 0.0000001 },
        { timestamp: new Date('2024-01-02'), value: 0.0000002 },
      ];

      mockTrendService.fetchTrends.mockResolvedValue(smallValues);

      const result = await trendDataSource.fetch({
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
      });

      expect(result[0].value).toBeCloseTo(0.0000001, 10);
    });

    it('should handle timezone boundaries correctly', async () => {
      const timezoneEdgeCase: TimeRange = {
        start: new Date('2024-03-10T01:59:59Z'), // Just before DST
        end: new Date('2024-03-10T03:00:01Z'),   // Just after DST
      };

      mockTrendService.validateTimeRange.mockReturnValue(true);
      mockTrendService.fetchTrends.mockResolvedValue([]);

      const result = await trendDataSource.fetch({
        type: TrendType.LINEAR,
        timeRange: timezoneEdgeCase,
      });

      expect(result).toBeDefined();
      expect(mockTrendService.fetchTrends).toHaveBeenCalledWith(
        expect.objectContaining({
          timeRange: timezoneEdgeCase,
        })
      );
    });

    it('should handle concurrent requests safely', async () => {
      mockTrendService.fetchTrends.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(validDataPoints), 100))
      );

      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
      };

      // Fire 5 concurrent requests
      const promises = Array(5).fill(null).map(() => trendDataSource.fetch(queryOptions));

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result).toEqual(validDataPoints);
      });
    });

    it('should handle special characters in labels', async () => {
      const specialCharData: TrendDataPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 100, label: 'Test <script>alert("xss")</script>' },
        { timestamp: new Date('2024-01-02'), value: 150, label: 'Test "quotes" and \\backslashes\\' },
        { timestamp: new Date('2024-01-03'), value: 200, label: 'Test\nnewline\tand\ttabs' },
      ];

      mockTrendService.fetchTrends.mockResolvedValue(specialCharData);

      const result = await trendDataSource.fetch({
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
      });

      expect(result[0].label).toBe('Test <script>alert("xss")</script>');
      expect(result[1].label).toBe('Test "quotes" and \\backslashes\\');
      expect(result[2].label).toBe('Test\nnewline\tand\ttabs');
    });
  });

  /**
   * Performance and Resource Management Tests
   */
  describe('Performance', () => {
    it('should cancel in-flight requests on abort signal', async () => {
      const abortController = new AbortController();

      mockTrendService.fetchTrends.mockImplementation(
        () => new Promise((_, reject) => {
          abortController.signal.addEventListener('abort', () => {
            reject(new Error('Request aborted'));
          });
          setTimeout(() => resolve(validDataPoints), 1000);
        })
      );

      const queryOptions: TrendQueryOptions = {
        type: TrendType.LINEAR,
        timeRange: validTimeRange,
        signal: abortController.signal,
      };

      const fetchPromise = trendDataSource.fetch(queryOptions);

      // Abort after 50ms
      setTimeout(() => abortController.abort(), 50);

      await expect(fetchPromise).rejects.toThrow('Request aborted');
    });

    it('should dispose resources properly on cleanup', () => {
      const dataSource = new TrendDataSource(new TrendConfig({
        maxDataPoints: 100,
        defaultTimeRange: validTimeRange,
        cacheEnabled: true,
      }));

      dataSource.dispose();

      expect(mockLogger.info).toHaveBeenCalledWith('TrendDataSource disposed');
    });
  });
});