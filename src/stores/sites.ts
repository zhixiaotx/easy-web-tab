import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Site } from '../types'
import { CATEGORIES } from '../types'
import { useMarkdown } from '../composables/useMarkdown'
import { useCategoriesStore } from './categories'
import { useSearchEnginesStore } from './searchEngines'

export const useSitesStore = defineStore('sites', () => {
  const sites = ref<Site[]>([])
  const searchQuery = ref('')
  const selectedTags = ref<string[]>([])
  const selectedCategory = ref<string>('')
  const isLoading = ref(false)
  const currentPage = ref(1)
  const pageSize = 9

  const { parseSitesFromMarkdown } = useMarkdown()

  // 总页数
  const totalPages = computed(() => {
    return Math.ceil(filteredSites.value.length / pageSize)
  })

  // 当前页数据
  const paginatedSites = computed(() => {
    const start = (currentPage.value - 1) * pageSize
    const end = start + pageSize
    return filteredSites.value.slice(start, end)
  })

  // 筛选变化时重置页码
  watch([searchQuery, selectedTags, selectedCategory], () => {
    currentPage.value = 1
  })

  // 获取所有分类（基于已有数据）
  const allCategories = computed(() => {
    const categorySet = new Set<string>()
    sites.value.forEach(site => {
      if (site.category) {
        categorySet.add(site.category)
      }
    })
    return CATEGORIES.filter(c => categorySet.has(c.id))
  })

  const allTags = computed(() => {
    const tagSet = new Set<string>()
    sites.value.forEach(site => {
      site.tags.forEach(tag => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  })

  const filteredSites = computed(() => {
    // 先过滤
    const filtered = sites.value.filter(site => {
      // 分类过滤
      if (selectedCategory.value && site.category !== selectedCategory.value) {
        return false
      }

      // 搜索过滤
      if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        const matchName = site.name.toLowerCase().includes(query)
        const matchDesc = site.description?.toLowerCase().includes(query)
        const matchTags = site.tags.some(tag => tag.toLowerCase().includes(query))
        if (!matchName && !matchDesc && !matchTags) {
          return false
        }
      }

      // 标签过滤
      if (selectedTags.value.length > 0) {
        const hasSelectedTag = selectedTags.value.some(tag => site.tags.includes(tag))
        if (!hasSelectedTag) {
          return false
        }
      }

      return true
    })

    // 按 sort 字段排序（从小到大，0 或 undefined 排后面）
    return filtered.sort((a, b) => {
      const sortA = a.sort ?? 999
      const sortB = b.sort ?? 999
      return sortA - sortB
    })
  })

  // 按分类分组的网站
  const sitesByCategory = computed(() => {
    const grouped: Record<string, Site[]> = {}
    sites.value.forEach(site => {
      const cat = site.category || 'other'
      if (!grouped[cat]) {
        grouped[cat] = []
      }
      grouped[cat].push(site)
    })
    return grouped
  })

  async function loadSites() {
    isLoading.value = true
    try {
      // 获取内置数据
      const response = await fetch('/data/sites.md')
      const content = await response.text()
      const { sites: builtInSites } = parseSitesFromMarkdown(content)

      // 获取 localStorage 数据
      const savedData = localStorage.getItem('user-sites')
      const savedSites: Site[] = savedData ? JSON.parse(savedData) : []

      // 使用 Map 合并数据，localStorage 优先
      const sitesMap = new Map<string, Site>()

      // 先添加内置数据
      for (const site of builtInSites) {
        sitesMap.set(site.url, site)
      }

      // 再添加 localStorage 数据（会覆盖同名 URL）
      for (const site of savedSites) {
        sitesMap.set(site.url, site)
      }

      // 转换为数组
      sites.value = Array.from(sitesMap.values())
    } catch (error) {
      console.error('Failed to load sites:', error)
      sites.value = []
    } finally {
      isLoading.value = false
    }
  }

  function addSite(site: Site) {
    const newSite = {
      ...site,
      createdAt: new Date().toISOString()
    }
    sites.value.push(newSite)
    saveUserSites()
  }

  function updateSite(url: string, updatedSite: Partial<Site>) {
    const index = sites.value.findIndex(s => s.url === url)
    if (index !== -1) {
      sites.value[index] = {
        ...sites.value[index],
        ...updatedSite,
        updatedAt: new Date().toISOString()
      }
      saveUserSites()
    }
  }

  function deleteSite(url: string) {
    sites.value = sites.value.filter(s => s.url !== url)
    saveUserSites()
  }

  // 迁移网站到指定分类
  function migrateSitesToCategory(fromId: string, toId: string) {
    let migrated = 0
    sites.value.forEach(site => {
      if (site.category === fromId) {
        site.category = toId
        migrated++
      }
    })
    if (migrated > 0) {
      saveUserSites()
    }
    return migrated
  }

  function setSearchQuery(query: string) {
    searchQuery.value = query
  }

  function toggleTag(tag: string) {
    const index = selectedTags.value.indexOf(tag)
    if (index === -1) {
      selectedTags.value.push(tag)
    } else {
      selectedTags.value.splice(index, 1)
    }
  }

  function clearFilters() {
    searchQuery.value = ''
    selectedTags.value = []
    selectedCategory.value = ''
  }

  function setCategory(category: string) {
    selectedCategory.value = category
  }

  function setPage(page: number) {
    currentPage.value = page
  }

  function saveUserSites() {
    // 只保存非内置的网站（这里简化处理，保存所有）
    localStorage.setItem('user-sites', JSON.stringify(sites.value))
  }

  // 导出为 Markdown 文件
  function exportToMarkdown() {
    const categoriesStore = useCategoriesStore()
    const enginesStore = useSearchEnginesStore()
    
    const sitesList = sites.value.map(site => {
      return `  - name: ${site.name}
    url: ${site.url}
    description: ${site.description || ''}
    category: ${site.category}
    tags: [${site.tags.join(', ')}]
    icon: ${site.icon || ''}
    sort: ${site.sort || 0}
    createdAt: ${site.createdAt || ''}`
    }).join('\n\n')

    // 导出自定义分类
    const customCats = categoriesStore.exportCustomCategories()
    const categoriesSection = customCats.length > 0
      ? `categories:\n${customCats.map((c: { id: string; name: string; icon: string; sort?: number }) => `  - id: ${c.id}\n    name: ${c.name}\n    icon: ${c.icon}\n    sort: ${c.sort || 0}`).join('\n\n')}\n\n`
      : ''

    // 导出搜索引擎
    const engines = enginesStore.exportEngines()
    const enginesSection = `searchEngines:\n${engines.map((e: { id: string; name: string; url: string; isDefault: boolean; sort: number }) => `  - id: ${e.id}\n    name: ${e.name}\n    url: ${e.url}\n    isDefault: ${e.isDefault}\n    sort: ${e.sort}`).join('\n\n')}\n\n`

    const markdown = `---
${categoriesSection}${enginesSection}sites:
${sitesList}
---

# 我的书签

个人常用的网站导航
`
    // 下载文件
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sites.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  // 从 Markdown 文本导入到 localStorage（按 URL 去重，保留原来的）
  function importFromMarkdown(markdownText: string): { added: number; skipped: number } {
    const { parseSitesFromMarkdown } = useMarkdown()
    const parsed = parseSitesFromMarkdown(markdownText)
    const importedSites = parsed.sites
    
    // 导入自定义分类
    if (parsed.categories && parsed.categories.length > 0) {
      const categoriesStore = useCategoriesStore()
      categoriesStore.importCategories(parsed.categories)
    }
    
    // 获取现有的 localStorage 数据
    const existingData = localStorage.getItem('user-sites')
    const existingSites: Site[] = existingData ? JSON.parse(existingData) : []
    
    // 建立 URL 到站点的映射
    const existingMap = new Map(existingSites.map(s => [s.url, s]))
    
    let added = 0
    let skipped = 0
    
    // 合并数据：新数据中 URL 不存在的才添加
    for (const site of importedSites) {
      if (!existingMap.has(site.url)) {
        existingSites.push(site)
        existingMap.set(site.url, site)
        added++
      } else {
        skipped++
      }
    }
    
    // 保存到 localStorage
    localStorage.setItem('user-sites', JSON.stringify(existingSites))
    
    // 重新加载数据以更新显示
    loadSites()
    
    return { added, skipped }
  }

  return {
    sites,
    searchQuery,
    selectedTags,
    selectedCategory,
    isLoading,
    allCategories,
    allTags,
    filteredSites,
    sitesByCategory,
    currentPage,
    totalPages,
    paginatedSites,
    loadSites,
    addSite,
    updateSite,
    deleteSite,
    migrateSitesToCategory,
    setSearchQuery,
    toggleTag,
    setCategory,
    setPage,
    clearFilters,
    exportToMarkdown,
    importFromMarkdown
  }
})
