<script setup lang="ts">
// 进货记录：行式列表（日期/商品/数量/单价/总额/备注/操作）+ 新增/编辑弹框
import { computed, ref } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { findProduct, formatYuanOf, localDateKey, sortPurchases } from '@/composables/businessCore'
import type { BusinessPurchase } from '@/types'

const store = useWorkbenchBusinessStore()

const sorted = computed(() => sortPurchases(store.purchases))

function productNameOf(id: string): string {
  return findProduct(store.products, id)?.name ?? '（已删除商品）'
}

// ===== 新增/编辑弹框 =====
const showDialog = ref(false)
const editingId = ref<string | null>(null)
const formProductId = ref('')
const formDate = ref(localDateKey())
const formQuantity = ref('')
const formUnitPrice = ref('')
const formNote = ref('')

const formTotal = computed(() => {
  const q = Number(formQuantity.value) || 0
  const p = Number(formUnitPrice.value) || 0
  return Math.round(q * p * 100) / 100
})

const isFormValid = computed(
  () => formProductId.value !== '' && formDate.value !== '' && formTotal.value > 0
)

function startAdd(): void {
  editingId.value = null
  formProductId.value = store.products.find(p => p.active)?.id ?? store.products[0]?.id ?? ''
  formDate.value = localDateKey()
  formQuantity.value = ''
  formUnitPrice.value = ''
  formNote.value = ''
  showDialog.value = true
}

function startEdit(p: BusinessPurchase): void {
  editingId.value = p.id
  formProductId.value = p.productId
  formDate.value = p.date
  formQuantity.value = String(p.quantity)
  formUnitPrice.value = String(p.unitPrice)
  formNote.value = p.note ?? ''
  showDialog.value = true
}

async function handleSave(): Promise<void> {
  if (!isFormValid.value) return
  const payload = {
    productId: formProductId.value,
    date: formDate.value,
    quantity: Number(formQuantity.value),
    unitPrice: Number(formUnitPrice.value),
    note: formNote.value.trim() || undefined
  }
  if (editingId.value) {
    await store.updatePurchase(editingId.value, payload)
  } else {
    await store.addPurchase(payload)
  }
  showDialog.value = false
}

async function handleDelete(id: string): Promise<void> {
  if (!confirm('确定要删除这笔记货吗？')) return
  await store.deletePurchase(id)
}
</script>

