<script setup lang="ts">
// 学生工作台考试倒计时面板（M2）
// 布局：顶部工具条 + 题型筛选 tabs + 统计卡 + 卡片网格 + 分页 + 编辑弹框
// 数据：useStudentExamStore（独立 IDB store 'student_countdowns'，严格隔离成人数据）
// 复用 countdownCore 的 calcRemaining/sortCountdowns/filterCountdowns/repeatLabel/categoryLabel
// 卡片网格 5 列 × maxRows 2 = 每页 10 个，超出翻页（行高 150，与成人 countdown 一致）

import { computed, onMounted, ref } from 'vue'
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
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from '@/components/workbench/PanelPager.vue'
import Icon from '@/components/Icon.vue'
import StudentToolbar from '@/components/student/StudentToolbar.vue'

const store = useStudentExamStore()
const settingsStore = useStudentSettingsStore()
const toast = useToast()

const stage = computed(() => settingsStore.stage)

// 题型筛选 tabs：全部 + 学段内置建议 + 用户自定义
const activeCategoryTab = ref<string>('')

const typeTabs = computed<string[]>(() => {
  return ['全部', ...examTypeOptions(stage.value, store.customCategories)]
})

function selectCategoryTab(tab: string): void {
  activeCategoryTab.value = tab === '全部' ? '' : tab
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

const mainEl = ref<HTMLElement | null>(null)
const gridEl = ref<HTMLElement | null>(null)
const paging = usePanelPaging({
  items: () => filteredItems.value,
  rowHeight: 152,
  gap: 10,
  containerRef: mainEl,
  gridRef: gridEl
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev, goto } = paging

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

onMounted(async () => {
  await store.loadExams()
})
</script>

<template>
  <div class="se-shell">
    <StudentToolbar title="考试倒计时">
      <el-button type="primary" size="small" class="se-add-btn" data-testid="se-add-btn" @click="openAddDialog">
        <Icon name="plus" :size="16" /> 新增考试
      </el-button>
    </StudentToolbar>

    <div class="se-tabs">
      <el-radio-group v-model="activeCategoryTab" size="small" @change="selectCategoryTab">
        <el-radio-button
          v-for="tab in typeTabs"
          :key="tab"
          :value="tab"
          :data-testid="`se-tab-${tab}`"
        >{{ tab }}</el-radio-button>
      </el-radio-group>
      <span class="se-count">{{ filteredItems.length }} 场</span>
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

    <div ref="mainEl" class="se-main">
      <div v-if="filteredItems.length === 0" class="empty-state" data-testid="se-empty">
        <p>{{ store.countdowns.length === 0 ? '还没有考试，点上方「新增考试」开始吧' : '当前题型下暂无考试' }}</p>
      </div>

      <div v-else ref="gridEl" class="se-grid" :class="{ 'se-grid-scroll': !fitsOnePage }">
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
            <span v-if="repeatLabel(item.repeat) !== '一次性'" class="se-repeat-badge">{{ repeatLabel(item.repeat) }}</span>
          </div>
          <div class="se-remaining" :class="statusClass(item.remaining.status)">
            <span class="se-remaining-label">{{ item.remaining.isExpired ? '已过期' : '剩余' }}</span>
            <span class="se-remaining-value">{{ item.remaining.label }}</span>
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

    <PanelPager
      v-if="totalPages > 1"
      :page="currentPage"
      :total="totalPages"
      @prev="prev"
      @next="next"
    />

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
        <div class="dialog-footer">
          <el-button v-if="editingId" type="danger" data-testid="se-form-delete" @click="handleDelete(editingId)">
            删除
          </el-button>
          <div class="dialog-footer-right">
            <el-button @click="closeEditDialog">取消</el-button>
            <el-button type="primary" data-testid="se-form-save" @click="saveEditDialog">保存</el-button>
          </div>
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

.se-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
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
  overflow: hidden;
}
.se-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  align-content: start;
}
.se-grid-scroll {
  overflow-y: auto;
}

.se-card {
  --se-color: #3b82f6;
  position: relative;
  display: flex;
  flex-direction: column;
  height: 150px;
  padding: 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-top: 3px solid var(--se-color);
  border-radius: 10px;
  cursor: pointer;
  overflow: hidden;
  transition: box-shadow 0.15s, border-color 0.15s, transform 0.15s;
}
.se-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: color-mix(in srgb, var(--se-color) 45%, var(--color-border, #e2e8f0));
}

.se-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.se-card-title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.se-repeat-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--se-color) 12%, transparent);
  color: var(--se-color);
  flex-shrink: 0;
}

.se-remaining {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.se-remaining-label {
  font-size: 16px;
  font-weight: 700;
}
.se-remaining-value {
  font-size: 16px;
  font-weight: 700;
}
.status-normal .se-remaining-label,
.status-normal .se-remaining-value { color: var(--color-text, #1f2937); }
.status-urgent .se-remaining-label,
.status-urgent .se-remaining-value { color: #f59e0b; }
.status-critical .se-remaining-label,
.status-critical .se-remaining-value { color: #ef4444; }
.status-expired .se-remaining-label,
.status-expired .se-remaining-value { color: var(--color-text-muted, #9ca3af); }

.se-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--color-text-muted, #6b7280);
  border-top: 1px dashed var(--color-border, #e5e7eb);
  padding-top: 6px;
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

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.dialog-footer-right {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

@media (max-width: 768px) {
  .se-shell { padding: 12px; }
  .se-stats { grid-template-columns: repeat(2, 1fr); }
  .se-grid { grid-template-columns: 1fr; }
  .se-card { height: auto; min-height: 150px; }
}
</style>
