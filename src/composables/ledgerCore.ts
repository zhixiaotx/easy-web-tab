// 工作台记账本纯逻辑模块：normalizeLedgerData 归一化 → calcMonthlyStats 月度统计。
// 运行时依赖仅 DEFAULT_LEDGER_CATEGORIES（node --experimental-strip-types 可运行）；其余类型全部 type-only。
import { DEFAULT_LEDGER_CATEGORIES } from '../types/index.ts'
import type { LedgerCategory, LedgerData, LedgerEntry } from '../types'

/** 本地日期 YYYY-MM-DD（独立实现，与 todoCore 无依赖；不能用 toISOString——那是 UTC 会偏一天）。 */
export function localDateStr(d?: Date): string {
  const base = d ?? new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`
}

/** 合法日期格式：'YYYY-MM-DD'。 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 空记账本：内置分类逐个展开拷贝 + 空流水。数组 spread 仅拷贝数组本身（元素仍是共享引用），
 *  故再对每个元素 {...c} 克隆一层——否则调用方改返回值的 categories[i].name/type 会污染常量。 */
export function emptyLedgerData(): LedgerData {
  return { categories: [...DEFAULT_LEDGER_CATEGORIES].map(c => ({ ...c })), entries: [] }
}

/** 单条流水归一化：脏数据吞掉不抛错。amount 负数钳 0 / NaN→0 / 保留 2 位小数；date 非法回落当天。 */
export function normalizeLedgerEntry(raw: any | undefined): LedgerEntry {
  const src = raw ?? {}
  const amountNum = Number(src.amount)
  const nowIso = new Date().toISOString()
  const note = typeof src.note === 'string' ? src.note : undefined
  return {
    id: typeof src.id === 'string' && src.id ? src.id : `ld_${Date.now()}`,
    date: typeof src.date === 'string' && DATE_RE.test(src.date) ? src.date : localDateStr(),
    categoryId: typeof src.categoryId === 'string' ? src.categoryId : '',
    amount: Math.round(Math.max(0, Number.isNaN(amountNum) ? 0 : amountNum) * 100) / 100,
    ...(note !== undefined ? { note } : {}),
    createdAt: typeof src.createdAt === 'string' ? src.createdAt : nowIso,
    updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : nowIso
  }
}

/** 分类归一化：内置 8 组按 id 对齐（名称/类型/isBuiltIn 恒取内置常量值防脏改，缺则补回）；自定义组清洗。 */
function normalizeCategories(raw: LedgerCategory[] | undefined): LedgerCategory[] {
  const builtinIds = new Set(DEFAULT_LEDGER_CATEGORIES.map(c => c.id))
  const seen = new Set<string>()
  const result: LedgerCategory[] = []
  const now = Date.now()

  // 内置分类：按常量顺序展开，脏数据一律恢复内置值
  for (const b of DEFAULT_LEDGER_CATEGORIES) {
    result.push({ id: b.id, name: b.name, type: b.type, isBuiltIn: true })
    seen.add(b.id)
  }

  // 自定义分类：isBuiltIn!==true 或不在内置 id 集合的都按自定义处理
  let customIndex = 0
  const rawList = Array.isArray(raw) ? raw : []
  for (const c of rawList) {
    if (!c || typeof c !== 'object') continue
    const idRaw = typeof c.id === 'string' ? c.id : ''
    const isBuiltinAligned = idRaw !== '' && builtinIds.has(idRaw) && c.isBuiltIn === true
    if (isBuiltinAligned) continue // 已由内置对齐处理，跳过避免重复
    const name = typeof c.name === 'string' ? c.name.trim() : ''
    if (!name) continue // 空名剔除
    let id = idRaw || `cat_${now}`
    if (seen.has(id)) id = `cat_${now}_${customIndex}` // 与内置/其他自定义撞 id → 换新
    seen.add(id)
    result.push({ id, name, type: c.type === 'income' ? 'income' : 'expense', isBuiltIn: false })
    customIndex++
  }

  return result
}

/** 整库归一化：categories 内置对齐 + 自定义清洗，entries 逐条归一；返回全新结构，不 mutate 入参。 */
export function normalizeLedgerData(raw: Partial<LedgerData> | undefined): LedgerData {
  const src = raw ?? {}
  return {
    categories: normalizeCategories(src.categories),
    entries: Array.isArray(src.entries) ? src.entries.map(e => normalizeLedgerEntry(e)) : []
  }
}

/** 月度键：'YYYY-MM'，取 dateStr 前 7 位。 */
export function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7)
}

export interface MonthlyStats {
  income: number
  expense: number
  balance: number
  expenseCount: number
  expenseRatio: number | null
  byCategory: { categoryId: string; total: number; percent: number }[]
}

/** 按 id 查找分类（找不到 → undefined，调用方归入 unknown 支出）。 */
export function findCategory(categories: LedgerCategory[], id: string): LedgerCategory | undefined {
  return categories.find(c => c.id === id)
}

/**
 * 月度统计：按 monthKey 过滤 → 收入/支出/结余/支出笔数/支出占比/分类占比。
 * 分类查不到 → 计入支出（byCategory 用 categoryId='unknown'）；expense===0 → byCategory 空。
 */
export function calcMonthlyStats(entries: LedgerEntry[], monthKey: string, categories: LedgerCategory[]): MonthlyStats {
  let income = 0
  let expense = 0
  let expenseCount = 0
  const byCat = new Map<string, number>()

  for (const e of entries) {
    if (monthKeyOf(e.date) !== monthKey) continue
    const cat = findCategory(categories, e.categoryId)
    if (!cat) {
      expense += e.amount
      expenseCount++
      byCat.set('unknown', (byCat.get('unknown') ?? 0) + e.amount)
      continue
    }
    if (cat.type === 'income') {
      income += e.amount
    } else {
      expense += e.amount
      expenseCount++
      byCat.set(cat.id, (byCat.get(cat.id) ?? 0) + e.amount)
    }
  }

  const expenseRatio = income > 0 ? Math.round((expense / income) * 10000) / 10000 : null
  const byCategory =
    expense > 0
      ? [...byCat.entries()]
          .filter(([, total]) => total > 0)
          .map(([categoryId, total]) => ({
            categoryId,
            total,
            percent: Math.round((total / expense) * 10000) / 10000
          }))
      : []

  return { income, expense, balance: income - expense, expenseCount, expenseRatio, byCategory }
}

/** 存款统计：从起始月到 upToMonthKey 的每月结余累加（收入 - 支出，未知分类计支出，只累计 ≤ upToMonthKey 的月份）。
 *  RED 占位实现（T15/T16 红）：恒返 0，真实累计逻辑见 T3。 */
export function calcDepositTotal(_entries: LedgerEntry[], _upToMonthKey: string, _categories: LedgerCategory[]): number {
  return 0
}

/** 金额格式化：固定 2 位小数。 */
export function formatYuan(n: number): string {
  return n.toFixed(2)
}

/** 收入分类（filter 返回新数组，不 mutate 入参）。 */
export function incomeCategories(categories: LedgerCategory[]): LedgerCategory[] {
  return categories.filter(c => c.type === 'income')
}

/** 支出分类（filter 返回新数组，不 mutate 入参）。 */
export function expenseCategories(categories: LedgerCategory[]): LedgerCategory[] {
  return categories.filter(c => c.type === 'expense')
}
