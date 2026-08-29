<script setup lang="ts">
import Icon from './Icon.vue'
import { computed } from 'vue'
import { useSitesStore } from '../stores/sites'

const store = useSitesStore()

const inputValue = computed({
  get: () => store.searchQuery,
  set: (value: string) => store.setSearchQuery(value)
})

const handleClear = () => {
  store.setSearchQuery('')
}
</script>

<template>
  <div class="search-bar">
    <span class="search-icon"><Icon name="search" /></span>
    <input
      v-model="inputValue"
      type="text"
      placeholder="搜索网站..."
      class="search-input"
    />
    <button
      v-if="inputValue"
      class="clear-btn"
      @click="handleClear"
    >
      <Icon name="close" />
    </button>
  </div>
</template>

<style scoped>
.search-bar {
  display: flex;
  align-items: center;
  background-color: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 12px;
  gap: 8px;
  min-width: 280px;
}

.search-icon {
  font-size: 16px;
  opacity: 0.6;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 14px;
  background: transparent;
}

.search-input::placeholder {
  color: #94a3b8;
}

.clear-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  font-size: 12px;
  color: #94a3b8;
  transition: color 0.2s;
}

.clear-btn:hover {
  color: #64748b;
}
</style>
