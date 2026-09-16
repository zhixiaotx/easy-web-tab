<script setup lang="ts">
import { useViewMode } from '@/composables/useViewMode'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'

const vm = useViewMode()

function timelineCardFields(row: any) {
  const ents = sortedEntriesOf(row)
  const last = ents.length > 0 ? ents[ents.length - 1] : null
  return [
    { label: '标题', value: row.title || '时光轴便签' },
    { label: '分类', value: catNameOf(row) || '未分类' },
    { label: '条目数', value: ents.length + ' 条' },
    { label: '最新条目', value: last ? last.datetime + ' · ' + contentPreview(last.content) : '暂无条目' },
    { label: '更新时间', value: formatNoteTime(row.updatedAt) }
  ]
}


function cardFields(row: any) {
  return [
    { label: '标题', value: row.title || '无标题' },
    { label: '内容', value: contentPreview(row.content) },
    { label: '分类', value: catNameOf(row) || '未分类' },
    { label: '颜色', value: COLOR_LABELS[row.color as keyof typeof COLOR_LABELS] ?? row.color },
    { label: '置顶', value: row.pinned ? '📌' : '—' },
    { label: '更新时间', value: formatNoteTime(row.updatedAt) }
  ]
}

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useWorkbenchNotesStore } from '@/stores/workbenchNotes'
import { filterNotes, findNoteCategory, hasActiveNoteFilter, isUncategorized, noteCountText, sortTimelineEntries, tabCategoriesOf } from '@/composables/noteCore'
import { NOTE_COLORS } from '@/types'
import type { NoteCategory, NoteColor, NoteType, NoteTypeFilter, TimelineEntry, WorkbenchNote } from '@/types'
import { renderMarkdown } from '@/composables/noteMarkdown'

const store = useWorkbenchNotesStore()

// 便签/时光轴条目内容按 Markdown 渲染（renderer 纯函数，template 经 renderedContent 调用）
const renderedContent = (md: string): string => renderMarkdown(md)

// 内容纯文本预览（strip HTML tags for el-table tooltip）
function contentPreview(md: string): string {
  const html = renderMarkdown(md)
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)
}

// 更新时间格式化（时间戳 → 'YYYY-MM-DD HH:mm'）
function formatNoteTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// ===== 搜索表单（草稿 → 应用：输入控件绑定草稿，点「查询」才生效；「重置」一键清空）=====
// 草稿值（绑定搜索表单控件）：
//   searchDraft 关键词；typeDraft 类型（普通/时光轴）；categoryDraft 分类（''=全部；'uncategorized'=未分类；分类 id）
const searchDraft = ref('')
const typeDraft = ref<NoteTypeFilter>('all')
const categoryDraft = ref('')

// 应用值（filteredNotes/emptyText 消费；undefined=全部，'uncategorized' 字面量=未分类，分类 id=精确匹配）
const activeType = ref<NoteTypeFilter>('all')
const searchKeyword = ref('')
const activeCategoryId = ref<string | undefined>(undefined)

// 查询：草稿 → 应用（keyword trim 后生效）
function applyFilters(): void {
  searchKeyword.value = searchDraft.value.trim()
  activeType.value = typeDraft.value
  activeCategoryId.value = categoryDraft.value === '' ? undefined : categoryDraft.value
  // 筛选变化 → 双段分页回第 1 页（R8 两个实例独立，但关键词/类型/分类影响两段，均需归位）
  listPage.value = 1
}

// 分类筛选标签页：点击即时生效（与倒计时面板一致）；同步草稿 ref，保证「查询」不覆盖、重置/删分类回退逻辑一致
function selectCategoryTab(id: string | undefined): void {
  categoryDraft.value = id ?? ''
  activeCategoryId.value = id
  listPage.value = 1
}

// 重置：草稿与应用全部回默认（关键词空、类型普通、分类全部）
function resetFilters(): void {
  searchDraft.value = ''
  typeDraft.value = 'all'
  categoryDraft.value = ''
  applyFilters()
}

// 分类按 sort 升序展示（chips 与分类管理行共用；store 数组顺序与 sort 可能不一致，展示层排序）
const sortedCategories = computed<NoteCategory[]>(() =>
  [...store.categories].sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999))
)

// 标签页可见分类：showInTabs !== false（undefined/true 显示，false 隐藏）——公式走 noteCore.tabCategoriesOf 纯函数，组件禁止重算
const tabCategories = computed<NoteCategory[]>(() => tabCategoriesOf(sortedCategories.value))

// 过滤后的便签列表：先 store.sortedNotes（置顶→updatedAt 降序）再走 noteCore.filterNotes（类型/分类/关键词），过滤公式一律走 noteCore
const filteredNotes = computed<WorkbenchNote[]>(() =>
  filterNotes(store.sortedNotes, {
    type: activeType.value,
    categoryId: activeCategoryId.value,
    keyword: searchKeyword.value
  })
)

// 便签类型判定：type=undefined 缺省按普通处理（与 store 写入一致）
function isTimeline(note: WorkbenchNote): boolean {
  return (note.type ?? 'normal') === 'timeline'
}

// 时光轴内容列预览：最新条目 datetime + 内容（无条目显示占位）
function lastEntryPreview(note: WorkbenchNote): string {
  const ents = sortedEntriesOf(note)
  if (ents.length === 0) return '暂无条目'
  const last = ents[ents.length - 1]
  return last.datetime + ' · ' + contentPreview(last.content)
}

// 类型列行样式：普通便签隐藏展开箭头（仅时光轴有条目管理展开行）
function rowClassName(data: any): string {
  return isTimeline(data.row) ? '' : 'nt-no-expand'
}

// ===== Element Plus el-pagination 分页（普通/时光轴合并为单一列表）=====
const LIST_PAGE_SIZE = 10
const listPage = ref(1)
const listPageItems = computed<WorkbenchNote[]>(() => {
  const start = (listPage.value - 1) * LIST_PAGE_SIZE
  return filteredNotes.value.slice(start, start + LIST_PAGE_SIZE)
})

