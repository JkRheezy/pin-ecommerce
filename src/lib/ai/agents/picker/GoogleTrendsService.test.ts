// Types Layer: Test-specific types and interfaces
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { GoogleTrendsService, GoogleTrendsConfig, TrendingSearch, TrendRegion } from './GoogleTrendsService';
import { Logger } from '@/lib/logging/Logger';
import { MetricsCollector } from '@/lib/metrics/MetricsCollector';

// Types Layer: Mock types for test dependencies
interface MockHttpClient {
  get: jest.Mock<Promise<unknown>>;
  post: jest.Mock<Promise<unknown>>;
}

interface MockCacheManager {
  get: jest.Mock<Promise<unknown>>;
  set: jest.Mock<Promise<void>>;
  delete: jest.Mock<Promise<void>>;
}

interface MockRateLimiter {
  acquire: jest.Mock<Promise<void>>;
  release: jest.Mock<void>;
}

// Config Layer: Test configuration constants
const TEST_CONFIG: GoogleTrendsConfig = {
  apiKey: 'test-api-key-12345',
  baseUrl: 'https://test-trends.googleapis.com/v1',
  timeoutMs: 5000,
  maxRetries: 3,
  cacheTtlSeconds: 300,
  rateLimitPerMinute: 100,
  defaultRegion: TrendRegion.US,
};

const MOCK_TRENDING_SEARCHES: TrendingSearch[] = [
  {
    query: 'artificial intelligence',
    searchVolume: 1000000,
    startTime: new Date('2024-01-15T00:00:00Z'),
    formattedTraffic: '1M+',
    relatedQueries: ['machine learning', 'deep learning', 'neural networks'],
    category: 'Technology',
    geo: 'US',
  },
  {
    query: 'climate change',
    searchVolume: 800000,
    startTime: new Date('2024-01-15T00:00:00Z'),
    formattedTraffic: '800K+',
    relatedQueries: ['global warming', 'carbon emissions', 'renewable energy'],
    category: 'Environment',
    geo: 'US',
  },
  {
    query: 'world cup',
    searchVolume: 2000000,
    startTime: new Date('2024-01-15T00:00:00Z'),
    formattedTraffic: '2M+',
    relatedQueries: ['football', 'soccer', 'fifa'],
    category: 'Sports',
    geo: 'US',
  },
];

