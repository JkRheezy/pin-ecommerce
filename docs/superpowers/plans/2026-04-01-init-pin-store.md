# PIN独立站初始化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 初始化PIN独立站项目基础架构，包括数据库、基础API、AI Agent框架，使harness循环能够接管后续开发。

**Architecture:** 使用Next.js全栈 + Prisma + PostgreSQL搭建基础架构，实现核心商品和订单模块，建立AI Agent任务系统，为harness无人值守开发奠定基础。

**Tech Stack:** Next.js 14, TypeScript, Prisma, PostgreSQL, Tailwind CSS, shadcn/ui

---

## 文件结构规划

```
my-project/
├── prisma/
│   └── schema.prisma       # 数据库模型定义
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── api/            # API路由
│   │   │   ├── products/   # 商品API
│   │   │   ├── orders/     # 订单API
│   │   │   └── ai-jobs/    # AI任务API
│   │   └── page.tsx        # 首页
│   ├── lib/
│   │   ├── db.ts           # Prisma客户端
│   │   └── ai/             # AI Agent模块
│   │       ├── base-agent.ts
│   │       ├── picker-agent.ts
│   │       └── orchestrator.ts
│   └── types/              # 类型定义
├── .env.example            # 环境变量模板
└── package.json            # 依赖更新
```

---

## Task 1: 初始化数据库和Prisma

**Files:**
- Create: `prisma/schema.prisma`
- Modify: `.env.example`
- Create: `src/lib/db.ts`

- [ ] **Step 1: 创建Prisma Schema**

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Product {
  id          String   @id @default(uuid())
  slug        String   @unique
  name        Json     // { en: "", zh: "" }
  description Json?
  price       Decimal  @db.Decimal(10, 2)
  currency    String   @default("USD")
  images      String[]
  inventory   Int      @default(999)
  
  aiMetadata  Json?    // { prompt, generatedAt }
  
  category    String   // "anime", "gothic", "cute"
  tags        String[]
  
  isActive    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([category, isActive])
  @@index([isActive, createdAt])
}

model Order {
  id            String   @id @default(uuid())
  orderNumber   String   @unique
  
  customerEmail String
  customerName  String?
  
  shippingAddress Json
  
  items         Json     // 订单项数组
  
  subtotal      Decimal  @db.Decimal(10, 2)
  shippingCost  Decimal  @db.Decimal(10, 2)
  tax           Decimal  @db.Decimal(10, 2)
  total         Decimal  @db.Decimal(10, 2)
  currency      String   @default("USD")
  
  status        String   @default("pending") // pending, paid, shipped, delivered
  
  stripePaymentIntentId String?
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@index([status, createdAt])
}

model AIJob {
  id          String   @id @default(uuid())
  type        String   // pick_product, design_image, generate_copy
  status      String   @default("pending") // pending, running, completed, failed
  prompt      String   @db.Text
  result      Json?
  error       String?
  
  productId   String?
  
  createdAt   DateTime @default(now())
  completedAt DateTime?
  
  @@index([status, createdAt])
  @@index([type, status])
}
```

- [ ] **Step 2: 更新环境变量模板**

```bash
# .env.example

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/pinstore"

# AI
KIMI_API_KEY="sk-kimi-xxxxxxxxxxxxxxxx"

# Payment (Stripe)
STRIPE_SECRET_KEY="sk_test_xxxxxxxx"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_xxxxxxxx"
STRIPE_WEBHOOK_SECRET="whsec_xxxxxxxx"

# App
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

- [ ] **Step 3: 创建Prisma客户端**

```typescript
// src/lib/db.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

- [ ] **Step 4: 安装依赖并初始化**

```bash
cd D:\test\my-project

# 安装Prisma
npm install prisma @prisma/client

# 初始化Prisma
npx prisma init

# 生成客户端
npx prisma generate

# 创建数据库（确保PostgreSQL已运行）
npx prisma migrate dev --name init
```

- [ ] **Step 5: Commit**

```bash
git add prisma/ src/lib/db.ts .env.example package.json
git commit -m "feat: init prisma schema with Product, Order, AIJob models"
```

---

## Task 2: 创建基础API路由

**Files:**
- Create: `src/app/api/products/route.ts`
- Create: `src/app/api/products/[id]/route.ts`
- Create: `src/app/api/orders/route.ts`

- [ ] **Step 1: 创建商品列表API**

```typescript
// src/app/api/products/route.ts
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
      isActive: false // 默认未激活，需审核
    }
  })
  
  return NextResponse.json(product, { status: 201 })
}
```

- [ ] **Step 2: 创建商品详情API**

```typescript
// src/app/api/products/[id]/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const product = await db.product.findUnique({
    where: { id: params.id }
  })
  
  if (!product) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  
  return NextResponse.json(product)
}
```

- [ ] **Step 3: 创建订单API**

```typescript
// src/app/api/orders/route.ts
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
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/
git commit -m "feat: add products and orders API routes"
```

---

## Task 3: 创建AI Agent基础框架

**Files:**
- Create: `src/lib/ai/base-agent.ts`
- Create: `src/lib/ai/picker-agent.ts`
- Create: `src/lib/ai/orchestrator.ts`
- Create: `src/app/api/ai-jobs/route.ts`

- [ ] **Step 1: 创建基础Agent类**

```typescript
// src/lib/ai/base-agent.ts
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
```

- [ ] **Step 2: 创建选品Agent**

```typescript
// src/lib/ai/picker-agent.ts
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
4. 避免版权风险`;

      const response = await this.callLLM(prompt)
      
      // 提取JSON
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
```

