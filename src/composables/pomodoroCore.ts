// 番茄钟纯逻辑模块：数据归一化 → 会话状态机 → 剩余时间格式化 → 今日统计。
// 零运行时依赖（无 vue/pinia import，类型全部本地定义），node --experimental-strip-types 可测。
// 组件/面板只调用本模块，禁止内联重算公式。

/** 专注会话阶段。 */
export type PomodoroPhase = 'work' | 'break' | 'longBreak'

/** 番茄钟设置（时长单位均为分钟）。 */
export interface PomodoroSettings {
  workMinutes: number
  breakMinutes: number
  longBreakMinutes: number
  sessionsPerCycle: number
}

/** 单日记录：date 为本地日期 'YYYY-MM-DD'（localToday 模式，防 UTC 偏移）。 */
export interface PomodoroRecord {
  date: string
  workSessions: number
  createdAt: string
}

/** 番茄钟持久化数据（settings + 按天记录数组）。 */
export interface PomodoroData {
  settings: PomodoroSettings
  records: PomodoroRecord[]
}

/** 归一化缺省默认：25 分钟专注 / 5 分钟短休 / 15 分钟长休 / 每 4 个会话一次长休。 */
const DEFAULT_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  sessionsPerCycle: 4
}

/** 'YYYY-MM-DD' 严格格式校验。 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isDateStr(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v)
}

function isoNow(): string {
  return new Date().toISOString()
}

/** 有限数值转换：Number() 失败（NaN/Infinity/Symbol）一律 0。 */
function num(v: unknown): number {
  if (typeof v === 'symbol') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** 正整数分钟校验：非有限或 < 1 → 回退默认值；合法值四舍五入为整数。 */
function positiveMinute(v: unknown, fallback: number): number {
  const n = Math.round(num(v))
  return n >= 1 ? n : fallback
}

/** 空番茄钟数据（工作台新初始化 / 备份缺字段兜底用）。 */
export function emptyPomodoroData(): PomodoroData {
  return { settings: { ...DEFAULT_SETTINGS }, records: [] }
}

/** 归一化任意来源的番茄钟数据：settings 逐字段校验回退默认 25/5，records 逐条归一、坏记录剔除。脏输入不抛错。 */
export function normalizePomodoroData(raw: unknown): PomodoroData {
  const data = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const rawSettings =
    typeof data.settings === 'object' && data.settings !== null ? (data.settings as Record<string, unknown>) : {}
  const settings: PomodoroSettings = {
    workMinutes: positiveMinute(rawSettings.workMinutes, DEFAULT_SETTINGS.workMinutes),
    breakMinutes: positiveMinute(rawSettings.breakMinutes, DEFAULT_SETTINGS.breakMinutes),
    longBreakMinutes: positiveMinute(rawSettings.longBreakMinutes, DEFAULT_SETTINGS.longBreakMinutes),
    sessionsPerCycle: positiveMinute(rawSettings.sessionsPerCycle, DEFAULT_SETTINGS.sessionsPerCycle)
  }
  const records: PomodoroRecord[] = []
  if (Array.isArray(data.records)) {
    for (const r of data.records) {
      if (typeof r !== 'object' || r === null) continue
      const rec = r as Record<string, unknown>
      // 日期非法（缺失/格式错误）的记录整条剔除，防止脏数据污染今日统计
      if (!isDateStr(rec.date)) continue
      records.push({
        date: rec.date,
        workSessions: Math.max(0, Math.round(num(rec.workSessions))),
        createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : isoNow()
      })
    }
  }
  return { settings, records }
}

/**
 * 会话状态机：当前阶段结束后应进入的下一个阶段。
 * phase='work' 时 completedSessions 为该次工作会话完成后的累计专注数——每到 sessionsPerCycle 的整数倍进入长休，否则短休；
 * phase='break'/'longBreak' 结束后一律回到 work。
 */
export function sessionPhase(state: {
  phase: PomodoroPhase
  completedSessions: number
  settings: PomodoroSettings
}): PomodoroPhase {
  const { phase, completedSessions, settings } = state
  if (phase !== 'work') return 'work'
  const done = Math.max(0, Math.floor(num(completedSessions)))
  const cycle = Math.max(1, Math.floor(num(settings.sessionsPerCycle)))
  return done > 0 && done % cycle === 0 ? 'longBreak' : 'break'
}

/** 剩余秒数 → 'MM:SS'（负数/非有限值一律 '00:00'；分钟可超两位，如 3661 → '61:01'）。 */
export function formatRemaining(seconds: number): string {
  const total = Math.max(0, Math.floor(num(seconds)))
  const m = Math.floor(total / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(m)}:${pad(s)}`
}

/** 今日已完成专注会话数：按 date 精确匹配（'YYYY-MM-DD'），同日多条记录求和；无记录或日期非法返回 0。 */
export function todayStats(records: readonly PomodoroRecord[], date: string): number {
  if (!isDateStr(date)) return 0
  let total = 0
  for (const r of records) {
    if (r.date === date) total += Math.max(0, Math.floor(num(r.workSessions)))
  }
  return total
}
