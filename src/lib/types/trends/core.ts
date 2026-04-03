/**
 * @file src/lib/types/trends/core.ts
 * @description Base types and enums for the trends module following the six-layer architecture.
 * This file resides in the Types layer and defines foundational data structures.
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

/**
 * Represents the possible states of a trend analysis job.
 */
export enum TrendJobStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Defines the granularity levels for trend data aggregation.
 */
export enum TrendGranularity {
  MINUTE = 'MINUTE',
  HOUR = 'HOUR',
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

/**
 * Categorizes the type of trend being analyzed.
 */
export enum TrendType {
  PERFORMANCE = 'PERFORMANCE',
  RELIABILITY = 'RELIABILITY',
  SECURITY = 'SECURITY',
  COST = 'COST',
  DEPLOYMENT = 'DEPLOYMENT',
}

/**
 * Indicates the direction of a trend change.
 */
export enum TrendDirection {
  IMPROVING = 'IMPROVING',
  DEGRADING = 'DEGRADING',
  STABLE = 'STABLE',
  VOLATILE = 'VOLATILE',
}

// =============================================================================
// Base Types
// =============================================================================

/**
 * Unique identifier for trend-related entities.
 * Uses branded type pattern for type safety.
 */
export type TrendId = string & { __brand: 'TrendId' };

/**
 * Timestamp in ISO 8601 format.
 */
export type ISOTimestamp = string & { __brand: 'ISOTimestamp' };

/**
 * Validation schema for TrendId.
 */
export const TrendIdSchema = z
  .string()
  .uuid()
  .transform((val) => val as TrendId);

/**
 * Validation schema for ISOTimestamp.
 */
export const ISOTimestampSchema = z
  .string()
  .datetime()
  .transform((val) => val as ISOTimestamp);

// =============================================================================
// Core Data Structures
// =============================================================================

/**
 * Represents a single data point in a trend series.
 */
export interface TrendDataPoint {
  /** Unique identifier for this data point */
  readonly id: TrendId;

  /** Timestamp when this data point was recorded */
  readonly timestamp: ISOTimestamp;

  /** The metric value at this point in time */
  readonly value: number;

