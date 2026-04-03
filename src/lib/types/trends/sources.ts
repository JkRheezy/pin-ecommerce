/**
 * @fileoverview Data source types for the Trends module
 * @module lib/types/trends/sources
 * 
 * This file defines the type contracts for data sources used in trend analysis.
 * Following the six-layer architecture, these types represent the foundational
 * contracts that all trend data sources must implement.
 */

import { z } from 'zod';
import { Result, ValidationError } from '../common';

// ============================================================================
// Base Types
// ============================================================================

/**
 * Unique identifier for a data source
 */
export type DataSourceId = string & { readonly __brand: 'DataSourceId' };

/**
 * Supported data source types
 */
export enum DataSourceType {
  METRICS = 'metrics',
  LOGS = 'logs',
  TRACES = 'traces',
  EVENTS = 'events',
  CUSTOM = 'custom',
}

/**
 * Time range for data queries
 */
export interface TimeRange {
  readonly startTime: number; // Unix timestamp in milliseconds
  readonly endTime: number;   // Unix timestamp in milliseconds
}

/**
 * Granularity options for trend aggregation
 */
export enum Granularity {
  MINUTE = 'minute',
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Base configuration for all data sources
 */
export interface BaseDataSourceConfig {
  readonly id: DataSourceId;
  readonly type: DataSourceType;
  readonly name: string;
  readonly description?: string;
  readonly enabled: boolean;
  readonly timeoutMs: number;
  readonly retryPolicy: RetryPolicy;
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly backoffMultiplier: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
}

/**
 * Metrics-specific data source configuration
 */
export interface MetricsDataSourceConfig extends BaseDataSourceConfig {
  readonly type: DataSourceType.METRICS;
  readonly endpoint: string;
  readonly queryFormat: 'promql' | 'mql' | 'custom';
  readonly aggregationFunctions: readonly string[];
}

/**
 * Logs-specific data source configuration
 */
export interface LogsDataSourceConfig extends BaseDataSourceConfig {
  readonly type: DataSourceType.LOGS;
  readonly indexPattern: string;
  readonly logLevels: readonly string[];
  readonly fieldMappings: Record<string, string>;
}

/**
 * Union type for all data source configurations
 */
export type DataSourceConfig = 
  | MetricsDataSourceConfig 
  | LogsDataSourceConfig
  | BaseDataSourceConfig;

// ============================================================================
// Query Types
// ============================================================================

/**
 * Base query parameters for trend data retrieval
 */
export interface BaseTrendQuery {
  readonly dataSourceId: DataSourceId;
  readonly timeRange: TimeRange;
  readonly granularity: Granularity;
  readonly filters?: ReadonlyArray<QueryFilter>;
}

/**
 * Filter condition for queries
 */
export interface QueryFilter {
  readonly field: string;
  readonly operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  readonly value: unknown;
}

/**
 * Metrics-specific query parameters
 */
export interface MetricsTrendQuery extends BaseTrendQuery {
  readonly metricName: string;
  readonly aggregation: 'avg' | 'sum' | 'min' | 'max' | 'count' | 'p99' | 'p95';
  readonly groupBy?: readonly string[];
}

/**
 * Logs-specific query parameters
 */
export interface LogsTrendQuery extends BaseTrendQuery {
  readonly searchQuery: string;
  readonly severityLevels?: readonly string[];
  readonly includeFields?: readonly string[];
}

/**
 * Union type for all trend queries
 */
export type TrendQuery = MetricsTrendQuery | LogsTrendQuery | BaseTrendQuery;

// ============================================================================
// Result Types
// ============================================================================

/**
 * A single data point in a trend series
 */
export interface TrendDataPoint {
  readonly timestamp: number;
  readonly value: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * A named series of trend data points
 */
export interface TrendSeries {
  readonly name: string;
  readonly label: string;
  readonly dataPoints: ReadonlyArray<TrendDataPoint>;
  readonly unit?: string;
  readonly color?: string;
}

/**
 * Complete result from a trend data query
 */
export interface TrendQueryResult {
  readonly queryId: string;
  readonly executedAt: number;
  readonly executionTimeMs: number;
  readonly series: ReadonlyArray<TrendSeries>;
  readonly totalDataPoints: number;
  readonly truncated: boolean;
  readonly metadata: QueryResultMetadata;
}

/**
 * Metadata about query execution
 */
export interface QueryResultMetadata {
  readonly dataSourceId: DataSourceId;
  readonly queryTimeRange: TimeRange;
  readonly actualTimeRange: TimeRange;
  readonly sampleRate?: number;
  readonly warnings?: ReadonlyArray<string>;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes specific to data source operations
 */
export enum DataSourceErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  QUERY_TIMEOUT = 'QUERY_TIMEOUT',
  INVALID_QUERY = 'INVALID_QUERY',
  RATE_LIMITED = 'RATE_LIMITED',
  DATA_NOT_FOUND = 'DATA_NOT_FOUND',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Structured error for data source operations
 */
export interface DataSourceError {
  readonly code: DataSourceErrorCode;
  readonly message: string;
  readonly dataSourceId: DataSourceId;
  readonly retryable: boolean;
  readonly timestamp: number;
  readonly details?: Record<string, unknown>;
}

// ============================================================================
// Interface Contracts
// ============================================================================

/**
 * Contract that all trend data sources must implement
 * This is the core abstraction for the Repository layer
 */
export interface ITrendDataSource {
  /** Unique identifier for this data source instance */
  readonly id: DataSourceId;
  
  /** Configuration for this data source */
  readonly config: DataSourceConfig;

  /**
   * Validates that the data source is properly configured and reachable
   * @returns Result indicating health status or error details
   */
  validate(): Promise<Result<void, DataSourceError>>;

  /**
   * Executes a trend query against this data source
   * @param query - The query parameters
   * @returns Result containing trend data or error details
   */
  query(query: TrendQuery): Promise<Result<TrendQueryResult, DataSourceError>>;

  /**
   * Retrieves available metrics/fields from this data source
   * @returns Result containing available fields or error details
   */
  getAvailableFields(): Promise<Result<ReadonlyArray<string>, DataSourceError>>;
}

// ============================================================================
// Validation Schemas (for runtime validation)
// ============================================================================

export const timeRangeSchema = z.object({
  startTime: z.number().int().positive(),
  endTime: z.number().int().positive(),
}).refine(
  (data) => data.startTime < data.endTime,
  { message: 'startTime must be less than endTime' }
);

export const queryFilterSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains']),
  value: z.unknown(),
});

export const baseTrendQuerySchema = z.object({
  dataSourceId: z.string().min(1),
  timeRange: timeRangeSchema,
  granularity: z.nativeEnum(Granularity),
  filters: z.array(queryFilterSchema).optional(),
});

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a query is a metrics query
 */
export function isMetricsTrendQuery(query: TrendQuery): query is MetricsTrendQuery {
  return 'metricName' in query && 'aggregation' in query;
}

/**
 * Type guard to check if a query is a logs query
 */
export function isLogsTrendQuery(query: TrendQuery): query is LogsTrendQuery {
  return 'searchQuery' in query;
}

/**
 * Type guard to check if a config is for metrics data source
 */
export function isMetricsDataSourceConfig(config: DataSourceConfig): config is MetricsDataSourceConfig {
  return config.type === DataSourceType.METRICS;
}

/**
 * Type guard to check if a config is for logs data source
 */
export function isLogsDataSourceConfig(config: DataSourceConfig): config is LogsDataSourceConfig {
  return config.type === DataSourceType.LOGS;
}