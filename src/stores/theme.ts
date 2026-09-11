import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { markDirty } from '@/composables/useCloudSync'

const THEME_STORAGE_KEY = 'user-theme'
const BG_STORAGE_KEY = 'user-background'

// 背景类型
export type BackgroundType = 'none' | 'solid' | 'gradient' | 'image'

// 自定义背景接口
export interface CustomBackground {
  id: string
  type: BackgroundType
  value: string // 颜色值/渐变值/图片URL
  name: string
}

// ========================================
// 多主题皮肤：外观模式(mode) × 强调色(accent)
// data-accent 驱动主色系（themes.css），html.dark 驱动明度（dark.css）
// ========================================
export type ThemeAccent = 'blue' | 'brown' | 'pink' | 'green' | 'purple' | 'red' | 'gray'

export interface ThemeDef {
  id: string
  name: string
  mode: 'light' | 'dark'
  accent: ThemeAccent | null // null = 跟随系统时用默认蓝
  system?: boolean
}

export const THEMES: ThemeDef[] = [
  { id: 'light-blue', name: '浅色·蓝', mode: 'light', accent: 'blue' },
  { id: 'dark-blue', name: '暗黑·蓝', mode: 'dark', accent: 'blue' },
  { id: 'eye', name: '护眼·米黄', mode: 'light', accent: 'brown' },
  { id: 'pink', name: '樱粉·浅', mode: 'light', accent: 'pink' },
  { id: 'purple', name: '科技紫·深', mode: 'dark', accent: 'purple' },
  { id: 'lime', name: '青柠·浅', mode: 'light', accent: 'green' },
  { id: 'china-red', name: '中国红·浅', mode: 'light', accent: 'red' },
  { id: 'morandi', name: '莫兰迪·灰', mode: 'light', accent: 'gray' },
  { id: 'system', name: '跟随系统', mode: 'light', accent: null, system: true },
]

const DEFAULT_THEME_ID = 'light-blue'

