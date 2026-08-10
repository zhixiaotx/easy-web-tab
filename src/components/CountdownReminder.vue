<script setup lang="ts">
import { useCountdownReminder } from '@/composables/useCountdownReminder'

const { state, close } = useCountdownReminder()
</script>

<template>
  <div v-if="state.open && state.items.length > 0" class="reminder-overlay">
    <div class="reminder-card">
      <h2 class="reminder-title">⏰ 定时提醒</h2>
      <ul class="reminder-list">
        <li v-for="item in state.items" :key="item.id" class="reminder-item">
          <span class="reminder-name">{{ item.name }}</span>
          <span class="reminder-label"><template v-if="/^\d{2}-\d{2} \d{2}:\d{2}$/.test(item.label)">⏰ </template>{{ item.label }}</span>
        </li>
      </ul>
      <button class="reminder-close" @click="close">关闭</button>
    </div>
  </div>
</template>

<style scoped>
/* 全屏遮罩：z-index 2000，高于工作台便签浮层（note-overlay, 1000）。点击遮罩不关闭 —— 提醒必须被看到，仅「关闭」按钮可关。 */
.reminder-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.5);
}

.reminder-card {
  width: 100%;
  max-width: 460px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-lg, 14px);
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
}

.reminder-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
}

.reminder-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 40vh;
  overflow-y: auto;
}

.reminder-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: var(--color-bg-hover, #f1f5f9);
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
}

.reminder-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary, var(--color-text));
  font-weight: 500;
}

.reminder-label {
  flex-shrink: 0;
  color: var(--accent-color, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.reminder-close {
  align-self: flex-end;
  padding: 8px 20px;
  background-color: var(--accent-color, var(--color-primary));
  color: #ffffff;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.reminder-close:hover {
  opacity: 0.85;
}

/* 暗色模式覆盖（同工作台浮层模式，见 WorkbenchNotes.vue:645-651） */
:root.dark .reminder-overlay {
  background: rgba(0, 0, 0, 0.7);
}

:root.dark .reminder-card {
  background-color: var(--bg-secondary, #1f2937);
}

:root.dark .reminder-title {
  color: var(--text-primary, #f9fafb);
}

:root.dark .reminder-item {
  background-color: var(--input-bg, #374151);
}

:root.dark .reminder-name {
  color: var(--text-primary, #f9fafb);
}

:root.dark .reminder-label {
  color: #60a5fa;
}
</style>
