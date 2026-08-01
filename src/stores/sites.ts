import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Site, Countdown } from '../types'
import { CATEGORIES } from '../types'
import { useMarkdown } from '../composables/useMarkdown'
import { useCategoriesStore } from './categories'
import { useSearchEnginesStore } from './searchEngines'
import { usePasswordsStore } from './passwords'
import { useCountdownsStore } from '@/stores/countdowns'
import {
  checkDeadLinks,
  saveCheckResults,
  loadCheckResults,
  type CheckProgress
} from '../composables/useDeadLinkChecker'
import { scheduleAutoBackup } from '../composables/useBackup'

export const useSitesStore = defineStore('sites', () => {
  const sites = ref<Site[]>([])
  const searchQuery = ref('')
  const selectedTags = ref<string[]>([])
  const selectedCategory = ref<string>('')
  const isLoading = ref(false)
  const currentPage = ref(1)
  const pageSize = ref(18)

  // 断链检测
  const isCheckingLinks = ref(false)
  const linkCheckProgress = ref<CheckProgress | null>(null)
  const showOnlyInvalid = ref(false)

  // 加载保存的检测结果
  function applySavedCheckResults() {
    const saved = loadCheckResults()
    if (Object.keys(saved).length === 0) return
    sites.value = sites.value.map(site => ({
      ...site,
      isValid: saved[site.url] ?? undefined
    }))
  }

  // 开始断链检测
  let checkAbortController: AbortController | null = null

  async function checkDeadLinksAction() {
    if (isCheckingLinks.value) {
      // 取消正在进行的检测
      checkAbortController?.abort()
      isCheckingLinks.value = false
      return
    }

    isCheckingLinks.value = true
    checkAbortController = new AbortController()
    linkCheckProgress.value = null

    const urls = sites.value.map(s => s.url)

    const results = await checkDeadLinks(
      urls,
      (progress, result) => {
        linkCheckProgress.value = progress
        // 实时更新 site 的 isValid
        const idx = sites.value.findIndex(s => s.url === result.url)
        if (idx !== -1) {
          sites.value[idx] = { ...sites.value[idx], isValid: result.isValid }
        }
      },
      checkAbortController.signal
    )

    // 保存结果
    saveCheckResults(results)

    isCheckingLinks.value = false
    linkCheckProgress.value = null
    checkAbortController = null
  }

  // 获取无效站点数量
  const invalidCount = computed(() =>
    sites.value.filter(s => s.isValid === false).length
  )

  const { parseSitesFromMarkdown } = useMarkdown()

  // 总页数
  const totalPages = computed(() => {
    return Math.ceil(filteredSites.value.length / pageSize.value)
  })

  // 当前页数据
  const paginatedSites = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    const end = start + pageSize.value
    return filteredSites.value.slice(start, end)
  })

  // 筛选变化或分页大小变化时重置页码
  watch([searchQuery, selectedTags, selectedCategory, pageSize, showOnlyInvalid], () => {
    currentPage.value = 1
  }, { deep: true })

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

  // 按分类过滤的标签
  const tagsByCategory = computed(() => {
    if (!selectedCategory.value) {
      // 未选分类 → 返回全部标签
      return allTags.value
    }
    const tagSet = new Set<string>()
    sites.value.forEach(site => {
      if (site.category === selectedCategory.value) {
        site.tags.forEach(tag => tagSet.add(tag))
      }
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

    // 断链过滤：只看无效站点
    if (showOnlyInvalid.value) {
      return filtered
        .filter(site => site.isValid === false)
        .sort((a, b) => {
          const sortA = a.sort ?? 1
          const sortB = b.sort ?? 1
          return sortB - sortA
        })
    }

    // 按 sort 字段降序排序（点击频率高的在前）
    return filtered.sort((a, b) => {
      const sortA = a.sort ?? 1
      const sortB = b.sort ?? 1
      return sortB - sortA
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

  // 加载游戏清单
  async function loadGames() {
    try {
      const response = await fetch('/games/manifest.json')
      if (response.ok) {
        const gameEntries = await response.json()
        const gameSites: Site[] = gameEntries.map((game: any) => ({
          name: game.name,
          url: game.path,
          description: game.description,
          category: game.category || 'game',
          tags: ['游戏', '工具'],
          icon: game.icon || '',
          sort: 1,
          createdAt: new Date().toISOString()
        }))
        
        // 合并游戏到sites（避免重复）
        const existingUrls = new Set(sites.value.map(s => s.url))
        const newGames = gameSites.filter(g => !existingUrls.has(g.url))
        sites.value.push(...newGames)
      }
    } catch (e) {
      console.warn('Failed to load games manifest:', e)
    }
  }

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

      // 加载游戏清单
      await loadGames()

      // 应用保存的断链检测结果
      applySavedCheckResults()
    } catch (error) {
      console.error('Failed to load sites:', error)
      sites.value = []
    } finally {
      isLoading.value = false
    }
  }

  // 将多行文本处理为单行（用于 description 字段）
  function normalizeText(text: string | undefined): string | undefined {
    if (!text) return text
    // 将换行符、回车符、制表符等替换为空格，然后压缩连续空格
    return text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
  }

  function addSite(site: Site) {
    const newSite = {
      ...site,
      description: normalizeText(site.description),
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
        description: normalizeText(updatedSite.description),
        updatedAt: new Date().toISOString()
      }
      saveUserSites()
    }
  }

  function deleteSite(url: string) {
    sites.value = sites.value.filter(s => s.url !== url)
    saveUserSites()
  }

  // 取消失效标志（重新标记为未检测状态）
  function unmarkInvalid(url: string) {
    const index = sites.value.findIndex(s => s.url === url)
    if (index !== -1) {
      sites.value[index] = {
        ...sites.value[index],
        isValid: undefined
      }
      // 更新 localStorage 中的检测结果
      const saved = loadCheckResults()
      delete saved[url]
      // 重新保存
      const results = Object.entries(saved).map(([url, isValid]) => ({ url, isValid }))
      saveCheckResults(results)
    }
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
    // 切换分类时清除标签，避免旧分类的标签导致过滤结果为空
    selectedTags.value = []
  }

  function setPage(page: number) {
    currentPage.value = page
  }

  function setPageSize(size: number) {
    pageSize.value = size
  }

  // 调整站点 A 的 sort 值：设置为站点 B 的 sort+1（排在 B 前面）
  function swapSort(urlA: string, urlB: string) {
    const siteA = sites.value.find(s => s.url === urlA)
    const siteB = sites.value.find(s => s.url === urlB)
    if (!siteA || !siteB) return

    const sortB = siteB.sort ?? 1

    // 将 A 的 sort 设置为 B 的 sort+1（排在 B 前面）
    siteA.sort = sortB + 1

    // 持久化到 localStorage
    saveUserSites()
  }

  // 点击网站时增加 sort 值（使用频率排序）
  function incrementClick(url: string) {
    const site = sites.value.find(s => s.url === url)
    if (!site) return

    // sort 值加 1
    site.sort = (site.sort ?? 1) + 1

    // 保存点击计数到 localStorage
    const clickCounts = loadClickCounts()
    clickCounts[url] = (clickCounts[url] ?? 0) + 1
    localStorage.setItem('site-click-counts', JSON.stringify(clickCounts))

    // 持久化网站数据
    saveUserSites()
  }

  // 加载点击计数
  function loadClickCounts(): Record<string, number> {
    try {
      const data = localStorage.getItem('site-click-counts')
      return data ? JSON.parse(data) : {}
    } catch {
      return {}
    }
  }

  function saveUserSites() {
    // 只保存非内置的网站（这里简化处理，保存所有）
    localStorage.setItem('user-sites', JSON.stringify(sites.value))
    
    // 触发自动备份（5分钟后执行，如中途有修改则重新计时）
    const categoriesStore = useCategoriesStore()
    const enginesStore = useSearchEnginesStore()
    scheduleAutoBackup(
      sites.value,
      categoriesStore.customCategories,
      enginesStore.customEngines
    )
  }

  // 导出为 Markdown 文件
  async function exportToMarkdown() {
    const categoriesStore = useCategoriesStore()
    const enginesStore = useSearchEnginesStore()
    const passwordsStore = usePasswordsStore()
    
    // sites 降序排序
    const sortedSites = [...sites.value].sort((a, b) => {
      const sortA = a.sort ?? 1
      const sortB = b.sort ?? 1
      return sortB - sortA
    })
    
    const sitesList = sortedSites.map(site => {
      return `  - name: ${site.name}
    url: ${site.url}
    description: ${site.description || ''}
    category: ${site.category}
    tags: [${site.tags.join(', ')}]
    icon: ${site.icon || ''}
    sort: ${site.sort || 0}
    createdAt: ${site.createdAt || ''}`
    }).join('\n\n')

    // 导出自定义分类 - 升序排序
    const customCats = categoriesStore.exportCustomCategories()
    const sortedCats = [...customCats].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    const categoriesSection = sortedCats.length > 0
      ? `categories:\n${sortedCats.map((c: { id: string; name: string; icon: string; sort?: number }) => `  - id: ${c.id}\n    name: ${c.name}\n    icon: ${c.icon}\n    sort: ${c.sort || 0}`).join('\n\n')}\n\n`
      : ''

    // 导出搜索引擎 - 升序排序
    const engines = enginesStore.exportEngines()
    const sortedEngines = [...engines].sort((a, b) => a.sort - b.sort)
    const enginesSection = `searchEngines:\n${sortedEngines.map((e: { id: string; name: string; url: string; isDefault: boolean; sort: number }) => `  - id: ${e.id}\n    name: ${e.name}\n    url: ${e.url}\n    isDefault: ${e.isDefault}\n    sort: ${e.sort}`).join('\n\n')}\n\n`

    // 导出密码 - 加密存储
    let passwordsSection = ''
    if (passwordsStore.isUnlocked) {
      const encryptedPasswords = await passwordsStore.exportEncryptedPasswords()
      if (encryptedPasswords.length > 0) {
        passwordsSection = `passwords:\n${encryptedPasswords.map(p => `  - id: ${p.id}\n    siteName: ${p.siteName}\n    url: ${p.url}\n    username: ${p.username}\n    password: ${p.password}\n    createdAt: ${p.createdAt}\n    updatedAt: ${p.updatedAt}`).join('\n\n')}\n\n`
      }
    }

    // 导出倒计时
    const countdownsStore = useCountdownsStore()
    const countdownsSection = countdownsStore.countdowns.length > 0
      ? `countdowns:\n${countdownsStore.countdowns.map(c => {
          const repeatLine = c.repeat ? `\n    repeat: ${c.repeat}` : ''
          const sortOrderLine = typeof c.sortOrder === 'number' ? `\n    sortOrder: ${c.sortOrder}` : ''
          const showOnDisplayLine = c.showOnDisplay === false ? '\n    showOnDisplay: false' : ''
          return `  - id: ${c.id}\n    name: ${c.name}\n    endDateTime: ${c.endDateTime}${repeatLine}${sortOrderLine}${showOnDisplayLine}\n    createdAt: ${c.createdAt}\n    updatedAt: ${c.updatedAt}`
        }).join('\n\n')}\n\n`
      : ''

    const markdown = `---
${categoriesSection}${enginesSection}${passwordsSection}${countdownsSection}sites:
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
  function importFromMarkdown(markdownText: string): { added: number; skipped: number; passwordsImported?: number; error?: string } {
    const { parseSitesFromMarkdown } = useMarkdown()
    const parsed = parseSitesFromMarkdown(markdownText)
    const importedSites = parsed.sites
    
    // 检查是否解析到站点数据
    if (!importedSites || importedSites.length === 0) {
      return { added: 0, skipped: 0, error: '未能在文件中解析到站点数据，请检查文件格式是否正确' }
    }
    
    // 过滤掉无效的 URL
    const validSites = importedSites.filter(site => site.url && site.url.trim() !== '')
    if (validSites.length === 0) {
      console.error('[Import] All sites have empty URLs')
      return { added: 0, skipped: 0, error: '文件中所有站点都缺少有效的 URL' }
    }
    
    // 导入自定义分类
    if (parsed.categories && parsed.categories.length > 0) {
      const categoriesStore = useCategoriesStore()
      categoriesStore.importCategories(parsed.categories)
    }
    
    // 导入倒计时（按 id 去重，保留原有数据）
    if (parsed.countdowns && parsed.countdowns.length > 0) {
      const countdownsStore = useCountdownsStore()
      const existingRaw = localStorage.getItem('user-countdowns')
      const existingCountdowns: Countdown[] = existingRaw ? JSON.parse(existingRaw) : []
      const existingIds = new Set(existingCountdowns.map(c => c.id))
      let changed = false
      parsed.countdowns.forEach((countdown, index) => {
        const id = countdown.id || `cd_${Date.now()}_${index}`
        if (!existingIds.has(id)) {
          existingCountdowns.push({ ...countdown, id })
          existingIds.add(id)
          changed = true
        }
      })
      if (changed) {
        localStorage.setItem('user-countdowns', JSON.stringify(existingCountdowns))
        // 重新加载倒计时以更新显示
        countdownsStore.loadCountdowns()
      }
    }
    
    // 获取现有的 localStorage 数据
    const existingData = localStorage.getItem('user-sites')
    const existingSites: Site[] = existingData ? JSON.parse(existingData) : []
    
    // 建立 URL 到站点的映射（只检查 localStorage 中的用户数据）
    const existingMap = new Map(existingSites.map(s => [s.url, s]))
    
    let added = 0
    let skipped = 0
    
    // 合并数据：新数据中 URL 不存在的才添加
    for (const site of validSites) {
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

  // 异步导入密码（从 sites.md，需要主密码解密）
  async function importPasswordsFromMarkdown(markdownText: string): Promise<{ imported: number; failed: number }> {
    const { parseSitesFromMarkdown } = useMarkdown()
    const parsed = parseSitesFromMarkdown(markdownText)
    if (!parsed.passwords || parsed.passwords.length === 0) return { imported: 0, failed: 0 }
    
    const passwordsStore = usePasswordsStore()
    if (!passwordsStore.isUnlocked) return { imported: 0, failed: 0 }
    
    return await passwordsStore.importPasswords(parsed.passwords)
  }

  return {
    sites,
    searchQuery,
    selectedTags,
    selectedCategory,
    isLoading,
    allCategories,
    allTags,
    tagsByCategory,
    filteredSites,
    sitesByCategory,
    currentPage,
    pageSize,
    totalPages,
    paginatedSites,
    loadSites,
    addSite,
    updateSite,
    deleteSite,
    unmarkInvalid,
    migrateSitesToCategory,
    setSearchQuery,
    toggleTag,
    setCategory,
    setPage,
    setPageSize,
    clearFilters,
    exportToMarkdown,
    importFromMarkdown,
    importPasswordsFromMarkdown,
    // 断链检测
    isCheckingLinks,
    linkCheckProgress,
    showOnlyInvalid,
    invalidCount,
    checkDeadLinks: checkDeadLinksAction,
    // 拖拽排序
    swapSort,
    // 点击频率排序
    incrementClick
  }
})
