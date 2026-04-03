/**
 * @fileoverview Data source and scraping types for the Trends module
 * @module Types/Trends/Data
 * 
 * This file defines the core types for data sources, scraping configurations,
 * and raw data structures used in the trends analysis system.
 */

import { Result, Option } from '@/lib/types/result';
import { ValidationError } from '@/lib/types/errors';

// ============================================================================
// Domain Types
// ============================================================================

/**
 * Unique identifier for a data source
 * @pattern ^[a-z][a-z0-9-]*$
 */
export type DataSourceId = string;

/**
 * Supported data source types
 */
export enum DataSourceType {
  /** External API integration (REST, GraphQL, etc.) */
  API = 'api',
  /** Web scraping via HTTP requests */
  WEB_SCRAPE = 'web_scrape',
  /** Database query or connection */
  DATABASE = 'database',
  /** File-based data source (CSV, JSON, etc.) */
  FILE = 'file',
  /** Message queue or stream */
  STREAM = 'stream',
  /** Custom plugin/extension */
  PLUGIN = 'plugin',
}

/**
 * Data freshness requirements
 */
export enum DataFreshness {
  /** Real-time or near real-time (< 1 minute) */
  REALTIME = 'realtime',
  /** Frequent updates (1-15 minutes) */
  FREQUENT = 'frequent',
  /** Hourly updates */
  HOURLY = 'hourly',
  /** Daily updates */
  DAILY = 'daily',
  /** Weekly or longer */
  BATCH = 'batch',
}

// ============================================================================
// Data Source Configuration
// ============================================================================

/**
 * Base configuration for all data sources
 */
