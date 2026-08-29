<script setup lang="ts">
// 卡片编辑条（编辑模式显示）：拖拽图标 + 卡片 id + 前移/后移/重置。
// 逻辑全部来自 useHomeLayout 单例，本组件只做展示与事件触发。
import { useHomeLayout } from '@/composables/useHomeLayout'
import Icon from '@/components/Icon.vue'

const props = defineProps<{ cardId: string }>()
const layout = useHomeLayout()
</script>

<template>
  <div class="card-edit-bar" @click.stop @pointerdown.stop>
    <span class="card-edit-grip"><Icon name="drag" :size="14" /></span>
    <span class="card-edit-title">{{ cardId }}</span>
    <span class="card-edit-actions">
      <button type="button" class="card-edit-btn" title="向前移动" @click.stop="layout.moveCard(cardId, -1)">←</button>
      <button type="button" class="card-edit-btn" title="向后移动" @click.stop="layout.moveCard(cardId, 1)">→</button>
      <button type="button" class="card-edit-btn" title="重置此卡" @click.stop="layout.resetCard(cardId)">↺</button>
    </span>
  </div>
</template>

<style scoped>
.card-edit-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  margin: -4px -4px 4px;
  background: color-mix(in srgb, var(--color-primary, #3b82f6) 10%, transparent);
  border-radius: var(--radius-sm, 8px);
  font-size: 11px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  cursor: default;
}
.card-edit-grip {
  display: inline-flex;
  opacity: 0.7;
}
.card-edit-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.card-edit-actions {
  display: flex;
  gap: 4px;
}
.card-edit-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid var(--color-border, var(--color-border));
  background: var(--color-bg-card, #fff);
  color: var(--color-text, #111);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast, 0.15s ease);
}
.card-edit-btn:hover {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}
</style>
