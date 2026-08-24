<script setup lang="ts">
// 收摊记录：日记录卡片（date 唯一 upsert）+ 编辑弹框（商品行：带出/剩余/损耗，收入自动合计）
// P0-1：结构化商品明细行展示（折叠/展开、损耗高亮、已删除标记）
// P0-3：编辑弹框增加库存上下文（当前库存、预计库存、小计实时计算）
import { computed, reactive, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { calcDailyCost, calcDailyItemDetails, calcDailyLossAmount, calcDailyRevenue, calcInventory, findProduct, formatYuanOf, localDateKey, sortDailyRecords } from '@/composables/businessCore'
import type { BusinessDailyRecord, DailyRecordItem } from '@/types'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from '@/components/workbench/PanelPager.vue'

// P1-3：跨模块联动跳转 emit
const emit = defineEmits<{ navigate: [section: string, filter?: string] }>()

const store = useWorkbenchBusinessStore()

const sorted = computed(() => sortDailyRecords(store.dailyRecords))

// ===== 自适应分页（usePanelPaging：ResizeObserver 测可用高 + grid 实测列数）=====
// rowHeight = 卡片固定 250 + gap 12 = 262
const listEl = ref<HTMLElement | null>(null)
const gridEl = ref<HTMLElement | null>(null)
const paging = usePanelPaging({
  items: () => sorted.value,
  rowHeight: 262,
  gap: 12,
  containerRef: listEl,
  gridRef: gridEl
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev, goto } = paging
watch(sorted, () => goto(1))

/** 获取某条记录的结构化商品明细 */
function dailyItemDetails(record: BusinessDailyRecord) {
  return calcDailyItemDetails(record, store.products)
}

// ===== 编辑弹框（动态商品行） =====
const showDialog = ref(false)
const editingDate = ref(localDateKey())
const formNote = ref('')
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
  rows.splice(0, rows.length, emptyRow())
  showDialog.value = true
}

function startEdit(record: BusinessDailyRecord): void {
  editingDate.value = record.date
  formNote.value = record.note ?? ''
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
  await store.upsertDailyRecord({ date: editingDate.value, items, note: formNote.value.trim() || undefined })
  showDialog.value = false
}

async function handleDelete(id: string): Promise<void> {
  if (!confirm('确定要删除这条收摊记录吗？删除后统计将重新计算。')) return
  await store.deleteDailyRecord(id)
}
</script>

<template>
  <div class="bizday">
    <div class="bizday-bar">
      <span class="bizday-count">共 {{ store.dailyRecords.length }} 条（同一天自动覆盖）</span>
      <button class="bizday-add" data-testid="bizday-add" @click="startAdd">＋ 收摊记录</button>
    </div>

    <div v-if="sorted.length === 0" class="bizday-empty" data-testid="bizday-empty">暂无收摊记录，点击右上角记下今天的第一笔</div>
    <div v-else ref="listEl" class="bizday-list" :class="{ 'bizday-list-scroll': !fitsOnePage }">
      <div ref="gridEl" class="bizday-grid">
        <div v-for="r in pageItems" :key="r.id" class="bizday-card" :data-testid="`bizday-card-${r.id}`">
        <div class="bizday-head">
          <span class="bizday-date">{{ r.date }}</span>
          <span class="bizday-revenue" :data-testid="`bizday-revenue-${r.id}`">{{ formatYuanOf(r.totalRevenue) }}</span>
        </div>
        <div class="bizday-stats">
          <span class="bizday-stat">成本 <strong :data-testid="`bizday-cost-${r.id}`">{{ formatYuanOf(recordCost(r)) }}</strong></span>
          <span class="bizday-stat">利润 <strong :data-testid="`bizday-profit-${r.id}`">{{ formatYuanOf(recordProfit(r)) }}</strong></span>
          <span class="bizday-stat">损耗 <strong :data-testid="`bizday-loss-${r.id}`">{{ formatYuanOf(recordLossAmount(r)) }}</strong></span>
        </div>
        <!-- P0-1：结构化商品明细行（固定 3 条） -->
        <div class="bizday-details" :data-testid="`bizday-details-${r.id}`">
          <div class="bizday-detail-head">
            <span class="bizday-detail-th name">商品</span>
            <span class="bizday-detail-th">带出</span>
            <span class="bizday-detail-th">售出</span>
            <span class="bizday-detail-th">单价</span>
            <span class="bizday-detail-th sub">小计</span>
          </div>
          <div
            v-for="d in dailyItemDetails(r).slice(0, 3)"
            :key="d.productId"
            class="bizday-detail-row"
            :class="{ deleted: d.deleted }"
          >
            <span class="bizday-detail-td name" @click="!d.deleted && emit('navigate', 'products', d.productId)">
              {{ d.name }}{{ d.deleted ? '（已删除商品）' : '' }}
            </span>
            <span class="bizday-detail-td">{{ d.broughtOut }}</span>
            <span class="bizday-detail-td sold-bold">{{ d.sold }}</span>
            <span class="bizday-detail-td">¥{{ d.sellingPrice.toFixed(2) }}</span>
            <span class="bizday-detail-td sub-bold">¥{{ d.subtotal.toFixed(2) }}</span>
          </div>
        </div>
        <div class="bizday-actions">
          <button class="bizday-btn" :data-testid="`bizday-edit-${r.id}`" @click="startEdit(r)">编辑</button>
          <button class="bizday-btn del" :data-testid="`bizday-del-${r.id}`" @click="handleDelete(r.id)">删除</button>
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

    <!-- 编辑弹框（商品行动态增删） -->
    <div v-if="showDialog" class="biz-dialog-overlay" @click.self="showDialog = false">
      <div class="biz-dialog bizday-dialog" data-testid="bizday-dialog">
        <div class="biz-dialog-header">
          <h3>收摊记录</h3>
          <button class="biz-dialog-close" @click="showDialog = false">✕</button>
        </div>
        <form class="biz-dialog-body" @submit.prevent="handleSave">
          <div class="biz-field">
            <label>日期 *（同一天重复保存将覆盖）</label>
            <input v-model="editingDate" type="date" class="biz-input" data-testid="bizday-form-date" />
          </div>

          <div class="bizday-rows">
            <div v-for="(row, i) in rows" :key="i" class="bizday-row" data-testid="bizday-row">
              <div class="bizday-row-main">
                <div class="bizday-product-wrap">
                  <select v-model="row.productId" class="biz-input bizday-product" data-testid="bizday-row-product">
                    <option v-for="p in store.products" :key="p.id" :value="p.id">
                      {{ p.name }}{{ p.active ? '' : '（停售）' }}
                    </option>
                  </select>
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
                    <input v-model.number="row.broughtOut" type="number" min="0" step="1" class="biz-input" />
                  </label>
                  <label class="bizday-num">
                    剩余
                    <input v-model.number="row.remaining" type="number" min="0" step="1" class="biz-input" />
                  </label>
                  <label class="bizday-num">
                    损耗
                    <input v-model.number="row.loss" type="number" min="0" step="1" class="biz-input" />
                  </label>
                </div>
                <button type="button" class="bizday-btn del" :data-testid="`bizday-row-del-${i}`" @click="removeRow(i)">移除</button>
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
            <button type="button" class="bizday-add-row" data-testid="bizday-row-add" @click="addRow">＋ 添加商品行</button>
          </div>

          <div class="bizday-revenue-preview">
            营业额：<strong data-testid="bizday-form-revenue">{{ formatYuanOf(formRevenue) }}</strong>
            <span class="bizday-preview-sep">成本 <strong data-testid="bizday-form-cost">{{ formatYuanOf(formCost) }}</strong></span>
            <span class="bizday-preview-sep">利润 <strong data-testid="bizday-form-profit">{{ formatYuanOf(formProfit) }}</strong></span>
            <span class="bizday-preview-sep">损耗 <strong data-testid="bizday-form-loss">{{ formatYuanOf(formLossAmount) }}</strong></span>
          </div>

          <div class="biz-field">
            <label>备注（可选）</label>
            <input v-model="formNote" type="text" maxlength="200" class="biz-input" data-testid="bizday-form-note" />
          </div>

          <div class="biz-form-actions">
            <button type="button" class="bizday-btn" @click="showDialog = false">取消</button>
            <button type="submit" class="bizday-btn save" :disabled="!isFormValid" data-testid="bizday-save">保存</button>
          </div>
        </form>
      </div>
    </div>
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

.bizday-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.bizday-list.bizday-list-scroll {
  overflow-y: auto;
}

@media (max-width: 768px) {
  .bizday {
    min-height: 0;
  }
  .bizday-list {
    flex: none;
    overflow: visible;
  }
}

.bizday-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.bizday-count {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.bizday-add {
  padding: 9px 16px;
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  white-space: nowrap;
}

.bizday-add:hover {
  filter: brightness(1.08);
}

.bizday-empty {
  padding: 40px 20px;
  text-align: center;
  font-size: 14px;
  color: var(--text-muted, var(--color-text-muted));
  background: var(--bg-card, var(--color-bg-card));
  border: 1px dashed var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

.bizday-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
}

.bizday-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
  height: 250px;
  min-height: 250px;
  max-height: 250px;
  overflow: hidden;
}

.bizday-card:hover {
  border-color: var(--accent-color, var(--color-primary));
}

.bizday-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bizday-date {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.bizday-revenue {
  font-size: 18px;
  font-weight: 700;
  color: var(--success-color, var(--color-success));
  font-variant-numeric: tabular-nums;
}

/* P0-1：结构化商品明细行 */
.bizday-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.bizday-detail-head {
  display: grid;
  grid-template-columns: minmax(60px, 1.1fr) minmax(32px, 0.55fr) minmax(32px, 0.55fr) minmax(44px, 0.65fr) minmax(56px, 0.85fr);
  gap: 3px;
  font-size: 11px;
  color: var(--text-muted, var(--color-text-muted));
  padding: 0 2px 4px;
  border-bottom: 1px solid var(--border-color, var(--color-border));
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
  grid-template-columns: minmax(60px, 1.1fr) minmax(32px, 0.55fr) minmax(32px, 0.55fr) minmax(44px, 0.65fr) minmax(56px, 0.85fr);
  gap: 3px;
  padding: 3px 2px;
  font-size: 12px;
  color: var(--text-secondary, var(--color-text-secondary));
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
  color: var(--accent-color, var(--color-primary));
  text-decoration: underline;
}

.bizday-detail-td.loss-red {
  color: var(--error-color, var(--color-error));
  font-weight: 700;
}

.bizday-detail-td.sold-bold {
  font-weight: 700;
  color: var(--text-primary, var(--color-text));
}

.bizday-detail-td.sub-bold {
  font-weight: 700;
  color: var(--success-color, var(--color-success));
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
  color: var(--text-muted, var(--color-text-muted));
  flex-wrap: wrap;
}

.bizday-row-price {
  font-variant-numeric: tabular-nums;
}

.bizday-row-preview {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--text-muted, var(--color-text-muted));
  padding: 4px 4px 0;
  flex-wrap: wrap;
}

.bizday-row-expected.stock-warn {
  color: var(--error-color, var(--color-error));
}

.bizday-stock-warn {
  color: var(--error-color, var(--color-error));
  font-weight: 700;
  margin-left: 4px;
}

.bizday-row-subtotal {
  font-variant-numeric: tabular-nums;
  color: var(--success-color, var(--color-success));
  font-weight: 600;
}

.bizday-stats {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
}

.bizday-stat {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}

.bizday-stat strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.bizday-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  margin-top: auto;
}

