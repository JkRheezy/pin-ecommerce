/**
 * Data Fetching Tests Module
 * 
 * This module contains tests for data fetching operations following the six-layer architecture.
 * Layer: Service → Runtime (testing)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DataServiceConfig, FetchResult, ApiError } from '@/types/data.types';
import { DataService } from '@/services/data.service';
import { createMockResponse, createMockError } from '@/test-utils/factories';

// Types Layer: Define test-specific types
interface TestContext {
  service: DataService;
  config: DataServiceConfig;
}

// Config Layer: Test configuration
const TEST_CONFIG: DataServiceConfig = {
  baseUrl: 'https://api.test.harness.io',
  timeout: 5000,
  retries: 2,
  headers: {
    'Content-Type': 'application/json',
    'X-Test-Environment': 'true',
  },
};

describe('Data Fetching Service', () => {
  let context: TestContext;

  beforeEach(() => {
    // Initialize fresh service instance for each test
    context = {
      service: new DataService(TEST_CONFIG),
      config: TEST_CONFIG,
    };

    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  describe('Successful Data Fetching', () => {
    it('should fetch data successfully with valid parameters', async () => {
      // Arrange: Setup mock response
      const mockData = { id: '1', name: 'Test Project' };
      const mockResponse = createMockResponse(mockData, 200);
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      // Act: Execute data fetch
      const result: FetchResult<typeof mockData> = await context.service.fetch('/projects/1');

      // Assert: Verify successful fetch
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      
      // Verify correct URL construction
      expect(global.fetch).toHaveBeenCalledWith(
        `${TEST_CONFIG.baseUrl}/projects/1`,
        expect.objectContaining({
          method: 'GET',
          headers: TEST_CONFIG.headers,
        })
      );
    });

    it('should handle query parameters correctly', async () => {
      // Arrange
      const queryParams = { status: 'active', limit: '10' };
      const mockData = [{ id: '1' }, { id: '2' }];
      global.fetch = vi.fn().mockResolvedValue(createMockResponse(mockData, 200));

      // Act
      const result = await context.service.fetch('/projects', { params: queryParams });

      // Assert: Verify URL includes query parameters
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('status=active'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object)
      );
    });

    it('should merge custom headers with default headers', async () => {
      // Arrange
      const customHeaders = { 'X-Custom-Header': 'custom-value' };
      global.fetch = vi.fn().mockResolvedValue(createMockResponse({}, 200));

      // Act
      await context.service.fetch('/projects', { headers: customHeaders });

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            ...TEST_CONFIG.headers,
            ...customHeaders,
          }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle HTTP 404 errors gracefully', async () => {
      // Arrange: Setup 404 response
      const errorResponse = createMockError('Resource not found', 404);
      global.fetch = vi.fn().mockResolvedValue(errorResponse);

      // Act
      const result = await context.service.fetch('/non-existent');

      // Assert: Verify error is properly structured
      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toMatchObject<Partial<ApiError>>({
        code: 'NOT_FOUND',
        status: 404,
        message: 'Resource not found',
      });
    });

    it('should handle HTTP 500 server errors with retry logic', async () => {
      // Arrange: First two calls fail, third succeeds
      const serverError = createMockError('Internal Server Error', 500);
      const successResponse = createMockResponse({ recovered: true }, 200);
      
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(serverError)
        .mockResolvedValueOnce(serverError)
        .mockResolvedValueOnce(successResponse);

      // Act
      const result = await context.service.fetch('/unstable-endpoint');

      // Assert: Verify retry mechanism worked
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ recovered: true });
    });

    it('should handle network failures with proper error classification', async () => {
      // Arrange: Simulate network failure
      const networkError = new TypeError('Failed to fetch');
      global.fetch = vi.fn().mockRejectedValue(networkError);

      // Act
      const result = await context.service.fetch('/projects');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toMatchObject<Partial<ApiError>>({
        code: 'NETWORK_ERROR',
        message: expect.stringContaining('network'),
      });
    });

    it('should handle timeout errors when request exceeds configured timeout', async () => {
      // Arrange: Simulate slow response
      vi.useFakeTimers();
      global.fetch = vi.fn().mockImplementation(() => 
        new Promise((resolve) => setTimeout(resolve, TEST_CONFIG.timeout + 1000))
      );

      // Act: Start request and advance timers
      const fetchPromise = context.service.fetch('/slow-endpoint');
      vi.advanceTimersByTime(TEST_CONFIG.timeout + 100);

      // Assert
      const result = await fetchPromise;
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT_ERROR');

      vi.useRealTimers();
    });

    it('should exhaust retries and return final error', async () => {
      // Arrange: All retries fail
      const serverError = createMockError('Service Unavailable', 503);
      global.fetch = vi.fn().mockResolvedValue(serverError);

      // Act
      const result = await context.service.fetch('/failing-endpoint');

      // Assert: Verify all retries were attempted
      expect(global.fetch).toHaveBeenCalledTimes(TEST_CONFIG.retries + 1); // initial + retries
      expect(result.success).toBe(false);
      expect(result.error?.status).toBe(503);
    });
  });

  describe('Edge Cases and Input Validation', () => {
    it('should handle empty response body', async () => {
      // Arrange: 204 No Content response
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 })
      );

      // Act
      const result = await context.service.fetch('/delete-resource', { method: 'DELETE' });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should validate URL path format', async () => {
      // Act & Assert: Invalid paths should throw validation error
      await expect(context.service.fetch('')).rejects.toThrow('Invalid URL path');
      await expect(context.service.fetch('   ')).rejects.toThrow('Invalid URL path');
    });

    it('should handle malformed JSON responses', async () => {
      // Arrange: Response with invalid JSON
      global.fetch = vi.fn().mockResolvedValue(
        new Response('not valid json', { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      // Act
      const result = await context.service.fetch('/bad-json');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PARSE_ERROR');
    });

    it('should handle extremely large response payloads', async () => {
      // Arrange: Large payload that might cause memory issues
      const largeData = { items: Array(100000).fill({ data: 'x'.repeat(100) }) };
      global.fetch = vi.fn().mockResolvedValue(createMockResponse(largeData, 200));

      // Act
      const result = await context.service.fetch('/large-dataset');

      // Assert: Should still process successfully
      expect(result.success).toBe(true);
      expect(result.data?.items).toHaveLength(100000);
    });
  });

  describe('Cancellation and Abort', () => {
    it('should support request cancellation via AbortSignal', async () => {
      // Arrange
      const controller = new AbortController();
      global.fetch = vi.fn().mockImplementation((_, options) => {
        return new Promise((_, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

      // Act: Start request and immediately abort
      const fetchPromise = context.service.fetch('/slow-endpoint', {
        signal: controller.signal,
      });
      controller.abort();

      // Assert
      await expect(fetchPromise).rejects.toThrow('Aborted');
    });
  });

  describe('Caching Behavior', () => {
    it('should cache GET requests when cache option is enabled', async () => {
      // Arrange
      const mockData = { cached: true };
      global.fetch = vi.fn().mockResolvedValue(createMockResponse(mockData, 200));

      // Act: Same request twice with caching
      await context.service.fetch('/cached-endpoint', { cache: true });
      const secondResult = await context.service.fetch('/cached-endpoint', { cache: true });

      // Assert: Second request should use cache
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(secondResult.data).toEqual(mockData);
    });

    it('should bypass cache for non-GET methods', async () => {
      // Arrange
      global.fetch = vi.fn().mockResolvedValue(createMockResponse({}, 200));

      // Act
      await context.service.fetch('/resource', { 
        method: 'POST', 
        cache: true 
      });

      // Assert: POST should never cache
      expect(context.service['cache'].has('POST:/resource')).toBe(false);
    });
  });
});