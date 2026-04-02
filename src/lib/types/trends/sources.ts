/**
 * @fileoverview Data source related types for the Trends module
 * @module lib/types/trends/sources
 * 
 * This file defines the core type definitions for trend data sources,
 * following the six-layer architecture (Types → Config → Repo → Service → Runtime → UI).
 */

import { z } from 'zod';
import { Result, ok, err } from 'neverthrow';

// =============================================================================
// Domain Types (Layer 1: Types)
// =============================================================================

/**
 * Unique identifier for a data source
 * @example "github-prs", "jira-issues", "sonar-coverage"
 */
export type DataSourceId = string & { readonly __brand: unique symbol };

/**
 * Branding function for DataSourceId to ensure type safety
 */
export function createDataSourceId(id: string): Result<DataSourceId, DataSourceValidationError> {
  if (!id || id.trim().length === 0) {
    return err(new DataSourceValidationError('DataSourceId cannot be empty'));
  }
  
  if (!/^[a-z0-9-]+$/.test(id)) {
    return err(new DataSourceValidationError(
      'DataSourceId must contain only lowercase letters, numbers, and hyphens'
    ));
  }
  
  return ok(id as DataSourceId);
}

/**
 * Supported data source categories
 */
export enum DataSourceCategory {
  /** Version control and code repository data */
  VERSION_CONTROL = 'VERSION_CONTROL',
  /** Issue tracking and project management */
  ISSUE_TRACKING = 'ISSUE_TRACKING',
  /** Continuous integration and deployment metrics */
  CI_CD = 'CI_CD',
  /** Code quality and security scanning */
  QUALITY = 'QUALITY',
  /** Infrastructure and deployment data */
  INFRASTRUCTURE = 'INFRASTRUCTURE',
  /** Custom or third-party integrations */
  CUSTOM = 'CUSTOM',
}

/**
 * Authentication methods supported by data sources
 */
export enum AuthMethod {
  /** No authentication required */
  NONE = 'NONE',
  /** API key based authentication */
  API_KEY = 'API_KEY',
  /** OAuth 2.0 flow */
  OAUTH2 = 'OAUTH2',
  /** Personal access token */
  PAT = 'PAT',
  /** Certificate-based authentication */
  CERTIFICATE = 'CERTIFICATE',
  /** Basic username/password */
  BASIC = 'BASIC',
}

/**
 * Connection status of a data source
 */
export enum ConnectionStatus {
  /** Connection not yet established */
  PENDING = 'PENDING',
  /** Successfully connected and operational */
  CONNECTED = 'CONNECTED',
  /** Connection failed or broken */
  FAILED = 'FAILED',
  /** Connection is being established */
  CONNECTING = 'CONNECTING',
  /** Connection temporarily disabled */
  DISABLED = 'DISABLED',
}

// =============================================================================
// Core Data Structures
// =============================================================================

/**
 * Configuration for data source authentication
 */
export interface AuthConfig {
  /** Authentication method to use */
  method: AuthMethod;
  /** Encrypted credentials reference (never store plain text) */
  credentialsRef: string;
  /** Optional: Token expiry timestamp for OAuth flows */
  expiresAt?: Date;
  /** Optional: Required scopes/permissions */
  scopes?: string[];
}

/**
 * Rate limiting configuration for data source API calls
 */
export interface RateLimitConfig {
  /** Maximum requests per time window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Current remaining quota (runtime value) */
  remaining?: number;
  /** Reset timestamp (runtime value) */
  resetAt?: Date;
}

/**
 * Schema definition for data source fields
 * Used for validation and UI generation
 */
export interface FieldSchema {
  /** Field identifier */
  name: string;
  /** Human-readable label */
  label: string;
  /** Data type of the field */
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  /** Whether the field is required */
  required: boolean;
  /** Optional description for documentation */
  description?: string;
  /** Default value if not provided */
  defaultValue?: unknown;
  /** Validation constraints */
  constraints?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: unknown[];
  };
}

/**
 * Core data source definition
 */
