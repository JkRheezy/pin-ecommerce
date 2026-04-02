/**
 * Types layer for AI trend data sources
 * 
 * This module defines the core type contracts for trend analysis data sources,
 * following the six-layer architecture pattern.
 */

import type { Result } from '$lib/utils/result';
import type { TimeRange } from './common';

// ============================================================================
// Domain Types
// ============================================================================

/**
 * Represents a single data point in a trend series
 */
export interface TrendDataPoint {
	/** Timestamp for this data point */
	timestamp: Date;
	/** Numeric value at this point in time */
	value: number;
	/** Optional metadata for this data point */
	metadata?: Record<string, unknown>;
}

/**
 * Represents a named series of trend data points
 */
export interface TrendSeries {
	/** Unique identifier for this series */
	id: string;
	/** Human-readable name for the series */
	name: string;
	/** Data points in chronological order */
	points: TrendDataPoint[];
	/** Optional unit of measurement (e.g., "ms", "%", "count") */
	unit?: string;
	/** Optional color for visualization */
	color?: string;
}

/**
 * Aggregated trend statistics for a series
 */
export interface TrendStatistics {
	/** Minimum value in the series */
	min: number;
	/** Maximum value in the series */
	max: number;
	/** Arithmetic mean of all values */
	mean: number;
	/** Median value */
	median: number;
	/** Standard deviation */
	stdDev: number;
	/** Total number of data points */
	count: number;
	/** Sum of all values */
	sum: number;
	/** Rate of change (slope of linear regression) */
	trendSlope: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for a trend data source
 */
export interface TrendDataSourceConfig {
	/** Unique identifier for this data source configuration */
	id: string;
	/** Data source type discriminator */
	type: string;
	/** Display name for this data source */
	displayName: string;
	/** Time range for data queries */
	timeRange: TimeRange;
	/** Maximum number of data points to return */
	maxDataPoints?: number;
	/** Resolution/aggregation interval (e.g., "1m", "1h", "1d") */
	resolution?: string;
	/** Source-specific configuration parameters */
	parameters: Record<string, unknown>;
}

/**
 * Supported trend data source types
 */
export enum TrendDataSourceType {
	METRICS = 'metrics',
	LOGS = 'logs',
	TRACES = 'traces',
	EVENTS = 'events',
	CUSTOM = 'custom'
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes specific to trend data source operations
 */
export enum TrendDataSourceErrorCode {
	/** Invalid configuration provided */
	INVALID_CONFIG = 'INVALID_CONFIG',
	/** Data source connection failed */
	CONNECTION_FAILED = 'CONNECTION_FAILED',
	/** Query execution failed */
	QUERY_FAILED = 'QUERY_FAILED',
	/** Requested time range is invalid or unsupported */
	INVALID_TIME_RANGE = 'INVALID_TIME_RANGE',
	/** Data source returned malformed data */
	MALFORMED_RESPONSE = 'MALFORMED_RESPONSE',
	/** Rate limit exceeded */
	RATE_LIMITED = 'RATE_LIMITED',
	/** Authentication or authorization failed */
	UNAUTHORIZED = 'UNAUTHORIZED',
	/** Data source temporarily unavailable */
	SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
	/** Unknown or unexpected error */
	UNKNOWN = 'UNKNOWN'
}

/**
 * Structured error information for trend data source failures
 */
export interface TrendDataSourceError {
	/** Error code for programmatic handling */
	code: TrendDataSourceErrorCode;
	/** Human-readable error message */
	message: string;
	/** Original error that caused this failure, if any */
	cause?: Error;
	/** Additional context for debugging */
	context?: Record<string, unknown>;
}

// ============================================================================
// Repository Interface (Layer 3)
// ============================================================================

/**
 * Result type for trend data source operations
 */
export type TrendDataSourceResult<T> = Result<T, TrendDataSourceError>;

/**
 * Repository interface for trend data sources
 * 
 * This interface defines the contract for fetching trend data from
 * various backend sources. Implementations should handle connection
 * management, query execution, and error translation.
 */
export interface ITrendDataSourceRepository {
	/**
	 * Test connectivity to the data source
	 * @param config - Data source configuration
	 * @returns Success if connection is valid, error otherwise
	 */
	testConnection(config: TrendDataSourceConfig): Promise<TrendDataSourceResult<void>>;

	/**
	 * Fetch trend series data from the source
	 * @param config - Data source configuration
	 * @param seriesIds - Identifiers of series to fetch
	 * @returns Array of trend series or error
	 */
	fetchSeries(
		config: TrendDataSourceConfig,
		seriesIds: string[]
	): Promise<TrendDataSourceResult<TrendSeries[]>>;

	/**
	 * Fetch aggregated statistics for specified series
	 * @param config - Data source configuration
	 * @param seriesId - Series identifier
	 * @returns Statistics or error
	 */
	fetchStatistics(
		config: TrendDataSourceConfig,
		seriesId: string
	): Promise<TrendDataSourceResult<TrendStatistics>>;

