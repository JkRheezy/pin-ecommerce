/**
 * @fileoverview Trend Analysis Types
 * @description Type definitions for trend analysis functionality in the Harness-Engineering environment.
 * @module types/trends/analysis
 */

import { z } from 'zod';
import { Result, Option } from '../common/result';
import { TimeRange, TimeGranularity } from '../common/time';

// =============================================================================
// Domain Types
// =============================================================================

/**
 * Represents the statistical trend direction
 */
export enum TrendDirection {
  UP = 'UP',
  DOWN = 'DOWN',
  FLAT = 'FLAT',
  VOLATILE = 'VOLATILE',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Confidence level for trend predictions
 */
export enum ConfidenceLevel {
  HIGH = 'HIGH',      // > 90%
  MEDIUM = 'MEDIUM',  // 70-90%
  LOW = 'LOW',        // 50-70%
  UNCERTAIN = 'UNCERTAIN', // < 50%
}

/**
 * Types of trends that can be analyzed
 */
export enum TrendType {
  LINEAR = 'LINEAR',
  EXPONENTIAL = 'EXPONENTIAL',
  LOGARITHMIC = 'LOGARITHMIC',
  SEASONAL = 'SEASONAL',
  CYCLICAL = 'CYCLICAL',
  STEP = 'STEP',
  CUSTOM = 'CUSTOM',
}

// =============================================================================
// Core Data Structures
// =============================================================================

/**
 * A single data point in a time series
 */
export interface DataPoint {
  readonly timestamp: Date;
  readonly value: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * A collection of data points forming a time series
 */
export interface TimeSeries {
  readonly id: string;
  readonly name: string;
  readonly dataPoints: ReadonlyArray<DataPoint>;
  readonly granularity: TimeGranularity;
  readonly tags: ReadonlyArray<string>;
}

/**
 * Statistical measures for a time series
 */
export interface StatisticalSummary {
  readonly count: number;
  readonly mean: number;
  readonly median: number;
  readonly mode: Option<number>;
  readonly standardDeviation: number;
  readonly variance: number;
  readonly min: number;
  readonly max: number;
  readonly range: number;
  readonly quartiles: {
    readonly q1: number;
    readonly q2: number;
    readonly q3: number;
  };
  readonly skewness: number;
  readonly kurtosis: number;
}

// =============================================================================
// Trend Analysis Results
// =============================================================================

/**
 * Result of fitting a trend line to data
 */
export interface TrendFit {
  readonly type: TrendType;
  readonly parameters: Readonly<Record<string, number>>;
  readonly rSquared: number;           // Coefficient of determination (0-1)
  readonly adjustedRSquared: number;   // Adjusted for number of predictors
  readonly rmse: number;               // Root mean square error
  readonly mae: number;                // Mean absolute error
  readonly equation: string;           // Human-readable equation
}

/**
 * A detected trend segment within a time series
 */
export interface TrendSegment {
  readonly id: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly direction: TrendDirection;
  readonly magnitude: number;          // Absolute change in value
  readonly percentChange: number;      // Percentage change
  readonly duration: number;           // Duration in milliseconds
  readonly fit: TrendFit;
  readonly confidence: ConfidenceLevel;
}

/**
 * Seasonal decomposition components
 */
export interface SeasonalDecomposition {
  readonly trend: ReadonlyArray<number>;
  readonly seasonal: ReadonlyArray<number>;
  readonly residual: ReadonlyArray<number>;
  readonly seasonalPeriod: number;     // Period length in data points
  readonly seasonalStrength: number;   // 0-1, higher means stronger seasonality
}

/**
 * Anomaly detection result
 */
export interface Anomaly {
  readonly index: number;
  readonly timestamp: Date;
  readonly expectedValue: number;
  readonly actualValue: number;
  readonly deviation: number;          // Standard deviations from expected
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  readonly type: 'SPIKE' | 'DROP' | 'TREND_BREAK' | 'PATTERN_CHANGE';
  readonly explanation?: string;
}

/**
 * Complete trend analysis result
 */
export interface TrendAnalysis {
  readonly id: string;
  readonly timeSeriesId: string;
  readonly timeRange: TimeRange;
  readonly createdAt: Date;
  readonly statisticalSummary: StatisticalSummary;
  readonly overallDirection: TrendDirection;
  readonly segments: ReadonlyArray<TrendSegment>;
  readonly bestFit: TrendFit;
  readonly seasonalDecomposition: Option<SeasonalDecomposition>;
  readonly anomalies: ReadonlyArray<Anomaly>;
  readonly changePoints: ReadonlyArray<number>; // Indices where significant changes occur
  readonly forecast?: TrendForecast;
}

// =============================================================================
// Forecasting Types
// =============================================================================

/**
 * A single forecasted data point
 */
export interface ForecastPoint {
  readonly timestamp: Date;
  readonly predictedValue: number;
  readonly confidenceInterval: {
    readonly lower: number;
    readonly upper: number;
    readonly confidence: number;       // e.g., 0.95 for 95% CI
  };
  readonly components?: {
    readonly trend: number;
    readonly seasonal: number;
    readonly residual: number;
  };
}

/**
 * Complete forecast result
 */
export interface TrendForecast {
  readonly id: string;
  readonly analysisId: string;
  readonly horizon: number;            // Number of periods forecasted
  readonly granularity: TimeGranularity;
  readonly points: ReadonlyArray<ForecastPoint>;
  readonly model: TrendType;
  readonly accuracy: {
    readonly mape: number;             // Mean absolute percentage error
    readonly smape: number;            // Symmetric MAPE
    readonly mase: number;             // Mean absolute scaled error
  };
  readonly warnings: ReadonlyArray<string>;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for trend analysis algorithms
 */
export interface TrendAnalysisConfig {
  readonly minDataPoints: number;      // Minimum required for analysis
  readonly maxSegments: number;        // Maximum trend segments to detect
  readonly segmentMinLength: number;   // Minimum points per segment
  readonly outlierThreshold: number;   // Z-score threshold for outliers
  readonly seasonalPeriod?: number;    // Expected seasonal period (auto-detect if undefined)
  readonly confidenceLevel: number;    // For confidence intervals (e.g., 0.95)
  readonly enableAnomalyDetection: boolean;
  readonly enableSeasonalDecomposition: boolean;
  readonly enableForecasting: boolean;
  readonly forecastHorizon: number;    // Number of periods to forecast
}

/**
 * Default configuration values
 */
export const DEFAULT_TREND_ANALYSIS_CONFIG: TrendAnalysisConfig = {
  minDataPoints: 10,
  maxSegments: 5,
  segmentMinLength: 5,
  outlierThreshold: 3,
  confidenceLevel: 0.95,
  enableAnomalyDetection: true,
  enableSeasonalDecomposition: true,
  enableForecasting: true,
  forecastHorizon: 10,
} as const;

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error codes specific to trend analysis
 */
export enum TrendAnalysisErrorCode {
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  INVALID_TIME_RANGE = 'INVALID_TIME_RANGE',
  COMPUTATION_FAILED = 'COMPUTATION_FAILED',
  INVALID_CONFIG = 'INVALID_CONFIG',
  FORECAST_FAILED = 'FORECAST_FAILED',
  SEASONAL_DECOMPOSITION_FAILED = 'SEASONAL_DECOMPOSITION_FAILED',
}

/**
 * Structured error for trend analysis failures
 */
export interface TrendAnalysisError {
  readonly code: TrendAnalysisErrorCode;
  readonly message: string;
  readonly context?: Record<string, unknown>;
  readonly recoverable: boolean;
}

/**
 * Result type for trend analysis operations
 */
export type TrendAnalysisResult<T> = Result<T, TrendAnalysisError>;

// =============================================================================
// Zod Schemas for Runtime Validation
// =============================================================================

export const DataPointSchema = z.object({
  timestamp: z.date(),
  value: z.number().finite(),
  metadata: z.record(z.unknown()).optional(),
});

export const TimeSeriesSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  dataPoints: z.array(DataPointSchema).min(1),
  granularity: z.nativeEnum(TimeGranularity),
  tags: z.array(z.string()),
});

export const StatisticalSummarySchema = z.object({
  count: z.number().int().nonnegative(),
  mean: z.number().finite(),
  median: z.number().finite(),
  mode: z.number().finite().nullable(),
  standardDeviation: z.number().finite().nonnegative(),
  variance: z.number().finite().nonnegative(),
  min: z.number().finite(),
  max: z.number().finite(),
  range: z.number().finite().nonnegative(),
  quartiles: z.object({
    q1: z.number().finite(),
    q2: z.number().finite(),
    q3: z.number().finite(),
  }),
  skewness: z.number().finite(),
  kurtosis: z.number().finite(),
});

export const TrendFitSchema = z.object({
  type: z.nativeEnum(TrendType),
  parameters: z.record(z.number().finite()),
  rSquared: z.number().min(0).max(1),
  adjustedRSquared: z.number().min(-Infinity).max(1),
  rmse: z.number().finite().nonnegative(),
  mae: z.number().finite().nonnegative(),
  equation: z.string().min(1),
});

export const TrendAnalysisConfigSchema = z.object({
  minDataPoints: z.number().int().positive().default(10),
  maxSegments: z.number().int().positive().default(5),
  segmentMinLength: z.number().int().positive().default(5),
  outlierThreshold: z.number().positive().default(3),
  seasonalPeriod: z.number().int().positive().optional(),
  confidenceLevel: z.number().min(0).max(1).default(0.95),
  enableAnomalyDetection: z.boolean().default(true),
  enableSeasonalDecomposition: z.boolean().default(true),
  enableForecasting: z.boolean().default(true),
  forecastHorizon: z.number().int().nonnegative().default(10),
});

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for TrendDirection
 */
export function isTrendDirection(value: unknown): value is TrendDirection {
  return Object.values(TrendDirection).includes(value as TrendDirection);
}

/**
 * Type guard for ConfidenceLevel
 */
export function isConfidenceLevel(value: unknown): value is ConfidenceLevel {
  return Object.values(ConfidenceLevel).includes(value as ConfidenceLevel);
}

/**
 * Type guard for TrendType
 */
export function isTrendType(value: unknown): value is TrendType {
  return Object.values(TrendType).includes(value as TrendType);
}

/**
 * Validates if a value is a valid DataPoint
 */
export function isValidDataPoint(value: unknown): value is DataPoint {
  return DataPointSchema.safeParse(value).success;
}

/**
 * Validates if a value is a valid TimeSeries
 */
export function isValidTimeSeries(value: unknown): value is TimeSeries {
  return TimeSeriesSchema.safeParse(value).success;
}