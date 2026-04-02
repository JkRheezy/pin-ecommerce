/**
 * Types module for RedditTrendsSource
 * 
 * This module defines all TypeScript types, interfaces, and enums
 * for the Reddit data source following the six-layer architecture.
 * 
 * Layer: Types (Layer 1)
 */

import { z } from 'zod';

// ============================================================================
// Domain Types
// ============================================================================

/**
 * Represents a Reddit post/trend item
 */
export interface RedditPost {
  /** Unique identifier for the post */
  id: string;
  
  /** Subreddit where the post was made */
  subreddit: string;
  
  /** Post title */
  title: string;
  
  /** Post content (selftext) or null if link post */
  selftext: string | null;
  
  /** URL of the post (link or comments page) */
  url: string;
  
  /** Author username */
  author: string;
  
  /** UTC timestamp when post was created */
  createdUtc: number;
  
  /** Number of upvotes */
  ups: number;
  
  /** Number of comments */
  numComments: number;
  
  /** Upvote ratio (0.0 to 1.0) */
  upvoteRatio: number;
  
  /** Whether the post is marked as NSFW */
  over18: boolean;
  
  /** Post flair text */
  linkFlairText: string | null;
  
  /** Whether the post is stickied */
  stickied: boolean;
  
  /** Permalink to the post */
  permalink: string;
  
  /** Thumbnail URL or 'self', 'default', etc. */
  thumbnail: string;
  
  /** Media preview information */
  preview?: RedditMediaPreview;
}

/**
 * Media preview information for a post
 */
export interface RedditMediaPreview {
  /** Array of image resolutions */
  images: RedditImage[];
  
  /** Whether the media is enabled */
  enabled: boolean;
}

/**
 * Individual image resolution in a preview
 */
export interface RedditImage {
  /** Source image (highest resolution) */
  source: RedditImageSource;
  
  /** Array of resized versions */
  resolutions: RedditImageSource[];
}

/**
 * Image source with dimensions
 */
export interface RedditImageSource {
  /** Image URL */
  url: string;
  
  /** Width in pixels */
  width: number;
  
  /** Height in pixels */
  height: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration options for RedditTrendsSource
 */
export interface RedditConfig {
  /** Reddit API credentials */
  credentials: RedditCredentials;
  
  /** Request configuration */
  requestConfig?: RedditRequestConfig;
  
  /** Cache configuration */
  cacheConfig?: RedditCacheConfig;
  
  /** Rate limiting configuration */
  rateLimitConfig?: RedditRateLimitConfig;
}

/**
 * Reddit API authentication credentials
 */
export interface RedditCredentials {
  /** Reddit app client ID */
  clientId: string;
  
  /** Reddit app client secret */
  clientSecret: string;
  
  /** Reddit username (for script-type apps) */
  username?: string;
  
  /** Reddit password (for script-type apps) */
  password?: string;
  
  /** User agent string for API requests */
  userAgent: string;
}

/**
 * HTTP request configuration
 */
export interface RedditRequestConfig {
  /** Base URL for Reddit API */
  baseUrl: string;
  
  /** OAuth token endpoint */
  authUrl: string;
  
  /** Request timeout in milliseconds */
  timeoutMs: number;
  
  /** Maximum number of retries */
  maxRetries: number;
  
  /** Retry delay in milliseconds */
  retryDelayMs: number;
}

/**
 * Cache configuration for Reddit data
 */
export interface RedditCacheConfig {
  /** Whether caching is enabled */
  enabled: boolean;
  
  /** Cache TTL in seconds */
  ttlSeconds: number;
  
  /** Maximum cache size (number of entries) */
  maxSize: number;
}

/**
 * Rate limiting configuration
 */
export interface RedditRateLimitConfig {
  /** Maximum requests per minute */
  requestsPerMinute: number;
  
  /** Burst allowance */
  burstSize: number;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Raw Reddit API listing response
 */
export interface RedditListingResponse<T> {
  /** Response kind */
  kind: 'Listing';
  
