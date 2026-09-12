// 摆摊进销存纯逻辑引擎（销售记账业务核心）
// 零 vue/pinia/DOM 依赖（node --experimental-strip-types 可测）：数据归一化/种子分类/双分类 CRUD
// 结果计算/库存/日收入/统计/排行/趋势坐标。组件与 store 禁止内联重算本模块公式。
import { DEFAULT_BUSINESS_EXPENSE_CATEGORIES, DEFAULT_BUSINESS_PRODUCT_CATEGORIES } from '../types/index.ts'
import type {
  BusinessDailyRecord,
  BusinessData,
  BusinessExpense,
  BusinessExpenseCategory,
  BusinessProduct,
  BusinessProductCategory,
  BusinessPurchase,
  BusinessSettings,
  DailyRecordItem
} from '../types'
import { formatYuan } from './ledgerCore.ts'

// ===== 常量 =====

/** 支出内置分类 id（不可删；normalize 时缺失自动补回） */
export const BUSINESS_EXPENSE_BUILTIN_IDS = DEFAULT_BUSINESS_EXPENSE_CATEGORIES.map(c => c.id)

/** 商品分类 id 前缀 / 支出自定义分类 id 前缀 / 其余实体 id 前缀 */
export const ID_PREFIX = { product: 'bp_', productCat: 'bpc_', expense: 'be_', expenseCat: 'bec_', purchase: 'bpr_', daily: 'bd_' } as const

/** 低库存预警阈值默认值 */
export const DEFAULT_LOW_STOCK_THRESHOLD = 20

// ===== 工具 =====

/** 本地日期键 YYYY-MM-DD（防 UTC 偏移，仿 todoCore.localToday） */
export function localDateKey(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 日期键校验（正则 + 月 1-12/日 1-31） */
export function isValidDateKey(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const [, m, d] = date.split('-').map(Number)
  return m >= 1 && m <= 12 && d >= 1 && d <= 31
}

/** 金额格式化（复用记账 ledgerCore.formatYuan，含千分位两位小数） */
export const formatYuanOf = formatYuan

/** 分类名称唯一判定（trim 后大小写不敏感，与除自身外其他项比对） */
export function isCategoryNameTaken(name: string, id: string, list: { id: string; name: string }[]): boolean {
  const target = name.trim().toLowerCase()
  return list.some(c => c.id !== id && c.name.trim().toLowerCase() === target)
}

/** 生成本地唯一 id（前缀 + 时间戳 + 随机段；测试仅断言前缀） */
export function newId(prefix: string): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ===== 空数据 / 归一化 =====

/** 空数据（含内置种子分类；首次进入 / 备份缺失兜底） */
export function emptyBusinessData(): BusinessData {
  return {
    productCategories: DEFAULT_BUSINESS_PRODUCT_CATEGORIES.map(c => ({ ...c })),
    expenseCategories: DEFAULT_BUSINESS_EXPENSE_CATEGORIES.map(c => ({ ...c })),
    products: [],
    purchases: [],
    dailyRecords: [],
    expenses: [],
    settings: { stallName: '', lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD, monthlyRevenueTarget: 0 }
  }
}

/** 归一化商品分类列表：非数组 → 默认种子；数组（含空数组）→ 逐项归一尊重存量（空 = 用户删光分类） */
export function normalizeProductCategories(raw: unknown): BusinessProductCategory[] {
  if (!Array.isArray(raw)) return DEFAULT_BUSINESS_PRODUCT_CATEGORIES.map(c => ({ ...c }))
  const out: BusinessProductCategory[] = []
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue
    const c = item as Record<string, unknown>
    if (typeof c.id !== 'string' || !c.id || typeof c.name !== 'string' || !c.name.trim()) continue
    out.push({
      id: c.id,
      name: c.name.trim().slice(0, 20),
      sortOrder: typeof c.sortOrder === 'number' && Number.isFinite(c.sortOrder) ? c.sortOrder : out.length + 1,
      visible: c.visible !== false
    })
  }
  out.sort((a, b) => a.sortOrder - b.sortOrder)
  return out
}

/** 归一化支出分类列表：非数组 → 默认内置；内置 5 缺失自动补回（不可删契约）；自定义保留 */
export function normalizeExpenseCategories(raw: unknown): BusinessExpenseCategory[] {
  if (!Array.isArray(raw)) return DEFAULT_BUSINESS_EXPENSE_CATEGORIES.map(c => ({ ...c }))
  const out: BusinessExpenseCategory[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue
    const c = item as Record<string, unknown>
    if (typeof c.id !== 'string' || !c.id || typeof c.name !== 'string' || !c.name.trim()) continue
    seen.add(c.id)
    out.push({
      id: c.id,
      name: c.name.trim().slice(0, 20),
      sortOrder: typeof c.sortOrder === 'number' && Number.isFinite(c.sortOrder) ? c.sortOrder : out.length + 1,
      visible: c.visible !== false,
      isBuiltIn: c.isBuiltIn === true || BUSINESS_EXPENSE_BUILTIN_IDS.includes(c.id)
    })
  }
  // 内置缺失补回（按默认序插到已有项之后，sortOrder 递增）
  let maxOrder = out.reduce((m, c) => Math.max(m, c.sortOrder), 0)
  for (const builtin of DEFAULT_BUSINESS_EXPENSE_CATEGORIES) {
    if (!seen.has(builtin.id)) {
      out.push({ ...builtin, sortOrder: ++maxOrder })
    }
  }
  out.sort((a, b) => a.sortOrder - b.sortOrder)
  return out
}

