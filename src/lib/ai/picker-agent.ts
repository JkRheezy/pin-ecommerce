import { BaseAgent, AgentTask, AgentResult } from './base-agent'

export class PickerAgent extends BaseAgent {
  protected getSystemPrompt(): string {
    return `你是一个专业的PIN徽章选品专家。你的任务是分析市场趋势，推荐有潜力的PIN产品。

输出格式必须是JSON：
{
  "title": "产品名称",
  "concept": "设计理念",
  "targetAudience": "目标人群",
  "estimatedCost": 成本预估（元）,
  "suggestedPrice": { "usd": 建议售价 },
  "tags": ["标签1", "标签2"],
  "trendScore": 趋势分数（1-100）,
  "reasoning": "推荐理由"
}`
  }
  
  async execute(task: AgentTask): Promise<AgentResult> {
    try {
      const prompt = `分析以下趋势主题，推荐一个PIN徽章产品：

主题：${task.prompt}
${task.context?.trendSource ? `数据来源：${task.context.trendSource}` : ''}

要求：
1. 符合欧美青少年审美
2. 生产成本控制在3元以内
3. 具有社交媒体传播潜力
4. 避免版权风险`

      const response = await this.callLLM(prompt)
      
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('Invalid response format')
      }
      
      const data = JSON.parse(jsonMatch[0])
      
      return {
        success: true,
        data
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}
