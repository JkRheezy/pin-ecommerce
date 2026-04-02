/**
 * Reddit Trends Service Interface
 * 
 * Layer: Service (Layer 4)
 * 
 * Provides an abstraction for fetching and analyzing trending content from Reddit.
 * This service follows the six-layer architecture and delegates actual API calls
 * to the Repo layer implementations.
 */

import { Result, ok, err } from 'neverthrow';
import { z } from 'zod';
import { StructuredLogger } from '@/lib/logging/StructuredLogger';

// ============================================================================
// TYPES (Layer 1) - Domain types for Reddit trends
// ============================================================================

/**
 * Unique identifier for a Reddit post
 */
export type RedditPostId = string & { readonly __brand: 'RedditPostId' };

/**
 * Subreddit name (without r/ prefix)
 */
export type SubredditName = string & { readonly __brand: 'SubredditName' };

/**
 * Trending score calculation method
 */
export enum TrendingScoreMethod {
  HOT = 'hot',
  TOP = 'top',
  RISING = 'rising',
  CONTROVERSIAL = 'controversial',
}

/**
 * Time window for trend analysis
 */
export enum TrendWindow {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
  ALL = 'all',
}

/**
 * Core Reddit post data structure
 */
export interface RedditPost {
  readonly id: RedditPostId;
  readonly title: string;
  readonly subreddit: SubredditName;
  readonly author: string;
  readonly score: number;
  readonly commentCount: number;
  readonly upvoteRatio: number;
  readonly createdAt: Date;
  readonly url: string;
  readonly permalink: string;
  readonly isSelf: boolean;
  readonly selfText?: string;
  readonly thumbnailUrl?: string;
  readonly awards: number;
  readonly crosspostCount: number;
}

/**
 * Aggregated trend data for a subreddit or topic
 */
export interface TrendSnapshot {
  readonly timestamp: Date;
  readonly window: TrendWindow;
  readonly posts: ReadonlyArray<RedditPost>;
  readonly topSubreddits: ReadonlyArray<SubredditTrend>;
  readonly emergingTopics: ReadonlyArray<EmergingTopic>;
  readonly averageEngagement: number;
}

/**
 * Trend data for a specific subreddit
 */
export interface SubredditTrend {
  readonly name: SubredditName;
  readonly postCount: number;
  readonly totalScore: number;
  readonly totalComments: number;
  readonly trendingScore: number;
  readonly growthRate: number; // Percentage change from previous window
}

/**
 * Emerging topic detection result
 */
export interface EmergingTopic {
  readonly topic: string;
  readonly mentionCount: number;
  readonly relatedSubreddits: ReadonlyArray<SubredditName>;
  readonly sentimentScore: number; // -1 to 1
  readonly velocity: number; // Posts per hour
}

/**
 * Error types specific to Reddit trends operations
 */
export enum RedditTrendsErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_SUBREDDIT = 'INVALID_SUBREDDIT',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  PARSING_ERROR = 'PARSING_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

export class RedditTrendsError extends Error {
  constructor(
    public readonly code: RedditTrendsErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'RedditTrendsError';
  }
}

// ============================================================================
// CONFIG (Layer 2) - Configuration schemas
// ============================================================================

/**
 * Configuration for Reddit API interactions
 */
export const RedditConfigSchema = z.object({
  baseUrl: z.string().url().default('https://oauth.reddit.com'),
  authUrl: z.string().url().default('https://www.reddit.com/api/v1/access_token'),
  userAgent: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  rateLimitRequestsPerMinute: z.number().int().positive().default(60),
  defaultTimeoutMs: z.number().int().positive().default(30000),
  maxRetries: z.number().int().nonnegative().default(3),
  cacheTtlSeconds: z.number().int().positive().default(300),
});

export type RedditConfig = z.infer<typeof RedditConfigSchema>;

/**
 * Options for fetching trending posts
 */
export const FetchTrendsOptionsSchema = z.object({
  subreddits: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).default(25),
  window: z.nativeEnum(TrendWindow).default(TrendWindow.DAY),
  scoreMethod: z.nativeEnum(TrendingScoreMethod).default(TrendingScoreMethod.HOT),
  includeNsfw: z.boolean().default(false),
  minScore: z.number().int().nonnegative().default(0),
});

