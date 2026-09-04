<script setup lang="ts">
// 学生工作台阅读记录面板（M2）
// 布局：顶部工具条 + 统计卡 + el-table 表格列表 + el-pagination + 编辑弹框（含家长签字）
// 数据：useStudentReadingStore（独立 IDB store 'student_reading'，严格隔离成人数据）
// 家长签字：K 段强制（默认勾选且不可取消）/ P 1-3 年级可选 / J 段隐藏开关

import { computed, onMounted, ref } from 'vue'
import { useStudentReadingStore } from '@/stores/studentReading'
import { useStudentSettingsStore } from '@/stores/studentSettings'
import { useToast } from '@/composables/useToast'
import { localToday } from '@/composables/todoCore'
import type { StudentReadingEntry } from '@/types'
import Icon from '@/components/Icon.vue'

const store = useStudentReadingStore()
const settingsStore = useStudentSettingsStore()
const toast = useToast()

const today = localToday()

// K 段强制家长签字（默认勾选、不可取消）；P 段可选；J 段不显示开关
const stage = computed(() => settingsStore.stage)
const parentSignForced = computed(() => stage.value === 'K')
const parentSignVisible = computed(() => stage.value === 'K' || stage.value === 'P')

// 统计卡数据（薄委托 core）
const stats = computed(() => store.stats())

// 视图数据（已排序，store 加载时排好）
const viewEntries = computed<StudentReadingEntry[]>(() => store.entries)

// ===== 分页：Element Plus el-pagination，固定 10 条/页 =====
const LIST_PAGE_SIZE = 10
const listPage = ref(1)
const listPageItems = computed<StudentReadingEntry[]>(() => {
  const start = (listPage.value - 1) * LIST_PAGE_SIZE
  return viewEntries.value.slice(start, start + LIST_PAGE_SIZE)
})

// 错误 toast
const READING_ERROR_MESSAGES: Record<string, string> = {
  empty: '书名、日期不能为空',
  'invalid-range': '页数 1-999、时长 1-480 分钟',
  'not-found': '阅读记录不存在'
}
function readingErrorToast(result: { ok: boolean; reason?: string }): void {
  if (result.ok) return
  toast.error(READING_ERROR_MESSAGES[result.reason ?? ''] ?? '操作失败')
}

// 新增/编辑弹框
const showEditDialog = ref(false)
const editingId = ref<string | null>(null)
const dialogBookTitle = ref('')
const dialogPages = ref<number>(1)
const dialogDurationMin = ref<number>(15)
const dialogImpression = ref('')
const dialogDate = ref(today)
const dialogParentSigned = ref(false)

function openAddDialog(): void {
  editingId.value = null
  dialogBookTitle.value = ''
  dialogPages.value = 1
  dialogDurationMin.value = 15
  dialogImpression.value = ''
  dialogDate.value = today
  dialogParentSigned.value = parentSignForced.value
  showEditDialog.value = true
}

function openEditDialog(id: string): void {
  const e = store.entries.find(x => x.id === id)
  if (!e) return
  editingId.value = e.id
  dialogBookTitle.value = e.bookTitle
  dialogPages.value = e.pages
  dialogDurationMin.value = e.durationMin
  dialogImpression.value = e.impression ?? ''
  dialogDate.value = e.date
  dialogParentSigned.value = !!e.parentSigned
  showEditDialog.value = true
}

function closeEditDialog(): void {
  showEditDialog.value = false
  editingId.value = null
}

async function saveEditDialog(): Promise<void> {
  const bookTitle = dialogBookTitle.value.trim()
  if (!bookTitle || !dialogDate.value) {
    toast.error('书名、日期不能为空')
    return
  }
  const parentSigned = parentSignForced.value ? true : dialogParentSigned.value
  if (editingId.value !== null) {
    const result = await store.updateReading(editingId.value, {
      bookTitle,
      pages: dialogPages.value,
      durationMin: dialogDurationMin.value,
      impression: dialogImpression.value,
      date: dialogDate.value,
      parentSigned
    })
    if (result.ok) closeEditDialog()
    readingErrorToast(result)
    return
  }
  const result = await store.addReading({
    bookTitle,
    pages: dialogPages.value,
    durationMin: dialogDurationMin.value,
    impression: dialogImpression.value,
    date: dialogDate.value,
    parentSigned
  })
  if (result.ok) {
    closeEditDialog()
    listPage.value = 1
  }
  readingErrorToast(result)
}

