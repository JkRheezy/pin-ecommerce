import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TrendDataService } from './TrendDataService';
import { TrendAnalysisConfig, TrendDataPoint, TrendAnalysisResult } from '../types/TrendAnalysisTypes';
import { Logger } from '../../logging/Logger';
import { MetricRepository } from '../repos/MetricRepository';
import { TimeSeriesValidator } from '../validators/TimeSeriesValidator';
import { TrendCalculator } from '../calculators/TrendCalculator';
import { TrendAnalysisError } from '../errors/TrendAnalysisError';
import { ErrorCode } from '../../errors/ErrorCode';

// Mock dependencies
vi.mock('../../logging/Logger');
vi.mock('../repos/MetricRepository');
vi.mock('../validators/TimeSeriesValidator');
vi.mock('../calculators/TrendCalculator');

describe('TrendDataService', () => {
  let service: TrendDataService;
  let mockLogger: Logger;
  let mockMetricRepo: MetricRepository;
  let mockValidator: TimeSeriesValidator;
  let mockCalculator: TrendCalculator;

  const mockConfig: TrendAnalysisConfig = {
    metricId: 'test-metric-123',
    timeRange: {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-31'),
    },
    granularity: 'daily',
    smoothingFactor: 0.3,
  };

  const mockDataPoints: TrendDataPoint[] = [
    { timestamp: new Date('2024-01-01'), value: 100, metadata: {} },
    { timestamp: new Date('2024-01-02'), value: 105, metadata: {} },
    { timestamp: new Date('2024-01-03'), value: 103, metadata: {} },
    { timestamp: new Date('2024-01-04'), value: 110, metadata: {} },
    { timestamp: new Date('2024-01-05'), value: 115, metadata: {} },
  ];

  const mockAnalysisResult: TrendAnalysisResult = {
    trend: 'upward',
    slope: 3.5,
    confidence: 0.85,
    predictions: [
      { timestamp: new Date('2024-02-01'), predictedValue: 125, confidenceInterval: [120, 130] },
    ],
    seasonality: null,
    anomalies: [],
  };

  beforeEach(() => {
    // Create mock instances
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;

    mockMetricRepo = {
      fetchTimeSeries: vi.fn(),
    } as unknown as MetricRepository;

    mockValidator = {
      validateTimeRange: vi.fn(),
      validateDataPoints: vi.fn(),
    } as unknown as TimeSeriesValidator;

    mockCalculator = {
      calculateTrend: vi.fn(),
      detectAnomalies: vi.fn(),
      calculateSeasonality: vi.fn(),
    } as unknown as TrendCalculator;

    // Instantiate service with mocks
    service = new TrendDataService({
      logger: mockLogger,
      metricRepository: mockMetricRepo,
      validator: mockValidator,
      calculator: mockCalculator,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided dependencies', () => {
      expect(service).toBeDefined();
    });

    it('should throw error when required dependencies are missing', () => {
      expect(() => new TrendDataService({} as any)).toThrow(TrendAnalysisError);
    });
  });

  describe('analyzeTrend', () => {
    it('should successfully analyze trend with valid config', async () => {
      // Arrange: Setup mock return values
      vi.mocked(mockValidator.validateTimeRange).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockMetricRepo.fetchTimeSeries).mockResolvedValue(mockDataPoints);
      vi.mocked(mockValidator.validateDataPoints).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockCalculator.calculateTrend).mockReturnValue(mockAnalysisResult);

      // Act: Execute the method under test
      const result = await service.analyzeTrend(mockConfig);

      // Assert: Verify the behavior and result
      expect(result).toEqual(mockAnalysisResult);
      expect(mockValidator.validateTimeRange).toHaveBeenCalledWith(mockConfig.timeRange);
      expect(mockMetricRepo.fetchTimeSeries).toHaveBeenCalledWith({
        metricId: mockConfig.metricId,
        start: mockConfig.timeRange.start,
        end: mockConfig.timeRange.end,
        granularity: mockConfig.granularity,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting trend analysis'),
        expect.objectContaining({ metricId: mockConfig.metricId })
      );
    });

    it('should throw error when time range validation fails', async () => {
      // Arrange: Setup validation to fail
      const validationError = { isValid: false, errors: ['Invalid date range'] };
      vi.mocked(mockValidator.validateTimeRange).mockReturnValue(validationError);

      // Act & Assert: Verify error is thrown with correct details
      await expect(service.analyzeTrend(mockConfig)).rejects.toThrow(TrendAnalysisError);
      await expect(service.analyzeTrend(mockConfig)).rejects.toMatchObject({
        code: ErrorCode.INVALID_TIME_RANGE,
        details: { errors: validationError.errors },
      });
    });

    it('should handle empty data points gracefully', async () => {
      // Arrange: Setup empty data scenario
      vi.mocked(mockValidator.validateTimeRange).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockMetricRepo.fetchTimeSeries).mockResolvedValue([]);

      // Act & Assert: Verify appropriate error is thrown
      await expect(service.analyzeTrend(mockConfig)).rejects.toThrow(TrendAnalysisError);
      await expect(service.analyzeTrend(mockConfig)).rejects.toMatchObject({
        code: ErrorCode.INSUFFICIENT_DATA,
      });
    });

    it('should throw error when data point validation fails', async () => {
      // Arrange: Setup data validation failure
      vi.mocked(mockValidator.validateTimeRange).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockMetricRepo.fetchTimeSeries).mockResolvedValue(mockDataPoints);
      vi.mocked(mockValidator.validateDataPoints).mockReturnValue({
        isValid: false,
        errors: ['Invalid data format'],
      });

      // Act & Assert
      await expect(service.analyzeTrend(mockConfig)).rejects.toThrow(TrendAnalysisError);
    });

    it('should handle repository errors with proper logging', async () => {
      // Arrange: Simulate database/repository failure
      const dbError = new Error('Connection timeout');
      vi.mocked(mockValidator.validateTimeRange).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockMetricRepo.fetchTimeSeries).mockRejectedValue(dbError);

      // Act & Assert
      await expect(service.analyzeTrend(mockConfig)).rejects.toThrow(TrendAnalysisError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch time series data'),
        expect.objectContaining({ error: dbError.message })
      );
    });

    it('should apply smoothing factor when calculating trend', async () => {
      // Arrange
      vi.mocked(mockValidator.validateTimeRange).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockMetricRepo.fetchTimeSeries).mockResolvedValue(mockDataPoints);
      vi.mocked(mockValidator.validateDataPoints).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockCalculator.calculateTrend).mockReturnValue(mockAnalysisResult);

      const configWithSmoothing: TrendAnalysisConfig = {
        ...mockConfig,
        smoothingFactor: 0.5,
      };

      // Act
      await service.analyzeTrend(configWithSmoothing);

      // Assert: Verify smoothing factor is passed to calculator
      expect(mockCalculator.calculateTrend).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ smoothingFactor: 0.5 })
      );
    });

    it('should detect anomalies when configured', async () => {
      // Arrange
      const anomalies = [{ timestamp: new Date('2024-01-03'), severity: 'high' }];
      vi.mocked(mockValidator.validateTimeRange).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockMetricRepo.fetchTimeSeries).mockResolvedValue(mockDataPoints);
      vi.mocked(mockValidator.validateDataPoints).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockCalculator.calculateTrend).mockReturnValue(mockAnalysisResult);
      vi.mocked(mockCalculator.detectAnomalies).mockReturnValue(anomalies);

      const configWithAnomalyDetection: TrendAnalysisConfig = {
        ...mockConfig,
        detectAnomalies: true,
      };

      // Act
      const result = await service.analyzeTrend(configWithAnomalyDetection);

      // Assert
      expect(mockCalculator.detectAnomalies).toHaveBeenCalledWith(mockDataPoints);
      expect(result.anomalies).toEqual(anomalies);
    });

    it('should handle calculator errors gracefully', async () => {
      // Arrange
      vi.mocked(mockValidator.validateTimeRange).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockMetricRepo.fetchTimeSeries).mockResolvedValue(mockDataPoints);
      vi.mocked(mockValidator.validateDataPoints).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockCalculator.calculateTrend).mockImplementation(() => {
        throw new Error('Calculation overflow');
      });

      // Act & Assert
      await expect(service.analyzeTrend(mockConfig)).rejects.toThrow(TrendAnalysisError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Trend calculation failed'),
        expect.any(Object)
      );
    });

    it('should cache results for identical requests', async () => {
      // Arrange
      vi.mocked(mockValidator.validateTimeRange).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockMetricRepo.fetchTimeSeries).mockResolvedValue(mockDataPoints);
      vi.mocked(mockValidator.validateDataPoints).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockCalculator.calculateTrend).mockReturnValue(mockAnalysisResult);

      // Act: Call analyze twice with same config
      await service.analyzeTrend(mockConfig);
      await service.analyzeTrend(mockConfig);

      // Assert: Repository should only be called once due to caching
      expect(mockMetricRepo.fetchTimeSeries).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Cache hit'));
    });

    it('should bypass cache when forceRefresh is true', async () => {
      // Arrange
      vi.mocked(mockValidator.validateTimeRange).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockMetricRepo.fetchTimeSeries).mockResolvedValue(mockDataPoints);
      vi.mocked(mockValidator.validateDataPoints).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockCalculator.calculateTrend).mockReturnValue(mockAnalysisResult);

      // Act
      await service.analyzeTrend(mockConfig);
      await service.analyzeTrend({ ...mockConfig, forceRefresh: true });

      // Assert: Repository should be called twice when forceRefresh is used
      expect(mockMetricRepo.fetchTimeSeries).toHaveBeenCalledTimes(2);
    });
  });

  describe('getTrendSummary', () => {
    it('should return human-readable trend summary', async () => {
      // Arrange
      vi.mocked(mockValidator.validateTimeRange).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockMetricRepo.fetchTimeSeries).mockResolvedValue(mockDataPoints);
      vi.mocked(mockValidator.validateDataPoints).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockCalculator.calculateTrend).mockReturnValue(mockAnalysisResult);

      // Act
      const summary = await service.getTrendSummary(mockConfig);

      // Assert
      expect(summary).toMatchObject({
        direction: 'upward',
        strength: expect.any(String),
        keyInsight: expect.any(String),
        recommendation: expect.any(String),
      });
    });

    it('should handle downward trends appropriately', async () => {
      // Arrange
      const downwardResult: TrendAnalysisResult = {
        ...mockAnalysisResult,
        trend: 'downward',
        slope: -5.2,
      };
      vi.mocked(mockValidator.validateTimeRange).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockMetricRepo.fetchTimeSeries).mockResolvedValue(mockDataPoints);
      vi.mocked(mockValidator.validateDataPoints).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockCalculator.calculateTrend).mockReturnValue(downwardResult);

      // Act
      const summary = await service.getTrendSummary(mockConfig);

      // Assert
      expect(summary.direction).toBe('downward');
      expect(summary.recommendation).toContain('investigate');
    });
  });

  describe('compareTrends', () => {
    const mockConfigs: TrendAnalysisConfig[] = [
      { ...mockConfig, metricId: 'metric-a' },
      { ...mockConfig, metricId: 'metric-b' },
    ];

    it('should compare multiple trends successfully', async () => {
      // Arrange
      const resultA: TrendAnalysisResult = { ...mockAnalysisResult, trend: 'upward', slope: 5 };
      const resultB: TrendAnalysisResult = { ...mockAnalysisResult, trend: 'downward', slope: -3 };

      vi.mocked(mockValidator.validateTimeRange).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockMetricRepo.fetchTimeSeries).mockResolvedValue(mockDataPoints);
      vi.mocked(mockValidator.validateDataPoints).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockCalculator.calculateTrend)
        .mockReturnValueOnce(resultA)
        .mockReturnValueOnce(resultB);

      // Act
      const comparison = await service.compareTrends(mockConfigs);

      // Assert
      expect(comparison).toHaveLength(2);
      expect(comparison[0].correlation).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Comparing 2 trends')
      );
    });

    it('should throw error when less than 2 configs provided', async () => {
      // Act & Assert
      await expect(service.compareTrends([mockConfig])).rejects.toThrow(TrendAnalysisError);
      await expect(service.compareTrends([])).rejects.toThrow(TrendAnalysisError);
    });

    it('should calculate correlation between trends', async () => {
      // Arrange
      vi.mocked(mockValidator.validateTimeRange).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockMetricRepo.fetchTimeSeries).mockResolvedValue(mockDataPoints);
      vi.mocked(mockValidator.validateDataPoints).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockCalculator.calculateTrend).mockReturnValue(mockAnalysisResult);

      // Act
      const comparison = await service.compareTrends(mockConfigs);

      // Assert
      expect(comparison[0].correlation).toBeGreaterThanOrEqual(-1);
      expect(comparison[0].correlation).toBeLessThanOrEqual(1);
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('should handle single data point', async () => {
      // Arrange
      vi.mocked(mockValidator.validateTimeRange).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockMetricRepo.fetchTimeSeries).mockResolvedValue([mockDataPoints[0]]);

      // Act & Assert
      await expect(service.analyzeTrend(mockConfig)).rejects.toThrow(TrendAnalysisError);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient data points')
      );
    });

    it('should handle very large datasets efficiently', async () => {
      // Arrange: Create large dataset
      const largeDataset: TrendDataPoint[] = Array.from({ length: 10000 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 86400000),
        value: Math.random() * 1000,
        metadata: {},
      }));

      vi.mocked(mockValidator.validateTimeRange).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockMetricRepo.fetchTimeSeries).mockResolvedValue(largeDataset);
      vi.mocked(mockValidator.validateDataPoints).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockCalculator.calculateTrend).mockReturnValue(mockAnalysisResult);

      // Act
      const startTime = Date.now();
      await service.analyzeTrend(mockConfig);
      const duration = Date.now() - startTime;

      // Assert: Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(1000);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Processing 10000 data points')
      );
    });

    it('should handle null values in data points', async () => {
      // Arrange
      const dataWithNulls: TrendDataPoint[] = [
        ...mockDataPoints,
        { timestamp: new Date('2024-01-06'), value: null as any, metadata: {} },
      ];

      vi.mocked(mockValidator.validateTimeRange).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockMetricRepo.fetchTimeSeries).mockResolvedValue(dataWithNulls);
      vi.mocked(mockValidator.validateDataPoints).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(mockCalculator.calculateTrend).mockReturnValue(mockAnalysisResult);

      // Act
      const result = await service.analyzeTrend(mockConfig);

      // Assert
      expect(result).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Null values detected')
      );
    });

    it('should respect maximum time range limits', async () => {
      // Arrange
      const invalidConfig: TrendAnalysisConfig = {
        ...mockConfig,
        timeRange: {
          start: new Date('2020-01-01'),
          end: new Date('2024-01-01'), // 4 year range
        },
      };

      vi.mocked(mockValidator.validateTimeRange).mockReturnValue({
        isValid: false,
        errors: ['Time range exceeds maximum allowed'],
      });

      // Act & Assert
      await expect(service.analyzeTrend(invalidConfig)).rejects.toThrow(TrendAnalysisError);
    });
  });
});