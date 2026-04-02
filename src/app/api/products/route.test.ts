/**
 * @fileoverview Unit tests for products API route
 * @module src/app/api/products/route.test
 */

import { NextRequest } from 'next/server';
import { GET, POST, PUT, DELETE } from './route';
import { ProductService } from '@/layers/service/product.service';
import { ProductRepository } from '@/layers/repo/product.repository';
import { ProductConfig } from '@/layers/config/product.config';
import { ProductType, CreateProductInput, UpdateProductInput } from '@/layers/types/product.types';
import { Logger } from '@/lib/logger';
import { ValidationError, NotFoundError, DatabaseError } from '@/lib/errors';

// Mock dependencies
jest.mock('@/layers/service/product.service');
jest.mock('@/lib/logger');

describe('Products API Route', () => {
  let mockProductService: jest.Mocked<ProductService>;
  let mockLogger: jest.Mocked<Logger>;

  // Test data fixtures following taste invariants
  const mockProduct: ProductType = {
    id: 'prod-123',
    name: 'Test Product',
    description: 'A test product description',
    price: 99.99,
    currency: 'USD',
    sku: 'TEST-SKU-001',
    category: 'electronics',
    status: 'active',
    inventory: 100,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    metadata: {
      brand: 'TestBrand',
      weight: 1.5,
      dimensions: { length: 10, width: 5, height: 3 }
    }
  };

  const mockCreateInput: CreateProductInput = {
    name: 'New Product',
    description: 'A new product',
    price: 49.99,
    currency: 'USD',
    sku: 'NEW-SKU-001',
    category: 'electronics',
    inventory: 50
  };

  const mockUpdateInput: UpdateProductInput = {
    id: 'prod-123',
    name: 'Updated Product',
    price: 79.99
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Initialize mocked logger with structured logging
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as unknown as jest.Mocked<Logger>;

    (Logger as jest.MockedClass<typeof Logger>).mockImplementation(() => mockLogger);

    // Initialize mocked product service
    mockProductService = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      search: jest.fn()
    } as unknown as jest.Mocked<ProductService>;

    (ProductService as jest.MockedClass<typeof ProductService>).mockImplementation(
      () => mockProductService
    );
  });

  describe('GET /api/products', () => {
    it('should return all products with default pagination', async () => {
      // Arrange: Setup mock response with taste invariants for pagination
      const mockResponse = {
        data: [mockProduct],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1
        }
      };
      mockProductService.findAll.mockResolvedValue(mockResponse);

      // Act: Execute GET request
      const request = new NextRequest('http://localhost:3000/api/products');
      const response = await GET(request);
      const result = await response.json();

      // Assert: Verify response structure and service call
      expect(response.status).toBe(200);
      expect(result).toEqual({
        success: true,
        data: mockResponse.data,
        pagination: mockResponse.pagination
      });
      expect(mockProductService.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Fetching products',
        expect.objectContaining({ query: expect.any(Object) })
      );
    });

    it('should handle custom pagination parameters', async () => {
      // Arrange: Setup with custom pagination
      const mockResponse = {
        data: [mockProduct],
        pagination: { page: 2, limit: 10, total: 15, totalPages: 2 }
      };
      mockProductService.findAll.mockResolvedValue(mockResponse);

      // Act: Execute with query parameters
      const request = new NextRequest(
        'http://localhost:3000/api/products?page=2&limit=10&sortBy=name&sortOrder=asc'
      );
      const response = await GET(request);

      // Assert: Verify custom parameters are passed
      expect(mockProductService.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        sortBy: 'name',
        sortOrder: 'asc'
      });
    });

    it('should validate and clamp invalid pagination values', async () => {
      // Arrange: Test edge case with negative values
      mockProductService.findAll.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 0 }
      });

      // Act: Request with invalid parameters
      const request = new NextRequest(
        'http://localhost:3000/api/products?page=-1&limit=999'
      );
      await GET(request);

      // Assert: Values should be clamped to valid ranges
      expect(mockProductService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          limit: 100 // Max limit enforced
        })
      );
    });

    it('should handle search query parameter', async () => {
      // Arrange: Setup search functionality
      const searchResults = { data: [mockProduct], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } };
      mockProductService.search.mockResolvedValue(searchResults);

      // Act: Execute search request
      const request = new NextRequest(
        'http://localhost:3000/api/products?q=test+product'
      );
      const response = await GET(request);
      const result = await response.json();

      // Assert: Verify search is triggered
      expect(response.status).toBe(200);
      expect(mockProductService.search).toHaveBeenCalledWith('test product', expect.any(Object));
      expect(result.data).toEqual([mockProduct]);
    });

    it('should handle service errors with proper error response', async () => {
      // Arrange: Simulate database error
      const dbError = new DatabaseError('Connection failed', 'ECONNREFUSED');
      mockProductService.findAll.mockRejectedValue(dbError);

      // Act: Execute request
      const request = new NextRequest('http://localhost:3000/api/products');
      const response = await GET(request);
      const result = await response.json();

      // Assert: Verify error handling follows taste invariants
      expect(response.status).toBe(500);
      expect(result).toEqual({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch products',
          details: expect.any(Object)
        }
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error fetching products',
        expect.objectContaining({ error: dbError.message })
      );
    });
  });

  describe('POST /api/products', () => {
    it('should create a new product with valid input', async () => {
      // Arrange: Setup successful creation
      mockProductService.create.mockResolvedValue(mockProduct);

      // Act: Execute POST request
      const request = new NextRequest('http://localhost:3000/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockCreateInput)
      });
      const response = await POST(request);
      const result = await response.json();

      // Assert: Verify creation flow
      expect(response.status).toBe(201);
      expect(result).toEqual({
        success: true,
        data: mockProduct,
        message: 'Product created successfully'
      });
      expect(mockProductService.create).toHaveBeenCalledWith(
        expect.objectContaining(mockCreateInput)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Product created',
        expect.objectContaining({ productId: mockProduct.id })
      );
    });

    it('should reject invalid input with validation errors', async () => {
      // Arrange: Invalid input missing required fields
      const invalidInput = {
        name: '', // Empty name should fail validation
        price: -10 // Negative price should fail
      };

      // Act: Execute with invalid data
      const request = new NextRequest('http://localhost:3000/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidInput)
      });
      const response = await POST(request);
      const result = await response.json();

      // Assert: Verify validation error response
      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.details).toContainEqual(
        expect.objectContaining({ field: 'name' })
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Product validation failed',
        expect.any(Object)
      );
    });

    it('should handle duplicate SKU errors', async () => {
      // Arrange: Simulate unique constraint violation
      const duplicateError = new DatabaseError(
        'Duplicate SKU',
        'UNIQUE_VIOLATION',
        { field: 'sku' }
      );
      mockProductService.create.mockRejectedValue(duplicateError);

      // Act: Execute request
      const request = new NextRequest('http://localhost:3000/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockCreateInput)
      });
      const response = await POST(request);
      const result = await response.json();

      // Assert: Verify conflict response
      expect(response.status).toBe(409);
      expect(result.error.code).toBe('DUPLICATE_ERROR');
      expect(result.error.message).toContain('SKU already exists');
    });

    it('should handle malformed JSON body', async () => {
      // Act: Execute with invalid JSON
      const request = new NextRequest('http://localhost:3000/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{{'
      });
      const response = await POST(request);
      const result = await response.json();

      // Assert: Verify parse error handling
      expect(response.status).toBe(400);
      expect(result.error.code).toBe('PARSE_ERROR');
    });
  });

  describe('PUT /api/products', () => {
    it('should update an existing product', async () => {
      // Arrange: Setup successful update
      const updatedProduct = { ...mockProduct, ...mockUpdateInput };
      mockProductService.update.mockResolvedValue(updatedProduct);

      // Act: Execute PUT request
      const request = new NextRequest('http://localhost:3000/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockUpdateInput)
      });
      const response = await PUT(request);
      const result = await response.json();

      // Assert: Verify update flow
      expect(response.status).toBe(200);
      expect(result).toEqual({
        success: true,
        data: updatedProduct,
        message: 'Product updated successfully'
      });
      expect(mockProductService.update).toHaveBeenCalledWith(
        mockUpdateInput.id,
        expect.objectContaining({ name: mockUpdateInput.name, price: mockUpdateInput.price })
      );
    });

    it('should return 404 for non-existent product', async () => {
      // Arrange: Setup not found error
      mockProductService.update.mockRejectedValue(
        new NotFoundError('Product', mockUpdateInput.id)
      );

      // Act: Execute update for missing product
      const request = new NextRequest('http://localhost:3000/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockUpdateInput)
      });
      const response = await PUT(request);
      const result = await response.json();

      // Assert: Verify not found response
      expect(response.status).toBe(404);
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toContain(mockUpdateInput.id);
    });

    it('should reject update without product ID', async () => {
      // Act: Execute without required ID
      const request = new NextRequest('http://localhost:3000/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' }) // Missing ID
      });
      const response = await PUT(request);
      const result = await response.json();

      // Assert: Verify validation error
      expect(response.status).toBe(400);
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.details).toContainEqual(
        expect.objectContaining({ field: 'id', message: 'Product ID is required' })
      );
    });
  });

  describe('DELETE /api/products', () => {
    it('should delete a product by ID', async () => {
      // Arrange: Setup successful deletion
      mockProductService.delete.mockResolvedValue(undefined);

      // Act: Execute DELETE request
      const request = new NextRequest(
        'http://localhost:3000/api/products?id=prod-123',
        { method: 'DELETE' }
      );
      const response = await DELETE(request);
      const result = await response.json();

      // Assert: Verify deletion flow
      expect(response.status).toBe(200);
      expect(result).toEqual({
        success: true,
        message: 'Product deleted successfully',
        data: { id: 'prod-123' }
      });
      expect(mockProductService.delete).toHaveBeenCalledWith('prod-123');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Product deleted',
        expect.objectContaining({ productId: 'prod-123' })
      );
    });

    it('should return 400 when ID is missing', async () => {
      // Act: Execute without ID parameter
      const request = new NextRequest(
        'http://localhost:3000/api/products',
        { method: 'DELETE' }
      );
      const response = await DELETE(request);
      const result = await response.json();

      // Assert: Verify validation error
      expect(response.status).toBe(400);
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('Product ID is required');
    });

    it('should handle not found error during deletion', async () => {
      // Arrange: Setup not found scenario
      mockProductService.delete.mockRejectedValue(
        new NotFoundError('Product', 'non-existent')
      );

      // Act: Execute delete for missing product
      const request = new NextRequest(
        'http://localhost:3000/api/products?id=non-existent',
        { method: 'DELETE' }
      );
      const response = await DELETE(request);
      const result = await response.json();

      // Assert: Verify not found response
      expect(response.status).toBe(404);
      expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Arrange: Simulate unexpected error
      mockProductService.findAll.mockImplementation(() => {
        throw new Error('Unexpected crash');
      });

      // Act: Execute request
      const request = new NextRequest('http://localhost:3000/api/products');
      const response = await GET(request);
      const result = await response.json();

      // Assert: Verify graceful degradation
      expect(response.status).toBe(500);
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('An unexpected error occurred');
      // Internal error details should not be exposed
      expect(result.error.details).not.toContain('Unexpected crash');
    });

    it('should handle timeout scenarios', async () => {
      // Arrange: Simulate timeout
      mockProductService.findAll.mockRejectedValue(
        new DatabaseError('Query timeout', 'TIMEOUT_ERROR')
      );

      // Act: Execute request
      const request = new NextRequest('http://localhost:3000/api/products');
      const response = await GET(request);

      // Assert: Verify timeout handling
      expect(response.status).toBe(504);
    });
  });
});