// 健康管理纯逻辑模块：健康数据归一化 → 周/日达标率 → BMI/睡眠时长/体重图表坐标。
// 运行时依赖仅 MEAL_TYPES 与 todoCore 的 localToday（node --experimental-strip-types 可运行）；其余类型全部 type-only。
import { MEAL_TYPES } from '../types/index.ts'
import type {
  DietRecord,
  ExerciseRecord,
  HealthData,
  HealthPlan,
  HealthPlanMetric,
  HealthPlanPeriod,
  HealthPlans,
  HeightRecord,
  MealType,
  SleepRecord,
  StudentHealthData,
  WeightRecord
} from '../types'
import { localToday } from './todoCore.ts'

/** 健康计划合法枚举（运行时校验用）。 */
const HEALTH_PLAN_METRICS: HealthPlanMetric[] = ['times', 'minutes', 'calories', 'duration']
const HEALTH_PLAN_PERIODS: HealthPlanPeriod[] = ['daily', 'weekly']

/** 缺省 id 兜底（沿用 todoCore 风格：前缀 + 时间戳 + 随机段防批量碰撞）。 */
function genId(prefix: string): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 'YYYY-MM-DD' 严格格式校验。 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
function isDateStr(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v)
}

/** 数值兜底：Number() 转换失败（NaN/Infinity/Symbol）一律为 0。 */
function num(v: unknown): number {
  if (typeof v === 'symbol') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** 负数钳 0。 */
function clampNonNeg(n: number): number {
  return n < 0 ? 0 : n
}

/** 睡眠质量钳到 1-5 整数。 */
function clampQuality(n: number): number {
  return Math.min(5, Math.max(1, Math.round(n)))
}

function isoNow(): string {
  return new Date().toISOString()
}

/** 健康计划校验：metric/period 必须在枚举内且 target 为正数。 */
function isValidPlan(p: unknown): p is HealthPlan {
  if (typeof p !== 'object' || p === null) return false
  const plan = p as Record<string, unknown>
  return (
    typeof plan.metric === 'string' &&
    (HEALTH_PLAN_METRICS as string[]).includes(plan.metric) &&
    typeof plan.period === 'string' &&
    (HEALTH_PLAN_PERIODS as string[]).includes(plan.period) &&
    typeof plan.target === 'number' &&
    Number.isFinite(plan.target) &&
    plan.target > 0
  )
}

/** 空健康数据（工作台新初始化用）。 */
export function emptyHealthData(): HealthData {
  return { plans: {}, records: { exercise: [], diet: [], sleep: [], weight: [] } }
}

/** 归一化任意来源的健康数据：height 越界剔除、计划逐模块校验、记录逐条走对应 normalize。脏输入不抛错。 */
export function normalizeHealthData(raw: Partial<HealthData> | undefined): HealthData {
  const data = raw ?? {}
  const height =
    typeof data.height === 'number' && Number.isFinite(data.height) && data.height >= 100 && data.height <= 250
      ? data.height
      : undefined

  const plans: HealthPlans = {}
  const rawPlans: unknown = data.plans ?? {}
  if (typeof rawPlans === 'object' && rawPlans !== null) {
    const p = rawPlans as Record<string, unknown>
    if (isValidPlan(p.exercise)) plans.exercise = p.exercise
    if (isValidPlan(p.diet)) plans.diet = p.diet
    if (isValidPlan(p.sleep)) plans.sleep = p.sleep
  }

  const rawRecords: unknown = data.records ?? {}
  const rec = typeof rawRecords === 'object' && rawRecords !== null ? (rawRecords as Record<string, unknown>) : {}
  const toArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

  return {
    height,
    plans,
    records: {
      exercise: toArr(rec.exercise).map(r => normalizeExerciseRecord(r)),
      diet: toArr(rec.diet).map(r => normalizeDietRecord(r)),
      sleep: toArr(rec.sleep).map(r => normalizeSleepRecord(r)),
      weight: toArr(rec.weight).map(r => normalizeWeightRecord(r))
    }
  }
}

/** 归一化运动记录（脏输入吞掉不抛错，module 强制 exercise，duration/calories 负数钳 0）。 */
export function normalizeExerciseRecord(raw: any): ExerciseRecord {
  const r = raw ?? {}
  return {
    id: typeof r.id === 'string' && r.id ? r.id : genId('ex_'),
    module: 'exercise',
    date: isDateStr(r.date) ? r.date : localToday(),
    exerciseType: typeof r.exerciseType === 'string' ? r.exerciseType : '',
    duration: clampNonNeg(num(r.duration)),
    calories: clampNonNeg(num(r.calories)),
    ...(typeof r.distanceKm === 'number' ? { distanceKm: clampNonNeg(num(r.distanceKm)) } : {}),
    ...(typeof r.note === 'string' ? { note: r.note } : {}),
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : isoNow(),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : isoNow()
  }
}

/** 归一化饮食记录（mealType 非法回退「早餐」，module 强制 diet，calories 负数钳 0）。 */
export function normalizeDietRecord(raw: any): DietRecord {
  const r = raw ?? {}
  const mealType: MealType =
    typeof r.mealType === 'string' && (MEAL_TYPES as readonly string[]).includes(r.mealType)
      ? (r.mealType as MealType)
      : '早餐'
  return {
    id: typeof r.id === 'string' && r.id ? r.id : genId('dt_'),
    module: 'diet',
    date: isDateStr(r.date) ? r.date : localToday(),
    mealType,
    content: typeof r.content === 'string' ? r.content : '',
    calories: clampNonNeg(num(r.calories)),
    ...(typeof r.note === 'string' ? { note: r.note } : {}),
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : isoNow(),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : isoNow()
  }
}

/** 归一化睡眠记录（durationHours 缺失/NaN 时按 sleepTime/wakeTime 补算，quality 钳到 1-5）。 */
export function normalizeSleepRecord(raw: any): SleepRecord {
  const r = raw ?? {}
  const rawDur = r.durationHours
  const durNum = Number(rawDur)
  const fallback = sleepDurationHours(
    typeof r.sleepTime === 'string' ? r.sleepTime : '',
    typeof r.wakeTime === 'string' ? r.wakeTime : ''
  )
  return {
    id: typeof r.id === 'string' && r.id ? r.id : genId('sl_'),
    module: 'sleep',
    date: isDateStr(r.date) ? r.date : localToday(),
    sleepTime: typeof r.sleepTime === 'string' ? r.sleepTime : '',
    wakeTime: typeof r.wakeTime === 'string' ? r.wakeTime : '',
    durationHours: clampNonNeg(rawDur === undefined || Number.isNaN(durNum) ? fallback : durNum),
    quality: clampQuality(num(r.quality)),
    ...(typeof r.note === 'string' ? { note: r.note } : {}),
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : isoNow(),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : isoNow()
  }
}

/** 归一化体重记录（module 强制 weight，weightKg 负数钳 0）。 */
export function normalizeWeightRecord(raw: any): WeightRecord {
  const r = raw ?? {}
  return {
    id: typeof r.id === 'string' && r.id ? r.id : genId('wt_'),
    module: 'weight',
    date: isDateStr(r.date) ? r.date : localToday(),
    weightKg: clampNonNeg(num(r.weightKg)),
    ...(typeof r.note === 'string' ? { note: r.note } : {}),
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : isoNow(),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : isoNow()
  }
}

/** 归一化身高记录（module 强制 height，heightCm 越界剔除为 0；20-250cm 之外视为脏数据）。 */
export function normalizeHeightRecord(raw: any): HeightRecord {
  const r = raw ?? {}
  const cm = num(r.heightCm)
  return {
    id: typeof r.id === 'string' && r.id ? r.id : genId('ht_'),
    module: 'height',
    date: isDateStr(r.date) ? r.date : localToday(),
    heightCm: cm >= 20 && cm <= 250 ? cm : 0,
    ...(typeof r.note === 'string' ? { note: r.note } : {}),
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : isoNow(),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : isoNow()
  }
}

/** 空学生健康数据（比 HealthData 多一个 height 记录数组）。 */
export function emptyStudentHealthData(): StudentHealthData {
  return { plans: {}, records: { exercise: [], diet: [], sleep: [], weight: [], height: [] } }
}

/**
 * 归一化学生健康数据：与 normalizeHealthData 同源（height 越界剔除、计划逐模块校验、
 * 四大模块记录逐条走对应 normalize），额外把 records.height 也逐条归一化。脏输入不抛错。
 */
export function normalizeStudentHealthData(raw: Partial<StudentHealthData> | undefined): StudentHealthData {
  const base = normalizeHealthData(raw as Partial<HealthData> | undefined)
  const rawRecords = (raw?.records ?? {}) as Record<string, unknown>
  const heights = Array.isArray(rawRecords.height) ? rawRecords.height : []
  return {
    height: base.height,
    plans: base.plans,
    records: {
      ...base.records,
      height: heights.map(r => normalizeHeightRecord(r))
    }
  }
}

/** 日期所在周的周一（周一起点）'YYYY-MM-DD'。先 setDate 再取日期组件，防 DST 偏移。 */
export function weekKeyOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  const back = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - back)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 运动周达标率：过滤本周记录，按计划指标求和（times=条数 / minutes=Σduration / calories=Σcalories）。percent 不截断。 */
export function calcExerciseAttainment(
  records: ExerciseRecord[],
  plan: HealthPlan | undefined,
  todayStr: string
): { current: number; target: number; percent: number } | null {
  if (!plan || plan.module !== 'exercise') return null
  const week = weekKeyOf(todayStr)
  const weekRecords = records.filter(r => weekKeyOf(r.date) === week)
  let current = 0
  switch (plan.metric) {
    case 'times':
      current = weekRecords.length
      break
    case 'minutes':
      current = weekRecords.reduce((sum, r) => sum + r.duration, 0)
      break
    case 'calories':
      current = weekRecords.reduce((sum, r) => sum + r.calories, 0)
      break
    default:
      // 'duration' 是睡眠指标，exercise 计划不适用 → 记 0
      current = 0
  }
  return { current, target: plan.target, percent: current / plan.target }
}

