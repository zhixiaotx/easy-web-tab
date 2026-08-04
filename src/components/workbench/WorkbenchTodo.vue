<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import type { TodoPriority, WorkbenchTodo } from '@/types'

const store = useWorkbenchTodosStore()

// ===== 表单状态机（新增/编辑共用）=====
const editingId = ref<string | null>(null)
const formTitle = ref('')
const formDescription = ref('')
const formPriority = ref<TodoPriority>('medium')
const formDueDate = ref('')

// 标题必填：trim 后非空且 ≤100 字符，否则保存按钮 disabled
const isFormValid = computed(() => {
  const title = formTitle.value.trim()
  return title.length > 0 && title.length <= 100
})

function startAdd(): void {
  editingId.value = null
  formTitle.value = ''
  formDescription.value = ''
  formPriority.value = 'medium'
  formDueDate.value = ''
}

function startEdit(todo: WorkbenchTodo): void {
  editingId.value = todo.id
  formTitle.value = todo.title
  formDescription.value = todo.description ?? ''
  formPriority.value = todo.priority
  formDueDate.value = todo.dueDate ?? ''
}

function cancelForm(): void {
  startAdd()
}

async function handleSave(): Promise<void> {
  const title = formTitle.value.trim()
  if (!title || title.length > 100) return
  const description = formDescription.value.trim() || undefined
  const dueDate = formDueDate.value || undefined
  if (editingId.value) {
    await store.updateTodo(editingId.value, { title, description, priority: formPriority.value, dueDate })
  } else {
    await store.addTodo({ title, description, priority: formPriority.value, dueDate })
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

// ===== 逾期判断 =====
// 今天 = 本地日期 YYYY-MM-DD（不能用 toISOString，那是 UTC，会偏一天）
function localToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isOverdue(todo: WorkbenchTodo): boolean {
  return !!todo.dueDate && !todo.completed && todo.dueDate < localToday()
}

// ===== 优先级徽章 =====
const PRIORITY_META: Record<TodoPriority, { label: string; className: string }> = {
  high: { label: '高', className: 'prio-high' },
  medium: { label: '中', className: 'prio-medium' },
  low: { label: '低', className: 'prio-low' }
}

// ===== 筛选页签 =====
type TodoFilter = 'all' | 'active' | 'completed'

const FILTER_TABS: { key: TodoFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '待办' },
  { key: 'completed', label: '已完成' }
]

function tabCount(key: TodoFilter): number {
  if (key === 'active') return store.activeCount
  if (key === 'completed') return store.completedCount
  return store.totalCount
}

// 面板自管理数据加载（WorkbenchView 已加载，这里防御性重载，数据在内存中与 IDB 同步）
onMounted(async () => {
  await store.loadTodos()
})
</script>

<template>
  <div class="wb-todo">
    <!-- 顶部内联表单（新增/编辑共用） -->
    <form class="todo-form" @submit.prevent="handleSave">
      <div class="form-row">
        <input
          v-model="formTitle"
          type="text"
          class="form-input title-input"
          data-testid="todo-title-input"
          :placeholder="editingId ? '编辑待办标题…' : '添加待办标题…'"
        />
        <select
          v-model="formPriority"
          class="form-input priority-select"
          data-testid="todo-priority-select"
        >
          <option value="low">低优先级</option>
          <option value="medium">中优先级</option>
          <option value="high">高优先级</option>
        </select>
        <input
          v-model="formDueDate"
          type="date"
          class="form-input date-input"
          data-testid="todo-due-input"
        />
      </div>
      <div class="form-row form-row-bottom">
        <textarea
          v-model="formDescription"
          class="form-input desc-input"
          rows="2"
          placeholder="描述（可选）"
          data-testid="todo-desc-input"
        ></textarea>
        <div class="form-actions">
          <button
            v-if="editingId"
            type="button"
            class="btn-cancel"
            data-testid="todo-cancel-button"
            @click="cancelForm"
          >
            取消
          </button>
          <button
            type="submit"
            class="btn-save"
            :disabled="!isFormValid"
            data-testid="todo-save-button"
          >
            {{ editingId ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </form>

    <!-- 筛选页签 + 搜索 -->
    <div class="todo-toolbar">
      <div class="filter-tabs">
        <button
          v-for="tab in FILTER_TABS"
          :key="tab.key"
          class="filter-tab"
          :class="{ active: store.filter === tab.key }"
          :data-testid="`todo-filter-${tab.key}`"
          @click="store.filter = tab.key"
        >
          {{ tab.label }}
          <span class="filter-count">{{ tabCount(tab.key) }}</span>
        </button>
      </div>
      <input
        v-model="store.searchQuery"
        type="text"
        class="form-input search-input"
        placeholder="搜索待办…"
        data-testid="todo-search-input"
      />
    </div>

    <!-- 列表 -->
    <div v-if="store.visibleTodos.length === 0" class="empty-state" data-testid="todo-empty">
      暂无待办任务
    </div>

    <div v-else class="todo-list">
      <div
        v-for="todo in store.visibleTodos"
        :key="todo.id"
        class="todo-item"
        data-testid="todo-item"
      >
        <label class="todo-check">
          <input
            type="checkbox"
            :checked="todo.completed"
            :data-testid="`todo-check-${todo.id}`"
            @change="handleToggle(todo)"
          />
        </label>

        <div class="todo-main">
          <div class="todo-title" :class="{ 'is-done': todo.completed }">{{ todo.title }}</div>
          <div v-if="todo.description" class="todo-desc">{{ todo.description }}</div>
        </div>

        <span
          class="prio-badge"
          :class="PRIORITY_META[todo.priority].className"
          :data-testid="`todo-prio-${todo.id}`"
        >
          {{ PRIORITY_META[todo.priority].label }}
        </span>

        <span v-if="todo.dueDate" class="todo-due" :class="{ overdue: isOverdue(todo) }">
          <span class="due-date-text">{{ todo.dueDate }}</span>
          <span v-if="isOverdue(todo)" class="overdue-tag">已逾期</span>
        </span>

        <div class="todo-actions">
          <button class="btn-edit" @click="startEdit(todo)">编辑</button>
          <button class="btn-delete" @click="handleDelete(todo.id)">删除</button>
        </div>
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

/* ===== 表单 ===== */
.todo-form {
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  padding: 14px;
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.form-row {
  display: flex;
  gap: 10px;
}

.form-row-bottom {
  margin-top: 10px;
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

.title-input {
  flex: 1;
  min-width: 0;
}

.priority-select {
  width: 130px;
  flex-shrink: 0;
}

.date-input {
  width: 160px;
  flex-shrink: 0;
}

.desc-input {
  flex: 1;
  min-width: 0;
  resize: vertical;
}

.form-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
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

/* ===== 工具栏 ===== */
.todo-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-tabs {
  display: flex;
  gap: 6px;
}

.filter-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  font-size: 13px;
  border-radius: var(--radius-full, 999px);
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.filter-tab:hover:not(.active) {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.filter-tab.active {
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
  color: #fff;
}

.filter-count {
  font-size: 12px;
  opacity: 0.85;
}

.search-input {
  width: 220px;
}

/* ===== 列表 ===== */
.todo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
}

.todo-item:hover {
  border-color: var(--accent-color, var(--color-primary));
}

.todo-check input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--accent-color, var(--color-primary));
}

.todo-main {
  flex: 1;
  min-width: 0;
}

.todo-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-title.is-done {
  text-decoration: line-through;
  color: var(--text-muted, var(--color-text-muted));
}

.todo-desc {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 优先级徽章 ===== */
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

/* ===== 截止日期 / 逾期 ===== */
.todo-due {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.overdue-tag {
  color: #fff;
  background: var(--error-color, #ef4444);
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-full, 999px);
}

.todo-due.overdue .due-date-text {
  color: var(--error-color, #ef4444);
  font-weight: 600;
}

/* ===== 行内操作 ===== */
.todo-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
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

/* ===== 暗色模式覆盖 ===== */
:root.dark .todo-form {
  background-color: var(--bg-secondary, #1f2937);
}

:root.dark .todo-item {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .empty-state {
  background-color: var(--bg-secondary, #1f2937);
}

:root.dark .title-input,
:root.dark .priority-select,
:root.dark .date-input,
:root.dark .desc-input,
:root.dark .search-input {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}

:root.dark .filter-tab {
  background-color: var(--bg-secondary, #1f2937);
  color: var(--text-secondary, #d1d5db);
}

/* 覆盖 .filter-tab.active（亮色 (0,2,0) 会被 :root.dark .filter-tab (0,3,0) 盖掉，需显式还原选中态） */
:root.dark .filter-tab.active {
  background-color: var(--accent-color, #3b82f6);
  border-color: var(--accent-color, #3b82f6);
  color: #fff;
}

/* 禁用态按钮：亮灰底 + 白字在暗色下对比度不足，改用暗输入底 + 灰色文字 */
:root.dark .btn-save:disabled {
  background-color: var(--input-bg, #374151);
  color: var(--text-muted, #9ca3af);
}

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

@media (max-width: 640px) {
  .form-row {
    flex-wrap: wrap;
  }

  .title-input {
    flex-basis: 100%;
  }

  .search-input {
    width: 100%;
  }

  .todo-item {
    flex-wrap: wrap;
  }

  .todo-actions {
    margin-left: auto;
  }
}
</style>
