// 学生工作台作业管理纯逻辑模块。
// 归一化（幂等）+ 状态自动流转（到期日<今日且未完成→overdue）+ 学科筛选 + 排序。
// 零 vue/pinia 运行时依赖，纯函数。

import type {
  StudentHomework,
  StudentHomeworkData,
  StudentHomeworkPriority,
  StudentHomeworkStatus
} from '@/types'

/** 作业 id 前缀 */
export const HOMEWORK_ID_PREFIX = 'hw_'

function genId(): string {
  return `${HOMEWORK_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isDateStr(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v)
}

/** 空作业数据 */
export function emptyHomeworkData(): StudentHomeworkData {
  return { entries: [] }
}

function normalizeStatus(v: unknown): StudentHomeworkStatus {
  if (v === 'pending' || v === 'doing' || v === 'done' || v === 'overdue') return v
  return 'pending'
}

function normalizePriority(v: unknown): StudentHomeworkPriority {
  if (v === 'low' || v === 'normal' || v === 'high') return v
  return 'normal'
}

export function normalizeHomework(raw: unknown): StudentHomework | null {
  if (!raw || typeof raw !== 'object') return null
  const h = raw as Record<string, unknown>
  const title = typeof h.title === 'string' ? h.title.trim() : ''
  const subject = typeof h.subject === 'string' ? h.subject.trim() : ''
  const dueDate = isDateStr(h.dueDate) ? h.dueDate : ''
  if (title === '' || subject === '' || dueDate === '') return null
  const now = isoNow()
  return {
    id: typeof h.id === 'string' && h.id !== '' ? h.id : genId(),
    subject,
    title,
    content: typeof h.content === 'string' ? h.content : undefined,
    dueDate,
    status: normalizeStatus(h.status),
    priority: normalizePriority(h.priority),
    source: h.source === 'parent' ? 'parent' : 'self',
    completedAt: typeof h.completedAt === 'string' ? h.completedAt : undefined,
    createdAt: typeof h.createdAt === 'string' ? h.createdAt : now,
    updatedAt: typeof h.updatedAt === 'string' ? h.updatedAt : now
  }
}

export function normalizeHomeworkData(raw: unknown): StudentHomeworkData {
  if (!raw || typeof raw !== 'object') return emptyHomeworkData()
  const src = raw as Record<string, unknown>
  if (Array.isArray(src.entries)) {
    const entries = src.entries
      .map(e => normalizeHomework(e))
      .filter((e): e is StudentHomework => e !== null)
    return { entries }
  }
  if (Array.isArray(raw)) {
    const entries = (raw as unknown[])
      .map(e => normalizeHomework(e))
      .filter((e): e is StudentHomework => e !== null)
    return { entries }
  }
  return emptyHomeworkData()
}

export function autoFlowStatus(entries: StudentHomework[], today: string): StudentHomework[] {
  return entries.map(e => {
    if (e.status === 'done') return e
    if (e.dueDate < today && e.status !== 'overdue') {
      return { ...e, status: 'overdue' as StudentHomeworkStatus, updatedAt: isoNow() }
    }
    return e
  })
}

export function filterBySubject(entries: StudentHomework[], subject: string): StudentHomework[] {
  if (subject === 'all') return [...entries]
  return entries.filter(e => e.subject === subject)
}

export function filterByStatus(entries: StudentHomework[], status: string): StudentHomework[] {
  if (status === 'all') return [...entries]
  return entries.filter(e => e.status === status)
}

const STATUS_ORDER: Record<StudentHomeworkStatus, number> = {
  overdue: 0,
  pending: 1,
  doing: 2,
  done: 3
}
const PRIORITY_WEIGHT: Record<StudentHomeworkPriority, number> = {
  high: 0,
  normal: 1,
  low: 2
}

export function sortHomework(entries: StudentHomework[]): StudentHomework[] {
  return [...entries].sort((a, b) => {
    const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (so !== 0) return so
    const dd = a.dueDate.localeCompare(b.dueDate)
    if (dd !== 0) return dd
    return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
  })
}

export function nextStatus(current: StudentHomeworkStatus): StudentHomeworkStatus {
  switch (current) {
    case 'pending': return 'doing'
    case 'doing': return 'done'
    case 'done': return 'done'
    case 'overdue': return 'doing'
  }
}

export function statusLabel(status: StudentHomeworkStatus): string {
  switch (status) {
    case 'pending': return '待办'
    case 'doing': return '进行中'
    case 'done': return '已完成'
    case 'overdue': return '逾期'
  }
}

export function priorityLabel(priority: StudentHomeworkPriority): string {
  switch (priority) {
    case 'low': return '低'
    case 'normal': return '中'
    case 'high': return '高'
  }
}
