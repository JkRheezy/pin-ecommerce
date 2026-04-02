/**
 * Trend Data Source Types
 * 
 * This module defines the type system for trend data sources in the picker agent.
 * Follows the six-layer architecture: Types → Config → Repo → Service → Runtime → UI
 */

import { z } from 'zod';
import { Result, Option } from '@harness/result';

// ============================================================================
// Layer 1: Domain Types
// ============================================================================

/**
 * Unique identifier for a trend data source
 */
export type TrendDataSourceId = string & { readonly __brand: 'TrendDataSourceId' };

/**
 * Supported time granularities for trend data
 */
export enum TrendGranularity {
  MINUTE = 'minute',
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
}

/**
 * Supported aggregation methods for trend metrics
 */
export enum TrendAggregation {
  SUM = 'sum',
  AVG = 'avg',
  MIN = 'min',
  MAX = 'max',
  COUNT = 'count',
  P95 = 'p95',
  P99 = 'p99',
}

// ============================================================================
// Layer 2: Configuration Types
// ============================================================================

/**
 * Base configuration for all trend data sources
 */
export interface TrendDataSourceConfig {
  readonly id: TrendDataSourceId;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly cacheTtlSeconds: number;
  readonly timeoutMs: number;
  readonly retryPolicy: RetryPolicyConfig;
}

/**
 * Retry policy configuration for resilient data fetching
 */
export interface RetryPolicyConfig {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
  readonly retryableErrors: ReadonlyArray<string>;
}

/**
 * Time range configuration for trend queries
 */
export interface TimeRangeConfig {
  readonly startTime: Date;
  readonly endTime: Date;
  readonly granularity: TrendGranularity;
  readonly timezone: string;
}

/**
 * Filter configuration for trend data
 */
export interface TrendFilterConfig {
  readonly dimensions: ReadonlyArray<DimensionFilter>;
  readonly metrics: ReadonlyArray<MetricFilter>;
  readonly tags: ReadonlyArray<string>;
}

export interface DimensionFilter {
  readonly name: string;
  readonly operator: FilterOperator;
  readonly values: ReadonlyArray<string>;
}

export interface MetricFilter {
  readonly name: string;
  readonly aggregation: TrendAggregation;
  readonly alias?: string;
}

export enum FilterOperator {
  EQUALS = 'eq',
  NOT_EQUALS = 'ne',
  IN = 'in',
  NOT_IN = 'nin',
  GREATER_THAN = 'gt',
  LESS_THAN = 'lt',
  BETWEEN = 'between',
  CONTAINS = 'contains',
}

// ============================================================================
// Layer 3: Repository Types
// ============================================================================

/**
 * Raw data point as stored in the repository
 */
export interface TrendDataPoint {
  readonly timestamp: Date;
  readonly value: number;
  readonly dimensions: Record<string, string>;
  readonly metadata: Record<string, unknown>;
}

/**
 * Paginated result set for trend queries
 */
export interface TrendResultSet {
  readonly data: ReadonlyArray<TrendDataPoint>;
  readonly totalCount: number;
  readonly hasMore: boolean;
  readonly nextCursor?: string;
  readonly queryDurationMs: number;
}

/**
 * Repository query parameters
 */
export interface TrendQueryParams {
  readonly dataSourceId: TrendDataSourceId;
  readonly timeRange: TimeRangeConfig;
  readonly filters: TrendFilterConfig;
  readonly pagination: PaginationParams;
}

export interface PaginationParams {
  readonly limit: number;
  readonly cursor?: string;
}

// ============================================================================
// Layer 4: Service Types
// ============================================================================

/**
 * Validated and normalized trend data for service layer consumption
 */
export interface TrendDataSeries {
  readonly id: string;
  readonly name: string;
  readonly metric: string;
  readonly aggregation: TrendAggregation;
  readonly granularity: TrendGranularity;
  readonly points: ReadonlyArray<TrendPoint>;
  readonly statistics: TrendStatistics;
}

export interface TrendPoint {
  readonly timestamp: Date;
  readonly value: number;
  readonly formattedValue: string;
  readonly isInterpolated: boolean;
  readonly confidence: number; // 0-1 scale
}

export interface TrendStatistics {
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly sum: number;
  readonly count: number;
  readonly changePercent?: number;
  readonly trendDirection: TrendDirection;
}

