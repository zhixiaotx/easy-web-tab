<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import { filterTodos, dueInfo } from '@/composables/todoCore'
import type { TodoFilterCriteria } from '@/composables/todoCore'
import type { TodoPriority, WorkbenchTodo } from '@/types'
import { TODO_COLOR_PRESETS, DEFAULT_TODO_COLOR } from '@/types'

const store = useWorkbenchTodosStore()

// ===== 查询/筛选（查询按钮生效，重置恢复全量）=====
const searchTitle = ref('')
const searchDescription = ref('')
const searchPriority = ref<'' | TodoPriority>('')
const searchStatus = ref<'' | 'all' | 'active' | 'completed'>('')
const appliedFilters = ref<TodoFilterCriteria>({})

const hasActiveFilter = computed(() =>
  (appliedFilters.value.title ?? '').trim() !== '' ||
  (appliedFilters.value.description ?? '').trim() !== '' ||
  Boolean(appliedFilters.value.priority) ||
  Boolean(appliedFilters.value.status)
)

function applySearch(): void {
  appliedFilters.value = {
    title: searchTitle.value,
    description: searchDescription.value,
    priority: searchPriority.value,
    status: searchStatus.value
  }
}

function resetSearch(): void {
  searchTitle.value = ''
  searchDescription.value = ''
  searchPriority.value = ''
  searchStatus.value = ''
  appliedFilters.value = {}
}

// 列表渲染用筛选后的数据；排序由 store 的 sortedTodos 保证
const filteredTodos = computed(() => filterTodos(store.sortedTodos, appliedFilters.value))

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

// ===== 表单状态机（新增/编辑共用，弹框承载）=====
const showDialog = ref(false)
const editingId = ref<string | null>(null)
const formTitle = ref('')
const formDescription = ref('')
const formPriority = ref<TodoPriority>('medium')
const formDueDate = ref('')
const formColor = ref(DEFAULT_TODO_COLOR)

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
  showDialog.value = true
}

