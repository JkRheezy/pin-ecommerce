/**
 * @fileoverview Trend Analysis Types
 * @module lib/types/trends/analysis
 *
 * Defines the type definitions for trend analysis functionality.
 * These types support the six-layer architecture by providing
 * strongly-typed contracts for trend computation, storage, and presentation.
 */

import { z } from 'zod';

// ============================================================================
// Enums & Constants
// ============================================================================

/**
 * Supported time granularities for trend analysis
 */
export enum TrendGranularity {
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
}

/**
 * Types of trend patterns that can be detected
 */
export enum TrendPatternType {
  INCREASING = 'increasing',
  DECREASING = 'decreasing',
  STABLE = 'stable',
  VOLATILE = 'volatile',
  SEASONAL = 'seasonal',
  CYCLICAL = 'cyclical',
  SPIKE = 'spike',
  DROP = 'drop',
}

/**
 * Severity levels for trend anomalies
 */
export enum AnomalySeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

// ============================================================================
// Core Data Types
// ============================================================================

/**
 * Configuration for trend analysis operations
 */
export interface TrendAnalysisConfig {
  /** Time granularity for data aggregation */
  granularity: TrendGranularity;

  /** Number of periods to analyze */
  lookbackPeriods: number;

  /** Minimum data points required for valid analysis */
  minDataPoints: number;

  /** Confidence threshold for pattern detection (0-1) */
  confidenceThreshold: number;

  /** Whether to detect anomalies */
  detectAnomalies: boolean;

  /** Anomaly detection sensitivity (standard deviations) */
  anomalySensitivity: number;

  /** Whether to enable seasonal decomposition */
  enableSeasonality: boolean;

  /** Seasonal period length (in granularity units) */
  seasonalPeriod?: number;
}

/**
 * A single data point in a time series
 */
export interface DataPoint<T = number> {
  /** Timestamp of the data point */
  timestamp: Date;

  /** The measured value */
  value: T;

  /** Optional metadata associated with this point */
  metadata?: Record<string, unknown>;
}

/**
 * Represents a time series dataset for analysis
 */
export interface TimeSeries<T = number> {
  /** Unique identifier for this series */
  id: string;

  /** Human-readable name */
  name: string;

  /** The data points in chronological order */
  points: DataPoint<T>[];

  /** Unit of measurement (e.g., 'ms', 'count', 'percentage') */
  unit?: string;

  /** Additional context for this series */
  tags?: Record<string, string>;
}

// ============================================================================
// Analysis Result Types
// ============================================================================

/**
 * Statistical summary of a time series
 */
export interface TrendStatistics {
  /** Number of data points */
  count: number;

  /** Mean value */
  mean: number;

  /** Median value */
  median: number;

  /** Standard deviation */
  stdDev: number;

  /** Minimum value */
  min: number;

  /** Maximum value */
  max: number;

  /** Sum of all values */
  sum: number;

  /** Coefficient of variation (stdDev / mean) */
  coefficientOfVariation: number;

  /** First quartile (25th percentile) */
  q1: number;

  /** Third quartile (75th percentile) */
  q3: number;

  /** Interquartile range */
  iqr: number;
}

/**
 * Detected trend pattern with metadata
 */
export interface TrendPattern {
  /** Type of pattern detected */
  type: TrendPatternType;

  /** Confidence score (0-1) */
  confidence: number;

  /** Start timestamp of the pattern */
  startTime: Date;

  /** End timestamp of the pattern */
  endTime: Date;

  /** Slope/magnitude of the trend (if applicable) */
  slope?: number;

  /** Human-readable description */
  description: string;

  /** Supporting evidence for this pattern */
  evidence: PatternEvidence[];
}

/**
 * Evidence supporting a pattern detection
 */
export interface PatternEvidence {
  /** Type of evidence */
  type: 'statistical' | 'visual' | 'algorithmic';

  /** Description of the evidence */
  description: string;

  /** Quantitative measure of evidence strength */
  score: number;
}

/**
 * Detected anomaly in the time series
 */
export interface TrendAnomaly {
  /** Unique identifier */
  id: string;

  /** Timestamp when anomaly occurred */
  timestamp: Date;

  /** Expected value based on trend */
  expectedValue: number;

  /** Actual observed value */
  actualValue: number;

  /** Deviation from expected (actual - expected) */
  deviation: number;

  /** Deviation as percentage of expected value */
  deviationPercent: number;

  /** Severity classification */
  severity: AnomalySeverity;

  /** Type of anomaly pattern */
  type: 'spike' | 'drop' | 'shift' | 'trend_change';

  /** Human-readable explanation */
  explanation: string;
}

/**
 * Complete trend analysis result
 */
export interface TrendAnalysisResult {
  /** Unique identifier for this analysis */
  id: string;

  /** When the analysis was performed */
  analyzedAt: Date;

