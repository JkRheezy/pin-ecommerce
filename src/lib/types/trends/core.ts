/**
 * Trends Core Types and Enums
 * 
 * This module defines the foundational types for the trends feature.
 * Located at: Types layer (Layer 1) of the six-layer architecture.
 */

import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

/**
 * Trend direction indicates whether a metric is increasing, decreasing,
 * or stable over the observed time period.
 */
export enum TrendDirection {
  UP = 'UP',
  DOWN = 'DOWN',
  FLAT = 'FLAT',
}

/**
 * Trend severity levels for alerting and prioritization.
 */
export enum TrendSeverity {
  CRITICAL = 'CRITICAL',
  WARNING = 'WARNING',
  INFO = 'INFO',
  NONE = 'NONE',
}

/**
 * Supported time granularities for trend analysis.
 */
export enum TrendGranularity {
  MINUTE = 'MINUTE',
  HOUR = 'HOUR',
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

/**
 * Types of trend analysis algorithms available.
 */
export enum TrendAlgorithm {
  LINEAR_REGRESSION = 'LINEAR_REGRESSION',
  MOVING_AVERAGE = 'MOVING_AVERAGE',
  EXPONENTIAL_SMOOTHING = 'EXPONENTIAL_SMOOTHING',
  SEASONAL_DECOMPOSITION = 'SEASONAL_DECOMPOSITION',
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

export const trendDirectionSchema = z.nativeEnum(TrendDirection);
export const trendSeveritySchema = z.nativeEnum(TrendSeverity);
export const trendGranularitySchema = z.nativeEnum(TrendGranularity);
export const trendAlgorithmSchema = z.nativeEnum(TrendAlgorithm);

/**
 * Schema for validating trend data points.
 */
export const trendDataPointSchema = z.object({
  timestamp: z.date().or(z.string().datetime()),
  value: z.number().finite(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Schema for trend configuration options.
 */
export const trendConfigSchema = z.object({
  algorithm: trendAlgorithmSchema,
  granularity: trendGranularitySchema,
  windowSize: z.number().int().positive().max(365),
  thresholdCritical: z.number().optional(),
  thresholdWarning: z.number().optional(),
});

// ============================================================================
// Core Types
// ============================================================================

/**
 * A single data point in a time series for trend analysis.
 */
export interface TrendDataPoint {
  /** ISO 8601 timestamp or Date object */
  timestamp: Date | string;
  /** The measured value at this point in time */
  value: number;
  /** Optional contextual metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration options for trend analysis.
 */
export interface TrendConfig {
  /** The algorithm to use for trend calculation */
  algorithm: TrendAlgorithm;
  /** Time granularity for bucketing data points */
  granularity: TrendGranularity;
  /** Number of time units to include in the analysis window */
  windowSize: number;
  /** Optional threshold for critical severity alerts */
  thresholdCritical?: number;
  /** Optional threshold for warning severity alerts */
  thresholdWarning?: number;
}

/**
 * Result of a trend analysis calculation.
 */
export interface TrendResult {
  /** The calculated direction of the trend */
  direction: TrendDirection;
  /** Severity assessment based on thresholds */
  severity: TrendSeverity;
  /** Slope coefficient (rate of change per time unit) */
  slope: number;
  /** R-squared value indicating fit quality (0-1) */
  confidence: number;
  /** Human-readable description of the trend */
  description: string;
  /** The configuration used for this analysis */
  config: TrendConfig;
  /** When the analysis was performed */
  analyzedAt: Date;
}

/**
 * Error types specific to trend operations.
 */
export enum TrendErrorCode {
  INVALID_DATA = 'INVALID_DATA',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  CALCULATION_ERROR = 'CALCULATION_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  TIMEOUT = 'TIMEOUT',
}

/**
 * Custom error class for trend-related failures.
 * Provides structured error information for proper handling upstream.
 */
export class TrendError extends Error {
  public readonly code: TrendErrorCode;
  public readonly context?: Record<string, unknown>;

  constructor(
    code: TrendErrorCode,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TrendError';
    this.code = code;
    this.context = context;
    
    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TrendError);
    }
  }

  /**
   * Creates a formatted log entry for structured logging.
   */
  toLogEntry(): Record<string, unknown> {
    return {
      errorType: this.name,
      errorCode: this.code,
      message: this.message,
      context: this.context,
      stack: this.stack,
    };
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid TrendDirection.
 */
export function isTrendDirection(value: unknown): value is TrendDirection {
  return Object.values(TrendDirection).includes(value as TrendDirection);
}

/**
 * Type guard to check if a value is a valid TrendDataPoint.
 */
export function isTrendDataPoint(value: unknown): value is TrendDataPoint {
  return trendDataPointSchema.safeParse(value).success;
}

/**
 * Type guard to check if an error is a TrendError.
 */
export function isTrendError(error: unknown): error is TrendError {
  return error instanceof TrendError;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration values for trend analysis.
 */
export const DEFAULT_TREND_CONFIG: Readonly<TrendConfig> = {
  algorithm: TrendAlgorithm.LINEAR_REGRESSION,
  granularity: TrendGranularity.DAY,
  windowSize: 30,
} as const;

/**
 * Minimum number of data points required for reliable trend analysis.
 * Below this threshold, INSUFFICIENT_DATA error should be thrown.
 */
export const MIN_DATA_POINTS = 3;

/**
 * Confidence threshold below which trend results should be treated as unreliable.
 */
export const MIN_CONFIDENCE_THRESHOLD = 0.5;