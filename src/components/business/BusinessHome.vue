<script setup lang="ts">
// 销售记账首页：5 统计卡（营业额/成本/支出/利润/毛利率）+ 摊位名称/低库存概览 + 分类/商品排行
import { computed, ref } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { calcBusinessStats, calcCategoryRanking, calcProductRanking, formatYuanOf, lowStockProducts } from '@/composables/businessCore'
import { useToast } from '@/composables/useToast'

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

// 排行（自统计页移入）：按销售额 top 8
const categoryRank = computed(() => calcCategoryRanking(data.value).slice(0, 8))
const productRank = computed(() => calcProductRanking(data.value).slice(0, 8))

function maxRankValue(rank: { revenue: number }[]): number {
  return Math.max(1, ...rank.map(r => r.revenue))
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

    <!-- 分类排行 + 商品排行（自统计页移入） -->
    <div class="bizhome-rank-grid">
      <section class="bizhome-card" data-testid="bizhome-rank-cat">
        <div class="bizhome-card-title">分类排行（按销售额）</div>
        <p v-if="categoryRank.length === 0" class="bizhome-empty">暂无数据</p>
        <div v-else class="bizhome-rank-list">
          <div v-for="(item, i) in categoryRank" :key="item.categoryId" class="bizhome-rank-row" :data-testid="'bizhome-cat-' + item.categoryId">
            <span class="bizhome-rank-idx">{{ i + 1 }}</span>
            <span class="bizhome-rank-name">{{ item.name }}</span>
            <div class="bizhome-rank-bar">
              <div class="bizhome-rank-fill" :style="{ width: (item.revenue / maxRankValue(categoryRank)) * 100 + '%' }"></div>
            </div>
            <span class="bizhome-rank-val">{{ formatYuanOf(item.revenue) }}</span>
            <span class="bizhome-rank-sold">×{{ item.sold }}</span>
          </div>
        </div>
      </section>

      <section class="bizhome-card" data-testid="bizhome-rank-prod">
        <div class="bizhome-card-title">商品排行（按销售额）</div>
        <p v-if="productRank.length === 0" class="bizhome-empty">暂无数据</p>
        <div v-else class="bizhome-rank-list">
          <div v-for="(item, i) in productRank" :key="item.productId" class="bizhome-rank-row" :data-testid="'bizhome-prod-' + item.productId">
            <span class="bizhome-rank-idx">{{ i + 1 }}</span>
            <span class="bizhome-rank-name">{{ item.name }}</span>
            <div class="bizhome-rank-bar">
              <div class="bizhome-rank-fill" :style="{ width: (item.revenue / maxRankValue(productRank)) * 100 + '%' }"></div>
            </div>
            <span class="bizhome-rank-val">{{ formatYuanOf(item.revenue) }}</span>
            <span class="bizhome-rank-sold">×{{ item.sold }}</span>
          </div>
        </div>
      </section>
    </div>
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

.bizhome-rank-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

.bizhome-rank-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bizhome-rank-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bizhome-rank-idx {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-secondary, var(--color-bg-hover));
  border-radius: 50%;
}

.bizhome-rank-name {
  flex-shrink: 0;
  min-width: 64px;
  max-width: 110px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizhome-rank-bar {
  flex: 1;
  min-width: 40px;
  height: 8px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border-radius: 999px;
  overflow: hidden;
}

.bizhome-rank-fill {
  height: 100%;
  background: var(--accent-color, var(--color-primary));
  border-radius: 999px;
  transition: width 0.3s ease;
}

.bizhome-rank-val {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--accent-color, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.bizhome-rank-sold {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
  font-variant-numeric: tabular-nums;
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

  .bizhome-row,
  .bizhome-rank-grid {
    grid-template-columns: 1fr;
  }
}
</style>
