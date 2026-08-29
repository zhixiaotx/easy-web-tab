<script setup lang="ts">
// 主页卡片布局包装器：作为网格项承载列跨度/最小高度/排序 style，
// 并支持原生鼠标拖拽排序（参考网站管理卡片 SiteCard 的交互）。
// 拖起本卡落到另一卡上即交换两者顺序，落库持久化（由 useHomeLayout 单例处理）。
import { useHomeLayout } from '@/composables/useHomeLayout'

const props = defineProps<{ cardId: string; defaultW?: number }>()
const {
  cardStyle,
  dragSourceId,
  dragOverId,
  handleDragStart,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleDragEnd
} = useHomeLayout()
</script>

<template>
  <div
    class="bento-card-wrap"
    :class="{ 'is-dragging': dragSourceId === cardId, 'is-drag-over': dragOverId === cardId }"
    :style="cardStyle(cardId, defaultW ?? 1)"
    :data-card-id="cardId"
    draggable="true"
    @dragstart="handleDragStart(cardId)"
    @dragover="handleDragOver(cardId, $event)"
    @dragleave="handleDragLeave"
    @drop="handleDrop(cardId)"
    @dragend="handleDragEnd"
  >
    <slot />
  </div>
</template>

<style scoped>
.bento-card-wrap {
  display: flex;
  min-width: 0;
  cursor: grab;
  transition: opacity 0.15s ease, box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}
.bento-card-wrap:active {
  cursor: grabbing;
}
/* 内部卡片撑满包装器（宽 100%，高随包装器 min-height 拉伸） */
.bento-card-wrap > :deep(.bento-card) {
  flex: 1;
  width: 100%;
  min-width: 0;
}
.bento-card-wrap.is-dragging {
  opacity: 0.5;
  cursor: grabbing;
}
.bento-card-wrap.is-drag-over {
  outline: 2px dashed var(--color-primary, #3b82f6);
  outline-offset: 2px;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);
}
</style>
