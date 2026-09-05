<script setup lang="ts">
// 销售记账共享分类管理弹框（product 商品分类 / expense 支出分类 双模式，页面 ⚙️ 与设置弹窗 tab 复用）
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { useToast } from '@/composables/useToast'
import Icon from '@/components/Icon.vue'

const props = defineProps<{ kind: 'product' | 'expense' }>()
const emit = defineEmits<{ close: [] }>()

// ESC 关闭弹框
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}
onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))

const store = useWorkbenchBusinessStore()
const toast = useToast()

const isProduct = computed(() => props.kind === 'product')
const list = computed(() => (isProduct.value ? store.productCategories : store.expenseCategories))

// 行内改名：仅暂存输入中文本，blur/Enter 提交、Esc 还原（仿待办分类管理惯例）
const editing = reactive<Record<string, string>>({})
const newName = ref('')

function isBuiltInOf(id: string): boolean {
  if (isProduct.value) return false
  return (store.expenseCategories.find(c => c.id === id)?.isBuiltIn ?? false)
}

const ERROR_MESSAGES: Record<string, string> = {
  empty: '分类名称不能为空',
  duplicate: '同名分类已存在',
  'not-found': '分类不存在',
  'in-use': '该分类已被记录使用，无法删除',
  builtin: '内置分类无法删除',
  boundary: '已在边界'
}

function handleResult(r: { ok: boolean; reason?: string }, successMsg?: string): void {
  if (r.ok) {
    if (successMsg) toast.success(successMsg)
    return
  }
  toast.error(ERROR_MESSAGES[r.reason ?? ''] ?? '操作失败')
}

function commitRename(id: string): void {
  const raw = editing[id] ?? ''
  const name = raw.trim()
  if (!name) {
    delete editing[id]
    return
  }
  const r = isProduct.value
    ? store.renameProductCategory(id, name)
    : store.renameExpenseCategory(id, name)
  handleResult(r)
  delete editing[id]
}

function revertRename(id: string): void {
  delete editing[id]
}

function onToggleVisible(id: string): void {
  const r = isProduct.value
    ? store.toggleProductCategoryVisible(id)
    : store.toggleExpenseCategoryVisible(id)
  handleResult(r)
}

function onMove(id: string, dir: 'up' | 'down'): void {
  const r = isProduct.value
    ? store.moveProductCategory(id, dir)
    : store.moveExpenseCategory(id, dir)
  handleResult(r)
}

function onDelete(id: string): void {
  const target = list.value.find(c => c.id === id)
  if (!confirm(`确定要删除分类「${target?.name ?? ''}」吗？`)) return
  const r = isProduct.value ? store.deleteProductCategory(id) : store.deleteExpenseCategory(id)
  handleResult(r)
}

function handleAdd(): void {
  const name = newName.value.trim()
  if (!name) return
  const r = isProduct.value ? store.addProductCategory(name) : store.addExpenseCategory(name)
  if (r.ok) newName.value = ''
  handleResult(r)
}
</script>

<template>
  <el-dialog
    :model-value="true"
    width="420px"
    :title="isProduct ? '商品分类管理' : '支出分类管理'"
    :data-testid="`bizcat-dialog-${kind}`"
    @close="emit('close')"
  >
    <div class="bizcat-body">
      <p class="bizcat-hint">勾选控制标签页显示；{{ isProduct ? '内置分类可删除（删除后该分类商品归未分类）' : '内置分类不可删除，可改名与排序' }}</p>
      <div class="bizcat-list">
        <div
          v-for="cat in list"
          :key="cat.id"
          class="bizcat-row"
          :data-testid="`bizcat-row-${kind}-${cat.id}`"
        >
          <el-checkbox
            :checked="cat.visible"
            :data-testid="`bizcat-tab-${kind}-${cat.id}`"
            @change="onToggleVisible(cat.id)"
          />
          <span class="bizcat-icon">
            <Icon v-if="isProduct" name="tag" :size="14" />
            <Icon v-else-if="isBuiltInOf(cat.id)" name="lock" :size="14" />
            <Icon v-else name="expenses" :size="14" />
          </span>
          <el-input
            size="small"
            maxlength="20"
            :data-testid="`bizcat-name-${kind}-${cat.id}`"
            :model-value="editing[cat.id] ?? cat.name"
            @input="editing[cat.id] = $event"
            @blur="commitRename(cat.id)"
            @keydown.enter="commitRename(cat.id)"
            @keydown.esc.stop="revertRename(cat.id)"
          />
          <div class="bizcat-actions">
            <el-button size="small" :data-testid="`bizcat-up-${kind}-${cat.id}`" @click="onMove(cat.id, 'up')">↑</el-button>
            <el-button size="small" :data-testid="`bizcat-down-${kind}-${cat.id}`" @click="onMove(cat.id, 'down')">↓</el-button>
            <el-button size="small" type="danger" :data-testid="`bizcat-del-${kind}-${cat.id}`" @click="onDelete(cat.id)">删除</el-button>
          </div>
        </div>
      </div>

      <div class="bizcat-add">
        <el-input
          v-model="newName"
          size="small"
          maxlength="20"
          placeholder="新分类名称"
          :data-testid="`bizcat-new-${kind}`"
          @keydown.enter="handleAdd"
        />
        <el-button size="small" type="primary" :data-testid="`bizcat-add-${kind}`" @click="handleAdd">添加</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.bizcat-body {
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bizcat-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
}

.bizcat-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bizcat-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bizcat-icon {
  flex-shrink: 0;
  font-size: 14px;
}

:deep(.bizcat-row .el-input),
:deep(.bizcat-add .el-input) {
  flex: 1;
  min-width: 0;
}

:deep(.bizcat-row .el-input__inner),
:deep(.bizcat-add .el-input__inner) {
  font-size: 13px;
}

:deep(.bizcat-row .el-checkbox) {
  margin-right: 0;
}

.bizcat-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.bizcat-add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px dashed var(--color-border, var(--color-border));
}

/* el-dialog 外壳对齐原弹框（组件根即 .el-dialog，自带 data-v 作用域） */
.el-dialog {
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

:deep(.el-dialog__header) {
  flex-shrink: 0;
}

:deep(.el-dialog__body) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* 暗色模式 */
html.dark .bizcat-hint {
  color: var(--color-text-muted, #9ca3af);
}
</style>
