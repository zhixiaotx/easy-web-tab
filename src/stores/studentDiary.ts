import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import type { DiaryData, WorkbenchDiary } from '@/types'
import { emptyDiaryData, findDiaryByDate, normalizeDiaryData, sortDiaryEntries } from '../composables/diaryCore'
import { idbGet, idbPut } from '../composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'

const IDB_STORE = 'student_diary' as const

// 学生台日记本 store（与成人 workbench-diary 同构，但 IDB store 'student_diary'，条目前缀 sdy_）
export const useStudentDiaryStore = defineStore('student-diary', () => {
  const entries = ref<WorkbenchDiary[]>([])

  async function loadDiary(): Promise<void> {
    try {
      entries.value = normalizeDiaryData(await idbGet<DiaryData>(IDB_STORE)).entries
    } catch (e) {
      console.error('[StudentDiary] load failed', e)
      entries.value = emptyDiaryData().entries
    }
  }

  async function saveDiary(): Promise<void> {
    try {
      await idbPut(IDB_STORE, { entries: toRaw(entries.value) })
      markDirty()
    } catch (e) {
      console.error('[StudentDiary] save failed', e)
    }
  }

  async function upsertEntry(date: string, content: string): Promise<void> {
    const trimmed = content.trim()
    if (!trimmed) return
    const now = new Date().toISOString()
    const existing = findDiaryByDate(entries.value, date)
    if (existing) {
      existing.content = trimmed
      existing.updatedAt = now
    } else {
      entries.value.push({
        id: `sdy_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        date,
        content: trimmed,
        createdAt: now,
        updatedAt: now
      })
    }
    await saveDiary()
  }

  async function deleteEntry(id: string): Promise<void> {
    entries.value = toRaw(entries.value).filter((e) => e.id !== id)
    await saveDiary()
  }

  const sortedEntries = computed<WorkbenchDiary[]>(() => sortDiaryEntries(entries.value))

  return {
    entries,
    loadDiary,
    saveDiary,
    upsertEntry,
    deleteEntry,
    sortedEntries
  }
})
