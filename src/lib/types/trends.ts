/**
 * @fileoverview Trend Data Source Types - Re-export from consolidated types
 * 
 * This file now re-exports from the consolidated types location.
 * Please update imports to use `src/types/trends/index.ts` directly.
 * 
 * Layer: Types (Layer 1)
 * Dependencies: `src/types/trends/index.ts`
 */

// Re-export all types from the consolidated location for backwards compatibility
export * from '../types/trends/index';

// This file is kept as a shim for backwards compatibility.
// It will be removed in version 3.0.0.
// Migration guide: https://docs.harness-engineering.io/migrations/trends-types
WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

/**
 * Represents the aggregation method for trend data.
 * Determines how multiple data points are combined within a time window.
 */
export enum TrendAggregation {
  SUM = 'sum',
  AVERAGE = 'average',
  MIN = 'min',
  MAX = 'max',
  COUNT = 'count',
  LAST = 'last',
  FIRST = 'first',
}

/**
 * Represents the status of a trend data point.
 * Used to indicate data quality and availability.
 */
export enum TrendPointStatus {
  VALID = 'valid',
  INTERPOLATED = 'interpolated',
  MISSING = 'missing',
  ERROR = 'error',
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * Zod schema for validating trend granularity values.
 * Provides runtime type safety beyond TypeScript's compile-time checks.
 */
export const TrendGranularitySchema = z.nativeEnum(TrendGranularity);

/**
 * Zod schema for validating trend aggregation methods.
 */
export const TrendAggregationSchema = z.nativeEnum(TrendAggregation);

/**
 * Zod schema for validating trend point status values.
 */
export const TrendPointStatusSchema = z.nativeEnum(TrendPointStatus);

/**
 * Zod schema for ISO 8601 timestamp validation.
 * Ensures all timestamps are properly formatted strings.
 */
export const TimestampSchema = z.string().datetime({ message: 'Invalid ISO 8601 timestamp' });

/**
 * Zod schema for trend metric names.
 * Enforces naming conventions: lowercase with underscores, 1-64 characters.
 */
export const TrendMetricNameSchema = z
  .string()
  .min(1, 'Metric name cannot be empty')
  .max(64, 'Metric name exceeds maximum length of 64 characters')
  .regex(/^[a-z][a-z0-9_]*$/, 'Metric name must start with lowercase letter and contain only lowercase letters, numbers, and underscores');

/**
 * Zod schema for trend data point values.
 * Supports numeric values and null for missing data.
 */
export const TrendValueSchema = z.number().nullable();

// ============================================================================
// Trend Data Point Types
// ============================================================================

/**
 * Represents a single data point in a trend series.
 * This is the atomic unit of trend data.
 */
export interface TrendDataPoint {
  /** ISO 8601 timestamp for this data point */
  readonly timestamp: string;
  
  /** The metric value, null if data is unavailable */
  readonly value: number | null;
  
  /** Status indicating data quality */
  readonly status: TrendPointStatus;
  
