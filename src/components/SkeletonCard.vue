<script setup lang="ts">
defineProps<{
  rows?: number
}>()
</script>

<template>
  <div class="skeleton-card">
    <div class="skeleton-icon"></div>
    <div class="skeleton-name"></div>
  </div>
</template>

<style scoped>
.skeleton-card {
  background-color: white;
  border-radius: 10px;
  padding: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.skeleton-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  margin: 0 auto 10px;
}

.skeleton-name {
  height: 14px;
  width: 70%;
  margin: 0 auto;
  border-radius: 4px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

:root.dark .skeleton-card {
  background-color: var(--color-bg-card, #1f2937);
}

:root.dark .skeleton-icon,
:root.dark .skeleton-name {
  background: linear-gradient(90deg, #2d3748 25%, #374151 50%, #2d3748 75%);
  background-size: 200% 100%;
}
</style>