import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

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

export const useThemeStore = defineStore('theme', () => {
  // ========================================
  // 主题相关
  // ========================================
  
  // 初始化主题
  const initTheme = () => {
    // 1. 先从 localStorage 读取
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved) {
      theme.value = saved as 'light' | 'dark'
    } else {
      // 2. 没有保存过，检查系统偏好
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      theme.value = prefersDark ? 'dark' : 'light'
    }
    applyTheme()
  }

  // 主题状态
  const theme = ref<'light' | 'dark'>('light')

  // 应用主题到 document
  function applyTheme() {
    if (theme.value === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  // 切换主题
  function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    localStorage.setItem(THEME_STORAGE_KEY, theme.value)
    applyTheme()
  }

  // 监听主题变化
  watch(theme, () => {
    applyTheme()
  })

  // 监听系统主题变化
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // 只有用户没有手动设置过主题时才跟随系统
      if (!localStorage.getItem(THEME_STORAGE_KEY)) {
        theme.value = e.matches ? 'dark' : 'light'
        applyTheme()
      }
    })
  }

  // ========================================
  // 背景相关
  // ========================================

  // 背景类型
  const backgroundType = ref<BackgroundType>('none')
  // 背景值（颜色值/渐变值/图片URL）
  const backgroundValue = ref<string>('')
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
      customs: customBackgrounds.value
    }
    localStorage.setItem(BG_STORAGE_KEY, JSON.stringify(data))
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
    initTheme,
    toggleTheme,
    applyTheme,
    // 背景相关
    backgroundType,
    backgroundValue,
    customBackgrounds,
    presetBackgrounds,
    initBackground,
    setBackground,
    addCustomBackground,
    removeCustomBackground,
    clearBackground,
    applyBackground
  }
})
