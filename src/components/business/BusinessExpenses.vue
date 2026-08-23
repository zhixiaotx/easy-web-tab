<script setup lang="ts">
// 支出记录：按天合并卡片（对齐收摊记录），一天一张卡，内联多行支出条目（分类+金额+备注）
// 编辑弹框：多行支出行动态增删；按 date upsert（删除旧行+逐条重加）
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { findExpenseCategory, formatYuanOf, localDateKey, sortExpenses } from '@/composables/businessCore'
import type { BusinessExpense } from '@/types'
import BusinessCategoryManager from './BusinessCategoryManager.vue'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from '@/components/workbench/PanelPager.vue'

const store = useWorkbenchBusinessStore()

const showCatManager = ref(false)

// ===== 按天分组（date 降序） =====
interface ExpenseDayGroup {
  date: string
  items: BusinessExpense[]
  total: number
}
const dayGroups = computed<ExpenseDayGroup[]>(() => {
  const map = new Map<string, BusinessExpense[]>()
  for (const e of sortExpenses(store.expenses)) {
    if (!map.has(e.date)) map.set(e.date, [])
    map.get(e.date)!.push(e)
  }
  return [...map.keys()]
    .sort((a, b) => (a < b ? 1 : -1))
    .map(date => {
      const items = map.get(date)!
      const total = items.reduce((s, i) => s + i.amount, 0)
      return { date, items, total }
    })
})

function catNameOf(id: string): string {
  return findExpenseCategory(store.expenseCategories, id)?.name ?? '未知'
}

