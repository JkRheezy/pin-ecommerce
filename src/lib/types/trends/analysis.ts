/**
 * @file src/lib/types/trends/analysis.ts
 * @description Trend analysis types following the six-layer architecture (Types layer)
 */

import type { Result } from '../result';
import type { TimeRange, MetricType } from '../common';

// ============================================================================
// Domain Types
// ============================================================================

/**
 * Represents the direction of a trend
 */
export type TrendDirection = 'up' | 'down' | 'stable' | 'volatile';

/**
 * Represents the confidence level of a trend analysis
 */
export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Represents the severity of an anomaly detected in trend analysis
 */
export type AnomalySeverity = 'info' | 'warning' | 'critical';

// ============================================================================
// Core Analysis Types
// ============================================================================

/**
 * Configuration for trend analysis operations
 */
export interface TrendAnalysisConfig {
  /** Minimum data points required for analysis */
  readonly minDataPoints: number;
  /** Time window for analysis */
  readonly timeRange: TimeRange;
  /** Metrics to include in analysis */
  readonly metrics: readonly MetricType[];
  /** Smoothing factor for trend calculation (0-1) */
  readonly smoothingFactor: number;
  /** Threshold for anomaly detection (standard deviations) */
  readonly anomalyThreshold: number;
}

/**
 * Represents a single data point in a trend
 */
export interface TrendDataPoint {
  /** Timestamp of the data point */
  readonly timestamp: Date;
  /** Value at this point */
  readonly value: number;
  /** Optional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Represents a calculated trend segment
 */
export interface TrendSegment {
  /** Start index in the data series */
  readonly startIndex: number;
  /** End index in the data series */
  readonly endIndex: number;
  /** Direction of this segment */
  readonly direction: TrendDirection;
  /** Rate of change (per unit time) */
  readonly rateOfChange: number;
  /** Statistical significance (p-value) */
  readonly significance: number;
}

// ============================================================================
// Analysis Result Types
// ============================================================================

/**
 * Represents a detected anomaly in trend data
 */
export interface TrendAnomaly {
  /** Index in data series where anomaly occurs */
  readonly index: number;
  /** Timestamp of the anomaly */
  readonly timestamp: Date;
  /** Expected value based on trend */
  readonly expectedValue: number;
  /** Actual observed value */
  readonly actualValue: number;
  /** Deviation from expected (in standard deviations) */
  readonly deviation: number;
  /** Severity classification */
  readonly severity: AnomalySeverity;
  /** Human-readable description */
  readonly description: string;
}

/**
 * Complete trend analysis result
 */
export interface TrendAnalysis {
  /** Unique identifier for this analysis */
  readonly id: string;
  /** When the analysis was performed */
  readonly analyzedAt: Date;
  /** Overall direction of the trend */
  readonly overallDirection: TrendDirection;
  /** Confidence in the analysis */
  readonly confidence: ConfidenceLevel;
  /** Individual trend segments */
  readonly segments: readonly TrendSegment[];
  /** Detected anomalies */
  readonly anomalies: readonly TrendAnomaly[];
  /** Statistical metrics */
  readonly statistics: TrendStatistics;
  /** Forecast if available */
  readonly forecast?: TrendForecast;
}

/**
 * Statistical summary of trend data
 */
export interface TrendStatistics {
  /** Mean value across the series */
  readonly mean: number;
  /** Standard deviation */
  readonly standardDeviation: number;
  /** Minimum value */
  readonly min: number;
  /** Maximum value */
  readonly max: number;
  /** Coefficient of variation (std/mean) */
  readonly coefficientOfVariation: number;
  /** R-squared of trend line fit */
  readonly rSquared: number;
}

/**
 * Forecast generated from trend analysis
 */
export interface TrendForecast {
  /** Forecast horizon */
  readonly horizon: TimeRange;
  /** Predicted data points */
  readonly predictions: readonly TrendDataPoint[];
  /** Confidence intervals for predictions */
  readonly confidenceIntervals: {
    readonly lower: readonly number[];
    readonly upper: readonly number[];
  };
  /** Model used for forecasting */
  readonly model: ForecastModel;
}

/**
 * Forecast model information
 */
export interface ForecastModel {
  readonly type: 'linear' | 'exponential' | 'arima' | 'prophet';
  readonly parameters: Record<string, number>;
  readonly accuracy: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes specific to trend analysis
 */
export type TrendAnalysisErrorCode =
  | 'INSUFFICIENT_DATA'
  | 'INVALID_CONFIG'
  | 'CALCULATION_ERROR'
  | 'FORECAST_ERROR'
  | 'TIME_RANGE_INVALID';

/**
 * Error type for trend analysis failures
 */
export interface TrendAnalysisError {
  readonly code: TrendAnalysisErrorCode;
  readonly message: string;
  readonly context?: Record<string, unknown>;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result type for trend analysis operations
 */
export type TrendAnalysisResult = Result<TrendAnalysis, TrendAnalysisError>;

/**
 * Result type for batch trend analysis
 */
export type BatchTrendAnalysisResult = Result<
  readonly TrendAnalysis[],
  TrendAnalysisError
>;

// ============================================================================
// Factory Functions (pure functions for creating valid instances)
// ============================================================================

/**
 * Creates a valid TrendAnalysisConfig with defaults
 */
export function createTrendAnalysisConfig(
  overrides: Partial<TrendAnalysisConfig> & { timeRange: TimeRange }
): TrendAnalysisConfig {
  return {
    minDataPoints: 10,
    metrics: [],
    smoothingFactor: 0.3,
    anomalyThreshold: 2.5,
    ...overrides,
  } as TrendAnalysisConfig;
}

/**
 * Validates that a config has required fields and valid ranges
 */
export function validateTrendAnalysisConfig(
  config: TrendAnalysisConfig
): Result<void, TrendAnalysisError> {
  if (config.minDataPoints < 2) {
    return {
      success: false,
      error: {
        code: 'INVALID_CONFIG',
        message: 'minDataPoints must be at least 2',
        context: { minDataPoints: config.minDataPoints },
      },
    };
  }

  if (config.smoothingFactor < 0 || config.smoothingFactor > 1) {
    return {
      success: false,
      error: {
        code: 'INVALID_CONFIG',
        message: 'smoothingFactor must be between 0 and 1',
        context: { smoothingFactor: config.smoothingFactor },
      },
    };
  }

  if (config.anomalyThreshold <= 0) {
    return {
      success: false,
      error: {
        code: 'INVALID_CONFIG',
        message: 'anomalyThreshold must be positive',
        context: { anomalyThreshold: config.anomalyThreshold },
      },
    };
  }

  return { success: true, value: undefined };
}