// 学生工作台阅读记录纯逻辑模块。
// 归一化（幂等，兼容裸数组）+ 日期范围筛选 + 排序 + 统计。
// 零 vue/pinia 运行时依赖，纯函数。

import type { StudentReadingData, StudentReadingEntry } from '@/types'

/** 阅读 id 前缀 */
export const READING_ID_PREFIX = 'rd_'

function genId(): string {
  return `${READING_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isDateStr(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v)
}

function clampInt(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return undefined
  const i = Math.floor(n)
  if (i < min || i > max) return undefined
  return i
}

/** 空阅读数据 */
export function emptyReadingData(): StudentReadingData {
  return { entries: [] }
}

export function normalizeReadingEntry(raw: unknown): StudentReadingEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  const bookTitle = typeof e.bookTitle === 'string' ? e.bookTitle.trim() : ''
  if (!bookTitle) return null
  const pages = clampInt(e.pages, 1, 999)
  if (pages === undefined) return null
  const durationMin = clampInt(e.durationMin, 1, 480)
  if (durationMin === undefined) return null
  const date = isDateStr(e.date) ? e.date : ''
  if (!date) return null
  const now = isoNow()
  const out: StudentReadingEntry = {
    id: typeof e.id === 'string' && e.id !== '' ? e.id : genId(),
    bookTitle: Array.from(bookTitle).slice(0, 50).join(''),
    pages,
    durationMin,
    date,
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : now,
    updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : now
  }
  if (typeof e.impression === 'string' && e.impression.trim()) {
    out.impression = Array.from(e.impression).slice(0, 2000).join('')
  }
  if (e.parentSigned === true) {
    out.parentSigned = true
    if (typeof e.signedAt === 'string') out.signedAt = e.signedAt
    else out.signedAt = now
  }
  return out
}

export function normalizeReadingData(raw: unknown): StudentReadingData {
  if (!raw || typeof raw !== 'object') return emptyReadingData()
  const src = raw as Record<string, unknown>
  if (Array.isArray(src.entries)) {
    return { entries: src.entries.map(normalizeReadingEntry).filter((e): e is StudentReadingEntry => e !== null) }
  }
  if (Array.isArray(raw)) {
    return { entries: (raw as unknown[]).map(normalizeReadingEntry).filter((e): e is StudentReadingEntry => e !== null) }
  }
  return emptyReadingData()
}

/** 排序：date 降序 → createdAt 降序（不改入参） */
export function sortReading(entries: StudentReadingEntry[]): StudentReadingEntry[] {
  return [...entries].sort((a, b) => {
    const d = b.date.localeCompare(a.date)
    if (d !== 0) return d
    return b.createdAt.localeCompare(a.createdAt)
  })
}

/** 日期范围筛选（包含两端，'YYYY-MM-DD' 字符串比较） */
export function filterByDateRange(entries: StudentReadingEntry[], start: string, end: string): StudentReadingEntry[] {
  return entries.filter(e => e.date >= start && e.date <= end)
}

export interface ReadingStats {
  totalEntries: number
  totalPages: number
  totalDurationMin: number
  distinctDays: number
  avgPagesPerDay: number
  avgDurationPerEntry: number
}

/** 统计：总条数/总页数/总时长/独立天数/日均页数/均次时长 */
export function calcReadingStats(entries: StudentReadingEntry[]): ReadingStats {
  const totalEntries = entries.length
  if (totalEntries === 0) {
    return { totalEntries: 0, totalPages: 0, totalDurationMin: 0, distinctDays: 0, avgPagesPerDay: 0, avgDurationPerEntry: 0 }
  }
  const totalPages = entries.reduce((s, e) => s + e.pages, 0)
  const totalDurationMin = entries.reduce((s, e) => s + e.durationMin, 0)
  const distinctDays = new Set(entries.map(e => e.date)).size
  return {
    totalEntries,
    totalPages,
    totalDurationMin,
    distinctDays,
    avgPagesPerDay: distinctDays > 0 ? Math.round(totalPages / distinctDays) : 0,
    avgDurationPerEntry: Math.round(totalDurationMin / totalEntries)
  }
}

/** 时长格式化（分钟 → "X 小时 Y 分钟"） */
export function formatDuration(min: number): string {
  if (min < 60) return `${min} 分钟`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`
}
