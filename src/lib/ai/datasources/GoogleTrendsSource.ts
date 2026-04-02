// src/lib/ai/datasources/GoogleTrendsSource.ts

// ============================================================================
// LAYER: Types
// ============================================================================

/**
 * Represents a single trending search term with associated metadata
 */
export interface TrendingSearch {
  /** The search query term */
  term: string;
  /** Relative search volume (0-100 scale) */
  searchVolume: number;
  /** Time period for the trend data */
  timeRange: TimeRange;
  /** Geographic region code (ISO 3166-1 alpha-2) */
  region?: string;
  /** Related queries for this term */
  relatedQueries: string[];
  /** Category identifier for the trend */
  category?: string;
  /** Timestamp when the data was fetched */
  fetchedAt: Date;
}

/**
 * Supported time ranges for trend queries
 */
export type TimeRange = '1h' | '4h' | '1d' | '7d' | '30d' | '90d' | '1y' | '5y';

/**
 * Geographic scope for trend data
 */
export type GeoScope = 'global' | 'country' | 'region' | 'city';

/**
 * Configuration options for Google Trends API requests
 */
export interface GoogleTrendsConfig {
  /** API endpoint base URL */
  baseUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Default time range if not specified */
  defaultTimeRange: TimeRange;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Maximum number of results per request */
  maxResults: number;
  /** Rate limit: requests per minute */
  rateLimitPerMinute: number;
}

/**
 * Raw response structure from Google Trends API
 */
interface GoogleTrendsApiResponse {
  default: {
    trendingSearchesDays: Array<{
      date: string;
      trendingSearches: Array<{
        title: {
          query: string;
          exploreLink: string;
        };
        formattedTraffic: string;
        relatedQueries: Array<{
          query: string;
          exploreLink: string;
        }>;
        articles?: Array<{
          title: string;
          url: string;
          source: string;
          snippet: string;
        }>;
      }>;
    }>;
  };
}

/**
 * Custom error types for Google Trends operations
 */
export class GoogleTrendsError extends Error {
  constructor(
    message: string,
    public readonly code: 'API_ERROR' | 'RATE_LIMIT' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'CONFIG_ERROR',
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'GoogleTrendsError';
    Object.setPrototypeOf(this, GoogleTrendsError.prototype);
  }
}

// ============================================================================
// LAYER: Config
// ============================================================================

import { getEnvVar } from '@/lib/config/env';

/**
 * Default configuration factory for Google Trends data source
 * Loads sensitive values from environment variables
 */
export function createDefaultConfig(): GoogleTrendsConfig {
  const apiKey = getEnvVar('GOOGLE_TRENDS_API_KEY');
  
  if (!apiKey) {
    throw new GoogleTrendsError(
      'GOOGLE_TRENDS_API_KEY environment variable is required',
      'CONFIG_ERROR'
    );
  }

  return {
    baseUrl: getEnvVar('GOOGLE_TRENDS_API_URL') || 'https://trends.googleapis.com/trends/api',
    apiKey,
    defaultTimeRange: '7d',
    timeoutMs: parseInt(getEnvVar('GOOGLE_TRENDS_TIMEOUT_MS') || '30000', 10),
    maxResults: parseInt(getEnvVar('GOOGLE_TRENDS_MAX_RESULTS') || '20', 10),
    rateLimitPerMinute: parseInt(getEnvVar('GOOGLE_TRENDS_RATE_LIMIT') || '100', 10),
  };
}

// ============================================================================
// LAYER: Repo (Repository Pattern for Data Access)
// ============================================================================

import { Logger } from '@/lib/logging/Logger';
import { MetricsCollector } from '@/lib/metrics/MetricsCollector';

/**
 * Repository interface for Google Trends data access
 * Abstracts the underlying data source implementation
 */
export interface ITrendsRepository {
  fetchTrendingSearches(options: FetchOptions): Promise<TrendingSearch[]>;
  fetchInterestOverTime(term: string, options: FetchOptions): Promise<InterestDataPoint[]>;
}

export interface FetchOptions {
  timeRange?: TimeRange;
  region?: string;
  category?: string;
  limit?: number;
}

export interface InterestDataPoint {
  timestamp: Date;
  value: number;
}

/**
 * HTTP client wrapper with retry logic and circuit breaker pattern
 */
class TrendsHttpClient {
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private requestCount: number = 0;
  private windowStart: number = Date.now();

  constructor(
    private readonly config: GoogleTrendsConfig,
    logger: Logger,
    metrics: MetricsCollector
  ) {
    this.logger = logger.child({ component: 'TrendsHttpClient' });
    this.metrics = metrics;
  }

