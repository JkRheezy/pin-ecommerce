/**
 * Trends Types - Public Exports
 * 
 * This module exports all type definitions for the Trends feature.
 * Following the six-layer architecture: Types → Config → Repo → Service → Runtime → UI
 */

// ==========================================
// Domain Types (Core business entities)
// ==========================================

/**
 * Represents the time range for trend analysis
 */
export type TrendTimeRange = 
  | '1h'   // Last 1 hour
  | '24h'  // Last 24 hours
  | '7d'   // Last 7 days
  | '30d'  // Last 30 days
  | '90d'  // Last 90 days
  | 'custom'; // Custom date range

/**
 * Supported metric types for trend analysis
 */
export type TrendMetricType = 
  | 'deployment_frequency'
  | 'lead_time'
  | 'change_failure_rate'
  | 'mttr' // Mean Time To Recovery
  | 'pipeline_duration'
  | 'success_rate';

/**
 * Aggregation method for trend data points
 */
export type TrendAggregation = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'p50' | 'p95' | 'p99';

// ==========================================
// Entity Types
// ==========================================

/**
 * Core trend data point entity
 */
export interface TrendDataPoint {
  /** Unique identifier for the data point */
  readonly id: string;
  /** Timestamp when the metric was recorded */
  readonly timestamp: Date;
  /** The metric value */
  readonly value: number;
  /** Optional metadata associated with this data point */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Trend series representing a collection of data points for a specific metric
 */
export interface TrendSeries {
  /** Unique identifier for the series */
  readonly id: string;
  /** Human-readable name of the series */
  readonly name: string;
  /** The metric type being tracked */
  readonly metricType: TrendMetricType;
  /** Color for visual representation (hex format) */
  readonly color: string;
  /** Ordered collection of data points (oldest to newest) */
  readonly dataPoints: readonly TrendDataPoint[];
  /** Aggregation method used for this series */
  readonly aggregation: TrendAggregation;
}

/**
 * Complete trend analysis result for a given time range
 */
export interface TrendAnalysis {
  /** Unique identifier for this analysis */
  readonly id: string;
  /** Time range used for this analysis */
  readonly timeRange: TrendTimeRange;
  /** Start of the analysis period */
  readonly startDate: Date;
  /** End of the analysis period */
  readonly endDate: Date;
  /** Collection of trend series */
  readonly series: readonly TrendSeries[];
  /** Computed statistics across all series */
  readonly statistics: TrendStatistics;
  /** When this analysis was generated */
  readonly generatedAt: Date;
}

/**
 * Statistical summary of trend data
 */
export interface TrendStatistics {
  /** Overall trend direction */
  readonly trendDirection: 'up' | 'down' | 'stable';
  /** Percentage change from previous period */
  readonly percentChange: number;
  /** Average value across all data points */
  readonly average: number;
  /** Minimum value observed */
  readonly minimum: number;
  /** Maximum value observed */
  readonly maximum: number;
  /** Total number of data points */
  readonly totalDataPoints: number;
}

// ==========================================
// Configuration Types
// ==========================================

/**
 * Configuration for trend data retrieval
 */
export interface TrendConfig {
  /** Time range for the trend analysis */
  readonly timeRange: TrendTimeRange;
  /** Specific metric types to include */
  readonly metricTypes: readonly TrendMetricType[];
  /** Aggregation method for data points */
  readonly aggregation: TrendAggregation;
  /** Custom start date (required when timeRange is 'custom') */
  readonly customStartDate?: Date;
  /** Custom end date (required when timeRange is 'custom') */
  readonly customEndDate?: Date;
  /** Maximum number of data points to return per series */
  readonly maxDataPoints?: number;
  /** Filter by specific entity IDs (e.g., pipeline IDs) */
  readonly entityFilter?: readonly string[];
}

/**
 * Validation result for trend configuration
 */
export interface TrendConfigValidation {
  readonly isValid: boolean;
  readonly errors: readonly TrendValidationError[];
}

/**
 * Individual validation error
 */
export interface TrendValidationError {
  readonly field: string;
  readonly message: string;
  readonly code: TrendErrorCode;
}

// ==========================================
// Error Types
// ==========================================

/**
 * Error codes specific to trend operations
 */
export type TrendErrorCode = 
  | 'INVALID_TIME_RANGE'
  | 'INVALID_METRIC_TYPE'
  | 'INVALID_AGGREGATION'
  | 'MISSING_CUSTOM_DATES'
  | 'INVALID_DATE_RANGE'
  | 'DATA_NOT_AVAILABLE'
  | 'CALCULATION_ERROR'
  | 'TIMEOUT';

/**
 * Custom error class for trend-related errors
 */
export class TrendError extends Error {
  constructor(
    message: string,
    public readonly code: TrendErrorCode,
    public readonly field?: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TrendError';
    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TrendError);
    }
  }
}

