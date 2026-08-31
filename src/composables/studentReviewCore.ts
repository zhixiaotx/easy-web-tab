// 学生工作台复习计划纯逻辑模块（艾宾浩斯间隔复习）。
// 归一化（幂等，兼容裸数组）+ 学科筛选 + 下一复习日自动计算 + 排序 + 统计。
// 间隔序列来自 types 的 REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30] 共 6 阶段。
// 零 vue/pinia 运行时依赖，纯函数。

import {
  REVIEW_INTERVALS,
  REVIEW_MAX_STAGE,
  type StudentReviewData,
  type StudentReviewItem
} from '@/types'

/** 复习条目 id 前缀 */
export const REVIEW_ID_PREFIX = 'rv_'

function genId(): string {
  return `${REVIEW_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
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

/**
 * 计算从 learnDate 起，stage 阶段后的下一复习日（'YYYY-MM-DD'）。
 * stage 1..REVIEW_MAX_STAGE；非法 stage 回退 null。
 * learnDate 必须是合法 'YYYY-MM-DD'；否则回退 null。
 */
export function calcNextReviewDate(learnDate: string, stage: number): string | null {
  if (!isDateStr(learnDate)) return null
  const stageIdx = clampInt(stage, 1, REVIEW_MAX_STAGE)
  if (stageIdx === undefined) return null
  const intervalDays = REVIEW_INTERVALS[stageIdx - 1]
  const [y,m,d] = learnDate.split("-").map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCDate(base.getUTCDate() + intervalDays)
  return base.toISOString().slice(0, 10)
}
/** 空复习数据 */
export function emptyReviewData(): StudentReviewData {
  return { entries: [] }
}

/** 归一化单个复习条目：subject/knowledge/learnDate 必填；nextReviewDate 自动重算（防外部篡改） */
export function normalizeReviewItem(raw: unknown): StudentReviewItem | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const subject = typeof r.subject === 'string' ? r.subject.trim() : ''
  const knowledge = typeof r.knowledge === 'string' ? r.knowledge.trim() : ''
  if (!subject || !knowledge) return null
  const learnDate = isDateStr(r.learnDate) ? r.learnDate : ''
  if (!learnDate) return null
  const rawStage = clampInt(r.stage, 1, REVIEW_MAX_STAGE)
  const stage = rawStage === undefined ? 1 : rawStage
  const nextReviewDate = calcNextReviewDate(learnDate, stage) ?? learnDate
  const now = isoNow()
  const out: StudentReviewItem = {
    id: typeof r.id === 'string' && r.id !== '' ? r.id : genId(),
    subject,
    knowledge: Array.from(knowledge).slice(0, 200).join(''),
    learnDate,
    stage,
    nextReviewDate,
    mastered: r.mastered === true,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : now
  }
  if (typeof r.source === 'string' && r.source.trim()) {
    out.source = Array.from(r.source.trim()).slice(0, 50).join('')
  }
  return out
}

/** 归一化复习数据（幂等；兼容裸数组） */
export function normalizeReviewData(raw: unknown): StudentReviewData {
  if (!raw || typeof raw !== 'object') return emptyReviewData()
  const src = raw as Record<string, unknown>
  if (Array.isArray(src.entries)) {
    return {
      entries: src.entries
        .map(normalizeReviewItem)
        .filter((r): r is StudentReviewItem => r !== null)
    }
  }
  if (Array.isArray(raw)) {
    return {
      entries: (raw as unknown[])
        .map(normalizeReviewItem)
        .filter((r): r is StudentReviewItem => r !== null)
    }
  }
  return emptyReviewData()
}

/** 排序：未掌握优先 → nextReviewDate 升序 → createdAt 降序（不改入参） */
export function sortReview(entries: StudentReviewItem[]): StudentReviewItem[] {
  return [...entries].sort((a, b) => {
    if (a.mastered !== b.mastered) return a.mastered ? 1 : -1
    const d = a.nextReviewDate.localeCompare(b.nextReviewDate)
    if (d !== 0) return d
    return b.createdAt.localeCompare(a.createdAt)
  })
}

/** 按学科筛选 */
export function filterBySubject(entries: StudentReviewItem[], subject: 'all' | string): StudentReviewItem[] {
  if (subject === 'all') return [...entries]
  return entries.filter(e => e.subject === subject)
}

/** 今日到期判定：nextReviewDate <= today 且 !mastered */
export function isDueToday(item: StudentReviewItem, today: string): boolean {
  return !item.mastered && item.nextReviewDate <= today
}

/** 今日逾期判定：nextReviewDate < today 且 !mastered */
export function isOverdue(item: StudentReviewItem, today: string): boolean {
  return !item.mastered && item.nextReviewDate < today
}

export interface ReviewStats {
  total: number
  dueToday: number
  overdue: number
  mastered: number
  /** 总掌握率（0-100 整数；空列表回退 0） */
  masteryRate: number
  /** 本周新增数 */
  thisWeekCreated: number
}

/** 统计 */
export function calcReviewStats(entries: StudentReviewItem[], today: string): ReviewStats {
  const total = entries.length
  if (total === 0) {
    return { total: 0, dueToday: 0, overdue: 0, mastered: 0, masteryRate: 0, thisWeekCreated: 0 }
  }
  const dueToday = entries.filter(e => isDueToday(e, today)).length
  const overdue = entries.filter(e => isOverdue(e, today)).length
  const mastered = entries.filter(e => e.mastered).length
  const masteryRate = Math.round((mastered / total) * 100)
  const todayMs = new Date(`${today}T00:00:00`).getTime()
  const weekAgoMs = todayMs - 7 * 24 * 60 * 60 * 1000
  const thisWeekCreated = entries.filter(e => {
    const created = new Date(e.createdAt).getTime()
    return Number.isFinite(created) && created >= weekAgoMs && created <= todayMs + 24 * 60 * 60 * 1000
  }).length
  return { total, dueToday, overdue, mastered, masteryRate, thisWeekCreated }
}

/**
 * 推进到下一阶段：stage + 1；若已达 REVIEW_MAX_STAGE，则标记 mastered=true。
 * 自动重算 nextReviewDate（基于 learnDate + 新 stage 对应间隔）。
 * 返回新对象（不改入参）。
 */
export function advanceStage(item: StudentReviewItem): StudentReviewItem {
  if (item.mastered) return item
  const nextStage = item.stage + 1
  if (nextStage > REVIEW_MAX_STAGE) {
    return { ...item, mastered: true, updatedAt: isoNow() }
  }
  const nextReviewDate = calcNextReviewDate(item.learnDate, nextStage) ?? item.nextReviewDate
  return {
    ...item,
    stage: nextStage,
    nextReviewDate,
    updatedAt: isoNow()
  }
}

/** 重置到阶段 1（用户反馈未掌握时使用） */
export function resetStage(item: StudentReviewItem): StudentReviewItem {
  if (item.mastered || item.stage === 1) {
    return { ...item, stage: 1, mastered: false, nextReviewDate: calcNextReviewDate(item.learnDate, 1) ?? item.nextReviewDate, updatedAt: isoNow() }
  }
  return {
    ...item,
    stage: 1,
    mastered: false,
    nextReviewDate: calcNextReviewDate(item.learnDate, 1) ?? item.nextReviewDate,
    updatedAt: isoNow()
  }
}

/** 阶段中文标签：阶段 1/2/3/4/5/6 */
export function stageLabel(stage: number): string {
  return `阶段 ${stage}/${REVIEW_MAX_STAGE}`
}

/** 距离今日的天数（nextReviewDate - today，可能为负） */
export function daysUntil(nextReviewDate: string, today: string): number {
  if (!isDateStr(nextReviewDate) || !isDateStr(today)) return 0
  const diff = new Date(`${nextReviewDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()
  return Math.round(diff / (24 * 60 * 60 * 1000))
}
