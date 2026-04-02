/**
 * Trends API Types - Layer 1: Types
 * 
 * This module defines all request/response types for the Trends API.
 * Following the six-layer architecture, these types are pure data structures
 * with no business logic.
 */

import { z } from 'zod';
import { TrendDirection, TrendSeverity, TrendGranularity } from './core';

// ============================================================================
// Request Types
// ============================================================================

/**
 * Base pagination parameters for trend list requests
 */
export interface TrendListRequest {
  /** Maximum number of results to return (default: 20, max: 100) */
  limit?: number;
  
  /** Offset for pagination (default: 0) */
  offset?: number;
  
  /** Filter by specific metric identifiers */
  metricIds?: string[];
  
  /** Filter by trend direction */
  direction?: TrendDirection;
  
  /** Filter by minimum severity level */
  minSeverity?: TrendSeverity;
  
  /** Time range start (ISO 8601 timestamp) */
  startTime?: string;
  
  /** Time range end (ISO 8601 timestamp) */
  endTime?: string;
  
  /** Data granularity for aggregation */
  granularity?: TrendGranularity;
}

/**
 * Request to create a new trend analysis
 */
export interface CreateTrendRequest {
  /** Human-readable name for the trend */
  name: string;
  
  /** Description of what this trend tracks */
  description?: string;
  
  /** Metric identifier to analyze */
  metricId: string;
  
  /** Analysis configuration */
  config: {
    /** Detection algorithm to use */
    algorithm: 'linear_regression' | 'moving_average' | 'anomaly_detection';
    
    /** Sensitivity threshold (0.0 - 1.0) */
    sensitivity: number;
    
    /** Minimum data points required for analysis */
    minDataPoints: number;
    
    /** Lookback window in hours */
    lookbackHours: number;
  };
  
  /** Alert configuration */
  alerts?: {
    /** Enable alerts for this trend */
    enabled: boolean;
    
    /** Severity levels that trigger alerts */
    triggerOn: TrendSeverity[];
    
    /** Notification channel IDs */
    channelIds: string[];
  };
}

/**
 * Request to update an existing trend
 */
export interface UpdateTrendRequest {
  /** Updated name (optional) */
  name?: string;
  
  /** Updated description (optional) */
  description?: string;
  
  /** Updated configuration (partial update) */
  config?: Partial<CreateTrendRequest['config']>;
  
  /** Updated alert configuration (optional) */
  alerts?: CreateTrendRequest['alerts'];
}

/**
 * Request to query trend data points
 */
export interface TrendDataRequest {
  /** Trend identifier */
  trendId: string;
  
  /** Start of time range (ISO 8601) */
  startTime: string;
  
  /** End of time range (ISO 8601) */
  endTime: string;
  
  /** Data granularity */
  granularity: TrendGranularity;
  
  /** Include forecasted values */
  includeForecast?: boolean;
  
  /** Forecast horizon in data points */
  forecastHorizon?: number;
}

/**
 * Request to compare multiple trends
 */
export interface TrendComparisonRequest {
  /** Trend identifiers to compare */
  trendIds: string[];
  
  /** Normalization method for comparison */
  normalization: 'none' | 'percent_change' | 'z_score' | 'min_max';
  
  /** Time range for comparison */
  timeRange: {
    start: string;
    end: string;
  };
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  /** Response data payload */
  data: T;
  
  /** Response metadata */
  meta: {
    /** API version */
    version: string;
    
    /** Request ID for tracing */
    requestId: string;
    
    /** Response timestamp */
    timestamp: string;
  };
}

/**
 * Paginated list response metadata
 */
export interface PaginationMeta {
  /** Total number of items available */
  total: number;
  
  /** Number of items in current page */
  count: number;
  
  /** Current offset */
  offset: number;
  
  /** Current limit */
  limit: number;
  
  /** Whether more items are available */
  hasMore: boolean;
}

/**
 * Paginated API response
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: ApiResponse<T[]>['meta'] & PaginationMeta;
}

/**
 * Single trend item in list responses
 */
export interface TrendListItem {
  /** Unique identifier */
  id: string;
  
  /** Display name */
  name: string;
  
  /** Current direction */
  direction: TrendDirection;
  
  /** Current severity level */
  severity: TrendSeverity;
  
  /** Last updated timestamp */
  lastUpdated: string;
  
  /** Whether trend is currently active */
  isActive: boolean;
  
  /** Current value (if available) */
  currentValue?: number;
  
  /** Percentage change from baseline */
  changePercent?: number;
}

/**
 * Detailed trend information
 */
export interface TrendDetailResponse {
  /** Unique identifier */
  id: string;
  
  /** Display name */
  name: string;
  
  /** Description */
  description: string;
  
  /** Associated metric */
  metric: {
    id: string;
    name: string;
    unit: string;
  };
  
