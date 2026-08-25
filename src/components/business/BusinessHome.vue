<script setup lang="ts">
// 销售记账首页：营业额/利润总额主指标 + 成本/支出/毛利率统计卡 + 低库存概览 + 销售排行（树状）
import { computed, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { calcBusinessStats, calcCategoryProductRanking, formatYuanOf, lowStockProducts } from '@/composables/businessCore'
import Icon from '@/components/Icon.vue'

const emit = defineEmits<{ navigate: [section: string, filter?: string] }>()

function go(section: string): void {
  emit('navigate', section)
}

const store = useWorkbenchBusinessStore()

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

const treeRank = computed(() => calcCategoryProductRanking(data.value, 5))

const expandedCategories = ref<Set<string>>(new Set())

function ensureDefaultExpanded(): void {
  if (expandedCategories.value.size > 0) return
  for (const node of treeRank.value.slice(0, 2)) {
    expandedCategories.value.add(node.categoryId)
  }
}

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

function maxProductRevenue(node: { products: { revenue: number }[] }): number {
  return Math.max(1, ...node.products.map(p => p.revenue))
}
</script>

<template>
  <div class="bizhome">
    <!-- 主指标：营业额/利润总额/成本/支出/毛利率（同一行） -->
    <section class="bizhome-hero" data-testid="bizhome-greeting">
      <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-revenue" @click="go('stats')" @keydown.enter="go('stats')">
        <span class="hero-label">营业额</span>
        <span class="hero-value">{{ formatYuanOf(stats.revenue) }}</span>
      </div>
      <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-profit" @click="go('stats')" @keydown.enter="go('stats')">
        <span class="hero-label">利润总额</span>
        <span class="hero-value" :class="{ negative: stats.profit < 0 }">{{ formatYuanOf(stats.profit) }}</span>
      </div>
      <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-cost" @click="go('stats')" @keydown.enter="go('stats')">
        <span class="hero-label">成本</span>
        <span class="hero-value">{{ formatYuanOf(stats.cost) }}</span>
      </div>
      <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-expense" @click="go('expenses')" @keydown.enter="go('expenses')">
        <span class="hero-label">支出</span>
        <span class="hero-value">{{ formatYuanOf(stats.expenseTotal) }}</span>
      </div>
      <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-margin" @click="go('stats')" @keydown.enter="go('stats')">
        <span class="hero-label">毛利率</span>
        <span class="hero-value">{{ (stats.margin * 100).toFixed(1) }}%</span>
      </div>
    </section>

    <!-- 低库存概览 -->
    <div class="bizhome-row">
      <div class="bizhome-card clickable" role="button" tabindex="0" data-testid="bizhome-lowstock" @click="go('inventory')" @keydown.enter="go('inventory')">
        <div class="bizhome-card-title"><Icon name="alert" :size="15" />低库存预警（阈值 {{ store.settings.lowStockThreshold }}）</div>
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
      <div class="bizhome-card-title"><Icon name="stats" :size="15" />销售排行（分类→商品）</div>
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

/* ===== 主指标：营业额 + 利润总额 ===== */
.bizhome-hero {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.bizhome-hero-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px 12px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent-color, #3b82f6) 10%, transparent), transparent),
    var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: box-shadow var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease);
}

.bizhome-hero-card:hover {
  border-color: var(--accent-color, var(--color-primary));
  box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0, 0, 0, 0.12));
  transform: translateY(-2px);
}

.bizhome-hero-card.clickable {
  cursor: pointer;
}

.bizhome-hero-card.clickable:focus-visible {
  outline: 2px solid var(--accent-color, var(--color-primary));
  outline-offset: 2px;
}

.hero-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, var(--color-text-secondary));
}

.hero-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--success-color, var(--color-success));
  font-variant-numeric: tabular-nums;
}

.hero-value.negative {
  color: var(--error-color, var(--color-error));
}

.hero-sub {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
}

/* ===== 统计卡悬浮反馈 ===== */
.stat-card,
.bizhome-card {
  transition: box-shadow var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease);
}

.stat-card:hover,
.bizhome-card:hover {
  border-color: var(--accent-color, var(--color-primary));
  box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0, 0, 0, 0.12));
}

.stat-card:hover {
  transform: translateY(-2px);
}

/* P0-1：统计卡/低库存卡可点击下钻 —— 指针 + 键盘焦点态 */
.stat-card.clickable,
.bizhome-card.clickable {
  cursor: pointer;
}

.stat-card.clickable:focus-visible,
.bizhome-card.clickable:focus-visible {
  outline: 2px solid var(--accent-color, var(--color-primary));
  outline-offset: 2px;
}

.bizhome-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, var(--color-text-secondary));
}

.stat-label :deep(svg) {
  flex-shrink: 0;
  color: var(--accent-color, var(--color-primary));
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
  display: block;
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, var(--color-text-secondary));
}

.bizhome-card-title :deep(svg) {
  flex-shrink: 0;
  color: var(--accent-color, var(--color-primary));
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
:root.dark .bizhome-card,
:root.dark .bizhome-hero-card {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .bizhome-hero-card {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent-color, #3b82f6) 14%, transparent), transparent),
    var(--bg-secondary, #1f2937);
}

:root.dark .hero-value {
  color: #34d399;
}

:root.dark .hero-value.negative {
  color: #f87171;
}

:root.dark .stat-card:hover,
:root.dark .bizhome-card:hover,
:root.dark .bizhome-hero-card:hover {
  box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0, 0, 0, 0.4));
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

@media (max-width: 900px) {
  .bizhome-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .bizhome-hero {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 480px) {
  .bizhome-stats {
    grid-template-columns: 1fr;
  }
}
</style>
