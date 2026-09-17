<script setup lang="ts">
import { useViewMode } from '@/composables/useViewMode'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'

const vm = useViewMode()

function cardFields(row: any) {
  const p = findProduct(store.products, row.productId)
  const m = markupRateOf(row.productId, row.unitPrice)
  return [
    { label: '日期', value: row.date },
    { label: '商品', value: productNameOf(row.productId) },
    { label: '分类', value: catNameOf(row.productId) },
    { label: '数量', value: '×' + row.quantity },
    { label: '单价', value: '@' + formatYuanOf(row.unitPrice) },
    { label: '合计', value: formatYuanOf(row.total) },
    { label: '售价', value: p ? formatYuanOf(productSellingPrice(row.productId)!) + '/件' : '—' },
    { label: '加价率', value: m != null ? m + '%' : '—' },
    { label: '备注', value: row.note || '—' }
  ]
}

import Icon from '../Icon.vue'
// 进货记录：分类 tabs（全部+可见分类）+ el-table 行式列表 + 新增/编辑弹框
// P0-2：进货行展示售价与加价率对照
// P1-3：跨模块联动跳转
import { computed, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { calcMarkupRate, filterPurchasesByCategory, findProduct, findProductCategory, formatYuanOf, localDateKey, visibleProductCategories } from '@/composables/businessCore'
import { buildCsv, csvFileName, downloadCsv } from '@/composables/csvExport'
import type { BusinessPurchase } from '@/types'

// P1-3：跨模块联动跳转 emit
const emit = defineEmits<{ navigate: [section: string, filter?: string] }>()

const store = useWorkbenchBusinessStore()

const activeCat = ref('all')
const tabs = computed(() => visibleProductCategories(store.productCategories))
const filtered = computed(() => filterPurchasesByCategory(store.purchases, store.products, activeCat.value))

function productNameOf(id: string): string {
  return findProduct(store.products, id)?.name ?? '（已删除商品）'
}

function catNameOf(productId: string): string {
  const catId = findProduct(store.products, productId)?.categoryId
  return catId ? (findProductCategory(store.productCategories, catId)?.name ?? '未分类') : '未分类'
}

// ===== 一键导出 CSV（进货记录：按当前分类/商品筛选导出）=====
function exportPurchasesCsv(): void {
  const headers = ['日期', '商品', '分类', '数量', '进货单价', '金额', '备注']
  const rows: (string | number)[][] = filteredWithProductFilter.value.map(p => [
    p.date,
    productNameOf(p.productId),
    catNameOf(p.productId),
    p.quantity,
    p.unitPrice.toFixed(2),
    p.total.toFixed(2),
    p.note ?? ''
  ])
  downloadCsv(csvFileName('进货记录'), buildCsv(headers, rows))
}

// P0-2：获取商品售价
function productSellingPrice(productId: string): number | null {
  return findProduct(store.products, productId)?.sellingPrice ?? null
}

// P0-2：计算加价率（售价 vs 进价）
function markupRateOf(productId: string, unitPrice: number): number | null {
  const product = findProduct(store.products, productId)
  if (!product) return null
  return calcMarkupRate(product.sellingPrice, unitPrice)
}

// P1-3：按商品筛选 prop
const props = defineProps<{ productFilter?: string }>()

// P1-3：实际过滤后的列表（叠加 productFilter）
const filteredWithProductFilter = computed(() => {
  let list = filtered.value
  if (props.productFilter) {
    list = list.filter(p => p.productId === props.productFilter)
  }
  return list
})

// ===== el-pagination 分页（固定 10 条/页） =====
const LIST_PAGE_SIZE = 10
const listPage = ref(1)
const pageItems = computed<BusinessPurchase[]>(() => {
  const start = (listPage.value - 1) * LIST_PAGE_SIZE
  return filteredWithProductFilter.value.slice(start, start + LIST_PAGE_SIZE)
})
watch(activeCat, () => { listPage.value = 1 })
watch(() => props.productFilter, () => { listPage.value = 1 })
watch(filteredWithProductFilter, () => { listPage.value = 1 })

// ===== 新增/编辑弹框 =====
const showDialog = ref(false)
const editingId = ref<string | null>(null)
const formProductId = ref('')
const formDate = ref(localDateKey())
const formQuantity = ref('')
const formUnitPrice = ref('')
const formNote = ref('')

const formTotal = computed(() => {
  const q = Number(formQuantity.value) || 0
  const p = Number(formUnitPrice.value) || 0
  return Math.round(q * p * 100) / 100
})

const isFormValid = computed(
  () => formProductId.value !== '' && formDate.value !== '' && formTotal.value > 0
)

function startAdd(): void {
  editingId.value = null
  formProductId.value = store.products.find(p => p.active)?.id ?? store.products[0]?.id ?? ''
  formDate.value = localDateKey()
  formQuantity.value = ''
  formUnitPrice.value = ''
  formNote.value = ''
  showDialog.value = true
}

function startEdit(p: BusinessPurchase): void {
  editingId.value = p.id
  formProductId.value = p.productId
  formDate.value = p.date
  formQuantity.value = String(p.quantity)
  formUnitPrice.value = String(p.unitPrice)
  formNote.value = p.note ?? ''
  showDialog.value = true
}

async function handleSave(): Promise<void> {
  if (!isFormValid.value) return
  const payload = {
    productId: formProductId.value,
    date: formDate.value,
    quantity: Number(formQuantity.value),
    unitPrice: Number(formUnitPrice.value),
    note: formNote.value.trim() || undefined
  }
  if (editingId.value) {
    await store.updatePurchase(editingId.value, payload)
  } else {
    await store.addPurchase(payload)
  }
  showDialog.value = false
}

async function handleDelete(id: string): Promise<void> {
  if (!confirm('确定要删除这笔记货吗？')) return
  await store.deletePurchase(id)
}
</script>

<template>
  <div class="bizpur">
    <!-- 分类 tabs + 新增 -->
    <div class="bizpur-bar">
      <div class="bizpur-tabs">
        <el-radio-group v-model="activeCat" size="small">
          <el-radio-button value="all" data-testid="bizpur-cat-all">全部</el-radio-button>
          <el-radio-button
            v-for="cat in tabs"
            :key="cat.id"
            :value="cat.id"
            :data-testid="`bizpur-cat-${cat.id}`"
          >{{ cat.name }}</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <div class="ewt-table-toolbar is-split">
      <div class="bizpur-toolbar-left">
        <el-button type="primary" data-testid="bizpur-add" @click="startAdd">＋ 新增进货</el-button>
        <el-button class="btn-export-csv" data-testid="bizpur-export" :disabled="filteredWithProductFilter.length === 0" @click="exportPurchasesCsv">导出 CSV</el-button>
      </div>
      <ViewModeToggle v-if="filteredWithProductFilter.length > 0" :mode="vm.mode" @toggle="vm.toggle" />
    </div>

    <div v-if="filteredWithProductFilter.length === 0" class="bizpur-empty" data-testid="bizpur-empty">暂无进货记录</div>
    <template v-else>
      <div class="bizpur-table-wrap">
        <el-table v-if="vm.mode === 'list'" class="ewt-table"
          :data="pageItems"
          data-testid="bizpur-table"
          stripe
          border
          size="default"
          style="width: 100%"
          height="100%"
          empty-text="暂无进货记录"
        >
          <el-table-column label="日期" width="120" align="center">
            <template #default="{ row }">
              <span style="font-weight: 600;">{{ row.date }}</span>
            </template>
          </el-table-column>
          <el-table-column label="商品" min-width="160" align="left" show-overflow-tooltip>
            <template #default="{ row }">
              <span
                class="bizpur-product-link"
                :data-testid="`bizpur-product-${row.id}`"
                @click="findProduct(store.products, row.productId) && emit('navigate', 'products', row.productId)"
              >{{ productNameOf(row.productId) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="分类" width="110" align="center">
            <template #default="{ row }">
              <span class="bizpur-cat-badge" :data-testid="`bizpur-cat-badge-${row.id}`">{{ catNameOf(row.productId) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="数量" width="80" align="right">
            <template #default="{ row }">×{{ row.quantity }}</template>
          </el-table-column>
          <el-table-column label="单价" width="100" align="right">
            <template #default="{ row }">@{{ formatYuanOf(row.unitPrice) }}</template>
          </el-table-column>
          <el-table-column label="合计" width="110" align="right">
            <template #default="{ row }">
              <span class="bizpur-total-text">{{ formatYuanOf(row.total) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="售价" width="100" align="right">
            <template #default="{ row }">
              <span v-if="findProduct(store.products, row.productId)">{{ formatYuanOf(productSellingPrice(row.productId)!) }}/件</span>
              <span v-else style="color: var(--color-text-muted, #9ca3af);">—</span>
            </template>
          </el-table-column>
          <el-table-column label="加价率" width="100" align="center">
            <template #default="{ row }">
              <span
                v-if="markupRateOf(row.productId, row.unitPrice) !== null"
                class="bizpur-markup-rate"
                :class="{
                  'rate-high': (markupRateOf(row.productId, row.unitPrice) ?? 0) > 0,
                  'rate-low': (markupRateOf(row.productId, row.unitPrice) ?? 0) <= 0
                }"
              >{{ markupRateOf(row.productId, row.unitPrice) }}%</span>
              <span v-else style="color: var(--color-text-muted, #9ca3af);">—</span>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="140" align="left" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.note" class="bizpur-note-text">{{ row.note }}</span>
              <span v-else style="color: var(--color-text-muted, #9ca3af);">—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" class-name="ewt-op-col" width="140" align="center" fixed="right">
            <template #default="{ row }">
              <div class="bizpur-actions" @click.stop>
                <el-button size="small" :data-testid="`bizpur-edit-${row.id}`" @click="startEdit(row)">编辑</el-button>
                <el-button size="small" type="danger" :data-testid="`bizpur-del-${row.id}`" @click="handleDelete(row.id)">删除</el-button>
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
      <div class="bizpur-list-pager">
        <el-pagination
          v-model:current-page="listPage"
          :page-size="LIST_PAGE_SIZE"
          :page-sizes="[LIST_PAGE_SIZE]"
          layout="total, prev, pager, next, jumper"
          :total="filteredWithProductFilter.length"
          background
          small
          prev-text="上一页"
          next-text="下一页"
          data-testid="bizpur-pagination"
        />
      </div>
    </template>

    <!-- 新增/编辑弹框 -->
    <el-dialog
      v-if="showDialog"
      :model-value="true"
      :show-close="false"
      width="480px"
      data-testid="bizpur-dialog"
      @close="showDialog = false"
    >
      <template #header>
        <div class="biz-dialog-header">
          <h3>{{ editingId ? '编辑进货' : '新增进货' }}</h3>
          <button class="biz-dialog-close" @click="showDialog = false"><Icon name="close" /></button>
        </div>
      </template>
      <form class="biz-dialog-body" @submit.prevent="handleSave">
        <div class="biz-field">
          <label>商品 *</label>
          <el-select v-model="formProductId" size="small" data-testid="bizpur-form-product">
            <el-option
              v-for="p in store.products"
              :key="p.id"
              :value="p.id"
              :label="p.name + (p.active ? '' : '（已停售）')"
            />
          </el-select>
          <!-- P0-2：选中商品后回显当前售价作为参考 -->
          <span v-if="formProductId && findProduct(store.products, formProductId)" class="bizpur-form-price-ref">
            当前售价参考：{{ formatYuanOf(findProduct(store.products, formProductId)!.sellingPrice) }}/件
          </span>
        </div>
        <div class="biz-form-row">
          <div class="biz-field">
            <label>日期 *</label>
            <div data-testid="bizpur-form-date">
              <el-date-picker
                v-model="formDate"
                type="date"
                value-format="YYYY-MM-DD"
                size="small"
              />
            </div>
          </div>
          <div class="biz-field">
            <label>数量 *</label>
            <el-input-number
              :min="1"
              :step="1"
              size="small"
              controls-position="right"
              :model-value="formQuantity === '' ? undefined : Number(formQuantity)"
              @update:model-value="formQuantity = String($event ?? '')"
              data-testid="bizpur-form-qty"
            />
          </div>
          <div class="biz-field">
            <label>单价 *</label>
            <el-input-number
              :min="0"
              :step="0.01"
              size="small"
              controls-position="right"
              :model-value="formUnitPrice === '' ? undefined : Number(formUnitPrice)"
              @update:model-value="formUnitPrice = String($event ?? '')"
              data-testid="bizpur-form-price"
            />
          </div>
        </div>
        <div class="biz-field">
          <label>合计（自动计算）</label>
          <div class="bizpur-total-preview" data-testid="bizpur-form-total">{{ formatYuanOf(formTotal) }}</div>
        </div>
        <div class="biz-field">
          <label>备注（可选）</label>
          <el-input v-model="formNote" size="small" maxlength="100" data-testid="bizpur-form-note" />
        </div>
        <div class="biz-form-actions ewt-dialog-footer">
          <el-button @click="showDialog = false">取消</el-button>
          <el-button type="primary" native-type="submit" :disabled="!isFormValid" data-testid="bizpur-save">
            {{ editingId ? '保存' : '添加' }}
          </el-button>
          <el-button v-if="editingId" type="danger" native-type="button" data-testid="bizpur-record-delete" @click="handleDelete(editingId)">删除</el-button>
        </div>
      </form>
    </el-dialog>
  </div>
</template>

<style scoped>
.bizpur {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.bizpur-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.bizpur-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bizpur-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bizpur-empty {
  padding: 40px 20px;
  text-align: center;
  font-size: 14px;
  color: var(--color-text-muted, var(--color-text-muted));
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

/* ===== el-table 表格容器（参考 WorkbenchNotes） ===== */
.bizpur-table-wrap {
  flex: 1 1 auto;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.bizpur-table-wrap > :global(.el-table) {
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
.bizpur-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.bizpur-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .bizpur-table-wrap > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(html.dark) .bizpur-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .bizpur-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
.bizpur-table-wrap > :global(.el-table .el-table__body-wrapper .cell),
.bizpur-table-wrap > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
}

/* ===== 分页条（参考 WorkbenchNotes） ===== */
.bizpur-list-pager {
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
:global(html.dark) .bizpur-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}
.bizpur-list-pager > :global(.el-pagination) { --el-pagination-bg-color: transparent; }
.bizpur-list-pager > :global(.el-pagination button),
.bizpur-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #ffffff) !important;
  border: 1px solid var(--color-border, #e5e7eb) !important;
  color: var(--color-text-secondary, #6b7280) !important;
}
.bizpur-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
:global(html.dark) .bizpur-list-pager > :global(.el-pagination button),
:global(html.dark) .bizpur-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #1f2937) !important;
  border-color: var(--color-border, #374151) !important;
  color: var(--color-text-secondary, #d1d5db) !important;
}
:global(html.dark) .bizpur-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
.bizpur-list-pager > :global(.el-pagination__total) {
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
}

/* ===== 表格内徽章/链接/标签 ===== */
.bizpur-product-link {
  color: var(--color-link, var(--color-primary, #3b82f6));
  cursor: pointer;
  text-decoration: underline;
}
.bizpur-product-link:hover {
  color: var(--color-primary-hover, var(--color-primary, #2563eb));
}
.bizpur-cat-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-primary, var(--color-primary));
  background: color-mix(in srgb, var(--color-primary, var(--color-primary)) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary, var(--color-primary)) 30%, transparent);
  border-radius: var(--radius-full, 999px);
  white-space: nowrap;
}
.bizpur-total-text {
  font-weight: 700;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}
.bizpur-markup-rate.rate-high {
  color: var(--color-success, var(--color-success));
  font-weight: 600;
}
.bizpur-markup-rate.rate-low {
  color: var(--color-error, var(--color-error));
  font-weight: 600;
}
.bizpur-note-text {
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
}
.bizpur-actions {
  display: flex;
  gap: 6px;
  justify-content: center;
}

/* P0-2：编辑弹框售价参考 */
.bizpur-form-price-ref {
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
  font-variant-numeric: tabular-nums;
}

.bizpur-total-preview {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
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

.biz-form-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.biz-form-row .biz-field {
  flex: 1;
  min-width: 110px;
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

html.dark .bizpur-cat-badge {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

html.dark .biz-input {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text, #f9fafb);
  border-color: var(--color-border, #374151);
}

/* el-* 表单控件撑满字段 */
.bizpur :deep(.el-date-editor) {
  width: 100%;
}

.bizpur :deep(.el-input-number) {
  width: 100%;
}

/* el-dialog 外壳对齐原弹框 */
.bizpur :deep(.el-dialog) {
  padding: 0;
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
  max-height: 85vh;
  overflow-y: auto;
}

.bizpur :deep(.el-dialog__header) {
  padding: 0;
}

.bizpur :deep(.el-dialog__body) {
  padding: 0;
}
</style>
