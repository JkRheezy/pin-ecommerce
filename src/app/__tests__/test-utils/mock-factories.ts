/**
 * Mock Factories Module
 * 
 * Generates test data following the six-layer architecture.
 * Located in: src/app/__tests__/test-utils/mock-factories.ts
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  // Types Layer
  UUID,
  Timestamp,
  EntityId,
  ValidationResult,
  
  // Config Layer
  FeatureFlag,
  EnvironmentConfig,
  ServiceEndpoint,
  
  // Repo Layer
  RepositoryConfig,
  ConnectionPool,
  QueryOptions,
  
  // Service Layer
  ServiceRequest,
  ServiceResponse,
  BusinessRule,
  
  // Runtime Layer
  ExecutionContext,
  RuntimeMetrics,
  HealthStatus,
  
  // UI Layer
  ComponentProps,
  ViewState,
  UserInteraction
} from '../../types';

// =============================================================================
// Types Layer Factories
// =============================================================================

/**
 * Factory for generating UUIDs with optional seed for deterministic tests
 */
export function createMockUUID(seed?: string): UUID {
  if (seed) {
    // Deterministic UUID generation for reproducible tests
    const hash = seed.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0) | 0;
    }, 0);
    const hexHash = Math.abs(hash).toString(16).padStart(32, '0');
    return `${hexHash.slice(0, 8)}-${hexHash.slice(8, 12)}-4${hexHash.slice(13, 16)}-${hexHash.slice(16, 20)}-${hexHash.slice(20, 32)}` as UUID;
  }
  return uuidv4() as UUID;
}

/**
 * Factory for generating timestamps
 */
export function createMockTimestamp(options?: {
  offsetMs?: number;
  fixed?: Date;
}): Timestamp {
  const baseDate = options?.fixed ?? new Date();
  const offset = options?.offsetMs ?? 0;
  return (baseDate.getTime() + offset) as Timestamp;
}

/**
 * Factory for generating entity IDs with proper validation
 */
export function createMockEntityId(prefix: string, seed?: string): EntityId {
  if (!prefix || prefix.length === 0) {
    throw new Error('EntityId prefix is required');
  }
  const uuid = createMockUUID(seed);
  return `${prefix}_${uuid}` as EntityId;
}

/**
 * Factory for generating validation results
 */
export function createMockValidationResult(overrides?: Partial<ValidationResult>): ValidationResult {
  return {
    isValid: true,
    errors: [],
    warnings: [],
    ...overrides
  };
}

// =============================================================================
// Config Layer Factories
// =============================================================================

/**
 * Factory for generating feature flags
 */
export function createMockFeatureFlag(overrides?: Partial<FeatureFlag>): FeatureFlag {
  const id = createMockUUID(overrides?.name);
  
  return {
    id,
    name: overrides?.name ?? `feature_${id.slice(0, 8)}`,
    enabled: overrides?.enabled ?? false,
    rolloutPercentage: overrides?.rolloutPercentage ?? 0,
    targetUsers: overrides?.targetUsers ?? [],
    dependencies: overrides?.dependencies ?? [],
    createdAt: overrides?.createdAt ?? createMockTimestamp(),
    updatedAt: overrides?.updatedAt ?? createMockTimestamp(),
    ...overrides
  };
}

/**
 * Factory for generating environment configurations
 */
export function createMockEnvironmentConfig(overrides?: Partial<EnvironmentConfig>): EnvironmentConfig {
  const environment = overrides?.environment ?? 'development';
  
  return {
    environment,
    version: overrides?.version ?? '1.0.0',
    debug: overrides?.debug ?? environment === 'development',
    logLevel: overrides?.logLevel ?? (environment === 'production' ? 'warn' : 'debug'),
    featureFlags: overrides?.featureFlags ?? [],
    endpoints: overrides?.endpoints ?? [],
    ...overrides
  };
}

/**
 * Factory for generating service endpoints
 */
export function createMockServiceEndpoint(overrides?: Partial<ServiceEndpoint>): ServiceEndpoint {
  return {
    name: overrides?.name ?? `service_${createMockUUID().slice(0, 8)}`,
    url: overrides?.url ?? 'http://localhost:8080',
    timeout: overrides?.timeout ?? 30000,
    retryPolicy: overrides?.retryPolicy ?? {
      maxRetries: 3,
      backoffMs: 1000,
      maxBackoffMs: 30000
    },
    healthCheckPath: overrides?.healthCheckPath ?? '/health',
    ...overrides
  };
}

// =============================================================================
// Repo Layer Factories
// =============================================================================

/**
 * Factory for generating repository configurations
 */
