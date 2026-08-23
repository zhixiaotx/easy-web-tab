<script setup lang="ts">
// 销售记账首页：5 统计卡（营业额/成本/支出/利润/毛利率）+ 摊位名称/低库存概览 + 销售排行（树状）
// P1-1：合并分类/商品排行为树状展开结构
import { computed, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { calcBusinessStats, calcCategoryProductRanking, formatYuanOf, lowStockProducts } from '@/composables/businessCore'
import { useToast } from '@/composables/useToast'

// P1-3：跨模块联动跳转 emit
const emit = defineEmits<{ navigate: [section: string, filter?: string] }>()

const store = useWorkbenchBusinessStore()
const toast = useToast()

const data = computed(() => ({
  productCategories: store.productCategories,
  expenseCategories: store.expenseCategories,
  products: store.products,
  purchases: store.purchases,
  dailyRecords: store.dailyRecords,
  expenses: store.expenses,
  settings: store.settings
}))

const stats = computed(() => calcBusinessStats(data.value))

const lowStock = computed(() => lowStockProducts(data.value))

// P1-1：分类→商品树状排行（top 5 per category）
const treeRank = computed(() => calcCategoryProductRanking(data.value, 5))

// 展开的分类 id 集合（默认展开销售额最高的前 2 个分类）
const expandedCategories = ref<Set<string>>(new Set())

// 初始化默认展开（treeRank 变化时自动填充前 2 个）
function ensureDefaultExpanded(): void {
  if (expandedCategories.value.size > 0) return
  for (const node of treeRank.value.slice(0, 2)) {
    expandedCategories.value.add(node.categoryId)
  }
}

// 监听 treeRank 变化时填充默认展开
watch(treeRank, () => ensureDefaultExpanded(), { immediate: true })

function toggleCategory(categoryId: string): void {
  if (expandedCategories.value.has(categoryId)) {
    expandedCategories.value.delete(categoryId)
  } else {
    expandedCategories.value.add(categoryId)
  }
}

function isCategoryExpanded(categoryId: string): boolean {
  return expandedCategories.value.has(categoryId)
}

/** 分类内最大销售额（用于商品进度条比例） */
function maxProductRevenue(node: { products: { revenue: number }[] }): number {
  return Math.max(1, ...node.products.map(p => p.revenue))
}

const stallDraft = ref('')

async function commitStallName(): Promise<void> {
  await store.setStallName(stallDraft.value)
  toast.success('摊位名称已保存')
}
</script>

<template>
  <div class="bizhome">
    <!-- 统计卡 4 张 -->
    <div class="bizhome-stats">
      <div class="stat-card" data-testid="bizhome-revenue">
        <div class="stat-label">💰 营业额</div>
        <div class="stat-value">{{ formatYuanOf(stats.revenue) }}</div>
      </div>
      <div class="stat-card" data-testid="bizhome-cost">
        <div class="stat-label">📦 成本</div>
        <div class="stat-value">{{ formatYuanOf(stats.cost) }}</div>
      </div>
      <div class="stat-card" data-testid="bizhome-expense">
        <div class="stat-label">💸 支出</div>
        <div class="stat-value">{{ formatYuanOf(stats.expenseTotal) }}</div>
      </div>
      <div class="stat-card" data-testid="bizhome-profit">
        <div class="stat-label">📈 利润</div>
        <div class="stat-value" :class="{ negative: stats.profit < 0 }">{{ formatYuanOf(stats.profit) }}</div>
      </div>
      <div class="stat-card" data-testid="bizhome-margin">
        <div class="stat-label">💵 毛利率</div>
        <div class="stat-value">{{ (stats.margin * 100).toFixed(1) }}%</div>
      </div>
    </div>

    <!-- 摊位名称 + 低库存概览 -->
    <div class="bizhome-row">
      <div class="bizhome-card">
        <div class="bizhome-card-title">🏪 摊位名称</div>
        <div class="bizhome-stall">
          <input
            type="text"
            class="biz-input"
            maxlength="30"
            placeholder="例如：夜市A区小吃摊"
            data-testid="bizhome-stall-input"
            :value="stallDraft || store.settings.stallName"
            @input="stallDraft = ($event.target as HTMLInputElement).value"
            @blur="commitStallName"
            @keydown.enter="commitStallName"
          />
        </div>
      </div>
      <div class="bizhome-card" data-testid="bizhome-lowstock">
        <div class="bizhome-card-title">⚠️ 低库存预警（阈值 {{ store.settings.lowStockThreshold }}）</div>
        <p v-if="lowStock.length === 0" class="bizhome-empty" data-testid="bizhome-lowstock-empty">暂无低库存商品</p>
        <div v-else class="bizhome-low-list">
          <div v-for="item in lowStock.slice(0, 5)" :key="item.product.id" class="bizhome-low-item">
            <span>{{ item.product.name }}</span>
            <span class="bizhome-low-stock">{{ item.stock }} {{ item.product.unit }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- P1-1：销售排行（分类→商品树状展开） -->
    <section class="bizhome-card" data-testid="bizhome-rank-tree">
      <div class="bizhome-card-title">📊 销售排行（分类→商品）</div>
      <p v-if="treeRank.length === 0" class="bizhome-empty">暂无数据</p>
      <div v-else class="bizhome-tree">
        <div v-for="node in treeRank" :key="node.categoryId" class="bizhome-tree-node" :data-testid="'bizhome-tree-cat-' + node.categoryId">
          <!-- 分类行 -->
          <div class="bizhome-tree-cat" @click="toggleCategory(node.categoryId)">
            <span class="bizhome-tree-arrow">{{ isCategoryExpanded(node.categoryId) ? '▾' : '▸' }}</span>
            <span class="bizhome-tree-cat-name">{{ node.categoryName }}</span>
            <span class="bizhome-tree-cat-val">{{ formatYuanOf(node.categoryRevenue) }}</span>
            <span class="bizhome-tree-cat-sold">×{{ node.categorySold }}</span>
          </div>
          <!-- 商品排行（展开后显示） -->
          <div v-if="isCategoryExpanded(node.categoryId)" class="bizhome-tree-products">
            <div
              v-for="(prod, pi) in node.products"
              :key="prod.productId"
              class="bizhome-tree-prod"
              :data-testid="'bizhome-tree-prod-' + prod.productId"
              @click="emit('navigate', 'purchases', prod.productId)"
            >
              <span class="bizhome-tree-prod-idx">{{ pi + 1 }}</span>
              <span class="bizhome-tree-prod-name">{{ prod.name }}</span>
              <div class="bizhome-tree-prod-bar">
                <div class="bizhome-tree-prod-fill" :style="{ width: (prod.revenue / maxProductRevenue(node)) * 100 + '%' }"></div>
              </div>
              <span class="bizhome-tree-prod-val">{{ formatYuanOf(prod.revenue) }}</span>
              <span class="bizhome-tree-prod-sold">×{{ prod.sold }}</span>
            </div>
            <p v-if="node.products.length === 0" class="bizhome-tree-empty">该分类暂无商品销售数据</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.bizhome {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.bizhome-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.stat-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, var(--color-text-secondary));
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-value.negative {
  color: var(--error-color, var(--color-error));
}

.bizhome-row {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(0, 2fr);
  gap: 16px;
}

.bizhome-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.bizhome-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, var(--color-text-secondary));
}

