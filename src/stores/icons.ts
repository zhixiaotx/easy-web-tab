import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { type PresetIcon, PRESET_ICONS } from '@/composables/presetIcons'
import { idbGet, idbPut, ICONS_STORAGE_KEY, migrateIconsFromLocalStorageIfNeeded } from '@/composables/useIdb'

export interface CustomIcon {
  id: string
  name: string
  label: string
  dataUrl: string
  category: string
  createdAt: string
}

export type MergedIcon = PresetIcon | (CustomIcon & { isCustom: true })

export interface IconExportData {
  version: 1
  icons: CustomIcon[]
  exportedAt: string
}

/** localStorage 旧迁移 key（已不再使用；仅首次迁移时读取、迁移后删除） */
const LEGACY_STORAGE_KEY = ICONS_STORAGE_KEY

export const useIconsStore = defineStore('icons', () => {
  // 先给空数组；初始化异步完成后会被真正数据替换（防止 SSR/首屏未就绪时报错）
  const customIcons = ref<CustomIcon[]>([])

  // 初始化 Promise：对外暴露 await 点，供云同步等场景确保加载完再读
  let initPromise: Promise<void> | null = null
  // 是否已完成初始化
  let initialized = false

  async function loadFromIdbAndMigrate(): Promise<void> {
    try {
      // 1) 先尝试 localStorage → IDB 一次性迁移（幂等；仅 IDB 空且 localStorage 有旧数据时执行）
      await migrateIconsFromLocalStorageIfNeeded()
      // 2) 再从 IDB 读取
      const raw = await idbGet<CustomIcon[]>('icons')
      if (Array.isArray(raw)) {
        customIcons.value = raw
      } else {
        customIcons.value = []
      }
    } catch (e) {
      // IDB 彻底不可用时的最后兜底：直接读取 localStorage 旧键到内存（仅内存态，不写回）
      console.warn('[icons] IDB 不可用，降级 localStorage 读取：', e)
      try {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
        customIcons.value = legacy ? (JSON.parse(legacy) as CustomIcon[]) : []
      } catch { customIcons.value = [] }
    } finally {
      initialized = true
    }
  }

  /** 初始化（幂等；多次调用返回同一个 Promise） */
  function ensureLoaded(): Promise<void> {
    if (initPromise) return initPromise
    initPromise = loadFromIdbAndMigrate()
    return initPromise
  }

  // 立即启动初始化（组件首次 useIconsStore 时自动触发）
  ensureLoaded().catch((e) => console.warn('[icons] 初始化失败：', e))

  // 持久化到 IDB
  async function saveCustomIcons(): Promise<void> {
    // 初始化未完成时也允许写入（直接用当前内存值）
    // JSON.parse(JSON.stringify()) 深拷贝剥离 Vue reactive Proxy，否则 IDB 结构化克隆报 DataCloneError
    await idbPut('icons', JSON.parse(JSON.stringify(customIcons.value)))
    // 迁移期过渡双写：localStorage 也写一份（失败忽略）
    try { localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(customIcons.value)) } catch { /* ignore */ }
  }

  // Merged view: presets + custom icons
  const allIcons = computed<MergedIcon[]>(() => [
    ...PRESET_ICONS,
    ...customIcons.value.map(icon => ({ ...icon, isCustom: true as const }))
  ])

  // Add new custom icon
  async function addIcon(icon: Omit<CustomIcon, 'id' | 'createdAt'>): Promise<string> {
    const id = `custom_icon_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`
    const entry: CustomIcon = {
      ...icon,
      id,
      createdAt: new Date().toISOString()
    }
    customIcons.value.push(entry)
    // 先改内存（UI 立刻显示）→ 再持久化；失败时回滚内存，避免"假成功"
    try {
      await saveCustomIcons()
    } catch (e) {
      customIcons.value = customIcons.value.filter(i => i.id !== id)
      throw e
    }
    return id
  }

  // Update custom icon
  async function updateIcon(id: string, updates: Partial<CustomIcon>): Promise<void> {
    const idx = customIcons.value.findIndex(icon => icon.id === id)
    if (idx === -1) return
    const prev = { ...customIcons.value[idx] }
    customIcons.value[idx] = { ...prev, ...updates }
    try {
      await saveCustomIcons()
    } catch (e) {
      customIcons.value[idx] = prev
      throw e
    }
  }

  // Delete custom icon
  async function deleteIcon(id: string): Promise<void> {
    const prev = customIcons.value.slice()
    customIcons.value = customIcons.value.filter(icon => icon.id !== id)
    try {
      await saveCustomIcons()
    } catch (e) {
      customIcons.value = prev
      throw e
    }
  }

  /**
   * 从导出数据导入图标（按 id 去重合并）。
   * 正确顺序：先计算要合并的结果 → 持久化成功 → 再更新内存。
   * 失败时内存不变，避免 UI"假成功"且刷新消失。
   * 返回 { added }: 实际新增的数量
   */
  async function importIcons(data: IconExportData): Promise<{ added: number }> {
    if (data.version !== 1 || !Array.isArray(data.icons)) {
      throw new Error('导入文件格式不正确：version 或 icons 字段缺失')
    }
    const existingIds = new Set(customIcons.value.map(i => i.id))
    const toAdd: CustomIcon[] = []
    for (const icon of data.icons) {
      if (icon && typeof icon === 'object' && typeof icon.id === 'string' && !existingIds.has(icon.id)) {
        toAdd.push(icon)
        existingIds.add(icon.id)
      }
    }
    if (toAdd.length === 0) return { added: 0 }
    const next = [...customIcons.value, ...toAdd]
    // 先持久化，成功后再替换内存（避免"假成功"）
    // JSON.parse(JSON.stringify()) 深拷贝剥离 Vue reactive Proxy，否则 IDB 结构化克隆报 DataCloneError
    await idbPut('icons', JSON.parse(JSON.stringify(next)))
    try { localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    customIcons.value = next
    return { added: toAdd.length }
  }

  // Export custom icons
  function exportIcons(): IconExportData {
    return {
      version: 1,
      icons: JSON.parse(JSON.stringify(customIcons.value)) as CustomIcon[],
      exportedAt: new Date().toISOString()
    }
  }

  // Search across all icons (preset + custom) by name/label
  function searchIcons(query: string): MergedIcon[] {
    const lower = query.toLowerCase()
    return allIcons.value.filter(icon =>
      icon.name.toLowerCase().includes(lower) ||
      icon.label.toLowerCase().includes(lower)
    )
  }

  // Filter icons by category
  function getIconsByCategory(category: string): MergedIcon[] {
    return allIcons.value.filter(icon => icon.category === category)
  }

  /**
   * 云同步 icons.json 拉取后从 IDB 重新加载（不弹 toast，纯刷新）。
   * 云同步 importIconsData 已写入 IDB，这里只负责让内存 ref 反映最新值。
   */
  async function reloadCustomIcons(): Promise<void> {
    try {
      const raw = await idbGet<CustomIcon[]>('icons')
      customIcons.value = Array.isArray(raw) ? raw : []
    } catch (e) {
      console.warn('[icons] reloadCustomIcons 失败：', e)
    }
  }

  /** 初始化是否完成（用于测试/调试；正常流程不需调用） */
  function isInitialized(): boolean { return initialized }

  return {
    customIcons,
    allIcons,
    ensureLoaded,
    isInitialized,
    addIcon,
    updateIcon,
    deleteIcon,
    importIcons,
    exportIcons,
    searchIcons,
    getIconsByCategory,
    reloadCustomIcons
  }
})