  /** Current status */
  status: {
    direction: TrendDirection;
    severity: TrendSeverity;
    confidence: number; // 0.0 - 1.0
    lastCalculated: string;
  };
  
  /** Configuration */
  config: CreateTrendRequest['config'];
  
  /** Alert settings */
  alerts: CreateTrendRequest['alerts'];
  
  /** Created timestamp */
  createdAt: string;
  
  /** Last modified timestamp */
  updatedAt: string;
  
  /** Created by user ID */
  createdBy: string;
}

/**
 * Single data point in trend time series
 */
export interface TrendDataPoint {
  /** Timestamp for this data point */
  timestamp: string;
  
  /** Observed value */
  value: number;
  
  /** Whether this is a forecasted value */
  isForecast: boolean;
  
  /** Confidence interval for forecasts */
  confidenceInterval?: {
    lower: number;
    upper: number;
  };
  
  /** Anomaly score if detected */
  anomalyScore?: number;
  
  /** Associated metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Trend data response with time series
 */
export interface TrendDataResponse {
  /** Trend identifier */
  trendId: string;
  
  /** Time series data points */
  dataPoints: TrendDataPoint[];
  
  /** Summary statistics */
  statistics: {
    count: number;
    mean: number;
    stdDev: number;
    min: number;
    max: number;
    trendSlope: number;
  };
  
  /** Detected change points */
  changePoints: Array<{
    timestamp: string;
    description: string;
    significance: number;
  }>;
}

/**
 * Trend comparison result
 */
export interface TrendComparisonResponse {
  /** Normalized time series for each trend */
  series: Array<{
    trendId: string;
    trendName: string;
    color: string;
    dataPoints: Array<{
      timestamp: string;
      normalizedValue: number;
      originalValue: number;
    }>;
  }>;
  
  /** Correlation matrix between trends */
  correlations: Array<{
    trendIdA: string;
    trendIdB: string;
    correlationCoefficient: number; // -1.0 to 1.0
    lagHours?: number;
  }>;
  
  /** Comparative statistics */
  statistics: {
    timeRange: { start: string; end: string };
    normalizationMethod: string;
  };
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Standard API error structure
 */
export interface ApiError {
  /** Error code for programmatic handling */
  code: string;
  
  /** Human-readable error message */
  message: string;
  
  /** Additional error details */
  details?: Record<string, unknown>;
  
  /** Field-level validation errors */
  fieldErrors?: Array<{
    field: string;
    message: string;
    code: string;
  }>;
}

/**
 * API error response
 */
export interface ApiErrorResponse {
  /** Error information */
  error: ApiError;
  
  /** Response metadata */
  meta: {
    version: string;
    requestId: string;
    timestamp: string;
  };
}

// ============================================================================
// Validation Schemas (for runtime validation)
// ============================================================================

export const TrendListRequestSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  metricIds: z.array(z.string().min(1)).optional(),
  direction: z.nativeEnum(TrendDirection).optional(),
  minSeverity: z.nativeEnum(TrendSeverity).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  granularity: z.nativeEnum(TrendGranularity).optional(),
}).refine(
  (data) => {
    // Validate that endTime is after startTime if both provided
    if (data.startTime && data.endTime) {
      return new Date(data.endTime) > new Date(data.startTime);
    }
    return true;
  },
  { message: 'endTime must be after startTime', path: ['endTime'] }
);

export const CreateTrendRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  metricId: z.string().min(1),
  config: z.object({
    algorithm: z.enum(['linear_regression', 'moving_average', 'anomaly_detection']),
    sensitivity: z.number().min(0).max(1),
    minDataPoints: z.number().int().min(2),
    lookbackHours: z.number().int().min(1).max(8760), // Max 1 year
  }),
  alerts: z.object({
    enabled: z.boolean(),
    triggerOn: z.array(z.nativeEnum(TrendSeverity)).min(1),
    channelIds: z.array(z.string().min(1)).min(1),
  }).optional(),
});

export const TrendDataRequestSchema = z.object({
  trendId: z.string().min(1),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  granularity: z.nativeEnum(TrendGranularity),
  includeForecast: z.boolean().optional(),
  forecastHorizon: z.number().int().min(1).max(100).optional(),
}).refine(
  (data) => new Date(data.endTime) > new Date(data.startTime),
  { message: 'endTime must be after startTime', path: ['endTime'] }
);

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if response is an error
 */
export function isApiErrorResponse(response: unknown): response is ApiErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    typeof (response as ApiErrorResponse).error === 'object' &&
    'code' in (response as ApiErrorResponse).error
  );
}

/**
 * Type guard to check if response is paginated
 */
export function isPaginatedResponse<T>(response: ApiResponse<T[]>): response is PaginatedResponse<T> {
  return (
    'total' in response.meta &&
    'hasMore' in response.meta
  );
}