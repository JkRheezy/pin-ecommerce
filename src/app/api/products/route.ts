import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const limit = parseInt(searchParams.get('limit') || '20')
  
  const products = await db.product.findMany({
    where: {
      isActive: true,
      ...(category && { category })
    },
    orderBy: { createdAt: 'desc' },
    take: limit
  })
  
  return NextResponse.json(products)
}

export async function POST(request: Request) {
  const body = await request.json()
  
  const product = await db.product.create({
    data: {
      slug: body.slug,
      name: body.name,
      description: body.description,
      price: body.price,
      images: body.images,
      category: body.category,
      tags: body.tags,
      aiMetadata: body.aiMetadata,
      isActive: false
    }
  })
  
  return NextResponse.json(product, { status: 201 })
}