// ==========================================
// Repository Types
// ==========================================

/**
 * Interface for trend data repository operations
 */
export interface TrendRepository {
  /** Fetch trend series based on configuration */
  fetchSeries(config: TrendConfig): Promise<readonly TrendSeries[]>;
  /** Check if data is available for given config */
  hasData(config: TrendConfig): Promise<boolean>;
  /** Get available date range for a metric type */
  getAvailableDateRange(metricType: TrendMetricType): Promise<{ start: Date; end: Date } | null>;
}

// ==========================================
// Service Types
// ==========================================

/**
 * Input parameters for trend analysis service
 */
export interface AnalyzeTrendsInput {
  readonly config: TrendConfig;
  readonly compareWithPrevious?: boolean;
}

/**
 * Output from trend analysis service
 */
export interface AnalyzeTrendsOutput {
  readonly analysis: TrendAnalysis;
  readonly previousPeriodAnalysis?: TrendAnalysis;
  readonly comparison?: TrendComparison;
}

/**
 * Comparison between current and previous period
 */
export interface TrendComparison {
  readonly periodOverPeriodChange: number;
  readonly isImprovement: boolean;
  readonly significantChanges: readonly TrendSignificantChange[];
}

/**
 * Significant change detected in trend analysis
 */
export interface TrendSignificantChange {
  readonly metricType: TrendMetricType;
  readonly changePercent: number;
  readonly thresholdExceeded: boolean;
}

// ==========================================
// Runtime Types
// ==========================================

/**
 * API request payload for trend endpoints
 */
export interface TrendApiRequest {
  readonly timeRange: TrendTimeRange;
  readonly metricTypes: readonly TrendMetricType[];
  readonly aggregation?: TrendAggregation;
  readonly startDate?: string; // ISO 8601 format
  readonly endDate?: string;   // ISO 8601 format
}

/**
 * API response payload for trend endpoints
 */
export interface TrendApiResponse {
  readonly success: boolean;
  readonly data?: TrendAnalysis;
  readonly error?: {
    readonly code: TrendErrorCode;
    readonly message: string;
  };
}

// ==========================================
// UI Types
// ==========================================

/**
 * Props for trend chart component
 */
export interface TrendChartProps {
  readonly analysis: TrendAnalysis;
  readonly onDataPointClick?: (dataPoint: TrendDataPoint, series: TrendSeries) => void;
  readonly showLegend?: boolean;
  readonly height?: number;
  readonly loading?: boolean;
}

/**
 * Props for trend filter component
 */
export interface TrendFilterProps {
  readonly config: TrendConfig;
  readonly onChange: (config: TrendConfig) => void;
  readonly availableMetricTypes: readonly TrendMetricType[];
  readonly disabled?: boolean;
}

// ==========================================
// Utility Types
// ==========================================

/**
 * Type guard to check if a value is a valid TrendTimeRange
 */
export function isTrendTimeRange(value: unknown): value is TrendTimeRange {
  const validRanges: readonly TrendTimeRange[] = ['1h', '24h', '7d', '30d', '90d', 'custom'];
  return typeof value === 'string' && validRanges.includes(value as TrendTimeRange);
}

/**
 * Type guard to check if a value is a valid TrendMetricType
 */
