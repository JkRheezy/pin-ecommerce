/**
 * Orchestrator Configuration Module
 * 
 * Layer: Config (Layer 2)
 * 
 * This module defines the configuration structure and validation
 * for the AI Orchestrator system. It provides type-safe configuration
 * management with sensible defaults and comprehensive validation.
 */

import { z } from 'zod';
import { logger } from '@/lib/logging';

// =============================================================================
// Types Layer (Layer 1) - Embedded for self-containment
// =============================================================================

/**
 * Provider types supported by the orchestrator
 */
export enum AIProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  AZURE = 'azure',
  LOCAL = 'local',
}

/**
 * Strategy types for model selection
 */
export enum RoutingStrategy {
  COST_OPTIMIZED = 'cost_optimized',
  QUALITY_OPTIMIZED = 'quality_optimized',
  LATENCY_OPTIMIZED = 'latency_optimized',
  BALANCED = 'balanced',
  CUSTOM = 'custom',
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
  readonly retryableErrors: readonly string[];
}

/**
 * Circuit breaker configuration
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
 * Provider-specific configuration
 */
export interface ProviderConfig {
  readonly provider: AIProvider;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly defaultModel: string;
  readonly availableModels: readonly string[];
  readonly timeoutMs: number;
  readonly retryPolicy: RetryPolicy;
  readonly rateLimit: RateLimitConfig;
  readonly enabled: boolean;
  readonly priority: number; // Lower = higher priority
}

/**
 * Complete orchestrator configuration
 */
export interface OrchestratorConfig {
  readonly version: string;
  readonly defaultProvider: AIProvider;
  readonly routingStrategy: RoutingStrategy;
  readonly providers: ReadonlyMap<AIProvider, ProviderConfig>;
  readonly circuitBreaker: CircuitBreakerConfig;
  readonly globalTimeoutMs: number;
  readonly enableCaching: boolean;
  readonly cacheTtlMs: number;
  readonly enableMetrics: boolean;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
}

// =============================================================================
// Zod Schemas for Runtime Validation
// =============================================================================

const retryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(3),
  baseDelayMs: z.number().int().min(0).default(100),
  maxDelayMs: z.number().int().min(0).default(30000),
  backoffMultiplier: z.number().min(1).max(10).default(2),
  retryableErrors: z.array(z.string()).default(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED']),
}) satisfies z.ZodType<RetryPolicy>;

const circuitBreakerSchema = z.object({
  failureThreshold: z.number().int().min(1).max(100).default(5),
  recoveryTimeoutMs: z.number().int().min(1000).default(30000),
  halfOpenMaxCalls: z.number().int().min(1).default(3),
}) satisfies z.ZodType<CircuitBreakerConfig>;

const rateLimitSchema = z.object({
  requestsPerSecond: z.number().min(0.1).max(10000).default(10),
  burstSize: z.number().int().min(1).max(1000).default(20),
  cooldownMs: z.number().int().min(0).default(1000),
}) satisfies z.ZodType<RateLimitConfig>;

const providerConfigSchema = z.object({
  provider: z.nativeEnum(AIProvider),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  defaultModel: z.string().min(1),
  availableModels: z.array(z.string().min(1)).min(1),
  timeoutMs: z.number().int().min(1000).default(30000),
  retryPolicy: retryPolicySchema,
  rateLimit: rateLimitSchema,
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(100).default(50),
}) satisfies z.ZodType<ProviderConfig>;

const orchestratorConfigSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/).default('1.0.0'),
  defaultProvider: z.nativeEnum(AIProvider).default(AIProvider.OPENAI),
  routingStrategy: z.nativeEnum(RoutingStrategy).default(RoutingStrategy.BALANCED),
  providers: z.map(z.nativeEnum(AIProvider), providerConfigSchema),
  circuitBreaker: circuitBreakerSchema,
  globalTimeoutMs: z.number().int().min(1000).default(60000),
  enableCaching: z.boolean().default(true),
  cacheTtlMs: z.number().int().min(1000).default(300000), // 5 minutes
  enableMetrics: z.boolean().default(true),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
}) satisfies z.ZodType<OrchestratorConfig>;

// =============================================================================
// Configuration Errors
// =============================================================================

export class OrchestratorConfigError extends Error {
  constructor(
    message: string,
    public readonly code: 'VALIDATION_ERROR' | 'MISSING_PROVIDER' | 'INVALID_PRIORITY' | 'VERSION_MISMATCH',
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'OrchestratorConfigError';
    Object.setPrototypeOf(this, OrchestratorConfigError.prototype);
  }
}

// =============================================================================
// Default Configurations
// =============================================================================

/**
 * Default retry policy with exponential backoff
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND'],
};

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeoutMs: 30000,
  halfOpenMaxCalls: 3,
};

/**
 * Default rate limiting configuration
 */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  requestsPerSecond: 10,
  burstSize: 20,
  cooldownMs: 1000,
};

