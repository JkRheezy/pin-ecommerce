/**
 * Google Trends Service Interface
 * 
 * Layer: Service (Layer 4)
 * 
 * Provides an abstraction for fetching and analyzing Google Trends data
 * to support AI-powered content picking decisions.
 */

import { Result, ok, err } from 'neverthrow';
import { z } from 'zod';
import { createLogger } from '$lib/logging/logger';

// =============================================================================
// TYPES (Layer 1) - Domain Types
// =============================================================================

/**
 * Unique identifier for a trends query
 */
type TrendsQueryId = string & { readonly __brand: unique symbol };

/**
 * Geographic region for trends data
 */
type RegionCode = string & { readonly __brand: unique symbol };

/**
 * Time range for trends analysis
 */
enum TrendsTimeRange {
  PAST_HOUR = 'now 1-H',
  PAST_DAY = 'now 1-d',
  PAST_WEEK = 'now 7-d',
  PAST_MONTH = 'today 1-m',
  PAST_YEAR = 'today 12-m',
  FIVE_YEARS = 'today 5-y',
  ALL_TIME = 'all'
}

/**
 * Category for trends data
 */
enum TrendsCategory {
  ALL = '0',
  ARTS_ENTERTAINMENT = '3',
  BUSINESS = '8',
  COMPUTERS_ELECTRONICS = '5',
  FINANCE = '7',
  GAMES = '8',
  HEALTH = '45',
  HOBBIES_LEISURE = '65',
  HOME_GARDEN = '44',
  INTERNET_TELECOM = '13',
  JOBS_EDUCATION = '958',
  LAW_GOVERNMENT = '19',
  NEWS = '16',
  ONLINE_COMMUNITIES = '299',
  PEOPLE_SOCIETY = '14',
  PETS_ANIMALS = '66',
  REAL_ESTATE = '29',
  REFERENCE = '533',
  SCIENCE = '174',
  SHOPPING = '18',
  SPORTS = '20',
  TRAVEL = '67'
}

/**
 * Search term with metadata for trends analysis
 */
interface TrendsSearchTerm {
  readonly term: string;
  readonly weight: number; // 0.0 to 1.0, importance of this term
  readonly category?: TrendsCategory;
}

/**
 * Interest data point over time
 */
interface InterestDataPoint {
  readonly timestamp: Date;
  readonly value: number; // 0-100 relative interest
  readonly isProjected: boolean;
}

/**
 * Related query with relevance score
 */
interface RelatedQuery {
  readonly query: string;
  readonly topic: string;
  readonly value: number; // Search volume index
  readonly isRising: boolean;
}

/**
 * Related topic with relevance score
 */
interface RelatedTopic {
  readonly topic: string;
  readonly type: 'ENTITY' | 'SEARCH_TERM';
  readonly value: number;
  readonly isRising: boolean;
}

/**
 * Geographic interest distribution
 */
interface GeoInterest {
  readonly regionCode: RegionCode;
  readonly regionName: string;
  readonly value: number;
  readonly formattedValue: string;
}

/**
 * Complete trends result for a search term
 */
interface TrendsResult {
  readonly queryId: TrendsQueryId;
  readonly searchTerm: TrendsSearchTerm;
  readonly timeRange: TrendsTimeRange;
  readonly region: RegionCode | 'GLOBAL';
  readonly interestOverTime: readonly InterestDataPoint[];
  readonly relatedQueries: readonly RelatedQuery[];
  readonly relatedTopics: readonly RelatedTopic[];
  readonly interestByRegion: readonly GeoInterest[];
  readonly fetchedAt: Date;
  readonly expiresAt: Date;
}

/**
 * Aggregated trends analysis across multiple terms
 */
