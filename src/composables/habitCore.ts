// 工作台习惯打卡纯逻辑模块：习惯/打卡记录归一化 → 本周完成列表 → 连续天数 → 周达成率。
// 纯函数硬约束：禁止 import vue/pinia（node --experimental-strip-types 测试运行器无法执行）；
// 运行时依赖仅 healthCore 的 weekKeyOf（同为零 vue/pinia 依赖的纯逻辑 core，复用而非复制实现）。
import { weekKeyOf } from './healthCore.ts'

/** 习惯 id 前缀（与 store.addHabit 生成同前缀）。 */
export const HABIT_ID_PREFIX = 'hb_'
/** 打卡记录 id 前缀（与 store 打卡生成同前缀，仿 noteCore nt_/te_ 前缀惯例）。 */
export const HABIT_RECORD_ID_PREFIX = 'hr_'
/** 每周目标次数合法范围 [1,7]（「每日」由组件层映射为 7）。 */
export const HABIT_MIN_FREQUENCY = 1
export const HABIT_MAX_FREQUENCY = 7
/** 习惯默认色：与待办 DEFAULT_TODO_COLOR 同源蓝。 */
export const DEFAULT_HABIT_COLOR = '#3b82f6'

/** 习惯频率：每周目标打卡次数（1-7）。 */
export type HabitFrequency = number

/** 习惯：id 恒 hb_ 前缀；name trim 后非空；frequency 钳到 [1,7]；color '#RGB' 或 '#RRGGBB'。 */
export interface Habit {
  id: string
  name: string
  frequency: HabitFrequency
  color?: string // undefined = 默认蓝
  createdAt: string
}

/** 打卡记录：id 恒 hr_ 前缀；habitId 引用 Habit.id；date 'YYYY-MM-DD' 本地日期。 */
export interface HabitRecord {
  id: string
  habitId: string
  date: string
  createdAt: string
}

/** 双数组数据模型（仿 noteCore NoteData：习惯数组 + 打卡记录数组）。 */
export interface HabitsData {
  habits: Habit[]
  records: HabitRecord[]
}

/** 周达成率：completed=本周实际打卡天数（去重），target=频率目标次数，percent 不截断。 */
export interface WeeklyAttainment {
  completed: number
  target: number
  percent: number
}

/** 缺省 id 兜底（前缀 + 时间戳 + 随机段防批量碰撞，沿用 healthCore genId 风格）。 */
function genId(prefix: string): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 习惯自定义颜色：'#RGB' 或 '#RRGGBB'（大小写均可）。 */
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** 'YYYY-MM-DD' 严格格式校验。 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
function isDateStr(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v)
}

function isoNow(): string {
  return new Date().toISOString()
}

/** 频率归一：非 number/NaN → 1；取整后钳到 [1,7]。 */
function normalizeFrequency(v: unknown): HabitFrequency {
  if (typeof v !== 'number' || !Number.isFinite(v)) return HABIT_MIN_FREQUENCY
  return Math.min(HABIT_MAX_FREQUENCY, Math.max(HABIT_MIN_FREQUENCY, Math.round(v)))
}

/** 空习惯数据：无习惯 + 无打卡记录（返回全新结构，不共享任何引用）。 */
export function emptyHabitsData(): HabitsData {
  return { habits: [], records: [] }
}

/**
 * 单条习惯归一化（幂等）：name trim 后为空 → 剔除（返回 null）；id 缺失/非字符串 → 生成 hb_ 前缀 id；
 * color 非合法 hex → 默认蓝；frequency 非法/越界 → 钳到 [1,7]；createdAt 非法/缺失 → 当前 ISO。脏输入不抛错。
 */
export function normalizeHabit(raw: unknown): Habit | null {
  if (!raw || typeof raw !== 'object') return null
  const h = raw as Record<string, unknown>
  const name = typeof h.name === 'string' ? h.name.trim() : ''
  if (name === '') return null
  return {
    id: typeof h.id === 'string' && h.id !== '' ? h.id : genId(HABIT_ID_PREFIX),
    name,
    frequency: normalizeFrequency(h.frequency),
    color: typeof h.color === 'string' && HEX_COLOR_RE.test(h.color) ? h.color : DEFAULT_HABIT_COLOR,
    createdAt: typeof h.createdAt === 'string' ? h.createdAt : isoNow()
  }
}

/**
 * 单条打卡记录归一化（幂等）：habitId 缺失/空 或 date 非 'YYYY-MM-DD' → 剔除（返回 null）；
 * id 缺失/非字符串 → 生成 hr_ 前缀 id；createdAt 非法/缺失 → 当前 ISO。脏输入不抛错。
 */
