<script setup lang="ts">
// 学生工作台习惯打卡面板（M2）
// 复刻成人 WorkbenchHabits 布局，差异：
// 1. 使用 useStudentHabitsStore（独立 IDB store 'student_habits'，严格隔离成人数据）
// 2. 增加分类筛选 tabs（全部/生活/学习/运动 + 自定义分类入口）
// 3. 学段默认习惯播种：首次加载时若 stageHabitsSeeded !== stage 触发
// 4. 弹框增加 category 字段
// 5. 行高 82px（与成人一致，PRD 4.2.3：行高 82px+2，maxRows=4，20 卡/页）

import { computed, onMounted, ref, watch } from 'vue'
import { useStudentHabitsStore } from '@/stores/studentHabits'
import { useStudentSettingsStore } from '@/stores/studentSettings'
import { useToast } from '@/composables/useToast'
import { localToday } from '@/composables/todoCore'
import { DEFAULT_HABIT_COLOR } from '@/composables/habitCore'
import {
  categoryLabel,
  filterHabitsByCategory,
  isBuiltinCategory,
  shouldSeedStageHabits
} from '@/composables/studentHabitsCore'
import type { HabitFrequency } from '@/composables/habitCore'
import type { StudentHabitCategory } from '@/types'
import { STUDENT_HABIT_BUILTIN_CATEGORIES } from '@/types'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from '@/components/workbench/PanelPager.vue'
import Icon from '@/components/Icon.vue'

const store = useStudentHabitsStore()
const settingsStore = useStudentSettingsStore()
const toast = useToast()

const today = localToday()

/** 今日是否已打卡。 */
function isChecked(habitId: string): boolean {
  return store.records.some(r => r.habitId === habitId && r.date === today)
}

// 分类筛选：'all' 全部 / 内置 3 类 / 'uncategorized' 未分类 / 自定义
const activeCategory = ref<string>('all')

/** 可见分类 tabs：全部 + 内置 3 类 + 用户自定义分类（去重保序） */
const categoryTabs = computed(() => {
  const tabs: { key: string; label: string }[] = [{ key: 'all', label: '全部' }]
  for (const c of STUDENT_HABIT_BUILTIN_CATEGORIES) {
    tabs.push({ key: c, label: categoryLabel(c) })
  }
  const custom = new Set<string>()
  for (const h of store.habits) {
    if (h.category && !isBuiltinCategory(h.category)) {
      custom.add(h.category)
    }
  }
  for (const c of custom) {
    tabs.push({ key: c, label: categoryLabel(c) })
  }
  tabs.push({ key: 'uncategorized', label: '未分类' })
  return tabs
})

/** 筛选后的习惯列表 */
const filteredHabits = computed(() => filterHabitsByCategory(store.habits, activeCategory.value))

/** 卡片视图数据：未打卡置顶，已打卡沉底；同状态内保持录入顺序 */
const viewHabits = computed(() =>
  filteredHabits.value
    .map((h, i) => ({ h, i, checked: isChecked(h.id) }))
    .sort((a, b) => (a.checked === b.checked ? a.i - b.i : a.checked ? 1 : -1))
    .map(({ h }) => ({
      habit: h,
      checked: isChecked(h.id),
      streak: store.streakOfHabit(h.id, h.frequency, today),
      week: store.weeklyAttainmentOfHabit(h.id, h.frequency, today)
    }))
)