// ===== 自适应分页（4 列，rowHeight 估算 260）=====
const listEl = ref<HTMLElement | null>(null)
const gridEl = ref<HTMLElement | null>(null)
const paging = usePanelPaging({
  items: () => dayGroups.value,
  rowHeight: 260,
  gap: 12,
  containerRef: listEl,
  gridRef: gridEl
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev, goto } = paging
watch(dayGroups, () => nextTick(() => goto(1)))

// ===== 折叠/展开明细 =====
const expandedCards = ref<Set<string>>(new Set())
function toggleCard(date: string): void {
  if (expandedCards.value.has(date)) expandedCards.value.delete(date)
  else expandedCards.value.add(date)
}
function isCardExpanded(date: string): boolean {
  return expandedCards.value.has(date)
}
function visibleItems(g: ExpenseDayGroup): BusinessExpense[] {
  return isCardExpanded(g.date) ? g.items : g.items.slice(0, 3)
}

// ===== 新增/编辑弹框（多行支出行） =====
const showDialog = ref(false)
const editingDate = ref(localDateKey())
const editingDateOrig = ref<string | null>(null) // 编辑时的原日期，用于定位删除旧行
const rows = reactive<{ categoryId: string; amount: string; note: string }[]>([])

const isFormValid = computed(
  () =>
    editingDate.value !== '' &&
    rows.length > 0 &&
    rows.every(r => r.categoryId !== '' && Number(r.amount) > 0)
)

function emptyRow(): { categoryId: string; amount: string; note: string } {
  return { categoryId: store.expenseCategories[0]?.id ?? '', amount: '', note: '' }
}

function startAdd(): void {
  editingDateOrig.value = null
  editingDate.value = localDateKey()
  rows.splice(0, rows.length, emptyRow())
  showDialog.value = true
}

function startEdit(g: ExpenseDayGroup): void {
  editingDateOrig.value = g.date
  editingDate.value = g.date
  rows.splice(
    0,
    rows.length,
    ...g.items.map(e => ({
      categoryId: e.categoryId,
      amount: String(e.amount),
      note: e.note ?? ''
    }))
  )
  showDialog.value = true
}

function addRow(): void {
  rows.push(emptyRow())
}

function removeRow(i: number): void {
  rows.splice(i, 1)
}

async function handleSave(): Promise<void> {
  if (!isFormValid.value) return
  // 先删除旧日期下所有支出（若日期变更则删旧日期，也删目标日期确保幂等）
  const datesToClear: string[] = []
  if (editingDateOrig.value) datesToClear.push(editingDateOrig.value)
  if (!datesToClear.includes(editingDate.value)) datesToClear.push(editingDate.value)
  for (const d of datesToClear) {
    for (const old of store.expenses.filter(e => e.date === d)) {
      await store.deleteExpense(old.id)
    }
  }
  // 逐条添加新行
  for (const r of rows) {
    const note = r.note.trim() || undefined
    await store.addExpense({
      date: editingDate.value,
      categoryId: r.categoryId,
      amount: Number(r.amount),
      note
    })
  }
  showDialog.value = false
}

async function handleDeleteGroup(g: ExpenseDayGroup): Promise<void> {
  if (!confirm(`确定要删除 ${g.date} 当天的 ${g.items.length} 笔支出吗？`)) return
  for (const e of g.items) await store.deleteExpense(e.id)
}
</script>

<template>
  <div class="bizexp">
    <!-- 顶部 bar：统计 + ⚙️ 分类管理 + 新增 -->
    <div class="bizexp-bar">
      <div class="bizexp-bar-left">
        <span class="bizexp-count">共 {{ dayGroups.length }} 天（{{ store.expenses.length }} 笔支出）</span>
        <button class="bizexp-cat-btn" data-testid="bizexp-cat-manager" @click="showCatManager = true">⚙️ 支出分类管理</button>
      </div>
      <button class="bizexp-add" data-testid="bizexp-add" @click="startAdd">＋ 新增支出记录</button>
    </div>

    <!-- 卡片网格：一天一张卡 -->
    <div v-if="dayGroups.length === 0" class="bizexp-empty" data-testid="bizexp-empty">暂无支出记录，点击右上角记下今天的第一笔</div>
    <div v-else ref="listEl" class="bizexp-list" :class="{ 'bizexp-list-scroll': !fitsOnePage }" data-testid="bizexp-grid">
      <div ref="gridEl" class="bizexp-grid">
      <div v-for="g in pageItems" :key="g.date" class="bizexp-card" :data-testid="`bizexp-card-${g.date}`">
        <!-- 头部：完整日期 + 当天合计 -->
        <div class="bizexp-head">
          <span class="bizexp-date">{{ g.date }}</span>
          <span class="bizexp-total">{{ formatYuanOf(g.total) }}</span>
        </div>

        <!-- 明细行（折叠前 3 条） -->
        <div class="bizexp-details">
          <div class="bizexp-detail-head">
            <span class="bizexp-detail-th name">分类</span>
            <span class="bizexp-detail-th amount">金额</span>
            <span class="bizexp-detail-th note">备注</span>
          </div>
          <div
            v-for="e in visibleItems(g)"
            :key="e.id"
            class="bizexp-detail-row"
          >
            <span class="bizexp-detail-td name bizexp-cat">{{ catNameOf(e.categoryId) }}</span>
            <span class="bizexp-detail-td amount bizexp-amt">{{ formatYuanOf(e.amount) }}</span>
            <span v-if="e.note" class="bizexp-detail-td note">{{ e.note }}</span>
            <span v-else class="bizexp-detail-td note muted">—</span>
          </div>
          <button
            v-if="g.items.length > 3"
            class="bizexp-detail-toggle"
            @click="toggleCard(g.date)"
          >
            {{ isCardExpanded(g.date) ? '收起' : `展开全部 ${g.items.length} 条` }}
          </button>
        </div>

        <!-- 操作：编辑/删除 -->
        <div class="bizexp-actions">
          <button class="bizexp-btn" :data-testid="`bizexp-edit-${g.date}`" @click="startEdit(g)">编辑</button>
          <button class="bizexp-btn del" :data-testid="`bizexp-del-${g.date}`" @click="handleDeleteGroup(g)">删除</button>
        </div>
      </div>
      </div>
      <PanelPager
        v-if="totalPages > 1"
        :page="currentPage"
        :total="totalPages"
        data-testid="panel-pager"
        @prev="prev()"
        @next="next()"
      />
    </div>

    <!-- 新增/编辑弹框（多行支出） -->
    <div v-if="showDialog" class="biz-dialog-overlay" @click.self="showDialog = false">
      <div class="biz-dialog bizexp-dialog" data-testid="bizexp-dialog">
        <div class="biz-dialog-header">
          <h3>{{ editingDateOrig ? '编辑支出记录' : '新增支出记录' }}</h3>
          <button class="biz-dialog-close" @click="showDialog = false">✕</button>
        </div>
        <form class="biz-dialog-body" @submit.prevent="handleSave">
          <div class="biz-field">
            <label>日期 *（同一天将自动合并到同一张卡片）</label>
            <input v-model="editingDate" type="date" class="biz-input" data-testid="bizexp-form-date" />
          </div>

          <!-- 多行支出行 -->
          <div class="bizexp-rows">
            <div v-for="(row, i) in rows" :key="i" class="bizexp-row" data-testid="bizexp-row">
              <select v-model="row.categoryId" class="biz-input bizexp-row-cat" data-testid="bizexp-row-category">
                <option v-for="cat in store.expenseCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
              </select>
              <input
                v-model="row.amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="金额"
                class="biz-input bizexp-row-amt"
                data-testid="bizexp-row-amount"
              />
              <input
                v-model="row.note"
                type="text"
                maxlength="100"
                placeholder="备注（可选）"
                class="biz-input bizexp-row-note"
                data-testid="bizexp-row-note"
              />
              <button type="button" class="bizexp-btn del" :data-testid="`bizexp-row-del-${i}`" @click="removeRow(i)">移除</button>
            </div>
            <button type="button" class="bizexp-add-row" data-testid="bizexp-row-add" @click="addRow">＋ 添加支出行</button>
          </div>

          <!-- 当天合计预览 -->
          <div class="bizexp-preview">
            当天合计：<strong data-testid="bizexp-form-total">{{ formatYuanOf(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)) }}</strong>
          </div>

          <div class="biz-form-actions">
            <button type="button" class="bizexp-btn" @click="showDialog = false">取消</button>
            <button type="submit" class="bizexp-btn save" :disabled="!isFormValid" data-testid="bizexp-save">
              {{ editingDateOrig ? '保存' : '添加' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <BusinessCategoryManager v-if="showCatManager" kind="expense" @close="showCatManager = false" />
  </div>
</template>

<style scoped>
.bizexp {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-height: 0;
}

.bizexp-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}
.bizexp-list.bizexp-list-scroll {
  overflow-y: auto;
}

@media (max-width: 768px) {
  .bizexp { min-height: 0; }
  .bizexp-list { flex: none; overflow: visible; }
}

.bizexp-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.bizexp-bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.bizexp-count {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.bizexp-cat-btn {
  padding: 7px 12px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizexp-cat-btn:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizexp-add {
  padding: 9px 16px;
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  white-space: nowrap;
}

.bizexp-add:hover {
  filter: brightness(1.08);
}

.bizexp-empty {
  padding: 40px 20px;
  text-align: center;
  font-size: 14px;
  color: var(--text-muted, var(--color-text-muted));
  background: var(--bg-card, var(--color-bg-card));
  border: 1px dashed var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

.bizexp-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
}

.bizexp-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
}

.bizexp-card:hover {
  border-color: var(--accent-color, var(--color-primary));
}

.bizexp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bizexp-date {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.bizexp-total {
  font-size: 18px;
  font-weight: 700;
  color: var(--error-color, var(--color-error));
  font-variant-numeric: tabular-nums;
}

/* 明细行（分类 | 金额 | 备注） */
.bizexp-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bizexp-detail-head {
  display: grid;
  grid-template-columns: 0.9fr 0.7fr 1.4fr;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted, var(--color-text-muted));
  padding: 0 4px 4px;
  border-bottom: 1px solid var(--border-color, var(--color-border));
}

.bizexp-detail-th {
  font-weight: 600;
  text-align: left;
}

.bizexp-detail-row {
  display: grid;
  grid-template-columns: 0.9fr 0.7fr 1.4fr;
  gap: 6px;
  padding: 3px 4px;
  font-size: 12px;
  color: var(--text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
  align-items: center;
}

.bizexp-detail-td {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizexp-detail-td.muted {
  color: var(--text-muted, var(--color-text-muted));
}

/* 分类徽标 + 金额色，直接嵌在明细行 */
.bizexp-cat {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--radius-full, 999px);
  color: var(--accent-color, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--accent-color, #3b82f6) 30%, transparent);
  white-space: nowrap;
  justify-self: start;
}

.bizexp-amt {
  font-weight: 700;
  color: var(--error-color, var(--color-error));
}

.bizexp-detail-toggle {
  align-self: flex-start;
  padding: 4px 8px;
  margin-top: 4px;
  font-size: 11px;
  cursor: pointer;
  color: var(--accent-color, var(--color-primary));
  background: none;
  border: none;
  border-radius: var(--radius-sm, 4px);
}

.bizexp-detail-toggle:hover {
  text-decoration: underline;
}

.bizexp-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.bizexp-btn {
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizexp-btn:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizexp-btn.del:hover {
  color: var(--error-color, var(--color-error));
  border-color: var(--error-color, var(--color-error));
}

.bizexp-btn.save {
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizexp-btn.save:disabled {
  background: var(--text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

/* 弹框多行编辑 */
.bizexp-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bizexp-row {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr 1.4fr auto;
  gap: 8px;
  padding: 8px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border-radius: var(--radius-md, 8px);
  align-items: center;
}

.bizexp-row-cat { min-width: 0; }
.bizexp-row-amt { min-width: 0; }
.bizexp-row-note { min-width: 0; }

.bizexp-add-row {
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
  color: var(--accent-color, var(--color-primary));
  background: none;
  border: 1px dashed var(--accent-color, var(--color-primary));
  border-radius: var(--radius-md, 8px);
}

.bizexp-preview {
  padding: 10px 12px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.bizexp-preview strong {
  color: var(--error-color, var(--color-error));
  font-size: 18px;
  font-weight: 700;
}

/* 复用收摊弹框样式（biz-dialog 类已在 BusinessDaily scoped 外通过全局注入？——这里补定义避免依赖兄弟组件） */
.biz-dialog-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  padding: 20px;
}

.biz-dialog {
  background-color: var(--bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg, 12px);
  width: 100%;
  max-width: 560px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
}

.biz-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, var(--color-border));
}

.biz-dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
}

.biz-dialog-close {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--text-muted, var(--color-text-muted));
  cursor: pointer;
}

.biz-dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.biz-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.biz-field > label {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.biz-form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.biz-input {
  box-sizing: border-box;
  padding: 9px 12px;
  background-color: var(--input-bg, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--text-primary, var(--color-text));
}

.biz-input:focus {
  outline: none;
  border-color: var(--accent-color, var(--color-primary));
}

:root.dark .bizexp-card,
:root.dark .biz-dialog {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .bizexp-date {
  color: var(--text-primary, #f9fafb);
}

:root.dark .bizexp-total,
:root.dark .bizexp-preview strong {
  color: #f87171;
}

:root.dark .bizexp-row {
  background-color: var(--bg-card, #1f2937);
}

:root.dark .bizexp-btn,
:root.dark .bizexp-cat-btn {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .biz-input {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}

@media (max-width: 640px) {
  .bizexp-grid {
    grid-template-columns: 1fr;
  }
  .bizexp-row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
