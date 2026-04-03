/**
 * Trends API Types - Layer 1: Types
 * 
 * Defines all API request/response types for the Trends module.
 * These types ensure type safety across the entire Trends API surface.
 */

import { z } from 'zod';
import { TrendDirection, TrendCategory, TrendGranularity } from './core';

// ============================================================================
// Base API Types
// ============================================================================

/**
 * Standard API response wrapper for all Trends endpoints
 */
export interface TrendsApiResponse<T> {
  /** Response status */
  status: 'success' | 'error';
  /** Response data payload */
  data: T;
  /** ISO 8601 timestamp of the response */
  timestamp: string;
  /** Request correlation ID for tracing */
  correlationId: string;
  /** Optional pagination metadata */
  pagination?: PaginationMetadata;
  /** Optional error details when status is 'error' */
  error?: ApiErrorDetails;
}

/**
 * Pagination metadata for paginated responses
 */
export interface PaginationMetadata {
  /** Current page number (1-based) */
  page: number;
  /** Number of items per page */
  pageSize: number;
  /** Total number of items across all pages */
  totalItems: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether a next page exists */
  hasNextPage: boolean;
  /** Whether a previous page exists */
  hasPreviousPage: boolean;
}

/**
 * Detailed API error information
 */
export interface ApiErrorDetails {
  /** Machine-readable error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional error context */
  details?: Record<string, unknown>;
  /** Field-level validation errors */
  fieldErrors?: FieldValidationError[];
}

/**
 * Field-level validation error
 */
export interface FieldValidationError {
  /** Path to the field with error */
  field: string;
  /** Error message for this field */
  message: string;
  /** Error code */
  code: string;
}

// ============================================================================
// Request Types
// ============================================================================

/**
 * Base request parameters for trend queries
 */
export interface GetTrendsRequest {
  /** Start date for the trend period (ISO 8601) */
  startDate: string;
  /** End date for the trend period (ISO 8601) */
  endDate: string;
  /** Data granularity */
  granularity: TrendGranularity;
  /** Optional category filter */
  category?: TrendCategory;
  /** Optional metric name filter */
  metricName?: string;
}

/**
 * Request parameters for trend comparison
 */
export interface CompareTrendsRequest {
  /** Base period for comparison */
  basePeriod: {
    startDate: string;
    endDate: string;
  };
  /** Comparison period */
  comparisonPeriod: {
    startDate: string;
    endDate: string;
  };
  /** Metrics to compare */
  metrics: string[];
  /** Data granularity */
  granularity: TrendGranularity;
}

/**
 * Request for creating a trend alert
 */
export interface CreateTrendAlertRequest {
  /** Alert name */
  name: string;
  /** Metric to monitor */
  metricName: string;
  /** Alert condition */
  condition: AlertCondition;
  /** Notification channels */
  notifications: NotificationConfig[];
  /** Optional category scope */
  category?: TrendCategory;
}

/**
 * Alert condition configuration
 */
export interface AlertCondition {
  /** Condition type */
  type: 'threshold' | 'anomaly' | 'trend_change';
  /** Operator for threshold conditions */
  operator?: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  /** Threshold value */
  threshold?: number;
  /** Duration the condition must persist (in minutes) */
  durationMinutes: number;
}

/**
 * Notification channel configuration
 */
export interface NotificationConfig {
  /** Channel type */
  type: 'email' | 'slack' | 'pagerduty' | 'webhook';
  /** Channel-specific configuration */
  config: Record<string, string>;
}

/**
 * Request for trend export
 */
