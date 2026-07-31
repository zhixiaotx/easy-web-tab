<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useCountdownsStore } from '@/stores/countdowns'
import type { CountdownItem } from '@/stores/countdowns'

const emit = defineEmits<{
  close: []
}>()

const store = useCountdownsStore()

type RemainingStatus = 'normal' | 'urgent' | 'critical' | 'expired'

// 根据剩余状态返回对应的样式类
function statusClass(status: RemainingStatus): string {
  return 'status-' + status
}

// ESC 键关闭弹框
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

onMounted(() => {
  store.loadCountdowns()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

// 前台展示列表（store 挂载后异步加载，用 computed 保持响应）
const items = computed<CountdownItem[]>(() => store.frontCountdowns)
</script>

<template>
  <div class="manager-overlay" @click.self="emit('close')">
    <div class="manager">
      <div class="manager-header">
        <h2>⏳ 倒计时</h2>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="manager-body">
        <div v-if="items.length === 0" class="empty-state">暂无倒计时</div>

        <div v-else class="countdown-list">
          <div v-for="item in items" :key="item.id" class="countdown-item">
            <div class="countdown-info">
              <div class="countdown-title">
                <span class="countdown-name">{{ item.name }}</span>
                <span v-if="item.repeat === 'yearly'" class="repeat-badge">每年重复</span>
              </div>
              <span class="countdown-time">{{ item.remaining.nextTime }}</span>
            </div>
            <span class="countdown-remaining" :class="statusClass(item.remaining.status)">
              {{ item.remaining.label }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.manager-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  padding: 20px;
}

.manager {
  background-color: var(--bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: var(--shadow-modal);
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color, var(--color-border));
  position: sticky;
  top: 0;
  background: var(--bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.manager-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-muted, var(--color-text-muted));
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: color var(--transition-fast, 0.15s ease);
}

.close-btn:hover {
  color: var(--text-primary, var(--color-text));
}

.manager-body {
  padding: 24px;
}

/* 列表 */
.countdown-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.countdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md);
  transition: border-color var(--transition-fast, 0.15s ease);
}

.countdown-item:hover {
  border-color: var(--accent-color, var(--color-primary));
}

.countdown-info {
  flex: 1;
  min-width: 0;
}

.countdown-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.countdown-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repeat-badge {
  flex-shrink: 0;
  font-size: 12px;
  padding: 1px 8px;
  border-radius: var(--radius-full);
  background: var(--bg-secondary, var(--color-bg-hover));
  color: var(--accent-color, var(--color-primary));
  border: 1px solid var(--accent-color, var(--color-primary));
  opacity: 0.85;
}

.countdown-time {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
}

.countdown-remaining {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 600;
  text-align: right;
}

/* 剩余时间状态色 */
.status-normal {
  color: var(--success-color, var(--color-success));
}

.status-urgent {
  color: var(--warning-color, var(--color-warning));
}

.status-critical {
  color: var(--error-color, var(--color-error));
}

.status-expired {
  color: var(--text-muted, var(--color-text-muted));
}

/* 空状态 */
.empty-state {
  text-align: center;
  color: var(--text-muted, var(--color-text-muted));
  font-size: 14px;
  padding: 40px 20px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border-radius: var(--radius-md);
}

@media (max-width: 640px) {
  .manager {
    max-height: 90vh;
  }

  .countdown-item {
    flex-wrap: wrap;
  }

  .countdown-remaining {
    margin-left: 0;
    text-align: left;
  }
}
</style>
