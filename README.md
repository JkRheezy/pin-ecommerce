# PIN E-commerce 多智能体无人值守开发

🎯 **自营PIN电商独立站** - AI驱动的全流程自动化

## 项目概述

基于 LangGraph 多智能体工作流，实现从选品到上架的无人值守电商运营系统。

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Picker     │───▶│  Designer   │───▶│   Review    │───▶│   Marketer  │───▶│   Publish   │
│   选品Agent  │    │   设计Agent  │    │   人工/AI   │    │   营销Agent  │    │   上架系统   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │                  │                  │
       ▼                  ▼                  ▼                  ▼                  ▼
  趋势分析(Google/Reddit) AI图像生成        设计审核          文案/SEO/广告        库存/定价
  品类挖掘                Prompt工程        质量检查          社交媒体内容         多渠道发布
```

## 技术栈

- **框架**: Next.js 14 + TypeScript + App Router
- **数据库**: Prisma + PostgreSQL (开发用 SQLite)
- **AI**: LangGraph.ts + @langchain/core
- **支付**: Stripe (准备中)
- **部署**: Vercel (准备中)

## 快速启动

### 1. 环境准备

```bash
# 安装依赖
cd D:\test\my-project
npm install

# 配置环境变量
set KIMI_API_KEY=sk-kimi-your-api-key
set DATABASE_URL=file:./dev.db
```

### 2. 数据库初始化

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 3. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

### 4. 启动 Harness 无人值守开发

```powershell
# 在 D:\test\my-project 目录下
$env:KIMI_API_KEY="sk-kimi-your-api-key"
$env:DATABASE_URL="file:./dev.db"
$env:HTTP_PROXY=""
$env:HTTPS_PROXY=""

node D:\work\study\Kimi_Agent_OpenAI_Harness\harness-cli\dist\cli.js loop --dry-run
```

移除 `--dry-run` 以实际执行任务。

## 项目结构

```
my-project/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API路由
│   │   │   ├── products/      # 商品API
│   │   │   ├── orders/        # 订单API
│   │   │   ├── ai-jobs/       # AI任务API
│   │   │   └── workflow/      # LangGraph工作流触发
│   │   └── page.tsx           # 首页
│   ├── lib/
│   │   ├── ai/                # AI Agent框架
│   │   │   ├── workflow.ts    # LangGraph工作流定义
│   │   │   └── agents/        # Agent实现
│   │   └── prisma.ts          # Prisma客户端
│   └── components/            # React组件
├── prisma/
│   └── schema.prisma          # 数据库模型
├── docs/
│   └── superpowers/
│       └── plans/             # 开发计划
├── .harness/
│   └── config.yaml            # Harness配置
└── AGENTS.md                  # AI开发指南
```

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/products` | GET/POST | 商品列表/创建 |
| `/api/orders` | GET/POST | 订单管理 |
| `/api/ai-jobs` | GET/POST | AI任务状态 |
| `/api/workflow` | POST | 触发LangGraph工作流 |

### 触发工作流示例

```bash
curl -X POST http://localhost:3000/api/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "theme": "Vintage Space",
    "trendSource": "pinterest"
  }'
```

## LangGraph 工作流

```typescript
// src/lib/ai/workflow.ts
const workflow = new StateGraph<WorkflowState>({
  channels: {
    messages: { value: (x, y) => x.concat(y), default: () => [] },
    trendSource: { value: (x, y) => y ?? x, default: () => '' },
    theme: { value: (x, y) => y ?? x, default: () => '' },
    productIdeas: { value: (x, y) => y ?? x, default: () => [] },
    selectedProduct: { value: (x, y) => y ?? x },
    designResult: { value: (x, y) => y ?? x },
    reviewDecision: { value: (x, y) => y ?? x },
    marketingContent: { value: (x, y) => y ?? x },
    finalProduct: { value: (x, y) => y ?? x }
  }
})
  .addNode('picker', pickerNode)
  .addNode('designer', designerNode)
  .addNode('review', reviewNode)
  .addNode('marketer', marketerNode)
  .addNode('publish', publishNode)
  .addEdge(START, 'picker')
  .addEdge('picker', 'designer')
  .addEdge('designer', 'review')
  .addConditionalEdges('review', (state) =>
    state.reviewDecision === 'approved' ? 'marketer' : END
  )
  .addEdge('marketer', 'publish')
  .addEdge('publish', END);
```

## 数据库模型

### Product (商品)
- `id`, `sku`, `name`, `description`
- `designUrl` - AI生成的设计图
- `baseCost`, `salePrice` - 成本与售价
- `status` - DRAFT/ACTIVE/ARCHIVED

### Order (订单)
- `id`, `orderNumber`, `stripePaymentId`
- `shippingAddress`, `status`
- `items` - 订单项

### AIJob (AI任务)
- `id`, `type` - PICKING/DESIGNING/MARKETING
- `status` - PENDING/PROCESSING/COMPLETED/FAILED
- `threadId` - LangGraph会话ID

## 文档

- [AGENTS.md](./AGENTS.md) - AI开发指南
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 系统架构
- [DATABASE.md](./DATABASE.md) - 数据库设计
- [AI-WORKFLOW.md](./AI-WORKFLOW.md) - AI工作流详解
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 部署指南

## 开发计划

查看 [docs/superpowers/plans/2026-04-01-init-pin-store.md](./docs/superpowers/plans/2026-04-01-init-pin-store.md)

## 下一步开发

1. ✅ 基础架构完成
2. ⏳ 完善 Agent 实现 (PickerAgent, DesignerAgent, MarketerAgent)
3. ⏳ AI图像生成集成 (DALL-E/Stable Diffusion)
4. ⏳ 前端管理界面
5. ⏳ 支付系统集成
6. ⏳ 自动化测试

## 许可证

MIT
