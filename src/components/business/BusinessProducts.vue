<script setup lang="ts">
// 商品管理：分类 tabs（全部 + 可见分类）+ 商品卡片网格 + 新增/编辑弹框 + ⚙️ 分类管理
// P1-3：跨模块联动跳转（商品名可点击跳转进货页）
// P2-2：商品详情抽屉
import { computed, nextTick, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { calcMarkupRate, calcProductSummary, findProductCategory, formatYuanOf, sortProducts, visibleProductCategories } from '@/composables/businessCore'
import { useToast } from '@/composables/useToast'
import type { BusinessProduct } from '@/types'
import BusinessCategoryManager from './BusinessCategoryManager.vue'
import Icon from '@/components/Icon.vue'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from '@/components/workbench/PanelPager.vue'

// P1-3：高亮商品 prop + 跨模块导航 emit
const props = defineProps<{ highlightId?: string }>()
const emit = defineEmits<{ navigate: [section: string, filter?: string] }>()

const store = useWorkbenchBusinessStore()
const toast = useToast()

const activeCat = ref('all')
const showCatManager = ref(false)

const tabs = computed(() => visibleProductCategories(store.productCategories))

const filteredProducts = computed(() => {
  const all = sortProducts(store.products)
  if (activeCat.value === 'all') return all
  return all.filter(p => p.categoryId === activeCat.value)
})

// ===== 自适应分页（5 列，rowHeight 估算 200）=====
const listEl = ref<HTMLElement | null>(null)
const gridEl = ref<HTMLElement | null>(null)
const paging = usePanelPaging({
  items: () => filteredProducts.value,
  rowHeight: 200,
  gap: 12,
  containerRef: listEl,
  gridRef: gridEl
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev, goto } = paging
watch(activeCat, () => goto(1))
watch(filteredProducts, () => nextTick(() => goto(1)))

function catNameOf(categoryId?: string): string {
  if (!categoryId) return '未分类'
  return findProductCategory(store.productCategories, categoryId)?.name ?? '未分类'
}

// ===== 新增/编辑弹框 =====
const showDialog = ref(false)
const editingId = ref<string | null>(null)
const formName = ref('')
const formCategoryId = ref('')
const formUnit = ref('件')
const formPurchasePrice = ref('')
const formSellingPrice = ref('')
const formActive = ref(true)

function numOf(raw: string): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

const isFormValid = computed(
  () => formName.value.trim() !== '' && numOf(formSellingPrice.value) > 0
)

function startAdd(): void {
  editingId.value = null
  formName.value = ''
  formCategoryId.value = ''
  formUnit.value = '件'
  formPurchasePrice.value = ''
  formSellingPrice.value = ''
  formActive.value = true
  showDialog.value = true
}

function startEdit(p: BusinessProduct): void {
  editingId.value = p.id
  formName.value = p.name
  formCategoryId.value = p.categoryId ?? ''
  formUnit.value = p.unit
  formPurchasePrice.value = String(p.purchasePrice)
  formSellingPrice.value = String(p.sellingPrice)
  formActive.value = p.active
  showDialog.value = true
}

async function handleSave(): Promise<void> {
  if (!isFormValid.value) return
  const payload = {
    name: formName.value.trim(),
    categoryId: formCategoryId.value || undefined,
    unit: formUnit.value.trim() || '件',
    purchasePrice: numOf(formPurchasePrice.value),
    sellingPrice: numOf(formSellingPrice.value),
    active: formActive.value
  }
  if (editingId.value) {
    await store.updateProduct(editingId.value, payload)
  } else {
    await store.addProduct(payload)
  }
  showDialog.value = false
}

async function handleToggleActive(p: BusinessProduct): Promise<void> {
  await store.updateProduct(p.id, { active: !p.active })
}

async function handleDelete(p: BusinessProduct): Promise<void> {
  if (!confirm(`确定要删除商品「${p.name}」吗？`)) return
  const r = await store.deleteProduct(p.id)
  if (!r.ok) {
    toast.error(r.reason === 'in-use' ? '该商品已有进货或收摊记录，无法删除（可改为停售）' : '商品不存在')
  }
}

// P1-3：高亮商品
function isHighlighted(id: string): boolean {
  return props.highlightId === id
}

// ===== P2-2：商品详情抽屉 =====
const showDrawer = ref(false)
const drawerProductId = ref<string | null>(null)

const data = computed(() => ({
  productCategories: store.productCategories,
  expenseCategories: store.expenseCategories,
  products: store.products,
  purchases: store.purchases,
  dailyRecords: store.dailyRecords,
  expenses: store.expenses,
  settings: store.settings
}))

const drawerSummary = computed(() => {
  if (!drawerProductId.value) return null
  return calcProductSummary(data.value, drawerProductId.value)
})

function openDetail(p: BusinessProduct): void {
  drawerProductId.value = p.id
  showDrawer.value = true
}

function closeDrawer(): void {
  showDrawer.value = false
  drawerProductId.value = null
}

/** 抽屉内加价率 */
function drawerMarkupRate(): number | null {
  if (!drawerSummary.value?.product) return null
  return calcMarkupRate(drawerSummary.value.product.sellingPrice, drawerSummary.value.product.purchasePrice)
}
</script>

<template>
  <div class="bizprod">
    <!-- 分类 tabs + 新增/分类管理 -->
    <div class="bizprod-bar">
      <div class="bizprod-tabs">
        <el-radio-group v-model="activeCat">
          <el-radio-button value="all" data-testid="bizprod-cat-all">全部</el-radio-button>
          <el-radio-button
            v-for="cat in tabs"
            :key="cat.id"
            :value="cat.id"
            :data-testid="`bizprod-cat-${cat.id}`"
          >{{ cat.name }}</el-radio-button>
        </el-radio-group>
        <el-button data-testid="bizprod-cat-manager" @click="showCatManager = true"><Icon name="cog" :size="15" /></el-button>
      </div>
      <el-button type="primary" data-testid="bizprod-add" @click="startAdd">＋ 新增商品</el-button>
    </div>

    <!-- 商品网格 -->
    <div v-if="filteredProducts.length === 0" class="bizprod-empty" data-testid="bizprod-empty">
      暂无商品，点击右上角「新增商品」添加
    </div>
    <div v-else ref="listEl" class="bizprod-list" :class="{ 'bizprod-list-scroll': !fitsOnePage }">
      <div ref="gridEl" class="bizprod-grid">
      <div
        v-for="p in pageItems"
        :key="p.id"
        class="bizprod-card"
        :class="{ inactive: !p.active, highlighted: isHighlighted(p.id) }"
        :data-testid="`bizprod-card-${p.id}`"
      >
        <div class="bizprod-head">
          <span class="bizprod-name" @click="emit('navigate', 'purchases', p.id)">{{ p.name }}</span>
          <span class="bizprod-cat">{{ catNameOf(p.categoryId) }}</span>
        </div>
        <div class="bizprod-prices">
          <span class="bizprod-price buy">进价 {{ formatYuanOf(p.purchasePrice) }}/{{ p.unit }}</span>
          <span class="bizprod-price sell">售价 {{ formatYuanOf(p.sellingPrice) }}/{{ p.unit }}</span>
        </div>
        <div class="bizprod-foot">
          <el-checkbox
            class="bizprod-active"
            :title="p.active ? '点击停售' : '点击恢复在售'"
            :checked="p.active"
            :data-testid="`bizprod-active-${p.id}`"
            @change="handleToggleActive(p)"
          >{{ p.active ? '在售' : '停售' }}</el-checkbox>
          <div class="bizprod-actions">
            <el-button size="small" :data-testid="`bizprod-detail-${p.id}`" @click="openDetail(p)">详情</el-button>
            <el-button size="small" :data-testid="`bizprod-edit-${p.id}`" @click="startEdit(p)">编辑</el-button>
            <el-button size="small" type="danger" :data-testid="`bizprod-del-${p.id}`" @click="handleDelete(p)">删除</el-button>
          </div>
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
      width="480px"
      :title="editingId ? '编辑商品' : '新增商品'"
      data-testid="bizprod-dialog"
      @close="showDialog = false"
    >
      <form class="biz-dialog-body" @submit.prevent="handleSave">
        <div class="biz-field">
          <label>名称 *</label>
          <el-input v-model="formName" maxlength="40" data-testid="bizprod-form-name" />
        </div>
        <div class="biz-field">
          <label>分类</label>
          <el-select v-model="formCategoryId" data-testid="bizprod-form-category">
            <el-option value="">未分类</el-option>
            <el-option v-for="cat in store.productCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</el-option>
          </el-select>
        </div>
        <div class="biz-form-row">
          <div class="biz-field">
            <label>单位</label>
            <el-input v-model="formUnit" maxlength="8" data-testid="bizprod-form-unit" />
          </div>
          <div class="biz-field">
            <label>进货单价</label>
            <el-input-number
              size="small"
              :min="0"
              :step="0.01"
              :model-value="formPurchasePrice as unknown as number"
              @update:model-value="formPurchasePrice = String($event ?? '')"
              data-testid="bizprod-form-purchase"
            />
          </div>
          <div class="biz-field">
            <label>售价 *</label>
            <el-input-number
              size="small"
              :min="0"
              :step="0.01"
              :model-value="formSellingPrice as unknown as number"
              @update:model-value="formSellingPrice = String($event ?? '')"
              data-testid="bizprod-form-selling"
            />
          </div>
        </div>
        <div class="biz-field">
          <el-checkbox v-model="formActive" data-testid="bizprod-form-active">上架在售</el-checkbox>
        </div>
        <div class="biz-form-actions">
          <el-button @click="showDialog = false">取消</el-button>
          <el-button type="primary" native-type="submit" :disabled="!isFormValid" data-testid="bizprod-save">
            {{ editingId ? '保存' : '添加' }}
          </el-button>
        </div>
      </form>
    </el-dialog>

    <BusinessCategoryManager v-if="showCatManager" kind="product" @close="showCatManager = false" />

    <!-- P2-2：商品详情抽屉 -->
    <el-drawer
      v-if="showDrawer && drawerSummary"
      :model-value="true"
      size="380px"
      direction="rtl"
      title="商品详情"
      data-testid="bizprod-drawer"
      @close="closeDrawer"
    >
      <div class="bizprod-drawer-body" v-if="drawerSummary.product">
        <!-- 基础信息 -->
        <div class="bizprod-drawer-section">
          <div class="bizprod-drawer-info-row">
            <span class="bizprod-drawer-label">商品名</span>
            <span class="bizprod-drawer-value">{{ drawerSummary.product.name }}</span>
          </div>
          <div class="bizprod-drawer-info-row">
            <span class="bizprod-drawer-label">分类</span>
            <span class="bizprod-drawer-value">{{ catNameOf(drawerSummary.product.categoryId) }}</span>
          </div>
          <div class="bizprod-drawer-info-row">
            <span class="bizprod-drawer-label">状态</span>
            <span class="bizprod-drawer-value" :class="{ 'status-active': drawerSummary.product.active, 'status-inactive': !drawerSummary.product.active }">
              {{ drawerSummary.product.active ? '在售' : '停售' }}
            </span>
          </div>
          <div class="bizprod-drawer-info-row">
            <span class="bizprod-drawer-label">进价/售价</span>
            <span class="bizprod-drawer-value">
              {{ formatYuanOf(drawerSummary.product.purchasePrice) }} → {{ formatYuanOf(drawerSummary.product.sellingPrice) }}
              <span class="bizprod-drawer-markup" :class="{ 'rate-high': (drawerMarkupRate() ?? 0) > 0, 'rate-low': (drawerMarkupRate() ?? 0) <= 0 }">
                加价率 {{ drawerMarkupRate() ?? '—' }}%
              </span>
            </span>
          </div>
        </div>

        <!-- 经营数据 -->
        <div class="bizprod-drawer-section">
          <div class="bizprod-drawer-section-title"><Icon name="stats" :size="15" /> 经营数据</div>
          <div class="bizprod-drawer-stats">
            <div class="bizprod-drawer-stat">
              <span class="bizprod-drawer-stat-label">总进货</span>
              <span class="bizprod-drawer-stat-value">{{ drawerSummary.totalPurchased }}</span>
            </div>
            <div class="bizprod-drawer-stat">
              <span class="bizprod-drawer-stat-label">总带出</span>
              <span class="bizprod-drawer-stat-value">{{ drawerSummary.totalBroughtOut }}</span>
            </div>
            <div class="bizprod-drawer-stat">
              <span class="bizprod-drawer-stat-label">总售出</span>
              <span class="bizprod-drawer-stat-value">{{ drawerSummary.totalSold }}</span>
            </div>
            <div class="bizprod-drawer-stat">
              <span class="bizprod-drawer-stat-label">总损耗</span>
              <span class="bizprod-drawer-stat-value">{{ drawerSummary.totalLoss }}</span>
            </div>
            <div class="bizprod-drawer-stat">
              <span class="bizprod-drawer-stat-label">当前库存</span>
              <span class="bizprod-drawer-stat-value">{{ drawerSummary.currentStock }}</span>
            </div>
            <div class="bizprod-drawer-stat">
              <span class="bizprod-drawer-stat-label">累计营业额</span>
              <span class="bizprod-drawer-stat-value">{{ formatYuanOf(drawerSummary.totalRevenue) }}</span>
            </div>
            <div class="bizprod-drawer-stat">
              <span class="bizprod-drawer-stat-label">累计成本</span>
              <span class="bizprod-drawer-stat-value">{{ formatYuanOf(drawerSummary.totalCost) }}</span>
            </div>
            <div class="bizprod-drawer-stat">
              <span class="bizprod-drawer-stat-label">累计利润</span>
              <span class="bizprod-drawer-stat-value" :class="{ negative: drawerSummary.totalProfit < 0 }">{{ formatYuanOf(drawerSummary.totalProfit) }}</span>
            </div>
          </div>
        </div>

        <!-- 进货记录（最近 5 笔） -->
        <div class="bizprod-drawer-section">
          <div class="bizprod-drawer-section-title"><Icon name="purchases" :size="15" /> 进货记录（最近 5 笔）</div>
          <p v-if="drawerSummary.recentPurchases.length === 0" class="bizprod-drawer-empty">暂无进货记录</p>
          <div v-else class="bizprod-drawer-records">
            <div
              v-for="pur in drawerSummary.recentPurchases"
              :key="pur.id"
              class="bizprod-drawer-record"
              @click="emit('navigate', 'purchases', drawerSummary.product!.id)"
            >
              <span class="bizprod-drawer-record-date">{{ pur.date }}</span>
              <span class="bizprod-drawer-record-detail">×{{ pur.quantity }} @{{ formatYuanOf(pur.unitPrice) }}</span>
              <span class="bizprod-drawer-record-total">{{ formatYuanOf(pur.total) }}</span>
            </div>
          </div>
        </div>

        <!-- 收摊记录（最近 5 笔） -->
        <div class="bizprod-drawer-section">
          <div class="bizprod-drawer-section-title"><Icon name="daily" :size="15" /> 收摊记录（最近 5 笔）</div>
          <p v-if="drawerSummary.recentDailyRecords.length === 0" class="bizprod-drawer-empty">暂无收摊记录</p>
          <div v-else class="bizprod-drawer-records">
            <div
              v-for="rec in drawerSummary.recentDailyRecords"
              :key="rec.id"
              class="bizprod-drawer-record"
              @click="emit('navigate', 'daily')"
            >
              <span class="bizprod-drawer-record-date">{{ rec.date }}</span>
              <span class="bizprod-drawer-record-detail">营业额 {{ formatYuanOf(rec.totalRevenue) }}</span>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.bizprod {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-height: 0;
}

.bizprod-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}
.bizprod-list.bizprod-list-scroll {
  overflow-y: auto;
}

@media (max-width: 768px) {
  .bizprod { min-height: 0; }
  .bizprod-list { flex: none; overflow: visible; }
}

.bizprod-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.bizprod-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* 分类 tabs 药丸样式（el-radio-button 覆写，对齐原 .bizprod-tab） */
.bizprod-tabs :deep(.el-radio-group) {
  flex-wrap: wrap;
  gap: 8px;
}

.bizprod-tabs :deep(.el-radio-button + .el-radio-button) {
  margin-left: 0;
}

.bizprod-tabs :deep(.el-radio-button__inner) {
  padding: 7px 14px;
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-full, 999px);
  box-shadow: none;
  transition: all var(--transition-fast, 0.15s ease);
}

