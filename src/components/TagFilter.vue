<script setup lang="ts">
import { useSitesStore } from '../stores/sites'

const store = useSitesStore()
</script>

<template>
  <div class="tag-filter">
    <div class="tag-list">
      <button
        v-for="tag in store.tagsByCategory"
        :key="tag"
        class="tag"
        :class="{ active: store.selectedTags.includes(tag) }"
        @click="store.toggleTag(tag)"
      >
        {{ tag }}
      </button>
    </div>
    <div class="filter-actions">
      <button
        v-if="store.invalidCount > 0"
        class="invalid-toggle"
        :class="{ active: store.showOnlyInvalid }"
        @click="store.showOnlyInvalid = !store.showOnlyInvalid"
      >
        ⚠️ 只看无效 ({{ store.invalidCount }})
      </button>
      <button
        v-if="store.selectedTags.length > 0 || store.showOnlyInvalid"
        class="clear-btn"
        @click="store.showOnlyInvalid = false; store.clearFilters()"
      >
        清除筛选
      </button>
    </div>
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

.filter-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.invalid-toggle {
  padding: 6px 14px;
  border: 1px solid #f59e0b;
  border-radius: 20px;
  background-color: #fffbeb;
  color: #d97706;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.invalid-toggle:hover {
  background-color: #fef3c7;
  border-color: #f59e0b;
}

.invalid-toggle.active {
  background-color: #f59e0b;
  border-color: #f59e0b;
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