  /** Optional metadata for this specific point */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Zod schema for validating trend data points.
 * Implements runtime validation for all trend data point properties.
 */
export const TrendDataPointSchema = z.object({
  timestamp: TimestampSchema,
  value: TrendValueSchema,
  status: TrendPointStatusSchema,
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Type guard to check if a value is a valid TrendDataPoint.
 * 
 * @param value - The value to check
 * @returns True if the value is a valid TrendDataPoint
 */
export function isTrendDataPoint(value: unknown): value is TrendDataPoint {
  return TrendDataPointSchema.safeParse(value).success;
}

// ============================================================================
// Trend Series Types
// ============================================================================

/**
 * Represents a series of trend data points for a single metric.
 * Contains metadata about the series and the actual data points.
 */
export interface TrendSeries {
  /** Unique identifier for this series */
  readonly id: string;
  
  /** Human-readable name for the series */
  readonly name: string;
  
  /** Machine-readable metric identifier */
  readonly metric: string;
  
  /** Data granularity for this series */
  readonly granularity: TrendGranularity;
  
  /** Aggregation method used for this series */
  readonly aggregation: TrendAggregation;
  
  /** Time range start (inclusive) */
  readonly startTime: string;
  
  /** Time range end (inclusive) */
  readonly endTime: string;
  
  /** The data points in this series, ordered by timestamp */
  readonly points: readonly TrendDataPoint[];
  
  /** Optional tags for categorization */
  readonly tags?: readonly string[];
  
  /** Optional unit of measurement (e.g., 'ms', 'bytes', 'percent') */
  readonly unit?: string;
}

/**
 * Zod schema for validating trend series.
 * Ensures all series properties meet type and format requirements.
 */
export const TrendSeriesSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(128),
  metric: TrendMetricNameSchema,
  granularity: TrendGranularitySchema,
  aggregation: TrendAggregationSchema,
  startTime: TimestampSchema,
  endTime: TimestampSchema,
  points: z.array(TrendDataPointSchema),
  tags: z.array(z.string().min(1).max(32)).optional(),
  unit: z.string().min(1).max(16).optional(),
}).refine(
  (data) => new Date(data.startTime) <= new Date(data.endTime),
  { message: 'startTime must be less than or equal to endTime' }
);

/**
 * Type guard to check if a value is a valid TrendSeries.
 * 
 * @param value - The value to check
 * @returns True if the value is a valid TrendSeries
 */
export function isTrendSeries(value: unknown): value is TrendSeries {
  return TrendSeriesSchema.safeParse(value).success;
}

// ============================================================================
// Trend Data Source Configuration Types
// ============================================================================

/**
 * Supported data source types for trend data.
 * Each type corresponds to a different backend implementation.
 */
export enum TrendDataSourceType {
  PROMETHEUS = 'prometheus',
  DATADOG = 'datadog',
  CLOUDWATCH = 'cloudwatch',
  CUSTOM_API = 'custom_api',
  IN_MEMORY = 'in_memory',
}

/**
 * Base configuration interface for all trend data sources.
 * Defines common properties shared across all source types.
 */
export interface TrendDataSourceConfig {
  /** Unique identifier for this data source configuration */
  readonly id: string;
  
  /** Human-readable name for this data source */
  readonly name: string;
  
  /** The type of data source */
  readonly type: TrendDataSourceType;
  
  /** Whether this data source is currently enabled */
  readonly enabled: boolean;
  
  /** Timeout in milliseconds for data source operations */
  readonly timeoutMs: number;
  
  /** Maximum number of retry attempts for failed operations */
  readonly retryAttempts: number;
  
  /** Optional description of this data source */
  readonly description?: string;
}

/**
 * Prometheus-specific data source configuration.
 */
export interface PrometheusDataSourceConfig extends TrendDataSourceConfig {
  readonly type: TrendDataSourceType.PROMETHEUS;
  
  /** Base URL for the Prometheus server */
  readonly baseUrl: string;
  
  /** Optional authentication token */
  readonly authToken?: string;
  
  /** Whether to skip TLS certificate verification */
  readonly skipTlsVerify?: boolean;
  
  /** Default step size for range queries in seconds */
  readonly defaultStepSeconds: number;
}

/**
 * Datadog-specific data source configuration.
 */
export interface DatadogDataSourceConfig extends TrendDataSourceConfig {
  readonly type: TrendDataSourceType.DATADOG;
  
  /** Datadog API key */
  readonly apiKey: string;
  
  /** Datadog application key */
  readonly appKey: string;
  
  /** Datadog site (e.g., 'datadoghq.com', 'datadoghq.eu') */
  readonly site: string;
}

/**
 * CloudWatch-specific data source configuration.
 */
export interface CloudWatchDataSourceConfig extends TrendDataSourceConfig {
  readonly type: TrendDataSourceType.CLOUDWATCH;
  
  /** AWS region */
  readonly region: string;
  
  /** Optional AWS access key ID (uses IAM role if not provided) */
  readonly accessKeyId?: string;
  
  /** Optional AWS secret access key */
  readonly secretAccessKey?: string;
  
  /** Optional AWS session token for temporary credentials */
  readonly sessionToken?: string;
}

/**
 * Custom API data source configuration.
 */
export interface CustomApiDataSourceConfig extends TrendDataSourceConfig {
  readonly type: TrendDataSourceType.CUSTOM_API;
  
