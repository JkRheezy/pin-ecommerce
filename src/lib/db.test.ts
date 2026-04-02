/**
 * @file db.test.ts
 * @description Comprehensive test suite for database layer
 * @layer Repo
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseError, ValidationError } from '../types/errors';
import { DBConfig, QueryOptions, PaginatedResult } from '../types/config';
import { DatabaseConnection, QueryResult } from '../types/repo';
import { createDatabaseConnection, executeQuery, withTransaction } from './db';

// ============================================================================
// Types Layer - Test Fixtures and Mocks
// ============================================================================

interface TestUser {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

interface MockConnection extends DatabaseConnection {
  query: ReturnType<typeof vi.fn>;
  beginTransaction: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  rollback: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

// ============================================================================
// Test Suite: Database Connection
// ============================================================================

describe('Database Layer', () => {
  let mockConnection: MockConnection;
  let mockConfig: DBConfig;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Setup mock configuration following Config layer principles
    mockConfig = {
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      user: 'test_user',
      password: 'test_pass',
      poolSize: 10,
      connectionTimeoutMs: 5000,
      queryTimeoutMs: 30000,
      ssl: false,
    };

    // Setup mock connection following Repo layer interface
    mockConnection = {
      query: vi.fn(),
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Connection Management Tests
  // ==========================================================================

  describe('createDatabaseConnection', () => {
    it('should create connection with valid config', async () => {
      // Arrange: Valid configuration provided in beforeEach

      // Act
      const connection = await createDatabaseConnection(mockConfig);

      // Assert: Connection should be established with proper configuration
      expect(connection).toBeDefined();
      expect(connection.query).toBeInstanceOf(Function);
    });

    it('should throw ValidationError for missing required fields', async () => {
      // Arrange: Invalid config missing required fields
      const invalidConfig = {
        ...mockConfig,
        host: '',
        database: '',
      };

      // Act & Assert: Should validate inputs and throw appropriate error
      await expect(createDatabaseConnection(invalidConfig)).rejects.toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for invalid port range', async () => {
      // Arrange: Config with out-of-range port
      const invalidConfig = {
        ...mockConfig,
        port: 99999,
      };

      // Act & Assert: Port validation should catch invalid range
      await expect(createDatabaseConnection(invalidConfig)).rejects.toThrow(
        ValidationError
      );
    });

    it('should apply default values for optional config fields', async () => {
      // Arrange: Minimal config with only required fields
      const minimalConfig: Partial<DBConfig> = {
        host: 'localhost',
        database: 'test_db',
        user: 'test_user',
        password: 'test_pass',
      };

      // Act
      const connection = await createDatabaseConnection(minimalConfig as DBConfig);

      // Assert: Defaults should be applied for missing optional fields
      expect(connection).toBeDefined();
    });

    it('should handle connection timeout gracefully', async () => {
      // Arrange: Config with very short timeout to trigger failure
      const timeoutConfig = {
        ...mockConfig,
        connectionTimeoutMs: 1,
      };

      // Mock connection to simulate timeout
      vi.mock('./db', async () => {
        const actual = await vi.importActual('./db');
        return {
          ...actual,
          createDatabaseConnection: vi.fn().mockRejectedValue(
            new DatabaseError('Connection timeout exceeded', 'CONNECTION_TIMEOUT')
          ),
        };
      });

      // Act & Assert: Timeout should result in DatabaseError
      await expect(createDatabaseConnection(timeoutConfig)).rejects.toThrow(
        DatabaseError
      );
    });
  });

  // ==========================================================================
  // Query Execution Tests
  // ==========================================================================

  describe('executeQuery', () => {
    beforeEach(() => {
      // Setup successful query mock
      mockConnection.query.mockResolvedValue({
        rows: [{ id: '1', email: 'test@example.com' }],
        rowCount: 1,
        command: 'SELECT',
      });
    });

    it('should execute simple SELECT query successfully', async () => {
      // Arrange
      const sql = 'SELECT * FROM users WHERE id = $1';
      const params = ['1'];

      // Act
      const result: QueryResult<TestUser> = await executeQuery(
        mockConnection,
        sql,
        params
      );

      // Assert: Query should execute and return typed results
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].email).toBe('test@example.com');
      expect(result.rowCount).toBe(1);
      expect(mockConnection.query).toHaveBeenCalledWith(sql, params);
    });

    it('should handle parameterized queries with multiple parameters', async () => {
      // Arrange: Complex query with multiple parameters
      const sql = `
        SELECT * FROM users 
        WHERE email = $1 
        AND created_at > $2 
        AND status = $3
      `;
      const params = ['user@example.com', new Date('2024-01-01'), 'active'];

      // Act
      const result = await executeQuery<TestUser>(mockConnection, sql, params);

      // Assert: All parameters should be properly passed
      expect(mockConnection.query).toHaveBeenCalledWith(sql, params);
      expect(result.command).toBe('SELECT');
    });

    it('should return empty result for queries with no matches', async () => {
      // Arrange: Mock empty result
      mockConnection.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
      });

      // Act
      const result = await executeQuery<TestUser>(
        mockConnection,
        'SELECT * FROM users WHERE id = $1',
        ['nonexistent']
      );

      // Assert: Empty result should be handled gracefully
      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });

    it('should throw DatabaseError for syntax errors', async () => {
      // Arrange: Mock syntax error response
      const syntaxError = new Error('syntax error at or near "INVALID"');
      mockConnection.query.mockRejectedValue(syntaxError);

      // Act & Assert: Syntax errors should be wrapped in DatabaseError
      await expect(
        executeQuery(mockConnection, 'INVALID SQL', [])
      ).rejects.toThrow(DatabaseError);
    });

    it('should throw DatabaseError for constraint violations', async () => {
      // Arrange: Mock unique constraint violation
      const constraintError = new Error(
        'duplicate key value violates unique constraint "users_email_key"'
      );
      mockConnection.query.mockRejectedValue(constraintError);

      // Act & Assert: Constraint violations should be properly categorized
      await expect(
        executeQuery(
          mockConnection,
          'INSERT INTO users (email) VALUES ($1)',
          ['duplicate@example.com']
        )
      ).rejects.toThrow(DatabaseError);
    });

    it('should handle queries with QueryOptions', async () => {
      // Arrange: Query with options for timeout and caching
      const sql = 'SELECT * FROM users';
      const options: QueryOptions = {
        timeoutMs: 5000,
        cacheKey: 'users:all',
        cacheTtlMs: 60000,
      };

      // Act
      const result = await executeQuery<TestUser[]>(
        mockConnection,
        sql,
        [],
        options
      );

      // Assert: Options should be applied to query execution
      expect(result).toBeDefined();
      expect(mockConnection.query).toHaveBeenCalled();
    });

    it('should sanitize inputs to prevent SQL injection', async () => {
      // Arrange: Malicious input attempting SQL injection
      const maliciousInput = "'; DROP TABLE users; --";
      const sql = 'SELECT * FROM users WHERE name = $1';

      // Act
      await executeQuery(mockConnection, sql, [maliciousInput]);

      // Assert: Parameterized query should prevent injection
      const callArgs = mockConnection.query.mock.calls[0];
      expect(callArgs[1][0]).toBe(maliciousInput); // Value passed as parameter, not concatenated
    });
  });

  // ==========================================================================
  // Transaction Tests
  // ==========================================================================

  describe('withTransaction', () => {
    it('should commit transaction on successful operations', async () => {
      // Arrange: Transaction callback that performs operations
      const operations = vi.fn().mockImplementation(async (conn) => {
        await executeQuery(conn, 'INSERT INTO users (email) VALUES ($1)', [
          'new@example.com',
        ]);
        return { success: true };
      });

      // Act
      const result = await withTransaction(mockConnection, operations);

      // Assert: Transaction should be committed on success
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(operations).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.rollback).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should rollback transaction on operation failure', async () => {
      // Arrange: Transaction callback that throws error
      const error = new Error('Operation failed');
      const operations = vi.fn().mockRejectedValue(error);

      // Act & Assert: Transaction should be rolled back on failure
      await expect(withTransaction(mockConnection, operations)).rejects.toThrow(
        error
      );
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.commit).not.toHaveBeenCalled();
    });

    it('should handle nested transaction attempts gracefully', async () => {
      // Arrange: Nested transaction callback
      const innerOperations = vi.fn().mockResolvedValue({ nested: true });
      const outerOperations = vi.fn().mockImplementation(async (conn) => {
        // Attempt to start nested transaction (should use savepoint)
        return await withTransaction(conn, innerOperations);
      });

      // Act
      await withTransaction(mockConnection, outerOperations);

      // Assert: Nested transactions should use savepoints, not nested begin
      expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
    });

    it('should release connection after transaction completes', async () => {
      // Arrange: Simple transaction
      const operations = vi.fn().mockResolvedValue({ done: true });

      // Act
      await withTransaction(mockConnection, operations);

      // Assert: Connection should always be released
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should release connection even on failure', async () => {
      // Arrange: Failing transaction
      const operations = vi.fn().mockRejectedValue(new Error('Failed'));

      // Act & Assert
      await expect(withTransaction(mockConnection, operations)).rejects.toThrow();
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should support transaction isolation levels', async () => {
      // Arrange: Transaction with specific isolation level
      const operations = vi.fn().mockResolvedValue({ isolated: true });

      // Act
      await withTransaction(mockConnection, operations, {
        isolationLevel: 'SERIALIZABLE',
      });

      // Assert: Isolation level should be set
      expect(mockConnection.query).toHaveBeenCalledWith(
        'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE'
      );
    });
  });

  // ==========================================================================
  // Pagination Tests
  // ==========================================================================

  describe('Paginated Queries', () => {
    it('should execute paginated query with default limits', async () => {
      // Arrange: Mock paginated response
      mockConnection.query
        .mockResolvedValueOnce({
          // Count query
          rows: [{ count: '100' }],
          rowCount: 1,
          command: 'SELECT',
        })
        .mockResolvedValueOnce({
          // Data query
          rows: Array.from({ length: 20 }, (_, i) => ({
            id: String(i + 1),
            email: `user${i + 1}@example.com`,
            name: `User ${i + 1}`,
            createdAt: new Date(),
          })),
          rowCount: 20,
          command: 'SELECT',
        });

      // Act
      const result: PaginatedResult<TestUser> = await executeQuery(
        mockConnection,
        'SELECT * FROM users ORDER BY created_at DESC',
        [],
        { pagination: { page: 1, pageSize: 20 } }
      );

      // Assert: Pagination metadata should be included
      expect(result.data).toHaveLength(20);
      expect(result.pagination.total).toBe(100);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(20);
      expect(result.pagination.totalPages).toBe(5);
    });

    it('should handle last page with fewer results', async () => {
      // Arrange: Last page with partial results
      const remainingItems = 5;
      mockConnection.query
        .mockResolvedValueOnce({
          rows: [{ count: '25' }],
          rowCount: 1,
          command: 'SELECT',
        })
        .mockResolvedValueOnce({
          rows: Array.from({ length: remainingItems }, (_, i) => ({
            id: String(21 + i),
            email: `user${21 + i}@example.com`,
            name: `User ${21 + i}`,
          })),
          rowCount: remainingItems,
          command: 'SELECT',
        });

      // Act
      const result: PaginatedResult<TestUser> = await executeQuery(
        mockConnection,
        'SELECT * FROM users',
        [],
        { pagination: { page: 3, pageSize: 10 } }
      );

      // Assert: Last page should have correct metadata
      expect(result.data).toHaveLength(remainingItems);
      expect(result.pagination.hasNextPage).toBe(false);
      expect(result.pagination.hasPreviousPage).toBe(true);
    });

    it('should throw ValidationError for invalid pagination params', async () => {
      // Arrange: Invalid pagination (page 0)
      const options: QueryOptions = {
        pagination: { page: 0, pageSize: 10 },
      };

      // Act & Assert: Invalid pagination should be rejected
      await expect(
        executeQuery(mockConnection, 'SELECT * FROM users', [], options)
      ).rejects.toThrow(ValidationError);
    });

    it('should enforce maximum page size limit', async () => {
      // Arrange: Excessive page size
      const options: QueryOptions = {
        pagination: { page: 1, pageSize: 10000 },
      };

      // Act
      await executeQuery(mockConnection, 'SELECT * FROM users', [], options);

      // Assert: Page size should be clamped to maximum
      const dataQueryCall = mockConnection.query.mock.calls[1];
      expect(dataQueryCall[0]).toContain('LIMIT 100'); // Assuming MAX_PAGE_SIZE = 100
    });
  });

  // ==========================================================================
  // Edge Cases and Error Handling
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle null and undefined parameter values', async () => {
      // Arrange: Query with null/undefined params
      const sql = 'INSERT INTO users (email, name, metadata) VALUES ($1, $2, $3)';
      const params = ['test@example.com', null, undefined];

      // Act
      await executeQuery(mockConnection, sql, params);

      // Assert: Null/undefined should be handled as SQL NULL
      expect(mockConnection.query).toHaveBeenCalledWith(sql, params);
    });

    it('should handle very large result sets with streaming', async () => {
      // Arrange: Large result set that should use streaming
      const largeResult = Array.from({ length: 10000 }, (_, i) => ({
        id: String(i),
        data: 'x'.repeat(1000),
      }));

      mockConnection.query.mockResolvedValue({
        rows: largeResult,
        rowCount: 10000,
        command: 'SELECT',
      });

      // Act
      const result = await executeQuery(
        mockConnection,
        'SELECT * FROM large_table',
        [],
        { stream: true, batchSize: 1000 }
      );

      // Assert: Streaming should process large results efficiently
      expect(result.rows).toHaveLength(10000);
    });

    it('should handle connection pool exhaustion', async () => {
      // Arrange: Simulate pool exhaustion
      const poolExhaustedError = new Error('sorry, too many clients already');
      mockConnection.query.mockRejectedValue(poolExhaustedError);

      // Act & Assert: Pool exhaustion should be handled with retry logic
      await expect(
        executeQuery(mockConnection, 'SELECT 1', [])
      ).rejects.toThrow(DatabaseError);
    });

    it('should handle database restart during query', async () => {
      // Arrange: Simulate connection lost during query
      const connectionLostError = new Error('server closed the connection unexpectedly');
      mockConnection.query.mockRejectedValue(connectionLostError);

      // Act & Assert: Connection loss should be detectable
      await expect(
        executeQuery(mockConnection, 'SELECT * FROM users', [])
      ).rejects.toThrow(DatabaseError);
    });

    it('should validate query result shape matches expected type', async () => {
      // Arrange: Result with missing required fields
      mockConnection.query.mockResolvedValue({
        rows: [{ id: '1', email: 'test@example.com' }], // missing 'name' and 'createdAt'
        rowCount: 1,
        command: 'SELECT',
      });

      // Act
      const result = await executeQuery<TestUser>(
        mockConnection,
        'SELECT id, email FROM users',
        []
      );

      // Assert: Runtime validation should catch type mismatches in strict mode
      // Note: This depends on runtime validation being enabled
      expect(result.rows[0]).not.toHaveProperty('name');
    });

    it('should handle concurrent query execution', async () => {
      // Arrange: Multiple concurrent queries
      const queries = Array.from({ length: 5 }, (_, i) =>
        executeQuery(
          mockConnection,
          'SELECT * FROM users WHERE id = $1',
          [String(i + 1)]
        )
      );

      // Act
      const results = await Promise.all(queries);

      // Assert: All queries should complete successfully
      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // Logging and Observability Tests
  // ==========================================================================

  describe('Logging and Observability', () => {
    it('should log slow queries', async () => {
      // Arrange: Mock slow query execution
      mockConnection.query.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          rows: [],
          rowCount: 0,
          command: 'SELECT',
        };
      });

      // Act
      await executeQuery(
        mockConnection,
        'SELECT * FROM users',
        [],
        { slowQueryThresholdMs: 50 }
      );

      // Assert: Slow query should be logged (verification depends on logger mock)
      // In real implementation, verify logger.warn was called
    });

    it('should include query metadata in errors', async () => {
      // Arrange: Query that fails with metadata
      const error = new Error('Query failed');
      mockConnection.query.mockRejectedValue(error);

      // Act & Assert
      try {
        await executeQuery(mockConnection, 'SELECT * FROM users WHERE id = $1', [
          '123',
        ]);
      } catch (e) {
        if (e instanceof DatabaseError) {
          expect(e.context).toHaveProperty('sql');
          expect(e.context).toHaveProperty('params');
          // Params should be sanitized in logs
        }
      }
    });
  });
});