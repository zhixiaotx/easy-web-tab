<script setup lang="ts">
// 收摊记录：日记录卡片（date 唯一 upsert）+ 编辑弹框（商品行：带出/剩余/损耗，收入自动合计）
import { computed, reactive, ref } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { calcDailyCost, calcDailyLossAmount, calcDailyRevenue, findProduct, formatYuanOf, localDateKey, soldCount, sortDailyRecords } from '@/composables/businessCore'
import type { BusinessDailyRecord, DailyRecordItem } from '@/types'

const store = useWorkbenchBusinessStore()

const sorted = computed(() => sortDailyRecords(store.dailyRecords))

function productNameOf(id: string): string {
  return findProduct(store.products, id)?.name ?? '（已删除商品）'
}

function itemSummary(record: BusinessDailyRecord): string {
  return record.items
    .map(it => `${productNameOf(it.productId)} ×${soldCount(it)}`)
    .join('、')
}

// ===== 编辑弹框（动态商品行） =====
const showDialog = ref(false)
const editingDate = ref(localDateKey())
const formNote = ref('')
const rows = reactive<{ productId: string; broughtOut: number; remaining: number; loss: number }[]>([])

const formRevenue = computed(() =>
  calcDailyRevenue(rows.map(r => ({ ...r })), store.products)
)

const formCost = computed(() =>
  calcDailyCost(rows.map(r => ({ ...r })), store.products)
)

const formLossAmount = computed(() =>
  calcDailyLossAmount(rows.map(r => ({ ...r })), store.products)
)

const formProfit = computed(() =>
  Math.round((formRevenue.value - formCost.value) * 100) / 100
)

function recordProfit(record: BusinessDailyRecord): number {
  return Math.round((record.totalRevenue - calcDailyCost(record.items, store.products)) * 100) / 100
}

function recordCost(record: BusinessDailyRecord): number {
  return calcDailyCost(record.items, store.products)
}

function recordLossAmount(record: BusinessDailyRecord): number {
  return calcDailyLossAmount(record.items, store.products)
}

const isFormValid = computed(
  () => editingDate.value !== '' && rows.length > 0 && rows.every(r => r.productId !== '' && (r.broughtOut > 0 || r.remaining > 0 || r.loss > 0))
)

function emptyRow(): { productId: string; broughtOut: number; remaining: number; loss: number } {
  return { productId: store.products.find(p => p.active)?.id ?? store.products[0]?.id ?? '', broughtOut: 0, remaining: 0, loss: 0 }
}

function startAdd(): void {
  editingDate.value = localDateKey()
  formNote.value = ''
  rows.splice(0, rows.length, emptyRow())
  showDialog.value = true
}

function startEdit(record: BusinessDailyRecord): void {
  editingDate.value = record.date
  formNote.value = record.note ?? ''
  rows.splice(
    0,
    rows.length,
    ...record.items.map(it => ({ productId: it.productId, broughtOut: it.broughtOut, remaining: it.remaining, loss: it.loss }))
  )
  showDialog.value = true
}

function addRow(): void {
  rows.push(emptyRow())
}

function removeRow(index: number): void {
  rows.splice(index, 1)
}

async function handleSave(): Promise<void> {
  if (!isFormValid.value) return
  const items: DailyRecordItem[] = rows
    .filter(r => r.productId)
    .map(r => ({
      productId: r.productId,
      broughtOut: Math.max(0, Math.floor(r.broughtOut)),
      remaining: Math.max(0, Math.floor(r.remaining)),
      loss: Math.max(0, Math.floor(r.loss))
    }))
  await store.upsertDailyRecord({ date: editingDate.value, items, note: formNote.value.trim() || undefined })
  showDialog.value = false
}

async function handleDelete(id: string): Promise<void> {
  if (!confirm('确定要删除这条收摊记录吗？删除后统计将重新计算。')) return
  await store.deleteDailyRecord(id)
}
</script>

