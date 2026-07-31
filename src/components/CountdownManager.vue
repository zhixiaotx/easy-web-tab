<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCountdownsStore, calcRemaining } from '@/stores/countdowns'
import type { CountdownItem, CountdownSortMode } from '@/stores/countdowns'

const emit = defineEmits<{
  close: []
}>()

const store = useCountdownsStore()

// 排序模式选项
const sortModes: { value: CountdownSortMode; label: string }[] = [
  { value: 'remaining', label: '剩余时间' },
  { value: 'name', label: '名称' },
  { value: 'created', label: '创建时间' },
  { value: 'endTime', label: '结束时间' },
  { value: 'manual', label: '自定义' }
]

// 自定义排序模式（此时显示 ▲▼ 手动调整按钮）
const isManual = computed(() => store.sortMode === 'manual')

// 手动模式下的边界检测：首项不可上移，末项不可下移
function canMoveUp(id: string): boolean {
  const idx = store.itemsWithRemaining.findIndex(i => i.id === id)
  return idx > 0
}

function canMoveDown(id: string): boolean {
  const idx = store.itemsWithRemaining.findIndex(i => i.id === id)
  return idx < store.itemsWithRemaining.length - 1
}

type RemainingStatus = 'normal' | 'urgent' | 'critical' | 'expired'

// 根据剩余状态返回对应的样式类
function statusClass(status: RemainingStatus): string {
  return `status-${status}`
}

// ESC 键关闭弹框
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

