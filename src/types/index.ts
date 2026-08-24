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
  emailReminder?: boolean   // 发送邮件提醒开关；undefined/缺省 = 不发邮件
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

// 工作台日记本：每天一条（date 本地 'YYYY-MM-DD' 唯一，upsert 语义）
export interface WorkbenchDiary {
  id: string // 'dy_' 前缀
  date: string // 'YYYY-MM-DD' 本地日期，唯一（每天一条）
  content: string // Markdown 正文
  createdAt: string
  updatedAt: string
}

// 工作台日记本数据（条目列表）
export interface DiaryData {
  entries: WorkbenchDiary[]
}

// 工作台应用设置（备份 v4 新增）：弹窗尺寸 + 按钮/背景透明度 + 工作台菜单顺序/名称/开关 + 工作台城市/侧栏折叠态 + 导航筛选栏展开态
export interface AppSettingsData {
  dialogSizes: Record<string, { width: number; height: number }>
  buttonOpacity: number
  bgOpacity: number
  workbenchMenuOrder?: string[]
  workbenchMenuLabels?: Record<string, string>
  workbenchMenuVisibility?: Record<string, boolean> // 工作台菜单开关（false = 隐藏菜单项/面板/主页对应统计；缺失 = 显示）
  workbenchCity?: string // 天气卡城市（trim 后非空；空串/undefined/null = 未配置）
  workbenchSidebarCollapsed?: boolean // 工作台侧栏折叠态（非法/缺失 = 未配置即展开）
  businessSidebarCollapsed?: boolean // 销售记账工作台侧栏折叠态（非法/缺失 = 未配置即展开）
  navFiltersExpanded?: boolean // 导航管理页分类/标签栏展开态（默认 false = 收起）
  desktopNotifyEnabled?: boolean // 定时提醒桌面通知总开关（默认 false = 关闭）
  reminderEmailEnabled?: boolean // 定时提醒邮件总开关（默认 false = 关闭）
  reminderEmailTo?: string // EmailJS 收件邮箱（空串 = 未配置）
  reminderEmailServiceId?: string // EmailJS Service ID
  reminderEmailTemplateId?: string // EmailJS Template ID
  reminderEmailPublicKey?: string // EmailJS Public Key
  workbenchPageName?: string           // 工作台页面自定义名称（默认 '工作台'）
  workbenchPageVisible?: boolean       // 工作台页面可见性开关（默认 true）
  businessPageName?: string            // 销售记账页面自定义名称（默认 '销售记账'）
  businessPageVisible?: boolean        // 销售记账页面可见性开关（默认 true）
  cloudSyncEnabled?: boolean           // 云同步总开关（默认 false）
  cloudSyncUrl?: string                // WebDAV URL（空串 = 未配置）
  cloudSyncUsername?: string           // WebDAV 用户名（空串 = 未配置）
  cloudSyncPassword?: string           // WebDAV 应用密码（空串 = 未配置，存 IDB 非 localStorage）
  cloudSyncInterval?: number           // 后台定时同步间隔（0 = 仅触发式，>0 = 分钟数）
}

export function emptyAppSettingsData(): AppSettingsData {
  return { dialogSizes: {}, buttonOpacity: 1, bgOpacity: 1 }
}

// 工作台数据导出/导入格式
export const WORKBENCH_DATA_VERSION = 9

