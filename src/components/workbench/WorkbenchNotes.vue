<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useWorkbenchNotesStore } from '@/stores/workbenchNotes'
import { filterNotes, findNoteCategory, hasActiveNoteFilter, isUncategorized, noteCountText, partitionNotesByType, sortTimelineEntries, tabCategoriesOf } from '@/composables/noteCore'
import { NOTE_COLORS } from '@/types'
import type { NoteCategory, NoteColor, NoteType, NoteTypeFilter, TimelineEntry, WorkbenchNote } from '@/types'
import { renderMarkdown } from '@/composables/noteMarkdown'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from './PanelPager.vue'

const store = useWorkbenchNotesStore()

// 便签/时光轴条目内容按 Markdown 渲染（renderer 纯函数，template 经 renderedContent 调用）
const renderedContent = (md: string): string => renderMarkdown(md)

// 内容内点击：锚点链接不冒泡到卡片 @click="startEdit"；其余区域照常打开编辑
function onContentClick(e: MouseEvent): void {
  const t = e.target as Element | null
  if (t && t.closest('a')) e.stopPropagation()
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
  normalPaging.goto(1)
  timelinePaging.goto(1)
}

// 分类筛选标签页：点击即时生效（与倒计时面板一致）；同步草稿 ref，保证「查询」不覆盖、重置/删分类回退逻辑一致
function selectCategoryTab(id: string | undefined): void {
  categoryDraft.value = id ?? ''
  activeCategoryId.value = id
  normalPaging.goto(1)
  timelinePaging.goto(1)
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

// 'all' 视图双段渲染：filterNotes 结果按类型拆分为普通/时光轴两段（noteCore 纯函数，组件禁止重算）
const filteredPartition = computed(() => partitionNotesByType(filteredNotes.value))
const filteredNormal = computed(() => filteredPartition.value.normal)
const filteredTimeline = computed(() => filteredPartition.value.timeline)

// ===== 自适应分页（R1/R3/R7/R8）：普通/时光轴两个独立实例（'all' 视图双段各翻各的）=====
// rowHeight 来自 .omo/evidence/workbench-onescreen/row-heights.json 实测（MAX + 2px margin，R4）
// reactive() 解包嵌套 ref：模板中 paging.pageItems/currentPage/totalPages/fitsOnePage 直接取值
const normalGridEl = ref<HTMLElement | null>(null)
const timelineGridEl = ref<HTMLElement | null>(null)
const normalPaging = reactive(usePanelPaging({
  items: () => filteredNormal.value,
  rowHeight: 150,
  maxRows: 2,
  containerRef: normalGridEl,
  gridRef: normalGridEl
}))
const timelinePaging = reactive(usePanelPaging({
  items: () => filteredTimeline.value,
  rowHeight: 2343, // row-heights.json: timeline = 2343 — 时光轴卡片整卡高度（含全部条目）
  containerRef: timelineGridEl,
  gridRef: timelineGridEl
}))

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
          <input
            v-model="searchDraft"
            type="text"
            class="form-input nt-field-keyword"
            placeholder="搜索便签…"
            data-testid="nt-search-input"
            @keydown.enter="applyFilters"
          />
        </label>
        <label class="nt-field">
          <span class="nt-field-label">类型</span>
          <select
            v-model="typeDraft"
            class="form-input nt-field-select"
            data-testid="nt-type-select"
          >
            <option value="all">全部类型</option>
            <option value="normal">普通便签</option>
            <option value="timeline">时光轴便签</option>
          </select>
        </label>
      </div>
      <div class="nt-search-actions" data-testid="nt-search-actions">
        <button class="nt-btn-query" data-testid="nt-search-btn" @click="applyFilters">查询</button>
        <button class="nt-btn-reset" data-testid="nt-reset-btn" @click="resetFilters">重置</button>
      </div>
    </div>

    <!-- 操作栏（无卡片）：新增便签 + 计数 -->
    <div class="nt-headbar">
      <div class="nt-headbar-actions">
        <button class="nt-btn-add" data-testid="note-add-button" @click="startAdd">＋ 新增便签</button>
      </div>
      <span class="nt-toolbar-count" data-testid="nt-toolbar-count">{{ countText }}</span>
    </div>

    <!-- 分类筛选标签页（全部/未分类/可见分类，即时过滤；与倒计时面板 cd-cat-tabs 同构，位于操作栏下方） -->
    <div class="nt-cat-tabs">
      <button
        class="nt-cat-tab"
        :class="{ active: activeCategoryId === undefined }"
        data-testid="nt-cat-all"
        @click="selectCategoryTab(undefined)"
      >全部</button>
      <button
        class="nt-cat-tab"
        :class="{ active: activeCategoryId === 'uncategorized' }"
        data-testid="nt-cat-uncategorized"
        @click="selectCategoryTab('uncategorized')"
      >未分类</button>
      <button
        v-for="cat in tabCategories"
        :key="cat.id"
        class="nt-cat-tab"
        :class="{ active: activeCategoryId === cat.id }"
        :data-testid="`nt-cat-${cat.id}`"
        @click="selectCategoryTab(cat.id)"
      >{{ cat.name }}</button>
    </div>

    <!-- 时光轴便签（仅在类型=时光轴时渲染，'all' 视图只显示普通便签） -->
    <template v-if="activeType === 'timeline'">
      <div
        v-if="filteredTimeline.length > 0"
        ref="timelineGridEl"
        class="notes-grid timeline-grid"
        :class="{ 'timeline-grid-scroll': !timelinePaging.fitsOnePage }"
      >
        <TransitionGroup name="grid">
        <div
          v-for="note in timelinePaging.pageItems"
          :key="note.id"
          class="note-card timeline-card"
          :class="[`note-${note.color}`, { 'is-pinned': note.pinned }]"
          data-testid="nt-timeline-card"
        >
          <div class="note-card-header">
            <span v-if="note.pinned" class="pin-badge">📌 置顶</span>
            <span v-else></span>
            <button
              class="pin-toggle"
              :class="{ active: note.pinned }"
              :title="note.pinned ? '取消置顶' : '置顶'"
              :data-testid="`note-pin-${note.id}`"
              @click.stop="handlePin(note)"
            >
              📌
            </button>
          </div>

          <div class="timeline-card-head">
            <span class="timeline-title">{{ note.title || '时光轴便签' }}</span>
            <button
              type="button"
              class="btn-edit"
              :data-testid="`nt-note-edit-${note.id}`"
              @click.stop="startEdit(note)"
            >
              编辑
            </button>
          </div>

          <!-- 条目列表：sortTimelineEntries（datetime 升序 → createdAt 升序），卡片内联前 5 条（S4），超限经「+N 条」开浮层看全量 -->
          <div class="timeline-list" data-testid="nt-timeline-list">
            <div
              v-for="entry in inlineEntriesOf(note)"
              :key="entry.id"
              class="timeline-item"
              :data-testid="`nt-entry-${entry.id}`"
            >
              <span class="timeline-dot"></span>
              <template v-if="editingEntry && editingEntry.noteId === note.id && editingEntry.entryId === entry.id">
                <div class="timeline-item-edit">
                  <input
                    v-model="entryEditDatetime"
                    type="text"
                    class="form-input"
                    :data-testid="`nt-entry-edit-dt-${entry.id}`"
                    placeholder="YYYY-MM-DD HH:mm"
                  />
                  <input
                    v-model="entryEditContent"
                    type="text"
                    class="form-input"
                    :data-testid="`nt-entry-edit-content-${entry.id}`"
                    placeholder="记录内容"
                  />
                  <div class="timeline-item-actions">
                    <button
                      type="button"
                      class="btn-save"
                      :disabled="!canSaveEntry()"
                      :data-testid="`nt-entry-save-${entry.id}`"
                      @click="handleSaveEntry(note.id, entry.id)"
                    >
                      保存
                    </button>
                    <button type="button" class="btn-cancel" :data-testid="`nt-entry-cancel-${entry.id}`" @click="cancelEditEntry">
                      取消
                    </button>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="timeline-item-body">
                  <div class="timeline-item-time">{{ entry.datetime }}</div>
                  <div class="timeline-item-content" v-html="renderedContent(entry.content)"></div>
                  <div class="timeline-item-actions">
                    <button
                      type="button"
                      class="btn-edit"
                      :data-testid="`nt-entry-edit-${entry.id}`"
                      @click.stop="startEditEntry(note.id, entry)"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      class="btn-delete"
                      :data-testid="`nt-entry-del-${entry.id}`"
                      @click.stop="handleDeleteEntry(note.id, entry.id)"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- 超限「+N 条」按钮（S4）：点击开全量条目浮层 -->
          <button
            v-if="hiddenEntryCount(note) > 0"
            type="button"
            class="timeline-more-btn"
            :data-testid="`nt-entry-more-${note.id}`"
            @click.stop="openTimelineExpand(note.id)"
          >
            +{{ hiddenEntryCount(note) }} 条
          </button>

          <!-- 卡片底部快速追加行：datetime（默认本地当前时间）+ content + 添加按钮 -->
          <div class="timeline-add-row">
            <input
              v-model="entryDraftDatetime[note.id]"
              type="text"
              class="form-input timeline-dt-input"
              :data-testid="`nt-entry-dt-${note.id}`"
              placeholder="YYYY-MM-DD HH:mm"
            />
            <input
              v-model="entryDraftContent[note.id]"
              type="text"
              class="form-input timeline-content-input"
              :data-testid="`nt-entry-content-${note.id}`"
              placeholder="添加时光记录…"
              @keydown.enter="handleAddEntry(note)"
            />
            <button
              type="button"
              class="btn-add"
              :disabled="!canAddEntry(note)"
              data-testid="nt-entry-add"
              @click="handleAddEntry(note)"
            >
              添加
            </button>
          </div>
        </div>
        </TransitionGroup>
      </div>
      <PanelPager
        :page="timelinePaging.currentPage"
        :total="timelinePaging.totalPages"
        @prev="timelinePaging.prev()"
        @next="timelinePaging.next()"
      />

      <div v-if="filteredTimeline.length === 0 && activeType === 'timeline'" class="empty-state" data-testid="note-timeline-empty">
        {{ emptyText }}
      </div>
    </template>

    <!-- 时光轴全量条目浮层（S4：「+N 条」开浮层看全量，列表区内滚动；复用 note-overlay 遮罩样式） -->
    <div v-if="expandedTimelineNote" class="note-overlay timeline-expand-overlay" data-testid="nt-entry-overlay" @click.self="closeTimelineExpand">
      <div class="timeline-expand-panel">
        <div class="timeline-expand-head">
          <span class="timeline-title">{{ expandedTimelineNote.title || '时光轴便签' }}</span>
          <button type="button" class="btn-cancel" data-testid="nt-entry-overlay-close" @click="closeTimelineExpand">
            关闭
          </button>
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
                <input
                  v-model="entryEditDatetime"
                  type="text"
                  class="form-input"
                  :data-testid="`nt-entry-edit-dt-${entry.id}`"
                  placeholder="YYYY-MM-DD HH:mm"
                />
                <input
                  v-model="entryEditContent"
                  type="text"
                  class="form-input"
                  :data-testid="`nt-entry-edit-content-${entry.id}`"
                  placeholder="记录内容"
                />
                <div class="timeline-item-actions">
                  <button
                    type="button"
                    class="btn-save"
                    :disabled="!canSaveEntry()"
                    :data-testid="`nt-entry-save-${entry.id}`"
                    @click="handleSaveEntry(expandedTimelineNote.id, entry.id)"
                  >
                    保存
                  </button>
                  <button type="button" class="btn-cancel" :data-testid="`nt-entry-cancel-${entry.id}`" @click="cancelEditEntry">
                    取消
                  </button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="timeline-item-body">
                <div class="timeline-item-time">{{ entry.datetime }}</div>
                <div class="timeline-item-content" v-html="renderedContent(entry.content)"></div>
                <div class="timeline-item-actions">
                  <button
                    type="button"
                    class="btn-edit"
                    :data-testid="`nt-entry-edit-${entry.id}`"
                    @click.stop="startEditEntry(expandedTimelineNote.id, entry)"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    class="btn-delete"
                    :data-testid="`nt-entry-del-${entry.id}`"
                    @click.stop="handleDeleteEntry(expandedTimelineNote.id, entry.id)"
                  >
                    删除
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 普通便签：空态（区分文案）/ 网格卡片 -->
    <template v-if="activeType !== 'timeline'">
      <div
        v-if="filteredNormal.length > 0"
        ref="normalGridEl"
        class="notes-grid"
        :class="{ 'notes-grid-scroll': !normalPaging.fitsOnePage }"
      >
        <TransitionGroup name="grid">
        <div
          v-for="note in normalPaging.pageItems"
          :key="note.id"
          class="note-card"
          :class="[`note-${note.color}`, { 'is-pinned': note.pinned }]"
          data-testid="note-card"
          @click="startEdit(note)"
        >
          <div class="note-card-header">
            <span v-if="note.pinned" class="pin-badge">📌 置顶</span>
            <span v-else></span>
            <button
              class="pin-toggle"
              :class="{ active: note.pinned }"
              :title="note.pinned ? '取消置顶' : '置顶'"
              :data-testid="`note-pin-${note.id}`"
              @click.stop="handlePin(note)"
            >
              📌
            </button>
          </div>

          <div v-if="note.title" class="note-title">{{ note.title }}</div>
          <div class="note-content" v-html="renderedContent(note.content)" @click="onContentClick"></div>

          <div class="note-card-footer">
            <span v-if="catNameOf(note)" class="note-cat-badge" :data-testid="`note-cat-badge-${note.id}`">
              {{ catNameOf(note) }}
            </span>
            <div class="note-color-tag">
              <span class="color-dot" :class="`dot-${note.color}`"></span>
              <span>{{ COLOR_LABELS[note.color] }}</span>
            </div>
          </div>
        </div>
        </TransitionGroup>
      </div>
      <PanelPager
        :page="normalPaging.currentPage"
        :total="normalPaging.totalPages"
        @prev="normalPaging.prev()"
        @next="normalPaging.next()"
      />

      <div v-if="filteredNormal.length === 0" class="empty-state" data-testid="note-empty">
        {{ emptyText }}
      </div>
    </template>

    <!-- 编辑浮层（新增/编辑共用） -->
    <div v-if="formOpen" class="note-overlay" data-testid="note-overlay" @click.self="cancelForm">
      <div class="note-form">
        <h3 class="note-form-title">{{ editingId ? '编辑便签' : '新增便签' }}</h3>

        <input
          v-model="formTitle"
          type="text"
          class="form-input note-title-input"
          data-testid="note-title-input"
          placeholder="标题（可选）"
        />

        <div class="note-form-row">
          <label class="note-form-label">类型</label>
          <div class="note-type-radios">
            <label class="type-radio-option" :class="{ active: formType === 'normal' }">
              <input v-model="formType" type="radio" name="note-type" value="normal" data-testid="nt-form-type-normal" />
              <span>普通</span>
            </label>
            <label class="type-radio-option" :class="{ active: formType === 'timeline' }">
              <input v-model="formType" type="radio" name="note-type" value="timeline" data-testid="nt-form-type-timeline" />
              <span>时光轴</span>
            </label>
          </div>
        </div>

        <div class="note-form-row">
          <label class="note-form-label" for="nt-form-category">分类</label>
          <select
            v-model="formCategoryId"
            id="nt-form-category"
            class="form-input note-cat-select"
            data-testid="nt-form-category"
          >
            <option value="">未分类</option>
            <option v-for="cat in sortedCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>

        <textarea
          v-model="formContent"
          class="form-input note-content-input"
          rows="5"
          data-testid="note-content-input"
          :placeholder="formType === 'timeline' ? '便签内容（时光轴可为空，条目在卡片上追加）' : '便签内容…'"
        ></textarea>

        <div class="note-color-picker">
          <label
            v-for="color in NOTE_COLORS"
            :key="color"
            class="color-option"
            :class="[`color-${color}`, { active: formColor === color }]"
            :data-testid="`note-color-${color}`"
          >
            <input v-model="formColor" type="radio" name="note-color" :value="color" />
            <span class="color-swatch"></span>
            <span class="color-name">{{ COLOR_LABELS[color] }}</span>
          </label>
        </div>

        <div class="note-form-actions">
          <button
            v-if="editingId"
            type="button"
            class="btn-delete"
            data-testid="note-delete-button"
            @click="handleDelete(editingId)"
          >
            删除
          </button>
          <button type="button" class="btn-cancel" data-testid="note-cancel-button" @click="cancelForm">
            取消
          </button>
          <button
            type="button"
            class="btn-save"
            :disabled="!isFormValid"
            data-testid="note-save-button"
            @click="handleSave"
          >
            {{ editingId ? '保存' : '添加' }}
          </button>
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
  gap: 16px;
}

