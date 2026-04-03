/**
 * Trends Types - Public API Exports
 * 
 * This module exports all type definitions for the Trends feature.
 * Following the six-layer architecture: Types → Config → Repo → Service → Runtime → UI
 */

// ============================================================================
// Domain Types (Core Business Entities)
// ============================================================================

/**
 * Represents the direction of a trend
 */
export enum TrendDirection {
  UP = 'UP',
  DOWN = 'DOWN',
  FLAT = 'FLAT',
  VOLATILE = 'VOLATILE',
}

/**
 * Represents the granularity of trend data
 */
export enum TrendGranularity {
  MINUTE = 'MINUTE',
  HOUR = 'HOUR',
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

/**
 * Core trend data point entity
 */
export interface TrendDataPoint {
  /** Unique identifier for the data point */
  readonly id: string;
  /** Timestamp when the data was recorded */
  readonly timestamp: Date;
  /** The metric value at this point in time */
  readonly value: number;
  /** Optional metadata associated with this data point */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Trend series containing multiple data points for a specific metric
 */
export interface TrendSeries {
  /** Unique identifier for the series */
  readonly id: string;
  /** Human-readable name of the metric */
  readonly name: string;
  /** Metric identifier (e.g., 'cpu_usage', 'memory_consumption') */
  readonly metricId: string;
  /** Granularity of the data points */
  readonly granularity: TrendGranularity;
  /** Ordered array of data points (oldest to newest) */
  readonly dataPoints: ReadonlyArray<TrendDataPoint>;
  /** Calculated trend direction based on recent data */
  readonly direction: TrendDirection;
  /** Percentage change from start to end of series */
  readonly percentChange: number;
  /** When this series was last updated */
  readonly lastUpdated: Date;
}

/**
 * Trend analysis result with statistical insights
 */
export interface TrendAnalysis {
  /** The series that was analyzed */
  readonly series: TrendSeries;
  /** Statistical summary of the series */
  readonly statistics: TrendStatistics;
  /** Detected anomalies in the data */
  readonly anomalies: ReadonlyArray<TrendAnomaly>;
  /** Forecasted future values if available */
  readonly forecast?: TrendForecast;
}

/**
 * Statistical summary of a trend series
 */
export interface TrendStatistics {
  /** Minimum value in the series */
  readonly min: number;
  /** Maximum value in the series */
  readonly max: number;
  /** Arithmetic mean of all values */
  readonly mean: number;
  /** Median value */
  readonly median: number;
  /** Standard deviation */
  readonly stdDev: number;
  /** 95th percentile value */
  readonly p95: number;
  /** 99th percentile value */
  readonly p99: number;
}

/**
 * Detected anomaly in trend data
 */
export interface TrendAnomaly {
  /** Unique identifier for the anomaly */
  readonly id: string;
  /** Type of anomaly detected */
  readonly type: AnomalyType;
  /** Severity level of the anomaly */
  readonly severity: AnomalySeverity;
  /** Data point where anomaly was detected */
  readonly dataPoint: TrendDataPoint;
  /** Expected value based on historical patterns */
  readonly expectedValue: number;
  /** Actual deviation from expected */
  readonly deviation: number;
  /** Human-readable description */
  readonly description: string;
}

/**
 * Types of anomalies that can be detected
 */
export enum AnomalyType {
  SPIKE = 'SPIKE',
  DROP = 'DROP',
  PATTERN_BREAK = 'PATTERN_BREAK',
  SEASONAL_DEVIATION = 'SEASONAL_DEVIATION',
}

/**
 * Severity levels for anomalies
 */
export enum AnomalySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Forecasted trend data
 */
export interface TrendForecast {
  /** Method used for forecasting */
  readonly method: ForecastMethod;
  /** Confidence level (0-1) */
  readonly confidence: number;
  /** Predicted data points */
  readonly predictions: ReadonlyArray<TrendDataPoint>;
  /** Prediction interval (lower and upper bounds) */
  readonly predictionInterval?: {
    readonly lower: ReadonlyArray<TrendDataPoint>;
    readonly upper: ReadonlyArray<TrendDataPoint>;
  };
}

/**
 * Forecasting methods available
 */
export enum ForecastMethod {
  LINEAR_REGRESSION = 'LINEAR_REGRESSION',
  EXPONENTIAL_SMOOTHING = 'EXPONENTIAL_SMOOTHING',
  ARIMA = 'ARIMA',
  PROPHET = 'PROPHET',
}

// ============================================================================
// Input/Configuration Types (Config Layer)
// ============================================================================

/**
 * Configuration for fetching trend data
 */
export interface TrendQueryConfig {
  /** Metric identifier to query */
  readonly metricId: string;
  /** Start of the time range */
  readonly startTime: Date;
  /** End of the time range */
  readonly endTime: Date;
  /** Desired granularity */
  readonly granularity: TrendGranularity;
  /** Optional filters to apply */
  readonly filters?: TrendFilters;
  /** Maximum number of data points to return */
  readonly limit?: number;
}

/**
 * Filters that can be applied to trend queries
 */
export interface TrendFilters {
  /** Filter by specific tags */
  readonly tags?: ReadonlyArray<string>;
  /** Filter by source system */
  readonly source?: string;
  /** Custom filter expression */
  readonly expression?: string;
}

/**
 * Configuration for trend analysis
 */
export interface TrendAnalysisConfig {
  /** Whether to detect anomalies */
  readonly detectAnomalies: boolean;
  /** Anomaly detection sensitivity (0-1, higher = more sensitive) */
  readonly anomalySensitivity?: number;
  /** Whether to generate forecast */
  readonly generateForecast: boolean;
  /** Number of periods to forecast */
  readonly forecastPeriods?: number;
  /** Forecasting method preference */
  readonly forecastMethod?: ForecastMethod;
}

// ============================================================================
// Repository Types (Repo Layer)
// ============================================================================

/**
 * Repository interface for trend data access
 * Implementations handle persistence concerns
 */
export interface TrendRepository {
  /**
   * Fetch trend series based on query configuration
   * @throws {TrendRepositoryError} if query fails
   */
  fetchSeries(config: TrendQueryConfig): Promise<TrendSeries>;

