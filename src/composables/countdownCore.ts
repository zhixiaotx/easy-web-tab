// 倒计时纯逻辑模块（无运行时依赖，仅 type-only import，编译后完全自包含）。
// calcRemaining 由 stores/countdowns.ts 原样迁移而来，行为保持一致。
import type { Countdown, CountdownItem, CountdownRemaining } from '../types'

export type CountdownSortMode = 'remaining' | 'name' | 'created' | 'endTime' | 'manual'
export type CountdownSortDirection = 'asc' | 'desc'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function calcRemaining(endDateTime: string, repeat?: 'yearly' | null): CountdownRemaining {
  const now = new Date()
  const end = new Date(endDateTime)

  // 无效时间
  if (isNaN(end.getTime())) {
    return { days: 0, hours: 0, minutes: 0, label: '时间无效', status: 'expired', nextTime: '—', isExpired: true }
  }

  // 每年重复：计算今年的目标时间，已过则顺延到下一年
  let target: Date
  if (repeat === 'yearly') {
    target = new Date(now.getFullYear(), end.getMonth(), end.getDate(), end.getHours(), end.getMinutes())
    if (target.getTime() <= now.getTime()) {
      target = new Date(now.getFullYear() + 1, end.getMonth(), end.getDate(), end.getHours(), end.getMinutes())
    }
  } else {
    target = end
  }

  const diffMs = target.getTime() - now.getTime()

  // 一次性且已过期
  if (diffMs <= 0) {
    const expiredDays = Math.floor(-diffMs / 86400000)
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      label: `已过期 ${expiredDays} 天`,
      status: 'expired',
      nextTime: formatLocal(target),
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
    nextTime: formatLocal(target),
    isExpired: false
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
