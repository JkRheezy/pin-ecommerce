/**
 * Reddit Trends Data Provider
 * 
 * Service layer implementation for fetching and processing Reddit trend data.
 * Follows the six-layer architecture: Types → Config → Repo → Service → Runtime → UI
 */

import { z } from 'zod';
import { logger } from '@/lib/logging';
import { createServiceError, ServiceErrorCode } from '@/lib/errors';
import type { DataProvider, TrendData, TrendFilter } from '@/lib/ai/types/providers';

// =============================================================================
// TYPES LAYER
// =============================================================================

/**
 * Raw Reddit API response structure
 */
interface RedditApiResponse {
  data: {
    children: Array<{
      data: {
        id: string;
        title: string;
        subreddit: string;
        author: string;
        ups: number;
        num_comments: number;
        created_utc: number;
        url: string;
        permalink: string;
        thumbnail?: string;
        selftext?: string;
      };
    }>;
    after: string | null;
  };
}

/**
 * Configuration for Reddit API client
 */
interface RedditConfig {
  baseUrl: string;
  userAgent: string;
  timeoutMs: number;
  rateLimitPerSecond: number;
}

/**
 * Processed Reddit post with normalized fields
 */
interface ProcessedRedditPost {
  id: string;
  title: string;
  subreddit: string;
  author: string;
  score: number;
  commentCount: number;
  createdAt: Date;
  url: string;
  content?: string;
  thumbnailUrl?: string;
  engagementScore: number;
}

// =============================================================================
// CONFIG LAYER
// =============================================================================

const RedditConfigSchema = z.object({
  baseUrl: z.string().url().default('https://www.reddit.com'),
  userAgent: z.string().min(1).default('HarnessAI/1.0'),
  timeoutMs: z.number().positive().default(30000),
  rateLimitPerSecond: z.number().positive().default(1),
});

const DEFAULT_CONFIG: RedditConfig = {
  baseUrl: 'https://www.reddit.com',
  userAgent: 'HarnessAI/1.0',
  timeoutMs: 30000,
  rateLimitPerSecond: 1,
};

// =============================================================================
// SERVICE LAYER
// =============================================================================

/**
 * Reddit Trends Provider implementation
 * 
 * Fetches trending posts from Reddit and transforms them into standardized
 * trend data format for consumption by AI services.
 */
export class RedditTrendsProvider implements DataProvider<TrendData> {
  private readonly config: RedditConfig;
  private lastRequestTime: number = 0;
  private readonly requestQueue: Array<() => void> = [];

  constructor(config: Partial<RedditConfig> = {}) {
    this.config = RedditConfigSchema.parse({ ...DEFAULT_CONFIG, ...config });
    
    logger.info({
      component: 'RedditTrendsProvider',
      message: 'Initialized Reddit trends provider',
      baseUrl: this.config.baseUrl,
    });
  }

  /**
   * Fetches trending data from Reddit based on filter criteria
   * 
   * @param filter - Optional filters for subreddit, time range, etc.
   * @returns Promise resolving to array of trend data
   * @throws ServiceError if API request fails or response is invalid
   */
  async fetch(filter?: TrendFilter): Promise<TrendData[]> {
    const startTime = Date.now();
    
    try {
      // Build API URL with filters
      const url = this.buildApiUrl(filter);
      
      logger.debug({
        component: 'RedditTrendsProvider',
        message: 'Fetching Reddit trends',
        url,
        filter,
      });

      // Apply rate limiting before making request
      await this.applyRateLimit();

      const response = await this.makeRequest(url);
      const posts = this.parseResponse(response);
      const trends = posts.map(post => this.transformToTrendData(post));

      logger.info({
        component: 'RedditTrendsProvider',
        message: 'Successfully fetched Reddit trends',
        count: trends.length,
        durationMs: Date.now() - startTime,
      });

      return trends;

    } catch (error) {
      logger.error({
        component: 'RedditTrendsProvider',
        message: 'Failed to fetch Reddit trends',
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });

      throw createServiceError(
        ServiceErrorCode.EXTERNAL_API_ERROR,
        'Failed to fetch Reddit trends',
        { cause: error }
      );
    }
  }

