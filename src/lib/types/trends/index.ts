/**
 * Trends Types Barrel Export
 *
 * Central export point for all trend-related type definitions.
 * Follows the six-layer architecture: Types layer
 */

// Core trend data structures
export type {
  Trend,
  TrendId,
  TrendMetadata,
  TrendStatus,
  TrendSeverity,
  TrendDirection,
  TrendDataPoint,
  TrendSeries,
} from './trend';

// Trend analysis and configuration types
export type {
  TrendAnalysisConfig,
  TrendThreshold,
  TrendWindow,
  TrendAggregation,
  TrendFilter,
  TrendSort,
  TrendPagination,
} from './trend-config';

// Trend API request/response types
export type {
  GetTrendsRequest,
  GetTrendsResponse,
  GetTrendByIdRequest,
  GetTrendByIdResponse,
  CreateTrendRequest,
  CreateTrendResponse,
  UpdateTrendRequest,
  UpdateTrendResponse,
  DeleteTrendRequest,
  DeleteTrendResponse,
  TrendAnalyticsRequest,
  TrendAnalyticsResponse,
} from './trend-api';

// Trend error types
export {
  TrendError,
  TrendNotFoundError,
  TrendValidationError,
  TrendAnalysisError,
  isTrendError,
  createTrendError,
} from './trend-errors';

// Trend utility types
export type {
  TrendKey,
  TrendValue,
  TrendMap,
  TrendComparator,
  TrendFormatter,
  TrendValidator,
  TrendNormalizer,
} from './trend-utils';

// Re-export constants
export {
  TREND_STATUS_VALUES,
  TREND_SEVERITY_VALUES,
  TREND_DIRECTION_VALUES,
  TREND_DEFAULT_WINDOW,
  TREND_MAX_DATA_POINTS,
  TREND_MIN_DATA_POINTS,
} from './trend-constants';

// Re-export type guards
export {
  isTrend,
  isTrendId,
  isTrendStatus,
  isTrendSeverity,
  isTrendDirection,
  isTrendDataPoint,
  isTrendSeries,
  isValidTrendWindow,
  isValidTrendThreshold,
} from './trend-guards';