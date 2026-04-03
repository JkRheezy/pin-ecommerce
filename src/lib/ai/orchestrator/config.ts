/**
 * Orchestrator Configuration Module
 * 
 * Layer: Config (Layer 2)
 * 
 * This module defines configuration types and validation for the AI orchestrator.
 * It provides type-safe configuration with runtime validation and sensible defaults.
 */

import { z } from 'zod';
import { StructuredLogger } from '@harness/logging';

const logger = new StructuredLogger('OrchestratorConfig');

// ============================================================================
// Types Layer (Layer 1) - Embedded
// ============================================================================

/**
 * Supported LLM provider types
 */
export enum LLMProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  AZURE = 'azure',
  HARNESS = 'harness',
}

/**
 * Execution strategy for the orchestrator
 */
export enum ExecutionStrategy {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  ADAPTIVE = 'adaptive',
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Whether to use jitter */
  useJitter: boolean;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Failure threshold before opening circuit */
  failureThreshold: number;
  /** Recovery timeout in milliseconds */
  recoveryTimeoutMs: number;
  /** Half-open request count for testing */
  halfOpenRequests: number;
}

/**
 * LLM-specific configuration
 */
export interface LLMConfig {
  /** Provider type */
  provider: LLMProvider;
  /** Model identifier */
  model: string;
  /** Maximum tokens to generate */
  maxTokens: number;
  /** Temperature for sampling (0-2) */
  temperature: number;
  /** Top-p sampling parameter */
  topP?: number;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Provider-specific API configuration */
  apiConfig: Record<string, unknown>;
}

/**
 * Orchestrator feature flags
 */
export interface FeatureFlags {
  /** Enable streaming responses */
  enableStreaming: boolean;
  /** Enable caching of results */
  enableCaching: boolean;
  /** Enable request deduplication */
  enableDeduplication: boolean;
  /** Enable request tracing */
  enableTracing: boolean;
  /** Enable cost tracking */
  enableCostTracking: boolean;
}

/**
 * Complete orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Unique identifier for this configuration */
  id: string;
  /** Human-readable name */
  name: string;
  /** Execution strategy */
  strategy: ExecutionStrategy;
  /** Primary LLM configuration */
  primaryLLM: LLMConfig;
  /** Fallback LLM configuration (optional) */
  fallbackLLM?: LLMConfig;
  /** Retry policy */
  retryPolicy: RetryPolicy;
  /** Circuit breaker configuration */
  circuitBreaker: CircuitBreakerConfig;
  /** Feature flags */
  features: FeatureFlags;
  /** Cache TTL in milliseconds (0 = disabled) */
  cacheTtlMs: number;
  /** Maximum concurrent requests */
  maxConcurrentRequests: number;
  /** Request queue size limit */
  queueSizeLimit: number;
  /** Metadata for tracking */
  metadata: Record<string, string>;
}

// ============================================================================
// Validation Schemas (Zod)
// ============================================================================

const retryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(3),
  initialDelayMs: z.number().int().min(0).max(60000).default(1000),
  maxDelayMs: z.number().int().min(0).max(300000).default(30000),
  backoffMultiplier: z.number().min(1).max(10).default(2),
  useJitter: z.boolean().default(true),
});

const circuitBreakerSchema = z.object({
  failureThreshold: z.number().int().min(1).max(100).default(5),
  recoveryTimeoutMs: z.number().int().min(1000).max(300000).default(30000),
  halfOpenRequests: z.number().int().min(1).max(10).default(3),
});

const llmConfigSchema = z.object({
  provider: z.nativeEnum(LLMProvider),
  model: z.string().min(1),
  maxTokens: z.number().int().min(1).max(100000).default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
  topP: z.number().min(0).max(1).optional(),
  timeoutMs: z.number().int().min(1000).max(300000).default(60000),
  apiConfig: z.record(z.unknown()).default({}),
});

const featureFlagsSchema = z.object({
  enableStreaming: z.boolean().default(false),
  enableCaching: z.boolean().default(true),
  enableDeduplication: z.boolean().default(true),
  enableTracing: z.boolean().default(false),
  enableCostTracking: z.boolean().default(false),
});

export const orchestratorConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  strategy: z.nativeEnum(ExecutionStrategy).default(ExecutionStrategy.ADAPTIVE),
  primaryLLM: llmConfigSchema,
  fallbackLLM: llmConfigSchema.optional(),
  retryPolicy: retryPolicySchema,
  circuitBreaker: circuitBreakerSchema,
  features: featureFlagsSchema,
  cacheTtlMs: z.number().int().min(0).default(300000),
  maxConcurrentRequests: z.number().int().min(1).max(1000).default(10),
  queueSizeLimit: z.number().int().min(0).max(10000).default(100),
  metadata: z.record(z.string()).default({}),
});