function startEdit(todo: WorkbenchTodo): void {
  editingId.value = todo.id
  formTitle.value = todo.title
  formDescription.value = todo.description ?? ''
  formPriority.value = todo.priority
  formDueDate.value = todo.dueDate ?? ''
  formColor.value = todo.color ?? DEFAULT_TODO_COLOR
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
      color: formColor.value
    })
  } else {
    await store.addTodo({ title, description, priority: formPriority.value, dueDate, color: formColor.value })
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

// ===== 优先级徽章 =====
const PRIORITY_META: Record<TodoPriority, { label: string; className: string }> = {
  high: { label: '高', className: 'prio-high' },
  medium: { label: '中', className: 'prio-medium' },
  low: { label: '低', className: 'prio-low' }
}

// ESC 关闭编辑弹框
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && showDialog.value) {
    event.preventDefault()
    cancelForm()
  }
}

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
          <input
            v-model="searchTitle"
            type="text"
            class="form-input td-field-title"
            placeholder="按标题查询…"
            data-testid="td-search-title"
            @keyup.enter="applySearch"
          />
        </label>
        <label class="td-field td-field-grow">
          <span class="td-field-label">描述</span>
          <input
            v-model="searchDescription"
            type="text"
            class="form-input td-field-desc"
            placeholder="按描述查询…"
            data-testid="td-search-desc"
            @keyup.enter="applySearch"
          />
        </label>
        <label class="td-field">
          <span class="td-field-label">优先级</span>
          <select v-model="searchPriority" class="form-input search-select" data-testid="td-search-priority">
            <option value="">全部优先级</option>
            <option v-for="opt in PRIORITY_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </label>
        <label class="td-field">
          <span class="td-field-label">状态</span>
          <select v-model="searchStatus" class="form-input search-select" data-testid="td-search-status">
            <option value="">全部状态</option>
            <option value="active">待办</option>
            <option value="completed">已完成</option>
          </select>
        </label>
      </div>
      <div class="td-search-actions">
        <button class="search-btn" data-testid="td-search-btn" @click="applySearch">查询</button>
        <button class="search-reset-btn" data-testid="td-search-reset" @click="resetSearch">重置</button>
      </div>
    </div>

    <!-- 操作栏：新增 + 数量 -->
    <div class="td-headbar">
      <button class="btn-add" data-testid="td-add-button" @click="startAdd">＋ 新增待办</button>
      <span class="toolbar-count" data-testid="td-toolbar-count">
        <template v-if="hasActiveFilter">筛选出 {{ filteredTodos.length }} / {{ store.sortedTodos.length }} 个</template>
        <template v-else>共 {{ store.sortedTodos.length }} 个待办</template>
      </span>
    </div>

    <!-- 空态 / 卡片墙 -->
    <div v-if="store.sortedTodos.length === 0" class="empty-state empty-invite" data-testid="td-empty" @click="startAdd">
      ＋ 新增第一个待办
    </div>

    <div v-else-if="filteredTodos.length === 0" class="empty-state filter-empty" data-testid="td-filter-empty">
      <span>没有符合查询条件的待办</span>
      <button class="btn-cancel" @click="resetSearch">重置查询</button>
    </div>

    <div v-else class="td-grid">
      <div
        v-for="v in viewTodos"
        :key="v.todo.id"
        class="td-card"
        data-testid="td-item"
        :style="{ '--td-color': v.todo.color ?? DEFAULT_TODO_COLOR }"
        role="button"
        tabindex="0"
        @click="startEdit(v.todo)"
        @keyup.enter="startEdit(v.todo)"
      >
        <div class="td-card-head">
          <div class="td-title" :class="{ 'is-done': v.todo.completed }">{{ v.todo.title }}</div>
          <span
            class="prio-badge"
            :class="PRIORITY_META[v.todo.priority].className"
            :data-testid="`td-prio-${v.todo.id}`"
          >
            {{ PRIORITY_META[v.todo.priority].label }}
          </span>
        </div>

        <div v-if="v.hero" class="td-hero" :class="'td-' + v.hero.status">
          <span class="td-hero-value">{{ v.hero.label }}</span>
        </div>

        <div v-if="v.todo.description" class="td-desc">{{ v.todo.description }}</div>

        <div v-if="v.todo.dueDate" class="td-meta">
          <span
            class="td-date"
            :class="{ overdue: !v.todo.completed && v.hero?.status === 'overdue' }"
          >
            {{ v.todo.dueDate }}
          </span>
          <span
            v-if="!v.todo.completed && v.hero?.status === 'overdue'"
            class="overdue-tag"
          >已逾期</span>
        </div>

        <div class="td-actions" @click.stop>
          <label class="td-toggle" :title="v.todo.completed ? '标记为未完成' : '标记为已完成'">
            <input
              type="checkbox"
              :checked="v.todo.completed"
              :data-testid="`td-toggle-${v.todo.id}`"
              @change="handleToggle(v.todo)"
            />
          </label>
          <button class="btn-edit" :data-testid="`td-edit-${v.todo.id}`" @click="startEdit(v.todo)">编辑</button>
          <button class="btn-delete" :data-testid="`td-delete-${v.todo.id}`" @click="handleDelete(v.todo.id)">删除</button>
        </div>
      </div>
    </div>

    <!-- 新增/编辑弹框 -->
    <div v-if="showDialog" class="dialog-overlay" @click.self="cancelForm">
      <div class="dialog" data-testid="td-dialog">
        <div class="dialog-header">
          <h3>{{ editingId ? '编辑待办' : '新增待办' }}</h3>
          <button class="close-btn" @click="cancelForm">✕</button>
        </div>
        <form class="dialog-body" @submit.prevent="handleSave">
          <div class="form-group">
            <label>标题 *</label>
            <input
              v-model="formTitle"
              type="text"
              class="form-input"
              placeholder="例如：提交季度报告"
              maxlength="100"
              data-testid="td-title-input"
            />
          </div>

          <div class="form-group">
            <label>描述（可选）</label>
            <textarea
              v-model="formDescription"
              class="form-input desc-input"
              rows="2"
              placeholder="补充说明…"
              data-testid="td-desc-input"
            ></textarea>
          </div>

          <div class="form-row-fields">
            <div class="field">
              <label class="field-label">优先级</label>
              <select v-model="formPriority" class="form-input field-prio" data-testid="td-priority">
                <option v-for="opt in PRIORITY_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
            <div class="field">
              <label class="field-label">截止日期</label>
              <input v-model="formDueDate" type="date" class="form-input field-date" data-testid="td-due-input" />
            </div>
          </div>

          <div class="form-group">
            <label>卡片颜色</label>
            <div class="color-picker">
              <button
                v-for="(color, i) in TODO_COLOR_PRESETS"
                :key="color"
                type="button"
                class="color-option"
                :class="{ active: formColor.toLowerCase() === color }"
                :style="{ '--swatch': color }"
                :data-testid="'td-color-preset-' + (i + 1)"
                :title="color"
                @click="formColor = color"
              ></button>
              <label class="color-custom" title="自定义颜色">
                <input v-model="formColor" type="color" class="color-input" data-testid="td-color-input" />
                <span class="color-custom-value">{{ formColor }}</span>
              </label>
              <button type="button" class="color-reset" @click="formColor = DEFAULT_TODO_COLOR">恢复默认</button>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn-cancel" data-testid="td-cancel-button" @click="cancelForm">
              取消
            </button>
            <button type="submit" class="btn-save" :disabled="!isFormValid" data-testid="td-save-button">
              {{ editingId ? '保存' : '添加' }}
            </button>
          </div>
        </form>
      </div>
    </div>
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
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.td-search-fields { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.td-field { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.td-field-grow { flex: 1; min-width: 140px; }
.td-field-grow :is(.td-field-desc, .td-field-title) { width: 100%; }
.td-field-label { font-size: 13px; color: var(--text-secondary, var(--color-text-secondary)); }
.td-search-actions { display: flex; justify-content: flex-end; gap: 8px; }

.search-select {
  width: 130px;
  flex-shrink: 0;
}

.search-btn {
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

.search-btn:hover {
  background: var(--accent-hover, var(--color-primary-hover));
}

.search-reset-btn {
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

.search-reset-btn:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
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
  font-size: 14px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.btn-add {
  padding: 10px 16px;
  background-color: var(--accent-color, var(--color-primary));
  color: #fff;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-add:hover {
  background-color: var(--accent-hover, var(--color-primary-hover));
}

/* ===== 卡片墙 ===== */
.td-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
}

.td-card {
  --td-color: #3b82f6;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 14px 12px;
  background-color: var(--bg-card, var(--color-bg-card));
  background-image: linear-gradient(135deg, color-mix(in srgb, var(--td-color) 8%, transparent), transparent 55%);
  border: 1px solid var(--border-color, var(--color-border));
  border-left: 4px solid var(--td-color);
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  cursor: pointer;
  transition: transform var(--transition-fast, 0.15s ease), box-shadow var(--transition-fast, 0.15s ease),
    border-color var(--transition-fast, 0.15s ease);
}

.td-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0, 0, 0, 0.12));
  border-color: color-mix(in srgb, var(--td-color) 45%, var(--border-color, #e2e8f0));
}

.td-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.td-title {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.td-title.is-done {
  text-decoration: line-through;
  color: var(--text-muted, var(--color-text-muted));
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
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
  line-height: 1.15;
}

.td-normal {
  color: var(--success-color, var(--color-success));
}

.td-today {
  color: var(--warning-color, var(--color-warning));
}

.td-overdue {
  color: var(--error-color, var(--color-error));
}

.td-done {
  color: var(--text-muted, var(--color-text-muted));
  font-size: 14px;
  font-weight: 600;
}

.td-desc {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 0;
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
  color: var(--text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.td-date.overdue {
  color: var(--error-color, var(--color-error));
  font-weight: 600;
}

.overdue-tag {
  color: #fff;
  background: var(--error-color, #ef4444);
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-full, 999px);
}

/* ===== 卡片操作 ===== */
.td-actions {
  display: flex;
  align-items: center;
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
  accent-color: var(--accent-color, var(--color-primary));
}

.btn-edit,
.btn-delete {
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

.btn-delete:hover {
  color: var(--error-color, var(--color-error));
  border-color: var(--error-color, var(--color-error));
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

.empty-invite {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary, var(--color-text-secondary));
  transition: color var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease);
}

.empty-invite:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
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
  background-color: var(--bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg, 12px);
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, var(--color-border));
  position: sticky;
  top: 0;
  background: var(--bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0;
}

.dialog-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--text-muted, var(--color-text-muted));
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm, 6px);
  transition: color var(--transition-fast, 0.15s ease);
}

.close-btn:hover {
  color: var(--text-primary, var(--color-text));
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
  color: var(--text-secondary, var(--color-text-secondary));
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
  color: var(--text-secondary, var(--color-text-secondary));
}

.field-prio {
  width: 140px;
}

.field-date {
  width: 170px;
}

.form-input {
  padding: 9px 12px;
  background-color: var(--input-bg, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--text-primary, var(--color-text));
  box-sizing: border-box;
  transition: border-color var(--transition-fast, 0.15s ease);
}

.form-input:focus {
  outline: none;
  border-color: var(--accent-color, var(--color-primary));
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
  box-shadow: 0 0 0 2px var(--bg-card, #ffffff), 0 0 0 4px var(--swatch);
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
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  background: none;
  cursor: pointer;
}

.color-custom-value {
  font-size: 12px;
  color: var(--text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.color-reset {
  padding: 5px 10px;
  font-size: 12px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-full, 999px);
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.color-reset:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-save {
  padding: 9px 18px;
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  white-space: nowrap;
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
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-cancel:hover {
  background: var(--hover-bg, var(--color-bg-active));
}

/* ===== 暗色模式覆盖 ===== */
:root.dark .td-search {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .td-card {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .empty-state {
  background-color: var(--bg-secondary, #1f2937);
}

:root.dark .dialog {
  background-color: var(--bg-secondary, #1f2937);
}

:root.dark .dialog-header {
  background-color: var(--bg-secondary, #1f2937);
}

:root.dark .td-title {
  color: var(--text-primary, #f9fafb);
}

:root.dark .td-title.is-done {
  color: var(--text-muted, #9ca3af);
}

:root.dark .td-desc {
  color: var(--text-secondary, #d1d5db);
}

:root.dark .td-date {
  color: var(--text-secondary, #d1d5db);
}

/* 禁用态按钮：亮灰底 + 白字在暗色下对比度不足，改用暗输入底 + 灰色文字 */
:root.dark .btn-save:disabled {
  background-color: var(--input-bg, #374151);
  color: var(--text-muted, #9ca3af);
}

:root.dark .form-input,
:root.dark select.form-input,
:root.dark input.form-input {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}

:root.dark .color-reset {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .search-reset-btn,
:root.dark .btn-cancel,
:root.dark .btn-edit,
:root.dark .btn-delete {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .prio-high {
  color: #fca5a5;
  background: rgba(185, 28, 28, 0.35);
  border-color: #991b1b;
}

:root.dark .prio-medium {
  color: #fbbf24;
  background: rgba(180, 83, 9, 0.35);
  border-color: #92400e;
}

:root.dark .prio-low {
  color: #cbd5e1;
  background: rgba(71, 85, 105, 0.35);
  border-color: #475569;
}

:root.dark .td-normal {
  color: #4ade80;
}

:root.dark .td-today {
  color: #fbbf24;
}

:root.dark .td-overdue {
  color: #f87171;
}

:root.dark .td-done {
  color: #9ca3af;
}

@media (max-width: 640px) {
  .search-input,
  .td-field-title,
  .td-field-grow {
    width: 100%;
  }
}
</style>
