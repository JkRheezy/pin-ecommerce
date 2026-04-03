/**
 * LangGraph.ts 多 Agent 工作流实现
 * 
 * 工作流: Picker -> Designer -> Review -> Marketer -> Publish
 */

import { StateGraph, END } from '@langchain/langgraph'
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'

// ==================== 状态定义 ====================

export interface ProductWorkflowState {
  trendSource: string
  theme: string
  
  productIdea?: {
    title: string
    concept: string
    targetAudience: string
    estimatedCost: number
    suggestedPrice: { usd: number }
    tags: string[]
    trendScore: number
  }
  
  designResult?: {
    imageUrl: string
    variations: string[]
    prompt: string
  }
  
  reviewApproved?: boolean
  reviewFeedback?: string
  
  marketingContent?: {
    title: string
    description: string
    bulletPoints: string[]
    adCopy: string
  }
  
  productId?: string
  error?: string
}

// ==================== LLM 调用 ====================

import { logger } from '@harness/logging'
import { Result } from '@harness/types'

// ==================== 错误处理 ====================

class WorkflowError extends Error {
  constructor(
    message: string,
    public readonly step: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'WorkflowError'
  }
}

function handleStepError(step: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  logger.error({ step, error: message, cause: error }, `Workflow step ${step} failed`)
  return message
}

// ==================== 结果持久化 ====================

interface PersistedResult {
  workflowId: string
  step: string
  timestamp: number
  success: boolean
  data?: unknown
  error?: string
}

const results: Map<string, PersistedResult[]> = new Map()

function persistResult(
  workflowId: string,
  step: string,
  success: boolean,
  data?: unknown,
  error?: string
): void {
  const entry: PersistedResult = {
    workflowId,
    step,
    timestamp: Date.now(),
    success,
    data,
    error
  }
  
  const existing = results.get(workflowId) || []
  existing.push(entry)
  results.set(workflowId, existing)
  
  logger.info({ workflowId, step, success }, 'Workflow step result persisted')
}

function getWorkflowResults(workflowId: string): PersistedResult[] {
  return results.get(workflowId) || []
}

function clearWorkflowResults(workflowId: string): void {
  results.delete(workflowId)
  logger.info({ workflowId }, 'Workflow results cleared')
}harness/logging'

async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch(`${process.env.LLM_BASE_URL || 'https://api.openai.com/v1'}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.KIMI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })
  })
  
  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`)
  }
  
  const data = await response.json()
  return data.choices[0]?.message?.content || ''
}

// ==================== Agent 节点 ====================

// 1. 选品 Agent
async function pickerNode(state: ProductWorkflowState): Promise<Partial<ProductWorkflowState>> {
  const systemPrompt = `你是专业的PIN徽章选品专家。
分析市场趋势，推荐有潜力的产品。
只输出JSON格式：{
  "title": "产品名称",
  "concept": "设计理念", 
  "targetAudience": "目标人群",
  "estimatedCost": 成本数字,
  "suggestedPrice": {"usd": 售价},
  "tags": ["标签"],
  "trendScore": 1-100
}`

  const userPrompt = `分析趋势来源: ${state.trendSource}
主题: ${state.theme}

要求：
1. 符合欧美青少年审美
2. 生产成本控制在3元以内
3. 具有社交媒体传播潜力`

  try {
    const response = await callLLM(systemPrompt, userPrompt)
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    
    if (!jsonMatch) {
      throw new Error('Invalid JSON response')
    }
    
    const productIdea = JSON.parse(jsonMatch[0])
    return { productIdea }
  } catch (error) {
    return { error: `Picker failed: ${error instanceof Error ? error.message : 'Unknown'}` }
  }
}