interface TrendsAnalysis {
  readonly terms: readonly TrendsSearchTerm[];
  readonly timeRange: TrendsTimeRange;
  readonly region: RegionCode | 'GLOBAL';
  readonly comparativeInterest: readonly {
    readonly term: TrendsSearchTerm;
    readonly averageInterest: number;
    readonly trendDirection: 'RISING' | 'FALLING' | 'STABLE';
    readonly volatility: number; // Standard deviation of interest
  }[];
  readonly emergingTopics: readonly RelatedTopic[];
  readonly regionalOpportunities: readonly GeoInterest[];
  readonly generatedAt: Date;
}

// =============================================================================
// CONFIG (Layer 2) - Configuration Types
// =============================================================================

/**
 * Configuration for Google Trends API client
 */
interface GoogleTrendsConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly retryAttempts: number;
  readonly cacheTtlSeconds: number;
  readonly rateLimitPerMinute: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Omit<GoogleTrendsConfig, 'apiKey'> = {
  baseUrl: 'https://trends.googleapis.com/trends/api',
  timeoutMs: 30000,
  retryAttempts: 3,
  cacheTtlSeconds: 3600,
  rateLimitPerMinute: 60
};

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * Domain errors for Google Trends operations
 */
enum GoogleTrendsErrorCode {
  INVALID_TERM = 'INVALID_TERM',
  INVALID_TIME_RANGE = 'INVALID_TIME_RANGE',
  INVALID_REGION = 'INVALID_REGION',
  API_ERROR = 'API_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  TIMEOUT = 'TIMEOUT',
  PARSE_ERROR = 'PARSE_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR'
}

/**
 * Structured error for Google Trends operations
 */
class GoogleTrendsError extends Error {
  constructor(
    public readonly code: GoogleTrendsErrorCode,
    message: string,
    public readonly cause?: unknown,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'GoogleTrendsError';
    Object.setPrototypeOf(this, GoogleTrendsError.prototype);
  }
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const TrendsSearchTermSchema = z.object({
  term: z.string().min(1).max(100),
  weight: z.number().min(0).max(1).default(1.0),
  category: z.nativeEnum(TrendsCategory).optional()
});

const TrendsQueryOptionsSchema = z.object({
  timeRange: z.nativeEnum(TrendsTimeRange).default(TrendsTimeRange.PAST_MONTH),
  region: z.string().regex(/^[A-Z]{2}$/).optional(),
  category: z.nativeEnum(TrendsCategory).optional()
});

// =============================================================================
// SERVICE INTERFACE (Layer 4)
// =============================================================================

/**
 * Interface for Google Trends data provider
 * 
 * Implementations may use real API calls, cached data, or mock responses
 * for testing purposes.
 */
interface IGoogleTrendsProvider {
  /**
   * Fetch interest over time data for a single term
   */
  fetchInterestOverTime(
    term: TrendsSearchTerm,
    options: z.infer<typeof TrendsQueryOptionsSchema>
  ): Promise<Result<readonly InterestDataPoint[], GoogleTrendsError>>;

  /**
   * Fetch related queries for a search term
   */
  fetchRelatedQueries(
    term: TrendsSearchTerm,
    options: z.infer<typeof TrendsQueryOptionsSchema>
  ): Promise<Result<readonly RelatedQuery[], GoogleTrendsError>>;

  /**
   * Fetch related topics for a search term
   */
  fetchRelatedTopics(
    term: TrendsSearchTerm,
    options: z.infer<typeof TrendsQueryOptionsSchema>
  ): Promise<Result<readonly RelatedTopic[], GoogleTrendsError>>;

  /**
   * Fetch geographic interest distribution
   */
  fetchInterestByRegion(
    term: TrendsSearchTerm,
    options: z.infer<typeof TrendsQueryOptionsSchema>
  ): Promise<Result<readonly GeoInterest[], GoogleTrendsError>>;
}

/**
 * Google Trends Service
 * 
 * Provides high-level operations for trends analysis with caching,
 * error handling, and result aggregation.
 */
class GoogleTrendsService {
  private readonly logger = createLogger('GoogleTrendsService');
  private readonly config: GoogleTrendsConfig;
  private readonly provider: IGoogleTrendsProvider;
  private readonly cache: Map<string, { data: unknown; expiresAt: Date }>;

