<script setup lang="ts">
// 学生工作台阅读记录面板（M2）
// 布局：顶部工具条 + 统计卡 + 行式列表 + 分页 + 编辑弹框（含家长签字）
// 数据：useStudentReadingStore（独立 IDB store 'student_reading'，严格隔离成人数据）
// 家长签字：K 段强制（默认勾选且不可取消）/ P 1-3 年级可选 / J 段隐藏开关
// 行高 80px（M2 估值，待 row-heights.json 实测后校准）

import { computed, onMounted, ref } from 'vue'
import { useStudentReadingStore } from '@/stores/studentReading'
import { useStudentSettingsStore } from '@/stores/studentSettings'
import { useToast } from '@/composables/useToast'
import { localToday } from '@/composables/todoCore'
import { formatDuration } from '@/composables/studentReadingCore'
import type { StudentReadingEntry } from '@/types'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from '@/components/workbench/PanelPager.vue'
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

// 自适应分页（卡片网格 5 列，行高 210px，每页 2 行 = 10 卡；row-heights.json studentReading MAX 208 + 2）
const mainEl = ref<HTMLElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const paging = usePanelPaging({
  items: () => viewEntries.value,
  rowHeight: 102,
  containerRef: mainEl,
  gridRef: listEl
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev, goto } = paging

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
  // K 段默认勾选家长签字
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
  // K 段强制家长签字
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
    goto(1)
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
    goto(1)
  }
  readingErrorToast(result)
}

async function handleToggleSign(id: string): Promise<void> {
  // K 段不允许取消签字
  if (parentSignForced.value) {
    toast.info('K 段阅读记录需家长签字，不可取消')
    return
  }
  const result = await store.toggleParentSign(id)
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
      <button class="btn-primary sr-add-btn" data-testid="sr-add-btn" @click="openAddDialog">
        <Icon name="plus" :size="16" /> 新增记录
      </button>
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

    <div ref="mainEl" class="sr-main">
      <div v-if="viewEntries.length === 0" class="empty-state" data-testid="sr-empty">
        <p>还没有阅读记录，点上方「新增记录」开始吧</p>
      </div>

      <div v-else ref="listEl" class="sr-list" :class="{ 'sr-list-scroll': !fitsOnePage }">
        <TransitionGroup name="list">
          <div
            v-for="e in pageItems"
            :key="e.id"
            class="sr-card"
            :class="{ 'is-signed': e.parentSigned }"
            :data-testid="`sr-card-${e.id}`"
            @click="openEditDialog(e.id)"
          >
            <div class="sr-book-title" :title="e.bookTitle">{{ e.bookTitle }}</div>
            <div class="sr-card-info">
              <span class="sr-pages">{{ e.pages }}页</span>
              <span class="sr-date">{{ e.date }}</span>
            </div>
            <button
              v-if="parentSignVisible"
              class="sr-sign-btn"
              :class="{ 'is-signed': e.parentSigned, 'is-locked': parentSignForced }"
              :data-testid="`sr-sign-${e.id}`"
              :title="e.parentSigned ? '家长已签字' : '家长签字'"
              @click.stop="handleToggleSign(e.id)"
            >
              <Icon name="check" :size="12" />
            </button>
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
}
.sr-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.sr-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
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
}
.sr-list {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  align-content: start;
  flex: 1;
  min-height: 0;
}
.sr-list-scroll {
  overflow-y: auto;
}

.sr-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  height: 100px;
  min-height: 100px;
  padding: 6px 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-left: 3px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.sr-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.sr-card.is-signed {
  border-left-color: #10b981;
  background: rgba(16, 185, 129, 0.04);
}

.sr-book-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sr-card-info {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  align-items: center;
  font-size: 11px;
  color: var(--color-text-muted, #6b7280);
  line-height: 1.2;
}
.sr-pages { font-weight: 500; color: var(--color-text, #1f2937); }
.sr-date { opacity: 0.85; }
.sr-sign-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 8px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text, #1f2937);
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
}
.sr-sign-btn:hover { background: var(--color-hover, #f3f4f6); }
.sr-sign-btn.is-signed {
  border-color: #10b981;
  color: #10b981;
  background: rgba(16, 185, 129, 0.08);
}
.sr-sign-btn.is-locked { cursor: not-allowed; opacity: 0.7; }

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

.list-enter-active, .list-leave-active { transition: all 0.25s ease; }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateX(-8px); }

@media (max-width: 768px) {
  .sr-shell { padding: 12px; }
  .sr-stats { grid-template-columns: repeat(2, 1fr); }
  .sr-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sr-card { height: auto; min-height: 100px; }
}
</style>
