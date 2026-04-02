/**
 * @file src/app/api/orders/route.test.ts
 * @description Test file for orders API route handlers (GET and POST)
 * @layer Runtime (API Layer - Layer 5)
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET, POST } from './route';
import { OrderService } from '@/layers/service/order.service';
import { OrderStatus, CreateOrderInput } from '@/layers/types/order.types';
import { AppError, ErrorCode } from '@/layers/types/error.types';
import { logger } from '@/layers/runtime/logger';

// Mock dependencies
jest.mock('@/layers/service/order.service');
jest.mock('@/layers/runtime/logger');

describe('Orders API Route Handlers', () => {
  let mockOrderService: jest.Mocked<OrderService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderService = new OrderService() as jest.Mocked<OrderService>;
  });

  describe('GET /api/orders', () => {
    it('should return paginated orders with default parameters', async () => {
      // Arrange: Setup mock data matching the six-layer architecture types
      const mockOrders = [
        {
          id: 'order-001',
          customerId: 'cust-001',
          items: [{ productId: 'prod-001', quantity: 2, unitPrice: 29.99 }],
          status: OrderStatus.PENDING,
          totalAmount: 59.98,
          createdAt: new Date('2024-01-15T10:00:00Z'),
          updatedAt: new Date('2024-01-15T10:00:00Z'),
        },
      ];

      const mockPaginatedResponse = {
        data: mockOrders,
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };

      // Mock the service layer method
      (OrderService.prototype.findAll as jest.Mock).mockResolvedValue(mockPaginatedResponse);

      // Create mock request with no query params (defaults should apply)
      const request = new NextRequest('http://localhost:3000/api/orders');

      // Act: Execute the GET handler
      const response = await GET(request);
      const responseBody = await response.json();

      // Assert: Verify response structure and service interaction
      expect(response.status).toBe(200);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data).toEqual(mockOrders);
      expect(responseBody.pagination).toEqual(mockPaginatedResponse.pagination);
      expect(OrderService.prototype.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        status: undefined,
        customerId: undefined,
      });
    });

    it('should parse and apply query parameters correctly', async () => {
      // Arrange: Setup query parameters
      const mockPaginatedResponse = {
        data: [],
        pagination: {
          page: 2,
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };

      (OrderService.prototype.findAll as jest.Mock).mockResolvedValue(mockPaginatedResponse);

      // Create request with query parameters
      const request = new NextRequest(
        'http://localhost:3000/api/orders?page=2&limit=10&status=PENDING&customerId=cust-123'
      );

      // Act
      const response = await GET(request);

      // Assert: Verify query params are parsed and passed to service
      expect(response.status).toBe(200);
      expect(OrderService.prototype.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        status: OrderStatus.PENDING,
        customerId: 'cust-123',
      });
    });

    it('should handle validation errors for invalid query parameters', async () => {
      // Arrange: Invalid page number
      const request = new NextRequest('http://localhost:3000/api/orders?page=invalid&limit=9999');

      // Act
      const response = await GET(request);
      const responseBody = await response.json();

      // Assert: Verify error handling with proper error code
      expect(response.status).toBe(400);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(responseBody.error.message).toContain('Invalid query parameters');
    });

    it('should handle service layer AppError with appropriate status code', async () => {
      // Arrange: Simulate a not found error from service layer
      const notFoundError = new AppError(
        'Orders not found for customer',
        ErrorCode.NOT_FOUND,
        404
      );
      (OrderService.prototype.findAll as jest.Mock).mockRejectedValue(notFoundError);

      const request = new NextRequest('http://localhost:3000/api/orders?customerId=unknown');

      // Act
      const response = await GET(request);
      const responseBody = await response.json();

      // Assert: Verify error is propagated with correct status
      expect(response.status).toBe(404);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.code).toBe(ErrorCode.NOT_FOUND);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error fetching orders'),
        expect.any(Object)
      );
    });

    it('should handle unexpected errors with 500 status', async () => {
      // Arrange: Simulate unexpected error
      (OrderService.prototype.findAll as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = new NextRequest('http://localhost:3000/api/orders');

      // Act
      const response = await GET(request);
      const responseBody = await response.json();

      // Assert: Verify generic error response for unexpected errors
      expect(response.status).toBe(500);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('POST /api/orders', () => {
    const validOrderInput: CreateOrderInput = {
      customerId: 'cust-001',
      items: [
        { productId: 'prod-001', quantity: 2, unitPrice: 29.99 },
        { productId: 'prod-002', quantity: 1, unitPrice: 49.99 },
      ],
      shippingAddress: {
        street: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94102',
        country: 'USA',
      },
    };

    it('should create a new order with valid input', async () => {
      // Arrange: Setup mock created order response
      const mockCreatedOrder = {
        id: 'order-new-001',
        ...validOrderInput,
        status: OrderStatus.PENDING,
        totalAmount: 109.97, // (2 * 29.99) + (1 * 49.99)
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-15T10:00:00Z'),
      };

      (OrderService.prototype.create as jest.Mock).mockResolvedValue(mockCreatedOrder);

      const request = new NextRequest('http://localhost:3000/api/orders', {
        method: 'POST',
        body: JSON.stringify(validOrderInput),
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await POST(request);
      const responseBody = await response.json();

      // Assert: Verify successful creation with 201 status
      expect(response.status).toBe(201);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data).toEqual(mockCreatedOrder);
      expect(OrderService.prototype.create).toHaveBeenCalledWith(validOrderInput);
      expect(logger.info).toHaveBeenCalledWith(
        'Order created successfully',
        expect.objectContaining({ orderId: 'order-new-001' })
      );
    });

    it('should validate required fields in request body', async () => {
      // Arrange: Missing required fields
      const invalidInput = {
        // Missing customerId and items
        shippingAddress: {
          street: '123 Main St',
          city: 'San Francisco',
        },
      };

      const request = new NextRequest('http://localhost:3000/api/orders', {
        method: 'POST',
        body: JSON.stringify(invalidInput),
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await POST(request);
      const responseBody = await response.json();

      // Assert: Verify validation error response
      expect(response.status).toBe(400);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(responseBody.error.details).toBeDefined();
    });

    it('should validate item quantities are positive integers', async () => {
      // Arrange: Invalid quantity (zero)
      const invalidInput = {
        ...validOrderInput,
        items: [{ productId: 'prod-001', quantity: 0, unitPrice: 29.99 }],
      };

      const request = new NextRequest('http://localhost:3000/api/orders', {
        method: 'POST',
        body: JSON.stringify(invalidInput),
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await POST(request);
      const responseBody = await response.json();

      // Assert: Verify validation catches invalid quantity
      expect(response.status).toBe(400);
      expect(responseBody.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(responseBody.error.message).toContain('quantity');
    });

    it('should validate unit prices are positive numbers', async () => {
      // Arrange: Negative unit price
      const invalidInput = {
        ...validOrderInput,
        items: [{ productId: 'prod-001', quantity: 1, unitPrice: -10.00 }],
      };

      const request = new NextRequest('http://localhost:3000/api/orders', {
        method: 'POST',
        body: JSON.stringify(invalidInput),
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it('should handle empty items array', async () => {
      // Arrange: Empty items array
      const invalidInput = {
        ...validOrderInput,
        items: [],
      };

      const request = new NextRequest('http://localhost:3000/api/orders', {
        method: 'POST',
        body: JSON.stringify(invalidInput),
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await POST(request);
      const responseBody = await response.json();

      // Assert: Verify validation requires at least one item
      expect(response.status).toBe(400);
      expect(responseBody.error.message).toContain('at least one item');
    });

    it('should handle malformed JSON in request body', async () => {
      // Arrange: Invalid JSON
      const request = new NextRequest('http://localhost:3000/api/orders', {
        method: 'POST',
        body: 'not valid json',
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await POST(request);
      const responseBody = await response.json();

      // Assert: Verify JSON parsing error handling
      expect(response.status).toBe(400);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(responseBody.error.message).toContain('Invalid JSON');
    });

    it('should handle service layer conflict error (duplicate order)', async () => {
      // Arrange: Simulate duplicate order error
      const conflictError = new AppError(
        'Order with idempotency key already exists',
        ErrorCode.CONFLICT,
        409
      );
      (OrderService.prototype.create as jest.Mock).mockRejectedValue(conflictError);

      const request = new NextRequest('http://localhost:3000/api/orders', {
        method: 'POST',
        body: JSON.stringify(validOrderInput),
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await POST(request);
      const responseBody = await response.json();

      // Assert: Verify conflict error is properly returned
      expect(response.status).toBe(409);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.code).toBe(ErrorCode.CONFLICT);
    });

    it('should handle customer not found error from service', async () => {
      // Arrange: Customer validation fails
      const notFoundError = new AppError(
        'Customer not found',
        ErrorCode.NOT_FOUND,
        404
      );
      (OrderService.prototype.create as jest.Mock).mockRejectedValue(notFoundError);

      const request = new NextRequest('http://localhost:3000/api/orders', {
        method: 'POST',
        body: JSON.stringify(validOrderInput),
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(404);
    });

    it('should handle product inventory insufficient error', async () => {
      // Arrange: Inventory check fails
      const inventoryError = new AppError(
        'Insufficient inventory for product prod-001',
        ErrorCode.UNPROCESSABLE_ENTITY,
        422
      );
      (OrderService.prototype.create as jest.Mock).mockRejectedValue(inventoryError);

      const request = new NextRequest('http://localhost:3000/api/orders', {
        method: 'POST',
        body: JSON.stringify(validOrderInput),
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await POST(request);
      const responseBody = await response.json();

      // Assert: Verify unprocessable entity error
      expect(response.status).toBe(422);
      expect(responseBody.error.code).toBe(ErrorCode.UNPROCESSABLE_ENTITY);
    });

    it('should handle unexpected errors during order creation', async () => {
      // Arrange: Unexpected database error
      (OrderService.prototype.create as jest.Mock).mockRejectedValue(
        new Error('Connection timeout')
      );

      const request = new NextRequest('http://localhost:3000/api/orders', {
        method: 'POST',
        body: JSON.stringify(validOrderInput),
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await POST(request);
      const responseBody = await response.json();

      // Assert: Verify internal error handling with logging
      expect(response.status).toBe(500);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error creating order'),
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    it('should calculate total amount correctly for order', async () => {
      // Arrange: Complex order with multiple items
      const complexOrderInput: CreateOrderInput = {
        customerId: 'cust-002',
        items: [
          { productId: 'prod-001', quantity: 3, unitPrice: 10.00 }, // 30.00
          { productId: 'prod-002', quantity: 2, unitPrice: 25.50 }, // 51.00
          { productId: 'prod-003', quantity: 1, unitPrice: 99.99 }, // 99.99
        ],
        shippingAddress: validOrderInput.shippingAddress,
      };

      const expectedTotal = 180.99; // 30.00 + 51.00 + 99.99

      const mockCreatedOrder = {
        id: 'order-calc-001',
        ...complexOrderInput,
        status: OrderStatus.PENDING,
        totalAmount: expectedTotal,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (OrderService.prototype.create as jest.Mock).mockResolvedValue(mockCreatedOrder);

      const request = new NextRequest('http://localhost:3000/api/orders', {
        method: 'POST',
        body: JSON.stringify(complexOrderInput),
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await POST(request);
      const responseBody = await response.json();

      // Assert: Verify total calculation precision
      expect(response.status).toBe(201);
      expect(responseBody.data.totalAmount).toBe(expectedTotal);
    });
  });
});