  /**
   * Fetch multiple series in a single operation
   * @throws {TrendRepositoryError} if query fails
   */
  fetchMultipleSeries(configs: ReadonlyArray<TrendQueryConfig>): Promise<ReadonlyArray<TrendSeries>>;

  /**
   * Store a new trend data point
   * @throws {TrendRepositoryError} if storage fails
   */
  storeDataPoint(seriesId: string, dataPoint: TrendDataPoint): Promise<void>;

  /**
   * Check if repository is healthy
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Error thrown by trend repository operations
 */
export class TrendRepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: TrendErrorCode,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'TrendRepositoryError';
    Object.setPrototypeOf(this, TrendRepositoryError.prototype);
  }
}

// ============================================================================
// Service Types (Service Layer)
// ============================================================================

/**
 * Service interface for trend business logic
 */
export interface TrendService {
  /**
   * Get trend analysis for a metric
   * @throws {TrendServiceError} if analysis fails
   */
  analyzeTrends(config: TrendQueryConfig, analysisConfig: TrendAnalysisConfig): Promise<TrendAnalysis>;

  /**
   * Compare trends across multiple metrics
   * @throws {TrendServiceError} if comparison fails
   */
  compareTrends(configs: ReadonlyArray<TrendQueryConfig>): Promise<TrendComparison>;

  /**
   * Get real-time trend updates (for streaming)
   */
  subscribeToTrends(metricId: string): TrendSubscription;
}

/**
 * Comparison result for multiple trends
 */
export interface TrendComparison {
  /** Series being compared */
  readonly series: ReadonlyArray<TrendSeries>;
  /** Correlation matrix between series */
  readonly correlations: ReadonlyArray<SeriesCorrelation>;
  /** Comparative statistics */
  readonly comparativeStats: ComparativeStatistics;
}

/**
 * Correlation between two series
 */
export interface SeriesCorrelation {
  /** First series ID */
  readonly seriesIdA: string;
  /** Second series ID */
  readonly seriesIdB: string;
  /** Pearson correlation coefficient (-1 to 1) */
  readonly coefficient: number;
  /** Strength of correlation */
  readonly strength: CorrelationStrength;
}

/**
 * Correlation strength categories
 */
export enum CorrelationStrength {
  NONE = 'NONE',
  WEAK = 'WEAK',
  MODERATE = 'MODERATE',
  STRONG = 'STRONG',
}

/**
 * Comparative statistics across series
 */
export interface ComparativeStatistics {
  /** Series with highest mean value */
  readonly highestMean: string;
  /** Series with most volatility (highest std dev) */
  readonly mostVolatile: string;
  /** Series with strongest upward trend */
  readonly strongestGrowth: string;
}

/**
 * Subscription for real-time trend updates
 */
export interface TrendSubscription {
  /** Unique subscription identifier */
  readonly id: string;
  /** Async iterator for trend updates */
  [Symbol.asyncIterator](): AsyncIterator<TrendUpdate>;
  /** Unsubscribe from updates */
  unsubscribe(): Promise<void>;
}

/**
 * Real-time trend update
 */
export interface TrendUpdate {
  /** Timestamp of the update */
  readonly timestamp: Date;
  /** Updated series data */
  readonly series: TrendSeries;
  /** Type of update */
  readonly type: UpdateType;
}

/**
 * Types of trend updates
 */
export enum UpdateType {
  NEW_DATA_POINT = 'NEW_DATA_POINT',
  SERIES_UPDATED = 'SERIES_UPDATED',
  ANOMALY_DETECTED = 'ANOMALY_DETECTED',
}

/**
 * Error thrown by trend service operations
 */
export class TrendServiceError extends Error {
  constructor(
    message: string,
    public readonly code: TrendErrorCode,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TrendServiceError';
    Object.setPrototypeOf(this, TrendServiceError.prototype);
  }
}

// ============================================================================
// Runtime Types (Runtime Layer)
// ============================================================================

/**
 * Error codes for trend operations
 */
export enum TrendErrorCode {
  // Repository errors
  REPOSITORY_CONNECTION_FAILED = 'REPOSITORY_CONNECTION_FAILED',
  REPOSITORY_QUERY_FAILED = 'REPOSITORY_QUERY_FAILED',
  REPOSITORY_STORAGE_FAILED = 'REPOSITORY_STORAGE_FAILED',
  
