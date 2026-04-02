import { NextResponse } from 'next/server'
import { runProductWorkflow } from '@/lib/ai/workflow'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    if (!process.env.KIMI_API_KEY) {
      return NextResponse.json(
        { error: 'KIMI_API_KEY not configured' },
        { status: 500 }
      )
    }
    
    const result = await runProductWorkflow(
      body.trendSource || 'TikTok',
      body.theme || 'Cute Animals'
    )
    
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Product workflow API',
    usage: 'POST { trendSource: string, theme: string }'
  })
}
