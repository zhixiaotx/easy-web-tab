import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { type PresetIcon, PRESET_ICONS } from '@/composables/presetIcons'

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

const STORAGE_KEY = 'user-custom-icons'

export const useIconsStore = defineStore('icons', () => {
  // Load custom icons from localStorage
  const customIcons = ref<CustomIcon[]>(
    JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  )

  // Persist to localStorage
  function saveCustomIcons() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customIcons.value))
  }

  // Merged view: presets + custom icons
  const allIcons = computed<MergedIcon[]>(() => [
    ...PRESET_ICONS,
    ...customIcons.value.map(icon => ({ ...icon, isCustom: true as const }))
  ])

  // Add new custom icon
  function addIcon(icon: Omit<CustomIcon, 'id' | 'createdAt'>): string {
    const id = `custom_icon_${Date.now()}`
    customIcons.value.push({
      ...icon,
      id,
      createdAt: new Date().toISOString()
    })
    saveCustomIcons()
    return id
  }

  // Update custom icon
  function updateIcon(id: string, updates: Partial<CustomIcon>) {
    const index = customIcons.value.findIndex(icon => icon.id === id)
    if (index !== -1) {
      customIcons.value[index] = {
        ...customIcons.value[index],
        ...updates
      }
      saveCustomIcons()
    }
  }

  // Delete custom icon
  function deleteIcon(id: string) {
    customIcons.value = customIcons.value.filter(icon => icon.id !== id)
    saveCustomIcons()
  }

  // Import icons from export data (validates version, dedup by id)
  function importIcons(data: IconExportData) {
    if (data.version !== 1) return
    for (const icon of data.icons) {
      if (!customIcons.value.find(existing => existing.id === icon.id)) {
        customIcons.value.push(icon)
      }
    }
    saveCustomIcons()
  }

  // Export custom icons
  function exportIcons(): IconExportData {
    return {
      version: 1,
      icons: [...customIcons.value],
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

  return {
    customIcons,
    allIcons,
    addIcon,
    updateIcon,
    deleteIcon,
    importIcons,
    exportIcons,
    searchIcons,
    getIconsByCategory
  }
})