  /** Base URL for the custom API */
  readonly baseUrl: string;
  
  /** HTTP headers to include in requests */
  readonly headers?: Record<string, string>;
  
  /** Custom query parameter mappings */
  readonly queryMapping?: Record<string, string>;
}

/**
 * In-memory data source configuration for testing and caching.
 */
export interface InMemoryDataSourceConfig extends TrendDataSourceConfig {
  readonly type: TrendDataSourceType.IN_MEMORY;
  
  /** Maximum number of series to cache */
  readonly maxSeries: number;
  
  /** Time-to-live for cached data in milliseconds */
  readonly ttlMs: number;
}

/**
 * Union type for all data source configurations.
 */
export type TrendDataSourceConfigUnion =
  | PrometheusDataSourceConfig
  | DatadogDataSourceConfig
  | CloudWatchDataSourceConfig
  | CustomApiDataSourceConfig
  | InMemoryDataSourceConfig;

// ============================================================================
// Zod Schemas for Data Source Configurations
// ============================================================================

const BaseTrendDataSourceConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(128),
  type: z.nativeEnum(TrendDataSourceType),
  enabled: z.boolean(),
  timeoutMs: z.number().int().min(100).max(300000),
  retryAttempts: z.number().int().min(0).max(10),
  description: z.string().max(512).optional(),
});

export const PrometheusDataSourceConfigSchema = BaseTrendDataSourceConfigSchema.extend({
  type: z.literal(TrendDataSourceType.PROMETHEUS),
  baseUrl: z.string().url(),
  authToken: z.string().optional(),
  skipTlsVerify: z.boolean().optional(),
  defaultStepSeconds: z.number().int().min(1).max(86400),
});

export const DatadogDataSourceConfigSchema = BaseTrendDataSourceConfigSchema.extend({
  type: z.literal(TrendDataSourceType.DATADOG),
  apiKey: z.string().min(1),
  appKey: z.string().min(1),
  site: z.string().min(1),
});

export const CloudWatchDataSourceConfigSchema = BaseTrendDataSourceConfigSchema.extend({
  type: z.literal(TrendDataSourceType.CLOUDWATCH),
  region: z.string().min(1),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  sessionToken: z.string().optional(),
});

export const CustomApiDataSourceConfigSchema = BaseTrendDataSourceConfigSchema.extend({
  type: z.literal(TrendDataSourceType.CUSTOM_API),
  baseUrl: z.string().url(),
  headers: z.record(z.string()).optional(),
  queryMapping: z.record(z.string()).optional(),
});

export const InMemoryDataSourceConfigSchema = BaseTrendDataSourceConfigSchema.extend({
  type: z.literal(TrendDataSourceType.IN_MEMORY),
  maxSeries: z.number().int().min(1).max(10000),
  ttlMs: z.number().int().min(1000).max(86400000),
});

/**
 * Combined schema for validating any data source configuration.
 * Uses discriminated union based on the 'type' field.
 */
export const TrendDataSourceConfigSchema = z.discriminatedUnion('type', [
  PrometheusDataSourceConfigSchema,
  DatadogDataSourceConfigSchema,
  CloudWatchDataSourceConfigSchema,
  CustomApiDataSourceConfigSchema,
  InMemoryDataSourceConfigSchema,
]);

/**
 * Type guard to check if a value is a valid TrendDataSourceConfig.
 * 
 * @param value - The value to check
 * @returns True if the value is a valid TrendDataSourceConfig
 */
export function isTrendDataSourceConfig(value: unknown): value is TrendDataSourceConfigUnion {
  return TrendDataSourceConfigSchema.safeParse(value).success;
}

// ============================================================================
// Trend Query Types
// ============================================================================

/**
 * Represents a query for trend data.
 * Used to request specific time-series data from a data source.
 */
export interface TrendQuery {
  /** The metric to query */
  readonly metric: string;
  
  /** Time range start (inclusive) */
  readonly startTime: string;
  
  /** Time range end (inclusive) */
  readonly endTime: string;
  
