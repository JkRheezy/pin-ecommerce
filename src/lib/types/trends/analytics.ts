/**
 * @fileoverview Analytics and metrics types for trends module
 * @module lib/types/trends/analytics
 */

import { z } from 'zod';
import { Result, err, ok } from 'neverthrow';
import { ValidationError } from '../errors';

// ============================================================================
// Domain Types
// ============================================================================

/**
 * Time range for analytics queries
 */
export type TimeRange = {
  readonly start: Date;
  readonly end: Date;
};

/**
 * Aggregation granularity for metrics
 */
export enum AggregationGranularity {
  MINUTE = 'minute',
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

/**
 * Statistical calculation method
 */
export enum StatisticalMethod {
  MEAN = 'mean',
  MEDIAN = 'median',
  PERCENTILE_95 = 'p95',
  PERCENTILE_99 = 'p99',
  STD_DEV = 'stdDev',
}

// ============================================================================
// Metric Types
// ============================================================================

/**
 * Base metric value with metadata
 */
export type MetricValue = {
  readonly value: number;
  readonly timestamp: Date;
  readonly labels: Readonly<Record<string, string>>;
  readonly unit: string;
};

/**
 * Aggregated metric result
 */
export type AggregatedMetric = {
  readonly name: string;
  readonly value: number;
  readonly granularity: AggregationGranularity;
  readonly timeRange: TimeRange;
  readonly sampleCount: number;
  readonly method: StatisticalMethod;
};

/**
 * Time series data point
 */
export type TimeSeriesPoint = {
  readonly timestamp: Date;
  readonly value: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

/**
 * Complete time series for a metric
 */
export type MetricTimeSeries = {
  readonly metricName: string;
  readonly points: readonly TimeSeriesPoint[];
  readonly granularity: AggregationGranularity;
  readonly unit: string;
};

// ============================================================================
// Analytics Query Types
// ============================================================================

/**
 * Filter criteria for metrics queries
 */
export type MetricFilter = {
  readonly metricNames?: readonly string[];
  readonly labels?: Readonly<Record<string, string | readonly string[]>>;
  readonly timeRange: TimeRange;
  readonly granularity?: AggregationGranularity;
};

/**
 * Analytics query configuration
 */
export type AnalyticsQuery = {
  readonly filters: MetricFilter;
  readonly aggregations: readonly AggregationConfig[];
  readonly groupBy?: readonly string[];
  readonly limit?: number;
  readonly offset?: number;
};

/**
 * Aggregation configuration
 */
export type AggregationConfig = {
  readonly metricName: string;
  readonly method: StatisticalMethod;
  readonly alias?: string;
};

// ============================================================================
// Analysis Types
// ============================================================================

/**
 * Trend direction detected in analysis
 */
export enum TrendDirection {
  INCREASING = 'increasing',
  DECREASING = 'decreasing',
  STABLE = 'stable',
  VOLATILE = 'volatile',
}

/**
 * Trend analysis result
 */
export type TrendAnalysis = {
  readonly metricName: string;
  readonly direction: TrendDirection;
  readonly changeRate: number; // Percentage change
  readonly confidence: number; // 0-1 confidence score
  readonly timeRange: TimeRange;
  readonly anomalyScore?: number;
};

/**
 * Correlation between two metrics
 */
export type MetricCorrelation = {
  readonly metricA: string;
  readonly metricB: string;
  readonly coefficient: number; // -1 to 1
  readonly significance: number; // p-value
  readonly sampleSize: number;
};

/**
 * Complete analytics report
 */
export type AnalyticsReport = {
  readonly id: string;
  readonly generatedAt: Date;
  readonly timeRange: TimeRange;
  readonly metrics: readonly AggregatedMetric[];
  readonly timeSeries: readonly MetricTimeSeries[];
  readonly trends: readonly TrendAnalysis[];
  readonly correlations: readonly MetricCorrelation[];
};

// ============================================================================
// Validation Schemas (Zod)
// ============================================================================

export const timeRangeSchema = z.object({
  start: z.date(),
  end: z.date(),
}).refine(
  (data) => data.start <= data.end,
  'Start date must be before or equal to end date'
);

export const metricValueSchema = z.object({
  value: z.number().finite(),
  timestamp: z.date(),
  labels: z.record(z.string()).readonly(),
  unit: z.string().min(1),
});

export const metricFilterSchema = z.object({
  metricNames: z.array(z.string()).optional(),
  labels: z.record(z.union([z.string(), z.array(z.string())])).optional(),
  timeRange: timeRangeSchema,
  granularity: z.nativeEnum(AggregationGranularity).optional(),
});

export const aggregationConfigSchema = z.object({
  metricName: z.string().min(1),
  method: z.nativeEnum(StatisticalMethod),
  alias: z.string().optional(),
});

export const analyticsQuerySchema = z.object({
  filters: metricFilterSchema,
  aggregations: z.array(aggregationConfigSchema).min(1),
  groupBy: z.array(z.string()).optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
});

// ============================================================================
// Factory Functions with Validation
// ============================================================================

/**
 * Creates a validated TimeRange
 * @throws {ValidationError} if validation fails
 */
export function createTimeRange(start: Date, end: Date): Result<TimeRange, ValidationError> {
  const result = timeRangeSchema.safeParse({ start, end });
  
  if (!result.success) {
    return err(new ValidationError(
      'Invalid time range',
      result.error.flatten().fieldErrors
    ));
  }
  
  return ok(result.data as TimeRange);
}

/**
 * Creates a validated AnalyticsQuery
 * @throws {ValidationError} if validation fails
 */
export function createAnalyticsQuery(config: unknown): Result<AnalyticsQuery, ValidationError> {
  const result = analyticsQuerySchema.safeParse(config);
  
  if (!result.success) {
    return err(new ValidationError(
      'Invalid analytics query configuration',
      result.error.flatten().fieldErrors
    ));
  }
  
  return ok(result.data as AnalyticsQuery);
}

/**
 * Creates a validated MetricValue
 * @throws {ValidationError} if validation fails
 */
export function createMetricValue(config: unknown): Result<MetricValue, ValidationError> {
  const result = metricValueSchema.safeParse(config);
  
  if (!result.success) {
    return err(new ValidationError(
      'Invalid metric value',
      result.error.flatten().fieldErrors
    ));
  }
  
  return ok(result.data as MetricValue);
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for TimeRange
 */
export function isTimeRange(value: unknown): value is TimeRange {
  return timeRangeSchema.safeParse(value).success;
}

/**
 * Type guard for MetricValue
 */
export function isMetricValue(value: unknown): value is MetricValue {
  return metricValueSchema.safeParse(value).success;
}

/**
 * Type guard for AnalyticsQuery
 */
export function isAnalyticsQuery(value: unknown): value is AnalyticsQuery {
  return analyticsQuerySchema.safeParse(value).success;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Options for metric export
 */
export type MetricExportOptions = {
  readonly format: 'json' | 'csv' | 'prometheus';
  readonly includeMetadata: boolean;
  readonly compression?: 'gzip' | 'none';
};

/**
 * Real-time metric subscription
 */
export type MetricSubscription = {
  readonly metricPattern: string; // Regex pattern or exact match
  readonly labelsFilter?: Readonly<Record<string, string>>;
  readonly callback: (metric: MetricValue) => void;
  readonly samplingRate?: number; // 0-1, for throttling
};

/**
 * Performance threshold configuration
 */
export type ThresholdConfig = {
  readonly metricName: string;
  readonly warning: number;
  readonly critical: number;
  readonly comparison: 'gt' | 'lt' | 'eq';
  readonly duration: number; // Duration in ms for sustained threshold
};