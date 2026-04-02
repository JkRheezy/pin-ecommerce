import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

function generateOrderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `ORD-${date}-${random}`
}

export async function GET() {
  const orders = await db.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50
  })
  
  return NextResponse.json(orders)
}

export async function POST(request: Request) {
  const body = await request.json()
  
  const order = await db.order.create({
    data: {
      orderNumber: generateOrderNumber(),
      customerEmail: body.customerEmail,
      customerName: body.customerName,
      shippingAddress: body.shippingAddress,
      items: body.items,
      subtotal: body.subtotal,
      shippingCost: body.shippingCost,
      tax: body.tax,
      total: body.total,
      currency: body.currency || 'USD',
      status: 'pending'
    }
  })
  
  return NextResponse.json(order, { status: 201 })
}