/**
 * Creates a default provider configuration
 */
export function createDefaultProviderConfig(
  provider: AIProvider,
  defaultModel: string,
  availableModels: readonly string[]
): ProviderConfig {
  return {
    provider,
    defaultModel,
    availableModels,
    timeoutMs: 30000,
    retryPolicy: DEFAULT_RETRY_POLICY,
    rateLimit: DEFAULT_RATE_LIMIT,
    enabled: true,
    priority: 50,
  };
}

// =============================================================================
// Configuration Builder and Validation
// =============================================================================

/**
 * Configuration builder for fluent configuration construction
 */
export class OrchestratorConfigBuilder {
  private config: Partial<OrchestratorConfig> = {
    version: '1.0.0',
    circuitBreaker: DEFAULT_CIRCUIT_BREAKER,
    providers: new Map(),
  };

  withVersion(version: string): this {
    this.config.version = version;
    return this;
  }

  withDefaultProvider(provider: AIProvider): this {
    this.config.defaultProvider = provider;
    return this;
  }

  withRoutingStrategy(strategy: RoutingStrategy): this {
    this.config.routingStrategy = strategy;
    return this;
  }

  withProvider(config: ProviderConfig): this {
    if (!this.config.providers) {
      this.config.providers = new Map();
    }
    this.config.providers.set(config.provider, config);
    return this;
  }

  withCircuitBreaker(config: CircuitBreakerConfig): this {
    this.config.circuitBreaker = config;
    return this;
  }

  withGlobalTimeout(timeoutMs: number): this {
    this.config.globalTimeoutMs = timeoutMs;
    return this;
  }

  withCaching(enabled: boolean, ttlMs?: number): this {
    this.config.enableCaching = enabled;
    if (ttlMs !== undefined) {
      this.config.cacheTtlMs = ttlMs;
    }
    return this;
  }

  withMetrics(enabled: boolean): this {
    this.config.enableMetrics = enabled;
    return this;
  }

  withLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): this {
    this.config.logLevel = level;
    return this;
  }

  /**
   * Builds and validates the final configuration
   * @throws OrchestratorConfigError if validation fails
   */
  build(): OrchestratorConfig {
    const result = orchestratorConfigSchema.safeParse(this.config);

    if (!result.success) {
      logger.error('Orchestrator configuration validation failed', {
        errors: result.error.errors,
        config: this.config,
      });
      throw new OrchestratorConfigError(
        `Configuration validation failed: ${result.error.message}`,
        'VALIDATION_ERROR',
        result.error.errors
      );
    }

    const validatedConfig = result.data;

    // Additional cross-field validation
    this.validateProviderConsistency(validatedConfig);
    this.validatePriorityUniqueness(validatedConfig);

    logger.info('Orchestrator configuration built successfully', {
      version: validatedConfig.version,
      defaultProvider: validatedConfig.defaultProvider,
      providerCount: validatedConfig.providers.size,
    });

    return validatedConfig;
  }

  /**
   * Validates that the default provider is configured and enabled
   */
  private validateProviderConsistency(config: OrchestratorConfig): void {
    const defaultProvider = config.providers.get(config.defaultProvider);
    
    if (!defaultProvider) {
      throw new OrchestratorConfigError(
        `Default provider ${config.defaultProvider} is not configured`,
        'MISSING_PROVIDER'
      );
    }

    if (!defaultProvider.enabled) {
      throw new OrchestratorConfigError(
        `Default provider ${config.defaultProvider} is disabled`,
        'MISSING_PROVIDER'
      );
    }
  }

  /**
   * Validates that provider priorities don't have excessive conflicts
   */
  private validatePriorityUniqueness(config: OrchestratorConfig): void {
    const priorities = Array.from(config.providers.values())
      .filter(p => p.enabled)
      .map(p => p.priority);
    
    const prioritySet = new Set(priorities);
    
    // Warn if multiple providers have the same priority (not an error, but suboptimal)
    if (prioritySet.size !== priorities.length) {
      logger.warn('Multiple providers share the same priority level', {
        priorities,
        providers: Array.from(config.providers.keys()),
      });
    }
  }
}

// =============================================================================
// Environment-based Configuration Loading
// =============================================================================

/**
 * Loads configuration from environment variables
 * Falls back to sensible defaults for missing values
 */
