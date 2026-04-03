/**
 * Mock implementations for test types
 * Layer: Test Types (Test Support Layer)
 * 
 * This module provides mock implementations for testing across all six layers
 * of the architecture. Mocks follow the same structure as production code
 * to ensure type safety and predictable behavior in tests.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  // Types layer
  EntityId,
  Timestamp,
  AuditFields,
  ValidationResult,
  
  // Config layer
  AppConfig,
  FeatureFlag,
  Environment,
  
  // Repo layer
  Repository,
  QueryOptions,
  PaginatedResult,
  
  // Service layer
  Service,
  ServiceError,
  ServiceResult,
  
  // Runtime layer
  RuntimeContext,
  ExecutionContext,
  Logger,
  
  // UI layer
  ComponentProps,
  ComponentState,
  ViewModel,
} from '../../types';

// ============================================================================
// Types Layer Mocks
// ============================================================================

/**
 * Generates a valid UUID v4 for entity IDs
 */
export const mockEntityId = (): EntityId => uuidv4();

/**
 * Generates a valid ISO timestamp
 */
export const mockTimestamp = (): Timestamp => new Date().toISOString();

/**
 * Creates mock audit fields for entities
 */
export const mockAuditFields = (overrides?: Partial<AuditFields>): AuditFields => ({
  createdAt: mockTimestamp(),
  updatedAt: mockTimestamp(),
  createdBy: 'test-user',
  updatedBy: 'test-user',
  version: 1,
  ...overrides,
});

/**
 * Creates a successful validation result
 */
export const mockValidResult = (): ValidationResult => ({
  isValid: true,
  errors: [],
});

/**
 * Creates a failed validation result with specified errors
 */
export const mockInvalidResult = (errors: string[]): ValidationResult => ({
  isValid: false,
  errors,
});

// ============================================================================
// Config Layer Mocks
// ============================================================================

/**
 * Default test configuration
 * Isolated from production config to prevent test pollution
 */
export const mockAppConfig = (overrides?: Partial<AppConfig>): AppConfig => ({
  environment: 'test' as Environment,
  apiBaseUrl: 'http://localhost:3000/api',
  featureFlags: {
    newDashboard: true,
    experimentalFeature: false,
  },
  timeouts: {
    request: 5000,
    session: 3600000,
  },
  ...overrides,
});

/**
 * Creates a feature flag mock
 */
export const mockFeatureFlag = (
  key: string,
  enabled: boolean,
  overrides?: Partial<FeatureFlag>
): FeatureFlag => ({
  key,
  enabled,
  description: `Test feature flag: ${key}`,
  rolloutPercentage: enabled ? 100 : 0,
  ...overrides,
});

// ============================================================================
// Repo Layer Mocks
// ============================================================================

/**
 * In-memory repository implementation for testing
 * Provides CRUD operations with type safety
 */
export class MockRepository<T extends { id: EntityId }> implements Repository<T> {
  private storage: Map<EntityId, T> = new Map();

  /**
   * Clears all stored entities
   */
  clear(): void {
    this.storage.clear();
  }

  /**
   * Returns count of stored entities
   */
  count(): number {
    return this.storage.size;
  }

  /**
   * Retrieves all entities matching query options
   */
  async findAll(options?: QueryOptions<T>): Promise<PaginatedResult<T>> {
    let items = Array.from(this.storage.values());

    // Apply filtering if provided
    if (options?.filter) {
      items = items.filter((item) => {
        return Object.entries(options.filter!).every(([key, value]) => {
          return (item as Record<string, unknown>)[key] === value;
        });
      });
    }

    // Apply sorting
    if (options?.sortBy) {
      const { field, direction } = options.sortBy;
      items.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[field as string];
        const bVal = (b as Record<string, unknown>)[field as string];
        const comparison = String(aVal).localeCompare(String(bVal));
        return direction === 'desc' ? -comparison : comparison;
      });
    }

    // Calculate pagination
    const page = options?.pagination?.page ?? 1;
    const limit = options?.pagination?.limit ?? 20;
    const total = items.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedItems = items.slice(startIndex, startIndex + limit);

    return {
      items: paginatedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Retrieves a single entity by ID
   */
  async findById(id: EntityId): Promise<T | null> {
    return this.storage.get(id) ?? null;
  }

  /**
   * Creates a new entity
   */
  async create(data: Omit<T, 'id'>): Promise<T> {
    const id = mockEntityId();
    const entity = { ...data, id } as T;
    this.storage.set(id, entity);
    return entity;
  }

  /**
   * Updates an existing entity
   */
  async update(id: EntityId, data: Partial<T>): Promise<T | null> {
    const existing = this.storage.get(id);
    if (!existing) {
      return null;
    }
    const updated = { ...existing, ...data, id } as T;
    this.storage.set(id, updated);
    return updated;
  }

  /**
   * Deletes an entity by ID
   */
  async delete(id: EntityId): Promise<boolean> {
    return this.storage.delete(id);
  }

  /**
   * Checks if an entity exists
   */
  async exists(id: EntityId): Promise<boolean> {
    return this.storage.has(id);
  }

  /**
   * Seeds the repository with test data
   */
  seed(items: T[]): void {
    items.forEach((item) => {
      this.storage.set(item.id, item);
    });
  }
}

// ============================================================================
// Service Layer Mocks
// ============================================================================

/**
 * Standard service error for testing
 */
export const mockServiceError = (
  code: string,
  message: string,
  details?: Record<string, unknown>
): ServiceError => ({
  code,
  message,
  details,
  timestamp: mockTimestamp(),
  recoverable: false,
});