  /** Listing data */
  data: {
    /** Modhash (deprecated but still present) */
    modhash: string | null;
    
    /** Dist (count of items) */
    dist: number;
    
    /** Array of listing children */
    children: RedditListingChild<T>[];
    
    /** After cursor for pagination */
    after: string | null;
    
    /** Before cursor for pagination */
    before: string | null;
  };
}

/**
 * Individual item in a Reddit listing
 */
export interface RedditListingChild<T> {
  /** Item kind (e.g., 't3' for posts) */
  kind: string;
  
  /** Item data */
  data: T;
}

/**
 * OAuth token response from Reddit
 */
export interface RedditTokenResponse {
  /** Access token */
  access_token: string;
  
  /** Token type (usually 'bearer') */
  token_type: string;
  
  /** Expiration time in seconds */
  expires_in: number;
  
  /** Scope of the token */
  scope: string;
  
  /** Refresh token (if applicable) */
  refresh_token?: string;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes specific to Reddit data source operations
 */
export enum RedditErrorCode {
  /** Authentication failed */
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  
  /** Rate limit exceeded */
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  /** Subreddit not found or private */
  SUBREDDIT_NOT_FOUND = 'SUBREDDIT_NOT_FOUND',
  
  /** Network error */
  NETWORK_ERROR = 'NETWORK_ERROR',
  
  /** Invalid response format */
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  
  /** Configuration error */
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  
  /** Token expired */
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  
  /** Unknown error */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Custom error class for Reddit data source errors
 */
export class RedditError extends Error {
  constructor(
    public readonly code: RedditErrorCode,
    message: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RedditError';
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RedditError);
    }
  }
  
  /**
   * Creates a retryable error instance
   */
  static retryable(
    code: RedditErrorCode,
    message: string,
    statusCode?: number,
    context?: Record<string, unknown>
  ): RedditError {
    return new RedditError(code, message, statusCode, true, context);
  }
  
  /**
   * Creates a non-retryable error instance
   */
  static fatal(
    code: RedditErrorCode,
    message: string,
    statusCode?: number,
    context?: Record<string, unknown>
  ): RedditError {
    return new RedditError(code, message, statusCode, false, context);
  }
}

// ============================================================================
// Query/Filter Types
// ============================================================================

/**
 * Sort options for Reddit posts
 */
export enum RedditSortOption {
  HOT = 'hot',
  NEW = 'new',
  TOP = 'top',
  RISING = 'rising',
  CONTROVERSIAL = 'controversial',
}

/**
 * Time period filters for top/controversial posts
 */
export enum RedditTimePeriod {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
  ALL = 'all',
}

/**
 * Query parameters for fetching Reddit trends
 */
export interface RedditTrendsQuery {
  /** Subreddit name (without r/) or 'all' for frontpage */
  subreddit: string;
  
  /** Sort method */
  sort: RedditSortOption;
  
  /** Time period (required for top/controversial) */
  time?: RedditTimePeriod;
  
  /** Number of posts to fetch (max 100) */
  limit: number;
  
  /** Pagination cursor */
  after?: string;
  
  /** Include NSFW content */
  includeNsfw: boolean;
}

// ============================================================================
// Result/Output Types
// ============================================================================

/**
 * Processed trend result from Reddit
 */
export interface RedditTrendResult {
  /** Unique identifier */
  id: string;
  
  /** Source information */
  source: {
    platform: 'reddit';
    subreddit: string;
    permalink: string;
  };
  
  /** Content metadata */
  content: {
    title: string;
    excerpt: string | null;
    fullText: string | null;
    url: string;
  };
  
  /** Engagement metrics */
  engagement: {
    score: number;
    commentCount: number;
    upvoteRatio: number;
  };
  
  /** Temporal information */
  temporal: {
    postedAt: Date;
    ageHours: number;
  };
  
