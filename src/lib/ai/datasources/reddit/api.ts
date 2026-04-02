// Layer: Service - Reddit API Client
// Path: src/lib/ai/datasources/reddit/api.ts

import { z } from 'zod';
import { logger } from '@/lib/logging/logger';
import { createError, ErrorCode } from '@/lib/errors/base';
import { withRetry, RetryConfig } from '@/lib/utils/retry';

// ============================================
// Types Layer - Domain Types
// ============================================

/**
 * Raw Reddit API response structure
 */
export interface RedditApiResponse {
  kind: string;
  data: {
    children: Array<{
      kind: string;
      data: RedditPostData;
    }>;
    after: string | null;
    before: string | null;
  };
}

/**
 * Individual Reddit post data from API
 */
export interface RedditPostData {
  id: string;
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  score: number;
  num_comments: number;
  created_utc: number;
  permalink: string;
  url: string;
  is_self: boolean;
  thumbnail?: string;
  ups: number;
  downs: number;
  upvote_ratio: number;
}

/**
 * Configuration for Reddit API client
 */
export interface RedditApiConfig {
  baseUrl: string;
  userAgent: string;
  timeoutMs: number;
  rateLimitPerSecond: number;
  retryConfig: RetryConfig;
}

/**
 * Validated and sanitized Reddit post
 */
export interface SanitizedRedditPost {
  id: string;
  title: string;
  content: string;
  author: string;
  subreddit: string;
  score: number;
  commentCount: number;
  createdAt: Date;
  permalink: string;
  externalUrl: string | null;
  engagementScore: number;
}

// ============================================
// Config Layer - Validation Schemas
// ============================================

const RedditPostDataSchema = z.object({
  id: z.string(),
  title: z.string(),
  selftext: z.string(),
  author: z.string(),
  subreddit: z.string(),
  score: z.number(),
  num_comments: z.number(),
  created_utc: z.number(),
  permalink: z.string(),
  url: z.string(),
  is_self: z.boolean(),
  thumbnail: z.string().optional(),
  ups: z.number(),
  downs: z.number(),
  upvote_ratio: z.number(),
});

const RedditApiResponseSchema = z.object({
  kind: z.string(),
  data: z.object({
    children: z.array(
      z.object({
        kind: z.string(),
        data: RedditPostDataSchema,
      })
    ),
    after: z.string().nullable(),
    before: z.string().nullable(),
  }),
});

// ============================================
// Service Layer - API Client Implementation
// ============================================

/**
 * Reddit API Client for fetching trending posts
 * 
 * Implements rate limiting, retry logic, and proper error handling
 * to ensure reliable data fetching from Reddit's public API.
 */
export class RedditApiClient {
  private readonly config: RedditApiConfig;
  private lastRequestTime: number = 0;
  private requestQueue: Array<() => void> = [];

  constructor(config: Partial<RedditApiConfig> = {}) {
    this.config = {
      baseUrl: 'https://www.reddit.com',
      userAgent: 'HarnessAI/1.0 (Trend Analysis Service)',
      timeoutMs: 30000,
      rateLimitPerSecond: 1,
      retryConfig: {
        maxAttempts: 3,
        backoffMs: 1000,
        maxBackoffMs: 10000,
        retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN'],
      },
      ...config,
    };
  }

  /**
   * Fetches trending posts from a subreddit
   * 
   * @param subreddit - Name of the subreddit (without r/ prefix)
   * @param sort - Sort method: 'hot', 'new', 'top', 'rising'
   * @param limit - Maximum number of posts to fetch (max 100)
   * @param after - Pagination token for fetching next page
   * @returns Array of sanitized Reddit posts
   * @throws Error if API request fails or response is invalid
   */
  async fetchTrendingPosts(
    subreddit: string,
    sort: 'hot' | 'new' | 'top' | 'rising' = 'hot',
    limit: number = 25,
    after?: string
  ): Promise<SanitizedRedditPost[]> {
    // Validate inputs
    const validatedSubreddit = this.validateSubreddit(subreddit);
    const validatedLimit = Math.min(Math.max(1, limit), 100);

    const url = this.buildUrl(validatedSubreddit, sort, validatedLimit, after);

    logger.info('Fetching Reddit trending posts', {
      subreddit: validatedSubreddit,
      sort,
      limit: validatedLimit,
      hasPagination: !!after,
    });

    try {
      const response = await this.executeWithRateLimit(() =>
        this.fetchWithRetry(url)
      );

      const validatedResponse = this.validateResponse(response);
      const posts = this.extractPosts(validatedResponse);

      logger.info('Successfully fetched Reddit posts', {
        subreddit: validatedSubreddit,
        postCount: posts.length,
      });

      return posts;
    } catch (error) {
      logger.error('Failed to fetch Reddit trending posts', {
        subreddit: validatedSubreddit,
        sort,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw this.handleError(error, 'fetchTrendingPosts');
    }
  }

  /**
   * Fetches multiple subreddits in parallel with concurrency control
   * 
   * @param subreddits - Array of subreddit names
   * @param options - Fetch options applied to all requests
   * @returns Map of subreddit name to posts
   */
  async fetchMultipleSubreddits(
    subreddits: string[],
    options: {
      sort?: 'hot' | 'new' | 'top' | 'rising';
      limit?: number;
    } = {}
  ): Promise<Map<string, SanitizedRedditPost[]>> {
    if (subreddits.length === 0) {
      return new Map();
    }

    // Validate all subreddit names first
    const validatedSubreddits = subreddits.map(s => this.validateSubreddit(s));

    logger.info('Fetching multiple subreddits', {
      subredditCount: validatedSubreddits.length,
      sort: options.sort,
    });

    // Use Promise.allSettled to handle partial failures gracefully
    const results = await Promise.allSettled(
      validatedSubreddits.map(subreddit =>
        this.fetchTrendingPosts(subreddit, options.sort, options.limit)
      )
    );

    const postsBySubreddit = new Map<string, SanitizedRedditPost[]>();
    const failures: string[] = [];

    results.forEach((result, index) => {
      const subreddit = validatedSubreddits[index];
      if (result.status === 'fulfilled') {
        postsBySubreddit.set(subreddit, result.value);
      } else {
        failures.push(subreddit);
        logger.warn('Failed to fetch subreddit', {
          subreddit,
          error: result.reason?.message,
        });
      }
    });

    if (failures.length > 0) {
      logger.error('Partial failure fetching subreddits', {
        failedCount: failures.length,
        failedSubreddits: failures,
      });
    }

    return postsBySubreddit;
  }

  /**
   * Builds the Reddit API URL with proper encoding
   */
  private buildUrl(
    subreddit: string,
    sort: string,
    limit: number,
    after?: string
  ): string {
    const params = new URLSearchParams({
      limit: limit.toString(),
      raw_json: '1', // Get unescaped JSON
    });

    if (after) {
      params.set('after', after);
    }

    // Reddit's public JSON API endpoint
    return `${this.config.baseUrl}/r/${subreddit}/${sort}.json?${params.toString()}`;
  }

  /**
   * Validates and sanitizes subreddit name
   */
  private validateSubreddit(subreddit: string): string {
    // Remove r/ prefix if present
    const cleanName = subreddit.replace(/^r\//, '').trim().toLowerCase();

    // Reddit subreddit naming rules: 3-21 characters, alphanumeric + underscores
    const validPattern = /^[a-zA-Z0-9_]{3,21}$/;
    
    if (!validPattern.test(cleanName)) {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        `Invalid subreddit name: ${subreddit}. Must be 3-21 alphanumeric characters or underscores.`
      );
    }

    return cleanName;
  }

  /**
   * Executes a function with rate limiting
   * Uses token bucket algorithm for smooth rate limiting
   */
  private async executeWithRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const minIntervalMs = 1000 / this.config.rateLimitPerSecond;
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < minIntervalMs) {
      const delayMs = minIntervalMs - timeSinceLastRequest;
      await this.sleep(delayMs);
    }

    this.lastRequestTime = Date.now();
    return fn();
  }

