/**
 * Orchestrator Configuration Module
 * 
 * Layer: Config (Layer 2)
 * 
 * This module provides configuration management for the AI orchestrator,
 * including validation, defaults, and environment-specific overrides.
 */

import { z } from 'zod';
import { createLogger } from '@harness/logging';
import { Result, ok, err } from '@harness/result';

const logger = createLogger('orchestrator:config');

// =============================================================================
// TYPES (Layer 1) - Type definitions for orchestrator configuration
// =============================================================================

/**
 * Provider types supported by the orchestrator
 */
export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'azure' | 'local';

/**
 * Execution strategy for tool calling
 */
export type ExecutionStrategy = 'sequential' | 'parallel' | 'adaptive';

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
  readonly retryableErrors: ReadonlyArray<string>;
}

/**
 * Circuit breaker configuration for resilience
 */
export interface CircuitBreakerConfig {
  readonly failureThreshold: number;
  readonly recoveryTimeoutMs: number;
  readonly halfOpenMaxCalls: number;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  readonly requestsPerSecond: number;
  readonly burstSize: number;
  readonly cooldownMs: number;
}

/**
 * Tool execution configuration
 */
export interface ToolConfig {
  readonly timeoutMs: number;
  readonly maxConcurrency: number;
  readonly executionStrategy: ExecutionStrategy;
}

/**
 * Complete orchestrator configuration
 */
export interface OrchestratorConfig {
  readonly provider: LLMProvider;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly topP: number;
  readonly frequencyPenalty: number;
  readonly presencePenalty: number;
  readonly retryPolicy: RetryPolicy;
  readonly circuitBreaker: CircuitBreakerConfig;
  readonly rateLimit: RateLimitConfig;
  readonly tools: ToolConfig;
  readonly enableCaching: boolean;
  readonly cacheTtlMs: number;
  readonly enableTracing: boolean;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
}

// =============================================================================
// ZOD SCHEMAS - Runtime validation schemas
// =============================================================================

const retryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(3),
  baseDelayMs: z.number().int().min(100).max(60000).default(1000),
  maxDelayMs: z.number().int().min(1000).max(300000).default(30000),
  backoffMultiplier: z.number().min(1).max(10).default(2),
  retryableErrors: z.array(z.string()).default(['ECONNRESET', 'ETIMEDOUT', '429', '503']),
});

const circuitBreakerSchema = z.object({
  failureThreshold: z.number().int().min(1).max(100).default(5),
  recoveryTimeoutMs: z.number().int().min(1000).max(300000).default(30000),
  halfOpenMaxCalls: z.number().int().min(1).max(10).default(3),
});

const rateLimitSchema = z.object({
  requestsPerSecond: z.number().min(0.1).max(1000).default(10),
  burstSize: z.number().int().min(1).max(100).default(20),
  cooldownMs: z.number().int().min(0).max(60000).default(1000),
});

const toolConfigSchema = z.object({
  timeoutMs: z.number().int().min(1000).max(300000).default(30000),
  maxConcurrency: z.number().int().min(1).max(100).default(5),
  executionStrategy: z.enum(['sequential', 'parallel', 'adaptive']).default('adaptive'),
});

const orchestratorConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google', 'azure', 'local']).default('openai'),
  model: z.string().min(1).default('gpt-4'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(1).max(128000).default(4096),
  topP: z.number().min(0).max(1).default(1),
  frequencyPenalty: z.number().min(-2).max(2).default(0),
  presencePenalty: z.number().min(-2).max(2).default(0),
  retryPolicy: retryPolicySchema,
  circuitBreaker: circuitBreakerSchema,
  rateLimit: rateLimitSchema,
  tools: toolConfigSchema,
  enableCaching: z.boolean().default(true),
  cacheTtlMs: z.number().int().min(1000).max(86400000).default(300000),
  enableTracing: z.boolean().default(false),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

// =============================================================================
// DEFAULTS - Sensible default configurations
// =============================================================================

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', '429', '503', 'ECONNREFUSED'],
} as const;

