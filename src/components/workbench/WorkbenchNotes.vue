<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useWorkbenchNotesStore } from '@/stores/workbenchNotes'
import { filterNotes, findNoteCategory, hasActiveNoteFilter, isUncategorized, noteCountText, sortTimelineEntries } from '@/composables/noteCore'
import { useToast } from '@/composables/useToast'
import { NOTE_COLORS } from '@/types'
import type { NoteCategory, NoteColor, NoteType, TimelineEntry, WorkbenchNote } from '@/types'

const store = useWorkbenchNotesStore()
const toast = useToast()

// ===== 搜索表单（草稿 → 应用：输入控件绑定草稿，点「查询」才生效；「重置」一键清空）=====
// 草稿值（绑定搜索表单控件）：
//   searchDraft 关键词；typeDraft 类型（普通/时光轴）；categoryDraft 分类（''=全部；'uncategorized'=未分类；分类 id）
const searchDraft = ref('')
const typeDraft = ref<NoteType>('normal')
const categoryDraft = ref('')

// 应用值（filteredNotes/emptyText 消费；undefined=全部，'uncategorized' 字面量=未分类，分类 id=精确匹配）
const activeType = ref<NoteType>('normal')
const searchKeyword = ref('')
const activeCategoryId = ref<string | undefined>(undefined)

// 查询：草稿 → 应用（keyword trim 后生效）
function applyFilters(): void {
  searchKeyword.value = searchDraft.value.trim()
  activeType.value = typeDraft.value
  activeCategoryId.value = categoryDraft.value === '' ? undefined : categoryDraft.value
}

// 分类筛选标签页：点击即时生效（与倒计时面板一致）；同步草稿 ref，保证「查询」不覆盖、重置/删分类回退逻辑一致
function selectCategoryTab(id: string | undefined): void {
  categoryDraft.value = id ?? ''
  activeCategoryId.value = id
}

// 重置：草稿与应用全部回默认（关键词空、类型普通、分类全部）
function resetFilters(): void {
  searchDraft.value = ''
  typeDraft.value = 'normal'
  categoryDraft.value = ''
  applyFilters()
}

// 分类按 sort 升序展示（chips 与分类管理行共用；store 数组顺序与 sort 可能不一致，展示层排序）
const sortedCategories = computed<NoteCategory[]>(() =>
  [...store.categories].sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999))
)

// 过滤后的便签列表：先 store.sortedNotes（置顶→updatedAt 降序）再走 noteCore.filterNotes（类型/分类/关键词），过滤公式一律走 noteCore
const filteredNotes = computed<WorkbenchNote[]>(() =>
  filterNotes(store.sortedNotes, {
    type: activeType.value,
    categoryId: activeCategoryId.value,
    keyword: searchKeyword.value
  })
)

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

