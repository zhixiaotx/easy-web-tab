import type { PomodoroData } from '../composables/pomodoroCore'

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

// 工作台主页单张卡片的自定义布局（三项均可选：缺失 = 用组件默认）
export interface HomeCardLayout {
  w?: number // 列跨度（1 = 占 1 列；上限由所属网格列数决定）
  h?: number // 最小高度（px；内容更高时自动撑开）
  o?: number // 同容器内排序值（越小越靠前；默认按内置初始顺序）
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
  businessActiveSection?: string       // 销售记账工作台当前模块（home/products/purchases/daily/expenses/inventory/stats；缺失 = 首页）
  studentPageName?: string             // 学生工作台页面自定义名称（默认 '学生工作台'）
  studentPageVisible?: boolean         // 学生工作台页面可见性开关（默认 true；缺失 = 显示）
  cloudSyncEnabled?: boolean           // 云同步总开关（默认 false）
  cloudSyncUrl?: string                // WebDAV URL（空串 = 未配置）
  cloudSyncUsername?: string           // WebDAV 用户名（空串 = 未配置）
  cloudSyncPassword?: string           // WebDAV 应用密码（空串 = 未配置，存 IDB 非 localStorage）
  cloudSyncInterval?: number           // 后台定时同步间隔（0 = 仅触发式，>0 = 分钟数）
  cloudSyncSilentThreshold?: number    // 静默合并阈值（本地与云端差异字符数 < 此值时后台静默合并，0=永不静默，默认 1000）
  homeCardLayout?: Record<string, HomeCardLayout> // 工作台主页卡片布局（卡片 id → 列跨度/最小高度/排序）
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

/** 身高记录（学生工作台「健康管理」第 5 个标签页专属；成年端健康管理不使用） */
export interface HeightRecord {
  id: string
  module: 'height'
  date: string
  heightCm: number
  note?: string
  createdAt: string
  updatedAt: string
}

export type HealthRecord = ExerciseRecord | DietRecord | SleepRecord | WeightRecord

/** 学生健康管理记录联合（成人 4 模块 + 身高） */
export type StudentHealthRecord = HealthRecord | HeightRecord

/** 学生健康管理模块键（health store records 的子键集合） */
export type StudentHealthModule = HealthModule | 'height'

/** 学生健康管理 Tabs 键（顺序即渲染顺序：成人 4 项 + 身高） */
export const STUDENT_HEALTH_TABS = ['exercise', 'diet', 'sleep', 'weight', 'height'] as const

/** 学生健康数据形状：与 HealthData 同源，records 额外含 height（严格隔离于成人 'health' store） */
export interface StudentHealthData {
  height?: number
  plans: HealthPlans
  records: {
    exercise: ExerciseRecord[]
    diet: DietRecord[]
    sleep: SleepRecord[]
    weight: WeightRecord[]
    height: HeightRecord[]
  }
}

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
  transactionCount?: number // 当日交易笔数（顾客买单次数）；新增字段，旧数据缺省按 0 处理
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
  monthlyRevenueTarget: number // 本月营业额目标（0 = 未设定，不显示进度环）
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

// ==================== 学生工作台 ====================

/** 学段：K=幼儿园 / P=小学 / J=初中 */
export type StudentStage = 'K' | 'P' | 'J'

/** 教育经历条目 */
export interface EducationEntry {
  id: string
  schoolName: string
  degree: string
  major?: string
  startDate: string
  endDate?: string
  isActive: boolean
  classTeacher?: string
  courseTeacher?: string
  phone?: string
  note?: string
  createdAt: string
  updatedAt: string
}

/** 教育经历数据（IDB store 'student_education' 单对象 { entries }） */
export interface EducationData {
  entries: EducationEntry[]
}

/** 学历/学段选项（教育经历下拉） */
export const DEGREE_OPTIONS = ['幼儿园', '小学', '初中', '高中', '中职', '专科', '本科', '硕士', '博士'] as const
export type EducationDegree = typeof DEGREE_OPTIONS[number]

/** 学生工作台菜单键集合（16 项；home 恒居首位，开关锁定不可关） */
export const STUDENT_MENU_KEYS: readonly string[] = [
  'home',
  'habits',
  'homework',
  'timetable',
  'plan',
  'review',
  'mistakes',
  'reading',
  'exam',
  'grades',
  'education',
  'diary',
  'health',
  'pomodoro',
  'achievements',
  'rewards',
  'parent'
]

/** 默认菜单顺序（home 首位，与键集合一致） */
export const STUDENT_MENU_DEFAULT_ORDER: readonly string[] = [...STUDENT_MENU_KEYS]

/** 学生菜单默认名称（逐字一致，load-bearing） */
export const STUDENT_MENU_DEFAULT_LABELS: Record<string, string> = {
  home: '主页',
  habits: '习惯打卡',
  homework: '作业管理',
  timetable: '课程表',
  plan: '学习计划',
  review: '复习计划',
  mistakes: '错题本',
  reading: '阅读记录',
  exam: '考试倒计时',
  grades: '成绩记录',
  education: '教育经历',
  diary: '日记本',
  health: '健康管理',
  pomodoro: '番茄钟',
  achievements: '成就勋章',
  rewards: '奖励积分',
  parent: '家长协同'
}

/** 学生菜单图标映射（Icon.vue 查表键名） */
export const STUDENT_MENU_ICONS: Record<string, string> = {
  home: 'home',
  habits: 'habits',
  homework: 'todos',
  timetable: 'countdowns',
  plan: 'notes',
  review: 'diary',
  mistakes: 'passwords',
  reading: 'notes',
  exam: 'countdowns',
  grades: 'ledger',
  education: 'diary',
  diary: 'diary',
  health: 'health',
  pomodoro: 'pomodoro',
  achievements: 'habits',
  rewards: 'ledger',
  parent: 'health'
}

/** 学段-菜单可见性矩阵：true=默认显示 / false=默认隐藏（用户可在设置内单独开启） */
export const STAGE_MENU_VISIBILITY: Record<StudentStage, Record<string, boolean>> = {
  K: {
    home: true, habits: true, homework: false, timetable: false, plan: false,
    review: false, mistakes: false, reading: true, exam: false, education: true,
    diary: true, health: true, pomodoro: false, achievements: true, rewards: true, parent: true,
    grades: false
  },
  P: {
    home: true, habits: true, homework: true, timetable: true, plan: false,
    review: false, mistakes: false, reading: true, exam: false, education: true,
    diary: true, health: true, pomodoro: false, achievements: true, rewards: true, parent: true,
    grades: true
  },
  J: {
    home: true, habits: false, homework: true, timetable: true, plan: true,
    review: true, mistakes: true, reading: true, exam: true, education: true,
    diary: true, health: true, pomodoro: true, achievements: false, rewards: false, parent: false,
    grades: true
  }
}

/** 学段默认学科清单（小学 3 科 / 初中 9 科；K 无学科） */
export const STAGE_DEFAULT_SUBJECTS: Record<StudentStage, string[]> = {
  K: [],
  P: ['语文', '数学', '英语'],
  J: ['语文', '数学', '英语', '政治', '历史', '地理', '生物', '物理', '化学']
}

/** 学段默认习惯种子（K 7 项 / P 6 项 / J 5 项） */
export const STAGE_DEFAULT_HABITS: Record<StudentStage, { name: string; category: string }[]> = {
  K: [
    { name: '刷牙', category: 'life' },
    { name: '洗脸', category: 'life' },
    { name: '收拾玩具', category: 'life' },
    { name: '阅读绘本', category: 'study' },
    { name: '早睡早起', category: 'life' },
    { name: '运动', category: 'exercise' },
    { name: '家务', category: 'life' }
  ],
  P: [
    { name: '写作业', category: 'study' },
    { name: '复习', category: 'study' },
    { name: '阅读', category: 'study' },
    { name: '运动', category: 'exercise' },
    { name: '家务', category: 'life' },
    { name: '早睡早起', category: 'life' }
  ],
  J: [
    { name: '自主学习', category: 'study' },
    { name: '复习错题', category: 'study' },
    { name: '运动', category: 'exercise' },
    { name: '阅读', category: 'study' },
    { name: '早睡', category: 'life' }
  ]
}

/** 学段默认番茄钟时长（分钟）：小学 25+5 / 初中 50+10 */
export const STAGE_DEFAULT_POMODORO: Record<StudentStage, { focus: number; break: number }> = {
  K: { focus: 15, break: 5 },
  P: { focus: 25, break: 5 },
  J: { focus: 50, break: 10 }
}

/** 学段徽标配置 */
export const STAGE_BADGE: Record<StudentStage, { label: string; color: string }> = {
  K: { label: 'K', color: '#f59e0b' },
  P: { label: 'P', color: '#3b82f6' },
  J: { label: 'J', color: '#a855f7' }
}

/** 学生工作台设置（IDB store 'student_settings' 单对象） */
export interface StudentSettings {
  stage: StudentStage          // 当前学段
  nickname?: string            // 学生昵称（1-12 code point；缺失回退「同学」）
  studentNo?: string           // 学号（选填）
  school?: string              // 学校名（选填）
  grade?: string               // 年级（选填）
  birthday?: string            // 出生日期 YYYY-MM-DD（选填；主页顶部据此计算年龄）
  /** 菜单顺序（home 恒 index 0；归一化保证恒 15 项） */
  menuOrder?: string[]
  /** 菜单改名（key → 自定义名） */
  menuLabels?: Record<string, string>
  /** 菜单可见性（key → 显示开关；缺失=显示） */
  menuVisibility?: Record<string, boolean>
  /** 学段默认值播种标记：值 !== stage 时触发默认学科/习惯/番茄钟播种 */
  stageSeeded?: StudentStage
  /** 学科清单（自定义增删；学段切换自动播种默认学科） */
  subjects?: string[]
  /** 家长 PIN（PBKDF2 派生密钥 hex；K/P 段使用，J 段隐藏家长入口） */
  parentPinSalt?: string
  parentPinVerification?: string
  /** 家长模式锁定截止时间戳（PIN 连续输错 5 次后 5 分钟锁定） */
  parentLockedUntil?: number
  /** 连续 PIN 输错次数（验证成功或锁定到期后清零） */
  parentPinFailedAttempts?: number
}

/** 学生设置空数据工厂 */
export function emptyStudentSettings(): StudentSettings {
  return { stage: 'P' }
}

/** 学生工作台数据导出/导入格式（独立信封，与 WorkbenchData 隔离） */
export const STUDENT_DATA_VERSION = 1

export interface StudentBackupData {
  type: 'student-backup'
  version: number
  exportedAt: string
  stage: StudentStage
  studentSettings: StudentSettings
  // M2-M4 各模块数据（强类型，归一化后读写）
  homework?: StudentHomeworkData
  timetable?: StudentTimetableData
  plans?: StudentPlanData
  review?: StudentReviewData
  mistakes?: StudentMistakesData
  reading?: StudentReadingData
  achievements?: StudentAchievementsData
  rewards?: StudentRewardsData
  // 共享 store 独立副本（严格隔离）
  studentHabits?: StudentHabitsData
  studentDiary?: DiaryData
  studentPomodoro?: PomodoroData
  studentCountdowns?: { countdowns: Countdown[]; customCategories?: string[]; sortRule?: string }
  clientId?: string
  pushedAt?: number
  prefs?: Record<string, string>
}

// ==================== 学生模块数据接口（M2-M4） ====================

/** 习惯内置分类：life/study/exercise；用户可增删自定义（string 类型） */
export const STUDENT_HABIT_BUILTIN_CATEGORIES = ['life', 'study', 'exercise'] as const
export type StudentHabitCategory = string

/** 学生习惯：扩展成人 Habit 加 category 字段（学段默认播种用） */
export interface StudentHabit {
  id: string               // 前缀 shb_
  name: string             // 1-15 code point，同分类内唯一
  category: StudentHabitCategory  // life/study/exercise/自定义；空串=未分类
  frequency: number        // 每周目标打卡次数 1-7
  color?: string
  createdAt: string
}

/** 学生习惯打卡记录（与成人 HabitRecord 同构，前缀 shr_） */
export interface StudentHabitRecord {
  id: string
  habitId: string
  date: string             // 'YYYY-MM-DD' 本地日期
  parentMarked?: boolean   // 家长代打卡标记
  createdAt: string
}

/** 学生习惯数据模型（双数组，IDB store 'student_habits'） */
export interface StudentHabitsData {
  habits: StudentHabit[]
  records: StudentHabitRecord[]
}

/** 作业状态：pending 待办 / doing 进行中 / done 已完成 / overdue 逾期 */
export type StudentHomeworkStatus = 'pending' | 'doing' | 'done' | 'overdue'

/** 作业优先级 */
export type StudentHomeworkPriority = 'low' | 'normal' | 'high'

/** 学生作业（IDB store 'student_homework'，数组，前缀 hw_） */
export interface StudentHomework {
  id: string
  subject: string          // 学科，来自 student_settings.subjects
  title: string            // 1-50 字符，必填
  content?: string         // 详细描述
  dueDate: string          // 'YYYY-MM-DD' 本地日期，必填
  status: StudentHomeworkStatus
  priority: StudentHomeworkPriority
  source?: 'self' | 'parent'  // 来源标记（家长代为新增）
  completedAt?: string
  createdAt: string
  updatedAt: string
}

/** 学生作业数据（数组模型，IDB 单对象 { entries }） */
export interface StudentHomeworkData {
  entries: StudentHomework[]
}

/** 课程表单节课（IDB store 'student_timetable' 单对象 schedule 字典） */
export interface StudentTimetableCell {
  subject: string          // 学科
  teacher?: string        // 1-20 字符
  room?: string           // 1-20 字符
  startHHMM: string       // 'HH:MM'
  endHHMM: string         // 'HH:MM'，> startHHMM
}

/** 课程表 schedule：key = `${dayOfWeek}_${period}`（1-7_1-12） */
export type StudentTimetableSchedule = Record<string, StudentTimetableCell>

/** 学生课程表数据（IDB store 'student_timetable'，单对象） */
export interface StudentTimetableData {
  version: number
  weeks: number           // 学周数
  periodsPerDay: number   // 每日节数 1-12
  classroom?: string      // 学生所在教室/班级（全局，非按课）
  schedule: StudentTimetableSchedule
}

/** 学生计划类型 */
export type StudentPlanType = 'weekly' | 'monthly' | 'term'

/** 计划目标（含进度 0-100） */
export interface StudentPlanGoal {
  id: string              // 前缀 pg_
  content: string         // 1-100 字符
  progress: number        // 0-100 整数，递增不递减
  done: boolean
}

/** 学生计划（IDB store 'student_plans'，数组，前缀 pl_） */
export interface StudentPlan {
  id: string
  type: StudentPlanType
  title: string           // 1-50 字符
  startDate: string      // 'YYYY-MM-DD'
  endDate: string        // 'YYYY-MM-DD'，> startDate
  goals: StudentPlanGoal[]
  review?: string         // 复盘 Markdown，最长 5000 字符
  createdAt: string
  updatedAt: string
}

export interface StudentPlanData {
  entries: StudentPlan[]
}

/** 艾宾浩斯复习阶段间隔（天）：1/2/4/7/15/30 */
export const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30] as const
export const REVIEW_MAX_STAGE = REVIEW_INTERVALS.length

