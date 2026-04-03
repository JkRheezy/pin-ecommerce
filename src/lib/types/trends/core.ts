/**
 * @file src/lib/types/trends/core.ts
 * @description Base types and enums for the Trends feature
 * @module Types/Trends
 */

import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

/**
 * Enum representing the possible trend directions
 */
export enum TrendDirection {
  UP = 'UP',
  DOWN = 'DOWN',
  FLAT = 'FLAT',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Enum representing the granularity of trend data points
 */
export enum TrendGranularity {
  MINUTE = 'MINUTE',
  HOUR = 'HOUR',
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

/**
 * Enum representing the status of a trend calculation
 */
export enum TrendCalculationStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  STALE = 'STALE',
}

/**
 * Enum representing the type of metric being tracked
 */
export enum TrendMetricType {
  DEPLOYMENT_FREQUENCY = 'DEPLOYMENT_FREQUENCY',
  LEAD_TIME = 'LEAD_TIME',
  CHANGE_FAILURE_RATE = 'CHANGE_FAILURE_RATE',
  MTTR = 'MTTR',
  CUSTOM = 'CUSTOM',
}

// ============================================================================
// Zod Schemas (for runtime validation)
// ============================================================================

export const TrendDirectionSchema = z.nativeEnum(TrendDirection);
export const TrendGranularitySchema = z.nativeEnum(TrendGranularity);
export const TrendCalculationStatusSchema = z.nativeEnum(TrendCalculationStatus);
export const TrendMetricTypeSchema = z.nativeEnum(TrendMetricType);

/**
 * Schema for validating trend data points
 */
export const TrendDataPointSchema = z.object({
  timestamp: z.date().or(z.string().datetime()),
  value: z.number(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Schema for validating trend series
 */
export const TrendSeriesSchema = z.object({
  id: z.string().uuid(),
  metricType: TrendMetricTypeSchema,
  granularity: TrendGranularitySchema,
  dataPoints: z.array(TrendDataPointSchema).min(1),
  startDate: z.date().or(z.string().datetime()),
  endDate: z.date().or(z.string().datetime()),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Schema for validating trend analysis results
 */
export const TrendAnalysisSchema = z.object({
  seriesId: z.string().uuid(),
  direction: TrendDirectionSchema,
  changePercentage: z.number().min(-100).max(100),
  confidence: z.number().min(0).max(1),
  status: TrendCalculationStatusSchema,
  calculatedAt: z.date().or(z.string().datetime()),
  errorMessage: z.string().optional(),
});

// ============================================================================
// TypeScript Types (derived from schemas)
// ============================================================================

export type TrendDataPoint = z.infer<typeof TrendDataPointSchema>;
export type TrendSeries = z.infer<typeof TrendSeriesSchema>;
export type TrendAnalysis = z.infer<typeof TrendAnalysisSchema>;

/**
 * Configuration options for trend calculations
 */
export interface TrendCalculationConfig {
  /** The granularity of data points */
  granularity: TrendGranularity;
  /** Number of data points to include in the analysis window */
  windowSize: number;
  /** Minimum number of data points required for valid analysis */
  minDataPoints: number;
  /** Threshold for considering a change significant (percentage) */
  significanceThreshold: number;
  /** Whether to include outlier detection */
  enableOutlierDetection: boolean;
  /** Optional custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input parameters for fetching trend data
 */
export interface TrendFetchParams {
  /** The metric type to fetch */
  metricType: TrendMetricType;
  /** Start of the time range */
  startDate: Date;
  /** End of the time range */
  endDate: Date;
  /** Desired granularity */
  granularity: TrendGranularity;
  /** Optional filters */
  filters?: Record<string, string | string[]>;
}

/**
 * Error types specific to trend operations
 */
export class TrendError extends Error {
  constructor(
    message: string,
    public readonly code: TrendErrorCode,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TrendError';
    Object.setPrototypeOf(this, TrendError.prototype);
  }
}

/**
 * Error codes for trend operations
 */
export enum TrendErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  CALCULATION_FAILED = 'CALCULATION_FAILED',
  TIMEOUT = 'TIMEOUT',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Type for trend comparison results (period-over-period)
 */
export interface TrendComparison {
  currentPeriod: TrendSeries;
  previousPeriod: TrendSeries;
  analysis: TrendAnalysis;
  comparisonPercentage: number;
}

/**
 * Type for paginated trend results
 */
export interface PaginatedTrends<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Union type for all trend-related entities
 */
export type TrendEntity = TrendDataPoint | TrendSeries | TrendAnalysis;

/**
 * Type guard to check if a value is a valid TrendDirection
 */
export function isTrendDirection(value: unknown): value is TrendDirection {
  return Object.values(TrendDirection).includes(value as TrendDirection);
}

/**
 * Type guard to check if a value is a valid TrendGranularity
 */
export function isTrendGranularity(value: unknown): value is TrendGranularity {
  return Object.values(TrendGranularity).includes(value as TrendGranularity);
}