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
    settings: { stallName: '', lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD }
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
  const out: BusinessSettings = { stallName: '', lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD }
  if (raw === null || typeof raw !== 'object') return out
  const s = raw as Record<string, unknown>
  if (typeof s.stallName === 'string') out.stallName = s.stallName.trim().slice(0, 30)
  if (typeof s.lowStockThreshold === 'number' && Number.isFinite(s.lowStockThreshold)) {
    out.lowStockThreshold = Math.max(0, Math.floor(s.lowStockThreshold))
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

/** 总统计：营业额 = Σ日记录收入；成本 = Σ进货总额 + Σ支出；利润/毛利率 */
export interface BusinessStats {
  revenue: number
  cost: number
  profit: number
  margin: number // 0-1 小数（营业额 0 → 0）
}

export function calcBusinessStats(data: BusinessData): BusinessStats {
  const revenue = data.dailyRecords.reduce((s, r) => s + r.totalRevenue, 0)
  const cost = data.purchases.reduce((s, p) => s + p.total, 0) + data.expenses.reduce((s, e) => s + e.amount, 0)
  const profit = revenue - cost
  const margin = revenue > 0 ? profit / revenue : 0
  return {
    revenue: Math.round(revenue * 100) / 100,
    cost: Math.round(cost * 100) / 100,
    profit: Math.round(profit * 100) / 100,
    margin: Math.round(margin * 10000) / 10000
  }
}

/** 低库存预警清单：库存 < 阈值，按库存升序（含停售商品，标注 active 供 UI 区分） */
export interface LowStockItem {
  product: BusinessProduct
  stock: number
}

export function lowStockProducts(data: BusinessData): LowStockItem[] {
  const stock = calcInventory(data.products, data.purchases, data.dailyRecords)
  const threshold = data.settings.lowStockThreshold
  return data.products
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
}

/** 近 days 天趋势（含 endDate 当天，升序）：revenue=当日收摊收入；cost=当日进货+支出；profit=差 */
export function calcBusinessTrend(data: BusinessData, endDate: string, days = 30): TrendPoint[] {
  if (!isValidDateKey(endDate) || days <= 0) return []
  const end = new Date(endDate + 'T00:00:00')
  const out: TrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i)
    const key = localDateKey(d)
    const revenue = data.dailyRecords.filter(r => r.date === key).reduce((s, r) => s + r.totalRevenue, 0)
    const cost =
      data.purchases.filter(p => p.date === key).reduce((s, p) => s + p.total, 0) +
      data.expenses.filter(e => e.date === key).reduce((s, e) => s + e.amount, 0)
    const revenueR = Math.round(revenue * 100) / 100
    const costR = Math.round(cost * 100) / 100
    out.push({ date: key, revenue: revenueR, cost: costR, profit: Math.round((revenueR - costR) * 100) / 100 })
  }
  return out
}

/** 折线图坐标（仿 ledger trendChartScale：nice 天花板 {1,2,5}×10^k、5 网格线、逐点坐标、日期刻度） */
export interface TrendChartScale {
  maxY: number
  gridlines: { y: number; label: string }[]
  points: { date: string; revX: number; revY: number; profitX: number; profitY: number }[]
  dayLabels: { x: number; label: string }[]
  allZero: boolean
}

export function businessTrendScale(series: TrendPoint[], width: number, height: number, pad = 24): TrendChartScale | null {
  if (series.length === 0 || width <= 0 || height <= 0) return null
  const maxVal = Math.max(0, ...series.flatMap(p => [p.revenue, p.profit]))
  const allZero = maxVal <= 0
  // nice 天花板 {1,2,5}×10^k
  let maxY = 0
  if (!allZero) {
    const exp = Math.floor(Math.log10(maxVal))
    const base = Math.pow(10, exp)
    for (const m of [1, 2, 5, 10]) {
      if (m * base >= maxVal) {
        maxY = m * base
        break
      }
    }
    if (maxY === 0) maxY = Math.ceil(maxVal)
  } else {
    maxY = 10
  }
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  const gridlines = Array.from({ length: 5 }, (_, i) => {
    const frac = i / 4
    const y = pad + (1 - frac) * innerH
    return { y: Math.round(y * 100) / 100, label: formatYuan((maxY * frac) * 1) }
  })
  const n = series.length
  const stepX = n > 1 ? innerW / (n - 1) : 0
  const xOf = (i: number) => (n > 1 ? pad + i * stepX : width / 2)
  const yOf = (v: number) => pad + (1 - Math.min(v, maxY) / maxY) * innerH
  const points = series.map((p, i) => ({
    date: p.date,
    revX: Math.round(xOf(i) * 100) / 100,
    revY: Math.round(yOf(p.revenue) * 100) / 100,
    profitX: Math.round(xOf(i) * 100) / 100,
    profitY: Math.round(yOf(p.profit) * 100) / 100
  }))
  const labelEvery = Math.max(1, Math.ceil(n / 6))
  const dayLabels = series
    .map((p, i) => ({ x: Math.round(xOf(i) * 100) / 100, label: p.date.slice(5) }))
    .filter((_, i) => i % labelEvery === 0 || i === series.length - 1)
  return { maxY, gridlines, points, dayLabels, allZero }
}