/** 学生复习条目（IDB store 'student_review'，数组，前缀 rv_） */
export interface StudentReviewItem {
  id: string
  subject: string
  knowledge: string       // 1-200 字符
  source?: string         // 来源：教材 P45 / 错题本 等
  learnDate: string       // 初学日期 'YYYY-MM-DD'，≤ today
  stage: number           // 1-6，递增
  nextReviewDate: string  // 自动计算
  mastered: boolean
  createdAt: string
  updatedAt: string
}

export interface StudentReviewData {
  entries: StudentReviewItem[]
}

/** 错题状态 */
export type StudentMistakeStatus = 'new' | 'reviewing' | 'mastered'

/** 学生错题（IDB store 'student_mistakes'，数组，前缀 mk_） */
export interface StudentMistake {
  id: string
  subject: string
  title?: string          // 题目标题
  question: string        // Markdown 题干，必填（或图片必填）
  answer: string          // Markdown 正确答案
  analysis?: string       // Markdown 解析
  tags: string[]          // 0-10 个，每个 1-20 字符
  imageIds: string[]      // 关联 student_images store 的 Blob id
  status: StudentMistakeStatus
  linkedReviewId?: string  // 关联 student_review 条目 id
  createdAt: string
  updatedAt: string
}

export interface StudentMistakesData {
  entries: StudentMistake[]
}