/**
 * Creates a successful service result
 */
export const mockSuccessResult = <T>(data: T): ServiceResult<T> => ({
  success: true,
  data,
  error: null,
});

/**
 * Creates a failed service result
 */
export const mockFailureResult = <T>(error: ServiceError): ServiceResult<T> => ({
  success: false,
  data: null,
  error,
});

/**
 * Mock service implementation for testing
 */
export class MockService<T extends { id: EntityId }> implements Service<T> {
  private repository: MockRepository<T>;
  private shouldFailNext = false;
  private nextError?: ServiceError;

  constructor(repository?: MockRepository<T>) {
    this.repository = repository ?? new MockRepository<T>();
  }

  /**
   * Configures the next operation to fail with specified error
   */
  setNextFailure(error: ServiceError): void {
    this.shouldFailNext = true;
    this.nextError = error;
  }

  /**
   * Clears any configured failure
   */
  clearFailure(): void {
    this.shouldFailNext = false;
    this.nextError = undefined;
  }

  private async executeWithFailureCheck<R>(operation: () => Promise<R>): Promise<ServiceResult<R>> {
    if (this.shouldFailNext && this.nextError) {
      this.shouldFailNext = false;
      return mockFailureResult(this.nextError);
    }
    try {
      const result = await operation();
      return mockSuccessResult(result);
    } catch (error) {
      return mockFailureResult(
        mockServiceError(
          'OPERATION_FAILED',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
    }
  }

  async getAll(options?: QueryOptions<T>): Promise<ServiceResult<PaginatedResult<T>>> {
    return this.executeWithFailureCheck(() => this.repository.findAll(options));
  }

  async getById(id: EntityId): Promise<ServiceResult<T | null>> {
    return this.executeWithFailureCheck(() => this.repository.findById(id));
  }

  async create(data: Omit<T, 'id'>): Promise<ServiceResult<T>> {
    return this.executeWithFailureCheck(() => this.repository.create(data));
  }

  async update(id: EntityId, data: Partial<T>): Promise<ServiceResult<T | null>> {
    return this.executeWithFailureCheck(() => this.repository.update(id, data));
  }

  async delete(id: EntityId): Promise<ServiceResult<boolean>> {
    return this.executeWithFailureCheck(() => this.repository.delete(id));
  }
}

// ============================================================================
// Runtime Layer Mocks
// ============================================================================

/**
 * Structured logger mock that captures log entries for assertions
 */
export class MockLogger implements Logger {
  private logs: Array<{ level: string; message: string; meta?: Record<string, unknown> }> = [];

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'debug', message, meta });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'info', message, meta });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'warn', message, meta });
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'error', message, meta });
  }

  /**
   * Retrieves all captured logs
   */
  getLogs(): Array<{ level: string; message: string; meta?: Record<string, unknown> }> {
    return [...this.logs];
  }

  /**
   * Retrieves logs filtered by level
   */
  getLogsByLevel(level: string): Array<{ message: string; meta?: Record<string, unknown> }> {
    return this.logs
      .filter((log) => log.level === level)
      .map(({ message, meta }) => ({ message, meta }));
  }

  /**
   * Clears all captured logs
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Asserts that a specific message was logged
   */
  assertLogged(level: string, messagePattern: RegExp): boolean {
    return this.logs.some(
      (log) => log.level === level && messagePattern.test(log.message)
    );
  }
}

/**
 * Creates a mock runtime context
 */
export const mockRuntimeContext = (overrides?: Partial<RuntimeContext>): RuntimeContext => ({
  requestId: mockEntityId(),
  timestamp: mockTimestamp(),
  logger: new MockLogger(),
  config: mockAppConfig(),
  ...overrides,
});

/**
 * Creates a mock execution context
 */
export const mockExecutionContext = (overrides?: Partial<ExecutionContext>): ExecutionContext => ({
  runtime: mockRuntimeContext(),
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    permissions: ['read', 'write'],
  },
  ...overrides,
});

// ============================================================================
// UI Layer Mocks
// ============================================================================

/**
 * Creates mock component props with required fields
 */
export const mockComponentProps = <T extends Record<string, unknown>>(
  overrides?: T
): ComponentProps & T => ({
  id: 'test-component',
  className: '',
  testId: 'test-component',
  ...overrides,
} as ComponentProps & T);

/**
 * Creates mock component state
 */
export const mockComponentState = <T>(overrides?: Partial<ComponentState<T>>): ComponentState<T> => ({
  isLoading: false,
  error: null,
  data: null as unknown as T,
  ...overrides,
});

/**
 * Creates a mock view model
 */
export const mockViewModel = <T>(data: T, overrides?: Partial<ViewModel<T>>): ViewModel<T> => ({
  data,
  isLoading: false,
  error: null,
  isStale: false,
  lastUpdated: mockTimestamp(),
  ...overrides,
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Creates a delayed promise for testing async operations
 */
export const mockDelayedResponse = <T>(
  data: T,
  delayMs: number = 100
): Promise<T> => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(data), delayMs);
  });
};

/**
 * Creates a rejected promise for testing error handling
 */
export const mockRejectedResponse = <T>(
  error: Error,
  delayMs: number = 0
): Promise<T> => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(error), delayMs);
  });
};

/**
 * Resets all mock state - call in beforeEach hooks
 */
export const resetAllMocks = (): void => {
  // This is a placeholder for any global mock state that needs resetting
  // Individual mocks should be reset in their respective test setups
};