<template>
  <div class="bizday">
    <div class="bizday-bar">
      <span class="bizday-count">共 {{ store.dailyRecords.length }} 条（同一天自动覆盖）</span>
      <button class="bizday-add" data-testid="bizday-add" @click="startAdd">＋ 收摊记录</button>
    </div>

    <div v-if="sorted.length === 0" class="bizday-empty" data-testid="bizday-empty">暂无收摊记录，点击右上角记下今天的第一笔</div>
    <div v-else class="bizday-grid">
      <div v-for="r in sorted" :key="r.id" class="bizday-card" :data-testid="`bizday-card-${r.id}`">
        <div class="bizday-head">
          <span class="bizday-date">{{ r.date }}</span>
          <span class="bizday-revenue" :data-testid="`bizday-revenue-${r.id}`">{{ formatYuanOf(r.totalRevenue) }}</span>
        </div>
        <div class="bizday-stats">
          <span class="bizday-stat">成本 <strong :data-testid="`bizday-cost-${r.id}`">{{ formatYuanOf(recordCost(r)) }}</strong></span>
          <span class="bizday-stat">利润 <strong :data-testid="`bizday-profit-${r.id}`">{{ formatYuanOf(recordProfit(r)) }}</strong></span>
          <span class="bizday-stat">损耗 <strong :data-testid="`bizday-loss-${r.id}`">{{ formatYuanOf(recordLossAmount(r)) }}</strong></span>
        </div>
        <div class="bizday-items" :data-testid="`bizday-summary-${r.id}`">{{ itemSummary(r) || '无商品明细' }}</div>
        <div class="bizday-note">{{ r.note || '—' }}</div>
        <div class="bizday-actions">
          <button class="bizday-btn" :data-testid="`bizday-edit-${r.id}`" @click="startEdit(r)">编辑</button>
          <button class="bizday-btn del" :data-testid="`bizday-del-${r.id}`" @click="handleDelete(r.id)">删除</button>
        </div>
      </div>
    </div>

    <!-- 编辑弹框（商品行动态增删） -->
    <div v-if="showDialog" class="biz-dialog-overlay" @click.self="showDialog = false">
      <div class="biz-dialog bizday-dialog" data-testid="bizday-dialog">
        <div class="biz-dialog-header">
          <h3>收摊记录</h3>
          <button class="biz-dialog-close" @click="showDialog = false">✕</button>
        </div>
        <form class="biz-dialog-body" @submit.prevent="handleSave">
          <div class="biz-field">
            <label>日期 *（同一天重复保存将覆盖）</label>
            <input v-model="editingDate" type="date" class="biz-input" data-testid="bizday-form-date" />
          </div>

          <div class="bizday-rows">
            <div v-for="(row, i) in rows" :key="i" class="bizday-row" data-testid="bizday-row">
              <select v-model="row.productId" class="biz-input bizday-product" data-testid="bizday-row-product">
                <option v-for="p in store.products" :key="p.id" :value="p.id">
                  {{ p.name }}{{ p.active ? '' : '（停售）' }}
                </option>
              </select>
              <div class="bizday-nums">
                <label class="bizday-num">
                  带出
                  <input v-model.number="row.broughtOut" type="number" min="0" step="1" class="biz-input" />
                </label>
                <label class="bizday-num">
                  剩余
                  <input v-model.number="row.remaining" type="number" min="0" step="1" class="biz-input" />
                </label>
                <label class="bizday-num">
                  损耗
                  <input v-model.number="row.loss" type="number" min="0" step="1" class="biz-input" />
                </label>
              </div>
              <button type="button" class="bizday-btn del" :data-testid="`bizday-row-del-${i}`" @click="removeRow(i)">移除</button>
            </div>
            <button type="button" class="bizday-add-row" data-testid="bizday-row-add" @click="addRow">＋ 添加商品行</button>
          </div>

          <div class="bizday-revenue-preview">
            营业额：<strong data-testid="bizday-form-revenue">{{ formatYuanOf(formRevenue) }}</strong>
            <span class="bizday-preview-sep">成本 <strong data-testid="bizday-form-cost">{{ formatYuanOf(formCost) }}</strong></span>
            <span class="bizday-preview-sep">利润 <strong data-testid="bizday-form-profit">{{ formatYuanOf(formProfit) }}</strong></span>
            <span class="bizday-preview-sep">损耗 <strong data-testid="bizday-form-loss">{{ formatYuanOf(formLossAmount) }}</strong></span>
          </div>

          <div class="biz-field">
            <label>备注（可选）</label>
            <input v-model="formNote" type="text" maxlength="200" class="biz-input" data-testid="bizday-form-note" />
          </div>

          <div class="biz-form-actions">
            <button type="button" class="bizday-btn" @click="showDialog = false">取消</button>
            <button type="submit" class="bizday-btn save" :disabled="!isFormValid" data-testid="bizday-save">保存</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bizday {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.bizday-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.bizday-count {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.bizday-add {
  padding: 9px 16px;
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  white-space: nowrap;
}

.bizday-add:hover {
  filter: brightness(1.08);
}

.bizday-empty {
  padding: 40px 20px;
  text-align: center;
  font-size: 14px;
  color: var(--text-muted, var(--color-text-muted));
  background: var(--bg-card, var(--color-bg-card));
  border: 1px dashed var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

.bizday-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  align-content: start;
}

.bizday-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
}

.bizday-card:hover {
  border-color: var(--accent-color, var(--color-primary));
}

.bizday-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bizday-date {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.bizday-revenue {
  font-size: 18px;
  font-weight: 700;
  color: var(--success-color, var(--color-success));
  font-variant-numeric: tabular-nums;
}

.bizday-items {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.bizday-stats {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
}

.bizday-stat {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}

.bizday-stat strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.bizday-note {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizday-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.bizday-btn {
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizday-btn:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizday-btn.del:hover {
  color: var(--error-color, var(--color-error));
  border-color: var(--error-color, var(--color-error));
}

.bizday-btn.save {
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizday-btn.save:disabled {
  background: var(--text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

.bizday-add-row {
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
  color: var(--accent-color, var(--color-primary));
  background: none;
  border: 1px dashed var(--accent-color, var(--color-primary));
  border-radius: var(--radius-md, 8px);
}

.bizday-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bizday-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border-radius: var(--radius-md, 8px);
  flex-wrap: wrap;
}

.bizday-product {
  min-width: 140px;
  flex: 1;
}

.bizday-nums {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.bizday-num {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  color: var(--text-muted, var(--color-text-muted));
}

.bizday-num .biz-input {
  width: 70px;
  padding: 6px 8px;
}

.bizday-revenue-preview {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 14px;
  padding: 10px 12px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.bizday-revenue-preview strong {
  color: var(--success-color, var(--color-success));
  font-size: 18px;
}

.bizday-preview-sep {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-size: 13px;
}

.bizday-preview-sep strong {
  font-size: 16px;
  color: var(--text-primary, var(--color-text));
}

/* 弹框 */
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
  background-color: var(--bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg, 12px);
  width: 100%;
  max-width: 560px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
}

.biz-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, var(--color-border));
}

.biz-dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
}

.biz-dialog-close {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--text-muted, var(--color-text-muted));
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
  color: var(--text-secondary, var(--color-text-secondary));
}

.biz-form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
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

:root.dark .bizday-card,
:root.dark .biz-dialog {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .bizday-date {
  color: var(--text-primary, #f9fafb);
}

:root.dark .bizday-revenue {
  color: #4ade80;
}

:root.dark .bizday-row {
  background-color: var(--bg-card, #1f2937);
}

:root.dark .bizday-btn {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .biz-input {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}
</style>