  constructor(
    config: Partial<GoogleTrendsConfig> & { apiKey: string },
    provider: IGoogleTrendsProvider
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.provider = provider;
    this.cache = new Map();
    this.logger.info('GoogleTrendsService initialized', {
      baseUrl: this.config.baseUrl,
      timeoutMs: this.config.timeoutMs
    });
  }

  /**
   * Generate a cache key for a trends query
   */
  private generateCacheKey(
    term: TrendsSearchTerm,
    options: z.infer<typeof TrendsQueryOptionsSchema>
  ): string {
    const normalizedTerm = term.term.toLowerCase().trim();
    const region = options.region ?? 'GLOBAL';
    return `trends:${normalizedTerm}:${options.timeRange}:${region}:${term.category ?? 'ALL'}`;
  }

  /**
   * Check if cached data is still valid
   */
  private isCacheValid<T>(cacheKey: string): T | null {
    const cached = this.cache.get(cacheKey);
    if (!cached) return null;
    
    if (new Date() > cached.expiresAt) {
      this.cache.delete(cacheKey);
      return null;
    }
    
    return cached.data as T;
  }

  /**
   * Store data in cache with expiration
   */
  private setCache<T>(cacheKey: string, data: T): void {
    const expiresAt = new Date(Date.now() + this.config.cacheTtlSeconds * 1000);
    this.cache.set(cacheKey, { data, expiresAt });
    this.logger.debug('Cached trends data', { cacheKey, expiresAt });
  }

  /**
   * Validate and normalize search terms
   */
  private validateSearchTerm(
    term: unknown
  ): Result<TrendsSearchTerm, GoogleTrendsError> {
    const result = TrendsSearchTermSchema.safeParse(term);
    
    if (!result.success) {
      return err(
        new GoogleTrendsError(
          GoogleTrendsErrorCode.INVALID_TERM,
          `Invalid search term: ${result.error.message}`,
          result.error,
          false
        )
      );
    }
    
    return ok(result.data);
  }

  /**
   * Fetch complete trends data for a single search term
   * 
   * This method orchestrates multiple provider calls and aggregates
   * the results into a comprehensive TrendsResult.
   */
  async fetchTrends(
    term: TrendsSearchTerm,
    options: z.infer<typeof TrendsQueryOptionsSchema> = {}
  ): Promise<Result<TrendsResult, GoogleTrendsError>> {
    const validation = this.validateSearchTerm(term);
    if (validation.isErr()) {
      return err(validation.error);
    }

    const validTerm = validation.value;
    const validOptions = TrendsQueryOptionsSchema.parse(options);
    const cacheKey = this.generateCacheKey(validTerm, validOptions);

    // Check cache first
    const cached = this.isCacheValid<TrendsResult>(cacheKey);
    if (cached) {
      this.logger.debug('Returning cached trends result', { term: validTerm.term });
      return ok(cached);
    }

    this.logger.info('Fetching trends data', {
      term: validTerm.term,
      timeRange: validOptions.timeRange,
      region: validOptions.region ?? 'GLOBAL'
    });

    // Fetch all data sources in parallel for efficiency
    const [interestResult, queriesResult, topicsResult, geoResult] = await Promise.all([
      this.provider.fetchInterestOverTime(validTerm, validOptions),
      this.provider.fetchRelatedQueries(validTerm, validOptions),
      this.provider.fetchRelatedTopics(validTerm, validOptions),
      this.provider.fetchInterestByRegion(validTerm, validOptions)
    ]);

    // Aggregate errors if any requests failed
    const errors: GoogleTrendsError[] = [];
    if (interestResult.isErr()) errors.push(interestResult.error);
    if (queriesResult.isErr()) errors.push(queriesResult.error);
    if (topicsResult.isErr()) errors.push(topicsResult.error);
    if (geoResult.isErr()) errors.push(geoResult.error);

    if (errors.length > 0) {
      const primaryError = errors[0];
      this.logger.error('Failed to fetch trends data', {
        term: validTerm.term,
        errorCount: errors.length,
        primaryError: primaryError.message
      });
      return err(primaryError);
    }

    // All requests succeeded, construct result
    const result: TrendsResult = {
      queryId: this.generateQueryId(),
      searchTerm: validTerm,
      timeRange: validOptions.timeRange,
      region: (validOptions.region as RegionCode) ?? 'GLOBAL',
      interestOverTime: interestResult.value,
      relatedQueries: queriesResult.value,
      relatedTopics: topicsResult.value,
      interestByRegion: geoResult.value,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.cacheTtlSeconds * 1000)
    };

