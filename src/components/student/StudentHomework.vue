<script setup lang="ts">
// 学生工作台作业管理面板（M2）
// 布局：顶部工具条 + 学科筛选 tabs + 状态筛选 tabs + 行式卡片列表 + 分页
// 数据：useStudentHomeworkStore（独立 IDB store 'student_homework'，严格隔离成人数据）
// 学科下拉来自 studentSettings.subjects（学段默认或用户自定义）
// 行高 80px（M2 估值，待 row-heights.json 实测后校准）

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
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from '@/components/workbench/PanelPager.vue'
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

// ===== 自适应分页（4 列卡片网格，行高 152px，参考学习计划 150 + 2）=====
const mainEl = ref<HTMLElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const paging = usePanelPaging({
  items: () => viewEntries.value,
  rowHeight: 152,
  containerRef: mainEl,
  gridRef: listEl
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev, goto } = paging

watch([activeSubject, activeStatus], () => goto(1))

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
      <button class="btn-primary shw-add-btn" data-testid="shw-add-btn" @click="openAddDialog">
        <Icon name="plus" :size="16" /> 新增作业
      </button>
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

    <div ref="mainEl" class="shw-main">
      <div v-if="viewEntries.length === 0" class="empty-state" data-testid="shw-empty">
        <p>还没有作业，点上方「新增作业」开始吧</p>
      </div>

      <div v-else ref="listEl" class="shw-list" :class="{ 'shw-list-scroll': !fitsOnePage }">
        <TransitionGroup name="list">
          <div
            v-for="e in pageItems"
            :key="e.id"
            class="shw-card"
            :class="statusBadgeClass(e.status)"
            :data-testid="`shw-card-${e.id}`"
            @click="openEditDialog(e.id)"
          >
            <div class="shw-card-left">
              <span class="shw-subject-badge">{{ e.subject }}</span>
            </div>
            <div class="shw-card-main">
              <div class="shw-card-title" :title="e.title">{{ e.title }}</div>
              <span class="shw-priority" :class="`shw-priority-${e.priority}`" :data-testid="`shw-priority-${e.id}`">
                优先级 {{ priorityLabel(e.priority) }}
              </span>
              <div class="shw-card-sub" v-if="e.content">{{ e.content }}</div>
            </div>
            <div class="shw-card-info">
              <span class="shw-due" :class="{ overdue: dueInfo(e.dueDate, e.status).isOverdue, today: dueInfo(e.dueDate, e.status).isToday, tomorrow: dueInfo(e.dueDate, e.status).isTomorrow }">
                {{ dueInfo(e.dueDate, e.status).text }}
              </span>
              <span class="shw-date">截止 {{ e.dueDate }}</span>
              <span class="shw-status" :class="statusBadgeClass(e.status)" :data-testid="`shw-status-${e.id}`">
                {{ statusLabel(e.status) }}
              </span>
            </div>
            <div class="shw-card-actions">
              <button
                v-if="e.status !== 'done'"
                class="shw-advance-btn"
                :class="statusBadgeClass(e.status)"
                :data-testid="`shw-advance-${e.id}`"
                :title="`推进到「${nextStatusLabel(e.status)}」`"
                @click.stop="handleAdvanceStatus(e.id)"
              >
                <Icon name="check" :size="14" />
                <span>{{ nextStatusLabel(e.status) }}</span>
              </button>
              <span v-else class="shw-done-mark" :data-testid="`shw-done-${e.id}`">
                <Icon name="check" :size="14" /> 已完成
              </span>
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
}
.shw-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

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
  overflow: hidden;
}
.shw-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  align-content: start;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.shw-list-scroll {
  overflow-y: auto;
}

.shw-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 150px;
  min-height: 150px;
  padding: 6px 10px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-left: 3px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.shw-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.shw-card.shw-status-pending { border-left-color: #6b7280; }
.shw-card.shw-status-doing { border-left-color: #3b82f6; background: var(--color-primary-soft, rgba(59, 130, 246, 0.04)); }
.shw-card.shw-status-overdue { border-left-color: #ef4444; background: rgba(239, 68, 68, 0.04); }
.shw-card.shw-status-done { border-left-color: #10b981; opacity: 0.75; }

.shw-card-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.shw-subject-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 6px;
  background: var(--color-hover, #f3f4f6);
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text, #1f2937);
}

.shw-card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.shw-card-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.shw-card-sub {
  font-size: 11px;
  color: var(--color-text-muted, #6b7280);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shw-card-info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--color-text-muted, #6b7280);
}
.shw-due { font-weight: 500; }
.shw-due.overdue { color: #ef4444; }
.shw-due.today { color: #f59e0b; }
.shw-due.tomorrow { color: #3b82f6; }
.shw-date { font-size: 10px; opacity: 0.7; }
.shw-priority {
  align-self: flex-start;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--color-hover, #f3f4f6);
  font-size: 10px;
}
.shw-priority-high { color: #ef4444; }
.shw-priority-normal { color: #6b7280; }
.shw-priority-low { color: #9ca3af; }
.shw-status {
  padding: 0 4px;
  border-radius: 3px;
  font-weight: 500;
  font-size: 10px;
}
.shw-status.shw-status-pending { background: #f3f4f6; color: #6b7280; }
.shw-status.shw-status-doing { background: rgba(59, 130, 246, 0.12); color: #3b82f6; }
.shw-status.shw-status-overdue { background: rgba(239, 68, 68, 0.12); color: #ef4444; }
.shw-status.shw-status-done { background: rgba(16, 185, 129, 0.12); color: #10b981; }

.shw-card-actions {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
}
.shw-advance-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 4px;
  background: transparent;
  color: var(--color-text, #1f2937);
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
}
.shw-advance-btn:hover {
  background: var(--color-hover, #f3f4f6);
}
.shw-advance-btn.shw-status-pending { border-color: #3b82f6; color: #3b82f6; }
.shw-advance-btn.shw-status-doing { border-color: #10b981; color: #10b981; }
.shw-advance-btn.shw-status-overdue { border-color: #3b82f6; color: #3b82f6; }
.shw-done-mark {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #10b981;
  font-size: 11px;
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
.dialog-header h3 { margin: 0; font-size: 16px; }
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
  border-radius: 6px;
  background: var(--color-surface, #fff);
  color: inherit;
  font-size: 14px;
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
  .shw-card { height: 150px; min-height: 150px; }
  .shw-card-info { align-items: flex-start; }
}
</style>
