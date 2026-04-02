/**
 * Config module for RedditTrendsSource
 * 
 * Layer: Config (Layer 2)
 * Responsibility: Define configuration types, validation schemas, and default
 * configurations for the Reddit trends data source.
 */

import { z } from 'zod';
import { StructuredLogger } from '@harness/logging';
import { DataSourceConfig, DataSourceType } from '../../types';

// Initialize structured logger for this module
const logger = new StructuredLogger('RedditTrendsSource:Config');

// ============================================================================
// Types (Layer 1 dependencies)
// ============================================================================

/**
 * Supported time periods for Reddit trend analysis
 */
export type RedditTimePeriod = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';

/**
 * Supported sorting methods for Reddit posts
 */
export type RedditSortMethod = 'hot' | 'top' | 'rising' | 'new';

/**
 * Subreddit selection strategy
 */
export type SubredditStrategy = 'explicit' | 'popular' | 'trending' | 'custom';

// ============================================================================
// Configuration Schema (Zod validation)
// ============================================================================

/**
 * Zod schema for validating RedditTrendsSource configuration
 * Enforces type safety and runtime validation
 */
export const RedditTrendsConfigSchema = z.object({
  // Data source identification
  type: z.literal(DataSourceType.REDDIT_TRENDS),
  name: z.string().min(1).max(128),
  
  // Reddit API configuration
  reddit: z.object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    userAgent: z.string().min(1).default('HarnessAI/1.0'),
    rateLimitBuffer: z.number().min(0).max(1).default(0.1),
  }),
  
  // Content filtering configuration
  filtering: z.object({
    subreddits: z.array(z.string().regex(/^[a-zA-Z0-9_]+$/)).default([]),
    subredditStrategy: z.enum(['explicit', 'popular', 'trending', 'custom']).default('popular'),
    minScore: z.number().min(0).default(10),
    minComments: z.number().min(0).default(5),
    excludeNSFW: z.boolean().default(true),
    excludeStickied: z.boolean().default(true),
    keywordsInclude: z.array(z.string()).default([]),
    keywordsExclude: z.array(z.string()).default([]),
  }),
  
  // Temporal configuration
  temporal: z.object({
    timePeriod: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).default('day'),
    sortMethod: z.enum(['hot', 'top', 'rising', 'new']).default('hot'),
    lookbackHours: z.number().min(1).max(8760).default(24),
  }),
  
  // Rate limiting and caching
  rateLimit: z.object({
    requestsPerMinute: z.number().min(1).max(1000).default(60),
    burstSize: z.number().min(1).max(100).default(10),
    cacheTTLSeconds: z.number().min(0).default(300),
    staleWhileRevalidate: z.boolean().default(true),
  }),
  
  // Output configuration
  output: z.object({
    maxPostsPerFetch: z.number().min(1).max(1000).default(100),
    includeMetadata: z.boolean().default(true),
    includeComments: z.boolean().default(false),
    maxCommentsPerPost: z.number().min(0).max(500).default(0),
  }),
});

/**
 * Inferred TypeScript type from Zod schema
 */
export type RedditTrendsConfig = z.infer<typeof RedditTrendsConfigSchema>;

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default configuration values for RedditTrendsSource
 * Provides sensible defaults while allowing override
 */
export const DEFAULT_REDDIT_TRENDS_CONFIG: Readonly<Partial<RedditTrendsConfig>> = {
  type: DataSourceType.REDDIT_TRENDS,
  name: 'reddit-trends',
  reddit: {
    userAgent: 'HarnessAI/1.0',
    rateLimitBuffer: 0.1,
  },
  filtering: {
    subreddits: [],
    subredditStrategy: 'popular',
    minScore: 10,
    minComments: 5,
    excludeNSFW: true,
    excludeStickied: true,
    keywordsInclude: [],
    keywordsExclude: [],
  },
  temporal: {
    timePeriod: 'day',
    sortMethod: 'hot',
    lookbackHours: 24,
  },
  rateLimit: {
    requestsPerMinute: 60,
    burstSize: 10,
    cacheTTLSeconds: 300,
    staleWhileRevalidate: true,
  },
  output: {
    maxPostsPerFetch: 100,
    includeMetadata: true,
    includeComments: false,
    maxCommentsPerPost: 0,
  },
} as const;