.biz-input {
  width: 100%;
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

.bizhome-empty {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted, var(--color-text-muted));
}

.bizhome-low-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bizhome-low-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border-radius: var(--radius-sm, 8px);
}

.bizhome-low-stock {
  font-weight: 700;
  color: var(--error-color, var(--color-error));
  font-variant-numeric: tabular-nums;
}

/* P1-1：树状排行 */
.bizhome-tree {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bizhome-tree-node {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bizhome-tree-cat {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  transition: background 0.15s ease;
}

.bizhome-tree-cat:hover {
  background: color-mix(in srgb, var(--accent-color, var(--color-primary)) 10%, var(--bg-secondary, var(--color-bg-hover)));
}

.bizhome-tree-arrow {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
  width: 14px;
}

.bizhome-tree-cat-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizhome-tree-cat-val {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--accent-color, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.bizhome-tree-cat-sold {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
  font-variant-numeric: tabular-nums;
}

.bizhome-tree-products {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0 4px 24px;
}

.bizhome-tree-prod {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: background 0.15s ease;
}

.bizhome-tree-prod:hover {
  background: var(--bg-secondary, var(--color-bg-hover));
}

.bizhome-tree-prod-idx {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-secondary, var(--color-bg-hover));
  border-radius: 50%;
}

.bizhome-tree-prod-name {
  flex-shrink: 0;
  min-width: 60px;
  max-width: 120px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizhome-tree-prod-bar {
  flex: 1;
  min-width: 30px;
  height: 6px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border-radius: 999px;
  overflow: hidden;
}

.bizhome-tree-prod-fill {
  height: 100%;
  background: var(--accent-color, var(--color-primary));
  border-radius: 999px;
  transition: width 0.3s ease;
}

.bizhome-tree-prod-val {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--accent-color, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.bizhome-tree-prod-sold {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
  font-variant-numeric: tabular-nums;
}

.bizhome-tree-empty {
  margin: 0;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
}

:root.dark .stat-card,
:root.dark .bizhome-card {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .bizhome-low-item {
  background-color: var(--bg-card, #1f2937);
  border-color: var(--border-color, #374151);
}

:root.dark .stat-value {
  color: var(--text-primary, #f9fafb);
}

:root.dark .stat-value.negative {
  color: #f87171;
}

:root.dark .biz-input {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}

@media (max-width: 900px) {
  .bizhome-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .bizhome-row {
    grid-template-columns: 1fr;
  }
}
</style>
