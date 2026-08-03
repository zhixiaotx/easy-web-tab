<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useCountdownsStore } from '@/stores/countdowns'
import type { CountdownItem, CountdownRemaining, CountdownSortMode } from '@/stores/countdowns'

const store = useCountdownsStore()

// ===== 表单状态机（新增/编辑共用）=====
const editingId = ref<string | null>(null)
const formName = ref('')
const formDate = ref('')
const formTime = ref('')
const formRepeat = ref(false)

// 名称必填（trim 非空）+ 日期必填 + 时间必填 —— 否则保存按钮 disabled
const isFormValid = computed(() => {
  const name = formName.value.trim()
  return name.length > 0 && formDate.value !== '' && formTime.value !== ''
})

function startAdd(): void {
  editingId.value = null
  formName.value = ''
  formDate.value = ''
  formTime.value = ''
  formRepeat.value = false
}

function startEdit(item: CountdownItem): void {
  editingId.value = item.id
  formName.value = item.name
  // endDateTime 格式 'YYYY-MM-DDTHH:mm'（本地时间无时区后缀），拆分回 date + time
  const [date, time] = item.endDateTime.split('T')
  formDate.value = date ?? ''
  formTime.value = time ?? ''
  formRepeat.value = item.repeat === 'yearly'
}

function cancelForm(): void {
  startAdd()
}

async function handleSave(): Promise<void> {
  const name = formName.value.trim()
  if (!name || !formDate.value || !formTime.value) return
  const endDateTime = `${formDate.value}T${formTime.value}`
  const repeat = formRepeat.value ? 'yearly' : null
  if (editingId.value) {
    await store.updateCountdown(editingId.value, { name, endDateTime, repeat })
  } else {
    await store.addCountdown({ name, endDateTime, repeat })
  }
  cancelForm()
}

async function handleDelete(id: string): Promise<void> {
  if (confirm('确定要删除这个倒计时吗？')) {
    await store.deleteCountdown(id)
  }
}

// ===== 排序控件 =====
const SORT_MODES: { value: CountdownSortMode; label: string }[] = [
  { value: 'remaining', label: '剩余时间' },
  { value: 'name', label: '名称' },
  { value: 'created', label: '创建时间' },
  { value: 'endTime', label: '结束时间' },
  { value: 'manual', label: '自定义' }
]

const isManual = computed(() => store.sortMode === 'manual')

function onSortChange(event: Event): void {
  store.setSort((event.target as HTMLSelectElement).value as CountdownSortMode)
}

// manual 模式边界：按 itemsWithRemaining 位置判断，首行 ▲ 禁用、末行 ▼ 禁用
function canMoveUp(id: string): boolean {
  return store.itemsWithRemaining.findIndex(i => i.id === id) > 0
}

function canMoveDown(id: string): boolean {
  const idx = store.itemsWithRemaining.findIndex(i => i.id === id)
  return idx >= 0 && idx < store.itemsWithRemaining.length - 1
}

// 剩余时间状态 → 样式类（normal/urgent/critical/expired）
function statusClass(status: CountdownRemaining['status']): string {
  return `status-${status}`
}

// 面板自管理数据加载（WorkbenchView 已加载，这里防御性重载，数据与 IDB 同步）
onMounted(async () => {
  await store.loadCountdowns()
})
</script>