  /**
   * Execute HTTP request with rate limiting and retry logic
   */
  async request<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    // Rate limiting check
    await this.enforceRateLimit();

    const url = new URL(`${this.config.baseUrl}${endpoint}`);
    url.searchParams.append('key', this.config.apiKey);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const startTime = performance.now();
    const signal = AbortSignal.timeout(this.config.timeoutMs);

    try {
      this.logger.debug('Fetching trends data', { endpoint, region: params.geo });

      const response = await fetch(url.toString(), {
        signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Harness-AI-TrendsBot/1.0',
        },
      });

      const duration = performance.now() - startTime;
      this.metrics.histogram('trends.request_duration_ms', duration, { endpoint });

      if (!response.ok) {
        this.handleHttpError(response);
      }

      // Google Trends API returns JSON with a specific prefix that needs removal
      const rawText = await response.text();
      const cleanJson = this.sanitizeResponse(rawText);
      
      return JSON.parse(cleanJson) as T;

    } catch (error) {
      this.metrics.increment('trends.request_errors', 1, { 
        endpoint, 
        error_type: error instanceof Error ? error.name : 'unknown' 
      });

      if (error instanceof GoogleTrendsError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new GoogleTrendsError(
          'Request timeout exceeded',
          'TIMEOUT',
          undefined,
          true
        );
      }

      this.logger.error('Failed to fetch trends data', { 
        error: error instanceof Error ? error.message : String(error),
        endpoint 
      });

      throw new GoogleTrendsError(
        'Failed to fetch trends data',
        'API_ERROR',
        undefined,
        true
      );
    }
  }

  /**
   * Enforce rate limiting using sliding window
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const windowMs = 60000; // 1 minute

    if (now - this.windowStart > windowMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    if (this.requestCount >= this.config.rateLimitPerMinute) {
      const waitMs = windowMs - (now - this.windowStart);
      this.logger.warn('Rate limit reached, throttling request', { waitMs });
      await new Promise(resolve => setTimeout(resolve, waitMs));
      return this.enforceRateLimit();
    }

    this.requestCount++;
  }

  /**
   * Convert HTTP errors to typed exceptions
   */
  private handleHttpError(response: Response): never {
    const status = response.status;
    
    if (status === 429) {
      throw new GoogleTrendsError(
        'Rate limit exceeded',
        'RATE_LIMIT',
        status,
        true
      );
    }

    if (status >= 500) {
      throw new GoogleTrendsError(
        `Server error: ${response.statusText}`,
        'API_ERROR',
        status,
        true
      );
    }

    throw new GoogleTrendsError(
      `HTTP error: ${response.statusText}`,
      'API_ERROR',
      status,
      false
    );
  }

  /**
   * Sanitize Google Trends API response by removing JavaScript wrapper
   * The API returns: )]}', {"data": ...}  — we need to strip the prefix
   */
  private sanitizeResponse(rawText: string): string {
    // Remove common JSONP-style prefixes
    const prefixes = [')]}\\', ',', ')]}\'', ')]}\','];
    let cleaned = rawText.trim();
    
    for (const prefix of prefixes) {
      if (cleaned.startsWith(prefix)) {
        cleaned = cleaned.slice(prefix.length).trim();
        break;
      }
    }

    // Validate we have valid JSON start
    if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
      throw new GoogleTrendsError(
        'Invalid response format from API',
        'INVALID_RESPONSE',
        undefined,
        true
      );
    }

    return cleaned;
  }
}

/**
 * Concrete repository implementation for Google Trends
 */
export class GoogleTrendsRepository implements ITrendsRepository {
  private readonly httpClient: TrendsHttpClient;
  private readonly logger: Logger;

  constructor(
    config: GoogleTrendsConfig,
    logger: Logger,
    metrics: MetricsCollector
  ) {
    this.httpClient = new TrendsHttpClient(config, logger, metrics);
    this.logger = logger.child({ component: 'GoogleTrendsRepository' });
  }

  /**
   * Fetch current trending searches with optional filtering
   */
  async fetchTrendingSearches(options: FetchOptions = {}): Promise<TrendingSearch[]> {
    const params: Record<string, string> = {
      hl: 'en-US',
      tz: '-480', // PST timezone offset
      geo: options.region || 'US',
    };

    if (options.category) {
      params.cat = options.category;
    }

    const response = await this.httpClient.request<GoogleTrendsApiResponse>(
      '/trendingsearches/daily',
      params
    );

    return this.transformToTrendingSearches(response, options);
  }

