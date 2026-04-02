// Types Layer
import type { Result } from '$lib/utils/functional';
import type { RedditPost, RedditTrendsConfig } from './types';

// Service Layer - Unit Tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedditTrendsService } from './RedditTrendsService';
import { RedditTrendsError } from './errors';
import { Err, Ok } from '$lib/utils/functional';

// Mock dependencies
const mockLogger = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	child: vi.fn().mockReturnThis()
};

const mockRedditClient = {
	fetchSubredditPosts: vi.fn()
};

const mockCache = {
	get: vi.fn(),
	set: vi.fn()
};

describe('RedditTrendsService', () => {
	let service: RedditTrendsService;

	const defaultConfig: RedditTrendsConfig = {
		subreddits: ['technology', 'programming'],
		postLimit: 10,
		minUpvotes: 100,
		cacheTtlSeconds: 300
	};

	beforeEach(() => {
		vi.clearAllMocks();
		service = new RedditTrendsService({
			config: defaultConfig,
			redditClient: mockRedditClient,
			cache: mockCache,
			logger: mockLogger
		});
	});

	describe('constructor', () => {
		it('should create service with valid dependencies', () => {
			expect(service).toBeInstanceOf(RedditTrendsService);
		});

		it('should throw when config is invalid', () => {
			expect(() => {
				new RedditTrendsService({
					config: { ...defaultConfig, subreddits: [] },
					redditClient: mockRedditClient,
					cache: mockCache,
					logger: mockLogger
				});
			}).toThrow(RedditTrendsError);
		});

		it('should throw when required dependencies are missing', () => {
			expect(() => {
				new RedditTrendsService({
					config: defaultConfig,
					redditClient: null as any,
					cache: mockCache,
					logger: mockLogger
				});
			}).toThrow(RedditTrendsError);
		});
	});

	describe('getTrendingPosts', () => {
		const mockPosts: RedditPost[] = [
			{
				id: 'post1',
				title: 'Test Post 1',
				subreddit: 'technology',
				upvotes: 1500,
				commentCount: 45,
				createdAt: new Date('2024-01-15'),
				url: 'https://reddit.com/r/technology/post1',
				author: 'user1'
			},
			{
				id: 'post2',
				title: 'Test Post 2',
				subreddit: 'programming',
				upvotes: 800,
				commentCount: 23,
				createdAt: new Date('2024-01-14'),
				url: 'https://reddit.com/r/programming/post2',
				author: 'user2'
			}
		];

		it('should return cached results when available', async () => {
			// Arrange: Cache hit scenario
			mockCache.get.mockReturnValue(Ok(mockPosts));

			// Act
			const result = await service.getTrendingPosts();

			// Assert
			expect(result.isOk()).toBe(true);
			expect(result.unwrap()).toEqual(mockPosts);
			expect(mockCache.get).toHaveBeenCalledWith('reddit:trending:technology,programming');
			expect(mockRedditClient.fetchSubredditPosts).not.toHaveBeenCalled();
			expect(mockLogger.debug).toHaveBeenCalledWith(
				expect.objectContaining({ cacheHit: true }),
				'Cache hit for trending posts'
			);
		});

		it('should fetch from API and cache on cache miss', async () => {
			// Arrange: Cache miss, API success
			mockCache.get.mockReturnValue(Err(new Error('Cache miss')));
			mockRedditClient.fetchSubredditPosts
				.mockResolvedValueOnce(Ok([mockPosts[0]]))
				.mockResolvedValueOnce(Ok([mockPosts[1]]));
			mockCache.set.mockReturnValue(Ok(undefined));

			// Act
			const result = await service.getTrendingPosts();

			// Assert
			expect(result.isOk()).toBe(true);
			const posts = result.unwrap();
			expect(posts).toHaveLength(2);
			expect(posts[0].id).toBe('post1');
			expect(mockRedditClient.fetchSubredditPosts).toHaveBeenCalledTimes(2);
			expect(mockCache.set).toHaveBeenCalledWith(
				'reddit:trending:technology,programming',
				expect.any(Array),
				defaultConfig.cacheTtlSeconds
			);
		});

		it('should filter posts by minimum upvotes', async () => {
			// Arrange: Posts with varying upvote counts
			const unfilteredPosts: RedditPost[] = [
				{ ...mockPosts[0], upvotes: 50 }, // Below threshold
				{ ...mockPosts[1], upvotes: 200 }  // Above threshold
			];
			mockCache.get.mockReturnValue(Err(new Error('Cache miss')));
			mockRedditClient.fetchSubredditPosts
				.mockResolvedValueOnce(Ok([unfilteredPosts[0]]))
				.mockResolvedValueOnce(Ok([unfilteredPosts[1]]));

			// Act
			const result = await service.getTrendingPosts();

			// Assert: Only post with 200 upvotes should remain
			expect(result.isOk()).toBe(true);
			const posts = result.unwrap();
			expect(posts).toHaveLength(1);
			expect(posts[0].upvotes).toBe(200);
		});

		it('should sort posts by upvotes descending', async () => {
			// Arrange: Posts in wrong order
			const unsortedPosts: RedditPost[] = [
				{ ...mockPosts[0], upvotes: 100 },
				{ ...mockPosts[1], upvotes: 1000 }
			];
			mockCache.get.mockReturnValue(Err(new Error('Cache miss')));
			mockRedditClient.fetchSubredditPosts.mockResolvedValue(Ok(unsortedPosts));

			// Act
			const result = await service.getTrendingPosts();

			// Assert
			const posts = result.unwrap();
			expect(posts[0].upvotes).toBe(1000);
			expect(posts[1].upvotes).toBe(100);
		});

		it('should limit total posts to configured limit', async () => {
			// Arrange: More posts than limit
			const manyPosts = Array.from({ length: 20 }, (_, i) => ({
				...mockPosts[0],
				id: `post${i}`,
				upvotes: 1000 - i
			}));
			mockCache.get.mockReturnValue(Err(new Error('Cache miss')));
			mockRedditClient.fetchSubredditPosts.mockResolvedValue(Ok(manyPosts));

			// Act
			const result = await service.getTrendingPosts();

			// Assert
			expect(result.unwrap()).toHaveLength(defaultConfig.postLimit);
		});

		it('should handle partial subreddit failures gracefully', async () => {
			// Arrange: One subreddit fails, one succeeds
			mockCache.get.mockReturnValue(Err(new Error('Cache miss')));
			mockRedditClient.fetchSubredditPosts
				.mockResolvedValueOnce(Ok([mockPosts[0]]))
				.mockResolvedValueOnce(Err(new Error('API Error')));

			// Act
			const result = await service.getTrendingPosts();

			// Assert: Should return posts from successful subreddit
			expect(result.isOk()).toBe(true);
			expect(result.unwrap()).toHaveLength(1);
			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.objectContaining({ subreddit: 'programming' }),
				'Failed to fetch posts from subreddit, continuing with partial results'
			);
		});

		it('should return error when all subreddits fail', async () => {
			// Arrange: All subreddits fail
			mockCache.get.mockReturnValue(Err(new Error('Cache miss')));
			mockRedditClient.fetchSubredditPosts.mockResolvedValue(Err(new Error('API Error')));

			// Act
			const result = await service.getTrendingPosts();

			// Assert
			expect(result.isErr()).toBe(true);
			const error = result.unwrapErr();
			expect(error).toBeInstanceOf(RedditTrendsError);
			expect(error.code).toBe('FETCH_FAILED');
		});

		it('should handle empty results from all subreddits', async () => {
			// Arrange: No posts returned
			mockCache.get.mockReturnValue(Err(new Error('Cache miss')));
			mockRedditClient.fetchSubredditPosts.mockResolvedValue(Ok([]));

			// Act
			const result = await service.getTrendingPosts();

			// Assert
			expect(result.isOk()).toBe(true);
			expect(result.unwrap()).toEqual([]);
			expect(mockLogger.info).toHaveBeenCalledWith(
				expect.objectContaining({ totalPosts: 0 }),
				'No trending posts found matching criteria'
			);
		});

		it('should handle cache set failures gracefully', async () => {
			// Arrange: Cache set fails but fetch succeeds
			mockCache.get.mockReturnValue(Err(new Error('Cache miss')));
			mockRedditClient.fetchSubredditPosts.mockResolvedValue(Ok([mockPosts[0]]));
			mockCache.set.mockReturnValue(Err(new Error('Redis connection failed')));

			// Act
			const result = await service.getTrendingPosts();

			// Assert: Should still return results despite cache failure
			expect(result.isOk()).toBe(true);
			expect(result.unwrap()).toHaveLength(1);
			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.objectContaining({ error: expect.any(Error) }),
				'Failed to cache trending posts'
			);
		});
	});

	describe('getPostsBySubreddit', () => {
		it('should fetch posts for single subreddit', async () => {
			// Arrange
			const subredditPosts = [{ id: 'post1', title: 'Test', upvotes: 500 }];
			mockRedditClient.fetchSubredditPosts.mockResolvedValue(Ok(subredditPosts));

			// Act
			const result = await (service as any).getPostsBySubreddit('technology');

			// Assert
			expect(result.isOk()).toBe(true);
			expect(result.unwrap()).toEqual(subredditPosts);
		});

		it('should validate subreddit name', async () => {
			// Act & Assert
			const result = await (service as any).getPostsBySubreddit('');
			expect(result.isErr()).toBe(true);
		});
	});

	describe('calculateTrendScore', () => {
		it('should calculate higher score for recent posts with engagement', () => {
			// Arrange
			const recentPost: RedditPost = {
				...mockPosts[0],
				upvotes: 1000,
				commentCount: 100,
				createdAt: new Date() // Now
			};

			const oldPost: RedditPost = {
				...mockPosts[0],
				upvotes: 1000,
				commentCount: 100,
				createdAt: new Date(Date.now() - 86400000 * 7) // 7 days ago
			};

			// Act
			const recentScore = (service as any).calculateTrendScore(recentPost);
			const oldScore = (service as any).calculateTrendScore(oldPost);

			// Assert: Recent post should have higher score
			expect(recentScore).toBeGreaterThan(oldScore);
		});

		it('should weight comments in trend calculation', () => {
			// Arrange: Same upvotes, different comment counts
			const highEngagement: RedditPost = {
				...mockPosts[0],
				upvotes: 1000,
				commentCount: 500
			};

			const lowEngagement: RedditPost = {
				...mockPosts[0],
				upvotes: 1000,
				commentCount: 10
			};

			// Act
			const highScore = (service as any).calculateTrendScore(highEngagement);
			const lowScore = (service as any).calculateTrendScore(lowEngagement);

			// Assert
			expect(highScore).toBeGreaterThan(lowScore);
		});
	});

	describe('error handling', () => {
		it('should wrap unexpected errors in RedditTrendsError', async () => {
			// Arrange: Unexpected error type
			mockCache.get.mockImplementation(() => {
				throw new TypeError('Unexpected type');
			});

			// Act
			const result = await service.getTrendingPosts();

			// Assert
			expect(result.isErr()).toBe(true);
			const error = result.unwrapErr();
			expect(error).toBeInstanceOf(RedditTrendsError);
			expect(error.code).toBe('UNEXPECTED_ERROR');
			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.objectContaining({ originalError: expect.any(TypeError) }),
				'Unexpected error in RedditTrendsService'
			);
		});
	});
});