  /**
   * Fetches data with retry logic for transient failures
   */
  private async fetchWithRetry(url: string): Promise<unknown> {
    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeoutMs
        );

        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': this.config.userAgent,
              Accept: 'application/json',
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            // Handle Reddit-specific error codes
            if (response.status === 429) {
              const retryAfter = response.headers.get('x-ratelimit-reset');
              throw createError(
                ErrorCode.RATE_LIMIT_EXCEEDED,
                `Reddit rate limit exceeded. Retry after: ${retryAfter}`
              );
            }

            if (response.status === 404) {
              throw createError(
                ErrorCode.NOT_FOUND,
                `Subreddit not found or private`
              );
            }

            throw createError(
              ErrorCode.EXTERNAL_API_ERROR,
              `Reddit API error: ${response.status} ${response.statusText}`
            );
          }

          return response.json();
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      },
      this.config.retryConfig
    );
  }

  /**
   * Validates and parses API response
   */
  private validateResponse(data: unknown): RedditApiResponse {
    const parseResult = RedditApiResponseSchema.safeParse(data);

    if (!parseResult.success) {
      logger.error('Invalid Reddit API response structure', {
        errors: parseResult.error.errors,
      });

      throw createError(
        ErrorCode.VALIDATION_ERROR,
        'Reddit API returned unexpected response structure'
      );
    }

    return parseResult.data;
  }

  /**
   * Extracts and sanitizes posts from API response
   */
  private extractPosts(response: RedditApiResponse): SanitizedRedditPost[] {
    return response.data.children.map(child => {
      const post = child.data;
      
      // Calculate engagement score: combines upvotes, comments, and recency
      const hoursSincePost = (Date.now() / 1000 - post.created_utc) / 3600;
      const timeDecay = Math.max(0.1, 1 / (1 + hoursSincePost / 24)); // Decay over 24 hours
      const engagementScore = (post.score + post.num_comments * 2) * timeDecay;

      return {
        id: post.id,
        title: this.sanitizeText(post.title),
        content: this.sanitizeText(post.selftext),
        author: post.author,
        subreddit: post.subreddit,
        score: post.score,
        commentCount: post.num_comments,
        createdAt: new Date(post.created_utc * 1000),
        permalink: `https://reddit.com${post.permalink}`,
        externalUrl: post.is_self ? null : post.url,
        engagementScore: Math.round(engagementScore * 100) / 100,
      };
    });
  }

  /**
   * Sanitizes text content to prevent injection and normalize
   */
  private sanitizeText(text: string): string {
    if (!text) return '';

    return text
      .trim()
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove zero-width characters
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Limit length
      .slice(0, 10000);
  }

  /**
   * Centralized error handling with context
   */
  private handleError(error: unknown, operation: string): Error {
    if (error instanceof Error && 'code' in error) {
      // Already a structured error, pass through
      return error as Error;
    }

    // Wrap unknown errors
    return createError(
      ErrorCode.EXTERNAL_API_ERROR,
      `Reddit API ${operation} failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  /**
   * Utility sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================
// Factory and Default Export
// ============================================

/**
 * Creates a configured Reddit API client instance
 */
export function createRedditApiClient(
  config?: Partial<RedditApiConfig>
): RedditApiClient {
  return new RedditApiClient(config);
}

// Default instance for common use cases
export const defaultRedditClient = createRedditApiClient();