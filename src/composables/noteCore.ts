// 工作台便签纯逻辑模块：normalizeNoteData 归一化 → sortNotes/filterNotes 展示层。
// 纯函数硬约束：禁止 import vue/pinia（node --experimental-strip-types 测试运行器无法执行）；
// 运行时依赖仅 NOTE_COLORS 常量（与 ledgerCore 引 DEFAULT_LEDGER_CATEGORIES 同模式），其余类型全部 type-only。
import { NOTE_COLORS } from '../types/index.ts'
import type { NoteCategory, NoteColor, NoteData, NoteType, TimelineEntry, WorkbenchNote } from '../types/index.ts'

/** 空便签数据：无分类 + 无便签（返回全新结构，不共享任何引用）。 */
export function emptyNoteData(): NoteData {
  return { categories: [], notes: [] }
}

/** 时光轴单条归一化：id 缺失/非字符串 → 生成 `tle_` 前缀 id；content 兜底 ''；createdAt 非法/缺失 → 当前 ISO。 */
function normalizeTimelineEntry(raw: any | undefined): TimelineEntry {
  const src = raw ?? {}
  const nowIso = new Date().toISOString()
  return {
    id: typeof src.id === 'string' && src.id ? src.id : `tle_${Date.now()}`,
    datetime: typeof src.datetime === 'string' ? src.datetime : '',
    content: typeof src.content === 'string' ? src.content : '',
    createdAt: typeof src.createdAt === 'string' ? src.createdAt : nowIso
  }
}

/**
 * 单条便签归一化（幂等）：脏数据吞掉不抛错。
 * - type 非法/缺失 → 'normal'（仅 'timeline' 原样保留）
 * - categoryId 非字符串/空串 → undefined（未分类）
 * - content 非字符串 → ''；pinned 非 true → false；title 非字符串 → undefined
 * - createdAt/updatedAt 非法/缺失 → 当前 ISO 字符串
 * - color 不在 NOTE_COLORS 预设 → 'blue'（与倒计时/待办默认蓝同源色值）
 * - entries 仅 type==='timeline' 时保留并逐条归一（缺失 → []）；normal 类型强制剔除（置 undefined）
 * - id 缺失/非字符串 → 生成 `nt_` 前缀 id（与 store.addNote 同前缀）
 */
export function normalizeNote(raw: any | undefined): WorkbenchNote {
  const src = raw ?? {}
  const nowIso = new Date().toISOString()
  const type: NoteType = src.type === 'timeline' ? 'timeline' : 'normal'
  const id = typeof src.id === 'string' && src.id ? src.id : `nt_${Date.now()}`
  const categoryId = typeof src.categoryId === 'string' && src.categoryId !== '' ? src.categoryId : undefined
  const color: NoteColor = (NOTE_COLORS as readonly string[]).includes(src.color) ? (src.color as NoteColor) : 'blue'
  const base: WorkbenchNote = {
    id,
    ...(typeof src.title === 'string' ? { title: src.title } : {}),
    content: typeof src.content === 'string' ? src.content : '',
    color,
    pinned: src.pinned === true,
    createdAt: typeof src.createdAt === 'string' ? src.createdAt : nowIso,
    updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : nowIso,
    type,
    categoryId
  }
  if (type === 'timeline') {
    base.entries = Array.isArray(src.entries) ? src.entries.map((e: unknown) => normalizeTimelineEntry(e)) : []
  }
  return base
}

/** 便签数组归一化：逐条 normalizeNote；非数组 → []。 */
export function normalizeNotes(raw: unknown): WorkbenchNote[] {
  return Array.isArray(raw) ? raw.map(n => normalizeNote(n)) : []
}

/** 便签分类归一化（内部辅助）：id/name 必填且非空串（缺失 → 剔除），sort 为 number 才保留。 */
function normalizeNoteCategory(raw: unknown): NoteCategory | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  const id = typeof c.id === 'string' && c.id !== '' ? c.id : ''
  const name = typeof c.name === 'string' && c.name !== '' ? c.name : ''
  if (!id || !name) return null
  const cat: NoteCategory = { id, name }
  if (typeof c.sort === 'number') cat.sort = c.sort
  return cat
}