export interface ExportTrendsRequest {
  /** Trend IDs to export */
  trendIds: string[];
  /** Export format */
  format: 'csv' | 'json' | 'xlsx';
  /** Include metadata in export */
  includeMetadata: boolean;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Single trend data point
 */
export interface TrendDataPoint {
  /** Timestamp for this data point */
  timestamp: string;
  /** Metric value */
  value: number;
  /** Optional previous period value for comparison */
  previousValue?: number;
  /** Calculated change from previous period */
  changePercent?: number;
  /** Trend direction at this point */
  direction: TrendDirection;
}

/**
 * Complete trend information
 */
export interface Trend {
  /** Unique trend identifier */
  id: string;
  /** Trend name */
  name: string;
  /** Metric identifier */
  metricName: string;
  /** Trend category */
  category: TrendCategory;
  /** Overall trend direction */
  direction: TrendDirection;
  /** Data points for the trend */
  dataPoints: TrendDataPoint[];
  /** Summary statistics */
  statistics: TrendStatistics;
  /** Metadata */
  metadata: TrendMetadata;
}

/**
 * Trend summary statistics
 */
export interface TrendStatistics {
  /** Minimum value in the period */
  min: number;
  /** Maximum value in the period */
  max: number;
  /** Average value */
  average: number;
  /** Total change percentage */
  totalChangePercent: number;
  /** Standard deviation */
  standardDeviation: number;
}

/**
 * Trend metadata
 */
export interface TrendMetadata {
  /** Data source */
  source: string;
  /** Last updated timestamp */
  lastUpdated: string;
  /** Data quality score (0-100) */
  qualityScore: number;
  /** Processing status */
  status: 'complete' | 'partial' | 'failed';
}

/**
 * Trend comparison result
 */
export interface TrendComparison {
  /** Compared metric name */
  metricName: string;
  /** Base period statistics */
  basePeriod: PeriodStatistics;
  /** Comparison period statistics */
  comparisonPeriod: PeriodStatistics;
  /** Period-over-period change */
  periodOverPeriodChange: number;
  /** Statistical significance */
  isSignificant: boolean;
  /** Confidence level (0-1) */
  confidenceLevel: number;
}

/**
 * Statistics for a specific period
 */
export interface PeriodStatistics {
  /** Period start */
  startDate: string;
  /** Period end */
  endDate: string;
  /** Average value */
  average: number;
  /** Total/sum value */
  total: number;
  /** Sample count */
  count: number;
}

/**
 * Created trend alert response
 */
export interface TrendAlert {
  /** Alert ID */
  id: string;
  /** Alert name */
  name: string;
  /** Associated metric */
  metricName: string;
  /** Alert condition */
  condition: AlertCondition;
  /** Current alert status */
  status: 'active' | 'paused' | 'triggered';
  /** Creation timestamp */
  createdAt: string;
  /** Last modified timestamp */
  updatedAt: string;
}

/**
 * Export job status
 */
export interface ExportJobStatus {
  /** Job ID */
  jobId: string;
  /** Current status */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /** Progress percentage (0-100) */
  progress: number;
  /** Download URL when completed */
  downloadUrl?: string;
  /** Error message if failed */
  errorMessage?: string;
  /** Estimated completion time */
  estimatedCompletion?: string;
}

// ============================================================================
// Zod Validation Schemas
// ============================================================================

/**
 * Validation schema for GetTrendsRequest
 */
export const GetTrendsRequestSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  granularity: z.nativeEnum(TrendGranularity),
  category: z.nativeEnum(TrendCategory).optional(),
  metricName: z.string().min(1).max(255).optional(),
}).refine(
  (data) => new Date(data.startDate) < new Date(data.endDate),
  { message: 'startDate must be before endDate' }
);

/**
 * Validation schema for CreateTrendAlertRequest
 */
export const CreateTrendAlertRequestSchema = z.object({
  name: z.string().min(1).max(100),
  metricName: z.string().min(1).max(255),
  condition: z.object({
    type: z.enum(['threshold', 'anomaly', 'trend_change']),
    operator: z.enum(['gt', 'lt', 'eq', 'gte', 'lte']).optional(),
    threshold: z.number().optional(),
    durationMinutes: z.number().int().positive().max(10080), // Max 1 week
  }),
  notifications: z.array(z.object({
    type: z.enum(['email', 'slack', 'pagerduty', 'webhook']),
    config: z.record(z.string()),
  })).min(1).max(10),
  category: z.nativeEnum(TrendCategory).optional(),
});

/**
 * Validation schema for CompareTrendsRequest
 */
export const CompareTrendsRequestSchema = z.object({
  basePeriod: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
  }),
  comparisonPeriod: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
  }),
  metrics: z.array(z.string().min(1)).min(1).max(10),
  granularity: z.nativeEnum(TrendGranularity),
});

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a response is a successful Trends API response
 */
export function isSuccessfulTrendsResponse<T>(
  response: unknown
): response is TrendsApiResponse<T> {
  return (
    typeof response === 'object' &&
    response !== null &&
    'status' in response &&
    (response as TrendsApiResponse<T>).status === 'success' &&
    'data' in response &&
    'timestamp' in response &&
    'correlationId' in response
  );
}

/**
 * Type guard to check if response contains pagination
 */
export function hasPagination<T>(
  response: TrendsApiResponse<T>
): response is TrendsApiResponse<T> & { pagination: PaginationMetadata } {
  return response.pagination !== undefined;
}

/**
 * Type guard to check if a value is a valid TrendDataPoint
 */
export function isTrendDataPoint(value: unknown): value is TrendDataPoint {
  return (
    typeof value === 'object' &&
    value !== null &&
    'timestamp' in value &&
    'value' in value &&
    'direction' in value &&
    typeof (value as TrendDataPoint).timestamp === 'string' &&
    typeof (value as TrendDataPoint).value === 'number' &&
    Object.values(TrendDirection).includes((value as TrendDataPoint).direction)
  );
}