/** 学生阅读记录（IDB store 'student_reading'，数组，前缀 rd_） */
export interface StudentReadingEntry {
  id: string
  bookTitle: string      // 1-50 字符
  pages: number          // 1-999
  durationMin: number    // 1-480 分钟
  impression?: string    // Markdown 感悟，最长 2000 字符
  date: string           // 'YYYY-MM-DD'，≤ today
  parentSigned?: boolean // 家长签字标记（K 段强制 / P 1-3 年级可选）
  signedAt?: string
  createdAt: string
  updatedAt: string
}

export interface StudentReadingData {
  entries: StudentReadingEntry[]
}

/** 勋章分类 */
export type StudentAchievementCategory = 'habit' | 'study' | 'reading' | 'pomodoro'

/** 勋章定义（内置 10 枚，不可编辑） */
export interface StudentAchievementDef {
  id: string              // streak-7/streak-30/.../hw-rate-95
  name: string
  description: string
  emoji: string
  category: StudentAchievementCategory
  /** 进度计算函数标识（store 监听时按 id 路由） */
  metric: string
  target: number
}

/** 学生成就数据（IDB store 'student_achievements'，单对象） */
export interface StudentAchievementsData {
  definitions: StudentAchievementDef[]
  unlocked: Record<string, string>  // id → 解锁时间 ISO
}

