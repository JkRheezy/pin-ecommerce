# 全自动需求驱动进化系统

## 系统愿景

```
┌─────────────────────────────────────────────────────────────┐
│                    全自动进化闭环                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   代码现状 ──→ AI分析缺口 ──→ 生成需求 ──→ 实现功能 ──→ 更新文档 │
│      ↑                                              ↓       │
│      └────────────────  用户介入(可选)  ────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. 需求发现引擎 (RequirementDiscoveryEngine)

**职责**: 自主发现项目中缺失的功能

**分析维度**:

```typescript
interface DiscoveryStrategy {
  // 1. 架构完整性分析
  architecture: {
    check: "检查标准架构模式是否完整";
    examples: [
      "电商系统应该有: 商品/订单/支付/用户",
      "发现缺少支付模块 → 生成支付需求"
    ];
  };
  
  // 2. 接口完整性分析  
  api: {
    check: "检查API是否形成完整闭环";
    examples: [
      "有创建订单接口，但没有支付接口",
      "有用户注册，但没有密码找回"
    ];
  };
  
  // 3. 页面流程分析
  userFlow: {
    check: "检查用户核心流程是否贯通";
    examples: [
      "浏览商品 → 加购物车 → 结算 → 支付 → 订单",
      "发现缺少购物车 → 生成购物车需求"
    ];
  };
  
  // 4. 数据模型分析
  dataModel: {
    check: "检查数据关系是否完整";
    examples: [
      "商品表存在，但没有库存表",
      "订单表存在，但没有订单状态流转"
    ];
  };
  
  // 5. 配置驱动需求
  configDriven: {
    check: "检查配置文件中的功能开关";
    examples: [
      "config.yaml 中启用了 payment: true",
      "但没有找到支付相关代码 → 生成支付需求"
    ];
  };
}
```

### 2. 需求文档自维护系统

**AGENTS.md 作为"活文档"**

```markdown
# PIN 独立站

> 状态: 🔄 持续进化中 | 最后更新: 2026-04-02 (由 Loop 自动更新)

## 已实现功能 ✅

| 模块 | 描述 | 完成时间 |
|------|------|----------|
| 趋势分析 | Google/Reddit 趋势抓取 | 2026-04-01 |
| AI 选品 | 基于趋势的产品推荐 | 2026-04-02 |

## 进行中 🚧

| 模块 | 描述 | 预计完成 | 阻塞原因 |
|------|------|----------|----------|
| 用户系统 | 登录/注册/权限 | - | 等待数据库设计 |

## 待实现 📋

| 模块 | 描述 | 优先级 | 自动生成原因 |
|------|------|--------|--------------|
| 支付系统 | 集成 Stripe | P0 | 检测到订单模块缺少支付闭环 |
| 购物车 | 加购/修改数量 | P1 | 检测到用户流程中断 |

## 技术债务 🔧

- [ ] page.tsx 需要拆分为小组件
- [ ] API 路由需要统一错误处理

---
*此文档由 Harness Loop 自动维护，人工可补充需求*
```

### 3. 全自动任务生成器

**工作流程**:

```typescript
class AutoTaskGenerator {
  async generateTasks(): Promise<Task[]> {
    const tasks: Task[] = [];
    
    // 步骤1: 扫描代码现状
    const codebase = await this.scanCodebase();
    
    // 步骤2: AI分析缺失什么
    const gaps = await this.analyzeGaps(codebase);
    
    for (const gap of gaps) {
      // 步骤3: 生成需求描述
      const requirement = await this.generateRequirement(gap);
      
      // 步骤4: 写入 AGENTS.md
      await this.updateAgentsMd(requirement);
      
      // 步骤5: 生成实现任务
      const task = await this.createImplementationTask(requirement);
      tasks.push(task);
    }
    
    return tasks;
  }
  
