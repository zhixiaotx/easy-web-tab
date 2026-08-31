// 学生工作台学习计划纯逻辑模块。
// 归一化（幂等，兼容裸数组）+ 类型筛选 + 活跃判定 + 进度计算 + 排序。
// 零 vue/pinia 运行时依赖，纯函数。

import type {
  StudentPlan,
  StudentPlanData,
  StudentPlanGoal,
  StudentPlanType
} from '@/types'

/** 计划 id 前缀 */
export const PLAN_ID_PREFIX = 'pl_'
/** 计划目标 id 前缀 */
export const PLAN_GOAL_ID_PREFIX = 'pg_'

const KNOWN_PLAN_TYPES: readonly StudentPlanType[] = ['weekly', 'monthly', 'term']

function genId(prefix: string): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isDateStr(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v)
}

function clampProgress(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, Math.floor(n)))
}
export function emptyPlanData(): StudentPlanData {
  return { entries: [] }
}

/** 归一化单个目标：content trim 后空值剔除；progress 钳 0-100；done 强制布尔 */
export function normalizePlanGoal(raw: unknown): StudentPlanGoal | null {
  if (!raw || typeof raw !== 'object') return null
  const g = raw as Record<string, unknown>
  const content = typeof g.content === 'string' ? g.content.trim() : ''
  if (!content) return null
  return {
    id: typeof g.id === 'string' && g.id !== '' ? g.id : genId(PLAN_GOAL_ID_PREFIX),
    content: Array.from(content).slice(0, 100).join(''),
    progress: clampProgress(g.progress),
    done: g.done === true
  }
}

/** 归一化单个计划：title/startDate/endDate 必填且合法；endDate > startDate；goals 数组归一 */
export function normalizePlan(raw: unknown): StudentPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const title = typeof p.title === 'string' ? p.title.trim() : ''
  if (!title) return null
  const startDate = isDateStr(p.startDate) ? p.startDate : ''
  const endDate = isDateStr(p.endDate) ? p.endDate : ''
  if (!startDate || !endDate || endDate <= startDate) return null
  const type: StudentPlanType =
    typeof p.type === 'string' && (KNOWN_PLAN_TYPES as readonly string[]).includes(p.type)
      ? (p.type as StudentPlanType)
      : 'weekly'
  const now = isoNow()
  const goals: StudentPlanGoal[] = Array.isArray(p.goals)
    ? p.goals
        .map(normalizePlanGoal)
        .filter((g): g is StudentPlanGoal => g !== null)
    : []
  const out: StudentPlan = {
    id: typeof p.id === 'string' && p.id !== '' ? p.id : genId(PLAN_ID_PREFIX),
    type,
    title: Array.from(title).slice(0, 50).join(''),
    startDate,
    endDate,
    goals,
    createdAt: typeof p.createdAt === 'string' ? p.createdAt : now,
    updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : now
  }
  if (typeof p.review === 'string' && p.review.trim()) {
    out.review = Array.from(p.review).slice(0, 5000).join('')
  }
  return out
}

/** 归一化计划数据（幂等；兼容裸数组） */
export function normalizePlanData(raw: unknown): StudentPlanData {
  if (!raw || typeof raw !== 'object') return emptyPlanData()
  const src = raw as Record<string, unknown>
  if (Array.isArray(src.entries)) {
    return {
      entries: src.entries
        .map(normalizePlan)
        .filter((p): p is StudentPlan => p !== null)
    }
  }
  if (Array.isArray(raw)) {
    return {
      entries: (raw as unknown[])
        .map(normalizePlan)
        .filter((p): p is StudentPlan => p !== null)
    }
  }
  return emptyPlanData()
}

/** 排序：startDate 降序 → createdAt 降序（不改入参） */
export function sortPlans(entries: StudentPlan[]): StudentPlan[] {
  return [...entries].sort((a, b) => {
    const d = b.startDate.localeCompare(a.startDate)
    if (d !== 0) return d
    return b.createdAt.localeCompare(a.createdAt)
  })
}

/** 按类型筛选 */
export function filterByType(entries: StudentPlan[], type: StudentPlanType | 'all'): StudentPlan[] {
  if (type === 'all') return [...entries]
  return entries.filter(p => p.type === type)
}

/** 活跃判定：今日日期在 [startDate, endDate] 区间内 */
export function isPlanActive(plan: StudentPlan, today: string): boolean {
  return plan.startDate <= today && today <= plan.endDate
}

/** 已完成判定：所有目标 done === true（无目标视为未完成） */
export function isPlanCompleted(plan: StudentPlan): boolean {
  return plan.goals.length > 0 && plan.goals.every(g => g.done)
}

/** 计划整体进度（0-100 整数；按目标均分，无目标回退 0） */
export function calcPlanProgress(plan: StudentPlan): number {
  if (plan.goals.length === 0) return 0
  const total = plan.goals.reduce((s, g) => s + g.progress, 0)
  return Math.min(100, Math.round(total / plan.goals.length))
}

export interface PlanStats {
  total: number
  active: number
  completed: number
  /** 平均完成度（0-100 整数；空列表回退 0） */
  avgProgress: number
  /** 本周新增数 */
  thisWeekCreated: number
}

/** 统计：总数 / 进行中 / 已完成 / 平均完成度 / 本周新增（today 为 'YYYY-MM-DD'） */
export function calcPlanStats(entries: StudentPlan[], today: string): PlanStats {
  const total = entries.length
  if (total === 0) {
    return { total: 0, active: 0, completed: 0, avgProgress: 0, thisWeekCreated: 0 }
  }
  const active = entries.filter(p => isPlanActive(p, today)).length
  const completed = entries.filter(isPlanCompleted).length
  const avgProgress = Math.min(
    100,
    Math.round(entries.reduce((s, p) => s + calcPlanProgress(p), 0) / total)
  )
  const todayMs = new Date(`${today}T00:00:00`).getTime()
  const weekAgoMs = todayMs - 7 * 24 * 60 * 60 * 1000
  const thisWeekCreated = entries.filter(p => {
    const created = new Date(p.createdAt).getTime()
    return Number.isFinite(created) && created >= weekAgoMs && created <= todayMs + 24 * 60 * 60 * 1000
  }).length
  return { total, active, completed, avgProgress, thisWeekCreated }
}

/**
 * 更新目标进度：保证递增不递减（newProgress >= oldProgress 才写入）。
 * 同时同步 done 标志：progress=100 自动 done=true；progress<100 自动 done=false。
 * 返回新计划对象（不改入参）。
 */
export function updateGoalProgress(
  plan: StudentPlan,
  goalId: string,
  newProgress: number
): StudentPlan {
  const np = clampProgress(newProgress)
  const goals = plan.goals.map(g => {
    if (g.id !== goalId) return g
    const progress = Math.max(g.progress, np)
    return { ...g, progress, done: progress === 100 }
  })
  return { ...plan, goals, updatedAt: isoNow() }
}

/** 切换目标完成态：done=true 时进度设为 100；done=false 时进度保留但不再为 100 */
export function toggleGoalDone(plan: StudentPlan, goalId: string): StudentPlan {
  const goals = plan.goals.map(g => {
    if (g.id !== goalId) return g
    const nextDone = !g.done
    return nextDone
      ? { ...g, done: true, progress: 100 }
      : { ...g, done: false, progress: g.progress >= 100 ? 99 : g.progress }
  })
  return { ...plan, goals, updatedAt: isoNow() }
}