    this.setCache(cacheKey, result);
    this.logger.info('Successfully fetched trends data', {
      term: validTerm.term,
      dataPoints: result.interestOverTime.length,
      relatedQueries: result.relatedQueries.length
    });

    return ok(result);
  }

  /**
   * Perform comparative analysis across multiple search terms
   * 
   * This is useful for content picking decisions where we need to
   * compare potential topics against each other.
   */
  async analyzeTrends(
    terms: readonly TrendsSearchTerm[],
    options: z.infer<typeof TrendsQueryOptionsSchema> = {}
  ): Promise<Result<TrendsAnalysis, GoogleTrendsError>> {
    if (terms.length === 0) {
      return err(
        new GoogleTrendsError(
          GoogleTrendsErrorCode.INVALID_TERM,
          'At least one search term is required for analysis',
          null,
          false
        )
      );
    }

    if (terms.length > 5) {
      this.logger.warn('Too many terms for trends analysis, truncating to 5', {
        requestedCount: terms.length
      });
      terms = terms.slice(0, 5);
    }

    this.logger.info('Starting comparative trends analysis', {
      termCount: terms.length,
      terms: terms.map(t => t.term)
    });

    // Fetch trends for all terms
    const results = await Promise.all(
      terms.map(term => this.fetchTrends(term, options))
    );

    const successfulResults: TrendsResult[] = [];
    const errors: GoogleTrendsError[] = [];

    for (const result of results) {
      if (result.isOk()) {
        successfulResults.push(result.value);
      } else {
        errors.push(result.error);
      }
    }

    if (successfulResults.length === 0) {
      return err(
        new GoogleTrendsError(
          GoogleTrendsErrorCode.API_ERROR,
          'All trends requests failed',
          errors,
          errors.some(e => e.retryable)
        )
      );
    }

    // Calculate comparative metrics
    const comparativeInterest = successfulResults.map(result => {
      const values = result.interestOverTime.map(d => d.value);
      const averageInterest = values.reduce((a, b) => a + b, 0) / values.length;
      
      // Calculate trend direction using linear regression on last 7 days
      const recentValues = values.slice(-7);
      const trendDirection = this.calculateTrendDirection(recentValues);
      
      // Calculate volatility (standard deviation)
      const volatility = this.calculateStandardDeviation(values);

      return {
        term: result.searchTerm,
        averageInterest,
        trendDirection,
        volatility
      };
    });

    // Aggregate emerging topics across all terms
    const topicFrequency = new Map<string, RelatedTopic & { count: number }>();
    for (const result of successfulResults) {
      for (const topic of result.relatedTopics) {
        if (topic.isRising) {
          const existing = topicFrequency.get(topic.topic);
          if (existing) {
            existing.count++;
            existing.value = Math.max(existing.value, topic.value);
          } else {
            topicFrequency.set(topic.topic, { ...topic, count: 1 });
          }
        }
      }
    }

    const emergingTopics = Array.from(topicFrequency.values())
      .sort((a, b) => b.count - a.count || b.value - a.value)
      .slice(0, 10);

    // Find regional opportunities (regions with high interest but low competition)
    const regionalOpportunities = this.aggregateRegionalOpportunities(successfulResults);

    const analysis: TrendsAnalysis = {
      terms: successfulResults.map(r => r.searchTerm),
      timeRange: options.timeRange ?? TrendsTimeRange.PAST_MONTH,
      region: (options.region as RegionCode) ?? 'GLOBAL',
      comparativeInterest,
      emergingTopics,
      regionalOpportunities,
      generatedAt: new Date()
    };

    this.logger.info('Completed trends analysis', {
      termCount: analysis.terms.length,
      emergingTopicsCount: emergingTopics.length
    });

    return ok(analysis);
  }

