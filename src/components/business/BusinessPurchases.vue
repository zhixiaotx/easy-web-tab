<script setup lang="ts">
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
        <button
          class="bizpur-tab"
          :class="{ active: activeCat === 'all' }"
          data-testid="bizpur-cat-all"
          @click="activeCat = 'all'"
        >全部</button>
        <button
          v-for="cat in tabs"
          :key="cat.id"
          class="bizpur-tab"
          :class="{ active: activeCat === cat.id }"
          :data-testid="`bizpur-cat-${cat.id}`"
          @click="activeCat = cat.id"
        >{{ cat.name }}</button>
      </div>
      <span class="bizpur-count">共 {{ filteredWithProductFilter.length }} 笔</span>
      <button class="bizpur-add" data-testid="bizpur-add" @click="startAdd">＋ 新增进货</button>
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
          <button class="bizpur-btn" :data-testid="`bizpur-edit-${p.id}`" @click="startEdit(p)">编辑</button>
          <button class="bizpur-btn del" :data-testid="`bizpur-del-${p.id}`" @click="handleDelete(p.id)">删除</button>
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
    <div v-if="showDialog" class="biz-dialog-overlay" @click.self="showDialog = false">
      <div class="biz-dialog" data-testid="bizpur-dialog">
        <div class="biz-dialog-header">
          <h3>{{ editingId ? '编辑进货' : '新增进货' }}</h3>
          <button class="biz-dialog-close" @click="showDialog = false">✕</button>
        </div>
        <form class="biz-dialog-body" @submit.prevent="handleSave">
          <div class="biz-field">
            <label>商品 *</label>
            <select v-model="formProductId" class="biz-input" data-testid="bizpur-form-product">
              <option v-for="p in store.products" :key="p.id" :value="p.id">
                {{ p.name }}{{ p.active ? '' : '（已停售）' }}
              </option>
            </select>
            <!-- P0-2：选中商品后回显当前售价作为参考 -->
            <span v-if="formProductId && findProduct(store.products, formProductId)" class="bizpur-form-price-ref">
              当前售价参考：{{ formatYuanOf(findProduct(store.products, formProductId)!.sellingPrice) }}/件
            </span>
          </div>
          <div class="biz-form-row">
            <div class="biz-field">
              <label>日期 *</label>
              <input v-model="formDate" type="date" class="biz-input" data-testid="bizpur-form-date" />
            </div>
            <div class="biz-field">
              <label>数量 *</label>
              <input v-model="formQuantity" type="number" min="1" step="1" class="biz-input" data-testid="bizpur-form-qty" />
            </div>
            <div class="biz-field">
              <label>单价 *</label>
              <input v-model="formUnitPrice" type="number" min="0" step="0.01" class="biz-input" data-testid="bizpur-form-price" />
            </div>
          </div>
          <div class="biz-field">
            <label>合计（自动计算）</label>
            <div class="bizpur-total-preview" data-testid="bizpur-form-total">{{ formatYuanOf(formTotal) }}</div>
          </div>
          <div class="biz-field">
            <label>备注（可选）</label>
            <input v-model="formNote" type="text" maxlength="100" class="biz-input" data-testid="bizpur-form-note" />
          </div>
          <div class="biz-form-actions">
            <button type="button" class="bizpur-btn" @click="showDialog = false">取消</button>
            <button type="submit" class="bizpur-btn save" :disabled="!isFormValid" data-testid="bizpur-save">
              {{ editingId ? '保存' : '添加' }}
            </button>
          </div>
        </form>
      </div>
    </div>
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
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-full, 999px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizpur-tab:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizpur-tab.active {
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
  color: #fff;
}

.bizpur-count {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.bizpur-add {
  padding: 9px 16px;
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  background: var(--accent-color, var(--color-primary));
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
  color: var(--text-muted, var(--color-text-muted));
  background: var(--bg-card, var(--color-bg-card));
  border: 1px dashed var(--border-color, var(--color-border));
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
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
}

.bizpur-card:hover {
  border-color: var(--accent-color, var(--color-primary));
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
  color: var(--text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.bizpur-date {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.bizpur-product {
  font-size: 13px;
  color: var(--text-primary, var(--color-text));
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
  color: var(--accent-color, var(--color-primary));
  background: color-mix(in srgb, var(--accent-color, var(--color-primary)) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-color, var(--color-primary)) 30%, transparent);
  border-radius: var(--radius-full, 999px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.bizpur-num,
.bizpur-note {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.bizpur-total {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent-color, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

/* P0-2：售价与加价率对照 */
.bizpur-markup {
  display: flex;
  gap: 10px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  padding: 4px 0;
  border-top: 1px dashed var(--border-color, var(--color-border));
}

.bizpur-markup-price {
  color: var(--text-secondary, var(--color-text-secondary));
}

.bizpur-markup-rate.rate-high {
  color: var(--success-color, var(--color-success));
  font-weight: 600;
}

.bizpur-markup-rate.rate-low {
  color: var(--error-color, var(--color-error));
  font-weight: 600;
}

/* P0-2：编辑弹框售价参考 */
.bizpur-form-price-ref {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
  font-variant-numeric: tabular-nums;
}

/* P1-3：商品名可点击 */
.bizpur-product {
  cursor: pointer;
}

.bizpur-product:hover {
  color: var(--accent-color, var(--color-primary));
}

.bizpur-actions {
  display: flex;
  gap: 6px;
}

.bizpur-btn {
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizpur-btn:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizpur-btn.del:hover {
  color: var(--error-color, var(--color-error));
  border-color: var(--error-color, var(--color-error));
}

.bizpur-btn.save {
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizpur-btn.save:disabled {
  background: var(--text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

.bizpur-total-preview {
  font-size: 16px;
  font-weight: 700;
  color: var(--accent-color, var(--color-primary));
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
  background-color: var(--bg-card, var(--color-bg-card));
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

:root.dark .bizpur-list,
:root.dark .biz-dialog {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .bizpur-card {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .bizpur-tab {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .bizpur-tab.active {
  background-color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
  color: #fff;
}

:root.dark .bizpur-cat {
  color: var(--accent-color, var(--color-primary));
  background: color-mix(in srgb, var(--accent-color, var(--color-primary)) 16%, transparent);
  border-color: color-mix(in srgb, var(--accent-color, var(--color-primary)) 35%, transparent);
}

:root.dark .bizpur-date,
:root.dark .bizpur-product {
  color: var(--text-primary, #f9fafb);
}

:root.dark .bizpur-btn {
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
  .bizpur-grid {
    grid-template-columns: 1fr;
  }
}
</style>
