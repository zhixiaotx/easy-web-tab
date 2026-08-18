<script setup lang="ts">
// 统计报表：分类排行 + 商品排行 + 近 30 天营业额/利润趋势折线（内联 SVG，坐标走 businessCore）
import { computed, ref } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import {
  businessTrendScale,
  calcBusinessTrend,
  calcCategoryRanking,
  calcProductRanking,
  formatYuanOf,
  localDateKey
} from '@/composables/businessCore'

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

const categoryRank = computed(() => calcCategoryRanking(data.value).slice(0, 8))
const productRank = computed(() => calcProductRanking(data.value).slice(0, 8))

// 趋势窗口：30 / 14 / 7 天切换
const TREND_W = 900
const TREND_H = 260
const trendDays = ref(30)

const trendSeries = computed(() => calcBusinessTrend(data.value, localDateKey(), trendDays.value))
const trendScale = computed(() => businessTrendScale(trendSeries.value, TREND_W, TREND_H))

function maxRankValue(rank: { revenue: number }[]): number {
  return Math.max(1, ...rank.map(r => r.revenue))
}
</script>

<template>
  <div class="bizstats">
    <!-- 趋势图 -->
    <section class="bizstats-card" data-testid="bizstats-trend">
      <div class="bizstats-head">
        <h3>近 {{ trendDays }} 天营业额 / 利润趋势</h3>
        <div class="bizstats-days">
          <button class="bizstats-btn" :class="{ active: trendDays === 7 }" data-testid="bizstats-days-7" @click="trendDays = 7">7 天</button>
          <button class="bizstats-btn" :class="{ active: trendDays === 14 }" data-testid="bizstats-days-14" @click="trendDays = 14">14 天</button>
          <button class="bizstats-btn" :class="{ active: trendDays === 30 }" data-testid="bizstats-days-30" @click="trendDays = 30">30 天</button>
        </div>
      </div>
      <div v-if="trendScale && !trendScale.allZero" class="bizstats-svg-wrap">
        <svg :viewBox="'0 0 ' + TREND_W + ' ' + TREND_H" class="bizstats-svg">
          <!-- 网格线 -->
          <g>
            <line v-for="(g, gi) in trendScale.gridlines" :key="gi" class="bizstats-grid" x1="24" :x2="TREND_W - 24" :y1="g.y" :y2="g.y" />
            <text v-for="(g, gi) in trendScale.gridlines" :key="'t' + gi" class="bizstats-axis" x="6" :y="g.y + 4" font-size="11">{{ g.label }}</text>
          </g>
          <!-- 营业额折线（主色） -->
          <polyline
            class="bizstats-line revenue"
            :points="trendScale.points.map(p => p.revX + ',' + p.revY).join(' ')"
          />
          <!-- 利润折线（绿） -->
          <polyline
            class="bizstats-line profit"
            :points="trendScale.points.map(p => p.profitX + ',' + p.profitY).join(' ')"
          />
          <!-- 日期刻度 -->
          <text v-for="(l, li) in trendScale.dayLabels" :key="'d' + li" class="bizstats-axis" :x="l.x" :y="TREND_H - 6" font-size="11" text-anchor="middle">{{ l.label }}</text>
        </svg>
        <div class="bizstats-legend">
          <span class="bizstats-legend-item"><i class="dot revenue"></i>营业额</span>
          <span class="bizstats-legend-item"><i class="dot profit"></i>利润</span>
        </div>
      </div>
      <p v-else class="bizstats-empty" data-testid="bizstats-trend-empty">暂无趋势数据，先添加进货与收摊记录吧</p>
    </section>

    <!-- 分类排行 + 商品排行 -->
    <div class="bizstats-rank-grid">
      <section class="bizstats-card" data-testid="bizstats-cat-rank">
        <h3>分类排行（按销售额）</h3>
        <p v-if="categoryRank.length === 0" class="bizstats-empty">暂无数据</p>
        <div v-else class="bizstats-rank-list">
          <div v-for="(item, i) in categoryRank" :key="item.categoryId" class="bizstats-rank-row" :data-testid="'bizstats-cat-' + item.categoryId">
            <span class="bizstats-rank-idx">{{ i + 1 }}</span>
            <span class="bizstats-rank-name">{{ item.name }}</span>
            <div class="bizstats-rank-bar">
              <div class="bizstats-rank-fill" :style="{ width: (item.revenue / maxRankValue(categoryRank)) * 100 + '%' }"></div>
            </div>
            <span class="bizstats-rank-val">{{ formatYuanOf(item.revenue) }}</span>
            <span class="bizstats-rank-sold">×{{ item.sold }}</span>
          </div>
        </div>
      </section>

      <section class="bizstats-card" data-testid="bizstats-prod-rank">
        <h3>商品排行（按销售额）</h3>
        <p v-if="productRank.length === 0" class="bizstats-empty">暂无数据</p>
        <div v-else class="bizstats-rank-list">
          <div v-for="(item, i) in productRank" :key="item.productId" class="bizstats-rank-row" :data-testid="'bizstats-prod-' + item.productId">
            <span class="bizstats-rank-idx">{{ i + 1 }}</span>
            <span class="bizstats-rank-name">{{ item.name }}</span>
            <div class="bizstats-rank-bar">
              <div class="bizstats-rank-fill" :style="{ width: (item.revenue / maxRankValue(productRank)) * 100 + '%' }"></div>
            </div>
            <span class="bizstats-rank-val">{{ formatYuanOf(item.revenue) }}</span>
            <span class="bizstats-rank-sold">×{{ item.sold }}</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.bizstats {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.bizstats-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.bizstats-card h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, var(--color-text-secondary));
}

.bizstats-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.bizstats-head h3 {
  margin: 0;
}

.bizstats-days {
  display: flex;
  gap: 6px;
}

.bizstats-btn {
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-full, 999px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizstats-btn.active {
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizstats-svg-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bizstats-svg {
  display: block;
  width: 100%;
  height: auto;
}

.bizstats-grid {
  stroke: var(--border-color, #e2e8f0);
  stroke-dasharray: 4 4;
}

.bizstats-axis {
  fill: var(--text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
}

.bizstats-line {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.bizstats-line.revenue {
  stroke: var(--accent-color, var(--color-primary));
}

.bizstats-line.profit {
  stroke: var(--success-color, var(--color-success));
}

.bizstats-legend {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.bizstats-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.bizstats-legend-item .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.dot.revenue {
  background: var(--accent-color, var(--color-primary));
}

.dot.profit {
  background: var(--success-color, var(--color-success));
}

.bizstats-rank-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

.bizstats-rank-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bizstats-rank-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bizstats-rank-idx {
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

.bizstats-rank-name {
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

.bizstats-rank-bar {
  flex: 1;
  min-width: 40px;
  height: 8px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border-radius: 999px;
  overflow: hidden;
}

.bizstats-rank-fill {
  height: 100%;
  background: var(--accent-color, var(--color-primary));
  border-radius: 999px;
  transition: width 0.3s ease;
}

.bizstats-rank-val {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--accent-color, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.bizstats-rank-sold {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
  font-variant-numeric: tabular-nums;
}

.bizstats-empty {
  margin: 0;
  padding: 20px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted, var(--color-text-muted));
}

:root.dark .bizstats-card {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .bizstats-rank-name {
  color: var(--text-primary, #f9fafb);
}

:root.dark .bizstats-btn {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .bizstats-line.profit {
  stroke: #4ade80;
}

@media (max-width: 900px) {
  .bizstats-rank-grid {
    grid-template-columns: 1fr;
  }
}
</style>