.bizday-btn {
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizday-btn:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizday-btn.del:hover {
  color: var(--error-color, var(--color-error));
  border-color: var(--error-color, var(--color-error));
}

.bizday-btn.save {
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizday-btn.save:disabled {
  background: var(--text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

.bizday-add-row {
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
  color: var(--accent-color, var(--color-primary));
  background: none;
  border: 1px dashed var(--accent-color, var(--color-primary));
  border-radius: var(--radius-md, 8px);
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
  background: var(--bg-secondary, var(--color-bg-hover));
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
  color: var(--text-muted, var(--color-text-muted));
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
  background: var(--bg-secondary, var(--color-bg-hover));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.bizday-revenue-preview strong {
  color: var(--success-color, var(--color-success));
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
  color: var(--text-primary, var(--color-text));
}

/* 弹框 */
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

:root.dark .bizday-card,
:root.dark .biz-dialog {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .bizday-date {
  color: var(--text-primary, #f9fafb);
}

:root.dark .bizday-revenue {
  color: #4ade80;
}

:root.dark .bizday-row {
  background-color: var(--bg-card, #1f2937);
}

:root.dark .bizday-btn {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .biz-input {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}

@media (max-width: 1200px) {
  .bizday-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .bizday-grid {
    grid-template-columns: 1fr;
  }
}
</style>
