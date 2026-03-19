<script setup lang="ts">
import { useSitesStore } from '../stores/sites'

const store = useSitesStore()
</script>

<template>
  <div class="tag-filter">
    <div class="tag-list">
      <button
        v-for="tag in store.allTags"
        :key="tag"
        class="tag"
        :class="{ active: store.selectedTags.includes(tag) }"
        @click="store.toggleTag(tag)"
      >
        {{ tag }}
      </button>
    </div>
    <button
      v-if="store.selectedTags.length > 0"
      class="clear-btn"
      @click="store.clearFilters"
    >
      清除筛选
    </button>
  </div>
</template>

<style scoped>
.tag-filter {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.tag-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tag {
  padding: 6px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  background-color: white;
  font-size: 13px;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
}

.tag:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.tag.active {
  background-color: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

.clear-btn {
  background: none;
  border: none;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
}

.clear-btn:hover {
  color: #3b82f6;
}
</style>
