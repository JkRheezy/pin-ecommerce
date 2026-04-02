# 需求分析器设计方案

## 核心概念

```
AGENTS.md (目录索引)
    ↓ 引用
├── features/auth/README.md          (认证模块需求)
├── features/product/README.md       (商品模块需求)  
├── features/trends/README.md        (趋势分析需求)
├── tech-specs/api-design.md         (技术规范)
└── roadmap/milestone-v1.md          (路线图)

    ↓ AI 分析
识别缺失的实现 → 生成业务任务
```

## 1. 文档结构规范

### AGENTS.md 格式（目录索引）

```markdown
# PIN 独立站 - AI 驱动电商

## 功能模块

| 模块 | 文档 | 状态 |
|------|------|------|
| 🔐 用户认证 | [docs/features/auth/README.md](docs/features/auth/README.md) | 🚧 待实现 |
| 🛍️ 商品管理 | [docs/features/product/README.md](docs/features/product/README.md) | ✅ 基础框架完成 |
| 📈 趋势分析 | [docs/features/trends/README.md](docs/features/trends/README.md) | ✅ 已实现 |
| 🤖 AI 选品 | [docs/features/ai-picker/README.md](docs/features/ai-picker/README.md) | 🚧 待实现 |

## 技术规范
- [API 设计规范](docs/tech-specs/api-design.md)
- [数据库设计](docs/tech-specs/database-schema.md)

## 路线图
- [V1.0 MVP](docs/roadmap/milestone-v1.md)
```

### 功能模块文档格式

每个功能模块一个 README.md，包含：

```markdown
# 用户认证模块

## 目标
实现完整的用户注册/登录/权限管理

## 功能清单

### 已实现
- [x] 基础用户模型
- [x] JWT token 生成

### 待实现
- [ ] 邮箱验证码登录
- [ ] 第三方 OAuth (Google)
- [ ] 密码找回流程
- [ ] 管理员权限控制

## 接口定义
| 接口 | 方法 | 状态 |
|------|------|------|
| POST /api/auth/register | 注册 | 🚧 |
| POST /api/auth/login | 登录 | 🚧 |
| POST /api/auth/forgot-password | 找回密码 | ⏳ 未开始 |

## 相关文件
- 页面: `src/app/auth/login/page.tsx`
- API: `src/app/api/auth/route.ts`
- 组件: `src/components/auth/LoginForm.tsx`
```

## 2. 需求分析器实现

### 新增文件

```
harness-cli/src/evolution/analyzers/
├── RequirementAnalyzer.ts      (主分析器)
├── MarkdownParser.ts           (Markdown 解析器)
└── types.ts                    (类型定义)
```

### RequirementAnalyzer.ts 核心逻辑

```typescript
export class RequirementAnalyzer {
  async analyze(projectPath: string): Promise<EvolutionOpportunity[]> {
    const opportunities: EvolutionOpportunity[] = [];
    
    // 1. 读取 AGENTS.md
    const agentsMd = await this.readFile(path.join(projectPath, 'AGENTS.md'));
    if (!agentsMd) return [];
    
    // 2. 提取所有引用的文档链接
    const docLinks = this.extractDocLinks(agentsMd);
    
    // 3. 读取每个功能模块文档
    for (const link of docLinks) {
      const docPath = path.join(projectPath, link.path);
      const content = await this.readFile(docPath);
      if (!content) continue;
      
      // 4. 分析文档 vs 实际代码，找出缺失的实现
      const gaps = await this.findImplementationGaps(content, projectPath);
      
      // 5. 使用 AI 生成具体的业务任务
      for (const gap of gaps) {
        const opportunity = await this.generateBusinessTask(gap);
        opportunities.push(opportunity);
      }
    }
    
    return opportunities;
  }
  
  private async findImplementationGaps(docContent: string, projectPath: string): Promise<Gap[]> {
    // 解析文档中的 "待实现" 清单
    const todoItems = this.parseTodoItems(docContent);
    
    // 解析文档中的接口定义
    const apiEndpoints = this.parseApiEndpoints(docContent);
    
    // 解析文档中的文件引用
    const referencedFiles = this.parseFileReferences(docContent);
    
    const gaps: Gap[] = [];
    
    // 检查每个待实现项
    for (const item of todoItems) {
      // 检查是否已有对应的代码文件
      const exists = await this.checkImplementationExists(item, projectPath);
      if (!exists) {
        gaps.push({
          type: 'missing_feature',
          description: item.description,
          priority: item.priority,
          evidence: item
        });
      }
    }
    
    // 检查接口是否已实现
    for (const api of apiEndpoints) {
      const routeFile = this.inferRouteFile(api);
      const exists = await this.fileExists(path.join(projectPath, routeFile));
      if (!exists) {
        gaps.push({
          type: 'missing_api',
          description: `${api.method} ${api.path}`,
          priority: api.status === '🚧' ? 'high' : 'medium',
          evidence: api
        });
      }
    }
    
    return gaps;
  }
  
  private async generateBusinessTask(gap: Gap): Promise<EvolutionOpportunity> {
    // 使用 LLM 生成具体的业务任务描述
    const prompt = `
