/**
 * Mocks Module
 * 
 * Provides factory functions and fixtures for generating mock data
 * used in unit and integration tests. Follows the six-layer architecture
 * for consistent test data across all layers.
 * 
 * @module test-utils/mocks
 */

import type {
  // Types layer imports
  UUID,
  Timestamp,
  EntityStatus,
  PaginationParams,
  SortDirection,
  
  // Config layer imports
  AppConfig,
  FeatureFlag,
  EnvironmentConfig,
  
  // Repo layer imports
  Repository,
  QueryOptions,
  FilterCriteria,
  
  // Service layer imports
  ServiceResponse,
  ValidationError,
  BusinessRule,
  
  // Runtime layer imports
  ExecutionContext,
  RequestMetadata,
  UserContext,
  
  // UI layer imports
  ComponentProps,
  ViewState,
  InteractionEvent
} from '../../types';

// ============================================================================
// Types Layer Mocks
// ============================================================================

/**
 * Generates a valid UUID v4 string for testing
 */
export const generateMockUUID = (): UUID => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0;
    const value = char === 'x' ? random : (random & 0x3 | 0x8);
    return value.toString(16);
  }) as UUID;
};

/**
 * Creates a mock timestamp with optional offset from now
 */
export const createMockTimestamp = (offsetMs: number = 0): Timestamp => {
  const base = Date.now();
  return (base + offsetMs) as Timestamp;
};

/**
 * Mock entity status values for testing state transitions
 */
export const MOCK_ENTITY_STATUSES: Record<string, EntityStatus> = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
  ARCHIVED: 'archived',
  ERROR: 'error'
} as const;

// ============================================================================
// Config Layer Mocks
// ============================================================================

/**
 * Factory for creating mock application configuration
 */
export const createMockAppConfig = (overrides?: Partial<AppConfig>): AppConfig => {
  const defaults: AppConfig = {
    apiBaseUrl: 'https://api.harness.example.com',
    apiVersion: 'v1',
    defaultTimeout: 30000,
    maxRetries: 3,
    enableCaching: true,
    cacheTTL: 300000,
    logLevel: 'info',
    featureFlags: createMockFeatureFlags(),
    ...overrides
  };

  return defaults;
};

/**
 * Factory for creating mock feature flags
 */
export const createMockFeatureFlags = (overrides?: Record<string, boolean>): Record<string, FeatureFlag> => {
  const defaults: Record<string, FeatureFlag> = {
    newDashboard: {
      key: 'newDashboard',
      enabled: false,
      rolloutPercentage: 0,
      targetUsers: []
    },
    advancedFiltering: {
      key: 'advancedFiltering',
      enabled: true,
      rolloutPercentage: 100,
      targetUsers: []
    },
    experimentalUI: {
      key: 'experimentalUI',
      enabled: false,
      rolloutPercentage: 10,
      targetUsers: ['beta-tester-1', 'beta-tester-2']
    }
  };

  return { ...defaults, ...overrides };
};

/**
 * Factory for creating environment-specific configuration
 */
export const createMockEnvironmentConfig = (
  environment: 'development' | 'staging' | 'production' = 'development',
  overrides?: Partial<EnvironmentConfig>
): EnvironmentConfig => {
  const configs: Record<string, EnvironmentConfig> = {
    development: {
      environment: 'development',
      debug: true,
      mockExternalServices: true,
      enableHotReload: true,
      database: {
        host: 'localhost',
        port: 5432,
        name: 'harness_dev',
        ssl: false
      }
    },
    staging: {
      environment: 'staging',
      debug: true,
      mockExternalServices: false,
      enableHotReload: false,
      database: {
        host: 'staging-db.harness.internal',
        port: 5432,
        name: 'harness_staging',
        ssl: true
      }
    },
    production: {
      environment: 'production',
      debug: false,
      mockExternalServices: false,
      enableHotReload: false,
      database: {
        host: 'prod-db.harness.internal',
        port: 5432,
        name: 'harness_prod',
        ssl: true
      }
    }
  };

  const baseConfig = configs[environment];
  if (!baseConfig) {
    throw new Error(`Unknown environment: ${environment}`);
  }

  return { ...baseConfig, ...overrides };
};

// ============================================================================
// Repo Layer Mocks
// ============================================================================

/**
 * Factory for creating mock repository instances
 */
