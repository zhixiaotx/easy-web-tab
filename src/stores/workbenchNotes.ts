import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import type { NoteColor, WorkbenchNote } from '@/types'
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

  async function addNote(input: { title?: string; content: string; color: NoteColor }): Promise<void> {
    const now = new Date().toISOString()
    notes.value.push({
      id: `nt_${Date.now()}`,
      title: input.title,
      content: input.content,
      color: input.color,
      pinned: false,
      createdAt: now,
      updatedAt: now
    })
    await saveNotes()
  }

  async function updateNote(id: string, patch: Partial<WorkbenchNote>): Promise<void> {
    const index = notes.value.findIndex(n => n.id === id)
    if (index !== -1) {
      notes.value[index] = {
        ...notes.value[index],
        ...patch,
        updatedAt: new Date().toISOString()
      }
      await saveNotes()
    }
  }

  async function deleteNote(id: string): Promise<void> {
    // 从 toRaw 的原始数组 filter：在 reactive 代理上直接 filter 会得到 Proxy 元素，
    // toRaw 只解开一层数组，残留的 Proxy 元素会让 IDB 结构化克隆抛 DataCloneError（L1 变体）
    notes.value = toRaw(notes.value).filter(n => n.id !== id)
    await saveNotes()
  }

  async function togglePin(id: string): Promise<void> {
    const note = notes.value.find(n => n.id === id)
    if (note) {
      note.pinned = !note.pinned
      note.updatedAt = new Date().toISOString()
      await saveNotes()
    }
  }

  // 排序：置顶在前 → updatedAt 降序（新的在前）
  const sortedNotes = computed<WorkbenchNote[]>(() => {
    return [...notes.value].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return a.updatedAt < b.updatedAt ? 1 : -1
    })
  })

  return {
    notes,
    loadNotes,
    saveNotes,
    addNote,
    updateNote,
    deleteNote,
    togglePin,
    sortedNotes
  }
})
