import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { GoogleTrendsService } from './GoogleTrendsService';
import { GoogleTrendsConfig } from '../config/GoogleTrendsConfig';
import { GoogleTrendsRepository } from '../repo/GoogleTrendsRepository';
import { GoogleTrendsResult, TrendDataPoint, TrendRegion } from '../types/GoogleTrendsTypes';
import { StructuredLogger } from '../../logging/StructuredLogger';
import { ValidationError, ExternalServiceError } from '../../errors/AppErrors';

// Mock dependencies
jest.mock('../repo/GoogleTrendsRepository');
jest.mock('../config/GoogleTrendsConfig');
jest.mock('../../logging/StructuredLogger');

describe('GoogleTrendsService', () => {
  let service: GoogleTrendsService;
  let mockRepository: jest.Mocked<GoogleTrendsRepository>;
  let mockLogger: jest.Mocked<StructuredLogger>;
  let mockConfig: GoogleTrendsConfig;

  const mockTrendData: TrendDataPoint[] = [
    { date: '2024-01-01', value: 50 },
    { date: '2024-01-02', value: 75 },
    { date: '2024-01-03', value: 100 },
  ];

  const mockRegions: TrendRegion[] = [
    { regionCode: 'US', regionName: 'United States', value: 100 },
    { regionCode: 'CA', regionName: 'Canada', value: 75 },
  ];

  const mockTrendResult: GoogleTrendsResult = {
    keyword: 'test-keyword',
    timeRange: { startDate: '2024-01-01', endDate: '2024-01-31' },
    dataPoints: mockTrendData,
    regions: mockRegions,
    relatedQueries: ['related-1', 'related-2'],
    fetchedAt: new Date('2024-01-15T10:00:00Z'),
  };

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Setup mock config
    mockConfig = {
      apiKey: 'test-api-key',
      baseUrl: 'https://test-api.google.com',
      timeoutMs: 5000,
      maxRetries: 3,
      cacheEnabled: true,
      cacheTtlSeconds: 3600,
    } as GoogleTrendsConfig;

    // Setup mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<StructuredLogger>;

    // Setup mock repository
    mockRepository = {
      fetchTrends: jest.fn(),
      fetchInterestOverTime: jest.fn(),
      fetchInterestByRegion: jest.fn(),
      fetchRelatedQueries: jest.fn(),
      isHealthy: jest.fn(),
    } as unknown as jest.Mocked<GoogleTrendsRepository>;

    // Create service instance with mocked dependencies
    service = new GoogleTrendsService(mockConfig, mockRepository, mockLogger);
  });

  describe('constructor', () => {
    it('should initialize with provided dependencies', () => {
      const instance = new GoogleTrendsService(mockConfig, mockRepository, mockLogger);
      expect(instance).toBeDefined();
    });

    it('should throw ValidationError when config is undefined', () => {
      expect(() => {
        new GoogleTrendsService(undefined as unknown as GoogleTrendsConfig, mockRepository, mockLogger);
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError when repository is undefined', () => {
      expect(() => {
        new GoogleTrendsService(mockConfig, undefined as unknown as GoogleTrendsRepository, mockLogger);
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError when logger is undefined', () => {
      expect(() => {
        new GoogleTrendsService(mockConfig, mockRepository, undefined as unknown as StructuredLogger);
      }).toThrow(ValidationError);
    });
  });

  describe('getTrends', () => {
    const validKeyword = 'artificial intelligence';
    const validTimeRange = { startDate: '2024-01-01', endDate: '2024-01-31' };

    it('should return trend data for valid keyword and time range', async () => {
      mockRepository.fetchTrends.mockResolvedValue(mockTrendResult);

      const result = await service.getTrends(validKeyword, validTimeRange);

      expect(result).toEqual(mockTrendResult);
      expect(mockRepository.fetchTrends).toHaveBeenCalledWith(
        validKeyword,
        validTimeRange,
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Fetching trends data',
        expect.objectContaining({ keyword: validKeyword })
      );
    });

    it('should throw ValidationError for empty keyword', async () => {
      await expect(service.getTrends('', validTimeRange)).rejects.toThrow(ValidationError);
      expect(mockRepository.fetchTrends).not.toHaveBeenCalled();
    });

    it('should throw ValidationError for keyword exceeding max length', async () => {
      const longKeyword = 'a'.repeat(101);
      await expect(service.getTrends(longKeyword, validTimeRange)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid time range format', async () => {
      const invalidTimeRange = { startDate: 'invalid', endDate: '2024-01-31' };
      await expect(service.getTrends(validKeyword, invalidTimeRange)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when end date is before start date', async () => {
      const invalidTimeRange = { startDate: '2024-01-31', endDate: '2024-01-01' };
      await expect(service.getTrends(validKeyword, invalidTimeRange)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when time range exceeds maximum allowed', async () => {
      const tooLongTimeRange = { startDate: '2023-01-01', endDate: '2024-06-01' };
      await expect(service.getTrends(validKeyword, tooLongTimeRange)).rejects.toThrow(ValidationError);
    });

    it('should handle repository errors and wrap in ExternalServiceError', async () => {
      const repoError = new Error('API timeout');
      mockRepository.fetchTrends.mockRejectedValue(repoError);

      await expect(service.getTrends(validKeyword, validTimeRange)).rejects.toThrow(
        ExternalServiceError
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch trends data',
        expect.objectContaining({ error: repoError.message })
      );
    });

    it('should pass additional options to repository', async () => {
      mockRepository.fetchTrends.mockResolvedValue(mockTrendResult);
      const options = { geo: 'US', category: '0' };

      await service.getTrends(validKeyword, validTimeRange, options);

      expect(mockRepository.fetchTrends).toHaveBeenCalledWith(
        validKeyword,
        validTimeRange,
        expect.objectContaining(options)
      );
    });

    it('should normalize keyword by trimming whitespace', async () => {
      mockRepository.fetchTrends.mockResolvedValue(mockTrendResult);
      const keywordWithWhitespace = '  artificial intelligence  ';

      await service.getTrends(keywordWithWhitespace, validTimeRange);

      expect(mockRepository.fetchTrends).toHaveBeenCalledWith(
        'artificial intelligence',
        validTimeRange,
        expect.any(Object)
      );
    });
  });

  describe('getInterestOverTime', () => {
    const validKeyword = 'machine learning';

    it('should return interest over time data', async () => {
      mockRepository.fetchInterestOverTime.mockResolvedValue(mockTrendData);

      const result = await service.getInterestOverTime(validKeyword);

      expect(result).toEqual(mockTrendData);
      expect(mockRepository.fetchInterestOverTime).toHaveBeenCalledWith(
        validKeyword,
        expect.any(Object)
      );
    });

    it('should use default time range when not specified', async () => {
      mockRepository.fetchInterestOverTime.mockResolvedValue(mockTrendData);

      await service.getInterestOverTime(validKeyword);

      expect(mockRepository.fetchInterestOverTime).toHaveBeenCalledWith(
        validKeyword,
        expect.objectContaining({
          timeRange: expect.any(Object),
        })
      );
    });

    it('should throw ValidationError for invalid keyword', async () => {
      await expect(service.getInterestOverTime('')).rejects.toThrow(ValidationError);
    });

    it('should handle empty data response gracefully', async () => {
      mockRepository.fetchInterestOverTime.mockResolvedValue([]);

      const result = await service.getInterestOverTime(validKeyword);

      expect(result).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Empty interest over time data received',
        expect.any(Object)
      );
    });
  });

  describe('getInterestByRegion', () => {
    const validKeyword = 'cloud computing';

    it('should return regional interest data', async () => {
      mockRepository.fetchInterestByRegion.mockResolvedValue(mockRegions);

      const result = await service.getInterestByRegion(validKeyword);

      expect(result).toEqual(mockRegions);
      expect(mockRepository.fetchInterestByRegion).toHaveBeenCalledWith(
        validKeyword,
        expect.any(Object)
      );
    });

    it('should filter by geo code when provided', async () => {
      mockRepository.fetchInterestByRegion.mockResolvedValue(mockRegions);

      await service.getInterestByRegion(validKeyword, { geo: 'US-CA' });

      expect(mockRepository.fetchInterestByRegion).toHaveBeenCalledWith(
        validKeyword,
        expect.objectContaining({ geo: 'US-CA' })
      );
    });

    it('should throw ValidationError for invalid geo code format', async () => {
      await expect(
        service.getInterestByRegion(validKeyword, { geo: 'INVALID!!!' })
      ).rejects.toThrow(ValidationError);
    });

    it('should sort regions by value in descending order', async () => {
      const unsortedRegions: TrendRegion[] = [
        { regionCode: 'CA', regionName: 'Canada', value: 50 },
        { regionCode: 'US', regionName: 'United States', value: 100 },
        { regionCode: 'UK', regionName: 'United Kingdom', value: 75 },
      ];
      mockRepository.fetchInterestByRegion.mockResolvedValue(unsortedRegions);

      const result = await service.getInterestByRegion(validKeyword);

      expect(result[0].value).toBe(100);
      expect(result[1].value).toBe(75);
      expect(result[2].value).toBe(50);
    });
  });

  describe('getRelatedQueries', () => {
    const validKeyword = 'blockchain';

    it('should return related queries', async () => {
      const relatedQueries = ['cryptocurrency', 'bitcoin', 'ethereum'];
      mockRepository.fetchRelatedQueries.mockResolvedValue(relatedQueries);

      const result = await service.getRelatedQueries(validKeyword);

      expect(result).toEqual(relatedQueries);
    });

    it('should limit results when limit option provided', async () => {
      const manyQueries = Array.from({ length: 20 }, (_, i) => `query-${i}`);
      mockRepository.fetchRelatedQueries.mockResolvedValue(manyQueries);

      const result = await service.getRelatedQueries(validKeyword, { limit: 5 });

      expect(result).toHaveLength(5);
    });

    it('should return empty array when no related queries found', async () => {
      mockRepository.fetchRelatedQueries.mockResolvedValue([]);

      const result = await service.getRelatedQueries(validKeyword);

      expect(result).toEqual([]);
    });

    it('should deduplicate related queries', async () => {
      const duplicateQueries = ['bitcoin', 'bitcoin', 'crypto', 'crypto', 'blockchain'];
      mockRepository.fetchRelatedQueries.mockResolvedValue(duplicateQueries);

      const result = await service.getRelatedQueries(validKeyword);

      expect(result).toEqual(['bitcoin', 'crypto', 'blockchain']);
    });
  });

  describe('compareTrends', () => {
    const keywords = ['ai', 'machine learning', 'deep learning'];

    it('should compare multiple keywords', async () => {
      const mockResults = keywords.map((keyword) => ({
        ...mockTrendResult,
        keyword,
      }));
      mockRepository.fetchTrends.mockImplementation((keyword) =>
        Promise.resolve(mockResults.find((r) => r.keyword === keyword) || mockTrendResult)
      );

      const result = await service.compareTrends(keywords);

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.keyword)).toEqual(keywords);
    });

    it('should throw ValidationError for less than 2 keywords', async () => {
      await expect(service.compareTrends(['single'])).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for more than 5 keywords', async () => {
      const tooManyKeywords = ['a', 'b', 'c', 'd', 'e', 'f'];
      await expect(service.compareTrends(tooManyKeywords)).rejects.toThrow(ValidationError);
    });

    it('should handle partial failures gracefully', async () => {
      mockRepository.fetchTrends
        .mockResolvedValueOnce(mockTrendResult)
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce({ ...mockTrendResult, keyword: 'deep learning' });

      // Should still return successful results and log warning for failed ones
      const result = await service.compareTrends(keywords);

      expect(result.length).toBeLessThan(keywords.length);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should calculate relative comparison metrics', async () => {
      const resultsWithDifferentValues = [
        { ...mockTrendResult, keyword: 'ai', dataPoints: [{ date: '2024-01-01', value: 100 }] },
        { ...mockTrendResult, keyword: 'ml', dataPoints: [{ date: '2024-01-01', value: 50 }] },
      ];
      mockRepository.fetchTrends
        .mockResolvedValueOnce(resultsWithDifferentValues[0])
        .mockResolvedValueOnce(resultsWithDifferentValues[1]);

      const result = await service.compareTrends(['ai', 'ml']);

      expect(result[0].relativeVolume).toBe(100);
      expect(result[1].relativeVolume).toBe(50);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when repository is healthy', async () => {
      mockRepository.isHealthy.mockResolvedValue(true);

      const result = await service.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should return unhealthy status when repository check fails', async () => {
      mockRepository.isHealthy.mockResolvedValue(false);

      const result = await service.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle repository health check errors', async () => {
      mockRepository.isHealthy.mockRejectedValue(new Error('Health check failed'));

      const result = await service.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('Health check failed');
    });
  });

  describe('cache management', () => {
    it('should use cache when enabled and data is fresh', async () => {
      mockRepository.fetchTrends.mockResolvedValue(mockTrendResult);

      // First call - should hit repository
      await service.getTrends('cached-keyword', { startDate: '2024-01-01', endDate: '2024-01-31' });
      expect(mockRepository.fetchTrends).toHaveBeenCalledTimes(1);

      // Second call with same parameters - should use cache
      await service.getTrends('cached-keyword', { startDate: '2024-01-01', endDate: '2024-01-31' });
      expect(mockRepository.fetchTrends).toHaveBeenCalledTimes(1); // Still 1, cache hit
    });

    it('should bypass cache when cacheEnabled is false', async () => {
      const noCacheConfig = { ...mockConfig, cacheEnabled: false };
      const noCacheService = new GoogleTrendsService(noCacheConfig, mockRepository, mockLogger);

      mockRepository.fetchTrends.mockResolvedValue(mockTrendResult);

      await noCacheService.getTrends('keyword', { startDate: '2024-01-01', endDate: '2024-01-31' });
      await noCacheService.getTrends('keyword', { startDate: '2024-01-01', endDate: '2024-01-31' });

      expect(mockRepository.fetchTrends).toHaveBeenCalledTimes(2);
    });

    it('should invalidate cache for specific keyword', async () => {
      mockRepository.fetchTrends.mockResolvedValue(mockTrendResult);

      await service.getTrends('invalidate-me', { startDate: '2024-01-01', endDate: '2024-01-31' });
      service.invalidateCache('invalidate-me');
      await service.getTrends('invalidate-me', { startDate: '2024-01-01', endDate: '2024-01-31' });

      expect(mockRepository.fetchTrends).toHaveBeenCalledTimes(2);
    });
  });

  describe('rate limiting', () => {
    it('should respect rate limit between requests', async () => {
      mockRepository.fetchTrends.mockResolvedValue(mockTrendResult);

      const startTime = Date.now();
      await service.getTrends('first', { startDate: '2024-01-01', endDate: '2024-01-31' });
      await service.getTrends('second', { startDate: '2024-01-01', endDate: '2024-01-31' });
      const elapsedTime = Date.now() - startTime;

      // Should have some delay between requests
      expect(elapsedTime).toBeGreaterThanOrEqual(100);
    });

    it('should queue requests when rate limit is reached', async () => {
      mockRepository.fetchTrends.mockResolvedValue(mockTrendResult);

      // Fire multiple requests simultaneously
      const promises = Array.from({ length: 5 }, (_, i) =>
        service.getTrends(`keyword-${i}`, { startDate: '2024-01-01', endDate: '2024-01-31' })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      expect(mockRepository.fetchTrends).toHaveBeenCalledTimes(5);
    });
  });

  describe('error recovery', () => {
    it('should retry on transient failures', async () => {
      mockRepository.fetchTrends
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce(mockTrendResult);

      const result = await service.getTrends('retry-test', {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(result).toEqual(mockTrendResult);
      expect(mockRepository.fetchTrends).toHaveBeenCalledTimes(3);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Retrying request',
        expect.objectContaining({ attempt: expect.any(Number) })
      );
    });

    it('should fail after max retries exceeded', async () => {
      mockRepository.fetchTrends.mockRejectedValue(new Error('Persistent failure'));

      await expect(
        service.getTrends('fail-test', { startDate: '2024-01-01', endDate: '2024-01-31' })
      ).rejects.toThrow(ExternalServiceError);

      expect(mockRepository.fetchTrends).toHaveBeenCalledTimes(mockConfig.maxRetries);
    });

    it('should not retry on validation errors', async () => {
      // Simulate a validation error from repository
      const validationError = new ValidationError('Invalid parameter');
      mockRepository.fetchTrends.mockRejectedValue(validationError);

      await expect(
        service.getTrends('validation-error', { startDate: '2024-01-01', endDate: '2024-01-31' })
      ).rejects.toThrow(ValidationError);

      // Should not retry validation errors
      expect(mockRepository.fetchTrends).toHaveBeenCalledTimes(1);
    });
  });
});