// Types Layer
interface RedditPost {
  id: string;
  title: string;
  subreddit: string;
  author: string;
  score: number;
  numComments: number;
  createdAt: Date;
  url: string;
  permalink: string;
  isNSFW: boolean;
  thumbnail?: string;
}

interface RedditTrendsConfig {
  apiBaseUrl: string;
  apiKey?: string;
  requestTimeoutMs: number;
  maxResultsPerSubreddit: number;
  cacheTtlSeconds: number;
  rateLimitPerMinute: number;
}

interface RedditApiResponse {
  data: {
    children: Array<{
      data: {
        id: string;
        title: string;
        subreddit: string;
        author: string;
        score: number;
        num_comments: number;
        created_utc: number;
        url: string;
        permalink: string;
        over_18: boolean;
        thumbnail?: string;
      };
    }>;
  };
}

// Custom error types for granular error handling
class RedditApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly responseBody?: unknown
  ) {
    super(message);
    this.name = 'RedditApiError';
  }
}

class RedditRateLimitError extends RedditApiError {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`);
    this.name = 'RedditRateLimitError';
  }
}

class RedditValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedditValidationError';
  }
}

// Config Layer
const DEFAULT_CONFIG: RedditTrendsConfig = {
  apiBaseUrl: 'https://www.reddit.com',
  requestTimeoutMs: 10000,
  maxResultsPerSubreddit: 25,
  cacheTtlSeconds: 300, // 5 minutes
  rateLimitPerMinute: 30,
};

// Simple in-memory cache implementation
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class TrendsCache {
  private cache = new Map<string, CacheEntry<RedditPost[]>>();

  get(key: string): RedditPost[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set(key: string, data: RedditPost[], ttlSeconds: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

// Repo Layer (Data Access)
class RedditApiRepository {
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private readonly rateLimitWindowMs = 60000; // 1 minute

  constructor(
    private readonly config: RedditTrendsConfig,
    private readonly logger: Logger
  ) {}

  /**
   * Fetches trending posts from a subreddit with rate limiting protection.
   * Implements exponential backoff for rate limit errors.
   */
  async fetchTrendingPosts(subreddit: string, sort: 'hot' | 'top' | 'new' = 'hot'): Promise<RedditPost[]> {
    this.validateSubredditName(subreddit);
    await this.enforceRateLimit();

    const url = `${this.config.apiBaseUrl}/r/${subreddit}/${sort}.json?limit=${this.config.maxResultsPerSubreddit}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Harness-AI-Trends-Service/1.0',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.recordRequest();

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
        throw new RedditRateLimitError(retryAfter);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => undefined);
        throw new RedditApiError(
          `Reddit API returned ${response.status}`,
          response.status,
          body
        );
      }

      const json: RedditApiResponse = await response.json();
      return this.transformApiResponse(json);
    } catch (error) {
      if (error instanceof RedditApiError || error instanceof RedditRateLimitError) {
        throw error;
      }
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new RedditApiError(`Request timeout after ${this.config.requestTimeoutMs}ms`);
      }
      
      this.logger.error('Unexpected error fetching Reddit trends', { error, subreddit });
      throw new RedditApiError(`Failed to fetch trends: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private validateSubredditName(subreddit: string): void {
    // Reddit subreddit names: 3-21 characters, alphanumeric, underscores allowed
    const validPattern = /^[a-zA-Z0-9_]{3,21}$/;
    if (!validPattern.test(subreddit)) {
      throw new RedditValidationError(`Invalid subreddit name: ${subreddit}`);
    }
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Reset counter if we're in a new window
    if (now - this.lastRequestTime > this.rateLimitWindowMs) {
      this.requestCount = 0;
      this.lastRequestTime = now;
    }

    if (this.requestCount >= this.config.rateLimitPerMinute) {
      const waitTime = this.rateLimitWindowMs - (now - this.lastRequestTime);
      this.logger.warn('Rate limit approached, delaying request', { waitTimeMs: waitTime });
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.lastRequestTime = Date.now();
    }
  }

  private recordRequest(): void {
    this.requestCount++;
  }

  private transformApiResponse(response: RedditApiResponse): RedditPost[] {
    return response.data.children.map(child => ({
      id: child.data.id,
      title: child.data.title,
      subreddit: child.data.subreddit,
      author: child.data.author,
      score: child.data.score,
      numComments: child.data.num_comments,
      createdAt: new Date(child.data.created_utc * 1000),
      url: child.data.url,
      permalink: `https://reddit.com${child.data.permalink}`,
      isNSFW: child.data.over_18,
      thumbnail: child.data.thumbnail && child.data.thumbnail !== 'self' 
        ? child.data.thumbnail 
        : undefined,
    }));
  }
}

// Logger interface for structured logging
interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// Service Layer
export class RedditTrendsService {
  private readonly repository: RedditApiRepository;
  private readonly cache: TrendsCache;

