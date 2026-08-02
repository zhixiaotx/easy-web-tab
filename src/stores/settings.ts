import { defineStore } from 'pinia'
import { ref } from 'vue'

// ========================================
// 类型
// ========================================

// 弹窗标识
export type DialogId = 'site' | 'engine' | 'countdown' | 'password' | 'background' | 'category' | 'backup' | 'icon'

// 弹窗尺寸设置（width 单位 px，height 单位 vh）
export interface DialogSizeSetting {
  width: number // px, clamp 400-1600
  height: number // vh, clamp 30-100
}

// ========================================
// 契约常量（契约表，禁止偏离）
// ========================================

// 弹窗默认尺寸
export const DIALOG_DEFAULTS: Record<DialogId, DialogSizeSetting> = {
  site: { width: 864, height: 90 },
  engine: { width: 700, height: 80 },
  countdown: { width: 640, height: 80 },
  password: { width: 700, height: 80 },
  background: { width: 800, height: 85 },
  category: { width: 900, height: 80 },
  backup: { width: 600, height: 80 },
  icon: { width: 900, height: 80 }
}

// 弹窗中文标签
export const DIALOG_LABELS: Record<DialogId, string> = {
  site: '添加/编辑网站',
  engine: '引擎管理',
  countdown: '倒计时',
  password: '密码管理',
  background: '背景',
  category: '分类管理',
  backup: '备份',
  icon: '图标管理'
}

// 弹窗对应的 CSS 自定义属性名（字面量逐字等于契约表）
export const DIALOG_VARS: Record<DialogId, { widthVar: string; heightVar: string }> = {
  site: { widthVar: '--dlg-w-site', heightVar: '--dlg-h-site' },
  engine: { widthVar: '--dlg-w-engine', heightVar: '--dlg-h-engine' },
  countdown: { widthVar: '--dlg-w-countdown', heightVar: '--dlg-h-countdown' },
  password: { widthVar: '--dlg-w-password', heightVar: '--dlg-h-password' },
  background: { widthVar: '--dlg-w-background', heightVar: '--dlg-h-background' },
  category: { widthVar: '--dlg-w-category', heightVar: '--dlg-h-category' },
  backup: { widthVar: '--dlg-w-backup', heightVar: '--dlg-h-backup' },
  icon: { widthVar: '--dlg-w-icon', heightVar: '--dlg-h-icon' }
}

const SETTINGS_STORAGE_KEY = 'user-app-settings'

const DIALOG_IDS: DialogId[] = ['site', 'engine', 'countdown', 'password', 'background', 'category', 'backup', 'icon']

// 取值范围 clamp
const clampWidth = (n: number) => Math.min(1600, Math.max(400, n))
const clampHeight = (n: number) => Math.min(100, Math.max(30, n))
const clampOpacity = (n: number) => Math.min(1, Math.max(0.1, n))

// 深拷贝默认尺寸
const cloneDefaults = (): Record<DialogId, DialogSizeSetting> => {
  const sizes = {} as Record<DialogId, DialogSizeSetting>
  for (const id of DIALOG_IDS) {
    sizes[id] = { ...DIALOG_DEFAULTS[id] }
  }
  return sizes
}