export interface DataSource {
  /** Unique identifier */
  id: DataSourceId;
  /** Display name */
  name: string;
  /** Detailed description */
  description: string;
  /** Category classification */
  category: DataSourceCategory;
  /** Authentication configuration */
  auth: AuthConfig;
  /** API endpoint base URL */
  baseUrl: string;
  /** Rate limiting settings */
  rateLimit: RateLimitConfig;
  /** Available fields/schemas for this data source */
  schemas: FieldSchema[];
  /** Whether the data source is active */
  isActive: boolean;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Version for optimistic locking */
  version: number;
}

/**
 * Data source with runtime connection information
 */
export interface DataSourceRuntime extends DataSource {
  /** Current connection status */
  connectionStatus: ConnectionStatus;
  /** Last successful connection timestamp */
  lastConnectedAt?: Date;
  /** Last error message if connection failed */
  lastError?: string;
  /** Health check score (0-100) */
  healthScore: number;
  /** Cached metadata from last fetch */
  cachedMetadata?: Record<string, unknown>;
}

// =============================================================================
// Input/Output Types for Service Layer
// =============================================================================

/**
 * Input for creating a new data source
 */
export interface CreateDataSourceInput {
  name: string;
  description: string;
  category: DataSourceCategory;
  auth: Omit<AuthConfig, 'credentialsRef'> & { credentials: string };
  baseUrl: string;
  rateLimit: Omit<RateLimitConfig, 'remaining' | 'resetAt'>;
  schemas?: FieldSchema[];
}

/**
 * Input for updating an existing data source
 */
export interface UpdateDataSourceInput {
  name?: string;
  description?: string;
  category?: DataSourceCategory;
  auth?: Partial<Omit<AuthConfig, 'credentialsRef'>> & { credentials?: string };
  baseUrl?: string;
  rateLimit?: Partial<Omit<RateLimitConfig, 'remaining' | 'resetAt'>>;
  schemas?: FieldSchema[];
  isActive?: boolean;
}

/**
 * Query parameters for listing data sources
 */
export interface DataSourceListQuery {
  /** Filter by category */
  category?: DataSourceCategory;
  /** Filter by connection status */
  status?: ConnectionStatus;
  /** Search by name or description */
  search?: string;
  /** Include inactive sources */
  includeInactive?: boolean;
  /** Pagination: page number (1-based) */
  page?: number;
  /** Pagination: items per page */
  limit?: number;
  /** Sort field */
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'category';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated result for data source queries
 */
export interface DataSourceListResult {
  /** Data sources matching the query */
  items: DataSourceRuntime[];
  /** Total count without pagination */
  total: number;
  /** Current page number */
  page: number;
  /** Items per page */
  limit: number;
  /** Total number of pages */
  totalPages: number;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Base error class for data source operations
 */
export class DataSourceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'DataSourceError';
    Object.setPrototypeOf(this, DataSourceError.prototype);
  }
}

/**
 * Validation error for data source inputs
 */
export class DataSourceValidationError extends DataSourceError {
  constructor(message: string) {
    super(message, 'DATA_SOURCE_VALIDATION_ERROR', false);
    this.name = 'DataSourceValidationError';
    Object.setPrototypeOf(this, DataSourceValidationError.prototype);
  }
}

/**
 * Connection error for data source operations
 */
export class DataSourceConnectionError extends DataSourceError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly responseBody?: unknown
  ) {
    super(message, 'DATA_SOURCE_CONNECTION_ERROR', true);
    this.name = 'DataSourceConnectionError';
    Object.setPrototypeOf(this, DataSourceConnectionError.prototype);
  }
}

/**
 * Not found error when data source doesn't exist
 */
export class DataSourceNotFoundError extends DataSourceError {
  constructor(dataSourceId: DataSourceId) {
    super(
      `Data source with id '${dataSourceId}' not found`,
      'DATA_SOURCE_NOT_FOUND',
      false
    );
    this.name = 'DataSourceNotFoundError';
    Object.setPrototypeOf(this, DataSourceNotFoundError.prototype);
  }
}

/**
 * Conflict error for duplicate data sources
 */
export class DataSourceConflictError extends DataSourceError {
  constructor(dataSourceId: DataSourceId) {
    super(
      `Data source with id '${dataSourceId}' already exists`,
      'DATA_SOURCE_CONFLICT',
      false
    );
    this.name = 'DataSourceConflictError';
    Object.setPrototypeOf(this, DataSourceConflictError.prototype);
  }
}