// ============================================================================
// Configuration Builder & Factory
// ============================================================================

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Readonly<Partial<OrchestratorConfig>> = {
  strategy: ExecutionStrategy.ADAPTIVE,
  retryPolicy: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    useJitter: true,
  },
  circuitBreaker: {
    failureThreshold: 5,
    recoveryTimeoutMs: 30000,
    halfOpenRequests: 3,
  },
  features: {
    enableStreaming: false,
    enableCaching: true,
    enableDeduplication: true,
    enableTracing: false,
    enableCostTracking: false,
  },
  cacheTtlMs: 300000,
  maxConcurrentRequests: 10,
  queueSizeLimit: 100,
  metadata: {},
} as const;

/**
 * Configuration builder for fluent configuration construction
 */
export class OrchestratorConfigBuilder {
  private config: Partial<OrchestratorConfig> = {};

  constructor(initialConfig?: Partial<OrchestratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...initialConfig };
  }

  withId(id: string): this {
    this.config.id = id;
    return this;
  }

  withName(name: string): this {
    this.config.name = name;
    return this;
  }

  withStrategy(strategy: ExecutionStrategy): this {
    this.config.strategy = strategy;
    return this;
  }

  withPrimaryLLM(llmConfig: LLMConfig): this {
    this.config.primaryLLM = llmConfig;
    return this;
  }

  withFallbackLLM(llmConfig: LLMConfig): this {
    this.config.fallbackLLM = llmConfig;
    return this;
  }

  withRetryPolicy(policy: Partial<RetryPolicy>): this {
    this.config.retryPolicy = { ...this.config.retryPolicy, ...policy } as RetryPolicy;
    return this;
  }

  withCircuitBreaker(config: Partial<CircuitBreakerConfig>): this {
    this.config.circuitBreaker = { ...this.config.circuitBreaker, ...config } as CircuitBreakerConfig;
    return this;
  }

  withFeatures(features: Partial<FeatureFlags>): this {
    this.config.features = { ...this.config.features, ...features } as FeatureFlags;
    return this;
  }

  withCacheTtl(ttlMs: number): this {
    this.config.cacheTtlMs = ttlMs;
    return this;
  }

  withConcurrency(maxConcurrent: number): this {
    this.config.maxConcurrentRequests = maxConcurrent;
    return this;
  }

  withQueueLimit(limit: number): this {
    this.config.queueSizeLimit = limit;
    return this;
  }

  withMetadata(metadata: Record<string, string>): this {
    this.config.metadata = { ...this.config.metadata, ...metadata };
    return this;
  }

  /**
   * Build and validate the final configuration
   * @throws {ZodError} if validation fails
   */
  build(): OrchestratorConfig {
    const result = orchestratorConfigSchema.safeParse(this.config);
    
    if (!result.success) {
      logger.error('Configuration validation failed', {
        errors: result.error.errors,
        config: this.config,
      });
      throw new ConfigValidationError('Invalid orchestrator configuration', result.error);
    }

    logger.info('Configuration built successfully', {
      configId: result.data.id,
      name: result.data.name,
      provider: result.data.primaryLLM.provider,
    });

    return result.data;
  }
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly validationError: z.ZodError
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Configuration not found error
 */