function numOf(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function normProduct(raw: unknown): BusinessProduct | null {
  if (raw === null || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (typeof p.id !== 'string' || !p.id || typeof p.name !== 'string' || !p.name.trim()) return null
  return {
    id: p.id,
    name: p.name.trim().slice(0, 40),
    categoryId: typeof p.categoryId === 'string' && p.categoryId ? p.categoryId : undefined,
    unit: typeof p.unit === 'string' ? p.unit.trim().slice(0, 8) || '件' : '件',
    purchasePrice: Math.max(0, numOf(p.purchasePrice)),
    sellingPrice: Math.max(0, numOf(p.sellingPrice)),
    active: p.active !== false,
    createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date(0).toISOString()
  }
}

function normPurchase(raw: unknown): BusinessPurchase | null {
  if (raw === null || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (typeof p.id !== 'string' || !p.id || typeof p.productId !== 'string' || !p.productId) return null
  if (typeof p.date !== 'string' || !isValidDateKey(p.date)) return null
  const quantity = Math.max(0, numOf(p.quantity))
  const unitPrice = Math.max(0, numOf(p.unitPrice))
  const total = typeof p.total === 'number' && Number.isFinite(p.total) ? p.total : quantity * unitPrice
  return {
    id: p.id,
    productId: p.productId,
    quantity,
    unitPrice,
    total,
    date: p.date,
    note: typeof p.note === 'string' && p.note.trim() ? p.note.trim().slice(0, 100) : undefined,
    createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date(0).toISOString()
  }
}

function normDailyItem(raw: unknown): DailyRecordItem | null {
  if (raw === null || typeof raw !== 'object') return null
  const it = raw as Record<string, unknown>
  if (typeof it.productId !== 'string' || !it.productId) return null
  return {
    productId: it.productId,
    broughtOut: Math.max(0, numOf(it.broughtOut)),
    remaining: Math.max(0, numOf(it.remaining)),
    loss: Math.max(0, numOf(it.loss))
  }
}

function normDailyRecord(raw: unknown): BusinessDailyRecord | null {
  if (raw === null || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  if (typeof d.id !== 'string' || !d.id) return null
  if (typeof d.date !== 'string' || !isValidDateKey(d.date)) return null
  const items = Array.isArray(d.items) ? (d.items.map(normDailyItem).filter(Boolean) as DailyRecordItem[]) : []
  return {
    id: d.id,
    date: d.date,
    items,
    totalRevenue: Math.max(0, numOf(d.totalRevenue)),
    transactionCount: typeof d.transactionCount === 'number' && Number.isFinite(d.transactionCount) ? Math.max(0, Math.floor(d.transactionCount)) : undefined,
    note: typeof d.note === 'string' && d.note.trim() ? d.note.trim().slice(0, 200) : undefined,
    createdAt: typeof d.createdAt === 'string' ? d.createdAt : new Date(0).toISOString(),
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : new Date(0).toISOString()
  }
}

function normExpense(raw: unknown): BusinessExpense | null {
  if (raw === null || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  if (typeof e.id !== 'string' || !e.id) return null
  if (typeof e.date !== 'string' || !isValidDateKey(e.date)) return null
  if (typeof e.categoryId !== 'string' || !e.categoryId) return null
  return {
    id: e.id,
    date: e.date,
    categoryId: e.categoryId,
    amount: Math.max(0, numOf(e.amount)),
    note: typeof e.note === 'string' && e.note.trim() ? e.note.trim().slice(0, 100) : undefined,
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : new Date(0).toISOString()
  }
}

function normalizeSettings(raw: unknown): BusinessSettings {
  const out: BusinessSettings = { stallName: '', lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD, monthlyRevenueTarget: 0 }
  if (raw === null || typeof raw !== 'object') return out
  const s = raw as Record<string, unknown>
  if (typeof s.stallName === 'string') out.stallName = s.stallName.trim().slice(0, 30)
  if (typeof s.lowStockThreshold === 'number' && Number.isFinite(s.lowStockThreshold)) {
    out.lowStockThreshold = Math.max(0, Math.floor(s.lowStockThreshold))
  }
  if (typeof s.monthlyRevenueTarget === 'number' && Number.isFinite(s.monthlyRevenueTarget)) {
    out.monthlyRevenueTarget = Math.max(0, Math.floor(s.monthlyRevenueTarget))
  }
  return out
}

/** 归一化（幂等）：非对象 → empty；各字段独立归一、分类种子/内置契约保持 */
export function normalizeBusinessData(raw: unknown): BusinessData {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return emptyBusinessData()
  const data = raw as Record<string, unknown>
  return {
    productCategories: normalizeProductCategories(data.productCategories),
    expenseCategories: normalizeExpenseCategories(data.expenseCategories),
    products: Array.isArray(data.products) ? (data.products.map(normProduct).filter(Boolean) as BusinessProduct[]) : [],
    purchases: Array.isArray(data.purchases) ? (data.purchases.map(normPurchase).filter(Boolean) as BusinessPurchase[]) : [],
    dailyRecords: Array.isArray(data.dailyRecords) ? (data.dailyRecords.map(normDailyRecord).filter(Boolean) as BusinessDailyRecord[]) : [],
    expenses: Array.isArray(data.expenses) ? (data.expenses.map(normExpense).filter(Boolean) as BusinessExpense[]) : [],
    settings: normalizeSettings(data.settings)
  }
}

// ===== 分类 CRUD 结果计算（不改入参，返回 { ok, reason, list? }） =====

export type CategoryOpResult<T> =
  | { ok: true; reason: 'ok'; list: T[] }
  | { ok: false; reason: 'empty' | 'duplicate' | 'not-found' | 'in-use' | 'builtin' | 'boundary' }

interface CategoryLike {
  id: string
  name: string
  sortOrder: number
  visible: boolean
}

/** 新增商品分类（id 由 core 生成 bpc_ 前缀） */
export function addProductCategory(list: BusinessProductCategory[], name: string): CategoryOpResult<BusinessProductCategory> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  if (isCategoryNameTaken(trimmed, '', list)) return { ok: false, reason: 'duplicate' }
  const next: BusinessProductCategory = {
    id: newId(ID_PREFIX.productCat),
    name: trimmed.slice(0, 20),
    sortOrder: list.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1,
    visible: true
  }
  return { ok: true, reason: 'ok', list: [...list, next] }
}

/** 新增支出分类（自定义 bec_ 前缀） */
export function addExpenseCategory(list: BusinessExpenseCategory[], name: string): CategoryOpResult<BusinessExpenseCategory> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  if (isCategoryNameTaken(trimmed, '', list)) return { ok: false, reason: 'duplicate' }
  const next: BusinessExpenseCategory = {
    id: newId(ID_PREFIX.expenseCat),
    name: trimmed.slice(0, 20),
    sortOrder: list.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1,
    visible: true,
    isBuiltIn: false
  }
  return { ok: true, reason: 'ok', list: [...list, next] }
}

/** 通用改名：商品/支出分类均允许（含支出内置）；名称唯一（除自身外） */
export function renameCategory<T extends CategoryLike>(list: T[], id: string, name: string): CategoryOpResult<T> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  const target = list.find(c => c.id === id)
  if (!target) return { ok: false, reason: 'not-found' }
  if (isCategoryNameTaken(trimmed, id, list)) return { ok: false, reason: 'duplicate' }
  return { ok: true, reason: 'ok', list: list.map(c => (c.id === id ? { ...c, name: trimmed.slice(0, 20) } : c)) }
}

/** 通用标签页显隐切换 */
export function toggleCategoryVisible<T extends CategoryLike>(list: T[], id: string): CategoryOpResult<T> {
  const target = list.find(c => c.id === id)
  if (!target) return { ok: false, reason: 'not-found' }
  return { ok: true, reason: 'ok', list: list.map(c => (c.id === id ? { ...c, visible: !c.visible } : c)) }
}

/** 通用移动（按 sortOrder 升序后与邻居对调 sortOrder 值）；首项上移/末项下移 → boundary */
export function moveCategory<T extends CategoryLike>(list: T[], id: string, dir: 'up' | 'down'): CategoryOpResult<T> {
  const sorted = [...list].sort((a, b) => a.sortOrder - b.sortOrder)
  const idx = sorted.findIndex(c => c.id === id)
  if (idx === -1) return { ok: false, reason: 'not-found' }
  const target = dir === 'up' ? idx - 1 : idx + 1
  if (target < 0 || target >= sorted.length) return { ok: false, reason: 'boundary' }
  const a = sorted[idx]
  const b = sorted[target]
  const swapped = sorted.map((c, i) => {
    if (i === idx) return { ...c, sortOrder: b.sortOrder }
    if (i === target) return { ...c, sortOrder: a.sortOrder }
    return c
  })
  swapped.sort((x, y) => x.sortOrder - y.sortOrder)
  return { ok: true, reason: 'ok', list: swapped }
}

/** 删除商品分类：被商品引用 → in-use；内置种子可删（删除后商品归未分类由 store 处理） */
export function deleteProductCategory(
  list: BusinessProductCategory[],
  id: string,
  inUse: boolean
): CategoryOpResult<BusinessProductCategory> {
  const target = list.find(c => c.id === id)
  if (!target) return { ok: false, reason: 'not-found' }
  if (inUse) return { ok: false, reason: 'in-use' }
  return { ok: true, reason: 'ok', list: list.filter(c => c.id !== id) }
}

/** 删除支出分类：内置 → builtin；被支出记录引用 → in-use */
export function deleteExpenseCategory(
  list: BusinessExpenseCategory[],
  id: string,
  inUse: boolean
): CategoryOpResult<BusinessExpenseCategory> {
  const target = list.find(c => c.id === id)
  if (!target) return { ok: false, reason: 'not-found' }
  if (target.isBuiltIn) return { ok: false, reason: 'builtin' }
  if (inUse) return { ok: false, reason: 'in-use' }
  return { ok: true, reason: 'ok', list: list.filter(c => c.id !== id) }
}

// ===== 查找 / 排序 / 可见列表 =====

export function findProduct(products: BusinessProduct[], id: string): BusinessProduct | undefined {
  return products.find(p => p.id === id)
}

export function findProductCategory(categories: BusinessProductCategory[], id: string): BusinessProductCategory | undefined {
  return categories.find(c => c.id === id)
}

export function findExpenseCategory(categories: BusinessExpenseCategory[], id: string): BusinessExpenseCategory | undefined {
  return categories.find(c => c.id === id)
}

/** Tab/标签页可见分类（sortOrder 升序，返回新数组） */
export function visibleProductCategories(categories: BusinessProductCategory[]): BusinessProductCategory[] {
  return categories.filter(c => c.visible !== false).sort((a, b) => a.sortOrder - b.sortOrder)
}

export function visibleExpenseCategories(categories: BusinessExpenseCategory[]): BusinessExpenseCategory[] {
  return categories.filter(c => c.visible !== false).sort((a, b) => a.sortOrder - b.sortOrder)
}

export function sortProducts(products: BusinessProduct[]): BusinessProduct[] {
  return [...products].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function sortPurchases(purchases: BusinessPurchase[]): BusinessPurchase[] {
  return [...purchases].sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))
}

/** 按商品分类过滤进货记录：'all' 返回全部；其余返回 linked 商品分类匹配项。
 *  已删除商品（product 不存在）与未分类商品（categoryId 为 undefined）仅在 'all' 下可见，分类过滤排除。 */
export function filterPurchasesByCategory(
  purchases: BusinessPurchase[],
  products: BusinessProduct[],
  categoryId: string
): BusinessPurchase[] {
  if (categoryId === 'all') return sortPurchases(purchases)
  return sortPurchases(purchases.filter(p => {
    const product = products.find(pr => pr.id === p.productId)
    return product?.categoryId === categoryId
  }))
}

export function sortDailyRecords(records: BusinessDailyRecord[]): BusinessDailyRecord[] {
  return [...records].sort((a, b) => (a.date === b.date ? (a.updatedAt < b.updatedAt ? 1 : -1) : a.date < b.date ? 1 : -1))
}

export function sortExpenses(expenses: BusinessExpense[]): BusinessExpense[] {
  return [...expenses].sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))
}

