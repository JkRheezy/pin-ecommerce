# AI Agent 工作流

> AI驱动的PIN独立站自动化运营

## 1. Agent架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Orchestrator                      │
│                     (任务调度/状态管理)                       │
└─────────────────────────────────────────────────────────────┘
        │              │              │
        ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Picker     │ │  Designer    │ │  Marketer    │
│   Agent      │ │   Agent      │ │   Agent      │
└──────────────┘ └──────────────┘ └──────────────┘
        │              │              │
        └──────────────┼──────────────┘
                       ▼
              ┌──────────────┐
              │   Review     │
              │   Queue      │
              └──────────────┘
```

## 2. Agent职责

### 2.1 Picker Agent（选品）
**输入**：趋势数据源
**输出**：选品建议列表

```typescript
interface PickJob {
  source: 'tiktok' | 'pinterest' | 'etsy' | 'instagram';
  keyword?: string;
  limit: number;
}

// 输出示例
interface ProductIdea {
  title: string;           // "Gothic Butterfly Pin"
  concept: string;         // 设计理念
  targetAudience: string;  // "美国Z世代，哥特风格爱好者"
  estimatedCost: number;   // 1.5 (元)
  trendScore: number;      // 0-100 趋势分数
  competitionLevel: 'low' | 'medium' | 'high';
  suggestedPrice: {        // 建议售价
    usd: number;           // 9.99
  };
  tags: string[];          // ["gothic", "butterfly", "alternative"]
}
```

**工作流程**：
1. 爬取TikTok/Pinterest热门内容
2. 分析标签、点赞数、评论情感
3. 结合PIN类目特点筛选（小体积、可量产）
4. 评估供应链可行性
5. 生成选品报告

### 2.2 Designer Agent（设计）
**输入**：选品概念
**输出**：PIN设计图 + 变体

```typescript
interface DesignJob {
  concept: string;         // "Gothic Butterfly"
  style: string;           // "minimalist, black and white"
  size: string;            // "2.5cm"
  variations: number;      // 3 (生成几个变体)
}

// 输出示例
interface DesignResult {
  mainImage: string;       // AI生成的设计图URL
  variations: Array<{
    name: string;          // "Black", "Gold", "Rainbow"
    image: string;
  }>;
  prompt: string;          // 使用的提示词（记录用于版权追溯）
  isOriginal: boolean;     // 原创性评估
}
```

**工作流程**：
1. 根据概念生成设计提示词
2. 调用AI绘图（DALL-E/Stable Diffusion）
3. 生成多个配色变体
4. 评估版权风险（与现有商标对比）
5. 生成产品mockup图

### 2.3 Marketer Agent（营销）
**输入**：产品信息 + 设计图
**输出**：营销素材包

```typescript
interface MarketingJob {
  productName: string;
  designConcept: string;
  targetAudience: string;
  platforms: ('shopify' | 'etsy' | 'instagram' | 'tiktok')[];
}

// 输出示例
interface MarketingPackage {
  // 商品文案
  listings: {
    title: string;         // SEO优化标题
    description: string;   // 详情页文案
    bulletPoints: string[]; // 卖点列表
    tags: string[];        // 搜索标签
  };
  
  // 社媒素材
  socialPosts: Array<{
    platform: string;
    caption: string;
    hashtags: string[];
    imagePrompt: string;   // 配图建议
  }>;
  
  // 广告文案
  ads: {
    headline: string;
    body: string;
    cta: string;
  };
}
```

## 3. 工作流编排

### 3.1 自动上新流程
```yaml
name: Auto Product Launch

triggers:
  - schedule: "0 9 * * *"  # 每天早上9点
  - manual: true

steps:
  1. picker.analyzeTrends:
     sources: [tiktok, pinterest]
     limit: 5
     
  2. designer.generateDesigns:
     forEach: "{{steps.1.selectedProducts}}"
     variations: 3
     
  3. review.createReviewTasks:
     designs: "{{steps.2.designs}}"
     
  4. [manual] human.approveDesigns
     
  5. marketer.generateContent:
     forApproved: "{{steps.4.approved}}"
     
  6. product.publish:
     createShopifyProduct: true
     createEtsyListing: false  # 可选
```

### 3.2 事件驱动流程
```typescript
// 订单完成后触发评价邀请
on('order.delivered', async (order) => {
  await delay(3, 'days');
  
  const message = await marketer.generateReviewRequest({
    customerName: order.customerName,
    productName: order.items[0].productName,
    style: 'friendly'
  });
  
  await email.send(order.customerEmail, message);
});

// 库存低时触发补货建议
on('inventory.low', async (product) => {
  const advice = await picker.suggestRestock({
    productId: product.id,
    salesVelocity: await analytics.getVelocity(product.id),
    seasonality: true
  });
  
  await notify.admin(advice);
});
```

## 4. 人工审核节点

AI生成内容必须人工审核后才能上架：

```typescript
interface ReviewTask {
  id: string;
  type: 'design' | 'copy' | 'pricing';
  content: any;
  aiConfidence: number;  // AI自信度
  
  status: 'pending' | 'approved' | 'rejected';
  reviewerNotes?: string;
  
  createdAt: Date;
  reviewedAt?: Date;
}
```

**审核检查项**：
- [ ] 设计无明显版权问题
- [ ] 文案符合目标市场文化
- [ ] 定价合理（利润率>50%）
- [ ] 无明显AI痕迹（人性化修改）

## 5. 使用Harness下发任务

```bash
# 手动触发选品
harness task \
  --title "分析TikTok万圣节趋势" \
  --description "抓取过去7天#halloweenpin标签热门视频，分析趋势" \
  --requirements "至少找到3个可量产设计,提供TikTok视频链接,评估热度持续性"

# 生成特定主题设计
harness task \
  --title "生成"星空猫咪"系列设计" \
  --description "可爱风格，猫咪+星星月亮元素，目标女性18-25岁" \
  --requirements "5个变体(不同配色),2.5cm尺寸,梦幻治愈风格,成本预估"
```

## 6. 质量评估

定期评估AI效果：

| 指标 | 目标 | 监控方式 |
|------|------|----------|
| 设计通过率 | >80% | 审核系统统计 |
| 上架后30天销量 | >5件 | 订单系统 |
| 广告CTR | >2% | 广告平台API |
| 退货率 | <5% | 订单系统 |