async function handleDelete(id: string): Promise<void> {
  const e = store.entries.find(x => x.id === id)
  if (!e) return
  if (!confirm(`确定要删除「${e.bookTitle}」的阅读记录吗？`)) return
  const result = await store.deleteReading(id)
  if (result.ok) {
    if (editingId.value === id) closeEditDialog()
    listPage.value = 1
  }
  readingErrorToast(result)
}

onMounted(async () => {
  await store.loadReading()
})
</script>

<template>
  <div class="sr-shell">
    <div class="sr-toolbar">
      <h2 class="sr-title">阅读记录</h2>
      <div class="sr-toolbar-right">
        <div class="sr-count">共 {{ viewEntries.length }} 条</div>
        <button class="btn-add sr-add-btn" data-testid="sr-add-btn" @click="openAddDialog">
          <span>＋ 新增记录</span>
        </button>
      </div>
    </div>

    <div class="sr-stats">
      <div class="sr-stat-card">
        <div class="sr-stat-label">总记录</div>
        <div class="sr-stat-value">{{ stats.totalEntries }} 条</div>
      </div>
      <div class="sr-stat-card">
        <div class="sr-stat-label">总页数</div>
        <div class="sr-stat-value">{{ stats.totalPages }} 页</div>
      </div>
      <div class="sr-stat-card">
        <div class="sr-stat-label">总时长</div>
        <div class="sr-stat-value">{{ store.formatReadingDuration(stats.totalDurationMin) }}</div>
      </div>
      <div class="sr-stat-card">
        <div class="sr-stat-label">日均页数</div>
        <div class="sr-stat-value">{{ stats.avgPagesPerDay }} 页</div>
      </div>
    </div>

    <div class="sr-main">
      <!-- 表格区（Element Plus Table） -->
      <div class="sr-list">
        <el-table
          :data="listPageItems"
          stripe
          border
          size="default"
          style="width: 100%"
          height="100%"
          empty-text="还没有阅读记录，点上方「新增记录」开始吧"
        >
          <el-table-column label="书名" min-width="200" align="left" show-overflow-tooltip>
            <template #default="{ row }">
              <span style="font-weight: 600;">📖 {{ row.bookTitle }}</span>
            </template>
          </el-table-column>
          <el-table-column label="日期" width="120" align="center">
            <template #default="{ row }">{{ row.date }}</template>
          </el-table-column>
          <el-table-column label="页数" width="90" align="right">
            <template #default="{ row }">
              <span style="font-variant-numeric: tabular-nums;">{{ row.pages }} 页</span>
            </template>
          </el-table-column>
          <el-table-column label="时长" width="110" align="center">
            <template #default="{ row }">
              <span class="sr-duration-badge">⏱ {{ store.formatReadingDuration(row.durationMin) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="读后感" min-width="200" align="left" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.impression">{{ row.impression }}</span>
              <span v-else style="color: var(--color-text-secondary, #9ca3af);">—</span>
            </template>
          </el-table-column>
          <el-table-column label="家长签字" width="100" align="center">
            <template #default="{ row }">
              <span v-if="row.parentSigned" class="sr-signed-badge">✓ 已签</span>
              <span v-else class="sr-unsigned">未签</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" align="center" fixed="right">
            <template #default="{ row }">
              <button class="btn-edit" :data-testid="`sr-edit-${row.id}`" @click="openEditDialog(row.id)" style="margin-right:6px;">编辑</button>
              <button class="btn-delete" :data-testid="`sr-delete-${row.id}`" @click="handleDelete(row.id)">删除</button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 分页条 -->
      <div v-if="viewEntries.length > 0" class="sr-list-pager">
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
            <h3>{{ editingId ? '编辑阅读记录' : '新增阅读记录' }}</h3>
            <button class="dialog-close" @click="closeEditDialog"><Icon name="close" :size="18" /></button>
          </div>
          <div class="dialog-body">
            <div class="form-field">
              <label>书名</label>
              <input
                v-model="dialogBookTitle"
                type="text"
                class="form-input"
                placeholder="如：小王子"
                maxlength="50"
                data-testid="sr-form-book"
                @keyup.enter="saveEditDialog"
              />
            </div>
            <div class="form-row">
              <div class="form-field">
                <label>页数（1-999）</label>
                <input v-model.number="dialogPages" type="number" min="1" max="999" class="form-input" data-testid="sr-form-pages" />
              </div>
              <div class="form-field">
                <label>时长（分钟，1-480）</label>
                <input v-model.number="dialogDurationMin" type="number" min="1" max="480" class="form-input" data-testid="sr-form-duration" />
              </div>
            </div>
            <div class="form-field">
              <label>阅读日期</label>
              <input v-model="dialogDate" type="date" class="form-input" data-testid="sr-form-date" />
            </div>
            <div class="form-field">
              <label>读后感（可选）</label>
              <textarea
                v-model="dialogImpression"
                class="form-input form-textarea"
                placeholder="写下你的感悟..."
                rows="3"
                data-testid="sr-form-impression"
              ></textarea>
            </div>
            <div class="form-field" v-if="parentSignVisible">
              <label class="sr-sign-toggle" :class="{ 'is-locked': parentSignForced }">
                <input type="checkbox" v-model="dialogParentSigned" :disabled="parentSignForced" />
                <span>家长签字{{ parentSignForced ? '（K 段必签）' : '' }}</span>
              </label>
            </div>
          </div>
          <div class="dialog-footer">
            <button v-if="editingId" class="btn-danger" data-testid="sr-form-delete" @click="handleDelete(editingId)">
              删除
            </button>
            <div class="dialog-footer-right">
              <button class="btn-ghost" @click="closeEditDialog">取消</button>
              <button class="btn-primary" data-testid="sr-form-save" @click="saveEditDialog">保存</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.sr-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;
  padding: 16px;
}

.sr-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.sr-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}
.sr-toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.sr-count {
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
  white-space: nowrap;
}