onMounted(() => {
  store.loadCountdowns()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

// 表单状态
const showForm = ref(false)
const editingId = ref<string | null>(null)
const formName = ref('')
const formDate = ref('')
const formTime = ref('')
const formRepeat = ref(false)

function startAdd() {
  editingId.value = null
  formName.value = ''
  formDate.value = ''
  formTime.value = ''
  formRepeat.value = false
  showForm.value = true
}

function startEdit(item: CountdownItem) {
  editingId.value = item.id
  formName.value = item.name
  const [date, time] = item.endDateTime.split('T')
  formDate.value = date ?? ''
  formTime.value = time ?? ''
  formRepeat.value = item.repeat === 'yearly'
  showForm.value = true
}

function resetForm() {
  editingId.value = null
  formName.value = ''
  formDate.value = ''
  formTime.value = ''
  formRepeat.value = false
  showForm.value = false
}

function cancelForm() {
  resetForm()
}

function handleSave() {
  const name = formName.value.trim()
  if (!name || !formDate.value) return

  const endDateTime = `${formDate.value}T${formTime.value || '00:00'}`
  const repeat = formRepeat.value ? 'yearly' : null

  if (editingId.value) {
    store.updateCountdown(editingId.value, { name, endDateTime, repeat })
  } else {
    store.addCountdown({ name, endDateTime, repeat })
  }
  resetForm()
}

function handleDelete(id: string) {
  if (confirm('确定要删除这个倒计时吗？')) {
    store.deleteCountdown(id)
  }
}

// 表单实时预览（日期未填时不显示）
const previewRemaining = computed(() => {
  if (!formDate.value) return null
  return calcRemaining(
    `${formDate.value}T${formTime.value || '00:00'}`,
    formRepeat.value ? 'yearly' : null
  )
})
</script>

<template>
  <div class="manager-overlay" @click.self="emit('close')">
    <div class="manager">
      <div class="manager-header">
        <h2>⏳ 倒计时</h2>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="manager-body">
        <!-- 工具栏 -->
        <div class="toolbar">
          <span class="toolbar-count">共 {{ store.itemsWithRemaining.length }} 个倒计时</span>
          <button v-if="!showForm" class="btn-add" @click="startAdd">+ 新增倒计时</button>
        </div>

        <!-- 排序栏 -->
        <div class="sort-bar">
          <div class="sort-modes">
            <button
              v-for="m in sortModes"
              :key="m.value"
              class="sort-mode-btn"
              :class="{ active: store.sortMode === m.value }"
              @click="store.setSort(m.value)"
            >{{ m.label }}</button>
          </div>
          <div v-if="!isManual" class="sort-direction">
            <button class="sort-dir-btn" @click="store.toggleDirection()">
              {{ store.sortDirection === 'asc' ? '↑ 升序' : '↓ 降序' }}
            </button>
          </div>
        </div>
        <div v-if="isManual" class="sort-hint">点击 ▲▼ 箭头调整顺序</div>

        <!-- 新增/编辑表单 -->
        <div v-if="showForm" class="add-form">
          <h3>{{ editingId ? '编辑倒计时' : '新增倒计时' }}</h3>

          <div class="form-group">
            <label>名称 *</label>
            <input
              v-model="formName"
              type="text"
              class="form-input"
              placeholder="例如：期末考试"
              @keyup.enter="handleSave"
            />
          </div>

          <div class="form-group">
            <label>日期 *</label>
            <input
              v-model="formDate"
              type="date"
              class="form-input"
              @keyup.enter="handleSave"
            />
          </div>

          <div class="form-group">
            <label>时间（可选，默认 00:00）</label>
            <input
              v-model="formTime"
              type="time"
              class="form-input"
              @keyup.enter="handleSave"
            />
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input v-model="formRepeat" type="checkbox" />
              <span>每年重复（生日等每年循环的日期）</span>
            </label>
          </div>

          <!-- 实时预览 -->
          <div v-if="previewRemaining" class="preview-row">
            <span class="preview-label">实时预览：</span>
            <span class="preview-value" :class="statusClass(previewRemaining.status)">
              {{ previewRemaining.label }}
            </span>
            <span class="preview-time">{{ previewRemaining.nextTime }}</span>
          </div>

          <div class="form-actions">
            <button class="btn-cancel" @click="cancelForm">取消</button>
            <button
              class="btn-save"
              @click="handleSave"
              :disabled="!formName.trim() || !formDate"
            >
              {{ editingId ? '保存' : '添加' }}
            </button>
          </div>
        </div>

        <!-- 倒计时列表 -->
        <div v-if="store.itemsWithRemaining.length === 0" class="empty-state">
          暂无倒计时，点击「+ 新增倒计时」添加
        </div>

        <div v-else class="countdown-list">
          <div
            v-for="item in store.itemsWithRemaining"
            :key="item.id"
            class="countdown-item"
          >
            <div class="countdown-info">
              <div class="countdown-title">
                <span class="countdown-name">{{ item.name }}</span>
                <span v-if="item.repeat === 'yearly'" class="repeat-badge">每年重复</span>
              </div>
              <span class="countdown-time">{{ item.remaining.nextTime }}</span>
            </div>
            <label class="front-toggle" :title="item.showOnDisplay === false ? '前台隐藏' : '前台显示'">
              <input
                type="checkbox"
                :checked="item.showOnDisplay !== false"
                @change="store.setShowOnDisplay(item.id, ($event.target as HTMLInputElement).checked)"
              />
              <span>前台显示</span>
            </label>
            <span
              class="countdown-remaining"
              :class="statusClass(item.remaining.status)"
            >
              {{ item.remaining.label }}
            </span>
            <div class="countdown-actions">
              <div v-if="isManual" class="move-btns">
                <button class="btn-move" :disabled="!canMoveUp(item.id)" title="上移" @click="store.moveCountdown(item.id, 'up')">▲</button>
                <button class="btn-move" :disabled="!canMoveDown(item.id)" title="下移" @click="store.moveCountdown(item.id, 'down')">▼</button>
              </div>
              <button class="btn-edit" @click="startEdit(item)">编辑</button>
              <button class="btn-delete" @click="handleDelete(item.id)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.manager-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  padding: 20px;
}

.manager {
  background-color: var(--bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 640px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: var(--shadow-modal);
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color, var(--color-border));
  position: sticky;
  top: 0;
  background: var(--bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.manager-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-muted, var(--color-text-muted));
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: color var(--transition-fast, 0.15s ease);
}

.close-btn:hover {
  color: var(--text-primary, var(--color-text));
}

.manager-body {
  padding: 24px;
}

/* 工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
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
  border-radius: var(--radius-md);
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-add:hover:not(:disabled) {
  background-color: var(--accent-hover, var(--color-primary-hover));
}

.btn-add:disabled {
  background-color: var(--text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

/* 排序栏 */
.sort-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 20px;
}