export type FetchTrendsOptions = z.infer<typeof FetchTrendsOptionsSchema>;

// ============================================================================
// SERVICE INTERFACE (Layer 4) - Main service contract
// ============================================================================

/**
 * Result type for all service operations
 */
export type RedditTrendsResult<T> = Result<T, RedditTrendsError>;

/**
 * Reddit Trends Service Interface
 * 
 * Defines the contract for fetching and analyzing Reddit trending content.
 * Implementations should handle caching, rate limiting, and error recovery.
 */
export interface IRedditTrendsService {
  /**
   * Fetch trending posts based on provided options
   * 
   * @param options - Filter and pagination options
   * @returns Promise resolving to posts or error
   */
  fetchTrendingPosts(
    options: FetchTrendsOptions
  ): Promise<RedditTrendsResult<ReadonlyArray<RedditPost>>>;

  /**
   * Get a comprehensive trend snapshot across Reddit or specific subreddits
   * 
   * @param window - Time window for analysis
   * @param subreddits - Optional subreddit filter (empty = all)
   * @returns Promise resolving to trend snapshot or error
   */
  getTrendSnapshot(
    window: TrendWindow,
    subreddits?: ReadonlyArray<SubredditName>
  ): Promise<RedditTrendsResult<TrendSnapshot>>;

  /**
   * Analyze emerging topics from recent posts
   * 
   * Uses TF-IDF and velocity calculations to detect rising topics
   * 
   * @param window - Time window for analysis
   * @param minMentions - Minimum mentions to be considered emerging
   * @returns Promise resolving to emerging topics or error
   */
  analyzeEmergingTopics(
    window: TrendWindow,
    minMentions?: number
  ): Promise<RedditTrendsResult<ReadonlyArray<EmergingTopic>>>;

  /**
   * Get trending subreddits with growth metrics
   * 
   * @param limit - Maximum number of subreddits to return
   * @returns Promise resolving to subreddit trends or error
   */
  getTrendingSubreddits(
    limit: number
  ): Promise<RedditTrendsResult<ReadonlyArray<SubredditTrend>>>;

  /**
   * Search for posts matching a query with trend analysis
   * 
   * @param query - Search query
   * @param options - Search options
   * @returns Promise resolving to matching posts or error
   */
  searchWithTrendAnalysis(
    query: string,
    options: FetchTrendsOptions
  ): Promise<RedditTrendsResult<ReadonlyArray<RedditPost>>>;

  /**
   * Get historical trend data for a specific topic or subreddit
   * 
   * @param target - Topic string or subreddit name
   * @param windows - Array of time windows to compare
   * @returns Promise resolving to historical comparison or error
   */
  getHistoricalTrends(
    target: string | SubredditName,
    windows: ReadonlyArray<TrendWindow>
  ): Promise<RedditTrendsResult<Map<TrendWindow, TrendSnapshot>>>;
}

// ============================================================================
// ABSTRACT BASE CLASS - Common functionality for implementations
// ============================================================================

/**
 * Abstract base class for Reddit Trends Service implementations
 * 
 * Provides common validation, logging, and error handling logic.
 * Concrete implementations must provide the actual API interaction.
 */
export abstract class BaseRedditTrendsService implements IRedditTrendsService {
  protected readonly logger: StructuredLogger;
  protected readonly config: RedditConfig;

  constructor(config: RedditConfig, logger: StructuredLogger) {
    // Validate configuration at construction time
    const validation = RedditConfigSchema.safeParse(config);
    if (!validation.success) {
      throw new RedditTrendsError(
        RedditTrendsErrorCode.PARSING_ERROR,
        `Invalid Reddit configuration: ${validation.error.message}`
      );
    }
    
    this.config = validation.data;
    this.logger = logger.child({ service: 'RedditTrendsService' });
  }