基于以下需求缺口，生成一个具体的开发任务：

缺口类型: ${gap.type}
描述: ${gap.description}
优先级: ${gap.priority}
上下文: ${JSON.stringify(gap.evidence)}

请生成一个具体的开发任务，包含：
1. 清晰的标题（不要包含"Add tests"，应该是业务功能）
2. 详细的需求描述
3. 实现步骤建议
4. 验收标准

格式化为 JSON:
{
  "title": "实现xxx功能",
  "description": "...",
  "suggestedApproach": "1. ... 2. ...",
  "requirements": ["...", "..."]
}
`;
    
    const result = await this.callLLM(prompt);
    return {
      id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      category: 'business_feature',
      trigger: 'requirement_gap_detected',
      title: result.title,
      description: result.description,
      priority: gap.priority,
      estimatedImpact: gap.priority === 'high' ? 8 : 6,
      evidence: [{
        type: gap.type,
        description: gap.description,
        severity: gap.priority === 'high' ? 'error' : 'warning'
      }],
      suggestedApproach: result.suggestedApproach,
      relatedFiles: this.inferRelatedFiles(gap),
      createdAt: new Date()
    };
  }
}
```

## 3. 集成到 OpportunityDetector

修改 `OpportunityDetector.ts`：

```typescript
import { RequirementAnalyzer } from './analyzers/RequirementAnalyzer';

export class OpportunityDetector {
  private requirementAnalyzer: RequirementAnalyzer;
  
  constructor(config: EvolutionConfig) {
    // ... existing code ...
    this.requirementAnalyzer = new RequirementAnalyzer();
  }
  
  async detectOpportunities(
    projectPath: string,
    context?: BusinessContext
  ): Promise<EvolutionResult> {
    // ... existing code ...
    
    // 添加需求分析
    if (this.config.categories.business) {
      analysisPromises.push(this.requirementAnalyzer.analyze(projectPath));
    }
    
    // ... rest of code ...
  }
}
```

## 4. 优先级策略

为了让业务任务优先于测试任务，调整优先级算法：

```typescript
private prioritizeOpportunities(opportunities: EvolutionOpportunity[]): EvolutionOpportunity[] {
  const categoryPriority = {
    'business_feature': 3,    // 业务功能 - 最高优先级
    'technical_debt': 2,      // 技术债务
    'test_coverage': 1        // 测试覆盖 - 最低优先级
  };
  
  return opportunities.sort((a, b) => {
    const catDiff = (categoryPriority[b.category] || 0) - (categoryPriority[a.category] || 0);
    if (catDiff !== 0) return catDiff;
    
    // 同类别内按影响分数排序
    return b.estimatedImpact - a.estimatedImpact;
  });
}
```

## 5. 配置示例

```yaml
# .harness/config.yaml
evolution:
  enabled: true
  categories:
    business: true      # 启用需求分析
    technical: true     # 技术债务
    ux: true           # 用户体验
```

## 6. 任务生成示例

### 输入（AGENTS.md 引用的文档）

```markdown
## 待实现
- [ ] 邮箱验证码登录
- [ ] 第三方 OAuth (Google)

## 接口定义
| 接口 | 方法 | 状态 |
|------|------|------|
| POST /api/auth/login | 登录 | 🚧 |
```

### 输出（生成的任务）

```json
{
  "title": "实现邮箱验证码登录功能",
  "description": "用户可以通过邮箱接收验证码进行登录，无需密码...",
  "suggestedApproach": [
    "1. 创建验证码发送 API: POST /api/auth/send-code",
    "2. 修改登录 API 支持验证码登录",
    "3. 添加验证码缓存（Redis/内存）",
    "4. 创建登录页面 UI",
    "5. 添加邮箱模板"
  ],
  "requirements": [
    "验证码 6 位数字，有效期 5 分钟",
    "支持重新发送，间隔 60 秒",
    "同一邮箱 1 小时内最多 5 次请求"
  ]
}
```

## 7. 扩展能力

### 7.1 版本演进检测

```typescript
// 检测文档版本 vs 实现版本
async detectVersionMismatch(docPath: string, implPath: string): Promise<boolean> {
  const docVersion = await this.extractVersionFromDoc(docPath);
  const codeVersion = await this.extractVersionFromCode(implPath);
  return docVersion !== codeVersion;
}
```

### 7.2 依赖关系分析

```typescript
// 分析功能依赖，生成合理的实现顺序
async analyzeDependencies(features: Feature[]): Promise<Feature[][]> {
  // 返回分层依赖，例如：
  // Layer 1: [用户模型, 基础配置]
  // Layer 2: [登录功能, 注册功能]  
  // Layer 3: [第三方登录]
}
```

## 总结

这个方案的优点：
1. **文档驱动** - AGENTS.md 作为目录，需求文档独立维护
2. **智能分析** - AI 理解文档内容，不只是简单匹配
3. **业务优先** - 业务功能任务优先级高于测试
4. **可扩展** - 支持版本管理、依赖分析等高级特性
5. **不污染上下文** - 按需读取文档，不是一次性加载所有内容
