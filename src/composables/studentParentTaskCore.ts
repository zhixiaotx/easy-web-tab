// 家长每日任务纯逻辑（家长协同面板 / 家长模式横条调用）
// 纯函数零 vue/pinia/DOM 依赖：信封归一化 / 排序 / 单条归一
// 日期键复用 diaryCore.dateKeyOf / isValidDateKey（避免重造本地 YYYY-MM-DD 防 UTC 偏移公式）

import type { StudentParentTask, StudentParentTasksData } from '@/types'
import { dateKeyOf, isValidDateKey } from './diaryCore'

const TASK_ID_RE = /^pt_[a-zA-Z0-9_-]+$/
const TASK_ID_PREFIX = 'pt_'

/** 空家长任务信封 */
export function emptyParentTasksData(): StudentParentTasksData {
  return { tasks: [] }
}

/** 单条任务归一：修正字段、回填缺失、剔除非法条目（返回 null 表示整条应抛弃） */
function normalizeOne(raw: unknown, fallbackIndex: number, fallbackDate: string): StudentParentTask | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const titleRaw = typeof r.title === 'string' ? r.title.trim() : ''
  if (!titleRaw) return null
  const title = titleRaw.slice(0, 100)
  let date: string
  if (typeof r.date === 'string' && r.date) {
    const d = new Date(r.date)
    if (!Number.isNaN(d.getTime())) date = dateKeyOf(d)
    else if (isValidDateKey(r.date)) date = r.date
    else date = fallbackDate
  } else {
    date = fallbackDate
  }
  const done = !!r.done
  let id: string
  if (typeof r.id === 'string' && TASK_ID_RE.test(r.id)) id = r.id
  else id = `${TASK_ID_PREFIX}${date}_${String(fallbackIndex).padStart(3, '0')}`
  return { id, title, date, done, source: 'parent' as const }
}

/** 归一化家长任务信封：接受裸数组、单对象、任意脏数据；恒返回合法 StudentParentTasksData */
export function normalizeParentTasksData(raw: unknown): StudentParentTasksData {
  const fallbackDate = dateKeyOf(new Date())
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>
    const list = Array.isArray(r.tasks) ? r.tasks : []
    const out: StudentParentTask[] = []
    const seen = new Set<string>()
    list.forEach((item, i) => {
      const t = normalizeOne(item, i + 1, fallbackDate)
      if (!t) return
      if (seen.has(t.id)) t.id = `${t.id}_${Math.floor(Math.random() * 0xFFFF).toString(16).padStart(4, '0')}`
      seen.add(t.id)
      out.push(t)
    })
    return { tasks: out }
  }
  if (Array.isArray(raw)) {
    const out: StudentParentTask[] = []
    const seen = new Set<string>()
    raw.forEach((item, i) => {
      const t = normalizeOne(item, i + 1, fallbackDate)
      if (!t) return
      if (seen.has(t.id)) t.id = `${t.id}_${Math.floor(Math.random() * 0xFFFF).toString(16).padStart(4, '0')}`
      seen.add(t.id)
      out.push(t)
    })
    return { tasks: out }
  }
  return emptyParentTasksData()
}

/** 排序：date 升序 → 未完成（done=false）优先 → id 字典序升序；返回新数组不改入参 */
export function sortParentTasks(list: readonly StudentParentTask[]): StudentParentTask[] {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    if (a.done !== b.done) return a.done ? 1 : -1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/** 取指定日期当天的任务（返回新数组） */
export function parentTasksByDate(list: readonly StudentParentTask[], date: string): StudentParentTask[] {
  if (!isValidDateKey(date)) return []
  return sortParentTasks(list.filter(t => t.date === date))
}

/** 今日日期键（本地） */
export function todayKey(): string {
  return dateKeyOf(new Date())
}

/** 生成新任务 id：pt_YYYYMMDD_HHmmss_XXXX（4 位随机 hex） */
export function newParentTaskId(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const rnd = Math.floor(Math.random() * 0xFFFF).toString(16).padStart(4, '0')
  return `${TASK_ID_PREFIX}${y}${m}${d}_${hh}${mm}${ss}_${rnd}`
}

/** 7 天完成率窗口统计 */
export function parentTasksWeekStats(list: readonly StudentParentTask[], today?: Date): { date: string; done: number; total: number }[] {
  const anchor = today ?? new Date()
  const base = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
  const out: { date: string; done: number; total: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base.getTime())
    d.setDate(base.getDate() - i)
    const key = dateKeyOf(d)
    const items = list.filter(t => t.date === key)
    out.push({ date: key, done: items.filter(t => t.done).length, total: items.length })
  }
  return out
}

/** 校验任务表单：返回 {ok, reason?} */
export function validateParentTaskForm(title: string, date: string): { ok: boolean; reason?: 'empty-title' | 'long-title' | 'invalid-date' } {
  const t = title.trim()
  if (!t) return { ok: false, reason: 'empty-title' }
  if (t.length > 100) return { ok: false, reason: 'long-title' }
  if (!isValidDateKey(date)) return { ok: false, reason: 'invalid-date' }
  return { ok: true }
}
