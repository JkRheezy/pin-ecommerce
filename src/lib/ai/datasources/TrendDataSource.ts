/**
 * TrendDataSource.ts
 * 
 * Data source interfaces for trend-related data following the six-layer architecture.
 * This file defines the contracts for fetching trend data from various sources.
 */

import { Result, ValidationError } from '../../types/Result';
import { Trend, TrendFilter, TrendMetrics, TrendTimeRange } from '../../types/Trend';

// ============================================================================
// Types Layer
// ============================================================================

/**
 * Configuration options for trend data sources
 */
export interface TrendDataSourceConfig {
  /** Base URL for the data source API */
  readonly baseUrl: string;
  /** API key for authentication */
  readonly apiKey: string;
  /** Request timeout in milliseconds */
  readonly timeoutMs: number;
  /** Maximum number of retries for failed requests */
  readonly maxRetries: number;
  /** Cache TTL in seconds */
  readonly cacheTtlSeconds: number;
}

/**
 * Options for fetching trend data
 */
export interface TrendFetchOptions {
  /** Time range for the trend data */
  readonly timeRange: TrendTimeRange;
  /** Optional filters to apply */
  readonly filter?: TrendFilter;
  /** Maximum number of results to return */
  readonly limit?: number;
  /** Offset for pagination */
  readonly offset?: number;
  /** Whether to include historical data */
  readonly includeHistory?: boolean;
}

/**
 * Raw trend data response from external sources
 */
export interface RawTrendData {
  readonly id: string;
  readonly timestamp: Date;
  readonly value: number;
  readonly metadata?: Record<string, unknown>;
}

// ============================================================================
// Repository Layer - Interface Definitions
// ============================================================================

/**
 * Interface for trend data sources.
 * Implementations should handle fetching trend data from various backends
 * (databases, APIs, caches, etc.).
 */
export interface ITrendDataSource {
  /** Unique identifier for this data source */
  readonly sourceId: string;

  /**
   * Fetch trends based on the provided options.
   * @param options - Fetch options including time range and filters
   * @returns Result containing array of trends or validation errors
   */
  fetchTrends(options: TrendFetchOptions): Promise<Result<Trend[], ValidationError[]>>;

  /**
   * Fetch a single trend by its identifier.
   * @param trendId - Unique identifier for the trend
   * @returns Result containing the trend or validation errors
   */
  fetchTrendById(trendId: string): Promise<Result<Trend, ValidationError[]>>;

  /**
   * Fetch aggregated metrics for trends matching the filter criteria.
   * @param options - Fetch options for filtering
   * @returns Result containing trend metrics or validation errors
   */
  fetchTrendMetrics(options: TrendFetchOptions): Promise<Result<TrendMetrics, ValidationError[]>>;

  /**
   * Check if the data source is healthy and available.
   * @returns Result indicating health status
   */
  healthCheck(): Promise<Result<boolean, ValidationError[]>>;
}

/**
 * Interface for cached trend data sources.
 * Extends the base data source with cache management capabilities.
 */
export interface ICachedTrendDataSource extends ITrendDataSource {
  /**
   * Invalidate cached data for a specific trend or pattern.
   * @param pattern - Optional pattern to match cache keys (invalidates all if not provided)
   * @returns Result indicating success or failure
   */
  invalidateCache(pattern?: string): Promise<Result<void, ValidationError[]>>;

  /**
   * Pre-warm the cache with commonly accessed trend data.
   * @param commonQueries - List of fetch options to pre-cache
   * @returns Result indicating success or failure
   */
  prewarmCache(commonQueries: TrendFetchOptions[]): Promise<Result<void, ValidationError[]>>;
}

/**
 * Interface for real-time trend data sources.
 * Supports streaming updates for live trend monitoring.
 */
export interface IRealTimeTrendDataSource extends ITrendDataSource {
  /**
   * Subscribe to real-time trend updates.
   * @param callback - Function called when new trend data arrives
   * @param filter - Optional filter for specific trend categories
   * @returns Unsubscribe function
   */
  subscribeToUpdates(
    callback: (trend: Trend) => void,
    filter?: TrendFilter
  ): () => void;