<template>
  <div class="bizpur">
    <div class="bizpur-bar">
      <span class="bizpur-count">共 {{ store.purchases.length }} 笔</span>
      <button class="bizpur-add" data-testid="bizpur-add" @click="startAdd">＋ 新增进货</button>
    </div>

    <div v-if="sorted.length === 0" class="bizpur-empty" data-testid="bizpur-empty">暂无进货记录</div>
    <div v-else class="bizpur-list">
      <div class="bizpur-row bizpur-head-row">
        <span>日期</span><span>商品</span><span>数量</span><span>单价</span><span>总额</span><span>备注</span><span></span>
      </div>
      <div v-for="p in sorted" :key="p.id" class="bizpur-row" data-testid="bizpur-row">
        <span class="bizpur-date">{{ p.date }}</span>
        <span class="bizpur-product">{{ productNameOf(p.productId) }}</span>
        <span class="bizpur-num">{{ p.quantity }}</span>
        <span class="bizpur-num">{{ formatYuanOf(p.unitPrice) }}</span>
        <span class="bizpur-total">{{ formatYuanOf(p.total) }}</span>
        <span class="bizpur-note">{{ p.note || '—' }}</span>
        <div class="bizpur-actions">
          <button class="bizpur-btn" :data-testid="`bizpur-edit-${p.id}`" @click="startEdit(p)">编辑</button>
          <button class="bizpur-btn del" :data-testid="`bizpur-del-${p.id}`" @click="handleDelete(p.id)">删除</button>
        </div>
      </div>
    </div>

    <!-- 新增/编辑弹框 -->
    <div v-if="showDialog" class="biz-dialog-overlay" @click.self="showDialog = false">
      <div class="biz-dialog" data-testid="bizpur-dialog">
        <div class="biz-dialog-header">
          <h3>{{ editingId ? '编辑进货' : '新增进货' }}</h3>
          <button class="biz-dialog-close" @click="showDialog = false">✕</button>
        </div>
        <form class="biz-dialog-body" @submit.prevent="handleSave">
          <div class="biz-field">
            <label>商品 *</label>
            <select v-model="formProductId" class="biz-input" data-testid="bizpur-form-product">
              <option v-for="p in store.products" :key="p.id" :value="p.id">
                {{ p.name }}{{ p.active ? '' : '（已停售）' }}
              </option>
            </select>
          </div>
          <div class="biz-form-row">
            <div class="biz-field">
              <label>日期 *</label>
              <input v-model="formDate" type="date" class="biz-input" data-testid="bizpur-form-date" />
            </div>
            <div class="biz-field">
              <label>数量 *</label>
              <input v-model="formQuantity" type="number" min="1" step="1" class="biz-input" data-testid="bizpur-form-qty" />
            </div>
            <div class="biz-field">
              <label>单价 *</label>
              <input v-model="formUnitPrice" type="number" min="0" step="0.01" class="biz-input" data-testid="bizpur-form-price" />
            </div>
          </div>
          <div class="biz-field">
            <label>合计（自动计算）</label>
            <div class="bizpur-total-preview" data-testid="bizpur-form-total">{{ formatYuanOf(formTotal) }}</div>
          </div>
          <div class="biz-field">
            <label>备注（可选）</label>
            <input v-model="formNote" type="text" maxlength="100" class="biz-input" data-testid="bizpur-form-note" />
          </div>
          <div class="biz-form-actions">
            <button type="button" class="bizpur-btn" @click="showDialog = false">取消</button>
            <button type="submit" class="bizpur-btn save" :disabled="!isFormValid" data-testid="bizpur-save">
              {{ editingId ? '保存' : '添加' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bizpur {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bizpur-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.bizpur-count {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.bizpur-add {
  padding: 9px 16px;
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  white-space: nowrap;
}

.bizpur-add:hover {
  filter: brightness(1.08);
}

.bizpur-empty {
  padding: 40px 20px;
  text-align: center;
  font-size: 14px;
  color: var(--text-muted, var(--color-text-muted));
  background: var(--bg-card, var(--color-bg-card));
  border: 1px dashed var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

.bizpur-list {
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  overflow-x: auto;
}

.bizpur-row {
  display: grid;
  grid-template-columns: 110px minmax(120px, 1.4fr) 70px 90px 100px minmax(80px, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color, var(--color-border));
  min-width: 760px;
}

.bizpur-row:last-child {
  border-bottom: none;
}

.bizpur-head-row {
  background: var(--bg-secondary, var(--color-bg-hover));
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, var(--color-text-muted));
}

.bizpur-date {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.bizpur-product {
  font-size: 13px;
  color: var(--text-primary, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizpur-num,
.bizpur-note {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.bizpur-total {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent-color, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.bizpur-actions {
  display: flex;
  gap: 6px;
}

.bizpur-btn {
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizpur-btn:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizpur-btn.del:hover {
  color: var(--error-color, var(--color-error));
  border-color: var(--error-color, var(--color-error));
}

.bizpur-btn.save {
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizpur-btn.save:disabled {
  background: var(--text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

.bizpur-total-preview {
  font-size: 16px;
  font-weight: 700;
  color: var(--accent-color, var(--color-primary));
  font-variant-numeric: tabular-nums;
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
  max-width: 480px;
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

:root.dark .bizpur-list,
:root.dark .biz-dialog {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .bizpur-date,
:root.dark .bizpur-product {
  color: var(--text-primary, #f9fafb);
}

:root.dark .bizpur-btn {
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