export function normalizeHabitRecord(raw: unknown): HabitRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const habitId = typeof r.habitId === 'string' && r.habitId !== '' ? r.habitId : ''
  const date = isDateStr(r.date) ? r.date : ''
  if (habitId === '' || date === '') return null
  return {
    id: typeof r.id === 'string' && r.id !== '' ? r.id : genId(HABIT_RECORD_ID_PREFIX),
    habitId,
    date,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : isoNow()
  }
}

/**
 * 整库归一化（幂等，返回全新结构不改入参）：坏习惯（name trim 为空）剔除；
 * 坏记录（habitId/date 非法）剔除；孤儿记录（引用不存在的习惯）剔除；
 * 同一习惯同一天重复打卡去重（保留首条）。非法入参（null/数字/字符串）→ emptyHabitsData()。
 */
export function normalizeHabitsData(raw: unknown): HabitsData {
  if (!raw || typeof raw !== 'object') return emptyHabitsData()
  const src = raw as Record<string, unknown>
  const habits = Array.isArray(src.habits)
    ? src.habits.map(h => normalizeHabit(h)).filter((h): h is Habit => h !== null)
    : []
  const habitIds = new Set<string>(habits.map(h => h.id))
  const seen = new Set<string>()
  const records: HabitRecord[] = []
  if (Array.isArray(src.records)) {
    for (const rawRecord of src.records) {
      const rec = normalizeHabitRecord(rawRecord)
      if (rec === null) continue
      if (!habitIds.has(rec.habitId)) continue // 孤儿记录剔除
      const key = `${rec.habitId}|${rec.date}`
      if (seen.has(key)) continue // 同日重复打卡去重
      seen.add(key)
      records.push(rec)
    }
  }
  return { habits, records }
}

/**
 * 本周完成列表：date 所在周（周一起点）内该习惯的打卡日期，去重、升序。返回新数组，不改入参。
 * 重复打卡同一天只计一次（同日记录去重）。
 */
export function weekCompletions(records: HabitRecord[], habitId: string, date: string): string[] {
  const week = weekKeyOf(date)
  const seen = new Set<string>()
  const dates: string[] = []
  for (const r of records) {
    if (r.habitId !== habitId) continue
    if (weekKeyOf(r.date) !== week) continue
    if (seen.has(r.date)) continue
    seen.add(r.date)
    dates.push(r.date)
  }
  return dates.sort()
}

/** 日期 +delta 天（'YYYY-MM-DD'）。先 setDate 再取日期组件，防 DST 偏移（仿 healthCore weekKeyOf）。 */
function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 连续打卡天数：以 today 为锚向过去数连续打卡日。今天未打卡不中断连击（从昨天起算）；
 * 今天已打卡则从今天起算；中间断档即停止。同日重复记录只计一天。
 */
export function streakDays(records: HabitRecord[], habitId: string, today: string): number {
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

/** 连续达成结果：count=连击数；unit=单位（'天'=每日习惯，'周'=每周习惯）。 */
export interface StreakResult {
  count: number
  unit: '天' | '周'
}

/** 某周是否达标（completed >= target）；以该周任一日期锚定。 */
function weekMet(records: HabitRecord[], habitId: string, frequency: HabitFrequency, anchor: string): boolean {
  const att = weeklyAttainment(records, habitId, frequency, anchor)
  return att.completed >= att.target
}

/**
 * 连续「周达标」周数：以 today 所在周为锚向过去数连续达标周。
 * 本周尚未达标不中断连击（从上周起算）；中途任一周未达标即停止。
 */
function weekStreak(records: HabitRecord[], habitId: string, frequency: HabitFrequency, today: string): number {
  let cursor = weekKeyOf(today)
  if (!weekMet(records, habitId, frequency, today)) {
    cursor = addDays(cursor, -7)
  }
  let streak = 0
  while (weekMet(records, habitId, frequency, cursor)) {
    streak++
    cursor = addDays(cursor, -7)
  }
  return streak
}

/**
 * 连续达成周期（按频率语义对齐展示）：
 * - 每日习惯（frequency>=7）：连续打卡天数（沿用 streakDays：今天未打卡不中断连击）。
 * - 每周习惯（frequency<7）：连续「周达标」周数（本周未达标不中断连击，从上周起算）。
 */
export function streakOf(
  records: HabitRecord[],
  habitId: string,
  frequency: HabitFrequency,
  today: string
): StreakResult {
  const freq = normalizeFrequency(frequency)
  if (freq >= 7) {
    return { count: streakDays(records, habitId, today), unit: '天' }
  }
  return { count: weekStreak(records, habitId, frequency, today), unit: '周' }
}

/** 周达成率：completed=本周实际打卡天数（去重），target=频率目标次数，percent 不截断。 */
export function weeklyAttainment(
  records: HabitRecord[],
  habitId: string,
  frequency: HabitFrequency,
  date: string
): WeeklyAttainment {
  const completed = weekCompletions(records, habitId, date).length
  const target = normalizeFrequency(frequency)
  return { completed, target, percent: completed / target }
}