// =============================================================================
// Zod Schemas for Runtime Validation
// =============================================================================

/**
 * Zod schema for AuthConfig validation
 */
export const AuthConfigSchema = z.object({
  method: z.nativeEnum(AuthMethod),
  credentialsRef: z.string().min(1),
  expiresAt: z.date().optional(),
  scopes: z.array(z.string()).optional(),
});

/**
 * Zod schema for RateLimitConfig validation
 */
export const RateLimitConfigSchema = z.object({
  maxRequests: z.number().int().positive(),
  windowSeconds: z.number().int().positive(),
  remaining: z.number().int().nonnegative().optional(),
  resetAt: z.date().optional(),
});

/**
 * Zod schema for FieldSchema validation
 */
export const FieldSchemaSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  label: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'date', 'array', 'object']),
  required: z.boolean(),
  description: z.string().optional(),
  defaultValue: z.unknown().optional(),
  constraints: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    enum: z.array(z.unknown()).optional(),
  }).optional(),
});

/**
 * Zod schema for DataSource validation
 */
export const DataSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  category: z.nativeEnum(DataSourceCategory),
  auth: AuthConfigSchema,
  baseUrl: z.string().url(),
  rateLimit: RateLimitConfigSchema,
  schemas: z.array(FieldSchemaSchema),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().nonnegative(),
});

/**
 * Zod schema for CreateDataSourceInput validation
 */
export const CreateDataSourceInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  category: z.nativeEnum(DataSourceCategory),
  auth: z.object({
    method: z.nativeEnum(AuthMethod),
    credentials: z.string().min(1),
    expiresAt: z.date().optional(),
    scopes: z.array(z.string()).optional(),
  }),
  baseUrl: z.string().url(),
  rateLimit: z.object({
    maxRequests: z.number().int().positive(),
    windowSeconds: z.number().int().positive(),
  }),
  schemas: z.array(FieldSchemaSchema).optional(),
});

/**
 * Zod schema for UpdateDataSourceInput validation
 */
export const UpdateDataSourceInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  category: z.nativeEnum(DataSourceCategory).optional(),
  auth: z.object({
    method: z.nativeEnum(AuthMethod).optional(),
    credentials: z.string().min(1).optional(),
    expiresAt: z.date().optional(),
    scopes: z.array(z.string()).optional(),
  }).optional(),
  baseUrl: z.string().url().optional(),
  rateLimit: z.object({
    maxRequests: z.number().int().positive().optional(),
    windowSeconds: z.number().int().positive().optional(),
  }).optional(),
  schemas: z.array(FieldSchemaSchema).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Validates and parses CreateDataSourceInput with detailed error handling
 */
export function validateCreateDataSourceInput(
  input: unknown
): Result<CreateDataSourceInput, DataSourceValidationError> {
  const result = CreateDataSourceInputSchema.safeParse(input);
  
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    return err(new DataSourceValidationError(`Invalid input: ${issues}`));
  }
  
  return ok(result.data);
}

/**
 * Validates and parses UpdateDataSourceInput with detailed error handling
 */
export function validateUpdateDataSourceInput(
  input: unknown
): Result<UpdateDataSourceInput, DataSourceValidationError> {
  const result = UpdateDataSourceInputSchema.safeParse(input);
  
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    return err(new DataSourceValidationError(`Invalid input: ${issues}`));
  }
  
  return ok(result.data);
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if value is a valid DataSourceCategory
 */
export function isDataSourceCategory(value: unknown): value is DataSourceCategory {
  return Object.values(DataSourceCategory).includes(value as DataSourceCategory);
}

/**
 * Type guard to check if value is a valid AuthMethod
 */
export function isAuthMethod(value: unknown): value is AuthMethod {
  return Object.values(AuthMethod).includes(value as AuthMethod);
}

/**
 * Type guard to check if value is a valid ConnectionStatus
 */
export function isConnectionStatus(value: unknown): value is ConnectionStatus {
  return Object.values(ConnectionStatus).includes(value as ConnectionStatus);
}

/**
 * Type guard to check if error is a DataSourceError
 */
export function isDataSourceError(error: unknown): error is DataSourceError {
  return error instanceof DataSourceError;
}