/** 奖励项（家长配置） */
export interface StudentRewardItem {
  id: string              // 前缀 rw_
  name: string            // 1-30 字符，唯一
  cost: number            // 1-9999 正整数
  stock?: number          // 0=售罄
}

/** 奖励交易记录 */
export interface StudentRewardTxn {
  id: string              // 前缀 rt_
  type: 'earn' | 'redeem'
  points: number          // earn + / redeem -
  reason: string
  rewardId?: string
  /** autoEarn 幂等去重标识（如 habit:${habitId}:${date}）；手动加分不传 */
  sourceId?: string
  createdAt: string
}

/** 学生奖励数据（IDB store 'student_rewards'，单对象） */
export interface StudentRewardsData {
  totalPoints: number
  history: StudentRewardTxn[]
  rewards: StudentRewardItem[]
}

/** 家长每日任务项（家长协同模式下配置） */
export interface StudentParentTask {
  id: string              // 前缀 pt_
  title: string
  date: string            // 'YYYY-MM-DD'
  done: boolean
  source: 'parent'
}

/** 家长任务数据（IDB store 'student_parent_tasks'，单对象） */
export interface StudentParentTasksData {
  tasks: StudentParentTask[]
}

// ==================== 学生成绩记录 ====================

/** 成绩考试类型（录入下拉预设；用户可自由输入自定义类型） */
export const GRADE_EXAM_TYPES: readonly string[] = ['期中', '期末', '月考', '单元测试', '随堂测验']

