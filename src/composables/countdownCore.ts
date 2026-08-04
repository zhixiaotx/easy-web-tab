// 倒计时纯逻辑模块。重复规则引擎：parseRepeat 归一化 → calcNextOccurrence 求下次 → getReminderDue 求补提醒。
// 运行时依赖仅 COUNTDOWN_CATEGORIES（node --experimental-strip-types 可运行）；其余类型全部 type-only。
// calcRemaining / sortCountdowns 对外行为与旧版保持一致。
import { COUNTDOWN_CATEGORIES } from '../types/index.ts'
import type { Countdown, CountdownItem, CountdownRemaining, CountdownCategory, CountdownRepeat } from '../types'

export type CountdownSortMode = 'remaining' | 'name' | 'created' | 'endTime' | 'manual'
export type CountdownSortDirection = 'asc' | 'desc'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 闰年判断（用于 2 月 29 日钳制）。 */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** 某年某月（0 起）的天数。 */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** 每年一次的目标时刻：2 月 29 日在非闰年钳制为 2 月 28 日（防 Date 自动进位到 3 月 1 日）。 */
function yearlyOccurrence(end: Date, year: number): Date {
  if (end.getMonth() === 1 && end.getDate() === 29 && !isLeapYear(year)) {
    return new Date(year, 1, 28, end.getHours(), end.getMinutes())
  }
  return new Date(year, end.getMonth(), end.getDate(), end.getHours(), end.getMinutes())
}

