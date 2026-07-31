<script setup lang="ts">
// 前台展示页倒计时条：只读展示，无任何交互
import { computed, onMounted } from 'vue'
import { useCountdownsStore } from '@/stores/countdowns'

const store = useCountdownsStore()

onMounted(() => {
  store.loadCountdowns()
})

// 已按紧急程度排序：紧急在前，已过期的排在最后
// 用 computed 包装，确保 loadCountdowns() 之后模板能响应式更新
const items = computed(() => store.itemsWithRemaining)
</script>

<template>
  <div v-if="items.length > 0" class="cd-bar">
    <span
      v-for="item in items"
      :key="item.id"
      class="cd-chip"
      :class="'cd-' + item.remaining.status"
    >
      ⏳ {{ item.name }}：{{ item.remaining.label }}
      <span v-if="item.repeat" class="cd-repeat">· 每年</span>
    </span>
  </div>
</template>

<style scoped>
/* 倒计时条容器：水平居中，可换行 */
.cd-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

/* 倒计时芯片：玻璃质感，不喧宾夺主 */
.cd-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-secondary, #d1d5db);
  background-color: var(--glass-bg, rgba(255, 255, 255, 0.6));
  backdrop-filter: var(--glass-blur, blur(8px));
  border: 1px solid var(--border-color, #374151);
}

/* 正常：绿色调 */
.cd-normal {
  background-color: color-mix(in srgb, var(--success-color, #10b981) 12%, transparent);
  border-color: color-mix(in srgb, var(--success-color, #10b981) 22%, transparent);
  color: var(--success-color, #10b981);
}

/* 紧急：橙色调 */
.cd-urgent {
  background-color: color-mix(in srgb, var(--warning-color, #f59e0b) 12%, transparent);
  border-color: color-mix(in srgb, var(--warning-color, #f59e0b) 22%, transparent);
  color: var(--warning-color, #f59e0b);
}

/* 危急：红色调 */
.cd-critical {
  background-color: color-mix(in srgb, var(--error-color, #ef4444) 12%, transparent);
  border-color: color-mix(in srgb, var(--error-color, #ef4444) 22%, transparent);
  color: var(--error-color, #ef4444);
}

/* 已过期：灰调（用户仍可看到，直到删除） */
.cd-expired {
  background-color: color-mix(in srgb, var(--text-muted, #9ca3af) 10%, transparent);
  border-color: var(--border-color, #374151);
  color: var(--text-muted, #9ca3af);
}

/* 每年重复标记：弱化显示 */
.cd-repeat {
  font-size: 10px;
  opacity: 0.6;
}
</style>
