// src/lib/ai/datasources/RedditTrendsSource.ts
// Layer: Service (Data Source Implementation)

import { z } from 'zod';
import { Logger } from '@/lib/logging/Logger';
import { DataSourceError } from '@/lib/errors/DataSourceError';
import { RateLimiter } from '@/lib/utils/RateLimiter';
import { Cache } from '@/lib/cache/Cache';
import { validateOrThrow } from '@/lib/validation/validateOrThrow';

// ============================================
// Types Layer: Domain Types and Schemas
// ============================================

/**
 * Schema for validating Reddit post data
 */
const RedditPostSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(300),
  subreddit: z.string().min(1),
  author: z.string().min(1),
  score: z.number().int(),
  numComments: z.number().int().nonnegative(),
  upvoteRatio: z.number().min(0).max(1),
  url: z.string().url(),
  permalink: z.string().startsWith('/r/'),
  createdUtc: z.number().int().positive(),
  isSelf: z.boolean(),
  selftext: z.string().optional(),
  thumbnail: z.string().optional(),
});

/**
 * Schema for Reddit trends query parameters
 */
const RedditTrendsQuerySchema = z.object({
  subreddit: z.string().min(1).optional(),
  timeWindow: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).default('day'),
  limit: z.number().int().min(1).max(100).default(25),
  sort: z.enum(['hot', 'top', 'new', 'rising']).default('hot'),
});

/**
 * Inferred TypeScript types from schemas
 */
export type RedditPost = z.infer<typeof RedditPostSchema>;
export type RedditTrendsQuery = z.infer<typeof RedditTrendsQuerySchema>;

/**
 * Configuration interface for Reddit API client
 */
export interface RedditConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly userAgent: string;
  readonly baseUrl: string;
  readonly rateLimitPerMinute: number;
  readonly cacheTtlSeconds: number;
}

/**
 * OAuth token response from Reddit API
 */
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

/**
 * Raw Reddit API post structure (snake_case)
 */
interface RawRedditPost {
  data: {
    id: string;
    title: string;
    subreddit: string;
    author: string;
    score: number;
    num_comments: number;
    upvote_ratio: number;
    url: string;
    permalink: string;
    created_utc: number;
    is_self: boolean;
    selftext?: string;
    thumbnail?: string;
  };
}

// ============================================
// Config Layer: Default Configuration
// ============================================

const DEFAULT_REDDIT_CONFIG: Partial<RedditConfig> = {
  baseUrl: 'https://oauth.reddit.com',
  rateLimitPerMinute: 30,
  cacheTtlSeconds: 300, // 5 minutes
};

// ============================================
// Service Layer: Reddit Trends Data Source
// ============================================

/**
 * RedditTrendsSource provides an interface to fetch trending posts
 * from Reddit with proper authentication, rate limiting, and caching.
 * 
 * This class follows the six-layer architecture by:
 * - Using typed schemas for input/output validation (Types)
 * - Accepting injectable configuration (Config)
 * - Implementing repository pattern for data access (Repo)
 * - Providing service-level business logic (Service)
 * - Managing runtime concerns like caching and rate limiting (Runtime)
 */
