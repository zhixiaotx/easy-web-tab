<template>
  <button
    class="ewt-view-toggle"
    type="button"
    :title="mode === 'list' ? '切换为卡片视图' : '切换为列表视图'"
    :aria-label="mode === 'list' ? '切换为卡片视图' : '切换为列表视图'"
    @click="$emit('toggle')"
  >
    <span class="ewt-view-toggle-icon">{{ mode === 'list' ? '▦' : '▤' }}</span>
    <span class="ewt-view-toggle-label">{{ mode === 'list' ? '卡片' : '列表' }}</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{ mode: 'list' | 'card' }>()
defineEmits<{ toggle: [] }>()
</script>

<style scoped>
.ewt-view-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  font-size: 13px;
  line-height: 1;
  color: var(--color-text, #374151);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s, color 0.15s;
}
.ewt-view-toggle:hover {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}
.ewt-view-toggle-icon {
  font-size: 14px;
}
:global(html.dark) .ewt-view-toggle {
  background: var(--color-surface, #1f2937);
  color: var(--color-text, #e5e7eb);
  border-color: var(--color-border, #374151);
}
</style>