export function createMockRepositoryConfig(overrides?: Partial<RepositoryConfig>): RepositoryConfig {
  return {
    name: overrides?.name ?? `repo_${createMockUUID().slice(0, 8)}`,
    connectionString: overrides?.connectionString ?? 'postgresql://localhost:5432/test',
    pool: overrides?.pool ?? createMockConnectionPool(),
    ssl: overrides?.ssl ?? false,
    migrationsPath: overrides?.migrationsPath ?? './migrations',
    ...overrides
  };
}

/**
 * Factory for generating connection pool configurations
 */
export function createMockConnectionPool(overrides?: Partial<ConnectionPool>): ConnectionPool {
  return {
    min: overrides?.min ?? 2,
    max: overrides?.max ?? 10,
    acquireTimeoutMs: overrides?.acquireTimeoutMs ?? 5000,
    idleTimeoutMs: overrides?.idleTimeoutMs ?? 30000,
    connectionTimeoutMs: overrides?.connectionTimeoutMs ?? 5000,
    ...overrides
  };
}

/**
 * Factory for generating query options
 */
export function createMockQueryOptions(overrides?: Partial<QueryOptions>): QueryOptions {
  return {
    limit: overrides?.limit ?? 100,
    offset: overrides?.offset ?? 0,
    orderBy: overrides?.orderBy ?? [],
    filters: overrides?.filters ?? {},
    includeDeleted: overrides?.includeDeleted ?? false,
    ...overrides
  };
}

// =============================================================================
// Service Layer Factories
// =============================================================================

/**
 * Factory for generating service requests
 */
export function createMockServiceRequest<T = unknown>(overrides?: Partial<ServiceRequest<T>>): ServiceRequest<T> {
  const requestId = createMockUUID();
  
  return {
    id: requestId,
    timestamp: createMockTimestamp(),
    correlationId: overrides?.correlationId ?? requestId,
    userId: overrides?.userId ?? createMockEntityId('user'),
    payload: overrides?.payload ?? {} as T,
    metadata: overrides?.metadata ?? {},
    ...overrides
  };
}

/**
 * Factory for generating service responses
 */
export function createMockServiceResponse<T = unknown>(overrides?: Partial<ServiceResponse<T>>): ServiceResponse<T> {
  return {
    success: overrides?.success ?? true,
    data: overrides?.data ?? undefined,
    error: overrides?.error ?? null,
    requestId: overrides?.requestId ?? createMockUUID(),
    timestamp: createMockTimestamp(),
    pagination: overrides?.pagination,
    ...overrides
  };
}

/**
 * Factory for generating business rules
 */
export function createMockBusinessRule(overrides?: Partial<BusinessRule>): BusinessRule {
  const ruleId = createMockEntityId('rule');
  
  return {
    id: ruleId,
    name: overrides?.name ?? `rule_${ruleId.slice(-8)}`,
    condition: overrides?.condition ?? () => true,
    action: overrides?.action ?? () => undefined,
    priority: overrides?.priority ?? 0,
    enabled: overrides?.enabled ?? true,
    ...overrides
  };
}

// =============================================================================
// Runtime Layer Factories
// =============================================================================

/**
 * Factory for generating execution contexts
 */
export function createMockExecutionContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    traceId: overrides?.traceId ?? createMockUUID(),
    spanId: overrides?.spanId ?? createMockUUID(),
    parentSpanId: overrides?.parentSpanId,
    startTime: overrides?.startTime ?? createMockTimestamp(),
    deadline: overrides?.deadline,
    baggage: overrides?.baggage ?? {},
    ...overrides
  };
}

/**
 * Factory for generating runtime metrics
 */
export function createMockRuntimeMetrics(overrides?: Partial<RuntimeMetrics>): RuntimeMetrics {
  return {
    cpuUsage: overrides?.cpuUsage ?? Math.random() * 100,
    memoryUsage: overrides?.memoryUsage ?? Math.random() * 1024 * 1024 * 1024,
    activeConnections: overrides?.activeConnections ?? Math.floor(Math.random() * 100),
    requestLatency: overrides?.requestLatency ?? Math.random() * 1000,
    errorRate: overrides?.errorRate ?? 0,
    timestamp: overrides?.timestamp ?? createMockTimestamp(),
    ...overrides
  };
}

/**
 * Factory for generating health status
 */
export function createMockHealthStatus(overrides?: Partial<HealthStatus>): HealthStatus {
  const status = overrides?.status ?? 'healthy';
  
  return {
    status,
    checks: overrides?.checks ?? {},
    timestamp: createMockTimestamp(),
    uptime: overrides?.uptime ?? 0,
    version: overrides?.version ?? '1.0.0',
    // Include degraded details only when status is not healthy
    ...(status !== 'healthy' && {
      degradedServices: overrides?.degradedServices ?? []
    }),
    ...overrides
  };
}

// =============================================================================
// UI Layer Factories
// =============================================================================

/**
 * Factory for generating component props
 */