export const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeoutMs: 30000,
  halfOpenMaxCalls: 3,
} as const;

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  requestsPerSecond: 10,
  burstSize: 20,
  cooldownMs: 1000,
} as const;

export const DEFAULT_TOOL_CONFIG: ToolConfig = {
  timeoutMs: 30000,
  maxConcurrency: 5,
  executionStrategy: 'adaptive',
} as const;

export const DEFAULT_CONFIG: OrchestratorConfig = {
  provider: 'openai',
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  retryPolicy: DEFAULT_RETRY_POLICY,
  circuitBreaker: DEFAULT_CIRCUIT_BREAKER,
  rateLimit: DEFAULT_RATE_LIMIT,
  tools: DEFAULT_TOOL_CONFIG,
  enableCaching: true,
  cacheTtlMs: 300000, // 5 minutes
  enableTracing: false,
  logLevel: 'info',
} as const;

// =============================================================================
// CONFIGURATION ERRORS
// =============================================================================

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ConfigurationError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// =============================================================================
// CONFIGURATION BUILDER
// =============================================================================

/**
 * Builder class for constructing orchestrator configuration with validation.
 * Implements the builder pattern for flexible, type-safe configuration.
 */
export class OrchestratorConfigBuilder {
  private config: Partial<OrchestratorConfig> = {};

  /**
   * Set the LLM provider
   */
  withProvider(provider: LLMProvider): this {
    this.config = { ...this.config, provider };
    return this;
  }

  /**
   * Set the model identifier
   */
  withModel(model: string): this {
    this.config = { ...this.config, model };
    return this;
  }

