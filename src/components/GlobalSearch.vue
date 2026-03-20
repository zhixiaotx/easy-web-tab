<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSearchEnginesStore } from '../stores/searchEngines'

const store = useSearchEnginesStore()

const searchQuery = ref('')
const selectedEngineId = ref('')
const showHistory = ref(false)

// 搜索历史
const SEARCH_HISTORY_KEY = 'search-history'
const MAX_HISTORY = 10

// 加载历史
const searchHistory = ref<string[]>([])
function loadHistory() {
  const saved = localStorage.getItem(SEARCH_HISTORY_KEY)
  if (saved) {
    searchHistory.value = JSON.parse(saved)
  }
}

// 保存历史
function saveHistory() {
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory.value))
}

// 添加到历史
function addToHistory(query: string) {
  const trimmed = query.trim()
  if (!trimmed) return
  
  // 移除已存在的相同记录
  searchHistory.value = searchHistory.value.filter(h => h !== trimmed)
  // 添加到开头
  searchHistory.value.unshift(trimmed)
  // 限制数量
  if (searchHistory.value.length > MAX_HISTORY) {
    searchHistory.value = searchHistory.value.slice(0, MAX_HISTORY)
  }
  saveHistory()
}

// 清除历史
function clearHistory() {
  searchHistory.value = []
  localStorage.removeItem(SEARCH_HISTORY_KEY)
}

// 选择历史项
function selectHistoryItem(item: string) {
  searchQuery.value = item
  showHistory.value = false
  handleSearch()
}

onMounted(() => {
  loadHistory()
  selectedEngineId.value = store.defaultEngine?.id || 'baidu'
})

const handleSearch = () => {
  if (!searchQuery.value.trim()) return
  
  const engine = store.allEngines.find(e => e.id === selectedEngineId.value)
  if (engine) {
    // 保存到历史
    addToHistory(searchQuery.value)
    
    const url = engine.url + encodeURIComponent(searchQuery.value.trim())
    window.open(url, '_blank')
  }
}

const handleKeyup = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    handleSearch()
  }
}

// 输入框聚焦
function handleFocus() {
  showHistory.value = searchHistory.value.length > 0
}

// 输入框失焦
function handleBlur() {
  // 延迟关闭，确保点击历史项能生效
  setTimeout(() => {
    showHistory.value = false
  }, 150)
}

// 输入变化
function handleInput() {
  showHistory.value = searchHistory.value.length > 0 && searchQuery.value.length === 0
}
</script>

<template>
  <div class="global-search-wrapper">
    <div class="global-search">
      <select v-model="selectedEngineId" class="engine-select">
        <option v-for="engine in store.allEngines" :key="engine.id" :value="engine.id">
          {{ engine.name }}
        </option>
      </select>
      <div class="input-wrapper">
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="输入关键词，按回车键搜索..."
          @keyup="handleKeyup"
          @focus="handleFocus"
          @blur="handleBlur"
          @input="handleInput"
        />
        
        <!-- 搜索历史下拉 -->
        <div v-if="showHistory && searchHistory.length > 0" class="history-dropdown">
          <div class="history-header">
            <span class="history-title">搜索历史</span>
            <button class="clear-history" @click.stop="clearHistory">清除</button>
          </div>
          <div class="history-list">
            <div
              v-for="(item, index) in searchHistory"
              :key="index"
              class="history-item"
              @mousedown.prevent="selectHistoryItem(item)"
            >
              <span class="history-icon">🕐</span>
              <span class="history-text">{{ item }}</span>
            </div>
          </div>
        </div>
      </div>
      <button class="search-btn" @click="handleSearch">
        🔍
      </button>
    </div>
  </div>
</template>

<style scoped>
.global-search-wrapper {
  position: relative;
  width: 100%;
}

.global-search {
  display: flex;
  gap: 0;
  width: 100%;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  overflow: visible;
  background: white;
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

.input-wrapper {
  flex: 1;
  position: relative;
}

.search-input {
  width: 100%;
  padding: 14px 16px;
  border: none;
  font-size: 15px;
  outline: none;
  background: transparent;
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
  border-radius: 0 12px 12px 0;
}

.search-btn:hover {
  background-color: #2563eb;
}

/* 搜索历史下拉 */
.history-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 100;
  margin-top: 4px;
  max-height: 320px;
  overflow-y: auto;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
}

.history-title {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}

.clear-history {
  background: none;
  border: none;
  font-size: 12px;
  color: #64748b;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.clear-history:hover {
  background: #f1f5f9;
  color: #ef4444;
}

.history-list {
  padding: 4px 0;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.history-item:hover {
  background: #f8fafc;
}

.history-icon {
  font-size: 14px;
  opacity: 0.5;
}

.history-text {
  font-size: 14px;
  color: #1e293b;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 暗色模式 */
:root.dark .global-search {
  background-color: var(--bg-secondary, #1f2937);
}

:root.dark .engine-select {
  background-color: var(--bg-secondary, #1f2937);
  color: var(--text-primary, #f9fafb);
  border-right-color: var(--border-color, #374151);
}

:root.dark .search-input {
  color: var(--text-primary, #f9fafb);
}

:root.dark .search-input::placeholder {
  color: var(--text-muted, #9ca3af);
}

:root.dark .history-dropdown {
  background: var(--bg-secondary, #1f2937);
  border-color: var(--border-color, #374151);
}

:root.dark .history-header {
  border-bottom-color: var(--border-color, #374151);
}

:root.dark .history-title {
  color: var(--text-muted, #9ca3af);
}

:root.dark .clear-history {
  color: var(--text-muted, #9ca3af);
}

:root.dark .clear-history:hover {
  background: var(--hover-bg, #374151);
  color: #ef4444;
}

:root.dark .history-item:hover {
  background: var(--hover-bg, #374151);
}

:root.dark .history-text {
  color: var(--text-primary, #f9fafb);
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
