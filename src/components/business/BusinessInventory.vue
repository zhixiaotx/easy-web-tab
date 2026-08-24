<script setup lang="ts">
// 库存管理：库存总览卡片网格（商品/单位/进货合计/带出合计）+ 低库存预警清单 + 阈值可配置
// P1-2：库存卡片增加展开溯源功能（进货明细 + 收摊带出记录）
import { computed, nextTick, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { calcBroughtOutTotals, calcInventory, calcInventorySources, calcPurchaseTotals, formatYuanOf, lowStockProducts, sortProducts } from '@/composables/businessCore'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from '@/components/workbench/PanelPager.vue'
import Icon from '@/components/Icon.vue'

// P1-3：跨模块联动跳转 emit
const emit = defineEmits<{ navigate: [section: string, filter?: string] }>()

const store = useWorkbenchBusinessStore()

const stockMap = computed(() => calcInventory(store.products, store.purchases, store.dailyRecords))

const purchaseTotals = computed(() => calcPurchaseTotals(store.purchases))

const broughtOutTotals = computed(() => calcBroughtOutTotals(store.dailyRecords))

const rows = computed(() =>
  sortProducts(store.products)
    .map(p => ({ product: p, stock: stockMap.value[p.id] ?? 0 }))
    .sort((a, b) => a.stock - b.stock)
)

// ===== 自适应分页（5 列，rowHeight 实测 ~110，maxRows 3 = 每页最多 15 卡）=====
const listEl = ref<HTMLElement | null>(null)
const gridEl = ref<HTMLElement | null>(null)
const paging = usePanelPaging({
  items: () => rows.value,
  rowHeight: 110,
  gap: 12,
  maxRows: 3,
  containerRef: listEl,
  gridRef: gridEl
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev, goto } = paging
watch(rows, () => nextTick(() => goto(1)))

const lowStock = computed(() => lowStockProducts({
  productCategories: store.productCategories,
  expenseCategories: store.expenseCategories,
  products: store.products,
  purchases: store.purchases,
  dailyRecords: store.dailyRecords,
  expenses: store.expenses,
  settings: store.settings
}))

const thresholdDraft = ref('')

async function commitThreshold(): Promise<void> {
  const n = Number(thresholdDraft.value)
  if (Number.isFinite(n) && n >= 0) {
    await store.setLowStockThreshold(Math.floor(n))
    thresholdDraft.value = ''
  }
}

// 溯源弹框
const traceModalProductId = ref<string | null>(null)
const traceModalProduct = computed(() =>
  traceModalProductId.value ? store.products.find(p => p.id === traceModalProductId.value) ?? null : null
)
const traceModalSources = computed(() =>
  traceModalProductId.value ? calcInventorySources(traceModalProductId.value, store.purchases, store.dailyRecords) : []
)

function openTraceModal(productId: string): void {
  traceModalProductId.value = productId
}

function closeTraceModal(): void {
  traceModalProductId.value = null
}
</script>

<template>
  <div class="bizinv">
    <!-- 阈值设置 + 预警清单 -->
    <div class="bizinv-alert" data-testid="bizinv-alert">
      <div class="bizinv-alert-head">
        <span class="bizinv-alert-title"><Icon name="alert" :size="15" /> 低库存预警</span>
        <label class="bizinv-threshold">
          阈值
          <input
            type="number"
            min="0"
            step="1"
            class="biz-input bizinv-th-input"
            data-testid="bizinv-threshold"
            :value="thresholdDraft || String(store.settings.lowStockThreshold)"
            @input="thresholdDraft = ($event.target as HTMLInputElement).value"
            @blur="commitThreshold"
            @keydown.enter="commitThreshold"
          />
        </label>
      </div>
      <p v-if="lowStock.length === 0" class="bizinv-empty" data-testid="bizinv-low-empty">库存充足，暂无预警商品</p>
      <div v-else class="bizinv-low-grid">
        <div
          v-for="item in lowStock"
          :key="item.product.id"
          class="bizinv-low-card"
          :data-testid="'bizinv-low-' + item.product.id"
        >
          <span class="bizinv-low-name">{{ item.product.name }}</span>
          <span class="bizinv-low-stock">{{ item.stock }} {{ item.product.unit }}</span>
        </div>
      </div>
    </div>

    <!-- 库存总览卡片网格 -->
    <div ref="listEl" class="bizinv-list" :class="{ 'bizinv-list-scroll': !fitsOnePage }">
      <div ref="gridEl" class="bizinv-grid" data-testid="bizinv-grid">
      <div
        v-for="row in pageItems"
        :key="row.product.id"
        class="bizinv-card"
        :data-testid="'bizinv-card-' + row.product.id"
      >
        <div class="bizinv-card-top">
          <div class="bizinv-card-left">
            <span class="bizinv-name">{{ row.product.name }}{{ row.product.active ? '' : '（停售）' }}</span>
            <span class="bizinv-unit">单位：{{ row.product.unit }}</span>
            <span class="bizinv-num num-purchase">进货合计：<b>{{ purchaseTotals[row.product.id] ?? 0 }}</b> {{ row.product.unit }}</span>
          </div>
          <div class="bizinv-card-right">
            <!-- 查看溯源按钮（卡片右上角） -->
            <button class="bizinv-trace-btn" @click="openTraceModal(row.product.id)">查看溯源</button>
            <span class="bizinv-num num-brought">带出合计：<b>{{ broughtOutTotals[row.product.id] ?? 0 }}</b> {{ row.product.unit }}</span>
            <span class="bizinv-num num-stock">库存剩余：<b>{{ row.stock }}</b> {{ row.product.unit }}</span>
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

    <!-- 溯源弹框（屏幕居中） -->
    <Teleport to="body">
      <div v-if="traceModalProductId" class="bizinv-trace-overlay" @click.self="closeTraceModal">
        <div class="bizinv-trace-modal" data-testid="bizinv-trace-modal">
          <div class="bizinv-trace-head">
            <span class="bizinv-trace-title">溯源记录 · {{ traceModalProduct?.name ?? '未知商品' }}</span>
            <button class="bizinv-trace-close" @click="closeTraceModal">✕</button>
          </div>
          <div class="bizinv-trace-body">
            <p v-if="traceModalSources.length === 0" class="bizinv-trace-empty">暂无溯源记录</p>
            <div
              v-for="src in traceModalSources"
              :key="src.type + '-' + src.id"
              class="bizinv-source-row"
              @click="emit('navigate', src.type === 'purchase' ? 'purchases' : 'daily', traceModalProductId!)"
            >
              <span v-if="src.type === 'purchase'" class="bizinv-source-type purchase">进货</span>
              <span v-else class="bizinv-source-type daily">收摊</span>
              <span class="bizinv-source-date">{{ src.date }}</span>
              <span v-if="src.type === 'purchase'" class="bizinv-source-detail">
                ×{{ src.quantity }} @{{ formatYuanOf(src.unitPrice) }} {{ formatYuanOf(src.total) }}
              </span>
              <span v-else class="bizinv-source-detail">
                带出 {{ src.broughtOut }} 剩余 {{ src.remaining }} 损耗 {{ src.loss }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.bizinv {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.bizinv-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}
.bizinv-list.bizinv-list-scroll {
  overflow-y: auto;
}

@media (max-width: 768px) {
  .bizinv { min-height: 0; }
  .bizinv-list { flex: none; overflow: visible; }
}

.bizinv-alert {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.bizinv-alert-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.bizinv-alert-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, var(--color-text-secondary));
}

.bizinv-threshold {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.bizinv-th-input {
  width: 80px;
  padding: 6px 8px;
}

.bizinv-empty {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted, var(--color-text-muted));
}

.bizinv-low-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}

.bizinv-low-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid color-mix(in srgb, var(--error-color, #ef4444) 40%, transparent);
  border-radius: var(--radius-md, 8px);
}

.bizinv-low-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizinv-low-stock {
  font-size: 16px;
  font-weight: 700;
  color: var(--error-color, var(--color-error));
  font-variant-numeric: tabular-nums;
}

.bizinv-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
}

.bizinv-card {
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

.bizinv-card:hover {
  border-color: var(--accent-color, var(--color-primary));
}

/* 卡片左右布局：左侧商品名/单位/进货合计，右侧带出/库存 */
.bizinv-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.bizinv-card-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.bizinv-card-right {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
  flex-shrink: 0;
}

.bizinv-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizinv-unit {
  font-size: 13px;
  color: var(--text-primary, var(--color-text));
}

.bizinv-num {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

/* 三色区分：进货合计（蓝）、带出合计（橙）、库存剩余（绿） */
.bizinv-num.num-purchase b {
  color: #3b82f6;
}

.bizinv-num.num-brought b {
  color: #f59e0b;
}

.bizinv-num.num-stock b {
  color: #22c55e;
}

/* 查看溯源按钮（卡片右上角） */
.bizinv-trace-btn {
  align-self: flex-end;
  padding: 2px 10px;
  font-size: 11px;
  cursor: pointer;
  color: var(--accent-color, var(--color-primary));
  background: none;
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm, 4px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizinv-trace-btn:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
  background: color-mix(in srgb, var(--accent-color, var(--color-primary)) 8%, transparent);
}

/* 溯源弹框遮罩 */
.bizinv-trace-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
}

/* 溯源弹框：屏幕居中 */
.bizinv-trace-modal {
  position: relative;
  z-index: 1001;
  width: 380px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.bizinv-trace-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, var(--color-border));
}

.bizinv-trace-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
}

