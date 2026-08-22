import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import type { NoteCategory, NoteColor, NoteData, NoteType, TimelineEntry, WorkbenchNote } from '@/types'
import { emptyNoteData, normalizeNoteData, sortNotes } from '../composables/noteCore'
import { idbGet, idbPut } from '../composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'

// 工作台便签 store（数据存 IndexedDB store 'notes'：便签分类 + 时光轴条目 混合模型，经 noteCore 归一化后读写）
export const useWorkbenchNotesStore = defineStore('workbenchNotes', () => {
  const categories = ref<NoteCategory[]>([])
  const notes = ref<WorkbenchNote[]>([])

  async function loadNotes(): Promise<void> {
    try {
      // 存量脏数据（旧数组格式/分类缺失/时光轴条目异常等）经 normalizeNoteData 幂等归一
      const norm = normalizeNoteData(await idbGet<NoteData>('notes'))
      categories.value = norm.categories
      notes.value = norm.notes
    } catch (e) {
      console.error('[Notes] load failed', e)
      const empty = emptyNoteData()
      categories.value = empty.categories
      notes.value = empty.notes
    }
  }

  async function saveNotes(): Promise<void> {
    try {
      // toRaw：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError）。
      // toRaw 只解开最外层代理，故对每个 reactive 数组分别 toRaw 后再放入普通对象——
      // 对 { ... } 字面量整体 toRaw 无效（字面量本身非响应式，嵌套 Proxy 不会被解开）。
      await idbPut('notes', { categories: toRaw(categories.value), notes: toRaw(notes.value) })
      markDirty()
    } catch (e) {
      console.error('[Notes] save failed', e)
    }
  }

  async function addNote(input: { title?: string; content: string; color: NoteColor; type?: NoteType; categoryId?: string; entries?: TimelineEntry[] }): Promise<void> {
    const now = new Date().toISOString()
    notes.value.push({
      id: `nt_${Date.now()}`,
      title: input.title,
      content: input.content,
      color: input.color,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      type: input.type,
      categoryId: input.categoryId,
      entries: input.entries
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
    // toRaw 只解开一层数组，残留的 Proxy 元素会让 IDB 结构化克隆抛 DataCloneError
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

  // ---- 便签分类 CRUD ----

  /** 新增便签分类：名称 trim 后非空、与全部现有分类（大小写不敏感）唯一 → 才写入。 */
  async function addCategory(name: string): Promise<boolean> {
    const trimmed = name.trim()
    if (!trimmed) return false
    const lower = trimmed.toLowerCase()
    if (categories.value.some(c => c.name.trim().toLowerCase() === lower)) return false
    // 追加末尾：sort 取现有最大 +1（镜像 categories.ts addCategory），保证 moveCategory 的 sort 交换有意义
    const maxSort = categories.value.reduce((max, c) => Math.max(max, c.sort ?? 0), 0)
    categories.value.push({ id: `nc_${Date.now()}`, name: trimmed, sort: maxSort + 1, showInTabs: true })
    await saveNotes()
    return true
  }

  /** 改名/调序/标签页显隐：名称唯一校验排除自身；失败（未找到/重名/空名）返回 false，不写入。 */
  async function updateCategory(id: string, patch: { name?: string; sort?: number; showInTabs?: boolean }): Promise<boolean> {
    const index = categories.value.findIndex(c => c.id === id)
    if (index === -1) return false
    const changes: Partial<NoteCategory> = {}
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) return false
      if (categories.value.some(c => c.id !== id && c.name.trim().toLowerCase() === name.toLowerCase())) return false
      changes.name = name
    }
    if (patch.sort !== undefined) changes.sort = patch.sort
    if (patch.showInTabs !== undefined) changes.showInTabs = patch.showInTabs
    categories.value[index] = { ...categories.value[index], ...changes }
    await saveNotes()
    return true
  }

  /** 上移/下移：按 sort 排序后与相邻分类交换 sort 权重（镜像 categories.ts moveCategory）；不可移动时返回 false。 */
  async function moveCategory(id: string, dir: 'up' | 'down'): Promise<boolean> {
    const sorted = [...categories.value].sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999))
    const index = sorted.findIndex(c => c.id === id)
    if (index === -1) return false
    if (dir === 'up' && index === 0) return false
    if (dir === 'down' && index >= sorted.length - 1) return false
    const target = sorted[index]
    const neighbor = sorted[dir === 'up' ? index - 1 : index + 1]
    const tempSort = neighbor.sort
    neighbor.sort = target.sort
    target.sort = tempSort ?? 999
    await saveNotes()
    return true
  }

  /** 删除分类：移除分类，并把该分类下所有便签置为未分类（categoryId: undefined），随后写回。 */
  async function deleteCategory(id: string): Promise<boolean> {
    if (!categories.value.some(c => c.id === id)) return false
    categories.value = toRaw(categories.value).filter(c => c.id !== id)
    // 归未分类：必须在 toRaw 的原始数组上 map（同 deleteNote 的 toRaw filter 模式），
    // 直接 notes.value.map 会产生 Proxy 元素 → IDB 结构化克隆 DataCloneError
    notes.value = toRaw(notes.value).map(n => (n.categoryId === id ? { ...n, categoryId: undefined } : n))
    await saveNotes()
    return true
  }

  // ---- 时光轴条目 CRUD ----

  /** 新增时光轴条目：content trim 后必须非空；entries 缺失时先建 []。 */
  async function addTimelineEntry(noteId: string, input: { datetime: string; content: string }): Promise<boolean> {
    const content = input.content.trim()
    if (!content) return false
    const note = notes.value.find(n => n.id === noteId)
    if (!note) return false
    const entries = note.entries ?? []
    entries.push({
      id: `te_${Date.now()}`,
      datetime: input.datetime,
      content,
      createdAt: new Date().toISOString()
    })
    note.entries = entries
    await saveNotes()
    return true
  }

  /** 修改时光轴条目：patch 合并到匹配条目上。 */
  async function updateTimelineEntry(noteId: string, entryId: string, patch: Partial<TimelineEntry>): Promise<void> {
    const note = notes.value.find(n => n.id === noteId)
    const entries = note?.entries
    if (!entries) return
    const index = entries.findIndex(e => e.id === entryId)
    if (index !== -1) {
      entries[index] = { ...entries[index], ...patch }
      await saveNotes()
    }
  }

  /** 删除时光轴条目：在 toRaw 的原始 entries 数组上 filter（解开代理避免 DataCloneError）。 */
  async function deleteTimelineEntry(noteId: string, entryId: string): Promise<void> {
    const note = notes.value.find(n => n.id === noteId)
    const entries = note?.entries
    if (!entries) return
    note.entries = toRaw(entries).filter(e => e.id !== entryId)
    await saveNotes()
  }

  // 排序：置顶优先 → updatedAt 降序（公式属 noteCore，store 只做薄委托）
  const sortedNotes = computed<WorkbenchNote[]>(() => sortNotes(notes.value))

  return {
    categories,
    notes,
    loadNotes,
    saveNotes,
    addNote,
    updateNote,
    deleteNote,
    togglePin,
    addCategory,
    updateCategory,
    moveCategory,
    deleteCategory,
    addTimelineEntry,
    updateTimelineEntry,
    deleteTimelineEntry,
    sortedNotes
  }
})