// ============================================================================
// Configuration Factory Functions
// ============================================================================

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
    public readonly configPath?: string
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Validates and merges configuration with defaults
 * 
 * @param partialConfig - Partial configuration provided by caller
 * @returns Fully validated RedditTrendsConfig
 * @throws ConfigValidationError if validation fails
 */
export function createRedditTrendsConfig(
  partialConfig: Partial<RedditTrendsConfig>
): RedditTrendsConfig {
  logger.debug('Creating RedditTrendsConfig', { providedKeys: Object.keys(partialConfig) });

  try {
    // Deep merge with defaults
    const mergedConfig = deepMergeDefaults(
      DEFAULT_REDDIT_TRENDS_CONFIG,
      partialConfig
    );

    // Validate against schema
    const validatedConfig = RedditTrendsConfigSchema.parse(mergedConfig);

    logger.info('RedditTrendsConfig created successfully', {
      name: validatedConfig.name,
      strategy: validatedConfig.filtering.subredditStrategy,
      timePeriod: validatedConfig.temporal.timePeriod,
    });

    return validatedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = `Invalid RedditTrendsSource configuration: ${error.issues.length} validation error(s)`;
      logger.error(message, { issues: error.issues });
      throw new ConfigValidationError(message, error.issues);
    }

    // Re-throw unexpected errors
    logger.error('Unexpected error during config creation', { error });
    throw error;
  }
}

/**
 * Creates a minimal configuration for testing purposes
 * Uses environment variables for sensitive credentials
 */
export function createTestConfig(): RedditTrendsConfig {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new ConfigValidationError(
      'Missing required environment variables for test config: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET',
      []
    );
  }

  return createRedditTrendsConfig({
    name: 'reddit-trends-test',
    reddit: {
      clientId,
      clientSecret,
      userAgent: 'HarnessAI-Test/1.0',
    },
    filtering: {
      subreddits: ['test', 'programming'],
      subredditStrategy: 'explicit',
    },
    rateLimit: {
      requestsPerMinute: 10, // Conservative for tests
      cacheTTLSeconds: 60,
    },
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Deep merges partial configuration with defaults
 * Preserves nested structure and handles undefined values
 */
function deepMergeDefaults<T extends Record<string, unknown>>(
  defaults: Readonly<Partial<T>>,
  override: Partial<T>
): T {
  const result: Record<string, unknown> = { ...defaults };

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      continue;
    }

    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null
    ) {
      // Recursively merge nested objects
      result[key] = deepMergeDefaults(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      // Override primitive or array values
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Validates that configuration is safe for production use
 * Checks for test credentials, insecure settings, etc.
 */
export function validateProductionSafety(config: RedditTrendsConfig): string[] {
  const warnings: string[] = [];

  // Check for default/test credentials
  if (config.reddit.clientId === 'test' || config.reddit.clientId.includes('test')) {
    warnings.push('Client ID appears to be a test value');
  }

  // Check for overly permissive rate limits
  if (config.rateLimit.requestsPerMinute > 100) {
    warnings.push('High request rate may violate Reddit API terms');
  }

  // Check for missing subreddit constraints in non-explicit mode
  if (
    config.filtering.subredditStrategy !== 'explicit' &&
    config.filtering.keywordsInclude.length === 0
  ) {
    warnings.push('No keyword filters applied with dynamic subreddit selection');
  }

  // Check cache configuration
  if (config.rateLimit.cacheTTLSeconds < 60) {
    warnings.push('Short cache TTL may cause unnecessary API calls');
  }

  return warnings;
}

/**
 * Sanitizes configuration for logging (removes secrets)
 */
export function sanitizeConfigForLogging(config: RedditTrendsConfig): Record<string, unknown> {
  return {
    ...config,
    reddit: {
      ...config.reddit,
      clientId: '[REDACTED]',
      clientSecret: '[REDACTED]',
    },
  };
}