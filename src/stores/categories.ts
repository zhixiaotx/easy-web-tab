import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Category } from '../types'
import { DEFAULT_CATEGORIES } from '../types'

const STORAGE_KEY = 'user-categories'

// 需要迁移到自定义分类的原预定义分类
const LEGACY_CATEGORIES: Category[] = [
  { id: 'office', name: '办公工具', icon: '💼', isBuiltIn: false, sort: 1 },
  { id: 'tech', name: '开发技术', icon: '💻', isBuiltIn: false, sort: 2 },
  { id: 'news', name: '新闻资讯', icon: '📰', isBuiltIn: false, sort: 4 },
  { id: 'social', name: '社交娱乐', icon: '🎮', isBuiltIn: false, sort: 5 },
  { id: 'shopping', name: '购物电商', icon: '🛒', isBuiltIn: false, sort: 6 },
  { id: 'life', name: '生活服务', icon: '🏠', isBuiltIn: false, sort: 7 },
  { id: 'education', name: '教育培训', icon: '📚', isBuiltIn: false, sort: 8 },
  { id: 'finance', name: '金融理财', icon: '💰', isBuiltIn: false, sort: 9 },
  { id: 'government', name: '政府公益', icon: '🏛️', isBuiltIn: false, sort: 10 },
  { id: 'travel', name: '旅游出行', icon: '✈️', isBuiltIn: false, sort: 11 },
  { id: 'health', name: '健康医疗', icon: '🏥', isBuiltIn: false, sort: 12 },
  { id: 'game', name: '游戏动漫', icon: '🎮', isBuiltIn: false, sort: 13 },
  { id: 'design', name: '设计创意', icon: '🎨', isBuiltIn: false, sort: 14 },
  { id: 'other', name: '其他', icon: '📁', isBuiltIn: false, sort: 15 }
]

export const useCategoriesStore = defineStore('categories', () => {
  // Load custom categories from localStorage
  const customCategories = ref<Category[]>(
    JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  )

  // Migration: ensure legacy categories exist for all users
  if (customCategories.value.length === 0) {
    // 首次使用：用所有遗留分类初始化
    customCategories.value = [...LEGACY_CATEGORIES]
  } else {
    // 已有用户：合并缺失的遗留分类
    const existingIds = new Set(customCategories.value.map(c => c.id))
    const missing = LEGACY_CATEGORIES.filter(c => !existingIds.has(c.id))
    if (missing.length > 0) {
      customCategories.value.push(...missing)
    }
  }
  saveCustomCategories()

  // Persist to localStorage
  function saveCustomCategories() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customCategories.value))
  }

  // Merged view: built-in + custom, sorted by sort field
  const allCategories = computed(() => {
    const merged = [
      ...DEFAULT_CATEGORIES,
      ...customCategories.value
    ]
    return merged.sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999))
  })

  // Add new custom category
  function addCategory(name: string, icon: string): string {
    const maxSort = customCategories.value.reduce((max, c) => Math.max(max, c.sort ?? 0), 15)
    const id = `custom_${Date.now()}`
    customCategories.value.push({
      id,
      name,
      icon,
      isBuiltIn: false,
      sort: maxSort + 1
    })
    saveCustomCategories()
    return id
  }

  // Update custom category
  function updateCategory(id: string, updates: { name?: string; icon?: string; sort?: number }) {
    const index = customCategories.value.findIndex(c => c.id === id)
    if (index !== -1) {
      customCategories.value[index] = {
        ...customCategories.value[index],
        ...updates
      }
      saveCustomCategories()
    }
  }

  // Delete custom category (returns 'other' as migration target)
  function deleteCategory(id: string): string {
    customCategories.value = customCategories.value.filter(c => c.id !== id)
    saveCustomCategories()
    return 'other' // Migration target
  }

  // Move category up/down
  function moveCategory(id: string, direction: 'up' | 'down') {
    const cat = customCategories.value.find(c => c.id === id)
    if (!cat) return

    const sorted = [...customCategories.value].sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999))
    const index = sorted.findIndex(c => c.id === id)
    
    if (direction === 'up' && index > 0) {
      const prev = sorted[index - 1]
      const prevCat = customCategories.value.find(c => c.id === prev.id)
      if (prevCat && cat) {
        const tempSort = prevCat.sort
        prevCat.sort = cat.sort
        cat.sort = tempSort ?? 999
      }
    } else if (direction === 'down' && index < sorted.length - 1) {
      const next = sorted[index + 1]
      const nextCat = customCategories.value.find(c => c.id === next.id)
      if (nextCat && cat) {
        const tempSort = nextCat.sort
        nextCat.sort = cat.sort
        cat.sort = tempSort ?? 999
      }
    }
    
    saveCustomCategories()
  }

  // Check if category can be deleted
  function canDelete(id: string): boolean {
    const category = allCategories.value.find(c => c.id === id)
    return category ? !category.isBuiltIn : false
  }

  // Check if category can be moved
  function canMove(id: string, direction: 'up' | 'down'): boolean {
    const cat = customCategories.value.find(c => c.id === id)
    if (!cat) return false

    const sorted = [...customCategories.value].sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999))
    const index = sorted.findIndex(c => c.id === id)
    
    if (direction === 'up') return index > 0
    if (direction === 'down') return index < sorted.length - 1
    return false
  }

  // Import custom categories (for import/export)
  function importCategories(categories: Category[]) {
    for (const cat of categories) {
      if (!cat.isBuiltIn && !customCategories.value.find(c => c.id === cat.id)) {
        customCategories.value.push(cat)
      }
    }
    saveCustomCategories()
  }

  // Export custom categories
  function exportCustomCategories(): Category[] {
    return [...customCategories.value]
  }

  return {
    customCategories,
    allCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    moveCategory,
    canDelete,
    canMove,
    importCategories,
    exportCustomCategories
  }
})