/**
 * 整库归一化（幂等，兼容数组[旧]与对象[新]两种入参）：
 * - 数组 → 旧格式（纯便签列表）→ { categories: [], notes: normalizeNotes(raw) }
 * - 对象（含 categories/notes 字段）→ 分类逐条兜底 + notes 归一
 * - 其它非法入参（null/数字/字符串）→ emptyNoteData()
 */
export function normalizeNoteData(raw: unknown): NoteData {
  if (Array.isArray(raw)) return { categories: [], notes: normalizeNotes(raw) }
  if (raw && typeof raw === 'object') {
    const src = raw as Record<string, unknown>
    return {
      categories: Array.isArray(src.categories)
        ? src.categories.map(normalizeNoteCategory).filter((c): c is NoteCategory => c !== null)
        : [],
      notes: Array.isArray(src.notes) ? normalizeNotes(src.notes) : []
    }
  }
  return emptyNoteData()
}

/** 便签排序：置顶优先（pinned 在前）→ updatedAt 降序（新的在前）。返回新数组，不 mutate 入参。 */
export function sortNotes(notes: WorkbenchNote[]): WorkbenchNote[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return a.updatedAt < b.updatedAt ? 1 : -1
  })
}

/** 时光轴条目排序：datetime 升序（早的在前），同 datetime 按 createdAt 升序。返回新数组，不 mutate 入参。 */
export function sortTimelineEntries(entries: TimelineEntry[]): TimelineEntry[] {
  return [...entries].sort((a, b) => {
    if (a.datetime !== b.datetime) return a.datetime < b.datetime ? -1 : 1
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
    return 0
  })
}

/** 便签筛选条件：type/categoryId/keyword 均为可选；categoryId 为 'uncategorized' 字面量时匹配未分类。 */
export interface NoteFilter {
  type?: NoteType
  categoryId?: string
  keyword?: string
}

/**
 * 便签筛选（返回新数组，不 mutate 入参）：
 * - type：undefined=不过滤；注意未归一化的便签 type 缺失视为 'normal'
 * - categoryId：undefined=全部；具体分类 id → 精确匹配；'uncategorized' 字面量 → 匹配 categoryId 为 undefined/null/空串 的未分类便签
 * - keyword：title+content 大小写不敏感 includes；空/纯空白 → 不过滤
 */
export function filterNotes(notes: WorkbenchNote[], filter: NoteFilter = {}): WorkbenchNote[] {
  const kw = (filter.keyword ?? '').trim().toLowerCase()
  return notes.filter(n => {
    if (filter.type !== undefined && (n.type ?? 'normal') !== filter.type) return false
    if (filter.categoryId !== undefined) {
      if (filter.categoryId === 'uncategorized') {
        if (!isUncategorized(n)) return false
      } else if (n.categoryId !== filter.categoryId) {
        return false
      }
    }
    if (kw !== '') {
      const hay = `${n.title ?? ''} ${n.content ?? ''}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
}

/** 是否有生效筛选条件：type 非 'normal' / categoryId 已定义 / keyword trim 后非空。 */
export function hasActiveNoteFilter(type: NoteType, categoryId: string | undefined, keyword: string): boolean {
  return type !== 'normal' || categoryId !== undefined || keyword.trim() !== ''
}

/** 工具栏计数文案：active 时「筛选出 X / Y 个」，否则「共 Y 个便签」。 */
export function noteCountText(filteredCount: number, totalCount: number, active: boolean): string {
  return active ? `筛选出 ${filteredCount} / ${totalCount} 个` : `共 ${totalCount} 个便签`
}

/** 按 id 查找便签分类：返回 NoteCategory | undefined；id 缺失（undefined/空）→ undefined。 */
export function findNoteCategory(categories: NoteCategory[], id?: string): NoteCategory | undefined {
  if (!id) return undefined
  return categories.find(c => c.id === id)
}

/** 未分类判定：categoryId 为 undefined / null / 空串 即视为未分类。 */
export function isUncategorized(note: WorkbenchNote): boolean {
  return note.categoryId == null || note.categoryId === ''
}
