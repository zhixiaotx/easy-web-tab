<script setup lang="ts">
import { useViewMode } from '@/composables/useViewMode'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'

const vm = useViewMode()

function cardFields(row: any) {
  return [
    { label: '日期', value: row.date },
    { label: '营业额', value: formatYuanOf(row.totalRevenue) },
    { label: '成本', value: formatYuanOf(recordCost(row)) },
    { label: '利润', value: formatYuanOf(recordProfit(row)) },
    { label: '损耗', value: formatYuanOf(recordLossAmount(row)) },
    { label: '商品数', value: row.items.length + ' 项' },
    { label: '备注', value: row.note || '—' }
  ]
}

import Icon from '../Icon.vue'
// 收摊记录：日记录表格（date 唯一 upsert）+ 编辑弹框（商品行：带出/剩余/损耗，收入自动合计）
// P0-1：结构化商品明细行（展开行展示）
// P0-3：编辑弹框增加库存上下文（当前库存、预计库存、小计实时计算）
import { computed, reactive, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { calcDailyCost, calcDailyItemDetails, calcDailyLossAmount, calcDailyRevenue, calcInventory, findProduct, formatYuanOf, localDateKey, sortDailyRecords } from '@/composables/businessCore'
import { buildCsv, csvFileName, downloadCsv } from '@/composables/csvExport'
import type { BusinessDailyRecord, DailyRecordItem } from '@/types'
import { usePageSize } from '@/composables/usePageSize'

// P1-3：跨模块联动跳转 emit
const emit = defineEmits<{ navigate: [section: string, filter?: string] }>()

const store = useWorkbenchBusinessStore()

const sorted = computed(() => sortDailyRecords(store.dailyRecords))

// ===== el-pagination 分页（固定 10 条/页） =====
const LIST_PAGE_SIZE = 10
const { pageSize, PAGE_SIZES } = usePageSize('bizday-list-pager', LIST_PAGE_SIZE)
const listPage = ref(1)
const pageItems = computed<BusinessDailyRecord[]>(() => {
  const start = (listPage.value - 1) * pageSize.value
  return sorted.value.slice(start, start + pageSize.value)
})
watch(sorted, () => { listPage.value = 1 })

/** 获取某条记录的结构化商品明细 */
function dailyItemDetails(record: BusinessDailyRecord) {
  return calcDailyItemDetails(record, store.products)
}

// ===== 一键导出 CSV（收摊记录：按「日期 × 商品」展开，便于 Excel 透视）=====
function exportDailyCsv(): void {
  const headers = ['日期', '商品', '带出', '售出', '损耗', '单价', '小计', '当日营业额', '交易笔数']
  const rows: (string | number)[][] = []
  for (const rec of sorted.value) {
    const details = dailyItemDetails(rec)
    for (const d of details) {
      rows.push([
        rec.date,
        d.name,
        d.broughtOut,
        d.sold,
        d.loss,
        d.sellingPrice.toFixed(2),
        d.subtotal.toFixed(2),
        rec.totalRevenue.toFixed(2),
        rec.transactionCount ?? ''
      ])
    }
    if (details.length === 0) {
      rows.push([rec.date, '（无商品明细）', '', '', '', '', '', rec.totalRevenue.toFixed(2), rec.transactionCount ?? ''])
    }
  }
  downloadCsv(csvFileName('收摊记录'), buildCsv(headers, rows))
}

// ===== 编辑弹框（动态商品行） =====
const showDialog = ref(false)
const editingDate = ref(localDateKey())
const formNote = ref('')
const formTransactionCount = ref(0)
const rows = reactive<{ productId: string; broughtOut: number; remaining: number; loss: number }[]>([])

// P0-3：当前库存 map（编辑弹框用）
const stockMap = computed(() => calcInventory(store.products, store.purchases, store.dailyRecords))

/** 获取行的商品对象 */
function rowProduct(productId: string) {
  return findProduct(store.products, productId)
}

/** 获取行当前库存 */
function rowStock(productId: string): number {
  return stockMap.value[productId] ?? 0
}

/** 带出后预计库存 */
function rowExpectedStock(productId: string, broughtOut: number): number {
  return rowStock(productId) - broughtOut
}

/** 行小计：售出 × 售价 */
function rowSubtotal(productId: string, broughtOut: number, remaining: number, loss: number): number {
  const product = rowProduct(productId)
  const sold = Math.max(0, broughtOut - remaining - loss)
  return Math.round(sold * (product?.sellingPrice ?? 0) * 100) / 100
}

const formRevenue = computed(() =>
  calcDailyRevenue(rows.map(r => ({ ...r })), store.products)
)

const formCost = computed(() =>
  calcDailyCost(rows.map(r => ({ ...r })), store.products)
)

const formLossAmount = computed(() =>
  calcDailyLossAmount(rows.map(r => ({ ...r })), store.products)
)

const formProfit = computed(() =>
  Math.round((formRevenue.value - formCost.value) * 100) / 100
)

function recordProfit(record: BusinessDailyRecord): number {
  return Math.round((record.totalRevenue - calcDailyCost(record.items, store.products)) * 100) / 100
}

function recordCost(record: BusinessDailyRecord): number {
  return calcDailyCost(record.items, store.products)
}

function recordLossAmount(record: BusinessDailyRecord): number {
  return calcDailyLossAmount(record.items, store.products)
}

const isFormValid = computed(
  () => editingDate.value !== '' && rows.length > 0 && rows.every(r => r.productId !== '' && (r.broughtOut > 0 || r.remaining > 0 || r.loss > 0))
)

function emptyRow(): { productId: string; broughtOut: number; remaining: number; loss: number } {
  return { productId: store.products.find(p => p.active)?.id ?? store.products[0]?.id ?? '', broughtOut: 0, remaining: 0, loss: 0 }
}

function startAdd(): void {
  editingDate.value = localDateKey()
  formNote.value = ''
  formTransactionCount.value = 0
  rows.splice(0, rows.length, emptyRow())
  showDialog.value = true
}

function startEdit(record: BusinessDailyRecord): void {
  editingDate.value = record.date
  formNote.value = record.note ?? ''
  formTransactionCount.value = typeof record.transactionCount === 'number' && Number.isFinite(record.transactionCount) ? record.transactionCount : 0
  rows.splice(
    0,
    rows.length,
    ...record.items.map(it => ({ productId: it.productId, broughtOut: it.broughtOut, remaining: it.remaining, loss: it.loss }))
  )
  showDialog.value = true
}

function addRow(): void {
  rows.push(emptyRow())
}

function removeRow(index: number): void {
  rows.splice(index, 1)
}

async function handleSave(): Promise<void> {
  if (!isFormValid.value) return
  const items: DailyRecordItem[] = rows
    .filter(r => r.productId)
    .map(r => ({
      productId: r.productId,
      broughtOut: Math.max(0, Math.floor(r.broughtOut)),
      remaining: Math.max(0, Math.floor(r.remaining)),
      loss: Math.max(0, Math.floor(r.loss))
    }))
  await store.upsertDailyRecord({
    date: editingDate.value,
    items,
    note: formNote.value.trim() || undefined,
    transactionCount: Number.isFinite(formTransactionCount.value) ? Math.max(0, Math.floor(formTransactionCount.value)) : undefined
  })
  showDialog.value = false
}

async function handleDelete(id: string): Promise<void> {
  if (!confirm('确定要删除这条收摊记录吗？删除后统计将重新计算。')) return
  await store.deleteDailyRecord(id)
}
</script>

<template>
  <div class="bizday">
    <div class="ewt-table-toolbar is-split">
      <div class="bizday-toolbar-left">
        <el-button type="primary" data-testid="bizday-add" @click="startAdd">＋ 收摊记录</el-button>
        <el-button class="btn-export-csv" data-testid="bizday-export" :disabled="sorted.length === 0" @click="exportDailyCsv">导出 CSV</el-button>
      </div>
      <ViewModeToggle v-if="sorted.length > 0" :mode="vm.mode" @toggle="vm.toggle" />
    </div>

    <div v-if="sorted.length === 0" class="bizday-empty" data-testid="bizday-empty">暂无收摊记录，点击左上角记下今天的第一笔</div>
    <template v-else>
      <div class="bizday-table-wrap">
        <el-table v-if="vm.mode === 'list'" class="ewt-table"
          :data="pageItems"
          data-testid="bizday-table"
          stripe
          border
          size="default"
          style="width: 100%"
          height="100%"
          empty-text="暂无收摊记录"
          row-key="id"
        >
          <!-- 展开行：商品明细 -->
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="bizday-expand" @click.stop>
                <div class="bizday-expand-title">商品明细（{{ dailyItemDetails(row).length }} 项）</div>
                <div class="bizday-detail-head">
                  <span class="bizday-detail-th name">商品</span>
                  <span class="bizday-detail-th">带出</span>
                  <span class="bizday-detail-th">售出</span>
                  <span class="bizday-detail-th">损耗</span>
                  <span class="bizday-detail-th">单价</span>
                  <span class="bizday-detail-th sub">小计</span>
                </div>
                <div
                  v-for="d in dailyItemDetails(row)"
                  :key="d.productId"
                  class="bizday-detail-row"
                  :class="{ deleted: d.deleted }"
                  :data-testid="`bizday-detail-${d.productId}`"
                >
                  <span class="bizday-detail-td name" @click="!d.deleted && emit('navigate', 'products', d.productId)">
                    {{ d.name }}{{ d.deleted ? '（已删除商品）' : '' }}
                  </span>
                  <span class="bizday-detail-td">{{ d.broughtOut }}</span>
                  <span class="bizday-detail-td sold-bold">{{ d.sold }}</span>
                  <span class="bizday-detail-td">{{ d.loss }}</span>
                  <span class="bizday-detail-td">¥{{ d.sellingPrice.toFixed(2) }}</span>
                  <span class="bizday-detail-td sub-bold">¥{{ d.subtotal.toFixed(2) }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="日期" width="130" align="center">
            <template #default="{ row }">
              <span style="font-weight: 600;">{{ row.date }}</span>
            </template>
          </el-table-column>
          <el-table-column label="营业额" width="130" align="right">
            <template #default="{ row }">
              <span class="bizday-revenue-text" :data-testid="`bizday-revenue-${row.id}`">{{ formatYuanOf(row.totalRevenue) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="成本" width="110" align="right">
            <template #default="{ row }">
              <span :data-testid="`bizday-cost-${row.id}`">{{ formatYuanOf(recordCost(row)) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="利润" width="110" align="right">
            <template #default="{ row }">
              <span class="bizday-profit-text" :data-testid="`bizday-profit-${row.id}`">{{ formatYuanOf(recordProfit(row)) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="损耗" width="110" align="right">
            <template #default="{ row }">
              <span class="bizday-loss-text" :data-testid="`bizday-loss-${row.id}`">{{ formatYuanOf(recordLossAmount(row)) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="商品数" width="90" align="center">
            <template #default="{ row }">{{ row.items.length }} 项</template>
          </el-table-column>
          <el-table-column label="备注" min-width="160" align="left" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.note" class="bizday-note-text">{{ row.note }}</span>
              <span v-else style="color: var(--color-text-muted, #9ca3af);">—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" class-name="ewt-op-col" width="140" align="center" fixed="right">
            <template #default="{ row }">
              <div class="bizday-actions" @click.stop>
                <el-button size="small" :data-testid="`bizday-edit-${row.id}`" @click="startEdit(row)">编辑</el-button>
                <el-button size="small" type="danger" :data-testid="`bizday-del-${row.id}`" @click="handleDelete(row.id)">删除</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="ewt-card-grid">
          <RecordsCard
            @edit="startEdit(item)"
            v-for="item in pageItems"
            :key="item.id"
            :fields="cardFields(item)"
          >
          </RecordsCard>
        </div>

      </div>
      <div class="bizday-list-pager ewt-pager">
        <el-pagination
          v-model:current-page="listPage"
          @size-change="listPage = 1"
          v-model:page-size="pageSize"
          :page-sizes="PAGE_SIZES"
          layout="total, prev, pager, next, jumper"
          :total="sorted.length"
          background
          small
          prev-text="上一页"
          next-text="下一页"
          data-testid="bizday-pagination"
        />
      </div>
    </template>

    <!-- 编辑弹框（商品行动态增删） -->
    <el-dialog
      v-if="showDialog"
      :model-value="true"
      :show-close="false"
      width="680px"
      data-testid="bizday-dialog"
      @close="showDialog = false"
    >
      <template #header>
        <div class="biz-dialog-header">
          <h3>收摊记录</h3>
          <button class="biz-dialog-close" @click="showDialog = false"><Icon name="close" /></button>
        </div>
      </template>
      <form class="biz-dialog-body" @submit.prevent="handleSave">
        <div class="biz-field">
          <label>日期 *（同一天重复保存将覆盖）</label>
          <div data-testid="bizday-form-date">
            <el-date-picker
              v-model="editingDate"
              type="date"
              value-format="YYYY-MM-DD"
              size="small"
            />
          </div>
        </div>

        <div class="bizday-rows">
          <div v-for="(row, i) in rows" :key="i" class="bizday-row" data-testid="bizday-row">
            <div class="bizday-row-main">
              <div class="bizday-product-wrap">
                <el-select v-model="row.productId" size="small" class="bizday-product" data-testid="bizday-row-product">
                  <el-option
                    v-for="p in store.products"
                    :key="p.id"
                    :value="p.id"
                    :label="p.name + (p.active ? '' : '（停售）')"
                  />
                </el-select>
                <!-- P0-3：商品进价/售价 + 当前库存 -->
                <div v-if="row.productId && rowProduct(row.productId)" class="bizday-row-context">
                  <span class="bizday-row-price">
                    {{ formatYuanOf(rowProduct(row.productId)!.purchasePrice) }}→{{ formatYuanOf(rowProduct(row.productId)!.sellingPrice) }}
                  </span>
                  <span class="bizday-row-stock">当前库存：{{ rowStock(row.productId) }} 件</span>
                </div>
              </div>
              <div class="bizday-nums">
                <label class="bizday-num">
                  带出
                  <el-input-number v-model="row.broughtOut" :min="0" :step="1" size="small" controls-position="right" class="bizday-num-input" />
                </label>
                <label class="bizday-num">
                  剩余
                  <el-input-number v-model="row.remaining" :min="0" :step="1" size="small" controls-position="right" class="bizday-num-input" />
                </label>
                <label class="bizday-num">
                  损耗
                  <el-input-number v-model="row.loss" :min="0" :step="1" size="small" controls-position="right" class="bizday-num-input" />
                </label>
              </div>
              <el-button type="danger" size="small" :data-testid="`bizday-row-del-${i}`" @click="removeRow(i)">移除</el-button>
            </div>
            <!-- P0-3：带出后预计库存 + 行小计 -->
            <div v-if="row.productId" class="bizday-row-preview">
              <span
                class="bizday-row-expected"
                :class="{ 'stock-warn': rowExpectedStock(row.productId, row.broughtOut) < 0 }"
              >
                带出后预计库存：{{ rowStock(row.productId) }} - {{ row.broughtOut }} = {{ rowExpectedStock(row.productId, row.broughtOut) }} 件
                <span v-if="rowExpectedStock(row.productId, row.broughtOut) < 0" class="bizday-stock-warn">超出库存</span>
              </span>
              <span class="bizday-row-subtotal">
                售出 {{ Math.max(0, row.broughtOut - row.remaining - row.loss) }} × ¥{{ (rowProduct(row.productId)?.sellingPrice ?? 0).toFixed(2) }} = ¥{{ rowSubtotal(row.productId, row.broughtOut, row.remaining, row.loss).toFixed(2) }}
              </span>
            </div>
          </div>
          <el-button data-testid="bizday-row-add" @click="addRow">＋ 添加商品行</el-button>
        </div>

        <div class="bizday-revenue-preview">
          营业额：<strong data-testid="bizday-form-revenue">{{ formatYuanOf(formRevenue) }}</strong>
          <span class="bizday-preview-sep">成本 <strong data-testid="bizday-form-cost">{{ formatYuanOf(formCost) }}</strong></span>
          <span class="bizday-preview-sep">利润 <strong data-testid="bizday-form-profit">{{ formatYuanOf(formProfit) }}</strong></span>
          <span class="bizday-preview-sep">损耗 <strong data-testid="bizday-form-loss">{{ formatYuanOf(formLossAmount) }}</strong></span>
        </div>

        <div class="biz-field">
          <label>交易笔数（可选，当天顾客买单次数）</label>
          <el-input-number v-model="formTransactionCount" :min="0" :step="1" size="small" controls-position="right" data-testid="bizday-form-transaction-count" />
        </div>
        <div class="biz-field">
          <label>备注（可选）</label>
          <el-input v-model="formNote" size="small" maxlength="200" data-testid="bizday-form-note" />
        </div>

        <div class="biz-form-actions ewt-dialog-footer">
          <el-button @click="showDialog = false">取消</el-button>
          <el-button type="primary" native-type="submit" :disabled="!isFormValid" data-testid="bizday-save">保存</el-button>
          <el-button v-if="editingDate" type="danger" native-type="button" data-testid="bizday-record-delete" @click="handleDelete(editingDate)">删除</el-button>
        </div>
      </form>
    </el-dialog>
  </div>
</template>

<style scoped>
.bizday {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-height: 0;
}

.bizday-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bizday-empty {
  padding: 40px 20px;
  text-align: center;
  font-size: 14px;
  color: var(--color-text-muted, var(--color-text-muted));
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

/* ===== el-table 表格容器（参考 WorkbenchNotes） ===== */
.bizday-table-wrap {
  flex: 1 1 auto;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.bizday-table-wrap > :global(.el-table) {
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
.bizday-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.bizday-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .bizday-table-wrap > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(html.dark) .bizday-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .bizday-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
.bizday-table-wrap > :global(.el-table .el-table__body-wrapper .cell),
.bizday-table-wrap > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
}

/* ===== 分页条（参考 WorkbenchNotes） ===== */
.bizday-list-pager {
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
:global(html.dark) .bizday-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}

/* ===== 表格内文本样式 ===== */
.bizday-revenue-text {
  font-weight: 700;
  color: var(--color-success, var(--color-success));
  font-variant-numeric: tabular-nums;
}
.bizday-profit-text {
  font-weight: 700;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
}
.bizday-loss-text {
  color: var(--color-error, var(--color-error));
  font-variant-numeric: tabular-nums;
}
.bizday-note-text {
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
}
.bizday-actions {
  display: flex;
  gap: 6px;
  justify-content: center;
}

/* ===== 展开行内商品明细 ===== */
.bizday-expand { padding: 12px 24px 12px 48px; }
.bizday-expand-title {
  font-size: 13px; font-weight: 600;
  color: var(--color-text-secondary, #6b7280);
  margin-bottom: 8px;
}
.bizday-detail-head {
  display: grid;
  grid-template-columns: minmax(80px, 1.4fr) minmax(40px, 0.5fr) minmax(40px, 0.5fr) minmax(40px, 0.5fr) minmax(60px, 0.7fr) minmax(70px, 0.85fr);
  gap: 6px;
  font-size: 11px;
  color: var(--color-text-muted, var(--color-text-muted));
  padding: 0 4px 6px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
}
.bizday-detail-th {
  text-align: right;
  font-weight: 600;
}
.bizday-detail-th.name,
.bizday-detail-th.sub {
  text-align: left;
}
.bizday-detail-row {
  display: grid;
  grid-template-columns: minmax(80px, 1.4fr) minmax(40px, 0.5fr) minmax(40px, 0.5fr) minmax(40px, 0.5fr) minmax(60px, 0.7fr) minmax(70px, 0.85fr);
  gap: 6px;
  padding: 4px 4px;
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
  align-items: center;
}
.bizday-detail-row.deleted {
  opacity: 0.5;
  font-style: italic;
}
.bizday-detail-td {
  text-align: right;
}
.bizday-detail-td.name {
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bizday-detail-row:not(.deleted) .bizday-detail-td.name:hover {
  color: var(--color-primary, var(--color-primary));
  text-decoration: underline;
}
.bizday-detail-td.sold-bold {
  font-weight: 700;
  color: var(--color-text, var(--color-text));
}
.bizday-detail-td.sub-bold {
  font-weight: 700;
  color: var(--color-success, var(--color-success));
}

/* P0-3：编辑弹框行库存上下文 */
.bizday-row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}

.bizday-product-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 140px;
  flex: 1;
}

.bizday-row-context {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--color-text-muted, var(--color-text-muted));
  flex-wrap: wrap;
}

.bizday-row-price {
  font-variant-numeric: tabular-nums;
}

.bizday-row-preview {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--color-text-muted, var(--color-text-muted));
  padding: 4px 4px 0;
  flex-wrap: wrap;
}

.bizday-row-expected.stock-warn {
  color: var(--color-error, var(--color-error));
}

.bizday-stock-warn {
  color: var(--color-error, var(--color-error));
  font-weight: 700;
  margin-left: 4px;
}

.bizday-row-subtotal {
  font-variant-numeric: tabular-nums;
  color: var(--color-success, var(--color-success));
  font-weight: 600;
}

.bizday-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bizday-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: var(--radius-md, 8px);
}

.bizday-product {
  min-width: 140px;
  flex: 1;
}

.bizday-nums {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.bizday-num {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  color: var(--color-text-muted, var(--color-text-muted));
}

.bizday-num .biz-input {
  width: 70px;
  padding: 6px 8px;
}

.bizday-revenue-preview {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 14px;
  padding: 10px 12px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizday-revenue-preview strong {
  color: var(--color-success, var(--color-success));
  font-size: 18px;
}

.bizday-preview-sep {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-size: 13px;
}

.bizday-preview-sep strong {
  font-size: 16px;
  color: var(--color-text, var(--color-text));
}

/* 弹框 */
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

html.dark .biz-dialog {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .bizday-revenue-text {
  color: #4ade80;
}

html.dark .bizday-row {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .biz-input {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text, #f9fafb);
  border-color: var(--color-border, #374151);
}

/* el-dialog 外壳对齐原弹框 */
.bizday :deep(.el-dialog) {
  padding: 0;
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
  max-height: 85vh;
  overflow-y: auto;
}

.bizday :deep(.el-dialog__header) {
  padding: 0;
}

.bizday :deep(.el-dialog__body) {
  padding: 0;
}

.bizday :deep(.el-date-editor) {
  width: 100%;
}

/* 行内数字输入紧凑宽度 */
.bizday-num-input {
  width: 90px;
}

/* 移动端：表格工具行（收摊记录 + 导出 + 视图切换）换行，按钮不被压扁变形 */
@media (max-width: 767px) {
  .ewt-table-toolbar.is-split {
    flex-wrap: wrap;
    gap: 8px;
  }
  .bizday-toolbar-left {
    flex-wrap: wrap;
    width: 100%;
  }
}
</style>
