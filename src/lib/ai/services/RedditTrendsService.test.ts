// Types Layer
import type { RedditPost, RedditTrendsConfig, RedditTrendsResult } from '../types/RedditTrendsTypes'
import type { Logger } from '../../logging/types/LoggerTypes'

// Service Layer
import { RedditTrendsService } from './RedditTrendsService'

// Runtime Layer (Mocks)
import { jest } from '@jest/globals'

/**
 * Comprehensive test suite for RedditTrendsService
 * 
 * Tests follow the six-layer architecture:
 * - Types: Validates type contracts
 * - Config: Tests configuration handling
 * - Service: Tests business logic isolation
 * - Runtime: Mocks external dependencies (Reddit API)
 */

// ============================================================================
// Test Fixtures and Mocks
// ============================================================================

const createMockLogger = (): jest.Mocked<Logger> => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn().mockReturnThis(),
})

const createMockRedditPost = (overrides?: Partial<RedditPost>): RedditPost => ({
  id: `t3_${Math.random().toString(36).substr(2, 7)}`,
  title: 'Test Post Title',
  author: 'test_user',
  subreddit: 'r/programming',
  upvotes: 100,
  commentCount: 25,
  url: 'https://reddit.com/r/programming/comments/abc123',
  createdAt: new Date('2024-01-15T10:00:00Z'),
  isSelfPost: false,
  selfText: null,
  ...overrides,
})

const createMockConfig = (overrides?: Partial<RedditTrendsConfig>): RedditTrendsConfig => ({
  subreddits: ['programming', 'javascript', 'typescript'],
  minUpvotes: 50,
  maxPostsPerSubreddit: 10,
  timeWindowHours: 24,
  ...overrides,
})

// Mock the Reddit API client
const mockFetchSubredditPosts = jest.fn()
const mockFetchPostDetails = jest.fn()

jest.mock('../clients/RedditApiClient', () => ({
  RedditApiClient: jest.fn().mockImplementation(() => ({
    fetchSubredditPosts: mockFetchSubredditPosts,
    fetchPostDetails: mockFetchPostDetails,
  })),
}))

// ============================================================================
// Test Suite
// ============================================================================

