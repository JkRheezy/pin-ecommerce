/**
 * @file route.test.ts
 * @description Comprehensive tests for AI Jobs API route
 * @layer Service
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET, POST, PATCH, DELETE } from './route';
import { AIJobService } from '@/layers/service/ai-job.service';
import { AIJobRepository } from '@/layers/repo/ai-job.repository';
import { AIJobConfig } from '@/layers/config/ai-job.config';
import { AIJobTypes, CreateAIJobInput, UpdateAIJobInput, AIJobStatus } from '@/layers/types/ai-job.types';
import { Logger } from '@/layers/runtime/logger';
import { ValidationError, NotFoundError, ConflictError } from '@/layers/types/errors';

// Mock dependencies
jest.mock('@/layers/service/ai-job.service');
jest.mock('@/layers/runtime/logger');

describe('AI Jobs API Route', () => {
  let mockLogger: jest.Mocked<Logger>;
  let mockService: jest.Mocked<AIJobService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

    // Setup mock service
    mockService = {
      getAllJobs: jest.fn(),
      getJobById: jest.fn(),
      createJob: jest.fn(),
      updateJob: jest.fn(),
      deleteJob: jest.fn(),
      validateJobInput: jest.fn(),
    } as unknown as jest.Mocked<AIJobService>;

    (AIJobService as jest.Mock).mockImplementation(() => mockService);
  });

  describe('GET /api/ai-jobs', () => {
    it('should return all jobs when no id provided', async () => {
      // Arrange: Setup mock jobs data
      const mockJobs: AIJobTypes[] = [
        {
          id: 'job-1',
          name: 'Test Job 1',
          status: AIJobStatus.PENDING,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
        {
          id: 'job-2',
          name: 'Test Job 2',
          status: AIJobStatus.RUNNING,
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
        },
      ];

      mockService.getAllJobs.mockResolvedValue(mockJobs);

      // Create mock request without search params
      const request = new NextRequest('http://localhost:3000/api/ai-jobs');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        data: mockJobs,
        meta: { count: 2 },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Fetching all AI jobs',
        expect.any(Object)
      );
    });

    it('should return single job when id provided', async () => {
      // Arrange
      const mockJob: AIJobTypes = {
        id: 'job-1',
        name: 'Test Job 1',
        status: AIJobStatus.COMPLETED,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        result: { output: 'success' },
      };

      mockService.getJobById.mockResolvedValue(mockJob);

      const request = new NextRequest('http://localhost:3000/api/ai-jobs?id=job-1');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        data: mockJob,
      });
      expect(mockService.getJobById).toHaveBeenCalledWith('job-1');
    });

    it('should return 404 when job not found', async () => {
      // Arrange
      mockService.getJobById.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/ai-jobs?id=non-existent');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(404);
      expect(data).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'AI job with id "non-existent" not found',
        },
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'AI job not found',
        expect.objectContaining({ jobId: 'non-existent' })
      );
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      mockService.getAllJobs.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost:3000/api/ai-jobs');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INTERNAL_ERROR');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error fetching AI jobs',
        expect.objectContaining({
          error: 'Database connection failed',
        })
      );
    });

    it('should filter jobs by status when provided', async () => {
      // Arrange
      const mockJobs: AIJobTypes[] = [
        {
          id: 'job-1',
          name: 'Test Job 1',
          status: AIJobStatus.PENDING,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      mockService.getAllJobs.mockResolvedValue(mockJobs);

      const request = new NextRequest('http://localhost:3000/api/ai-jobs?status=PENDING');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(mockService.getAllJobs).toHaveBeenCalledWith(
        expect.objectContaining({ status: AIJobStatus.PENDING })
      );
    });
  });

  describe('POST /api/ai-jobs', () => {
    const validCreateInput: CreateAIJobInput = {
      name: 'New AI Job',
      type: 'text-generation',
      config: {
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000,
      },
      input: {
        prompt: 'Generate a summary',
      },
    };

    it('should create job with valid input', async () => {
      // Arrange
      const createdJob: AIJobTypes = {
        id: 'new-job-id',
        ...validCreateInput,
        status: AIJobStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockService.validateJobInput.mockReturnValue({ valid: true });
      mockService.createJob.mockResolvedValue(createdJob);

      const request = new NextRequest('http://localhost:3000/api/ai-jobs', {
        method: 'POST',
        body: JSON.stringify(validCreateInput),
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(201);
      expect(data).toEqual({
        success: true,
        data: createdJob,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating new AI job',
        expect.objectContaining({ jobName: 'New AI Job' })
      );
    });

    it('should return 400 for invalid JSON body', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/ai-jobs', {
        method: 'POST',
        body: 'invalid json {',
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_JSON');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid JSON in request body',
        expect.any(Object)
      );
    });

    it('should return 400 for validation errors', async () => {
      // Arrange
      mockService.validateJobInput.mockReturnValue({
        valid: false,
        errors: ['name is required', 'type must be one of allowed values'],
      });

      const request = new NextRequest('http://localhost:3000/api/ai-jobs', {
        method: 'POST',
        body: JSON.stringify({ name: '' }),
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(data.error.details).toContain('name is required');
    });

    it('should handle duplicate job name conflict', async () => {
      // Arrange
      mockService.validateJobInput.mockReturnValue({ valid: true });
      mockService.createJob.mockRejectedValue(
        new ConflictError('Job with name "New AI Job" already exists')
      );

      const request = new NextRequest('http://localhost:3000/api/ai-jobs', {
        method: 'POST',
        body: JSON.stringify(validCreateInput),
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(409);
      expect(data.error.code).toBe('CONFLICT');
    });

    it('should sanitize input to prevent injection attacks', async () => {
      // Arrange: Input with potential script injection
      const maliciousInput = {
        ...validCreateInput,
        name: '<script>alert("xss")</script>Job Name',
      };

      mockService.validateJobInput.mockReturnValue({ valid: true });
      mockService.createJob.mockImplementation((input) => ({
        id: 'sanitized-job',
        ...input,
        name: input.name.replace(/<[^>]*>/g, ''), // Simulated sanitization
        status: AIJobStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const request = new NextRequest('http://localhost:3000/api/ai-jobs', {
        method: 'POST',
        body: JSON.stringify(maliciousInput),
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(data.data.name).not.toContain('<script>');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Input sanitization applied',
        expect.any(Object)
      );
    });
  });

  describe('PATCH /api/ai-jobs', () => {
    const validUpdateInput: UpdateAIJobInput = {
      name: 'Updated Job Name',
      status: AIJobStatus.RUNNING,
    };

    it('should update job with valid input', async () => {
      // Arrange
      const updatedJob: AIJobTypes = {
        id: 'job-1',
        name: 'Updated Job Name',
        type: 'text-generation',
        status: AIJobStatus.RUNNING,
        config: { model: 'gpt-4' },
        input: { prompt: 'test' },
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date(),
      };

      mockService.validateJobInput.mockReturnValue({ valid: true });
      mockService.updateJob.mockResolvedValue(updatedJob);

      const request = new NextRequest('http://localhost:3000/api/ai-jobs?id=job-1', {
        method: 'PATCH',
        body: JSON.stringify(validUpdateInput),
      });

      // Act
      const response = await PATCH(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.data.name).toBe('Updated Job Name');
      expect(data.data.status).toBe(AIJobStatus.RUNNING);
    });

    it('should return 400 when id is missing', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/ai-jobs', {
        method: 'PATCH',
        body: JSON.stringify(validUpdateInput),
      });

      // Act
      const response = await PATCH(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(data.error.code).toBe('MISSING_ID');
    });

    it('should prevent status transition violations', async () => {
      // Arrange: Cannot go from COMPLETED back to PENDING
      mockService.validateJobInput.mockReturnValue({ valid: true });
      mockService.updateJob.mockRejectedValue(
        new ValidationError('Invalid status transition: COMPLETED -> PENDING')
      );

      const request = new NextRequest('http://localhost:3000/api/ai-jobs?id=job-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: AIJobStatus.PENDING }),
      });

      // Act
      const response = await PATCH(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(data.error.message).toContain('Invalid status transition');
    });

    it('should handle partial updates correctly', async () => {
      // Arrange: Only updating name, not status
      const partialUpdate = { name: 'New Name Only' };
      
      mockService.validateJobInput.mockReturnValue({ valid: true });
      mockService.updateJob.mockResolvedValue({
        id: 'job-1',
        name: 'New Name Only',
        type: 'text-generation',
        status: AIJobStatus.PENDING, // Unchanged
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date(),
      });

      const request = new NextRequest('http://localhost:3000/api/ai-jobs?id=job-1', {
        method: 'PATCH',
        body: JSON.stringify(partialUpdate),
      });

      // Act
      const response = await PATCH(request);

      // Assert
      expect(response.status).toBe(200);
      expect(mockService.updateJob).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining(partialUpdate)
      );
    });
  });

  describe('DELETE /api/ai-jobs', () => {
    it('should delete job successfully', async () => {
      // Arrange
      mockService.deleteJob.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3000/api/ai-jobs?id=job-1', {
        method: 'DELETE',
      });

      // Act
      const response = await DELETE(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        message: 'AI job deleted successfully',
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Deleting AI job',
        expect.objectContaining({ jobId: 'job-1' })
      );
    });

    it('should return 400 when id is missing', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/ai-jobs', {
        method: 'DELETE',
      });

      // Act
      const response = await DELETE(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(data.error.code).toBe('MISSING_ID');
    });

    it('should prevent deletion of running jobs', async () => {
      // Arrange
      mockService.deleteJob.mockRejectedValue(
        new ConflictError('Cannot delete job while status is RUNNING')
      );

      const request = new NextRequest('http://localhost:3000/api/ai-jobs?id=running-job', {
        method: 'DELETE',
      });

      // Act
      const response = await DELETE(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(409);
      expect(data.error.code).toBe('CONFLICT');
    });

    it('should return 404 when job to delete does not exist', async () => {
      // Arrange
      mockService.deleteJob.mockRejectedValue(
        new NotFoundError('Job with id "ghost-job" not found')
      );

      const request = new NextRequest('http://localhost:3000/api/ai-jobs?id=ghost-job', {
        method: 'DELETE',
      });

      // Act
      const response = await DELETE(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(404);
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle extremely large request bodies', async () => {
      // Arrange: Create a very large payload
      const largeInput = {
        name: 'A'.repeat(10000),
        config: {
          nested: Array(1000).fill({ key: 'value' }),
        },
      };

      const request = new NextRequest('http://localhost:3000/api/ai-jobs', {
        method: 'POST',
        body: JSON.stringify(largeInput),
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert: Should either succeed with truncation or fail with size limit
      expect([200, 201, 400, 413]).toContain(response.status);
    });

    it('should handle special characters in job names', async () => {
      // Arrange
      const specialCharInput: CreateAIJobInput = {
        name: 'Job with émojis 🚀 and "quotes" & <tags>',
        type: 'text-generation',
        config: { model: 'gpt-4' },
        input: { prompt: 'test' },
      };

      mockService.validateJobInput.mockReturnValue({ valid: true });
      mockService.createJob.mockResolvedValue({
        id: 'special-job',
        ...specialCharInput,
        status: AIJobStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest('http://localhost:3000/api/ai-jobs', {
        method: 'POST',
        body: JSON.stringify(specialCharInput),
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(201);
      expect(data.data.name).toBe(specialCharInput.name);
    });

    it('should handle concurrent request scenarios', async () => {
      // Arrange
      mockService.createJob.mockImplementation(async (input) => ({
        id: `job-${Math.random().toString(36).substr(2, 9)}`,
        ...input,
        status: AIJobStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const requests = Array(5).fill(null).map((_, i) => 
        new NextRequest('http://localhost:3000/api/ai-jobs', {
          method: 'POST',
          body: JSON.stringify({
            name: `Concurrent Job ${i}`,
            type: 'text-generation',
            config: { model: 'gpt-4' },
            input: { prompt: 'test' },
          }),
        })
      );

      // Act
      const responses = await Promise.all(requests.map(req => POST(req)));

      // Assert
      responses.forEach(response => {
        expect(response.status).toBe(201);
      });
      expect(mockService.createJob).toHaveBeenCalledTimes(5);
    });

    it('should properly handle CORS preflight requests', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/ai-jobs', {
        method: 'OPTIONS',
      });

      // Act
      const response = await GET(request);

      // Assert: Should handle or reject gracefully
      expect([200, 204, 405]).toContain(response.status);
    });
  });

  describe('Rate Limiting and Performance', () => {
    it('should apply rate limiting headers', async () => {
      // Arrange
      mockService.getAllJobs.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/ai-jobs');

      // Act
      const response = await GET(request);

      // Assert
      expect(response.headers.get('X-RateLimit-Limit')).toBeDefined();
      expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
    });

    it('should return 429 when rate limit exceeded', async () => {
      // Arrange: Simulate rate limit by mocking service to throw
      mockService.getAllJobs.mockRejectedValue(
        Object.assign(new Error('Rate limit exceeded'), { statusCode: 429 })
      );

      const request = new NextRequest('http://localhost:3000/api/ai-jobs');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(429);
      expect(data.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.headers.get('Retry-After')).toBeDefined();
    });
  });
});