export function loadConfigFromEnvironment(): OrchestratorConfigBuilder {
  const builder = new OrchestratorConfigBuilder();

  // Version from package or env
  const version = process.env.ORCHESTRATOR_VERSION ?? '1.0.0';
  builder.withVersion(version);

  // Default provider
  const defaultProvider = process.env.ORCHESTRATOR_DEFAULT_PROVIDER as AIProvider | undefined;
  if (defaultProvider && Object.values(AIProvider).includes(defaultProvider)) {
    builder.withDefaultProvider(defaultProvider);
  }

  // Routing strategy
  const routingStrategy = process.env.ORCHESTRATOR_ROUTING_STRATEGY as RoutingStrategy | undefined;
  if (routingStrategy && Object.values(RoutingStrategy).includes(routingStrategy)) {
    builder.withRoutingStrategy(routingStrategy);
  }

  // Global settings
  const globalTimeout = parseInt(process.env.ORCHESTRATOR_GLOBAL_TIMEOUT_MS ?? '60000', 10);
  if (!isNaN(globalTimeout)) {
    builder.withGlobalTimeout(globalTimeout);
  }

  const enableCaching = process.env.ORCHESTRATOR_ENABLE_CACHING !== 'false';
  const cacheTtl = parseInt(process.env.ORCHESTRATOR_CACHE_TTL_MS ?? '300000', 10);
  builder.withCaching(enableCaching, isNaN(cacheTtl) ? undefined : cacheTtl);

  const enableMetrics = process.env.ORCHESTRATOR_ENABLE_METRICS !== 'false';
  builder.withMetrics(enableMetrics);

  const logLevel = (process.env.ORCHESTRATOR_LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') ?? 'info';
  builder.withLogLevel(logLevel);

  // Load providers from environment
  loadProvidersFromEnvironment(builder);

  return builder;
}

/**
 * Loads provider configurations from environment variables
 * Expected format: ORCHESTRATOR_PROVIDER_OPENAI_API_KEY, etc.
 */
function loadProvidersFromEnvironment(builder: OrchestratorConfigBuilder): void {
  const providerPrefixes = Object.values(AIProvider).map(p => p.toUpperCase());

  for (const provider of Object.values(AIProvider)) {
    const prefix = `ORCHESTRATOR_PROVIDER_${provider.toUpperCase()}`;
    const apiKey = process.env[`${prefix}_API_KEY`];
    const enabled = process.env[`${prefix}_ENABLED`] !== 'false';

    if (!apiKey && enabled) {
      logger.debug(`Skipping provider ${provider}: no API key configured`);
      continue;
    }

    const defaultModel = process.env[`${prefix}_DEFAULT_MODEL`];
    const availableModelsStr = process.env[`${prefix}_AVAILABLE_MODELS`];

    if (!defaultModel || !availableModelsStr) {
      logger.debug(`Skipping provider ${provider}: missing model configuration`);
      continue;
    }

    const availableModels = availableModelsStr.split(',').map(m => m.trim());
    const baseUrl = process.env[`${prefix}_BASE_URL`];
    const timeoutMs = parseInt(process.env[`${prefix}_TIMEOUT_MS`] ?? '30000', 10);
    const priority = parseInt(process.env[`${prefix}_PRIORITY`] ?? '50', 10);

    const providerConfig: ProviderConfig = {
      provider,
      apiKey,
      baseUrl,
      defaultModel,
      availableModels,
      timeoutMs: isNaN(timeoutMs) ? 30000 : timeoutMs,
      retryPolicy: DEFAULT_RETRY_POLICY,
      rateLimit: DEFAULT_RATE_LIMIT,
      enabled,
      priority: isNaN(priority) ? 50 : priority,
    };

    builder.withProvider(providerConfig);
    logger.info(`Loaded provider configuration`, { provider, enabled, priority });
  }
}

// =============================================================================
// Predefined Configurations
// =============================================================================

/**
 * Development configuration with relaxed settings
 */
export function createDevelopmentConfig(): OrchestratorConfig {
  return new OrchestratorConfigBuilder()
    .withVersion('1.0.0-dev')
    .withDefaultProvider(AIProvider.OPENAI)
    .withRoutingStrategy(RoutingStrategy.LATENCY_OPTIMIZED)
    .withCaching(false)
    .withMetrics(true)
    .withLogLevel('debug')
    .withGlobalTimeout(120000)
    .build();
}

/**
 * Production configuration with optimized settings
 */
export function createProductionConfig(): OrchestratorConfig {
  return new OrchestratorConfigBuilder()
    .withVersion('1.0.0')
    .withDefaultProvider(AIProvider.OPENAI)
    .withRoutingStrategy(RoutingStrategy.BALANCED)
    .withCaching(true, 300000)
    .withMetrics(true)
    .withLogLevel('info')
    .withGlobalTimeout(60000)
    .build();
}

/**
 * Testing configuration with minimal external dependencies
 */
export function createTestingConfig(): OrchestratorConfig {
  return new OrchestratorConfigBuilder()
    .withVersion('1.0.0-test')
    .withDefaultProvider(AIProvider.LOCAL)
    .withRoutingStrategy(RoutingStrategy.COST_OPTIMIZED)
    .withCaching(true, 60000)
    .withMetrics(false)
    .withLogLevel('error')
    .withGlobalTimeout(10000)
    .build();
}