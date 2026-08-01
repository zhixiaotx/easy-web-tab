import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Category } from '../types'
import { DEFAULT_CATEGORIES } from '../types'

const STORAGE_KEY = 'user-categories'
const DELETED_LEGACY_KEY = 'user-deleted-legacy-ids'

// 需要迁移到自定义分类的原预定义分类
const LEGACY_CATEGORIES: Category[] = [
  { id: 'office', name: '办公工具', icon: '💼', isBuiltIn: false, sort: 1 },
  { id: 'books', name: '图书馆', icon: '💼', isBuiltIn: false, sort: 2 }
]

// 加载用户已删除的遗留分类 ID 集合
function loadDeletedLegacyIds(): Set<string> {
  const raw = localStorage.getItem(DELETED_LEGACY_KEY)
  return raw ? new Set(JSON.parse(raw)) : new Set()
}

function saveDeletedLegacyIds(ids: Set<string>) {
  localStorage.setItem(DELETED_LEGACY_KEY, JSON.stringify([...ids]))
}

export const useCategoriesStore = defineStore('categories', () => {
  // Load custom categories from localStorage
  const customCategories = ref<Category[]>(
    JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  )

  // 已删除的遗留分类 ID（防止迁移重新添加）
  const deletedLegacyIds = loadDeletedLegacyIds()

  // Migration: ensure legacy categories exist for all users (respecting deletions)
  const activeLegacyCategories = LEGACY_CATEGORIES.filter(c => !deletedLegacyIds.has(c.id))

  if (customCategories.value.length === 0) {
    // 首次使用：用所有活跃遗留分类初始化
    customCategories.value = [...activeLegacyCategories]
  } else {
    // 已有用户：合并缺失的活跃遗留分类
    const existingIds = new Set(customCategories.value.map(c => c.id))
    const missing = activeLegacyCategories.filter(c => !existingIds.has(c.id))
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

    // 如果删除的是遗留分类，记录下来防止迁移重新添加
    const isLegacy = LEGACY_CATEGORIES.some(c => c.id === id)
    if (isLegacy && !deletedLegacyIds.has(id)) {
      deletedLegacyIds.add(id)
      saveDeletedLegacyIds(deletedLegacyIds)
    }

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
      // 跳过内置分类、已存在的分类、以及用户已删除的遗留分类
      if (!cat.isBuiltIn && !customCategories.value.find(c => c.id === cat.id) && !deletedLegacyIds.has(cat.id)) {
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