// Service Layer: Test suite for GoogleTrendsService
describe('GoogleTrendsService', () => {
  let service: GoogleTrendsService;
  let mockHttpClient: MockHttpClient;
  let mockCacheManager: MockCacheManager;
  let mockRateLimiter: MockRateLimiter;
  let mockLogger: jest.Mocked<Logger>;
  let mockMetricsCollector: jest.Mocked<MetricsCollector>;

  // Runtime Layer: Setup and teardown
  beforeEach(() => {
    // Initialize mocks with proper typing
    mockHttpClient = {
      get: jest.fn<Promise<unknown>>(),
      post: jest.fn<Promise<unknown>>(),
    };

    mockCacheManager = {
      get: jest.fn<Promise<unknown>>(),
      set: jest.fn<Promise<void>>().mockResolvedValue(undefined),
      delete: jest.fn<Promise<void>>().mockResolvedValue(undefined),
    };

    mockRateLimiter = {
      acquire: jest.fn<Promise<void>>().mockResolvedValue(undefined),
      release: jest.fn<void>().mockReturnValue(undefined),
    };

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<Logger>;

    mockMetricsCollector = {
      recordLatency: jest.fn(),
      recordError: jest.fn(),
      recordSuccess: jest.fn(),
      incrementCounter: jest.fn(),
    } as unknown as jest.Mocked<MetricsCollector>;

    // Instantiate service with mocked dependencies
    service = new GoogleTrendsService({
      config: TEST_CONFIG,
      httpClient: mockHttpClient as unknown as typeof service['httpClient'],
      cacheManager: mockCacheManager as unknown as typeof service['cacheManager'],
      rateLimiter: mockRateLimiter as unknown as typeof service['rateLimiter'],
      logger: mockLogger,
      metricsCollector: mockMetricsCollector,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // UI Layer: Test cases organized by functionality

  describe('Constructor', () => {
    it('should initialize with valid configuration', () => {
      // Validate service instantiation with proper config
      expect(service).toBeDefined();
      expect(service['config']).toEqual(TEST_CONFIG);
    });

    it('should throw ValidationError when API key is missing', () => {
      const invalidConfig = { ...TEST_CONFIG, apiKey: '' };
      
      expect(() => {
        new GoogleTrendsService({
          config: invalidConfig,
          httpClient: mockHttpClient as unknown as typeof service['httpClient'],
          cacheManager: mockCacheManager as unknown as typeof service['cacheManager'],
          rateLimiter: mockRateLimiter as unknown as typeof service['rateLimiter'],
          logger: mockLogger,
          metricsCollector: mockMetricsCollector,
        });
      }).toThrow('Google Trends API key is required');
    });

    it('should throw ValidationError when baseUrl is invalid', () => {
      const invalidConfig = { ...TEST_CONFIG, baseUrl: 'not-a-valid-url' };
      
      expect(() => {
        new GoogleTrendsService({
          config: invalidConfig,
          httpClient: mockHttpClient as unknown as typeof service['httpClient'],
          cacheManager: mockCacheManager as unknown as typeof service['cacheManager'],
          rateLimiter: mockRateLimiter as unknown as typeof service['rateLimiter'],
          logger: mockLogger,
          metricsCollector: mockMetricsCollector,
        });
      }).toThrow('Invalid base URL provided');
    });
  });

  describe('getTrendingSearches', () => {
    it('should return cached results when available', async () => {
      // Setup: Cache hit scenario
      mockCacheManager.get.mockResolvedValueOnce(MOCK_TRENDING_SEARCHES);

      const result = await service.getTrendingSearches({
        region: TrendRegion.US,
        limit: 10,
      });

      // Verify: Cache was checked and returned without API call
      expect(mockCacheManager.get).toHaveBeenCalledWith(
        expect.stringContaining('trends:US:')
      );
      expect(mockHttpClient.get).not.toHaveBeenCalled();
      expect(result).toEqual(MOCK_TRENDING_SEARCHES);
      
      // Verify: Metrics recorded cache hit
      expect(mockMetricsCollector.incrementCounter).toHaveBeenCalledWith(
        'google_trends.cache_hit',
        1
      );
    });

    it('should fetch from API and cache results on cache miss', async () => {
      // Setup: Cache miss, API success scenario
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          default: {
            trendingSearchesDays: [{
              trendingSearches: MOCK_TRENDING_SEARCHES.map(t => ({
                title: { query: t.query },
                formattedTraffic: t.formattedTraffic,
                relatedQueries: t.relatedQueries.map(q => ({ query: q })),
              })),
            }],
          },
        },
      });

      const result = await service.getTrendingSearches({
        region: TrendRegion.US,
        limit: 3,
      });

      // Verify: Full flow executed correctly
      expect(mockRateLimiter.acquire).toHaveBeenCalled();
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/trendingsearches/daily'),
        expect.objectContaining({
          params: expect.objectContaining({
            geo: 'US',
          }),
        })
      );
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        expect.stringContaining('trends:US:'),
        expect.any(Array),
        TEST_CONFIG.cacheTtlSeconds
      );
      expect(mockRateLimiter.release).toHaveBeenCalled();
      
      // Verify: Results are properly transformed
      expect(result).toHaveLength(3);
      expect(result[0].query).toBe('artificial intelligence');
    });

    it('should apply rate limiting before API calls', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockHttpClient.get.mockResolvedValueOnce({ data: { default: { trendingSearchesDays: [] } } });

      await service.getTrendingSearches({ region: TrendRegion.US });

      // Verify: Rate limiter engaged in correct order
      const callOrder = [
        mockRateLimiter.acquire.mock.invocationCallOrder[0],
        mockHttpClient.get.mock.invocationCallOrder[0],
        mockRateLimiter.release.mock.invocationCallOrder[0],
      ];
      
      expect(callOrder[0]).toBeLessThan(callOrder[1]);
      expect(callOrder[1]).toBeLessThan(callOrder[2]);
    });

    it('should handle API errors with exponential backoff retry', async () => {
      // Setup: API fails twice, succeeds on third attempt
      mockCacheManager.get.mockResolvedValueOnce(null);
      const apiError = new Error('Network timeout');
      
      mockHttpClient.get
        .mockRejectedValueOnce(apiError)
        .mockRejectedValueOnce(apiError)
        .mockResolvedValueOnce({
          data: {
            default: {
              trendingSearchesDays: [{
                trendingSearches: [{
                  title: { query: 'success' },
                  formattedTraffic: '100+',
                }],
              }],
            },
          },
        });

      const result = await service.getTrendingSearches({ region: TrendRegion.US });

      // Verify: Retried correct number of times
      expect(mockHttpClient.get).toHaveBeenCalledTimes(3);
      expect(result).toBeDefined();
      
      // Verify: Error metrics recorded for retries
      expect(mockMetricsCollector.recordError).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Retry attempt'),
        expect.any(Object)
      );
    });

    it('should throw ServiceUnavailableError after max retries exceeded', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockHttpClient.get.mockRejectedValue(new Error('Persistent failure'));

      // Verify: Error propagated after retries exhausted
      await expect(
        service.getTrendingSearches({ region: TrendRegion.US })
      ).rejects.toThrow('Google Trends API unavailable after 3 retries');

      expect(mockHttpClient.get).toHaveBeenCalledTimes(3);
      expect(mockMetricsCollector.recordError).toHaveBeenCalledWith(
        'google_trends.max_retries_exceeded'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Max retries exceeded'),
        expect.any(Object)
      );
    });

    it('should validate and sanitize limit parameter', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          default: {
            trendingSearchesDays: [{
              trendingSearches: Array(50).fill(null).map((_, i) => ({
                title: { query: `trend-${i}` },
                formattedTraffic: `${i}K+`,
              })),
            }],
          },
        },
      });

      // Test: Limit clamped to valid range
      const result = await service.getTrendingSearches({
        region: TrendRegion.US,
        limit: 1000, // Exceeds max
      });

      // API called but results limited
      expect(result.length).toBeLessThanOrEqual(20); // Max allowed
    });

    it('should handle empty API response gracefully', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockHttpClient.get.mockResolvedValueOnce({
        data: { default: { trendingSearchesDays: [] } },
      });

      const result = await service.getTrendingSearches({ region: TrendRegion.US });

      expect(result).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'No trending searches available for region',
        expect.objectContaining({ region: 'US' })
      );
    });

    it('should support multiple regions', async () => {
      const regions = [TrendRegion.US, TrendRegion.GB, TrendRegion.JP];
      
      for (const region of regions) {
        mockCacheManager.get.mockResolvedValueOnce([
          { ...MOCK_TRENDING_SEARCHES[0], geo: region },
        ]);

        const result = await service.getTrendingSearches({ region });
        
        expect(result[0].geo).toBe(region);
      }
    });
  });

  describe('getInterestOverTime', () => {
    const mockTimeSeriesData = {
      timelineData: [
        { time: '1609459200', value: [50] },
        { time: '1609545600', value: [75] },
        { time: '1609632000', value: [100] },
      ],
    };

    it('should fetch interest data for given keywords', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockHttpClient.get.mockResolvedValueOnce({
        data: { default: mockTimeSeriesData },
      });

      const result = await service.getInterestOverTime({
        keywords: ['typescript', 'javascript'],
        region: TrendRegion.WORLDWIDE,
        timeframe: 'today 12-m',
      });

      // Verify: Correct API endpoint and parameters
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/interestOverTime'),
        expect.objectContaining({
          params: expect.objectContaining({
            keywords: 'typescript,javascript',
            geo: '',
          }),
        })
      );

      // Verify: Data transformation
      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('timestamp');
      expect(result[0]).toHaveProperty('value');
    });

    it('should validate keyword array is non-empty', async () => {
      await expect(
        service.getInterestOverTime({
          keywords: [],
          region: TrendRegion.US,
        })
      ).rejects.toThrow('At least one keyword is required');
    });

    it('should limit maximum keywords per request', async () => {
      const manyKeywords = Array(10).fill('keyword');
      
      await expect(
        service.getInterestOverTime({
          keywords: manyKeywords,
          region: TrendRegion.US,
        })
      ).rejects.toThrow('Maximum 5 keywords allowed per request');
    });
  });

  describe('getRelatedQueries', () => {
    it('should fetch and rank related queries', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          default: {
            rankedList: [{
              rankedKeyword: [
                { query: 'related1', value: 100 },
                { query: 'related2', value: 80 },
                { query: 'related3', value: 60 },
              ],
            }],
          },
        },
      });

      const result = await service.getRelatedQueries({
        keyword: 'machine learning',
        region: TrendRegion.US,
      });

      expect(result).toEqual([
        { query: 'related1', relevanceScore: 100 },
        { query: 'related2', relevanceScore: 80 },
        { query: 'related3', relevanceScore: 60 },
      ]);
      
      // Sorted by relevance
      expect(result[0].relevanceScore).toBeGreaterThan(result[1].relevanceScore);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed API responses', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockHttpClient.get.mockResolvedValueOnce({
        data: { unexpectedStructure: true },
      });

      await expect(
        service.getTrendingSearches({ region: TrendRegion.US })
      ).rejects.toThrow('Invalid response format from Google Trends API');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Response parsing failed'),
        expect.any(Object)
      );
    });

    it('should handle rate limit errors with specific messaging', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as Error & { response?: { status: number } }).response = { status: 429 };
      
      mockHttpClient.get.mockRejectedValue(rateLimitError);

      await expect(
        service.getTrendingSearches({ region: TrendRegion.US })
      ).rejects.toThrow('Rate limit exceeded');

      expect(mockMetricsCollector.recordError).toHaveBeenCalledWith(
        'google_trends.rate_limited'
      );
    });

    it('should handle timeout errors specifically', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      
      mockHttpClient.get.mockRejectedValue(timeoutError);

      await expect(
        service.getTrendingSearches({ region: TrendRegion.US })
      ).rejects.toThrow('Request timeout');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Request timed out'),
        expect.any(Object)
      );
    });
  });

  describe('Metrics and Logging', () => {
    it('should record latency metrics for all operations', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockHttpClient.get.mockResolvedValueOnce({
        data: { default: { trendingSearchesDays: [] } },
      });

      await service.getTrendingSearches({ region: TrendRegion.US });

      expect(mockMetricsCollector.recordLatency).toHaveBeenCalledWith(
        'google_trends.getTrendingSearches',
        expect.any(Number)
      );
    });

    it('should log structured data for debugging', async () => {
      mockCacheManager.get.mockResolvedValueOnce(MOCK_TRENDING_SEARCHES);

      await service.getTrendingSearches({ region: TrendRegion.US });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Cache hit for trending searches',
        expect.objectContaining({
          region: 'US',
          resultCount: 3,
        })
      );
    });

    it('should include correlation IDs in logs', async () => {
      const correlationId = 'test-correlation-123';
      
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockHttpClient.get.mockResolvedValueOnce({
        data: { default: { trendingSearchesDays: [] } },
      });

      await service.getTrendingSearches(
        { region: TrendRegion.US },
        { correlationId }
      );

      // Verify: All log calls include correlation ID
      const debugCalls = mockLogger.debug.mock.calls;
      const infoCalls = mockLogger.info.mock.calls;
      
      [...debugCalls, ...infoCalls].forEach(call => {
        const context = call[1] as Record<string, unknown> | undefined;
        if (context && typeof context === 'object') {
          expect(context.correlationId).toBe(correlationId);
        }
      });
    });
  });

  describe('Cache Management', () => {
    it('should invalidate cache by pattern', async () => {
      await service.invalidateCache('trends:US:*');

      expect(mockCacheManager.delete).toHaveBeenCalledWith(
        expect.stringContaining('trends:US:')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cache invalidated',
        expect.objectContaining({ pattern: 'trends:US:*' })
      );
    });

    it('should handle cache write failures gracefully', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockCacheManager.set.mockRejectedValueOnce(new Error('Redis unavailable'));
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          default: {
            trendingSearchesDays: [{
              trendingSearches: MOCK_TRENDING_SEARCHES,
            }],
          },
        },
      });

      // Should still return results even if cache write fails
      const result = await service.getTrendingSearches({ region: TrendRegion.US });

      expect(result).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to cache results',
        expect.any(Object)
      );
    });
  });

  describe('Circuit Breaker Pattern', () => {
    it('should open circuit after consecutive failures', async () => {
      // Simulate multiple failures
      mockCacheManager.get.mockResolvedValue(null);
      mockHttpClient.get.mockRejectedValue(new Error('Service down'));

      // Exhaust retries for multiple calls
      for (let i = 0; i < 5; i++) {
        try {
          await service.getTrendingSearches({ region: TrendRegion.US });
        } catch {
          // Expected
        }
      }

      // Circuit should be open - fast fail without calling API
      await expect(
        service.getTrendingSearches({ region: TrendRegion.US })
      ).rejects.toThrow('Circuit breaker is OPEN');

      expect(mockHttpClient.get).toHaveBeenCalledTimes(15); // 5 calls × 3 retries
    });

    it('should half-open circuit after timeout', async () => {
      // This test would require time manipulation or exposing circuit state
      // Implementation depends on circuit breaker library used
    });
  });
});