// 学生工作台成就勋章纯逻辑模块。
// 内置 10 枚勋章定义（streak-7/30/100、book-10/50/100、pomo-50/200/500、hw-rate-95），
// 不可编辑、不可手动撤销；解锁由各 store 数据聚合判定（max-streak/reading-count/pomo-count/hw-rate）。
// 零 vue/pinia 运行时依赖，纯函数，node --experimental-strip-types 可测。

import type {
  StudentAchievementCategory,
  StudentAchievementDef,
  StudentAchievementsData,
  StudentHabit,
  StudentHabitRecord,
  StudentHomework,
  StudentReadingEntry
} from '@/types'
import type { PomodoroRecord } from '@/composables/pomodoroCore'

/** 内置勋章 id 集合（load-bearing，store 监听按 id 路由） */
export const BUILTIN_ACHIEVEMENT_IDS: readonly string[] = [
  'streak-7',
  'streak-30',
  'streak-100',
  'book-10',
  'book-50',
  'book-100',
  'pomo-50',
  'pomo-200',
  'pomo-500',
  'hw-rate-95'
]

/** 手动解锁勋章 id 集合（家长模式下发放的特殊勋章；M3 暂为空，家长协同阶段续填） */
export const MANUAL_ACHIEVEMENT_IDS: readonly string[] = []

/** 指标键集合（metric 字段合法值） */
export const KNOWN_METRICS: readonly string[] = [
  'max-streak',
  'reading-count',
  'pomo-count',
  'hw-rate'
]

/** 分类中文标签 */
const CATEGORY_LABELS: Record<StudentAchievementCategory, string> = {
  habit: '习惯',
  study: '学习',
  reading: '阅读',
  pomodoro: '专注'
}

function isoNow(): string {
  return new Date().toISOString()
}

/**
 * 构建内置 10 枚勋章定义（每次返回全新数组，幂等）。
 * id/name/description/emoji/category/metric/target 全部 load-bearing，勿改。
 */
export function buildBuiltinAchievements(): StudentAchievementDef[] {
  return [
    {
      id: 'streak-7',
      name: '一周坚持',
      description: '任意习惯连续打卡 7 天',
      emoji: '🔥',
      category: 'habit',
      metric: 'max-streak',
      target: 7
    },
    {
      id: 'streak-30',
      name: '月度坚持',
      description: '任意习惯连续打卡 30 天',
      emoji: '🌟',
      category: 'habit',
      metric: 'max-streak',
      target: 30
    },
    {
      id: 'streak-100',
      name: '百日坚持',
      description: '任意习惯连续打卡 100 天',
      emoji: '🏆',
      category: 'habit',
      metric: 'max-streak',
      target: 100
    },
    {
      id: 'book-10',
      name: '阅读新手',
      description: '累计完成 10 篇阅读记录',
      emoji: '📚',
      category: 'reading',
      metric: 'reading-count',
      target: 10
    },
    {
      id: 'book-50',
      name: '阅读达人',
      description: '累计完成 50 篇阅读记录',
      emoji: '📖',
      category: 'reading',
      metric: 'reading-count',
      target: 50
    },
    {
      id: 'book-100',
      name: '阅读大师',
      description: '累计完成 100 篇阅读记录',
      emoji: '🎓',
      category: 'reading',
      metric: 'reading-count',
      target: 100
    },
    {
      id: 'pomo-50',
      name: '专注新手',
      description: '累计完成 50 个专注番茄',
      emoji: '⏰',
      category: 'pomodoro',
      metric: 'pomo-count',
      target: 50
    },
    {
      id: 'pomo-200',
      name: '专注达人',
      description: '累计完成 200 个专注番茄',
      emoji: '⚡',
      category: 'pomodoro',
      metric: 'pomo-count',
      target: 200
    },
    {
      id: 'pomo-500',
      name: '专注大师',
      description: '累计完成 500 个专注番茄',
      emoji: '💎',
      category: 'pomodoro',
      metric: 'pomo-count',
      target: 500
    },
    {
      id: 'hw-rate-95',
      name: '作业标兵',
      description: '作业完成率达 95%（至少 10 篇作业）',
      emoji: '✅',
      category: 'study',
      metric: 'hw-rate',
      target: 95
    }
  ]
}

