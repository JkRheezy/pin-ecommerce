/**
 * test-mocks.tsx
 *
 * Mock data and mock functions for testing across the six-layer architecture.
 * This module provides type-safe mocks for Types, Config, Repo, Service, Runtime, and UI layers.
 *
 * @module test-mocks
 */

import { ReactNode } from 'react';

// ============================================================================
// TYPES LAYER - Core type definitions and domain models
// ============================================================================

/**
 * Represents a user entity in the system
 */
export interface MockUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'developer' | 'viewer';
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

/**
 * Represents a project entity
 */
export interface MockProject {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  members: string[];
  status: 'active' | 'archived' | 'draft';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Represents an API error response
 */
export interface MockApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Generic API response wrapper
 */
export interface MockApiResponse<T> {
  data: T;
  success: boolean;
  error?: MockApiError;
  meta?: {
    page: number;
    pageSize: number;
    total: number;
  };
}

// ============================================================================
// CONFIG LAYER - Configuration and environment mocks
// ============================================================================

/**
 * Mock application configuration
 */
export interface MockAppConfig {
  apiBaseUrl: string;
  environment: 'development' | 'staging' | 'production';
  features: Record<string, boolean>;
  timeouts: {
    apiRequest: number;
    session: number;
  };
}

/**
 * Default mock configuration for testing
 */
export const createMockConfig = (overrides?: Partial<MockAppConfig>): MockAppConfig => ({
  apiBaseUrl: 'https://api.harness.test',
  environment: 'development',
  features: {
    enableNewUI: true,
    enableBetaFeatures: false,
    enableAnalytics: false,
  },
  timeouts: {
    apiRequest: 30000,
    session: 3600000,
  },
  ...overrides,
});

// ============================================================================
// REPO LAYER - Data access and storage mocks
// ============================================================================

/**
 * Mock repository interface for data access patterns
 */
export interface MockRepository<T extends { id: string }> {
  findById: (id: string) => Promise<T | null>;
  findAll: (options?: { page?: number; pageSize?: number }) => Promise<T[]>;
  create: (data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>) => Promise<T>;
  update: (id: string, data: Partial<T>) => Promise<T | null>;
  delete: (id: string) => Promise<boolean>;
}

/**
 * Creates a mock repository with in-memory storage
 */
export function createMockRepository<T extends { id: string; createdAt: Date; updatedAt: Date }>(
  initialData: T[] = []
): MockRepository<T> {
  // In-memory storage for the mock repository
  let storage: Map<string, T> = new Map(initialData.map(item => [item.id, item]));

  return {
    /**
     * Find an entity by its ID
     * @throws {MockApiError} When ID format is invalid
     */
    async findById(id: string): Promise<T | null> {
      if (!id || typeof id !== 'string') {
        throw createMockApiError('INVALID_ID', 'ID must be a non-empty string');
      }
      return storage.get(id) ?? null;
    },

    /**
     * Find all entities with optional pagination
     */
    async findAll(options?: { page?: number; pageSize?: number }): Promise<T[]> {
      const page = Math.max(1, options?.page ?? 1);
      const pageSize = Math.max(1, Math.min(100, options?.pageSize ?? 20));
      
      const allItems = Array.from(storage.values());
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;

      return allItems.slice(startIndex, endIndex);
    },

    /**
     * Create a new entity with generated ID and timestamps
     */
    async create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
      const now = new Date();
      const newItem = {
        ...data,
        id: `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: now,
        updatedAt: now,
      } as T;

      storage.set(newItem.id, newItem);
      return newItem;
    },

    /**
     * Update an existing entity
     * @throws {MockApiError} When entity not found
     */
    async update(id: string, data: Partial<T>): Promise<T | null> {
      const existing = storage.get(id);
      if (!existing) {
        throw createMockApiError('NOT_FOUND', `Entity with id ${id} not found`);
      }

      const updated = {
        ...existing,
        ...data,
        id: existing.id, // Prevent ID mutation
        createdAt: existing.createdAt, // Prevent creation date mutation
        updatedAt: new Date(),
      } as T;

      storage.set(id, updated);
      return updated;
    },

    /**
     * Delete an entity by ID
     */
    async delete(id: string): Promise<boolean> {
      return storage.delete(id);
    },
  };
}

// ============================================================================
// SERVICE LAYER - Business logic mocks
// ============================================================================

/**
 * Mock logger interface for structured logging
 */
export interface MockLogger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, error?: Error, context?: Record<string, unknown>) => void;
}

/**
 * Creates a mock logger that captures log entries for testing
 */
export function createMockLogger(): MockLogger & { getLogs: () => LogEntry[] } {
  const logs: LogEntry[] = [];

  return {
    debug(message: string, context?: Record<string, unknown>): void {
      logs.push({ level: 'debug', message, context, timestamp: new Date() });
    },
    info(message: string, context?: Record<string, unknown>): void {
      logs.push({ level: 'info', message, context, timestamp: new Date() });
    },
    warn(message: string, context?: Record<string, unknown>): void {
      logs.push({ level: 'warn', message, context, timestamp: new Date() });
    },
    error(message: string, error?: Error, context?: Record<string, unknown>): void {
      logs.push({ 
        level: 'error', 
        message, 
        error: error?.message,
        stack: error?.stack,
        context, 
        timestamp: new Date() 
      });
    },
    getLogs(): LogEntry[] {
      return [...logs];
    },
  };
}

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
  error?: string;
  stack?: string;
  timestamp: Date;
}

/**
 * Mock user service with business logic
 */
export interface MockUserService {
  authenticate: (email: string, password: string) => Promise<MockUser>;
  getCurrentUser: () => Promise<MockUser | null>;
  updateProfile: (userId: string, updates: Partial<MockUser>) => Promise<MockUser>;
  hasPermission: (userId: string, permission: string) => Promise<boolean>;
}

/**
 * Creates a mock user service
 */
export function createMockUserService(
  repository: MockRepository<MockUser>,
  logger: MockLogger,
  config: MockAppConfig
): MockUserService {
  // Simulated session storage
  let currentSession: { userId: string; expiresAt: Date } | null = null;

  return {
    /**
     * Authenticate a user with email and password
     * @throws {MockApiError} When credentials are invalid
     */
    async authenticate(email: string, password: string): Promise<MockUser> {
      logger.info('Authentication attempt', { email });

      // Validate inputs
      if (!email || !password) {
        logger.warn('Authentication failed - missing credentials');
        throw createMockApiError('INVALID_CREDENTIALS', 'Email and password are required');
      }

      // Simulate credential validation (in real service, this would hash and compare)
      const allUsers = await repository.findAll({ pageSize: 1000 });
      const user = allUsers.find(u => u.email === email);

      if (!user || !user.isActive) {
        logger.warn('Authentication failed - user not found or inactive', { email });
        throw createMockApiError('AUTHENTICATION_FAILED', 'Invalid email or password');
      }

      // Set session
      const sessionDuration = config.timeouts.session;
      currentSession = {
        userId: user.id,
        expiresAt: new Date(Date.now() + sessionDuration),
      };

      logger.info('Authentication successful', { userId: user.id });
      return user;
    },

    /**
     * Get the currently authenticated user
     */
    async getCurrentUser(): Promise<MockUser | null> {
      if (!currentSession || currentSession.expiresAt < new Date()) {
        currentSession = null;
        return null;
      }

      try {
        return await repository.findById(currentSession.userId);
      } catch (error) {
        logger.error('Failed to get current user', error as Error);
        return null;
      }
    },

    /**
     * Update a user's profile
     * @throws {MockApiError} When user not found or update fails
     */
    async updateProfile(userId: string, updates: Partial<MockUser>): Promise<MockUser> {
      logger.info('Updating user profile', { userId, updates: Object.keys(updates) });

      // Prevent sensitive field updates through this method
      const safeUpdates = { ...updates };
      delete (safeUpdates as Partial<MockUser>).id;
      delete (safeUpdates as Partial<MockUser>).role;
      delete (safeUpdates as Partial<MockUser>).createdAt;

      const updated = await repository.update(userId, safeUpdates);
      if (!updated) {
        throw createMockApiError('UPDATE_FAILED', 'Failed to update user profile');
      }

      return updated;
    },

    /**
     * Check if a user has a specific permission
     */
    async hasPermission(userId: string, permission: string): Promise<boolean> {
      const user = await repository.findById(userId);
      if (!user) return false;

      // Simple role-based permission check
      const rolePermissions: Record<string, string[]> = {
        admin: ['read', 'write', 'delete', 'manage'],
        developer: ['read', 'write'],
        viewer: ['read'],
      };

      const permissions = rolePermissions[user.role] ?? [];
      return permissions.includes(permission);
    },
  };
}

// ============================================================================
// RUNTIME LAYER - Execution environment mocks
// ============================================================================

/**
 * Mock fetch response for API testing
 */
export interface MockFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

/**
 * Creates a mock fetch implementation
 */
export function createMockFetch(
  responses: Map<string, MockFetchResponse | ((request: Request) => MockFetchResponse)>
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input.toString();
    const method = init?.method ?? 'GET';
    const key = `${method} ${url}`;

    const mockResponse = responses.get(key) ?? responses.get(url);

    if (!mockResponse) {
      throw new Error(`No mock response configured for: ${key}`);
    }

    const response = typeof mockResponse === 'function' 
      ? mockResponse(new Request(url, init))
      : mockResponse;

    // Convert MockFetchResponse to actual Response-like object
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      json: response.json,
      text: response.text,
    } as Response;
  };
}

/**
 * Mock timer utilities for testing time-dependent code
 */
export function createMockTimers() {
  let currentTime = Date.now();
  const timeouts: Map<number, { callback: () => void; delay: number }> = new Map();
  let timeoutId = 0;

  return {
    /**
     * Get the current mock time
     */
    now(): number {
      return currentTime;
    },

    /**
     * Advance time by specified milliseconds
     */
    advanceBy(ms: number): void {
      currentTime += ms;
      
      // Execute any due timeouts
      timeouts.forEach((timeout, id) => {
        if (timeout.delay <= ms) {
          timeout.callback();
          timeouts.delete(id);
        } else {
          timeout.delay -= ms;
        }
      });
    },

    /**
     * Mock setTimeout implementation
     */
    setTimeout(callback: () => void, delay: number): number {
      const id = ++timeoutId;
      timeouts.set(id, { callback, delay });
      return id;
    },

    /**
     * Mock clearTimeout implementation
     */
    clearTimeout(id: number): void {
      timeouts.delete(id);
    },

    /**
     * Reset all timers
     */
    reset(): void {
      currentTime = Date.now();
      timeouts.clear();
      timeoutId = 0;
    },
  };
}

// ============================================================================
// UI LAYER - Component and hook mocks
// ============================================================================

/**
 * Mock React context provider props
 */
export interface MockProviderProps {
  children: ReactNode;
}

/**
 * Creates mock context value factories for testing
 */
export function createMockContext<T>(defaultValue: T) {
  let currentValue = defaultValue;
  const subscribers: Set<(value: T) => void> = new Set();

  return {
    /**
     * Get current context value
     */
    getValue(): T {
      return currentValue;
    },

    /**
     * Set context value and notify subscribers
     */
    setValue(value: T): void {
      currentValue = value;
      subscribers.forEach(callback => callback(value));
    },

    /**
     * Subscribe to context changes
     */
    subscribe(callback: (value: T) => void): () => void {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },

    /**
     * Create a mock provider component
     */
    createProvider(overrides?: Partial<T>): React.FC<MockProviderProps> {
      const mergedValue = { ...currentValue, ...overrides };
      return function MockProvider({ children }: MockProviderProps) {
        // In actual React, this would use React.createElement
        // Here we return a structural representation for testing
        return {
          type: 'MockProvider',
          props: { value: mergedValue, children },
        } as unknown as React.ReactElement;
      };
    },
  };
}

/**
 * Mock hook result for testing custom hooks
 */
export interface MockHookResult<T> {
  result: { current: T };
  rerender: (props?: Record<string, unknown>) => void;
  unmount: () => void;
  error?: Error;
}

/**
 * Creates a mock hook tester
 */
export function createMockHookTester<T>(
  useHook: (props?: Record<string, unknown>) => T
) {
  let currentResult: T;
  let isMounted = true;
  let currentError: Error | undefined;

  return {
    /**
     * Mount the hook with initial props
     */
    mount(initialProps?: Record<string, unknown>): MockHookResult<T> {
      isMounted = true;
      
      try {
        currentResult = useHook(initialProps);
      } catch (error) {
        currentError = error as Error;
      }

      return {
        get result() {
          return { current: currentResult };
        },
        rerender: (props?: Record<string, unknown>) => {
          if (!isMounted) {
            throw new Error('Cannot rerender unmounted hook');
          }
          try {
            currentResult = useHook(props);
            currentError = undefined;
          } catch (error) {
            currentError = error as Error;
          }
        },
        unmount: () => {
          isMounted = false;
        },
        get error() {
          return currentError;
        },
      };
    },
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Creates a standardized API error object
 */
export function createMockApiError(code: string, message: string, details?: Record<string, unknown>): MockApiError {
  return {
    code,
    message,
    details,
    timestamp: new Date(),
  };
}

/**
 * Creates a standardized API response object
 */
export function createMockApiResponse<T>(
  data: T,
  success = true,
  meta?: MockApiResponse<T>['meta']
): MockApiResponse<T> {
  return {
    data,
    success,
    meta,
  };
}

/**
 * Pre-built mock data factories
 */
export const mockFactories = {
  /**
   * Create a mock user with default values
   */
  user(overrides?: Partial<MockUser>): MockUser {
    const now = new Date();
    return {
      id: `user-${Date.now()}`,
      email: 'test@harness.io',
      name: 'Test User',
      role: 'developer',
      createdAt: now,
      updatedAt: now,
      isActive: true,
      ...overrides,
    };
  },

  /**
   * Create a mock project with default values
   */
  project(overrides?: Partial<MockProject>): MockProject {
    const now = new Date();
    return {
      id: `project-${Date.now()}`,
      name: 'Test Project',
      description: 'A test project for development',
      ownerId: 'user-1',
      members: ['user-1'],
      status: 'active',
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  },

  /**
   * Create multiple mock entities
   */
  many<T>(factory: (index: number) => T, count: number): T[] {
    return Array.from({ length: count }, (_, index) => factory(index));
  },
};

// ============================================================================
// EXPORT ALL MOCKS FOR CONVENIENCE
// ============================================================================

/**
 * Complete mock environment setup for integration testing
 */
export function createMockEnvironment() {
  const config = createMockConfig();
  const logger = createMockLogger();
  const userRepository = createMockRepository<MockUser>([
    mockFactories.user({ id: 'user-1', email: 'admin@harness.io', role: 'admin' }),
    mockFactories.user({ id: 'user-2', email: 'dev@harness.io', role: 'developer' }),
  ]);
  const userService = createMockUserService(userRepository, logger, config);
  const timers = createMockTimers();

  return {
    config,
    logger,
    repositories: {
      users: userRepository,
    },
    services: {
      users: userService,
    },
    timers,
    factories: mockFactories,
    reset: (): void => {
      logger.getLogs().length = 0;
      timers.reset();
    },
  };
}

// Default export for convenience
export default {
  createMockConfig,
  createMockRepository,
  createMockLogger,
  createMockUserService,
  createMockFetch,
  createMockTimers,
  createMockContext,
  createMockHookTester,
  createMockApiError,
  createMockApiResponse,
  mockFactories,
  createMockEnvironment,
};