// ===== 销售/库存/统计 =====

/** 单条目销售数量：max(0, 带出 − 剩余 − 损耗) */
export function soldCount(item: DailyRecordItem): number {
  return Math.max(0, item.broughtOut - item.remaining - item.loss)
}

/** 日记录收入：Σ 销售数量 × 商品售价（商品已删除记 0，防历史失真以现存售价为准） */
export function calcDailyRevenue(items: DailyRecordItem[], products: BusinessProduct[]): number {
  let total = 0
  for (const item of items) {
    const product = products.find(p => p.id === item.productId)
    if (!product) continue
    total += soldCount(item) * product.sellingPrice
  }
  return Math.round(total * 100) / 100
}

/** 日记录成本（纯 COGS）：Σ 销售数量 × 商品进货价（商品已删除计 0，与 calcBusinessStats 同口径） */
export function calcDailyCost(items: DailyRecordItem[], products: BusinessProduct[]): number {
  let total = 0
  for (const item of items) {
    const product = products.find(p => p.id === item.productId)
    total += soldCount(item) * (product?.purchasePrice ?? 0)
  }
  return Math.round(total * 100) / 100
}

/** 日记录损耗金额：Σ 损耗数量 × 商品售价（商品已删除计 0，按售价计潜在收入损失） */
export function calcDailyLossAmount(items: DailyRecordItem[], products: BusinessProduct[]): number {
  let total = 0
  for (const item of items) {
    const product = products.find(p => p.id === item.productId)
    total += item.loss * (product?.sellingPrice ?? 0)
  }
  return Math.round(total * 100) / 100
}