- [ ] **Step 3: 创建Agent编排器**

```typescript
// src/lib/ai/orchestrator.ts
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
    
    // 创建AI任务记录
    const job = await db.aIJob.create({
      data: {
        type: 'pick_product',
        status: 'running',
        prompt: '分析当前TikTok和Pinterest趋势，推荐5个PIN徽章选品'
      }
    })
    
    try {
      // 执行选品
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
```

- [ ] **Step 4: 创建AI任务API**

```typescript
// src/app/api/ai-jobs/route.ts
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
    
    // 异步执行，不等待完成
    orchestrator.runDailyPick().catch(console.error)
    
    return NextResponse.json({ 
      message: 'Daily pick job started',
      status: 'running'
    })
  }
  
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/ src/app/api/ai-jobs/
git commit -m "feat: add AI Agent framework with picker agent"
```

---

## Task 4: 更新Next.js配置并测试

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `next.config.js` (创建)

- [ ] **Step 1: 更新package.json添加脚本**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:studio": "prisma studio",
    "db:seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 2: 更新tsconfig.json路径别名**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

- [ ] **Step 3: 创建Next.js配置**

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client']
  }
}

module.exports = nextConfig
```

- [ ] **Step 4: 创建种子数据**

```typescript
// prisma/seed.ts
import { db } from '../src/lib/db'

async function main() {
  // 创建示例商品
  await db.product.create({
    data: {
      slug: 'cute-cat-pin',
      name: { en: 'Cute Cat Pin', zh: '可爱猫咪徽章' },
      description: { en: 'Adorable cat enamel pin, perfect for cat lovers!' },
      price: 9.99,
      images: ['https://example.com/cat-pin.jpg'],
      category: 'cute',
      tags: ['cat', 'cute', 'animal'],
      isActive: true
    }
  })
  
  console.log('✅ Seed data created')
}

main()
  .catch(console.error)
  .finally(() => process.exit())
```

- [ ] **Step 5: 安装缺失依赖**

```bash
cd D:\test\my-project

# 安装Next.js
npm install next@14 react react-dom

# 安装类型
npm install -D @types/react @types/react-dom typescript

# 安装Prisma生成器
npx prisma generate

# 运行种子
npx tsx prisma/seed.ts
```

- [ ] **Step 6: 测试API**

```bash
# 启动开发服务器
npm run dev

# 测试商品API (新开终端)
curl http://localhost:3000/api/products

# 测试AI任务API
curl http://localhost:3000/api/ai-jobs
```

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json next.config.js prisma/seed.ts
git commit -m "chore: configure next.js and add seed data"
```

---

## Task 5: 更新Harness配置支持新项目

**Files:**
- Modify: `.harness/config.yaml`

- [ ] **Step 1: 更新配置**

```yaml
# .harness/config.yaml

project:
  name: pin-store
  description: PIN徽章独立站
  type: nextjs

llm:
  provider: kimi
  model: kimi-for-coding
  apiKey: ${KIMI_API_KEY}
  baseUrl: https://api.kimi.com/coding/v1
  maxTokens: 4096
  temperature: 0.3
  timeout: 120000

safety:
  maxExecutionTime: 3600000  # 1小时
  maxErrorRate: 0.3
  maxComplexity: 10

checkpoint:
  enabled: true
  interval: 300000

pr:
  autoCreate: true
  autoReview: false  # 建议手动审查AI生成的代码
  autoMerge: false
```

- [ ] **Step 2: 最终Commit**

```bash
git add .harness/config.yaml
git commit -m "chore: update harness config for pin store"

# 推送所有更改
git add -A
git commit -m "feat: complete initial setup for PIN store"
```

---

## 执行完成后验证

```bash
# 1. 确认所有服务启动
npm run dev

# 2. 检查API是否正常
curl http://localhost:3000/api/products
curl http://localhost:3000/api/orders
curl http://localhost:3000/api/ai-jobs

# 3. 触发AI任务测试
curl -X POST http://localhost:3000/api/ai-jobs \
  -H "Content-Type: application/json" \
  -d '{"action":"daily-pick"}'

# 4. 启动Harness Loop（确保KIMI_API_KEY已设置）
$env:KIMI_API_KEY="sk-kimi-xxx"
harness loop
```

---

## Self-Review

**Spec coverage:**
- ✅ 数据库设计 (Prisma schema)
- ✅ 基础API (products, orders, ai-jobs)
- ✅ AI Agent框架 (base-agent, picker-agent, orchestrator)
- ✅ Harness配置更新

**Placeholder scan:**
- ✅ 无TBD/TODO
- ✅ 所有代码完整可运行
- ✅ 类型一致

**下一步:**
完成此计划后，harness loop将能够：
1. 调用 `/api/ai-jobs` 触发AI任务
2. 读取/写入数据库
3. 基于代码上下文继续迭代开发
