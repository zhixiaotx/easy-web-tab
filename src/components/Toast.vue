<script setup lang="ts">
import Icon from './Icon.vue'
import { onUnmounted } from 'vue'
import type { ToastType } from '../composables/useToast'

const props = defineProps<{
  toasts: { id: number; type: ToastType; message: string; duration: number }[]
}>()

const emit = defineEmits<{
  remove: [id: number]
}>()

const icons: Record<ToastType, string> = {
  success: 'check',
  error: 'close',
  warning: 'alert',
  info: 'info'
}

const colors: Record<ToastType, string> = {
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6'
}

const removeToast = (id: number) => {
  emit('remove', id)
}

onUnmounted(() => {
  // cleanup if needed
})
</script>

<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast"
          :class="`toast-${toast.type}`"
          @click="removeToast(toast.id)"
        >
          <span class="toast-icon" :style="{ color: colors[toast.type] }">
            <Icon :name="icons[toast.type]" />
          </span>
          <span class="toast-message">{{ toast.message }}</span>
          <button class="toast-close" @click.stop="removeToast(toast.id)">×</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  pointer-events: auto;
  min-width: 280px;
  max-width: 400px;
  transition: all var(--anim-base, 250ms) var(--ease-out, cubic-bezier(0.34, 1.56, 0.64, 1));
}

.toast:hover {
  transform: translateX(-4px);
}

.toast-icon {
  font-size: 16px;
  font-weight: bold;
}

.toast-message {
  flex: 1;
  font-size: 14px;
  color: var(--color-text, #1e293b);
}

.toast-close {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--color-text-muted, #94a3b8);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.toast-close:hover {
  color: var(--color-text, #1e293b);
}

/* Toast transition animations */
.toast-enter-active {
  animation: slideInRight var(--transition-fast, 0.15s ease) var(--ease-out, cubic-bezier(0.34, 1.56, 0.64, 1));
}

.toast-leave-active {
  animation: slideOutRight var(--transition-fast, 0.15s ease) ease-in;
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(100px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideOutRight {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100px);
  }
}

/* Dark mode */
html.dark .toast {
  background: var(--color-bg-card, #1f2937);
}

html.dark .toast-message {
  color: var(--color-text, #f9fafb);
}

html.dark .toast-close {
  color: var(--color-text-muted, #9ca3af);
}

html.dark .toast-close:hover {
  color: var(--color-text, #f9fafb);
}
</style>