export class RedditTrendsSource {
  private readonly logger: Logger;
  private readonly config: RedditConfig;
  private readonly rateLimiter: RateLimiter;
  private readonly cache: Cache<RedditPost[]>;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: Partial<RedditConfig> = {}) {
    this.config = { ...DEFAULT_REDDIT_CONFIG, ...config } as RedditConfig;
    this.logger = new Logger({ context: 'RedditTrendsSource' });
    this.rateLimiter = new RateLimiter({
      maxRequests: this.config.rateLimitPerMinute,
      windowMs: 60 * 1000, // 1 minute
    });
    this.cache = new Cache<RedditPost[]>({
      ttlSeconds: this.config.cacheTtlSeconds,
    });

    this.validateConfig();
  }

  /**
   * Validates that required configuration is present
   * @throws DataSourceError if configuration is invalid
   */
  private validateConfig(): void {
    const requiredFields: (keyof RedditConfig)[] = ['clientId', 'clientSecret', 'userAgent'];
    const missing = requiredFields.filter(field => !this.config[field]);

    if (missing.length > 0) {
      const error = new DataSourceError(
        `Missing required Reddit configuration: ${missing.join(', ')}`,
        { missingFields: missing }
      );
      this.logger.error('Invalid Reddit configuration', { missingFields: missing });
      throw error;
    }
  }

  /**
   * Fetches trending posts from Reddit based on query parameters.
   * Implements caching and rate limiting for optimal performance.
   * 
   * @param query - Filter and sort parameters for the query
   * @returns Array of validated Reddit posts
   * @throws DataSourceError if the API request fails
   */
  async fetchTrends(query: RedditTrendsQuery): Promise<RedditPost[]> {
    // Validate input parameters using schema
    const validatedQuery = validateOrThrow(RedditTrendsQuerySchema, query);
    
    // Generate cache key based on query parameters
    const cacheKey = this.generateCacheKey(validatedQuery);
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.logger.debug('Returning cached Reddit trends', { cacheKey });
      return cached;
    }

    // Acquire rate limit token before making request
    await this.rateLimiter.acquire();

    try {
      const posts = await this.fetchFromApi(validatedQuery);
      
      // Validate and transform each post
      const validatedPosts = posts.map(post => 
        validateOrThrow(RedditPostSchema, post)
      );

      // Store in cache
      this.cache.set(cacheKey, validatedPosts);
      
      this.logger.info('Successfully fetched Reddit trends', {
        count: validatedPosts.length,
        subreddit: validatedQuery.subreddit || 'all',
        sort: validatedQuery.sort,
      });

      return validatedPosts;

    } catch (error) {
      this.logger.error('Failed to fetch Reddit trends', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query: validatedQuery,
      });
      
      throw DataSourceError.from(error, 'Reddit API request failed');
    }
  }

  /**
   * Makes authenticated API request to Reddit
   * Handles OAuth token management automatically
   */
  private async fetchFromApi(query: RedditTrendsQuery): Promise<RedditPost[]> {
    // Ensure we have a valid access token
    await this.ensureAuthenticated();

    const { subreddit, sort, timeWindow, limit } = query;
    
    // Construct endpoint URL
    // Use /r/popular as default if no subreddit specified
    const endpoint = subreddit 
      ? `/r/${subreddit}/${sort}`
      : `/${sort}`;

    const url = new URL(endpoint, this.config.baseUrl);
    url.searchParams.set('limit', limit.toString());
    
    // Add time parameter for 'top' sorting
    if (sort === 'top') {
      url.searchParams.set('t', timeWindow);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'User-Agent': this.config.userAgent,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      // Handle specific Reddit error codes
      if (response.status === 401) {
        // Token might be expired, clear it and retry once
        this.accessToken = null;
        return this.fetchFromApi(query);
      }
      
      throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Transform Reddit's nested response structure
    const posts = data?.data?.children ?? [];
    
    // Map snake_case API response to camelCase domain model
    return posts.map((post: RawRedditPost): RedditPost => ({
      id: post.data.id,
      title: post.data.title,
      subreddit: post.data.subreddit,
      author: post.data.author,
      score: post.data.score,
      numComments: post.data.num_comments,
      upvoteRatio: post.data.upvote_ratio,
      url: post.data.url,
      permalink: post.data.permalink,
      createdUtc: post.data.created_utc,
      isSelf: post.data.is_self,
      selftext: post.data.selftext,
      thumbnail: post.data.thumbnail,
    }));
  }

  /**
   * Obtains OAuth access token from Reddit
   * Implements token caching to avoid unnecessary requests
   */
  private async ensureAuthenticated(): Promise<void> {
    // Return early if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return;
    }

    this.logger.debug('Fetching new Reddit OAuth token');

    const authString = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.config.userAgent,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw new Error(`OAuth token request failed: ${response.statusText}`);
    }

    const tokenData: TokenResponse = await response.json();
    
    this.accessToken = tokenData.access_token;
    // Set expiry with 60-second buffer for safety
    this.tokenExpiry = Date.now() + (tokenData.expires_in - 60) * 1000;

    this.logger.debug('Successfully obtained Reddit OAuth token');
  }

  /**
   * Generates deterministic cache key from query parameters
   */
  private generateCacheKey(query: RedditTrendsQuery): string {
    const parts = [
      'reddit',
      query.subreddit || 'popular',
      query.sort,
      query.timeWindow,
      query.limit.toString(),
    ];
    return parts.join(':');
  }

  /**
   * Clears the internal cache
   * Useful for testing or forced refresh scenarios
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug('Reddit trends cache cleared');
  }

  /**
   * Returns current rate limit status for monitoring
   */
  getRateLimitStatus(): { remaining: number; resetTime: Date } {
    return this.rateLimiter.getStatus();
  }
}