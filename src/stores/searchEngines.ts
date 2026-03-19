import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface SearchEngine {
  id: string
  name: string
  url: string
  isDefault: boolean
  sort: number
}

const STORAGE_KEY = 'user-search-engines'
const BUILT_IN_OVERRIDES_KEY = 'built-in-engine-overrides'

// 默认内置搜索引擎 (不可删除)
const BUILT_IN_ENGINES: SearchEngine[] = [
  { id: 'metaso', name: '秘塔AI', url: 'https://metaso.cn/search?q=', isDefault: true, sort: 1 },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=', isDefault: false, sort: 2 },
]

// 默认搜索引擎 (将被迁移到自定义)
const DEFAULT_ENGINES: SearchEngine[] = [
  { id: 'bing', name: '必应', url: 'https://www.bing.com/search?q=', isDefault: false, sort: 3 },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=', isDefault: false, sort: 4 },
  { id: 'sogou', name: '搜狗', url: 'https://www.sogou.com/web?query=', isDefault: false, sort: 5 },
  { id: '360', name: '360搜索', url: 'https://www.so.com/s?q=', isDefault: false, sort: 6 },
  { id: 'quark', name: '夸克', url: 'https://quark.cn/s?query=', isDefault: false, sort: 7 },
  { id: 'zhihu', name: '知乎', url: 'https://www.zhihu.com/search?type=content&q=', isDefault: false, sort: 8 },
  { id: 'bilibili', name: '哔哩哔哩', url: 'https://search.bilibili.com/all?keyword=', isDefault: false, sort: 9 },
  { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=', isDefault: false, sort: 10 },
  { id: 'translate', name: '翻译', url: 'https://translate.google.com/?sl=auto&tl=zh-CN&text=', isDefault: false, sort: 11 },
  { id: 'kimi', name: 'Kimi', url: 'https://kimi.moonshot.cn/?q=', isDefault: false, sort: 12 },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://www.deepseek.com/search?q=', isDefault: false, sort: 13 },
]

export const useSearchEnginesStore = defineStore('searchEngines', () => {
  // 从 localStorage 加载自定义引擎
  const customEngines = ref<SearchEngine[]>(
    JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || []
  )

  // 从 localStorage 加载内置引擎 URL 覆盖
  const builtInOverrides = ref<Record<string, string>>(
    JSON.parse(localStorage.getItem(BUILT_IN_OVERRIDES_KEY) || '{}')
  )

  // 获取带覆盖的完整内置引擎列表
  const builtInEngines = computed(() => {
    return BUILT_IN_ENGINES.map(engine => ({
      ...engine,
      url: builtInOverrides.value[engine.id] || engine.url
    }))
  })

  // 如果没有自定义数据，初始化为默认列表
  const allEngines = computed(() => {
    const builtIn = builtInEngines.value
    if (customEngines.value.length === 0) {
      // 首次加载，将其他引擎迁移到自定义
      return [...builtIn, ...DEFAULT_ENGINES]
    }
    return [...builtIn, ...customEngines.value].sort((a, b) => a.sort - b.sort)
  })

  // 默认搜索引擎
  const defaultEngine = computed(() => {
    return allEngines.value.find(e => e.isDefault) || allEngines.value[0]
  })

  // 持久化自定义引擎
  function saveEngines() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customEngines.value))
  }

  // 持久化内置引擎覆盖
  function saveBuiltInOverrides() {
    localStorage.setItem(BUILT_IN_OVERRIDES_KEY, JSON.stringify(builtInOverrides.value))
  }

  // 添加引擎
  function addEngine(name: string, url: string) {
    const maxSort = customEngines.value.reduce((max, e) => Math.max(max, e.sort), 13)
    const id = `engine_${Date.now()}`
    customEngines.value.push({
      id,
      name,
      url,
      isDefault: false,
      sort: maxSort + 1
    })
    saveEngines()
    return id
  }

  // 更新自定义引擎
  function updateEngine(id: string, updates: { name?: string; url?: string }) {
    const index = customEngines.value.findIndex(e => e.id === id)
    if (index !== -1) {
      customEngines.value[index] = { ...customEngines.value[index], ...updates }
      saveEngines()
    }
  }

  // 更新内置引擎 URL
  function updateBuiltInEngineUrl(id: string, url: string) {
    if (BUILT_IN_ENGINES.some(e => e.id === id)) {
      builtInOverrides.value[id] = url
      saveBuiltInOverrides()
    }
  }

  // 删除引擎
  function deleteEngine(id: string) {
    customEngines.value = customEngines.value.filter(e => e.id !== id)
    saveEngines()
  }

  // 设置默认
  function setDefault(id: string) {
    customEngines.value.forEach(e => {
      e.isDefault = e.id === id
    })
    saveEngines()
  }

  // 移动排序
  function moveEngine(id: string, direction: 'up' | 'down') {
    const sorted = [...customEngines.value].sort((a, b) => a.sort - b.sort)
    const index = sorted.findIndex(e => e.id === id)
    
    if (direction === 'up' && index > 0) {
      const prev = sorted[index - 1]
      const prevEngine = customEngines.value.find(e => e.id === prev.id)
      const currEngine = customEngines.value.find(e => e.id === id)
      if (prevEngine && currEngine) {
        const temp = prevEngine.sort
        prevEngine.sort = currEngine.sort
        currEngine.sort = temp
      }
    } else if (direction === 'down' && index < sorted.length - 1) {
      const next = sorted[index + 1]
      const nextEngine = customEngines.value.find(e => e.id === next.id)
      const currEngine = customEngines.value.find(e => e.id === id)
      if (nextEngine && currEngine) {
        const temp = nextEngine.sort
        nextEngine.sort = currEngine.sort
        currEngine.sort = temp
      }
    }
    saveEngines()
  }

  // 能否移动
  function canMove(id: string, direction: 'up' | 'down'): boolean {
    const sorted = [...customEngines.value].sort((a, b) => a.sort - b.sort)
    const index = sorted.findIndex(e => e.id === id)
    if (direction === 'up') return index > 0
    if (direction === 'down') return index < sorted.length - 1
    return false
  }

  // 重置为默认
  function resetToDefault() {
    customEngines.value = [...DEFAULT_ENGINES]
    saveEngines()
  }

  // 导入引擎
  function importEngines(engines: SearchEngine[]) {
    customEngines.value = [...engines]
    saveEngines()
  }

  // 导出引擎 (内置 + 自定义)
  function exportEngines(): SearchEngine[] {
    return [
      ...BUILT_IN_ENGINES,
      ...(customEngines.value.length > 0 ? customEngines.value : DEFAULT_ENGINES)
    ]
  }

  return {
    customEngines,
    builtInOverrides,
    allEngines,
    builtInEngines,
    defaultEngine,
    addEngine,
    updateEngine,
    updateBuiltInEngineUrl,
    deleteEngine,
    setDefault,
    moveEngine,
    canMove,
    resetToDefault,
    importEngines,
    exportEngines
  }
})
