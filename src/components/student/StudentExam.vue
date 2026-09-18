<script setup lang="ts">
// 学生工作台考试倒计时面板（M2）
// 布局：顶部工具条 + 题型筛选 tabs + 统计卡 + 表格/卡片双视图（与学习计划一致）+ el-pagination + 编辑弹框
// 数据：useStudentExamStore（独立 IDB store 'student_countdowns'，严格隔离成人数据）
// 复用 countdownCore 的 calcRemaining/sortCountdowns/filterCountdowns/repeatLabel/categoryLabel

import { computed, onMounted, ref, watch } from 'vue'
import { useStudentExamStore } from '@/stores/studentExam'
import { useStudentSettingsStore } from '@/stores/studentSettings'
import { useToast } from '@/composables/useToast'
import {
  repeatLabel,
  examTypeOptions,
  type CountdownFilterCriteria
} from '@/composables/studentExamCore'
import type { CountdownItem, CountdownCategory, CountdownRepeat } from '@/types'
import { COUNTDOWN_COLOR_PRESETS, DEFAULT_COUNTDOWN_COLOR } from '@/types'
import { useViewMode } from '@/composables/useViewMode'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'
import Icon from '@/components/Icon.vue'
import StudentToolbar from '@/components/student/StudentToolbar.vue'
import { usePageSize } from '@/composables/usePageSize'

const store = useStudentExamStore()
const settingsStore = useStudentSettingsStore()
const toast = useToast()
const vm = useViewMode()

const stage = computed(() => settingsStore.stage)

// 题型筛选 tabs：全部 + 学段内置建议 + 用户自定义
const activeCategoryTab = ref<string>('')

// 题型 tabs：不再展示「全部」按钮；空值 = 全部，再次点击已选题型可取消筛选回到全部
const typeTabs = computed<string[]>(() => examTypeOptions(stage.value, store.customCategories))

function toggleCategoryTab(tab: string): void {
  activeCategoryTab.value = activeCategoryTab.value === tab ? '' : tab
  goto(1)
}

const appliedFilters = computed<CountdownFilterCriteria>(() => ({
  category: (activeCategoryTab.value || undefined) as CountdownCategory | undefined
}))

const filteredItems = computed<CountdownItem[]>(() =>
  store.filterExams(store.itemsWithRemaining, appliedFilters.value)
)

const stats = computed(() => {
  const items = store.itemsWithRemaining
  const now = new Date()
  const weekEnd = new Date(now)
  weekEnd.setDate(now.getDate() + 7)
  let upcoming = 0
  let expired = 0
  let thisWeek = 0
  for (const it of items) {
    if (it.remaining.isExpired) {
      expired++
    } else {
      upcoming++
      const nextTs = new Date(it.remaining.nextTime.replace(' ', 'T')).getTime()
      if (nextTs <= weekEnd.getTime()) thisWeek++
    }
  }
  return { upcoming, expired, thisWeek, total: items.length }
})

// 固定每页分页（与学习计划一致：el-pagination）
const LIST_PAGE_SIZE = 10
const { pageSize, PAGE_SIZES } = usePageSize('se-list-pager', LIST_PAGE_SIZE)
const currentPage = ref(1)
const pageItems = computed<CountdownItem[]>(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredItems.value.slice(start, start + pageSize.value)
})
function goto(page: number): void {
  currentPage.value = page
}
watch(activeCategoryTab, () => { currentPage.value = 1 })

const EXAM_ERROR_MESSAGES: Record<string, string> = {
  empty: '考试名称不能为空',
  'invalid-time': '考试时间格式不正确',
  'not-found': '考试记录不存在',
  duplicate: '题型名称已存在',
  'in-use': '该题型被考试引用，无法删除'
}
function examErrorToast(result: { ok: boolean; reason?: string }): void {
  if (result.ok) return
  toast.error(EXAM_ERROR_MESSAGES[result.reason ?? ''] ?? '操作失败')
}

const showEditDialog = ref(false)
const editingId = ref<string | null>(null)
const formName = ref('')
const formDate = ref('')
const formTime = ref('09:00')
const formCategory = ref<string>('')
const formColor = ref<string>(DEFAULT_COUNTDOWN_COLOR)
const formRepeatType = ref<'once' | 'yearly'>('once')

const typeOptions = computed<string[]>(() => examTypeOptions(stage.value, store.customCategories))

function endDateTimeValue(): string {
  return `${formDate.value}T${formTime.value}`
}

