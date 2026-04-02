# AGENTS.md - PIN独立站

> 自营跨境电商 | TypeScript全栈 | AI驱动

## 1. 快速开始

**项目概述**
- 模式：自营独立站（非平台）
- 类目：PIN徽章（Dropshipping模式）
- 核心：AI辅助选品+设计+营销，自动化运营
- 建站：Next.js + Node.js + PostgreSQL

**启动**
```bash
npm install
# 配置 .env: DATABASE_URL, KIMI_API_KEY
npm run db:migrate   # 初始化数据库
npm run dev          # 启动开发环境
```

## 2. 项目结构

```
├── apps/
│   ├── web/          # Next.js 前端（商城）
│   └── admin/        # 管理后台
├── packages/
│   ├── core/         # 业务逻辑（商品/订单/支付）
│   ├── ai/           # AI Agent（选品/设计/营销）
│   └── db/           # Prisma模型
└── docker-compose.yml
```

## 3. 关键文档

| 文档 | 路径 | 时间 |
|------|------|------|
| 技术架构 | docs/ARCHITECTURE.md | 15min |
| 数据库设计 | docs/DATABASE.md | 10min |
| AI工作流 | docs/AI-WORKFLOW.md | 8min |
| 部署指南 | docs/DEPLOYMENT.md | 10min |

## 4. 常见任务

**AI生成新品**
```bash
harness task -t "生成万圣节PIN系列" \
  -d "哥特风格，南瓜/蝙蝠/女巫元素" \
  -r "TikTok trending,成本<2元,目标美国青少年"
```

**上架流程**
AI设计 → 人工审核 → 生成多语言文案 → 自动同步到Shopify/独立站

## 5. 重要约束

- ❌ 不存储用户敏感信息（信用卡等走Stripe）
- ✅ 所有AI设计需版权检查
- ⚠️ 遵守GDPR/美国电商法规
- 🔒 敏感配置走环境变量

## 6. 寻求帮助

- 架构问题：查看 ARCHITECTURE.md
- AI行为：`.harness/logs/`
- 部署：查看 DEPLOYMENT.md