  /**
   * Validates the provider configuration and connectivity
   * 
   * @returns Promise resolving to true if healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.applyRateLimit();
      const response = await fetch(`${this.config.baseUrl}/r/popular.json?limit=1`, {
        headers: { 'User-Agent': this.config.userAgent },
        signal: AbortSignal.timeout(5000),
      });
      
      return response.ok;
    } catch (error) {
      logger.warn({
        component: 'RedditTrendsProvider',
        message: 'Health check failed',
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Builds the Reddit API URL based on filter criteria
   * 
   * Reddit's public API uses JSON endpoints with specific sorting:
   * - /hot: Currently trending
   * - /new: Most recent
   * - /top: Highest score (requires time parameter)
   * - /rising: Posts gaining traction quickly
   */
  private buildApiUrl(filter?: TrendFilter): string {
    const subreddit = filter?.subreddit || 'all';
    const sort = filter?.sortBy || 'hot';
    const limit = Math.min(filter?.limit || 25, 100); // Max 100 per Reddit's limits
    const time = filter?.timeRange || 'day';

    let endpoint = `/r/${subreddit}/${sort}.json?limit=${limit}`;

    // Top sorting requires time parameter
    if (sort === 'top') {
      endpoint += `&t=${time}`;
    }

    return `${this.config.baseUrl}${endpoint}`;
  }

  /**
   * Makes HTTP request with proper headers and timeout
   */
  private async makeRequest(url: string): Promise<RedditApiResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.config.userAgent,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Reddit returns JSON with specific structure
      const data = await response.json() as RedditApiResponse;
      
      // Validate basic structure
      if (!data?.data?.children) {
        throw new Error('Invalid Reddit API response structure');
      }

      return data;

    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Parses and validates Reddit API response
   */
  private parseResponse(response: RedditApiResponse): ProcessedRedditPost[] {
    return response.data.children
      .map(child => {
        const post = child.data;
        
        // Calculate engagement score: combination of upvotes and comments
        // Weighted to favor discussion-heavy posts
        const engagementScore = (post.ups * 0.6) + (post.num_comments * 10);

        return {
          id: post.id,
          title: post.title,
          subreddit: post.subreddit,
          author: post.author,
          score: post.ups,
          commentCount: post.num_comments,
          createdAt: new Date(post.created_utc * 1000),
          url: post.url,
          content: post.selftext || undefined,
          thumbnailUrl: post.thumbnail?.startsWith('http') ? post.thumbnail : undefined,
          engagementScore,
        };
      })
      .filter(post => {
        // Filter out removed/deleted posts
        return post.author !== '[deleted]' && 
               !post.title.toLowerCase().includes('[removed]');
      });
  }

  /**
   * Transforms processed Reddit post to standardized TrendData format
   */
  private transformToTrendData(post: ProcessedRedditPost): TrendData {
    return {
      id: `reddit_${post.id}`,
      source: 'reddit',
      title: post.title,
      description: post.content?.slice(0, 500), // Truncate long content
      url: `https://reddit.com${post.permalink || post.url}`,
      publishedAt: post.createdAt,
      metadata: {
        subreddit: post.subreddit,
        author: post.author,
        score: post.score,
        commentCount: post.commentCount,
        engagementScore: post.engagementScore,
        thumbnailUrl: post.thumbnailUrl,
      },
      tags: [post.subreddit.toLowerCase()],
      relevanceScore: this.calculateRelevanceScore(post),
    };
  }

  /**
   * Calculates relevance score based on engagement and recency
   * 
   * Score decays over time using exponential decay function:
   * relevance = engagementScore * e^(-λ * hours_ago)
   */
  private calculateRelevanceScore(post: ProcessedRedditPost): number {
    const hoursAgo = (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60);
    const decayFactor = Math.exp(-0.1 * hoursAgo); // 10% decay per hour
    
    // Normalize to 0-100 scale
    const normalizedEngagement = Math.min(post.engagementScore / 1000, 100);
    
    return Math.round(normalizedEngagement * decayFactor * 100) / 100;
  }

  /**
   * Applies rate limiting using token bucket algorithm
   * Ensures we don't exceed Reddit's API rate limits
   */
  private async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const minIntervalMs = 1000 / this.config.rateLimitPerSecond;
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < minIntervalMs) {
      const delayMs = minIntervalMs - timeSinceLastRequest;
      
      logger.debug({
        component: 'RedditTrendsProvider',
        message: 'Rate limiting: delaying request',
        delayMs,
      });

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    this.lastRequestTime = Date.now();
  }
}

// =============================================================================
// FACTORY / RUNTIME LAYER
// =============================================================================

/**
 * Factory function for creating RedditTrendsProvider instances
 * Allows for dependency injection and test mocking
 */
export function createRedditTrendsProvider(
  config?: Partial<RedditConfig>
): RedditTrendsProvider {
  return new RedditTrendsProvider(config);
}

// Default export for convenience
export default RedditTrendsProvider;