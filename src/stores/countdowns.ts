import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Countdown } from '@/types'

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

const STORAGE_KEY = 'user-countdowns'

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

export const useCountdownsStore = defineStore('countdowns', () => {
  const countdowns = ref<Countdown[]>([])

  function saveCountdowns(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(countdowns.value))
  }

  function loadCountdowns(): void {
    try {
      countdowns.value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    } catch {
      countdowns.value = []
    }
  }

  function addCountdown(input: { name: string; endDateTime: string; repeat?: 'yearly' | null }): void {
    const now = new Date().toISOString()
    countdowns.value.push({
      id: `cd_${Date.now()}`,
      name: input.name,
      endDateTime: input.endDateTime,
      repeat: input.repeat ?? null,
      createdAt: now,
      updatedAt: now
    })
    saveCountdowns()
  }

  function updateCountdown(id: string, updates: { name?: string; endDateTime?: string; repeat?: 'yearly' | null }): void {
    const index = countdowns.value.findIndex(c => c.id === id)
    if (index !== -1) {
      countdowns.value[index] = {
        ...countdowns.value[index],
        ...updates,
        updatedAt: new Date().toISOString()
      }
      saveCountdowns()
    }
  }

  function deleteCountdown(id: string): void {
    countdowns.value = countdowns.value.filter(c => c.id !== id)
    saveCountdowns()
  }

  // 排序 key：已过期排最后，其余按下次发生时间升序（最紧急在前）
  function sortKey(item: CountdownItem): number {
    if (item.remaining.isExpired) return Number.MAX_SAFE_INTEGER
    return new Date(item.remaining.nextTime.replace(' ', 'T')).getTime()
  }

  const itemsWithRemaining = computed<CountdownItem[]>(() =>
    countdowns.value
      .map(c => ({
        ...c,
        remaining: calcRemaining(c.endDateTime, c.repeat)
      }))
      .sort((a, b) => sortKey(a) - sortKey(b))
  )

  return {
    countdowns,
    loadCountdowns,
    addCountdown,
    updateCountdown,
    deleteCountdown,
    itemsWithRemaining
  }
})