/** 缺省 id 兜底（沿用 store 的 cd_ 前缀，追加随机段防批量碰撞）。 */
function genId(): string {
  return `cd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const

/**
 * 归一化任意来源的重复规则：
 * - 旧字符串 'yearly' → { type: 'yearly' }；'once' → null（规范一次性 = null）
 * - weekly：过滤为 [1,7] 整数、去重、升序；空数组 → null
 * - monthly：钳制到 [1,31]；interval：要求整数 ≥ 1，否则 null
 * - 其余任何值（数字、乱字符串、未知 type 对象）→ null
 */
export function parseRepeat(raw: unknown): CountdownRepeat | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string') {
    if (raw === 'yearly') return { type: 'yearly' }
    return null
  }
  if (typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  switch (obj.type) {
    case 'once':
      return null
    case 'daily':
      return { type: 'daily' }
    case 'yearly':
      return { type: 'yearly' }
    case 'weekly': {
      const days = Array.isArray(obj.daysOfWeek)
        ? obj.daysOfWeek
            .filter((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 7)
            .sort((a, b) => a - b)
            .filter((d, i, arr) => i === 0 || d !== arr[i - 1])
        : []
      if (days.length === 0) return null
      return { type: 'weekly', daysOfWeek: days }
    }
    case 'monthly': {
      const n = obj.dayOfMonth
      const day = typeof n === 'number' && Number.isFinite(n) ? Math.min(31, Math.max(1, Math.round(n))) : 1
      return { type: 'monthly', dayOfMonth: day }
    }
    case 'interval': {
      const n = obj.intervalMinutes
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return null
      return { type: 'interval', intervalMinutes: n }
    }
    default:
      return null
  }
}

/** 将任意来源的倒计时数据归一化为规范 Countdown（repeat/category 强制归一，字符串字段安全兜底）。 */
export function normalizeCountdown(raw: Partial<Countdown>): Countdown {
  const category: CountdownCategory =
    typeof raw.category === 'string' && (COUNTDOWN_CATEGORIES as readonly string[]).includes(raw.category)
      ? (raw.category as CountdownCategory)
      : 'work'
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : genId(),
    name: typeof raw.name === 'string' ? raw.name : '',
    endDateTime: typeof raw.endDateTime === 'string' ? raw.endDateTime : '',
    repeat: parseRepeat(raw.repeat),
    category,
    ...(typeof raw.lastRemindedAt === 'string' ? { lastRemindedAt: raw.lastRemindedAt } : {}),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    ...(raw.sortOrder !== undefined ? { sortOrder: raw.sortOrder } : {}),
    ...(raw.showOnDisplay !== undefined ? { showOnDisplay: raw.showOnDisplay } : {})
  }
}

/**
 * 计算下一次发生时刻（'YYYY-MM-DD HH:mm'，本地时间），at-or-after now（默认当前时间）。
 * 锚点：所有重复类型的首次发生都是 endDateTime 本身，绝不产生早于 endDateTime 的时刻。
 * 无效 endDateTime 不抛错，返回 formatLocal 的可读兜底。
 */
export function calcNextOccurrence(
  endDateTime: string,
  repeat: CountdownRepeat | string | null | undefined,
  now?: Date
): string {
  const nowDate = now ?? new Date()
  const end = new Date(endDateTime)
  if (isNaN(end.getTime())) {
    return formatLocal(end)
  }
  const rep = parseRepeat(repeat)
  const nowMs = nowDate.getTime()
  const endMs = end.getTime()
  const h = end.getHours()
  const m = end.getMinutes()

  // 一次性：始终返回 endDateTime（即使已过去，保持旧版过期展示语义）
  if (rep === null) {
    return formatLocal(end)
  }

  switch (rep.type) {
    case 'once':
      return formatLocal(end)
    case 'daily': {
      // 今天同 HH:mm，已过则明天；兜底到不早于锚点（首次发生 = endDateTime 本身）
      let candidate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), h, m)
      if (candidate.getTime() < nowMs) {
        candidate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + 1, h, m)
      }
      if (candidate.getTime() < endMs) {
        candidate = end
      }
      return formatLocal(candidate)
    }
    case 'weekly': {
      // 逐日搜索匹配星期：end 未过从 end 日期起搜，已过从今天起搜，均不早于锚点
      const start = endMs > nowMs ? end : nowDate
      let d = new Date(start.getFullYear(), start.getMonth(), start.getDate(), h, m)
      for (let i = 0; i < 8; i++) {
        const dow = d.getDay() === 0 ? 7 : d.getDay()
        if (rep.daysOfWeek.includes(dow) && d.getTime() >= nowMs && d.getTime() >= endMs) {
          return formatLocal(d)
        }
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, h, m)
      }
      return formatLocal(d) // 理论不可达（daysOfWeek 非空），仅兜底
    }
    case 'monthly': {
      // 本月钳制日 ≥ now 用本月，否则下月；兜底到不早于锚点
      const day = rep.dayOfMonth
      let candidate = new Date(
        nowDate.getFullYear(),
        nowDate.getMonth(),
        Math.min(day, daysInMonth(nowDate.getFullYear(), nowDate.getMonth())),
        h,
        m
      )
      if (candidate.getTime() < nowMs) {
        const next = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 1)
        candidate = new Date(
          next.getFullYear(),
          next.getMonth(),
          Math.min(day, daysInMonth(next.getFullYear(), next.getMonth())),
          h,
          m
        )
      }
      if (candidate.getTime() < endMs) {
        candidate = end
      }
      return formatLocal(candidate)
    }
    case 'yearly': {
      // 今年同月日，已过或早于锚点则顺延（最迟在 end 所在年份必然命中）
      const maxYear = Math.max(nowDate.getFullYear(), end.getFullYear()) + 1
      for (let y = nowDate.getFullYear(); y <= maxYear; y++) {
        const c = yearlyOccurrence(end, y)
        if (c.getTime() >= nowMs && c.getTime() >= endMs) {
          return formatLocal(c)
        }
      }
      return formatLocal(yearlyOccurrence(end, maxYear))
    }
    case 'interval': {
      // t0 = endDateTime，找最小 k ≥ 0 使 t0 + k*N ≥ now
      if (nowMs <= endMs) return formatLocal(end)
      const step = rep.intervalMinutes * 60000
      const k = Math.ceil((nowMs - endMs) / step)
      return formatLocal(new Date(endMs + k * step))
    }
  }
}

/**
 * 判断当前是否应补提醒：返回应记为 lastRemindedAt 的发生时刻，不应提醒返回 null。
 * 重复类型取「最近一次 ≤ now 且 ≥ 锚点」的槽位，与 lastRemindedAt 相同则不重复触发 ——
 * 标签页被挂起后恢复时对最近的槽位只补一次，下一 tick 不再触发（追赶语义）。
 */
export function getReminderDue(
  endDateTime: string,
  repeat: CountdownRepeat | string | null | undefined,
  lastRemindedAt: string | undefined,
  now?: Date
): string | null {
  const nowDate = now ?? new Date()
  const end = new Date(endDateTime)
  if (isNaN(end.getTime())) return null // 无效时间永不提醒
  const rep = parseRepeat(repeat)
  const nowMs = nowDate.getTime()
  const endMs = end.getTime()
  const h = end.getHours()
  const m = end.getMinutes()

  let occurrence: string | null = null
  if (rep === null) {
    // 一次性：now ≥ end 且未记录过即触发（只触发一次，之后被 lastRemindedAt 抑制）
    occurrence = nowMs >= endMs ? formatLocal(end) : null
  } else {
    switch (rep.type) {
      case 'once':
        occurrence = nowMs >= endMs ? formatLocal(end) : null
        break
      case 'daily': {
        let candidate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), h, m)
        if (candidate.getTime() > nowMs) {
          candidate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 1, h, m)
        }
        occurrence =
          candidate.getTime() < endMs ? (endMs <= nowMs ? formatLocal(end) : null) : formatLocal(candidate)
        break
      }
      case 'weekly': {
        let d = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), h, m)
        for (let i = 0; i < 8; i++) {
          if (rep.daysOfWeek.includes(d.getDay() === 0 ? 7 : d.getDay())) {
            const t = d.getTime()
            if (t <= nowMs) {
              occurrence = t >= endMs ? formatLocal(d) : null
              break
            }
            // t > nowMs：今日槽位尚未到达，继续回退
          }
          d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, h, m)
        }
        break
      }
      case 'monthly': {
        const day = rep.dayOfMonth
        let candidate = new Date(
          nowDate.getFullYear(),
          nowDate.getMonth(),
          Math.min(day, daysInMonth(nowDate.getFullYear(), nowDate.getMonth())),
          h,
          m
        )
        if (candidate.getTime() > nowMs) {
          const prev = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1)
          candidate = new Date(
            prev.getFullYear(),
            prev.getMonth(),
            Math.min(day, daysInMonth(prev.getFullYear(), prev.getMonth())),
            h,
            m
          )
        }
        occurrence =
          candidate.getTime() < endMs ? (endMs <= nowMs ? formatLocal(end) : null) : formatLocal(candidate)
        break
      }
      case 'yearly': {
        let candidate = yearlyOccurrence(end, nowDate.getFullYear())
        if (candidate.getTime() > nowMs) {
          candidate = yearlyOccurrence(end, nowDate.getFullYear() - 1)
        }
        occurrence =
          candidate.getTime() < endMs ? (endMs <= nowMs ? formatLocal(end) : null) : formatLocal(candidate)
        break
      }
      case 'interval': {
        if (nowMs < endMs) break
        const step = rep.intervalMinutes * 60000
        const k = Math.floor((nowMs - endMs) / step)
        occurrence = formatLocal(new Date(endMs + k * step))
        break
      }
    }
  }

  if (occurrence === null || lastRemindedAt === occurrence) return null
  return occurrence
}

export function calcRemaining(
  endDateTime: string,
  repeat?: CountdownRepeat | string | null
): CountdownRemaining {
  const now = new Date()
  const end = new Date(endDateTime)

  // 无效时间
  if (isNaN(end.getTime())) {
    return { days: 0, hours: 0, minutes: 0, label: '时间无效', status: 'expired', nextTime: '—', isExpired: true }
  }

  const rep = parseRepeat(repeat)
  const nextStr = calcNextOccurrence(endDateTime, rep, now)
  const target = new Date(nextStr.replace(' ', 'T'))
  const diffMs = target.getTime() - now.getTime()

  // 一次性且已过期（重复类型 nextTime 恒为未来，不会进入此分支）
  if (rep === null && diffMs <= 0) {
    const expiredDays = Math.floor(-diffMs / 86400000)
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      label: `已过期 ${expiredDays} 天`,
      status: 'expired',
      nextTime: nextStr,
      isExpired: true
    }
  }

  const totalMinutes = Math.floor(diffMs / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  let label: string
  if (days > 0) {
    label = `还剩 ${days} 天 ${hours} 小时`
  } else if (days === 0 && hours > 0) {
    label = `还剩 ${hours} 小时 ${minutes} 分`
  } else if (days === 0 && hours === 0 && minutes > 0) {
    label = `还剩 ${minutes} 分钟`
  } else {
    label = '就是今天！'
  }

  let status: 'normal' | 'urgent' | 'critical'
  if (days <= 7) {
    status = 'critical'
  } else if (days <= 30) {
    status = 'urgent'
  } else {
    status = 'normal'
  }

  return {
    days,
    hours,
    minutes,
    label,
    status,
    nextTime: nextStr,
    isExpired: false
  }
}

export function repeatLabel(repeat?: CountdownRepeat | null): string {
  const rep = parseRepeat(repeat)
  if (rep === null) return '一次性'
  switch (rep.type) {
    case 'once':
      return '一次性'
    case 'daily':
      return '每天'
    case 'weekly': {
      // 周一至周五全选 → 工作日
      const isWorkday = rep.daysOfWeek.length === 5 && rep.daysOfWeek.every(d => d >= 1 && d <= 5)
      if (isWorkday) return '每周 工作日'
      return `每周 ${rep.daysOfWeek.map(d => WEEKDAY_NAMES[d - 1]).join('/')}`
    }
    case 'monthly':
      return `每月 ${rep.dayOfMonth} 日`
    case 'yearly':
      return '每年'
    case 'interval':
      return `每 ${rep.intervalMinutes} 分钟`
  }
}

export function categoryLabel(category?: CountdownCategory): string {
  switch (category) {
    case 'work':
      return '工作'
    case 'life':
      return '生活'
    case 'study':
      return '学习'
    default:
      return '工作'
  }
}

/** 序列化为挂在 `    repeat:` 键下的 YAML 片段（子键 6 空格、列表项 8 空格）；null/once 规范为 ''。 */
export function serializeRepeatYaml(repeat?: CountdownRepeat | null): string {
  const rep = parseRepeat(repeat)
  if (rep === null) return ''
  switch (rep.type) {
    case 'once':
      return ''
    case 'daily':
      return '    repeat:\n      type: daily'
    case 'weekly':
      return `    repeat:\n      type: weekly\n      daysOfWeek:\n${rep.daysOfWeek.map(d => `        - ${d}`).join('\n')}`
    case 'monthly':
      return `    repeat:\n      type: monthly\n      dayOfMonth: ${rep.dayOfMonth}`
    case 'yearly':
      return '    repeat:\n      type: yearly'
    case 'interval':
      return `    repeat:\n      type: interval\n      intervalMinutes: ${rep.intervalMinutes}`
  }
}

/** 'YYYY-MM-DD HH:mm' → 毫秒时间戳；无法解析时返回 0。 */
function timeOf(s: string): number {
  const t = new Date(s.replace(' ', 'T')).getTime()
  return isNaN(t) ? 0 : t
}

function createdTs(c: Pick<Countdown, 'createdAt'>): number {
  const t = new Date(c.createdAt).getTime()
  return isNaN(t) ? 0 : t
}

// 所有模式的最终平局裁决链：createdAt、name、id —— 始终升序，不受 direction 影响。
function byTieBreakers(a: CountdownItem, b: CountdownItem): number {
  const byCreated = createdTs(a) - createdTs(b)
  if (byCreated !== 0) return byCreated
  const byName = a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
  if (byName !== 0) return byName
  return a.id.localeCompare(b.id)
}

export function sortCountdowns(items: CountdownItem[], mode: CountdownSortMode, direction: CountdownSortDirection): CountdownItem[] {
  const dir = direction === 'desc' ? -1 : 1
  return [...items].sort((a, b) => {
    switch (mode) {
      case 'remaining': {
        // 已过期永远排最后（两个方向都如此）：tier 比较始终升序
        const ea = a.remaining.isExpired ? 1 : 0
        const eb = b.remaining.isExpired ? 1 : 0
        if (ea !== eb) return ea - eb
        if (ea === 0) {
          // 都未过期：按下次发生时间，应用 direction
          const t = timeOf(a.remaining.nextTime) - timeOf(b.remaining.nextTime)
          if (t !== 0) return t * dir
        }
        // 都已过期：走 createdTs 升序的平局链
        return byTieBreakers(a, b)
      }
      case 'name': {
        const n = a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
        if (n !== 0) return n * dir
        return byTieBreakers(a, b)
      }
      case 'created': {
        const t = createdTs(a) - createdTs(b)
        if (t !== 0) return t * dir
        return byTieBreakers(a, b)
      }
      case 'endTime': {
        // 纯时间线排序：已过期不强制排后（刻意为之——按实际发生时间排，
        // asc 时过去的一次性事件排最前，desc 时排最后）。
        const t = timeOf(a.remaining.nextTime) - timeOf(b.remaining.nextTime)
        if (t !== 0) return t * dir
        return byTieBreakers(a, b)
      }
      case 'manual': {
        // 始终升序，direction 忽略
        const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER
        const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER
        if (sa !== sb) return sa - sb
        return byTieBreakers(a, b)
      }
    }
  })
}
