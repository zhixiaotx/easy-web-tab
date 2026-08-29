<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useWorkbenchHabitsStore } from '@/stores/workbenchHabits'
import { useToast } from '@/composables/useToast'
import { localToday } from '@/composables/todoCore'
import { DEFAULT_HABIT_COLOR } from '@/composables/habitCore'
import type { HabitFrequency } from '@/composables/habitCore'
import { TODO_COLOR_PRESETS } from '@/types'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from './PanelPager.vue'
import Icon from '@/components/Icon.vue'

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
// 展示排序：未打卡置顶（「今天要处理」一眼可见），已打卡沉底；同状态内保持录入顺序稳定。
// 仅依赖 records/today 的响应式派生，打卡后由 <TransitionGroup> 平滑滑动到新位置，不突兀跳变。
const viewHabits = computed(() =>
  store.habits
    .map((h, i) => ({ h, i, checked: isChecked(h.id) }))
    .sort((a, b) => (a.checked === b.checked ? a.i - b.i : a.checked ? 1 : -1))
    .map(({ h }) => ({
      habit: h,
      checked: isChecked(h.id),
      streak: store.streakDaysOf(h.id, today),
      week: store.weeklyAttainmentOf(h.id, h.frequency, today)
    }))
)

// ===== 自适应分页（R4/R7：rowHeight 82 = row-heights.json MAX 79.58 + 2px；
// 右侧卡片网格：gridRef = listEl 同元素实测列数 → 每页 = rowsPerPage × colsPerRow）=====
const listEl = ref<HTMLElement | null>(null)
const paging = usePanelPaging({
  items: () => viewHabits.value,
  rowHeight: 82, // row-heights.json: habits = 82 (MAX 79.58 + 2px)
  containerRef: listEl,
  gridRef: listEl
})
// usePanelPaging 返回普通对象（非 reactive），模板需顶层 ref 自动解包 → 解构（goto 供列表变化回页 1）
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev, goto } = paging

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
    if (result.ok) {
      resetForm()
      goto(1)
    }
    habitErrorToast(result)
    return
  }
  const result = await store.addHabit(name, formFrequency.value, formColor.value)
  if (result.ok) {
    resetForm()
    goto(1)
  }
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
  if (result.ok) {
    if (editingId.value === id) resetForm()
    goto(1)
  }
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
    <!-- 左栏：统计卡 + 新增/编辑表单 -->
    <div class="hb-side">
      <!-- 本周统计卡：习惯总数 / 今日已打卡 / 本周打卡达成 -->
      <div class="stat-card">
        <div class="stat-header">
          <Icon name="trending-up" :size="18" class="stat-icon" />
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
          <Icon name="habits" :size="18" class="stat-icon" />
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
    </div>

    <!-- 右栏：习惯卡片网格（多条并排展示，分页在网格下方） -->
    <div class="hb-main">
      <div v-if="store.habits.length === 0" class="empty-state" data-testid="hb-empty">
        📌 还没有习惯，先在左侧添加一个吧
      </div>

      <div v-else ref="listEl" class="hb-list" :class="{ 'hb-list-scroll': !fitsOnePage }">
        <TransitionGroup name="grid">
        <div
          v-for="v in pageItems"
          :key="v.habit.id"
          class="hb-card"
          :class="{ 'is-checked': v.checked }"
          :data-testid="`hb-card-${v.habit.id}`"
          :style="{ '--hb-color': v.habit.color ?? DEFAULT_HABIT_COLOR }"
        >
          <span class="hb-card-bar"></span>
          <Icon name="habits" :size="20" class="hb-card-icon" />
          <div class="hb-card-main">
            <div class="hb-card-name">{{ v.habit.name }}</div>
            <div class="hb-card-badges">
              <span class="hb-badge hb-badge-streak" :data-testid="`hb-streak-${v.habit.id}`">
                <Icon name="trending-up" :size="13" class="hb-badge-ico" /> 连续 {{ v.streak }} 天
              </span>
              <span class="hb-badge hb-badge-week" :data-testid="`hb-week-${v.habit.id}`">
                本周 {{ v.week.completed }}/{{ v.week.target }}
              </span>
            </div>
            <div class="hb-week-bar" :title="`本周 ${v.week.completed}/${v.week.target}`">
              <div
                class="hb-week-fill"
                :style="{
                  width: Math.min(100, Math.round(v.week.percent * 100)) + '%',
                  background: v.habit.color ?? DEFAULT_HABIT_COLOR
                }"
              ></div>
            </div>
          </div>
          <div class="hb-card-actions">
            <button
              class="hb-check-btn"
              :class="{ 'is-checked': v.checked }"
              :style="{ '--hb-color': v.habit.color ?? DEFAULT_HABIT_COLOR }"
              :data-testid="`hb-check-${v.habit.id}`"
              :aria-label="v.checked ? '取消今日打卡' : '今日打卡'"
              @click="handleCheck(v.habit.id)"
            >
              <Icon name="check" :size="16" />
              <span>{{ v.checked ? '已打卡' : '打卡' }}</span>
            </button>
            <button class="btn-edit" :data-testid="`hb-edit-${v.habit.id}`" @click="startEdit(v.habit.id)">编辑</button>
            <button class="btn-delete" :data-testid="`hb-delete-${v.habit.id}`" @click="handleDelete(v.habit.id)">删除</button>
          </div>
        </div>
        </TransitionGroup>
      </div>

      <PanelPager :page="currentPage" :total="totalPages" @prev="prev()" @next="next()" />
    </div>
  </div>