/** 单条成绩（某次考试中某一科目的分数） */
export interface StudentGradeSubject {
  /** 学科名（对齐 settings.subjects） */
  subject: string
  /** 得分 */
  score: number
  /** 满分，缺省 100 */
  fullScore?: number
}

/** 一次考试的成绩记录（含多科目分数） */
export interface StudentGradeRecord {
  id: string
  /** 考试名称，如「2026春季期中考试」 */
  examName: string
  /** 考试类型：GRADE_EXAM_TYPES 之一或自定义 */
  examType: string
  /** 考试日期 'YYYY-MM-DD' */
  date: string
  subjects: StudentGradeSubject[]
  createdAt: string
  updatedAt: string
}

/** 成绩数据信封（IDB store 'student_grades'） */
export interface StudentGradesData {
  grades: StudentGradeRecord[]
}

// ==================== 云同步多文件信封（v10 拆分） ====================

/**
 * AppSettingsData 去除 cloudSync 凭证/开关 4 字段后的类型（WorkbenchSyncData.settings 专用）。
 * 仅剔除必须本机保留的：cloudSyncEnabled / cloudSyncUrl / cloudSyncUsername / cloudSyncPassword，
 * 避免覆盖其他设备的云同步凭证与开关。
 * 注意：cloudSyncInterval（自动同步间隔）与 cloudSyncSilentThreshold（静默合并阈值）属同步偏好，
 * 随 workbench.json 的 settings 字段跨设备同步，不在此剔除。
 */