export function createMockComponentProps<T = Record<string, unknown>>(
  overrides?: Partial<ComponentProps<T>>
): ComponentProps<T> {
  return {
    id: overrides?.id ?? createMockEntityId('comp'),
    testId: overrides?.testId,
    className: overrides?.className,
    style: overrides?.style,
    onMount: overrides?.onMount,
    onUnmount: overrides?.onUnmount,
    data: overrides?.data ?? {} as T,
    ...overrides
  };
}

/**
 * Factory for generating view states
 */
export function createMockViewState(overrides?: Partial<ViewState>): ViewState {
  const status = overrides?.status ?? 'idle';
  
  return {
    status,
    data: overrides?.data,
    error: overrides?.error,
    lastUpdated: overrides?.lastUpdated,
    // Include loading-specific fields
    ...(status === 'loading' && {
      progress: overrides?.progress ?? 0,
      cancelToken: overrides?.cancelToken
    }),
    // Include error-specific fields
    ...(status === 'error' && {
      retryCount: overrides?.retryCount ?? 0,
      canRetry: overrides?.canRetry ?? true
    }),
    ...overrides
  };
}

/**
 * Factory for generating user interactions
 */
export function createMockUserInteraction(overrides?: Partial<UserInteraction>): UserInteraction {
  const type = overrides?.type ?? 'click';
  
  return {
    type,
    timestamp: createMockTimestamp(),
    target: overrides?.target ?? { id: createMockEntityId('element'), tag: 'button' },
    // Include pointer-specific data for click/touch events
    ...(['click', 'touch', 'drag'].includes(type) && {
      coordinates: overrides?.coordinates ?? { x: 0, y: 0 }
    }),
    // Include keyboard-specific data for keyboard events
    ...(type === 'keyboard' && {
      key: overrides?.key ?? 'Enter',
      modifiers: overrides?.modifiers ?? []
    }),
    metadata: overrides?.metadata ?? {},
    ...overrides
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Creates an array of mock objects using a factory function
 */
export function createMockArray<T>(
  factory: (index: number) => T,
  count: number,
  options?: {
    uniqueBy?: keyof T;
    shuffle?: boolean;
  }
): T[] {
  if (count < 0) {
    throw new Error('Count must be non-negative');
  }
  
  const items: T[] = [];
  const seen = new Set<unknown>();
  
  for (let i = 0; i < count; i++) {
    let item = factory(i);
    
    // Ensure uniqueness if uniqueBy is specified
    if (options?.uniqueBy) {
      const key = item[options.uniqueBy];
      if (seen.has(key)) {
        // Regenerate with different seed to ensure uniqueness
        item = factory(i + count * 1000);
      }
      seen.add(item[options.uniqueBy]);
    }
    
    items.push(item);
  }
  
  // Shuffle if requested
  if (options?.shuffle) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
  }
  
  return items;
}

/**
 * Creates a factory with preset defaults for consistent test data
 */
export function createPresetFactory<T, O extends Record<string, unknown>>(
  baseFactory: (overrides?: Partial<O>) => O,
  presets: Record<string, Partial<O>>
) {
  return {
    create: (presetName?: string, overrides?: Partial<O>): O => {
      const preset = presetName ? presets[presetName] : {};
      if (presetName && !preset) {
        throw new Error(`Unknown preset: ${presetName}. Available: ${Object.keys(presets).join(', ')}`);
      }
      return baseFactory({ ...preset, ...overrides });
    },
    presets: Object.keys(presets)
  };
}

// =============================================================================
// Preset Configurations
// =============================================================================

export const FeatureFlagPresets = {
  enabled: { enabled: true, rolloutPercentage: 100 },
  disabled: { enabled: false, rolloutPercentage: 0 },
  gradual: { enabled: true, rolloutPercentage: 10 },
  targeted: { enabled: true, targetUsers: ['user_1', 'user_2'] }
};

export const EnvironmentPresets = {
  development: { environment: 'development' as const, debug: true, logLevel: 'debug' as const },
  staging: { environment: 'staging' as const, debug: true, logLevel: 'info' as const },
  production: { environment: 'production' as const, debug: false, logLevel: 'warn' as const }
};

export const ViewStatePresets = {
  idle: { status: 'idle' as const },
  loading: { status: 'loading' as const, progress: 0 },
  success: { status: 'success' as const, data: {} },
  error: { status: 'error' as const, error: new Error('Test error'), canRetry: true }
};

// Export preset factories
export const createFeatureFlagWithPreset = createPresetFactory(createMockFeatureFlag, FeatureFlagPresets);
export const createEnvironmentWithPreset = createPresetFactory(createMockEnvironmentConfig, EnvironmentPresets);
export const createViewStateWithPreset = createPresetFactory(createMockViewState, ViewStatePresets);