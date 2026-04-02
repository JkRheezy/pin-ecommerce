export interface AgentConfig {
  model: string
  apiKey: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
}

export interface AgentTask {
  id: string
  type: string
  prompt: string
  context?: Record<string, any>
}

export interface AgentResult {
  success: boolean
  data?: any
  error?: string
  tokensUsed?: number
}

export abstract class BaseAgent {
  protected config: AgentConfig
  
  constructor(config: AgentConfig) {
    this.config = config
  }
  
  abstract execute(task: AgentTask): Promise<AgentResult>
  
  protected async callLLM(prompt: string): Promise<string> {
    const response = await fetch(`${this.config.baseUrl || 'https://api.openai.com/v1'}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt }
        ],
        temperature: this.config.temperature || 0.3,
        max_tokens: this.config.maxTokens || 2000
      })
    })
    
    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`)
    }
    
    const data = await response.json()
    return data.choices[0]?.message?.content || ''
  }
  
  protected abstract getSystemPrompt(): string
}
