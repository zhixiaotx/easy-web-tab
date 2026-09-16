<script setup lang="ts">
import { useViewMode } from '@/composables/useViewMode'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'

const vm = useViewMode()

function cardFields(row: any) {
  return [
    { label: '完成', value: row.todo.completed ? '已完成' : '未完成' },
    { label: '标题', value: row.todo.title },
    { label: '描述', value: row.todo.description || '—' },
    { label: '优先级', value: priorityMeta(row.todo.priority).label },
    { label: '截止日期', value: row.todo.dueDate || '—' },
    { label: '分类', value: row.todo.categoryId || '未分类' }
  ]
}

import Icon from '../Icon.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import { filterTodos, dueInfo } from '@/composables/todoCore'
import type { TodoFilterCriteria } from '@/composables/todoCore'
import type { TodoPriority, WorkbenchTodo } from '@/types'
import { DEFAULT_TODO_COLOR } from '@/types'

const store = useWorkbenchTodosStore()

// ===== 查询/筛选（查询按钮生效，重置恢复全量）=====
const searchTitle = ref('')
const searchDescription = ref('')
const searchPriority = ref<'' | TodoPriority>('')
const searchStatus = ref<'' | 'all' | 'active' | 'completed'>('')
const appliedFilters = ref<TodoFilterCriteria>({})

// ===== 分类筛选标签页（点击即时生效，与查询条件叠加；'' = 全部，选中值 = 分类名字符串）=====
const activeCategoryId = ref('')

function selectCategoryTab(name: string): void {
  activeCategoryId.value = name
  listPage.value = 1
}

const hasActiveFilter = computed(() =>
  (appliedFilters.value.title ?? '').trim() !== '' ||
  (appliedFilters.value.description ?? '').trim() !== '' ||
  Boolean(appliedFilters.value.priority) ||
  Boolean(appliedFilters.value.status) ||
  activeCategoryId.value !== ''
)

function applySearch(): void {
  appliedFilters.value = {
    title: searchTitle.value,
    description: searchDescription.value,
    priority: searchPriority.value,
    status: searchStatus.value
  }
  listPage.value = 1
}

function resetSearch(): void {
  searchTitle.value = ''
  searchDescription.value = ''
  searchPriority.value = ''
  searchStatus.value = ''
  activeCategoryId.value = ''
  appliedFilters.value = {}
  listPage.value = 1
}

// 列表渲染用筛选后的数据（标签页与查询条件叠加）；排序由 store 的 sortedTodos 保证
const filteredTodos = computed(() =>
  filterTodos(store.sortedTodos, { ...appliedFilters.value, categoryId: activeCategoryId.value || undefined })
)

// 预计算卡片主角（含 completed 的「已完成」态），供模板一次取用，避免重复调用
interface TodoHero {
  label: string
  status: 'done' | 'normal' | 'today' | 'overdue'
}

function heroOf(todo: WorkbenchTodo): TodoHero | null {
  if (todo.completed) return { label: '已完成', status: 'done' }
  const info = dueInfo(todo.dueDate, false)
  if (info === null) return null
  return info
}

const viewTodos = computed(() => filteredTodos.value.map(todo => ({ todo, hero: heroOf(todo) })))

// ===== 固定分页（el-table 列表，10 条/页）=====
const LIST_PAGE_SIZE = 10
const listPage = ref(1)
const pageTodos = computed(() => {
  const start = (listPage.value - 1) * LIST_PAGE_SIZE
  return viewTodos.value.slice(start, start + LIST_PAGE_SIZE)
})

// 条目数缩减后钳制页码，避免末页渲染为空
watch(
  () => viewTodos.value.length,
  (n) => {
    const maxPage = Math.max(1, Math.ceil(n / LIST_PAGE_SIZE))
    if (listPage.value > maxPage) listPage.value = maxPage
  }
)

// ===== 表单状态机（新增/编辑共用，弹框承载）=====
const showDialog = ref(false)
const editingId = ref<string | null>(null)
const formTitle = ref('')
const formDescription = ref('')
const formPriority = ref<TodoPriority>('medium')
const formDueDate = ref('')
const formColor = ref(DEFAULT_TODO_COLOR)
// 分类下拉值：'' = 未分类（v-model 与 select option 全字符串，保存时 || undefined）
const formCategoryId = ref('')

// 标题必填：trim 后非空且 ≤100 字符，否则保存按钮 disabled
const isFormValid = computed(() => {
  const title = formTitle.value.trim()
  return title.length > 0 && title.length <= 100
})