  /**
   * Validates fetch options and returns normalized version
   */
  protected validateOptions(
    options: unknown
  ): Result<FetchTrendsOptions, RedditTrendsError> {
    const result = FetchTrendsOptionsSchema.safeParse(options);
    
    if (!result.success) {
      return err(
        new RedditTrendsError(
          RedditTrendsErrorCode.PARSING_ERROR,
          `Invalid fetch options: ${result.error.message}`
        )
      );
    }

    return ok(result.data);
  }

  /**
   * Creates a branded RedditPostId from string
   */
  protected toPostId(id: string): RedditPostId {
    return id as RedditPostId;
  }

  /**
   * Creates a branded SubredditName from string
   */
  protected toSubredditName(name: string): SubredditName {
    // Normalize: remove r/ prefix if present, lowercase
    const normalized = name.replace(/^r\//i, '').toLowerCase();
    return normalized as SubredditName;
  }

  /**
   * Calculates trending score using configurable algorithm
   * 
   * Uses a weighted combination of score velocity, comment engagement,
   * and cross-platform spread (awards, crossposts)
   */
  protected calculateTrendingScore(post: RedditPost, windowHours: number): number {
    const ageHours = (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60);
    
    // Avoid division by zero and extreme values for very new posts
    const normalizedAge = Math.max(ageHours, 0.5);
    
    // Score velocity: points per hour
    const scoreVelocity = post.score / normalizedAge;
    
    // Engagement rate: comments per score point (higher = more discussion)
    const engagementRate = post.commentCount / Math.max(post.score, 1);
    
    // Cross-platform spread indicator
    const spreadFactor = Math.log1p(post.awards) + Math.log1p(post.crosspostCount);
    
    // Weighted combination - newer posts with high engagement score higher
    const trendingScore = 
      (scoreVelocity * 0.5) +                    // Velocity matters most
      (engagementRate * post.score * 0.3) +      // Discussion engagement
      (spreadFactor * 100 * 0.2);                // Viral spread indicator
    
    // Normalize by window size for fair comparison across windows
    return trendingScore / Math.sqrt(windowHours);
  }

  /**
   * Abstract methods to be implemented by concrete classes
   */
  abstract fetchTrendingPosts(
    options: FetchTrendsOptions
  ): Promise<RedditTrendsResult<ReadonlyArray<RedditPost>>>;

  abstract getTrendSnapshot(
    window: TrendWindow,
    subreddits?: ReadonlyArray<SubredditName>
  ): Promise<RedditTrendsResult<TrendSnapshot>>;

  abstract analyzeEmergingTopics(
    window: TrendWindow,
    minMentions?: number
  ): Promise<RedditTrendsResult<ReadonlyArray<EmergingTopic>>>;

  abstract getTrendingSubreddits(
    limit: number
  ): Promise<RedditTrendsResult<ReadonlyArray<SubredditTrend>>>;

  abstract searchWithTrendAnalysis(
    query: string,
    options: FetchTrendsOptions
  ): Promise<RedditTrendsResult<ReadonlyArray<RedditPost>>>;

  abstract getHistoricalTrends(
    target: string | SubredditName,
    windows: ReadonlyArray<TrendWindow>
  ): Promise<RedditTrendsResult<Map<TrendWindow, TrendSnapshot>>>;

  /**
   * Protected helper for consistent error handling
   */
  protected handleError(
    code: RedditTrendsErrorCode,
    message: string,
    cause?: unknown
  ): RedditTrendsError {
    this.logger.error({
      code,
      message,
      cause: cause instanceof Error ? cause.message : cause,
    }, 'Reddit trends operation failed');

    return new RedditTrendsError(code, message, cause);
  }
}

// ============================================================================
// FACTORY - Service instantiation
// ============================================================================

/**
 * Factory type for creating RedditTrendsService instances
 */
export type RedditTrendsServiceFactory = (
  config: RedditConfig,
  logger: StructuredLogger
) => IRedditTrendsService;

// ============================================================================
// MOCK IMPLEMENTATION - For testing purposes
// ============================================================================

/**
 * Mock implementation for unit testing
 * 
 * Returns deterministic fake data based on input parameters
 */
export class MockRedditTrendsService extends BaseRedditTrendsService {
  private readonly mockPosts: ReadonlyArray<RedditPost>;