/** 库存：按商品计 = Σ进货 − Σ带出 + Σ剩余（等价 进货 − 销售 − 损耗） */
export function calcInventory(
  products: BusinessProduct[],
  purchases: BusinessPurchase[],
  dailyRecords: BusinessDailyRecord[]
): Record<string, number> {
  const stock: Record<string, number> = {}
  for (const p of purchases) {
    stock[p.productId] = (stock[p.productId] ?? 0) + p.quantity
  }
  for (const r of dailyRecords) {
    for (const item of r.items) {
      stock[item.productId] = (stock[item.productId] ?? 0) - item.broughtOut + item.remaining
    }
  }
  for (const p of products) {
    stock[p.id] = stock[p.id] ?? 0
  }
  return stock
}

/** 进货合计：按商品 Σ进货数量 */
export function calcPurchaseTotals(purchases: BusinessPurchase[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const p of purchases) {
    totals[p.productId] = (totals[p.productId] ?? 0) + p.quantity
  }
  return totals
}

/** 带出合计：按商品 Σ带出数量（跨全部收摊记录） */
export function calcBroughtOutTotals(dailyRecords: BusinessDailyRecord[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const r of dailyRecords) {
    for (const item of r.items) {
      totals[item.productId] = (totals[item.productId] ?? 0) + item.broughtOut
    }
  }
  return totals
}

