/**
 * @fileoverview Product-related trend types for the Trends module.
 * @module lib/types/trends/product
 */

import { z } from 'zod';
import { BaseEntity, TimestampedEntity } from '../common/base';
import { TrendDirection, TrendSeverity } from './common';

// ============================================================================
// Domain Types
// ============================================================================

/**
 * Represents a product trend analysis result.
 * Tracks performance metrics and trend direction for a specific product.
 */
export interface ProductTrend extends BaseEntity, TimestampedEntity {
  /** Reference to the product being analyzed */
  readonly productId: string;

  /** Human-readable product name for display purposes */
  readonly productName: string;

  /** Category or classification of the product */
  readonly category: ProductCategory;

  /** Overall trend direction for this product */
  readonly direction: TrendDirection;

  /** Severity level indicating the significance of the trend */
  readonly severity: TrendSeverity;

  /** Key performance indicators for this product trend */
  readonly metrics: ProductTrendMetrics;

  /** Time range for which this trend was calculated */
  readonly timeRange: TrendTimeRange;

  /** Optional comparison data with previous period */
  readonly comparison?: PeriodComparison;

  /** Tags for filtering and categorization */
  readonly tags: ReadonlyArray<string>;

  /** Whether this trend requires attention from stakeholders */
  readonly requiresAttention: boolean;
}

/**
 * Product categories for classification and filtering.
 */
export type ProductCategory =
  | 'saas'
  | 'infrastructure'
  | 'security'
  | 'ci_cd'
  | 'feature_flags'
  | 'chaos_engineering'
  | 'cloud_cost_management'
  | 'other';

/**
 * Core metrics tracked for product trends.
 */
export interface ProductTrendMetrics {
  /** Adoption rate (0-100 percentage) */
  readonly adoptionRate: number;

  /** User engagement score (0-100) */
  readonly engagementScore: number;

  /** Retention rate percentage */
  readonly retentionRate: number;

  /** Net Promoter Score (-100 to 100) */
  readonly npsScore: number;

  /** Monthly recurring revenue trend */
  readonly mrrTrend: number;

  /** Customer churn rate percentage */
  readonly churnRate: number;

  /** Feature usage velocity (features used per active user) */
  readonly featureVelocity: number;

  /** Custom metric values for extensibility */
  readonly customMetrics: Readonly<Record<string, number>>;
}

/**
 * Time range specification for trend calculations.
 */
export interface TrendTimeRange {
  /** Start of the analysis period (ISO 8601 timestamp) */
  readonly startDate: string;

  /** End of the analysis period (ISO 8601 timestamp) */
  readonly endDate: string;

  /** Granularity of data points (e.g., 'daily', 'weekly', 'monthly') */
  readonly granularity: TrendGranularity;

  /** Timezone for the analysis */
  readonly timezone: string;
}

/**
 * Granularity options for trend data aggregation.
 */
export type TrendGranularity = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly';

/**
 * Comparison data between two time periods.
 */
export interface PeriodComparison {
  /** Previous period time range */
  readonly previousPeriod: TrendTimeRange;

  /** Percentage change in adoption rate */
  readonly adoptionChangePct: number;

  /** Percentage change in engagement score */
  readonly engagementChangePct: number;

  /** Percentage change in MRR */
  readonly mrrChangePct: number;

  /** Direction of the overall change */
  readonly overallDirection: TrendDirection;
}

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Zod schema for ProductTrend validation.
 * Used for runtime validation of incoming data.
 */
export const ProductTrendSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().min(1).max(128),
  productName: z.string().min(1).max(256),
  category: z.enum([
    'saas',
    'infrastructure',
    'security',
    'ci_cd',
    'feature_flags',
    'chaos_engineering',
    'cloud_cost_management',
    'other',
  ]),
  direction: z.enum(['up', 'down', 'stable', 'volatile']),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  metrics: z.object({
    adoptionRate: z.number().min(0).max(100),
    engagementScore: z.number().min(0).max(100),
    retentionRate: z.number().min(0).max(100),
    npsScore: z.number().min(-100).max(100),
    mrrTrend: z.number(),
    churnRate: z.number().min(0).max(100),
    featureVelocity: z.number().min(0),
    customMetrics: z.record(z.number()),
  }),
  timeRange: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    granularity: z.enum(['hourly', 'daily', 'weekly', 'monthly', 'quarterly']),
    timezone: z.string(),
  }),
  comparison: z
    .object({
      previousPeriod: z.object({
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
        granularity: z.enum(['hourly', 'daily', 'weekly', 'monthly', 'quarterly']),
        timezone: z.string(),
      }),
      adoptionChangePct: z.number(),
      engagementChangePct: z.number(),
      mrrChangePct: z.number(),
      overallDirection: z.enum(['up', 'down', 'stable', 'volatile']),
    })
    .optional(),
  tags: z.array(z.string().min(1).max(64)),
  requiresAttention: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Schema for creating a new ProductTrend.
 * Omits system-generated fields.
 */
