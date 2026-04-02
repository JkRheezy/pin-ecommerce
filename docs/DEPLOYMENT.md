# 部署指南

> 从0到1上线PIN独立站

## 1. 准备工作

### 1.1 必需账号
- [ ] **域名**：Namecheap/Cloudflare 购买域名
- [ ] **Vercel**：用于部署Next.js应用
- [ ] **Stripe**：国际支付（需公司主体）
- [ ] **数据库**：Railway / Supabase / Render
- [ ] **文件存储**：Cloudflare R2
- [ ] **AI**：Kimi Code API Key

### 1.2 环境变量模板
```bash
# .env.production

# 数据库
DATABASE_URL="postgresql://user:pass@host:5432/dbname"

# AI
KIMI_API_KEY="sk-kimi-xxxxxxxx"

# 支付
STRIPE_SECRET_KEY="sk_live_xxxxxxxx"
STRIPE_WEBHOOK_SECRET="whsec_xxxxxxxx"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_xxxxxxxx"

# 存储
R2_ENDPOINT="https://xxx.r2.cloudflarestorage.com"
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET_NAME="pin-store-assets"

# 邮件
RESEND_API_KEY="re_xxxxxxxx"
FROM_EMAIL="noreply@yourdomain.com"

# 其他
NEXT_PUBLIC_SITE_URL="https://yourdomain.com"
```

## 2. 基础设施搭建

### 2.1 数据库（Railway）
```bash
# 1. Railway官网创建PostgreSQL
# 2. 获取Connection URL
# 3. 连接并初始化
npx prisma migrate deploy
npx prisma db seed  # 如果有种子数据
```

### 2.2 文件存储（R2）
```bash
# 1. Cloudflare Dashboard创建R2 bucket
# 2. 创建API Token（Object Read & Write）
# 3. 配置CORS（允许网站域名访问图片）
[
  {
    "AllowedOrigins": ["https://yourdomain.com"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"]
  }
]
```

### 2.3 Stripe配置
1. 创建产品目录
2. 配置Webhook Endpoint: `https://yourdomain.com/api/webhooks/stripe`
3. 配置Tax（自动计算税费）
4. 开启国际化支付方式（Alipay, WeChat Pay等）

## 3. 部署应用

### 3.1 Vercel一键部署
```bash
# 1. 安装Vercel CLI
npm i -g vercel

# 2. 登录
vercel login

# 3. 部署
vercel --prod
```

### 3.2 环境变量配置
在Vercel Dashboard → Project Settings → Environment Variables 添加所有变量。

### 3.3 域名绑定
1. Vercel Dashboard → Domains
2. 添加域名
3. 按提示配置DNS（Cloudflare代理建议关闭）

## 4. 上线前检查清单

### 4.1 功能测试
- [ ] 商品列表/详情页正常显示
- [ ] 购物车功能正常
- [ ] 结账流程完整（测试卡：4242 4242 4242 4242）
- [ ] 支付成功后订单创建
- [ ] 邮件通知发送
- [ ] 图片加载正常（R2）

### 4.2 性能检查
```bash
# Lighthouse评分
npx lighthouse https://yourdomain.com --view

# 目标
- Performance: > 90
- Accessibility: > 95
- SEO: > 95
```

### 4.3 安全配置
- [ ] 生产环境禁用Prisma Studio
- [ ] Stripe Webhook验证开启
- [ ] 敏感API路由添加认证
- [ ] CORS配置正确

## 5. 监控与运维

### 5.1 日志查看
```bash
# Vercel日志
vercel logs your-project --json

# 数据库日志（Railway Dashboard）
```

### 5.2 备份策略
```bash
# 数据库自动备份（Railway自带每日备份）
# 手动备份
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

### 5.3 更新部署
```bash
# 代码更新后
vercel --prod

# 数据库变更
npx prisma migrate deploy
```

## 6. 成本预估

| 服务 | 月费用 | 说明 |
|------|--------|------|
| Vercel Pro | $20 | 团队功能+分析 |
| Railway DB | $5-15 | 根据数据量 |
| R2存储 | $0-5 | 前10GB免费 |
| Stripe | 2.9%+30¢ | 每笔交易 |
| 域名 | $1 | .com年费摊销 |
| **总计** | **~$30-50/月** | 起步阶段 |

## 7. 故障排查

### 7.1 常见问题

**支付失败**
```
检查：Stripe Dashboard → Logs
检查：Webhook是否配置正确
```

**图片加载慢**
```
检查：R2是否配置了自定义域名
优化：图片使用Next.js Image组件
```

**数据库连接超时**
```
检查：DATABASE_URL是否正确
检查：Railway实例是否休眠（需升级Plan）
```

### 7.2 回滚策略
```bash
# Vercel回滚到上一版本
vercel rollback

# 数据库回滚（谨慎）
npx prisma migrate resolve --rolled-back "migration_name"
```

## 8. 启动AI Agent

```bash
# 本地启动Harness Loop
harness loop --config .harness/config.yaml

# 或使用Vercel Cron（定时任务）
# vercel.json
{
  "crons": [
    {
      "path": "/api/cron/daily-pick",
      "schedule": "0 9 * * *"
    }
  ]
}
```
