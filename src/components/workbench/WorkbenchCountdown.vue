<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useCountdownsStore } from '@/stores/countdowns'
import type { CountdownItem, CountdownRemaining, CountdownSortMode } from '@/stores/countdowns'
import { repeatLabel, categoryLabel } from '@/composables/countdownCore'
import type { CountdownRepeat, CountdownCategory } from '@/types'
import { COUNTDOWN_CATEGORIES } from '@/types'

const store = useCountdownsStore()

// ===== 表单状态机（新增/编辑共用）=====
const editingId = ref<string | null>(null)
const formName = ref('')
const formDate = ref('')
const formTime = ref('')
const formCategory = ref<CountdownCategory>('work')
const formRepeatType = ref<'once' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'interval'>('once')
const formWeekDays = ref<number[]>([])
const formDayOfMonth = ref(1)
const formIntervalMinutes = ref(45)

const repeatTypeOptions: {
  value: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'interval'
  label: string
}[] = [
  { value: 'once', label: '一次性' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
  { value: 'interval', label: '每隔 N 分钟' }
]

const weekDayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

// 根据当前规则类型构造 CountdownRepeat；'once' 规范存 null
function buildRepeat(): CountdownRepeat | null {
  switch (formRepeatType.value) {
    case 'once':
      return null
    case 'daily':
      return { type: 'daily' }
    case 'weekly':
      return { type: 'weekly', daysOfWeek: [...formWeekDays.value].sort((a, b) => a - b) }
    case 'monthly':
      return { type: 'monthly', dayOfMonth: formDayOfMonth.value }
    case 'yearly':
      return { type: 'yearly' }
    case 'interval':
      return { type: 'interval', intervalMinutes: formIntervalMinutes.value }
  }
}

function resetRepeatForm(): void {
  formRepeatType.value = 'once'
  formWeekDays.value = []
  formDayOfMonth.value = 1
  formIntervalMinutes.value = 45
}

// 名称必填（trim 非空）+ 日期必填 + 时间必填，叠加规则面板约束 —— 否则保存按钮 disabled
const isFormValid = computed(() => {
  if (!formName.value.trim() || !formDate.value || !formTime.value) return false
  switch (formRepeatType.value) {
    case 'weekly':
      return formWeekDays.value.length > 0
    case 'monthly':
      return formDayOfMonth.value >= 1 && formDayOfMonth.value <= 31
    case 'interval':
      return formIntervalMinutes.value >= 1
    default:
      return true
  }
})

function startAdd(): void {
  editingId.value = null
  formName.value = ''
  formDate.value = ''
  formTime.value = ''
  formCategory.value = 'work'
  resetRepeatForm()
}

function startEdit(item: CountdownItem): void {
  editingId.value = item.id
  formName.value = item.name
  // endDateTime 格式 'YYYY-MM-DDTHH:mm'（本地时间无时区后缀），拆分回 date + time
  const [date, time] = item.endDateTime.split('T')
  formDate.value = date ?? ''
  formTime.value = time ?? ''
  formCategory.value = item.category ?? 'work'

  // 反向映射重复规则：null/absent/'once' → once；旧字符串 'yearly' → yearly；对象 → 类型 + 参数
  resetRepeatForm()
  const rep = item.repeat as CountdownRepeat | string | null | undefined
  if (rep === null || rep === undefined || rep === 'once') {
    formRepeatType.value = 'once'
  } else if (typeof rep === 'string') {
    formRepeatType.value = 'yearly'
  } else {
    switch (rep.type) {
      case 'once':
        formRepeatType.value = 'once'
        break
      case 'daily':
        formRepeatType.value = 'daily'
        break
      case 'weekly':
        formRepeatType.value = 'weekly'
        formWeekDays.value = [...rep.daysOfWeek]
        break
      case 'monthly':
        formRepeatType.value = 'monthly'
        formDayOfMonth.value = rep.dayOfMonth
        break
      case 'yearly':
        formRepeatType.value = 'yearly'
        break
      case 'interval':
        formRepeatType.value = 'interval'
        formIntervalMinutes.value = rep.intervalMinutes
        break
    }
  }
}

function cancelForm(): void {
  startAdd()
}

async function handleSave(): Promise<void> {
  const name = formName.value.trim()
  if (!name || !formDate.value || !formTime.value) return
  const endDateTime = `${formDate.value}T${formTime.value}`
  const repeat = buildRepeat()
  const category = formCategory.value
  if (editingId.value) {
    await store.updateCountdown(editingId.value, { name, endDateTime, repeat, category })
  } else {
    await store.addCountdown({ name, endDateTime, repeat, category })
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
      </div>
      <div class="form-row">
        <select v-model="formCategory" class="form-input cat-select" data-testid="cd-category">
          <option v-for="c in COUNTDOWN_CATEGORIES" :key="c" :value="c">{{ categoryLabel(c) }}</option>
        </select>
        <select v-model="formRepeatType" class="form-input repeat-select" data-testid="cd-repeat-type">
          <option v-for="opt in repeatTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <div v-if="formRepeatType === 'weekly'" class="weekday-grid">
          <label
            v-for="(label, i) in weekDayLabels"
            :key="i + 1"
            class="weekday-check"
            :class="{ active: formWeekDays.includes(i + 1) }"
          >
            <input
              v-model="formWeekDays"
              type="checkbox"
              :value="i + 1"
              :data-testid="'cd-week-' + (i + 1)"
            />
            <span>{{ label }}</span>
          </label>
          <button
            type="button"
            class="workdays-btn"
            data-testid="cd-workdays-btn"
            @click="formWeekDays = [1, 2, 3, 4, 5]"
          >工作日（周一~五）</button>
        </div>
        <div v-if="formRepeatType === 'monthly'" class="rule-panel">
          <label class="panel-label">每月</label>
          <input
            v-model.number="formDayOfMonth"
            type="number"
            min="1"
            max="31"
            class="form-input month-day-input"
            data-testid="cd-month-day"
          />
          <label class="panel-label">日</label>
        </div>
        <div v-if="formRepeatType === 'interval'" class="rule-panel">
          <label class="panel-label">每隔</label>
          <input
            v-model.number="formIntervalMinutes"
            type="number"
            min="1"
            class="form-input interval-min-input"
            data-testid="cd-interval-min"
          />
          <label class="panel-label">分钟</label>
        </div>
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
            <span v-if="repeatLabel(item.repeat) !== '一次性'" class="repeat-badge">{{ repeatLabel(item.repeat) }}</span>
            <span class="cat-badge" :class="'cat-' + (item.category ?? 'work')">{{ categoryLabel(item.category) }}</span>
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

.cat-select {
  width: 110px;
  flex-shrink: 0;
}

.repeat-select {
  width: 130px;
  flex-shrink: 0;
}

/* 每周重复选项 */
.weekday-grid {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.weekday-check {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: var(--radius-full, 999px);
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.weekday-check.active {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.weekday-check input[type='checkbox'] {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--accent-color, var(--color-primary));
}

.workdays-btn {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: var(--radius-full, 999px);
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.workdays-btn:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

/* 每月 / 间隔 参数面板 */
.rule-panel {
  display: flex;
  align-items: center;
  gap: 6px;
}

.panel-label {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  white-space: nowrap;
}

.month-day-input {
  width: 70px;
  flex-shrink: 0;
}

.interval-min-input {
  width: 80px;
  flex-shrink: 0;
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

/* 分类徽章：工作=蓝 / 生活=绿 / 学习=紫 */
.cat-badge {
  flex-shrink: 0;
  font-size: 12px;
  padding: 1px 8px;
  border-radius: var(--radius-full, 999px);
  opacity: 0.85;
}

.cat-work {
  color: #3b82f6;
  border: 1px solid #3b82f6;
  background: rgba(59, 130, 246, 0.12);
}

.cat-life {
  color: #22c55e;
  border: 1px solid #22c55e;
  background: rgba(34, 197, 94, 0.12);
}

.cat-study {
  color: #a855f7;
  border: 1px solid #a855f7;
  background: rgba(168, 85, 247, 0.12);
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

/* 禁用态按钮：亮灰底 + 白字在暗色下对比度不足，改用暗输入底 + 灰色文字 */
:root.dark .btn-save:disabled {
  background-color: var(--input-bg, #374151);
  color: var(--text-muted, #9ca3af);
}

:root.dark .name-input,
:root.dark .date-input,
:root.dark .time-input,
:root.dark .cat-select,
:root.dark .repeat-select,
:root.dark .month-day-input,
:root.dark .interval-min-input,
:root.dark .sort-select {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}

:root.dark .weekday-check,
:root.dark .workdays-btn {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .weekday-check.active {
  color: #60a5fa;
  border-color: #60a5fa;
}

:root.dark .cat-work {
  color: #60a5fa;
  border-color: #3b82f6;
}

:root.dark .cat-life {
  color: #4ade80;
  border-color: #22c55e;
}

:root.dark .cat-study {
  color: #c084fc;
  border-color: #a855f7;
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
