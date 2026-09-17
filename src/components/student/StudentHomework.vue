<script setup lang="ts">
import { useViewMode } from '@/composables/useViewMode'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'

const vm = useViewMode()

function cardFields(row: any) {
  return [
    { label: '学科', value: row.subject },
    { label: '标题', value: row.title },
    { label: '内容', value: row.content || '—' },
    { label: '优先级', value: priorityLabel(row.priority) },
    { label: '截止日期', value: row.dueDate },
    { label: '状态', value: statusLabel(row.status) }
  ]
}

// 学生工作台作业管理面板（M2）
// 布局：顶部工具条 + 学科筛选 tabs + 状态筛选 tabs + el-table 表格列表 + el-pagination 分页
// 数据：useStudentHomeworkStore（独立 IDB store 'student_homework'，严格隔离成人数据）
// 学科下拉来自 studentSettings.subjects（学段默认或用户自定义）

import { computed, onMounted, ref, watch } from 'vue'
import { useStudentHomeworkStore } from '@/stores/studentHomework'
import { useStudentSettingsStore } from '@/stores/studentSettings'
import { useToast } from '@/composables/useToast'
import { localToday } from '@/composables/todoCore'
import {
  statusLabel,
  priorityLabel,
  nextStatus
} from '@/composables/studentHomeworkCore'
import type {
  StudentHomework,
  StudentHomeworkPriority,
  StudentHomeworkStatus
} from '@/types'
import Icon from '@/components/Icon.vue'
import StudentToolbar from '@/components/student/StudentToolbar.vue'

const store = useStudentHomeworkStore()
const settingsStore = useStudentSettingsStore()
const toast = useToast()

const today = localToday()

// ===== 学科筛选（'all' 全部 / 学科名）=====
const activeSubject = ref<string>('all')

const subjectTabs = computed(() => {
  const tabs: { key: string; label: string }[] = [{ key: 'all', label: '全部' }]
  for (const s of settingsStore.subjects) {
    tabs.push({ key: s, label: s })
  }
  return tabs
})

// ===== 状态筛选（'all' 全部 / pending/doing/overdue/done）=====
const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待办' },
  { key: 'doing', label: '进行中' },
  { key: 'overdue', label: '逾期' },
  { key: 'done', label: '已完成' }
]
const activeStatus = ref<string>('all')

// ===== 视图数据：学科筛选 → 状态筛选 → 排序 =====
const viewEntries = computed(() => {
  let list: StudentHomework[] = store.entries
  if (activeSubject.value !== 'all') {
    list = list.filter(e => e.subject === activeSubject.value)
  }
  if (activeStatus.value !== 'all') {
    list = list.filter(e => e.status === activeStatus.value)
  }
  return store.sortEntries(list)
})

// ===== 分页：Element Plus el-pagination，固定 10 条/页 =====
const LIST_PAGE_SIZE = 10
const listPage = ref(1)
const listPageItems = computed<StudentHomework[]>(() => {
  const start = (listPage.value - 1) * LIST_PAGE_SIZE
  return viewEntries.value.slice(start, start + LIST_PAGE_SIZE)
})

watch([activeSubject, activeStatus], () => goto(1))
function goto(page: number): void {
  listPage.value = page
}

// ===== 优先级选项 =====
const PRIORITY_OPTIONS: { value: StudentHomeworkPriority; label: string }[] = [
  { value: 'high', label: '高' },
  { value: 'normal', label: '中' },
  { value: 'low', label: '低' }
]

// ===== 错误 toast =====
const HOMEWORK_ERROR_MESSAGES: Record<string, string> = {
  empty: '必填项不能为空',
  duplicate: '同学科+同名+同截止日期的作业已存在',
  'not-found': '作业不存在'
}
function homeworkErrorToast(result: { ok: boolean; reason?: string }): void {
  if (result.ok) return
  toast.error(HOMEWORK_ERROR_MESSAGES[result.reason ?? ''] ?? '操作失败')
}

// ===== 新增/编辑弹框 =====
const showEditDialog = ref(false)
const editingId = ref<string | null>(null)
const dialogSubject = ref('')
const dialogTitle = ref('')
const dialogContent = ref('')
const dialogDueDate = ref(today)
const dialogPriority = ref<StudentHomeworkPriority>('normal')
// 学科下拉是否允许输入自定义值（学科不在 settings.subjects 时可手动输入）
const dialogSubjectCustom = ref(false)

function openAddDialog(): void {
  editingId.value = null
  dialogSubject.value = settingsStore.subjects[0] ?? ''
  dialogTitle.value = ''
  dialogContent.value = ''
  dialogDueDate.value = today
  dialogPriority.value = 'normal'
  dialogSubjectCustom.value = false
  showEditDialog.value = true
}