export enum TrendDirection {
  UP = 'up',
  DOWN = 'down',
  FLAT = 'flat',
  VOLATILE = 'volatile',
}

/**
 * Service-level query with validation guarantees
 */
export interface ValidatedTrendQuery {
  readonly dataSourceId: TrendDataSourceId;
  readonly normalizedTimeRange: NormalizedTimeRange;
  readonly validatedFilters: ValidatedFilterSet;
  readonly executionPlan: QueryExecutionPlan;
}

export interface NormalizedTimeRange {
  readonly startTime: Date;
  readonly endTime: Date;
  readonly granularity: TrendGranularity;
  readonly bucketCount: number;
  readonly alignedToGranularity: boolean;
}

export interface ValidatedFilterSet {
  readonly dimensions: ReadonlyArray<ValidatedDimensionFilter>;
  readonly metrics: ReadonlyArray<ValidatedMetricFilter>;
}

export interface ValidatedDimensionFilter {
  readonly name: string;
  readonly operator: FilterOperator;
  readonly values: ReadonlyArray<string>;
  readonly isValid: boolean;
  readonly validationMessage?: string;
}

export interface ValidatedMetricFilter {
  readonly name: string;
  readonly aggregation: TrendAggregation;
  readonly isAvailable: boolean;
  readonly dataType: MetricDataType;
}

export enum MetricDataType {
  INTEGER = 'integer',
  FLOAT = 'float',
  PERCENTAGE = 'percentage',
  DURATION = 'duration',
  CURRENCY = 'currency',
  CUSTOM = 'custom',
}

export interface QueryExecutionPlan {
  readonly estimatedCost: QueryCost;
  readonly indexUsage: ReadonlyArray<string>;
  readonly requiresAggregation: boolean;
  readonly cacheKey: string;
}

export interface QueryCost {
  readonly readUnits: number;
  readonly scanRangeMs: number;
  readonly memoryEstimateMb: number;
}

// ============================================================================
// Layer 5: Runtime Types
// ============================================================================

/**
 * Runtime execution context for trend data operations
 */
export interface TrendExecutionContext {
  readonly requestId: string;
  readonly correlationId: string;
  readonly userId: string;
  readonly accountId: string;
  readonly orgId: string;
  readonly projectId: string;
  readonly startTime: Date;
  readonly timeoutDeadline: Date;
}

/**
 * Runtime metrics for observability
 */
export interface TrendRuntimeMetrics {
  readonly queryParsingMs: number;
  readonly validationMs: number;
  readonly dataFetchMs: number;
  readonly aggregationMs: number;
  readonly serializationMs: number;
  readonly totalDurationMs: number;
  readonly cacheHit: boolean;
  readonly rowsScanned: number;
  readonly rowsReturned: number;
}

/**
 * Runtime error types with structured information
 */
export type TrendDataError =
  | InvalidQueryError
  | DataSourceUnavailableError
  | TimeoutError
  | RateLimitError
  | DataIntegrityError;

export interface InvalidQueryError {
  readonly type: 'INVALID_QUERY';
  readonly code: string;
  readonly message: string;
  readonly field?: string;
  readonly suggestion?: string;
}

export interface DataSourceUnavailableError {
  readonly type: 'DATASOURCE_UNAVAILABLE';
  readonly dataSourceId: TrendDataSourceId;
  readonly message: string;
  readonly retryAfter?: Date;
}

export interface TimeoutError {
  readonly type: 'TIMEOUT';
  readonly operation: string;
  readonly timeoutMs: number;
  readonly partialResult?: boolean;
}

export interface RateLimitError {
  readonly type: 'RATE_LIMIT';
  readonly limit: number;
  readonly windowSeconds: number;
  readonly retryAfter: Date;
}

export interface DataIntegrityError {
  readonly type: 'DATA_INTEGRITY';
  readonly message: string;
  readonly affectedPoints: number;
  readonly recoveryStrategy: RecoveryStrategy;
}

export enum RecoveryStrategy {
  FAIL = 'fail',
  SKIP_INVALID = 'skip_invalid',
  INTERPOLATE = 'interpolate',
  USE_CACHED = 'use_cached',
}

// ============================================================================
// Layer 6: UI Types
// ============================================================================

/**
 * Presentation-ready trend data for UI consumption
 */
