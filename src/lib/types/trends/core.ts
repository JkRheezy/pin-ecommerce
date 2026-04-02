/**
 * trends/core.ts
 *
 * Base types and enums for the Trends feature.
 * Layer: Types (Layer 1 of 6)
 *
 * This module defines the foundational type definitions used throughout
 * the Trends system. All types are immutable and validated at runtime
 * where applicable.
 */

import { z } from 'zod';
import { Result, ok, err } from 'neverthrow';

// =============================================================================
// Enums
// =============================================================================

/**
 * Time granularity for trend data aggregation.
 * Determines the bucket size for time-series queries.
 */
export enum TimeGranularity {
  MINUTE = 'minute',
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
}

/**
 * Trend direction indicator for change analysis.
 */
export enum TrendDirection {
  UP = 'up',
  DOWN = 'down',
  FLAT = 'flat',
  UNKNOWN = 'unknown',
}

/**
 * Status of a trend calculation job.
 */
export enum TrendJobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Supported metric types for trend analysis.
 */
export enum MetricType {
  COUNT = 'count',
  SUM = 'sum',
  AVERAGE = 'average',
  RATE = 'rate',
  PERCENTILE = 'percentile',
  UNIQUE = 'unique',
}

// =============================================================================
// Zod Schemas for Runtime Validation
// =============================================================================

/**
 * Schema for TimeGranularity enum validation.
 */
export const timeGranularitySchema = z.nativeEnum(TimeGranularity);

/**
 * Schema for TrendDirection enum validation.
 */
export const trendDirectionSchema = z.nativeEnum(TrendDirection);

/**
 * Schema for TrendJobStatus enum validation.
 */
export const trendJobStatusSchema = z.nativeEnum(TrendJobStatus);

/**
 * Schema for MetricType enum validation.
 */
export const metricTypeSchema = z.nativeEnum(MetricType);

/**
 * Schema for timestamp validation ensuring valid Date objects
 * or ISO 8601 strings.
 */
export const timestampSchema = z.union([
  z.date(),
  z.string().datetime({ message: 'Invalid ISO 8601 datetime string' }),
]).transform((val) => (val instanceof Date ? val : new Date(val)));

/**
 * Schema for non-empty string identifiers.
 */
export const identifierSchema = z.string()
  .min(1, 'Identifier cannot be empty')
  .max(256, 'Identifier exceeds maximum length of 256 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Identifier contains invalid characters');

// =============================================================================
// Core Type Definitions
// =============================================================================

/**
 * Time range specification for trend queries.
 * Invariant: endTime must be greater than or equal to startTime.
 */
export interface TimeRange {
  readonly startTime: Date;
  readonly endTime: Date;
}

/**
 * Data point in a time series.
 * Immutable representation of a single observation.
 */
export interface DataPoint<T = number> {
  readonly timestamp: Date;
  readonly value: T;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Complete time series with metadata.
 */
export interface TimeSeries<T = number> {
  readonly metricName: string;
  readonly granularity: TimeGranularity;
  readonly points: ReadonlyArray<DataPoint<T>>;
  readonly createdAt: Date;
}

/**
 * Trend analysis result containing computed statistics.
 */
export interface TrendAnalysis {
  readonly direction: TrendDirection;
  readonly changePercent: number;
  readonly absoluteChange: number;
  readonly slope: number;
  readonly confidence: number; // 0.0 to 1.0
  readonly sampleSize: number;
}

/**
 * Configuration for a trend calculation job.
 */
export interface TrendJobConfig {
  readonly jobId: string;
  readonly metricType: MetricType;
  readonly timeRange: TimeRange;
  readonly granularity: TimeGranularity;
  readonly filters?: Readonly<Record<string, unknown>>;
  readonly percentile?: number; // Required when metricType is PERCENTILE
}

/**
 * Complete trend job with status and results.
 */
export interface TrendJob {
  readonly config: TrendJobConfig;
  readonly status: TrendJobStatus;
  readonly createdAt: Date;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly errorMessage?: string;
  readonly result?: TrendAnalysis;
}

// =============================================================================
// Branded Types for Type Safety
// =============================================================================

/**
 * Branded type for job identifiers to prevent accidental mixing
 * with other string identifiers.
 */
export type JobId = string & { readonly __brand: 'JobId' };

/**
 * Branded type for metric names to ensure compile-time validation.
 */
export type MetricName = string & { readonly __brand: 'MetricName' };

/**
 * Factory function to create a validated JobId.
 * Returns Result to enforce error handling at call sites.
 */
export function createJobId(value: string): Result<JobId, Error> {
  const result = identifierSchema.safeParse(value);
  if (!result.success) {
    return err(new Error(`Invalid JobId: ${result.error.message}`));
  }
  return ok(result.data as JobId);
}

/**
 * Factory function to create a validated MetricName.
 * Returns Result to enforce error handling at call sites.
 */
export function createMetricName(value: string): Result<MetricName, Error> {
  const result = identifierSchema.safeParse(value);
  if (!result.success) {
    return err(new Error(`Invalid MetricName: ${result.error.message}`));
  }
  return ok(result.data as MetricName);
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Generic type for paginated trend results.
 */
export interface PaginatedResult<T> {
  readonly data: ReadonlyArray<T>;
  readonly totalCount: number;
  readonly pageSize: number;
  readonly pageNumber: number;
  readonly hasMore: boolean;
}

/**
 * Error types specific to the Trends domain.
 */
export enum TrendsErrorCode {
  INVALID_TIME_RANGE = 'INVALID_TIME_RANGE',
  INVALID_GRANULARITY = 'INVALID_GRANULARITY',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  CALCULATION_FAILED = 'CALCULATION_FAILED',
  JOB_NOT_FOUND = 'JOB_NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

/**
 * Structured error type for trend operations.
 */
export interface TrendsError {
  readonly code: TrendsErrorCode;
  readonly message: string;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly timestamp: Date;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Maximum time range allowed for a single trend query.
 * Prevents excessive resource consumption.
 */
export const MAX_TIME_RANGE_DAYS = 365;

/**
 * Default confidence threshold for trend significance.
 */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.95;

/**
 * Supported granularities in ascending order of duration.
 */
export const GRANULARITY_ORDER: readonly TimeGranularity[] = [
  TimeGranularity.MINUTE,
  TimeGranularity.HOUR,
  TimeGranularity.DAY,
  TimeGranularity.WEEK,
  TimeGranularity.MONTH,
  TimeGranularity.QUARTER,
  TimeGranularity.YEAR,
] as const;