export const useAppSettingsStore = defineStore('app-settings', () => {
  // ========================================
  // 状态
  // ========================================
  const dialogSizes = ref<Record<DialogId, DialogSizeSetting>>(cloneDefaults())
  const buttonOpacity = ref<number>(1)
  const bgOpacity = ref<number>(1)

  // ========================================
  // 持久化
  // ========================================
  function persist() {
    const data = {
      dialogSizes: dialogSizes.value,
      buttonOpacity: buttonOpacity.value,
      bgOpacity: bgOpacity.value
    }
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(data))
  }

  // ========================================
  // 应用到 document（仅当值 ≠ 默认时才 setProperty，
  // 等于默认则移除该属性，让 CSS 回退含 @media 生效，保证未配置/回默认时小屏一致）
  // ========================================
  function applySettings() {
    const root = document.documentElement
    for (const id of DIALOG_IDS) {
      const size = dialogSizes.value[id]
      const { widthVar, heightVar } = DIALOG_VARS[id]
      if (size.width !== DIALOG_DEFAULTS[id].width) {
        root.style.setProperty(widthVar, `${size.width}px`)
      } else {
        root.style.removeProperty(widthVar)
      }
      if (size.height !== DIALOG_DEFAULTS[id].height) {
        root.style.setProperty(heightVar, `${size.height}vh`)
      } else {
        root.style.removeProperty(heightVar)
      }
    }
    if (buttonOpacity.value !== 1) {
      root.style.setProperty('--ui-btn-opacity', String(buttonOpacity.value))
    } else {
      root.style.removeProperty('--ui-btn-opacity')
    }
    if (bgOpacity.value !== 1) {
      root.style.setProperty('--app-bg-opacity', String(bgOpacity.value))
    } else {
      root.style.removeProperty('--app-bg-opacity')
    }
  }

  // ========================================
  // 初始化：解析 localStorage，逐项校验类型并 clamp，
  // 损坏/非法 JSON 静默回退默认（不抛错）
  // ========================================
  function initSettings() {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (saved) {
      try {
        const data = JSON.parse(saved) as Record<string, unknown>
        if (data && typeof data === 'object') {
          const sizes = data.dialogSizes
          if (sizes && typeof sizes === 'object') {
            for (const id of DIALOG_IDS) {
              const item = (sizes as Record<string, unknown>)[id]
              if (item && typeof item === 'object') {
                const size = item as Record<string, unknown>
                if (typeof size.width === 'number' && Number.isFinite(size.width)) {
                  dialogSizes.value[id].width = clampWidth(size.width)
                }
                if (typeof size.height === 'number' && Number.isFinite(size.height)) {
                  dialogSizes.value[id].height = clampHeight(size.height)
                }
              }
            }
          }
          if (typeof data.buttonOpacity === 'number' && Number.isFinite(data.buttonOpacity)) {
            buttonOpacity.value = clampOpacity(data.buttonOpacity)
          }
          if (typeof data.bgOpacity === 'number' && Number.isFinite(data.bgOpacity)) {
            bgOpacity.value = clampOpacity(data.bgOpacity)
          }
        }
      } catch {
        // 损坏 JSON → 保持默认值，不抛错
      }
    }
    applySettings()
  }

  // ========================================
  // Setters：clamp → 更新状态 → applySettings → persist
  // ========================================
  function setDialogSize(id: DialogId, width: number, height: number) {
    dialogSizes.value[id].width = clampWidth(width)
    dialogSizes.value[id].height = clampHeight(height)
    applySettings()
    persist()
  }

  function setButtonOpacity(n: number) {
    buttonOpacity.value = clampOpacity(n)
    applySettings()
    persist()
  }

  function setBgOpacity(n: number) {
    bgOpacity.value = clampOpacity(n)
    applySettings()
    persist()
  }

  // ========================================
  // 恢复默认：还原状态 → 移除全部 18 个 CSS 变量（不 set 默认值）→ 清除存储
  // ========================================
  function resetDefaults() {
    dialogSizes.value = cloneDefaults()
    buttonOpacity.value = 1
    bgOpacity.value = 1
    const root = document.documentElement
    for (const id of DIALOG_IDS) {
      root.style.removeProperty(DIALOG_VARS[id].widthVar)
      root.style.removeProperty(DIALOG_VARS[id].heightVar)
    }
    root.style.removeProperty('--ui-btn-opacity')
    root.style.removeProperty('--app-bg-opacity')
    localStorage.removeItem(SETTINGS_STORAGE_KEY)
  }

  return {
    dialogSizes,
    buttonOpacity,
    bgOpacity,
    initSettings,
    applySettings,
    setDialogSize,
    setButtonOpacity,
    setBgOpacity,
    resetDefaults
  }
})