const PRIORITY_OPTIONS: { value: TodoPriority; label: string }[] = [
  { value: 'high', label: '高优先级' },
  { value: 'medium', label: '中优先级' },
  { value: 'low', label: '低优先级' }
]

function startAdd(): void {
  editingId.value = null
  formTitle.value = ''
  formDescription.value = ''
  formPriority.value = 'medium'
  formDueDate.value = ''
  formColor.value = DEFAULT_TODO_COLOR
  formCategoryId.value = ''
  showDialog.value = true
}

function startEdit(todo: WorkbenchTodo): void {
  editingId.value = todo.id
  formTitle.value = todo.title
  formDescription.value = todo.description ?? ''
  formPriority.value = todo.priority
  formDueDate.value = todo.dueDate ?? ''
  formColor.value = todo.color ?? DEFAULT_TODO_COLOR
  formCategoryId.value = todo.categoryId ?? ''
  showDialog.value = true
}

function cancelForm(): void {
  showDialog.value = false
  editingId.value = null
}

async function handleSave(): Promise<void> {
  const title = formTitle.value.trim()
  if (!title || title.length > 100) return
  const description = formDescription.value.trim() || undefined
  const dueDate = formDueDate.value || undefined
  if (editingId.value) {
    await store.updateTodo(editingId.value, {
      title,
      description,
      priority: formPriority.value,
      dueDate,
      color: formColor.value,
      categoryId: formCategoryId.value || undefined
    })
  } else {
    await store.addTodo({
      title,
      description,
      priority: formPriority.value,
      dueDate,
      color: formColor.value,
      categoryId: formCategoryId.value || undefined
    })
    listPage.value = 1 // 新增条目回第 1 页（复用日记分页惯例）
  }
  cancelForm()
}

async function handleToggle(todo: WorkbenchTodo): Promise<void> {
  await store.toggleTodo(todo.id)
}

async function handleDelete(id: string): Promise<void> {
  if (confirm('确定要删除这个待办任务吗？')) {
    await store.deleteTodo(id)
  }
}

// 行点击 → 编辑（保留旧卡片点击行为）
function rowClick(todoRow: { todo: WorkbenchTodo; hero: TodoHero | null }): void {
  startEdit(todoRow.todo)
}

// ===== 优先级徽章 =====
const PRIORITY_META: Record<TodoPriority, { label: string; className: string }> = {
  high: { label: '高', className: 'prio-high' },
  medium: { label: '中', className: 'prio-medium' },
  low: { label: '低', className: 'prio-low' }
}

// el-table 插槽 row 为 any，索引查询走显式类型助手避免 TS7053
function priorityMeta(priority: TodoPriority): { label: string; className: string } {
  return PRIORITY_META[priority]
}

// ESC 关闭弹框（先编辑弹框，再分类管理）
function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (showDialog.value) {
    event.preventDefault()
    cancelForm()
  }
}

// 设置弹窗分类管理（改名/删除）外部变更时，重置失效的筛选分类
watch(
  () => store.customCategories,
  (cats) => {
    if (activeCategoryId.value !== '' && !cats.includes(activeCategoryId.value)) {
      activeCategoryId.value = ''
      listPage.value = 1
    }
  }
)

