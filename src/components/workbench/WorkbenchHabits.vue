<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useWorkbenchHabitsStore } from '@/stores/workbenchHabits'
import { useToast } from '@/composables/useToast'
import { localToday } from '@/composables/todoCore'
import { DEFAULT_HABIT_COLOR } from '@/composables/habitCore'
import type { HabitFrequency } from '@/composables/habitCore'
import { TODO_COLOR_PRESETS } from '@/types'

const store = useWorkbenchHabitsStore()
const toast = useToast()

// 今天 = 本地日期 YYYY-MM-DD（localToday 防 UTC 偏移）；打卡/连击/周统计均以此为锚
const today = localToday()

// ===== 顶部统计（薄委托 store → habitCore，禁止内联 streak/attainment 公式）=====
const stats = computed(() => {
  let weekCompleted = 0
  let weekTarget = 0
  let todayChecked = 0
  for (const h of store.habits) {
    const week = store.weeklyAttainmentOf(h.id, h.frequency, today)
    weekCompleted += week.completed
    weekTarget += week.target
    if (isChecked(h.id)) todayChecked++
  }
  return { total: store.habits.length, weekCompleted, weekTarget, todayChecked }
})

/** 今日是否已打卡（records 同日记录存在性判断，非公式）。 */
function isChecked(habitId: string): boolean {
  return store.records.some(r => r.habitId === habitId && r.date === today)
}

// 卡片视图数据：连续天数/周达成率一律走 store 薄委托（streakDaysOf/weeklyAttainmentOf → habitCore）
const viewHabits = computed(() =>
  store.habits.map(h => ({
    habit: h,
    checked: isChecked(h.id),
    streak: store.streakDaysOf(h.id, today),
    week: store.weeklyAttainmentOf(h.id, h.frequency, today)
  }))
)

// ===== 新增/编辑表单状态机（编辑复用同一表单，提交/取消后回新增态）=====
const formName = ref('')
const formFrequency = ref<HabitFrequency>(7)
const formColor = ref(DEFAULT_HABIT_COLOR)
const editingId = ref<string | null>(null)

const isEditing = computed(() => editingId.value !== null)

// 频率选项与 habitCore HabitFrequency（每周目标次数 1-7）对齐：「每天」即 7
const FREQUENCY_OPTIONS: { value: HabitFrequency; label: string }[] = [
  { value: 7, label: '每天' },
  { value: 5, label: '每周 5 次' },
  { value: 3, label: '每周 3 次' },
  { value: 1, label: '每周 1 次' }
]

// 习惯操作失败 toast：reason 语义 → 中文文案（仿待办分类 CRUD 惯例）
const HABIT_ERROR_MESSAGES: Record<string, string> = {
  empty: '习惯名称不能为空',
  duplicate: '同名习惯已存在',
  'not-found': '习惯不存在'
}

function habitErrorToast(result: { ok: boolean; reason?: string }): void {
  if (result.ok) return
  toast.error(HABIT_ERROR_MESSAGES[result.reason ?? ''] ?? '操作失败')
}

async function handleAddOrSave(): Promise<void> {
  const name = formName.value.trim()
  if (!name) return
  if (editingId.value !== null) {
    const result = await store.updateHabit(editingId.value, {
      name,
      frequency: formFrequency.value,
      color: formColor.value
    })
    if (result.ok) resetForm()
    habitErrorToast(result)
    return
  }
  const result = await store.addHabit(name, formFrequency.value, formColor.value)
  if (result.ok) resetForm()
  habitErrorToast(result)
}

function startEdit(id: string): void {
  const h = store.habits.find(x => x.id === id)
  if (!h) return
  editingId.value = h.id
  formName.value = h.name
  formFrequency.value = h.frequency
  formColor.value = h.color ?? DEFAULT_HABIT_COLOR
}

function resetForm(): void {
  editingId.value = null
  formName.value = ''
  formFrequency.value = 7
  formColor.value = DEFAULT_HABIT_COLOR
}

async function handleDelete(id: string): Promise<void> {
  const h = store.habits.find(x => x.id === id)
  if (!confirm(`确定要删除习惯「${h?.name ?? ''}」吗？删除后打卡记录一并清除。`)) return
  const result = await store.deleteHabit(id)
  if (result.ok && editingId.value === id) resetForm()
  habitErrorToast(result)
}

