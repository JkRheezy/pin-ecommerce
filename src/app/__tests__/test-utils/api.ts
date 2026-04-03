/**
 * API Mocking Utilities
 * 
 * This module provides utilities for mocking API calls in tests using MSW (Mock Service Worker).
 * Follows the six-layer architecture: Types → Config → Repo → Service → Runtime → UI
 * 
 * @module test-utils/api
 */

import { rest, RestHandler, MockedRequest, DefaultBodyType } from 'msw';
import { setupServer, SetupServerApi } from 'msw/node';

// ============================================================================
// TYPES LAYER
// ============================================================================

/**
 * HTTP methods supported by the mock API
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Generic API response structure
 */
export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  message?: string;
}

/**
 * API error response structure
 */
export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, string[]>;
}

/**
 * Mock handler configuration
 */
export interface MockHandlerConfig<T = DefaultBodyType> {
  /** HTTP method */
  method: HttpMethod;
  /** URL path to match (can include path parameters) */
  path: string;
  /** Response status code */
  status?: number;
  /** Response data or factory function */
  response: T | ((req: MockedRequest, params: Record<string, string>) => T | Promise<T>);
  /** Delay in milliseconds before responding */
  delay?: number;
  /** Whether to simulate a network error */
  networkError?: boolean;
}

/**
 * Server state for persistent mock data
 */
export interface MockServerState {
  [key: string]: unknown;
}

// ============================================================================
// CONFIG LAYER
// ============================================================================

/**
 * Default configuration for mock handlers
 */
const DEFAULT_CONFIG: Required<Pick<MockHandlerConfig, 'status' | 'delay' | 'networkError'>> = {
  status: 200,
  delay: 0,
  networkError: false,
};

/**
 * Base URL for API requests
 */
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

// ============================================================================
// SERVICE LAYER
// ============================================================================

/**
 * Logger interface for structured logging
 */
interface Logger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Structured logger implementation
 */
const logger: Logger = {
  debug: (message, meta) => {
    if (process.env.DEBUG === 'true') {
      console.log(`[DEBUG] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  },
  info: (message, meta) => {
    console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  warn: (message, meta) => {
    console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  error: (message, meta) => {
    console.error(`[ERROR] ${message}`, meta ? JSON.stringify(meta) : '');
  },
};

/**
 * Validates mock handler configuration
 * @param config - Handler configuration to validate
 * @throws Error if configuration is invalid
 */
function validateHandlerConfig<T>(config: MockHandlerConfig<T>): void {
  if (!config.method) {
    throw new Error('Handler method is required');
  }
  
  const validMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  if (!validMethods.includes(config.method)) {
    throw new Error(`Invalid HTTP method: ${config.method}. Must be one of: ${validMethods.join(', ')}`);
  }
  
  if (!config.path || typeof config.path !== 'string') {
    throw new Error('Handler path must be a non-empty string');
  }
  
  if (!config.path.startsWith('/')) {
    throw new Error(`Handler path must start with '/': ${config.path}`);
  }
  
  if (config.response === undefined) {
    throw new Error('Handler response is required');
  }
}

/**
 * Extracts path parameters from a URL based on a pattern
 * @param pattern - Path pattern with optional parameters (e.g., /users/:id)
 * @param url - Actual URL to match against
 * @returns Record of parameter names to values
 */
function extractPathParams(pattern: string, url: string): Record<string, string> {
  const patternParts = pattern.split('/').filter(Boolean);
  const urlParts = new URL(url).pathname.split('/').filter(Boolean);
  
  const params: Record<string, string> = {};
  
  patternParts.forEach((part, index) => {
    if (part.startsWith(':')) {
      const paramName = part.slice(1);
      params[paramName] = urlParts[index] || '';
    }
  });
  
  return params;
}

/**
 * Creates a delay promise for simulating network latency
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after the delay
 */
function createDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// REPO LAYER (State Management)
// ============================================================================

/**
 * In-memory state storage for mock server
 */
class MockStateRepository {
  private state: MockServerState = {};
  
  /**
   * Gets a value from state
   * @param key - State key
   * @returns Stored value or undefined
   */
  get<T>(key: string): T | undefined {
    return this.state[key] as T | undefined;
  }
  
  /**
   * Sets a value in state
   * @param key - State key
   * @param value - Value to store
   */
  set<T>(key: string, value: T): void {
    this.state[key] = value;
    logger.debug('State updated', { key, value });
  }
  
  /**
   * Removes a value from state
   * @param key - State key
   */
  remove(key: string): void {
    delete this.state[key];
    logger.debug('State removed', { key });
  }
  
  /**
   * Clears all state
   */
  clear(): void {
    this.state = {};
    logger.debug('State cleared');
  }
  
  /**
   * Gets all state (useful for debugging)
   * @returns Copy of current state
   */
  getAll(): MockServerState {
    return { ...this.state };
  }
}

// Global state instance
export const mockState = new MockStateRepository();

// ============================================================================
// RUNTIME LAYER (MSW Integration)
// ============================================================================

/**
 * Creates an MSW handler from configuration
 * @param config - Handler configuration
 * @returns MSW RestHandler instance
 */
export function createHandler<T = DefaultBodyType>(
  config: MockHandlerConfig<T>
): RestHandler {
  validateHandlerConfig(config);
  
  const { method, path, status, response, delay, networkError } = {
    ...DEFAULT_CONFIG,
    ...config,
  };
  
  // Build full URL pattern
  const urlPattern = `${API_BASE_URL}${path}`;
  
  // Create the handler using MSW's rest methods
  const restMethod = method.toLowerCase() as Lowercase<HttpMethod>;
  
  return rest[restMethod](urlPattern, async (req, res, ctx) => {
    const requestId = `${method} ${path}`;
    const startTime = Date.now();
    
    logger.info('Mock request received', {
      requestId,
      url: req.url.toString(),
      headers: Object.fromEntries(req.headers.entries()),
    });
    
    try {
      // Simulate network error if configured
      if (networkError) {
        logger.warn('Simulating network error', { requestId });
        throw new Error('Network error');
      }
      
      // Apply delay if configured
      if (delay && delay > 0) {
        logger.debug('Applying delay', { requestId, delay });
        await createDelay(delay);
      }
      
      // Extract path parameters
      const params = extractPathParams(path, req.url.toString());
      
      // Resolve response (handle both static values and factory functions)
      const resolvedResponse = typeof response === 'function'
        ? await (response as Function)(req, params)
        : response;
      
      const duration = Date.now() - startTime;
      logger.info('Mock response sent', {
        requestId,
        status,
        duration: `${duration}ms`,
      });
      
      return res(
        ctx.status(status),
        ctx.json(resolvedResponse)
      );
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Mock request failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${duration}ms`,
      });
      
      // Return appropriate error response
      const errorResponse: ApiErrorResponse = {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
        statusCode: 500,
      };
      
      return res(
        ctx.status(500),
        ctx.json(errorResponse)
      );
    }
  });
}

