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
      </button>
      <button
        v-for="cat in categories"
        :key="cat.id"
        class="category-tab"
        :class="{ active: store.selectedCategory === cat.id }"
        @click="handleCategoryClick(cat.id)"
      >
        {{ cat.icon }} {{ cat.name }}
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
</style>