// 打卡/取消打卡：幂等由 store.toggleCheckIn 保证（同一天再点取消），组件不重算
async function handleCheck(habitId: string): Promise<void> {
  const result = await store.toggleCheckIn(habitId, today)
  if (!result.ok) habitErrorToast(result)
}

// 面板自管理数据加载（WorkbenchView Promise.all 不接入本 store；loadHabits 经 normalizeHabitsData 幂等归一）
onMounted(() => {
  void store.loadHabits()
})
</script>

<template>
  <div class="wb-habits">
    <!-- 本周统计卡：习惯总数 / 今日已打卡 / 本周打卡达成 -->
    <div class="stat-card">
      <div class="stat-header">
        <span class="stat-icon">🔥</span>
        <span class="stat-label">本周统计</span>
      </div>
      <div class="hb-summary-row">
        <div class="hb-summary-item" data-testid="hb-total-count">
          <span class="hb-summary-value">{{ stats.total }}</span>
          <span class="hb-summary-label">个习惯</span>
        </div>
        <div class="hb-summary-item" data-testid="hb-today-count">
          <span class="hb-summary-value">{{ stats.todayChecked }}/{{ stats.total }}</span>
          <span class="hb-summary-label">今日已打卡</span>
        </div>
        <div class="hb-summary-item" data-testid="hb-week-count">
          <span class="hb-summary-value">{{ stats.weekCompleted }}/{{ stats.weekTarget }}</span>
          <span class="hb-summary-label">本周打卡/目标</span>
        </div>
      </div>
    </div>

    <!-- 新增/编辑习惯表单 -->
    <div class="stat-card">
      <div class="stat-header">
        <span class="stat-icon">📌</span>
        <span class="stat-label">{{ isEditing ? '编辑习惯' : '新增习惯' }}</span>
        <button
          v-if="isEditing"
          type="button"
          class="btn-secondary hb-cancel-btn"
          data-testid="hb-form-cancel"
          @click="resetForm"
        >
          取消编辑
        </button>
      </div>
      <form class="hb-form" @submit.prevent="handleAddOrSave">
        <div class="field">
          <label class="field-label">名称 *</label>
          <input
            v-model="formName"
            type="text"
            class="form-input"
            placeholder="例如：每天喝水 8 杯"
            maxlength="30"
            data-testid="hb-form-name"
          />
        </div>
        <div class="field">
          <label class="field-label">频率</label>
          <select v-model="formFrequency" class="form-input" data-testid="hb-form-frequency">
            <option v-for="opt in FREQUENCY_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">颜色</label>
          <div class="hb-color-picker" data-testid="hb-form-color">
            <button
              v-for="(color, i) in TODO_COLOR_PRESETS"
              :key="color"
              type="button"
              class="hb-color-option"
              :class="{ active: formColor.toLowerCase() === color }"
              :style="{ '--hb-swatch': color }"
              :data-testid="'hb-color-preset-' + (i + 1)"
              :title="color"
              @click="formColor = color"
            ></button>
          </div>
        </div>
        <button type="submit" class="btn-primary" :disabled="!formName.trim()" data-testid="hb-add-btn">
          {{ isEditing ? '保存' : '添加' }}
        </button>
      </form>
    </div>

    <!-- 习惯卡片列表 -->
    <div v-if="store.habits.length === 0" class="empty-state" data-testid="hb-empty">
      📌 还没有习惯，先在上方添加一个吧
    </div>

    <div v-else class="hb-list">
      <div
        v-for="v in viewHabits"
        :key="v.habit.id"
        class="hb-card"
        :class="{ 'is-checked': v.checked }"
        :data-testid="`hb-card-${v.habit.id}`"
        :style="{ '--hb-color': v.habit.color ?? DEFAULT_HABIT_COLOR }"
      >
        <span class="hb-card-bar"></span>
        <span class="hb-card-icon">📌</span>
        <div class="hb-card-main">
          <div class="hb-card-name">{{ v.habit.name }}</div>
          <div class="hb-card-badges">
            <span class="hb-badge hb-badge-streak" :data-testid="`hb-streak-${v.habit.id}`">
              🔥 连续 {{ v.streak }} 天
            </span>
            <span class="hb-badge hb-badge-week" :data-testid="`hb-week-${v.habit.id}`">
              本周 {{ v.week.completed }}/{{ v.week.target }}
            </span>
          </div>
        </div>
        <div class="hb-card-actions">
          <label class="hb-check-label" :title="v.checked ? '取消今日打卡' : '今日打卡'">
            <input
              type="checkbox"
              class="hb-check-input"
              :checked="v.checked"
              :data-testid="`hb-check-${v.habit.id}`"
              @change="handleCheck(v.habit.id)"
            />
          </label>
          <button class="btn-edit" :data-testid="`hb-edit-${v.habit.id}`" @click="startEdit(v.habit.id)">编辑</button>
          <button class="btn-delete" :data-testid="`hb-delete-${v.habit.id}`" @click="handleDelete(v.habit.id)">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 面板容器（复用 WorkbenchPomodoro stat-card 结构） */
