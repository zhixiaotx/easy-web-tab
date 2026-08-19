<script setup lang="ts">
// 库存管理：库存总览表（进货/带出/剩余/当前库存）+ 低库存预警清单 + 阈值可配置
import { computed, ref } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { calcInventory, lowStockProducts, sortProducts } from '@/composables/businessCore'

const store = useWorkbenchBusinessStore()

const stockMap = computed(() => calcInventory(store.products, store.purchases, store.dailyRecords))

const rows = computed(() =>
  sortProducts(store.products)
    .map(p => ({ product: p, stock: stockMap.value[p.id] ?? 0 }))
    .sort((a, b) => a.stock - b.stock)
)

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
</script>

<template>
  <div class="bizinv">
    <!-- 阈值设置 + 预警清单 -->
    <div class="bizinv-alert" data-testid="bizinv-alert">
      <div class="bizinv-alert-head">
        <span class="bizinv-alert-title">⚠️ 低库存预警</span>
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

    <!-- 库存总览表 -->
    <div class="bizinv-table-wrap" data-testid="bizinv-table">
      <div class="bizinv-row bizinv-head-row">
        <span>商品</span><span>单位</span><span>进货合计</span><span>带出合计</span><span>剩余带回</span><span>当前库存</span><span>状态</span>
      </div>
      <div v-for="row in rows" :key="row.product.id" class="bizinv-row" :data-testid="'bizinv-row-' + row.product.id">
        <span class="bizinv-name">{{ row.product.name }}{{ row.product.active ? '' : '（停售）' }}</span>
        <span>{{ row.product.unit }}</span>
        <span class="bizinv-num">{{ store.purchases.filter(p => p.productId === row.product.id).reduce((s, p) => s + p.quantity, 0) }}</span>
        <span class="bizinv-num">{{ store.dailyRecords.reduce((s, r) => s + r.items.filter(it => it.productId === row.product.id).reduce((x, it) => x + it.broughtOut, 0), 0) }}</span>
        <span class="bizinv-num">{{ store.dailyRecords.reduce((s, r) => s + r.items.filter(it => it.productId === row.product.id).reduce((x, it) => x + it.remaining, 0), 0) }}</span>
        <span class="bizinv-stock" :class="{ low: row.stock < store.settings.lowStockThreshold }">{{ row.stock }}</span>
        <span class="bizinv-status" :class="{ low: row.stock < store.settings.lowStockThreshold }">
          {{ row.stock < store.settings.lowStockThreshold ? '低库存' : '正常' }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bizinv {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
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

.bizinv-table-wrap {
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  overflow-x: auto;
}

.bizinv-row {
  display: grid;
  grid-template-columns: minmax(140px, 1.6fr) 70px 90px 90px 90px 90px 80px;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color, var(--color-border));
  min-width: 720px;
}

.bizinv-row:last-child {
  border-bottom: none;
}

.bizinv-head-row {
  background: var(--bg-secondary, var(--color-bg-hover));
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, var(--color-text-muted));
}

.bizinv-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizinv-num {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.bizinv-stock {
  font-size: 15px;
  font-weight: 700;
  color: var(--success-color, var(--color-success));
  font-variant-numeric: tabular-nums;
}

.bizinv-stock.low {
  color: var(--error-color, var(--color-error));
}

.bizinv-status {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  text-align: center;
  color: #15803d;
  background: #dcfce7;
}

.bizinv-status.low {
  color: #b91c1c;
  background: #fee2e2;
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
:root.dark .bizinv-table-wrap {
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

:root.dark .biz-input {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}
</style>