export interface BaseDataSourceConfig {
  /** Unique identifier for this data source */
  readonly id: DataSourceId;
  /** Human-readable name */
  readonly name: string;
  /** Type of data source */
  readonly type: DataSourceType;
  /** Data freshness requirement */
  readonly freshness: DataFreshness;
  /** Whether this source is currently active */
  readonly isActive: boolean;
  /** Maximum retry attempts for failed requests */
  readonly maxRetries: number;
  /** Timeout in milliseconds */
  readonly timeoutMs: number;
  /** Rate limit: requests per minute (undefined = no limit) */
  readonly rateLimitPerMinute?: number;
  /** Custom headers or metadata */
  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * API-specific configuration
 */
export interface ApiDataSourceConfig extends BaseDataSourceConfig {
  readonly type: DataSourceType.API;
  /** Base URL for the API */
  readonly baseUrl: string;
  /** Authentication configuration */
  readonly auth: ApiAuthConfig;
  /** Default request headers */
  readonly headers: Readonly<Record<string, string>>;
  /** API version or endpoint prefix */
  readonly version?: string;
}

/**
 * Authentication methods for API sources
 */
export type ApiAuthConfig =
  | { readonly type: 'none' }
  | { 
      readonly type: 'bearer';
      /** Token or reference to secret store key */
      readonly token: string;
    }
  | {
      readonly type: 'basic';
      readonly username: string;
      /** Password or reference to secret store key */
      readonly password: string;
    }
  | {
      readonly type: 'apiKey';
      /** Header name or query parameter */
      readonly keyName: string;
      /** Key value or reference to secret store key */
      readonly keyValue: string;
      /** Where to place the key */
      readonly in: 'header' | 'query';
    }
  | {
      readonly type: 'oauth2';
      readonly clientId: string;
      /** Client secret or reference to secret store key */
      readonly clientSecret: string;
      readonly tokenUrl: string;
      readonly scopes: readonly string[];
    };

/**
 * Web scraping configuration
 */
export interface WebScrapeConfig extends BaseDataSourceConfig {
  readonly type: DataSourceType.WEB_SCRAPE;
  /** Target URL or URL pattern */
  readonly url: string;
  /** CSS selectors for data extraction */
  readonly selectors: Readonly<Record<string, string>>;
  /** Whether to execute JavaScript (requires headless browser) */
  readonly renderJs: boolean;
  /** Request headers to send */
  readonly headers: Readonly<Record<string, string>>;
  /** Proxy configuration */
  readonly proxy?: ProxyConfig;
  /** Respect robots.txt */
  readonly respectRobotsTxt: boolean;
  /** Delay between requests in milliseconds */
  readonly requestDelayMs: number;
  /** User agent string */
  readonly userAgent?: string;
}

/**
 * Proxy configuration for web scraping
 */
export interface ProxyConfig {
  readonly host: string;
  readonly port: number;
  readonly auth?: {
    readonly username: string;
    readonly password: string;
  };
}

/**
 * Database connection configuration
 */
export interface DatabaseConfig extends BaseDataSourceConfig {
  readonly type: DataSourceType.DATABASE;
  /** Database connection string or reference */
  readonly connectionString: string;
  /** Database driver/type */
  readonly driver: 'postgresql' | 'mysql' | 'mongodb' | 'sqlite' | 'redis';
  /** Connection pool settings */
  readonly poolSize: number;
  /** SSL/TLS configuration */
  readonly ssl?: {
    readonly enabled: boolean;
    readonly caCert?: string;
    readonly rejectUnauthorized: boolean;
  };
}

/**
 * File-based data source configuration
 */
export interface FileDataSourceConfig extends BaseDataSourceConfig {
  readonly type: DataSourceType.FILE;
  /** File path or URL */
  readonly path: string;
  /** File format */
  readonly format: 'csv' | 'json' | 'jsonl' | 'parquet' | 'xml';
  /** Encoding (defaults to utf-8) */
  readonly encoding: string;
  /** For CSV: delimiter character */
  readonly delimiter?: string;
  /** For CSV: whether file has header row */
  readonly hasHeader?: boolean;
  /** For CSV: column names if no header */
  readonly columns?: readonly string[];
}

/**
 * Stream/queue data source configuration
 */
export interface StreamConfig extends BaseDataSourceConfig {
  readonly type: DataSourceType.STREAM;
  /** Stream provider */
  readonly provider: 'kafka' | 'rabbitmq' | 'sqs' | 'pubsub' | 'kinesis';
  /** Topic or queue name */
  readonly topic: string;
  /** Consumer group identifier */
  readonly consumerGroup: string;
  /** Starting position for new consumers */
  readonly startFrom: 'earliest' | 'latest';
}

/**
 * Union type of all data source configurations
 */
export type DataSourceConfig =
  | ApiDataSourceConfig
  | WebScrapeConfig
  | DatabaseConfig
  | FileDataSourceConfig
  | StreamConfig;

// ============================================================================
// Scraping Types
// ============================================================================

/**
 * Status of a scraping operation
 */
export enum ScrapeStatus {
  /** Operation is pending/queued */
  PENDING = 'pending',
  /** Currently executing */
  RUNNING = 'running',
  /** Completed successfully */
  COMPLETED = 'completed',
  /** Failed with an error */
  FAILED = 'failed',
  /** Partially completed with some errors */
  PARTIAL = 'partial',
  /** Cancelled by user or system */
  CANCELLED = 'cancelled',
}

/**
 * Request for a scraping operation
 */
export interface ScrapeRequest {
  /** Unique request identifier */
  readonly requestId: string;
  /** Target data source */
  readonly sourceId: DataSourceId;
  /** Specific query or filter parameters */
  readonly query: ScrapeQuery;
  /** Maximum records to fetch (undefined = unlimited) */
  readonly limit?: number;
  /** Timestamp when request was created */
  readonly createdAt: Date;
  /** Request priority (higher = more important) */
  readonly priority: number;
}

/**
 * Query parameters for scraping
 */
export interface ScrapeQuery {
  /** Time range filter */
  readonly timeRange?: {
    readonly from: Date;
    readonly to: Date;
  };
  /** Free-text search query */
  readonly searchTerm?: string;
  /** Category or tag filters */
  readonly categories?: readonly string[];
  /** Geographic filter */
  readonly geoFilter?: GeoFilter;
  /** Custom parameters specific to the source */
  readonly customParams: Readonly<Record<string, unknown>>;
}

/**
 * Geographic filtering options
 */
export interface GeoFilter {
  readonly countryCode?: string;
  readonly region?: string;
  readonly city?: string;
  /** Radius in kilometers from a point */
  readonly radiusKm?: {
    readonly lat: number;
    readonly lng: number;
    readonly radius: number;
  };
}

/**
 * Result of a scraping operation
 */
export interface ScrapeResult {
  readonly requestId: string;
  readonly status: ScrapeStatus;
  /** Records successfully fetched */
  readonly records: readonly RawDataRecord[];
  /** Number of records fetched */
  readonly recordCount: number;
  /** Errors encountered during scraping */
  readonly errors: readonly ScrapeError[];
  /** Metadata about the operation */
  readonly metadata: ScrapeMetadata;
  /** When the scrape started */
  readonly startedAt: Date;
  /** When the scrape completed (undefined if still running) */
  readonly completedAt?: Date;
}

/**
 * Individual error during scraping
 */
export interface ScrapeError {
  /** Error timestamp */
  readonly timestamp: Date;
  /** Error message */
  readonly message: string;
  /** Error code for categorization */
  readonly code: ScrapeErrorCode;
  /** Whether this error is retryable */
  readonly isRetryable: boolean;
  /** Context about where the error occurred */
  readonly context: Readonly<Record<string, unknown>>;
}

/**
 * Categorized error codes for scraping
 */
export enum ScrapeErrorCode {
  NETWORK_ERROR = 'network_error',
  RATE_LIMITED = 'rate_limited',
  AUTHENTICATION_FAILED = 'authentication_failed',
  PARSING_ERROR = 'parsing_error',
  TIMEOUT = 'timeout',
  NOT_FOUND = 'not_found',
  SERVER_ERROR = 'server_error',
  VALIDATION_ERROR = 'validation_error',
  UNKNOWN = 'unknown',
}

/**
 * Metadata about a scraping operation
 */
export interface ScrapeMetadata {
  /** Data source that was scraped */
  readonly sourceId: DataSourceId;
  /** Total requests made (including retries) */
  readonly totalRequests: number;
  /** Bytes transferred */
  readonly bytesTransferred: number;
  /** Time spent waiting for rate limits */
  readonly rateLimitDelayMs: number;
  /** Whether result was served from cache */
  readonly fromCache: boolean;
  /** Cache hit ratio if applicable */
  readonly cacheHitRatio?: number;
}

// ============================================================================
// Raw Data Types
// ============================================================================

/**
 * A single raw data record from any source
 */
export interface RawDataRecord {
  /** Unique identifier for this record */
  readonly id: string;
  /** Source that produced this record */
  readonly sourceId: DataSourceId;
  /** When this record was scraped */
  readonly scrapedAt: Date;
  /** When this record was originally published/created (if available) */
  readonly originalTimestamp?: Date;
  /** Raw data payload - structure varies by source */
  readonly payload: unknown;
  /** Content type of the payload */
  readonly contentType: string;
  /** URL or location where this data was found */
  readonly sourceUrl?: string;
  /** Hash of the payload for deduplication */
  readonly contentHash: string;
  /** Processing metadata */
  readonly processing: ProcessingMetadata;
}

/**
 * Metadata about record processing
 */
export interface ProcessingMetadata {
  /** Schema version for this record type */
  readonly schemaVersion: string;
  /** Whether the record passed validation */
  readonly isValid: boolean;
  /** Validation errors if any */
  readonly validationErrors: readonly ValidationError[];
  /** Transformations applied to this record */
  readonly transformations: readonly string[];
  /** Tags added during processing */
  readonly tags: readonly string[];
}

/**
 * Collection of raw data records with pagination info
 */
export interface RawDataCollection {
  readonly records: readonly RawDataRecord[];
  readonly totalCount: number;
  readonly hasMore: boolean;
  /** Cursor for fetching next page */
  readonly nextCursor?: string;
  /** Query that produced this collection */
  readonly query: ScrapeQuery;
}

// ============================================================================
// Validation and Type Guards
// ============================================================================

/**
 * Validates that a string is a valid DataSourceId
 */
export function isValidDataSourceId(id: unknown): id is DataSourceId {
  if (typeof id !== 'string') return false;
  return /^[a-z][a-z0-9-]*$/.test(id);
}

/**
 * Type guard for API data source config
 */
export function isApiConfig(config: DataSourceConfig): config is ApiDataSourceConfig {
  return config.type === DataSourceType.API;
}

/**
 * Type guard for web scrape config
 */
export function isWebScrapeConfig(config: DataSourceConfig): config is WebScrapeConfig {
  return config.type === DataSourceType.WEB_SCRAPE;
}

/**
 * Validates a scrape request
 */
export function validateScrapeRequest(request: unknown): Result<ScrapeRequest, ValidationError[]> {
  const errors: ValidationError[] = [];

  if (!request || typeof request !== 'object') {
    return { success: false, error: [{ field: 'root', message: 'Request must be an object' }] };
  }

  const req = request as Record<string, unknown>;

  // Validate required fields
  if (!req.requestId || typeof req.requestId !== 'string') {
    errors.push({ field: 'requestId', message: 'requestId is required and must be a string' });
  }

  if (!req.sourceId || !isValidDataSourceId(req.sourceId)) {
    errors.push({ field: 'sourceId', message: 'sourceId must be a valid data source identifier' });
  }

  if (!req.query || typeof req.query !== 'object') {
    errors.push({ field: 'query', message: 'query is required and must be an object' });
  }

  if (!(req.createdAt instanceof Date)) {
    errors.push({ field: 'createdAt', message: 'createdAt must be a Date instance' });
  }

  if (typeof req.priority !== 'number' || req.priority < 0) {
    errors.push({ field: 'priority', message: 'priority must be a non-negative number' });
  }

  if (errors.length > 0) {
    return { success: false, error: errors };
  }

  return { success: true, value: request as ScrapeRequest };
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a default processing metadata object
 */
export function createProcessingMetadata(
  overrides?: Partial<ProcessingMetadata>
): ProcessingMetadata {
  return {
    schemaVersion: '1.0.0',
    isValid: true,
    validationErrors: [],
    transformations: [],
    tags: [],
    ...overrides,
  };
}

/**
 * Creates an empty scrape result for a request
 */
export function createEmptyScrapeResult(requestId: string, sourceId: DataSourceId): ScrapeResult {
  const now = new Date();
  return {
    requestId,
    status: ScrapeStatus.PENDING,
    records: [],
    recordCount: 0,
    errors: [],
    metadata: {
      sourceId,
      totalRequests: 0,
      bytesTransferred: 0,
      rateLimitDelayMs: 0,
      fromCache: false,
    },
    startedAt: now,
  };
}

// ============================================================================
// Constants
// ============================================================================

/** Default timeout for data source operations (30 seconds) */
export const DEFAULT_TIMEOUT_MS = 30000;

/** Default maximum retry attempts */
export const DEFAULT_MAX_RETRIES = 3;

/** Default request delay for web scraping (1 second) */
export const DEFAULT_SCRAPE_DELAY_MS = 1000;

/** Maximum records per scrape request */
export const MAX_SCRAPE_RECORDS = 10000;

/** Valid data source ID pattern */
export const DATASOURCE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;