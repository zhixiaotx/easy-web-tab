<script setup lang="ts">
// 支出记录：tabs 容器（受控 activeTab + change，仿 WorkbenchHealth）+ 4 列卡片网格 + ⚙️ 分类管理
import { computed, ref } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { findExpenseCategory, formatYuanOf, localDateKey, sortExpenses, visibleExpenseCategories } from '@/composables/businessCore'
import type { BusinessExpense } from '@/types'
import BusinessCategoryManager from './BusinessCategoryManager.vue'

const props = defineProps<{ activeTab: string }>()
const emit = defineEmits<{ change: [tab: string] }>()

const store = useWorkbenchBusinessStore()

const showCatManager = ref(false)

const tabs = computed(() => visibleExpenseCategories(store.expenseCategories))

const filtered = computed(() => {
  const all = sortExpenses(store.expenses)
  if (props.activeTab === 'all') return all
  return all.filter(e => e.categoryId === props.activeTab)
})

function catNameOf(id: string): string {
  return findExpenseCategory(store.expenseCategories, id)?.name ?? '未知'
}

// ===== 新增/编辑弹框 =====
const showDialog = ref(false)
const editingId = ref<string | null>(null)
const formDate = ref(localDateKey())
const formCategoryId = ref('')
const formAmount = ref('')
const formNote = ref('')

const isFormValid = computed(
  () => formDate.value !== '' && formCategoryId.value !== '' && Number(formAmount.value) > 0
)

function startAdd(): void {
  editingId.value = null
  formDate.value = localDateKey()
  formCategoryId.value = props.activeTab !== 'all' ? props.activeTab : (store.expenseCategories[0]?.id ?? '')
  formAmount.value = ''
  formNote.value = ''
  showDialog.value = true
}

function startEdit(e: BusinessExpense): void {
  editingId.value = e.id
  formDate.value = e.date
  formCategoryId.value = e.categoryId
  formAmount.value = String(e.amount)
  formNote.value = e.note ?? ''
  showDialog.value = true
}

async function handleSave(): Promise<void> {
  if (!isFormValid.value) return
  const payload = {
    date: formDate.value,
    categoryId: formCategoryId.value,
    amount: Number(formAmount.value),
    note: formNote.value.trim() || undefined
  }
  if (editingId.value) {
    await store.updateExpense(editingId.value, payload)
  } else {
    await store.addExpense(payload)
  }
  showDialog.value = false
}

async function handleDelete(id: string): Promise<void> {
  if (!confirm('确定要删除这笔支出吗？')) return
  await store.deleteExpense(id)
}

// 激活分类被删除/隐藏时本地兜底回退全部（父级容器持有 activeTab 状态）
const effectiveTab = computed(() => {
  if (props.activeTab === 'all') return 'all'
  return tabs.value.some(c => c.id === props.activeTab) ? props.activeTab : 'all'
})
</script>

