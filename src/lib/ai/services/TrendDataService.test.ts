import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TrendDataService } from './TrendDataService';
import { TrendRepository } from '../repo/TrendRepository';
import { TrendConfig } from '../config/TrendConfig';
import type {
  TrendData,
  TrendTimeRange,
  TrendMetricType,
  TrendAggregation,
  TrendDataRequest,
  TrendDataResponse,
  TrendDataError,
  TrendDataErrorCode,
} from '../types/TrendDataTypes';
import { Logger } from '../../logging/Logger';

// Mock dependencies
jest.mock('../repo/TrendRepository');
jest.mock('../config/TrendConfig');
jest.mock('../../logging/Logger');

describe('TrendDataService', () => {
  let service: TrendDataService;
  let mockTrendRepository: jest.Mocked<TrendRepository>;
  let mockLogger: jest.Mocked<Logger>;

  // Test fixtures
  const mockTimeRange: TrendTimeRange = {
    startDate: new Date('2024-01-01T00:00:00Z'),
    endDate: new Date('2024-01-31T23:59:59Z'),
  };

  const mockTrendData: TrendData[] = [
    {
      timestamp: new Date('2024-01-15T00:00:00Z'),
      value: 100,
      metricType: 'deployment_frequency',
      metadata: { environment: 'production' },
    },
    {
      timestamp: new Date('2024-01-16T00:00:00Z'),
      value: 150,
      metricType: 'deployment_frequency',
      metadata: { environment: 'production' },
    },
  ];

  const mockRequest: TrendDataRequest = {
    metricType: 'deployment_frequency' as TrendMetricType,
    timeRange: mockTimeRange,
    aggregation: 'daily' as TrendAggregation,
    filters: { environment: 'production' },
  };

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Create mock instances
    mockTrendRepository = new TrendRepository() as jest.Mocked<TrendRepository>;
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    // Initialize service with mocked dependencies
    service = new TrendDataService(mockTrendRepository, mockLogger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with required dependencies', () => {
      const newService = new TrendDataService(mockTrendRepository, mockLogger);
      expect(newService).toBeDefined();
      expect(newService).toBeInstanceOf(TrendDataService);
    });

    it('should throw error when repository is not provided', () => {
      expect(() => {
        new TrendDataService(undefined as unknown as TrendRepository, mockLogger);
      }).toThrow('TrendRepository is required');
    });

    it('should throw error when logger is not provided', () => {
      expect(() => {
        new TrendDataService(mockTrendRepository, undefined as unknown as Logger);
      }).toThrow('Logger is required');
    });
  });

  describe('getTrendData', () => {
    it('should successfully retrieve trend data for valid request', async () => {
      // Arrange: Setup mock repository response
      const mockResponse: TrendDataResponse = {
        data: mockTrendData,
        metadata: {
          totalRecords: 2,
          timeRange: mockTimeRange,
          aggregation: 'daily',
        },
      };
      mockTrendRepository.fetchTrendData.mockResolvedValue(mockResponse);

      // Act: Call the service method
      const result = await service.getTrendData(mockRequest);

      // Assert: Verify the result and interactions
      expect(result).toEqual(mockResponse);
      expect(mockTrendRepository.fetchTrendData).toHaveBeenCalledWith(mockRequest);
      expect(mockTrendRepository.fetchTrendData).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Fetching trend data',
        expect.objectContaining({
          metricType: mockRequest.metricType,
          aggregation: mockRequest.aggregation,
        })
      );
    });

    it('should validate request before fetching data', async () => {
      // Arrange: Create invalid request (missing required fields)
      const invalidRequest = {
        ...mockRequest,
        timeRange: undefined as unknown as TrendTimeRange,
      };

      // Act & Assert: Expect validation to throw
      await expect(service.getTrendData(invalidRequest as TrendDataRequest)).rejects.toThrow(
        'Invalid timeRange: must have valid startDate and endDate'
      );
      expect(mockTrendRepository.fetchTrendData).not.toHaveBeenCalled();
    });

    it('should handle repository errors with proper error transformation', async () => {
      // Arrange: Setup repository to throw error
      const repoError = new Error('Database connection failed');
      mockTrendRepository.fetchTrendData.mockRejectedValue(repoError);

      // Act & Assert: Expect service to transform and throw
      await expect(service.getTrendData(mockRequest)).rejects.toMatchObject({
        code: 'REPOSITORY_ERROR',
        message: 'Failed to fetch trend data',
        originalError: repoError,
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error fetching trend data',
        expect.objectContaining({
          error: repoError.message,
          metricType: mockRequest.metricType,
        })
      );
    });

    it('should handle empty data response gracefully', async () => {
      // Arrange: Setup empty response
      const emptyResponse: TrendDataResponse = {
        data: [],
        metadata: {
          totalRecords: 0,
          timeRange: mockTimeRange,
          aggregation: 'daily',
        },
      };
      mockTrendRepository.fetchTrendData.mockResolvedValue(emptyResponse);

      // Act
      const result = await service.getTrendData(mockRequest);

      // Assert
      expect(result.data).toHaveLength(0);
      expect(result.metadata.totalRecords).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No trend data found for request',
        expect.any(Object)
      );
    });

    it('should apply default aggregation when not specified', async () => {
      // Arrange: Request without aggregation
      const requestWithoutAggregation = {
        ...mockRequest,
        aggregation: undefined,
      };

      const mockResponse: TrendDataResponse = {
        data: mockTrendData,
        metadata: {
          totalRecords: 2,
          timeRange: mockTimeRange,
          aggregation: 'daily', // Default value
        },
      };
      mockTrendRepository.fetchTrendData.mockResolvedValue(mockResponse);

      // Act
      await service.getTrendData(requestWithoutAggregation as TrendDataRequest);

      // Assert: Verify default aggregation was applied
      expect(mockTrendRepository.fetchTrendData).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregation: 'daily',
        })
      );
    });
  });

  describe('aggregateTrendData', () => {
    it('should aggregate data by specified time bucket', () => {
      // Arrange: Create sample data for aggregation
      const rawData: TrendData[] = [
        { timestamp: new Date('2024-01-15T10:00:00Z'), value: 100, metricType: 'deployment_frequency' },
        { timestamp: new Date('2024-01-15T14:00:00Z'), value: 200, metricType: 'deployment_frequency' },
        { timestamp: new Date('2024-01-16T10:00:00Z'), value: 150, metricType: 'deployment_frequency' },
      ];

      // Act: Aggregate by day
      const result = (service as any).aggregateTrendData(rawData, 'daily');

      // Assert: Verify aggregation logic
      expect(result).toHaveLength(2); // Two days of data
      expect(result[0].aggregatedValue).toBe(150); // Average of 100 and 200
      expect(result[1].aggregatedValue).toBe(150); // Single value
    });

    it('should handle empty data array', () => {
      // Act
      const result = (service as any).aggregateTrendData([], 'daily');

      // Assert
      expect(result).toEqual([]);
    });

    it('should throw error for unsupported aggregation type', () => {
      // Act & Assert
      expect(() => {
        (service as any).aggregateTrendData(mockTrendData, 'invalid_aggregation' as TrendAggregation);
      }).toThrow('Unsupported aggregation type: invalid_aggregation');
    });
  });

  describe('validateTimeRange', () => {
    it('should return true for valid time range', () => {
      // Act
      const isValid = (service as any).validateTimeRange(mockTimeRange);

      // Assert
      expect(isValid).toBe(true);
    });

    it('should return false when start date is after end date', () => {
      // Arrange: Invalid time range
      const invalidRange: TrendTimeRange = {
        startDate: new Date('2024-01-31T00:00:00Z'),
        endDate: new Date('2024-01-01T00:00:00Z'),
      };

      // Act
      const isValid = (service as any).validateTimeRange(invalidRange);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should return false when dates are equal', () => {
      // Arrange
      const sameDate = new Date('2024-01-15T00:00:00Z');
      const invalidRange: TrendTimeRange = {
        startDate: sameDate,
        endDate: sameDate,
      };

      // Act
      const isValid = (service as any).validateTimeRange(invalidRange);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should return false for null or undefined time range', () => {
      // Act & Assert
      expect((service as any).validateTimeRange(null)).toBe(false);
      expect((service as any).validateTimeRange(undefined)).toBe(false);
    });

    it('should return false when dates are invalid', () => {
      // Arrange
      const invalidRange: TrendTimeRange = {
        startDate: new Date('invalid'),
        endDate: new Date('2024-01-31T00:00:00Z'),
      };

      // Act
      const isValid = (service as any).validateTimeRange(invalidRange);

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe('calculateTrendMetrics', () => {
    it('should calculate trend direction and change percentage', () => {
      // Arrange
      const data: TrendData[] = [
        { timestamp: new Date('2024-01-01'), value: 100, metricType: 'deployment_frequency' },
        { timestamp: new Date('2024-01-02'), value: 110, metricType: 'deployment_frequency' },
        { timestamp: new Date('2024-01-03'), value: 120, metricType: 'deployment_frequency' },
      ];

      // Act
      const metrics = (service as any).calculateTrendMetrics(data);

      // Assert
      expect(metrics.direction).toBe('upward');
      expect(metrics.changePercentage).toBe(20); // (120-100)/100 * 100
      expect(metrics.averageValue).toBe(110);
    });

    it('should detect downward trend', () => {
      // Arrange
      const data: TrendData[] = [
        { timestamp: new Date('2024-01-01'), value: 120, metricType: 'deployment_frequency' },
        { timestamp: new Date('2024-01-02'), value: 110, metricType: 'deployment_frequency' },
        { timestamp: new Date('2024-01-03'), value: 100, metricType: 'deployment_frequency' },
      ];

      // Act
      const metrics = (service as any).calculateTrendMetrics(data);

      // Assert
      expect(metrics.direction).toBe('downward');
      expect(metrics.changePercentage).toBeCloseTo(-16.67, 2);
    });

    it('should handle stable trend', () => {
      // Arrange
      const data: TrendData[] = [
        { timestamp: new Date('2024-01-01'), value: 100, metricType: 'deployment_frequency' },
        { timestamp: new Date('2024-01-02'), value: 100, metricType: 'deployment_frequency' },
        { timestamp: new Date('2024-01-03'), value: 100, metricType: 'deployment_frequency' },
      ];

      // Act
      const metrics = (service as any).calculateTrendMetrics(data);

      // Assert
      expect(metrics.direction).toBe('stable');
      expect(metrics.changePercentage).toBe(0);
    });

    it('should throw error for insufficient data points', () => {
      // Arrange
      const insufficientData: TrendData[] = [
        { timestamp: new Date('2024-01-01'), value: 100, metricType: 'deployment_frequency' },
      ];

      // Act & Assert
      expect(() => {
        (service as any).calculateTrendMetrics(insufficientData);
      }).toThrow('Insufficient data points for trend calculation: minimum 2 required');
    });
  });

  describe('cache management', () => {
    it('should cache trend data for identical requests', async () => {
      // Arrange
      const mockResponse: TrendDataResponse = {
        data: mockTrendData,
        metadata: { totalRecords: 2, timeRange: mockTimeRange, aggregation: 'daily' },
      };
      mockTrendRepository.fetchTrendData.mockResolvedValue(mockResponse);

      // Act: Make same request twice
      await service.getTrendData(mockRequest);
      await service.getTrendData(mockRequest);

      // Assert: Repository should only be called once due to caching
      expect(mockTrendRepository.fetchTrendData).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith('Cache hit for trend data request');
    });

    it('should bypass cache when cache option is false', async () => {
      // Arrange
      const mockResponse: TrendDataResponse = {
        data: mockTrendData,
        metadata: { totalRecords: 2, timeRange: mockTimeRange, aggregation: 'daily' },
      };
      mockTrendRepository.fetchTrendData.mockResolvedValue(mockResponse);

      // Act: Make request with cache disabled
      await service.getTrendData({ ...mockRequest, useCache: false });

      // Assert
      expect(mockTrendRepository.fetchTrendData).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith('Cache bypassed for trend data request');
    });
  });

  describe('error handling edge cases', () => {
    it('should handle network timeout errors', async () => {
      // Arrange
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      mockTrendRepository.fetchTrendData.mockRejectedValue(timeoutError);

      // Act & Assert
      await expect(service.getTrendData(mockRequest)).rejects.toMatchObject({
        code: 'TIMEOUT_ERROR',
        message: 'Request timed out while fetching trend data',
      });
    });

    it('should handle rate limit errors', async () => {
      // Arrange
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).statusCode = 429;
      mockTrendRepository.fetchTrendData.mockRejectedValue(rateLimitError);

      // Act & Assert
      await expect(service.getTrendData(mockRequest)).rejects.toMatchObject({
        code: 'RATE_LIMIT_ERROR',
        message: 'Rate limit exceeded, please retry later',
      });
    });

    it('should sanitize sensitive data in error logs', async () => {
      // Arrange
      const requestWithSensitiveData: TrendDataRequest = {
        ...mockRequest,
        filters: { apiKey: 'secret-key-123', environment: 'production' },
      };
      const error = new Error('Database error');
      mockTrendRepository.fetchTrendData.mockRejectedValue(error);

      // Act
      try {
        await service.getTrendData(requestWithSensitiveData);
      } catch (e) {
        // Expected to throw
      }

      // Assert: Verify sensitive data is redacted in logs
      const errorLogCall = mockLogger.error.mock.calls[0][1];
      expect(JSON.stringify(errorLogCall)).not.toContain('secret-key-123');
      expect(JSON.stringify(errorLogCall)).toContain('[REDACTED]');
    });
  });

  describe('performance considerations', () => {
    it('should enforce maximum time range limit', async () => {
      // Arrange: Create time range exceeding maximum allowed (e.g., 1 year)
      const excessiveRange: TrendTimeRange = {
        startDate: new Date('2023-01-01T00:00:00Z'),
        endDate: new Date('2024-06-01T00:00:00Z'), // More than 1 year
      };

      const requestWithExcessiveRange = {
        ...mockRequest,
        timeRange: excessiveRange,
      };

      // Act & Assert
      await expect(service.getTrendData(requestWithExcessiveRange)).rejects.toThrow(
        'Time range exceeds maximum allowed period of 365 days'
      );
    });

    it('should enforce minimum data points for aggregation', async () => {
      // Arrange: Request with granularity that would result in too many buckets
      const requestWithHighGranularity: TrendDataRequest = {
        ...mockRequest,
        aggregation: 'hourly',
        timeRange: {
          startDate: new Date('2024-01-01T00:00:00Z'),
          endDate: new Date('2024-01-31T23:59:59Z'), // 31 days = 744 hours
        },
      };

      // Act & Assert
      await expect(service.getTrendData(requestWithHighGranularity)).rejects.toThrow(
        'Requested granularity would generate too many data points'
      );
    });
  });
});