  /**
   * Check if real-time connection is active.
   * @returns True if connected and receiving updates
   */
  isConnected(): boolean;

  /**
   * Reconnect to the real-time data source.
   * @returns Result indicating success or failure
   */
  reconnect(): Promise<Result<void, ValidationError[]>>;
}

// ============================================================================
// Service Layer - Abstract Base Classes
// ============================================================================

/**
 * Abstract base class for trend data sources.
 * Provides common functionality and enforces consistent error handling.
 */
export abstract class BaseTrendDataSource implements ITrendDataSource {
  public abstract readonly sourceId: string;

  protected readonly config: TrendDataSourceConfig;
  protected readonly logger: ILogger;

  constructor(config: TrendDataSourceConfig, logger: ILogger) {
    this.config = config;
    this.logger = logger;
  }

  public abstract fetchTrends(options: TrendFetchOptions): Promise<Result<Trend[], ValidationError[]>>;
  public abstract fetchTrendById(trendId: string): Promise<Result<Trend, ValidationError[]>>;
  public abstract fetchTrendMetrics(options: TrendFetchOptions): Promise<Result<TrendMetrics, ValidationError[]>>;
  public abstract healthCheck(): Promise<Result<boolean, ValidationError[]>>;

  /**
   * Validates fetch options before processing.
   * Returns validation errors if options are invalid.
   */
  protected validateFetchOptions(options: TrendFetchOptions): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!options.timeRange) {
      errors.push({ field: 'timeRange', message: 'Time range is required' });
    } else {
      if (options.timeRange.start > options.timeRange.end) {
        errors.push({ field: 'timeRange', message: 'Start date must be before end date' });
      }
      
      const maxRangeDays = 365;
      const rangeDays = (options.timeRange.end.getTime() - options.timeRange.start.getTime()) / (1000 * 60 * 60 * 24);
      if (rangeDays > maxRangeDays) {
        errors.push({ field: 'timeRange', message: `Time range cannot exceed ${maxRangeDays} days` });
      }
    }

    if (options.limit !== undefined && (options.limit < 1 || options.limit > 1000)) {
      errors.push({ field: 'limit', message: 'Limit must be between 1 and 1000' });
    }

    if (options.offset !== undefined && options.offset < 0) {
      errors.push({ field: 'offset', message: 'Offset cannot be negative' });
    }

    return errors;
  }

  /**
   * Wraps data source operations with consistent error handling and logging.
   */
  protected async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<Result<T, ValidationError[]>> {
    try {
      this.logger.debug(`Starting operation: ${context}`, { sourceId: this.sourceId });
      const result = await operation();
      this.logger.debug(`Completed operation: ${context}`, { sourceId: this.sourceId });
      return { success: true, data: result };
    } catch (error) {
      this.logger.error(`Operation failed: ${context}`, {
        sourceId: this.sourceId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        success: false,
        errors: [{
          field: 'operation',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        }],
      };
    }
  }
}

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * Logger interface for structured logging
 */
export interface ILogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Factory for creating data source instances
// ============================================================================

/**
 * Factory for creating trend data source instances.
 * Follows the factory pattern for dependency injection and testability.
 */
export class TrendDataSourceFactory {
  /**
   * Create a standard trend data source.
   */
  static createStandard(
    config: TrendDataSourceConfig,
    logger: ILogger
  ): ITrendDataSource {
    // Implementation would return concrete instance
    throw new Error('Not implemented - use concrete factory implementation');
  }

  /**
   * Create a cached trend data source.
   */
  static createCached(
    config: TrendDataSourceConfig,
    logger: ILogger,
    cacheConfig: unknown
  ): ICachedTrendDataSource {
    // Implementation would return concrete instance
    throw new Error('Not implemented - use concrete factory implementation');
  }

  /**
   * Create a real-time trend data source.
   */
  static createRealTime(
    config: TrendDataSourceConfig,
    logger: ILogger,
    connectionConfig: unknown
  ): IRealTimeTrendDataSource {
    // Implementation would return concrete instance
    throw new Error('Not implemented - use concrete factory implementation');
  }
}