/** 空成就数据 */
export function emptyAchievementsData(): StudentAchievementsData {
  return { definitions: [], unlocked: {} }
}

/**
 * 单条勋章定义归一化（幂等）：id/name/description/emoji 必填（trim 后非空）；
 * category/metric 必为已知枚举；target 钳到 ≥1 正整数；非法返回 null。
 */
export function normalizeAchievementDef(raw: unknown): StudentAchievementDef | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const id = typeof d.id === 'string' ? d.id.trim() : ''
  const name = typeof d.name === 'string' ? d.name.trim() : ''
  const description = typeof d.description === 'string' ? d.description.trim() : ''
  const emoji = typeof d.emoji === 'string' ? d.emoji.trim() : ''
  if (!id || !name || !description || !emoji) return null
  const category: StudentAchievementCategory | undefined =
    typeof d.category === 'string' && (['habit', 'study', 'reading', 'pomodoro'] as readonly string[]).includes(d.category)
      ? (d.category as StudentAchievementCategory)
      : undefined
  if (!category) return null
  const metric: string | undefined =
    typeof d.metric === 'string' && (KNOWN_METRICS as readonly string[]).includes(d.metric)
      ? d.metric
      : undefined
  if (!metric) return null
  const targetNum = typeof d.target === 'number' ? d.target : Number(d.target)
  if (!Number.isFinite(targetNum) || targetNum < 1) return null
  const target = Math.max(1, Math.floor(targetNum))
  return { id, name, description, emoji, category, metric, target }
}

/**
 * 整库归一化（幂等，不改入参）：
 * - definitions：仅保留合法定义；按内置顺序排序（内置在前，未知剔除）；
 * - unlocked：仅保留合法 ISO 时间戳字符串；
 * 非对象/数组输入 → emptyAchievementsData()。
 */
export function normalizeAchievementsData(raw: unknown): StudentAchievementsData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyAchievementsData()
  const src = raw as Record<string, unknown>
  const defsRaw = Array.isArray(src.definitions) ? src.definitions : []
  const normalized = defsRaw
    .map(normalizeAchievementDef)
    .filter((d): d is StudentAchievementDef => d !== null)
  // 内置顺序优先；重复 id 首次出现优先
  const seen = new Set<string>()
  const orderMap = new Map<string, number>()
  BUILTIN_ACHIEVEMENT_IDS.forEach((id, idx) => orderMap.set(id, idx))
  const sortedDefs = [...normalized]
    .filter(d => {
      if (seen.has(d.id)) return false
      seen.add(d.id)
      return true
    })
    .sort((a, b) => {
      const oa = orderMap.has(a.id) ? orderMap.get(a.id)! : 999
      const ob = orderMap.has(b.id) ? orderMap.get(b.id)! : 999
      if (oa !== ob) return oa - ob
      return a.id.localeCompare(b.id)
    })
  const unlockedRaw = src.unlocked
  const unlocked: Record<string, string> = {}
  if (unlockedRaw && typeof unlockedRaw === 'object' && !Array.isArray(unlockedRaw)) {
    for (const [id, ts] of Object.entries(unlockedRaw as Record<string, unknown>)) {
      if (typeof ts !== 'string') continue
      const trimmedTs = ts.trim()
      if (!trimmedTs) continue
      // ISO 粗校验（YYYY-MM-DDTHH:mm:ss...）；非法跳过
      if (!/^\d{4}-\d{2}-\d{2}T/.test(trimmedTs)) continue
      unlocked[id] = trimmedTs
    }
  }
  return { definitions: sortedDefs, unlocked }
}

/**
 * 合并内置勋章到现有定义列表（幂等，不改入参）：
 * - 缺失内置定义补齐（追加到末尾）；
 * - 已存在内置 id 保留现有项（不改）；
 * - 未知非内置定义保留（手动解锁类后续支持）。
 */
