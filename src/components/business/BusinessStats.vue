<script setup lang="ts">
// 统计报表：近 N 天营业额/成本/利润趋势分组柱状图（每日固定 3 槽位异色、非零才渲染、负值向下、顶部金额标签；全部/营业额/利润模式切换；坐标走 businessCore）
import { computed, ref } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import {
  businessTrendBars,
  calcBusinessTrend,
  compactAmount,
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

// 趋势窗口：30 / 14 / 7 天切换；展示模式：全部（3 柱）/ 仅营业额 / 仅利润
const TREND_W = 900
const TREND_H = 260
const trendDays = ref(30)
const trendMode = ref<'all' | 'revenue' | 'profit'>('all')

const trendSeries = computed(() => calcBusinessTrend(data.value, localDateKey(), trendDays.value))
const trendScale = computed(() => businessTrendBars(trendSeries.value, TREND_W, TREND_H, trendMode.value))
</script>

<template>
  <div class="bizstats">
    <!-- 趋势图 -->
    <section class="bizstats-card" data-testid="bizstats-trend">
      <div class="bizstats-head">
        <h3>近 {{ trendDays }} 天营业额 / 成本 / 利润趋势</h3>
        <div class="bizstats-head-btns">
          <div class="bizstats-days">
            <button class="bizstats-btn" :class="{ active: trendDays === 7 }" data-testid="bizstats-days-7" @click="trendDays = 7">7 天</button>
            <button class="bizstats-btn" :class="{ active: trendDays === 14 }" data-testid="bizstats-days-14" @click="trendDays = 14">14 天</button>
            <button class="bizstats-btn" :class="{ active: trendDays === 30 }" data-testid="bizstats-days-30" @click="trendDays = 30">30 天</button>
          </div>
          <div class="bizstats-days">
            <button class="bizstats-btn" :class="{ active: trendMode === 'all' }" data-testid="bizstats-mode-all" @click="trendMode = 'all'">全部</button>
            <button class="bizstats-btn" :class="{ active: trendMode === 'revenue' }" data-testid="bizstats-mode-revenue" @click="trendMode = 'revenue'">营业额</button>
            <button class="bizstats-btn" :class="{ active: trendMode === 'profit' }" data-testid="bizstats-mode-profit" @click="trendMode = 'profit'">利润</button>
          </div>
        </div>
      </div>
      <div v-if="trendScale && !trendScale.allZero" class="bizstats-svg-wrap">
        <svg :viewBox="'0 0 ' + TREND_W + ' ' + TREND_H" class="bizstats-svg">
          <!-- 网格线 -->
          <g>
            <line v-for="(g, gi) in trendScale.gridlines" :key="'gl' + gi" class="bizstats-gridline" x1="24" :x2="TREND_W - 24" :y1="g.y" :y2="g.y" />
            <text v-for="(g, gi) in trendScale.gridlines" :key="'glt' + gi" class="bizstats-axis" x="6" :y="g.y + 4" font-size="11">{{ g.label }}</text>
          </g>
          <!-- 零基线（负值向下） -->
          <line class="bizstats-zero" x1="24" :x2="TREND_W - 24" :y1="trendScale.zeroY" :y2="trendScale.zeroY" />
          <!-- 分组柱（每日 营业额/成本/利润，非零才渲染） -->
          <g v-for="grp in trendScale.groups" :key="grp.date">
            <rect
              v-for="b in grp.bars"
              :key="b.key"
              class="bizstats-bar"
              :class="b.key"
              :x="b.x"
              :y="b.y"
              :width="b.w"
              :height="b.height"
              rx="2"
            />
            <text
              v-for="b in grp.bars"
              :key="b.key + '-label'"
              class="bizstats-bar-label"
              :x="b.labelX"
              :y="b.labelY"
              font-size="9"
              text-anchor="middle"
            >{{ compactAmount(b.value) }}</text>
          </g>
          <!-- 日期刻度 -->
          <text v-for="(l, li) in trendScale.dayLabels" :key="'d' + li" class="bizstats-axis" :x="l.x" :y="TREND_H - 6" font-size="11" text-anchor="middle">{{ l.label }}</text>
        </svg>
        <div class="bizstats-legend">
          <span class="bizstats-legend-item"><i class="dot revenue"></i>营业额</span>
          <span class="bizstats-legend-item"><i class="dot cost"></i>成本</span>
          <span class="bizstats-legend-item"><i class="dot profit"></i>利润</span>
        </div>
      </div>
      <p v-else class="bizstats-empty" data-testid="bizstats-trend-empty">暂无趋势数据，先添加进货与收摊记录吧</p>
    </section>
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

.bizstats-head-btns {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
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

.bizstats-gridline {
  stroke: var(--border-color, #e2e8f0);
  stroke-dasharray: 4 4;
}

.bizstats-zero {
  stroke: var(--text-muted, #94a3b8);
  stroke-width: 1;
}

.bizstats-axis {
  fill: var(--text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
}

.bizstats-bar.revenue {
  fill: var(--accent-color, var(--color-primary));
}

.bizstats-bar.cost {
  fill: #f59e0b;
}

.bizstats-bar.profit {
  fill: var(--success-color, var(--color-success));
}

.bizstats-bar-label {
  fill: var(--text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
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

.dot.cost {
  background: #f59e0b;
}

.dot.profit {
  background: var(--success-color, var(--color-success));
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

:root.dark .bizstats-btn {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .bizstats-bar.cost {
  fill: #fbbf24;
}

:root.dark .bizstats-bar.profit {
  fill: #4ade80;
}
</style>