// 是否存在生效筛选：类型非普通 / 分类已选 / 关键词非空（noteCore 纯函数，组件禁止重算）
const hasActiveFilter = computed(() =>
  hasActiveNoteFilter(activeType.value, activeCategoryId.value, searchKeyword.value)
)

// 工具栏计数文案：有筛选 → 筛选出 X / Y 个；无筛选 → 共 N 个便签（noteCore 纯函数）
const countText = computed(() =>
  noteCountText(filteredNotes.value.length, store.sortedNotes.length, hasActiveFilter.value)
)

// 空态文案：普通 tab 区分「完全没有便签」vs「当前分类/搜索下无便签」；时光轴 tab 区分「还没有时光轴便签」vs「当前筛选无结果」
const emptyText = computed(() => {
  if (activeType.value === 'timeline') {
    return store.notes.some(n => (n.type ?? 'normal') === 'timeline') ? '当前分类/搜索下无时光轴便签' : '还没有时光轴便签'
  }
  if (store.notes.length === 0) return '完全没有便签'
  return '当前分类/搜索下无便签'
})

// 分类徽标名：未分类不显示徽标（isUncategorized 判定）；有分类经 findNoteCategory 取名称
function catNameOf(note: WorkbenchNote): string | undefined {
  return isUncategorized(note) ? undefined : findNoteCategory(store.categories, note.categoryId)?.name
}

// ===== 表单状态机（新增/编辑共用编辑浮层；类型 radio + 分类下拉）=====
const formOpen = ref(false)
const editingId = ref<string | null>(null)
const formTitle = ref('')
const formContent = ref('')
const formColor = ref<NoteColor>('yellow')
const formType = ref<NoteType>('normal')
// 分类下拉值：'' = 未分类（v-model 与 select option 全字符串，避免 undefined 绑定 option 的边缘行为）；保存时 || undefined
const formCategoryId = ref('')

// 表单校验按目标类型执行：normal 需 content trim 非空才能保存；timeline 允许 content 为空（entries 即内容）
const isFormValid = computed(() => formType.value === 'timeline' || formContent.value.trim().length > 0)

const COLOR_LABELS: Record<NoteColor, string> = {
  red: '红',
  orange: '橙',
  yellow: '黄',
  green: '绿',
  cyan: '青',
  blue: '蓝',
  purple: '紫',
  pink: '粉'
}

function startAdd(): void {
  editingId.value = null
  formTitle.value = ''
  formContent.value = ''
  formColor.value = 'yellow'
  formType.value = 'normal' // 新增便签默认普通类型
  formCategoryId.value = ''
  formOpen.value = true
}

function startEdit(note: WorkbenchNote): void {
  editingId.value = note.id
  formTitle.value = note.title ?? ''
  formContent.value = note.content
  formColor.value = note.color
  formType.value = note.type ?? 'normal'
  formCategoryId.value = note.categoryId ?? ''
  formOpen.value = true
}

function cancelForm(): void {
  formOpen.value = false
}

async function handleSave(): Promise<void> {
  if (!isFormValid.value) return
  const content = formContent.value.trim()
  const title = formTitle.value.trim() || undefined
  // 类型切换边界规则：切换普通↔时光轴不删除任何数据——content 始终提交，entries 留在数据中仅 timeline 渲染
  const patch = { title, content, color: formColor.value, type: formType.value, categoryId: formCategoryId.value || undefined }
  if (editingId.value) {
    await store.updateNote(editingId.value, patch)
  } else {
    await store.addNote(patch)
  }
  cancelForm()
}

async function handlePin(note: WorkbenchNote): Promise<void> {
  await store.togglePin(note.id)
}

async function handleDelete(id: string): Promise<void> {
  if (confirm('确定要删除这个便签吗？')) {
    await store.deleteNote(id)
    cancelForm()
  }
}

// ===== 时光轴条目 CRUD（条目只在卡片上编辑，编辑浮层不提供 entries 编辑）=====
const entryDraftDatetime = ref<Record<string, string>>({})
const entryDraftContent = ref<Record<string, string>>({})