export interface UITrendData {
  readonly series: ReadonlyArray<UITrendSeries>;
  readonly xAxis: UIAxisConfig;
  readonly yAxis: UIAxisConfig;
  readonly annotations: ReadonlyArray<UIAnnotation>;
  readonly legend: UILegendConfig;
  readonly interactions: UIInteractionConfig;
}

export interface UITrendSeries {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly type: ChartType;
  readonly data: ReadonlyArray<UICoordinate>;
  readonly visible: boolean;
  readonly highlighted: boolean;
  readonly statistics: UISeriesStatistics;
}

export interface UICoordinate {
  readonly x: number | string; // timestamp or label
  readonly y: number;
  readonly label?: string;
  readonly tooltip?: UITooltipData;
}

export interface UITooltipData {
  readonly title: string;
  readonly value: string;
  readonly secondaryValues: ReadonlyArray<{ label: string; value: string }>;
  readonly metadata: Record<string, string>;
}

export interface UIAxisConfig {
  readonly type: 'time' | 'category' | 'linear' | 'log';
  readonly label: string;
  readonly format?: string;
  readonly min?: number;
  readonly max?: number;
  readonly tickCount?: number;
}

export interface UIAnnotation {
  readonly type: 'point' | 'range' | 'line';
  readonly timestamp?: Date;
  readonly startTime?: Date;
  readonly endTime?: Date;
  readonly label: string;
  readonly color: string;
  readonly icon?: string;
}

export interface UILegendConfig {
  readonly position: 'top' | 'bottom' | 'left' | 'right';
  readonly showValues: boolean;
  readonly interactive: boolean;
}

export interface UIInteractionConfig {
  readonly zoomEnabled: boolean;
  readonly panEnabled: boolean;
  readonly tooltipEnabled: boolean;
  readonly selectionEnabled: boolean;
  readonly onPointClick?: (point: UICoordinate) => void;
  readonly onRangeSelect?: (range: { start: Date; end: Date }) => void;
}

export interface UISeriesStatistics {
  readonly currentValue: string;
  readonly previousValue: string;
  readonly changePercent: string;
  readonly changeDirection: 'positive' | 'negative' | 'neutral';
  readonly sparklineData: ReadonlyArray<number>;
}

export enum ChartType {
  LINE = 'line',
  AREA = 'area',
  BAR = 'bar',
  SCATTER = 'scatter',
  CANDLESTICK = 'candlestick',
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

export const TrendDataSourceIdSchema = z.string().min(1).max(128).brand<'TrendDataSourceId'>();

export const TrendGranularitySchema = z.nativeEnum(TrendGranularity);

export const TrendAggregationSchema = z.nativeEnum(TrendAggregation);

export const TimeRangeConfigSchema = z.object({
  startTime: z.date(),
  endTime: z.date(),
  granularity: TrendGranularitySchema,
  timezone: z.string().default('UTC'),
}).refine(
  (data) => data.startTime < data.endTime,
  { message: 'startTime must be before endTime' }
);

export const TrendFilterConfigSchema = z.object({
  dimensions: z.array(z.object({
    name: z.string().min(1),
    operator: z.nativeEnum(FilterOperator),
    values: z.array(z.string()).min(1),
  })),
  metrics: z.array(z.object({
    name: z.string().min(1),
    aggregation: TrendAggregationSchema,
    alias: z.string().optional(),
  })).min(1),
  tags: z.array(z.string()).default([]),
});

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid TrendDataSourceId
 */
export function isTrendDataSourceId(value: unknown): value is TrendDataSourceId {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

/**
 * Type guard to check if an error is a TrendDataError
 */
export function isTrendDataError(error: unknown): error is TrendDataError {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as Record<string, unknown>;
  return (
    'type' in e &&
    typeof e.type === 'string' &&
    ['INVALID_QUERY', 'DATASOURCE_UNAVAILABLE', 'TIMEOUT', 'RATE_LIMIT', 'DATA_INTEGRITY'].includes(e.type)
  );
}

// ============================================================================
// Result Types for Error Handling
// ============================================================================

/**
 * Result type for trend data queries
 */
export type TrendQueryResult = Result<TrendDataSeries, TrendDataError>;

/**
 * Result type for UI data preparation
 */
export type UITrendResult = Result<UITrendData, TrendDataError>;

/**
 * Option type for cached trend data
 */
export type CachedTrendData = Option<TrendDataSeries>;