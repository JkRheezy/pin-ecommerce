import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { AgentOrchestrator } from '@/lib/ai/orchestrator'

export async function GET() {
  const jobs = await db.aIJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20
  })

  return NextResponse.json(jobs)
}

export async function POST(request: Request) {
  const body = await request.json()
  
  if (body.action === 'daily-pick') {
    const orchestrator = new AgentOrchestrator()
    
    orchestrator.runDailyPick().catch(console.error)
    
    return NextResponse.json({ 
      message: 'Daily pick job started',
      status: 'running'
    })
  }
  
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
