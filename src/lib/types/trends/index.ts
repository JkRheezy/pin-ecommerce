/**
 * @fileoverview Barrel export for trends types
 * @module lib/types/trends
 * @description Centralized export point for all trends-related type definitions
 * following the six-layer architecture (Types → Config → Repo → Service → Runtime → UI)
 */

// ==========================================
// Layer 1: Core Domain Types (Types Layer)
// ==========================================

/**
 * Base trend entity representing a single data point in a trend series
 */
export interface TrendDataPoint {
  /** Unique identifier for the data point */
  readonly id: string;
  /** Timestamp when the data was recorded */
  readonly timestamp: Date;
  /** Numeric value for this trend point */
  readonly value: number;
  /** Optional metadata associated with this point */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Trend series containing multiple data points with configuration
 */
export interface TrendSeries {
  /** Unique identifier for the series */
  readonly seriesId: string;
  /** Human-readable name of the trend */
  readonly name: string;
  /** Data points in chronological order */
  readonly dataPoints: ReadonlyArray<TrendDataPoint>;
  /** Unit of measurement (e.g., 'ms', 'percent', 'count') */
  readonly unit: TrendUnit;
  /** Aggregation method used for this series */
  readonly aggregation: TrendAggregationType;
}

/**
 * Supported units for trend measurements
 */
export type TrendUnit =
  | 'milliseconds'
  | 'seconds'
  | 'percent'
  | 'count'
  | 'bytes'
  | 'requests_per_second';

/**
 * Aggregation methods for trend data
 */
export type TrendAggregationType =
  | 'average'
  | 'sum'
  | 'min'
  | 'max'
  | 'p50'
  | 'p95'
  | 'p99';

// ==========================================
// Layer 2: Configuration Types (Config Layer)
// ==========================================

/**
 * Configuration for trend data retrieval and processing
 */
export interface TrendConfig {
  /** Time range for trend data */
  readonly timeRange: TrendTimeRange;
  /** Resolution/granularity of data points */
  readonly resolution: TrendResolution;
  /** Optional filters to apply */
  readonly filters?: TrendFilters;
  /** Maximum number of data points to return */
  readonly maxDataPoints?: number;
}

/**
 * Time range specification for trend queries
 */
export interface TrendTimeRange {
  /** Start time (inclusive) */
  readonly startTime: Date;
  /** End time (exclusive) */
  readonly endTime: Date;
}

/**
 * Data resolution options for trend aggregation
 */
export type TrendResolution =
  | 'raw'
  | '1m'
  | '5m'
  | '15m'
  | '1h'
  | '6h'
  | '1d'
  | '7d';

/**
 * Filter criteria for trend data
 */
export interface TrendFilters {
  /** Filter by specific series IDs */
  readonly seriesIds?: ReadonlyArray<string>;
  /** Filter by tags */
  readonly tags?: Record<string, string>;
  /** Minimum value threshold */
  readonly minValue?: number;
  /** Maximum value threshold */
  readonly maxValue?: number;
}

// ==========================================
// Layer 3-4: Repository & Service Types
// ==========================================

/**
 * Repository interface for trend data persistence
 * Follows the Repository pattern from layer 3
 */
export interface ITrendRepository {
  /**
   * Retrieve trend series based on configuration
   * @param config - Query configuration
   * @returns Promise resolving to matching trend series
   * @throws {TrendRepositoryError} On query failure
   */
  findSeries(config: TrendConfig): Promise<ReadonlyArray<TrendSeries>>;

  /**
   * Persist a new trend series
   * @param series - Series to save
   * @throws {TrendRepositoryError} On persistence failure
   */
  saveSeries(series: TrendSeries): Promise<void>;

