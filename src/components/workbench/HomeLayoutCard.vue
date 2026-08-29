<script setup lang="ts">
// 主页卡片布局包装器：作为网格项承载列跨度/最小高度/排序 style，
// 编辑模式下注入「编辑条」与「尺寸拖拽柄」。内部卡片保持原 .bento-card 视觉不变。
import { useHomeLayout } from '@/composables/useHomeLayout'
import HomeCardEdit from './HomeCardEdit.vue'
import HomeCardResize from './HomeCardResize.vue'

const props = defineProps<{ cardId: string; defaultW?: number }>()
const layout = useHomeLayout()
</script>

<template>
  <div
    class="bento-card-wrap"
    :class="{ 'in-edit': layout.editMode }"
    :style="layout.cardStyle(cardId, defaultW ?? 1)"
    :data-card-id="cardId"
  >
    <HomeCardEdit v-if="layout.editMode" :card-id="cardId" />
    <slot />
    <HomeCardResize v-if="layout.editMode" :card-id="cardId" />
  </div>
</template>

<style scoped>
.bento-card-wrap {
  display: flex;
  min-width: 0;
}
/* 内部卡片撑满包装器（宽 100%，高随包装器 min-height 拉伸） */
.bento-card-wrap > :deep(.bento-card) {
  flex: 1;
  width: 100%;
  min-width: 0;
}
.bento-card-wrap.in-edit {
  position: relative;
  outline: 1px dashed var(--color-border, #cbd5e1);
  outline-offset: 2px;
}
</style>
