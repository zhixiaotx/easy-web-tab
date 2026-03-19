import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'user-theme'

export const useThemeStore = defineStore('theme', () => {
  // 初始化主题
  const initTheme = () => {
    // 1. 先从 localStorage 读取
    const saved = localStorage.getItem(STORAGE_KEY)
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
    localStorage.setItem(STORAGE_KEY, theme.value)
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
      if (!localStorage.getItem(STORAGE_KEY)) {
        theme.value = e.matches ? 'dark' : 'light'
        applyTheme()
      }
    })
  }

  return {
    theme,
    initTheme,
    toggleTheme,
    applyTheme
  }
})