  /**
   * Delete a trend series by ID
   * @param seriesId - ID of series to delete
   * @throws {TrendRepositoryError} On deletion failure
   */
  deleteSeries(seriesId: string): Promise<void>;
}

/**
 * Service layer result wrapper for trend operations
 * Follows the Service pattern from layer 4
 */
export interface TrendServiceResult<T> {
  /** Whether the operation succeeded */
  readonly success: boolean;
  /** Result data on success */
  readonly data?: T;
  /** Error information on failure */
  readonly error?: TrendError;
}

/**
 * Structured error type for trend operations
 */
export interface TrendError {
  /** Error code for programmatic handling */
  readonly code: TrendErrorCode;
  /** Human-readable error message */
  readonly message: string;
  /** Additional error context */
  readonly context?: Record<string, unknown>;
}

/**
 * Error codes for trend operations
 */
export type TrendErrorCode =
  | 'INVALID_TIME_RANGE'
  | 'RESOLUTION_NOT_SUPPORTED'
  | 'SERIES_NOT_FOUND'
  | 'REPOSITORY_ERROR'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN_ERROR';

// ==========================================
// Layer 5-6: Runtime & UI Types
// ==========================================

/**
 * Runtime state for trend visualization components
 */
export interface TrendRuntimeState {
  /** Currently loaded series */
  readonly series: ReadonlyArray<TrendSeries>;
  /** Loading state indicator */
  readonly isLoading: boolean;
  /** Current error state if any */
  readonly error: TrendError | null;
  /** Last update timestamp */
  readonly lastUpdated: Date | null;
}

/**
 * UI-specific trend display options
 */
export interface TrendDisplayOptions {
  /** Chart type for visualization */
  readonly chartType: TrendChartType;
  /** Whether to show data point markers */
  readonly showMarkers: boolean;
  /** Color scheme for the chart */
  readonly colorScheme: TrendColorScheme;
  /** Enable tooltip on hover */
  readonly enableTooltip: boolean;
  /** Enable zoom and pan */
  readonly enableInteraction: boolean;
}

/**
 * Supported chart types for trend visualization
 */
export type TrendChartType =
  | 'line'
  | 'area'
  | 'bar'
  | 'scatter';

/**
 * Predefined color schemes for accessibility
 */
export type TrendColorScheme =
  | 'default'
  | 'highContrast'
  | 'colorBlindSafe'
  | 'darkMode';

// ==========================================
// Error Classes
// ==========================================

/**
 * Custom error class for trend repository operations
 */
export class TrendRepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: TrendErrorCode,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TrendRepositoryError';
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TrendRepositoryError);
    }
  }
}

/**
 * Custom error class for trend validation failures
 */
export class TrendValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown
  ) {
    super(message);
    this.name = 'TrendValidationError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TrendValidationError);
    }
  }
}

// ==========================================
// Type Guards
// ==========================================

/**
 * Type guard to check if value is a valid TrendDataPoint
 */
export function isTrendDataPoint(value: unknown): value is TrendDataPoint {
  if (!value || typeof value !== 'object') return false;
  const dp = value as Record<string, unknown>;
  return (
    typeof dp.id === 'string' &&
    dp.timestamp instanceof Date &&
    typeof dp.value === 'number'
  );
}

/**
 * Type guard to check if value is a valid TrendSeries
 */
export function isTrendSeries(value: unknown): value is TrendSeries {
  if (!value || typeof value !== 'object') return false;
  const series = value as Record<string, unknown>;
  return (
    typeof series.seriesId === 'string' &&
    typeof series.name === 'string' &&
    Array.isArray(series.dataPoints) &&
    series.dataPoints.every(isTrendDataPoint)
  );
}

// ==========================================
// Utility Types
// ==========================================

/**
 * Deep readonly version of TrendSeries for immutable operations
 */
export type ImmutableTrendSeries = DeepReadonly<TrendSeries>;

/**
 * Helper type for deep readonly transformation
 */
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends (infer U)[]
    ? ReadonlyArray<DeepReadonly<U>>
    : T[P] extends object
    ? DeepReadonly<T[P]>
    : T[P];
};

/**
 * Partial config for optional trend configuration
 */
export type PartialTrendConfig = Partial<TrendConfig> &
  Pick<TrendConfig, 'timeRange'>;

// Re-export any sub-module types if they exist
// export * from './validators';
// export * from './transformers';