  constructor(
    config: RedditConfig,
    logger: StructuredLogger,
    mockPosts?: ReadonlyArray<RedditPost>
  ) {
    super(config, logger);
    this.mockPosts = mockPosts ?? this.generateMockPosts();
  }

  private generateMockPosts(): ReadonlyArray<RedditPost> {
    const subreddits: SubredditName[] = ['technology', 'programming', 'webdev'] as SubredditName[];
    const now = new Date();
    
    return Array.from({ length: 50 }, (_, i) => ({
      id: `post_${i}` as RedditPostId,
      title: `Mock Post Title ${i}`,
      subreddit: subreddits[i % subreddits.length],
      author: `user_${i}`,
      score: Math.floor(Math.random() * 10000),
      commentCount: Math.floor(Math.random() * 500),
      upvoteRatio: 0.5 + Math.random() * 0.5,
      createdAt: new Date(now.getTime() - Math.random() * 86400000),
      url: `https://example.com/post-${i}`,
      permalink: `/r/${subreddits[i % subreddits.length]}/comments/post_${i}`,
      isSelf: i % 3 === 0,
      selfText: i % 3 === 0 ? `Self text content for post ${i}` : undefined,
      thumbnailUrl: i % 3 !== 0 ? `https://example.com/thumb-${i}.jpg` : undefined,
      awards: Math.floor(Math.random() * 10),
      crosspostCount: Math.floor(Math.random() * 5),
    }));
  }

  async fetchTrendingPosts(
    options: FetchTrendsOptions
  ): Promise<RedditTrendsResult<ReadonlyArray<RedditPost>>> {
    const validation = this.validateOptions(options);
    if (validation.isErr()) {
      return err(validation.error);
    }

    const opts = validation.value;
    
    let filtered = this.mockPosts;
    
    if (opts.subreddits && opts.subreddits.length > 0) {
      const normalizedSubs = opts.subreddits.map(s => s.toLowerCase());
      filtered = filtered.filter(p => normalizedSubs.includes(p.subreddit));
    }

    filtered = filtered
      .filter(p => p.score >= opts.minScore)
      .slice(0, opts.limit);

    return ok(filtered);
  }

  async getTrendSnapshot(): Promise<RedditTrendsResult<TrendSnapshot>> {
    return ok({
      timestamp: new Date(),
      window: TrendWindow.DAY,
      posts: this.mockPosts.slice(0, 25),
      topSubreddits: [],
      emergingTopics: [],
      averageEngagement: 0.5,
    });
  }

  async analyzeEmergingTopics(): Promise<RedditTrendsResult<ReadonlyArray<EmergingTopic>>> {
    return ok([
      {
        topic: 'Artificial Intelligence',
        mentionCount: 42,
        relatedSubreddits: ['technology', 'singularity'] as SubredditName[],
        sentimentScore: 0.3,
        velocity: 5.5,
      },
    ]);
  }

  async getTrendingSubreddits(
    limit: number
  ): Promise<RedditTrendsResult<ReadonlyArray<SubredditTrend>>> {
    return ok([
      {
        name: 'technology' as SubredditName,
        postCount: 150,
        totalScore: 50000,
        totalComments: 3000,
        trendingScore: 95.5,
        growthRate: 12.3,
      },
    ].slice(0, limit));
  }

  async searchWithTrendAnalysis(
    query: string,
    options: FetchTrendsOptions
  ): Promise<RedditTrendsResult<ReadonlyArray<RedditPost>>> {
    const filtered = this.mockPosts.filter(p => 
      p.title.toLowerCase().includes(query.toLowerCase())
    );
    return ok(filtered.slice(0, options.limit));
  }

  async getHistoricalTrends(): Promise<RedditTrendsResult<Map<TrendWindow, TrendSnapshot>>> {
    const map = new Map<TrendWindow, TrendSnapshot>();
    map.set(TrendWindow.DAY, await this.getTrendSnapshot().then(r => 
      r.isOk() ? r.value : null!
    ));
    return ok(map);
  }
}