/** 年度各运动类型距离（公里）累计：仅统计带 distanceKm 的记录，按 date 年份过滤；结果保留 1 位小数（与输入 step 0.1 一致）。 */
export function calcYearDistanceTotals(records: ExerciseRecord[], yearStr: string): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const r of records) {
    if (typeof r.distanceKm !== 'number' || !r.date.startsWith(yearStr)) continue
    totals[r.exerciseType] = Math.round(((totals[r.exerciseType] ?? 0) + r.distanceKm) * 10) / 10
  }
  return totals
}

/** 日达标率：diet → Σcalories；sleep → ΣdurationHours；非 diet/sleep 计划返回 null。percent 不截断。 */
export function calcDailyAttainment(
  records: DietRecord[] | SleepRecord[],
  plan: HealthPlan | undefined,
  dateStr: string
): { current: number; target: number; percent: number } | null {
  if (!plan) return null
  if (plan.module !== 'diet' && plan.module !== 'sleep') return null
  let current = 0
  for (const r of records) {
    if (r.date !== dateStr) continue
    if (r.module === 'diet') current += r.calories
    else current += r.durationHours
  }
  return { current, target: plan.target, percent: current / plan.target }
}

/** BMI = 体重(kg) / 身高(m)²，保留 1 位小数；任一缺失或非正数返回 null。 */
export function calcBmi(weightKg: number | undefined, heightCm: number | undefined): number | null {
  if (weightKg === undefined || heightCm === undefined) return null
  if (!(weightKg > 0) || !(heightCm > 0)) return null
  return Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10
}

