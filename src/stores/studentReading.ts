// 学生工作台阅读记录 store（数据存 IndexedDB store 'student_reading' 单对象 { entries }）
// 薄委托 studentReadingCore：归一化/排序/范围筛选/统计均为纯函数，store 禁止内联重算。
// 严格隔离成人数据（独立 IDB 名 + 独立前缀 rd_）。

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  emptyReadingData,
  normalizeReadingData,
  sortReading as sortReadingCore,
  filterByDateRange as filterByDateRangeCore,
  calcReadingStats,
  formatDuration,
  READING_ID_PREFIX,
  type ReadingStats
} from '@/composables/studentReadingCore'
import { idbGet, idbPut } from '@/composables/useIdb'
import type { StudentReadingData, StudentReadingEntry } from '@/types'
import { useStudentRewardsStore } from '@/stores/studentRewards'

export type StudentReadingOpError = 'empty' | 'invalid-range' | 'not-found'
export type StudentReadingOp = { ok: boolean; reason?: StudentReadingOpError }

export interface NewReadingInput {
  bookTitle: string
  pages: number
  durationMin: number
  impression?: string
  date: string
  parentSigned?: boolean
}

export interface ReadingUpdatePatch {
  bookTitle?: string
  pages?: number
  durationMin?: number
  impression?: string
  date?: string
  parentSigned?: boolean
}

function genId(): string {
  return `${READING_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}

function validatePages(v: number): boolean {
  return Number.isFinite(v) && v >= 1 && v <= 999
}
function validateDuration(v: number): boolean {
  return Number.isFinite(v) && v >= 1 && v <= 480
}

export const useStudentReadingStore = defineStore('studentReading', () => {
  const entries = ref<StudentReadingEntry[]>([])

  async function loadReading(): Promise<void> {
    try {
      const norm = normalizeReadingData(await idbGet<StudentReadingData>('student_reading'))
      entries.value = sortReadingCore(norm.entries)
    } catch (e) {
      console.error('[studentReading] load failed', e)
      entries.value = emptyReadingData().entries
    }
  }

  async function saveReading(): Promise<void> {
    try {
      await idbPut('student_reading', { entries: JSON.parse(JSON.stringify(entries.value)) })
    } catch (e) {
      console.error('[studentReading] save failed', e)
    }
  }

  async function addReading(input: NewReadingInput): Promise<StudentReadingOp> {
    const bookTitle = input.bookTitle.trim()
    if (!bookTitle) return { ok: false, reason: 'empty' }
    if (!validatePages(input.pages) || !validateDuration(input.durationMin)) {
      return { ok: false, reason: 'invalid-range' }
    }
    if (!input.date) return { ok: false, reason: 'empty' }
    const now = isoNow()
    const entry: StudentReadingEntry = {
      id: genId(),
      bookTitle: Array.from(bookTitle).slice(0, 50).join(''),
      pages: Math.floor(input.pages),
      durationMin: Math.floor(input.durationMin),
      date: input.date,
      createdAt: now,
      updatedAt: now
    }
    if (input.impression?.trim()) {
      entry.impression = Array.from(input.impression).slice(0, 2000).join('')
    }
    if (input.parentSigned === true) {
      entry.parentSigned = true
      entry.signedAt = now
    }
    entries.value = sortReadingCore([...entries.value, entry])
    await saveReading()
    // 积分联动（仅 ≥30 分钟生效，内部自动判断；失败仅日志，不回滚）
    try {
      const rewardsStore = useStudentRewardsStore()
      await rewardsStore.earnFromReading(entry.id, entry.bookTitle, entry.durationMin)
    } catch (e) {
      console.warn('[studentReading] earnFromReading failed', e)
    }
    return { ok: true }
  }

  async function updateReading(id: string, patch: ReadingUpdatePatch): Promise<StudentReadingOp> {
    const index = entries.value.findIndex(e => e.id === id)
    if (index === -1) return { ok: false, reason: 'not-found' }
    const cur = entries.value[index]
    const next: StudentReadingEntry = { ...cur, updatedAt: isoNow() }
    if (patch.bookTitle !== undefined) {
      const t = patch.bookTitle.trim()
      if (!t) return { ok: false, reason: 'empty' }
      next.bookTitle = Array.from(t).slice(0, 50).join('')
    }
    if (patch.pages !== undefined) {
      if (!validatePages(patch.pages)) return { ok: false, reason: 'invalid-range' }
      next.pages = Math.floor(patch.pages)
    }
    if (patch.durationMin !== undefined) {
      if (!validateDuration(patch.durationMin)) return { ok: false, reason: 'invalid-range' }
      next.durationMin = Math.floor(patch.durationMin)
    }
    if (patch.impression !== undefined) {
      next.impression = patch.impression.trim() ? Array.from(patch.impression).slice(0, 2000).join('') : undefined
    }
    if (patch.date !== undefined) {
      if (!patch.date) return { ok: false, reason: 'empty' }
      next.date = patch.date
    }
    if (patch.parentSigned !== undefined) {
      if (patch.parentSigned === true) {
        next.parentSigned = true
        next.signedAt = isoNow()
      } else {
        next.parentSigned = undefined
        next.signedAt = undefined
      }
    }
    entries.value = sortReadingCore(entries.value.map((e, i) => (i === index ? next : e)))
    await saveReading()
    return { ok: true }
  }

  async function deleteReading(id: string): Promise<StudentReadingOp> {
    if (!entries.value.some(e => e.id === id)) return { ok: false, reason: 'not-found' }
    entries.value = entries.value.filter(e => e.id !== id)
    await saveReading()
    return { ok: true }
  }

  /** 家长签字切换（K 段强制 / P1-3 可选，由面板控制是否展示开关） */
  async function toggleParentSign(id: string): Promise<StudentReadingOp> {
    const cur = entries.value.find(e => e.id === id)
    if (!cur) return { ok: false, reason: 'not-found' }
    return updateReading(id, { parentSigned: !cur.parentSigned })
  }

  // ---- 只读薄委托 ----
  function filterByDateRange(start: string, end: string): StudentReadingEntry[] {
    return filterByDateRangeCore(entries.value, start, end)
  }

  function stats(): ReadingStats {
    return calcReadingStats(entries.value)
  }

  function formatReadingDuration(min: number): string {
    return formatDuration(min)
  }

  return {
    entries,
    loadReading,
    saveReading,
    addReading,
    updateReading,
    deleteReading,
    toggleParentSign,
    filterByDateRange,
    stats,
    formatReadingDuration
  }
})