export function isTrendMetricType(value: unknown): value is TrendMetricType {
  const validTypes: readonly TrendMetricType[] = [
    'deployment_frequency',
    'lead_time',
    'change_failure_rate',
    'mttr',
    'pipeline_duration',
    'success_rate'
  ];
  return typeof value === 'string' && validTypes.includes(value as TrendMetricType);
}

/**
 * Validates trend configuration and returns validation result
 */
export function validateTrendConfig(config: unknown): TrendConfigValidation {
  const errors: TrendValidationError[] = [];

  if (!config || typeof config !== 'object') {
    return {
      isValid: false,
      errors: [{ field: 'config', message: 'Config must be an object', code: 'INVALID_TIME_RANGE' }]
    };
  }

  const cfg = config as Partial<TrendConfig>;

  // Validate timeRange
  if (!cfg.timeRange || !isTrendTimeRange(cfg.timeRange)) {
    errors.push({
      field: 'timeRange',
      message: `Invalid timeRange. Must be one of: 1h, 24h, 7d, 30d, 90d, custom`,
      code: 'INVALID_TIME_RANGE'
    });
  }

  // Validate custom dates when timeRange is 'custom'
  if (cfg.timeRange === 'custom') {
    if (!cfg.customStartDate || !(cfg.customStartDate instanceof Date) || isNaN(cfg.customStartDate.getTime())) {
      errors.push({
        field: 'customStartDate',
        message: 'customStartDate is required and must be a valid Date when timeRange is custom',
        code: 'MISSING_CUSTOM_DATES'
      });
    }
    if (!cfg.customEndDate || !(cfg.customEndDate instanceof Date) || isNaN(cfg.customEndDate.getTime())) {
      errors.push({
        field: 'customEndDate',
        message: 'customEndDate is required and must be a valid Date when timeRange is custom',
        code: 'MISSING_CUSTOM_DATES'
      });
    }
    if (cfg.customStartDate && cfg.customEndDate && cfg.customStartDate > cfg.customEndDate) {
      errors.push({
        field: 'customDateRange',
        message: 'customStartDate must be before customEndDate',
        code: 'INVALID_DATE_RANGE'
      });
    }
  }

  // Validate metricTypes
  if (!Array.isArray(cfg.metricTypes) || cfg.metricTypes.length === 0) {
    errors.push({
      field: 'metricTypes',
      message: 'metricTypes must be a non-empty array',
      code: 'INVALID_METRIC_TYPE'
    });
  } else {
    cfg.metricTypes.forEach((mt, index) => {
      if (!isTrendMetricType(mt)) {
        errors.push({
          field: `metricTypes[${index}]`,
          message: `Invalid metric type: ${String(mt)}`,
          code: 'INVALID_METRIC_TYPE'
        });
      }
    });
  }

  // Validate aggregation
  const validAggregations: readonly TrendAggregation[] = ['sum', 'avg', 'min', 'max', 'count', 'p50', 'p95', 'p99'];
  if (cfg.aggregation && !validAggregations.includes(cfg.aggregation)) {
    errors.push({
      field: 'aggregation',
      message: `Invalid aggregation. Must be one of: ${validAggregations.join(', ')}`,
      code: 'INVALID_AGGREGATION'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Re-export all types for convenience
export type {
  TrendTimeRange as TimeRange,
  TrendMetricType as MetricType,
  TrendAggregation as Aggregation,
  TrendDataPoint as DataPoint,
  TrendSeries as Series,
  TrendAnalysis as Analysis,
  TrendStatistics as Statistics,
  TrendConfig as Config,
  TrendConfigValidation as ConfigValidation,
  TrendValidationError as ValidationError,
  TrendErrorCode as ErrorCode,
  TrendRepository as Repository,
  AnalyzeTrendsInput as ServiceInput,
  AnalyzeTrendsOutput as ServiceOutput,
  TrendComparison as Comparison,
  TrendSignificantChange as SignificantChange,
  TrendApiRequest as ApiRequest,
  TrendApiResponse as ApiResponse,
  TrendChartProps as ChartProps,
  TrendFilterProps as FilterProps
};