export function mergeBuiltinAchievements(existing: StudentAchievementDef[]): StudentAchievementDef[] {
  const builtin = buildBuiltinAchievements()
  const existingIds = new Set(existing.map(d => d.id))
  const merged = [...existing]
  for (const def of builtin) {
    if (!existingIds.has(def.id)) {
      merged.push(def)
      existingIds.add(def.id)
    }
  }
  // 重新排序：内置在前，按内置顺序，未知在末
  const orderMap = new Map<string, number>()
  BUILTIN_ACHIEVEMENT_IDS.forEach((id, idx) => orderMap.set(id, idx))
  return [...merged].sort((a, b) => {
    const oa = orderMap.has(a.id) ? orderMap.get(a.id)! : 999
    const ob = orderMap.has(b.id) ? orderMap.get(b.id)! : 999
    if (oa !== ob) return oa - ob
    return a.id.localeCompare(b.id)
  })
}

// ---- 跨 store 指标聚合纯函数 ----

/** 'YYYY-MM-DD' 严格格式校验 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 日期 +delta 天（'YYYY-MM-DD'）。仿 habitCore.addDays 防 DST 偏移。 */
function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 单个习惯连续打卡天数：以 today 为锚向过去数连续打卡日。
 * 仿 habitCore.streakDays（同日重复只计一天，today 未打卡不中断从昨起算）。
 */