/** 总统计：营业额 = Σ日记录收入；成本 = 纯 COGS（Σ售出数量 × 进货价，按收摊记录，不计支出）；利润/毛利率；支出 = Σ支出金额 */
export interface BusinessStats {
  revenue: number
  cost: number
  profit: number
  margin: number // 0-1 小数（营业额 0 → 0）
  expenseTotal: number // Σ支出金额（全部支出记录）
}

export function calcBusinessStats(data: BusinessData): BusinessStats {
  const revenue = data.dailyRecords.reduce((s, r) => s + r.totalRevenue, 0)
  // 成本 = 售出商品成本（COGS）：按收摊记录售出数量 × 商品进货价；缺失商品计 0（与 calcDailyRevenue 同口径）
  let cost = 0
  for (const r of data.dailyRecords) {
    for (const item of r.items) {
      const product = data.products.find(p => p.id === item.productId)
      cost += soldCount(item) * (product?.purchasePrice ?? 0)
    }
  }
  const profit = revenue - cost
  const margin = revenue > 0 ? profit / revenue : 0
  const expenseTotal = data.expenses.reduce((s, e) => s + e.amount, 0)
  return {
    revenue: Math.round(revenue * 100) / 100,
    cost: Math.round(cost * 100) / 100,
    profit: Math.round(profit * 100) / 100,
    margin: Math.round(margin * 10000) / 10000,
    expenseTotal: Math.round(expenseTotal * 100) / 100
  }
}

/** 低库存预警清单：在售商品（停售商品不参与预警）库存 < 阈值，按库存升序 */
export interface LowStockItem {
  product: BusinessProduct
  stock: number
}

export function lowStockProducts(data: BusinessData): LowStockItem[] {
  const stock = calcInventory(data.products, data.purchases, data.dailyRecords)
  const threshold = data.settings.lowStockThreshold
  return data.products
    .filter(product => product.active)
    .map(product => ({ product, stock: stock[product.id] ?? 0 }))
    .filter(item => item.stock < threshold)
    .sort((a, b) => a.stock - b.stock)
}

// ===== 排行 / 趋势 =====

export interface ProductRankItem {
  productId: string
  name: string
  unit: string
  sold: number
  revenue: number
}

/** 商品排行：按销售额降序 → 销量降序（剔除无销售的） */
export function calcProductRanking(data: BusinessData): ProductRankItem[] {
  const acc: Record<string, { sold: number; revenue: number }> = {}
  for (const r of data.dailyRecords) {
    for (const item of r.items) {
      const sold = soldCount(item)
      if (sold <= 0) continue
      const product = data.products.find(p => p.id === item.productId)
      if (!product) continue
      const a = (acc[product.id] ??= { sold: 0, revenue: 0 })
      a.sold += sold
      a.revenue = Math.round((a.revenue + sold * product.sellingPrice) * 100) / 100
    }
  }
  return Object.entries(acc)
    .map(([productId, v]) => {
      const product = data.products.find(p => p.id === productId)!
      return { productId, name: product.name, unit: product.unit, sold: v.sold, revenue: v.revenue }
    })
    .sort((a, b) => (b.revenue === a.revenue ? b.sold - a.sold : b.revenue - a.revenue))
}

export interface CategoryRankItem {
  categoryId: string // 'uncategorized' = 未分类
  name: string
  sold: number
  revenue: number
}

/** 分类排行：商品分类维度（未分类商品归 'uncategorized'），按销售额降序 */
export function calcCategoryRanking(data: BusinessData): CategoryRankItem[] {
  const acc: Record<string, { sold: number; revenue: number }> = {}
  for (const r of data.dailyRecords) {
    for (const item of r.items) {
      const sold = soldCount(item)
      if (sold <= 0) continue
      const product = data.products.find(p => p.id === item.productId)
      if (!product) continue
      const catId = product.categoryId ?? 'uncategorized'
      const a = (acc[catId] ??= { sold: 0, revenue: 0 })
      a.sold += sold
      a.revenue = Math.round((a.revenue + sold * product.sellingPrice) * 100) / 100
    }
  }
  return Object.entries(acc)
    .map(([categoryId, v]) => {
      const cat = data.productCategories.find(c => c.id === categoryId)
      return { categoryId, name: cat?.name ?? '未分类', sold: v.sold, revenue: v.revenue }
    })
    .sort((a, b) => (b.revenue === a.revenue ? b.sold - a.sold : b.revenue - a.revenue))
}

export interface TrendPoint {
  date: string // YYYY-MM-DD 升序
  revenue: number
  cost: number
  profit: number
  transactionCount?: number // 当日交易笔数（Σ 各收摊记录 transactionCount）
}

/** 近 days 天趋势（含 endDate 当天，升序）：按收摊记录口径——revenue=当日收摊收入；cost=当日收摊 COGS（售出×进货价，缺失商品计 0）；profit=差；进货/支出不入趋势（无收摊记录日全 0） */
export function calcBusinessTrend(data: BusinessData, endDate: string, days = 30): TrendPoint[] {
  if (!isValidDateKey(endDate) || days <= 0) return []
  const end = new Date(endDate + 'T00:00:00')
  const out: TrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i)
    const key = localDateKey(d)
    const dayRecords = data.dailyRecords.filter(r => r.date === key)
    const revenue = dayRecords.reduce((s, r) => s + r.totalRevenue, 0)
    const cost = dayRecords.reduce((s, r) => s + calcDailyCost(r.items, data.products), 0)
    const count = dayRecords.reduce((s, r) => s + (typeof r.transactionCount === 'number' && Number.isFinite(r.transactionCount) ? r.transactionCount : 0), 0)
    const revenueR = Math.round(revenue * 100) / 100
    const costR = Math.round(cost * 100) / 100
    out.push({ date: key, revenue: revenueR, cost: costR, profit: Math.round((revenueR - costR) * 100) / 100, transactionCount: count })
  }
  return out
}