function openEditDialog(id: string): void {
  const h = store.entries.find(e => e.id === id)
  if (!h) return
  editingId.value = h.id
  dialogSubject.value = h.subject
  dialogTitle.value = h.title
  dialogContent.value = h.content ?? ''
  dialogDueDate.value = h.dueDate
  dialogPriority.value = h.priority
  dialogSubjectCustom.value = !settingsStore.subjects.includes(h.subject)
  showEditDialog.value = true
}

function closeEditDialog(): void {
  showEditDialog.value = false
  editingId.value = null
}

async function saveEditDialog(): Promise<void> {
  const subject = dialogSubject.value.trim()
  const title = dialogTitle.value.trim()
  if (!subject || !title || !dialogDueDate.value) {
    toast.error('学科、标题、截止日期均为必填')
    return
  }
  if (editingId.value !== null) {
    const result = await store.updateHomework(editingId.value, {
      subject,
      title,
      content: dialogContent.value,
      dueDate: dialogDueDate.value,
      priority: dialogPriority.value
    })
    if (result.ok) closeEditDialog()
    homeworkErrorToast(result)
    return
  }
  const result = await store.addHomework({
    subject,
    title,
    content: dialogContent.value,
    dueDate: dialogDueDate.value,
    priority: dialogPriority.value
  })
  if (result.ok) {
    closeEditDialog()
    goto(1)
  }
  homeworkErrorToast(result)
}

async function handleDelete(id: string): Promise<void> {
  const h = store.entries.find(e => e.id === id)
  if (!h) return
  if (!confirm(`确定要删除作业「${h.title}」吗？`)) return
  const result = await store.deleteHomework(id)
  if (result.ok) {
    if (editingId.value === id) closeEditDialog()
    goto(1)
  }
  homeworkErrorToast(result)
}

async function handleAdvanceStatus(id: string): Promise<void> {
  const result = await store.advanceStatus(id)
  homeworkErrorToast(result)
}

// ===== 剩余天数提示（基于 today）=====
interface DueInfo { text: string; isOverdue: boolean; isToday: boolean; isTomorrow: boolean }

function dueInfo(dueDate: string, status: StudentHomeworkStatus): DueInfo {
  const target = new Date(dueDate + 'T00:00:00')
  const todayDate = new Date(today + 'T00:00:00')
  const diff = Math.round((target.getTime() - todayDate.getTime()) / 86400000)
  if (status === 'done') return { text: '已完成', isOverdue: false, isToday: false, isTomorrow: false }
  if (diff < 0) return { text: `逾期 ${-diff} 天`, isOverdue: true, isToday: false, isTomorrow: false }
  if (diff === 0) return { text: '今天截止', isOverdue: false, isToday: true, isTomorrow: false }
  if (diff === 1) return { text: '明天截止', isOverdue: false, isToday: false, isTomorrow: true }
  return { text: `${diff} 天后截止`, isOverdue: false, isToday: false, isTomorrow: false }
}

function statusBadgeClass(status: StudentHomeworkStatus): string {
  return `shw-status-${status}`
}

// el-table 行内联类（按状态着色左边框/底色）
function shwRowClass({ row }: { row: StudentHomework }): string {
  return `shw-row-${row.status}`
}

function nextStatusLabel(status: StudentHomeworkStatus): string {
  return statusLabel(nextStatus(status))
}

onMounted(async () => {
  await store.loadHomework()
})
</script>