export type AppSettingsDataNoCloudSync = Omit<
  AppSettingsData,
  'cloudSyncEnabled' | 'cloudSyncUrl' | 'cloudSyncUsername' | 'cloudSyncPassword'
>

/** NavSyncData：导航（localStorage 偏好打包）同步信封 */
export interface NavSyncData {
  version: 1
  exportedAt: string
  clientId?: string
  pushedAt?: number
  prefs: Record<string, string>
}

/** IconsSyncData：自定义图标同步信封 */
export interface IconsSyncData {
  version: 1
  exportedAt: string
  clientId?: string
  pushedAt?: number
  icons: Array<{
    id: string
    name: string
    label: string
    dataUrl: string
    category: string
    createdAt: string
  }>
}

/** WorkbenchSyncData：工作台数据同步信封（business 独立走 business.json；settings 不含 cloudSync* 5 字段） */
export interface WorkbenchSyncData {
  version: 1
  exportedAt: string
  clientId?: string
  pushedAt?: number
  todos: WorkbenchTodo[]
  notes: NoteData
  diary: DiaryData
  countdowns: Countdown[]
  passwords: string
  health: HealthData
  ledger: LedgerData
  settings: AppSettingsDataNoCloudSync
  pomodoro?: unknown
  habits?: unknown
  passwordsSalt?: string
  passwordVerification?: string
  prefs?: Record<string, string>
}

/** BusinessSyncData：销售记账独立同步信封 */
export interface BusinessSyncData {
  version: 1
  exportedAt: string
  clientId?: string
  pushedAt?: number
  business: BusinessData
}

/** StudentSyncData：学生工作台独立同步信封（16 store 字段名映射，逐字段透传为 unknown） */
export interface StudentSyncData {
  version: 1
  exportedAt: string
  clientId?: string
  pushedAt?: number
  studentSettings?: unknown
  studentHabits?: unknown
  studentPomodoro?: unknown
  studentDiary?: unknown
  studentCountdowns?: unknown
  homework?: unknown
  timetable?: unknown
  plans?: unknown
  review?: unknown
  mistakes?: unknown
  reading?: unknown
  achievements?: unknown
  rewards?: unknown
  parentTasks?: unknown
  education?: unknown
  health?: unknown
  studentImages?: unknown
  studentGrades?: unknown
}

