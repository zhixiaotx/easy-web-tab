<script setup lang="ts">
import { useViewMode } from '@/composables/useViewMode'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'

const vm = useViewMode()

function cardFields(row: any) {
  return [
    { label: '日期', value: row.date },
    { label: '支出合计', value: formatYuanOf(row.total) },
    { label: '笔数', value: row.items.length + ' 笔' },
    { label: '首笔分类', value: catNameOf(row.items[0].categoryId) }
  ]
}

// 支出记录：按天分组 el-table（对齐收摊记录），展开行展示当日支出条目（分类+金额+备注）
import { computed, reactive, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { findExpenseCategory, formatYuanOf, localDateKey, sortExpenses } from '@/composables/businessCore'
import { buildCsv, csvFileName, downloadCsv } from '@/composables/csvExport'
import type { BusinessExpense } from '@/types'
import BusinessCategoryManager from './BusinessCategoryManager.vue'
import Icon from '@/components/Icon.vue'

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

// ===== 一键导出 CSV（支出记录：逐笔展开）=====
function exportExpensesCsv(): void {
  const headers = ['日期', '分类', '金额', '备注']
  const rows: (string | number)[][] = sortExpenses(store.expenses).map(e => [
    e.date,
    catNameOf(e.categoryId),
    e.amount.toFixed(2),
    e.note ?? ''
  ])
  downloadCsv(csvFileName('支出记录'), buildCsv(headers, rows))
}

// ===== el-pagination 分页（固定 10 条/页，每个日组一行） =====
const LIST_PAGE_SIZE = 10
const listPage = ref(1)
const pageItems = computed<ExpenseDayGroup[]>(() => {
  const start = (listPage.value - 1) * LIST_PAGE_SIZE
  return dayGroups.value.slice(start, start + LIST_PAGE_SIZE)
})
watch(dayGroups, () => { listPage.value = 1 })

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
  // 新增模式：同日期已有记录 → 阻止，提示编辑
  if (!editingDateOrig.value && store.expenses.some(e => e.date === editingDate.value)) {
    alert(`${editingDate.value} 当天已有支出记录，不能新增，请点击编辑追加。`)
    return
  }
  // 编辑模式：先删除旧日期下所有支出（若日期变更则删旧日期，也删目标日期确保幂等）
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
    <!-- 顶部 bar：统计 + 分类管理 + 新增 -->
    <div class="bizexp-bar">
      <div class="bizexp-bar-left">
        <span class="bizexp-count">共 {{ dayGroups.length }} 天（{{ store.expenses.length }} 笔支出）</span>
        <el-button size="small" data-testid="bizexp-cat-manager" title="支出分类管理" @click="showCatManager = true"><Icon name="cog" :size="15" /></el-button>
      </div>
      <div class="bizexp-bar-actions">
        <el-button type="primary" data-testid="bizexp-add" @click="startAdd">＋ 新增</el-button>
        <el-button data-testid="bizexp-export" :disabled="store.expenses.length === 0" @click="exportExpensesCsv">导出 CSV</el-button>
      </div>
    </div>

    <!-- el-table 表格列表：一天一行，展开行展示当日支出条目 -->
    <div v-if="dayGroups.length === 0" class="bizexp-empty" data-testid="bizexp-empty">暂无支出记录，点击右上角记下今天的第一笔</div>
    <template v-else>
      <div class="ewt-table-toolbar"><ViewModeToggle :mode="vm.mode" @toggle="vm.toggle" /></div>
      <div class="bizexp-table-wrap">
        <el-table v-if="vm.mode === 'list'" class="ewt-table"
          :data="pageItems"
          data-testid="bizexp-table"
          stripe
          border
          size="default"
          style="width: 100%"
          height="100%"
          empty-text="暂无支出记录"
          row-key="date"
        >
          <!-- 展开行：当日支出条目明细 -->
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="bizexp-expand" @click.stop>
                <div class="bizexp-expand-title">支出明细（{{ row.items.length }} 笔）</div>
                <div class="bizexp-detail-head">
                  <span class="bizexp-detail-th name">分类</span>
                  <span class="bizexp-detail-th amount">金额</span>
                  <span class="bizexp-detail-th note">备注</span>
                </div>
                <div
                  v-for="e in row.items"
                  :key="e.id"
                  class="bizexp-detail-row"
                  :data-testid="`bizexp-detail-${e.id}`"
                >
                  <span class="bizexp-detail-td name bizexp-cat">{{ catNameOf(e.categoryId) }}</span>
                  <span class="bizexp-detail-td amount bizexp-amt">{{ formatYuanOf(e.amount) }}</span>
                  <span class="bizexp-detail-td note">{{ e.note || '—' }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="日期" width="140" align="center">
            <template #default="{ row }">
              <span style="font-weight: 600;">{{ row.date }}</span>
            </template>
          </el-table-column>
          <el-table-column label="支出合计" width="140" align="right">
            <template #default="{ row }">
              <span class="bizexp-total-text" :data-testid="`bizexp-total-${row.date}`">{{ formatYuanOf(row.total) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="笔数" width="90" align="center">
            <template #default="{ row }">{{ row.items.length }} 笔</template>
          </el-table-column>
          <el-table-column label="首笔分类" min-width="140" align="left" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="bizexp-cat">{{ catNameOf(row.items[0].categoryId) }}</span>
              <span v-if="row.items.length > 1" class="bizexp-more-cats">+{{ row.items.length - 1 }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" class-name="ewt-op-col" width="140" align="center" fixed="right">
            <template #default="{ row }">
              <div class="bizexp-actions" @click.stop>
                <el-button size="small" :data-testid="`bizexp-edit-${row.date}`" @click="startEdit(row)">编辑</el-button>
                <el-button size="small" type="danger" :data-testid="`bizexp-del-${row.date}`" @click="handleDeleteGroup(row)">删除</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="ewt-card-grid">
          <RecordsCard
            @edit="startEdit(item)"
            v-for="item in pageItems"
            :key="item.date"
            :fields="cardFields(item)"
          >
          </RecordsCard>
        </div>

      </div>
      <div class="bizexp-list-pager">
        <el-pagination
          v-model:current-page="listPage"
          :page-size="LIST_PAGE_SIZE"
          :page-sizes="[LIST_PAGE_SIZE]"
          layout="total, prev, pager, next, jumper"
          :total="dayGroups.length"
          background
          small
          prev-text="上一页"
          next-text="下一页"
          data-testid="bizexp-pagination"
        />
      </div>
    </template>

    <!-- 新增/编辑弹框（多行支出） -->
    <el-dialog
      v-if="showDialog"
      :model-value="true"
      :show-close="false"
      width="640px"
      class="bizexp-dialog"
      data-testid="bizexp-dialog"
      @close="showDialog = false"
    >
      <template #header>
        <div class="biz-dialog-header">
          <h3>{{ editingDateOrig ? '编辑支出记录' : '新增支出记录' }}</h3>
          <button class="biz-dialog-close" @click="showDialog = false"><Icon name="close" /></button>
        </div>
      </template>
      <form class="biz-dialog-body" @submit.prevent="handleSave">
        <div class="biz-field">
          <label>日期 *（同一天将自动合并到同一张卡片）</label>
          <div data-testid="bizexp-form-date">
            <el-date-picker
              v-model="editingDate"
              type="date"
              value-format="YYYY-MM-DD"
              size="small"
            />
          </div>
        </div>

        <!-- 多行支出行 -->
        <div class="bizexp-rows">
          <div v-for="(row, i) in rows" :key="i" class="bizexp-row" data-testid="bizexp-row">
            <el-select v-model="row.categoryId" size="small" class="bizexp-row-cat" data-testid="bizexp-row-category">
              <el-option v-for="cat in store.expenseCategories" :key="cat.id" :value="cat.id" :label="cat.name" />
            </el-select>
            <el-input-number
              :model-value="row.amount === '' ? undefined : Number(row.amount)"
              :min="0"
              :step="0.01"
              size="small"
              class="bizexp-row-amt"
              data-testid="bizexp-row-amount"
              placeholder="金额"
              @update:model-value="row.amount = $event == null ? '' : String($event)"
            />
            <el-input
              v-model="row.note"
              size="small"
              maxlength="100"
              placeholder="备注（可选）"
              class="bizexp-row-note"
              data-testid="bizexp-row-note"
            />
            <el-button type="danger" size="small" :data-testid="`bizexp-row-del-${i}`" @click="removeRow(i)">移除</el-button>
          </div>
          <el-button size="small" data-testid="bizexp-row-add" @click="addRow">＋ 添加支出行</el-button>
        </div>

        <!-- 当天合计预览 -->
        <div class="bizexp-preview">
          当天合计：<strong data-testid="bizexp-form-total">{{ formatYuanOf(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)) }}</strong>
        </div>

        <div class="biz-form-actions ewt-dialog-footer">
          <el-button size="small" @click="showDialog = false">取消</el-button>
          <el-button type="primary" size="small" native-type="submit" :disabled="!isFormValid" data-testid="bizexp-save">
            {{ editingDateOrig ? '保存' : '添加' }}
          </el-button>
          <el-button v-if="editingDateOrig" size="small" type="danger" data-testid="bizexp-delete" @click="handleDeleteGroup(dayGroups.find(g => g.date === editingDateOrig)!)">删除</el-button>
        </div>
      </form>
    </el-dialog>

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

.bizexp-bar-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bizexp-count {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizexp-empty {
  padding: 40px 20px;
  text-align: center;
  font-size: 14px;
  color: var(--color-text-muted, var(--color-text-muted));
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

/* ===== el-table 表格容器（参考 WorkbenchNotes / BusinessDaily） ===== */
.bizexp-table-wrap {
  flex: 1 1 auto;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.bizexp-table-wrap > :global(.el-table) {
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
.bizexp-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.bizexp-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .bizexp-table-wrap > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(html.dark) .bizexp-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .bizexp-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
.bizexp-table-wrap > :global(.el-table .el-table__body-wrapper .cell),
.bizexp-table-wrap > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
}

/* ===== 分页条（参考 WorkbenchNotes / BusinessDaily） ===== */
.bizexp-list-pager {
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
:global(html.dark) .bizexp-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}
.bizexp-list-pager > :global(.el-pagination) { --el-pagination-bg-color: transparent; }
.bizexp-list-pager > :global(.el-pagination button),
.bizexp-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #ffffff) !important;
  border: 1px solid var(--color-border, #e5e7eb) !important;
  color: var(--color-text-secondary, #6b7280) !important;
}
.bizexp-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
:global(html.dark) .bizexp-list-pager > :global(.el-pagination button),
:global(html.dark) .bizexp-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #1f2937) !important;
  border-color: var(--color-border, #374151) !important;
  color: var(--color-text-secondary, #d1d5db) !important;
}
:global(html.dark) .bizexp-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
.bizexp-list-pager > :global(.el-pagination__total) {
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
}

/* ===== 表格内文本样式 ===== */
.bizexp-total-text {
  font-weight: 700;
  color: var(--color-error, var(--color-error));
  font-variant-numeric: tabular-nums;
}
.bizexp-more-cats {
  margin-left: 6px;
  font-size: 11px;
  color: var(--color-text-muted, var(--color-text-muted));
}
.bizexp-actions {
  display: flex;
  gap: 6px;
  justify-content: center;
}

/* ===== 展开行内支出明细 ===== */
.bizexp-expand { padding: 12px 24px 12px 48px; }
.bizexp-expand-title {
  font-size: 13px; font-weight: 600;
  color: var(--color-text-secondary, #6b7280);
  margin-bottom: 8px;
}
.bizexp-detail-head {
  display: grid;
  grid-template-columns: minmax(80px, 1fr) minmax(70px, 0.7fr) minmax(120px, 1.3fr);
  gap: 6px;
  font-size: 11px;
  color: var(--color-text-muted, var(--color-text-muted));
  padding: 0 4px 6px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
}
.bizexp-detail-th {
  text-align: right;
  font-weight: 600;
}
.bizexp-detail-th.name,
.bizexp-detail-th.note {
  text-align: left;
}
.bizexp-detail-row {
  display: grid;
  grid-template-columns: minmax(80px, 1fr) minmax(70px, 0.7fr) minmax(120px, 1.3fr);
  gap: 6px;
  padding: 4px 4px;
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
  align-items: center;
}
.bizexp-detail-td {
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bizexp-detail-td.name,
.bizexp-detail-td.note {
  text-align: left;
}
.bizexp-detail-td.note {
  color: var(--color-text-muted, var(--color-text-muted));
}

/* 分类徽标 */
.bizexp-cat {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--radius-full, 999px);
  color: var(--color-primary, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
  white-space: nowrap;
  display: inline-block;
}
.bizexp-amt {
  font-weight: 700;
  color: var(--color-error, var(--color-error));
}

/* ===== 弹框多行编辑 ===== */
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
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: var(--radius-md, 8px);
  align-items: center;
}

.bizexp-row-cat { min-width: 0; width: 100%; }
.bizexp-row-amt { min-width: 0; width: 100%; }
.bizexp-row-note { min-width: 0; }

.bizexp-preview {
  padding: 10px 12px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizexp-preview strong {
  color: var(--color-error, var(--color-error));
  font-size: 18px;
  font-weight: 700;
}

/* 弹框通用样式 */
.biz-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
}

.biz-dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
}

.biz-dialog-close {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--color-text-muted, var(--color-text-muted));
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
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.biz-form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.biz-input {
  box-sizing: border-box;
  padding: 9px 12px;
  background-color: var(--color-bg-input, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--color-text, var(--color-text));
}

.biz-input:focus {
  outline: none;
  border-color: var(--color-primary, var(--color-primary));
}

/* el-dialog 换皮：对齐原 biz-dialog 视觉 */
.bizexp-dialog :deep(.el-dialog) {
  border-radius: var(--radius-lg, 12px);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.bizexp-dialog :deep(.el-dialog__header) {
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  margin-right: 0;
  flex-shrink: 0;
}

.bizexp-dialog :deep(.el-dialog__body) {
  padding: 0;
  overflow-y: auto;
}

/* ===== 暗色模式 ===== */
:global(html.dark) .bizexp-total-text,
:global(html.dark) .bizexp-amt,
:global(html.dark) .bizexp-preview strong {
  color: #f87171;
}

:global(html.dark) .bizexp-row {
  background-color: var(--color-bg-card, #1f2937);
}

:global(html.dark) .biz-input {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text, #f9fafb);
  border-color: var(--color-border, #374151);
}

:global(html.dark) .bizexp-cat {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
  color: #93c5fd;
}

@media (max-width: 640px) {
  .bizexp-row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