function openAddDialog(): void {
  editingId.value = null
  formName.value = ''
  const d = new Date()
  d.setDate(d.getDate() + 7)
  formDate.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  formTime.value = '09:00'
  formCategory.value = typeOptions.value[0] ?? ''
  formColor.value = DEFAULT_COUNTDOWN_COLOR
  formRepeatType.value = 'once'
  showEditDialog.value = true
}

function openEditDialog(id: string): void {
  const c = store.countdowns.find(x => x.id === id)
  if (!c) return
  editingId.value = c.id
  formName.value = c.name
  const [datePart, timePart] = c.endDateTime.split('T')
  formDate.value = datePart
  formTime.value = timePart ?? '09:00'
  formCategory.value = c.category ?? ''
  formColor.value = c.color ?? DEFAULT_COUNTDOWN_COLOR
  const rep = c.repeat
  formRepeatType.value = rep && typeof rep === 'object' && rep.type === 'yearly' ? 'yearly' : 'once'
  showEditDialog.value = true
}

function closeEditDialog(): void {
  showEditDialog.value = false
  editingId.value = null
}

function buildRepeat(): CountdownRepeat | null {
  return formRepeatType.value === 'yearly' ? { type: 'yearly' } : null
}

async function saveEditDialog(): Promise<void> {
  const name = formName.value.trim()
  if (!name) {
    toast.error('考试名称不能为空')
    return
  }
  if (!formDate.value) {
    toast.error('考试日期不能为空')
    return
  }
  const endDateTime = endDateTimeValue()
  const category = formCategory.value.trim() || undefined
  if (editingId.value !== null) {
    const result = await store.updateExam(editingId.value, {
      name,
      endDateTime,
      category,
      color: formColor.value,
      repeat: buildRepeat()
    })
    if (result.ok) closeEditDialog()
    examErrorToast(result)
    return
  }
  const result = await store.addExam({
    name,
    endDateTime,
    category,
    color: formColor.value,
    repeat: buildRepeat()
  })
  if (result.ok) {
    closeEditDialog()
    goto(1)
  }
  examErrorToast(result)
}

async function handleDelete(id: string): Promise<void> {
  const c = store.countdowns.find(x => x.id === id)
  if (!c) return
  if (!confirm(`确定要删除「${c.name}」吗？`)) return
  const result = await store.deleteExam(id)
  if (result.ok) {
    if (editingId.value === id) closeEditDialog()
    goto(1)
  }
  examErrorToast(result)
}

function statusClass(status: string): string {
  return `status-${status}`
}

// 表格倒计时文本（与卡片 hero 口径一致）
function countdownText(item: CountdownItem): string {
  const r = item.remaining
  if (r.status === 'expired') return '已过期'
  if (r.days > 0) return `${r.days} 天`
  if (r.hours > 0) return `${r.hours} 时`
  return `${r.minutes} 分`
}

onMounted(async () => {
  await store.loadExams()
})
</script>

