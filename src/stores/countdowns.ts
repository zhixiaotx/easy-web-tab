import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type { Countdown, CountdownCategory, CountdownItem, CountdownRepeat } from '@/types'
import { idbGet, idbPut } from '../composables/useIdb'
import {
  calcRemaining,
  normalizeCountdown,
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

  async function saveCountdowns(): Promise<void> {
    try {
      // toRaw：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError），需写入原始数组
      await idbPut('countdowns', toRaw(countdowns.value))
    } catch (e) {
      console.error('[Countdowns] save failed', e)
    }
  }

  async function loadCountdowns(): Promise<void> {
    let stored: Countdown[] | undefined
    try {
      stored = await idbGet<Countdown[]>('countdowns')
    } catch (e) {
      console.error('[Countdowns] load failed', e)
      stored = undefined
    }
    // 一次性非破坏迁移：IDB 无数据且 localStorage 有遗留快照 → 复制到 IDB（localStorage 保留不删）
    if (stored === undefined && localStorage.getItem(STORAGE_KEY)) {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Countdown[]
        const normalized = parsed.map(normalizeCountdown)
        await idbPut('countdowns', normalized)
        stored = normalized
      } catch (e) {
        console.error('[Countdowns] migrate failed', e)
      }
    }
    // 统一归一化：IDB 存量可能还是旧结构（repeat:'yearly' 字符串 / 缺 category），幂等映射到新规范
    countdowns.value = (stored ?? []).map(normalizeCountdown)
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

  async function ensureSortOrders(): Promise<void> {
    if (countdowns.value.every(c => typeof c.sortOrder === 'number')) return
    const manualOrder = manualOrderItems()
    manualOrder.forEach((item, i) => {
      const target = countdowns.value.find(c => c.id === item.id)
      if (target) target.sortOrder = i + 1
    })
    await saveCountdowns()
  }

  async function moveCountdown(id: string, dir: 'up' | 'down'): Promise<void> {
    await ensureSortOrders()
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
    await saveCountdowns()
  }

  async function setShowOnDisplay(id: string, show: boolean): Promise<void> {
    const c = countdowns.value.find(c => c.id === id)
    if (c) {
      c.showOnDisplay = show
      await saveCountdowns()
    }
  }

  async function addCountdown(input: {
    name: string
    endDateTime: string
    repeat?: CountdownRepeat | null
    category?: CountdownCategory
  }): Promise<void> {
    const now = new Date().toISOString()
    countdowns.value.push(
      normalizeCountdown({
        id: `cd_${Date.now()}`,
        name: input.name,
        endDateTime: input.endDateTime,
        repeat: input.repeat ?? null,
        category: input.category,
        createdAt: now,
        updatedAt: now,
        sortOrder:
          countdowns.value.reduce((m, c) => Math.max(m, typeof c.sortOrder === 'number' ? c.sortOrder : 0), 0) + 1
      })
    )
    await saveCountdowns()
  }

  async function updateCountdown(
    id: string,
    updates: {
      name?: string
      endDateTime?: string
      repeat?: CountdownRepeat | null
      category?: CountdownCategory
      lastRemindedAt?: string
      sortOrder?: number
      showOnDisplay?: boolean
    }
  ): Promise<void> {
    const index = countdowns.value.findIndex(c => c.id === id)
    if (index !== -1) {
      // 过滤 undefined：避免 { lastRemindedAt } 之类局部更新把 repeat/category/sortOrder 冲掉
      const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined)) as typeof updates
      countdowns.value[index] = normalizeCountdown({
        ...countdowns.value[index],
        ...clean,
        updatedAt: new Date().toISOString()
      })
      await saveCountdowns()
    }
  }

  async function deleteCountdown(id: string): Promise<void> {
    // 从 toRaw 的原始数组 filter：在 reactive 代理上直接 filter 会得到 Proxy 元素，
    // toRaw 只解开一层数组，残留的 Proxy 元素会让 IDB 结构化克隆抛 DataCloneError（L1 变体）
    countdowns.value = toRaw(countdowns.value).filter(c => c.id !== id)
    await saveCountdowns()
  }

  // 从 sites.md 导入倒计时（按 id 去重，只追加，语义等同原 sites.ts 直连 localStorage 块）
  async function importCountdowns(entries: Countdown[]): Promise<{ imported: number; skipped: number }> {
    let imported = 0
    let skipped = 0
    const existingIds = new Set(countdowns.value.map(c => c.id))
    entries.forEach((entry, index) => {
      const id = entry.id || `cd_${Date.now()}_${index}`
      if (!existingIds.has(id)) {
        // 导入来源（sites.md 旧格式 repeat:'yearly' / 缺 category）统一归一化
        countdowns.value.push(normalizeCountdown({ ...entry, id }))
        existingIds.add(id)
        imported++
      } else {
        skipped++
      }
    })
    await saveCountdowns()
    return { imported, skipped }
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
    setShowOnDisplay,
    importCountdowns
  }
})
