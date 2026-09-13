<script setup lang="ts">
// 学生工作台学习计划面板（M3 批次1）
// 布局：工具条 + 统计卡 + 类型筛选 + el-table（含 expand 行展示目标管理）+ el-pagination + 编辑弹框
// 数据：useStudentPlanStore（独立 IDB store 'student_plans'，严格隔离成人数据）

import { computed, onMounted, ref, watch } from 'vue'
import { useStudentPlanStore } from '@/stores/studentPlan'
import { useToast } from '@/composables/useToast'
import { localToday } from '@/composables/todoCore'
import type { StudentPlan, StudentPlanType } from '@/types'
import Icon from '@/components/Icon.vue'
import StudentToolbar from '@/components/student/StudentToolbar.vue'

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

// ===== 分页：Element Plus el-pagination，固定 10 条/页 =====
const LIST_PAGE_SIZE = 10
const listPage = ref(1)
const listPageItems = computed<StudentPlan[]>(() => {
  const start = (listPage.value - 1) * LIST_PAGE_SIZE
  return viewEntries.value.slice(start, start + LIST_PAGE_SIZE)
})

watch(activeTypeTab, () => goto(1))
function goto(page: number): void {
  listPage.value = page
}

// 统计卡数据（薄委托 core）
const stats = computed(() => store.stats())

// 类型徽标
const TYPE_BADGE_CLASS: Record<StudentPlanType, string> = {
  weekly: 'sp-type-weekly',
  monthly: 'sp-type-monthly',
  term: 'sp-type-term'
}
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
  listPage.value = 1
}

