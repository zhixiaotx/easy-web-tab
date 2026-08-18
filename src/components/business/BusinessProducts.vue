<script setup lang="ts">
// 商品管理：分类 tabs（全部 + 可见分类）+ 商品卡片网格 + 新增/编辑弹框 + ⚙️ 分类管理
import { computed, ref } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { findProductCategory, formatYuanOf, sortProducts, visibleProductCategories } from '@/composables/businessCore'
import { useToast } from '@/composables/useToast'
import type { BusinessProduct } from '@/types'
import BusinessCategoryManager from './BusinessCategoryManager.vue'

const store = useWorkbenchBusinessStore()
const toast = useToast()

const activeCat = ref('all')
const showCatManager = ref(false)

const tabs = computed(() => visibleProductCategories(store.productCategories))

const filteredProducts = computed(() => {
  const all = sortProducts(store.products)
  if (activeCat.value === 'all') return all
  return all.filter(p => p.categoryId === activeCat.value)
})

function catNameOf(categoryId?: string): string {
  if (!categoryId) return '未分类'
  return findProductCategory(store.productCategories, categoryId)?.name ?? '未分类'
}

// ===== 新增/编辑弹框 =====
const showDialog = ref(false)
const editingId = ref<string | null>(null)
const formName = ref('')
const formCategoryId = ref('')
const formUnit = ref('件')
const formPurchasePrice = ref('')
const formSellingPrice = ref('')
const formActive = ref(true)

function numOf(raw: string): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

const isFormValid = computed(
  () => formName.value.trim() !== '' && numOf(formSellingPrice.value) > 0
)

function startAdd(): void {
  editingId.value = null
  formName.value = ''
  formCategoryId.value = ''
  formUnit.value = '件'
  formPurchasePrice.value = ''
  formSellingPrice.value = ''
  formActive.value = true
  showDialog.value = true
}

function startEdit(p: BusinessProduct): void {
  editingId.value = p.id
  formName.value = p.name
  formCategoryId.value = p.categoryId ?? ''
  formUnit.value = p.unit
  formPurchasePrice.value = String(p.purchasePrice)
  formSellingPrice.value = String(p.sellingPrice)
  formActive.value = p.active
  showDialog.value = true
}

async function handleSave(): Promise<void> {
  if (!isFormValid.value) return
  const payload = {
    name: formName.value.trim(),
    categoryId: formCategoryId.value || undefined,
    unit: formUnit.value.trim() || '件',
    purchasePrice: numOf(formPurchasePrice.value),
    sellingPrice: numOf(formSellingPrice.value),
    active: formActive.value
  }
  if (editingId.value) {
    await store.updateProduct(editingId.value, payload)
  } else {
    await store.addProduct(payload)
  }
  showDialog.value = false
}

async function handleToggleActive(p: BusinessProduct): Promise<void> {
  await store.updateProduct(p.id, { active: !p.active })
}

async function handleDelete(p: BusinessProduct): Promise<void> {
  if (!confirm(`确定要删除商品「${p.name}」吗？`)) return
  const r = await store.deleteProduct(p.id)
  if (!r.ok) {
    toast.error(r.reason === 'in-use' ? '该商品已有进货或收摊记录，无法删除（可改为停售）' : '商品不存在')
  }
}
</script>

