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

/** 上一月键：'YYYY-MM' → 前一月（跨年回退，如 '2026-01' → '2025-12'）。 */
export function prevMonthKeyOf(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 每月自动复制的固定分类 id（内置不可删改：工资=收入、房贷=支出）。 */
export const AUTO_COPY_CATEGORY_IDS = ['salary', 'mortgage'] as const

/** 自动复制草稿：目标月缺该分类记录时待补入的流水（date=目标月-01，amount=上月同分类最新一条金额）。 */
export interface AutoCopyDraft {
  date: string
  categoryId: string
  amount: number
}

/**
 * 每月自动复制计划：目标月（如当前月）缺工资/房贷时，若上月存在同分类记录，
 * 生成复制草稿（金额取上月该分类 date 最新一条）。幂等：目标月已有该分类 → 跳过；
 * 上月无该分类记录 → 跳过（不跨月回溯）。纯函数，不 mutate 入参。
 */
export function planAutoCopy(entries: LedgerEntry[], targetMonthKey: string): AutoCopyDraft[] {
  const prevKey = prevMonthKeyOf(targetMonthKey)
  const drafts: AutoCopyDraft[] = []
  for (const categoryId of AUTO_COPY_CATEGORY_IDS) {
    if (entries.some(e => monthKeyOf(e.date) === targetMonthKey && e.categoryId === categoryId)) continue
    const prev = entries
      .filter(e => monthKeyOf(e.date) === prevKey && e.categoryId === categoryId)
      .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))
    if (prev.length === 0) continue
    drafts.push({ date: `${targetMonthKey}-01`, categoryId, amount: prev[0].amount })
  }
  return drafts
}

/**
 * 下次发薪日：取 categoryId 为 salary（AUTO_COPY_CATEGORY_IDS 中的 'salary'）的最近一笔记录的 day-of-month，
 * 下一个发薪日 = 本月该日（today 的日序 ≤ 发薪日则本月，否则下月）。返回 'YYYY-MM-DD'；
 * 31 日在小月/2 月按当月天数钳制（new Date(year, month+1, 0).getDate()）。无 salary 记录返回 null。
 * 纯函数，不 mutate 入参；日期推算唯一来源，组件禁止内联重算。
 */