  /** Configuration used for analysis */
  config: TrendAnalysisConfig;

  /** Source time series information */
  source: {
    seriesId: string;
    seriesName: string;
    pointCount: number;
    timeRange: {
      start: Date;
      end: Date;
    };
  };

  /** Statistical summary */
  statistics: TrendStatistics;

  /** Detected patterns */
  patterns: TrendPattern[];

  /** Detected anomalies */
  anomalies: TrendAnomaly[];

  /** Forecasted values (if forecasting was enabled) */
  forecast?: TrendForecast;

  /** Overall trend direction assessment */
  overallDirection: 'up' | 'down' | 'stable' | 'mixed';

  /** Key insights extracted from analysis */
  insights: TrendInsight[];
}

/**
 * Forecast result from trend analysis
 */
export interface TrendForecast {
  /** Forecasted data points */
  points: DataPoint<number>[];

  /** Confidence intervals for each forecast point */
  confidenceIntervals: Array<{
    timestamp: Date;
    lower: number;
    upper: number;
    confidence: number;
  }>;

  /** Forecast accuracy metrics on historical validation */
  accuracyMetrics?: {
    mae: number; // Mean Absolute Error
    rmse: number; // Root Mean Square Error
    mape: number; // Mean Absolute Percentage Error
  };
}

/**
 * Human-readable insight from trend analysis
 */
export interface TrendInsight {
  /** Insight category */
  category: 'performance' | 'reliability' | 'growth' | 'anomaly' | 'general';

  /** Insight priority */
  priority: 'low' | 'medium' | 'high';

  /** Concise insight message */
  message: string;

  /** Detailed explanation */
  details?: string;

  /** Recommended action (if any) */
  recommendation?: string;

  /** Related metrics or data points */
  relatedMetrics?: Array<{
    name: string;
    value: number;
    unit?: string;
  }>;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes specific to trend analysis operations
 */
export enum TrendAnalysisErrorCode {
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  INVALID_GRANULARITY = 'INVALID_GRANULARITY',
  INVALID_TIME_RANGE = 'INVALID_TIME_RANGE',
  COMPUTATION_FAILED = 'COMPUTATION_FAILED',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  SEASONALITY_DETECTION_FAILED = 'SEASONALITY_DETECTION_FAILED',
}

/**
 * Custom error class for trend analysis failures
 */
export class TrendAnalysisError extends Error {
  constructor(
    public readonly code: TrendAnalysisErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TrendAnalysisError';
    Object.setPrototypeOf(this, TrendAnalysisError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * Zod schema for TrendGranularity enum validation
 */
export const TrendGranularitySchema = z.nativeEnum(TrendGranularity);

/**
 * Zod schema for TrendPatternType enum validation
 */
export const TrendPatternTypeSchema = z.nativeEnum(TrendPatternType);

/**
 * Zod schema for AnomalySeverity enum validation
 */
export const AnomalySeveritySchema = z.nativeEnum(AnomalySeverity);

/**
 * Zod schema for DataPoint validation
 */
export const DataPointSchema = z.object({
  timestamp: z.date(),
  value: z.number(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Zod schema for TrendAnalysisConfig validation
 */
export const TrendAnalysisConfigSchema = z.object({
  granularity: TrendGranularitySchema,
  lookbackPeriods: z.number().int().positive(),
  minDataPoints: z.number().int().positive(),
  confidenceThreshold: z.number().min(0).max(1),
  detectAnomalies: z.boolean(),
  anomalySensitivity: z.number().positive(),
  enableSeasonality: z.boolean(),
  seasonalPeriod: z.number().int().positive().optional(),
});

/**
 * Zod schema for TimeSeries validation
 */
export const TimeSeriesSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  points: z.array(DataPointSchema).min(1),
  unit: z.string().optional(),
  tags: z.record(z.string()).optional(),
});

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Type for trend analysis operation results (success or error)
 */
export type TrendAnalysisOperationResult<T> =
  | { success: true; data: T }
  | { success: false; error: TrendAnalysisError };

/**
 * Options for comparing multiple time series
 */
export interface SeriesComparisonOptions {
  /** Method for aligning series with different timestamps */
  alignmentMethod: 'interpolate' | 'nearest' | 'exact';

  /** Whether to normalize values to common scale */
  normalize: boolean;

  /** Correlation method to use */
  correlationMethod: 'pearson' | 'spearman' | 'kendall';
}

/**
 * Result of comparing multiple time series
 */
export interface SeriesComparisonResult {
  /** Pairwise correlation coefficients */
  correlations: Array<{
    seriesA: string;
    seriesB: string;
    coefficient: number;
    significance: number;
  }>;

  /** Overall similarity score (0-1) */
  overallSimilarity: number;

  /** Lag analysis (if series are shifted) */
  lagAnalysis?: {
    optimalLag: number;
    lagCorrelation: number;
  };
}