export class ConfigNotFoundError extends Error {
  constructor(configId: string) {
    super(`Configuration not found: ${configId}`);
    this.name = 'ConfigNotFoundError';
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate a partial configuration object
 * Returns validation result without throwing
 */
export function validatePartialConfig(
  config: unknown
): { success: true; data: Partial<OrchestratorConfig> } | { success: false; errors: z.ZodError } {
  const result = orchestratorConfigSchema.partial().safeParse(config);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return { success: false, errors: result.error };
}

/**
 * Merge configurations with precedence (later configs override earlier ones)
 */
export function mergeConfigs(
  ...configs: Array<Partial<OrchestratorConfig>>
): Partial<OrchestratorConfig> {
  return configs.reduce((merged, current) => {
    return {
      ...merged,
      ...current,
      // Deep merge for nested objects
      retryPolicy: { ...merged.retryPolicy, ...current.retryPolicy },
      circuitBreaker: { ...merged.circuitBreaker, ...current.circuitBreaker },
      features: { ...merged.features, ...current.features },
      primaryLLM: current.primaryLLM 
        ? { ...merged.primaryLLM, ...current.primaryLLM }
        : merged.primaryLLM,
      metadata: { ...merged.metadata, ...current.metadata },
    };
  }, {} as Partial<OrchestratorConfig>);
}

/**
 * Create a safe configuration with environment-based overrides
 */
export function createSafeConfig(
  baseConfig: Partial<OrchestratorConfig>
): OrchestratorConfig {
  // Apply environment overrides
  const envOverrides: Partial<OrchestratorConfig> = {
    features: {
      enableTracing: process.env.ORCHESTRATOR_ENABLE_TRACING === 'true',
      enableCostTracking: process.env.ORCHESTRATOR_ENABLE_COST_TRACKING === 'true',
      enableStreaming: process.env.ORCHESTRATOR_ENABLE_STREAMING === 'true',
      enableCaching: process.env.ORCHESTRATOR_ENABLE_CACHING !== 'false',
      enableDeduplication: process.env.ORCHESTRATOR_ENABLE_DEDUPLICATION !== 'false',
    },
    maxConcurrentRequests: process.env.ORCHESTRATOR_MAX_CONCURRENT
      ? parseInt(process.env.ORCHESTRATOR_MAX_CONCURRENT, 10)
      : undefined,
    cacheTtlMs: process.env.ORCHESTRATOR_CACHE_TTL_MS
      ? parseInt(process.env.ORCHESTRATOR_CACHE_TTL_MS, 10)
      : undefined,
  };

  const merged = mergeConfigs(DEFAULT_CONFIG, baseConfig, envOverrides);
  
  // Ensure required fields are present with defaults
  const withDefaults: Partial<OrchestratorConfig> = {
    ...merged,
    id: merged.id || crypto.randomUUID(),
    name: merged.name || 'default-orchestrator',
    primaryLLM: merged.primaryLLM || {
      provider: LLMProvider.HARNESS,
      model: 'gpt-4',
      maxTokens: 4096,
      temperature: 0.7,
      timeoutMs: 60000,
      apiConfig: {},
    },
  };

  return new OrchestratorConfigBuilder(withDefaults).build();
}

/**
 * Serialize configuration for storage (excludes sensitive data)
 */
export function serializeConfig(config: OrchestratorConfig): string {
  // Create a sanitized copy without sensitive API keys
  const sanitized: Partial<OrchestratorConfig> = {
    ...config,
    primaryLLM: {
      ...config.primaryLLM,
      apiConfig: Object.keys(config.primaryLLM.apiConfig).reduce((acc, key) => {
        acc[key] = key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')
          ? '[REDACTED]'
          : config.primaryLLM.apiConfig[key];
        return acc;
      }, {} as Record<string, unknown>),
    },
  };

  if (sanitized.fallbackLLM) {
    sanitized.fallbackLLM = {
      ...sanitized.fallbackLLM,
      apiConfig: Object.keys(sanitized.fallbackLLM.apiConfig).reduce((acc, key) => {
        acc[key] = key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')
          ? '[REDACTED]'
          : sanitized.fallbackLLM!.apiConfig[key];
        return acc;
      }, {} as Record<string, unknown>),
    };
  }

  return JSON.stringify(sanitized, null, 2);
}

// ============================================================================
// Predefined Configurations
// ============================================================================

/**
 * Development configuration with relaxed settings
 */
export const DEV_CONFIG: Partial<OrchestratorConfig> = {
  name: 'dev-orchestrator',
  strategy: ExecutionStrategy.SEQUENTIAL,
  retryPolicy: {
    maxAttempts: 1,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 1,
    useJitter: false,
  },
  features: {
    enableStreaming: true,
    enableCaching: false,
    enableDeduplication: false,
    enableTracing: true,
    enableCostTracking: true,
  },
  cacheTtlMs: 0,
  maxConcurrentRequests: 5,
};

/**
 * Production configuration with conservative settings
 */
export const PROD_CONFIG: Partial<OrchestratorConfig> = {
  name: 'prod-orchestrator',
  strategy: ExecutionStrategy.ADAPTIVE,
  retryPolicy: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    useJitter: true,
  },
  features: {
    enableStreaming: false,
    enableCaching: true,
    enableDeduplication: true,
    enableTracing: false,
    enableCostTracking: true,
  },
  cacheTtlMs: 600000,
  maxConcurrentRequests: 50,
  queueSizeLimit: 500,
};

/**
 * High-performance configuration for latency-sensitive workloads
 */
export const HIGH_PERF_CONFIG: Partial<OrchestratorConfig> = {
  name: 'high-perf-orchestrator',
  strategy: ExecutionStrategy.PARALLEL,
  retryPolicy: {
    maxAttempts: 2,
    initialDelayMs: 50,
    maxDelayMs: 5000,
    backoffMultiplier: 1.5,
    useJitter: true,
  },
  features: {
    enableStreaming: true,
    enableCaching: true,
    enableDeduplication: true,
    enableTracing: false,
    enableCostTracking: false,
  },
  cacheTtlMs: 60000,
  maxConcurrentRequests: 100,
  queueSizeLimit: 1000,
};