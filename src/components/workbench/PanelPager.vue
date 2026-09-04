<script setup lang="ts">
// 工作台共享分页条（Wave-1 T2，纯展示组件）
// 消费方（Wave-2 面板）：
//   <PanelPager :page="paging.currentPage" :total="paging.totalPages" @prev="paging.prev()" @next="paging.next()" />
// 无 props 默认值/校验、无业务逻辑；testid 被 Wave-3 QA 脚本断言，勿改名。
defineProps<{ page: number; total: number }>()

defineEmits<{ prev: []; next: [] }>()
</script>

<template>
  <div v-if="total > 1" class="panel-pager" data-testid="panel-pager">
    <button
      class="pp-btn"
      data-testid="panel-pager-prev"
      :disabled="page <= 1"
      aria-label="上一页"
      @click="$emit('prev')"
    >←</button>
    <span class="pp-info" data-testid="panel-pager-info">第 {{ page }} / {{ total }} 页</span>
    <button
      class="pp-btn"
      data-testid="panel-pager-next"
      :disabled="page >= total"
      aria-label="下一页"
      @click="$emit('next')"
    >→</button>
  </div>
</template>

<style scoped>
/* 分页条：置于各面板 flex 列底部，flex-shrink 0 防止被内容挤压；面板自己管理上下间距 */
.panel-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 4px 0;
}

/* 翻页按钮：视觉对齐 WorkbenchView .wb-btn token look（--color-* 亮色 token + hex 兜底） */
.pp-btn {
  padding: 6px 12px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.pp-btn:hover:not(:disabled) {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

.pp-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pp-info {
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
}

/* 暗色模式覆盖：--color-* 仅定义于 style.css :root（亮色），dark.css 只覆写 legacy --bg-/--text-/--border-/--accent- 家族，
   故沿用 WorkbenchView html.dark .wb-btn 的既有约定（legacy theme-aware token + hex 兜底）。 */
html.dark .pp-btn {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .pp-btn:hover:not(:disabled) {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

html.dark .pp-info {
  color: var(--color-text-secondary, #d1d5db);
}
</style>
