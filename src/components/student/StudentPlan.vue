<script setup lang="ts">
// 学生工作台学习计划面板（M3 批次1）
// 布局：工具条 + 统计卡 + 计划卡片列表 + 分页 + 编辑弹框（含目标进度条 + 复盘 Markdown）
// 数据：useStudentPlanStore（独立 IDB store 'student_plans'，严格隔离成人数据）
// 行高 138px（M3 估值，待 row-heights.json 实测后校准）

import { computed, onMounted, ref } from 'vue'
import { useStudentPlanStore } from '@/stores/studentPlan'
import { useToast } from '@/composables/useToast'
import { localToday } from '@/composables/todoCore'
import type { StudentPlan, StudentPlanType } from '@/types'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from '@/components/workbench/PanelPager.vue'
import Icon from '@/components/Icon.vue'

const store = useStudentPlanStore()
const toast = useToast()

const today = localToday()

// 类型筛选 tabs
const TYPE_TABS: { key: StudentPlanType | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'weekly', label: '周计划' },
  { key: 'monthly', label: '月计划' },
  { key: 'term', label: '学期计划' }
]
const activeTypeTab = ref<StudentPlanType | 'all'>('all')

// 视图数据（按类型筛选后由 store 排序保证）
const viewEntries = computed<StudentPlan[]>(() => store.filterByType(activeTypeTab.value))