  private async analyzeGaps(codebase: Codebase): Promise<Gap[]> {
    const prompt = `
分析以下代码库，识别缺失的核心功能：

已发现的文件结构:
${codebase.fileTree}

已实现的 API:
${codebase.apiRoutes}

数据库模型:
${codebase.models}

项目类型: Next.js + Prisma + PostgreSQL 电商系统

请分析:
1. 作为一个电商系统，还缺少哪些核心模块？
2. 用户完整购物流程中，哪些环节缺失？
3. 现有模块中，哪些功能不完整？
4. 哪些配置启用了但代码未实现？

输出格式:
[
  {
    "type": "missing_module",
    "name": "支付系统",
    "reason": "检测到订单模块但没有支付相关代码",
    "priority": "P0",
    "suggestedScope": "集成 Stripe，支持信用卡支付"
  }
]
`;
    return await this.llm.analyze(prompt);
  }
}
```

### 4. 实现-验证-文档更新闭环

```typescript
class EvolutionLoop {
  async run() {
    while (this.shouldContinue()) {
      // 1. 发现需求
      const gaps = await this.discoveryEngine.findGaps();
      
      for (const gap of gaps) {
        // 2. 更新需求文档（自动）
        await this.docManager.addRequirement(gap);
        
        // 3. 生成设计
        const design = await this.designPhase.run(gap);
        
        // 4. 实现功能
        const result = await this.executor.execute(design);
        
        // 5. 验证实现
        const verified = await this.verification.run(result);
        
        // 6. 更新文档状态
        await this.docManager.markAsImplemented(gap, result);
        
        // 7. 创建 PR
        await this.prWorkflow.create(result);
      }
      
      // 8. 等待一段时间再检查
      await this.sleep(this.config.checkInterval);
    }
  }
}
```

## 具体实现计划

### Phase 1: 基础需求发现

实现 `RequirementDiscoveryEngine`，能够：
- 扫描代码结构
- 识别缺失的电商核心模块
- 生成基础需求文档

### Phase 2: 文档自维护

实现 `AgentsMdManager`：
- 读取现有 AGENTS.md
- 自动添加新发现的需求
- 标记已实现的功能
- 维护状态表格

### Phase 3: 智能任务生成

实现 `SmartTaskGenerator`：
- 基于缺口生成具体任务
- 自动推断实现步骤
- 生成验收标准

### Phase 4: 闭环验证

实现 `ImplementationVerifier`：
- 验证实现是否符合需求
- 自动更新文档状态
- 生成实现报告

## 用户介入点

虽然目标是全自动，但以下情况会通知用户：

```typescript
interface UserIntervention {
  // 1. 高优先级决策
  highPriorityDecision: "发现P0需求，需要确认优先级";
  
  // 2. 外部依赖
  externalDependency: "需要第三方API Key (Stripe/SendGrid)";
  
  // 3. 架构变更
  architectureChange: "建议重构现有架构，影响范围大";
  
  // 4. 矛盾检测
  conflictDetected: "新需求与现有实现有冲突";
  
  // 5. 用户主动补充
  userRequirement: "用户在AGENTS.md中补充了新需求";
}
```

## 示例运行流程

### Day 1: 初始扫描

```
Loop: 扫描代码库...
Loop: 发现文件结构:
  - src/app/page.tsx (首页)
  - src/lib/ai/ (AI选品模块)
  - prisma/schema.prisma (数据库)

Loop: AI分析中...
Loop: 发现缺口:
  1. 缺少用户认证系统
  2. 缺少商品展示页面
  3. 缺少购物车功能
  4. 缺少支付系统

Loop: 更新 AGENTS.md...
Loop: 生成任务: "实现用户登录注册系统"
Loop: 开始实现...
```

### Day 2: 继续进化

```
Loop: 检查进度...
Loop: 用户登录已实现 ✅
Loop: 更新 AGENTS.md 状态...

Loop: 发现新缺口:
  - 有登录但没有密码找回
  - 有商品但没有分类筛选

Loop: 生成任务: "实现密码找回功能"
Loop: 开始实现...
```

### Day N: 系统成熟

```
Loop: 系统已相对完整
Loop: 进入维护模式
Loop: 检测技术债务...
Loop: 建议重构: "将大文件拆分为组件"
```

## 配置

```yaml
# .harness/config.yaml
autoEvolution:
  enabled: true
  mode: "full"  # full = 全自动, assisted = 需要确认
  
  discovery:
    checkInterval: 3600000  # 1小时检查一次
    architecturePatterns:
      - pattern: "e-commerce"
        requiredModules: ["product", "cart", "order", "payment", "user"]
      
  documentation:
    autoUpdate: true        # 自动更新AGENTS.md
    maintainRoadmap: true   # 维护路线图
    
  userIntervention:
    requiredFor:
      - "P0_priority"      # P0需求需要确认
      - "external_api"     # 需要外部API key
      - "architecture_change"  # 架构变更
    notifyOn:
      - "task_completed"   # 任务完成通知
      - "weekly_summary"   # 周报
```

## 总结

这个系统让 Loop 成为真正的"自主开发者"：
- **自己发现问题** - 不需要人告诉它做什么
- **自己规划需求** - 自动维护需求文档
- **自己实现功能** - 从设计到代码
- **自己验证更新** - 闭环更新文档状态

用户角色转变为：
- **设定方向** - 初期提供业务上下文
- **补充细节** - 在AGENTS.md中添加特殊需求
- **审核重要决策** - 只在关键点介入