<template>
  <div class="shw-shell">
    <StudentToolbar title="作业管理" />

    <div class="shw-filters">
      <el-radio-group v-model="activeSubject" class="shw-subject-tabs" size="small">
        <el-radio-button
          v-for="tab in subjectTabs"
          :key="tab.key"
          :value="tab.key"
          :data-testid="`shw-subject-${tab.key}`"
        >{{ tab.label }}</el-radio-button>
      </el-radio-group>
      <el-radio-group v-model="activeStatus" class="shw-status-tabs" size="small">
        <el-radio-button
          v-for="tab in STATUS_FILTERS"
          :key="tab.key"
          :value="tab.key"
          :data-testid="`shw-status-${tab.key}`"
        >{{ tab.label }}</el-radio-button>
      </el-radio-group>
    </div>

    <div class="shw-main">
      <!-- 表格区（Element Plus Table）：左上新增 + 右上视图切换 -->
      <div class="ewt-table-toolbar is-split">
        <div class="shw-toolbar-left">
          <el-button type="primary" size="small" class="shw-add-btn" data-testid="shw-add-btn" @click="openAddDialog">
            ＋ 新增作业
          </el-button>
        </div>
        <ViewModeToggle :mode="vm.mode" @toggle="vm.toggle" />
      </div>
      <div class="shw-list">
        <el-table v-if="vm.mode === 'list'" class="ewt-table"
          :data="listPageItems"
          stripe
          border
          size="default"
          style="width: 100%"
          height="100%"
          :row-class-name="shwRowClass"
          empty-text="还没有作业，点上方「新增作业」开始吧"
        >
          <el-table-column label="学科" width="100" align="center">
            <template #default="{ row }">
              <span class="shw-subject-badge">{{ row.subject }}</span>
            </template>
          </el-table-column>
          <el-table-column label="标题" min-width="160" align="left" show-overflow-tooltip>
            <template #default="{ row }">
              <span style="font-weight: 600;">{{ row.title }}</span>
            </template>
          </el-table-column>
          <el-table-column label="内容" min-width="200" align="left" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.content">{{ row.content }}</span>
              <span v-else style="color: var(--color-text-secondary, #9ca3af);">—</span>
            </template>
          </el-table-column>
          <el-table-column label="优先级" width="90" align="center">
            <template #default="{ row }">
              <span class="shw-priority" :class="`shw-priority-${row.priority}`" :data-testid="`shw-priority-${row.id}`">
                {{ priorityLabel(row.priority) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="截止日期" width="150" align="center">
            <template #default="{ row }">
              <span class="shw-due" :class="{ overdue: dueInfo(row.dueDate, row.status).isOverdue, today: dueInfo(row.dueDate, row.status).isToday, tomorrow: dueInfo(row.dueDate, row.status).isTomorrow }">
                {{ row.dueDate }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <span class="shw-status" :class="statusBadgeClass(row.status)" :data-testid="`shw-status-${row.id}`">
                {{ statusLabel(row.status) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" class-name="ewt-op-col" width="170" align="center" fixed="right">
            <template #default="{ row }">
              <button class="shw-edit-btn" :data-testid="`shw-edit-${row.id}`" @click="openEditDialog(row.id)">
                编辑
              </button>
              <button
                v-if="row.status !== 'done'"
                class="shw-advance-btn"
                :class="statusBadgeClass(row.status)"
                :data-testid="`shw-advance-${row.id}`"
                :title="`推进到「${nextStatusLabel(row.status)}」`"
                @click="handleAdvanceStatus(row.id)"
              >
                <Icon name="check" :size="14" />
                <span>{{ nextStatusLabel(row.status) }}</span>
              </button>
              <span v-else class="shw-done-mark" :data-testid="`shw-done-${row.id}`">
                <Icon name="check" :size="14" /> 已完成
              </span>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="ewt-card-grid">
          <RecordsCard
            @edit="openEditDialog(item.id)"
            v-for="item in listPageItems"
            :key="item.id"
            :fields="cardFields(item)"
          >
          </RecordsCard>
        </div>

      </div>

      <!-- 分页条（Element Plus Pagination） -->
      <div v-if="viewEntries.length > 0" class="shw-pager">
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

    <el-dialog
      v-model="showEditDialog"
      :title="editingId ? '编辑作业' : '新增作业'"
      width="480px"
      class="shw-dialog"
      @close="closeEditDialog"
    >
      <div class="dialog-body">
        <div class="form-field">
          <label>学科</label>
          <el-select v-if="!dialogSubjectCustom" v-model="dialogSubject" data-testid="shw-form-subject">
            <el-option v-for="s in settingsStore.subjects" :key="s" :value="s" :label="s" />
          </el-select>
          <el-input
            v-else
            v-model="dialogSubject"
            placeholder="输入学科名称"
            maxlength="10"
            data-testid="shw-form-subject-custom"
          />
          <el-checkbox v-model="dialogSubjectCustom" class="shw-custom-toggle">自定义学科</el-checkbox>
        </div>
        <div class="form-field">
          <label>作业标题</label>
          <el-input
            v-model="dialogTitle"
            placeholder="如：第3课课后练习"
            maxlength="50"
            data-testid="shw-form-title"
            @keyup.enter="saveEditDialog"
          />
        </div>
        <div class="form-field">
          <label>详细描述（可选）</label>
          <el-input
            v-model="dialogContent"
            type="textarea"
            :rows="3"
            placeholder="作业要求、页码范围等"
            data-testid="shw-form-content"
          />
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>截止日期</label>
            <el-input v-model="dialogDueDate" type="date" data-testid="shw-form-due" />
          </div>
          <div class="form-field">
            <label>优先级</label>
            <el-select v-model="dialogPriority" data-testid="shw-form-priority">
              <el-option v-for="p in PRIORITY_OPTIONS" :key="p.value" :value="p.value" :label="p.label" />
            </el-select>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="ewt-dialog-footer">
          <el-button @click="closeEditDialog">取消</el-button>
          <el-button type="primary" data-testid="shw-form-save" @click="saveEditDialog">保存</el-button>
          <el-button v-if="editingId" type="danger" data-testid="shw-form-delete" @click="handleDelete(editingId)">删除</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.shw-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;
  padding: 16px;
}


.shw-filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.shw-subject-tabs,
.shw-status-tabs {
  display: flex;
  flex-wrap: wrap;
}

.shw-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ===== 表格容器 ===== */
.shw-list {
  flex: 1 1 auto;
  min-height: 240px;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.shw-list > :global(.el-table) {
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
.shw-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.shw-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .shw-list > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(html.dark) .shw-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .shw-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
.shw-list > :global(.el-table .el-table__body-wrapper .cell),
.shw-list > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
}

/* ===== 行状态着色（仅首个单元格左侧色条，其余保持默认细边框，对齐教育经历表格） ===== */
.shw-list > :global(.el-table .el-table__row.shw-row-pending td.el-table__cell:first-child) {
  border-left: 3px solid #6b7280;
}
.shw-list > :global(.el-table .el-table__row.shw-row-doing td.el-table__cell:first-child) {
  border-left: 3px solid #3b82f6;
}
.shw-list > :global(.el-table .el-table__row.shw-row-overdue td.el-table__cell:first-child) {
  border-left: 3px solid #ef4444;
}
.shw-list > :global(.el-table .el-table__row.shw-row-done td.el-table__cell:first-child) {
  border-left: 3px solid #10b981;
}
.shw-list > :global(.el-table .el-table__row.shw-row-done td.el-table__cell) {
  opacity: 0.75;
}

/* ===== 分页条 ===== */
.shw-pager {
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
:global(html.dark) .shw-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}
.shw-pager > :global(.el-pagination) {
  --el-pagination-bg-color: transparent;
}
.shw-pager > :global(.el-pagination button),
.shw-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #ffffff) !important;
  border: 1px solid var(--color-border, #e5e7eb) !important;
  color: var(--color-text-secondary, #6b7280) !important;
}
.shw-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
:global(html.dark) .shw-pager > :global(.el-pagination button),
:global(html.dark) .shw-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #1f2937) !important;
  border-color: var(--color-border, #374151) !important;
  color: var(--color-text-secondary, #d1d5db) !important;
}
:global(html.dark) .shw-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
.shw-pager > :global(.el-pagination__total) {
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
}

.shw-subject-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.12);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-link, #3b82f6);
  white-space: nowrap;
  line-height: 1.6;
}
:global(html.dark) .shw-subject-badge {
  background: rgba(59, 130, 246, 0.22);
}

.shw-due { font-weight: 500; }
.shw-due.overdue { color: #ef4444; }
.shw-due.today { color: #f59e0b; }
.shw-due.tomorrow { color: #3b82f6; }
.shw-due-text {
  font-size: 10px;
  margin-top: 2px;
  color: var(--color-text-muted, #6b7280);
}
.shw-due-text:empty { display: none; }
.shw-priority {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  line-height: 1.6;
}
.shw-priority-high { background: rgba(239, 68, 68, 0.12); color: #ef4444; }
.shw-priority-normal { background: rgba(107, 114, 128, 0.15); color: #6b7280; }
.shw-priority-low { background: rgba(156, 163, 175, 0.15); color: #9ca3af; }
.shw-status {
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
  font-size: 11px;
  white-space: nowrap;
}
.shw-status.shw-status-pending { background: #f3f4f6; color: #6b7280; }
.shw-status.shw-status-doing { background: rgba(59, 130, 246, 0.12); color: #3b82f6; }
.shw-status.shw-status-overdue { background: rgba(239, 68, 68, 0.12); color: #ef4444; }
.shw-status.shw-status-done { background: rgba(16, 185, 129, 0.12); color: #10b981; }

.shw-edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 9px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary, #6b7280);
  cursor: pointer;
  font-size: 12px;
  margin-right: 6px;
  transition: all 0.15s;
}
.shw-edit-btn:hover {
  background: var(--color-hover, #f3f4f6);
  color: var(--color-link, #3b82f6);
  border-color: rgba(59, 130, 246, 0.4);
}
.shw-advance-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text-secondary, #6b7280);
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
}
.shw-advance-btn:hover {
  background: var(--color-hover, #f3f4f6);
}
.shw-advance-btn.shw-status-pending { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.shw-advance-btn.shw-status-doing { background: rgba(16, 185, 129, 0.1); color: #10b981; }
.shw-advance-btn.shw-status-overdue { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.shw-done-mark {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #10b981;
  font-size: 11px;
}

.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
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
.form-row {
  display: flex;
  gap: 12px;
}
.form-row .form-field { flex: 1; }
.shw-custom-toggle {
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-muted, #6b7280);
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
  .shw-shell { padding: 12px; }
}

@media (max-width: 480px) {
  .shw-dialog :deep(.el-dialog) {
    width: 92vw !important;
    max-width: 92vw;
  }
}

.shw-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>