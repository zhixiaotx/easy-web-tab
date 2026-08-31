// 学生工作台习惯打卡纯逻辑模块。
// 扩展成人 habitCore：StudentHabit 加 category 字段、StudentHabitRecord 加 parentMarked；
// 复用 habitCore 连续天数/周达成率/本周完成列表纯函数（结构类型兼容，StudentHabitRecord 可赋值给 HabitRecord）。
// 学段默认习惯播种决策：shouldSeedStageHabits + buildStageSeedHabits（K 7 项 / P 6 项 / J 5 项）。
// 零 vue/pinia 运行时依赖，纯函数。

import {
  HABIT_MAX_FREQUENCY,
  HABIT_MIN_FREQUENCY,
  DEFAULT_HABIT_COLOR,
  weekCompletions as weekCompletionsCore,
  weeklyAttainment as weeklyAttainmentCore,
  streakOf as streakOfCore,
  type HabitFrequency,
  type StreakResult,
  type WeeklyAttainment
} from './habitCore'
import {
  STUDENT_HABIT_BUILTIN_CATEGORIES,
  STAGE_DEFAULT_HABITS,
  type StudentHabit,
  type StudentHabitCategory,
  type StudentHabitRecord,
  type StudentHabitsData,
  type StudentStage
} from '@/types'

/** 学生习惯 id 前缀（区别成人 hb_） */
export const STUDENT_HABIT_ID_PREFIX = 'shb_'
/** 学生打卡记录 id 前缀（区别成人 hr_） */
export const STUDENT_HABIT_RECORD_ID_PREFIX = 'shr_'

/** 缺省 id 兜底（前缀 + 时间戳 + 随机段防批量碰撞） */
function genId(prefix: string): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}

/** 'YYYY-MM-DD' 严格格式校验 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isDateStr(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v)
}

/** 习惯自定义颜色：'#RGB' 或 '#RRGGBB'（大小写均可） */
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** 频率归一：非 number/NaN → 7（缺省为每日打卡，与学段默认习惯/PRD 一致）；取整后钳到 [1,7]。 */
function normalizeFrequency(v: unknown): HabitFrequency {
  const DEFAULT_FREQUENCY = 7 as HabitFrequency
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_FREQUENCY
  return Math.min(HABIT_MAX_FREQUENCY, Math.max(HABIT_MIN_FREQUENCY, Math.round(v)))
}

/** 分类归一：非字符串 → 空串（未分类）；trim 后空串保留为未分类。 */
function normalizeCategory(v: unknown): StudentHabitCategory {
  if (typeof v !== 'string') return ''
  const t = v.trim()
  return t
}

/** 分类中文标签（内置 3 类 + 自定义回退原名） */
export function categoryLabel(category: StudentHabitCategory): string {
  switch (category) {
    case 'life': return '生活'
    case 'study': return '学习'
    case 'exercise': return '运动'
    case '': return '未分类'
    default: return category
  }
}

/** 内置分类判定（life/study/exercise） */
export function isBuiltinCategory(category: StudentHabitCategory): boolean {
  return (STUDENT_HABIT_BUILTIN_CATEGORIES as readonly string[]).includes(category)
}

/** 空学生习惯数据：无习惯 + 无打卡记录（返回全新结构，不共享任何引用）。 */
export function emptyStudentHabitsData(): StudentHabitsData {
  return { habits: [], records: [] }
}

/**
 * 单条学生习惯归一化（幂等）：name trim 后为空 → 剔除（返回 null）；id 缺失/非字符串 → 生成 shb_ 前缀 id；
 * category 归一（非字符串 → 空串未分类）；color 非法 → 默认蓝；frequency 钳到 [1,7]；createdAt 缺失 → 当前 ISO。
 */
export function normalizeStudentHabit(raw: unknown): StudentHabit | null {
  if (!raw || typeof raw !== 'object') return null
  const h = raw as Record<string, unknown>
  const name = typeof h.name === 'string' ? h.name.trim() : ''
  if (name === '') return null
  return {
    id: typeof h.id === 'string' && h.id !== '' ? h.id : genId(STUDENT_HABIT_ID_PREFIX),
    name,
    category: normalizeCategory(h.category),
    frequency: normalizeFrequency(h.frequency),
    color: typeof h.color === 'string' && HEX_COLOR_RE.test(h.color) ? h.color : DEFAULT_HABIT_COLOR,
    createdAt: typeof h.createdAt === 'string' ? h.createdAt : isoNow()
  }
}

/**
 * 单条学生打卡记录归一化（幂等）：habitId 缺失/空 或 date 非 'YYYY-MM-DD' → 剔除（返回 null）；
 * id 缺失 → 生成 shr_ 前缀；parentMarked 非布尔 → 不输出字段（缺省=false）；createdAt 缺失 → 当前 ISO。
 */