  /**
   * Calculate trend direction from a series of values
   * Uses simple slope calculation for performance
   */
  private calculateTrendDirection(values: readonly number[]): 'RISING' | 'FALLING' | 'STABLE' {
    if (values.length < 2) return 'STABLE';

    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    // Threshold for considering a trend significant
    const threshold = 0.5;
    if (slope > threshold) return 'RISING';
    if (slope < -threshold) return 'FALLING';
    return 'STABLE';
  }

  /**
   * Calculate standard deviation of values
   */
  private calculateStandardDeviation(values: readonly number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    
    return Math.sqrt(avgSquaredDiff);
  }

  /**
   * Aggregate regional opportunities across multiple trend results
   * 
   * Identifies regions where interest is high relative to the average
   * across all search terms, indicating potential content opportunities.
   */
  private aggregateRegionalOpportunities(results: readonly TrendsResult[]): readonly GeoInterest[] {
    const regionScores = new Map<string, { total: number; count: number; geo: GeoInterest }>();

    for (const result of results) {
      for (const geo of result.interestByRegion) {
        const existing = regionScores.get(geo.regionCode);
        if (existing) {
          existing.total += geo.value;
          existing.count++;
        } else {
          regionScores.set(geo.regionCode, {
            total: geo.value,
            count: 1,
            geo
          });
        }
      }
    }

    // Calculate average score and filter for above-average regions
    const averages = Array.from(regionScores.values())
      .map(r => ({ ...r.geo, value: r.total / r.count }))
      .sort((a, b) => b.value - a.value);

    const overallAverage = averages.reduce((sum, r) => sum + r.value, 0) / averages.length;

    return averages
      .filter(r => r.value > overallAverage * 1.2) // 20% above average
      .slice(0, 10);
  }

  /**
   * Generate a unique query ID
   */
  private generateQueryId(): TrendsQueryId {
    return `trend_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` as TrendsQueryId;
  }

  /**
   * Clear expired cache entries
   */
  cleanupCache(): void {
    const now = new Date();
    let cleared = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleared++;
      }
    }
    
    if (cleared > 0) {
      this.logger.debug('Cleaned up expired cache entries', { cleared });
    }
  }

  /**
   * Get current cache statistics
   */
  getCacheStats(): { size: number; maxAge: number } {
    const now = new Date();
    let maxAge = 0;
    
    for (const entry of this.cache.values()) {
      const age = entry.expiresAt.getTime() - now.getTime();
      maxAge = Math.max(maxAge, age);
    }
    
    return {
      size: this.cache.size,
      maxAge: Math.max(0, maxAge)
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  // Types
  type TrendsQueryId,
  type RegionCode,
  type TrendsSearchTerm,
  type InterestDataPoint,
  type RelatedQuery,
  type RelatedTopic,
  type GeoInterest,
  type TrendsResult,
  type TrendsAnalysis,
  type GoogleTrendsConfig,
  type IGoogleTrendsProvider,
  
  // Enums
  TrendsTimeRange,
  TrendsCategory,
  GoogleTrendsErrorCode,
  
  // Classes
  GoogleTrendsError,
  GoogleTrendsService,
  
  // Schemas
  TrendsSearchTermSchema,
  TrendsQueryOptionsSchema,
  
  // Constants
  DEFAULT_CONFIG
};