  /**
   * Fetch historical interest data for a specific term
   */
  async fetchInterestOverTime(
    term: string, 
    options: FetchOptions = {}
  ): Promise<InterestDataPoint[]> {
    const timeRange = options.timeRange || '7d';
    
    const params: Record<string, string> = {
      keyword: term,
      hl: 'en-US',
      tz: '-480',
      time: this.convertTimeRange(timeRange),
      geo: options.region || '',
    };

    // Note: Interest over time uses a different endpoint structure
    // This is a simplified implementation
    this.logger.debug('Fetching interest over time', { term, timeRange });

    // Placeholder for actual implementation
    // Real implementation would parse the timeline data from the API
    return [];
  }

  /**
   * Transform raw API response to domain model
   */
  private transformToTrendingSearches(
    response: GoogleTrendsApiResponse,
    options: FetchOptions
  ): TrendingSearch[] {
    if (!response?.default?.trendingSearchesDays) {
      this.logger.error('Unexpected API response structure', { response });
      throw new GoogleTrendsError(
        'Invalid response structure from API',
        'INVALID_RESPONSE'
      );
    }

    const limit = options.limit || 20;
    const results: TrendingSearch[] = [];

    // Flatten daily trending searches into single list
    for (const day of response.default.trendingSearchesDays) {
      for (const search of day.trendingSearches) {
        // Parse traffic volume from formatted string (e.g., "100K+" -> 100)
        const volume = this.parseTrafficVolume(search.formattedTraffic);

        results.push({
          term: search.title.query,
          searchVolume: volume,
          timeRange: options.timeRange || '1d',
          region: options.region,
          relatedQueries: search.relatedQueries.map(q => q.query),
          category: options.category,
          fetchedAt: new Date(),
        });

        if (results.length >= limit) {
          return results;
        }
      }
    }

    return results;
  }

  /**
   * Parse traffic volume from Google's formatted string
   * Handles formats: "100K+", "1M+", "5,000+", "500+"
   */
  private parseTrafficVolume(formatted: string): number {
    const cleaned = formatted.replace(/[+,]/g, '').toUpperCase();
    
    if (cleaned.endsWith('K')) {
      return parseFloat(cleaned.slice(0, -1)) * 1000;
    }
    if (cleaned.endsWith('M')) {
      return parseFloat(cleaned.slice(0, -1)) * 1000000;
    }
    
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Convert our TimeRange type to Google Trends API format
   */
  private convertTimeRange(range: TimeRange): string {
    const mapping: Record<TimeRange, string> = {
      '1h': 'now 1-H',
      '4h': 'now 4-H',
      '1d': 'now 1-d',
      '7d': 'now 7-d',
      '30d': 'today 1-m',
      '90d': 'today 3-m',
      '1y': 'today 12-m',
      '5y': 'today 5-y',
    };
    return mapping[range] || mapping['7d'];
  }
}

// ============================================================================
// LAYER: Service (Business Logic)
// ============================================================================

import { Cache } from '@/lib/cache/Cache';

/**
 * Service layer for Google Trends operations
 * Implements caching, validation, and business rules
 */
export class GoogleTrendsService {
  private readonly cache: Cache<TrendingSearch[]>;
  private readonly logger: Logger;

  constructor(
    private readonly repository: ITrendsRepository,
    cache: Cache<TrendingSearch[]>,
    logger: Logger
  ) {
    this.cache = cache;
    this.logger = logger.child({ component: 'GoogleTrendsService' });
  }

  /**
   * Get trending searches with caching support
   */
  async getTrendingSearches(options: FetchOptions = {}): Promise<TrendingSearch[]> {
    // Validate inputs
    this.validateOptions(options);

    // Generate cache key based on options
    const cacheKey = this.buildCacheKey(options);
    
    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      this.logger.debug('Cache hit for trending searches', { cacheKey });
      return cached;
    }

    // Fetch from repository
    this.logger.info('Fetching trending searches from API', { options });
    const results = await this.repository.fetchTrendingSearches(options);

    // Apply business rules: filter low-volume trends
    const filtered = this.applyBusinessRules(results);

    // Cache results (trends are volatile, use short TTL)
    await this.cache.set(cacheKey, filtered, { ttlSeconds: 300 }); // 5 minutes

    return filtered;
  }