/* ===== 新增按钮（与教育经历同款 .btn-add） ===== */
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

.sr-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  flex-shrink: 0;
}
.sr-stat-card {
  padding: 10px 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  text-align: center;
}
.sr-stat-label {
  font-size: 11px;
  color: var(--color-text-muted, #6b7280);
  margin-bottom: 4px;
}
.sr-stat-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
}

.sr-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ===== 表格容器 ===== */
.sr-list {
  flex: 1 1 auto;
  min-height: 240px;
  width: 100%;
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.sr-list > :global(.el-table) {
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
.sr-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.sr-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(:root.dark) .sr-list > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(:root.dark) .sr-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(:root.dark) .sr-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
.sr-list > :global(.el-table .el-table__body-wrapper .cell),
.sr-list > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
}

/* ===== 分页条 ===== */
.sr-list-pager {
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
:global(:root.dark) .sr-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}
.sr-list-pager > :global(.el-pagination) {
  --el-pagination-bg-color: transparent;
}
.sr-list-pager > :global(.el-pagination button),
.sr-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #ffffff) !important;
  border: 1px solid var(--color-border, #e5e7eb) !important;
  color: var(--color-text-secondary, #6b7280) !important;
}
.sr-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
:global(:root.dark) .sr-list-pager > :global(.el-pagination button),
:global(:root.dark) .sr-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #1f2937) !important;
  border-color: var(--color-border, #374151) !important;
  color: var(--color-text-secondary, #d1d5db) !important;
}
:global(:root.dark) .sr-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
.sr-list-pager > :global(.el-pagination__total) {
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
}

/* ===== 表格内徽章 ===== */
.sr-duration-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}
:global(:root.dark) .sr-duration-badge {
  background: rgba(59, 130, 246, 0.2);
}
.sr-signed-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}
.sr-unsigned {
  font-size: 12px;
  color: var(--color-text-muted, #9ca3af);
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

/* ===== 弹框 ===== */
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
.form-row { display: flex; gap: 12px; }
.form-row .form-field { flex: 1; }
.sr-sign-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-weight: 400;
}
.sr-sign-toggle.is-locked { color: var(--color-text-muted, #6b7280); }
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

@media (max-width: 768px) {
  .sr-shell { padding: 12px; }
  .sr-stats { grid-template-columns: repeat(2, 1fr); }
}
</style>