// 自适应分页（行式单列，行高 213px，row-heights.json plan MAX 211 + 2）
const mainEl = ref<HTMLElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const paging = usePanelPaging({
  items: () => viewEntries.value,
  rowHeight: 152,
  containerRef: mainEl,
  gridRef: listEl
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev } = paging

// 统计卡数据（薄委托 core）
const stats = computed(() => store.stats())

// 错误 toast
const PLAN_ERROR_MESSAGES: Record<string, string> = {
  empty: '标题、日期、目标均不能为空',
  'invalid-range': '结束日期必须晚于开始日期',
  'not-found': '计划不存在',
  'invalid-progress': '进度必须是 0-100 的整数'
}
function planErrorToast(result: { ok: boolean; reason?: string }): void {
  if (result.ok) return
  toast.error(PLAN_ERROR_MESSAGES[result.reason ?? ''] ?? '操作失败')
}

// 新增/编辑弹框
const showEditDialog = ref(false)
const editingId = ref<string | null>(null)
const dialogType = ref<StudentPlanType>('weekly')
const dialogTitle = ref('')
const dialogStartDate = ref(today)
const dialogEndDate = ref(today)
const dialogGoalInputs = ref<string[]>([''])
const dialogReview = ref('')

// 默认结束日期：周计划=今日+7天，月计划=今日+30天，学期=今日+120天
function defaultEndDate(type: StudentPlanType): string {
  const base = new Date(`${today}T00:00:00`)
  const days = type === 'weekly' ? 7 : type === 'monthly' ? 30 : 120
  base.setDate(base.getDate() + days)
  return base.toISOString().slice(0, 10)
}

function openAddDialog(): void {
  editingId.value = null
  dialogType.value = 'weekly'
  dialogTitle.value = ''
  dialogStartDate.value = today
  dialogEndDate.value = defaultEndDate('weekly')
  dialogGoalInputs.value = ['']
  dialogReview.value = ''
  showEditDialog.value = true
}

function openEditDialog(id: string): void {
  const p = store.entries.find(x => x.id === id)
  if (!p) return
  editingId.value = p.id
  dialogType.value = p.type
  dialogTitle.value = p.title
  dialogStartDate.value = p.startDate
  dialogEndDate.value = p.endDate
  dialogGoalInputs.value = p.goals.length > 0 ? p.goals.map(g => g.content) : ['']
  dialogReview.value = p.review ?? ''
  showEditDialog.value = true
}

function closeEditDialog(): void {
  showEditDialog.value = false
  editingId.value = null
}

function addGoalInput(): void {
  dialogGoalInputs.value.push('')
}

function removeGoalInput(idx: number): void {
  if (dialogGoalInputs.value.length <= 1) return
  dialogGoalInputs.value.splice(idx, 1)
}

function onTypeChange(e: Event): void {
  const val = (e.target as HTMLSelectElement).value as StudentPlanType
  dialogType.value = val
  // 新增态下根据类型自动调整默认结束日期
  if (editingId.value === null) {
    dialogEndDate.value = defaultEndDate(val)
  }
}

async function saveEditDialog(): Promise<void> {
  const title = dialogTitle.value.trim()
  if (!title) {
    toast.error('标题不能为空')
    return
  }
  const goals = dialogGoalInputs.value
    .map(g => g.trim())
    .filter(content => content)
    .map(content => ({ content }))
  if (goals.length === 0) {
    toast.error('至少需要 1 个目标')
    return
  }
  if (dialogEndDate.value <= dialogStartDate.value) {
    toast.error('结束日期必须晚于开始日期')
    return
  }
  if (editingId.value !== null) {
    const result = await store.updatePlan(editingId.value, {
      type: dialogType.value,
      title,
      startDate: dialogStartDate.value,
      endDate: dialogEndDate.value,
      review: dialogReview.value
    })
    planErrorToast(result)
    if (!result.ok) return
  } else {
    const result = await store.addPlan({
      type: dialogType.value,
      title,
      startDate: dialogStartDate.value,
      endDate: dialogEndDate.value,
      goals
    })
    planErrorToast(result)
    if (!result.ok) return
  }
  toast.success(editingId.value !== null ? '计划已更新' : '计划已新增')
  closeEditDialog()
}

async function handleDelete(id: string): Promise<void> {
  if (!confirm('确定删除该计划？目标进度数据将一并删除。')) return
  await store.deletePlan(id)
  toast.success('计划已删除')
}

async function handleToggleGoal(planId: string, goalId: string): Promise<void> {
  const result = await store.toggleGoal(planId, goalId)
  planErrorToast(result)
}

async function handleProgressInput(planId: string, goalId: string, value: number): Promise<void> {
  const result = await store.updateProgress(planId, goalId, value)
  planErrorToast(result)
}

onMounted(() => {
  store.loadPlans()
})

// 类型徽标
function typeLabel(type: StudentPlanType): string {
  return type === 'weekly' ? '周' : type === 'monthly' ? '月' : '学期'
}

// 进度颜色（0-30 红 / 31-70 橙 / 71-99 蓝 / 100 绿）
function progressColor(progress: number): string {
  if (progress >= 100) return '#10b981'
  if (progress >= 71) return '#3b82f6'
  if (progress >= 31) return '#f59e0b'
  return '#ef4444'
}
</script>

<template>
  <div class="sp-shell">
    <div class="sp-toolbar">
      <h2 class="sp-title">学习计划</h2>
      <button class="btn-primary sp-add-btn" data-testid="sp-add-btn" @click="openAddDialog">
        <Icon name="plus" :size="16" /> 新增计划
      </button>
    </div>

    <div class="sp-tabs">
      <button
        v-for="tab in TYPE_TABS"
        :key="tab.key"
        class="sp-tab"
        :class="{ active: activeTypeTab === tab.key }"
        :data-testid="`sp-tab-${tab.key}`"
        @click="activeTypeTab = tab.key"
      >{{ tab.label }}</button>
      <span class="sp-count">{{ viewEntries.length }} 个</span>
    </div>

    <div class="sp-stats">
      <div class="sp-stat-card">
        <div class="sp-stat-label">总计划</div>
        <div class="sp-stat-value">{{ stats.total }}</div>
      </div>
      <div class="sp-stat-card">
        <div class="sp-stat-label">进行中</div>
        <div class="sp-stat-value">{{ stats.active }}</div>
      </div>
      <div class="sp-stat-card">
        <div class="sp-stat-label">已完成</div>
        <div class="sp-stat-value">{{ stats.completed }}</div>
      </div>
      <div class="sp-stat-card">
        <div class="sp-stat-label">平均完成度</div>
        <div class="sp-stat-value">{{ stats.avgProgress }}%</div>
      </div>
      <div class="sp-stat-card">
        <div class="sp-stat-label">本周新增</div>
        <div class="sp-stat-value">{{ stats.thisWeekCreated }}</div>
      </div>
    </div>

    <div ref="mainEl" class="sp-main">
      <div v-if="viewEntries.length === 0" class="empty-state" data-testid="sp-empty">
        <p>还没有学习计划，点上方「新增计划」开始吧</p>
      </div>

      <div v-else ref="listEl" class="sp-list" :class="{ 'sp-list-scroll': !fitsOnePage }">
        <div
          v-for="plan in pageItems"
          :key="plan.id"
          class="sp-card"
          :data-testid="`sp-card-${plan.id}`"
          @click="openEditDialog(plan.id)"
        >
          <div class="sp-card-head">
            <span class="sp-type-badge" :class="`sp-type-${plan.type}`">{{ typeLabel(plan.type) }}</span>
            <span class="sp-card-title" :title="plan.title">{{ plan.title }}</span>
            <span class="sp-card-date">{{ plan.startDate }} ~ {{ plan.endDate }}</span>
            <button
              class="sp-del-btn"
              :data-testid="`sp-del-${plan.id}`"
              title="删除"
              @click.stop="handleDelete(plan.id)"
            >
              <Icon name="close" :size="14" />
            </button>
          </div>
          <div class="sp-card-progress">
            <div class="sp-progress-label">总进度 {{ store.planProgress(plan) }}%</div>
            <div class="sp-progress-bar">
              <div
                class="sp-progress-fill"
                :style="{ width: `${store.planProgress(plan)}%`, backgroundColor: progressColor(store.planProgress(plan)) }"
              ></div>
            </div>
          </div>
          <div class="sp-goals" @click.stop>
            <div
              v-for="goal in plan.goals"
              :key="goal.id"
              class="sp-goal"
              :class="{ done: goal.done }"
            >
              <label class="sp-goal-check" :data-testid="`sp-goal-toggle-${goal.id}`">
                <input
                  type="checkbox"
                  :checked="goal.done"
                  @change="handleToggleGoal(plan.id, goal.id)"
                />
                <span class="sp-goal-content">{{ goal.content }}</span>
              </label>
              <div class="sp-goal-progress">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  :value="goal.progress"
                  :data-testid="`sp-goal-range-${goal.id}`"
                  @input="handleProgressInput(plan.id, goal.id, Number(($event.target as HTMLInputElement).value))"
                />
                <span class="sp-goal-percent">{{ goal.progress }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <PanelPager
      v-if="totalPages > 1"
      :page="currentPage"
      :total="totalPages"
      @prev="prev"
      @next="next"
    />

    <!-- 新增/编辑弹框 -->
    <div v-if="showEditDialog" class="sp-dialog-mask" @click.self="closeEditDialog">
      <div class="sp-dialog">
        <div class="sp-dialog-head">
          <h3>{{ editingId !== null ? '编辑计划' : '新增计划' }}</h3>
          <button class="sp-dialog-close" @click="closeEditDialog"><Icon name="close" /></button>
        </div>
        <div class="sp-dialog-body">
          <div class="sp-field">
            <label>类型</label>
            <select :value="dialogType" @change="onTypeChange">
              <option value="weekly">周计划</option>
              <option value="monthly">月计划</option>
              <option value="term">学期计划</option>
            </select>
          </div>
          <div class="sp-field">
            <label>标题</label>
            <input
              type="text"
              v-model="dialogTitle"
              maxlength="50"
              placeholder="例：本周语文复习计划"
              data-testid="sp-form-title"
            />
          </div>
          <div class="sp-field-row">
            <div class="sp-field">
              <label>开始日期</label>
              <input type="date" v-model="dialogStartDate" data-testid="sp-form-start" />
            </div>
            <div class="sp-field">
              <label>结束日期</label>
              <input type="date" v-model="dialogEndDate" data-testid="sp-form-end" />
            </div>
          </div>
          <div class="sp-field">
            <label>学习目标</label>
            <div class="sp-goals-edit">
              <div
                v-for="(_, idx) in dialogGoalInputs"
                :key="idx"
                class="sp-goal-edit-row"
              >
                <input
                  type="text"
                  v-model="dialogGoalInputs[idx]"
                  maxlength="100"
                  :placeholder="`目标 ${idx + 1}`"
                />
                <button
                  v-if="dialogGoalInputs.length > 1"
                  class="sp-goal-remove"
                  @click="removeGoalInput(idx)"
                  title="移除"
                ><Icon name="close" :size="14" /></button>
              </div>
              <button class="sp-goal-add" @click="addGoalInput" data-testid="sp-form-add-goal">
                + 添加目标
              </button>
            </div>
          </div>
          <div class="sp-field">
            <label>复盘（可选）</label>
            <textarea
              v-model="dialogReview"
              maxlength="5000"
              rows="3"
              placeholder="Markdown 复盘笔记…"
              data-testid="sp-form-review"
            ></textarea>
          </div>
        </div>
        <div class="sp-dialog-foot">
          <button class="btn-secondary" @click="closeEditDialog">取消</button>
          <button class="btn-primary" @click="saveEditDialog" data-testid="sp-form-save">
            {{ editingId !== null ? '保存' : '新增' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sp-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;
}

.sp-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.sp-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.sp-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
}

.sp-tabs {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 0 4px;
}

.sp-tab {
  padding: 4px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 16px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 13px;
}
.sp-tab.active {
  background: var(--color-primary, #3b82f6);
  color: #fff;
  border-color: var(--color-primary, #3b82f6);
}

.sp-count {
  margin-left: auto;
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
}

.sp-stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  padding: 0 4px;
}

.sp-stat-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 8px 10px;
  text-align: center;
}

.sp-stat-label {
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
}

.sp-stat-value {
  font-size: 18px;
  font-weight: 600;
  margin-top: 2px;
}

.sp-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sp-list {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  overflow-y: auto;
}
.sp-list-scroll {
  overflow-y: auto;
}

.sp-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 150px;
  min-height: 150px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.sp-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.sp-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sp-type-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  color: #fff;
  flex-shrink: 0;
}
.sp-type-weekly { background: #3b82f6; }
.sp-type-monthly { background: #a855f7; }
.sp-type-term { background: #10b981; }

.sp-card-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sp-card-date {
  font-size: 11px;
  color: var(--color-text-secondary, #6b7280);
  line-height: 1.2;
}

.sp-del-btn {
  border: none;
  background: transparent;
  color: var(--color-text-secondary, #6b7280);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}
.sp-del-btn:hover {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.sp-card-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sp-progress-label {
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
  white-space: nowrap;
}

.sp-progress-bar {
  flex: 1;
  height: 6px;
  background: var(--color-hover, #f3f4f6);
  border-radius: 4px;
  overflow: hidden;
}

.sp-progress-fill {
  height: 100%;
  transition: width 0.3s, background-color 0.3s;
}

.sp-goals {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sp-goal {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 4px;
  background: var(--color-hover, #f3f4f6);
}
.sp-goal.done {
  background: rgba(16, 185, 129, 0.08);
}

.sp-goal-check {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.sp-goal-check input {
  flex-shrink: 0;
}

.sp-goal-content {
  flex: 1;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sp-goal-progress {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.sp-goal-progress input[type='range'] {
  width: 100px;
}

.sp-goal-percent {
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
  width: 36px;
  text-align: right;
}

.sp-dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.sp-dialog {
  background: var(--color-surface, #fff);
  border-radius: 8px;
  width: 480px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.sp-dialog-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.sp-dialog-close {
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
  padding: 4px;
}

.sp-dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sp-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sp-field label {
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
}

.sp-field input,
.sp-field select,
.sp-field textarea {
  padding: 6px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 4px;
  background: var(--color-surface, #fff);
  color: inherit;
  font-size: 13px;
  font-family: inherit;
}

.sp-field-row {
  display: flex;
  gap: 12px;
}
.sp-field-row .sp-field {
  flex: 1;
}

.sp-goals-edit {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sp-goal-edit-row {
  display: flex;
  gap: 6px;
}

.sp-goal-edit-row input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 4px;
  background: var(--color-surface, #fff);
  color: inherit;
  font-size: 13px;
}

.sp-goal-remove {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--color-text-secondary, #6b7280);
  padding: 4px 8px;
}

.sp-goal-add {
  align-self: flex-start;
  padding: 4px 10px;
  border: 1px dashed var(--color-border, #e5e7eb);
  border-radius: 4px;
  background: transparent;
  color: var(--color-primary, #3b82f6);
  cursor: pointer;
  font-size: 12px;
}

.sp-dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border, #e5e7eb);
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
}
</style>