</template>

<style scoped>
/* 面板容器：桌面 ≥1200px 左右双栏（左=统计+表单，右=卡片网格），其余单列堆叠 */
.wb-habits {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hb-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hb-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

@media (min-width: 1200px) {
  .wb-habits {
    display: grid;
    grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
    align-items: stretch;
  }
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
}

.stat-card:hover {
  border-color: var(--color-primary, var(--color-primary));
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
  color: var(--color-text-secondary, var(--color-text-secondary));
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
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: var(--radius-md, 8px);
  min-width: 96px;
}

.hb-summary-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.hb-summary-label {
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
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
  color: var(--color-text-secondary, var(--color-text-secondary));
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
  border-color: var(--color-text, var(--color-text));
  transform: scale(1.1);
}

.btn-primary {
  align-self: flex-start;
  padding: 10px 24px;
  background-color: var(--color-primary, var(--color-primary));
  color: #fff;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--color-primary-hover, var(--color-primary-hover));
}

.btn-primary:disabled {
  background: var(--color-text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

.btn-secondary {
  padding: 10px 20px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-secondary:hover:not(:disabled) {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

/* ===== 习惯卡片网格（右栏，多列并排） ===== */
.hb-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 10px;
  align-content: start;
}

.hb-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease), box-shadow var(--transition-fast, 0.15s ease);
}

.hb-card:hover {
  border-color: var(--hb-color, var(--color-primary, var(--color-primary)));
}

.hb-card.is-checked .hb-card-name {
  text-decoration: line-through;
  color: var(--color-text-muted, var(--color-text-muted));
}

/* 左侧颜色条（习惯主色，随卡片 hover 强调） */
.hb-card-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  border-radius: var(--radius-md, 10px) 0 0 var(--radius-md, 10px);
  background-color: var(--hb-color, var(--color-primary, var(--color-primary)));
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
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;
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
  background: var(--color-bg-card, var(--color-bg-hover));
  color: var(--color-primary, var(--color-primary));
}

.hb-badge-week {
  background: var(--color-bg-card, var(--color-bg-hover));
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.hb-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 打卡主角按钮：清晰的「打卡/已打卡」CTA，触控区 ≥44px，习惯主色，勾选后填充 */
.hb-check-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 78px;
  min-height: 36px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  border-radius: var(--radius-md, 8px);
  border: 1.5px solid var(--hb-color, var(--color-primary, var(--color-primary)));
  background: transparent;
  color: var(--hb-color, var(--color-primary, var(--color-primary)));
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease), color var(--transition-fast, 0.15s ease);
}

.hb-check-btn:hover {
  background: color-mix(in srgb, var(--hb-color, var(--color-primary)) 12%, transparent);
}

.hb-check-btn.is-checked {
  background: var(--hb-color, var(--color-primary, var(--color-primary)));
  color: #fff;
  border-color: var(--hb-color, var(--color-primary, var(--color-primary)));
}

.hb-badge-ico {
  flex-shrink: 0;
}

/* 本周进度条：目标完成度一眼可见（颜色随习惯主色） */
.hb-week-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--color-bg-input, var(--color-bg-hover));
  overflow: hidden;
  margin-top: 2px;
}

.hb-week-fill {
  height: 100%;
  border-radius: 999px;
  transition: width var(--transition-fast, 0.15s ease);
}

.btn-edit,
.btn-delete {
  padding: 4px 10px;
  font-size: 12px;
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

/* ===== 暗色模式覆盖（模式参考 WorkbenchPomodoro）===== */
:root.dark .stat-card,
:root.dark .hb-card {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

:root.dark .hb-summary-item {
  background-color: var(--color-bg-card, #1f2937);
}

:root.dark .hb-badge-streak,
:root.dark .hb-badge-week {
  background-color: var(--color-bg-input, #374151);
}

:root.dark .hb-week-bar {
  background-color: #374151;
}

:root.dark .hb-card.is-checked .hb-card-name {
  color: var(--color-text-muted, #9ca3af);
}

:root.dark .hb-color-option.active {
  border-color: var(--color-text, #f9fafb);
}

:root.dark .btn-primary:disabled {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text-muted, #9ca3af);
}

:root.dark .btn-secondary,
:root.dark .btn-edit,
:root.dark .btn-delete {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

:root.dark .form-input,
:root.dark select.form-input,
:root.dark input.form-input {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text, #f9fafb);
  border-color: var(--color-border, #374151);
}

:root.dark .empty-state {
  background-color: var(--color-bg-card, #1f2937);
}

@media (max-width: 640px) {
  .hb-card {
    flex-wrap: wrap;
  }

  .hb-card-actions {
    margin-left: auto;
  }
}

/* ===== 桌面自适应分页（一屏布局：右栏网格 flex:1 钉满，分页在网格下方）===== */
@media (min-width: 769px) {
  .hb-main {
    flex: 1;
    min-height: 0;
  }

  .hb-list {
    flex: 1;
    min-height: 0;
  }

  .hb-list-scroll {
    overflow-y: auto;
  }
}
</style>