// 面板自管理数据加载（WorkbenchView 已加载，这里防御性重载，数据与 IDB 同步）
onMounted(async () => {
  await store.loadTodos()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="wb-todo">
    <!-- 查询区（标题/描述/优先级/状态 + 右侧查询重置按钮） -->
    <div class="td-search">
      <div class="td-search-fields">
        <label class="td-field td-field-grow">
          <span class="td-field-label">标题</span>
          <el-input
            v-model="searchTitle"
            class="td-field-title"
            placeholder="按标题查询…"
            data-testid="td-search-title"
            size="small"
            @keyup.enter="applySearch"
          />
        </label>
        <label class="td-field td-field-grow">
          <span class="td-field-label">描述</span>
          <el-input
            v-model="searchDescription"
            class="td-field-desc"
            placeholder="按描述查询…"
            data-testid="td-search-desc"
            size="small"
            @keyup.enter="applySearch"
          />
        </label>
        <label class="td-field">
          <span class="td-field-label">优先级</span>
          <el-select v-model="searchPriority" class="search-select" data-testid="td-search-priority" size="small">
            <el-option value="" label="全部优先级" />
            <el-option v-for="opt in PRIORITY_OPTIONS" :key="opt.value" :value="opt.value" :label="opt.label" />
          </el-select>
        </label>
        <label class="td-field">
          <span class="td-field-label">状态</span>
          <el-select v-model="searchStatus" class="search-select" data-testid="td-search-status" size="small">
            <el-option value="" label="全部状态" />
            <el-option value="active" label="待办" />
            <el-option value="completed" label="已完成" />
          </el-select>
        </label>
      </div>
      <div class="td-search-actions">
        <el-button type="primary" size="small" data-testid="td-search-btn" @click="applySearch">查询</el-button>
        <el-button size="small" data-testid="td-search-reset" @click="resetSearch">重置</el-button>
      </div>
    </div>

    <!-- 分类筛选标签页（全部 + 可见分类，点击即时过滤）+ 新增待办按钮靠右 -->
    <div class="td-cat-tabs">
      <el-radio-group v-model="activeCategoryId" class="td-cat-tabs-group" size="small" @update:model-value="selectCategoryTab">
        <el-radio-button value="" data-testid="td-cat-all">全部</el-radio-button>
        <el-radio-button
          v-for="cat in store.tabCategories"
          :key="cat"
          :value="cat"
          :data-testid="`td-cat-${cat}`"
        >{{ cat }}</el-radio-button>
      </el-radio-group>
      <span class="toolbar-count" data-testid="td-toolbar-count">
        <template v-if="hasActiveFilter">筛选出 {{ filteredTodos.length }} / {{ store.sortedTodos.length }} 个</template>
      </span>
      <el-button type="primary" size="small" class="btn-add" data-testid="td-add-button" @click="startAdd">＋ 新增待办</el-button>
    </div>

    <!-- 空态 / 卡片墙 -->
    <div v-if="store.sortedTodos.length === 0" class="empty-state empty-invite" data-testid="td-empty" @click="startAdd">
      ＋ 新增第一个待办
    </div>

    <div v-else-if="filteredTodos.length === 0" class="empty-state filter-empty" data-testid="td-filter-empty">
      <span>没有符合查询条件的待办</span>
      <button class="btn-cancel" @click="resetSearch">重置查询</button>
    </div>

    <template v-else>
      <div class="ewt-table-toolbar"><ViewModeToggle :mode="vm.mode" @toggle="vm.toggle" /></div>
      <div class="td-table-wrap">
        <el-table v-if="vm.mode === 'list'" class="ewt-table"
          :data="pageTodos"
          data-testid="td-table"
          @row-click="rowClick"
          stripe
          border
          size="default"
          style="width: 100%"
          height="100%"
          empty-text="没有符合查询条件的待办"
        >
          <el-table-column label="标题" min-width="200" show-overflow-tooltip>
            <template #default="{ row: v }">
              <div class="td-title" :class="{ 'is-done': v.todo.completed }">{{ v.todo.title }}</div>
            </template>
          </el-table-column>
          <el-table-column label="描述" min-width="160" show-overflow-tooltip>
            <template #default="{ row: v }">
              <span v-if="v.todo.description" class="td-desc">{{ v.todo.description }}</span>
              <span v-else class="td-col-empty">—</span>
            </template>
          </el-table-column>
          <el-table-column label="优先级" width="90" align="center">
            <template #default="{ row: v }">
              <span
                class="prio-badge"
                :class="priorityMeta(v.todo.priority).className"
                :data-testid="`td-prio-${v.todo.id}`"
              >{{ priorityMeta(v.todo.priority).label }}</span>
            </template>
          </el-table-column>
          <el-table-column label="截止日期" width="150">
            <template #default="{ row: v }">
              <div v-if="v.todo.dueDate" class="td-meta">
                <span
                  class="td-date"
                  :class="{ overdue: !v.todo.completed && v.hero?.status === 'overdue' }"
                >{{ v.todo.dueDate }}</span>
                <span
                  v-if="!v.todo.completed && v.hero?.status === 'overdue'"
                  class="overdue-tag"
                >已逾期</span>
              </div>
              <span v-else class="td-col-empty">—</span>
              <div v-if="v.hero && v.hero.status !== 'done'" class="td-hero" :class="'td-' + v.hero.status">
                <span class="td-hero-value">{{ v.hero.label }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="分类" width="130">
            <template #default="{ row: v }">
              <span v-if="v.todo.categoryId" class="td-cat-badge" :data-testid="`td-cat-badge-${v.todo.id}`">{{ v.todo.categoryId }}</span>
              <span v-else class="td-col-empty">未分类</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" class-name="ewt-op-col" width="220" align="center" fixed="right">
            <template #default="{ row: v }">
              <div class="td-actions" @click.stop>
                <el-button
                  size="small"
                  :type="v.todo.completed ? 'success' : 'default'"
                  :data-testid="`td-toggle-${v.todo.id}`"
                  :title="v.todo.completed ? '点击标记为未完成' : '点击标记为已完成'"
                  @click="handleToggle(v.todo)"
                >{{ v.todo.completed ? '已完成' : '未完成' }}</el-button>
                <el-button size="small" :data-testid="`td-edit-${v.todo.id}`" @click="startEdit(v.todo)">编辑</el-button>
                <el-button size="small" class="btn-delete" :data-testid="`td-delete-${v.todo.id}`" @click="handleDelete(v.todo.id)">删除</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="ewt-card-grid">
          <RecordsCard
            @edit="startEdit(item.todo)"
            v-for="item in pageTodos"
            :key="item.todo.id"
            :fields="cardFields(item)"
          >
          </RecordsCard>
        </div>

      </div>
      <div class="td-list-pager">
        <el-pagination
          v-model:current-page="listPage"
          :page-size="LIST_PAGE_SIZE"
          :page-sizes="[LIST_PAGE_SIZE]"
          layout="total, prev, pager, next, jumper"
          :total="viewTodos.length"
          background
          small
          prev-text="上一页"
          next-text="下一页"
          data-testid="td-pagination"
        />
      </div>
    </template>

    <!-- 新增/编辑弹框 -->
    <el-dialog
      :model-value="showDialog"
      :title="editingId ? '编辑待办' : '新增待办'"
      width="480px"
      data-testid="td-dialog"
      @close="cancelForm"
      @update:model-value="(v: boolean) => { if (!v) cancelForm() }"
    >
      <template #header>
        <div class="dialog-header">
          <h3>{{ editingId ? '编辑待办' : '新增待办' }}</h3>
          <el-button class="close-btn" @click="cancelForm"><Icon name="close" /></el-button>
        </div>
      </template>
      <form class="dialog-body" @submit.prevent="handleSave">
        <div class="form-group">
          <label>标题 *</label>
          <el-input
            v-model="formTitle"
            placeholder="例如：提交季度报告"
            maxlength="100"
            data-testid="td-title-input"
            @keyup.enter="handleSave"
          />
        </div>

        <div class="form-group">
          <label>描述（可选）</label>
          <el-input
            v-model="formDescription"
            type="textarea"
            :rows="2"
            placeholder="补充说明…"
            data-testid="td-desc-input"
          />
        </div>

        <div class="form-group">
          <label>分类</label>
          <el-select v-model="formCategoryId" data-testid="td-form-category">
            <el-option value="" label="未分类" />
            <el-option v-for="cat in store.allCategories" :key="cat" :value="cat" :label="cat" />
          </el-select>
        </div>

        <div class="form-row-fields">
          <div class="field">
            <label class="field-label">优先级</label>
            <el-select v-model="formPriority" class="field-prio" data-testid="td-priority">
              <el-option v-for="opt in PRIORITY_OPTIONS" :key="opt.value" :value="opt.value" :label="opt.label" />
            </el-select>
          </div>
          <div class="field">
            <label class="field-label">截止日期</label>
            <el-date-picker
              v-model="formDueDate"
              type="date"
              value-format="YYYY-MM-DD"
              class="field-date"
              placeholder="选择日期"
              data-testid="td-due-input"
            />
          </div>
        </div>

        <div class="form-actions ewt-dialog-footer">
          <el-button size="small" data-testid="td-cancel-button" @click="cancelForm">
            取消
          </el-button>
          <el-button type="primary" size="small" :disabled="!isFormValid" data-testid="td-save-button" @click="handleSave">
            {{ editingId ? '保存' : '添加' }}
          </el-button>
          <el-button v-if="editingId" type="danger" size="small" native-type="button" data-testid="td-record-delete" @click="handleDelete(editingId)">删除</el-button>
        </div>
      </form>
    </el-dialog>

  </div>
</template>

<style scoped>
/* 面板容器 */
.wb-todo {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== 查询区 ===== */
.td-search {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.td-search-fields { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; }
.td-field { display: flex; align-items: center; gap: 10px; white-space: nowrap; }
.td-field-grow { flex: 0 0 auto; min-width: 0; }
.td-field-grow :is(.td-field-desc, .td-field-title) { width: 200px; }
.td-field-label { font-size: 13px; color: var(--color-text-secondary, var(--color-text-secondary)); }
.td-search-actions { display: flex; justify-content: flex-end; gap: 8px; }

.search-select {
  width: 130px;
  flex-shrink: 0;
}

.search-btn {
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

.search-btn:hover {
  background: var(--color-primary-hover, var(--color-primary-hover));
}

.search-reset-btn {
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

.search-reset-btn:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

/* ===== 操作栏 ===== */
.td-headbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-count {
  margin-left: auto;
  font-size: 14px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.btn-add {
  padding: 10px 16px;
  background-color: var(--color-primary, var(--color-primary));
  color: #fff;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-add:hover {
  background-color: var(--color-primary-hover, var(--color-primary-hover));
}

.td-headbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* ===== 分类筛选标签页（全部 + 可见分类，即时过滤；镜像 .nt-cat-tabs）===== */
.td-cat-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.td-cat-tab {
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

.td-cat-tab:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.td-cat-tab.active {
  color: #fff;
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

/* ===== el-table 表格容器（参考 WorkbenchNotes）===== */
.td-table-wrap {
  flex: 1 1 auto;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.td-table-wrap > :global(.el-table) {
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
.td-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.td-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .td-table-wrap > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(html.dark) .td-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .td-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
.td-table-wrap > :global(.el-table .el-table__body-wrapper .cell),
.td-table-wrap > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
}

/* ===== 分页条（参考 WorkbenchNotes）===== */
.td-list-pager {
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
:global(html.dark) .td-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}
.td-list-pager > :global(.el-pagination) { --el-pagination-bg-color: transparent; }
.td-list-pager > :global(.el-pagination button),
.td-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #ffffff) !important;
  border: 1px solid var(--color-border, #e5e7eb) !important;
  color: var(--color-text-secondary, #6b7280) !important;
}
.td-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
:global(html.dark) .td-list-pager > :global(.el-pagination button),
:global(html.dark) .td-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #1f2937) !important;
  border-color: var(--color-border, #374151) !important;
  color: var(--color-text-secondary, #d1d5db) !important;
}
:global(html.dark) .td-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
.td-list-pager > :global(.el-pagination__total) {
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
}

/* ===== 表格内徽章/标签 ===== */

.td-col-empty {
  color: var(--color-text-muted, var(--color-text-muted));
  font-size: 12px;
}

.td-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.td-title.is-done {
  text-decoration: line-through;
  color: var(--color-text-muted, var(--color-text-muted));
}

/* 优先级徽章 */
.prio-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  border: 1px solid transparent;
}

.prio-high {
  color: #b91c1c;
  background: #fee2e2;
  border-color: #fca5a5;
}

.prio-medium {
  color: #b45309;
  background: #fef3c7;
  border-color: #fcd34d;
}

.prio-low {
  color: #475569;
  background: #f1f5f9;
  border-color: #cbd5e1;
}

/* 截止倒计时主角（状态色） */
.td-hero {
  flex-shrink: 0;
  font-weight: 700;
}

.td-hero-value {
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
  line-height: 1.1;
}

.td-normal {
  color: var(--color-success, var(--color-success));
}

.td-today {
  color: var(--color-warning, var(--color-warning));
}

.td-overdue {
  color: var(--color-error, var(--color-error));
}

.td-done {
  color: var(--color-text-muted, var(--color-text-muted));
  font-size: 14px;
  font-weight: 600;
}

.td-desc {
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 0;
}

/* 分类徽标（镜像 .note-cat-badge） */
.td-cat-badge {
  align-self: flex-start;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  color: var(--color-primary, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
}

/* Meta：截止日期 / 逾期 */
.td-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.td-date {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.td-date.overdue {
  color: var(--color-error, var(--color-error));
  font-weight: 600;
}

.overdue-tag {
  color: #fff;
  background: var(--color-error, #ef4444);
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-full, 999px);
}

/* ===== 卡片操作 ===== */
.td-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: auto;
}

.td-toggle {
  display: flex;
  align-items: center;
}

.td-toggle input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--color-primary, var(--color-primary));
}

.btn-edit,
.btn-delete {
  padding: 2px 8px;
  font-size: 11px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-edit:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.btn-delete:hover {
  color: var(--color-error, var(--color-error));
  border-color: var(--color-error, var(--color-error));
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

.empty-invite {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary, var(--color-text-secondary));
  transition: color var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease);
}

.empty-invite:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.filter-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

/* ===== 表单（新增/编辑弹框）===== */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  padding: 20px;
}

.dialog {
  background-color: var(--color-bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg, 12px);
  width: 100%;
  max-width: var(--dlg-w-wb-todo, 480px);
  max-height: var(--dlg-h-wb-todo, 85vh);
  overflow-y: auto;
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
  position: sticky;
  top: 0;
  background: var(--color-bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0;
}

.dialog-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--color-text-muted, var(--color-text-muted));
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm, 6px);
  transition: color var(--transition-fast, 0.15s ease);
}

.close-btn:hover {
  color: var(--color-text, var(--color-text));
}

.dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group > label {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.form-row-fields {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.field-prio {
  width: 140px;
}

.field-date {
  width: 170px;
}

.form-input {
  padding: 9px 12px;
  background-color: var(--color-bg-input, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--color-text, var(--color-text));
  box-sizing: border-box;
  transition: border-color var(--transition-fast, 0.15s ease);
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary, var(--color-primary));
}

.desc-input {
  resize: vertical;
}

/* 颜色选择器 */
.color-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.color-option {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 50%;
  background: var(--swatch);
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform var(--transition-fast, 0.15s ease), box-shadow var(--transition-fast, 0.15s ease);
}

.color-option:hover {
  transform: scale(1.15);
}

.color-option.active {
  box-shadow: 0 0 0 2px var(--color-bg-card, #ffffff), 0 0 0 4px var(--swatch);
}

.color-custom {
  display: flex;
  align-items: center;
  gap: 6px;
}

.color-input {
  width: 36px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  background: none;
  cursor: pointer;
}

.color-custom-value {
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.color-reset {
  padding: 5px 10px;
  font-size: 12px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-full, 999px);
  color: var(--color-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.color-reset:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-save {
  padding: 9px 18px;
  background: var(--color-primary, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  white-space: nowrap;
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
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-cancel:hover {
  background: var(--color-bg-hover, var(--color-bg-active));
}

/* 禁用态（添加按钮）：亮灰底 + 白字在暗色下对比度不足，暗色覆盖见下 */
.btn-add:disabled {
  background: var(--color-text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

/* ===== 暗色模式覆盖 ===== */
html.dark .td-search {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .empty-state {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .dialog {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .dialog-header {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .td-title {
  color: var(--color-text, #f9fafb);
}

html.dark .td-title.is-done {
  color: var(--color-text-muted, #9ca3af);
}

html.dark .td-desc {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .td-date {
  color: var(--color-text-secondary, #d1d5db);
}

/* 禁用态按钮：亮灰底 + 白字在暗色下对比度不足，改用暗输入底 + 灰色文字 */
html.dark .btn-save:disabled {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text-muted, #9ca3af);
}

html.dark .form-input,
html.dark select.form-input,
html.dark input.form-input {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text, #f9fafb);
  border-color: var(--color-border, #374151);
}

html.dark .color-reset {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .search-reset-btn,
html.dark .btn-cancel,
html.dark .btn-edit,
html.dark .btn-delete {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .prio-high {
  color: #fca5a5;
  background: rgba(185, 28, 28, 0.35);
  border-color: #991b1b;
}

html.dark .prio-medium {
  color: #fbbf24;
  background: rgba(180, 83, 9, 0.35);
  border-color: #92400e;
}

html.dark .prio-low {
  color: #cbd5e1;
  background: rgba(71, 85, 105, 0.35);
  border-color: #475569;
}

html.dark .td-normal {
  color: #4ade80;
}

html.dark .td-today {
  color: #fbbf24;
}

html.dark .td-overdue {
  color: #f87171;
}

html.dark .td-done {
  color: #9ca3af;
}

html.dark .td-cat-tab {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .td-cat-tab:hover {
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

/* 显式覆盖，避免 html.dark 更高优先级压掉 active 填充（倒计时面板同类陷阱） */
html.dark .td-cat-tab.active {
  color: #fff;
  background: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

html.dark .td-cat-badge {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

html.dark .btn-add:disabled {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text-muted, #9ca3af);
}

@media (max-width: 640px) {
  .search-input,
  .td-field-title,
  .td-field-grow {
    width: 100%;
  }
}
</style>