/** 每日一柱堆叠分段几何（仅非零值生成；loss=亏损悬挂零下红段） */
export interface TrendSegment {
  key: 'revenue' | 'cost' | 'profit' | 'loss' | 'count' | 'count'
  x: number
  y: number
  w: number
  h: number
  value: number
}

/** 每日一柱：柱位 + 堆叠分段 + 单标签（空日无段，组件不渲染标签） */
export interface TrendDayBar {
  date: string
  x: number
  w: number
  segs: TrendSegment[]
  labelX: number
  labelY: number
  labelValue: number
}

/** 柱状图坐标（每日一柱堆叠分色：all=成本琥珀底+利润绿顶（段高和=营业额）、亏损红段悬挂零下、单标签（亏损日显负利润）；nice 天花板+底部 {1,2,5}×10^k、5 网格线、日期刻度） */
export interface TrendBarsScale {
  maxY: number
  minY: number
  zeroY: number
  gridlines: { y: number; label: string }[]
  days: TrendDayBar[]
  dayLabels: { x: number; label: string }[]
  allZero: boolean
}

export type TrendBarMode = 'all' | 'revenue' | 'profit' | 'count'

/** 金额紧凑格式（柱顶标签）：≥1万 → X.X万、≥1千 → X.Xk、其余四舍五入取整 */
export function compactAmount(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 10000) return sign + Math.round(abs / 1000) / 10 + '万'
  if (abs >= 1000) return sign + Math.round(abs / 100) / 10 + 'k'
  return sign + String(Math.round(abs))
}

function niceCeil(v: number): number {
  if (v <= 0) return 0
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  for (const m of [1, 2, 5, 10]) {
    if (m * base >= v) return m * base
  }
  return Math.ceil(v)
}

export function businessTrendBars(
  series: TrendPoint[],
  width: number,
  height: number,
  mode: TrendBarMode,
  pad = 24
): TrendBarsScale | null {
  if (!Array.isArray(series) || series.length === 0 || width <= 0 || height <= 0) return null
  // 尺度口径：all → 营业额天花板 + 利润负值底部；单值模式 → 该值自身 ±
  const values =
    mode === 'all'
      ? series.flatMap(p => [p.revenue, p.profit])
      : mode === 'count'
        ? series.map(p => p.transactionCount ?? 0)
        : series.map(p => (mode === 'revenue' ? p.revenue : p.profit))
  const maxVal = Math.max(0, ...values)
  const minVal = Math.min(0, ...values)
  const allZero = maxVal <= 0 && minVal >= 0
  // nice 天花板/底部 {1,2,5}×10^k（minY 对称取 nice 底）
  const maxY = allZero ? 10 : niceCeil(maxVal)
  const minY = minVal < 0 ? -niceCeil(-minVal) : 0
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  const span = maxY - minY || 1
  const yOf = (v: number) => pad + ((maxY - v) / span) * innerH
  const zeroY = yOf(0)
  const r2 = (v: number) => Math.round(v * 100) / 100
  const gridlines = Array.from({ length: 5 }, (_, i) => {
    const value = minY + (span * i) / 4
    const label = mode === 'count' ? `${Math.round(value)}笔` : formatYuan(value)
    return { y: r2(yOf(value)), label }
  })
  const n = series.length
  const dayW = innerW / n
  // 视觉放大：单柱宽上限从分组槽位 28px 提到 48px（72% 日宽）
  const barW = Math.max(2, Math.min(48, dayW * 0.72))
  const days: TrendDayBar[] = series.map((p, i) => {
    const x = pad + dayW * i + (dayW - barW) / 2
    const segs: TrendSegment[] = []
    if (mode === 'all') {
      if (p.profit >= 0) {
        // 盈利日：成本琥珀段(0→cost) + 利润绿段(cost→revenue)，段高和=营业额
        if (p.cost > 0)
          segs.push({ key: 'cost', x: r2(x), y: r2(yOf(p.cost)), w: r2(barW), h: r2(zeroY - yOf(p.cost)), value: p.cost })
        if (p.profit > 0)
          segs.push({
            key: 'profit',
            x: r2(x),
            y: r2(yOf(p.revenue)),
            w: r2(barW),
            h: r2(yOf(p.cost) - yOf(p.revenue)),
            value: p.profit
          })
      } else {
        // 亏损日：营业额全高成本色 + 亏损红段悬挂零下
        if (p.revenue > 0)
          segs.push({ key: 'cost', x: r2(x), y: r2(yOf(p.revenue)), w: r2(barW), h: r2(zeroY - yOf(p.revenue)), value: p.revenue })
        segs.push({ key: 'loss', x: r2(x), y: r2(zeroY), w: r2(barW), h: r2(yOf(p.profit) - zeroY), value: p.profit })
      }
    } else if (mode === 'revenue') {
      if (p.revenue !== 0)
        segs.push({ key: 'revenue', x: r2(x), y: r2(yOf(p.revenue)), w: r2(barW), h: r2(zeroY - yOf(p.revenue)), value: p.revenue })
    } else if (mode === 'count') {
      const cnt = p.transactionCount ?? 0
      if (cnt !== 0)
        segs.push({ key: 'count', x: r2(x), y: r2(yOf(cnt)), w: r2(barW), h: r2(zeroY - yOf(cnt)), value: cnt })
    } else if (p.profit > 0) {
      segs.push({ key: 'profit', x: r2(x), y: r2(yOf(p.profit)), w: r2(barW), h: r2(zeroY - yOf(p.profit)), value: p.profit })
    } else if (p.profit < 0) {
      segs.push({ key: 'loss', x: r2(x), y: r2(zeroY), w: r2(barW), h: r2(yOf(p.profit) - zeroY), value: p.profit })
    }
    // 单标签：count 模式显笔数；亏损日显负利润，其余显营业额（利润模式显利润）；空日无标签
    const labelValue =
      segs.length === 0
        ? 0
        : mode === 'count'
          ? (p.transactionCount ?? 0)
          : mode === 'revenue' || (mode === 'all' && p.profit >= 0)
            ? p.revenue
            : p.profit
    let labelY = zeroY
    if (segs.length > 0) {
      if (labelValue < 0) {
        const bottom = Math.max(...segs.map(s => s.y + s.h))
        labelY = bottom + 11
      } else {
        const top = Math.min(...segs.map(s => s.y))
        labelY = top - 4
      }
    }
    return { date: p.date, x: r2(x), w: r2(barW), segs, labelX: r2(x + barW / 2), labelY: r2(labelY), labelValue }
  })
  const labelEvery = Math.max(1, Math.ceil(n / 6))
  const dayLabels = series
    .map((p, i) => ({ x: r2(pad + dayW * i + dayW / 2), label: p.date.slice(5) }))
    .filter((_, i) => i % labelEvery === 0 || i === n - 1)
  return { maxY, minY, zeroY: r2(zeroY), gridlines, days, dayLabels, allZero }
}