  /** Optional metadata associated with this data point */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Validation schema for TrendDataPoint.
 */
export const TrendDataPointSchema = z.object({
  id: TrendIdSchema,
  timestamp: ISOTimestampSchema,
  value: z.number().finite(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Represents a complete trend series with metadata.
 */
export interface TrendSeries {
  /** Unique identifier for this trend series */
  readonly id: TrendId;

  /** Human-readable name of the trend */
  readonly name: string;

  /** Type of trend being tracked */
  readonly type: TrendType;

  /** Granularity of the data points */
  readonly granularity: TrendGranularity;

  /** Ordered array of data points (oldest to newest) */
  readonly dataPoints: readonly TrendDataPoint[];

  /** When this series was created */
  readonly createdAt: ISOTimestamp;

  /** When this series was last updated */
  readonly updatedAt: ISOTimestamp;
}

/**
 * Validation schema for TrendSeries.
 */
export const TrendSeriesSchema = z.object({
  id: TrendIdSchema,
  name: z.string().min(1).max(256),
  type: z.nativeEnum(TrendType),
  granularity: z.nativeEnum(TrendGranularity),
  dataPoints: z.array(TrendDataPointSchema).min(1),
  createdAt: ISOTimestampSchema,
  updatedAt: ISOTimestampSchema,
});

/**
 * Represents the result of a trend analysis operation.
 */
export interface TrendAnalysisResult {
  /** The analyzed trend series */
  readonly series: TrendSeries;

  /** Calculated direction of the trend */
  readonly direction: TrendDirection;

  /** Percentage change from first to last data point */
  readonly percentChange: number;

  /** Statistical confidence score (0-1) */
  readonly confidenceScore: number;

  /** Detected anomalies in the series */
  readonly anomalies: readonly TrendAnomaly[];

  /** Optional recommendation based on analysis */
  readonly recommendation?: string;
}

/**
 * Validation schema for TrendAnalysisResult.
 */
export const TrendAnalysisResultSchema = z.object({
  series: TrendSeriesSchema,
  direction: z.nativeEnum(TrendDirection),
  percentChange: z.number().finite(),
  confidenceScore: z.number().min(0).max(1),
  anomalies: z.array(z.lazy(() => TrendAnomalySchema)),
  recommendation: z.string().optional(),
});

/**
 * Represents an anomaly detected in a trend series.
 */
export interface TrendAnomaly {
  /** Data point where anomaly was detected */
  readonly dataPoint: TrendDataPoint;

  /** Type of anomaly (spike, drop, pattern break) */
  readonly type: 'SPIKE' | 'DROP' | 'PATTERN_BREAK';

  /** Severity score of the anomaly (0-1) */
  readonly severity: number;

  /** Human-readable description of the anomaly */
  readonly description: string;
}

/**
 * Validation schema for TrendAnomaly.
 */
export const TrendAnomalySchema = z.object({
  dataPoint: TrendDataPointSchema,
  type: z.enum(['SPIKE', 'DROP', 'PATTERN_BREAK']),
  severity: z.number().min(0).max(1),
  description: z.string().min(1),
});

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration options for trend analysis operations.
 * Passed through Config layer to Service layer.
 */
export interface TrendAnalysisConfig {
  /** Minimum number of data points required for analysis */
  readonly minDataPoints: number;

  /** Maximum age of data to consider (in days) */
  readonly maxDataAgeDays: number;

  /** Threshold for anomaly detection (standard deviations) */
  readonly anomalyThreshold: number;

  /** Whether to include seasonal adjustments */
  readonly enableSeasonalAdjustment: boolean;

  /** Confidence level for statistical tests */
  readonly confidenceLevel: number;
}

/**
 * Validation schema for TrendAnalysisConfig with sensible defaults.
 */
export const TrendAnalysisConfigSchema = z.object({
  minDataPoints: z.number().int().min(2).default(10),
  maxDataAgeDays: z.number().int().min(1).default(90),
  anomalyThreshold: z.number().positive().default(2.5),
  enableSeasonalAdjustment: z.boolean().default(false),
  confidenceLevel: z.number().min(0.5).max(0.99).default(0.95),
});

// =============================================================================
// Error Types
// =============================================================================

/**
 * Custom error class for trend-related operations.
 * Extends Error with additional context for structured logging.
 */
export class TrendError extends Error {
  constructor(
    message: string,
    public readonly code: TrendErrorCode,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TrendError';
    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TrendError);
    }
  }
}

/**
 * Error codes for trend operations.
 */
export enum TrendErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  ANALYSIS_FAILED = 'ANALYSIS_FAILED',
  NOT_FOUND = 'NOT_FOUND',
  TIMEOUT = 'TIMEOUT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if a value is a valid TrendId.
 */
export function isTrendId(value: unknown): value is TrendId {
  return TrendIdSchema.safeParse(value).success;
}

/**
 * Type guard to check if a value is a valid TrendDataPoint.
 */
export function isTrendDataPoint(value: unknown): value is TrendDataPoint {
  return TrendDataPointSchema.safeParse(value).success;
}

/**
 * Type guard to check if a value is a valid TrendSeries.
 */
export function isTrendSeries(value: unknown): value is TrendSeries {
  return TrendSeriesSchema.safeParse(value).success;
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Partial type for creating new TrendSeries (omits generated fields).
 */
export type CreateTrendSeriesInput = Omit<
  TrendSeries,
  'id' | 'createdAt' | 'updatedAt'
>;

/**
 * Partial type for updating existing TrendSeries (only allows mutable fields).
 */
export type UpdateTrendSeriesInput = Partial<
  Pick<TrendSeries, 'name' | 'dataPoints'>
>;

/**
 * Query parameters for filtering trend series.
 */
export interface TrendSeriesQuery {
  readonly types?: readonly TrendType[];
  readonly granularity?: TrendGranularity;
  readonly startDate?: ISOTimestamp;
  readonly endDate?: ISOTimestamp;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Validation schema for TrendSeriesQuery.
 */
export const TrendSeriesQuerySchema = z.object({
  types: z.array(z.nativeEnum(TrendType)).optional(),
  granularity: z.nativeEnum(TrendGranularity).optional(),
  startDate: ISOTimestampSchema.optional(),
  endDate: ISOTimestampSchema.optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
});