// 时光轴卡片渲染时给未初始化草稿补默认 datetime（本地当前时间）；追加成功后也重置为当前时间
watch(
  () => filteredNotes.value,
  () => {
    if (activeType.value !== 'timeline') return
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

// ===== 分类管理弹框（仿 WorkbenchLedger.vue 分组管理交互范式）=====
const showCatManager = ref(false)
const catDrafts = ref<Record<string, string>>({})
const newCatName = ref('')

function openCatManager(): void {
  const drafts: Record<string, string> = {}
  for (const c of store.categories) drafts[c.id] = c.name
  catDrafts.value = drafts
  showCatManager.value = true
}

function closeCatManager(): void {
  showCatManager.value = false
}

// 改名：@change（失焦）或回车提交；重名/空名被 store 拒绝 → toast + 回退草稿
async function commitCatName(cat: NoteCategory): Promise<void> {
  const draft = catDrafts.value[cat.id] ?? ''
  const trimmed = draft.trim()
  if (trimmed === cat.name) return
  const ok = await store.updateCategory(cat.id, { name: trimmed })
  if (!ok) {
    toast.error('分类名称已存在或为空')
    catDrafts.value[cat.id] = cat.name
  }
}

async function handleMoveCat(cat: NoteCategory, dir: 'up' | 'down'): Promise<void> {
  const ok = await store.moveCategory(cat.id, dir)
  if (!ok) toast.warning('已到边界，无法移动')
}

// 删除分类：确认后调 store.deleteCategory（该分类便签归未分类由 store 处理，组件只管调 API 与刷新视图）；当前正按该分类筛选时重置为「全部」
async function handleDeleteCat(cat: NoteCategory): Promise<void> {
  if (!confirm(`确定要删除分类「${cat.name}」吗？该分类下的便签将归为未分类`)) return
  const ok = await store.deleteCategory(cat.id)
  if (!ok) {
    toast.error('分类删除失败')
    return
  }
  delete catDrafts.value[cat.id]
  // 当前正按该分类筛选（应用值或草稿值）时重置为「全部」
  if (activeCategoryId.value === cat.id) activeCategoryId.value = undefined
  if (categoryDraft.value === cat.id) categoryDraft.value = ''
}

async function handleAddCat(): Promise<void> {
  const name = newCatName.value.trim()
  if (!name) return
  const ok = await store.addCategory(name)
  if (!ok) {
    toast.error('分类名称已存在')
    return
  }
  // 新分类补录草稿，保证其改名回退/校验基准正确
  for (const c of store.categories) {
    if (catDrafts.value[c.id] === undefined) catDrafts.value[c.id] = c.name
  }
  newCatName.value = ''
}

// ESC 关闭弹框（先编辑浮层，再分类管理）
function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (formOpen.value) {
    event.preventDefault()
    cancelForm()
  } else if (showCatManager.value) {
    event.preventDefault()
    closeCatManager()
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
    <!-- 查询区（关键词/类型 + 查询/重置 + 分类筛选 tabs，与待办面板 td-search 同构） -->
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
            <option value="normal">普通便签</option>
            <option value="timeline">时光轴便签</option>
          </select>
        </label>
      </div>
      <div class="nt-search-actions" data-testid="nt-search-actions">
        <button class="nt-btn-query" data-testid="nt-search-btn" @click="applyFilters">查询</button>
        <button class="nt-btn-reset" data-testid="nt-reset-btn" @click="resetFilters">重置</button>
      </div>

      <!-- 分类筛选标签页（全部/未分类/各分类，即时过滤；与倒计时面板 cd-cat-tabs 同构） -->
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
          v-for="cat in sortedCategories"
          :key="cat.id"
          class="nt-cat-tab"
          :class="{ active: activeCategoryId === cat.id }"
          :data-testid="`nt-cat-${cat.id}`"
          @click="selectCategoryTab(cat.id)"
        >{{ cat.name }}</button>
      </div>
    </div>

    <!-- 操作栏（无卡片）：新增便签/分类管理 + 计数，与待办面板 td-headbar 同构 -->
    <div class="nt-headbar">
      <div class="nt-headbar-actions">
        <button class="nt-btn-add" data-testid="note-add-button" @click="startAdd">＋ 新增便签</button>
        <button class="nt-btn-manage" data-testid="nt-cat-manager" @click="openCatManager">分类管理</button>
      </div>
      <span class="nt-toolbar-count" data-testid="nt-toolbar-count">{{ countText }}</span>
    </div>

    <!-- 时光轴（类型下拉=时光轴）：filterNotes 过滤后的时光轴卡片网格（复用分类下拉/关键词查询联动）；空态沿用 emptyText 逻辑 -->
    <template v-if="activeType === 'timeline'">
      <div v-if="filteredNotes.length === 0" class="empty-state" data-testid="note-timeline-empty">
        {{ emptyText }}
      </div>

      <div v-else class="notes-grid timeline-grid">
        <div
          v-for="note in filteredNotes"
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

          <!-- 条目列表：sortTimelineEntries（datetime 升序 → createdAt 升序） -->
          <div class="timeline-list" data-testid="nt-timeline-list">
            <div
              v-for="entry in sortedEntriesOf(note)"
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
                  <div class="timeline-item-content">{{ entry.content }}</div>
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
      </div>
    </template>

    <!-- 普通便签：空态（区分文案）/ 网格卡片 -->
    <template v-else>
      <div v-if="filteredNotes.length === 0" class="empty-state" data-testid="note-empty">
        {{ emptyText }}
      </div>

      <div v-else class="notes-grid">
        <div
          v-for="note in filteredNotes"
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
          <div class="note-content">{{ note.content }}</div>

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

    <!-- 分类管理弹框（仿 WorkbenchLedger.vue 分组管理交互范式：行 = 名称 input + 上移/下移/删除，底部新增行） -->
    <div v-if="showCatManager" class="note-overlay cat-manager-overlay" data-testid="nt-cat-dialog" @click.self="closeCatManager">
      <div class="cat-manager-dialog">
        <div class="cat-dialog-header">
          <h3>管理分类</h3>
          <button class="cat-dialog-close" @click="closeCatManager">✕</button>
        </div>
        <div class="cat-dialog-body">
          <div class="cat-manager-list">
            <div v-for="cat in sortedCategories" :key="cat.id" class="cat-manager-row" :data-testid="`nt-catmgr-row-${cat.id}`">
              <input
                v-model="catDrafts[cat.id]"
                type="text"
                class="form-input cat-name-input"
                :data-testid="`nt-catmgr-name-${cat.id}`"
                @change="commitCatName(cat)"
                @keydown.enter="commitCatName(cat)"
              />
              <div class="cat-row-actions">
                <button class="btn-edit" :data-testid="`nt-catmgr-up-${cat.id}`" @click="handleMoveCat(cat, 'up')">↑ 上移</button>
                <button class="btn-edit" :data-testid="`nt-catmgr-down-${cat.id}`" @click="handleMoveCat(cat, 'down')">↓ 下移</button>
                <button class="btn-delete" :data-testid="`nt-catmgr-del-${cat.id}`" @click="handleDeleteCat(cat)">删除</button>
              </div>
            </div>
          </div>

          <div class="cat-add-form">
            <input
              v-model="newCatName"
              type="text"
              class="form-input"
              placeholder="新分类名称"
              data-testid="nt-catmgr-new-name"
              @keydown.enter="handleAddCat"
            />
            <button class="btn-add" :disabled="newCatName.trim() === ''" data-testid="nt-catmgr-add" @click="handleAddCat">
              添加
            </button>
          </div>
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
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
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
  color: var(--text-secondary, var(--color-text-secondary));
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
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.nt-cat-tab:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.nt-cat-tab.active {
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

/* 类型下拉：复用 form-input 基础外观，固定合理宽度 */
.nt-field-select {
  width: 130px;
  flex-shrink: 0;
}

/* 查询（实心主色） */
.nt-btn-query {
  padding: 9px 16px;
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.nt-btn-query:hover {
  background: var(--accent-hover, var(--color-primary-hover));
}

/* 重置（次级描边） */
.nt-btn-reset {
  padding: 9px 14px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.nt-btn-reset:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
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
  color: var(--text-secondary, var(--color-text-secondary));
}

.nt-btn-add {
  padding: 10px 16px;
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.nt-btn-add:hover {
  background: var(--accent-hover, var(--color-primary-hover));
}

.nt-btn-manage {
  padding: 10px 16px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.nt-btn-manage:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

/* ===== 网格卡片 ===== */
.notes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.note-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  min-height: 285px;
  border: 1px solid transparent;
  border-radius: var(--radius-md, 12px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  cursor: pointer;
  transition: box-shadow var(--transition-fast, 0.15s ease);
}

.note-card:hover {
  box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0, 0, 0, 0.12));
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
  font-size: 15px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-content {
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 11;
  -webkit-box-orient: vertical;
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
  color: var(--accent-color, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--accent-color, #3b82f6) 30%, transparent);
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
  background: var(--border-color, var(--color-border));
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
  background: var(--accent-color, var(--color-primary));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color, #3b82f6) 25%, transparent);
  z-index: 1;
}

.timeline-item-body {
  flex: 1;
  min-width: 0;
}

.timeline-item-time {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.timeline-item-content {
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
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
  border-top: 1px dashed var(--border-color, var(--color-border));
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
  color: var(--text-muted, var(--color-text-muted));
  font-size: 14px;
  padding: 40px 20px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px dashed var(--border-color, var(--color-border));
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
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-lg, 14px);
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
}

.note-form-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
}

.form-input {
  padding: 9px 12px;
  box-sizing: border-box;
  font-family: inherit;
  font-size: 14px;
  color: var(--text-primary, var(--color-text));
  background-color: var(--input-bg, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  transition: border-color var(--transition-fast, 0.15s ease);
}

.form-input:focus {
  outline: none;
  border-color: var(--accent-color, var(--color-primary));
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
  color: var(--text-secondary, var(--color-text-secondary));
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
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-full, 999px);
  transition: all var(--transition-fast, 0.15s ease);
}

.type-radio-option input {
  display: none;
}

.type-radio-option:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.type-radio-option.active {
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
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
  color: var(--text-secondary, var(--color-text-secondary));
  border: 2px solid transparent;
  border-radius: var(--radius-full, 999px);
  transition: all var(--transition-fast, 0.15s ease);
}

.color-option input {
  display: none;
}

.color-option:hover {
  border-color: var(--border-light, var(--color-border));
}

.color-option.active {
  border-color: var(--accent-color, var(--color-primary));
  color: var(--text-primary, var(--color-text));
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
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-save:hover:not(:disabled) {
  background: var(--accent-hover, var(--color-primary-hover));
}

.btn-save:disabled {
  background: var(--text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

.btn-cancel {
  padding: 9px 16px;
  font-size: 14px;
  white-space: nowrap;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-cancel:hover {
  background: var(--hover-bg, var(--color-bg-active));
}

.btn-delete {
  padding: 9px 16px;
  font-size: 14px;
  white-space: nowrap;
  cursor: pointer;
  color: var(--error-color, var(--color-error));
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--error-color, var(--color-error));
  border-radius: var(--radius-md, 8px);
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-delete:hover {
  background: var(--error-color, var(--color-error));
  color: #fff;
}

/* ===== 分类管理弹框（复用 note-overlay 遮罩）===== */
.cat-manager-dialog {
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-lg, 14px);
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
}

.cat-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, var(--color-border));
  position: sticky;
  top: 0;
  background: var(--bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg, 14px) var(--radius-lg, 14px) 0 0;
}

.cat-dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
}

.cat-dialog-close {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--text-muted, var(--color-text-muted));
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm, 6px);
  transition: color var(--transition-fast, 0.15s ease);
}

.cat-dialog-close:hover {
  color: var(--text-primary, var(--color-text));
}

.cat-dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cat-manager-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cat-manager-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
}

.cat-name-input {
  flex: 1;
  min-width: 140px;
}

.cat-row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 行内小按钮：复用表单按钮体系但缩小到行级尺寸 */
.cat-row-actions .btn-edit,
.cat-row-actions .btn-delete {
  padding: 4px 10px;
  font-size: 12px;
}

.btn-edit {
  padding: 4px 10px;
  font-size: 12px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-edit:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.cat-add-form {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px;
  border: 1px dashed var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
}

.cat-add-form .form-input {
  flex: 1;
  min-width: 140px;
}

.btn-add {
  padding: 9px 18px;
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-add:hover:not(:disabled) {
  background: var(--accent-hover, var(--color-primary-hover));
}

.btn-add:disabled {
  background: var(--text-muted, var(--color-text-muted));
  cursor: not-allowed;
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
  background-color: var(--bg-secondary, #1f2937);
}

:root.dark .empty-state {
  background-color: var(--bg-secondary, #1f2937);
}

/* 禁用态按钮：亮灰底 + 白字在暗色下对比度不足，改用暗输入底 + 灰色文字 */
:root.dark .btn-save:disabled {
  background-color: var(--input-bg, #374151);
  color: var(--text-muted, #9ca3af);
}

:root.dark .btn-add:disabled {
  background-color: var(--input-bg, #374151);
  color: var(--text-muted, #9ca3af);
}

:root.dark .nt-search {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .nt-search .form-input {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}

:root.dark .nt-cat-tab {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .nt-cat-tab:hover {
  color: var(--accent-color, #3b82f6);
  border-color: var(--accent-color, #3b82f6);
}

/* 显式覆盖，避免 :root.dark 更高优先级压掉 active 填充（倒计时面板同类陷阱） */
:root.dark .nt-cat-tab.active {
  color: #fff;
  background: var(--accent-color, #3b82f6);
  border-color: var(--accent-color, #3b82f6);
}

:root.dark .nt-btn-reset,
:root.dark .nt-btn-manage {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .nt-btn-reset:hover,
:root.dark .nt-btn-manage:hover {
  color: var(--accent-color, #3b82f6);
  border-color: var(--accent-color, #3b82f6);
}

:root.dark .note-cat-badge {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

:root.dark .cat-manager-dialog {
  background-color: var(--bg-secondary, #1f2937);
}

:root.dark .cat-dialog-header {
  background-color: var(--bg-secondary, #1f2937);
}

:root.dark .cat-manager-row {
  background-color: var(--bg-card, #1f2937);
}

:root.dark .cat-name-input {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}

:root.dark .type-radio-option {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .type-radio-option:hover {
  color: var(--accent-color, #3b82f6);
  border-color: var(--accent-color, #3b82f6);
}

:root.dark .type-radio-option.active {
  color: #fff;
  background: var(--accent-color, #3b82f6);
  border-color: var(--accent-color, #3b82f6);
}

:root.dark .note-cat-select {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}

:root.dark .timeline-item-time {
  color: var(--text-secondary, #d1d5db);
}

:root.dark .timeline-item::before {
  background: var(--border-color, #374151);
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
</style>
