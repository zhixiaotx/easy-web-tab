// 学生工作台课程表纯逻辑模块。
// 归一化（幂等）+ cell key 编解码 + 时间校验 + 按时间排序。
// 零 vue/pinia 运行时依赖，纯函数。

import type {
  StudentTimetableCell,
  StudentTimetableData,
  StudentTimetableSchedule
} from '@/types'

/** 课程表数据版本 */
export const TIMETABLE_VERSION = 1

/** 默认每日节数 */
export const DEFAULT_PERIODS_PER_DAY = 6
/** 默认学周数 */
export const DEFAULT_WEEKS = 20

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** 空课程表数据 */
export function emptyTimetableData(): StudentTimetableData {
  return {
    version: TIMETABLE_VERSION,
    weeks: DEFAULT_WEEKS,
    periodsPerDay: DEFAULT_PERIODS_PER_DAY,
    classroom: '',
    schedule: {}
  }
}

/** 校验 HH:MM 时间字符串 */
export function isValidTime(v: unknown): v is string {
  return typeof v === 'string' && TIME_RE.test(v)
}

/** 校验结束时间 > 开始时间 */
export function isValidTimeRange(start: string, end: string): boolean {
  if (!isValidTime(start) || !isValidTime(end)) return false
  return end > start
}

/** 归一化单节课 */
export function normalizeCell(raw: unknown): StudentTimetableCell | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  const subject = typeof c.subject === 'string' ? c.subject.trim() : ''
  if (!subject) return null
  const startHHMM = isValidTime(c.startHHMM) ? c.startHHMM : ''
  const endHHMM = isValidTime(c.endHHMM) ? c.endHHMM : ''
  if (!startHHMM || !endHHMM) return null
  if (!isValidTimeRange(startHHMM, endHHMM)) return null
  const cell: StudentTimetableCell = { subject, startHHMM, endHHMM }
  if (typeof c.teacher === 'string' && c.teacher.trim()) {
    cell.teacher = Array.from(c.teacher.trim()).slice(0, 20).join('')
  }
  if (typeof c.room === 'string' && c.room.trim()) {
    cell.room = Array.from(c.room.trim()).slice(0, 20).join('')
  }
  return cell
}

/** 归一化课程表数据（幂等） */
export function normalizeTimetableData(raw: unknown): StudentTimetableData {
  const base = emptyTimetableData()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  const out: StudentTimetableData = {
    version: typeof o.version === 'number' && o.version > 0 ? o.version : base.version,
    weeks: typeof o.weeks === 'number' && o.weeks >= 1 && o.weeks <= 52 ? Math.floor(o.weeks) : base.weeks,
    periodsPerDay:
      typeof o.periodsPerDay === 'number' && o.periodsPerDay >= 1 && o.periodsPerDay <= 12
        ? Math.floor(o.periodsPerDay)
        : base.periodsPerDay,
    classroom: typeof o.classroom === 'string' ? o.classroom.slice(0, 30) : '',
    schedule: {}
  }
  if (o.schedule && typeof o.schedule === 'object' && !Array.isArray(o.schedule)) {
    const src = o.schedule as Record<string, unknown>
    for (const key of Object.keys(src)) {
      const cell = normalizeCell(src[key])
      if (cell) out.schedule[key] = cell
    }
  }
  return out
}

/** cell key 编码：`${dayOfWeek}_${period}`（day 1-7，period 1-12） */
export function cellKey(dayOfWeek: number, period: number): string {
  return `${dayOfWeek}_${period}`
}

/** cell key 解码 → { day, period }；非法返回 null */
export function parseCellKey(key: string): { day: number; period: number } | null {
  const m = /^(\d+)_(\d+)$/.exec(key)
  if (!m) return null
  const day = Number(m[1])
  const period = Number(m[2])
  if (day < 1 || day > 7 || period < 1 || period > 12) return null
  return { day, period }
}

/** 周几标签（1=周一 ... 7=周日） */
export function weekdayLabel(day: number): string {
  const labels = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
  return labels[day] ?? ''
}

/** 设置/更新某节课 */
export function setCell(
  schedule: StudentTimetableSchedule,
  day: number,
  period: number,
  cell: StudentTimetableCell
): StudentTimetableSchedule {
  return { ...schedule, [cellKey(day, period)]: cell }
}

/** 清除某节课 */
export function clearCell(
  schedule: StudentTimetableSchedule,
  day: number,
  period: number
): StudentTimetableSchedule {
  const next = { ...schedule }
  delete next[cellKey(day, period)]
  return next
}

/** 获取某节课 */
export function getCell(
  schedule: StudentTimetableSchedule,
  day: number,
  period: number
): StudentTimetableCell | undefined {
  return schedule[cellKey(day, period)]
}

/** 按开始时间排序同日 cell 列表 */
export function sortCellsByStartTime(cells: StudentTimetableCell[]): StudentTimetableCell[] {
  return [...cells].sort((a, b) => a.startHHMM.localeCompare(b.startHHMM))
}
