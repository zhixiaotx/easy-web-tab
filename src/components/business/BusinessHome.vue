<script setup lang="ts">
// 销售记账首页：营业额/利润总额主指标 + 成本/支出/毛利率统计卡 + 低库存概览 + 销售排行（树状）
import { computed, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { calcBusinessStats, calcBusinessTrend, calcCategoryProductRanking, localDateKey, formatYuanOf, lowStockProducts } from '@/composables/businessCore'
import Icon from '@/components/Icon.vue'

const emit = defineEmits<{ navigate: [section: string, filter?: string] }>()

function go(section: string): void {
  emit('navigate', section)
}

const store = useWorkbenchBusinessStore()

// 首屏骨架屏：store 自 IndexedDB 加载完成（loaded=true）前显示占位，避免空白闪跳
const loading = computed(() => !store.loaded)

const data = computed(() => ({
  productCategories: store.productCategories,
  expenseCategories: store.expenseCategories,
  products: store.products,
  purchases: store.purchases,
  dailyRecords: store.dailyRecords,
  expenses: store.expenses,
  settings: store.settings
}))

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

// ===== 今日/本月 切换 + 环比 + 目标进度环 + 迷你柱状图 =====
const periodMode = ref<'month' | 'today'>('month')

const todayKey = computed(() => localDateKey())
const monthKey = computed(() => todayKey.value.slice(0, 7))
const prevMonthKey = computed(() => {
  const [y, m] = monthKey.value.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
})

// 选中周期的日记录（今日=当天；本月=当月）
const periodDailyRecords = computed(() =>
  periodMode.value === 'today'
    ? data.value.dailyRecords.filter(r => r.date === todayKey.value)
    : data.value.dailyRecords.filter(r => r.date.startsWith(monthKey.value))
)
const periodStats = computed(() => calcBusinessStats({ ...data.value, dailyRecords: periodDailyRecords.value }))

// 上一周期（今日→昨日；本月→上月）用于环比
const prevDailyRecords = computed(() => {
  if (periodMode.value === 'today') {
    const [y, m, d] = todayKey.value.split('-').map(Number)
    const pd = new Date(y, m - 1, d - 1)
    const key = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}-${String(pd.getDate()).padStart(2, '0')}`
    return data.value.dailyRecords.filter(r => r.date === key)
  }
  return data.value.dailyRecords.filter(r => r.date.startsWith(prevMonthKey.value))
})
const prevStats = computed(() => calcBusinessStats({ ...data.value, dailyRecords: prevDailyRecords.value }))

// 营业额环比（%）：上一周期无数据 → null（不显示）
const revenueDelta = computed<number | null>(() => {
  if (prevStats.value.revenue <= 0) return null
  return ((periodStats.value.revenue - prevStats.value.revenue) / prevStats.value.revenue) * 100
})
const deltaUp = computed(() => revenueDelta.value !== null && revenueDelta.value >= 0)
const deltaText = computed(() => (revenueDelta.value === null ? '' : `${Math.abs(revenueDelta.value).toFixed(1)}%`))

// 目标进度环（仅本月 + 已设目标）
const targetPct = computed(() =>
  periodMode.value === 'month' && store.settings.monthlyRevenueTarget > 0
    ? Math.min(100, (periodStats.value.revenue / store.settings.monthlyRevenueTarget) * 100)
    : 0
)

// 近 30 天每日营业额迷你柱状图
const trendBars = computed(() => {
  const trend = calcBusinessTrend(data.value, todayKey.value, 30)
  const max = Math.max(1, ...trend.map(t => t.revenue))
  return trend.map(t => ({ date: t.date, revenue: t.revenue, pct: (t.revenue / max) * 100 }))
})

// 问候语（按当前时段）
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})
const dateText = computed(() =>
  new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
)

// 月目标内联编辑
const editingTarget = ref(false)
const targetInput = ref<number>(store.settings.monthlyRevenueTarget)
function startEditTarget(): void {
  targetInput.value = store.settings.monthlyRevenueTarget
  editingTarget.value = true
}
async function saveTarget(): Promise<void> {
  await store.setMonthlyRevenueTarget(Number.isFinite(targetInput.value) ? targetInput.value : 0)
  editingTarget.value = false
}
</script>

<template>
  <div class="bizhome">
    <!-- 骨架屏：首屏数据（IndexedDB）加载中显示占位，加载完成淡入真实内容 -->
    <template v-if="loading">
      <div class="bizhome-hero">
        <div v-for="i in 5" :key="'sk-hero-' + i" class="bizhome-hero-card sk-block">
          <span class="sk-line sk-line-sm"></span>
          <span class="sk-line sk-line-lg"></span>
        </div>
      </div>
      <div class="bizhome-row">
        <div class="bizhome-card sk-block sk-card-tall">
          <span class="sk-line sk-line-md"></span>
          <span class="sk-line sk-line-row"></span>
          <span class="sk-line sk-line-row"></span>
        </div>
      </div>
      <section class="bizhome-card sk-block sk-card-tall">
        <span class="sk-line sk-line-md"></span>
        <span class="sk-line sk-line-row"></span>
        <span class="sk-line sk-line-row"></span>
        <span class="sk-line sk-line-row"></span>
      </section>
    </template>

    <template v-else>
      <!-- 问候头：问候语 + 日期 + 今日/本月切换 + 目标进度环 -->
      <section class="bizhome-greeting" data-testid="bizhome-greeting">
        <div class="bizhome-greeting-info">
          <h2 class="bizhome-greeting-title">{{ greeting }}{{ store.settings.stallName ? '，' + store.settings.stallName : '' }}</h2>
          <p class="bizhome-greeting-sub">{{ dateText }}</p>
        </div>
        <div class="bizhome-greeting-right">
          <!-- 目标进度环（仅本月 + 已设目标） -->
          <div v-if="periodMode === 'month' && store.settings.monthlyRevenueTarget > 0" class="bizhome-target">
            <svg class="target-ring" viewBox="0 0 36 36" aria-hidden="true">
              <circle class="target-track" cx="18" cy="18" r="15.9155" fill="none" />
              <circle
                class="target-bar"
                cx="18"
                cy="18"
                r="15.9155"
                fill="none"
                :stroke-dasharray="`${targetPct} 100`"
              />
            </svg>
            <div class="target-meta">
              <span class="target-pct">{{ targetPct.toFixed(0) }}%</span>
              <span class="target-label">月目标</span>
            </div>
          </div>
          <!-- 目标内联编辑器 -->
          <div v-if="editingTarget" class="bizhome-target-edit">
            <el-input
              v-model.number="targetInput"
              type="number"
              min="0"
              size="small"
              class="bizhome-target-input"
              placeholder="月目标营业额"
              @keyup.enter="saveTarget"
            />
            <el-button size="small" type="primary" @click="saveTarget">保存</el-button>
            <el-button size="small" @click="editingTarget = false">取消</el-button>
          </div>
          <button v-else class="bizhome-target-btn" data-testid="bizhome-set-target" @click="startEditTarget">
            {{ store.settings.monthlyRevenueTarget > 0 ? '改目标' : '设目标' }}
          </button>
          <!-- 今日/本月 分段切换 -->
          <div class="bizhome-period-toggle" role="tablist" aria-label="统计周期">
            <button
              class="bizhome-period-btn"
              :class="{ active: periodMode === 'month' }"
              role="tab"
              :aria-selected="periodMode === 'month'"
              data-testid="bizhome-period-month"
              @click="periodMode = 'month'"
            >本月</button>
            <button
              class="bizhome-period-btn"
              :class="{ active: periodMode === 'today' }"
              role="tab"
              :aria-selected="periodMode === 'today'"
              data-testid="bizhome-period-today"
              @click="periodMode = 'today'"
            >今日</button>
          </div>
        </div>
      </section>

      <!-- 环比（vs 上一周期） -->
      <div v-if="revenueDelta !== null" class="bizhome-delta" data-testid="bizhome-delta">
        <span class="delta-label">{{ periodMode === 'month' ? '环比上月' : '较昨日' }}</span>
        <span class="delta-value" :class="deltaUp ? 'up' : 'down'">
          {{ deltaUp ? '▲' : '▼' }} {{ deltaText }}
        </span>
      </div>

      <!-- 主指标：营业额/利润总额/成本/支出/毛利率（随 今日/本月 切换） -->
      <section class="bizhome-hero">
        <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-revenue" @click="go('stats')" @keydown.enter="go('stats')">
          <span class="hero-label">营业额</span>
          <span class="hero-value">{{ formatYuanOf(periodStats.revenue) }}</span>
        </div>
        <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-profit" @click="go('stats')" @keydown.enter="go('stats')">
          <span class="hero-label">利润总额</span>
          <span class="hero-value" :class="{ negative: periodStats.profit < 0 }">{{ formatYuanOf(periodStats.profit) }}</span>
        </div>
        <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-cost" @click="go('stats')" @keydown.enter="go('stats')">
          <span class="hero-label">成本</span>
          <span class="hero-value">{{ formatYuanOf(periodStats.cost) }}</span>
        </div>
        <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-expense" @click="go('expenses')" @keydown.enter="go('expenses')">
          <span class="hero-label">支出</span>
          <span class="hero-value">{{ formatYuanOf(periodStats.expenseTotal) }}</span>
        </div>
        <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-margin" @click="go('stats')" @keydown.enter="go('stats')">
          <span class="hero-label">毛利率</span>
          <span class="hero-value">{{ (periodStats.margin * 100).toFixed(1) }}%</span>
        </div>
      </section>

      <!-- 低库存 + 销售排行：一行两列（40% / 60%） -->
      <div class="bizhome-row bizhome-split-row">
        <!-- 低库存概览（左 40%） -->
        <div
          class="bizhome-card bizhome-col bizhome-col-40 clickable"
          role="button"
          tabindex="0"
          data-testid="bizhome-lowstock"
          @click="go('inventory')"
          @keydown.enter="go('inventory')"
        >
          <div class="bizhome-card-title"><Icon name="alert" :size="15" />低库存预警（阈值 {{ store.settings.lowStockThreshold }}）</div>
          <p v-if="lowStock.length === 0" class="bizhome-empty" data-testid="bizhome-lowstock-empty">暂无低库存商品</p>
          <div v-else class="bizhome-low-list">
            <div v-for="item in lowStock.slice(0, 5)" :key="item.product.id" class="bizhome-low-item">
              <span>{{ item.product.name }}</span>
              <span class="bizhome-low-stock">{{ item.stock }} {{ item.product.unit }}</span>
            </div>
          </div>
        </div>

        <!-- 销售排行（右 60%，分类→商品树状展开） -->
        <section class="bizhome-card bizhome-col bizhome-col-60" data-testid="bizhome-rank-tree">
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

      <!-- 近 30 天营业额迷你柱状图 -->
      <section class="bizhome-card bizhome-mini-chart" data-testid="bizhome-mini-chart">
        <div class="bizhome-card-title"><Icon name="stats" :size="15" />近 30 天营业额</div>
        <div v-if="trendBars.length === 0" class="bizhome-empty">暂无收摊记录</div>
        <div v-else class="mini-bars" role="img" :aria-label="`近30天营业额，最高 ${formatYuanOf(Math.max(...trendBars.map(b => b.revenue)))}`">
          <div
            v-for="bar in trendBars"
            :key="bar.date"
            class="mini-bar-col"
            :title="`${bar.date}：${formatYuanOf(bar.revenue)}`"
          >
            <div class="mini-bar" :style="{ height: bar.pct + '%' }"></div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>


<style scoped>
.bizhome {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

/* ===== 骨架屏（首屏加载占位 + shimmer 微动效） ===== */
.sk-block {
  position: relative;
  overflow: hidden;
}

.sk-line {
  display: block;
  height: 12px;
  border-radius: 6px;
  background: var(--color-bg-card, var(--color-bg-hover));
}

.sk-line-sm { width: 50%; height: 12px; }
.sk-line-md { width: 40%; height: 14px; }
.sk-line-lg { width: 70%; height: 22px; }
.sk-line-row { width: 100%; height: 12px; margin-top: 10px; }

.sk-card-tall {
  min-height: 120px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* shimmer：从左上到右下的高光扫过，暗色下降低对比 */
.sk-block::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--color-text, #1e293b) 8%, transparent),
    transparent
  );
  animation: bizhome-shimmer 1.4s infinite;
}

@keyframes bizhome-shimmer {
  100% { transform: translateX(100%); }
}

html.dark .sk-line {
  background: var(--color-bg-card, #1f2937);
}

html.dark .sk-block::after {
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.08),
    transparent
  );
}

@media (prefers-reduced-motion: reduce) {
  .sk-block::after { animation: none; }
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
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #3b82f6) 10%, transparent), transparent),
    var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: box-shadow var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease);
}

.bizhome-hero-card:hover {
  border-color: var(--color-primary, var(--color-primary));
  box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0, 0, 0, 0.12));
  transform: translateY(-2px);
}

.bizhome-hero-card.clickable {
  cursor: pointer;
}

.bizhome-hero-card.clickable:focus-visible {
  outline: 2px solid var(--color-primary, var(--color-primary));
  outline-offset: 2px;
}

.hero-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.hero-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--color-success, var(--color-success));
  font-variant-numeric: tabular-nums;
}

.hero-value.negative {
  color: var(--color-error, var(--color-error));
}

.hero-sub {
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
}

/* ===== 统计卡悬浮反馈 ===== */
.stat-card,
.bizhome-card {
  transition: box-shadow var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease);
}

.stat-card:hover,
.bizhome-card:hover {
  border-color: var(--color-primary, var(--color-primary));
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
  outline: 2px solid var(--color-primary, var(--color-primary));
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
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.stat-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.stat-label :deep(svg) {
  flex-shrink: 0;
  color: var(--color-primary, var(--color-primary));
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-value.negative {
  color: var(--color-error, var(--color-error));
}

.bizhome-row {
  display: block;
}

/* 双列并排：低库存 40% + 销售排行 60%，桌面端一行，移动端堆叠 */
.bizhome-split-row {
  display: flex;
  flex-direction: row;
  gap: 16px;
  align-items: stretch;
}
.bizhome-col { flex: 0 0 auto; min-width: 0; }
.bizhome-col-40 { flex-basis: 40%; }
.bizhome-col-60 { flex-basis: 60%; }

.bizhome-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.bizhome-card-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizhome-card-title :deep(svg) {
  flex-shrink: 0;
  color: var(--color-primary, var(--color-primary));
}

.bizhome-empty {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted, var(--color-text-muted));
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
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: var(--radius-sm, 8px);
}

.bizhome-low-stock {
  font-weight: 700;
  color: var(--color-error, var(--color-error));
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
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  transition: background 0.15s ease;
}

.bizhome-tree-cat:hover {
  background: color-mix(in srgb, var(--color-primary, var(--color-primary)) 10%, var(--color-bg-card, var(--color-bg-hover)));
}

.bizhome-tree-arrow {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
  width: 14px;
}

.bizhome-tree-cat-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizhome-tree-cat-val {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.bizhome-tree-cat-sold {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
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
  background: var(--color-bg-card, var(--color-bg-hover));
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
  color: var(--color-text-secondary, var(--color-text-secondary));
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: 50%;
}

.bizhome-tree-prod-name {
  flex-shrink: 0;
  min-width: 60px;
  max-width: 120px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizhome-tree-prod-bar {
  flex: 1;
  min-width: 30px;
  height: 6px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: 999px;
  overflow: hidden;
}

.bizhome-tree-prod-fill {
  height: 100%;
  background: var(--color-primary, var(--color-primary));
  border-radius: 999px;
  transition: width 0.3s ease;
}

.bizhome-tree-prod-val {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.bizhome-tree-prod-sold {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
  font-variant-numeric: tabular-nums;
}

.bizhome-tree-empty {
  margin: 0;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
}

/* ===== 问候头：问候语 + 今日/本月切换 + 目标进度环 ===== */
.bizhome-greeting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #3b82f6) 10%, transparent), transparent),
    var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.bizhome-greeting-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.bizhome-greeting-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text, var(--color-text));
}

.bizhome-greeting-sub {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizhome-greeting-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

/* 目标进度环 */
.bizhome-target {
  position: relative;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
}

.target-ring {
  width: 52px;
  height: 52px;
  transform: rotate(-90deg);
}

.target-track {
  stroke: var(--color-border, var(--color-border));
  stroke-width: 3.5;
}

.target-bar {
  stroke: var(--color-success, var(--color-success));
  stroke-width: 3.5;
  stroke-linecap: round;
  transition: stroke-dasharray var(--transition-fast, 0.3s ease);
}

.target-meta {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.1;
}

.target-pct {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.target-label {
  font-size: 10px;
  color: var(--color-text-muted, var(--color-text-muted));
}

.bizhome-target-btn {
  padding: 6px 12px;
  font-size: 13px;
  border-radius: var(--radius-full, 999px);
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  color: var(--color-primary, var(--color-primary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.bizhome-target-btn:hover {
  background: var(--color-primary, var(--color-primary));
  color: #fff;
  border-color: var(--color-primary, var(--color-primary));
}

.bizhome-target-edit {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bizhome-target-input {
  width: 130px;
}

/* 今日/本月 分段切换 */
.bizhome-period-toggle {
  display: inline-flex;
  padding: 3px;
  border-radius: var(--radius-full, 999px);
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  gap: 2px;
}

.bizhome-period-btn {
  padding: 5px 14px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-full, 999px);
  background: transparent;
  color: var(--color-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.bizhome-period-btn.active {
  background: var(--color-primary, var(--color-primary));
  color: #fff;
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.12));
}

/* 环比 */
.bizhome-delta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.delta-label {
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.delta-value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.delta-value.up { color: var(--color-success, var(--color-success)); }
.delta-value.down { color: var(--color-error, var(--color-error)); }

/* 迷你柱状图 */
.bizhome-mini-chart {
  gap: 14px;
}

.mini-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 96px;
  padding-top: 8px;
}

.mini-bar-col {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.mini-bar {
  width: 100%;
  max-width: 14px;
  border-radius: 3px 3px 0 0;
  background: linear-gradient(180deg, var(--color-primary, #3b82f6), color-mix(in srgb, var(--color-primary, #3b82f6) 60%, transparent));
  transition: height var(--transition-fast, 0.3s ease);
  min-height: 2px;
}

.mini-bar-col:hover .mini-bar {
  background: var(--color-success, var(--color-success));
}

html.dark .stat-card,
html.dark .bizhome-card,
html.dark .bizhome-hero-card {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .bizhome-hero-card {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #3b82f6) 14%, transparent), transparent),
    var(--color-bg-card, #1f2937);
}

html.dark .hero-value {
  color: #34d399;
}

html.dark .hero-value.negative {
  color: #f87171;
}

html.dark .stat-card:hover,
html.dark .bizhome-card:hover,
html.dark .bizhome-hero-card:hover {
  box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0, 0, 0, 0.4));
}

html.dark .bizhome-low-item {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}

html.dark .stat-value {
  color: var(--color-text, #f9fafb);
}

html.dark .stat-value.negative {
  color: #f87171;
}

html.dark .bizhome-greeting {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #3b82f6) 14%, transparent), transparent),
    var(--color-bg-card, #1f2937);
}

html.dark .bizhome-greeting-title {
  color: var(--color-text, #f9fafb);
}

html.dark .target-track {
  stroke: var(--color-border, #374151);
}

html.dark .target-pct {
  color: var(--color-text, #f9fafb);
}

html.dark .bizhome-target-btn {
  background-color: var(--color-bg-card, #1f2937);
  color: #93c5fd;
  border-color: var(--color-border, #374151);
}

html.dark .bizhome-target-btn:hover {
  background-color: var(--color-primary, #3b82f6);
  color: #fff;
}

html.dark .bizhome-period-toggle {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}

html.dark .bizhome-period-btn {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .mini-bar {
  background: linear-gradient(180deg, #60a5fa, rgba(96, 165, 250, 0.5));
}

html.dark .mini-bar-col:hover .mini-bar {
  background: #34d399;
}

@media (max-width: 900px) {
  .bizhome {
    gap: 12px;
  }

  .bizhome-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .bizhome-hero {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  /* 窄屏下双列堆叠为上下，各自 100% 宽度 */
  .bizhome-split-row { flex-direction: column; }
  .bizhome-col-40,
  .bizhome-col-60 { flex-basis: auto; }

  /* 问候头窄屏换行，按钮区整体下移 */
  .bizhome-greeting {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .bizhome-greeting-right {
    flex-wrap: wrap;
  }
}

@media (max-width: 480px) {
  .bizhome-stats {
    grid-template-columns: 1fr;
  }
}
</style>