/**
 * Creates multiple handlers from configurations
 * @param configs - Array of handler configurations
 * @returns Array of MSW handlers
 */
export function createHandlers<T = DefaultBodyType>(
  configs: MockHandlerConfig<T>[]
): RestHandler[] {
  return configs.map(config => createHandler(config));
}

/**
 * Creates a standardized error response handler
 * @param path - API path
 * @param status - HTTP status code
 * @param message - Error message
 * @returns MSW handler that returns an error response
 */
export function createErrorHandler(
  path: string,
  status: number,
  message: string
): RestHandler {
  const errorResponse: ApiErrorResponse = {
    error: getErrorTitle(status),
    message,
    statusCode: status,
  };
  
  return createHandler({
    method: 'GET', // Will be overridden by specific method handlers
    path,
    status,
    response: errorResponse,
  });
}

/**
 * Gets a standard error title for HTTP status codes
 * @param status - HTTP status code
 * @returns Error title string
 */
function getErrorTitle(status: number): string {
  const titles: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  return titles[status] || 'Error';
}

// ============================================================================
// SERVER MANAGEMENT
// ============================================================================

/**
 * Creates and configures MSW server with handlers
 * @param handlers - MSW handlers to use
 * @returns Configured MSW server instance
 */
export function createMockServer(handlers: RestHandler[]): SetupServerApi {
  const server = setupServer(...handlers);
  
  // Add request/response logging in debug mode
  server.events.on('request:start', ({ request }) => {
    logger.debug('Request started', {
      method: request.method,
      url: request.url,
    });
  });
  
  server.events.on('response:mocked', ({ response, request }) => {
    logger.debug('Response mocked', {
      method: request.method,
      url: request.url,
      status: response.status,
    });
  });
  
  server.events.on('request:unhandled', ({ request }) => {
    logger.warn('Unhandled request', {
      method: request.method,
      url: request.url,
    });
  });
  
  return server;
}

/**
 * Common API mocking utilities
 */
export const apiMocks = {
  /**
   * Creates a successful response handler
   */
  success: <T>(path: string, data: T, method: HttpMethod = 'GET'): RestHandler =>
    createHandler({ method, path, status: 200, response: data }),
  
  /**
   * Creates a created (201) response handler
   */
  created: <T>(path: string, data: T): RestHandler =>
    createHandler({ method: 'POST', path, status: 201, response: data }),
  
  /**
   * Creates a no-content (204) response handler
   */
  noContent: (path: string, method: HttpMethod = 'DELETE'): RestHandler =>
    createHandler({ method, path, status: 204, response: {} }),
  
  /**
   * Creates a bad request (400) error handler
   */
  badRequest: (path: string, message: string, details?: Record<string, string[]>): RestHandler =>
    createHandler({
      method: 'GET',
      path,
      status: 400,
      response: {
        error: 'Bad Request',
        message,
        statusCode: 400,
        details,
      } as ApiErrorResponse,
    }),
  
  /**
   * Creates a not found (404) error handler
   */
  notFound: (path: string, resource: string = 'Resource'): RestHandler =>
    createHandler({
      method: 'GET',
      path,
      status: 404,
      response: {
        error: 'Not Found',
        message: `${resource} not found`,
        statusCode: 404,
      } as ApiErrorResponse,
    }),
  
  /**
   * Creates a server error (500) handler
   */
  serverError: (path: string, message: string = 'Internal server error'): RestHandler =>
    createHandler({
      method: 'GET',
      path,
      status: 500,
      response: {
        error: 'Internal Server Error',
        message,
        statusCode: 500,
      } as ApiErrorResponse,
    }),
  
  /**
   * Creates a network error handler
   */
  networkError: (path: string, method: HttpMethod = 'GET'): RestHandler =>
    createHandler({ method, path, networkError: true, response: {} }),
  
  /**
   * Creates a delayed response handler
   */
  delayed: <T>(path: string, data: T, delay: number, method: HttpMethod = 'GET'): RestHandler =>
    createHandler({ method, path, response: data, delay }),
};

// ============================================================================
// EXPORTS
// ============================================================================

export { rest, setupServer };
export type { SetupServerApi, MockedRequest, DefaultBodyType };