export const createMockRepository = <T extends { id: UUID }>(
  initialData: T[] = [],
  overrides?: Partial<Repository<T>>
): Repository<T> => {
  const dataStore = new Map<UUID, T>(initialData.map(item => [item.id, item]));

  const repository: Repository<T> = {
    findById: async (id: UUID): Promise<T | null> => {
      const result = dataStore.get(id);
      return result ?? null;
    },

    findAll: async (options?: QueryOptions<T>): Promise<T[]> => {
      let results = Array.from(dataStore.values());

      // Apply filtering
      if (options?.filter) {
        results = results.filter(item => 
          Object.entries(options.filter!).every(([key, value]) => 
            (item as Record<string, unknown>)[key] === value
          )
        );
      }

      // Apply sorting
      if (options?.sort) {
        const { field, direction } = options.sort;
        results.sort((a, b) => {
          const aVal = (a as Record<string, unknown>)[field as string];
          const bVal = (b as Record<string, unknown>)[field as string];
          const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return direction === SortDirection.DESC ? -comparison : comparison;
        });
      }

      // Apply pagination
      if (options?.pagination) {
        const { page = 1, limit = 20 } = options.pagination;
        const start = (page - 1) * limit;
        results = results.slice(start, start + limit);
      }

      return results;
    },

    create: async (entity: Omit<T, 'id'>): Promise<T> => {
      const id = generateMockUUID();
      const newEntity = { ...entity, id } as T;
      dataStore.set(id, newEntity);
      return newEntity;
    },

    update: async (id: UUID, updates: Partial<T>): Promise<T | null> => {
      const existing = dataStore.get(id);
      if (!existing) return null;
      
      const updated = { ...existing, ...updates, id };
      dataStore.set(id, updated);
      return updated;
    },

    delete: async (id: UUID): Promise<boolean> => {
      return dataStore.delete(id);
    },

    count: async (filter?: FilterCriteria<T>): Promise<number> => {
      if (!filter) return dataStore.size;
      
      return Array.from(dataStore.values()).filter(item =>
        Object.entries(filter).every(([key, value]) => 
          (item as Record<string, unknown>)[key] === value
        )
      ).length;
    },

    ...overrides
  };

  return repository;
};

/**
 * Creates mock pagination parameters
 */
export const createMockPaginationParams = (
  overrides?: Partial<PaginationParams>
): PaginationParams => ({
  page: 1,
  limit: 20,
  ...overrides
});

// ============================================================================
// Service Layer Mocks
// ============================================================================

/**
 * Factory for creating successful service responses
 */
export const createMockSuccessResponse = <T>(data: T, meta?: Record<string, unknown>): ServiceResponse<T> => ({
  success: true,
  data,
  meta: {
    timestamp: createMockTimestamp(),
    requestId: generateMockUUID(),
    ...meta
  },
  errors: []
});

/**
 * Factory for creating error service responses
 */
export const createMockErrorResponse = <T>(
  errors: ValidationError[],
  partialData?: Partial<T>
): ServiceResponse<T> => ({
  success: false,
  data: null as unknown as T,
  partialData,
  meta: {
    timestamp: createMockTimestamp(),
    requestId: generateMockUUID()
  },
  errors
});

/**
 * Creates a mock validation error
 */
export const createMockValidationError = (
  field: string,
  message: string,
  code: string = 'VALIDATION_ERROR'
): ValidationError => ({
  field,
  message,
  code,
  severity: 'error'
});

/**
 * Factory for creating mock business rules
 */
export const createMockBusinessRule = (overrides?: Partial<BusinessRule>): BusinessRule => ({
  id: generateMockUUID(),
  name: 'default-rule',
  description: 'A mock business rule for testing',
  condition: () => true,
  action: async () => ({ success: true }),
  priority: 100,
  enabled: true,
  ...overrides
});

// ============================================================================
// Runtime Layer Mocks
// ============================================================================

/**
 * Factory for creating mock execution contexts
 */
export const createMockExecutionContext = (overrides?: Partial<ExecutionContext>): ExecutionContext => ({
  contextId: generateMockUUID(),
  requestMetadata: createMockRequestMetadata(),
  userContext: createMockUserContext(),
  startTime: createMockTimestamp(),
  traceId: generateMockUUID(),
  ...overrides
});

/**
 * Factory for creating mock request metadata
 */
export const createMockRequestMetadata = (overrides?: Partial<RequestMetadata>): RequestMetadata => ({
  requestId: generateMockUUID(),
  correlationId: generateMockUUID(),
  clientIp: '127.0.0.1',
  userAgent: 'Mozilla/5.0 (Test Environment)',
  origin: 'https://app.harness.example.com',
  ...overrides
});

/**
 * Factory for creating mock user contexts
 */
export const createMockUserContext = (overrides?: Partial<UserContext>): UserContext => {
  const defaults: UserContext = {
    userId: generateMockUUID(),
    username: 'test.user',
    email: 'test.user@example.com',
    roles: ['user'],
    permissions: ['read:own', 'write:own'],
    sessionId: generateMockUUID(),
    authenticatedAt: createMockTimestamp(-3600000), // 1 hour ago
    mfaVerified: false
  };

  // Apply role-based permission expansion
  const withRoles = applyRolePermissions(defaults);
  
  return { ...withRoles, ...overrides };
};

