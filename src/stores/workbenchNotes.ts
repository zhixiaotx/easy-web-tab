import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import type { WorkbenchNote } from '@/types'
import { idbGet, idbPut } from '../composables/useIdb'

// 工作台便签 store（数据存 IndexedDB，T9 填充完整增删改查）
export const useWorkbenchNotesStore = defineStore('workbenchNotes', () => {
  const notes = ref<WorkbenchNote[]>([])

  async function loadNotes(): Promise<void> {
    try {
      notes.value = (await idbGet<WorkbenchNote[]>('notes')) ?? []
    } catch (e) {
      console.error('[Notes] load failed', e)
      notes.value = []
    }
  }

  async function saveNotes(): Promise<void> {
    try {
      // toRaw：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError），需写入原始数组
      await idbPut('notes', toRaw(notes.value))
    } catch (e) {
      console.error('[Notes] save failed', e)
    }
  }

  return { notes, loadNotes, saveNotes }
})
