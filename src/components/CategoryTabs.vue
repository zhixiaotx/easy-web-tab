<script setup lang="ts">
import { computed } from 'vue'
import { useSitesStore } from '../stores/sites'
import { useCategoriesStore } from '../stores/categories'

const store = useSitesStore()
const categoriesStore = useCategoriesStore()

const props = withDefaults(defineProps<{
  hideEmpty?: boolean
}>(), {
  hideEmpty: false
})

const categories = computed(() => {
  const all = categoriesStore.allCategories
  if (!props.hideEmpty) return all
  return all.filter(cat => store.sites.some(site => site.category === cat.id))
})

// 每个分类的网站数量（统计全部站点，不受搜索/标签过滤影响）
const countByCategory = computed(() => {
  const counts: Record<string, number> = {}
  for (const site of store.sites) {
    counts[site.category] = (counts[site.category] ?? 0) + 1
  }
  return counts
})

// 全部站点数量
const totalCount = computed(() => store.sites.length)

const handleCategoryClick = (categoryId: string) => {
  if (store.selectedCategory === categoryId) {
    store.setCategory('')
  } else {
    store.setCategory(categoryId)
  }
}
</script>

<template>
  <div class="category-tabs-wrapper">
    <div class="category-tabs">
      <button
        class="category-tab"
        :class="{ active: store.selectedCategory === '' }"
        @click="store.setCategory('')"
      >
        全部
        <span class="count-badge">{{ totalCount }}</span>
      </button>
      <button
        v-for="cat in categories"
        :key="cat.id"
        class="category-tab"
        :class="{ active: store.selectedCategory === cat.id }"
        @click="handleCategoryClick(cat.id)"
      >
        {{ cat.icon }} {{ cat.name }}
        <span class="category-count">({{ countByCategory[cat.id] ?? 0 }})</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.category-tabs-wrapper {
  margin-bottom: 20px;
  padding: 12px;
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.category-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 4px;
}

.category-tab {
  position: relative;
  padding: 8px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  background-color: white;
  font-size: 13px;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.category-tab:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.category-tab.active {
  background-color: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

.category-count {
  color: #000;
}

.category-tab.active .category-count {
  color: inherit;
}

.count-badge {
  position: absolute;
  top: -8px;
  right: -10px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background-color: #3b82f6;
  color: white;
  font-size: 10px;
  line-height: 16px;
  font-weight: 600;
  text-align: center;
  box-sizing: border-box;
}

.category-tab.active .count-badge {
  background-color: white;
  color: #3b82f6;
}
</style>
