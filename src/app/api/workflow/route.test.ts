/**
 * @file src/app/api/workflow/route.test.ts
 * @description Comprehensive test suite for workflow API route
 * @module API/Workflow
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { NextRequest, NextResponse } from 'next/server';
import { POST, GET, PATCH, DELETE } from './route';
import { WorkflowService } from '@/layers/service/workflow.service';
import { WorkflowConfig } from '@/layers/config/workflow.config';
import { WorkflowRepo } from '@/layers/repo/workflow.repo';
import { WorkflowTypes, WorkflowStatus, CreateWorkflowInput, UpdateWorkflowInput } from '@/layers/types/workflow.types';
import { Logger } from '@/layers/runtime/logger';
import { ValidationError, NotFoundError, ConflictError } from '@/layers/types/error.types';

// Mock dependencies
jest.mock('@/layers/service/workflow.service');
jest.mock('@/layers/runtime/logger');

describe('Workflow API Route', () => {
  let mockLogger: jest.Mocked<Logger>;
  let mockWorkflowService: jest.Mocked<WorkflowService>;
  let mockRequest: NextRequest;

  // Test data fixtures following taste invariants
  const validWorkflowInput: CreateWorkflowInput = {
    name: 'deploy-service',
    description: 'Deploy service to production',
    pipelineId: 'pipe-123',
    trigger: {
      type: 'webhook',
      config: { branch: 'main' }
    },
    stages: [
      {
        name: 'build',
        type: 'ci',
        config: { image: 'node:18' }
      }
    ],
    tags: ['production', 'critical']
  };

  const mockWorkflow: WorkflowTypes = {
    id: 'wf-123',
    orgId: 'org-456',
    projectId: 'proj-789',
    ...validWorkflowInput,
    status: WorkflowStatus.ACTIVE,
    version: 1,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
    createdBy: 'user-001',
    updatedBy: 'user-001'
  };

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Initialize mocked logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      withContext: jest.fn().mockReturnThis()
    } as unknown as jest.Mocked<Logger>;

    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

    // Initialize mocked service
    mockWorkflowService = {
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      execute: jest.fn(),
      validateWorkflow: jest.fn()
    } as unknown as jest.Mocked<WorkflowService>;

    (WorkflowService as jest.Mock).mockImplementation(() => mockWorkflowService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Helper function to create mock NextRequest
   */
  const createMockRequest = (options: {
    method: string;
    body?: unknown;
    params?: Record<string, string>;
    headers?: Record<string, string>;
  }): NextRequest => {
    const { method, body, params = {}, headers = {} } = options;

    const url = new URL('http://localhost:3000/api/workflow');
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    return {
      method,
      url: url.toString(),
      json: jest.fn().mockResolvedValue(body),
      headers: new Headers(headers)
    } as unknown as NextRequest;
  };

  describe('POST /api/workflow', () => {
    describe('success cases', () => {
      it('should create workflow with valid input', async () => {
        // Arrange
        mockWorkflowService.create.mockResolvedValue(mockWorkflow);
        mockRequest = createMockRequest({
          method: 'POST',
          body: validWorkflowInput,
          headers: { 'x-org-id': 'org-456', 'x-project-id': 'proj-789' }
        });

        // Act
        const response = await POST(mockRequest);
        const responseData = await response.json();

        // Assert
        expect(response.status).toBe(201);
        expect(responseData).toEqual({
          success: true,
          data: mockWorkflow
        });
        expect(mockWorkflowService.create).toHaveBeenCalledWith(
          expect.objectContaining({
            ...validWorkflowInput,
            orgId: 'org-456',
            projectId: 'proj-789'
          })
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Workflow created successfully',
          expect.objectContaining({ workflowId: 'wf-123' })
        );
      });

      it('should create workflow with minimal required fields', async () => {
        // Arrange
        const minimalInput: CreateWorkflowInput = {
          name: 'minimal-workflow',
          pipelineId: 'pipe-123',
          trigger: { type: 'manual', config: {} },
          stages: []
        };
        const minimalWorkflow = { ...mockWorkflow, ...minimalInput };

        mockWorkflowService.create.mockResolvedValue(minimalWorkflow);
        mockRequest = createMockRequest({
          method: 'POST',
          body: minimalInput,
          headers: { 'x-org-id': 'org-456', 'x-project-id': 'proj-789' }
        });

        // Act
        const response = await POST(mockRequest);
        const responseData = await response.json();

        // Assert
        expect(response.status).toBe(201);
        expect(responseData.data.name).toBe('minimal-workflow');
      });
    });

    describe('error cases', () => {
      it('should return 400 for missing required fields', async () => {
        // Arrange
        const invalidInput = { description: 'Missing name and pipelineId' };
        mockRequest = createMockRequest({
          method: 'POST',
          body: invalidInput,
          headers: { 'x-org-id': 'org-456', 'x-project-id': 'proj-789' }
        });

        mockWorkflowService.create.mockRejectedValue(
          new ValidationError('Missing required fields: name, pipelineId')
        );

        // Act
        const response = await POST(mockRequest);
        const responseData = await response.json();

        // Assert
        expect(response.status).toBe(400);
        expect(responseData).toEqual({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Missing required fields: name, pipelineId'
          }
        });
        expect(mockLogger.warn).toHaveBeenCalled();
      });

      it('should return 400 for invalid trigger type', async () => {
        // Arrange
        const invalidInput = {
          ...validWorkflowInput,
          trigger: { type: 'invalid-type', config: {} }
        };
        mockRequest = createMockRequest({
          method: 'POST',
          body: invalidInput
        });

        mockWorkflowService.create.mockRejectedValue(
          new ValidationError('Invalid trigger type: invalid-type')
        );

        // Act
        const response = await POST(mockRequest);
        const responseData = await response.json();

        // Assert
        expect(response.status).toBe(400);
        expect(responseData.error.code).toBe('VALIDATION_ERROR');
      });

      it('should return 401 for missing authentication headers', async () => {
        // Arrange
        mockRequest = createMockRequest({
          method: 'POST',
          body: validWorkflowInput
          // No headers
        });

        // Act
        const response = await POST(mockRequest);
        const responseData = await response.json();

        // Assert
        expect(response.status).toBe(401);
        expect(responseData.error.code).toBe('UNAUTHORIZED');
      });

      it('should return 409 for duplicate workflow name', async () => {
        // Arrange
        mockRequest = createMockRequest({
          method: 'POST',
          body: validWorkflowInput,
          headers: { 'x-org-id': 'org-456', 'x-project-id': 'proj-789' }
        });

        mockWorkflowService.create.mockRejectedValue(
          new ConflictError('Workflow with name "deploy-service" already exists')
        );

        // Act
        const response = await POST(mockRequest);
        const responseData = await response.json();

        // Assert
        expect(response.status).toBe(409);
        expect(responseData.error.code).toBe('CONFLICT');
      });

      it('should return 413 for payload too large', async () => {
        // Arrange
        const largeInput = {
          ...validWorkflowInput,
          stages: Array(1000).fill(validWorkflowInput.stages[0]) // Exceeds limit
        };
        mockRequest = createMockRequest({
          method: 'POST',
          body: largeInput
        });

        // Act
        const response = await POST(mockRequest);
        const responseData = await response.json();

        // Assert
        expect(response.status).toBe(413);
        expect(responseData.error.code).toBe('PAYLOAD_TOO_LARGE');
      });

      it('should return 500 for unexpected service errors', async () => {
        // Arrange
        mockRequest = createMockRequest({
          method: 'POST',
          body: validWorkflowInput,
          headers: { 'x-org-id': 'org-456', 'x-project-id': 'proj-789' }
        });

        mockWorkflowService.create.mockRejectedValue(new Error('Database connection failed'));

        // Act
        const response = await POST(mockRequest);
        const responseData = await response.json();

        // Assert
        expect(response.status).toBe(500);
        expect(responseData.error.code).toBe('INTERNAL_ERROR');
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to create workflow',
          expect.any(Object)
        );
      });
    });

    describe('edge cases', () => {
      it('should handle empty stages array', async () => {
        // Arrange
        const inputWithEmptyStages = { ...validWorkflowInput, stages: [] };
        mockWorkflowService.create.mockResolvedValue({
          ...mockWorkflow,
          stages: []
        });
        mockRequest = createMockRequest({
          method: 'POST',
          body: inputWithEmptyStages,
          headers: { 'x-org-id': 'org-456', 'x-project-id': 'proj-789' }
        });

        // Act
        const response = await POST(mockRequest);

        // Assert
        expect(response.status).toBe(201);
      });

      it('should trim whitespace from name', async () => {
        // Arrange
        const inputWithWhitespace = { ...validWorkflowInput, name: '  deploy-service  ' };
        mockRequest = createMockRequest({
          method: 'POST',
          body: inputWithWhitespace,
          headers: { 'x-org-id': 'org-456', 'x-project-id': 'proj-789' }
        });

        // Act
        await POST(mockRequest);

        // Assert - verify service received trimmed name
        expect(mockWorkflowService.create).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'deploy-service' })
        );
      });

      it('should handle special characters in description', async () => {
        // Arrange
        const inputWithSpecialChars = {
          ...validWorkflowInput,
          description: 'Deploy <script>alert("xss")</script> & test "quotes"'
        };
        mockWorkflowService.create.mockResolvedValue(mockWorkflow);
        mockRequest = createMockRequest({
          method: 'POST',
          body: inputWithSpecialChars,
          headers: { 'x-org-id': 'org-456', 'x-project-id': 'proj-789' }
        });

        // Act
        const response = await POST(mockRequest);

        // Assert
        expect(response.status).toBe(201);
      });
    });
  });

  describe('GET /api/workflow', () => {
    describe('success cases', () => {
      it('should return paginated list of workflows', async () => {
        // Arrange
        const workflows = [mockWorkflow, { ...mockWorkflow, id: 'wf-124', name: 'test-workflow' }];
        mockWorkflowService.findAll.mockResolvedValue({
          data: workflows,
          pagination: {
            page: 1,
            limit: 20,
            total: 2,
            totalPages: 1
          }
        });
        mockRequest = createMockRequest({
          method: 'GET',
          params: { page: '1', limit: '20' },
          headers: { 'x-org-id': 'org-456', 'x-project-id': 'proj-789' }
        });

        // Act
        const response = await GET(mockRequest);
        const responseData = await response.json();

        // Assert
        expect(response.status).toBe(200);
        expect(responseData).toEqual({
          success: true,
          data: workflows,
          pagination: {
            page: 1,
            limit: 20,
            total: 2,
            totalPages: 1
          }
        });
      });

      it('should filter workflows by status', async () => {
        // Arrange
        mockWorkflowService.findAll.mockResolvedValue({
          data: [mockWorkflow],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
        });
        mockRequest = createMockRequest({
          method: 'GET',
          params: { status: WorkflowStatus.ACTIVE },
          headers: { 'x-org-id': 'org-456', 'x-project-id': 'proj-789' }
        });

        // Act
        await GET(mockRequest);

        // Assert
        expect(mockWorkflowService.findAll).toHaveBeenCalledWith(
          expect.objectContaining({ status: WorkflowStatus.ACTIVE })
        );
      });

      it('should return single workflow when id is provided', async () => {
        // Arrange
        mockWorkflowService.findById.mockResolvedValue(mockWorkflow);
        mockRequest = createMockRequest({
          method: 'GET',
          params: { id: 'wf-123' },
          headers: { 'x-org-id': 'org-456' }
        });

        // Act
        const response = await GET(mockRequest);
        const responseData = await response.json();

        // Assert
        expect(response.status).toBe(200);
        expect(responseData.data).toEqual(mockWorkflow);
      });
    });

    describe('error cases', () => {
      it('should return 404 for non-existent workflow', async () => {
        // Arrange
        mockWorkflowService.findById.mockRejectedValue(
          new NotFoundError('Workflow not found')
        );
        mockRequest = createMockRequest({
          method: 'GET',
          params: { id: 'non-existent' },
          headers: { 'x-org-id': 'org-456' }
        });

        // Act
        const response = await GET(mockRequest);
        const responseData = await response.json();

        // Assert
        expect(response.status).toBe(404);
        expect(responseData.error.code).toBe('NOT_FOUND');
      });

      it('should return 400 for invalid pagination params', async () => {
        // Arrange
        mockRequest = createMockRequest({
          method: 'GET',
          params: { page: '-1', limit: 'abc' },
          headers: { 'x-org-id': 'org-456', 'x-project-id': 'proj-789' }
        });

        // Act
        const response = await GET(mockRequest);
        const responseData = await response.json();

        // Assert
        expect(response.status).toBe(400);
        expect(responseData.error.code).toBe('VALIDATION_ERROR');
      });
    });
  });

  describe('PATCH /api/workflow', () => {
    describe('success cases', () => {
      it('should update workflow with valid input', async () => {
        // Arrange
        const updateInput: UpdateWorkflowInput = {
          name: 'updated-deploy-service',
          description: 'Updated description'
        };
        const updatedWorkflow = { ...mockWorkflow, ...updateInput, version: 2 };
        mockWorkflowService.update.mockResolvedValue(updatedWorkflow);
        mockRequest = createMockRequest({
          method: 'PATCH',
          body: updateInput,
          params: { id: 'wf-123' },
          headers: { 'x-org-id': 'org-456', 'x-user-id': 'user-001' }
        });

        // Act
        const response = await PATCH(mockRequest);
        const responseData = await response.json();

        // Assert
        expect(response.status).toBe(200);
        expect(responseData.data.version).toBe(2);
        expect(mockWorkflowService.update).toHaveBeenCalledWith('wf-123', updateInput, 'user-001');
      });

      it('should handle partial updates', async () => {
        // Arrange
        const partialUpdate: UpdateWorkflowInput = { status: WorkflowStatus.PAUSED };
        mockWorkflowService.update.mockResolvedValue({
          ...mockWorkflow,
          status: WorkflowStatus.PAUSED
        });
        mockRequest = createMockRequest({
          method: 'PATCH',
          body: partialUpdate,
          params: { id: 'wf-123' },
          headers: { 'x-org-id': 'org-456', 'x-user-id': 'user-001' }
        });

        // Act
        const response = await PATCH(mockRequest);

        // Assert
        expect(response.status).toBe(200);
      });
    });

    describe('error cases', () => {
      it('should return 400 for invalid update data', async () => {
        // Arrange
        mockRequest = createMockRequest({
          method: 'PATCH',
          body: { status: 'invalid-status' },
          params: { id: 'wf-123' },
          headers: { 'x-org-id': 'org-456', 'x-user-id': 'user-001' }
        });

        mockWorkflowService.update.mockRejectedValue(
          new ValidationError('Invalid status value')
        );

        // Act
        const response = await PATCH(mockRequest);

        // Assert
        expect(response.status).toBe(400);
      });

      it('should return 409 for concurrent modification', async () => {
        // Arrange
        mockRequest = createMockRequest({
          method: 'PATCH',
          body: { name: 'new-name' },
          params: { id: 'wf-123' },
          headers: { 'x-org-id': 'org-456', 'x-user-id': 'user-001' }
        });

        mockWorkflowService.update.mockRejectedValue(
          new ConflictError('Workflow was modified by another user')
        );

        // Act
        const response = await PATCH(mockRequest);
        const responseData = await response.json();

        // Assert
        expect(response.status).toBe(409);
        expect(responseData.error.code).toBe('CONFLICT');
      });
    });
  });

  describe('DELETE /api/workflow', () => {
    describe('success cases', () => {
      it('should delete workflow successfully', async () => {
        // Arrange
        mockWorkflowService.delete.mockResolvedValue(undefined);
        mockRequest = createMockRequest({
          method: 'DELETE',
          params: { id: 'wf-123' },
          headers: { 'x-org-id': 'org-456', 'x-user-id': 'user-001' }
        });

        // Act
        const response = await DELETE(mockRequest);
        const responseData = await response.json();

        // Assert
        expect(response.status).toBe(200);
        expect(responseData).toEqual({
          success: true,
          message: 'Workflow deleted successfully'
        });
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Workflow deleted',
          expect.objectContaining({ workflowId: 'wf-123' })
        );
      });
    });

    describe('error cases', () => {
      it('should return 404 for non-existent workflow', async () => {
        // Arrange
        mockWorkflowService.delete.mockRejectedValue(
          new NotFoundError('Workflow not found')
        );
        mockRequest = createMockRequest({
          method: 'DELETE',
          params: { id: 'non-existent' },
          headers: { 'x-org-id': 'org-456', 'x-user-id': 'user-001' }
        });

        // Act
        const response = await DELETE(mockRequest);

        // Assert
        expect(response.status).toBe(404);
      });

      it('should return 403 for workflow with active executions', async () => {
        // Arrange
        mockWorkflowService.delete.mockRejectedValue(
          new ConflictError('Cannot delete workflow with active executions')
        );
        mockRequest = createMockRequest({
          method: 'DELETE',
          params: { id: 'wf-123' },
          headers: { 'x-org-id': 'org-456', 'x-user-id': 'user-001' }
        });

        // Act
        const response = await DELETE(mockRequest);
        const responseData = await response.json();

        // Assert
        expect(response.status).toBe(409);
        expect(responseData.error.message).toContain('active executions');
      });
    });
  });

  describe('rate limiting and security', () => {
    it('should enforce rate limiting on POST requests', async () => {
      // Arrange - simulate rate limit exceeded
      mockRequest = createMockRequest({
        method: 'POST',
        body: validWorkflowInput,
        headers: { 'x-org-id': 'org-456', 'x-project-id': 'proj-789' }
      });

      // Mock rate limiter to throw error
      jest.mock('@/layers/runtime/rate-limiter', () => ({
        checkRateLimit: jest.fn().mockRejectedValue(new Error('Rate limit exceeded'))
      }));

      // Act
      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Assert
      expect(response.status).toBe(429);
      expect(responseData.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should sanitize input to prevent injection attacks', async () => {
      // Arrange
      const maliciousInput = {
        ...validWorkflowInput,
        name: "workflow'; DROP TABLE workflows; --"
      };
      mockRequest = createMockRequest({
        method: 'POST',
        body: maliciousInput,
        headers: { 'x-org-id': 'org-456', 'x-project-id': 'proj-789' }
      });

      mockWorkflowService.create.mockResolvedValue(mockWorkflow);

      // Act
      const response = await POST(mockRequest);

      // Assert - should not throw and should sanitize input
      expect(response.status).toBe(201);
      // Verify the malicious input was not passed directly to service
      const serviceCall = mockWorkflowService.create.mock.calls[0][0];
      expect(serviceCall.name).not.toContain('DROP TABLE');
    });
  });
});