// ===== P0/P1/P2 新增纯函数 =====

/** 加价率 = (售价 - 进价) / 进价 × 100%（进价 0 → Infinity 用 null 表示无法计算） */
export function calcMarkupRate(sellingPrice: number, purchasePrice: number): number | null {
  if (purchasePrice <= 0) return null
  return Math.round(((sellingPrice - purchasePrice) / purchasePrice) * 10000) / 100
}

/** P0-1：收摊记录结构化商品明细行 */
export interface DailyItemDetail {
  productId: string
  name: string
  unit: string
  broughtOut: number
  remaining: number
  loss: number
  sold: number
  sellingPrice: number
  subtotal: number
  deleted: boolean
}

/** 计算收摊记录的结构化商品明细行列表 */
export function calcDailyItemDetails(
  record: BusinessDailyRecord,
  products: BusinessProduct[]
): DailyItemDetail[] {
  return record.items.map(item => {
    const product = findProduct(products, item.productId)
    const sold = soldCount(item)
    const sellingPrice = product?.sellingPrice ?? 0
    return {
      productId: item.productId,
      name: product?.name ?? '（已删除商品）',
      unit: product?.unit ?? '件',
      broughtOut: item.broughtOut,
      remaining: item.remaining,
      loss: item.loss,
      sold,
      sellingPrice,
      subtotal: Math.round(sold * sellingPrice * 100) / 100,
      deleted: !product
    }
  })
}

/** P1-1：分类→商品树状排行节点 */
export interface CategoryProductRankNode {
  categoryId: string
  categoryName: string
  categoryRevenue: number
  categorySold: number
  products: ProductRankItem[]
}

/** 计算分类→商品树状排行（分类按销售额降序，商品取 top N） */
export function calcCategoryProductRanking(data: BusinessData, topN = 5): CategoryProductRankNode[] {
  const catRank = calcCategoryRanking(data)
  const prodRank = calcProductRanking(data)
  // 按分类 id 归组商品排行
  const byCat: Record<string, ProductRankItem[]> = {}
  for (const p of prodRank) {
    const product = data.products.find(pr => pr.id === p.productId)
    const catId = product?.categoryId ?? 'uncategorized'
    ;(byCat[catId] ??= []).push(p)
  }
  return catRank.map(cat => ({
    categoryId: cat.categoryId,
    categoryName: cat.name,
    categoryRevenue: cat.revenue,
    categorySold: cat.sold,
    products: (byCat[cat.categoryId] ?? []).slice(0, topN)
  }))
}

/** P2-1：支出趋势点 */
export interface ExpenseTrendPoint {
  date: string
  amount: number
}

/** 近 days 天支出趋势（含 endDate 当天，升序） */
export function calcExpenseTrend(data: BusinessData, endDate: string, days = 30): ExpenseTrendPoint[] {
  if (!isValidDateKey(endDate) || days <= 0) return []
  const end = new Date(endDate + 'T00:00:00')
  const out: ExpenseTrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i)
    const key = localDateKey(d)
    const amount = data.expenses
      .filter(e => e.date === key)
      .reduce((s, e) => s + e.amount, 0)
    out.push({ date: key, amount: Math.round(amount * 100) / 100 })
  }
  return out
}