  /** Desired data granularity */
  readonly granularity: TrendGranularity;
  
  /** Aggregation method to apply */
  readonly aggregation: TrendAggregation;
  
  /** Optional filters to apply to the query */
  readonly filters?: Record<string, string | number | boolean>;
  
  /** Optional group-by dimensions */
  readonly groupBy?: readonly string[];
  
  /** Maximum number of data points to return */
  readonly limit?: number;
}

/**
 * Zod schema for validating trend queries.
 */
export const TrendQuerySchema = z.object({
  metric: TrendMetricNameSchema,
  startTime: TimestampSchema,
  endTime: TimestampSchema,
  granularity: TrendGranularitySchema,
  aggregation: TrendAggregationSchema,
  filters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  groupBy: z.array(z.string().min(1)).optional(),
  limit: z.number().int().min(1).max(10000).optional(),
}).refine(
  (data) => new Date(data.startTime) <= new Date(data.endTime),
  { message: 'startTime must be less than or equal to endTime' }
);

/**
 * Type guard to check if a value is a valid TrendQuery.
 * 
 * @param value - The value to check
 * @returns True if the value is a valid TrendQuery
 */
export function isTrendQuery(value: unknown): value is TrendQuery {
  return TrendQuerySchema.safeParse(value).success;
}

// ============================================================================
// Trend Data Source Result Types
// ============================================================================

/**
 * Represents the result of a trend data query.
 * Contains either successful data or error information.
 */
export type TrendQueryResult =
  | TrendQuerySuccessResult
  | TrendQueryErrorResult;

/**
 * Successful trend query result.
 */
export interface TrendQuerySuccessResult {
  readonly success: true;
  
  /** The requested trend series */
  readonly series: TrendSeries;
  
  /** Time when the query was executed */
  readonly queriedAt: string;
  
  /** Time taken to execute the query in milliseconds */
  readonly durationMs: number;
  
  /** Data source that provided the result */
  readonly dataSourceId: string;
}

/**
 * Failed trend query result.
 */
export interface TrendQueryErrorResult {
  readonly success: false;
  
  /** Error code for programmatic handling */
  readonly errorCode: TrendErrorCode;
  
  /** Human-readable error message */
  readonly errorMessage: string;
  
  /** Time when the error occurred */
  readonly failedAt: string;
  
  /** Data source that failed */
  readonly dataSourceId: string;
  
  /** Whether the error is retryable */
  readonly retryable: boolean;
  
  /** Optional additional error details */
  readonly details?: Record<string, unknown>;
}

/**
 * Error codes for trend data source operations.
 */
export enum TrendErrorCode {
  // Configuration errors
  INVALID_CONFIG = 'INVALID_CONFIG',
  DATA_SOURCE_NOT_FOUND = 'DATA_SOURCE_NOT_FOUND',
  DATA_SOURCE_DISABLED = 'DATA_SOURCE_DISABLED',
  
  // Query errors
  INVALID_QUERY = 'INVALID_QUERY',
  METRIC_NOT_FOUND = 'METRIC_NOT_FOUND',
  INVALID_TIME_RANGE = 'INVALID_TIME_RANGE',
  
  // Runtime errors
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  
  // Data errors
  NO_DATA = 'NO_DATA',
  DATA_CORRUPTED = 'DATA_CORRUPTED',
  PARTIAL_DATA = 'PARTIAL_DATA',
  