	/**
	 * List available series from this data source
	 * @param config - Data source configuration
	 * @returns Array of available series metadata or error
	 */
	listAvailableSeries(
		config: TrendDataSourceConfig
	): Promise<TrendDataSourceResult<Array<{ id: string; name: string; unit?: string }>>>;
}

// ============================================================================
// Service Interface (Layer 4)
// ============================================================================

/**
 * Options for trend data queries
 */
export interface TrendQueryOptions {
	/** Time range for the query */
	timeRange: TimeRange;
	/** Series identifiers to include */
	seriesIds: string[];
	/** Desired resolution/aggregation */
	resolution?: string;
	/** Maximum data points per series */
	maxDataPoints?: number;
	/** Include statistics in response */
	includeStatistics?: boolean;
}

/**
 * Combined response containing series data and optional statistics
 */
export interface TrendQueryResponse {
	/** Fetched series data */
	series: TrendSeries[];
	/** Statistics for each series, if requested */
	statistics?: Record<string, TrendStatistics>;
	/** Query execution metadata */
	meta: {
		/** Time when query was executed */
		executedAt: Date;
		/** Duration of query execution in milliseconds */
		durationMs: number;
		/** Whether data was served from cache */
		cached: boolean;
	};
}

/**
 * Service interface for trend analysis operations
 * 
 * The service layer orchestrates data fetching from repositories,
 * handles caching, and provides business logic for trend analysis.
 */
export interface ITrendAnalysisService {
	/**
	 * Query trend data from configured sources
	 * @param dataSourceId - Identifier of the data source to query
	 * @param options - Query options
	 * @returns Trend data response or error
	 */
	queryTrends(
		dataSourceId: string,
		options: TrendQueryOptions
	): Promise<TrendDataSourceResult<TrendQueryResponse>>;

	/**
	 * Compare trends across multiple time periods
	 * @param dataSourceId - Identifier of the data source
	 * @param seriesId - Series to compare
	 * @param currentRange - Current time period
	 * @param previousRange - Previous time period for comparison
	 * @returns Comparison result or error
	 */
	compareTrends(
		dataSourceId: string,
		seriesId: string,
		currentRange: TimeRange,
		previousRange: TimeRange
	): Promise<TrendDataSourceResult<TrendComparisonResult>>;

	/**
	 * Detect anomalies in trend data
	 * @param dataSourceId - Identifier of the data source
	 * @param seriesId - Series to analyze
	 * @param timeRange - Time range to analyze
	 * @returns Detected anomalies or error
	 */
	detectAnomalies(
		dataSourceId: string,
		seriesId: string,
		timeRange: TimeRange
	): Promise<TrendDataSourceResult<AnomalyDetectionResult>>;
}

/**
 * Result of a trend comparison operation
 */
export interface TrendComparisonResult {
	/** Series data for current period */
	current: TrendSeries;
	/** Series data for previous period */
	previous: TrendSeries;
	/** Percentage change in mean value */
	meanChangePercent: number;
	/** Percentage change in total value */
	totalChangePercent: number;
	/** Whether the trend is improving (direction depends on metric) */
	isImproving: boolean;
}

/**
 * Result of anomaly detection on trend data
 */
export interface AnomalyDetectionResult {
	/** Series that was analyzed */
	series: TrendSeries;
	/** Detected anomalies */
	anomalies: Array<{
		/** Timestamp where anomaly was detected */
		timestamp: Date;
		/** Expected value based on trend */
		expectedValue: number;
		/** Actual observed value */
		actualValue: number;
		/** Deviation magnitude (standard deviations from expected) */
		deviation: number;
		/** Severity classification */
		severity: 'low' | 'medium' | 'high' | 'critical';
	}>;
	/** Overall health score (0-100, higher is better) */
	healthScore: number;
}

// ============================================================================
// Runtime Types (Layer 5)
// ============================================================================

/**
 * Cache configuration for trend data
 */
export interface TrendCacheConfig {
	/** Time-to-live in milliseconds */
	ttlMs: number;
	/** Maximum number of entries to cache */
	maxEntries: number;
	/** Whether to cache errors temporarily */
	cacheErrors: boolean;
}

/**
 * Runtime configuration for trend data sources
 */
export interface TrendRuntimeConfig {
	/** Default cache configuration */
	defaultCache: TrendCacheConfig;
	/** Request timeout in milliseconds */
	requestTimeoutMs: number;
	/** Maximum retry attempts for failed requests */
	maxRetries: number;
	/** Retry delay in milliseconds (exponential backoff) */
	retryDelayMs: number;
	/** Whether to enable request deduplication */
	enableDeduplication: boolean;
}

// ============================================================================
// UI Types (Layer 6)
// ============================================================================

/**
 * View model for trend visualization components
 */
export interface TrendViewModel {
	/** Unique identifier for this view */
	id: string;
	/** Display title */
	title: string;
	/** Series to display */
	series: TrendSeries[];
	/** Optional statistics to display */
	statistics?: Record<string, TrendStatistics>;
	/** Chart type preference */
	chartType: 'line' | 'area' | 'bar' | 'scatter';
	/** Y-axis configuration */
	yAxisConfig?: {
		min?: number;
		max?: number;
		label?: string;
	};
	/** Whether to show legend */
	showLegend: boolean;
	/** Loading state */
	isLoading: boolean;
	/** Error state, if any */
	error?: TrendDataSourceError;
}

/**
 * Props for trend chart components
 */
export interface TrendChartProps {
	/** View model data */
	viewModel: TrendViewModel;
	/** Callback when a data point is clicked */
	onPointClick?: (point: TrendDataPoint, series: TrendSeries) => void;
	/** Callback when time range is changed by user interaction */
	onTimeRangeChange?: (newRange: TimeRange) => void;
	/** Height of the chart in pixels */
	height?: number;
	/** Whether the chart is interactive */
	interactive?: boolean;
}