  constructor(
    config: Partial<RedditTrendsConfig> = {},
    private readonly logger: Logger = consoleLogger()
  ) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    this.repository = new RedditApiRepository(mergedConfig, logger);
    this.cache = new TrendsCache();
  }

  /**
   * Retrieves trending posts for a specific subreddit with caching support.
   * Returns cached results if available and not expired.
   */
  async getTrendingForSubreddit(
    subreddit: string,
    options: { 
      sort?: 'hot' | 'top' | 'new';
      skipCache?: boolean;
    } = {}
  ): Promise<RedditPost[]> {
    const { sort = 'hot', skipCache = false } = options;
    const cacheKey = `${subreddit}:${sort}`;

    // Check cache first unless explicitly skipped
    if (!skipCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.logger.debug('Cache hit for subreddit trends', { subreddit, sort, count: cached.length });
        return cached;
      }
    }

    this.logger.info('Fetching trending posts from Reddit', { subreddit, sort });

    try {
      const posts = await this.repository.fetchTrendingPosts(subreddit, sort);
      
      // Cache successful results
      this.cache.set(cacheKey, posts, DEFAULT_CONFIG.cacheTtlSeconds);
      
      this.logger.info('Successfully fetched Reddit trends', { 
        subreddit, 
        sort, 
        count: posts.length 
      });
      
      return posts;
    } catch (error) {
      this.handleServiceError(error, 'getTrendingForSubreddit', { subreddit, sort });
      throw error; // Re-throw after logging
    }
  }

  /**
   * Batch fetch trending posts from multiple subreddits.
   * Partial failures are handled gracefully - successful results are returned
   * along with error information for failed requests.
   */
  async getTrendingForMultipleSubreddits(
    subreddits: string[],
    options: { sort?: 'hot' | 'top' | 'new' } = {}
  ): Promise<{
    results: Map<string, RedditPost[]>;
    errors: Map<string, Error>;
  }> {
    const results = new Map<string, RedditPost[]>();
    const errors = new Map<string, Error>();

    // Execute requests with controlled concurrency
    const CONCURRENCY_LIMIT = 3;
    const queue = [...subreddits];
    const executing: Promise<void>[] = [];

    const executeNext = async (): Promise<void> => {
      const subreddit = queue.shift();
      if (!subreddit) return;

      try {
        const posts = await this.getTrendingForSubreddit(subreddit, options);
        results.set(subreddit, posts);
      } catch (error) {
        const wrappedError = error instanceof Error ? error : new Error(String(error));
        errors.set(subreddit, wrappedError);
        this.logger.warn('Failed to fetch trends for subreddit', { subreddit, error: wrappedError.message });
      }
    };

    // Start initial batch
    while (executing.length < CONCURRENCY_LIMIT && queue.length > 0) {
      executing.push(executeNext());
    }

    // Process remaining as slots free up
    while (queue.length > 0) {
      await Promise.race(executing);
      executing.push(executeNext());
    }

    await Promise.all(executing);

    this.logger.info('Completed batch fetch for multiple subreddits', {
      requested: subreddits.length,
      successful: results.size,
      failed: errors.size,
    });

    return { results, errors };
  }

  /**
   * Filters posts based on configurable criteria.
   * Useful for removing low-quality or inappropriate content.
   */
  filterPosts(
    posts: RedditPost[],
    criteria: {
      minScore?: number;
      minComments?: number;
      excludeNSFW?: boolean;
      maxAgeHours?: number;
    }
  ): RedditPost[] {
    const now = Date.now();

    return posts.filter(post => {
      if (criteria.minScore !== undefined && post.score < criteria.minScore) {
        return false;
      }
      if (criteria.minComments !== undefined && post.numComments < criteria.minComments) {
        return false;
      }
      if (criteria.excludeNSFW && post.isNSFW) {
        return false;
      }
      if (criteria.maxAgeHours !== undefined) {
        const ageHours = (now - post.createdAt.getTime()) / (1000 * 60 * 60);
        if (ageHours > criteria.maxAgeHours) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Clears all cached data. Useful for testing or when cache corruption is suspected.
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.info('Reddit trends cache cleared');
  }

  private handleServiceError(
    error: unknown,
    operation: string,
    context: Record<string, unknown>
  ): void {
    if (error instanceof RedditRateLimitError) {
      this.logger.warn('Reddit rate limit encountered', {
        operation,
        retryAfter: error.retryAfterSeconds,
        ...context,
      });
    } else if (error instanceof RedditValidationError) {
      this.logger.warn('Validation error in Reddit service', {
        operation,
        error: error.message,
        ...context,
      });
    } else if (error instanceof RedditApiError) {
      this.logger.error('Reddit API error', {
        operation,
        statusCode: error.statusCode,
        error: error.message,
        ...context,
      });
    } else {
      this.logger.error('Unexpected error in Reddit service', {
        operation,
        error: error instanceof Error ? error.message : String(error),
        ...context,
      });
    }
  }
}

// Runtime Layer - Default logger implementation
function consoleLogger(): Logger {
  return {
    debug: (msg, meta) => console.log(JSON.stringify({ level: 'debug', message: msg, ...meta })),
    info: (msg, meta) => console.log(JSON.stringify({ level: 'info', message: msg, ...meta })),
    warn: (msg, meta) => console.warn(JSON.stringify({ level: 'warn', message: msg, ...meta })),
    error: (msg, meta) => console.error(JSON.stringify({ level: 'error', message: msg, ...meta })),
  };
}

// Export types for consumers
export type { RedditPost, RedditTrendsConfig, RedditApiError, RedditRateLimitError, RedditValidationError };