<template>
  <div class="bizexp">
    <!-- 分类 tabs（受控）+ 新增 -->
    <div class="bizexp-bar">
      <div class="bizexp-tabs">
        <button
          class="bizexp-tab"
          :class="{ active: effectiveTab === 'all' }"
          data-testid="bizexp-tab-all"
          @click="emit('change', 'all')"
        >全部</button>
        <button
          v-for="cat in tabs"
          :key="cat.id"
          class="bizexp-tab"
          :class="{ active: effectiveTab === cat.id }"
          :data-testid="`bizexp-tab-${cat.id}`"
          @click="emit('change', cat.id)"
        >{{ cat.name }}</button>
        <button class="bizexp-tab bizexp-cat-btn" data-testid="bizexp-cat-manager" @click="showCatManager = true">⚙️</button>
      </div>
      <button class="bizexp-add" data-testid="bizexp-add" @click="startAdd">＋ 新增</button>
    </div>

    <!-- 4 列卡片网格 -->
    <div v-if="filtered.length === 0" class="bizexp-empty" data-testid="bizexp-empty">暂无支出记录</div>
    <div v-else class="bizexp-grid" data-testid="bizexp-grid">
      <div v-for="e in filtered" :key="e.id" class="bizexp-card" data-testid="bizexp-card">
        <div class="bizexp-head">
          <span class="bizexp-date">{{ e.date.slice(5) }}</span>
          <span class="bizexp-cat">{{ catNameOf(e.categoryId) }}</span>
        </div>
        <div class="bizexp-amount">{{ formatYuanOf(e.amount) }}</div>
        <div class="bizexp-note">{{ e.note || '—' }}</div>
        <div class="bizexp-actions">
          <button class="bizexp-btn" :data-testid="`bizexp-edit-${e.id}`" @click="startEdit(e)">编辑</button>
          <button class="bizexp-btn del" :data-testid="`bizexp-del-${e.id}`" @click="handleDelete(e.id)">删除</button>
        </div>
      </div>
    </div>

    <!-- 新增/编辑弹框 -->
    <div v-if="showDialog" class="biz-dialog-overlay" @click.self="showDialog = false">
      <div class="biz-dialog" data-testid="bizexp-dialog">
        <div class="biz-dialog-header">
          <h3>{{ editingId ? '编辑支出' : '新增支出' }}</h3>
          <button class="biz-dialog-close" @click="showDialog = false">✕</button>
        </div>
        <form class="biz-dialog-body" @submit.prevent="handleSave">
          <div class="biz-form-row">
            <div class="biz-field">
              <label>日期 *</label>
              <input v-model="formDate" type="date" class="biz-input" data-testid="bizexp-form-date" />
            </div>
            <div class="biz-field">
              <label>分类 *</label>
              <select v-model="formCategoryId" class="biz-input" data-testid="bizexp-form-category">
                <option v-for="cat in store.expenseCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
              </select>
            </div>
          </div>
          <div class="biz-field">
            <label>金额 *</label>
            <input v-model="formAmount" type="number" min="0" step="0.01" class="biz-input" data-testid="bizexp-form-amount" />
          </div>
          <div class="biz-field">
            <label>备注（可选）</label>
            <input v-model="formNote" type="text" maxlength="100" class="biz-input" data-testid="bizexp-form-note" />
          </div>
          <div class="biz-form-actions">
            <button type="button" class="bizexp-btn" @click="showDialog = false">取消</button>
            <button type="submit" class="bizexp-btn save" :disabled="!isFormValid" data-testid="bizexp-save">
              {{ editingId ? '保存' : '添加' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <BusinessCategoryManager v-if="showCatManager" kind="expense" @close="showCatManager = false" />
  </div>
</template>

<style scoped>
.bizexp {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.bizexp-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.bizexp-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bizexp-tab {
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-full, 999px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizexp-tab:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizexp-tab.active {
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
  color: #fff;
}

.bizexp-cat-btn {
  padding: 7px 10px;
}

.bizexp-add {
  padding: 9px 16px;
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  white-space: nowrap;
}

.bizexp-add:hover {
  filter: brightness(1.08);
}

.bizexp-empty {
  padding: 40px 20px;
  text-align: center;
  font-size: 14px;
  color: var(--text-muted, var(--color-text-muted));
  background: var(--bg-card, var(--color-bg-card));
  border: 1px dashed var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

.bizexp-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
}

.bizexp-card {
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

.bizexp-card:hover {
  border-color: var(--accent-color, var(--color-primary));
}

.bizexp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bizexp-date {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.bizexp-cat {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  color: var(--accent-color, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--accent-color, #3b82f6) 30%, transparent);
}

.bizexp-amount {
  font-size: 20px;
  font-weight: 700;
  color: var(--error-color, var(--color-error));
  font-variant-numeric: tabular-nums;
}

.bizexp-note {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizexp-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.bizexp-btn {
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizexp-btn:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizexp-btn.del:hover {
  color: var(--error-color, var(--color-error));
  border-color: var(--error-color, var(--color-error));
}

.bizexp-btn.save {
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.bizexp-btn.save:disabled {
  background: var(--text-muted, var(--color-text-muted));
  cursor: not-allowed;
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
  min-width: 130px;
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

:root.dark .bizexp-card,
:root.dark .biz-dialog {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .bizexp-date {
  color: var(--text-primary, #f9fafb);
}

:root.dark .bizexp-amount {
  color: #f87171;
}

:root.dark .bizexp-tab,
:root.dark .bizexp-btn {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .bizexp-tab.active {
  background-color: var(--accent-color, #3b82f6);
  color: #fff;
}

:root.dark .biz-input {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}

@media (max-width: 1100px) {
  .bizexp-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .bizexp-grid {
    grid-template-columns: 1fr;
  }
}
</style>