/**
 * Helper to expand role-based permissions
 */
const applyRolePermissions = (context: UserContext): UserContext => {
  const rolePermissions: Record<string, string[]> = {
    admin: ['read:all', 'write:all', 'delete:all', 'admin:access'],
    moderator: ['read:all', 'write:all', 'delete:own'],
    user: ['read:own', 'write:own'],
    guest: ['read:public']
  };

  const expandedPermissions = new Set(context.permissions);
  
  for (const role of context.roles) {
    const perms = rolePermissions[role];
    if (perms) {
      perms.forEach(p => expandedPermissions.add(p));
    }
  }

  return {
    ...context,
    permissions: Array.from(expandedPermissions)
  };
};

// ============================================================================
// UI Layer Mocks
// ============================================================================

/**
 * Factory for creating mock component props with common patterns
 */
export const createMockComponentProps = <T extends Record<string, unknown>>(
  componentName: string,
  overrides?: T
): ComponentProps & T => {
  const baseProps: ComponentProps = {
    id: generateMockUUID(),
    testId: `${componentName}-test`,
    className: `harness-${componentName.toLowerCase()}`,
    style: {},
    disabled: false,
    loading: false,
    onFocus: jest.fn(),
    onBlur: jest.fn()
  };

  return { ...baseProps, ...overrides } as ComponentProps & T;
};

/**
 * Factory for creating mock view states
 */
export const createMockViewState = <T extends Record<string, unknown>>(
  overrides?: Partial<ViewState<T>>
): ViewState<T> => ({
  status: 'idle',
  data: null as unknown as T,
  error: null,
  lastUpdated: null,
  isStale: false,
  ...overrides
});

/**
 * Factory for creating mock interaction events
 */
export const createMockInteractionEvent = <T = unknown>(
  type: string,
  overrides?: Partial<InteractionEvent<T>>
): InteractionEvent<T> => ({
  id: generateMockUUID(),
  type,
  timestamp: createMockTimestamp(),
  target: { id: generateMockUUID(), type: 'component' },
  payload: {} as T,
  bubbles: true,
  cancelable: true,
  defaultPrevented: false,
  ...overrides
});

// ============================================================================
// Fixture Collections
// ============================================================================

/**
 * Pre-defined fixture collections for common test scenarios
 */
export const Fixtures = {
  /**
   * User fixtures for authentication and authorization tests
   */
  users: {
    admin: () => createMockUserContext({
      username: 'admin.user',
      email: 'admin@example.com',
      roles: ['admin']
    }),
    
    standard: () => createMockUserContext({
      username: 'standard.user',
      email: 'user@example.com',
      roles: ['user']
    }),
    
    guest: () => createMockUserContext({
      username: 'guest.user',
      email: 'guest@example.com',
      roles: ['guest'],
      permissions: ['read:public']
    }),
    
    unauthenticated: () => null
  },

  /**
   * Environment configuration fixtures
   */
  environments: {
    development: () => createMockEnvironmentConfig('development'),
    staging: () => createMockEnvironmentConfig('staging'),
    production: () => createMockEnvironmentConfig('production')
  },

  /**
   * View state fixtures for UI testing
   */
  viewStates: {
    idle: <T>() => createMockViewState<T>({ status: 'idle' }),
    loading: <T>() => createMockViewState<T>({ status: 'loading' }),
    success: <T>(data: T) => createMockViewState<T>({ 
      status: 'success', 
      data, 
      lastUpdated: createMockTimestamp() 
    }),
    error: <T>(error: Error) => createMockViewState<T>({ 
      status: 'error', 
      error 
    }),
    stale: <T>(data: T) => createMockViewState<T>({ 
      status: 'success', 
      data, 
      lastUpdated: createMockTimestamp(-3600000),
      isStale: true 
    })
  }
} as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Seeds a mock repository with generated test data
 */
export const seedMockRepository = <T extends { id: UUID }>(
  repository: Repository<T>,
  count: number,
  factory: (index: number) => Omit<T, 'id'>
): Promise<T[]> => {
  const promises = Array.from({ length: count }, (_, index) => 
    repository.create(factory(index))
  );
  return Promise.all(promises);
};

/**
 * Creates a delayed promise for testing async operations
 */
export const createMockDelay = (ms: number = 100): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generates a sequence of mock timestamps for time-based testing
 */
export const generateTimestampSequence = (
  count: number,
  intervalMs: number = 1000
): Timestamp[] => {
  const base = Date.now();
  return Array.from({ length: count }, (_, i) => 
    (base + (i * intervalMs)) as Timestamp
  );
};

/**
 * Type guard to check if a value is a valid mock UUID
 */
export const isMockUUID = (value: unknown): value is UUID => {
  if (typeof value !== 'string') return false;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(value);
};