<script setup lang="ts">
// 卡片尺寸拖拽柄（编辑模式显示）：pointerdown 交给 useHomeLayout 处理实时宽高调整。
import { useHomeLayout } from '@/composables/useHomeLayout'

const props = defineProps<{ cardId: string }>()
const layout = useHomeLayout()
</script>

<template>
  <div
    class="card-resize"
    title="拖拽调整宽高"
    @pointerdown="layout.startResize(cardId, $event)"
  >⤡</div>
</template>

<style scoped>
.card-resize {
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
  color: var(--color-text-muted, #9ca3af);
  cursor: nwse-resize;
  user-select: none;
  border-radius: 4px;
  touch-action: none;
}
.card-resize:hover {
  color: var(--color-primary, #3b82f6);
  background: color-mix(in srgb, var(--color-primary, #3b82f6) 12%, transparent);
}
</style>