  /** Categorization */
  categorization: {
    flair: string | null;
    isNsfw: boolean;
    isStickied: boolean;
  };
}

/**
 * Aggregated trends result
 */
export interface RedditTrendsAggregate {
  /** Query metadata */
  query: {
    subreddit: string;
    sort: RedditSortOption;
    fetchedAt: Date;
  };
  
  /** Array of trend results */
  trends: RedditTrendResult[];
  
  /** Pagination info */
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    totalFetched: number;
  };
  
  /** Summary statistics */
  stats: {
    totalScore: number;
    totalComments: number;
    averageUpvoteRatio: number;
    oldestPostHours: number;
    newestPostHours: number;
  };
}

// ============================================================================
// Validation Schemas (Zod)
// ============================================================================

/**
 * Zod schema for Reddit credentials validation
 */
export const RedditCredentialsSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client secret is required'),
  username: z.string().optional(),
  password: z.string().optional(),
  userAgent: z.string().min(1, 'User agent is required'),
});

/**
 * Zod schema for Reddit config validation
 */
export const RedditConfigSchema = z.object({
  credentials: RedditCredentialsSchema,
  requestConfig: z.object({
    baseUrl: z.string().url().default('https://oauth.reddit.com'),
    authUrl: z.string().url().default('https://www.reddit.com/api/v1/access_token'),
    timeoutMs: z.number().positive().default(30000),
    maxRetries: z.number().nonnegative().default(3),
    retryDelayMs: z.number().nonnegative().default(1000),
  }).optional(),
  cacheConfig: z.object({
    enabled: z.boolean().default(true),
    ttlSeconds: z.number().positive().default(300),
    maxSize: z.number().positive().default(1000),
  }).optional(),
  rateLimitConfig: z.object({
    requestsPerMinute: z.number().positive().default(60),
    burstSize: z.number().positive().default(10),
  }).optional(),
});

/**
 * Zod schema for Reddit trends query validation
 */
export const RedditTrendsQuerySchema = z.object({
  subreddit: z.string().min(1).regex(/^[a-zA-Z0-9_]+$/, 'Invalid subreddit name'),
  sort: z.nativeEnum(RedditSortOption),
  time: z.nativeEnum(RedditTimePeriod).optional(),
  limit: z.number().int().min(1).max(100).default(25),
  after: z.string().optional(),
  includeNsfw: z.boolean().default(false),
}).refine(
  (data) => {
    // Time period is required for top and controversial sorts
    if (
      (data.sort === RedditSortOption.TOP || data.sort === RedditSortOption.CONTROVERSIAL) &&
      !data.time
    ) {
      return false;
    }
    return true;
  },
  {
    message: 'Time period is required for top and controversial sorts',
    path: ['time'],
  }
);

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if value is a RedditError
 */
export function isRedditError(error: unknown): error is RedditError {
  return error instanceof RedditError;
}

/**
 * Type guard to check if a Reddit post has valid media preview
 */
export function hasMediaPreview(post: RedditPost): post is RedditPost & { preview: RedditMediaPreview } {
  return post.preview !== undefined && 
         post.preview.images !== undefined && 
         post.preview.images.length > 0;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration values
 */
export const REDDIT_DEFAULTS = {
  BASE_URL: 'https://oauth.reddit.com',
  AUTH_URL: 'https://www.reddit.com/api/v1/access_token',
  TIMEOUT_MS: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  CACHE_TTL_SECONDS: 300,
  CACHE_MAX_SIZE: 1000,
  RATE_LIMIT_RPM: 60,
  RATE_LIMIT_BURST: 10,
  DEFAULT_LIMIT: 25,
  MAX_LIMIT: 100,
} as const;

/**
 * Reddit API rate limit headers
 */
export const REDDIT_RATE_LIMIT_HEADERS = {
  USED: 'x-ratelimit-used',
  REMAINING: 'x-ratelimit-remaining',
  RESET: 'x-ratelimit-reset',
} as const;