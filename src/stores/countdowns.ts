import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Countdown, CountdownItem } from '@/types'
import {
  calcRemaining,
  sortCountdowns,
  type CountdownSortMode as SortMode,
  type CountdownSortDirection as SortDirection
} from '../composables/countdownCore'

export type { CountdownItem, CountdownRemaining } from '@/types'
export { calcRemaining, sortCountdowns } from '../composables/countdownCore'
export type { CountdownSortMode, CountdownSortDirection } from '../composables/countdownCore'

const STORAGE_KEY = 'user-countdowns'
const SORT_STORAGE_KEY = 'user-countdown-sort'

const SORT_MODES: readonly SortMode[] = ['remaining', 'name', 'created', 'endTime', 'manual']
const SORT_DIRECTIONS: readonly SortDirection[] = ['asc', 'desc']

export const useCountdownsStore = defineStore('countdowns', () => {
  const countdowns = ref<Countdown[]>([])

  const sortMode = ref<SortMode>('remaining')
  const sortDirection = ref<SortDirection>('asc')

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

  function loadSortPreference(): void {
    try {
      const parsed = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY) ?? '') as {
        mode?: unknown
        direction?: unknown
      }
      const mode = SORT_MODES.find(m => m === parsed.mode)
      const direction = SORT_DIRECTIONS.find(d => d === parsed.direction)
      if (mode !== undefined && direction !== undefined) {
        sortMode.value = mode
        sortDirection.value = direction
      }
    } catch {
      // 解析失败 → 保持默认值
    }
  }

  function persistSortPreference(): void {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ mode: sortMode.value, direction: sortDirection.value }))
  }

  function setSort(mode: SortMode): void {
    sortMode.value = mode
    if (mode === 'manual') ensureSortOrders()
    persistSortPreference()
  }

  function toggleDirection(): void {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
    persistSortPreference()
  }

  function manualOrderItems(): CountdownItem[] {
    return sortCountdowns(
      countdowns.value.map(c => ({
        ...c,
        remaining: calcRemaining(c.endDateTime, c.repeat)
      })),
      'manual',
      'asc'
    )
  }

  function ensureSortOrders(): void {
    if (countdowns.value.every(c => typeof c.sortOrder === 'number')) return
    const manualOrder = manualOrderItems()
    manualOrder.forEach((item, i) => {
      const target = countdowns.value.find(c => c.id === item.id)
      if (target) target.sortOrder = i + 1
    })
    saveCountdowns()
  }

  function moveCountdown(id: string, dir: 'up' | 'down'): void {
    ensureSortOrders()
    const manualOrder = manualOrderItems()
    const idx = manualOrder.findIndex(c => c.id === id)
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1
    if (idx === -1 || targetIdx < 0 || targetIdx >= manualOrder.length) return
    const a = countdowns.value.find(c => c.id === manualOrder[idx].id)
    const b = countdowns.value.find(c => c.id === manualOrder[targetIdx].id)
    if (!a || !b) return
    const tmp = a.sortOrder
    a.sortOrder = b.sortOrder
    b.sortOrder = tmp
    saveCountdowns()
  }

  function setShowOnDisplay(id: string, show: boolean): void {
    const c = countdowns.value.find(c => c.id === id)
    if (c) {
      c.showOnDisplay = show
      saveCountdowns()
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
      updatedAt: now,
      sortOrder:
        countdowns.value.reduce((m, c) => Math.max(m, typeof c.sortOrder === 'number' ? c.sortOrder : 0), 0) + 1
    })
    saveCountdowns()
  }

  function updateCountdown(
    id: string,
    updates: {
      name?: string
      endDateTime?: string
      repeat?: 'yearly' | null
      sortOrder?: number
      showOnDisplay?: boolean
    }
  ): void {
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

  // 排序：按当前 sortMode / sortDirection 排序（manual 模式忽略方向，始终升序）
  const itemsWithRemaining = computed<CountdownItem[]>(() =>
    sortCountdowns(
      countdowns.value.map(c => ({
        ...c,
        remaining: calcRemaining(c.endDateTime, c.repeat)
      })),
      sortMode.value,
      sortDirection.value
    )
  )

  // 前台展示：默认全部显示；showOnDisplay === false 的隐藏
  const frontCountdowns = computed<CountdownItem[]>(() =>
    itemsWithRemaining.value.filter(i => i.showOnDisplay !== false)
  )

  loadSortPreference()

  return {
    countdowns,
    loadCountdowns,
    addCountdown,
    updateCountdown,
    deleteCountdown,
    itemsWithRemaining,
    frontCountdowns,
    sortMode,
    sortDirection,
    setSort,
    toggleDirection,
    moveCountdown,
    setShowOnDisplay
  }
})
