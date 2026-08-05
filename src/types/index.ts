export interface Site {
  name: string
  url: string
  description?: string
  category: string
  tags: string[]
  icon?: string
  sort?: number
  createdAt?: string
  updatedAt?: string
  isValid?: boolean  // 断链检测结果，undefined=未检测
}

export interface SitesData {
  sites: Site[]
  lastUpdated?: string
}

// 分类接口
export interface Category {
  id: string
  name: string
  icon: string
  isBuiltIn: boolean
  sort?: number
}

// 预定义分类 (不可删除) - 仅保留 video
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'video', name: '视频音乐', icon: '🎬', isBuiltIn: true, sort: 1 },
  { id: 'other', name: '其他', icon: '📁', isBuiltIn: true, sort: 999 }
]

// 向后兼容
export const CATEGORIES = DEFAULT_CATEGORIES

// 密码管理接口
export interface PasswordEntry {
  id: string
  siteName: string
  url: string
  username: string
  password: string // 加密存储 (base64)
  createdAt: string
  updatedAt: string
}

// 倒计时提醒分类（固定三分类：工作/生活/学习）
export const COUNTDOWN_CATEGORIES = ['work', 'life', 'study'] as const
export type CountdownCategory = (typeof COUNTDOWN_CATEGORIES)[number]

// 倒计时卡片自定义颜色：默认蓝 + 8 预设（与便签 NOTE_COLORS 同源色值）
export const DEFAULT_COUNTDOWN_COLOR = '#3b82f6'
export const COUNTDOWN_COLOR_PRESETS = [
  '#ef4444', // 红
  '#f97316', // 橙
  '#eab308', // 黄
  '#22c55e', // 绿
  '#06b6d4', // 青
  '#3b82f6', // 蓝
  '#a855f7', // 紫
  '#ec4899'  // 粉
] as const

// 倒计时重复规则对象（替代旧 repeat: 'yearly' | null）
// once 规范存储为 null（parseRepeat 归一）；weekly daysOfWeek: 1=周一 .. 7=周日
export type CountdownRepeat =
  | { type: 'once' }
  | { type: 'daily' }
  | { type: 'weekly'; daysOfWeek: number[] }
  | { type: 'monthly'; dayOfMonth: number } // 1-31，越界按当月天数钳制
  | { type: 'yearly' }
  | { type: 'interval'; intervalMinutes: number } // 距 endDateTime 起每 N 分钟

// 倒计时接口
export interface Countdown {
  id: string
  name: string
  endDateTime: string // 'YYYY-MM-DDTHH:mm' LOCAL time, no timezone suffix, e.g. '2026-12-31T23:59'
  repeat?: CountdownRepeat | null // 重复规则对象；null/absent = 一次性；旧字符串 'yearly' 由 normalize 迁移为 { type: 'yearly' }
  category?: CountdownCategory    // 提醒分类；undefined = 'work'（工作）
  lastRemindedAt?: string         // 上次提醒时刻（'YYYY-MM-DD HH:mm'），防重复提醒
  createdAt: string
  updatedAt: string
  sortOrder?: number        // NEW: manual sort position (1..n); undefined = last
  showOnDisplay?: boolean   // NEW: front-page visibility; undefined = true
  color?: string            // 卡片自定义颜色（'#RRGGBB' 或 '#RGB' hex）；undefined = 默认蓝
}

export interface CountdownRemaining {
  days: number
  hours: number
  minutes: number
  label: string
  status: 'normal' | 'urgent' | 'critical' | 'expired'
  nextTime: string
  isExpired: boolean
}

export type CountdownItem = Countdown & { remaining: CountdownRemaining }

// 工作台待办任务
export type TodoPriority = 'low' | 'medium' | 'high'

export interface WorkbenchTodo {
  id: string
  title: string
  description?: string
  priority: TodoPriority
  dueDate?: string
  completed: boolean
  createdAt: string
  updatedAt: string
}

// 工作台便签
export const NOTE_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'] as const

export type NoteColor = (typeof NOTE_COLORS)[number]

export interface WorkbenchNote {
  id: string
  title?: string
  content: string
  color: NoteColor
  pinned: boolean
  createdAt: string
  updatedAt: string
}

// 工作台数据导出/导入格式
export const WORKBENCH_DATA_VERSION = 1

export interface WorkbenchData {
  version: number
  exportedAt: string
  todos: WorkbenchTodo[]
  notes: WorkbenchNote[]
  countdowns: Countdown[]
  passwords: string // 整库加密 blob 字符串（useCrypto 现有格式）
}