.bizinv-trace-close {
  padding: 2px 8px;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-muted, var(--color-text-muted));
  background: none;
  border: none;
  border-radius: var(--radius-sm, 4px);
  transition: all 0.15s ease;
}

.bizinv-trace-close:hover {
  color: var(--text-primary, var(--color-text));
  background: var(--bg-secondary, var(--color-bg-hover));
}

.bizinv-trace-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bizinv-trace-empty {
  margin: 0;
  padding: 20px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted, var(--color-text-muted));
}

.bizinv-source-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  transition: background 0.15s ease;
}

.bizinv-source-row:hover {
  background: var(--bg-secondary, var(--color-bg-hover));
}

.bizinv-source-type {
  flex-shrink: 0;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-full, 999px);
}

.bizinv-source-type.purchase {
  color: var(--accent-color, var(--color-primary));
  background: color-mix(in srgb, var(--accent-color, var(--color-primary)) 12%, transparent);
}

.bizinv-source-type.daily {
  color: var(--success-color, var(--color-success));
  background: color-mix(in srgb, var(--success-color, var(--color-success)) 12%, transparent);
}

.bizinv-source-date {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
}

.bizinv-source-detail {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

:root.dark .bizinv-alert,
:root.dark .bizinv-card {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .bizinv-low-card {
  background-color: var(--bg-card, #1f2937);
}

:root.dark .bizinv-name {
  color: var(--text-primary, #f9fafb);
}

:root.dark .bizinv-low-stock {
  color: #f87171;
}

/* 暗色模式：三色适配 */
:root.dark .bizinv-num.num-purchase b {
  color: #60a5fa;
}

:root.dark .bizinv-num.num-brought b {
  color: #fbbf24;
}

:root.dark .bizinv-num.num-stock b {
  color: #4ade80;
}

/* 暗色模式：溯源弹框 */
:root.dark .bizinv-trace-modal {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

:root.dark .bizinv-source-row:hover {
  background: var(--bg-card, #1f2937);
}

:root.dark .biz-input {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}

@media (max-width: 640px) {
  .bizinv-grid {
    grid-template-columns: 1fr;
  }
}
</style>