export const CreateProductTrendSchema = ProductTrendSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

/**
 * Schema for updating an existing ProductTrend.
 * Makes all fields optional except id.
 */
export const UpdateProductTrendSchema = ProductTrendSchema.partial().required({
  id: true,
});

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid ProductCategory.
 * @param value - The value to check
 * @returns True if the value is a valid ProductCategory
 */
export function isProductCategory(value: unknown): value is ProductCategory {
  const validCategories: ProductCategory[] = [
    'saas',
    'infrastructure',
    'security',
    'ci_cd',
    'feature_flags',
    'chaos_engineering',
    'cloud_cost_management',
    'other',
  ];
  return typeof value === 'string' && validCategories.includes(value as ProductCategory);
}

/**
 * Type guard to check if a value is a valid TrendGranularity.
 * @param value - The value to check
 * @returns True if the value is a valid TrendGranularity
 */
export function isTrendGranularity(value: unknown): value is TrendGranularity {
  const validGranularities: TrendGranularity[] = ['hourly', 'daily', 'weekly', 'monthly', 'quarterly'];
  return typeof value === 'string' && validGranularities.includes(value as TrendGranularity);
}

/**
 * Validates that a ProductTrend object conforms to the expected schema.
 * Throws a validation error if the object is invalid.
 * @param data - The data to validate
 * @returns The validated ProductTrend object
 * @throws {z.ZodError} If validation fails
 */
export function validateProductTrend(data: unknown): ProductTrend {
  return ProductTrendSchema.parse(data);
}

/**
 * Safely validates a ProductTrend object without throwing.
 * @param data - The data to validate
 * @returns An object with success status and either the validated data or error
 */
export function safeValidateProductTrend(
  data: unknown
): { success: true; data: ProductTrend } | { success: false; error: z.ZodError } {
  const result = ProductTrendSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a default ProductTrendMetrics object with zeroed values.
 * Useful for initialization and testing.
 * @returns A new ProductTrendMetrics object
 */
export function createDefaultMetrics(): ProductTrendMetrics {
  return {
    adoptionRate: 0,
    engagementScore: 0,
    retentionRate: 0,
    npsScore: 0,
    mrrTrend: 0,
    churnRate: 0,
    featureVelocity: 0,
    customMetrics: {},
  };
}

/**
 * Creates a new ProductTrend with system-generated fields populated.
 * @param input - The input data (without system fields)
 * @returns A complete ProductTrend object
 */
export function createProductTrend(
  input: z.infer<typeof CreateProductTrendSchema>
): ProductTrend {
  const now = new Date().toISOString();
  const validated = CreateProductTrendSchema.parse(input);

  return {
    ...validated,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Filter options for querying product trends.
 */
export interface ProductTrendFilter {
  /** Filter by specific product IDs */
  readonly productIds?: ReadonlyArray<string>;

  /** Filter by categories */
  readonly categories?: ReadonlyArray<ProductCategory>;

  /** Filter by trend directions */
  readonly directions?: ReadonlyArray<TrendDirection>;

  /** Filter by minimum severity level */
  readonly minSeverity?: TrendSeverity;

  /** Filter by date range */
  readonly dateRange?: { readonly start: string; readonly end: string };

  /** Filter by tags (must have all specified tags) */
  readonly tags?: ReadonlyArray<string>;

  /** Only return trends requiring attention */
  readonly requiresAttentionOnly?: boolean;
}

/**
 * Sort options for product trend queries.
 */
export type ProductTrendSortField =
  | 'productName'
  | 'createdAt'
  | 'updatedAt'
  | 'adoptionRate'
  | 'engagementScore'
  | 'severity';

export interface ProductTrendSort {
  readonly field: ProductTrendSortField;
  readonly direction: 'asc' | 'desc';
}

/**
 * Pagination parameters for product trend queries.
 */
export interface ProductTrendPagination {
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Result type for paginated product trend queries.
 */
export interface ProductTrendPage {
  readonly items: ReadonlyArray<ProductTrend>;
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Custom error class for product trend-related errors.
 */
export class ProductTrendError extends Error {
  constructor(
    message: string,
    public readonly code: ProductTrendErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ProductTrendError';
    Object.setPrototypeOf(this, ProductTrendError.prototype);
  }
}

/**
 * Error codes for product trend operations.
 */
export type ProductTrendErrorCode =
  | 'INVALID_PRODUCT_ID'
  | 'INVALID_DATE_RANGE'
  | 'INVALID_METRICS'
  | 'PRODUCT_NOT_FOUND'
  | 'TREND_CALCULATION_FAILED'
  | 'VALIDATION_ERROR';

/**
 * Creates a properly typed ProductTrendError.
 * @param code - The error code
 * @param message - Human-readable error message
 * @param details - Optional additional context
 * @returns A new ProductTrendError instance
 */
export function createProductTrendError(
  code: ProductTrendErrorCode,
  message: string,
  details?: Record<string, unknown>
): ProductTrendError {
  return new ProductTrendError(message, code, details);
}