/* ===== 查询区（卡片：关键词/分类/类型 + 右侧查询/重置，与 WorkbenchTodo .td-search 同构）===== */
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

.nt-search-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.nt-field {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.nt-field-grow {
  flex: 0 0 auto;
}

.nt-field-grow .nt-field-keyword {
  width: 250px;
}

.nt-field-label {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.nt-search-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 分类筛选标签页（全部/未分类/各分类，即时过滤；与 WorkbenchCountdown .cd-cat-tabs 同构） */
.nt-cat-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.nt-cat-tab {
  padding: 5px 14px;
  font-size: 13px;
  border-radius: var(--radius-full, 999px);
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  color: var(--color-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.nt-cat-tab:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.nt-cat-tab.active {
  color: #fff;
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

/* 类型下拉：复用 form-input 基础外观，固定合理宽度 */
.nt-field-select {
  width: 130px;
  flex-shrink: 0;
}

/* 查询（实心主色） */
.nt-btn-query {
  padding: 9px 16px;
  background: var(--color-primary, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.nt-btn-query:hover {
  background: var(--color-primary-hover, var(--color-primary-hover));
}

/* 重置（次级描边） */
.nt-btn-reset {
  padding: 9px 14px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.nt-btn-reset:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

/* ===== 操作栏（无卡片：新增/分类管理 + 计数，与 WorkbenchTodo .td-headbar 同构）===== */
.nt-headbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.nt-headbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.nt-toolbar-count {
  font-size: 14px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.nt-btn-add {
  padding: 10px 16px;
  background: var(--color-primary, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.nt-btn-add:hover {
  background: var(--color-primary-hover, var(--color-primary-hover));
}

/* ===== 网格卡片 ===== */
.notes-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  grid-auto-rows: 150px;
  gap: 10px;
  align-content: start;
}

.note-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  cursor: pointer;
  transition: box-shadow var(--transition-fast, 0.15s ease), transform var(--transition-fast, 0.15s ease);
}

.note-card:hover {
  box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0, 0, 0, 0.12));
  transform: translateY(-2px);
}

.note-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 22px;
}

.pin-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-full, 999px);
  background: rgba(0, 0, 0, 0.12);
}

.pin-toggle {
  border: none;
  background: transparent;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--radius-sm, 6px);
  opacity: 0.4;
  transition: opacity var(--transition-fast, 0.15s ease);
}

.pin-toggle:hover {
  opacity: 0.8;
}

.pin-toggle.active {
  opacity: 1;
}

.note-title {
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-content {
  font-size: 12px;
  line-height: 1.4;
  word-break: break-word;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.note-content > :first-child {
  margin-top: 0;
}

.note-content > :last-child {
  margin-bottom: 0;
}

.note-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
}

.note-cat-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  color: var(--color-primary, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
}

.note-color-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  opacity: 0.75;
}

.color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

/* ===== 四色（浅色）===== */
.note-yellow {
  background: #fef9c3;
  border-color: #fde047;
  color: #713f12;
}

.note-blue {
  background: #dbeafe;
  border-color: #93c5fd;
  color: #1e3a8a;
}

.note-green {
  background: #dcfce7;
  border-color: #86efac;
  color: #14532d;
}

.note-pink {
  background: #fce7f3;
  border-color: #f9a8d4;
  color: #831843;
}

.note-red {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #991b1b;
}

.note-orange {
  background: #ffedd5;
  border-color: #fdba74;
  color: #7c2d12;
}

.note-cyan {
  background: #cffafe;
  border-color: #67e8f9;
  color: #164e63;
}

.note-purple {
  background: #f3e8ff;
  border-color: #d8b4fe;
  color: #581c87;
}

.dot-yellow {
  background: #eab308;
}

.dot-blue {
  background: #3b82f6;
}

.dot-green {
  background: #22c55e;
}

.dot-pink {
  background: #ec4899;
}

.dot-red {
  background: #ef4444;
}

.dot-orange {
  background: #f97316;
}

.dot-cyan {
  background: #06b6d4;
}

.dot-purple {
  background: #a855f7;
}

/* ===== 时光轴卡片（竖排时间轴：左侧圆点+竖线，右侧 datetime + content）===== */
.timeline-grid {
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}

.timeline-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.timeline-title {
  font-size: 15px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-list {
  display: flex;
  flex-direction: column;
  margin: 4px 0 2px;
}

/* 「+N 条」按钮（S4）：卡片内联条目超限时显示，点击开全量条目浮层 */
.timeline-more-btn {
  margin: 2px 0 6px;
  padding: 6px 12px;
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  background: color-mix(in srgb, var(--color-primary, #3b82f6) 8%, transparent);
  color: var(--color-primary, var(--color-primary));
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.timeline-more-btn:hover {
  background: color-mix(in srgb, var(--color-primary, #3b82f6) 16%, transparent);
}

.timeline-item {
  position: relative;
  display: flex;
  gap: 10px;
  padding: 6px 0;
}

/* 轴线竖线：圆点下方延伸到下一条（最后一条不画） */
.timeline-item::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 20px;
  bottom: -6px;
  width: 2px;
  background: var(--color-border, var(--color-border));
}

.timeline-item:last-child::before {
  display: none;
}

.timeline-dot {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  margin-top: 3px;
  border-radius: 50%;
  background: var(--color-primary, var(--color-primary));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary, #3b82f6) 25%, transparent);
  z-index: 1;
}

.timeline-item-body {
  flex: 1;
  min-width: 0;
}

.timeline-item-time {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.timeline-item-content {
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

/* 条目 hover 出现编辑/删除按钮 */
.timeline-item-actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  opacity: 0;
  transition: opacity var(--transition-fast, 0.15s ease);
}

.timeline-item:hover .timeline-item-actions {
  opacity: 1;
}

.timeline-item-actions .btn-edit,
.timeline-item-actions .btn-delete {
  padding: 3px 8px;
  font-size: 12px;
}

.timeline-item-edit {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.timeline-item-edit .form-input {
  padding: 6px 10px;
  font-size: 13px;
}

.timeline-item-edit .btn-save,
.timeline-item-edit .btn-cancel {
  padding: 4px 12px;
  font-size: 12px;
}

/* 快速追加行 */
.timeline-add-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px dashed var(--color-border, var(--color-border));
}

.timeline-dt-input {
  flex: 0 1 150px;
  min-width: 130px;
}

.timeline-content-input {
  flex: 1;
  min-width: 120px;
}

.timeline-add-row .btn-add {
  padding: 6px 14px;
  font-size: 13px;
}

/* ===== 空态 ===== */
.empty-state {
  text-align: center;
  color: var(--color-text-muted, var(--color-text-muted));
  font-size: 14px;
  padding: 40px 20px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

/* ===== 编辑浮层 ===== */
.note-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.5);
}

/* 时光轴全量条目浮层（S4）：复用 note-overlay 遮罩，面板内列表滚动看全量 */
.timeline-expand-overlay {
  z-index: 1100;
}

.timeline-expand-panel {
  width: 100%;
  max-width: 640px;
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-lg, 14px);
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
}

.timeline-expand-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.timeline-expand-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.note-form {
  width: 100%;
  max-width: var(--dlg-w-notes, 1000px);
  height: var(--dlg-h-notes, 90vh);
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-lg, 14px);
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
}

.note-form-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
}

.form-input {
  padding: 9px 12px;
  box-sizing: border-box;
  font-family: inherit;
  font-size: 14px;
  color: var(--color-text, var(--color-text));
  background-color: var(--color-bg-input, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  transition: border-color var(--transition-fast, 0.15s ease);
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary, var(--color-primary));
}

.note-content-input {
  min-height: 330px;
  resize: vertical;
}

/* ===== 浮层类型 radio + 分类下拉 ===== */
.note-form-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.note-form-label {
  flex: 0 0 auto;
  min-width: 44px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.note-type-radios {
  display: flex;
  gap: 8px;
}

.type-radio-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-full, 999px);
  transition: all var(--transition-fast, 0.15s ease);
}

.type-radio-option input {
  display: none;
}

.type-radio-option:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.type-radio-option.active {
  color: #fff;
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.note-cat-select {
  flex: 1;
  min-width: 180px;
}

/* ===== 颜色选择器 ===== */
.note-color-picker {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.color-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 13px;
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  border: 2px solid transparent;
  border-radius: var(--radius-full, 999px);
  transition: all var(--transition-fast, 0.15s ease);
}

.color-option input {
  display: none;
}

.color-option:hover {
  border-color: var(--color-border-hover, var(--color-border));
}

.color-option.active {
  border-color: var(--color-primary, var(--color-primary));
  color: var(--color-text, var(--color-text));
}

.color-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: inline-block;
}

.color-yellow .color-swatch {
  background: #eab308;
}

.color-blue .color-swatch {
  background: #3b82f6;
}

.color-green .color-swatch {
  background: #22c55e;
}

.color-pink .color-swatch {
  background: #ec4899;
}

.color-red .color-swatch {
  background: #ef4444;
}

.color-orange .color-swatch {
  background: #f97316;
}

.color-cyan .color-swatch {
  background: #06b6d4;
}

.color-purple .color-swatch {
  background: #a855f7;
}

/* ===== 表单操作 ===== */
.note-form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-save {
  padding: 9px 18px;
  font-size: 14px;
  color: #fff;
  white-space: nowrap;
  cursor: pointer;
  background: var(--color-primary, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-save:hover:not(:disabled) {
  background: var(--color-primary-hover, var(--color-primary-hover));
}

.btn-save:disabled {
  background: var(--color-text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

.btn-cancel {
  padding: 9px 16px;
  font-size: 14px;
  white-space: nowrap;
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-cancel:hover {
  background: var(--color-bg-hover, var(--color-bg-active));
}

.btn-delete {
  padding: 9px 16px;
  font-size: 14px;
  white-space: nowrap;
  cursor: pointer;
  color: var(--color-error, var(--color-error));
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-error, var(--color-error));
  border-radius: var(--radius-md, 8px);
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-delete:hover {
  background: var(--color-error, var(--color-error));
  color: #fff;
}



/* ===== 暗色模式覆盖 ===== */
:root.dark .note-yellow {
  background: rgba(234, 179, 8, 0.18);
  border-color: #a16207;
  color: #fde047;
}

:root.dark .note-blue {
  background: rgba(59, 130, 246, 0.18);
  border-color: #1d4ed8;
  color: #93c5fd;
}

:root.dark .note-green {
  background: rgba(34, 197, 94, 0.16);
  border-color: #047857;
  color: #6ee7b7;
}

:root.dark .note-pink {
  background: rgba(236, 72, 153, 0.16);
  border-color: #be185d;
  color: #f9a8d4;
}

:root.dark .note-red {
  background: rgba(239, 68, 68, 0.16);
  border-color: #b91c1c;
  color: #fca5a5;
}

:root.dark .note-orange {
  background: rgba(249, 115, 22, 0.16);
  border-color: #c2410c;
  color: #fdba74;
}

:root.dark .note-cyan {
  background: rgba(6, 182, 212, 0.16);
  border-color: #0e7490;
  color: #67e8f9;
}

:root.dark .note-purple {
  background: rgba(168, 85, 247, 0.16);
  border-color: #7e22ce;
  color: #d8b4fe;
}

:root.dark .pin-badge {
  background: rgba(0, 0, 0, 0.35);
}

:root.dark .note-overlay {
  background: rgba(0, 0, 0, 0.7);
}

:root.dark .note-form {
  background-color: var(--color-bg-card, #1f2937);
}

:root.dark .timeline-expand-panel {
  background-color: var(--color-bg-card, #1f2937);
}

:root.dark .empty-state {
  background-color: var(--color-bg-card, #1f2937);
}

/* 禁用态按钮：亮灰底 + 白字在暗色下对比度不足，改用暗输入底 + 灰色文字 */
:root.dark .btn-save:disabled {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text-muted, #9ca3af);
}

:root.dark .btn-add:disabled {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text-muted, #9ca3af);
}

:root.dark .nt-search {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

:root.dark .nt-search .form-input {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text, #f9fafb);
  border-color: var(--color-border, #374151);
}

:root.dark .nt-cat-tab {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

:root.dark .nt-cat-tab:hover {
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

/* 显式覆盖，避免 :root.dark 更高优先级压掉 active 填充（倒计时面板同类陷阱） */
:root.dark .nt-cat-tab.active {
  color: #fff;
  background: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

:root.dark .nt-btn-reset {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

:root.dark .nt-btn-reset:hover {
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

:root.dark .note-cat-badge {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

:root.dark .type-radio-option {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

:root.dark .type-radio-option:hover {
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

:root.dark .type-radio-option.active {
  color: #fff;
  background: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

:root.dark .note-cat-select {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text, #f9fafb);
  border-color: var(--color-border, #374151);
}

:root.dark .timeline-item-time {
  color: var(--color-text-secondary, #d1d5db);
}

:root.dark .timeline-item::before {
  background: var(--color-border, #374151);
}

@media (max-width: 640px) {
  .note-form {
    max-width: 100%;
  }

  .nt-field-grow {
    width: 100%;
  }

  .nt-field-grow .nt-field-keyword {
    width: 100%;
  }
}

/* ===== 桌面（≥769px）一屏布局：网格区 flex 占满 + 分页（R1/R2/R7）=====
   仅桌面作用域；移动端保持原状（页面滚动、全量渲染，composable 惰性不切片）。
   flex:1 + min-height:0 让网格区占满可用高度（RO 测量基准）；!fitsOnePage 退化时区内滚动兜底（R7）；
   timeline-card 卡内只内联前 5 条（S4），超限经「+N 条」开全量浮层（浮层内列表滚动），超高时卡内滚动兜底（min-height:0 允许 grid item 收缩）。 */
@media (min-width: 769px) {
  .notes-grid,
  .timeline-grid {
    flex: 1;
    min-height: 0;
  }

  .notes-grid-scroll,
  .timeline-grid-scroll {
    overflow-y: auto;
  }

  .timeline-card {
    overflow-y: auto;
    min-height: 0;
  }
}

/* ===== 便签/时光轴内容 Markdown 排版 =====
   v-html 注入的子节点不带 data-v-* 属性，必须用 :deep() 匹配；
   currentColor 自动继承 8 种卡片主题色与暗色覆盖，不逐主题覆盖。 */
.note-content :deep(h1),
.timeline-item-content :deep(h1) {
  font-size: 15px;
  font-weight: 700;
  margin: 0.35em 0;
}

.note-content :deep(h2),
.timeline-item-content :deep(h2) {
  font-size: 14px;
  font-weight: 700;
  margin: 0.35em 0;
}

.note-content :deep(h3),
.timeline-item-content :deep(h3) {
  font-size: 14px;
  font-weight: 600;
  margin: 0.35em 0;
}

.note-content :deep(p),
.timeline-item-content :deep(p) {
  margin: 0.35em 0;
}

.note-content :deep(ul),
.timeline-item-content :deep(ul),
.note-content :deep(ol),
.timeline-item-content :deep(ol) {
  margin: 0.35em 0;
  padding-left: 1.4em;
}

.note-content :deep(li),
.timeline-item-content :deep(li) {
  margin: 0.15em 0;
}

.note-content :deep(a),
.timeline-item-content :deep(a) {
  color: var(--color-primary, var(--color-primary));
  text-decoration: underline;
  word-break: break-all;
}

.note-content :deep(code),
.timeline-item-content :deep(code) {
  background: color-mix(in srgb, currentColor 12%, transparent);
  padding: 1px 4px;
  border-radius: var(--radius-sm, 6px);
  font-size: 0.9em;
}

.note-content :deep(pre),
.timeline-item-content :deep(pre) {
  background: color-mix(in srgb, currentColor 12%, transparent);
  margin: 0.4em 0;
  padding: 8px 10px;
  border-radius: 6px;
  overflow-x: auto;
  max-width: 100%;
  font-size: 12px;
  line-height: 1.4;
}

.note-content :deep(blockquote),
.timeline-item-content :deep(blockquote) {
  margin: 0.4em 0;
  padding-left: 0.6em;
  border-left: 3px solid color-mix(in srgb, currentColor 35%, transparent);
  opacity: 0.85;
}

.note-content :deep(table),
.timeline-item-content :deep(table) {
  border-collapse: collapse;
  margin: 0.4em 0;
  font-size: 12px;
  max-width: 100%;
}

.note-content :deep(th),
.timeline-item-content :deep(th),
.note-content :deep(td),
.timeline-item-content :deep(td) {
  padding: 2px 6px;
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
}

.note-content :deep(th),
.timeline-item-content :deep(th) {
  font-weight: 600;
}

.note-content :deep(hr),
.timeline-item-content :deep(hr) {
  border: none;
  border-top: 1px solid color-mix(in srgb, currentColor 30%, transparent);
  margin: 0.5em 0;
}

.note-content :deep(img),
.timeline-item-content :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}
</style>