  /**
   * Set generation parameters
   */
  withGenerationParams(params: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  }): this {
    this.config = { ...this.config, ...params };
    return this;
  }

  /**
   * Set retry policy configuration
   */
  withRetryPolicy(retryPolicy: Partial<RetryPolicy>): this {
    this.config = {
      ...this.config,
      retryPolicy: { ...DEFAULT_RETRY_POLICY, ...this.config.retryPolicy, ...retryPolicy },
    };
    return this;
  }

  /**
   * Set circuit breaker configuration
   */
  withCircuitBreaker(circuitBreaker: Partial<CircuitBreakerConfig>): this {
    this.config = {
      ...this.config,
      circuitBreaker: { ...DEFAULT_CIRCUIT_BREAKER, ...this.config.circuitBreaker, ...circuitBreaker },
    };
    return this;
  }

  /**
   * Set rate limiting configuration
   */
  withRateLimit(rateLimit: Partial<RateLimitConfig>): this {
    this.config = {
      ...this.config,
      rateLimit: { ...DEFAULT_RATE_LIMIT, ...this.config.rateLimit, ...rateLimit },
    };
    return this;
  }

  /**
   * Set tool execution configuration
   */
  withToolConfig(tools: Partial<ToolConfig>): this {
    this.config = {
      ...this.config,
      tools: { ...DEFAULT_TOOL_CONFIG, ...this.config.tools, ...tools },
    };
    return this;
  }

  /**
   * Enable or disable caching
   */
  withCaching(enabled: boolean, ttlMs?: number): this {
    this.config = {
      ...this.config,
      enableCaching: enabled,
      ...(ttlMs && { cacheTtlMs: ttlMs }),
    };
    return this;
  }

  /**
   * Enable or disable tracing
   */
  withTracing(enabled: boolean): this {
    this.config = { ...this.config, enableTracing: enabled };
    return this;
  }

  /**
   * Set log level
   */
  withLogLevel(level: OrchestratorConfig['logLevel']): this {
    this.config = { ...this.config, logLevel: level };
    return this;
  }

  /**
   * Build and validate the final configuration
   * @returns Result containing valid config or error
   */
  build(): Result<OrchestratorConfig, ConfigurationError> {
    try {
      // Merge with defaults and validate
      const mergedConfig = {
        ...DEFAULT_CONFIG,
        ...this.config,
        retryPolicy: { ...DEFAULT_RETRY_POLICY, ...this.config.retryPolicy },
        circuitBreaker: { ...DEFAULT_CIRCUIT_BREAKER, ...this.config.circuitBreaker },
        rateLimit: { ...DEFAULT_RATE_LIMIT, ...this.config.rateLimit },
        tools: { ...DEFAULT_TOOL_CONFIG, ...this.config.tools },
      };

      const validated = orchestratorConfigSchema.parse(mergedConfig);
      
      logger.debug('Orchestrator configuration built successfully', {
        provider: validated.provider,
        model: validated.model,
      });

      return ok(validated as OrchestratorConfig);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        const configError = new ConfigurationError(
          `Configuration validation failed: ${issues}`,
          'VALIDATION_ERROR',
          { issues: error.issues }
        );
        logger.error('Configuration validation failed', { error: configError });
        return err(configError);
      }

      const configError = new ConfigurationError(
        `Unexpected error building configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'BUILD_ERROR',
        { originalError: error }
      );
      logger.error('Unexpected configuration error', { error: configError });
      return err(configError);
    }
  }
}

// =============================================================================
// ENVIRONMENT CONFIGURATION LOADER
// =============================================================================

/**
 * Load configuration from environment variables with validation.
 * Environment variables are prefixed with HARNESS_AI_ORCHESTRATOR_.
 */
export function loadConfigFromEnv(): Result<Partial<OrchestratorConfig>, ConfigurationError> {
  const env = process.env;
  const config: Partial<OrchestratorConfig> = {};

  try {
    // Helper to parse numeric env vars
    const parseNumber = (key: string, min?: number, max?: number): number | undefined => {
      const value = env[key];
      if (!value) return undefined;
      const num = Number(value);
      if (isNaN(num)) {
        throw new ConfigurationError(`Invalid numeric value for ${key}: ${value}`, 'ENV_PARSE_ERROR');
      }
      if (min !== undefined && num < min) {
        throw new ConfigurationError(`${key} must be >= ${min}`, 'ENV_RANGE_ERROR');
      }
      if (max !== undefined && num > max) {
        throw new ConfigurationError(`${key} must be <= ${max}`, 'ENV_RANGE_ERROR');
      }
      return num;
    };

    // Helper to parse boolean env vars
    const parseBool = (key: string): boolean | undefined => {
      const value = env[key]?.toLowerCase();
      if (!value) return undefined;
      if (value === 'true' || value === '1') return true;
      if (value === 'false' || value === '0') return false;
      throw new ConfigurationError(`Invalid boolean value for ${key}: ${value}`, 'ENV_PARSE_ERROR');
    };

    // Parse provider and model
    const provider = env.HARNESS_AI_ORCHESTRATOR_PROVIDER as LLMProvider | undefined;
    if (provider) config.provider = provider;

    const model = env.HARNESS_AI_ORCHESTRATOR_MODEL;
    if (model) config.model = model;

    // Parse generation parameters
    const temperature = parseNumber('HARNESS_AI_ORCHESTRATOR_TEMPERATURE', 0, 2);
    if (temperature !== undefined) config.temperature = temperature;

    const maxTokens = parseNumber('HARNESS_AI_ORCHESTRATOR_MAX_TOKENS', 1, 128000);
    if (maxTokens !== undefined) config.maxTokens = maxTokens;

    // Parse feature flags
    const enableCaching = parseBool('HARNESS_AI_ORCHESTRATOR_ENABLE_CACHING');
    if (enableCaching !== undefined) config.enableCaching = enableCaching;

    const enableTracing = parseBool('HARNESS_AI_ORCHESTRATOR_ENABLE_TRACING');
    if (enableTracing !== undefined) config.enableTracing = enableTracing;

    const cacheTtlMs = parseNumber('HARNESS_AI_ORCHESTRATOR_CACHE_TTL_MS', 1000, 86400000);
    if (cacheTtlMs !== undefined) config.cacheTtlMs = cacheTtlMs;

    // Parse log level
    const logLevel = env.HARNESS_AI_ORCHESTRATOR_LOG_LEVEL as OrchestratorConfig['logLevel'] | undefined;
    if (logLevel) config.logLevel = logLevel;

    // Parse retry policy
    const retryPolicy: Partial<RetryPolicy> = {};
    const maxAttempts = parseNumber('HARNESS_AI_ORCHESTRATOR_RETRY_MAX_ATTEMPTS', 1, 10);
    if (maxAttempts !== undefined) retryPolicy.maxAttempts = maxAttempts;

    const baseDelayMs = parseNumber('HARNESS_AI_ORCHESTRATOR_RETRY_BASE_DELAY_MS', 100, 60000);
    if (baseDelayMs !== undefined) retryPolicy.baseDelayMs = baseDelayMs;

    if (Object.keys(retryPolicy).length > 0) {
      config.retryPolicy = retryPolicy as RetryPolicy;
    }

    logger.debug('Configuration loaded from environment', { keys: Object.keys(config) });
    return ok(config);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return err(error);
    }
    return err(new ConfigurationError(
      `Failed to load configuration from environment: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'ENV_LOAD_ERROR',
      { originalError: error }
    ));
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a configuration builder instance
 */