<template>
  <div class="se-shell">
    <StudentToolbar title="考试倒计时" />

    <div class="se-tabs">
      <el-radio-group :model-value="activeCategoryTab" size="small">
        <el-radio-button
          v-for="tab in typeTabs"
          :key="tab"
          :value="tab"
          :data-testid="`se-tab-${tab}`"
          @click="toggleCategoryTab(tab)"
        >{{ tab }}</el-radio-button>
      </el-radio-group>
    </div>

    <div class="se-stats">
      <div class="se-stat-card">
        <div class="se-stat-label">即将到来</div>
        <div class="se-stat-value">{{ stats.upcoming }} 场</div>
      </div>
      <div class="se-stat-card">
        <div class="se-stat-label">本周到期</div>
        <div class="se-stat-value">{{ stats.thisWeek }} 场</div>
      </div>
      <div class="se-stat-card">
        <div class="se-stat-label">已过期</div>
        <div class="se-stat-value">{{ stats.expired }} 场</div>
      </div>
      <div class="se-stat-card">
        <div class="se-stat-label">合计</div>
        <div class="se-stat-value">{{ stats.total }} 场</div>
      </div>
    </div>

    <div class="se-main">
      <div class="ewt-table-toolbar is-split">
        <div class="se-toolbar-left">
          <el-button type="primary" size="small" class="se-add-btn" data-testid="se-add-btn" @click="openAddDialog">
            <Icon name="plus" :size="16" /> 新增考试
          </el-button>
        </div>
        <ViewModeToggle v-if="filteredItems.length > 0" :mode="vm.mode" @toggle="vm.toggle" />
      </div>

      <div v-if="filteredItems.length === 0" class="empty-state" data-testid="se-empty">
        <p>{{ store.countdowns.length === 0 ? '还没有考试，点左上角「新增考试」开始吧' : '当前题型下暂无考试' }}</p>
      </div>

      <template v-else>

        <div class="se-list-area">
          <el-table v-if="vm.mode === 'list'" class="ewt-table"
            :data="pageItems"
            stripe
            border
            size="default"
            style="width: 100%"
            height="100%"
            empty-text="还没有考试，点左上角「新增考试」开始吧"
          >
            <el-table-column label="名称" min-width="180" align="left" show-overflow-tooltip>
              <template #default="{ row }">
                <span style="font-weight: 600;">{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="题型" width="110" align="center">
              <template #default="{ row }">
                <span v-if="row.category" class="se-type-badge">{{ row.category }}</span>
                <span v-else style="color: var(--color-text-muted, #9ca3af);">—</span>
              </template>
            </el-table-column>
            <el-table-column label="倒计时" width="110" align="center">
              <template #default="{ row }">
                <span class="se-countdown-cell" :class="statusClass(row.remaining.status)">{{ countdownText(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="考试日期" min-width="150" align="center">
              <template #default="{ row }">{{ row.remaining.nextTime }}</template>
            </el-table-column>
            <el-table-column label="重复" width="100" align="center">
              <template #default="{ row }">
                <span>{{ repeatLabel(row.repeat) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" class-name="ewt-op-col" width="150" align="center" fixed="right">
              <template #default="{ row }">
                <button class="btn-edit" :data-testid="`se-edit-${row.id}`" @click="openEditDialog(row.id)">编辑</button>
                <button class="btn-delete" :data-testid="`se-del-${row.id}`" @click="handleDelete(row.id)">删除</button>
              </template>
            </el-table-column>
          </el-table>

          <div v-else class="se-grid">
            <div
              v-for="item in pageItems"
              :key="item.id"
              class="se-card"
              :style="{ '--se-color': item.color ?? DEFAULT_COUNTDOWN_COLOR }"
              :data-testid="`se-card-${item.id}`"
              role="button"
              @click="openEditDialog(item.id)"
            >
              <div class="se-card-head">
                <div class="se-card-title" :title="item.name">{{ item.name }}</div>
                <span v-if="item.category" class="se-type-badge">{{ item.category }}</span>
                <span v-if="repeatLabel(item.repeat) !== '一次性'" class="se-repeat-badge">{{ repeatLabel(item.repeat) }}</span>
              </div>
              <div class="se-hero" :class="statusClass(item.remaining.status)">
                <template v-if="item.remaining.status === 'expired'">
                  <div class="se-hero-big se-hero-expired">{{ item.remaining.isExpired ? '已过期' : '时间无效' }}</div>
                  <div v-if="item.remaining.isExpired" class="se-hero-sub">{{ item.remaining.label }}</div>
                </template>
                <template v-else-if="item.remaining.label === '就是今天！'">
                  <div class="se-hero-big se-hero-today">今天</div>
                  <div class="se-hero-sub">加油！</div>
                </template>
                <template v-else>
                  <div class="se-hero-big" v-if="item.remaining.days > 0">
                    {{ item.remaining.days }}<span class="se-hero-unit">天</span>
                  </div>
                  <div class="se-hero-big" v-else-if="item.remaining.hours > 0">
                    {{ item.remaining.hours }}<span class="se-hero-unit">时</span>
                  </div>
                  <div class="se-hero-big" v-else>
                    {{ item.remaining.minutes }}<span class="se-hero-unit">分</span>
                  </div>
                  <div v-if="item.remaining.days > 0 && item.remaining.hours > 0" class="se-hero-sub">
                    {{ item.remaining.hours }}时{{ item.remaining.minutes }}分
                  </div>
                  <div v-else-if="item.remaining.days === 0 && item.remaining.hours > 0 && item.remaining.minutes > 0" class="se-hero-sub">
                    {{ item.remaining.minutes }}分钟
                  </div>
                </template>
              </div>
              <div class="se-meta">
                <span class="se-datetime">{{ item.remaining.nextTime }}</span>
              </div>
              <button
                class="se-del-btn"
                :data-testid="`se-del-${item.id}`"
                title="删除"
                @click.stop="handleDelete(item.id)"
              >
                <Icon name="close" :size="14" />
              </button>
            </div>
          </div>
        </div>

        <div v-if="filteredItems.length > 0" class="se-list-pager ewt-pager">
          <el-pagination
            v-model:current-page="currentPage"
            @size-change="currentPage = 1"
            v-model:page-size="pageSize"
            :page-sizes="PAGE_SIZES"
            layout="total, prev, pager, next, jumper"
            :total="filteredItems.length"
            background
            small
            prev-text="上一页"
            next-text="下一页"
          />
        </div>
      </template>
    </div>

    <el-dialog
      v-model="showEditDialog"
      :title="editingId ? '编辑考试' : '新增考试'"
      width="480px"
      class="se-dialog"
      append-to-body
      @close="closeEditDialog"
    >
      <div class="dialog-body">
        <div class="form-field">
          <label>考试名称</label>
          <el-input
            v-model="formName"
            type="text"
            placeholder="如：期中考试-数学"
            maxlength="30"
            data-testid="se-form-name"
            @keyup.enter="saveEditDialog"
          />
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>考试日期</label>
            <el-input v-model="formDate" type="date" data-testid="se-form-date" />
          </div>
          <div class="form-field">
            <label>考试时间</label>
            <el-input v-model="formTime" type="time" data-testid="se-form-time" />
          </div>
        </div>
        <div class="form-field">
          <label>考试题型</label>
          <el-select v-model="formCategory" placeholder="请选择题型" data-testid="se-form-type">
            <el-option v-for="t in typeOptions" :key="t" :value="t" :label="t" />
          </el-select>
        </div>
        <div class="form-field">
          <label>重复</label>
          <el-select v-model="formRepeatType" data-testid="se-form-repeat">
            <el-option value="once" label="一次性" />
            <el-option value="yearly" label="每年（如年度统考）" />
          </el-select>
        </div>
        <div class="form-field">
          <label>卡片颜色</label>
          <div class="se-color-picker" data-testid="se-form-color">
            <button
              v-for="c in COUNTDOWN_COLOR_PRESETS"
              :key="c"
              type="button"
              class="se-color-dot"
              :class="{ active: formColor === c }"
              :style="{ backgroundColor: c }"
              :title="c"
              @click="formColor = c"
            ></button>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="ewt-dialog-footer">
          <el-button @click="closeEditDialog">取消</el-button>
          <el-button type="primary" data-testid="se-form-save" @click="saveEditDialog">保存</el-button>
          <el-button v-if="editingId" type="danger" data-testid="se-form-delete" @click="handleDelete(editingId)">删除</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.se-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;
  padding: 16px;
}

/* ===== 题型筛选 tabs（el-radio-group 药丸，保持过滤逻辑与激活态绑定 activeCategoryTab） ===== */
.se-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.se-tabs :deep(.el-radio-group) {
  flex-wrap: wrap;
  gap: 6px;
}

.se-tabs :deep(.el-radio-button + .el-radio-button) {
  margin-left: 0;
}

.se-tabs :deep(.el-radio-button__inner) {
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 14px;
  background: transparent;
  color: var(--color-text-muted, #6b7280);
  font-size: 12px;
  padding: 4px 12px;
  box-shadow: none;
  transition: all 0.15s;
}

.se-tabs :deep(.el-radio-button__inner:hover) {
  color: var(--color-primary, #10b981);
}

.se-tabs :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  border-color: var(--color-primary, #10b981);
  color: var(--color-primary, #10b981);
  background: color-mix(in srgb, var(--color-primary, #10b981) 8%, transparent);
  box-shadow: none;
}

.se-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.se-stat-card {
  padding: 10px 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  text-align: center;
}
.se-stat-label {
  font-size: 11px;
  color: var(--color-text-muted, #6b7280);
  margin-bottom: 4px;
}
.se-stat-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
}

.se-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ===== 双视图容器 ===== */
.se-list-area {
  flex: 1 1 auto;
  min-height: 240px;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.se-list-area > :global(.el-table) {
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
.se-list-area > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-muted, #6b7280);
  font-weight: 600;
  user-select: none;
}
.se-list-area > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .se-list-area > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(html.dark) .se-list-area > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-muted, #d1d5db);
}
:global(html.dark) .se-list-area > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
.se-list-area > :global(.el-table .el-table__body-wrapper .cell),
.se-list-area > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
}

/* ===== 分页条 ===== */
.se-list-pager {
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
:global(html.dark) .se-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}

.se-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  align-content: start;
  overflow-y: auto;
}

.se-card {
  --se-color: #3b82f6;
  position: relative;
  display: flex;
  flex-direction: column;
  height: 150px;
  padding: 12px 12px 10px;
  background: color-mix(in srgb, var(--se-color) 6%, var(--color-surface, #fff));
  border: 1px solid var(--color-border, #e5e7eb);
  border-top: 3px solid var(--se-color);
  border-radius: 10px;
  cursor: pointer;
  overflow: hidden;
  transition: box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}
.se-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--se-color) 18%, rgba(0,0,0,0.06));
  border-color: color-mix(in srgb, var(--se-color) 50%, var(--color-border, #e2e8f0));
}
.dark .se-card {
  background: color-mix(in srgb, var(--se-color) 8%, var(--color-surface, #1a1a2e));
}

.se-card-head {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 4px;
}
.se-card-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
  color: var(--color-text, #1f2937);
}
.se-type-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--se-color) 10%, transparent);
  color: var(--se-color);
  flex-shrink: 0;
  line-height: 1.4;
}
.se-repeat-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--se-color) 12%, transparent);
  color: var(--se-color);
  flex-shrink: 0;
  line-height: 1.4;
}

.se-hero {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
}
.se-hero-big {
  font-size: 32px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.se-hero-unit {
  font-size: 13px;
  font-weight: 500;
  margin-left: 1px;
  opacity: 0.7;
}
.se-hero-sub {
  font-size: 11px;
  color: var(--color-text-muted, #6b7280);
  font-weight: 500;
  line-height: 1.3;
}

/* status colors on the hero big number */
.status-normal .se-hero-big { color: var(--se-color); }
.status-urgent .se-hero-big { color: #f59e0b; }
.status-critical .se-hero-big { color: #ef4444; }
.status-expired .se-hero-big { color: var(--color-text-muted, #9ca3af); }

/* 表格倒计时单元格配色（与 hero 口径一致） */
.se-countdown-cell { font-weight: 600; }
.se-countdown-cell.status-normal { color: var(--color-primary, #3b82f6); }
.se-countdown-cell.status-urgent { color: #f59e0b; }
.se-countdown-cell.status-critical { color: #ef4444; }
.se-countdown-cell.status-expired { color: var(--color-text-muted, #9ca3af); font-weight: 500; }

/* expired / invalid / today special states */
.se-hero-expired { opacity: 0.55; }
.se-hero-today {
  color: var(--color-primary, #10b981);
  font-size: 28px;
}

.se-meta {
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 10px;
  color: var(--color-text-muted, #9ca3af);
  border-top: 1px solid color-mix(in srgb, var(--se-color) 10%, var(--color-border, #e5e7eb));
  padding-top: 5px;
  letter-spacing: 0.02em;
}
.se-datetime { font-size: 10px; }

.se-del-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted, #9ca3af);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}
.se-card:hover .se-del-btn { opacity: 1; }
.se-del-btn:hover { background: rgba(239, 68, 68, 0.12); color: #ef4444; }

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
  color: var(--color-text-muted, #6b7280);
  font-size: 14px;
}

/* ===== 编辑弹框（el-dialog） ===== */
.se-dialog :deep(.el-dialog__header) {
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  margin-right: 0;
}

.se-dialog :deep(.el-dialog__body) {
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.se-dialog :deep(.el-dialog__footer) {
  padding: 12px 20px;
  border-top: 1px solid var(--color-border, #e5e7eb);
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
.form-field :deep(.el-select) {
  width: 100%;
}
.form-row { display: flex; gap: 12px; }
.form-row .form-field { flex: 1; }

.se-color-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.se-color-dot {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: transform 0.15s, border-color 0.15s;
}
.se-color-dot:hover { transform: scale(1.1); }
.se-color-dot.active {
  border-color: var(--color-text, #1f2937);
  transform: scale(1.1);
}

/* ===== 表格内编辑/删除按钮（与学习计划一致） ===== */
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
}
.btn-delete {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}
.btn-delete:hover {
  background: rgba(239, 68, 68, 0.18);
}

@media (max-width: 768px) {
  .se-shell { padding: 12px; }
  .se-stats { grid-template-columns: repeat(2, 1fr); }
  .se-grid { grid-template-columns: 1fr; }
  .se-card { height: auto; min-height: 150px; }
  .se-hero-big { font-size: 36px; }
  .se-hero-today { font-size: 32px; }
  /* 触屏无 hover：删除按钮改为常显，保证可达 */
  .se-del-btn {
    opacity: 1;
    background: rgba(239, 68, 68, 0.08);
  }
}

@media (max-width: 480px) {
  .se-dialog :deep(.el-dialog) {
    width: 92vw !important;
    max-width: 92vw;
  }
}

.se-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
