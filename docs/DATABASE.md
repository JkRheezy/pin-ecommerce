# 数据库设计

> Prisma Schema 设计

## 1. 核心模型

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// 商品
model Product {
  id          String   @id @default(uuid())
  slug        String   @unique
  name        Json     // { en: "", zh: "", ... }
  description Json?
  price       Decimal  @db.Decimal(10, 2)
  currency    String   @default("USD")
  images      String[] // R2 URLs
  
  // 变体（尺寸、颜色等）
  variants    Variant[]
  
  // 库存（PIN简单起见，走Dropshipping可不存）
  inventory   Int      @default(999)
  
  // AI元数据
  aiMetadata  Json?    // { prompt, generatedAt, approvedBy }
  
  // 分类/标签
  category    Category @relation(fields: [categoryId], references: [id])
  categoryId  String
  tags        String[]
  
  // SEO
  seoTitle       String?
  seoDescription String?
  
  isActive    Boolean  @default(false) // 需审核后上架
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  orderItems  OrderItem[]
}

// 商品变体
model Variant {
  id        String  @id @default(uuid())
  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  
  name      String  // "2.5cm Gold", "3cm Silver"
  sku       String  @unique
  price     Decimal @db.Decimal(10, 2) // 变体可能有不同价格
  inventory Int     @default(999)
  
  orderItems OrderItem[]
}

// 分类
model Category {
  id          String    @id @default(uuid())
  slug        String    @unique
  name        Json      // 多语言
  description Json?
  image       String?
  products    Product[]
}

// 订单
model Order {
  id            String      @id @default(uuid())
  orderNumber   String      @unique // 人类可读编号 ORD-2024-0001
  
  // 客户信息（游客购买，不强制注册）
  customerEmail String
  customerName  String?
  customerPhone String?
  
  // 地址
  shippingAddress Json // { name, address, city, country, zip }
  
  // 订单项
  items         OrderItem[]
  
  // 金额
  subtotal      Decimal @db.Decimal(10, 2)
  shippingCost  Decimal @db.Decimal(10, 2)
  tax           Decimal @db.Decimal(10, 2)
  total         Decimal @db.Decimal(10, 2)
  currency      String  @default("USD")
  
  // 状态
  status        OrderStatus @default(PENDING)
  paymentStatus PaymentStatus @default(PENDING)
  
  // 支付
  stripePaymentIntentId String?
  
  // 物流
  trackingNumber String?
  carrier        String? // USPS, DHL, etc.
  
  // 时间线
  paidAt      DateTime?
  shippedAt   DateTime?
  deliveredAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model OrderItem {
  id        String @id @default(uuid())
  orderId   String
  order     Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  
  productId   String
  product     Product   @relation(fields: [productId], references: [id])
  variantId   String?
  variant     Variant?  @relation(fields: [variantId], references: [id])
  
  productName String    // 快照，避免产品改名后订单显示问题
  price       Decimal   @db.Decimal(10, 2) // 下单时价格
  quantity    Int
}

enum OrderStatus {
  PENDING    // 待支付
  PAID       // 已支付
  PROCESSING // 处理中
  SHIPPED    // 已发货
  DELIVERED  // 已送达
  CANCELLED  // 已取消
  REFUNDED   // 已退款
}

enum PaymentStatus {
  PENDING
  PAID
  FAILED
  REFUNDED
}

// 购物车（Redis为主，DB做持久化备份）
model Cart {
  id        String     @id @default(uuid())
  sessionId String     @unique // 游客用session
  items     CartItem[]
  updatedAt DateTime   @updatedAt
}

model CartItem {
  id        String  @id @default(uuid())
  cartId    String
  cart      Cart    @relation(fields: [cartId], references: [id], onDelete: Cascade)
  productId String
  variantId String?
  quantity  Int
}

// AI任务记录
model AIJob {
  id          String   @id @default(uuid())
  type        AIJobType
  status      AIJobStatus @default(PENDING)
  prompt      String   @db.Text
  result      Json?    // 生成结果
  error       String?
  
  // 关联
  productId   String?
  
  createdAt   DateTime @default(now())
  completedAt DateTime?
}

enum AIJobType {
  PICK_PRODUCT
  DESIGN_IMAGE
  GENERATE_COPY
  PRICE_ANALYSIS
}

enum AIJobStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}
```

## 2. 索引设计

```prisma
// 常用查询索引
model Product {
  @@index([categoryId, isActive])
  @@index([isActive, createdAt])
  @@index([tags])
}

model Order {
  @@index([customerEmail])
  @@index([status, createdAt])
  @@index([stripePaymentIntentId])
}
```

## 3. 关键设计决策

### 3.1 多语言存储
使用 JSON 类型存储多语言字段：
```json
{
  "en": "Cute Cat Pin",
  "zh": "可爱猫咪徽章",
  "ja": "かわいい猫ピン"
}
```

### 3.2 价格使用 Decimal
避免浮点数精度问题：
```prisma
price Decimal @db.Decimal(10, 2) // 最大99999999.99
```

### 3.3 订单快照
`OrderItem.productName` 记录下单时的产品名称，避免产品改名后订单显示不一致。

### 3.4 软删除
不直接删除产品和订单，使用 `isActive` 和 `status=CANCELLED` 标记。

## 4. 迁移命令

```bash
# 初始化
npx prisma migrate dev --name init

# 后续修改
npx prisma migrate dev --name add_ai_jobs

# 生成客户端
npx prisma generate

# 查看数据库
npx prisma studio
```