// 自适应分页（rowHeight 84 = row-heights.json habits MAX 82 + 2px）
const mainEl = ref<HTMLElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const paging = usePanelPaging({
  items: () => viewHabits.value,
  rowHeight: 84,
  maxRows: 4,
  containerRef: mainEl,
  gridRef: listEl
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev, goto } = paging

watch(activeCategory, () => goto(1))

const FREQUENCY_OPTIONS: { value: HabitFrequency; label: string }[] = [
  { value: 7, label: '每天' },
  { value: 5, label: '每周 5 次' },
  { value: 3, label: '每周 3 次' },
  { value: 1, label: '每周 1 次' }
]

const HABIT_ERROR_MESSAGES: Record<string, string> = {
  empty: '习惯名称不能为空',
  duplicate: '该分类下已存在同名习惯',
  'not-found': '习惯不存在',
  'in-use': '该分类下有习惯，无法删除'
}

function habitErrorToast(result: { ok: boolean; reason?: string }): void {
  if (result.ok) return
  toast.error(HABIT_ERROR_MESSAGES[result.reason ?? ''] ?? '操作失败')
}

const showEditDialog = ref(false)
const editingId = ref<string | null>(null)
const dialogName = ref('')
const dialogCategory = ref<StudentHabitCategory>('life')
const dialogFrequency = ref<HabitFrequency>(7)
const dialogColor = ref(DEFAULT_HABIT_COLOR)

function openAddDialog(): void {
  editingId.value = null
  dialogName.value = ''
  dialogCategory.value = activeCategory.value !== 'all' && activeCategory.value !== 'uncategorized'
    ? activeCategory.value
    : 'life'
  dialogFrequency.value = 7
  dialogColor.value = DEFAULT_HABIT_COLOR
  showEditDialog.value = true
}

function openEditDialog(id: string): void {
  const h = store.habits.find(x => x.id === id)
  if (!h) return
  editingId.value = h.id
  dialogName.value = h.name
  dialogCategory.value = h.category || 'life'
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
  if (!name) {
    toast.error('习惯名称不能为空')
    return
  }
  if (editingId.value !== null) {
    const result = await store.updateHabit(editingId.value, {
      name,
      category: dialogCategory.value,
      frequency: dialogFrequency.value,
      color: dialogColor.value
    })
    if (result.ok) closeEditDialog()
    habitErrorToast(result)
    return
  }
  const result = await store.addHabit(name, dialogCategory.value, dialogFrequency.value, dialogColor.value)
  if (result.ok) {
    closeEditDialog()
    goto(1)
  }
  habitErrorToast(result)
}

async function handleDelete(id: string): Promise<void> {
  const h = store.habits.find(x => x.id === id)
  if (!h) return
  if (!confirm(`确定要删除习惯「${h.name}」吗？删除后打卡记录一并清除。`)) return
  const result = await store.deleteHabit(id)
  if (result.ok) {
    if (editingId.value === id) closeEditDialog()
    goto(1)
  }
  habitErrorToast(result)
}

async function handleCheck(habitId: string): Promise<void> {
  const result = await store.toggleCheckIn(habitId, today)
  if (!result.ok) habitErrorToast(result)
}

const stageSeeding = ref(false)

async function seedStageDefaultsIfNeeded(): Promise<void> {
  const stage = settingsStore.stage
  if (!shouldSeedStageHabits(settingsStore.settings.stageSeeded, stage)) return
  stageSeeding.value = true
  try {
    await store.seedStageHabits(stage)
    await settingsStore.markStageSeeded(stage)
  } catch (e) {
    console.error('[studentHabits] seedStageDefaults failed', e)
  } finally {
    stageSeeding.value = false
  }
}

onMounted(async () => {
  await store.loadHabits()
  await seedStageDefaultsIfNeeded()
})
</script>

<template>
  <div class="st-habits">
    <div class="sh-toolbar">
      <h2 class="sh-title">习惯打卡</h2>
      <button class="btn-primary sh-add-btn" data-testid="sh-add-btn" @click="openAddDialog">
        <Icon name="plus" :size="16" /> 新增习惯
      </button>
    </div>

    <div class="sh-cat-tabs">
      <button
        v-for="tab in categoryTabs"
        :key="tab.key"
        class="sh-cat-tab"
        :class="{ active: activeCategory === tab.key }"
        :data-testid="`sh-cat-${tab.key}`"
        @click="activeCategory = tab.key"
      >{{ tab.label }}</button>
    </div>

    <div ref="mainEl" class="sh-main">
      <div v-if="store.habits.length === 0" class="empty-state" data-testid="sh-empty">
        <p>还没有习惯{{ stageSeeding ? '，正在为你准备学段默认习惯...' : '，点上方「新增习惯」开始吧' }}</p>
      </div>

      <div v-else ref="listEl" class="sh-list" :class="{ 'sh-list-scroll': !fitsOnePage }">
        <TransitionGroup name="grid">
          <div
            v-for="v in pageItems"
            :key="v.habit.id"
            class="sh-card"
            :class="{ 'is-checked': v.checked }"
            :data-testid="`sh-card-${v.habit.id}`"
            :style="{ '--sh-color': v.habit.color ?? DEFAULT_HABIT_COLOR }"
            @click="openEditDialog(v.habit.id)"
          >
            <span class="sh-card-bar"></span>
            <div class="sh-card-top">
              <Icon name="habits" :size="20" class="sh-card-icon" />
              <div class="sh-card-main">
                <div class="sh-card-name">{{ v.habit.name }}</div>
                <div class="sh-card-badges">
                  <span class="sh-badge sh-badge-cat" v-if="v.habit.category">
                    {{ categoryLabel(v.habit.category) }}
                  </span>
                  <span class="sh-badge sh-badge-streak" :data-testid="`sh-streak-${v.habit.id}`">
                    <Icon name="trending-up" :size="13" /> 连续 {{ v.streak.count }} {{ v.streak.unit }}
                  </span>
                  <span class="sh-badge sh-badge-week" :data-testid="`sh-week-${v.habit.id}`">
                    本周 {{ v.week.completed }}/{{ v.week.target }}
                  </span>
                </div>
                <div class="sh-week-bar" :title="`本周 ${v.week.completed}/${v.week.target}`">
                  <div
                    class="sh-week-fill"
                    :style="{
                      width: Math.min(100, Math.round(v.week.percent * 100)) + '%',
                      background: v.habit.color ?? DEFAULT_HABIT_COLOR
                    }"
                  ></div>
                </div>
              </div>
              <button
                class="sh-check-btn"
                :class="{ 'is-checked': v.checked }"
                :style="{ '--sh-color': v.habit.color ?? DEFAULT_HABIT_COLOR }"
                :data-testid="`sh-check-${v.habit.id}`"
                :aria-label="v.checked ? '取消今日打卡' : '今日打卡'"
                @click.stop="handleCheck(v.habit.id)"
              >
                <Icon name="check" :size="16" />
                <span>{{ v.checked ? '已打卡' : '打卡' }}</span>
              </button>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </div>

    <PanelPager
      v-if="totalPages > 1"
      :page="currentPage"
      :total="totalPages"
      @prev="prev"
      @next="next"
    />

    <Teleport to="body">
      <div v-if="showEditDialog" class="dialog-overlay" @click.self="closeEditDialog">
        <div class="dialog st-dialog">
          <div class="dialog-header">
            <h3>{{ editingId ? '编辑习惯' : '新增习惯' }}</h3>
            <button class="dialog-close" @click="closeEditDialog"><Icon name="close" :size="18" /></button>
          </div>
          <div class="dialog-body">
            <div class="form-field">
              <label>习惯名称</label>
              <input
                v-model="dialogName"
                type="text"
                class="form-input"
                placeholder="如：刷牙、写作业"
                maxlength="15"
                data-testid="sh-form-name"
                @keyup.enter="saveEditDialog"
              />
            </div>
            <div class="form-field">
              <label>分类</label>
              <select v-model="dialogCategory" class="form-input" data-testid="sh-form-category">
                <option v-for="c in STUDENT_HABIT_BUILTIN_CATEGORIES" :key="c" :value="c">{{ categoryLabel(c) }}</option>
                <option value="">未分类</option>
              </select>
            </div>
            <div class="form-field">
              <label>打卡频率</label>
              <select v-model="dialogFrequency" class="form-input" data-testid="sh-form-frequency">
                <option v-for="f in FREQUENCY_OPTIONS" :key="f.value" :value="f.value">{{ f.label }}</option>
              </select>
            </div>
            <div class="form-field">
              <label>颜色</label>
              <input v-model="dialogColor" type="color" class="form-color" data-testid="sh-form-color" />
            </div>
          </div>
          <div class="dialog-footer">
            <button v-if="editingId" class="btn-danger" data-testid="sh-form-delete" @click="handleDelete(editingId)">
              删除
            </button>
            <div class="dialog-footer-right">
              <button class="btn-ghost" @click="closeEditDialog">取消</button>
              <button class="btn-primary" data-testid="sh-form-save" @click="saveEditDialog">保存</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.st-habits {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;
  padding: 16px;
}

