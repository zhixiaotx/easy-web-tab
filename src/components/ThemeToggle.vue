<script setup lang="ts">
import { computed } from 'vue'
import { useThemeStore } from '../stores/theme'

const themeStore = useThemeStore()
const shouldShow = computed(() => themeStore.backgroundType !== 'image')
</script>

<template>
  <button v-if="shouldShow" class="theme-toggle" @click="themeStore.toggleTheme" title="切换主题">
    {{ themeStore.theme === 'light' ? '🌙' : '☀️' }}
  </button>
</template>

<style scoped>
.theme-toggle {
  padding: 10px 14px;
  background-color: white;
  color: #64748b;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.theme-toggle:hover {
  background-color: #f1f5f9;
  color: #f59e0b;
  border-color: #f59e0b;
}

:root.dark .theme-toggle {
  background-color: #1e293b;
  color: #94a3b8;
  border-color: #334155;
}

:root.dark .theme-toggle:hover {
  background-color: #334155;
  color: #f59e0b;
  border-color: #f59e0b;
}
</style>