.bizprod-tabs :deep(.el-radio-button__inner:hover) {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.bizprod-tabs :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
  color: #fff;
  box-shadow: none;
}

.bizprod-empty {
  padding: 40px 20px;
  text-align: center;
  font-size: 14px;
  color: var(--color-text-muted, var(--color-text-muted));
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

.bizprod-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
}

.bizprod-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
}

.bizprod-card:hover {
  border-color: var(--color-primary, var(--color-primary));
}

.bizprod-card.inactive {
  opacity: 0.6;
}

.bizprod-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bizprod-name {
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizprod-cat {
  flex-shrink: 0;
  font-size: 12px;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  color: var(--color-primary, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
}

.bizprod-prices {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.bizprod-price {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizprod-price.sell {
  color: var(--color-success, var(--color-success));
  font-weight: 600;
}

.bizprod-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bizprod-active {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  margin-right: 0;
}

.bizprod-active :deep(.el-checkbox__label) {
  padding-left: 0;
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizprod-actions {
  display: flex;
  gap: 6px;
}

/* 弹框（复用体系） */
.biz-dialog-body {
  padding: 0;
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

/* el-* 表单控件撑满字段 */
.bizprod :deep(.el-input-number) {
  width: 100%;
}

/* el-dialog 外壳对齐原弹框 */
.bizprod :deep(.el-dialog) {
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.bizprod :deep(.el-dialog__header) {
  flex-shrink: 0;
}

.bizprod :deep(.el-dialog__body) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

html.dark .bizprod-card {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .bizprod-name {
  color: var(--color-text, #f9fafb);
}

@media (max-width: 640px) {
  .bizprod-grid {
    grid-template-columns: 1fr;
  }
}

/* P1-3：高亮商品 */
.bizprod-card.highlighted {
  border-color: var(--color-primary, var(--color-primary));
  box-shadow: 0 0 0 2px var(--color-primary, var(--color-primary));
}

.bizprod-name {
  cursor: pointer;
}

.bizprod-name:hover {
  color: var(--color-primary, var(--color-primary));
  text-decoration: underline;
}

/* P2-2：商品详情抽屉 */
.bizprod-drawer-body {
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.bizprod-drawer-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bizprod-drawer-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
}

.bizprod-drawer-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}

.bizprod-drawer-label {
  color: var(--color-text-muted, var(--color-text-muted));
  flex-shrink: 0;
}

.bizprod-drawer-value {
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.bizprod-drawer-markup.rate-high {
  color: var(--color-success, var(--color-success));
  font-size: 12px;
}

.bizprod-drawer-markup.rate-low {
  color: var(--color-error, var(--color-error));
  font-size: 12px;
}

.bizprod-drawer-value.status-active {
  color: var(--color-success, var(--color-success));
}

.bizprod-drawer-value.status-inactive {
  color: var(--color-text-muted, var(--color-text-muted));
}

.bizprod-drawer-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.bizprod-drawer-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: var(--radius-sm, 6px);
}

.bizprod-drawer-stat-label {
  font-size: 11px;
  color: var(--color-text-muted, var(--color-text-muted));
}

.bizprod-drawer-stat-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.bizprod-drawer-stat-value.negative {
  color: var(--color-error, var(--color-error));
}

.bizprod-drawer-empty {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted, var(--color-text-muted));
}

.bizprod-drawer-records {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bizprod-drawer-record {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: background 0.15s ease;
  font-variant-numeric: tabular-nums;
}

.bizprod-drawer-record:hover {
  background: var(--color-bg-card, var(--color-bg-card));
}

.bizprod-drawer-record-date {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
}

.bizprod-drawer-record-detail {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizprod-drawer-record-total {
  flex-shrink: 0;
  font-weight: 700;
  color: var(--color-primary, var(--color-primary));
}

/* el-drawer 外壳对齐原抽屉 */
.bizprod :deep(.el-drawer__header) {
  margin-bottom: 0;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
}

html.dark .bizprod-drawer-stat {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .bizprod-drawer-record {
  background-color: var(--color-bg-card, #1f2937);
}
</style>