.sh-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sh-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.sh-cat-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.sh-cat-tab {
  padding: 6px 14px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 16px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}
.sh-cat-tab:hover {
  background: var(--color-hover, #f3f4f6);
}
.sh-cat-tab.active {
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}

.sh-main {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.sh-list {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
}
.sh-list-scroll {
  overflow-y: auto;
}

.sh-card {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 82px;
  padding: 10px 12px 10px 14px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.sh-card:hover {
  border-color: var(--sh-color, #3b82f6);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.sh-card.is-checked {
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.06));
}
.sh-card-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--sh-color, #3b82f6);
}

.sh-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
}
.sh-card-icon {
  color: var(--sh-color, #3b82f6);
  flex-shrink: 0;
}
.sh-card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sh-card-name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sh-card-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.sh-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: var(--color-text-muted, #6b7280);
}
.sh-badge-cat {
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--color-hover, #f3f4f6);
}
.sh-check-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  border: 1px solid var(--sh-color, #3b82f6);
  border-radius: 6px;
  background: transparent;
  color: var(--sh-color, #3b82f6);
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
  flex-shrink: 0;
}
.sh-check-btn:hover {
  background: var(--sh-color, #3b82f6);
  color: #fff;
}
.sh-check-btn.is-checked {
  background: var(--color-hover, #f3f4f6);
  border-color: var(--color-border, #e5e7eb);
  color: var(--color-text-muted, #9ca3af);
  cursor: default;
}

.sh-week-bar {
  height: 3px;
  background: var(--color-hover, #f3f4f6);
  border-radius: 2px;
  overflow: hidden;
}
.sh-week-fill {
  height: 100%;
  transition: width 0.3s;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
  color: var(--color-text-muted, #6b7280);
  font-size: 14px;
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.st-dialog {
  width: 480px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--color-surface, #fff);
  border-radius: 12px;
  overflow: hidden;
}
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.dialog-header h3 {
  margin: 0;
  font-size: 16px;
}
.dialog-close {
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
  padding: 4px;
}
.dialog-body {
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-field label {
  font-size: 13px;
  font-weight: 500;
}
.form-input {
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: var(--color-surface, #fff);
  color: inherit;
  font-size: 14px;
}
.form-color {
  width: 60px;
  height: 36px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  padding: 2px;
  cursor: pointer;
}
.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border, #e5e7eb);
}
.dialog-footer-right {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-radius: 6px;
  background: var(--color-primary, #3b82f6);
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}
.btn-primary:hover {
  filter: brightness(0.95);
}
.btn-ghost {
  padding: 8px 14px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 13px;
}
.btn-danger {
  padding: 8px 14px;
  border: none;
  border-radius: 6px;
  background: #ef4444;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}

.grid-enter-active, .grid-leave-active {
  transition: all 0.3s ease;
}
.grid-enter-from, .grid-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

@media (max-width: 768px) {
  .sh-list {
    grid-template-columns: 1fr;
  }
  .st-habits {
    padding: 12px;
  }
}
</style>