// 2. 设计 Agent
async function designerNode(state: ProductWorkflowState): Promise<Partial<ProductWorkflowState>> {
  if (state.error) return state
  
  const systemPrompt = `你是PIN徽章设计专家。
基于选品概念，生成详细的设计描述和AI绘图提示词。
输出JSON：{
  "prompt": "详细的AI绘图提示词（英文）",
  "variations": ["变体1描述", "变体2描述"],
  "designNotes": "设计说明"
}`

  const userPrompt = `设计产品: ${state.productIdea?.title}
概念: ${state.productIdea?.concept}
目标人群: ${state.productIdea?.targetAudience}

要求：
1. 2.5cm 圆形PIN设计
2. 适合珐琅工艺
3. 避免版权风险`

  try {
    const response = await callLLM(systemPrompt, userPrompt)
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    
    if (!jsonMatch) {
      throw new Error('Invalid JSON response')
    }
    
    const designData = JSON.parse(jsonMatch[0])
    
    return {
      designResult: {
        imageUrl: `https://placeholder.com/pin-design-${Date.now()}.png`,
        variations: designData.variations,
        prompt: designData.prompt,
      }
    }
  } catch (error) {
    return { error: `Designer failed: ${error instanceof Error ? error.message : 'Unknown'}` }
  }
}

// 3. 审核节点 (人机交互点)
async function reviewNode(state: ProductWorkflowState): Promise<Partial<ProductWorkflowState>> {
  console.log('📝 待审核产品:', state.productIdea?.title)
  console.log('🎨 设计方案:', state.designResult?.prompt)
  
  // TODO: 实际应用中应该：
  // 1. 保存到审核队列
  // 2. 发送通知给管理员  
  // 3. 中断工作流等待审核
  // 4. 审核后通过 API 回调恢复
  
  // 简化版：自动通过
  return {
    reviewApproved: true,
    reviewFeedback: 'Auto-approved for demo'
  }
}

// 4. 营销 Agent
async function marketerNode(state: ProductWorkflowState): Promise<Partial<ProductWorkflowState>> {
  if (state.error || !state.reviewApproved) return state
  
  const systemPrompt = `你是跨境电商文案专家。
为PIN徽章产品撰写吸引人的商品文案。
输出JSON：{
  "title": "商品标题（SEO优化）",
  "description": "商品详情描述",
  "bulletPoints": ["卖点1", "卖点2", "卖点3"],
  "adCopy": "广告文案"
}`

  const userPrompt = `产品: ${state.productIdea?.title}
概念: ${state.productIdea?.concept}
目标人群: ${state.productIdea?.targetAudience}
价格: $${state.productIdea?.suggestedPrice?.usd}

要求：
1. 美式英语
2. 适合Instagram/TikTok风格
3. 包含相关hashtags`

  try {
    const response = await callLLM(systemPrompt, userPrompt)
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    
    if (!jsonMatch) {
      throw new Error('Invalid JSON response')
    }
    
    const content = JSON.parse(jsonMatch[0])
    return { marketingContent: content }
  } catch (error) {
    return { error: `Marketer failed: ${error instanceof Error ? error.message : 'Unknown'}` }
  }
}

// 5. 发布节点
async function publishNode(state: ProductWorkflowState): Promise<Partial<ProductWorkflowState>> {
  if (state.error) return state
  
  console.log('✅ 产品发布成功:', state.productIdea?.title)
  
  return {
    productId: `prod_${Date.now()}`,
  }
}

// ==================== 路由逻辑 ====================

function routeAfterReview(state: ProductWorkflowState): string {
  if (state.error) return 'error'
  if (state.reviewApproved) return 'marketer'
  return 'reject'
}

// ==================== 构建工作流 ====================

export function createProductWorkflow() {
  const workflow = new StateGraph<ProductWorkflowState>({
    channels: {} as any
  })

  // 添加节点
  workflow.addNode('picker', pickerNode)
  workflow.addNode('designer', designerNode)
  workflow.addNode('review', reviewNode)
  workflow.addNode('marketer', marketerNode)
  workflow.addNode('publish', publishNode)

  // 添加边
  workflow.addEdge('picker', 'designer')
  workflow.addEdge('designer', 'review')
  
  // 条件路由
  workflow.addConditionalEdges('review', routeAfterReview as any, {
    marketer: 'marketer',
    reject: END,
    error: END,
  })
  
  workflow.addEdge('marketer', 'publish')
  workflow.addEdge('publish', END)

  // 设置入口
  workflow.setEntryPoint('picker')

  return workflow.compile()
}

// ==================== 使用示例 ====================

export async function runProductWorkflow(trendSource: string, theme: string) {
  const app = createProductWorkflow()
  
  const initialState: ProductWorkflowState = {
    trendSource,
    theme,
  }
  
  const result = await app.invoke(initialState)
  
  return result
}