export function createConfigBuilder(): OrchestratorConfigBuilder {
  return new OrchestratorConfigBuilder();
}

/**
 * Create configuration from environment with defaults
 */
export function createConfigFromEnv(): Result<OrchestratorConfig, ConfigurationError> {
  const envResult = loadConfigFromEnv();
  
  if (envResult.isErr()) {
    return err(envResult.error);
  }

  return createConfigBuilder()
    .withProvider(envResult.value.provider ?? DEFAULT_CONFIG.provider)
    .withModel(envResult.value.model ?? DEFAULT_CONFIG.model)
    .withGenerationParams({
      temperature: envResult.value.temperature,
      maxTokens: envResult.value.maxTokens,
    })
    .withCaching(
      envResult.value.enableCaching ?? DEFAULT_CONFIG.enableCaching,
      envResult.value.cacheTtlMs
    )
    .withTracing(envResult.value.enableTracing ?? DEFAULT_CONFIG.enableTracing)
    .withLogLevel(envResult.value.logLevel ?? DEFAULT_CONFIG.logLevel)
    .withRetryPolicy(envResult.value.retryPolicy ?? {})
    .build();
}

/**
 * Create a development-optimized configuration
 */
export function createDevConfig(): OrchestratorConfig {
  const result = createConfigBuilder()
    .withProvider('local')
    .withModel('llama-2-7b')
    .withGenerationParams({ temperature: 0.9, maxTokens: 2048 })
    .withCaching(false)
    .withTracing(true)
    .withLogLevel('debug')
    .withRetryPolicy({ maxAttempts: 1 })
    .build();

  // Dev config should always succeed with these defaults
  if (result.isErr()) {
    throw new Error('Failed to create dev config: this should never happen');
  }

  return result.value;
}

/**
 * Create a production-optimized configuration
 */
export function createProdConfig(): Result<OrchestratorConfig, ConfigurationError> {
  return createConfigBuilder()
    .withProvider('openai')
    .withModel('gpt-4')
    .withGenerationParams({ temperature: 0.3, maxTokens: 4096 })
    .withCaching(true, 600000) // 10 minute cache
    .withTracing(false)
    .withLogLevel('warn')
    .withRetryPolicy({ maxAttempts: 5, baseDelayMs: 2000 })
    .withCircuitBreaker({ failureThreshold: 10, recoveryTimeoutMs: 60000 })
    .withRateLimit({ requestsPerSecond: 50, burstSize: 100 })
    .build();
}