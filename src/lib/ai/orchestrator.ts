import { db } from '@/lib/db'
import { PickerAgent } from './picker-agent'

export class AgentOrchestrator {
  private pickerAgent: PickerAgent
  
  constructor() {
    this.pickerAgent = new PickerAgent({
      model: process.env.LLM_MODEL || 'gpt-4',
      apiKey: process.env.KIMI_API_KEY || '',
      baseUrl: process.env.LLM_BASE_URL,
      temperature: 0.3,
      maxTokens: 2000
    })
  }
  
  async runDailyPick(): Promise<void> {
    console.log('🤖 开始每日选品任务')
    
    const job = await db.aIJob.create({
      data: {
        type: 'pick_product',
        status: 'running',
        prompt: '分析当前TikTok和Pinterest趋势，推荐5个PIN徽章选品'
      }
    })
    
    try {
      const result = await this.pickerAgent.execute({
        id: job.id,
        type: 'pick_product',
        prompt: 'TikTok热门趋势：动漫、哥特、可爱动物',
        context: { trendSource: 'TikTok' }
      })
      
      if (result.success) {
        await db.aIJob.update({
          where: { id: job.id },
          data: {
            status: 'completed',
            result: result.data,
            completedAt: new Date()
          }
        })
        
        console.log('✅ 选品完成:', result.data.title)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      await db.aIJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      })
      
      console.error('❌ 选品失败:', error)
    }
  }
}
