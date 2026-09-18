<script setup lang="ts">
import { useViewMode } from '@/composables/useViewMode'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'

const vm = useViewMode()

function cardFields(row: any) {
  return [
    { label: '书名', value: row.bookTitle },
    { label: '日期', value: row.date },
    { label: '页数', value: row.pages + ' 页' },
    { label: '时长', value: store.formatReadingDuration(row.durationMin) },
    { label: '读后感', value: row.impression || '—' },
    { label: '家长签字', value: row.parentSigned ? '✓ 已签' : '未签' }
  ]
}

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
import StudentToolbar from '@/components/student/StudentToolbar.vue'
import { usePageSize } from '@/composables/usePageSize'

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
const { pageSize, PAGE_SIZES } = usePageSize('sr-list-pager', LIST_PAGE_SIZE)
const listPage = ref(1)
const listPageItems = computed<StudentReadingEntry[]>(() => {
  const start = (listPage.value - 1) * pageSize.value
  return viewEntries.value.slice(start, start + pageSize.value)
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
    <StudentToolbar title="阅读记录" />

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
      <!-- 表格区（Element Plus Table）：左上新增 + 右上视图切换 -->
      <div class="ewt-table-toolbar is-split">
        <div class="sr-toolbar-left">
          <el-button type="primary" size="small" class="sr-add-btn" data-testid="sr-add-btn" @click="openAddDialog">
            ＋ 新增记录
          </el-button>
        </div>
        <ViewModeToggle :mode="vm.mode" @toggle="vm.toggle" />
      </div>
      <div class="sr-list">
        <el-table v-if="vm.mode === 'list'" class="ewt-table"
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
          <el-table-column label="操作" class-name="ewt-op-col" width="150" align="center" fixed="right">
            <template #default="{ row }">
              <el-button
                size="small"
                class="sr-edit-btn"
                :data-testid="`sr-edit-${row.id}`"
                @click="openEditDialog(row.id)"
              >编辑</el-button>
              <el-button
                size="small"
                class="sr-delete-btn"
                :data-testid="`sr-delete-${row.id}`"
                @click="handleDelete(row.id)"
              >删除</el-button>
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

      <!-- 分页条 -->
      <div v-if="viewEntries.length > 0" class="sr-list-pager ewt-pager">
        <el-pagination
          v-model:current-page="listPage"
          @size-change="listPage = 1"
          v-model:page-size="pageSize"
          :page-sizes="PAGE_SIZES"
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
      :title="editingId ? '编辑阅读记录' : '新增阅读记录'"
      width="480px"
      class="sr-dialog"
      @close="closeEditDialog"
    >
      <div class="dialog-body">
        <div class="form-field">
          <label>书名</label>
          <el-input
            v-model="dialogBookTitle"
            placeholder="如：小王子"
            :maxlength="50"
            data-testid="sr-form-book"
            @keyup.enter="saveEditDialog"
          />
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>页数（1-999）</label>
            <el-input-number
              v-model="dialogPages"
              :min="1"
              :max="999"
              controls-position="right"
              class="sr-form-number"
              data-testid="sr-form-pages"
            />
          </div>
          <div class="form-field">
            <label>时长（分钟，1-480）</label>
            <el-input-number
              v-model="dialogDurationMin"
              :min="1"
              :max="480"
              controls-position="right"
              class="sr-form-number"
              data-testid="sr-form-duration"
            />
          </div>
        </div>
        <div class="form-field">
          <label>阅读日期</label>
          <el-input v-model="dialogDate" type="date" data-testid="sr-form-date" />
        </div>
        <div class="form-field">
          <label>读后感（可选）</label>
          <el-input
            v-model="dialogImpression"
            type="textarea"
            placeholder="写下你的感悟..."
            :rows="3"
            data-testid="sr-form-impression"
          />
        </div>
        <div class="form-field" v-if="parentSignVisible">
          <el-checkbox
            v-model="dialogParentSigned"
            :disabled="parentSignForced"
            class="sr-sign-toggle"
            :class="{ 'is-locked': parentSignForced }"
          >家长签字{{ parentSignForced ? '（K 段必签）' : '' }}</el-checkbox>
        </div>
      </div>
      <template #footer>
        <div class="ewt-dialog-footer">
          <el-button @click="closeEditDialog">取消</el-button>
          <el-button type="primary" data-testid="sr-form-save" @click="saveEditDialog">保存</el-button>
          <el-button
            v-if="editingId"
            type="danger"
            data-testid="sr-form-delete"
            @click="handleDelete(editingId)"
          >删除</el-button>
        </div>
      </template>
    </el-dialog>
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
  --el-table-row-hover-bg-color: rgba(16, 185, 129, 0.06);
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
:global(html.dark) .sr-list > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(html.dark) .sr-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .sr-list > :global(.el-table td.el-table__cell) {
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
  margin: 0 0 8px;
  display: flex;
  justify-content: center;
  align-items: center;
}
:global(html.dark) .sr-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
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
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}
:global(html.dark) .sr-duration-badge {
  background: rgba(16, 185, 129, 0.2);
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

/* ===== 表格内编辑/删除按钮 ===== */
.sr-edit-btn {
  color: var(--color-link, #3b82f6);
}
.sr-delete-btn {
  color: #ef4444;
}

/* ===== 弹框 ===== */
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
.form-row { display: flex; gap: 12px; }
.form-row .form-field { flex: 1; }
.sr-form-number {
  width: 100%;
}
.sr-sign-toggle {
  font-weight: 400;
}
.sr-sign-toggle.is-locked {
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
  .sr-shell { padding: 12px; }
  .sr-stats { grid-template-columns: repeat(2, 1fr); }
  .form-row { flex-direction: column; }
}

@media (max-width: 480px) {
  .sr-dialog :deep(.el-dialog) {
    width: 92vw !important;
    max-width: 92vw;
  }
}

.sr-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