// 当前本地时间 'YYYY-MM-DD HH:mm'——禁用 toISOString()（那是 UTC）；本地 getFullYear/getMonth+1/getDate/getHours/getMinutes 补零拼串
function localNowString(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// datetime 校验：结构 ^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$ + 范围（月 1-12 / 日 1-31 / 时 0-23 / 分 0-59）——纯正则无法拒绝 '2026-13-99 25:61'
const DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/
function isValidDatetime(dt: string): boolean {
  if (!DATETIME_RE.test(dt)) return false
  const [date, time] = dt.split(' ')
  const [, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return m >= 1 && m <= 12 && d >= 1 && d <= 31 && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59
}

// 条目展示排序走 noteCore.sortTimelineEntries（datetime 升序 → createdAt 升序），禁止内联排序公式
function sortedEntriesOf(note: WorkbenchNote): TimelineEntry[] {
  return sortTimelineEntries(note.entries ?? [])
}

// ===== 时光轴卡内联条目上限 5 + 「+N 条」全量浮层（S4：卡内只内联前 5 条，超限按钮开浮层看全量，浮层内列表滚动）=====
const TIMELINE_INLINE_LIMIT = 5

// 当前展开全量条目的时光轴便签 id（null = 无展开）；浮层可滚动看全量、支持行内编辑/删除
const timelineExpandNoteId = ref<string | null>(null)

// 卡片内联展示条目：前 5 条（排序已走 sortedEntriesOf，禁止重复排序公式）
function inlineEntriesOf(note: WorkbenchNote): TimelineEntry[] {
  return sortedEntriesOf(note).slice(0, TIMELINE_INLINE_LIMIT)
}

// 超限隐藏条数：> 0 时显示「+N 条」按钮
function hiddenEntryCount(note: WorkbenchNote): number {
  return Math.max(0, sortedEntriesOf(note).length - TIMELINE_INLINE_LIMIT)
}

// 浮层目标便签（读 store 快照；关闭即清空）
const expandedTimelineNote = computed<WorkbenchNote | null>(() => {
  const id = timelineExpandNoteId.value
  if (!id) return null
  return store.notes.find(n => n.id === id) ?? null
})

function openTimelineExpand(noteId: string): void {
  timelineExpandNoteId.value = noteId
}

function closeTimelineExpand(): void {
  timelineExpandNoteId.value = null
}

// 时光轴卡片渲染时给未初始化草稿补默认 datetime（本地当前时间）；追加成功后也重置为当前时间
watch(
  () => filteredNotes.value,
  () => {
    if (activeType.value === 'normal') return
    const now = localNowString()
    for (const note of filteredNotes.value) {
      if (entryDraftDatetime.value[note.id] === undefined) entryDraftDatetime.value[note.id] = now
    }
  },
  { immediate: true }
)

// 快速追加按钮可用条件：content trim 非空 + datetime 合法（不合法 → disabled 不落库）
function canAddEntry(note: WorkbenchNote): boolean {
  if (!(entryDraftContent.value[note.id] ?? '').trim()) return false
  return isValidDatetime((entryDraftDatetime.value[note.id] ?? '').trim())
}

async function handleAddEntry(note: WorkbenchNote): Promise<void> {
  const datetime = (entryDraftDatetime.value[note.id] ?? '').trim()
  const content = (entryDraftContent.value[note.id] ?? '').trim()
  if (!content || !isValidDatetime(datetime)) return
  const ok = await store.addTimelineEntry(note.id, { datetime, content })
  if (ok) {
    entryDraftContent.value[note.id] = ''
    entryDraftDatetime.value[note.id] = localNowString()
  }
}

// 条目编辑：行内编辑（datetime + content），保存校验 datetime 格式 + content 非空
const editingEntry = ref<{ noteId: string; entryId: string } | null>(null)
const entryEditDatetime = ref('')
const entryEditContent = ref('')

function startEditEntry(noteId: string, entry: TimelineEntry): void {
  editingEntry.value = { noteId, entryId: entry.id }
  entryEditDatetime.value = entry.datetime
  entryEditContent.value = entry.content
}

function cancelEditEntry(): void {
  editingEntry.value = null
}

function canSaveEntry(): boolean {
  return isValidDatetime(entryEditDatetime.value.trim()) && entryEditContent.value.trim().length > 0
}

async function handleSaveEntry(noteId: string, entryId: string): Promise<void> {
  if (!canSaveEntry()) return
  await store.updateTimelineEntry(noteId, entryId, {
    datetime: entryEditDatetime.value.trim(),
    content: entryEditContent.value.trim()
  })
  editingEntry.value = null
}

async function handleDeleteEntry(noteId: string, entryId: string): Promise<void> {
  if (confirm('确定要删除这条时光记录吗？')) {
    await store.deleteTimelineEntry(noteId, entryId)
    if (editingEntry.value?.entryId === entryId) editingEntry.value = null
  }
}

// ESC 关闭弹框
function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (formOpen.value) {
    event.preventDefault()
    cancelForm()
  }
}

// 面板自管理数据加载（WorkbenchView 已加载，这里防御性重载，数据在内存中与 IDB 同步）
onMounted(async () => {
  await store.loadNotes()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

</script>

<template>
  <div class="wb-notes">
    <!-- 查询区（关键词/类型 + 查询/重置，与待办面板 td-search 同构；分类筛选 tabs 在下方操作栏之后） -->
    <div class="nt-search">
      <div class="nt-search-fields">
        <label class="nt-field nt-field-grow">
          <span class="nt-field-label">关键词</span>
          <el-input
            v-model="searchDraft"
            type="text"
            class="nt-field-keyword"
            placeholder="搜索便签…"
            data-testid="nt-search-input"
            size="small"
            @keydown.enter="applyFilters"
            clearable
          />
        </label>
        <label class="nt-field">
          <span class="nt-field-label">类型</span>
          <el-select
            v-model="typeDraft"
            class="nt-field-select"
            data-testid="nt-type-select"
            size="small"
          >
            <el-option value="all" label="全部类型" />
            <el-option value="normal" label="普通便签" />
            <el-option value="timeline" label="时光轴便签" />
          </el-select>
        </label>
      </div>
      <div class="nt-search-actions" data-testid="nt-search-actions">
        <el-button class="nt-btn-query" data-testid="nt-search-btn" @click="applyFilters">查询</el-button>
        <el-button class="nt-btn-reset" data-testid="nt-reset-btn" @click="resetFilters">重置</el-button>
      </div>
    </div>

    <!-- 分类筛选标签页（全部/未分类/可见分类，即时过滤）+ 新增便签按钮靠右 -->
    <div class="nt-cat-tabs">
      <el-radio-group :model-value="activeCategoryId" @update:model-value="selectCategoryTab($event === 'all' ? undefined : $event)">
        <el-radio-button :value="undefined" data-testid="nt-cat-all">全部</el-radio-button>
        <el-radio-button value="uncategorized" data-testid="nt-cat-uncategorized">未分类</el-radio-button>
        <el-radio-button
          v-for="cat in tabCategories"
          :key="cat.id"
          :value="cat.id"
          :data-testid="`nt-cat-${cat.id}`"
        >{{ cat.name }}</el-radio-button>
      </el-radio-group>
      <span class="nt-toolbar-count" data-testid="nt-toolbar-count">
        <template v-if="hasActiveFilter">{{ countText }}</template>
      </span>
      <el-button class="nt-btn-add" data-testid="note-add-button" @click="startAdd">＋ 新增便签</el-button>
    </div>

    <!-- 统一表格：普通便签 + 时光轴便签合并为单一列表/卡片（新增「便签类型」列） -->
    <div class="ewt-table-toolbar"><ViewModeToggle :mode="vm.mode" @toggle="vm.toggle" /></div>

    <div v-if="filteredNotes.length > 0" class="nt-table-wrap">
      <el-table v-if="vm.mode === 'list'" class="ewt-table"
        :data="listPageItems"
        :row-class-name="rowClassName"
        stripe
        border
        size="default"
        style="width: 100%"
        height="100%"
        empty-text="当前分类/搜索下无便签"
      >
        <!-- 展开行：仅时光轴便签渲染条目管理（普通便签隐藏展开箭头） -->
        <el-table-column type="expand">
          <template #default="{ row }">
            <div v-if="isTimeline(row)" class="nt-timeline-expand" @click.stop>
              <div class="nt-timeline-expand-title">时光记录（{{ sortedEntriesOf(row).length }} 条）</div>
              <div class="nt-timeline-list">
                <div
                  v-for="entry in inlineEntriesOf(row)"
                  :key="entry.id"
                  class="nt-timeline-item"
                  :data-testid="`nt-entry-${entry.id}`"
                >
                  <template v-if="editingEntry && editingEntry.noteId === row.id && editingEntry.entryId === entry.id">
                    <div class="nt-timeline-item-edit">
                      <el-input v-model="entryEditDatetime" type="text" class="form-input" :data-testid="`nt-entry-edit-dt-${entry.id}`" placeholder="YYYY-MM-DD HH:mm" size="small" />
                      <el-input v-model="entryEditContent" type="text" class="form-input" :data-testid="`nt-entry-edit-content-${entry.id}`" placeholder="记录内容" size="small" />
                      <div class="nt-timeline-item-actions">
                        <el-button type="button" class="btn-save" :disabled="!canSaveEntry()" :data-testid="`nt-entry-save-${entry.id}`" @click="handleSaveEntry(row.id, entry.id)">保存</el-button>
                        <el-button type="button" class="btn-cancel" :data-testid="`nt-entry-cancel-${entry.id}`" @click="cancelEditEntry">取消</el-button>
                      </div>
                    </div>
                  </template>
                  <template v-else>
                    <div class="nt-timeline-item-body">
                      <div class="nt-timeline-item-time">{{ entry.datetime }}</div>
                      <div class="nt-timeline-item-content" v-html="renderedContent(entry.content)"></div>
                      <div class="nt-timeline-item-actions">
                        <el-button type="button" class="btn-edit" :data-testid="`nt-entry-edit-${entry.id}`" @click.stop="startEditEntry(row.id, entry)">编辑</el-button>
                        <el-button type="button" class="btn-delete" :data-testid="`nt-entry-del-${entry.id}`" @click.stop="handleDeleteEntry(row.id, entry.id)">删除</el-button>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
              <el-button v-if="hiddenEntryCount(row) > 0" type="button" class="timeline-more-btn" :data-testid="`nt-entry-more-${row.id}`" @click.stop="openTimelineExpand(row.id)">
                +{{ hiddenEntryCount(row) }} 条
              </el-button>
              <div class="nt-timeline-add-row">
                <el-input v-model="entryDraftDatetime[row.id]" type="text" class="form-input nt-timeline-dt-input" :data-testid="`nt-entry-dt-${row.id}`" placeholder="YYYY-MM-DD HH:mm" size="small" />
                <el-input v-model="entryDraftContent[row.id]" type="text" class="form-input nt-timeline-content-input" :data-testid="`nt-entry-content-${row.id}`" placeholder="添加时光记录…" @keydown.enter="handleAddEntry(row)" size="small" />
                <el-button type="button" class="btn-add" :disabled="!canAddEntry(row)" data-testid="nt-entry-add" @click="handleAddEntry(row)">添加</el-button>
              </div>
            </div>
            <div v-else></div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="90" align="center">
          <template #default="{ row }">
            <span class="nt-type-badge" :class="isTimeline(row) ? 'is-timeline' : 'is-normal'">{{ isTimeline(row) ? '时光轴' : '普通' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="标题" min-width="160" align="left" show-overflow-tooltip>
          <template #default="{ row }">
            <span style="font-weight: 600;">{{ row.title || (isTimeline(row) ? '时光轴便签' : '无标题') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="内容" min-width="200" align="left" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="isTimeline(row)">{{ sortedEntriesOf(row).length }} 条记录 · {{ lastEntryPreview(row) }}</span>
            <span v-else class="nt-content-preview">{{ contentPreview(row.content) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="分类" width="100" align="center">
          <template #default="{ row }">
            <span v-if="catNameOf(row)" class="nt-cat-badge">{{ catNameOf(row) }}</span>
            <span v-else style="color: var(--color-text-secondary, #9ca3af);">未分类</span>
          </template>
        </el-table-column>
        <el-table-column label="颜色" width="80" align="center">
          <template #default="{ row }">
            <span v-if="!isTimeline(row)" class="nt-color-tag">
              <span class="color-dot" :class="`dot-${row.color}`"></span>
              <span>{{ COLOR_LABELS[row.color as NoteColor] }}</span>
            </span>
            <span v-else style="color: var(--color-text-secondary, #9ca3af);">—</span>
          </template>
        </el-table-column>
        <el-table-column label="置顶" width="70" align="center">
          <template #default="{ row }">
            <span v-if="!isTimeline(row)">
              <span v-if="row.pinned" class="nt-pin-badge">📌</span>
              <span v-else style="color: var(--color-text-secondary, #9ca3af);">—</span>
            </span>
            <span v-else style="color: var(--color-text-secondary, #9ca3af);">—</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="140" align="center">
          <template #default="{ row }">{{ formatNoteTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" class-name="ewt-op-col" width="210" align="center" fixed="right">
          <template #default="{ row }">
            <el-button size="small" class="nt-edit-btn" :data-testid="`nt-note-edit-${row.id}`" @click="startEdit(row)">编辑</el-button>
            <el-button v-if="!isTimeline(row)" size="small" class="nt-pin-btn" :class="{ active: row.pinned }" :data-testid="`note-pin-${row.id}`" @click="handlePin(row)">置顶</el-button>
            <el-button size="small" class="nt-delete-btn" :data-testid="`note-delete-${row.id}`" @click="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-else class="ewt-card-grid">
        <RecordsCard
          @edit="startEdit(item)"
          v-for="item in listPageItems"
          :key="item.id"
          :fields="isTimeline(item) ? timelineCardFields(item) : cardFields(item)"
        >
        </RecordsCard>
      </div>
    </div>
    <div v-if="filteredNotes.length > 0" class="nt-list-pager">
      <el-pagination
        v-model:current-page="listPage"
        :page-size="LIST_PAGE_SIZE"
        :page-sizes="[LIST_PAGE_SIZE]"
        layout="total, prev, pager, next, jumper"
        :total="filteredNotes.length"
        background
        small
        prev-text="上一页"
        next-text="下一页"
      />
    </div>

    <div v-if="filteredNotes.length === 0" class="empty-state" data-testid="note-empty">
      {{ emptyText }}
    </div>
    <!-- 时光轴全量条目浮层（S4：「+N 条」开浮层看全量，列表区内滚动；复用 note-overlay 遮罩样式） -->
    <div v-if="expandedTimelineNote" class="note-overlay timeline-expand-overlay" data-testid="nt-entry-overlay" @click.self="closeTimelineExpand">
      <div class="timeline-expand-panel">
        <div class="timeline-expand-head">
          <span class="timeline-title">{{ expandedTimelineNote.title || '时光轴便签' }}</span>
          <el-button type="button" class="btn-cancel" data-testid="nt-entry-overlay-close" @click="closeTimelineExpand">
            关闭
          </el-button>
        </div>
        <div class="timeline-expand-list">
          <div
            v-for="entry in sortedEntriesOf(expandedTimelineNote)"
            :key="entry.id"
            class="timeline-item"
            :data-testid="`nt-entry-${entry.id}`"
          >
            <span class="timeline-dot"></span>
            <template
              v-if="editingEntry && editingEntry.noteId === expandedTimelineNote.id && editingEntry.entryId === entry.id"
            >
              <div class="timeline-item-edit">
                <el-input
                  v-model="entryEditDatetime"
                  type="text"
                  class="form-input"
                  :data-testid="`nt-entry-edit-dt-${entry.id}`"
                  placeholder="YYYY-MM-DD HH:mm"
                  size="small"
                />
                <el-input
                  v-model="entryEditContent"
                  type="text"
                  class="form-input"
                  :data-testid="`nt-entry-edit-content-${entry.id}`"
                  placeholder="记录内容"
                  size="small"
                />
                <div class="timeline-item-actions">
                  <el-button
                    type="button"
                    class="btn-save"
                    :disabled="!canSaveEntry()"
                    :data-testid="`nt-entry-save-${entry.id}`"
                    @click="handleSaveEntry(expandedTimelineNote.id, entry.id)"
                  >
                    保存
                  </el-button>
                  <el-button type="button" class="btn-cancel" :data-testid="`nt-entry-cancel-${entry.id}`" @click="cancelEditEntry">
                    取消
                  </el-button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="timeline-item-body">
                <div class="timeline-item-time">{{ entry.datetime }}</div>
                <div class="timeline-item-content" v-html="renderedContent(entry.content)"></div>
                <div class="timeline-item-actions">
                  <el-button
                    type="button"
                    class="btn-edit"
                    :data-testid="`nt-entry-edit-${entry.id}`"
                    @click.stop="startEditEntry(expandedTimelineNote.id, entry)"
                  >
                    编辑
                  </el-button>
                  <el-button
                    type="button"
                    class="btn-delete"
                    :data-testid="`nt-entry-del-${entry.id}`"
                    @click.stop="handleDeleteEntry(expandedTimelineNote.id, entry.id)"
                  >
                    删除
                  </el-button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>


    <!-- 编辑浮层（新增/编辑共用） -->
    <div v-if="formOpen" class="note-overlay" data-testid="note-overlay" @click.self="cancelForm">
      <div class="note-form">
        <h3 class="note-form-title">{{ editingId ? '编辑便签' : '新增便签' }}</h3>

        <el-input
          v-model="formTitle"
          type="text"
          class="note-title-input"
          data-testid="note-title-input"
          placeholder="标题（可选）"
        />

        <div class="note-form-row">
          <label class="note-form-label">类型</label>
          <div class="note-type-radios">
            <el-radio-group v-model="formType">
              <el-radio-button value="normal" data-testid="nt-form-type-normal">普通</el-radio-button>
              <el-radio-button value="timeline" data-testid="nt-form-type-timeline">时光轴</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <div class="note-form-row">
          <label class="note-form-label" for="nt-form-category">分类</label>
          <el-select
            v-model="formCategoryId"
            id="nt-form-category"
            class="note-cat-select"
            data-testid="nt-form-category"
          >
            <el-option value="" label="未分类" />
            <el-option v-for="cat in sortedCategories" :key="cat.id" :value="cat.id" :label="cat.name" />
          </el-select>
        </div>

        <el-input
          v-model="formContent"
          type="textarea"
          :rows="5"
          class="note-content-input"
          data-testid="note-content-input"
          :placeholder="formType === 'timeline' ? '便签内容（时光轴可为空，条目在卡片上追加）' : '便签内容…'"
        />

        <div class="note-color-picker">
          <el-radio-group v-model="formColor">
            <el-radio
              v-for="color in NOTE_COLORS"
              :key="color"
              :value="color"
              class="color-option"
              :class="[`color-${color}`, { active: formColor === color }]"
              :data-testid="`note-color-${color}`"
            >
              <span class="color-swatch"></span>
              <span class="color-name">{{ COLOR_LABELS[color] }}</span>
            </el-radio>
          </el-radio-group>
        </div>

        <div class="note-form-actions ewt-dialog-footer">
          <el-button type="button" class="btn-cancel" data-testid="note-cancel-button" @click="cancelForm">
            取消
          </el-button>
          <el-button
            type="button"
            class="btn-save"
            :disabled="!isFormValid"
            data-testid="note-save-button"
            @click="handleSave"
          >
            {{ editingId ? '保存' : '添加' }}
          </el-button>
          <el-button v-if="editingId" type="danger" native-type="button" data-testid="note-record-delete" @click="handleDelete(editingId)">删除</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 面板容器 */
.wb-notes {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ===== 查询区 ===== */
.nt-search {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}
.nt-search-fields { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.nt-field { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.nt-field-grow { flex: 0 0 auto; }
.nt-field-grow .nt-field-keyword { width: 250px; }
.nt-field-label { font-size: 13px; color: var(--color-text-secondary, var(--color-text-secondary)); }
.nt-search-actions { display: flex; justify-content: flex-end; gap: 8px; }
.nt-field-select { width: 130px; flex-shrink: 0; }
.nt-btn-query {
  padding: 9px 16px; background: var(--color-primary, var(--color-primary)); border: none;
  border-radius: var(--radius-md, 8px); font-size: 14px; color: #fff; cursor: pointer; white-space: nowrap;
}
.nt-btn-reset {
  padding: 9px 14px; background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px); font-size: 14px; color: var(--color-text-secondary, var(--color-text-secondary));
  cursor: pointer; white-space: nowrap;
}

/* ===== 分类筛选标签页 + 新增按钮 ===== */
.nt-cat-tabs { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.nt-toolbar-count { margin-left: auto; font-size: 14px; color: var(--color-text-secondary, var(--color-text-secondary)); }
.nt-section-title { font-size: 13px; font-weight: 600; color: var(--color-text-secondary, var(--color-text-secondary)); margin: 2px 0 -4px; }
.nt-btn-add {
  padding: 10px 16px; background: var(--color-primary, var(--color-primary)); border: none;
  border-radius: var(--radius-md, 8px); font-size: 14px; color: #fff; cursor: pointer; white-space: nowrap;
}

/* ===== el-table 表格容器（参考 StudentReading）===== */
.nt-table-wrap {
  flex: 1 1 auto;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.nt-table-wrap > :global(.el-table) {
  flex: 1 1 auto;
  min-height: 220px;
  width: 100% !important;
  --el-table-border-color: var(--color-border, #e5e7eb);
  --el-table-header-bg-color: var(--color-bg-hover, #f3f4f6);
  --el-table-tr-bg-color: transparent;
  --el-table-row-hover-bg-color: rgba(59, 130, 246, 0.06);
  font-size: 13px;
  border-radius: 10px;
  overflow: hidden;
}
.nt-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.nt-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .nt-table-wrap > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(html.dark) .nt-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .nt-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
.nt-table-wrap > :global(.el-table .el-table__body-wrapper .cell),
.nt-table-wrap > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
}

/* ===== 分页条 ===== */
.nt-list-pager {
  flex: 0 0 auto;
  padding: 14px 16px 18px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
  margin: 0 0 8px;
  display: flex;
  justify-content: center;
  align-items: center;
}
:global(html.dark) .nt-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}
.nt-list-pager > :global(.el-pagination) { --el-pagination-bg-color: transparent; }
.nt-list-pager > :global(.el-pagination button),
.nt-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #ffffff) !important;
  border: 1px solid var(--color-border, #e5e7eb) !important;
  color: var(--color-text-secondary, #6b7280) !important;
}
.nt-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
:global(html.dark) .nt-list-pager > :global(.el-pagination button),
:global(html.dark) .nt-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #1f2937) !important;
  border-color: var(--color-border, #374151) !important;
  color: var(--color-text-secondary, #d1d5db) !important;
}
:global(html.dark) .nt-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
.nt-list-pager > :global(.el-pagination__total) {
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
}

/* ===== 表格内徽章/标签 ===== */
.nt-content-preview {
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
}
.nt-cat-badge {
  font-size: 12px; font-weight: 600; padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  color: var(--color-primary, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
}
.nt-color-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; opacity: 0.75; }
.nt-pin-badge { font-size: 14px; }
.nt-edit-btn { color: var(--color-link, #3b82f6); }
.nt-delete-btn { color: #ef4444; }
.nt-pin-btn { opacity: 1; }
.nt-pin-btn.active { color: var(--el-color-warning, #e6a23c); border-color: var(--el-color-warning, #e6a23c); }

.color-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dot-yellow { background: #eab308; }
.dot-blue { background: #3b82f6; }
.dot-green { background: #22c55e; }
.dot-pink { background: #ec4899; }
.dot-red { background: #ef4444; }
.dot-orange { background: #f97316; }
.dot-cyan { background: #06b6d4; }
.dot-purple { background: #a855f7; }

/* ===== 时光轴 expand 行（表格内展开）===== */
.nt-timeline-expand { padding: 12px 24px 12px 48px; }
.nt-timeline-expand-title {
  font-size: 13px; font-weight: 600;
  color: var(--color-text-secondary, #6b7280);
  margin-bottom: 8px;
}
.nt-timeline-list { display: flex; flex-direction: column; margin: 4px 0 2px; }
.nt-timeline-item { display: flex; gap: 10px; padding: 6px 0; }
.nt-timeline-item-body { flex: 1; min-width: 0; }
.nt-timeline-item-time { font-size: 12px; font-weight: 600; color: var(--color-text-secondary, #6b7280); font-variant-numeric: tabular-nums; }
.nt-timeline-item-content { font-size: 13px; line-height: 1.5; word-break: break-word; }
.nt-timeline-item-actions { display: flex; gap: 6px; margin-top: 4px; }
.nt-timeline-item-actions .btn-edit, .nt-timeline-item-actions .btn-delete { padding: 3px 8px; font-size: 12px; }
.nt-timeline-item-edit { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.nt-timeline-item-edit .form-input { padding: 6px 10px; font-size: 13px; }
.nt-timeline-item-edit .btn-save, .nt-timeline-item-edit .btn-cancel { padding: 4px 12px; font-size: 12px; }
.nt-timeline-add-row {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  margin-top: 8px; padding-top: 10px;
  border-top: 1px dashed var(--color-border, var(--color-border));
}
.nt-timeline-dt-input { flex: 0 1 150px; min-width: 130px; }
.nt-timeline-content-input { flex: 1; min-width: 120px; }
.nt-timeline-add-row .btn-add { padding: 6px 14px; font-size: 13px; }

/* ===== 时光轴全量条目浮层（保留原样式）===== */
.timeline-title { font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.timeline-more-btn {
  margin: 2px 0 6px; padding: 6px 12px;
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  background: color-mix(in srgb, var(--color-primary, #3b82f6) 8%, transparent);
  color: var(--color-primary, var(--color-primary));
  font-size: 13px; font-weight: 600; cursor: pointer;
}
.timeline-item { position: relative; display: flex; gap: 10px; padding: 6px 0; }
.timeline-item::before {
  content: ''; position: absolute; left: 7px; top: 20px; bottom: -6px; width: 2px;
  background: var(--color-border, var(--color-border));
}
.timeline-item:last-child::before { display: none; }
.timeline-dot {
  flex: 0 0 16px; width: 16px; height: 16px; margin-top: 3px; border-radius: 50%;
  background: var(--color-primary, var(--color-primary));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary, #3b82f6) 25%, transparent);
  z-index: 1;
}
.timeline-item-body { flex: 1; min-width: 0; }
.timeline-item-time { font-size: 12px; font-weight: 600; color: var(--color-text-secondary, var(--color-text-secondary)); font-variant-numeric: tabular-nums; }
.timeline-item-content { font-size: 14px; line-height: 1.5; word-break: break-word; }
.timeline-item-actions { display: flex; gap: 6px; margin-top: 4px; opacity: 0; transition: opacity var(--transition-fast, 0.15s ease); }
.timeline-item:hover .timeline-item-actions { opacity: 1; }
.timeline-item-actions .btn-edit, .timeline-item-actions .btn-delete { padding: 3px 8px; font-size: 12px; }
.timeline-item-edit { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.timeline-item-edit .form-input { padding: 6px 10px; font-size: 13px; }
.timeline-item-edit .btn-save, .timeline-item-edit .btn-cancel { padding: 4px 12px; font-size: 12px; }

/* ===== 空态 ===== */
.empty-state {
  text-align: center; color: var(--color-text-muted, var(--color-text-muted));
  font-size: 14px; padding: 40px 20px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

/* ===== 编辑浮层 ===== */
.note-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 20px;
  background: rgba(0, 0, 0, 0.5);
}
.timeline-expand-overlay { z-index: 1100; }
.timeline-expand-panel {
  width: 100%; max-width: 640px; max-height: calc(100vh - 40px);
  display: flex; flex-direction: column; gap: 10px; padding: 18px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-lg, 14px);
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
}
.timeline-expand-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-shrink: 0; }
.timeline-expand-list { flex: 1; min-height: 0; overflow-y: auto; padding-right: 4px; }

.note-form {
  width: 100%; max-width: var(--dlg-w-notes, 1000px);
  height: var(--dlg-h-notes, 90vh); max-height: calc(100vh - 40px); overflow-y: auto;
  display: flex; flex-direction: column; gap: 12px; padding: 20px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-lg, 14px);
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
}
.note-form-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--color-text, var(--color-text)); }
.form-input {
  padding: 9px 12px; box-sizing: border-box; font-family: inherit; font-size: 14px;
  color: var(--color-text, var(--color-text));
  background-color: var(--color-bg-input, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  transition: border-color var(--transition-fast, 0.15s ease);
}
.form-input:focus { outline: none; border-color: var(--color-primary, var(--color-primary)); }
.note-content-input { flex: 1 1 auto; min-height: 240px; }
.note-content-input :deep(.el-textarea__inner) { height: 100%; min-height: 240px; resize: none; }
.note-form-row { display: flex; align-items: center; gap: 10px; }
.note-form-label { flex: 0 0 auto; min-width: 44px; font-size: 13px; font-weight: 600; color: var(--color-text-secondary, var(--color-text-secondary)); }
.note-type-radios { display: flex; gap: 8px; }
.note-cat-select { flex: 1; min-width: 180px; }
.note-color-picker { display: flex; gap: 10px; flex-wrap: wrap; }
.color-option {
  display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; font-size: 13px;
  cursor: pointer; color: var(--color-text-secondary, var(--color-text-secondary));
  border: 2px solid transparent; border-radius: var(--radius-full, 999px);
  transition: all var(--transition-fast, 0.15s ease);
}
.color-option:hover { border-color: var(--color-border-hover, var(--color-border)); }
.color-option.active { border-color: var(--color-primary, var(--color-primary)); color: var(--color-text, var(--color-text)); }
.color-swatch { width: 14px; height: 14px; border-radius: 50%; display: inline-block; }
.color-yellow .color-swatch { background: #eab308; }
.color-blue .color-swatch { background: #3b82f6; }
.color-green .color-swatch { background: #22c55e; }
.color-pink .color-swatch { background: #ec4899; }
.color-red .color-swatch { background: #ef4444; }
.color-orange .color-swatch { background: #f97316; }
.color-cyan .color-swatch { background: #06b6d4; }
.color-purple .color-swatch { background: #a855f7; }
.note-form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: auto; }
.btn-save {
  padding: 9px 18px; font-size: 14px; color: #fff; white-space: nowrap; cursor: pointer;
  background: var(--color-primary, var(--color-primary)); border: none; border-radius: var(--radius-md, 8px);
}
.btn-save:disabled { background: var(--color-text-muted, var(--color-text-muted)); cursor: not-allowed; }
.btn-cancel {
  padding: 9px 16px; font-size: 14px; white-space: nowrap; cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
}
.btn-delete {
  padding: 9px 16px; font-size: 14px; white-space: nowrap; cursor: pointer;
  color: var(--color-error, var(--color-error));
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-error, var(--color-error));
  border-radius: var(--radius-md, 8px);
}

/* ===== 暗色模式覆盖 ===== */
html.dark .note-overlay { background: rgba(0, 0, 0, 0.7); }
html.dark .note-form { background-color: var(--color-bg-card, #1f2937); }
html.dark .timeline-expand-panel { background-color: var(--color-bg-card, #1f2937); }
html.dark .empty-state { background-color: var(--color-bg-card, #1f2937); }
html.dark .btn-save:disabled { background-color: var(--color-bg-input, #374151); color: var(--color-text-muted, #9ca3af); }
html.dark .btn-add:disabled { background-color: var(--color-bg-input, #374151); color: var(--color-text-muted, #9ca3af); }
html.dark .nt-search { background-color: var(--color-bg-card, #1f2937); box-shadow: none; }
html.dark .nt-btn-reset { background-color: var(--color-bg-card, #1f2937); color: var(--color-text-secondary, #d1d5db); border-color: var(--color-border, #374151); }
html.dark .nt-cat-badge { color: #93c5fd; background: rgba(59, 130, 246, 0.2); border-color: rgba(59, 130, 246, 0.45); }
html.dark .timeline-item-time { color: var(--color-text-secondary, #d1d5db); }
html.dark .timeline-item::before { background: var(--color-border, #374151); }

@media (max-width: 640px) {
  .note-form { max-width: 100%; }
  .nt-field-grow { width: 100%; }
  .nt-field-grow .nt-field-keyword { width: 100%; }
}

/* ===== 合并表格：便签类型徽标 + 普通行隐藏展开箭头 ===== */
.nt-type-badge { font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: var(--radius-full, 999px); white-space: nowrap; }
.nt-type-badge.is-normal { color: var(--color-primary, #3b82f6); background: var(--color-primary-light, #eff6ff); border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent); }
.nt-type-badge.is-timeline { color: var(--color-success, #22c55e); background: color-mix(in srgb, var(--color-success, #22c55e) 12%, transparent); border: 1px solid color-mix(in srgb, var(--color-success, #22c55e) 35%, transparent); }
/* 普通便签行隐藏展开箭头（仅时光轴有条目管理展开） */
.nt-table-wrap :deep(.nt-no-expand .el-table__expand-column .el-table__expand-icon) { visibility: hidden; pointer-events: none; }

/* ===== 便签/时光轴内容 Markdown 排版 ===== */
.nt-timeline-item-content :deep(h1),
.timeline-item-content :deep(h1) { font-size: 15px; font-weight: 700; margin: 0.35em 0; }
.nt-timeline-item-content :deep(h2),
.timeline-item-content :deep(h2) { font-size: 14px; font-weight: 700; margin: 0.35em 0; }
.nt-timeline-item-content :deep(h3),
.timeline-item-content :deep(h3) { font-size: 14px; font-weight: 600; margin: 0.35em 0; }
.nt-timeline-item-content :deep(p),
.timeline-item-content :deep(p) { margin: 0.35em 0; }
.nt-timeline-item-content :deep(ul),
.timeline-item-content :deep(ul),
.nt-timeline-item-content :deep(ol),
.timeline-item-content :deep(ol) { margin: 0.35em 0; padding-left: 1.4em; }
.nt-timeline-item-content :deep(li),
.timeline-item-content :deep(li) { margin: 0.15em 0; }
.nt-timeline-item-content :deep(a),
.timeline-item-content :deep(a) { color: var(--color-primary, var(--color-primary)); text-decoration: underline; word-break: break-all; }
.nt-timeline-item-content :deep(code),
.timeline-item-content :deep(code) { background: color-mix(in srgb, currentColor 12%, transparent); padding: 1px 4px; border-radius: var(--radius-sm, 6px); font-size: 0.9em; }
.nt-timeline-item-content :deep(pre),
.timeline-item-content :deep(pre) { background: color-mix(in srgb, currentColor 12%, transparent); margin: 0.4em 0; padding: 8px 10px; border-radius: 6px; overflow-x: auto; max-width: 100%; font-size: 12px; line-height: 1.4; }
.nt-timeline-item-content :deep(blockquote),
.timeline-item-content :deep(blockquote) { margin: 0.4em 0; padding-left: 0.6em; border-left: 3px solid color-mix(in srgb, currentColor 35%, transparent); opacity: 0.85; }
.nt-timeline-item-content :deep(table),
.timeline-item-content :deep(table) { border-collapse: collapse; margin: 0.4em 0; font-size: 12px; max-width: 100%; }
.nt-timeline-item-content :deep(th),
.timeline-item-content :deep(th),
.nt-timeline-item-content :deep(td),
.timeline-item-content :deep(td) { padding: 2px 6px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); }
.nt-timeline-item-content :deep(th),
.timeline-item-content :deep(th) { font-weight: 600; }
.nt-timeline-item-content :deep(hr),
.timeline-item-content :deep(hr) { border: none; border-top: 1px solid color-mix(in srgb, currentColor 30%, transparent); margin: 0.5em 0; }
.nt-timeline-item-content :deep(img),
.timeline-item-content :deep(img) { max-width: 100%; border-radius: 6px; }
</style>
