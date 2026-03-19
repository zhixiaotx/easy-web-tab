<script setup lang="ts">
import { ref } from 'vue'
import { useSearchEnginesStore } from '../stores/searchEngines'

const store = useSearchEnginesStore()

const searchQuery = ref('')
const selectedEngineId = ref('')

// 默认选中
selectedEngineId.value = store.defaultEngine?.id || 'baidu'

const handleSearch = () => {
  if (!searchQuery.value.trim()) return
  
  const engine = store.allEngines.find(e => e.id === selectedEngineId.value)
  if (engine) {
    const url = engine.url + encodeURIComponent(searchQuery.value.trim())
    window.open(url, '_blank')
  }
}

const handleKeyup = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    handleSearch()
  }
}
</script>

<template>
  <div class="global-search">
    <select v-model="selectedEngineId" class="engine-select">
      <option v-for="engine in store.allEngines" :key="engine.id" :value="engine.id">
        {{ engine.name }}
      </option>
    </select>
    <input
      v-model="searchQuery"
      type="text"
      class="search-input"
      placeholder="输入关键词，按回车键搜索..."
      @keyup="handleKeyup"
    />
    <button class="search-btn" @click="handleSearch">
      🔍
    </button>
  </div>
</template>

<style scoped>
.global-search {
  display: flex;
  gap: 0;
  width: 100%;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  overflow: hidden;
}

.engine-select {
  padding: 14px 16px;
  border: none;
  border-right: 1px solid #e2e8f0;
  background-color: white;
  font-size: 15px;
  color: #1e293b;
  cursor: pointer;
  outline: none;
  min-width: 110px;
  font-weight: 500;
}

.engine-select:focus {
  background-color: #f8fafc;
}

.search-input {
  flex: 1;
  padding: 14px 16px;
  border: none;
  font-size: 15px;
  outline: none;
  background: white;
}

.search-input:focus {
  background-color: #f8fafc;
}

.search-input::placeholder {
  color: #94a3b8;
}

.search-btn {
  padding: 14px 20px;
  border: none;
  background-color: #3b82f6;
  color: white;
  font-size: 18px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.search-btn:hover {
  background-color: #2563eb;
}

@media (max-width: 768px) {
  .global-search {
    max-width: 100%;
  }

  .engine-select {
    min-width: 80px;
    font-size: 14px;
    padding: 12px;
  }

  .search-input {
    font-size: 14px;
    padding: 12px;
  }

  .search-btn {
    padding: 12px 16px;
  }
}
</style>
