<script setup lang="ts">
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
    <div class="shw-toolbar">
      <h2 class="shw-title">作业管理</h2>
      <div class="shw-toolbar-right">
        <div class="shw-count">共 {{ viewEntries.length }} 条</div>
        <button class="btn-add shw-add-btn" data-testid="shw-add-btn" @click="openAddDialog">
          <span>＋ 新增作业</span>
        </button>
      </div>
    </div>

    <div class="shw-filters">
      <div class="shw-subject-tabs">
        <button
          v-for="tab in subjectTabs"
          :key="tab.key"
          class="shw-tab"
          :class="{ active: activeSubject === tab.key }"
          :data-testid="`shw-subject-${tab.key}`"
          @click="activeSubject = tab.key"
        >{{ tab.label }}</button>
      </div>
      <div class="shw-status-tabs">
        <button
          v-for="tab in STATUS_FILTERS"
          :key="tab.key"
          class="shw-tab shw-status-tab"
          :class="{ active: activeStatus === tab.key }"
          :data-testid="`shw-status-${tab.key}`"
          @click="activeStatus = tab.key"
        >{{ tab.label }}</button>
      </div>
    </div>

    <div class="shw-main">
      <!-- 表格区（Element Plus Table） -->
      <div class="shw-list">
        <el-table
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
              <div class="shw-due-text">{{ dueInfo(row.dueDate, row.status).text }}</div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <span class="shw-status" :class="statusBadgeClass(row.status)" :data-testid="`shw-status-${row.id}`">
                {{ statusLabel(row.status) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="170" align="center" fixed="right">
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

    <Teleport to="body">
      <div v-if="showEditDialog" class="dialog-overlay" @click.self="closeEditDialog">
        <div class="dialog st-dialog">
          <div class="dialog-header">
            <h3>{{ editingId ? '编辑作业' : '新增作业' }}</h3>
            <button class="dialog-close" @click="closeEditDialog"><Icon name="close" :size="18" /></button>
          </div>
          <div class="dialog-body">
            <div class="form-field">
              <label>学科</label>
              <select v-if="!dialogSubjectCustom" v-model="dialogSubject" class="form-input" data-testid="shw-form-subject">
                <option v-for="s in settingsStore.subjects" :key="s" :value="s">{{ s }}</option>
              </select>
              <input
                v-else
                v-model="dialogSubject"
                type="text"
                class="form-input"
                placeholder="输入学科名称"
                maxlength="10"
                data-testid="shw-form-subject-custom"
              />
              <label class="shw-custom-toggle">
                <input type="checkbox" v-model="dialogSubjectCustom" /> 自定义学科
              </label>
            </div>
            <div class="form-field">
              <label>作业标题</label>
              <input
                v-model="dialogTitle"
                type="text"
                class="form-input"
                placeholder="如：第3课课后练习"
                maxlength="50"
                data-testid="shw-form-title"
                @keyup.enter="saveEditDialog"
              />
            </div>
            <div class="form-field">
              <label>详细描述（可选）</label>
              <textarea
                v-model="dialogContent"
                class="form-input form-textarea"
                placeholder="作业要求、页码范围等"
                rows="3"
                data-testid="shw-form-content"
              ></textarea>
            </div>
            <div class="form-row">
              <div class="form-field">
                <label>截止日期</label>
                <input v-model="dialogDueDate" type="date" class="form-input" data-testid="shw-form-due" />
              </div>
              <div class="form-field">
                <label>优先级</label>
                <select v-model="dialogPriority" class="form-input" data-testid="shw-form-priority">
                  <option v-for="p in PRIORITY_OPTIONS" :key="p.value" :value="p.value">{{ p.label }}</option>
                </select>
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <button v-if="editingId" class="btn-danger" data-testid="shw-form-delete" @click="handleDelete(editingId)">
              删除
            </button>
            <div class="dialog-footer-right">
              <button class="btn-ghost" @click="closeEditDialog">取消</button>
              <button class="btn-primary" data-testid="shw-form-save" @click="saveEditDialog">保存</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
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

.shw-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px 8px;
  flex-shrink: 0;
}
.shw-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}
.shw-toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.shw-count {
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
  white-space: nowrap;
}
/* ===== 新增按钮（与教育经历面板同款 .btn-add 翠绿胶囊） ===== */
.btn-add {
  padding: 8px 16px;
  background: var(--color-primary, #10b981);
  color: #fff;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
  box-shadow: 0 2px 4px rgba(16, 185, 129, 0.18);
  white-space: nowrap;
}
.btn-add:hover { opacity: 0.92; transform: translateY(-1px); }

.shw-filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.shw-subject-tabs,
.shw-status-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.shw-tab {
  padding: 5px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 14px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}
.shw-tab:hover {
  background: var(--color-hover, #f3f4f6);
}
.shw-tab.active {
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
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
  padding: 0 16px;
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
:global(:root.dark) .shw-list > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(:root.dark) .shw-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(:root.dark) .shw-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
.shw-list > :global(.el-table .el-table__body-wrapper .cell),
.shw-list > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
}

/* ===== 行状态着色（左边框/底色，仿旧卡片） ===== */
.shw-list > :global(.el-table .el-table__row.shw-row-pending td.el-table__cell) {
  border-left: 3px solid #6b7280;
}
.shw-list > :global(.el-table .el-table__row.shw-row-doing td.el-table__cell) {
  border-left: 3px solid #3b82f6;
}
.shw-list > :global(.el-table .el-table__row.shw-row-overdue td.el-table__cell) {
  border-left: 3px solid #ef4444;
}
.shw-list > :global(.el-table .el-table__row.shw-row-done td.el-table__cell) {
  border-left: 3px solid #10b981;
  opacity: 0.75;
}

/* ===== 分页条 ===== */
.shw-pager {
  flex: 0 0 auto;
  padding: 14px 16px 18px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
  margin: 0 16px 8px;
  display: flex;
  justify-content: center;
  align-items: center;
}
:global(:root.dark) .shw-pager {
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
:global(:root.dark) .shw-pager > :global(.el-pagination button),
:global(:root.dark) .shw-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #1f2937) !important;
  border-color: var(--color-border, #374151) !important;
  color: var(--color-text-secondary, #d1d5db) !important;
}
:global(:root.dark) .shw-pager > :global(.el-pagination .el-pager li.is-active) {
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
:global(:root.dark) .shw-subject-badge {
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
  background: var(--color-bg-soft, #f9fafb);
}
.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.dialog-header h3::before {
  content: '';
  width: 4px;
  height: 16px;
  border-radius: 2px;
  background: var(--color-primary, #3b82f6);
}
:global(:root.dark) .dialog-header {
  background: var(--color-bg-hover, #111827);
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
.form-input {
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  color: inherit;
  font-size: 14px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.form-input:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}
.form-textarea {
  resize: vertical;
  min-height: 60px;
  font-family: inherit;
}
.form-row {
  display: flex;
  gap: 12px;
}
.form-row .form-field { flex: 1; }
.shw-custom-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-muted, #6b7280);
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
.btn-primary:hover { filter: brightness(0.95); }
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

.list-enter-active, .list-leave-active { transition: all 0.25s ease; }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateX(-8px); }

@media (max-width: 768px) {
  .shw-shell { padding: 12px; }
}
</style>