export interface WorkbenchData {
  version: number
  exportedAt: string
  todos: WorkbenchTodo[]
  notes: NoteData
  diary: DiaryData
  countdowns: Countdown[]
  passwords: string // 整库加密 blob 字符串（useCrypto 现有格式）
  health: HealthData
  ledger: LedgerData
  settings: AppSettingsData
  pomodoro?: unknown // v5 新增：番茄钟数据（后续 Todo 定义具体类型后收紧）
  habits?: unknown // v5 新增：习惯打卡数据（后续 Todo 定义具体类型后收紧）
  business?: BusinessData // v7 新增：摆摊进销存（v1-v6 导入补空、v7 原样透传）
  passwordsSalt?: string // v8 新增：密码库 PBKDF2 盐 hex（内嵌自 localStorage password-salt-v2；与 passwordVerification 成对出现才有效）
  passwordVerification?: string // v8 新增：主密码验证串密文（内嵌自 localStorage password-verification-v2 原样）
  clientId?: string          // v9 新增：推送设备标识（首次同步时生成 uuid，存 localStorage）
  pushedAt?: number          // v9 新增：远端推送时间戳（ms）；idbExportAll 不主动输出此字段，仅云端往返携带
  prefs?: Record<string, string>  // v9 新增：localStorage 偏好打包（导航 + 主题 + 工作台偏好；不含图标、不含加密身份键）
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

// ==================== 摆摊进销存（销售记账，备份 v7 新增） ====================

/** 支出分类：内置 5（isBuiltIn 不可删）+ 自定义；visible 控制支出 Tab 栏显示 */
export interface BusinessExpenseCategory {
  id: string // bec_ 前缀；内置 id 固定 expense-stall/gas/seasoning/transport/other
  name: string
  sortOrder: number
  visible: boolean
  isBuiltIn: boolean
}

/** 商品分类：内置 5 种子可删（删除后商品归未分类）；visible 控制商品页标签页显示 */
export interface BusinessProductCategory {
  id: string // bpc_ 前缀；内置 id 固定 product-snack/drink/fruit/daily/clothing
  name: string
  sortOrder: number
  visible: boolean
}

/** 商品 */
export interface BusinessProduct {
  id: string // bp_ 前缀
  name: string
  categoryId?: string // undefined = 未分类
  unit: string
  purchasePrice: number // 进货单价
  sellingPrice: number // 售价
  active: boolean // 在售/停售（停售不出现在收摊带出选择）
  createdAt: string
}

/** 进货记录 */
export interface BusinessPurchase {
  id: string // bpr_ 前缀
  productId: string
  quantity: number
  unitPrice: number
  total: number // quantity × unitPrice（表单自动算）
  date: string // YYYY-MM-DD
  note?: string
  createdAt: string
}

/** 收摊日记录条目：sold = broughtOut - remaining - loss（core 计算，不存储） */
export interface DailyRecordItem {
  productId: string
  broughtOut: number
  remaining: number
  loss: number
}

/** 收摊日记录：date 唯一（upsert 语义）；totalRevenue 由 core 按 items×售价 算好落库 */
export interface BusinessDailyRecord {
  id: string // bd_ 前缀
  date: string // YYYY-MM-DD 本地日期
  items: DailyRecordItem[]
  totalRevenue: number
  note?: string
  createdAt: string
  updatedAt: string
}

/** 支出记录 */
export interface BusinessExpense {
  id: string // be_ 前缀
  date: string // YYYY-MM-DD
  categoryId: string
  amount: number
  note?: string
  createdAt: string
}

/** 销售记账设置 */
export interface BusinessSettings {
  stallName: string // 摊位名称（仅展示）
  lowStockThreshold: number // 低库存预警阈值，默认 20
}

/** 销售记账数据（IndexedDB store 'business'，键 'items'） */
export interface BusinessData {
  productCategories: BusinessProductCategory[]
  expenseCategories: BusinessExpenseCategory[]
  products: BusinessProduct[]
  purchases: BusinessPurchase[]
  dailyRecords: BusinessDailyRecord[]
  expenses: BusinessExpense[]
  settings: BusinessSettings
}

/** 内置支出分类（不可删，可改名/排序/标签页显隐） */
export const DEFAULT_BUSINESS_EXPENSE_CATEGORIES: BusinessExpenseCategory[] = [
  { id: 'expense-stall', name: '摊位费', sortOrder: 1, visible: true, isBuiltIn: true },
  { id: 'expense-gas', name: '燃气费', sortOrder: 2, visible: true, isBuiltIn: true },
  { id: 'expense-seasoning', name: '调料包装', sortOrder: 3, visible: true, isBuiltIn: true },
  { id: 'expense-transport', name: '交通费', sortOrder: 4, visible: true, isBuiltIn: true },
  { id: 'expense-other', name: '其他', sortOrder: 5, visible: true, isBuiltIn: true }
]

/** 内置商品分类（种子可删：删除后该分类商品归未分类） */
export const DEFAULT_BUSINESS_PRODUCT_CATEGORIES: BusinessProductCategory[] = [
  { id: 'product-snack', name: '小吃', sortOrder: 1, visible: true },
  { id: 'product-drink', name: '饮品', sortOrder: 2, visible: true },
  { id: 'product-fruit', name: '水果', sortOrder: 3, visible: true },
  { id: 'product-daily', name: '日用品', sortOrder: 4, visible: true },
  { id: 'product-clothing', name: '服饰', sortOrder: 5, visible: true }
]

