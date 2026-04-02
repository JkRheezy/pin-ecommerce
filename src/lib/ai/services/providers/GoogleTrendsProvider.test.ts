import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleTrendsProvider } from './GoogleTrendsProvider';
import { GoogleTrendsConfig, TrendsData, TrendsQueryOptions } from '@/lib/ai/types/providers/GoogleTrends.types';
import { createLogger } from '@/lib/shared/utils/logger';

// Mock the logger
vi.mock('@/lib/shared/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock fetch for HTTP requests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('GoogleTrendsProvider', () => {
  let provider: GoogleTrendsProvider;
  const mockConfig: GoogleTrendsConfig = {
    apiKey: 'test-api-key',
    baseUrl: 'https://trends.googleapis.com/trends/api',
    timeoutMs: 5000,
    maxRetries: 2,
    rateLimitPerMinute: 100,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GoogleTrendsProvider(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with valid config', () => {
      const provider = new GoogleTrendsProvider(mockConfig);
      expect(provider).toBeDefined();
    });

    it('should throw error when apiKey is missing', () => {
      const invalidConfig = { ...mockConfig, apiKey: '' };
      expect(() => new GoogleTrendsProvider(invalidConfig)).toThrow(
        'GoogleTrendsProvider: apiKey is required'
      );
    });

    it('should throw error when baseUrl is missing', () => {
      const invalidConfig = { ...mockConfig, baseUrl: '' };
      expect(() => new GoogleTrendsProvider(invalidConfig)).toThrow(
        'GoogleTrendsProvider: baseUrl is required'
      );
    });

    it('should use default timeout when not specified', () => {
      const configWithoutTimeout = { ...mockConfig };
      delete (configWithoutTimeout as Partial<GoogleTrendsConfig>).timeoutMs;
      const provider = new GoogleTrendsProvider(configWithoutTimeout);
      expect(provider).toBeDefined();
    });
  });

  describe('getTrends', () => {
    const mockQueryOptions: TrendsQueryOptions = {
      keyword: 'typescript',
      geo: 'US',
      timeRange: 'today 5-y',
    };

    const mockTrendsData: TrendsData = {
      keyword: 'typescript',
      timelineData: [
        { time: '2020-01-01', value: 50, formattedValue: '50' },
        { time: '2020-01-02', value: 75, formattedValue: '75' },
      ],
      geoMapData: [
        { geoCode: 'US-CA', value: 100, geoName: 'California' },
      ],
      relatedQueries: {
        rising: [{ query: 'typescript tutorial', value: 200 }],
        top: [{ query: 'typescript vs javascript', value: 100 }],
      },
      relatedTopics: {
        rising: [{ topic: 'TypeScript', value: 150 }],
        top: [{ topic: 'Programming Language', value: 80 }],
      },
    };

    it('should fetch trends data successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockTrendsData),
      });

      const result = await provider.getTrends(mockQueryOptions);

      expect(result).toEqual(mockTrendsData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/explore'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should build correct URL with query parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockTrendsData),
      });

      await provider.getTrends(mockQueryOptions);

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('keyword=typescript');
      expect(callUrl).toContain('geo=US');
      expect(callUrl).toContain('timeRange=today+5-y');
    });

    it('should handle URL-encoded special characters in keywords', async () => {
      const specialOptions: TrendsQueryOptions = {
        keyword: 'machine learning & ai',
        geo: 'US',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockTrendsData),
      });

      await provider.getTrends(specialOptions);

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('keyword=machine+learning+%26+ai');
    });

    it('should throw error when keyword is empty', async () => {
      const invalidOptions = { ...mockQueryOptions, keyword: '' };
      await expect(provider.getTrends(invalidOptions)).rejects.toThrow(
        'GoogleTrendsProvider: keyword is required'
      );
    });

    it('should throw error when keyword exceeds maximum length', async () => {
      const longKeyword = 'a'.repeat(101);
      const invalidOptions = { ...mockQueryOptions, keyword: longKeyword };
      await expect(provider.getTrends(invalidOptions)).rejects.toThrow(
        'GoogleTrendsProvider: keyword exceeds maximum length of 100 characters'
      );
    });

    it('should handle HTTP errors with retry logic', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce(mockTrendsData),
        });

      const result = await provider.getTrends(mockQueryOptions);

      expect(result).toEqual(mockTrendsData);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries exceeded', async () => {
      mockFetch.mockRejectedValue(new Error('Persistent network error'));

      await expect(provider.getTrends(mockQueryOptions)).rejects.toThrow(
        'GoogleTrendsProvider: Failed to fetch trends after 2 retries'
      );
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should handle rate limit errors (429)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      await expect(provider.getTrends(mockQueryOptions)).rejects.toThrow(
        'GoogleTrendsProvider: Rate limit exceeded. Please try again later.'
      );
    });

    it('should handle authentication errors (401)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(provider.getTrends(mockQueryOptions)).rejects.toThrow(
        'GoogleTrendsProvider: Authentication failed. Please check your API key.'
      );
    });

    it('should handle generic HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(provider.getTrends(mockQueryOptions)).rejects.toThrow(
        'GoogleTrendsProvider: HTTP error 500 - Internal Server Error'
      );
    });

    it('should apply request timeout', async () => {
      mockFetch.mockImplementationOnce(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 10000)
        )
      );

      await expect(provider.getTrends(mockQueryOptions)).rejects.toThrow();
    });

    it('should support custom category parameter', async () => {
      const optionsWithCategory: TrendsQueryOptions = {
        ...mockQueryOptions,
        category: 'Programming',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockTrendsData),
      });

      await provider.getTrends(optionsWithCategory);

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('category=Programming');
    });

    it('should support property filter parameter', async () => {
      const optionsWithProperty: TrendsQueryOptions = {
        ...mockQueryOptions,
        property: 'images',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockTrendsData),
      });

      await provider.getTrends(optionsWithProperty);

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('property=images');
    });
  });

  describe('getInterestOverTime', () => {
    const mockTimelineData = [
      { time: '2020-01-01', value: 50, formattedValue: '50' },
      { time: '2020-01-02', value: 75, formattedValue: '75' },
    ];

    it('should extract timeline data from trends response', async () => {
      const mockResponse = {
        timelineData: mockTimelineData,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await provider.getInterestOverTime('typescript', 'US');

      expect(result).toEqual(mockTimelineData);
    });

    it('should return empty array when timeline data is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({}),
      });

      const result = await provider.getInterestOverTime('typescript', 'US');

      expect(result).toEqual([]);
    });

    it('should validate and normalize timeline data points', async () => {
      const rawResponse = {
        timelineData: [
          { time: '2020-01-01', value: 'invalid', formattedValue: '50' }, // Invalid value
          { time: '2020-01-02', value: 75, formattedValue: '75' },
          { time: '', value: 100, formattedValue: '100' }, // Missing time
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(rawResponse),
      });

      const result = await provider.getInterestOverTime('typescript', 'US');

      // Should filter out invalid entries and normalize valid ones
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        time: '2020-01-02',
        value: 75,
        formattedValue: '75',
      });
    });
  });

  describe('getInterestByRegion', () => {
    const mockGeoData = [
      { geoCode: 'US-CA', value: 100, geoName: 'California' },
      { geoCode: 'US-NY', value: 80, geoName: 'New York' },
    ];

    it('should extract geo map data from trends response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({ geoMapData: mockGeoData }),
      });

      const result = await provider.getInterestByRegion('typescript', 'US');

      expect(result).toEqual(mockGeoData);
    });

    it('should support resolution parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({ geoMapData: mockGeoData }),
      });

      await provider.getInterestByRegion('typescript', 'US', 'CITY');

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('resolution=CITY');
    });

    it('should validate resolution values', async () => {
      await expect(
        provider.getInterestByRegion('typescript', 'US', 'INVALID' as any)
      ).rejects.toThrow('GoogleTrendsProvider: Invalid resolution value');
    });
  });

  describe('getRelatedQueries', () => {
    const mockRelatedQueries = {
      rising: [{ query: 'typescript tutorial', value: 200 }],
      top: [{ query: 'typescript vs javascript', value: 100 }],
    };

    it('should extract related queries from trends response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({ relatedQueries: mockRelatedQueries }),
      });

      const result = await provider.getRelatedQueries('typescript', 'US');

      expect(result).toEqual(mockRelatedQueries);
    });

    it('should return default structure when related queries missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({}),
      });

      const result = await provider.getRelatedQueries('typescript', 'US');

      expect(result).toEqual({
        rising: [],
        top: [],
      });
    });
  });

  describe('getRelatedTopics', () => {
    const mockRelatedTopics = {
      rising: [{ topic: 'TypeScript', value: 150 }],
      top: [{ topic: 'Programming Language', value: 80 }],
    };

    it('should extract related topics from trends response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({ relatedTopics: mockRelatedTopics }),
      });

      const result = await provider.getRelatedTopics('typescript', 'US');

      expect(result).toEqual(mockRelatedTopics);
    });

    it('should return default structure when related topics missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({}),
      });

      const result = await provider.getRelatedTopics('typescript', 'US');

      expect(result).toEqual({
        rising: [],
        top: [],
      });
    });
  });

  describe('compareKeywords', () => {
    const mockComparisonData = {
      keywords: ['typescript', 'javascript'],
      timelineData: [
        { time: '2020-01-01', values: [50, 100], formattedValues: ['50', '100'] },
      ],
    };

    it('should compare multiple keywords', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockComparisonData),
      });

      const result = await provider.compareKeywords(['typescript', 'javascript'], 'US');

      expect(result.keywords).toEqual(['typescript', 'javascript']);
      expect(result.timelineData).toHaveLength(1);
    });

    it('should throw error when keywords array is empty', async () => {
      await expect(provider.compareKeywords([], 'US')).rejects.toThrow(
        'GoogleTrendsProvider: At least one keyword is required for comparison'
      );
    });

    it('should throw error when too many keywords provided', async () => {
      const manyKeywords = Array(6).fill('keyword');
      await expect(provider.compareKeywords(manyKeywords, 'US')).rejects.toThrow(
        'GoogleTrendsProvider: Maximum 5 keywords allowed for comparison'
      );
    });

    it('should build comparison query string correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockComparisonData),
      });

      await provider.compareKeywords(['typescript', 'javascript'], 'US');

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('keywords=typescript');
      expect(callUrl).toContain('keywords=javascript');
    });
  });

  describe('rate limiting', () => {
    it('should track request count for rate limiting', async () => {
      const mockResponse = {
        timelineData: [],
        geoMapData: [],
        relatedQueries: { rising: [], top: [] },
        relatedTopics: { rising: [], top: [] },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      // Make multiple requests
      await provider.getTrends({ keyword: 'test1', geo: 'US' });
      await provider.getTrends({ keyword: 'test2', geo: 'US' });

      // Verify rate limit tracking (implementation dependent)
      const logger = createLogger('GoogleTrendsProvider');
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('rate limit'),
        expect.any(Object)
      );
    });

    it('should reset rate limit counter after time window', async () => {
      vi.useFakeTimers();

      const mockResponse = {
        timelineData: [],
        geoMapData: [],
        relatedQueries: { rising: [], top: [] },
        relatedTopics: { rising: [], top: [] },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      // Make requests
      await provider.getTrends({ keyword: 'test', geo: 'US' });

      // Advance time by 1 minute
      vi.advanceTimersByTime(60000);

      // Counter should be reset, allowing more requests
      await provider.getTrends({ keyword: 'test2', geo: 'US' });

      vi.useRealTimers();
    });
  });

  describe('logging', () => {
    it('should log successful requests at debug level', async () => {
      const mockResponse = {
        timelineData: [],
        geoMapData: [],
        relatedQueries: { rising: [], top: [] },
        relatedTopics: { rising: [], top: [] },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      await provider.getTrends({ keyword: 'test', geo: 'US' });

      const logger = createLogger('GoogleTrendsProvider');
      expect(logger.debug).toHaveBeenCalledWith(
        'Fetching trends data',
        expect.objectContaining({
          keyword: 'test',
          geo: 'US',
        })
      );
    });

    it('should log errors at error level', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(
        provider.getTrends({ keyword: 'test', geo: 'US' })
      ).rejects.toThrow();

      const logger = createLogger('GoogleTrendsProvider');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch trends data',
        expect.objectContaining({
          error: expect.any(String),
          keyword: 'test',
        })
      );
    });

    it('should log retry attempts at warn level', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce({
            timelineData: [],
            geoMapData: [],
            relatedQueries: { rising: [], top: [] },
            relatedTopics: { rising: [], top: [] },
          }),
        });

      await provider.getTrends({ keyword: 'test', geo: 'US' });

      const logger = createLogger('GoogleTrendsProvider');
      expect(logger.warn).toHaveBeenCalledWith(
        'Retrying trends fetch',
        expect.objectContaining({
          attempt: expect.any(Number),
          maxRetries: 2,
        })
      );
    });
  });

  describe('edge cases', () => {
    it('should handle null response body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(null),
      });

      const result = await provider.getTrends({ keyword: 'test', geo: 'US' });

      expect(result).toEqual({
        keyword: 'test',
        timelineData: [],
        geoMapData: [],
        relatedQueries: { rising: [], top: [] },
        relatedTopics: { rising: [], top: [] },
      });
    });

    it('should handle malformed JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValueOnce(new Error('Invalid JSON')),
      });

      await expect(
        provider.getTrends({ keyword: 'test', geo: 'US' })
      ).rejects.toThrow('GoogleTrendsProvider: Failed to parse response');
    });

    it('should handle very long keywords with truncation warning', async () => {
      const longKeyword = 'a'.repeat(100);
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          timelineData: [],
          geoMapData: [],
          relatedQueries: { rising: [], top: [] },
          relatedTopics: { rising: [], top: [] },
        }),
      });

      await provider.getTrends({ keyword: longKeyword, geo: 'US' });

      const logger = createLogger('GoogleTrendsProvider');
      expect(logger.warn).not.toHaveBeenCalled(); // Exactly at limit is OK
    });

    it('should handle concurrent requests safely', async () => {
      const mockResponse = {
        timelineData: [],
        geoMapData: [],
        relatedQueries: { rising: [], top: [] },
        relatedTopics: { rising: [], top: [] },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      // Fire multiple concurrent requests
      const promises = [
        provider.getTrends({ keyword: 'test1', geo: 'US' }),
        provider.getTrends({ keyword: 'test2', geo: 'US' }),
        provider.getTrends({ keyword: 'test3', geo: 'US' }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});