<script setup lang="ts">
import { computed } from 'vue'
import { useSitesStore } from '../stores/sites'

const store = useSitesStore()

const pageSizeOptions = [
  { value: 9, label: '9 条/页' },
  { value: 18, label: '18 条/页' },
  { value: 27, label: '27 条/页' }
]

const pages = computed(() => {
  const total = store.totalPages
  const current = store.currentPage
  const result: (number | string)[] = []
  
  if (total <= 7) {
    for (let i = 1; i <= total; i++) {
      result.push(i)
    }
  } else {
    // 总是显示第一页
    result.push(1)
    
    if (current > 3) {
      result.push('...')
    }
    
    // 中间页码
    const start = Math.max(2, current - 1)
    const end = Math.min(total - 1, current + 1)
    
    for (let i = start; i <= end; i++) {
      result.push(i)
    }
    
    if (current < total - 2) {
      result.push('...')
    }
    
    // 总是显示最后一页
    result.push(total)
  }
  
  return result
})

const handlePageClick = (page: number | string) => {
  if (typeof page === 'number') {
    store.setPage(page)
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

const handleSizeChange = (event: Event) => {
  const target = event.target as HTMLSelectElement
  store.setPageSize(Number(target.value))
}
</script>

<template>
  <div v-if="store.filteredSites.length > 0" class="pagination-wrapper">
    <div class="pagination">
      <button
        class="page-btn"
        :disabled="store.currentPage === 1"
        @click="handlePageClick(store.currentPage - 1)"
      >
        ‹ 上一页
      </button>
      
      <template v-for="page in pages" :key="page">
        <span v-if="page === '...'" class="ellipsis">...</span>
        <button
          v-else
          class="page-btn"
          :class="{ active: page === store.currentPage }"
          @click="handlePageClick(page)"
        >
          {{ page }}
        </button>
      </template>
      
      <button
        class="page-btn"
        :disabled="store.currentPage === store.totalPages"
        @click="handlePageClick(store.currentPage + 1)"
      >
        下一页 ›
      </button>
    </div>

    <!-- 每页条数选择 -->
    <div class="page-size-selector">
      <select
        :value="store.pageSize"
        class="page-size-select"
        @change="handleSizeChange"
      >
        <option
          v-for="opt in pageSizeOptions"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.pagination-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin-top: 32px;
  padding: 20px 0;
  flex-wrap: wrap;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
}

.page-btn {
  padding: 8px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background-color: white;
  color: #64748b;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  border-color: #3b82f6;
  color: #3b82f6;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-btn.active {
  background-color: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

.ellipsis {
  color: #94a3b8;
  padding: 0 4px;
}

.page-size-selector {
  display: flex;
  align-items: center;
}

.page-size-select {
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background-color: white;
  color: #64748b;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  outline: none;
}

.page-size-select:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.page-size-select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}
</style>