.wb-habits {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 560px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
}

.stat-card:hover {
  border-color: var(--accent-color, var(--color-primary));
}

.stat-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-icon {
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
}

.stat-label {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, var(--color-text-secondary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 本周统计卡 ===== */
.hb-summary-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.hb-summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 14px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border-radius: var(--radius-md, 8px);
  min-width: 96px;
}

.hb-summary-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--accent-color, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.hb-summary-label {
  font-size: 12px;
  color: var(--text-secondary, var(--color-text-secondary));
}

/* ===== 新增/编辑表单 ===== */
.hb-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hb-cancel-btn {
  padding: 4px 10px;
  font-size: 12px;
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

.hb-color-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.hb-color-option {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: var(--hb-swatch);
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: transform var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease);
}

.hb-color-option:hover {
  transform: scale(1.1);
}

.hb-color-option.active {
  border-color: var(--text-primary, var(--color-text));
  transform: scale(1.1);
}

.btn-primary {
  align-self: flex-start;
  padding: 10px 24px;
  background-color: var(--accent-color, var(--color-primary));
  color: #fff;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--accent-hover, var(--color-primary-hover));
}

.btn-primary:disabled {
  background: var(--text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

.btn-secondary {
  padding: 10px 20px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-secondary:hover:not(:disabled) {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

/* ===== 习惯卡片列表 ===== */
.hb-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hb-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease), box-shadow var(--transition-fast, 0.15s ease);
}

.hb-card:hover {
  border-color: var(--hb-color, var(--accent-color, var(--color-primary)));
}

.hb-card.is-checked .hb-card-name {
  text-decoration: line-through;
  color: var(--text-muted, var(--color-text-muted));
}

/* 左侧颜色条（习惯主色，随卡片 hover 强调） */
.hb-card-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  border-radius: var(--radius-md, 10px) 0 0 var(--radius-md, 10px);
  background-color: var(--hb-color, var(--accent-color, var(--color-primary)));
}

.hb-card-icon {
  font-size: 20px;
  line-height: 1;
  flex-shrink: 0;
}

.hb-card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hb-card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hb-card-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.hb-badge {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.hb-badge-streak {
  background: var(--bg-secondary, var(--color-bg-hover));
  color: var(--accent-color, var(--color-primary));
}

.hb-badge-week {
  background: var(--bg-secondary, var(--color-bg-hover));
  color: var(--text-secondary, var(--color-text-secondary));
}

.hb-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.hb-check-label {
  display: inline-flex;
  cursor: pointer;
}

.hb-check-input {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--hb-color, var(--accent-color, var(--color-primary)));
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

/* ===== 暗色模式覆盖（模式参考 WorkbenchPomodoro）===== */
:root.dark .stat-card,
:root.dark .hb-card {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .hb-summary-item {
  background-color: var(--bg-card, #1f2937);
}

:root.dark .hb-badge-streak,
:root.dark .hb-badge-week {
  background-color: var(--input-bg, #374151);
}

:root.dark .hb-card.is-checked .hb-card-name {
  color: var(--text-muted, #9ca3af);
}

:root.dark .hb-color-option.active {
  border-color: var(--text-primary, #f9fafb);
}

:root.dark .btn-primary:disabled {
  background-color: var(--input-bg, #374151);
  color: var(--text-muted, #9ca3af);
}

:root.dark .btn-secondary,
:root.dark .btn-edit,
:root.dark .btn-delete {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .form-input,
:root.dark select.form-input,
:root.dark input.form-input {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}

:root.dark .empty-state {
  background-color: var(--bg-secondary, #1f2937);
}

@media (max-width: 640px) {
  .hb-card {
    flex-wrap: wrap;
  }

  .hb-card-actions {
    margin-left: auto;
  }
}
</style>
