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
        <button
          class="bizprod-tab"
          :class="{ active: activeCat === 'all' }"
          data-testid="bizprod-cat-all"
          @click="activeCat = 'all'"
        >全部</button>
        <button
          v-for="cat in tabs"
          :key="cat.id"
          class="bizprod-tab"
          :class="{ active: activeCat === cat.id }"
          :data-testid="`bizprod-cat-${cat.id}`"
          @click="activeCat = cat.id"
        >{{ cat.name }}</button>
        <button class="bizprod-tab bizprod-cat-btn" data-testid="bizprod-cat-manager" @click="showCatManager = true"><Icon name="cog" :size="15" /></button>
      </div>
      <button class="bizprod-add" data-testid="bizprod-add" @click="startAdd">＋ 新增商品</button>
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
          <label class="bizprod-active" :title="p.active ? '点击停售' : '点击恢复在售'">
            <input
              type="checkbox"
              :checked="p.active"
              :data-testid="`bizprod-active-${p.id}`"
              @change="handleToggleActive(p)"
            />
            {{ p.active ? '在售' : '停售' }}
          </label>
          <div class="bizprod-actions">
            <button class="bizprod-btn" :data-testid="`bizprod-detail-${p.id}`" @click="openDetail(p)">详情</button>
            <button class="bizprod-btn" :data-testid="`bizprod-edit-${p.id}`" @click="startEdit(p)">编辑</button>
            <button class="bizprod-btn del" :data-testid="`bizprod-del-${p.id}`" @click="handleDelete(p)">删除</button>
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
    <div v-if="showDialog" class="biz-dialog-overlay" @click.self="showDialog = false">
      <div class="biz-dialog" data-testid="bizprod-dialog">
        <div class="biz-dialog-header">
          <h3>{{ editingId ? '编辑商品' : '新增商品' }}</h3>
          <button class="biz-dialog-close" @click="showDialog = false"><Icon name="close" /></button>
        </div>
        <form class="biz-dialog-body" @submit.prevent="handleSave">
          <div class="biz-field">
            <label>名称 *</label>
            <input v-model="formName" type="text" maxlength="40" class="biz-input" data-testid="bizprod-form-name" />
          </div>
          <div class="biz-field">
            <label>分类</label>
            <select v-model="formCategoryId" class="biz-input" data-testid="bizprod-form-category">
              <option value="">未分类</option>
              <option v-for="cat in store.productCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
            </select>
          </div>
          <div class="biz-form-row">
            <div class="biz-field">
              <label>单位</label>
              <input v-model="formUnit" type="text" maxlength="8" class="biz-input" data-testid="bizprod-form-unit" />
            </div>
            <div class="biz-field">
              <label>进货单价</label>
              <input v-model="formPurchasePrice" type="number" min="0" step="0.01" class="biz-input" data-testid="bizprod-form-purchase" />
            </div>
            <div class="biz-field">
              <label>售价 *</label>
              <input v-model="formSellingPrice" type="number" min="0" step="0.01" class="biz-input" data-testid="bizprod-form-selling" />
            </div>
          </div>
          <div class="biz-field">
            <label class="bizprod-active">
              <input v-model="formActive" type="checkbox" data-testid="bizprod-form-active" />
              上架在售
            </label>
          </div>
          <div class="biz-form-actions">
            <button type="button" class="bizprod-btn" @click="showDialog = false">取消</button>
            <button type="submit" class="bizprod-btn save" :disabled="!isFormValid" data-testid="bizprod-save">
              {{ editingId ? '保存' : '添加' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <BusinessCategoryManager v-if="showCatManager" kind="product" @close="showCatManager = false" />

    <!-- P2-2：商品详情抽屉 -->
    <Teleport to="body">
      <div v-if="showDrawer && drawerSummary" class="bizprod-drawer-overlay" @click.self="closeDrawer">
        <div class="bizprod-drawer" data-testid="bizprod-drawer">
          <div class="bizprod-drawer-header">
            <h3>商品详情</h3>
            <button class="bizprod-drawer-close" @click="closeDrawer"><Icon name="close" /></button>
          </div>
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
        </div>
      </div>
    </Teleport>
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

.bizprod-tab {
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-full, 999px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizprod-tab:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.bizprod-tab.active {
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
  color: #fff;
}

.bizprod-cat-btn {
  padding: 7px 10px;
}

.bizprod-add {
  padding: 9px 16px;
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  background: var(--color-primary, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  white-space: nowrap;
}

.bizprod-add:hover {
  filter: brightness(1.08);
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
}

.bizprod-actions {
  display: flex;
  gap: 6px;
}

.bizprod-btn {
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizprod-btn:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.bizprod-btn.del:hover {
  color: var(--color-error, var(--color-error));
  border-color: var(--color-error, var(--color-error));
}

.bizprod-btn.save {
  color: #fff;
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.bizprod-btn.save:disabled {
  background: var(--color-text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

/* 弹框（复用体系） */
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
  max-width: 460px;
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
  position: sticky;
  top: 0;
  background: var(--color-bg-card, var(--color-bg-card));
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

:root.dark .bizprod-card,
:root.dark .biz-dialog {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

:root.dark .bizprod-name {
  color: var(--color-text, #f9fafb);
}

:root.dark .bizprod-tab,
:root.dark .bizprod-btn {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

:root.dark .bizprod-tab.active {
  background-color: var(--color-primary, #3b82f6);
  color: #fff;
}

:root.dark .biz-input {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text, #f9fafb);
  border-color: var(--color-border, #374151);
}

:root.dark .biz-dialog-header {
  background-color: var(--color-bg-card, #1f2937);
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
.bizprod-drawer-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 400;
  display: flex;
  justify-content: flex-end;
}

.bizprod-drawer {
  width: 100%;
  max-width: 420px;
  height: 100%;
  background-color: var(--color-bg-card, var(--color-bg-card));
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.15);
  animation: bizprod-drawer-slide-in 0.25s ease;
}

@keyframes bizprod-drawer-slide-in {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.bizprod-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
  flex-shrink: 0;
}

.bizprod-drawer-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
}

.bizprod-drawer-close {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--color-text-muted, var(--color-text-muted));
  cursor: pointer;
}

.bizprod-drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
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

:root.dark .bizprod-drawer {
  background-color: var(--color-bg-card, #1f2937);
}

:root.dark .bizprod-drawer-stat {
  background-color: var(--color-bg-card, #1f2937);
}

:root.dark .bizprod-drawer-record {
  background-color: var(--color-bg-card, #1f2937);
}
</style>