export function normalizeStudentHabitRecord(raw: unknown): StudentHabitRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const habitId = typeof r.habitId === 'string' && r.habitId !== '' ? r.habitId : ''
  const date = isDateStr(r.date) ? r.date : ''
  if (habitId === '' || date === '') return null
  const out: StudentHabitRecord = {
    id: typeof r.id === 'string' && r.id !== '' ? r.id : genId(STUDENT_HABIT_RECORD_ID_PREFIX),
    habitId,
    date,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : isoNow()
  }
  if (r.parentMarked === true) out.parentMarked = true
  return out
}

/**
 * 整库归一化（幂等，返回全新结构不改入参）：坏习惯（name trim 为空）剔除；
 * 坏记录（habitId/date 非法）剔除；孤儿记录（引用不存在的习惯）剔除；
 * 同一习惯同一天重复打卡去重（保留首条）。非法入参 → emptyStudentHabitsData()。
 */
export function normalizeStudentHabitsData(raw: unknown): StudentHabitsData {
  if (!raw || typeof raw !== 'object') return emptyStudentHabitsData()
  const src = raw as Record<string, unknown>
  const habits = Array.isArray(src.habits)
    ? src.habits.map(h => normalizeStudentHabit(h)).filter((h): h is StudentHabit => h !== null)
    : []
  const habitIds = new Set<string>(habits.map(h => h.id))
  const seen = new Set<string>()
  const records: StudentHabitRecord[] = []
  if (Array.isArray(src.records)) {
    for (const rawRecord of src.records) {
      const rec = normalizeStudentHabitRecord(rawRecord)
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

// ---- 复用 habitCore 纯函数（结构类型兼容，StudentHabitRecord 可赋值给 HabitRecord）----

/** 本周完成打卡日期列表（周一起点，去重升序）。 */
export function weekCompletionsOf(records: StudentHabitRecord[], habitId: string, date: string): string[] {
  return weekCompletionsCore(records, habitId, date)
}

/** 连续达成（按频率语义：每日=连续天，每周=连续达标周）。 */
export function streakOf(records: StudentHabitRecord[], habitId: string, frequency: HabitFrequency, today: string): StreakResult {
  return streakOfCore(records, habitId, frequency, today)
}

/** 周达成率（completed=本周打卡天数，target=频率目标，percent 不截断）。 */
export function weeklyAttainmentOf(records: StudentHabitRecord[], habitId: string, frequency: HabitFrequency, date: string): WeeklyAttainment {
  return weeklyAttainmentCore(records, habitId, frequency, date)
}

// ---- 学段默认习惯播种决策 ----

/**
 * 判断是否需要播种学段默认习惯。
 * settings 中无 stageHabitsSeeded 或值 !== stage → true（首次进入或学段切换后）。
 * 由 studentSettings store 调用，store 持有 settings 对象。
 */
export function shouldSeedStageHabits(stageHabitsSeeded: StudentStage | undefined, stage: StudentStage): boolean {
  return stageHabitsSeeded !== stage
}

/**
 * 构建学段默认习惯种子（K 7 项 / P 6 项 / J 5 项）。
 * 返回新数组，不改入参；frequency 缺省 7（每日），category 取自 STAGE_DEFAULT_HABITS。
 * 幂等：重复调用返回全新数组。
 */
export function buildStageSeedHabits(stage: StudentStage): StudentHabit[] {
  return STAGE_DEFAULT_HABITS[stage].map(h => ({
    id: genId(STUDENT_HABIT_ID_PREFIX),
    name: h.name,
    category: h.category,
    frequency: 7, // 学段默认习惯为每日打卡
    color: DEFAULT_HABIT_COLOR,
    createdAt: isoNow()
  }))
}

/**
 * 合并学段种子到现有习惯（不覆盖用户已新增的同名习惯）。
 * 已存在同名（大小写不敏感）习惯 → 跳过该种子项；返回新数组，不改入参。
 */
export function mergeStageSeedHabits(existing: StudentHabit[], seed: StudentHabit[]): StudentHabit[] {
  const lowerNames = new Set(existing.map(h => h.name.toLowerCase()))
  const merged = [...existing]
  for (const s of seed) {
    if (!lowerNames.has(s.name.toLowerCase())) {
      merged.push(s)
      lowerNames.add(s.name.toLowerCase())
    }
  }
  return merged
}

/** 分类筛选：'all' 全部 / 'uncategorized' 未分类（空串） / 其他精确匹配。返回新数组不改入参。 */
export function filterHabitsByCategory(habits: StudentHabit[], category: string): StudentHabit[] {
  if (category === 'all') return [...habits]
  if (category === 'uncategorized') return habits.filter(h => h.category === '')
  return habits.filter(h => h.category === category)
}