.sort-modes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sort-mode-btn {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: var(--radius-full);
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.sort-mode-btn:hover:not(.active) {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.sort-mode-btn.active {
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
  color: #fff;
}

.sort-dir-btn {
  padding: 6px 10px;
  font-size: 12px;
  border-radius: var(--radius-full);
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
  margin-bottom: 12px;
}

/* 行内操作 */
.move-btns {
  display: flex;
  gap: 4px;
}

.btn-move {
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: 11px;
  border-radius: var(--radius-sm);
  background: var(--bg-card, var(--color-bg-card));
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

/* 表单 */
.add-form {
  background: var(--bg-secondary, var(--color-bg-hover));
  border-radius: var(--radius-md);
  padding: 20px;
  margin-bottom: 20px;
}

.add-form h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, var(--color-text-secondary));
  margin: 0 0 16px 0;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, var(--color-text));
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  background-color: var(--input-bg, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--text-primary, var(--color-text));
  box-sizing: border-box;
  transition: border-color var(--transition-fast, 0.15s ease);
}

.form-input:focus {
  outline: none;
  border-color: var(--accent-color, var(--color-primary));
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  margin-bottom: 0;
}

.checkbox-label input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--accent-color, var(--color-primary));
}

/* 实时预览 */
.preview-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px dashed var(--border-color, var(--color-border));
  border-radius: var(--radius-md);
  margin-bottom: 16px;
}

.preview-label {
  font-size: 13px;
  color: var(--text-muted, var(--color-text-muted));
  white-space: nowrap;
}

.preview-value {
  font-size: 14px;
  font-weight: 600;
}

.preview-time {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
  margin-left: auto;
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
}

/* 表单操作按钮 */
.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 20px;
}

.btn-cancel {
  padding: 10px 16px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md);
  font-size: 14px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-cancel:hover {
  background: var(--hover-bg, var(--color-bg-active));
}

.btn-save {
  padding: 10px 16px;
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-save:hover:not(:disabled) {
  background: var(--accent-hover, var(--color-primary-hover));
}

.btn-save:disabled {
  background: var(--text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

/* 列表 */
.countdown-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.countdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md);
  transition: border-color var(--transition-fast, 0.15s ease);
}

.countdown-item:hover {
  border-color: var(--accent-color, var(--color-primary));
}

.countdown-info {
  flex: 1;
  min-width: 0;
}

.countdown-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.countdown-name {
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
  border-radius: var(--radius-full);
  background: var(--bg-secondary, var(--color-bg-hover));
  color: var(--accent-color, var(--color-primary));
  border: 1px solid var(--accent-color, var(--color-primary));
  opacity: 0.85;
}

.countdown-time {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
}

.countdown-remaining {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 600;
  text-align: right;
}

.countdown-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.btn-edit,
.btn-delete {
  padding: 4px 10px;
  font-size: 12px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm);
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

/* 空状态 */
.empty-state {
  text-align: center;
  color: var(--text-muted, var(--color-text-muted));
  font-size: 14px;
  padding: 40px 20px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border-radius: var(--radius-md);
}

@media (max-width: 640px) {
  .manager {
    max-height: 90vh;
  }

  .countdown-item {
    flex-wrap: wrap;
  }

  .countdown-remaining {
    margin-left: 0;
    text-align: left;
  }

  .countdown-actions {
    margin-left: auto;
  }
}
</style>
