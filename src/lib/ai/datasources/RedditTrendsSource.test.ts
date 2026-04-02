import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RedditTrendsSource } from './RedditTrendsSource';
import { RedditConfig, RedditPost, RedditTrendsResult } from './types';
import { StructuredLogger } from '@/lib/logging/StructuredLogger';
import { DataSourceError, DataSourceErrorCode } from '../errors/DataSourceError';

// Mock dependencies
vi.mock('@/lib/logging/StructuredLogger');
vi.mock('./redditApi', () => ({
  fetchRedditPosts: vi.fn(),
}));

import { fetchRedditPosts } from './redditApi';

describe('RedditTrendsSource', () => {
  let source: RedditTrendsSource;
  let mockLogger: StructuredLogger;
  const defaultConfig: RedditConfig = {
    subreddits: ['technology', 'programming'],
    sortBy: 'hot',
    timeWindow: 'day',
    maxPostsPerSubreddit: 10,
    minScore: 50,
  };

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as StructuredLogger;

    source = new RedditTrendsSource(defaultConfig, mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Layer 1: Types - Configuration Validation', () => {
    it('should validate required config fields', () => {
      // Test missing subreddits
      expect(() => {
        new RedditTrendsSource({} as RedditConfig, mockLogger);
      }).toThrow(DataSourceError);

      // Test empty subreddits array
      expect(() => {
        new RedditTrendsSource({ subreddits: [] } as RedditConfig, mockLogger);
      }).toThrow(DataSourceError);

      // Test invalid maxPostsPerSubreddit
      expect(() => {
        new RedditTrendsSource(
          { ...defaultConfig, maxPostsPerSubreddit: 0 },
          mockLogger
        );
      }).toThrow(DataSourceError);
    });

    it('should apply default values for optional config', () => {
      const minimalConfig: RedditConfig = {
        subreddits: ['test'],
      };

      const testSource = new RedditTrendsSource(minimalConfig, mockLogger);

      // Access internal config through reflection or expose for testing
      // Using type assertion for test purposes
      const internalConfig = (testSource as any).config;
      expect(internalConfig.sortBy).toBe('hot');
      expect(internalConfig.timeWindow).toBe('day');
      expect(internalConfig.maxPostsPerSubreddit).toBe(25);
      expect(internalConfig.minScore).toBe(0);
    });
  });

  describe('Layer 2: Config - Configuration Management', () => {
    it('should merge user config with defaults correctly', () => {
      const partialConfig: RedditConfig = {
        subreddits: ['custom'],
        sortBy: 'top',
        // timeWindow and maxPostsPerSubreddit should use defaults
      };

      const testSource = new RedditTrendsSource(partialConfig, mockLogger);
      const internalConfig = (testSource as any).config;

      expect(internalConfig).toEqual({
        subreddits: ['custom'],
        sortBy: 'top',
        timeWindow: 'day',
        maxPostsPerSubreddit: 25,
        minScore: 0,
      });
    });

    it('should normalize subreddit names (remove r/ prefix)', () => {
      const configWithPrefix: RedditConfig = {
        subreddits: ['r/technology', 'r/programming', 'webdev'],
      };

      const testSource = new RedditTrendsSource(configWithPrefix, mockLogger);
      const normalizedSubreddits = (testSource as any).getNormalizedSubreddits();

      expect(normalizedSubreddits).toEqual(['technology', 'programming', 'webdev']);
    });
  });

  describe('Layer 3: Repo - Data Access', () => {
    const mockPosts: RedditPost[] = [
      {
        id: 'post1',
        title: 'Test Post 1',
        subreddit: 'technology',
        score: 1500,
        numComments: 200,
        createdUtc: Date.now() / 1000 - 3600,
        url: 'https://example.com/1',
        permalink: '/r/technology/comments/post1',
        author: 'user1',
        isSelf: false,
      },
      {
        id: 'post2',
        title: 'Test Post 2',
        subreddit: 'technology',
        score: 800,
        numComments: 50,
        createdUtc: Date.now() / 1000 - 7200,
        url: 'https://example.com/2',
        permalink: '/r/technology/comments/post2',
        author: 'user2',
        isSelf: true,
      },
    ];

    it('should fetch posts from multiple subreddits', async () => {
      vi.mocked(fetchRedditPosts).mockResolvedValue(mockPosts);

      const result = await (source as any).fetchFromSubreddit('technology');

      expect(fetchRedditPosts).toHaveBeenCalledWith(
        'technology',
        expect.objectContaining({
          sort: defaultConfig.sortBy,
          time: defaultConfig.timeWindow,
          limit: defaultConfig.maxPostsPerSubreddit,
        })
      );
      expect(result).toEqual(mockPosts);
    });

    it('should handle API errors with proper error transformation', async () => {
      const apiError = new Error('Rate limit exceeded');
      vi.mocked(fetchRedditPosts).mockRejectedValue(apiError);

      await expect(
        (source as any).fetchFromSubreddit('technology')
      ).rejects.toThrow(DataSourceError);

      await expect(
        (source as any).fetchFromSubreddit('technology')
      ).rejects.toMatchObject({
        code: DataSourceErrorCode.RATE_LIMITED,
        isRetryable: true,
      });
    });

    it('should handle network timeouts', async () => {
      vi.mocked(fetchRedditPosts).mockRejectedValue(new Error('timeout'));

      await expect(
        (source as any).fetchFromSubreddit('technology')
      ).rejects.toThrow(DataSourceError);
    });

    it('should cache responses to avoid duplicate API calls', async () => {
      vi.mocked(fetchRedditPosts).mockResolvedValue(mockPosts);

      // First call
      await (source as any).fetchFromSubreddit('technology');
      // Second call - should use cache
      await (source as any).fetchFromSubreddit('technology');

      expect(fetchRedditPosts).toHaveBeenCalledTimes(1);
    });
  });

  describe('Layer 4: Service - Business Logic', () => {
    const mockPosts: RedditPost[] = [
      {
        id: 'post1',
        title: 'High engagement post about AI',
        subreddit: 'technology',
        score: 5000,
        numComments: 800,
        createdUtc: Date.now() / 1000 - 1800, // 30 min ago
        url: 'https://example.com/ai',
        permalink: '/r/technology/comments/post1',
        author: 'user1',
        isSelf: false,
      },
      {
        id: 'post2',
        title: 'Low score post',
        subreddit: 'technology',
        score: 10, // Below minScore threshold
        numComments: 2,
        createdUtc: Date.now() / 1000 - 3600,
        url: 'https://example.com/low',
        permalink: '/r/technology/comments/post2',
        author: 'user2',
        isSelf: false,
      },
      {
        id: 'post3',
        title: 'Old post',
        subreddit: 'programming',
        score: 2000,
        numComments: 100,
        createdUtc: Date.now() / 1000 - 172800, // 2 days ago, outside window
        url: 'https://example.com/old',
        permalink: '/r/programming/comments/post3',
        author: 'user3',
        isSelf: false,
      },
    ];

    beforeEach(() => {
      vi.mocked(fetchRedditPosts).mockImplementation((subreddit) => {
        const posts = mockPosts.filter((p) => p.subreddit === subreddit);
        return Promise.resolve(posts);
      });
    });

    it('should filter posts by minimum score', async () => {
      const result = await source.fetchTrends();

      // post2 has score 10, below default minScore of 50
      const lowScorePost = result.posts.find((p) => p.id === 'post2');
      expect(lowScorePost).toBeUndefined();
    });

    it('should filter posts by time window', async () => {
      const result = await source.fetchTrends();

      // post3 is 2 days old, outside 'day' window
      const oldPost = result.posts.find((p) => p.id === 'post3');
      expect(oldPost).toBeUndefined();
    });

    it('should calculate engagement score correctly', () => {
      const post: RedditPost = {
        id: 'test',
        title: 'Test',
        subreddit: 'test',
        score: 1000,
        numComments: 100,
        createdUtc: Date.now() / 1000 - 3600,
        url: 'https://test.com',
        permalink: '/r/test/comments/test',
        author: 'test',
        isSelf: false,
      };

      const engagementScore = (source as any).calculateEngagementScore(post);

      // Engagement = score * 0.6 + comments * 0.4, normalized by recency
      // More recent posts get higher scores
      expect(engagementScore).toBeGreaterThan(0);
      expect(typeof engagementScore).toBe('number');
    });

    it('should sort posts by engagement score descending', async () => {
      const result = await source.fetchTrends();

      for (let i = 1; i < result.posts.length; i++) {
        expect(result.posts[i - 1].engagementScore).toBeGreaterThanOrEqual(
          result.posts[i].engagementScore
        );
      }
    });

    it('should aggregate trends across multiple subreddits', async () => {
      const result = await source.fetchTrends();

      expect(result.posts.length).toBeGreaterThan(0);
      expect(result.metadata.subredditsProcessed).toEqual(
        defaultConfig.subreddits
      );
      expect(result.metadata.totalPostsFetched).toBeGreaterThanOrEqual(
        result.posts.length
      );
    });

    it('should extract trending topics from post titles', async () => {
      const result = await source.fetchTrends();

      expect(result.trends).toBeDefined();
      expect(Array.isArray(result.trends)).toBe(true);

      // Should extract "AI" from "High engagement post about AI"
      const aiTrend = result.trends.find((t) =>
        t.keywords.includes('AI')
      );
      expect(aiTrend).toBeDefined();
    });

    it('should handle empty results gracefully', async () => {
      vi.mocked(fetchRedditPosts).mockResolvedValue([]);

      const result = await source.fetchTrends();

      expect(result.posts).toEqual([]);
      expect(result.trends).toEqual([]);
      expect(result.metadata.totalPostsFetched).toBe(0);
    });
  });

  describe('Layer 5: Runtime - Execution & Error Handling', () => {
    it('should implement circuit breaker pattern for repeated failures', async () => {
      vi.mocked(fetchRedditPosts).mockRejectedValue(new Error('API Error'));

      // Multiple failures should trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await source.fetchTrends();
        } catch (e) {
          // Expected
        }
      }

      // Circuit should be open now
      const circuitState = (source as any).getCircuitState();
      expect(circuitState).toBe('OPEN');

      // Subsequent calls should fail fast
      await expect(source.fetchTrends()).rejects.toThrow(
        'Circuit breaker is OPEN'
      );
    });

    it('should retry with exponential backoff on transient errors', async () => {
      let attempts = 0;
      vi.mocked(fetchRedditPosts).mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Transient error');
          (error as any).code = 'ETIMEDOUT';
          return Promise.reject(error);
        }
        return Promise.resolve([]);
      });

      await source.fetchTrends();

      expect(attempts).toBe(3);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Retry attempt'),
        expect.any(Object)
      );
    });

    it('should timeout long-running requests', async () => {
      vi.mocked(fetchRedditPosts).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000))
      );

      const configWithTimeout: RedditConfig = {
        ...defaultConfig,
        requestTimeoutMs: 100,
      };

      const testSource = new RedditTrendsSource(configWithTimeout, mockLogger);

      await expect(testSource.fetchTrends()).rejects.toThrow(DataSourceError);
    });

    it('should log structured errors with context', async () => {
      const error = new Error('Test error');
      vi.mocked(fetchRedditPosts).mockRejectedValue(error);

      try {
        await source.fetchTrends();
      } catch (e) {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch Reddit trends',
        expect.objectContaining({
          error: expect.any(String),
          subreddits: defaultConfig.subreddits,
          durationMs: expect.any(Number),
        })
      );
    });
  });

  describe('Layer 6: UI - Result Formatting', () => {
    const mockResult: RedditTrendsResult = {
      posts: [
        {
          id: 'p1',
          title: 'Test Post',
          subreddit: 'technology',
          score: 1000,
          numComments: 100,
          engagementScore: 85.5,
          createdUtc: Date.now() / 1000 - 3600,
          url: 'https://example.com',
          permalink: '/r/technology/comments/p1',
          author: 'user',
          isSelf: false,
        },
      ],
      trends: [
        {
          keywords: ['AI', 'Machine Learning'],
          frequency: 15,
          engagement: 12000,
          posts: ['p1'],
        },
      ],
      metadata: {
        fetchedAt: new Date().toISOString(),
        subredditsProcessed: ['technology'],
        totalPostsFetched: 1,
        filteredPosts: 0,
        executionTimeMs: 150,
      },
    };

    it('should format results for UI consumption', () => {
      const formatted = source.formatForDisplay(mockResult);

      expect(formatted).toHaveProperty('summary');
      expect(formatted).toHaveProperty('topPosts');
      expect(formatted).toHaveProperty('trendingTopics');
      expect(formatted).toHaveProperty('lastUpdated');
    });

    it('should truncate long titles in display format', () => {
      const longTitleResult: RedditTrendsResult = {
        ...mockResult,
        posts: [
          {
            ...mockResult.posts[0],
            title: 'A'.repeat(200),
          },
        ],
      };

      const formatted = source.formatForDisplay(longTitleResult);
      const displayTitle = formatted.topPosts[0].displayTitle;

      expect(displayTitle.length).toBeLessThanOrEqual(100);
      expect(displayTitle.endsWith('...')).toBe(true);
    });

    it('should format engagement numbers for readability', () => {
      const formatted = source.formatForDisplay(mockResult);

      expect(formatted.topPosts[0].engagementDisplay).toBe('1.0k upvotes');
      expect(formatted.topPosts[0].commentDisplay).toBe('100 comments');
    });

    it('should generate shareable links', () => {
      const shareable = source.generateShareableLink(mockResult.posts[0]);

      expect(shareable).toContain('reddit.com');
      expect(shareable).toContain(mockResult.posts[0].id);
    });

    it('should export results in multiple formats', () => {
      const jsonExport = source.exportResults(mockResult, 'json');
      expect(() => JSON.parse(jsonExport)).not.toThrow();

      const csvExport = source.exportResults(mockResult, 'csv');
      expect(csvExport).toContain('id,title,subreddit,score');

      const markdownExport = source.exportResults(mockResult, 'markdown');
      expect(markdownExport).toContain('# Reddit Trends');
    });
  });

  describe('Edge Cases & Integration', () => {
    it('should handle rate limiting with proper backoff headers', async () => {
      const rateLimitError = new Error('Rate limited');
      (rateLimitError as any).response = {
        headers: {
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60),
          'x-ratelimit-remaining': '0',
        },
      };

      vi.mocked(fetchRedditPosts).mockRejectedValue(rateLimitError);

      await expect(source.fetchTrends()).rejects.toThrow(DataSourceError);

      // Should log rate limit info
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Rate limited'),
        expect.objectContaining({
          retryAfter: expect.any(Number),
        })
      );
    });

    it('should handle malformed API responses', async () => {
      vi.mocked(fetchRedditPosts).mockResolvedValue([
        { id: 'bad', title: 123, score: 'invalid' } as any,
      ]);

      // Should validate and filter invalid posts
      const result = await source.fetchTrends();
      expect(result.posts).toEqual([]);
    });

    it('should maintain data consistency across concurrent requests', async () => {
      vi.mocked(fetchRedditPosts).mockResolvedValue([]);

      // Fire multiple concurrent requests
      const promises = Array(5)
        .fill(null)
        .map(() => source.fetchTrends());

      const results = await Promise.all(promises);

      // All results should have unique request IDs
      const requestIds = results.map((r) => r.metadata.requestId);
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(5);
    });

    it('should clean up resources on disposal', () => {
      const cleanupSpy = vi.fn();
      (source as any).registerCleanupTask(cleanupSpy);

      source.dispose();

      expect(cleanupSpy).toHaveBeenCalled();
      expect((source as any).isDisposed).toBe(true);
    });

    it('should throw if methods called after disposal', () => {
      source.dispose();

      expect(() => source.fetchTrends()).toThrow('RedditTrendsSource is disposed');
    });
  });
});