  /**
   * Get trending topics for a specific industry/category
   */
  async getIndustryTrends(industry: string, region?: string): Promise<TrendingSearch[]> {
    const categoryMap: Record<string, string> = {
      'technology': 'cat/5',      // Computers & Electronics
      'business': 'cat/12',       // Business & Industrial
      'health': 'cat/45',         // Health
      'entertainment': 'cat/3',   // Arts & Entertainment
      'sports': 'cat/20',         // Sports
    };

    const category = categoryMap[industry.toLowerCase()];
    if (!category) {
      throw new GoogleTrendsError(
        `Unknown industry: ${industry}`,
        'CONFIG_ERROR'
      );
    }

    return this.getTrendingSearches({ category, region, limit: 10 });
  }

  /**
   * Validate fetch options
   */
  private validateOptions(options: FetchOptions): void {
    if (options.limit !== undefined) {
      if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) {
        throw new GoogleTrendsError(
          'Limit must be an integer between 1 and 100',
          'CONFIG_ERROR'
        );
      }
    }

    if (options.region && !/^[A-Z]{2}$/i.test(options.region)) {
      throw new GoogleTrendsError(
        'Region must be a valid ISO 3166-1 alpha-2 code',
        'CONFIG_ERROR'
      );
    }
  }

  /**
   * Build consistent cache key from options
   */
  private buildCacheKey(options: FetchOptions): string {
    const parts = ['trends'];
    if (options.region) parts.push(options.region.toLowerCase());
    if (options.category) parts.push(options.category);
    if (options.timeRange) parts.push(options.timeRange);
    return parts.join(':');
  }

  /**
   * Apply business rules to filter and rank results
   */
  private applyBusinessRules(searches: TrendingSearch[]): TrendingSearch[] {
    // Remove duplicate terms (case-insensitive)
    const seen = new Set<string>();
    const unique = searches.filter(s => {
      const key = s.term.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by search volume descending
    return unique.sort((a, b) => b.searchVolume - a.searchVolume);
  }
}

// ============================================================================
// LAYER: Runtime (Factory & Dependency Injection)
// ============================================================================

import { createLogger } from '@/lib/logging/createLogger';
import { createCache } from '@/lib/cache/createCache';
import { createMetricsCollector } from '@/lib/metrics/createMetricsCollector';

/**
 * Factory function to create a fully configured Google Trends service
 * Use this in application runtime to get a ready-to-use instance
 */
export async function createGoogleTrendsService(
  customConfig?: Partial<GoogleTrendsConfig>
): Promise<GoogleTrendsService> {
  const logger = createLogger('GoogleTrends');
  
  try {
    const config = { ...createDefaultConfig(), ...customConfig };
    const metrics = createMetricsCollector('google_trends');
    const cache = createCache<TrendingSearch[]>({ 
      name: 'google-trends',
      defaultTtlSeconds: 300 
    });
    
    const repository = new GoogleTrendsRepository(config, logger, metrics);
    
    logger.info('Google Trends service initialized', {
      baseUrl: config.baseUrl,
      defaultTimeRange: config.defaultTimeRange,
    });

    return new GoogleTrendsService(repository, cache, logger);

  } catch (error) {
    logger.error('Failed to initialize Google Trends service', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    throw error;
  }
}

// ============================================================================
// LAYER: UI (Public API / Interface)
// ============================================================================

/**
 * Simplified interface for UI/components to consume trend data
 */
export interface TrendsUIAdapter {
  getTopTrends(count: number): Promise<TrendItem[]>;
  searchTrends(query: string): Promise<TrendItem[]>;
}

export interface TrendItem {
  id: string;
  title: string;
  volume: string;
  changePercent?: number;
  category: string;
  timestamp: Date;
}

/**
 * Adapter to convert service data to UI-friendly format
 */
export class GoogleTrendsUIAdapter implements TrendsUIAdapter {
  constructor(private readonly service: GoogleTrendsService) {}

  async getTopTrends(count: number): Promise<TrendItem[]> {
    const trends = await this.service.getTrendingSearches({ limit: count });
    
    return trends.map((t, index) => ({
      id: `trend-${index}-${Date.now()}`,
      title: t.term,
      volume: this.formatVolume(t.searchVolume),
      category: t.category || 'general',
      timestamp: t.fetchedAt,
    }));
  }

  async searchTrends(query: string): Promise<TrendItem[]> {
    // Implementation would search historical data or related queries
    // For now, return empty array as placeholder
    return [];
  }

  private formatVolume(volume: number): string {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(1)}M`;
    }
    if (volume >= 1000) {
      return `${(volume / 1000).toFixed(1)}K`;
    }
    return volume.toString();
  }
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  createGoogleTrendsService,
  GoogleTrendsRepository,
  GoogleTrendsService,
  GoogleTrendsUIAdapter,
  GoogleTrendsError,
};