  // Service errors
  SERVICE_ANALYSIS_FAILED = 'SERVICE_ANALYSIS_FAILED',
  SERVICE_INVALID_CONFIG = 'SERVICE_INVALID_CONFIG',
  SERVICE_COMPARISON_FAILED = 'SERVICE_COMPARISON_FAILED',
  
  // Validation errors
  VALIDATION_INVALID_DATE_RANGE = 'VALIDATION_INVALID_DATE_RANGE',
  VALIDATION_INVALID_GRANULARITY = 'VALIDATION_INVALID_GRANULARITY',
  VALIDATION_MISSING_REQUIRED_FIELD = 'VALIDATION_MISSING_REQUIRED_FIELD',
  
  // Runtime errors
  RUNTIME_TIMEOUT = 'RUNTIME_TIMEOUT',
  RUNTIME_RESOURCE_EXHAUSTED = 'RUNTIME_RESOURCE_EXHAUSTED',
}

/**
 * Runtime configuration for trend processing
 */
export interface TrendRuntimeConfig {
  /** Maximum query execution time in milliseconds */
  readonly queryTimeoutMs: number;
  /** Maximum data points per query */
  readonly maxDataPoints: number;
  /** Whether to enable caching */
  readonly enableCaching: boolean;
  /** Cache TTL in seconds */
  readonly cacheTtlSeconds?: number;
}

// ============================================================================
// UI Types (UI Layer)
// ============================================================================

/**
 * View model for trend visualization
 */
export interface TrendViewModel {
  /** Series data formatted for display */
  readonly series: TrendSeries;
  /** Chart configuration */
  readonly chartConfig: ChartConfig;
  /** Display options */
  readonly displayOptions: DisplayOptions;
  /** Interactive elements state */
  readonly interactionState: InteractionState;
}

/**
 * Chart configuration for rendering
 */
export interface ChartConfig {
  /** Chart type */
  readonly type: ChartType;
  /** Color scheme */
  readonly colorScheme: ColorScheme;
  /** Whether to show grid lines */
  readonly showGrid: boolean;
  /** Whether to show legend */
  readonly showLegend: boolean;
  /** Y-axis configuration */
  readonly yAxis?: AxisConfig;
  /** X-axis configuration */
  readonly xAxis?: AxisConfig;
}

/**
 * Supported chart types
 */
export enum ChartType {
  LINE = 'LINE',
  AREA = 'AREA',
  BAR = 'BAR',
  SCATTER = 'SCATTER',
}

/**
 * Color scheme options
 */
export enum ColorScheme {
  DEFAULT = 'DEFAULT',
  DIVERGING = 'DIVERGING',
  SEQUENTIAL = 'SEQUENTIAL',
  CATEGORICAL = 'CATEGORICAL',
}

/**
 * Axis configuration
 */
export interface AxisConfig {
  /** Axis label */
  readonly label?: string;
  /** Minimum value (auto if not specified) */
  readonly min?: number;
  /** Maximum value (auto if not specified) */
  readonly max?: number;
  /** Number of ticks */
  readonly tickCount?: number;
  /** Format string for values */
  readonly format?: string;
}

/**
 * Display options for trend visualization
 */
export interface DisplayOptions {
  /** Whether to show anomalies highlighted */
  readonly highlightAnomalies: boolean;
  /** Whether to show forecast if available */
  readonly showForecast: boolean;
  /** Whether to show statistics panel */
  readonly showStatistics: boolean;
  /** Timezone for display */
  readonly timezone: string;
}

/**
 * Interactive state for trend UI
 */
export interface InteractionState {
  /** Currently selected time range */
  readonly selectedRange?: { start: Date; end: Date };
  /** Currently hovered data point */
  readonly hoveredPoint?: TrendDataPoint;
  /** Zoom level (1 = 100%) */
  readonly zoomLevel: number;
  /** Whether comparison mode is active */
  readonly comparisonMode: boolean;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Result type for operations that may fail
 */
export type Result<T, E = TrendErrorCode> = 
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E; readonly message: string };

/**
 * Nullable type helper
 */
export type Nullable<T> = T | null | undefined;

/**
 * Deep readonly type helper
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

// ============================================================================
// Re-exports for convenience
// ============================================================================

export type {
  TrendDataPoint,
  TrendSeries,
  TrendAnalysis,
  TrendStatistics,
  TrendAnomaly,
  TrendForecast,
  TrendQueryConfig,
  TrendFilters,
  TrendAnalysisConfig,
  TrendRepository,
  TrendService,
  TrendComparison,
  SeriesCorrelation,
  ComparativeStatistics,
  TrendSubscription,
  TrendUpdate,
  TrendRuntimeConfig,
  TrendViewModel,
  ChartConfig,
  AxisConfig,
  DisplayOptions,
  InteractionState,
};