# 技术架构文档

> PIN独立站技术选型与架构设计

## 1. 技术栈选型

### 1.1 前端
| 技术 | 选型 | 理由 |
|------|------|------|
| 框架 | Next.js 14 (App Router) | SSR/SEO友好，PIN电商需要Google收录 |
| 语言 | TypeScript | 类型安全，维护性好 |
| 样式 | Tailwind CSS | 快速开发，响应式设计 |
| UI库 | shadcn/ui | 可定制，无样式冲突 |
| 状态 | Zustand | 轻量，TypeScript友好 |

### 1.2 后端
| 技术 | 选型 | 理由 |
|------|------|------|
| 运行时 | Node.js 20+ | TypeScript原生支持 |
| 框架 | Next.js API Routes | 前后端一体，简化部署 |
| ORM | Prisma | 类型安全，迁移方便 |
| 数据库 | PostgreSQL | 关系型，ACID保证 |
| 缓存 | Redis | 会话、购物车缓存 |

### 1.3 基础设施
| 技术 | 选型 | 理由 |
|------|------|------|
| 部署 | Vercel | Next.js原生支持，CDN全球加速 |
| 文件存储 | Cloudflare R2 | S3兼容，无出口费 |
| 支付 | Stripe | 国际支付，Tax自动计算 |
| 邮件 | Resend | 简单，送达率高 |
| AI | Kimi for Coding | 中文友好，代码能力强 |

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Vercel Edge                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Web App    │  │   Admin      │  │   API        │     │
│  │  (Next.js)   │  │  (Next.js)   │  │  Routes      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────┐
│                      Serverless Functions                   │
│  ┌──────────────┐  ┌────────┴──────┐  ┌──────────────┐     │
│  │  Commerce    │  │  AI Agent     │  │   Webhook    │     │
│  │  Core        │  │  Service      │  │   Handlers   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  PostgreSQL  │    │    Redis     │    │  Cloudflare  │
│  (主数据库)   │    │   (缓存)     │    │     R2       │
└──────────────┘    └──────────────┘    │  (图片存储)   │
                                        └──────────────┘
```

## 3. 核心模块

### 3.1 商品系统 (Product)
```typescript
// 核心实体
interface Product {
  id: string;
  name: string;           // 多语言
  description: string;    // 多语言
  price: Money;           // {amount, currency}
  images: string[];       // R2 URL
  variants: Variant[];    // 尺寸/颜色变体
  metadata: {
    aiGenerated: boolean; // AI设计标记
    designPrompt: string; // 设计提示词
  }
}
```

### 3.2 订单系统 (Order)
```typescript
interface Order {
  id: string;
  status: 'pending' | 'paid' | 'shipped' | 'delivered';
  items: OrderItem[];
  shipping: ShippingAddress;
  payment: PaymentInfo;   // Stripe payment_intent
  tracking?: string;      // 物流单号
}
```

### 3.3 AI Agent系统
| Agent | 职责 | 触发时机 |
|-------|------|----------|
| Picker | 分析TikTok/Pinterest趋势，推荐选品 | 每日定时 |
| Designer | 根据主题生成PIN图案 | 人工触发/定时 |
| Marketer | 生成商品文案、广告素材 | 新品上架时 |
| Pricer | 动态定价（竞品监控） | 定时/事件触发 |

## 4. 数据流

### 4.1 用户购买流程
```
浏览商品 → 加购物车(Redis) → 结账(Stripe) → 支付成功 → 创建订单(PG)
                                              ↓
                                        触发Webhook → 通知供应商发货
```

### 4.2 AI上新流程
```
Picker发现趋势 → Designer生成图案 → 人工审核 → Marketer生成文案
                                                  ↓
                                        自动上架 → 同步到Facebook/Google商店
```

## 5. 部署架构

### 5.1 环境划分
| 环境 | 用途 | 数据库 |
|------|------|--------|
| Production | 生产环境 | PostgreSQL (Railway/Supabase) |
| Staging | 预发布 | PostgreSQL (独立实例) |
| Dev | 本地开发 | Docker PostgreSQL |

### 5.2 CI/CD
```yaml
# .github/workflows/deploy.yml
- Push to main → 自动部署到 Production
- Push to dev  → 自动部署到 Staging
- PR → 运行测试 + 类型检查
```

## 6. 安全设计

- **支付安全**：Stripe托管支付页，不触碰信用卡信息
- **数据安全**：敏感配置走环境变量，数据库连接加密
- **AI内容安全**：生成内容人工审核，避免版权风险

## 7. 扩展性考虑

- **多语言**：Next.js i18n，预留翻译字段
- **多币种**：Stripe自动转换，显示本地货币
- **供应商对接**：预留Dropshipping供应商API接口