  // Unknown errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Zod schemas for trend query results.
 */
export const TrendQuerySuccessResultSchema = z.object({
  success: z.literal(true),
  series: TrendSeriesSchema,
  queriedAt: TimestampSchema,
  durationMs: z.number().int().min(0),
  dataSourceId: z.string().uuid(),
});

export const TrendQueryErrorResultSchema = z.object({
  success: z.literal(false),
  errorCode: z.nativeEnum(TrendErrorCode),
  errorMessage: z.string().min(1),
  failedAt: TimestampSchema,
  dataSourceId: z.string().uuid(),
  retryable: z.boolean(),
  details: z.record(z.unknown()).optional(),
});

export const TrendQueryResultSchema = z.union([
  TrendQuerySuccessResultSchema,
  TrendQueryErrorResultSchema,
]);

/**
 * Type guard to check if a result is successful.
 * 
 * @param result - The result to check
 * @returns True if the result is a successful query result
 */
export function isTrendQuerySuccess(result: TrendQueryResult): result is TrendQuerySuccessResult {
  return result.success === true;
}

/**
 * Type guard to check if a result is an error.
 * 
 * @param result - The result to check
 * @returns True if the result is an error query result
 */
export function isTrendQueryError(result: TrendQueryResult): result is TrendQueryErrorResult {
  return result.success === false;
}

// ============================================================================
// Trend Data Source Interface (for Service Layer)
// ============================================================================

/**
 * Interface for trend data source implementations.
 * This interface is implemented by the Service layer.
 */
export interface ITrendDataSource {
  /** Unique identifier for this data source instance */
  readonly id: string;
  
  /** Configuration for this data source */
  readonly config: TrendDataSourceConfigUnion;
  
  /**
   * Query trend data from this source.
   * 
   * @param query - The query parameters
   * @returns Promise resolving to the query result
   */
  query(query: TrendQuery): Promise<TrendQueryResult>;
  
  /**
   * Check if this data source is healthy and available.
   * 
   * @returns Promise resolving to health status
   */
  healthCheck(): Promise<TrendHealthStatus>;
  
  /**
   * Get metadata about available metrics from this source.
   * 
   * @returns Promise resolving to metric metadata
   */
  getAvailableMetrics(): Promise<TrendMetricMetadata[]>;
}

/**
 * Health status for trend data sources.
 */
export interface TrendHealthStatus {
  readonly healthy: boolean;
  readonly checkedAt: string;
  readonly responseTimeMs: number;
  readonly message?: string;
}

/**
 * Metadata for available trend metrics.
 */
export interface TrendMetricMetadata {
  readonly name: string;
  readonly description?: string;
  readonly unit?: string;
  readonly type: 'gauge' | 'counter' | 'histogram' | 'summary';
  readonly labels?: readonly string[];
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Options for trend data export.
 */
export interface TrendExportOptions {
  readonly format: 'json' | 'csv' | 'prometheus';
  readonly includeMetadata: boolean;
  readonly compress: boolean;
}

/**
 * Pagination parameters for trend data listing.
 */
export interface TrendPaginationParams {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: string;
  readonly sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated result wrapper for trend data.
 */
export interface TrendPaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base error class for trend data source operations.
 * Provides structured error information for proper error handling.
 */
export class TrendDataSourceError extends Error {
  constructor(
    message: string,
    public readonly code: TrendErrorCode,
    public readonly dataSourceId: string,
    public readonly retryable: boolean = false,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TrendDataSourceError';
    
    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TrendDataSourceError);
    }
  }
  
  /**
   * Convert this error to a TrendQueryErrorResult.
   * 
   * @returns The error result representation
   */
  toResult(): TrendQueryErrorResult {
    return {
      success: false,
      errorCode: this.code,
      errorMessage: this.message,
      failedAt: new Date().toISOString(),
      dataSourceId: this.dataSourceId,
      retryable: this.retryable,
      details: this.details,
    };
  }
}

/**
 * Error thrown when a trend query is invalid.
 */
export class TrendQueryValidationError extends TrendDataSourceError {
  constructor(
    message: string,
    dataSourceId: string,
    public readonly validationErrors: z.ZodError[]
  ) {
    super(
      message,
      TrendErrorCode.INVALID_QUERY,
      dataSourceId,
      false,
      { validationErrors: validationErrors.map(e => e.errors) }
    );
    this.name = 'TrendQueryValidationError';
  }
}

/**
 * Error thrown when a data source configuration is invalid.
 */
export class TrendConfigValidationError extends TrendDataSourceError {
  constructor(
    message: string,
    dataSourceId: string,
    public readonly validationErrors: z.ZodError[]
  ) {
    super(
      message,
      TrendErrorCode.INVALID_CONFIG,
      dataSourceId,
      false,
      { validationErrors: validationErrors.map(e => e.errors) }
    );
    this.name = 'TrendConfigValidationError';
  }
}