export const useThemeStore = defineStore('theme', () => {
  // ========================================
  // 主题相关
  // ========================================
  const currentThemeId = ref<string>(DEFAULT_THEME_ID)

  // 系统明暗偏好（仅 system 主题使用）
  const systemPrefersDark = ref(false)
  const updateSystemPrefers = () => {
    systemPrefersDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  // 解析当前主题定义
  const currentTheme = computed<ThemeDef>(() => {
    return THEMES.find(t => t.id === currentThemeId.value) ?? THEMES[0]
  })

  // 兼容性输出：当前外观模式 light/dark（供 ECharts 等 isDark 逻辑使用）
  const theme = computed<'light' | 'dark'>(() => {
    const t = currentTheme.value
    if (t.system) return systemPrefersDark.value ? 'dark' : 'light'
    return t.mode
  })

  // 当前强调色
  const accent = computed<ThemeAccent>(() => {
    const t = currentTheme.value
    if (t.accent) return t.accent
    return 'blue'
  })

  // 应用主题到 document
  function applyTheme() {
    const root = document.documentElement
    root.classList.toggle('dark', theme.value === 'dark')
    root.setAttribute('data-accent', accent.value)
    root.setAttribute('data-theme', currentThemeId.value)
  }

  // 初始化主题
  const initTheme = () => {
    updateSystemPrefers()
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved && THEMES.some(t => t.id === saved)) {
      currentThemeId.value = saved
    } else if (saved === 'light' || saved === 'dark') {
      // 兼容旧版只存 light/dark 的情况
      currentThemeId.value = saved === 'dark' ? 'dark-blue' : 'light-blue'
    } else {
      // 无保存过：跟随系统
      currentThemeId.value = 'system'
    }
    applyTheme()
  }

  // 设置指定主题
  function setTheme(id: string) {
    if (!THEMES.some(t => t.id === id)) return
    currentThemeId.value = id
    localStorage.setItem(THEME_STORAGE_KEY, id)
    markDirty()
    applyTheme()
  }

  // 跟随系统
  function setSystem() {
    setTheme('system')
  }

  // 循环切换（供 ⌘D / Ctrl+D 快捷键）
  function toggleTheme() {
    const idx = THEMES.findIndex(t => t.id === currentThemeId.value)
    const next = THEMES[(idx + 1) % THEMES.length]
    setTheme(next.id)
  }

  // 监听系统主题变化（system 主题实时跟随）
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      systemPrefersDark.value = e.matches
      if (currentTheme.value.system) applyTheme()
    })
  }

  // ========================================
  // 背景相关
  // ========================================

  // 背景类型
  const backgroundType = ref<BackgroundType>('none')
  // 背景值（颜色值/渐变值/图片URL）
  const backgroundValue = ref<string>('')
  // 内容区域透明度（仅图片背景生效，0-1，默认 1 = 完全不透明）
  const backgroundOpacity = ref<number>(1)
  // 用户自定义背景列表
  const customBackgrounds = ref<CustomBackground[]>([])

  // 预设背景列表
  const presetBackgrounds: CustomBackground[] = [
    // 渐变预设
    { id: 'preset-1', type: 'gradient', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', name: '紫色渐变' },
    { id: 'preset-2', type: 'gradient', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', name: '粉色渐变' },
    { id: 'preset-3', type: 'gradient', value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', name: '蓝色渐变' },
    { id: 'preset-4', type: 'gradient', value: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', name: '绿色渐变' },
    { id: 'preset-5', type: 'gradient', value: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', name: '日落渐变' },
    // 图片预设 (使用 Unsplash 免费图片)
    { id: 'image-1', type: 'image', value: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80', name: '山脉日出' },
    { id: 'image-2', type: 'image', value: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&q=80', name: '森林晨雾' },
    { id: 'image-3', type: 'image', value: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1920&q=80', name: '湖光山色' },
    { id: 'image-4', type: 'image', value: 'https://images.unsplash.com/photo-1518173946687-a4c036bc1e0b?w=1920&q=80', name: '夜空星河' },
    { id: 'image-5', type: 'image', value: 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=1920&q=80', name: '海滩日落' },
    // 本地背景图片（来自 Lorem Picsum / Unsplash）
    { id: 'img-0', type: 'image', value: '/backgrounds/bg0.jpg', name: '背景 1' },
    { id: 'img-1', type: 'image', value: '/backgrounds/bg1.jpg', name: '背景 2' },
    { id: 'img-2', type: 'image', value: '/backgrounds/bg2.jpg', name: '背景 3' },
    { id: 'img-3', type: 'image', value: '/backgrounds/bg3.jpg', name: '背景 4' },
    { id: 'img-4', type: 'image', value: '/backgrounds/bg4.jpg', name: '背景 5' },
    { id: 'img-5', type: 'image', value: '/backgrounds/bg5.jpg', name: '背景 6' },
    { id: 'img-6', type: 'image', value: '/backgrounds/bg6.jpg', name: '背景 7' },
    { id: 'img-7', type: 'image', value: '/backgrounds/bg7.jpg', name: '背景 8' },
    { id: 'img-8', type: 'image', value: '/backgrounds/bg8.jpg', name: '背景 9' },
    { id: 'img-9', type: 'image', value: '/backgrounds/bg9.jpg', name: '背景 10' },
    { id: 'img-10', type: 'image', value: '/backgrounds/bg10.jpg', name: '背景 11' },
    { id: 'img-11', type: 'image', value: '/backgrounds/bg11.jpg', name: '背景 12' },
    { id: 'img-12', type: 'image', value: '/backgrounds/bg12.jpg', name: '背景 13' },
    { id: 'img-13', type: 'image', value: '/backgrounds/bg13.jpg', name: '背景 14' },
    { id: 'img-14', type: 'image', value: '/backgrounds/bg14.jpg', name: '背景 15' },
    { id: 'img-15', type: 'image', value: '/backgrounds/bg15.jpg', name: '背景 16' },
    { id: 'img-16', type: 'image', value: '/backgrounds/bg16.jpg', name: '背景 17' },
    { id: 'img-17', type: 'image', value: '/backgrounds/bg17.jpg', name: '背景 18' },
    { id: 'img-18', type: 'image', value: '/backgrounds/bg18.jpg', name: '背景 19' },
    { id: 'img-19', type: 'image', value: '/backgrounds/bg19.jpg', name: '背景 20' },
    { id: 'img-20', type: 'image', value: '/backgrounds/bg20.jpg', name: '背景 21' },
    { id: 'img-21', type: 'image', value: '/backgrounds/bg21.jpg', name: '背景 22' },
    { id: 'img-22', type: 'image', value: '/backgrounds/bg22.jpg', name: '背景 23' },
    { id: 'img-23', type: 'image', value: '/backgrounds/bg23.jpg', name: '背景 24' },
    { id: 'img-24', type: 'image', value: '/backgrounds/bg24.jpg', name: '背景 25' },
    { id: 'img-25', type: 'image', value: '/backgrounds/bg25.jpg', name: '背景 26' },
    { id: 'img-26', type: 'image', value: '/backgrounds/bg26.jpg', name: '背景 27' },
    { id: 'img-27', type: 'image', value: '/backgrounds/bg27.jpg', name: '背景 28' },
    { id: 'img-28', type: 'image', value: '/backgrounds/bg28.jpg', name: '背景 29' },
    { id: 'img-29', type: 'image', value: '/backgrounds/bg29.jpg', name: '背景 30' },
  ]

  // 初始化背景
  const initBackground = () => {
    // 从 localStorage 读取背景设置
    const saved = localStorage.getItem(BG_STORAGE_KEY)
    if (saved) {
      try {
        const data = JSON.parse(saved)
        backgroundType.value = data.type || 'none'
        backgroundValue.value = data.value || ''
        backgroundOpacity.value = typeof data.opacity === 'number' ? data.opacity : 1
        customBackgrounds.value = data.customs || []
      } catch (e) {
        console.error('Failed to parse background settings:', e)
      }
    }
    applyBackground()
  }

  // 保存背景设置到 localStorage
  function saveBackgroundSettings() {
    const data = {
      type: backgroundType.value,
      value: backgroundValue.value,
      opacity: backgroundOpacity.value,
      customs: customBackgrounds.value
    }
    localStorage.setItem(BG_STORAGE_KEY, JSON.stringify(data))
    markDirty()
  }

  // 应用背景到 DOM
  function applyBackground() {
    const root = document.documentElement
    const body = document.body
    const app = document.getElementById('app')

    if (backgroundType.value === 'none' || !backgroundValue.value) {
      root.style.removeProperty('--app-bg-type')
      root.style.removeProperty('--app-bg-value')
      root.style.removeProperty('--app-bg-image')
      root.style.removeProperty('--app-content-opacity')
      root.classList.remove('app-has-background')
      root.classList.remove('image')
      body.classList.remove('app-has-background')
      body.classList.remove('image')
      if (app) {
        app.classList.remove('app-has-background')
        app.classList.remove('image')
      }
      return
    }

    root.style.setProperty('--app-bg-type', backgroundType.value)
    root.style.setProperty('--app-bg-value', backgroundValue.value)
    root.style.setProperty('--app-content-opacity', String(backgroundOpacity.value))

    // 同时添加到 html、body 和 #app
    root.classList.add('app-has-background')
    body.classList.add('app-has-background')
    if (app) {
      app.classList.add('app-has-background')
    }

    if (backgroundType.value === 'image') {
      root.style.setProperty('--app-bg-image', `url(${backgroundValue.value})`)
      root.classList.add('image')
      body.classList.add('image')
      if (app) {
        app.classList.add('image')
      }
    } else {
      root.style.removeProperty('--app-bg-image')
      root.style.removeProperty('--app-content-opacity')
      root.classList.remove('image')
      body.classList.remove('image')
      if (app) {
        app.classList.remove('image')
      }
    }
  }

  // 设置背景
  function setBackground(type: BackgroundType, value: string) {
    backgroundType.value = type
    backgroundValue.value = value
    saveBackgroundSettings()
    applyBackground()
  }

  // 设置内容区域透明度（仅图片背景生效，实时预览用）
  function setBackgroundOpacity(opacity: number) {
    backgroundOpacity.value = Math.min(1, Math.max(0, opacity))
    saveBackgroundSettings()
    applyBackground()
  }

  // 添加自定义背景
  function addCustomBackground(background: Omit<CustomBackground, 'id'>) {
    const newBackground: CustomBackground = {
      ...background,
      id: `custom-${Date.now()}`
    }
    customBackgrounds.value.push(newBackground)
    saveBackgroundSettings()
  }

  // 删除自定义背景
  function removeCustomBackground(id: string) {
    const index = customBackgrounds.value.findIndex(b => b.id === id)
    if (index !== -1) {
      customBackgrounds.value.splice(index, 1)
      saveBackgroundSettings()
    }
  }

  // 清除背景
  function clearBackground() {
    backgroundType.value = 'none'
    backgroundValue.value = ''
    saveBackgroundSettings()
    applyBackground()
  }

  // 监听背景变化
  watch([backgroundType, backgroundValue], () => {
    applyBackground()
  })

  return {
    // 主题相关
    theme,
    currentThemeId,
    currentTheme,
    accent,
    themes: THEMES,
    initTheme,
    setTheme,
    setSystem,
    toggleTheme,
    applyTheme,
    // 背景相关
    backgroundType,
    backgroundValue,
    backgroundOpacity,
    customBackgrounds,
    presetBackgrounds,
    initBackground,
    setBackground,
    setBackgroundOpacity,
    addCustomBackground,
    removeCustomBackground,
    clearBackground,
    applyBackground
  }
})
