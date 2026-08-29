<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useWorkbenchHabitsStore } from '@/stores/workbenchHabits'
import { useToast } from '@/composables/useToast'
import { localToday } from '@/composables/todoCore'
import { DEFAULT_HABIT_COLOR } from '@/composables/habitCore'
import type { Habit, HabitFrequency } from '@/composables/habitCore'
import { TODO_COLOR_PRESETS } from '@/types'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from './PanelPager.vue'
import Icon from '@/components/Icon.vue'

const store = useWorkbenchHabitsStore()
const toast = useToast()

// 今天 = 本地日期 YYYY-MM-DD（localToday 防 UTC 偏移）；打卡/连击/周统计均以此为锚
const today = localToday()

/** 今日是否已打卡（records 同日记录存在性判断，非公式）。 */
function isChecked(habitId: string): boolean {
  return store.records.some(r => r.habitId === habitId && r.date === today)
}

// 卡片视图数据：连续天数/周达成率一律走 store 薄委托（streakOf/weeklyAttainmentOf → habitCore）
// 展示排序：未打卡置顶（「今天要处理」一眼可见），已打卡沉底；同状态内保持录入顺序稳定。
// 仅依赖 records/today 的响应式派生，打卡后由 <TransitionGroup> 平滑滑动到新位置，不突兀跳变。
const viewHabits = computed(() =>
  store.habits
    .map((h, i) => ({ h, i, checked: isChecked(h.id) }))
    .sort((a, b) => (a.checked === b.checked ? a.i - b.i : a.checked ? 1 : -1))
    .map(({ h }) => ({
      habit: h,
      checked: isChecked(h.id),
      streak: store.streakOf(h.id, h.frequency, today),
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

// ===== 新增/编辑弹框（顶部「新增习惯」按钮与卡片「编辑」共用同一弹框）=====
const showEditDialog = ref(false)
const editingId = ref<string | null>(null)
const dialogName = ref('')
const dialogFrequency = ref<HabitFrequency>(7)
const dialogColor = ref(DEFAULT_HABIT_COLOR)

function openAddDialog(): void {
  editingId.value = null
  dialogName.value = ''
  dialogFrequency.value = 7
  dialogColor.value = DEFAULT_HABIT_COLOR
  showEditDialog.value = true
}

function openEditDialog(id: string): void {
  const h = store.habits.find(x => x.id === id)
  if (!h) return
  editingId.value = h.id
  dialogName.value = h.name
  dialogFrequency.value = h.frequency
  dialogColor.value = h.color ?? DEFAULT_HABIT_COLOR
  showEditDialog.value = true
}

function closeEditDialog(): void {
  showEditDialog.value = false
  editingId.value = null
}

async function saveEditDialog(): Promise<void> {
  const name = dialogName.value.trim()
  if (!name) return
  if (editingId.value !== null) {
    const result = await store.updateHabit(editingId.value, {
      name,
      frequency: dialogFrequency.value,
      color: dialogColor.value
    })
    if (result.ok) closeEditDialog()
    habitErrorToast(result)
    return
  }
  const result = await store.addHabit(name, dialogFrequency.value, dialogColor.value)
  if (result.ok) {
    closeEditDialog()
    goto(1)
  }
  habitErrorToast(result)
}

// ===== 打开：记录详情弹框 =====
const showRecords = ref(false)
const recordsHabit = ref<Habit | null>(null)

const recordsStreak = computed(() =>
  recordsHabit.value
    ? store.streakOf(recordsHabit.value.id, recordsHabit.value.frequency, today)
    : { count: 0, unit: '' }
)
const recordsWeek = computed(() =>
  recordsHabit.value
    ? store.weeklyAttainmentOf(recordsHabit.value.id, recordsHabit.value.frequency, today)
    : { completed: 0, target: 0 }
)
const recordsDates = computed<string[]>(() =>
  recordsHabit.value
    ? store.records
        .filter(r => r.habitId === recordsHabit.value!.id)
        .map(r => r.date)
        .sort()
        .reverse()
    : []
)

function openRecords(id: string): void {
  const h = store.habits.find(x => x.id === id)
  if (!h) return
  recordsHabit.value = h
  showRecords.value = true
}

function closeRecords(): void {
  showRecords.value = false
  recordsHabit.value = null
}

// 从记录弹框直接切入编辑弹框（先关记录，再开编辑，避免双层遮罩叠加）
function editFromRecords(): void {
  if (!recordsHabit.value) return
  const id = recordsHabit.value.id
  closeRecords()
  openEditDialog(id)
}

async function handleDelete(id: string): Promise<void> {
  const h = store.habits.find(x => x.id === id)
  if (!confirm(`确定要删除习惯「${h?.name ?? ''}」吗？删除后打卡记录一并清除。`)) return
  const result = await store.deleteHabit(id)
  if (result.ok) {
    if (editingId.value === id) closeEditDialog()
    if (recordsHabit.value?.id === id) closeRecords()
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
    <!-- 顶部工具栏：左上角新增习惯按钮 -->
    <div class="hb-toolbar">
      <button class="btn-primary hb-add-btn" data-testid="hb-add-btn" @click="openAddDialog">
        <Icon name="plus" :size="16" /> 新增习惯
      </button>
    </div>

    <!-- 习惯卡片网格（多条并排展示，分页在网格下方） -->
    <div class="hb-main">
      <div v-if="store.habits.length === 0" class="empty-state" data-testid="hb-empty">
        还没有习惯，点上方「新增习惯」开始吧
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
          <div class="hb-card-top">
            <Icon name="habits" :size="20" class="hb-card-icon" />
            <div class="hb-card-main">
              <div class="hb-card-name">{{ v.habit.name }}</div>
              <div class="hb-card-badges">
                <span class="hb-badge hb-badge-streak" :data-testid="`hb-streak-${v.habit.id}`">
                  <Icon name="trending-up" :size="13" class="hb-badge-ico" /> 连续 {{ v.streak.count }} {{ v.streak.unit }}
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
          </div>
          <!-- 卡片左下角：打开 / 编辑 / 删除 -->
          <div class="hb-card-footer">
            <button class="btn-text" :data-testid="`hb-open-${v.habit.id}`" @click="openRecords(v.habit.id)">
              <Icon name="eye" :size="14" /> 打开
            </button>
            <button class="btn-text" :data-testid="`hb-edit-${v.habit.id}`" @click="openEditDialog(v.habit.id)">
              <Icon name="pencil" :size="14" /> 编辑
            </button>
            <button class="btn-text btn-text-danger" :data-testid="`hb-delete-${v.habit.id}`" @click="handleDelete(v.habit.id)">
              <Icon name="trash" :size="14" /> 删除
            </button>
          </div>
        </div>
        </TransitionGroup>
      </div>

      <PanelPager :page="currentPage" :total="totalPages" @prev="prev()" @next="next()" />
    </div>

    <!-- 新增/编辑弹框（顶部按钮与卡片编辑共用） -->
    <div v-if="showEditDialog" class="dialog-overlay hb-dialog-overlay" @click.self="closeEditDialog">
      <div class="dialog hb-dialog" role="dialog" aria-modal="true" :aria-label="editingId ? '编辑习惯' : '新增习惯'">
        <div class="dialog-header">
          <span class="dialog-title">{{ editingId ? '编辑习惯' : '新增习惯' }}</span>
          <button class="dialog-close" type="button" aria-label="关闭" @click="closeEditDialog">
            <Icon name="close" :size="18" />
          </button>
        </div>
        <div class="dialog-body">
          <div class="field">
            <label class="field-label">名称 *</label>
            <input
              v-model="dialogName"
              type="text"
              class="form-input"
              placeholder="例如：每天喝水 8 杯"
              maxlength="30"
              data-testid="hb-dialog-name"
            />
          </div>
          <div class="field">
            <label class="field-label">频率</label>
            <select v-model="dialogFrequency" class="form-input" data-testid="hb-dialog-frequency">
              <option v-for="opt in FREQUENCY_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label">颜色</label>
            <div class="hb-color-picker" data-testid="hb-dialog-color">
              <button
                v-for="(color, i) in TODO_COLOR_PRESETS"
                :key="color"
                type="button"
                class="hb-color-option"
                :class="{ active: dialogColor.toLowerCase() === color }"
                :style="{ '--hb-swatch': color }"
                :data-testid="'hb-dialog-color-' + (i + 1)"
                :title="color"
                @click="dialogColor = color"
              ></button>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" type="button" data-testid="hb-dialog-cancel" @click="closeEditDialog">取消</button>
          <button class="btn-primary" type="button" :disabled="!dialogName.trim()" data-testid="hb-dialog-save" @click="saveEditDialog">
            {{ editingId ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 打开：记录详情弹框 -->
    <div v-if="showRecords" class="dialog-overlay hb-dialog-overlay" @click.self="closeRecords">
      <div class="dialog hb-dialog" role="dialog" aria-modal="true" aria-label="习惯记录">
        <div class="dialog-header">
          <span class="dialog-title">
            <Icon name="habits" :size="16" class="hb-dlg-ico" /> {{ recordsHabit?.name }}
          </span>
          <button class="dialog-close" type="button" aria-label="关闭" @click="closeRecords">
            <Icon name="close" :size="18" />
          </button>
        </div>
        <div class="dialog-body" v-if="recordsHabit">
          <div class="hb-rec-summary">
            <div class="hb-rec-item">
              <span class="hb-rec-value">{{ recordsStreak.count }} {{ recordsStreak.unit }}</span>
              <span class="hb-rec-label">连续</span>
            </div>
            <div class="hb-rec-item">
              <span class="hb-rec-value">{{ recordsWeek.completed }}/{{ recordsWeek.target }}</span>
              <span class="hb-rec-label">本周打卡</span>
            </div>
            <div class="hb-rec-item">
              <span class="hb-rec-value">{{ recordsDates.length }}</span>
              <span class="hb-rec-label">累计打卡</span>
            </div>
          </div>
          <div class="hb-rec-list">
            <div v-for="d in recordsDates" :key="d" class="hb-rec-row">
              <Icon name="check" :size="14" class="hb-rec-ico" />
              <span>{{ d }}</span>
            </div>
            <div v-if="recordsDates.length === 0" class="hb-rec-empty">还没有打卡记录</div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" type="button" @click="closeRecords">关闭</button>
          <button class="btn-primary" type="button" data-testid="hb-rec-edit" @click="editFromRecords">编辑</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 面板容器：顶部工具栏 + 下方卡片网格（单栏纵向堆叠） */
.wb-habits {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hb-toolbar {
  display: flex;
  align-items: center;
}

.hb-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.hb-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

/* ===== 表单/弹框通用字段 ===== */
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

/* ===== 通用按钮 ===== */
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

/* 卡片左下角文本按钮（打开/编辑/删除） */
.btn-text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  font-size: 12px;
  border-radius: var(--radius-sm, 6px);
  background: transparent;
  border: 1px solid var(--color-border, var(--color-border));
  color: var(--color-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-text:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.btn-text-danger:hover {
  color: var(--color-error, var(--color-error));
  border-color: var(--color-error, var(--color-error));
}

/* ===== 习惯卡片网格（多列并排） ===== */
.hb-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 10px;
  align-content: start;
}

.hb-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 12px;
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

/* 卡片上半部：图标 + 主信息 + 打卡按钮 */
.hb-card-top {
  display: flex;
  align-items: center;
  gap: 12px;
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

.hb-badge-ico {
  flex-shrink: 0;
}

/* 卡片左下角：打开 / 编辑 / 删除 */
.hb-card-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
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

/* ===== 弹框（新增/编辑 + 记录详情，共用 hb-dialog-overlay）===== */
.hb-dialog-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 320; /* 高于卡片与其它面板内弹框(310)，低于全局弹框(1000+) */
  padding: 20px;
}

.hb-dialog {
  background-color: var(--color-bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg, 12px);
  width: 100%;
  max-width: 440px;
  max-height: 85vh;
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

.dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.dialog-close {
  background: none;
  border: none;
  color: var(--color-text-muted, var(--color-text-muted));
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm, 6px);
  display: inline-flex;
  transition: color var(--transition-fast, 0.15s ease);
}

.dialog-close:hover {
  color: var(--color-text, var(--color-text));
}

.dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border, var(--color-border));
}

/* 记录详情弹框 */
.hb-dlg-ico {
  color: var(--color-primary, var(--color-primary));
}

.hb-rec-summary {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.hb-rec-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 14px;
  background: var(--color-bg-hover, var(--color-bg-card));
  border-radius: var(--radius-md, 8px);
  min-width: 90px;
}

.hb-rec-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.hb-rec-label {
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.hb-rec-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 40vh;
  overflow-y: auto;
  margin-top: 4px;
}

.hb-rec-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.hb-rec-ico {
  color: var(--color-primary, var(--color-primary));
  flex-shrink: 0;
}

.hb-rec-empty {
  font-size: 13px;
  color: var(--color-text-muted, var(--color-text-muted));
  padding: 8px 0;
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

/* ===== 暗色模式覆盖 ===== */
:root.dark .hb-card {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
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
:root.dark .btn-text {
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

:root.dark .hb-dialog {
  background-color: var(--color-bg-card, #1f2937);
}

:root.dark .dialog-header,
:root.dark .dialog-title {
  color: var(--color-text, #f9fafb);
}

:root.dark .hb-rec-item {
  background-color: var(--color-bg-input, #374151);
}

:root.dark .hb-rec-value {
  color: var(--color-primary, #60a5fa);
}

/* ===== 桌面自适应分页（一屏布局：网格 flex:1 钉满，分页在网格下方）===== */
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

@media (max-width: 640px) {
  .hb-card-top {
    flex-wrap: wrap;
  }

  .hb-check-btn {
    margin-left: auto;
  }
}
</style>
