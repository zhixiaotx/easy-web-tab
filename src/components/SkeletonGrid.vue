<script setup lang="ts">
import { computed } from 'vue'
import SkeletonCard from './SkeletonCard.vue'

const props = defineProps<{
  count?: number
}>()

const items = computed(() => {
  return Array.from({ length: props.count || 18 }, (_, i) => i)
})
</script>

<template>
  <div class="skeleton-grid">
    <SkeletonCard v-for="i in items" :key="i" />
  </div>
</template>

<style scoped>
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-top: 16px;
}
</style>