function habitStreakDays(records: readonly StudentHabitRecord[], habitId: string, today: string): number {
  if (!DATE_RE.test(today)) return 0
  const dates = new Set<string>()
  for (const r of records) {
    if (r.habitId === habitId) dates.add(r.date)
  }
  let cursor = dates.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (dates.has(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

/**
 * 习惯勋章指标：所有习惯中最大连续打卡天数（max-streak）。
 * 遍历所有 habit，对每个取 streakDays 最大值；空 habits/records 返回 0。
 */
export function calcMaxStreak(
  habits: readonly StudentHabit[],
  records: readonly StudentHabitRecord[],
  today: string
): number {
  if (habits.length === 0 || records.length === 0) return 0
  let max = 0
  for (const h of habits) {
    const s = habitStreakDays(records, h.id, today)
    if (s > max) max = s
  }
  return max
}

/** 阅读勋章指标：累计阅读记录条目数（reading-count）。 */
export function calcTotalReadingEntries(entries: readonly StudentReadingEntry[]): number {
  return entries.length
}

/**
 * 番茄钟勋章指标：累计专注番茄数（pomo-count）。
 * PomodoroRecord.workSessions 每条记录求和，最小 0 防 NaN/负数。
 */
export function calcTotalPomoSessions(records: readonly PomodoroRecord[]): number {
  let total = 0
  for (const r of records) {
    const n = typeof r.workSessions === 'number' ? r.workSessions : Number(r.workSessions)
    if (Number.isFinite(n) && n > 0) total += Math.floor(n)
  }
  return total
}

/**
 * 作业勋章指标：作业完成率百分比（hw-rate，0-100 整数）。
 * 完成率 = done / total * 100；total=0 返回 0。
 * 注意：PRD 约定 hw-rate-95 需 ≥10 篇作业门槛——本函数仅算百分比，门槛判定由调用方决定；
 * 但为简化，本函数返回完成率，进度计算 calcProgressPercent 内会再次校验 total ≥ 10。
 */
export function calcHwCompletionRate(entries: readonly StudentHomework[]): number {
  const total = entries.length
  if (total === 0) return 0
  const done = entries.filter(e => e.status === 'done').length
  return Math.round((done / total) * 100)
}

/** 作业总数（用于门槛校验，PRD 要求 hw-rate-95 需 ≥10 篇作业） */
export function calcHwTotal(entries: readonly StudentHomework[]): number {
  return entries.length
}

/** 指标聚合结果（4 个核心字段 + hw-total 门槛，跨 store 聚合后传入） */
export interface AchievementMetrics {
  'max-streak': number
  'reading-count': number
  'pomo-count': number
  'hw-rate': number
  /** 作业总数（hw-rate-95 门槛校验用） */
  'hw-total': number
}

/**
 * 按 metric 取当前进度值（绝对数；hw-rate 取百分比整数）。
 * 不在 KNOWN_METRICS 中的 metric 返回 0。
 */
export function metricValue(metric: string, metrics: AchievementMetrics): number {
  switch (metric) {
    case 'max-streak': return metrics['max-streak']
    case 'reading-count': return metrics['reading-count']
    case 'pomo-count': return metrics['pomo-count']
    case 'hw-rate': return metrics['hw-rate']
    default: return 0
  }
}

/**
 * 计算单条勋章当前进度百分比（0-100 整数）。
 * - 已解锁返回 100；
 * - hw-rate-95 特殊：作业总数 < 10 → 进度按 (hw-total/10 * 50) + (rate/95) * 50 上限 99（达不到门槛不算达成）；
 *   即门槛未达时进度条显示半段；
 * - 其他勋章：current / target * 100；
 * - target ≤ 0 → 100（防御性）；
 * - 不已知 metric → 0。
 */
export function calcProgressPercent(
  def: StudentAchievementDef,
  metrics: AchievementMetrics,
  isUnlocked: boolean
): number {
  if (isUnlocked) return 100
  if (def.target <= 0) return 100
  if (def.id === 'hw-rate-95') {
    const total = metrics['hw-total']
    const rate = metrics['hw-rate']
    if (total < 10) {
      // 门槛未达：作业数进度占 50%，完成率占 50%（封顶 99）
      const totalPart = Math.min(50, (total / 10) * 50)
      const ratePart = Math.min(50, (rate / def.target) * 50)
      return Math.min(99, Math.floor(totalPart + ratePart))
    }
    return Math.min(100, Math.floor((rate / def.target) * 100))
  }
  const cur = metricValue(def.metric, metrics)
  return Math.min(100, Math.floor((cur / def.target) * 100))
}

/**
 * 判定单条勋章是否达成（达成即可解锁）。
 * - hw-rate-95 特殊：total ≥ 10 且 rate ≥ 95；
 * - 其他：metricValue ≥ target。
 */
export function isAchievementEarned(
  def: StudentAchievementDef,
  metrics: AchievementMetrics
): boolean {
  if (def.id === 'hw-rate-95') {
    return metrics['hw-total'] >= 10 && metrics['hw-rate'] >= def.target
  }
  return metricValue(def.metric, metrics) >= def.target
}

/**
 * 扫描所有未解锁勋章，返回新达成的 id 列表（不含已解锁）。
 * 不修改入参，仅返回字符串数组（调用方写 unlocked）。
 */
export function checkUnlocks(
  defs: readonly StudentAchievementDef[],
  unlocked: Record<string, string>,
  metrics: AchievementMetrics
): string[] {
  const out: string[] = []
  for (const def of defs) {
    if (unlocked[def.id]) continue // 已解锁跳过
    if (isAchievementEarned(def, metrics)) {
      out.push(def.id)
    }
  }
  return out
}

// ---- 视图辅助（不改入参）----

/** 分类筛选：'all' 返回全量副本；其他精确匹配 category。 */
export function filterByCategory(
  defs: readonly StudentAchievementDef[],
  category: 'all' | StudentAchievementCategory
): StudentAchievementDef[] {
  if (category === 'all') return [...defs]
  return defs.filter(d => d.category === category)
}

/** 分类中文标签 */
export function categoryLabel(category: StudentAchievementCategory): string {
  return CATEGORY_LABELS[category] ?? category
}

/** 勋章统计：总数 / 已解锁数 / 未解锁数 / 完成率（0-100 整数） */
export interface AchievementStats {
  total: number
  unlocked: number
  locked: number
  /** 完成率 0-100 整数，total=0 → 0 */
  rate: number
  /** 是否全部解锁（total > 0 且 unlocked === total） */
  allUnlocked: boolean
}

export function calcAchievementStats(
  defs: readonly StudentAchievementDef[],
  unlocked: Record<string, string>
): AchievementStats {
  const total = defs.length
  let unlockedCount = 0
  for (const def of defs) {
    if (unlocked[def.id]) unlockedCount++
  }
  const locked = total - unlockedCount
  const rate = total > 0 ? Math.round((unlockedCount / total) * 100) : 0
  return { total, unlocked: unlockedCount, locked, rate, allUnlocked: total > 0 && unlockedCount === total }
}

/** 格式化解锁时间为本地可读字符串（YYYY-MM-DD HH:mm） */
export function formatUnlockTime(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// isoNow 重导出（store 复用）
export { isoNow as isoNowForAchievements }
