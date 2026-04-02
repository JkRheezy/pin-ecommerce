/**
 * RedditTrendsProvider.test.ts
 *
 * Unit tests for RedditTrendsProvider following the six-layer architecture.
 * Tests cover core functionality, error handling, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RedditTrendsProvider } from './RedditTrendsProvider';
import { RedditTrendsConfig, RedditPost, RedditTrendsResult } from '../../types/RedditTrends.types';
import { Logger } from '../../utils/logger';
import { ValidationError, ExternalServiceError } from '../../types/errors';

// Mock dependencies
vi.mock('../../utils/logger', () => ({
  Logger: {
    getInstance: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

vi.mock('../../config/RedditConfig', () => ({
  RedditConfig: {
    getInstance: vi.fn(() => ({
      baseUrl: 'https://oauth.reddit.com',
      userAgent: 'test-agent',
      rateLimitMs: 1000,
    })),
  },
}));

describe('RedditTrendsProvider', () => {
  let provider: RedditTrendsProvider;
  let mockLogger: ReturnType<typeof Logger.getInstance>;

  // Valid config for testing
  const validConfig: RedditTrendsConfig = {
    subreddit: 'technology',
    sortBy: 'hot',
    limit: 10,
    timeWindow: 'day',
  };

  // Sample Reddit post for mocking
  const mockRedditPost: RedditPost = {
    id: 't3_abc123',
    title: 'Test Post Title',
    author: 'testuser',
    subreddit: 'technology',
    score: 1500,
    numComments: 250,
    createdUtc: 1704067200,
    url: 'https://reddit.com/r/technology/comments/abc123',
    permalink: '/r/technology/comments/abc123/test_post',
    isSelf: false,
    selftext: '',
    thumbnail: 'https://example.com/thumb.jpg',
  };

  beforeEach(() => {
    provider = new RedditTrendsProvider();
    mockLogger = Logger.getInstance();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Layer 1: Types - Configuration Validation', () => {
    it('should accept valid configuration', () => {
      expect(() => provider.initialize(validConfig)).not.toThrow();
    });

    it('should reject config with empty subreddit', () => {
      const invalidConfig = { ...validConfig, subreddit: '' };
      expect(() => provider.initialize(invalidConfig)).toThrow(ValidationError);
      expect(() => provider.initialize(invalidConfig)).toThrow('Subreddit name is required');
    });

    it('should reject config with invalid sort option', () => {
      const invalidConfig = { ...validConfig, sortBy: 'invalid_sort' as any };
      expect(() => provider.initialize(invalidConfig)).toThrow(ValidationError);
    });

    it('should reject config with limit exceeding maximum', () => {
      const invalidConfig = { ...validConfig, limit: 101 };
      expect(() => provider.initialize(invalidConfig)).toThrow(ValidationError);
      expect(() => provider.initialize(invalidConfig)).toThrow('Limit must be between 1 and 100');
    });

    it('should reject config with negative limit', () => {
      const invalidConfig = { ...validConfig, limit: -1 };
      expect(() => provider.initialize(invalidConfig)).toThrow(ValidationError);
    });

    it('should reject config with zero limit', () => {
      const invalidConfig = { ...validConfig, limit: 0 };
      expect(() => provider.initialize(invalidConfig)).toThrow(ValidationError);
    });

    it('should use default values for optional config fields', () => {
      const minimalConfig: Partial<RedditTrendsConfig> = { subreddit: 'technology' };
      provider.initialize(minimalConfig as RedditTrendsConfig);
      
      // Access internal config to verify defaults were applied
      const internalConfig = (provider as any).config;
      expect(internalConfig.sortBy).toBe('hot');
      expect(internalConfig.limit).toBe(25);
      expect(internalConfig.timeWindow).toBe('day');
    });
  });

  describe('Layer 2: Config - Initialization', () => {
    it('should initialize with proper logging', () => {
      provider.initialize(validConfig);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'RedditTrendsProvider initialized',
        expect.objectContaining({ subreddit: 'technology' })
      );
    });

    it('should prevent double initialization', () => {
      provider.initialize(validConfig);
      expect(() => provider.initialize(validConfig)).toThrow('Provider already initialized');
    });

    it('should require initialization before fetching trends', async () => {
      const uninitializedProvider = new RedditTrendsProvider();
      await expect(uninitializedProvider.fetchTrends()).rejects.toThrow(
        'Provider must be initialized before fetching trends'
      );
    });
  });

  describe('Layer 3: Repo - Data Fetching', () => {
    beforeEach(() => {
      provider.initialize(validConfig);
    });

    it('should fetch trends successfully with valid response', async () => {
      const mockResponse = {
        data: {
          children: [
            { data: mockRedditPost },
            { data: { ...mockRedditPost, id: 't3_def456', title: 'Second Post' } },
          ],
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await provider.fetchTrends();

      expect(result.posts).toHaveLength(2);
      expect(result.posts[0].title).toBe('Test Post Title');
      expect(result.metadata.source).toBe('reddit');
      expect(result.metadata.subreddit).toBe('technology');
    });

    it('should handle empty response gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: { children: [] } }),
      });

      const result = await provider.fetchTrends();
      expect(result.posts).toHaveLength(0);
      expect(result.metadata.totalFetched).toBe(0);
    });

    it('should apply rate limiting between requests', async () => {
      const startTime = Date.now();
      let requestCount = 0;

      global.fetch = vi.fn().mockImplementation(() => {
        requestCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ data: { children: [] } }),
        });
      });

      // Make two rapid requests
      await provider.fetchTrends();
      await provider.fetchTrends();

      const elapsed = Date.now() - startTime;
      // Should have waited at least rateLimitMs between requests
      expect(elapsed).toBeGreaterThanOrEqual(1000);
      expect(requestCount).toBe(2);
    });

    it('should handle Reddit API rate limit (429) with retry', async () => {
      let attempts = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          return Promise.resolve({
            ok: false,
            status: 429,
            headers: new Map([['x-ratelimit-reset', '2']]),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ data: { children: [{ data: mockRedditPost }] } }),
        });
      });

      const result = await provider.fetchTrends();
      expect(attempts).toBe(2);
      expect(result.posts).toHaveLength(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Rate limited by Reddit API, retrying after delay',
        expect.any(Object)
      );
    });

    it('should throw ExternalServiceError on API failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(provider.fetchTrends()).rejects.toThrow(ExternalServiceError);
      await expect(provider.fetchTrends()).rejects.toThrow('Reddit API returned 500');
    });

    it('should throw ExternalServiceError on network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(provider.fetchTrends()).rejects.toThrow(ExternalServiceError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch Reddit trends',
        expect.objectContaining({ error: 'Failed to fetch' })
      );
    });

    it('should handle malformed JSON response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
      });

      await expect(provider.fetchTrends()).rejects.toThrow(ExternalServiceError);
    });

    it('should construct correct API URL with all parameters', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: { children: [] } }),
      });
      global.fetch = fetchSpy;

      await provider.fetchTrends();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://oauth.reddit.com/r/technology/hot?limit=10&t=day',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'test-agent',
          }),
        })
      );
    });
  });

  describe('Layer 4: Service - Data Transformation', () => {
    beforeEach(() => {
      provider.initialize(validConfig);
    });

    it('should transform Reddit post to normalized format', async () => {
      const redditResponse = {
        data: {
          children: [{
            data: {
              ...mockRedditPost,
              score: 5000,
              num_comments: 300, // Reddit uses snake_case
              created_utc: 1704067200,
              is_self: true,
              selftext: 'Post content here',
            },
          }],
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(redditResponse),
      });

      const result = await provider.fetchTrends();

      expect(result.posts[0]).toMatchObject({
        id: 't3_abc123',
        title: 'Test Post Title',
        engagementScore: 5300, // score + num_comments
        normalizedScore: expect.any(Number),
        content: 'Post content here',
      });
    });

    it('should calculate engagement score correctly', () => {
      const testCases = [
        { score: 100, comments: 50, expected: 150 },
        { score: 0, comments: 10, expected: 10 },
        { score: 1000, comments: 0, expected: 1000 },
      ];

      testCases.forEach(({ score, comments, expected }) => {
        const calculated = (provider as any).calculateEngagementScore(score, comments);
        expect(calculated).toBe(expected);
      });
    });

    it('should normalize scores across posts', () => {
      const posts: RedditPost[] = [
        { ...mockRedditPost, score: 1000, numComments: 100 },
        { ...mockRedditPost, id: 't3_low', score: 100, numComments: 10 },
        { ...mockRedditPost, id: 't3_high', score: 10000, numComments: 1000 },
      ];

      const normalized = (provider as any).normalizeEngagementScores(posts);

      expect(normalized[0].normalizedScore).toBeGreaterThan(normalized[1].normalizedScore);
      expect(normalized[2].normalizedScore).toBe(100); // Max score normalized to 100
      expect(normalized[1].normalizedScore).toBe(1); // Min score normalized to 1
    });

    it('should handle single post normalization (no range)', () => {
      const posts: RedditPost[] = [{ ...mockRedditPost, score: 500, numComments: 50 }];
      const normalized = (provider as any).normalizeEngagementScores(posts);
      expect(normalized[0].normalizedScore).toBe(50); // Middle of 1-100 range
    });

    it('should filter posts by minimum engagement threshold', async () => {
      const redditResponse = {
        data: {
          children: [
            { data: { ...mockRedditPost, score: 10, num_comments: 5 } }, // Low engagement
            { data: { ...mockRedditPost, id: 't3_high', score: 1000, num_comments: 200 } },
          ],
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(redditResponse),
      });

      // Set minimum engagement threshold
      (provider as any).config.minEngagementThreshold = 100;

      const result = await provider.fetchTrends();
      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].id).toBe('t3_high');
      expect(result.metadata.filteredCount).toBe(1);
    });
  });

  describe('Layer 5: Runtime - Caching and Performance', () => {
    beforeEach(() => {
      provider.initialize({ ...validConfig, cacheTtlMs: 5000 });
    });

    it('should cache results and return cached data on subsequent calls', async () => {
      let apiCallCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        apiCallCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            data: { children: [{ data: { ...mockRedditPost, title: `Call ${apiCallCount}` } }] },
          }),
        });
      });

      const result1 = await provider.fetchTrends();
      const result2 = await provider.fetchTrends();

      expect(apiCallCount).toBe(1); // Only one API call made
      expect(result1.posts[0].title).toBe(result2.posts[0].title);
      expect(mockLogger.debug).toHaveBeenCalledWith('Returning cached Reddit trends');
    });

    it('should bypass cache when explicitly requested', async () => {
      let apiCallCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        apiCallCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            data: { children: [{ data: mockRedditPost }] },
          }),
        });
      });

      await provider.fetchTrends();
      await provider.fetchTrends({ bypassCache: true });

      expect(apiCallCount).toBe(2);
    });

    it('should expire cache after TTL', async () => {
      vi.useFakeTimers();
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: { children: [{ data: mockRedditPost }] } }),
      });

      await provider.fetchTrends();
      
      // Advance time past cache TTL
      vi.advanceTimersByTime(6000);

      await provider.fetchTrends();
      expect(global.fetch).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('should clear cache on demand', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: { children: [{ data: mockRedditPost }] } }),
      });

      await provider.fetchTrends();
      provider.clearCache();
      await provider.fetchTrends();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith('Reddit trends cache cleared');
    });
  });

  describe('Layer 6: UI - Result Formatting', () => {
    beforeEach(() => {
      provider.initialize(validConfig);
    });

    it('should format result for UI consumption', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          data: {
            children: [{
              data: {
                ...mockRedditPost,
                title: 'Very Long Title That Should Be Truncated For Display Purposes',
                selftext: 'Content with [markdown](link) and **formatting**',
              },
            }],
          },
        }),
      });

      const result = await provider.fetchTrends();
      const formatted = provider.formatForDisplay(result);

      expect(formatted).toMatchObject({
        title: expect.stringContaining('...'), // Truncated
        displayTitle: expect.any(String),
        engagementBadge: expect.any(String),
        relativeTime: expect.any(String),
        cleanContent: expect.not.stringContaining('['), // Markdown stripped
      });
    });

    it('should generate correct relative time strings', () => {
      const now = Math.floor(Date.now() / 1000);
      const testCases = [
        { created: now - 30, expected: 'just now' },
        { created: now - 3600, expected: '1 hour ago' },
        { created: now - 86400, expected: '1 day ago' },
        { created: now - 604800, expected: '1 week ago' },
      ];

      testCases.forEach(({ created, expected }) => {
        const relative = (provider as any).getRelativeTime(created);
        expect(relative).toBe(expected);
      });
    });

    it('should generate engagement badge based on score', () => {
      const badges = [
        { score: 50000, expected: 'trending' },
        { score: 10000, expected: 'hot' },
        { score: 1000, expected: 'rising' },
        { score: 100, expected: 'new' },
      ];

      badges.forEach(({ score, expected }) => {
        const badge = (provider as any).getEngagementBadge(score);
        expect(badge).toBe(expected);
      });
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    beforeEach(() => {
      provider.initialize(validConfig);
    });

    it('should handle posts with missing optional fields', async () => {
      const incompletePost = {
        id: 't3_incomplete',
        title: 'Incomplete Post',
        // Missing many optional fields
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          data: { children: [{ data: incompletePost }] },
        }),
      });

      const result = await provider.fetchTrends();
      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].title).toBe('Incomplete Post');
      expect(result.posts[0].author).toBe('[deleted]'); // Default value
    });

    it('should handle extremely large numbers without overflow', async () => {
      const bigPost = {
        ...mockRedditPost,
        score: Number.MAX_SAFE_INTEGER,
        num_comments: Number.MAX_SAFE_INTEGER,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          data: { children: [{ data: bigPost }] },
        }),
      });

      const result = await provider.fetchTrends();
      expect(result.posts[0].engagementScore).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle special characters in subreddit names', () => {
      const specialConfigs = [
        { subreddit: 'r/technology', expected: 'technology' },
        { subreddit: '/r/technology/', expected: 'technology' },
        { subreddit: 'Technology', expected: 'technology' }, // Lowercase
      ];

      specialConfigs.forEach(({ subreddit, expected }) => {
        const testProvider = new RedditTrendsProvider();
        testProvider.initialize({ ...validConfig, subreddit });
        expect((testProvider as any).config.subreddit).toBe(expected);
      });
    });

    it('should handle concurrent fetch requests safely', async () => {
      let requestCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        requestCount++;
        await new Promise(r => setTimeout(r, 50));
        return {
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            data: { children: [{ data: { ...mockRedditPost, id: `t3_${requestCount}` } }] },
          }),
        };
      });

      // Fire multiple concurrent requests
      const promises = [
        provider.fetchTrends(),
        provider.fetchTrends(),
        provider.fetchTrends(),
      ];

      const results = await Promise.all(promises);
      
      // All should get same result (from first completed request)
      expect(new Set(results.map(r => r.posts[0].id)).size).toBe(1);
    });

    it('should recover from temporary network failures with retry', async () => {
      let attempts = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts <= 2) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ data: { children: [{ data: mockRedditPost }] } }),
        });
      });

      const result = await provider.fetchTrends();
      expect(attempts).toBe(3);
      expect(result.posts).toHaveLength(1);
    });

    it('should fail after max retries exceeded', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Persistent network error'));

      await expect(provider.fetchTrends()).rejects.toThrow(ExternalServiceError);
      expect(global.fetch).toHaveBeenCalledTimes(3); // Default max retries
    });

    it('should handle Reddit API authentication errors (401/403)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(provider.fetchTrends()).rejects.toThrow(ExternalServiceError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Reddit API authentication failed',
        expect.any(Object)
      );
    });

    it('should handle subreddit not found (404)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(provider.fetchTrends()).rejects.toThrow(ExternalServiceError);
      await expect(provider.fetchTrends()).rejects.toThrow('Subreddit not found or private');
    });
  });
});