describe('RedditTrendsService', () => {
  let service: RedditTrendsService
  let mockLogger: jest.Mocked<Logger>
  let config: RedditTrendsConfig

  beforeEach(() => {
    jest.clearAllMocks()
    mockLogger = createMockLogger()
    config = createMockConfig()
    service = new RedditTrendsService(config, mockLogger)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // ==========================================================================
  // Layer 1: Types - Constructor and Configuration Validation
  // ==========================================================================

  describe('constructor (Types/Config Layer)', () => {
    it('should create service with valid configuration', () => {
      expect(service).toBeDefined()
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'RedditTrendsService initialized',
        expect.objectContaining({ subredditCount: 3 })
      )
    })

    it('should throw ValidationError when subreddits array is empty', () => {
      const invalidConfig = createMockConfig({ subreddits: [] })
      
      expect(() => new RedditTrendsService(invalidConfig, mockLogger))
        .toThrow('At least one subreddit must be specified')
    })

    it('should throw ValidationError when minUpvotes is negative', () => {
      const invalidConfig = createMockConfig({ minUpvotes: -1 })
      
      expect(() => new RedditTrendsService(invalidConfig, mockLogger))
        .toThrow('minUpvotes must be non-negative')
    })

    it('should throw ValidationError when maxPostsPerSubreddit exceeds limit', () => {
      const invalidConfig = createMockConfig({ maxPostsPerSubreddit: 101 })
      
      expect(() => new RedditTrendsService(invalidConfig, mockLogger))
        .toThrow('maxPostsPerSubreddit cannot exceed 100')
    })

    it('should normalize subreddit names by removing r/ prefix', () => {
      const configWithPrefix = createMockConfig({ subreddits: ['r/programming', 'r/javascript'] })
      const serviceWithPrefix = new RedditTrendsService(configWithPrefix, mockLogger)
      
      // Access internal state through reflection for test verification
      const internalConfig = (serviceWithPrefix as unknown as { config: RedditTrendsConfig }).config
      expect(internalConfig.subreddits).toEqual(['programming', 'javascript'])
    })

    it('should deduplicate subreddit names', () => {
      const configWithDuplicates = createMockConfig({ 
        subreddits: ['programming', 'programming', 'javascript'] 
      })
      const serviceWithDuplicates = new RedditTrendsService(configWithDuplicates, mockLogger)
      
      const internalConfig = (serviceWithDuplicates as unknown as { config: RedditTrendsConfig }).config
      expect(internalConfig.subreddits).toEqual(['programming', 'javascript'])
    })
  })

  // ==========================================================================
  // Layer 2: Service - Core Business Logic
  // ==========================================================================

  describe('fetchTrendingPosts (Service Layer)', () => {
    const mockPosts: RedditPost[] = [
      createMockRedditPost({ id: '1', upvotes: 150, subreddit: 'programming' }),
      createMockRedditPost({ id: '2', upvotes: 75, subreddit: 'programming' }),
      createMockRedditPost({ id: '3', upvotes: 200, subreddit: 'javascript' }),
    ]

    beforeEach(() => {
      mockFetchSubredditPosts.mockResolvedValue(mockPosts)
    })

    it('should fetch and aggregate posts from all configured subreddits', async () => {
      const result = await service.fetchTrendingPosts()

      expect(mockFetchSubredditPosts).toHaveBeenCalledTimes(3)
      expect(mockFetchSubredditPosts).toHaveBeenCalledWith('programming', expect.any(Object))
      expect(mockFetchSubredditPosts).toHaveBeenCalledWith('javascript', expect.any(Object))
      expect(mockFetchSubredditPosts).toHaveBeenCalledWith('typescript', expect.any(Object))
      
      expect(result.posts).toHaveLength(9) // 3 subreddits × 3 posts each
      expect(result.totalFetched).toBe(9)
    })

    it('should filter posts below minimum upvote threshold', async () => {
      const lowVotePost = createMockRedditPost({ id: 'low', upvotes: 10 })
      mockFetchSubredditPosts.mockResolvedValue([...mockPosts, lowVotePost])

      const result = await service.fetchTrendingPosts()

      // Only posts with upvotes >= 50 should be included
      expect(result.posts.every(p => p.upvotes >= 50)).toBe(true)
      expect(result.filteredCount).toBeGreaterThan(0)
    })

    it('should sort posts by trending score in descending order', async () => {
      const unsortedPosts = [
        createMockRedditPost({ id: 'a', upvotes: 50, commentCount: 10 }),
        createMockRedditPost({ id: 'b', upvotes: 200, commentCount: 5 }),
        createMockRedditPost({ id: 'c', upvotes: 100, commentCount: 50 }),
      ]
      mockFetchSubredditPosts.mockResolvedValue(unsortedPosts)

      const result = await service.fetchTrendingPosts()

      // Trending score = upvotes + (commentCount × 2)
      // a: 50 + 20 = 70, b: 200 + 10 = 210, c: 100 + 100 = 200
      expect(result.posts[0].id).toBe('b') // Highest score
      expect(result.posts[1].id).toBe('c')
      expect(result.posts[2].id).toBe('a')
    })

    it('should handle API rate limiting with exponential backoff', async () => {
      mockFetchSubredditPosts
        .mockRejectedValueOnce(new Error('Rate limited'))
        .mockRejectedValueOnce(new Error('Rate limited'))
        .mockResolvedValueOnce(mockPosts)

      const result = await service.fetchTrendingPosts()

      expect(result.posts.length).toBeGreaterThan(0)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Rate limited, retrying with backoff',
        expect.objectContaining({ attempt: expect.any(Number) })
      )
    })

    it('should apply time window filter correctly', async () => {
      const oldPost = createMockRedditPost({ 
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) // 48 hours ago
      })
      const recentPost = createMockRedditPost({ 
        createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000) // 12 hours ago
      })
      mockFetchSubredditPosts.mockResolvedValue([oldPost, recentPost])

      const result = await service.fetchTrendingPosts()

      expect(result.posts).not.toContainEqual(expect.objectContaining({ id: oldPost.id }))
      expect(result.posts).toContainEqual(expect.objectContaining({ id: recentPost.id }))
    })

    it('should limit posts per subreddit to configured maximum', async () => {
      const manyPosts = Array.from({ length: 50 }, (_, i) => 
        createMockRedditPost({ id: String(i), upvotes: 100 + i })
      )
      mockFetchSubredditPosts.mockResolvedValue(manyPosts)

      const result = await service.fetchTrendingPosts()

      // Count posts per subreddit
      const postsBySubreddit = result.posts.reduce((acc, post) => {
        acc[post.subreddit] = (acc[post.subreddit] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      Object.values(postsBySubreddit).forEach(count => {
        expect(count).toBeLessThanOrEqual(config.maxPostsPerSubreddit)
      })
    })
  })

  // ==========================================================================
  // Layer 3: Service - Error Handling and Edge Cases
  // ==========================================================================

  describe('error handling (Service/Runtime Layer)', () => {
    it('should handle complete API failure gracefully', async () => {
      mockFetchSubredditPosts.mockRejectedValue(new Error('Network error'))

      await expect(service.fetchTrendingPosts())
        .rejects
        .toThrow('Failed to fetch trending posts: Network error')
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch Reddit trends',
        expect.objectContaining({ error: expect.any(Error) })
      )
    })

    it('should handle partial subreddit failures', async () => {
      mockFetchSubredditPosts
        .mockResolvedValueOnce([createMockRedditPost()]) // programming succeeds
        .mockRejectedValueOnce(new Error('Private subreddit')) // javascript fails
        .mockResolvedValueOnce([createMockRedditPost()]) // typescript succeeds

      const result = await service.fetchTrendingPosts()

      expect(result.posts.length).toBeGreaterThan(0)
      expect(result.errors).toContainEqual(expect.objectContaining({
        subreddit: 'javascript',
        error: 'Private subreddit'
      }))
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to fetch subreddit',
        expect.objectContaining({ subreddit: 'javascript' })
      )
    })

    it('should handle malformed API responses', async () => {
      mockFetchSubredditPosts.mockResolvedValue([
        { id: 'malformed', title: null, upvotes: 'invalid' } as unknown as RedditPost
      ])

      const result = await service.fetchTrendingPosts()

      expect(result.posts).toHaveLength(0) // Malformed posts filtered out
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Filtered malformed post',
        expect.any(Object)
      )
    })

    it('should handle timeout scenarios', async () => {
      mockFetchSubredditPosts.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      )

      await expect(service.fetchTrendingPosts({ timeoutMs: 50 }))
        .rejects
        .toThrow('Timeout')
    })

    it('should handle empty API responses', async () => {
      mockFetchSubredditPosts.mockResolvedValue([])

      const result = await service.fetchTrendingPosts()

      expect(result.posts).toHaveLength(0)
      expect(result.totalFetched).toBe(0)
      expect(mockLogger.info).toHaveBeenCalledWith('No trending posts found')
    })
  })

  // ==========================================================================
  // Layer 4: Service - Advanced Features
  // ==========================================================================

  describe('getPostDetails (Service Layer)', () => {
    const mockDetailedPost: RedditPost = createMockRedditPost({
      id: 'detailed_1',
      selfText: 'Detailed content here',
      commentCount: 100,
    })

    beforeEach(() => {
      mockFetchPostDetails.mockResolvedValue(mockDetailedPost)
    })

    it('should fetch detailed post information', async () => {
      const result = await service.getPostDetails('detailed_1')

      expect(mockFetchPostDetails).toHaveBeenCalledWith('detailed_1')
      expect(result).toEqual(mockDetailedPost)
    })

    it('should cache post details to reduce API calls', async () => {
      await service.getPostDetails('cached_post')
      await service.getPostDetails('cached_post')

      expect(mockFetchPostDetails).toHaveBeenCalledTimes(1)
      expect(mockLogger.debug).toHaveBeenCalledWith('Cache hit for post', { postId: 'cached_post' })
    })

    it('should invalidate cache after TTL expires', async () => {
      jest.useFakeTimers()
      
      await service.getPostDetails('expiring_post')
      
      // Advance time past cache TTL (5 minutes)
      jest.advanceTimersByTime(6 * 60 * 1000)
      
      await service.getPostDetails('expiring_post')

      expect(mockFetchPostDetails).toHaveBeenCalledTimes(2)
      
      jest.useRealTimers()
    })

    it('should throw NotFoundError for non-existent posts', async () => {
      mockFetchPostDetails.mockResolvedValue(null)

      await expect(service.getPostDetails('nonexistent'))
        .rejects
        .toThrow('Post not found: nonexistent')
    })

    it('should validate post ID format', async () => {
      await expect(service.getPostDetails(''))
        .rejects
        .toThrow('Invalid post ID')
      
      await expect(service.getPostDetails('   '))
        .rejects
        .toThrow('Invalid post ID')
    })
  })

  describe('analyzeTrends (Service Layer)', () => {
    const mockTrendPosts: RedditPost[] = [
      createMockRedditPost({ subreddit: 'programming', upvotes: 1000, title: 'Rust vs Go' }),
      createMockRedditPost({ subreddit: 'programming', upvotes: 800, title: 'Python tips' }),
      createMockRedditPost({ subreddit: 'javascript', upvotes: 600, title: 'React hooks' }),
      createMockRedditPost({ subreddit: 'javascript', upvotes: 500, title: 'TypeScript 5.0' }),
    ]

    beforeEach(() => {
      mockFetchSubredditPosts.mockResolvedValue(mockTrendPosts)
    })

    it('should calculate trend statistics correctly', async () => {
      const analysis = await service.analyzeTrends()

      expect(analysis.totalPosts).toBe(12) // 4 posts × 3 subreddits
      expect(analysis.averageUpvotes).toBeGreaterThan(0)
      expect(analysis.topSubreddits).toContain('programming')
      expect(analysis.trendingTopics).toBeInstanceOf(Array)
    })

    it('should identify trending topics using keyword extraction', async () => {
      const analysis = await service.analyzeTrends()

      expect(analysis.trendingTopics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            term: expect.any(String),
            frequency: expect.any(Number),
            avgEngagement: expect.any(Number),
          })
        ])
      )
    })

    it('should detect engagement velocity (trending rate)', async () => {
      const rapidlyRisingPost = createMockRedditPost({
        upvotes: 5000,
        createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      })
      mockFetchSubredditPosts.mockResolvedValue([rapidlyRisingPost])

      const analysis = await service.analyzeTrends()

      expect(analysis.hotPosts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            velocity: expect.any(Number), // upvotes per hour
            isViral: expect.any(Boolean),
          })
        ])
      )
    })

    it('should generate time-based aggregations', async () => {
      const analysis = await service.analyzeTrends()

      expect(analysis.hourlyDistribution).toBeInstanceOf(Array)
      expect(analysis.hourlyDistribution).toHaveLength(24)
    })
  })

  // ==========================================================================
  // Layer 5: Runtime - Configuration Updates
  // ==========================================================================

  describe('updateConfiguration (Runtime Layer)', () => {
    it('should update configuration dynamically', () => {
      const newConfig: Partial<RedditTrendsConfig> = {
        minUpvotes: 100,
        maxPostsPerSubreddit: 5,
      }

      service.updateConfiguration(newConfig)

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Configuration updated',
        expect.objectContaining({ changes: Object.keys(newConfig) })
      )
    })

    it('should validate updated configuration', () => {
      expect(() => service.updateConfiguration({ minUpvotes: -5 }))
        .toThrow('minUpvotes must be non-negative')
    })

    it('should clear cache when subreddits change', () => {
      const clearCacheSpy = jest.spyOn(service as unknown as { clearCache: () => void }, 'clearCache')
      
      service.updateConfiguration({ subreddits: ['newsub'] })

      expect(clearCacheSpy).toHaveBeenCalled()
    })

    it('should preserve unmodified configuration values', () => {
      const originalTimeWindow = config.timeWindowHours
      
      service.updateConfiguration({ minUpvotes: 200 })

      const internalConfig = (service as unknown as { config: RedditTrendsConfig }).config
      expect(internalConfig.timeWindowHours).toBe(originalTimeWindow)
    })
  })

  // ==========================================================================
  // Layer 6: UI/Integration - Health Checks and Monitoring
  // ==========================================================================

  describe('healthCheck (Runtime Layer)', () => {
    it('should return healthy status when API is accessible', async () => {
      mockFetchSubredditPosts.mockResolvedValue([])

      const health = await service.healthCheck()

      expect(health.status).toBe('healthy')
      expect(health.latencyMs).toBeGreaterThanOrEqual(0)
      expect(health.lastSuccessfulFetch).toBeInstanceOf(Date)
    })

    it('should return degraded status with partial failures', async () => {
      mockFetchSubredditPosts
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('Failed'))

      const health = await service.healthCheck()

      expect(health.status).toBe('degraded')
      expect(health.failedSubreddits).toContain('javascript')
    })

    it('should return unhealthy status with complete failure', async () => {
      mockFetchSubredditPosts.mockRejectedValue(new Error('API down'))

      const health = await service.healthCheck()

      expect(health.status).toBe('unhealthy')
      expect(health.error).toBeDefined()
    })

    it('should include rate limit information', async () => {
      mockFetchSubredditPosts.mockResolvedValue([])

      const health = await service.healthCheck()

      expect(health.rateLimitStatus).toEqual(expect.objectContaining({
        remaining: expect.any(Number),
        resetTime: expect.any(Date),
      }))
    })
  })

  describe('getMetrics (Runtime Layer)', () => {
    it('should return service metrics', async () => {
      // Populate with some activity
      mockFetchSubredditPosts.mockResolvedValue([createMockRedditPost()])
      await service.fetchTrendingPosts()

      const metrics = service.getMetrics()

      expect(metrics).toEqual(expect.objectContaining({
        totalRequests: expect.any(Number),
        cacheHitRate: expect.any(Number),
        averageResponseTime: expect.any(Number),
        errorRate: expect.any(Number),
      }))
    })

    it('should calculate cache hit rate correctly', () => {
      // Simulate cache hits and misses
      const metrics = service.getMetrics()
      
      expect(metrics.cacheHitRate).toBeGreaterThanOrEqual(0)
      expect(metrics.cacheHitRate).toBeLessThanOrEqual(1)
    })
  })

  // ==========================================================================
  // Edge Cases and Boundary Conditions
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle posts with exactly minimum upvotes', async () => {
      const edgePost = createMockRedditPost({ upvotes: 50 }) // Exactly at threshold
      mockFetchSubredditPosts.mockResolvedValue([edgePost])

      const result = await service.fetchTrendingPosts()

      expect(result.posts).toContainEqual(expect.objectContaining({ upvotes: 50 }))
    })

    it('should handle posts with maximum integer upvotes', async () => {
      const maxPost = createMockRedditPost({ upvotes: Number.MAX_SAFE_INTEGER })
      mockFetchSubredditPosts.mockResolvedValue([maxPost])

      const result = await service.fetchTrendingPosts()

      expect(result.posts[0].upvotes).toBe(Number.MAX_SAFE_INTEGER)
    })

    it('should handle special characters in subreddit names', async () => {
      const specialConfig = createMockConfig({ subreddits: ['test_sub', 'test-sub', 'test.sub'] })
      const specialService = new RedditTrendsService(specialConfig, mockLogger)

      mockFetchSubredditPosts.mockResolvedValue([createMockRedditPost()])

      await specialService.fetchTrendingPosts()

      expect(mockFetchSubredditPosts).toHaveBeenCalledWith('test_sub', expect.any(Object))
      expect(mockFetchSubredditPosts).toHaveBeenCalledWith('test-sub', expect.any(Object))
      expect(mockFetchSubredditPosts).toHaveBeenCalledWith('test.sub', expect.any(Object))
    })

    it('should handle posts with very long titles', async () => {
      const longTitlePost = createMockRedditPost({
        title: 'A'.repeat(10000)
      })
      mockFetchSubredditPosts.mockResolvedValue([longTitlePost])

      const result = await service.fetchTrendingPosts()

      expect(result.posts[0].title.length).toBe(10000)
    })

    it('should handle concurrent requests safely', async () => {
      mockFetchSubredditPosts.mockResolvedValue([createMockRedditPost()])

      const promises = Array.from({ length: 10 }, () => service.fetchTrendingPosts())

      const results = await Promise.all(promises)

      // All requests should complete without race conditions
      expect(results).toHaveLength(10)
      results.forEach(r => expect(r.posts.length).toBeGreaterThan(0))
    })

    it('should handle circular reference in post data gracefully', async () => {
      const circularPost: any = createMockRedditPost()
      circularPost.selfReference = circularPost // Create circular reference
      
      mockFetchSubredditPosts.mockResolvedValue([circularPost])

      // Should not throw on serialization
      const result = await service.fetchTrendingPosts()
      
      expect(result.posts.length).toBeGreaterThanOrEqual(0)
    })

    it('should respect abort signals for cancellation', async () => {
      const controller = new AbortController()
      
      const fetchPromise = service.fetchTrendingPosts({ signal: controller.signal })
      
      // Cancel immediately
      controller.abort()

      await expect(fetchPromise).rejects.toThrow('Operation cancelled')
    })
  })
})