/** P2-1：支出分类占比 */
export interface ExpenseCategoryBreakdown {
  categoryId: string
  name: string
  amount: number
  percent: number // 0-100
}

/** 计算各支出分类金额占比 */
export function calcExpenseCategoryBreakdown(data: BusinessData): ExpenseCategoryBreakdown[] {
  const total = data.expenses.reduce((s, e) => s + e.amount, 0)
  const byCat: Record<string, number> = {}
  for (const e of data.expenses) {
    byCat[e.categoryId] = (byCat[e.categoryId] ?? 0) + e.amount
  }
  return Object.entries(byCat)
    .map(([categoryId, amount]) => {
      const cat = data.expenseCategories.find(c => c.id === categoryId)
      return {
        categoryId,
        name: cat?.name ?? '未知',
        amount: Math.round(amount * 100) / 100,
        percent: total > 0 ? Math.round((amount / total) * 10000) / 100 : 0
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

/** P2-1：分类营业额占比 */
export interface CategoryRevenueBreakdown {
  categoryId: string
  name: string
  revenue: number
  percent: number // 0-100
}

/** 计算各商品分类营业额占比 */
export function calcCategoryRevenueBreakdown(data: BusinessData): CategoryRevenueBreakdown[] {
  const catRank = calcCategoryRanking(data)
  const total = catRank.reduce((s, c) => s + c.revenue, 0)
  return catRank.map(cat => ({
    categoryId: cat.categoryId,
    name: cat.name,
    revenue: cat.revenue,
    percent: total > 0 ? Math.round((cat.revenue / total) * 10000) / 100 : 0
  }))
}

/** P2-2：商品聚合摘要 */
export interface ProductSummary {
  product: BusinessProduct | null
  totalPurchased: number
  totalBroughtOut: number
  totalSold: number
  totalLoss: number
  currentStock: number
  totalRevenue: number
  totalCost: number
  totalProfit: number
  recentPurchases: BusinessPurchase[]
  recentDailyRecords: BusinessDailyRecord[]
}

/** 计算商品聚合摘要（进货/带出/售出/损耗/库存/营业额/成本/利润 + 最近记录） */
export function calcProductSummary(data: BusinessData, productId: string): ProductSummary {
  const product = data.products.find(p => p.id === productId) ?? null
  const stock = calcInventory(data.products, data.purchases, data.dailyRecords)
  const purchases = data.purchases.filter(p => p.productId === productId)
  const dailyRecords = data.dailyRecords.filter(r => r.items.some(it => it.productId === productId))

  let totalPurchased = 0
  for (const p of purchases) totalPurchased += p.quantity

  let totalBroughtOut = 0
  let totalSold = 0
  let totalLoss = 0
  let totalRevenue = 0
  let totalCost = 0
  for (const r of dailyRecords) {
    for (const item of r.items) {
      if (item.productId !== productId) continue
      totalBroughtOut += item.broughtOut
      totalLoss += item.loss
      const sold = soldCount(item)
      totalSold += sold
      totalRevenue = Math.round((totalRevenue + sold * (product?.sellingPrice ?? 0)) * 100) / 100
      totalCost = Math.round((totalCost + sold * (product?.purchasePrice ?? 0)) * 100) / 100
    }
  }

  const recentPurchases = sortPurchases(purchases).slice(0, 5)
  const recentDailyRecords = sortDailyRecords(dailyRecords).slice(0, 5)

  return {
    product,
    totalPurchased,
    totalBroughtOut,
    totalSold,
    totalLoss,
    currentStock: stock[productId] ?? 0,
    totalRevenue,
    totalCost,
    totalProfit: Math.round((totalRevenue - totalCost) * 100) / 100,
    recentPurchases,
    recentDailyRecords
  }
}

/** P1-2：库存溯源明细（某商品的进货记录 + 收摊带出记录） */
export interface InventorySourcePurchase {
  type: 'purchase'
  id: string
  date: string
  quantity: number
  unitPrice: number
  total: number
}

export interface InventorySourceDaily {
  type: 'daily'
  id: string
  date: string
  broughtOut: number
  remaining: number
  loss: number
  sold: number
}

export type InventorySource = InventorySourcePurchase | InventorySourceDaily

/** 获取某商品的库存溯源记录（按日期降序混合排列） */
export function calcInventorySources(
  productId: string,
  purchases: BusinessPurchase[],
  dailyRecords: BusinessDailyRecord[]
): InventorySource[] {
  const sources: InventorySource[] = []
  for (const p of purchases) {
    if (p.productId !== productId) continue
    sources.push({ type: 'purchase', id: p.id, date: p.date, quantity: p.quantity, unitPrice: p.unitPrice, total: p.total })
  }
  for (const r of dailyRecords) {
    const item = r.items.find(it => it.productId === productId)
    if (!item) continue
    sources.push({
      type: 'daily',
      id: r.id,
      date: r.date,
      broughtOut: item.broughtOut,
      remaining: item.remaining,
      loss: item.loss,
      sold: soldCount(item)
    })
  }
  return sources.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
