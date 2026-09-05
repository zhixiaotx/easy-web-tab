<script setup lang="ts">
import Icon from '../Icon.vue'
// 进货记录：分类 tabs（全部+可见分类）+ 行式列表（分类徽标）+ 新增/编辑弹框
// P0-2：进货卡片增加售价与加价率对照
// P1-3：跨模块联动跳转
import { computed, nextTick, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { calcMarkupRate, filterPurchasesByCategory, findProduct, findProductCategory, formatYuanOf, localDateKey, visibleProductCategories } from '@/composables/businessCore'
import type { BusinessPurchase } from '@/types'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from '@/components/workbench/PanelPager.vue'

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

// ===== 自适应分页（5 列，rowHeight 估算 240）=====
const listEl = ref<HTMLElement | null>(null)
const gridEl = ref<HTMLElement | null>(null)
const paging = usePanelPaging({
  items: () => filteredWithProductFilter.value,
  rowHeight: 240,
  gap: 12,
  containerRef: listEl,
  gridRef: gridEl
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev, goto } = paging
watch(activeCat, () => goto(1))
watch(() => props.productFilter, () => goto(1))
watch(filteredWithProductFilter, () => nextTick(() => goto(1)))

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
      <span class="bizpur-count">共 {{ filteredWithProductFilter.length }} 笔</span>
      <el-button type="primary" data-testid="bizpur-add" @click="startAdd">＋ 新增进货</el-button>
    </div>

    <div v-if="filteredWithProductFilter.length === 0" class="bizpur-empty" data-testid="bizpur-empty">暂无进货记录</div>
    <div v-else ref="listEl" class="bizpur-list" :class="{ 'bizpur-list-scroll': !fitsOnePage }">
      <div ref="gridEl" class="bizpur-grid">
      <div v-for="p in pageItems" :key="p.id" class="bizpur-card" :data-testid="`bizpur-card-${p.id}`">
        <div class="bizpur-card-head">
          <span class="bizpur-date">{{ p.date }}</span>
          <span class="bizpur-cat" :data-testid="`bizpur-cat-badge-${p.id}`">{{ catNameOf(p.productId) }}</span>
        </div>
        <div class="bizpur-product" @click="findProduct(store.products, p.productId) && emit('navigate', 'products', p.productId)">{{ productNameOf(p.productId) }}</div>
        <div class="bizpur-card-detail">
          <span class="bizpur-num">×{{ p.quantity }}</span>
          <span class="bizpur-num">@{{ formatYuanOf(p.unitPrice) }}</span>
        </div>
        <div class="bizpur-total">{{ formatYuanOf(p.total) }}</div>
        <!-- P0-2：售价与加价率对照（商品已删除不显示） -->
        <div v-if="findProduct(store.products, p.productId)" class="bizpur-markup">
          <span class="bizpur-markup-price">售价 {{ formatYuanOf(productSellingPrice(p.productId)!) }}/件</span>
          <span
            class="bizpur-markup-rate"
            :class="{
              'rate-high': (markupRateOf(p.productId, p.unitPrice) ?? 0) > 0,
              'rate-low': (markupRateOf(p.productId, p.unitPrice) ?? 0) <= 0
            }"
          >加价率 {{ markupRateOf(p.productId, p.unitPrice) ?? '—' }}%</span>
        </div>
        <div class="bizpur-actions">
          <el-button size="small" :data-testid="`bizpur-edit-${p.id}`" @click="startEdit(p)">编辑</el-button>
          <el-button size="small" type="danger" :data-testid="`bizpur-del-${p.id}`" @click="handleDelete(p.id)">删除</el-button>
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
        <div class="biz-form-actions">
          <el-button @click="showDialog = false">取消</el-button>
          <el-button type="primary" native-type="submit" :disabled="!isFormValid" data-testid="bizpur-save">
            {{ editingId ? '保存' : '添加' }}
          </el-button>
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

.bizpur-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}
.bizpur-list.bizpur-list-scroll {
  overflow-y: auto;
}

@media (max-width: 768px) {
  .bizpur { min-height: 0; }
  .bizpur-list { flex: none; overflow: visible; }
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

.bizpur-tab {
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-full, 999px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizpur-tab:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.bizpur-tab.active {
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
  color: #fff;
}

.bizpur-count {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizpur-add {
  padding: 9px 16px;
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  background: var(--color-primary, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  white-space: nowrap;
}

.bizpur-add:hover {
  filter: brightness(1.08);
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

.bizpur-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
}

.bizpur-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
}

.bizpur-card:hover {
  border-color: var(--color-primary, var(--color-primary));
}

.bizpur-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bizpur-card-detail {
  display: flex;
  gap: 10px;
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.bizpur-date {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.bizpur-product {
  font-size: 13px;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizpur-cat {
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
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.bizpur-num,
.bizpur-note {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.bizpur-total {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

/* P0-2：售价与加价率对照 */
.bizpur-markup {
  display: flex;
  gap: 10px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  padding: 4px 0;
  border-top: 1px dashed var(--color-border, var(--color-border));
}

.bizpur-markup-price {
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizpur-markup-rate.rate-high {
  color: var(--color-success, var(--color-success));
  font-weight: 600;
}

.bizpur-markup-rate.rate-low {
  color: var(--color-error, var(--color-error));
  font-weight: 600;
}

/* P0-2：编辑弹框售价参考 */
.bizpur-form-price-ref {
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
  font-variant-numeric: tabular-nums;
}

/* P1-3：商品名可点击 */
.bizpur-product {
  cursor: pointer;
}

.bizpur-product:hover {
  color: var(--color-primary, var(--color-primary));
}

.bizpur-actions {
  display: flex;
  gap: 6px;
}

.bizpur-btn {
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizpur-btn:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.bizpur-btn.del:hover {
  color: var(--color-error, var(--color-error));
  border-color: var(--color-error, var(--color-error));
}

.bizpur-btn.save {
  color: #fff;
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.bizpur-btn.save:disabled {
  background: var(--color-text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

.bizpur-total-preview {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
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
  background-color: var(--color-bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg, 12px);
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
}

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

html.dark .bizpur-list,
html.dark .biz-dialog {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .bizpur-card {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .bizpur-tab {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .bizpur-tab.active {
  background-color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
  color: #fff;
}

html.dark .bizpur-cat {
  color: var(--color-primary, var(--color-primary));
  background: color-mix(in srgb, var(--color-primary, var(--color-primary)) 16%, transparent);
  border-color: color-mix(in srgb, var(--color-primary, var(--color-primary)) 35%, transparent);
}

html.dark .bizpur-date,
html.dark .bizpur-product {
  color: var(--color-text, #f9fafb);
}

html.dark .bizpur-btn {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .biz-input {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text, #f9fafb);
  border-color: var(--color-border, #374151);
}

@media (max-width: 640px) {
  .bizpur-grid {
    grid-template-columns: 1fr;
  }
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
