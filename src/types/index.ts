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

// 倒计时提醒分类：内置 6 类（COUNTDOWN_CATEGORIES）+ 用户自定义分类名（string，分类管理新增）
export const COUNTDOWN_CATEGORIES = ['work', 'life', 'study', 'exercise', 'diet', 'sleep'] as const
export type CountdownCategory = string

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

// 待办卡片自定义颜色：默认蓝 + 8 预设（与倒计时 COUNTDOWN_COLOR_PRESETS / 便签 NOTE_COLORS 同源色值）
export const DEFAULT_TODO_COLOR = '#3b82f6'
export const TODO_COLOR_PRESETS = [
  '#ef4444', // 红
  '#f97316', // 橙
  '#eab308', // 黄
  '#22c55e', // 绿
  '#06b6d4', // 青
  '#3b82f6', // 蓝
  '#a855f7', // 紫
  '#ec4899'  // 粉
] as const

export interface WorkbenchTodo {
  id: string
  title: string
  description?: string
  priority: TodoPriority
  dueDate?: string
  completed: boolean
  createdAt: string
  updatedAt: string
  color?: string // 卡片自定义颜色（'#RRGGBB' 或 '#RGB' hex）；undefined = 默认蓝
  categoryId?: string // 待办分类（undefined/'' = 未分类）
}

// 工作台便签
export const NOTE_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'] as const

export type NoteColor = (typeof NOTE_COLORS)[number]

// 便签类型：normal=普通便签，timeline=时光轴便签
export type NoteType = 'normal' | 'timeline'

// 便签类型筛选：'all' = 全部类型（不过滤），普通/时光轴 = 精确匹配
export type NoteTypeFilter = NoteType | 'all'

// 便签分类（工作台便签专属，独立于网址 Category）
export interface NoteCategory {
  id: string
  name: string
  sort?: number // 排序权重，数字越小越靠前；undefined = 追加末尾
  showInTabs?: boolean // 是否显示在便签分类标签页；undefined/true = 显示（默认），false = 隐藏
}

// 时光轴条目（仅 timeline 类型便签使用）
export interface TimelineEntry {
  id: string
  datetime: string // 'YYYY-MM-DD HH:mm' 本地时间
  content: string
  createdAt: string
}

export interface WorkbenchNote {
  id: string
  title?: string
  content: string
  color: NoteColor
  pinned: boolean
  createdAt: string
  updatedAt: string
  type?: NoteType           // 便签类型；undefined = normal（普通便签）
  categoryId?: string       // 所属便签分类 id；undefined = 未分类
  entries?: TimelineEntry[] // 时光轴条目（仅 type='timeline' 使用，normal 不写入）
}

// 工作台便签数据（分类 + 便签列表）
export interface NoteData {
  categories: NoteCategory[]
  notes: WorkbenchNote[]
}

// 工作台数据导出/导入格式
export const WORKBENCH_DATA_VERSION = 3

export interface WorkbenchData {
  version: number
  exportedAt: string
  todos: WorkbenchTodo[]
  notes: NoteData
  countdowns: Countdown[]
  passwords: string // 整库加密 blob 字符串（useCrypto 现有格式）
  health: HealthData
  ledger: LedgerData
}

// ==================== 健康管理 ====================

export type HealthModule = 'exercise' | 'diet' | 'sleep' | 'weight'

// 健康管理面板 tab 键（WorkbenchHealth 容器 + 导航白名单共用单一来源）
export const HEALTH_TABS = ['exercise', 'diet', 'sleep', 'weight'] as const

export const EXERCISE_TYPES = ['跑步', '游泳', '力量', '骑行', '瑜伽', '其他'] as const

export const MEAL_TYPES = ['早餐', '午餐', '晚餐', '加餐'] as const

export type MealType = (typeof MEAL_TYPES)[number]

export type HealthPlanMetric = 'times' | 'minutes' | 'calories' | 'duration'

export type HealthPlanPeriod = 'daily' | 'weekly'

export interface HealthPlan {
  module: 'exercise' | 'diet' | 'sleep'
  metric: HealthPlanMetric
  period: HealthPlanPeriod
  target: number
  updatedAt: string
}

export interface ExerciseRecord {
  id: string
  module: 'exercise'
  date: string
  exerciseType: string
  duration: number
  calories: number
  distanceKm?: number
  note?: string
  createdAt: string
  updatedAt: string
}

export interface DietRecord {
  id: string
  module: 'diet'
  date: string
  mealType: MealType
  content: string
  calories: number
  note?: string
  createdAt: string
  updatedAt: string
}

export interface SleepRecord {
  id: string
  module: 'sleep'
  date: string
  sleepTime: string
  wakeTime: string
  durationHours: number
  quality: number
  note?: string
  createdAt: string
  updatedAt: string
}

export interface WeightRecord {
  id: string
  module: 'weight'
  date: string
  weightKg: number
  note?: string
  createdAt: string
  updatedAt: string
}

export type HealthRecord = ExerciseRecord | DietRecord | SleepRecord | WeightRecord

export interface HealthPlans {
  exercise?: HealthPlan
  diet?: HealthPlan
  sleep?: HealthPlan
}

export interface HealthData {
  height?: number
  plans: HealthPlans
  records: {
    exercise: ExerciseRecord[]
    diet: DietRecord[]
    sleep: SleepRecord[]
    weight: WeightRecord[]
  }
}

// ==================== 记账本 ====================

export interface LedgerCategory {
  id: string
  name: string
  type: 'income' | 'expense'
  isBuiltIn: boolean
}

// 预定义记账分类（不可删除）
export const DEFAULT_LEDGER_CATEGORIES: LedgerCategory[] = [
  { id: 'salary', name: '工资', type: 'income', isBuiltIn: true },
  { id: 'mortgage', name: '房贷', type: 'expense', isBuiltIn: true },
  { id: 'carloan', name: '车贷', type: 'expense', isBuiltIn: true },
  { id: 'breakfast', name: '早餐', type: 'expense', isBuiltIn: true },
  { id: 'lunch', name: '午餐', type: 'expense', isBuiltIn: true },
  { id: 'dinner', name: '晚餐', type: 'expense', isBuiltIn: true },
  { id: 'commute', name: '通勤', type: 'expense', isBuiltIn: true },
  { id: 'daily', name: '日常', type: 'expense', isBuiltIn: true }
]

export interface LedgerEntry {
  id: string
  date: string
  categoryId: string
  amount: number
  note?: string
  createdAt: string
  updatedAt: string
}

export interface LedgerData {
  categories: LedgerCategory[]
  entries: LedgerEntry[]
}