/** 国标 WS/T 428-2013：<18.5 偏瘦 / 18.5-23.9 正常 / 24-27.9 超重 / ≥28 肥胖。 */
export function classifyBmi(bmi: number): 'under' | 'normal' | 'overweight' | 'obese' {
  if (bmi < 18.5) return 'under'
  if (bmi < 24) return 'normal'
  if (bmi < 28) return 'overweight'
  return 'obese'
}

/** 目标体重（BMI 24 上限对应体重，1 位小数）。 */
export function weightTarget(heightCm: number): number {
  return Math.round(24 * (heightCm / 100) ** 2 * 10) / 10
}

/** 维持目标体重所需每日热量 ≈ 体重 × 25 kcal。 */
export function dietCalories(targetKg: number): number {
  return Math.round(targetKg * 25)
}

/** 睡眠时长（小时，1 位小数）：'HH:mm' 解析，跨夜取模；同刻视为 24h；输入非法返回 0。 */
export function sleepDurationHours(sleepTime: string, wakeTime: string): number {
  const toMin = (t: string): number | null => {
    const parts = String(t).split(':')
    if (parts.length !== 2) return null
    const h = Number(parts[0])
    const m = Number(parts[1])
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0 || h > 23 || m > 59) return null
    return h * 60 + m
  }
  const s = toMin(sleepTime)
  const w = toMin(wakeTime)
  if (s === null || w === null) return 0
  const diffMin = (w - s + 1440) % 1440
  return Math.round(((diffMin === 0 ? 1440 : diffMin) / 60) * 10) / 10
}

/** 体重折线图坐标点。 */
export interface WeightChartPoint {
  x: number
  y: number
  date: string
  weightKg: number
}

/** 体重折线图坐标换算：date 升序（同日按 createdAt）；0 条 null；1 条居中；N≥2 归一化到 [pad, height-pad]，y 保留 2 位小数。 */
export function weightChartScale(
  records: WeightRecord[],
  width: number,
  height: number,
  pad = 24
): { points: WeightChartPoint[]; minY: number; maxY: number } | null {
  if (records.length === 0) return null
  const sorted = [...records].sort((a, b) =>
    a.date === b.date ? (a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? -1 : 1
  )
  if (sorted.length === 1) {
    const r = sorted[0]
    return {
      points: [{ x: width / 2, y: height / 2, date: r.date, weightKg: r.weightKg }],
      minY: r.weightKg - 1,
      maxY: r.weightKg + 1
    }
  }
  const weights = sorted.map(r => r.weightKg)
  let minY = Math.floor(Math.min(...weights)) - 1
  let maxY = Math.ceil(Math.max(...weights)) + 1
  if (maxY - minY === 0) {
    // 防御分支：理论上 floor/ceil ±1 后 span ≥ 2，此处仅防极端数值场景
    minY = weights[0] - 1
    maxY = weights[0] + 1
  }
  const span = maxY - minY
  const inner = height - 2 * pad
  const points = sorted.map((r, i) => ({
    x: (i / (sorted.length - 1)) * width,
    y: Math.round((pad + (1 - (r.weightKg - minY) / span) * inner) * 100) / 100,
    date: r.date,
    weightKg: r.weightKg
  }))
  return { points, minY, maxY }
}
