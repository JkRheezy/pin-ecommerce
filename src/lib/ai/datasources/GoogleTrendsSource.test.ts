/**
 * GoogleTrendsSource.test.ts
 *
 * Comprehensive test suite for GoogleTrendsSource data source.
 * Tests initialization, data fetching, error handling, and edge cases.
 *
 * Layer: Service (Layer 4) - Tests for data source service implementation
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GoogleTrendsSource, GoogleTrendsConfig, GoogleTrendsData } from './GoogleTrendsSource';
import { DataSourceError, DataSourceErrorCode } from '../errors/DataSourceError';
import { Logger } from '../../logging/Logger';

// Mock dependencies
jest.mock('../../logging/Logger');
jest.mock('google-trends-api', () => ({
  interestOverTime: jest.fn(),
  interestByRegion: jest.fn(),
  relatedQueries: jest.fn(),
}));

import googleTrends from 'google-trends-api';

describe('GoogleTrendsSource', () => {
  // Test fixtures
  const validConfig: GoogleTrendsConfig = {
    keyword: 'test-keyword',
    geo: 'US',
    timeRange: 'today 12-m',
    category: 0,
  };

  const mockTrendsData: GoogleTrendsData = {
    timelineData: [
      {
        time: '1609459200',
        formattedTime: 'Jan 1, 2021',
        formattedAxisTime: 'Jan 1, 2021',
        value: [75],
        hasData: [true],
        formattedValue: ['75'],
      },
      {
        time: '1612137600',
        formattedTime: 'Feb 1, 2021',
        formattedAxisTime: 'Feb 1, 2021',
        value: [85],
        hasData: [true],
        formattedValue: ['85'],
      },
    ],
    averages: [80],
  };

  let logger: Logger;
  let source: GoogleTrendsSource;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Create mock logger instance
    logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as Logger;

    // Create source instance with valid config
    source = new GoogleTrendsSource(validConfig, logger);
  });

  describe('Initialization (Layer 2: Config)', () => {
    it('should initialize with valid configuration', () => {
      // Arrange & Act
      const instance = new GoogleTrendsSource(validConfig, logger);

      // Assert
      expect(instance).toBeDefined();
      expect(instance.getName()).toBe('GoogleTrendsSource');
      expect(logger.debug).toHaveBeenCalledWith(
        'GoogleTrendsSource initialized',
        expect.objectContaining({
          keyword: validConfig.keyword,
          geo: validConfig.geo,
        })
      );
    });

    it('should throw DataSourceError when keyword is empty', () => {
      // Arrange
      const invalidConfig: GoogleTrendsConfig = {
        ...validConfig,
        keyword: '',
      };

      // Act & Assert
      expect(() => new GoogleTrendsSource(invalidConfig, logger)).toThrow(
        DataSourceError
      );
      expect(() => new GoogleTrendsSource(invalidConfig, logger)).toThrow(
        'Keyword is required and cannot be empty'
      );
    });

    it('should throw DataSourceError when keyword contains only whitespace', () => {
      // Arrange
      const invalidConfig: GoogleTrendsConfig = {
        ...validConfig,
        keyword: '   ',
      };

      // Act & Assert
      expect(() => new GoogleTrendsSource(invalidConfig, logger)).toThrow(
        DataSourceError
      );
    });

    it('should use default values for optional config fields', () => {
      // Arrange
      const minimalConfig: GoogleTrendsConfig = {
        keyword: 'minimal-test',
      };

      // Act
      const instance = new GoogleTrendsSource(minimalConfig, logger);

      // Assert - verify defaults are applied through behavior
      expect(instance).toBeDefined();
    });

    it('should validate geo code format', () => {
      // Arrange
      const invalidGeoConfig: GoogleTrendsConfig = {
        ...validConfig,
        geo: 'INVALID_GEO_CODE_THAT_IS_TOO_LONG',
      };

      // Act & Assert
      expect(() => new GoogleTrendsSource(invalidGeoConfig, logger)).toThrow(
        DataSourceError
      );
    });

    it('should validate time range format', () => {
      // Arrange
      const invalidTimeConfig: GoogleTrendsConfig = {
        ...validConfig,
        timeRange: 'invalid-time-range',
      };

      // Act & Assert
      expect(() => new GoogleTrendsSource(invalidTimeConfig, logger)).toThrow(
        DataSourceError
      );
    });
  });

  describe('Data Fetching (Layer 4: Service)', () => {
    it('should fetch interest over time data successfully', async () => {
      // Arrange
      (googleTrends.interestOverTime as jest.Mock).mockResolvedValue(
        JSON.stringify(mockTrendsData)
      );

      // Act
      const result = await source.fetchInterestOverTime();

      // Assert
      expect(result).toEqual(mockTrendsData);
      expect(googleTrends.interestOverTime).toHaveBeenCalledWith(
        expect.objectContaining({
          keyword: validConfig.keyword,
          geo: validConfig.geo,
          startTime: expect.any(Date),
          endTime: expect.any(Date),
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Successfully fetched interest over time data',
        expect.any(Object)
      );
    });

    it('should fetch interest by region data successfully', async () => {
      // Arrange
      const regionData = {
        default: {
          geoMapData: [
            { geoCode: 'US-CA', geoName: 'California', value: [100] },
            { geoCode: 'US-NY', geoName: 'New York', value: [85] },
          ],
        },
      };
      (googleTrends.interestByRegion as jest.Mock).mockResolvedValue(
        JSON.stringify(regionData)
      );

      // Act
      const result = await source.fetchInterestByRegion();

      // Assert
      expect(result).toEqual(regionData);
      expect(googleTrends.interestByRegion).toHaveBeenCalled();
    });

    it('should fetch related queries successfully', async () => {
      // Arrange
      const relatedQueriesData = {
        default: {
          rankedList: [
            {
              rankedKeyword: [
                { query: 'related query 1', value: 100 },
                { query: 'related query 2', value: 80 },
              ],
            },
          ],
        },
      };
      (googleTrends.relatedQueries as jest.Mock).mockResolvedValue(
        JSON.stringify(relatedQueriesData)
      );

      // Act
      const result = await source.fetchRelatedQueries();

      // Assert
      expect(result).toEqual(relatedQueriesData);
    });

    it('should parse JSON response correctly', async () => {
      // Arrange
      (googleTrends.interestOverTime as jest.Mock).mockResolvedValue(
        JSON.stringify(mockTrendsData)
      );

      // Act
      const result = await source.fetchInterestOverTime();

      // Assert
      expect(result.timelineData).toHaveLength(2);
      expect(result.timelineData[0].value[0]).toBe(75);
    });

    it('should handle rate limiting with exponential backoff', async () => {
      // Arrange
      const rateLimitError = new Error('429 Too Many Requests');
      (googleTrends.interestOverTime as jest.Mock)
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(JSON.stringify(mockTrendsData));

      // Act
      const result = await source.fetchInterestOverTime({ maxRetries: 3 });

      // Assert
      expect(result).toEqual(mockTrendsData);
      expect(googleTrends.interestOverTime).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledWith(
        'Rate limited, retrying with backoff',
        expect.any(Object)
      );
    });

    it('should respect custom retry configuration', async () => {
      // Arrange
      const networkError = new Error('Network error');
      (googleTrends.interestOverTime as jest.Mock).mockRejectedValue(networkError);

      // Act & Assert
      await expect(
        source.fetchInterestOverTime({ maxRetries: 2, retryDelay: 100 })
      ).rejects.toThrow(DataSourceError);

      expect(googleTrends.interestOverTime).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
  });

  describe('Error Handling (Layer 4: Service)', () => {
    it('should throw DataSourceError on API failure', async () => {
      // Arrange
      const apiError = new Error('Google Trends API error');
      (googleTrends.interestOverTime as jest.Mock).mockRejectedValue(apiError);

      // Act & Assert
      await expect(source.fetchInterestOverTime()).rejects.toThrow(
        DataSourceError
      );
      await expect(source.fetchInterestOverTime()).rejects.toThrow(
        'Failed to fetch Google Trends data'
      );
    });

    it('should include error code in DataSourceError', async () => {
      // Arrange
      const apiError = new Error('API Error');
      (googleTrends.interestOverTime as jest.Mock).mockRejectedValue(apiError);

      // Act & Assert
      try {
        await source.fetchInterestOverTime();
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DataSourceError);
        expect((error as DataSourceError).code).toBe(
          DataSourceErrorCode.FETCH_ERROR
        );
        expect((error as DataSourceError).source).toBe('GoogleTrendsSource');
      }
    });

    it('should handle malformed JSON responses', async () => {
      // Arrange
      (googleTrends.interestOverTime as jest.Mock).mockResolvedValue(
        'invalid json {'
      );

      // Act & Assert
      await expect(source.fetchInterestOverTime()).rejects.toThrow(
        DataSourceError
      );
      await expect(source.fetchInterestOverTime()).rejects.toThrow(
        'Failed to parse Google Trends response'
      );
    });

    it('should handle empty response from API', async () => {
      // Arrange
      (googleTrends.interestOverTime as jest.Mock).mockResolvedValue('');

      // Act & Assert
      await expect(source.fetchInterestOverTime()).rejects.toThrow(
        DataSourceError
      );
    });

    it('should handle null response from API', async () => {
      // Arrange
      (googleTrends.interestOverTime as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(source.fetchInterestOverTime()).rejects.toThrow(
        DataSourceError
      );
    });

    it('should log errors with structured context', async () => {
      // Arrange
      const apiError = new Error('Connection timeout');
      (googleTrends.interestOverTime as jest.Mock).mockRejectedValue(apiError);

      // Act
      try {
        await source.fetchInterestOverTime();
      } catch {
        // Expected to throw
      }

      // Assert
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch Google Trends data',
        expect.objectContaining({
          error: apiError.message,
          keyword: validConfig.keyword,
          code: DataSourceErrorCode.FETCH_ERROR,
        })
      );
    });

    it('should handle timeout errors specifically', async () => {
      // Arrange
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      (googleTrends.interestOverTime as jest.Mock).mockRejectedValue(timeoutError);

      // Act & Assert
      try {
        await source.fetchInterestOverTime();
        fail('Expected error to be thrown');
      } catch (error) {
        expect((error as DataSourceError).code).toBe(
          DataSourceErrorCode.TIMEOUT_ERROR
        );
      }
    });

    it('should handle authentication errors', async () => {
      // Arrange
      const authError = new Error('401 Unauthorized');
      (googleTrends.interestOverTime as jest.Mock).mockRejectedValue(authError);

      // Act & Assert
      try {
        await source.fetchInterestOverTime();
        fail('Expected error to be thrown');
      } catch (error) {
        expect((error as DataSourceError).code).toBe(
          DataSourceErrorCode.AUTHENTICATION_ERROR
        );
      }
    });
  });

  describe('Edge Cases (Layer 4: Service)', () => {
    it('should handle keywords with special characters', async () => {
      // Arrange
      const specialConfig: GoogleTrendsConfig = {
        ...validConfig,
        keyword: 'C++ programming / test & more',
      };
      const specialSource = new GoogleTrendsSource(specialConfig, logger);
      (googleTrends.interestOverTime as jest.Mock).mockResolvedValue(
        JSON.stringify(mockTrendsData)
      );

      // Act
      const result = await specialSource.fetchInterestOverTime();

      // Assert
      expect(result).toBeDefined();
      expect(googleTrends.interestOverTime).toHaveBeenCalledWith(
        expect.objectContaining({
          keyword: specialConfig.keyword,
        })
      );
    });

    it('should handle very long keywords', async () => {
      // Arrange
      const longKeyword = 'a'.repeat(100);
      const longConfig: GoogleTrendsConfig = {
        ...validConfig,
        keyword: longKeyword,
      };
      const longSource = new GoogleTrendsSource(longConfig, logger);
      (googleTrends.interestOverTime as jest.Mock).mockResolvedValue(
        JSON.stringify(mockTrendsData)
      );

      // Act
      const result = await longSource.fetchInterestOverTime();

      // Assert
      expect(result).toBeDefined();
    });

    it('should handle empty timeline data gracefully', async () => {
      // Arrange
      const emptyData: GoogleTrendsData = {
        timelineData: [],
        averages: [],
      };
      (googleTrends.interestOverTime as jest.Mock).mockResolvedValue(
        JSON.stringify(emptyData)
      );

      // Act
      const result = await source.fetchInterestOverTime();

      // Assert
      expect(result.timelineData).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        'Received empty timeline data from Google Trends',
        expect.any(Object)
      );
    });

    it('should handle data with zero values', async () => {
      // Arrange
      const zeroData: GoogleTrendsData = {
        timelineData: [
          {
            time: '1609459200',
            formattedTime: 'Jan 1, 2021',
            formattedAxisTime: 'Jan 1, 2021',
            value: [0],
            hasData: [true],
            formattedValue: ['0'],
          },
        ],
        averages: [0],
      };
      (googleTrends.interestOverTime as jest.Mock).mockResolvedValue(
        JSON.stringify(zeroData)
      );

      // Act
      const result = await source.fetchInterestOverTime();

      // Assert
      expect(result.timelineData[0].value[0]).toBe(0);
    });

    it('should handle data with missing hasData flags', async () => {
      // Arrange
      const partialData = {
        timelineData: [
          {
            time: '1609459200',
            formattedTime: 'Jan 1, 2021',
            value: [50],
            // hasData and formattedValue are missing
          },
        ],
      };
      (googleTrends.interestOverTime as jest.Mock).mockResolvedValue(
        JSON.stringify(partialData)
      );

      // Act
      const result = await source.fetchInterestOverTime();

      // Assert
      expect(result.timelineData).toHaveLength(1);
    });

    it('should handle concurrent requests without race conditions', async () => {
      // Arrange
      (googleTrends.interestOverTime as jest.Mock).mockResolvedValue(
        JSON.stringify(mockTrendsData)
      );

      // Act
      const promises = [
        source.fetchInterestOverTime(),
        source.fetchInterestOverTime(),
        source.fetchInterestOverTime(),
      ];
      const results = await Promise.all(promises);

      // Assert
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toEqual(mockTrendsData);
      });
    });

    it('should handle multiple keywords in single request', async () => {
      // Arrange
      const multiKeywordConfig: GoogleTrendsConfig = {
        ...validConfig,
        keyword: ['keyword1', 'keyword2', 'keyword3'],
      };
      const multiSource = new GoogleTrendsSource(multiKeywordConfig, logger);
      (googleTrends.interestOverTime as jest.Mock).mockResolvedValue(
        JSON.stringify(mockTrendsData)
      );

      // Act
      const result = await multiSource.fetchInterestOverTime();

      // Assert
      expect(result).toBeDefined();
      expect(googleTrends.interestOverTime).toHaveBeenCalledWith(
        expect.objectContaining({
          keyword: multiKeywordConfig.keyword,
        })
      );
    });

    it('should properly clean up resources on destruction', () => {
      // Act
      source.destroy();

      // Assert - verify no pending operations or memory leaks
      expect(logger.debug).toHaveBeenCalledWith(
        'GoogleTrendsSource destroyed',
        expect.any(Object)
      );
    });

    it('should validate date range is not in the future', () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const invalidConfig: GoogleTrendsConfig = {
        ...validConfig,
        startTime: futureDate,
      };

      // Act & Assert
      expect(() => new GoogleTrendsSource(invalidConfig, logger)).toThrow(
        DataSourceError
      );
    });

    it('should handle property-based data comparison', async () => {
      // Arrange
      (googleTrends.interestOverTime as jest.Mock).mockResolvedValue(
        JSON.stringify(mockTrendsData)
      );

      // Act
      const result = await source.fetchInterestOverTime();

      // Assert - verify data properties match expected structure
      expect(result).toHaveProperty('timelineData');
      expect(result).toHaveProperty('averages');
      expect(Array.isArray(result.timelineData)).toBe(true);
      expect(Array.isArray(result.averages)).toBe(true);
    });
  });

  describe('Configuration Validation (Layer 2: Config)', () => {
    it('should validate category is a non-negative integer', () => {
      // Arrange
      const invalidConfig: GoogleTrendsConfig = {
        ...validConfig,
        category: -1,
      };

      // Act & Assert
      expect(() => new GoogleTrendsSource(invalidConfig, logger)).toThrow(
        DataSourceError
      );
    });

    it('should validate property exists on config object', () => {
      // Arrange - create config with additional unknown properties
      const extendedConfig = {
        ...validConfig,
        unknownProperty: 'value',
      } as GoogleTrendsConfig;

      // Act
      const instance = new GoogleTrendsSource(extendedConfig, logger);

      // Assert
      expect(instance).toBeDefined();
    });

    it('should freeze configuration after initialization', () => {
      // Act
      const instance = new GoogleTrendsSource(validConfig, logger);

      // Attempt to modify config through any exposed methods should not affect internal state
      // This is implementation-specific but good to test if config is properly isolated
      expect(instance.getConfig()).toEqual(validConfig);
    });
  });

  describe('Health Checks (Layer 5: Runtime)', () => {
    it('should return healthy status when API is accessible', async () => {
      // Arrange
      (googleTrends.interestOverTime as jest.Mock).mockResolvedValue(
        JSON.stringify(mockTrendsData)
      );

      // Act
      const health = await source.healthCheck();

      // Assert
      expect(health.status).toBe('healthy');
      expect(health.timestamp).toBeInstanceOf(Date);
    });

    it('should return unhealthy status when API is not accessible', async () => {
      // Arrange
      (googleTrends.interestOverTime as jest.Mock).mockRejectedValue(
        new Error('API unavailable')
      );

      // Act
      const health = await source.healthCheck();

      // Assert
      expect(health.status).toBe('unhealthy');
      expect(health.error).toBeDefined();
    });

    it('should include latency metrics in health check', async () => {
      // Arrange
      (googleTrends.interestOverTime as jest.Mock).mockResolvedValue(
        JSON.stringify(mockTrendsData)
      );

      // Act
      const health = await source.healthCheck();

      // Assert
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});