<template>
  <div class="bizprod">
    <!-- 分类 tabs + 新增/分类管理 -->
    <div class="bizprod-bar">
      <div class="bizprod-tabs">
        <button
          class="bizprod-tab"
          :class="{ active: activeCat === 'all' }"
          data-testid="bizprod-cat-all"
          @click="activeCat = 'all'"
        >全部</button>
        <button
          v-for="cat in tabs"
          :key="cat.id"
          class="bizprod-tab"
          :class="{ active: activeCat === cat.id }"
          :data-testid="`bizprod-cat-${cat.id}`"
          @click="activeCat = cat.id"
        >{{ cat.name }}</button>
        <button class="bizprod-tab bizprod-cat-btn" data-testid="bizprod-cat-manager" @click="showCatManager = true">⚙️</button>
      </div>
      <button class="bizprod-add" data-testid="bizprod-add" @click="startAdd">＋ 新增商品</button>
    </div>

    <!-- 商品网格 -->
    <div v-if="filteredProducts.length === 0" class="bizprod-empty" data-testid="bizprod-empty">
      暂无商品，点击右上角「新增商品」添加
    </div>
    <div v-else class="bizprod-grid">
      <div
        v-for="p in filteredProducts"
        :key="p.id"
        class="bizprod-card"
        :class="{ inactive: !p.active }"
        :data-testid="`bizprod-card-${p.id}`"
      >
        <div class="bizprod-head">
          <span class="bizprod-name">{{ p.name }}</span>
          <span class="bizprod-cat">{{ catNameOf(p.categoryId) }}</span>
        </div>
        <div class="bizprod-prices">
          <span class="bizprod-price buy">进价 {{ formatYuanOf(p.purchasePrice) }}/{{ p.unit }}</span>
          <span class="bizprod-price sell">售价 {{ formatYuanOf(p.sellingPrice) }}/{{ p.unit }}</span>
        </div>
        <div class="bizprod-foot">
          <label class="bizprod-active" :title="p.active ? '点击停售' : '点击恢复在售'">
            <input
              type="checkbox"
              :checked="p.active"
              :data-testid="`bizprod-active-${p.id}`"
              @change="handleToggleActive(p)"
            />
            {{ p.active ? '在售' : '停售' }}
          </label>
          <div class="bizprod-actions">
            <button class="bizprod-btn" :data-testid="`bizprod-edit-${p.id}`" @click="startEdit(p)">编辑</button>
            <button class="bizprod-btn del" :data-testid="`bizprod-del-${p.id}`" @click="handleDelete(p)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增/编辑弹框 -->
    <div v-if="showDialog" class="biz-dialog-overlay" @click.self="showDialog = false">
      <div class="biz-dialog" data-testid="bizprod-dialog">
        <div class="biz-dialog-header">
          <h3>{{ editingId ? '编辑商品' : '新增商品' }}</h3>
          <button class="biz-dialog-close" @click="showDialog = false">✕</button>
        </div>
        <form class="biz-dialog-body" @submit.prevent="handleSave">
          <div class="biz-field">
            <label>名称 *</label>
            <input v-model="formName" type="text" maxlength="40" class="biz-input" data-testid="bizprod-form-name" />
          </div>
          <div class="biz-field">
            <label>分类</label>
            <select v-model="formCategoryId" class="biz-input" data-testid="bizprod-form-category">
              <option value="">未分类</option>
              <option v-for="cat in store.productCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
            </select>
          </div>
          <div class="biz-form-row">
            <div class="biz-field">
              <label>单位</label>
              <input v-model="formUnit" type="text" maxlength="8" class="biz-input" data-testid="bizprod-form-unit" />
            </div>
            <div class="biz-field">
              <label>进货单价</label>
              <input v-model="formPurchasePrice" type="number" min="0" step="0.01" class="biz-input" data-testid="bizprod-form-purchase" />
            </div>
            <div class="biz-field">
              <label>售价 *</label>
              <input v-model="formSellingPrice" type="number" min="0" step="0.01" class="biz-input" data-testid="bizprod-form-selling" />
            </div>
          </div>
          <div class="biz-field">
            <label class="bizprod-active">
              <input v-model="formActive" type="checkbox" data-testid="bizprod-form-active" />
              上架在售
            </label>
          </div>
          <div class="biz-form-actions">
            <button type="button" class="bizprod-btn" @click="showDialog = false">取消</button>
            <button type="submit" class="bizprod-btn save" :disabled="!isFormValid" data-testid="bizprod-save">
              {{ editingId ? '保存' : '添加' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <BusinessCategoryManager v-if="showCatManager" kind="product" @close="showCatManager = false" />
  </div>
</template>

<style scoped>
.bizprod {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.bizprod-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.bizprod-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bizprod-tab {
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-full, 999px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizprod-tab:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizprod-tab.active {
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
  color: #fff;
}

.bizprod-cat-btn {
  padding: 7px 10px;
}

.bizprod-add {
  padding: 9px 16px;
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  white-space: nowrap;
}

.bizprod-add:hover {
  filter: brightness(1.08);
}

.bizprod-empty {
  padding: 40px 20px;
  text-align: center;
  font-size: 14px;
  color: var(--text-muted, var(--color-text-muted));
  background: var(--bg-card, var(--color-bg-card));
  border: 1px dashed var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

.bizprod-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
  align-content: start;
}

.bizprod-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
}

.bizprod-card:hover {
  border-color: var(--accent-color, var(--color-primary));
}

.bizprod-card.inactive {
  opacity: 0.6;
}

.bizprod-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bizprod-name {
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizprod-cat {
  flex-shrink: 0;
  font-size: 12px;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  color: var(--accent-color, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--accent-color, #3b82f6) 30%, transparent);
}

.bizprod-prices {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.bizprod-price {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary, var(--color-text-secondary));
}

.bizprod-price.sell {
  color: var(--success-color, var(--color-success));
  font-weight: 600;
}

.bizprod-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bizprod-active {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
}

.bizprod-actions {
  display: flex;
  gap: 6px;
}

.bizprod-btn {
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizprod-btn:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizprod-btn.del:hover {
  color: var(--error-color, var(--color-error));
  border-color: var(--error-color, var(--color-error));
}

.bizprod-btn.save {
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizprod-btn.save:disabled {
  background: var(--text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

/* 弹框（复用体系） */
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
  max-width: 460px;
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
  position: sticky;
  top: 0;
  background: var(--bg-card, var(--color-bg-card));
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

:root.dark .bizprod-card,
:root.dark .biz-dialog {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .bizprod-name {
  color: var(--text-primary, #f9fafb);
}

:root.dark .bizprod-tab,
:root.dark .bizprod-btn {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .bizprod-tab.active {
  background-color: var(--accent-color, #3b82f6);
  color: #fff;
}

:root.dark .biz-input {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}

:root.dark .biz-dialog-header {
  background-color: var(--bg-secondary, #1f2937);
}

@media (max-width: 640px) {
  .bizprod-grid {
    grid-template-columns: 1fr;
  }
}
</style>
