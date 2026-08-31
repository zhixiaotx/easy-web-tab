// 学生工作台错题本纯逻辑模块。
// 归一化（幂等，兼容裸数组）+ 学科/状态/标签筛选 + 状态流转 + 排序 + 统计。
// M3 决策：不支持图片上传（imageIds 恒为 []），仅纯文字录入。
// 零 vue/pinia 运行时依赖，纯函数。

import type {
  StudentMistake,
  StudentMistakeStatus,
  StudentMistakesData
} from '@/types'

/** 错题 id 前缀 */
export const MISTAKE_ID_PREFIX = 'mk_'

/** 合法状态集合 */
export const KNOWN_STATUSES: readonly StudentMistakeStatus[] = ['new', 'reviewing', 'mastered']

/** 状态中文标签 */
const STATUS_LABELS: Record<StudentMistakeStatus, string> = {
  new: '未复习',
  reviewing: '复习中',
  mastered: '已掌握'
}

function genId(): string {
  return `${MISTAKE_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isDateStr(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v)
}

function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 标签归一化：去重 + trim + 1-20 字符 + 上限 10 个 */
function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of raw) {
    if (typeof t !== 'string') continue
    const trimmed = t.trim()
    if (!trimmed) continue
    const sliced = Array.from(trimmed).slice(0, 20).join('')
    if (seen.has(sliced)) continue
    seen.add(sliced)
    out.push(sliced)
    if (out.length >= 10) break
  }
  return out
}

/** 空错题数据 */
export function emptyMistakesData(): StudentMistakesData {
  return { entries: [] }
}

/**
 * 归一化单条错题：subject/question/answer 必填（trim 后非空）。
 * title/analysis 可选；tags 归一化；imageIds 恒为 []（M3 不支持图片）。
 * 状态非法回退 'new'。
 */
export function normalizeMistake(raw: unknown): StudentMistake | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  const subject = typeof m.subject === 'string' ? m.subject.trim() : ''
  const question = typeof m.question === 'string' ? m.question.trim() : ''
  const answer = typeof m.answer === 'string' ? m.answer.trim() : ''
  if (!subject || !question || !answer) return null
  const status: StudentMistakeStatus =
    typeof m.status === 'string' && (KNOWN_STATUSES as readonly string[]).includes(m.status)
      ? (m.status as StudentMistakeStatus)
      : 'new'
  const now = isoNow()
  const out: StudentMistake = {
    id: typeof m.id === 'string' && m.id !== '' ? m.id : genId(),
    subject: Array.from(subject).slice(0, 50).join(''),
    question: Array.from(question).slice(0, 5000).join(''),
    answer: Array.from(answer).slice(0, 5000).join(''),
    tags: normalizeTags(m.tags),
    imageIds: [], // M3 决策：不支持图片上传
    status,
    createdAt: typeof m.createdAt === 'string' ? m.createdAt : now,
    updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt : now
  }
  if (typeof m.title === 'string' && m.title.trim()) {
    out.title = Array.from(m.title.trim()).slice(0, 100).join('')
  }
  if (typeof m.analysis === 'string' && m.analysis.trim()) {
    out.analysis = Array.from(m.analysis.trim()).slice(0, 5000).join('')
  }
  if (typeof m.linkedReviewId === 'string' && m.linkedReviewId.trim()) {
    out.linkedReviewId = m.linkedReviewId.trim()
  }
  return out
}

/** 归一化错题数据（幂等；兼容裸数组） */
export function normalizeMistakesData(raw: unknown): StudentMistakesData {
  if (!raw || typeof raw !== 'object') return emptyMistakesData()
  const src = raw as Record<string, unknown>
  if (Array.isArray(src.entries)) {
    return {
      entries: src.entries
        .map(normalizeMistake)
        .filter((m): m is StudentMistake => m !== null)
    }
  }
  if (Array.isArray(raw)) {
    return {
      entries: (raw as unknown[])
        .map(normalizeMistake)
        .filter((m): m is StudentMistake => m !== null)
    }
  }
  return emptyMistakesData()
}

/** 排序：未掌握优先 → updatedAt 降序（不改入参） */
export function sortMistakes(entries: StudentMistake[]): StudentMistake[] {
  const rank: Record<StudentMistakeStatus, number> = { new: 0, reviewing: 1, mastered: 2 }
  return [...entries].sort((a, b) => {
    const ra = rank[a.status]
    const rb = rank[b.status]
    if (ra !== rb) return ra - rb
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

/** 按学科筛选（'all' 返回排序副本） */
export function filterBySubjectMistakes(
  entries: StudentMistake[],
  subject: 'all' | string
): StudentMistake[] {
  if (subject === 'all') return [...entries]
  return entries.filter(e => e.subject === subject)
}

/** 按状态筛选 */
export function filterByStatus(
  entries: StudentMistake[],
  status: 'all' | StudentMistakeStatus
): StudentMistake[] {
  if (status === 'all') return [...entries]
  return entries.filter(e => e.status === status)
}

/** 按标签筛选（包含任一标签即命中；空标签数组返回全量副本） */
export function filterByTags(entries: StudentMistake[], tags: string[]): StudentMistake[] {
  if (!tags.length) return [...entries]
  const set = new Set(tags)
  return entries.filter(e => e.tags.some(t => set.has(t)))
}

/** 关键词筛选（subject/title/question/answer/analysis 任一包含，大小写不敏感） */
export function filterByKeyword(entries: StudentMistake[], keyword: string): StudentMistake[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return [...entries]
  return entries.filter(e => {
    const hay = [e.subject, e.title ?? '', e.question, e.answer, e.analysis ?? '', e.tags.join(' ')].join('\n').toLowerCase()
    return hay.includes(kw)
  })
}

export interface MistakeStats {
  total: number
  /** 未复习 */
  fresh: number
  /** 复习中 */
  reviewing: number
  /** 已掌握 */
  mastered: number
  /** 掌握率（0-100 整数；空列表回退 0） */
  masteryRate: number
  /** 本周新增数 */
  thisWeekCreated: number
  /** 独立学科数 */
  distinctSubjects: number
}

/** 统计 */
export function calcMistakeStats(entries: StudentMistake[], today: string): MistakeStats {
  const total = entries.length
  if (total === 0) {
    return { total: 0, fresh: 0, reviewing: 0, mastered: 0, masteryRate: 0, thisWeekCreated: 0, distinctSubjects: 0 }
  }
  const fresh = entries.filter(e => e.status === 'new').length
  const reviewing = entries.filter(e => e.status === 'reviewing').length
  const mastered = entries.filter(e => e.status === 'mastered').length
  const masteryRate = Math.round((mastered / total) * 100)
  const todayMs = new Date(`${today}T00:00:00`).getTime()
  const weekAgoMs = todayMs - 7 * 24 * 60 * 60 * 1000
  const thisWeekCreated = entries.filter(e => {
    const created = new Date(e.createdAt).getTime()
    return Number.isFinite(created) && created >= weekAgoMs && created <= todayMs + 24 * 60 * 60 * 1000
  }).length
  const distinctSubjects = new Set(entries.map(e => e.subject)).size
  return { total, fresh, reviewing, mastered, masteryRate, thisWeekCreated, distinctSubjects }
}

/**
 * 推进状态：new → reviewing → mastered（已达 mastered 则不变）。
 * 返回新对象（不改入参）。
 */
export function advanceStatus(item: StudentMistake): StudentMistake {
  if (item.status === 'mastered') return item
  const next: StudentMistakeStatus = item.status === 'new' ? 'reviewing' : 'mastered'
  return { ...item, status: next, updatedAt: isoNow() }
}

/** 重置为未复习状态（status='new'） */
export function resetStatus(item: StudentMistake): StudentMistake {
  if (item.status === 'new') return item
  return { ...item, status: 'new', updatedAt: isoNow() }
}

/** 状态中文标签 */
export function statusLabel(status: StudentMistakeStatus): string {
  return STATUS_LABELS[status] ?? '未复习'
}

/** 今日字符串（导出供组件复用） */
export function getToday(): string {
  return todayStr()
}

/** 校验日期字符串合法性 */
export function isValidDate(v: unknown): v is string {
  return isDateStr(v)
}