async function handleDelete(id: string): Promise<void> {
  if (!confirm('确定删除该计划？目标进度数据将一并删除。')) return
  await store.deletePlan(id)
  toast.success('计划已删除')
  listPage.value = 1
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
</script>

<template>
  <div class="sp-shell">
    <StudentToolbar title="学习计划">
      <div class="sp-count">共 {{ viewEntries.length }} 个</div>
      <el-button type="primary" size="small" class="sp-add-btn" data-testid="sp-add-btn" @click="openAddDialog">
        ＋ 新增计划
      </el-button>
    </StudentToolbar>

    <el-radio-group v-model="activeTypeTab" class="sp-tabs" size="small">
      <el-radio-button
        v-for="tab in TYPE_TABS"
        :key="tab.key"
        :value="tab.key"
        :data-testid="`sp-tab-${tab.key}`"
      >{{ tab.label }}</el-radio-button>
    </el-radio-group>

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

    <div class="sp-main">
      <!-- 表格区（Element Plus Table，含 expand 行管理目标） -->
      <div class="sp-list">
        <el-table
          :data="listPageItems"
          stripe
          border
          size="default"
          style="width: 100%"
          height="100%"
          empty-text="还没有学习计划，点上方「新增计划」开始吧"
        >
          <!-- 展开行：目标管理 -->
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="sp-goals-expand" @click.stop>
                <div class="sp-goals-expand-title">学习目标（{{ row.goals.length }} 个）</div>
                <div
                  v-for="goal in row.goals"
                  :key="goal.id"
                  class="sp-goal"
                  :class="{ done: goal.done }"
                >
                  <el-checkbox class="sp-goal-check" :data-testid="`sp-goal-toggle-${goal.id}`" :model-value="goal.done" @change="handleToggleGoal(row.id, goal.id)">
                    <span class="sp-goal-content">{{ goal.content }}</span>
                  </el-checkbox>
                  <div class="sp-goal-progress">
                    <el-slider class="sp-goal-range" size="small" :model-value="goal.progress" :min="0" :max="100" :step="1" :show-tooltip="false" :data-testid="`sp-goal-range-${goal.id}`" @input="(v: number | number[]) => handleProgressInput(row.id, goal.id, Number(Array.isArray(v) ? v[0] : v))" />
                    <span class="sp-goal-percent">{{ goal.progress }}%</span>
                  </div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="80" align="center">
            <template #default="{ row }">
              <span class="sp-type-badge" :class="TYPE_BADGE_CLASS[row.type as StudentPlanType]">{{ typeLabel(row.type) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="标题" min-width="200" align="left" show-overflow-tooltip>
            <template #default="{ row }">
              <span style="font-weight: 600;">{{ row.title }}</span>
            </template>
          </el-table-column>
          <el-table-column label="开始日期" width="120" align="center">
            <template #default="{ row }">{{ row.startDate }}</template>
          </el-table-column>
          <el-table-column label="结束日期" width="120" align="center">
            <template #default="{ row }">{{ row.endDate }}</template>
          </el-table-column>
          <el-table-column label="目标" width="70" align="center">
            <template #default="{ row }">{{ row.goals.length }} 个</template>
          </el-table-column>
          <el-table-column label="总进度" width="140" align="center">
            <template #default="{ row }">
              <div class="sp-progress-cell">
                <div class="sp-progress-bar">
                  <div
                    class="sp-progress-fill"
                    :style="{ width: `${store.planProgress(row)}%`, backgroundColor: progressColor(store.planProgress(row)) }"
                  ></div>
                </div>
                <span class="sp-progress-text">{{ store.planProgress(row) }}%</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="复盘" min-width="150" align="left" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.review">{{ row.review }}</span>
              <span v-else style="color: var(--color-text-secondary, #9ca3af);">—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" align="center" fixed="right">
            <template #default="{ row }">
              <button class="btn-edit" :data-testid="`sp-edit-${row.id}`" @click="openEditDialog(row.id)" style="margin-right:6px;">编辑</button>
              <button class="btn-delete" :data-testid="`sp-del-${row.id}`" @click="handleDelete(row.id)">删除</button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 分页条 -->
      <div v-if="viewEntries.length > 0" class="sp-list-pager">
        <el-pagination
          v-model:current-page="listPage"
          :page-size="LIST_PAGE_SIZE"
          :page-sizes="[LIST_PAGE_SIZE]"
          layout="total, prev, pager, next, jumper"
          :total="viewEntries.length"
          background
          small
          prev-text="上一页"
          next-text="下一页"
        />
      </div>
    </div>

    <!-- 新增/编辑弹框 -->
    <el-dialog
      v-model="showEditDialog"
      :title="editingId !== null ? '编辑计划' : '新增计划'"
      width="480px"
      class="sp-dialog"
      @close="closeEditDialog"
    >
      <div class="dialog-body">
        <div class="sp-field">
          <label>类型</label>
          <el-select
            :model-value="dialogType"
            @change="(val: string | number | boolean | object) => onTypeChange({ target: { value: String(val) } } as unknown as Event)"
          >
            <el-option value="weekly" label="周计划" />
            <el-option value="monthly" label="月计划" />
            <el-option value="term" label="学期计划" />
          </el-select>
        </div>
        <div class="sp-field">
          <label>标题</label>
          <el-input
            v-model="dialogTitle"
            maxlength="50"
            placeholder="例：本周语文复习计划"
            data-testid="sp-form-title"
          />
        </div>
        <div class="sp-field-row">
          <div class="sp-field">
            <label>开始日期</label>
            <el-input v-model="dialogStartDate" type="date" data-testid="sp-form-start" />
          </div>
          <div class="sp-field">
            <label>结束日期</label>
            <el-input v-model="dialogEndDate" type="date" data-testid="sp-form-end" />
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
              <el-input
                v-model="dialogGoalInputs[idx]"
                maxlength="100"
                :placeholder="`目标 ${idx + 1}`"
              />
              <el-button
                v-if="dialogGoalInputs.length > 1"
                class="sp-goal-remove"
                @click="removeGoalInput(idx)"
                title="移除"
                text
              ><Icon name="close" :size="14" /></el-button>
            </div>
            <el-button class="sp-goal-add" data-testid="sp-form-add-goal" @click="addGoalInput">
              + 添加目标
            </el-button>
          </div>
        </div>
        <div class="sp-field">
          <label>复盘（可选）</label>
          <el-input
            v-model="dialogReview"
            type="textarea"
            :rows="3"
            maxlength="5000"
            placeholder="Markdown 复盘笔记…"
            data-testid="sp-form-review"
          />
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="closeEditDialog">取消</el-button>
          <el-button type="primary" data-testid="sp-form-save" @click="saveEditDialog">
            {{ editingId !== null ? '保存' : '新增' }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.sp-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;
  padding: 16px;
}

.sp-count {
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
  white-space: nowrap;
}

.sp-tabs {
  display: flex;
  flex-wrap: wrap;
  padding: 0 4px;
  flex-shrink: 0;
}

.sp-stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  padding: 0 4px;
  flex-shrink: 0;
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
  overflow: hidden;
}

/* ===== 表格容器 ===== */
.sp-list {
  flex: 1 1 auto;
  min-height: 240px;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.sp-list > :global(.el-table) {
  flex: 1 1 auto;
  min-height: 220px;
  width: 100% !important;
  --el-table-border-color: var(--color-border, #e5e7eb);
  --el-table-header-bg-color: var(--color-bg-hover, #f3f4f6);
  --el-table-tr-bg-color: transparent;
  --el-table-row-hover-bg-color: rgba(59, 130, 246, 0.06);
  font-size: 13px;
  border-radius: 10px;
  overflow: hidden;
}
.sp-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.sp-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .sp-list > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(html.dark) .sp-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .sp-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
.sp-list > :global(.el-table .el-table__body-wrapper .cell),
.sp-list > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
}

/* ===== 分页条 ===== */
.sp-list-pager {
  flex: 0 0 auto;
  padding: 14px 16px 18px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
  margin: 0 0 8px;
  display: flex;
  justify-content: center;
  align-items: center;
}
:global(html.dark) .sp-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}
.sp-list-pager > :global(.el-pagination) {
  --el-pagination-bg-color: transparent;
}
.sp-list-pager > :global(.el-pagination button),
.sp-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #ffffff) !important;
  border: 1px solid var(--color-border, #e5e7eb) !important;
  color: var(--color-text-secondary, #6b7280) !important;
}
.sp-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
:global(html.dark) .sp-list-pager > :global(.el-pagination button),
:global(html.dark) .sp-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #1f2937) !important;
  border-color: var(--color-border, #374151) !important;
  color: var(--color-text-secondary, #d1d5db) !important;
}
:global(html.dark) .sp-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
.sp-list-pager > :global(.el-pagination__total) {
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
}

/* ===== 类型徽章 ===== */
.sp-type-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.6;
  color: #fff;
  white-space: nowrap;
}
.sp-type-weekly { background: #3b82f6; }
.sp-type-monthly { background: #a855f7; }
.sp-type-term { background: #10b981; }

/* ===== 进度条（表格内嵌） ===== */
.sp-progress-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sp-progress-bar {
  flex: 1;
  height: 6px;
  background: var(--color-hover, #f3f4f6);
  border-radius: 4px;
  overflow: hidden;
  min-width: 60px;
}
.sp-progress-fill {
  height: 100%;
  transition: width 0.3s, background-color 0.3s;
}
.sp-progress-text {
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
  white-space: nowrap;
  width: 36px;
  text-align: right;
}

/* ===== expand 行：目标管理 ===== */
.sp-goals-expand {
  padding: 12px 24px 12px 48px;
}
.sp-goals-expand-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary, #6b7280);
  margin-bottom: 8px;
}
.sp-goal {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--color-hover, #f3f4f6);
  margin-bottom: 6px;
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
.sp-goal-check :deep(.el-checkbox__label) {
  flex: 1;
  min-width: 0;
  display: flex;
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
.sp-goal-progress .el-slider {
  flex: 1;
  min-width: 60px;
}
.sp-goal-percent {
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
  width: 36px;
  text-align: right;
}

/* ===== 编辑/删除按钮 ===== */
.btn-edit, .btn-delete {
  padding: 5px 12px;
  font-size: 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all var(--transition-fast, 0.15s ease);
  line-height: 1.5;
  white-space: nowrap;
}
.btn-edit {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
  color: var(--color-link, #3b82f6);
}
.btn-edit:hover {
  background: rgba(59, 130, 246, 0.18);
  transform: translateY(-1px);
}
.btn-delete {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}
.btn-delete:hover {
  background: rgba(239, 68, 68, 0.18);
  transform: translateY(-1px);
}

/* ===== 弹框表单 ===== */
.dialog-body {
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
.sp-field-row {
  display: flex;
  gap: 12px;
}
.sp-field-row .sp-field { flex: 1; }
.sp-goals-edit {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sp-goal-edit-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.sp-goal-edit-row :deep(.el-input) {
  flex: 1;
}
.sp-goal-remove {
  color: var(--color-text-secondary, #6b7280);
  padding: 4px 8px;
}
.sp-goal-add {
  align-self: flex-start;
  border-style: dashed;
  color: var(--color-primary, #3b82f6);
  font-size: 12px;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}

@media (max-width: 768px) {
  .sp-shell { padding: 12px; }
  .sp-stats { grid-template-columns: repeat(2, 1fr); }
  .sp-field-row { flex-direction: column; }
  /* 小屏精简分页条：隐藏总数与跳转输入框 */
  .sp-list-pager :deep(.el-pagination__total),
  .sp-list-pager :deep(.el-pagination__jump) {
    display: none;
  }
}

@media (max-width: 480px) {
  .sp-dialog :deep(.el-dialog) {
    width: 92vw !important;
    max-width: 92vw;
  }
}
</style>