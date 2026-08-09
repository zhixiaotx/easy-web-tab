// 工作台待办纯逻辑模块：normalizeTodo 归一化 → filterTodos 查询 → dueInfo 截止倒计时主角。
// 运行时依赖仅 DEFAULT_TODO_COLOR / TODO_PRIORITIES（node --experimental-strip-types 可运行）；其余类型全部 type-only。
import { DEFAULT_TODO_COLOR } from '../types/index.ts'
import type { TodoPriority, WorkbenchTodo } from '../types'

export const TODO_PRIORITIES: TodoPriority[] = ['high', 'medium', 'low']

/** 缺省 id 兜底（沿用 store 的 td_ 前缀，追加随机段防批量碰撞）。 */
function genId(): string {
  return `td_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 卡片自定义颜色：'#RGB' 或 '#RRGGBB'（大小写均可）。 */
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** 将任意来源的待办数据归一化为规范 WorkbenchTodo（priority/completed/color 强制归一，字符串字段安全兜底）。 */
export function normalizeTodo(raw: Partial<WorkbenchTodo>): WorkbenchTodo {
  const priority: TodoPriority =
    typeof raw.priority === 'string' && (TODO_PRIORITIES as string[]).includes(raw.priority)
      ? (raw.priority as TodoPriority)
      : 'medium'
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : genId(),
    title: typeof raw.title === 'string' ? raw.title : '',
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    priority,
    ...(typeof raw.dueDate === 'string' ? { dueDate: raw.dueDate } : {}),
    completed: raw.completed === true,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    color: typeof raw.color === 'string' && HEX_COLOR_RE.test(raw.color) ? raw.color : DEFAULT_TODO_COLOR
  }
}

/** 查询筛选条件：标题模糊匹配标题 / 描述模糊匹配描述 / 两者同时非空为 AND / priority 精确 / status 完成态；空串或 undefined 表示不限制。 */
export interface TodoFilterCriteria {
  title?: string
  description?: string
  priority?: '' | TodoPriority
  status?: '' | 'all' | 'active' | 'completed'
}

/** 按条件过滤待办（纯函数，供查询栏复用；空条件返回全部）。保留原条目类型（WorkbenchTodo 及其扩展）。 */
export function filterTodos<T extends WorkbenchTodo>(items: T[], criteria: TodoFilterCriteria = {}): T[] {
  const title = (criteria.title ?? '').trim().toLowerCase()
  const description = (criteria.description ?? '').trim().toLowerCase()
  const priority = criteria.priority || undefined
  const status = criteria.status || undefined
  return items.filter(todo => {
    if (title && !todo.title.toLowerCase().includes(title)) return false
    if (description && !(todo.description ?? '').toLowerCase().includes(description)) return false
    if (priority !== undefined && todo.priority !== priority) return false
    if (status === 'active' && todo.completed) return false
    if (status === 'completed' && !todo.completed) return false
    return true
  })
}

/** 截止倒计时主角文案与状态：未来 →「剩余 N 天」；今天 →「今天到期」；过去且未完成 →「已逾期 N 天」。 */
export interface DueInfo {
  label: string
  status: 'normal' | 'today' | 'overdue'
}

/** 今天 = 本地日期 YYYY-MM-DD（不能用 toISOString，那是 UTC，会偏一天）。 */
export function localToday(d?: Date): string {
  const base = d ?? new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`
}

/**
 * 计算截止倒计时主角。无 dueDate 或已完成 → null（已完成由卡片标题划线表达，不重复提示）。
 * 按天差值计算：dueDate 为 'YYYY-MM-DD'，与今天本地日期逐日相减。
 */
export function dueInfo(dueDate: string | undefined, completed: boolean, today?: Date): DueInfo | null {
  if (!dueDate || completed) return null
  const t = today ?? new Date()
  const todayStr = localToday(t)
  const diffMs = new Date(dueDate + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()
  if (isNaN(diffMs)) return null
  const days = Math.floor(diffMs / 86400000)
  if (days > 0) return { label: `剩余 ${days} 天`, status: 'normal' }
  if (days === 0) return { label: '今天到期', status: 'today' }
  return { label: `已逾期 ${-days} 天`, status: 'overdue' }
}