<template>
  <div class="wb-countdown">
    <!-- 新增/编辑共用表单 -->
    <form class="cd-form" @submit.prevent="handleSave">
      <div class="form-row">
        <input
          v-model="formName"
          type="text"
          class="form-input name-input"
          data-testid="cd-name-input"
          :placeholder="editingId ? '编辑倒计时名称…' : '添加倒计时名称…'"
        />
        <input
          v-model="formDate"
          type="date"
          class="form-input date-input"
          data-testid="cd-date-input"
        />
        <input
          v-model="formTime"
          type="time"
          class="form-input time-input"
          data-testid="cd-time-input"
        />
        <label class="repeat-check">
          <input v-model="formRepeat" type="checkbox" />
          <span>每年重复</span>
        </label>
      </div>
      <div class="form-row form-row-bottom">
        <div class="form-actions">
          <button
            v-if="editingId"
            type="button"
            class="btn-cancel"
            data-testid="cd-cancel-button"
            @click="cancelForm"
          >
            取消
          </button>
          <button
            type="submit"
            class="btn-save"
            :disabled="!isFormValid"
            data-testid="cd-save-button"
          >
            {{ editingId ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </form>

    <!-- 排序控件 -->
    <div class="cd-toolbar">
      <select
        class="form-input sort-select"
        data-testid="cd-sort-select"
        :value="store.sortMode"
        @change="onSortChange"
      >
        <option v-for="m in SORT_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
      </select>
      <button
        v-if="!isManual"
        class="sort-dir-btn"
        data-testid="cd-sort-dir"
        @click="store.toggleDirection()"
      >
        {{ store.sortDirection === 'asc' ? '↑ 升序' : '↓ 降序' }}
      </button>
      <span v-if="isManual" class="sort-hint">点击 ▲▼ 箭头调整顺序</span>
    </div>

    <!-- 列表 -->
    <div v-if="store.itemsWithRemaining.length === 0" class="empty-state" data-testid="cd-empty">
      暂无倒计时
    </div>

    <div v-else class="cd-list">
      <div
        v-for="item in store.itemsWithRemaining"
        :key="item.id"
        class="cd-item"
        data-testid="cd-item"
      >
        <div class="cd-info">
          <div class="cd-title">
            <span class="cd-name">{{ item.name }}</span>
            <span v-if="item.repeat === 'yearly'" class="repeat-badge">每年重复</span>
          </div>
          <span class="cd-time">{{ item.remaining.nextTime }}</span>
        </div>

        <label
          class="front-toggle"
          :title="item.showOnDisplay === false ? '前台隐藏' : '前台显示'"
        >
          <input
            type="checkbox"
            :checked="item.showOnDisplay !== false"
            @change="store.setShowOnDisplay(item.id, ($event.target as HTMLInputElement).checked)"
          />
          <span>前台显示</span>
        </label>

        <span
          class="cd-remaining"
          :class="statusClass(item.remaining.status)"
        >
          {{ item.remaining.label }}
        </span>

        <div class="cd-actions">
          <div v-if="isManual" class="move-btns">
            <button
              class="btn-move"
              :disabled="!canMoveUp(item.id)"
              title="上移"
              @click="store.moveCountdown(item.id, 'up')"
            >▲</button>
            <button
              class="btn-move"
              :disabled="!canMoveDown(item.id)"
              title="下移"
              @click="store.moveCountdown(item.id, 'down')"
            >▼</button>
          </div>
          <button class="btn-edit" @click="startEdit(item)">编辑</button>
          <button class="btn-delete" @click="handleDelete(item.id)">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 面板容器 */
.wb-countdown {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== 表单 ===== */
.cd-form {
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  padding: 14px;
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.form-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.form-row-bottom {
  margin-top: 10px;
  justify-content: flex-end;
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

.name-input {
  flex: 1;
  min-width: 140px;
}

.date-input {
  width: 150px;
  flex-shrink: 0;
}

.time-input {
  width: 120px;
  flex-shrink: 0;
}

.repeat-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
}

.repeat-check input[type='checkbox'] {
  width: 15px;
  height: 15px;
  cursor: pointer;
  accent-color: var(--accent-color, var(--color-primary));
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
.cd-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.sort-select {
  width: 150px;
}

.sort-dir-btn {
  padding: 8px 14px;
  font-size: 13px;
  border-radius: var(--radius-full, 999px);
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.sort-dir-btn:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.sort-hint {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
}

/* ===== 列表 ===== */
.cd-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cd-item {
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

.cd-item:hover {
  border-color: var(--accent-color, var(--color-primary));
}

.cd-info {
  flex: 1;
  min-width: 0;
}

.cd-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.cd-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repeat-badge {
  flex-shrink: 0;
  font-size: 12px;
  padding: 1px 8px;
  border-radius: var(--radius-full, 999px);
  background: var(--bg-secondary, var(--color-bg-hover));
  color: var(--accent-color, var(--color-primary));
  border: 1px solid var(--accent-color, var(--color-primary));
  opacity: 0.85;
}

.cd-time {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
  font-variant-numeric: tabular-nums;
}

.front-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.front-toggle input[type='checkbox'] {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--accent-color, var(--color-primary));
}

.cd-remaining {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 600;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* 剩余时间状态色 */
.status-normal {
  color: var(--success-color, var(--color-success));
}

.status-urgent {
  color: var(--warning-color, var(--color-warning));
}

.status-critical {
  color: var(--error-color, var(--color-error));
}

.status-expired {
  color: var(--text-muted, var(--color-text-muted));
  font-weight: 500;
}

/* ===== 行内操作 ===== */
.cd-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.move-btns {
  display: flex;
  gap: 4px;
}

.btn-move {
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: 11px;
  border-radius: var(--radius-sm, 6px);
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  line-height: 1;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-move:hover:not(:disabled) {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.btn-move:disabled {
  opacity: 0.35;
  cursor: not-allowed;
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
:root.dark .cd-form {
  background-color: var(--bg-secondary, #1f2937);
}

:root.dark .cd-item {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .empty-state {
  background-color: var(--bg-secondary, #1f2937);
}

:root.dark .name-input,
:root.dark .date-input,
:root.dark .time-input,
:root.dark .sort-select {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}

:root.dark .sort-dir-btn,
:root.dark .btn-cancel,
:root.dark .btn-edit,
:root.dark .btn-delete,
:root.dark .btn-move {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .status-normal {
  color: #4ade80;
}

:root.dark .status-urgent {
  color: #fbbf24;
}

:root.dark .status-critical {
  color: #f87171;
}

@media (max-width: 640px) {
  .cd-item {
    flex-wrap: wrap;
  }

  .cd-remaining {
    text-align: left;
  }

  .cd-actions {
    margin-left: auto;
  }
}
</style>