export function nextPayday(entries: LedgerEntry[], today: string): string | null {
  if (!DATE_RE.test(today)) return null
  const salaryId = AUTO_COPY_CATEGORY_IDS.find(id => id === 'salary') ?? 'salary'
  const salaryEntries = entries.filter(e => e.categoryId === salaryId)
  if (salaryEntries.length === 0) return null
  // 最近一笔（date 降序，同日取 createdAt 新者，同 planAutoCopy 的取最近语义）
  const latest = salaryEntries.sort((a, b) =>
    a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1
  )[0]
  const payDay = Number(latest.date.slice(8, 10))
  if (!Number.isInteger(payDay) || payDay < 1 || payDay > 31) return null

  const [year, month] = today.split('-').map(Number)
  const todayDay = Number(today.slice(8, 10))
  // 本月（month-1）或下月（month）的月份序号（0-11），下月跨年自然进位
  const targetSeq = month - 1 + (todayDay > payDay ? 1 : 0)
  const targetYear = year + Math.floor(targetSeq / 12)
  const targetMonth = ((targetSeq % 12) + 12) % 12
  // 31 日在小月/2 月按当月实际天数钳制
  const day = Math.min(payDay, new Date(targetYear, targetMonth + 1, 0).getDate())
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
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

/** 存款统计：从起始月到 upToMonthKey 的每月结余累加（收入 - 支出，未知分类计支出，只累计 ≤ upToMonthKey 的月份）。 */
export function calcDepositTotal(entries: LedgerEntry[], upToMonthKey: string, categories: LedgerCategory[]): number {
  let income = 0
  let expense = 0

  for (const e of entries) {
    if (monthKeyOf(e.date) > upToMonthKey) continue
    const cat = findCategory(categories, e.categoryId)
    if (!cat || cat.type !== 'income') {
      expense += e.amount
      continue
    }
    income += e.amount
  }

  return Math.round((income - expense) * 100) / 100
}

/** 金额格式化：固定 2 位小数。 */
export function formatYuan(n: number): string {
  return n.toFixed(2)
}

/** 敏感金额/统计掩码占位：隐藏态统一显示固定 * 串（长度与真实值无关）。 */
export const MASKED_TEXT = '****'

/** 敏感值显示：hidden=true 时返回 MASKED_TEXT，否则原样返回。纯函数，组件/面板所有掩码点统一走它。 */
export function maskOrReveal(raw: string, hidden: boolean): string {
  return hidden ? MASKED_TEXT : raw
}

/** 收入分类（filter 返回新数组，不 mutate 入参）。 */
export function incomeCategories(categories: LedgerCategory[]): LedgerCategory[] {
  return categories.filter(c => c.type === 'income')
}

/** 支出分类（filter 返回新数组，不 mutate 入参）。 */
export function expenseCategories(categories: LedgerCategory[]): LedgerCategory[] {
  return categories.filter(c => c.type === 'expense')
}

/** 月度趋势序列：窗口内某个月的收入/支出（金额保留 2 位小数）。 */
export interface TrendMonth {
  monthKey: string
  income: number
  expense: number
}

/**
 * 月度趋势序列：以 endMonthKey 为末月向前取 months 个月（跨年回退走 prevMonthKeyOf），
 * 缺失月 0 填充，未知分类计入支出（与 calcMonthlyStats 同语义）。endMonthKey 非法 → []。
 * 纯函数，不 mutate 入参。
 */
export function calcTrendSeries(
  entries: LedgerEntry[],
  endMonthKey: string,
  categories: LedgerCategory[],
  months = 6
): TrendMonth[] {
  if (!/^\d{4}-\d{2}$/.test(endMonthKey)) return []
  // 升序月份键：末月出发回退 months-1 次
  const keys: string[] = [endMonthKey]
  for (let i = 1; i < months; i++) keys.unshift(prevMonthKeyOf(keys[0]))
  // 单次遍历分桶（Map 存 月键 → 收入/支出）
  const buckets = new Map<string, { income: number; expense: number }>()
  for (const e of entries) {
    const mk = monthKeyOf(e.date)
    const b = buckets.get(mk) ?? { income: 0, expense: 0 }
    const cat = findCategory(categories, e.categoryId)
    if (cat && cat.type === 'income') b.income += e.amount
    else b.expense += e.amount
    buckets.set(mk, b)
  }
  return keys.map(key => {
    const b = buckets.get(key)
    return {
      monthKey: key,
      income: b ? Math.round(b.income * 100) / 100 : 0,
      expense: b ? Math.round(b.expense * 100) / 100 : 0
    }
  })
}

/** 趋势柱：某月某类（income/expense）的坐标 + 值。 */
export interface TrendChartBar {
  monthKey: string
  kind: 'income' | 'expense'
  x: number
  y: number
  height: number
  value: number
}

/** 趋势柱状图缩放结果：bars + 柱宽 + 顶值 + 网格线 + 月标签（全部确定性纯计算）。 */
export interface TrendChartScale {
  bars: TrendChartBar[]
  barWidth: number
  maxY: number
  gridlines: { y: number; label: string }[]
  monthLabels: { x: number; label: string; monthKey: string }[]
}

/**
 * 趋势柱状图坐标：series 全 0 → null；maxY 取 {1,2,5}×10^k 的 nice 天花板（maxVal<1 → 1）；
 * 每月两柱（income 先于 expense）；网格线 5 条升序 0..maxY；月标签取组中心。
 * 纯函数，不 mutate 入参；组件/面板禁止重算坐标。
 */
export function trendChartScale(
  series: TrendMonth[],
  width: number,
  height: number,
  pad = 24
): TrendChartScale | null {
  const months = series.length
  let maxVal = 0
  for (const m of series) {
    if (m.income > maxVal) maxVal = m.income
    if (m.expense > maxVal) maxVal = m.expense
  }
  if (months === 0 || maxVal === 0) return null
  // nice 天花板：{1,2,5}×10^k，仍不够则进位 10^(k+1)
  const k = Math.floor(Math.log10(maxVal))
  const maxY =
    maxVal < 1 ? 1 : [1, 2, 5, 10].map(s => s * Math.pow(10, k)).find(s => s >= maxVal) ?? Math.pow(10, k + 1)
  const inner = height - 2 * pad
  const groupW = (width - 2 * pad) / months
  const barWidth = groupW * 0.3
  const gap = groupW * 0.12
  const round2 = (n: number) => Math.round(n * 100) / 100

  const bars: TrendChartBar[] = []
  for (let i = 0; i < months; i++) {
    const m = series[i]
    const groupX = pad + groupW * i + (groupW - 2 * barWidth - gap) / 2
    const values: [number, TrendChartBar['kind']][] = [
      [m.income, 'income'],
      [m.expense, 'expense']
    ]
    for (let j = 0; j < values.length; j++) {
      const [v, kind] = values[j]
      bars.push({
        monthKey: m.monthKey,
        kind,
        x: round2(groupX + j * (barWidth + gap)),
        y: round2(pad + (1 - v / maxY) * inner),
        height: round2((v / maxY) * inner),
        value: v
      })
    }
  }

  // 网格线 5 条：升序 0..maxY（底部基线 → 顶部），label 取网格值（整数去小数、非整数 1 位小数）
  const gridlines: TrendChartScale['gridlines'] = []
  for (let i = 4; i >= 0; i--) {
    const value = ((4 - i) / 4) * maxY
    gridlines.push({
      y: pad + (i / 4) * inner,
      label: Number.isInteger(value) ? String(value) : value.toFixed(1)
    })
  }

  // 月标签：组中心 x，label = 月键
  const monthLabels: TrendChartScale['monthLabels'] = series.map((m, i) => ({
    x: pad + groupW * i + groupW / 2,
    label: m.monthKey,
    monthKey: m.monthKey
  }))

  return { bars, barWidth, maxY, gridlines, monthLabels }
}

/** 趋势柱状图分类配色：8 个暗色安全 hex 色（供图表渲染取色）。 */
export const LEDGER_CATEGORY_COLORS: readonly string[] = [
  '#10b981',
  '#8b5cf6',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316'
]
