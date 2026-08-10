import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import { idbGet, idbPut, idbClear } from '@/composables/useIdb'
import {
  WORKBENCH_MENU_DEFAULT_ORDER,
  normalizeWorkbenchMenu,
  moveMenuItem,
  renameMenuLabel,
  resolveMenuItems
} from '@/composables/workbenchMenuCore'
import type { WorkbenchMenuItem } from '@/composables/workbenchMenuCore'
import type { AppSettingsData } from '@/types'

// ========================================
// 类型
// ========================================

// 弹窗标识
export type DialogId =
  | 'site'
  | 'engine'
  | 'background'
  | 'category'
  | 'backup'
  | 'icon'
  | 'notes'
  | 'wb-todo'
  | 'wb-todo-cat'
  | 'wb-notes-cat'
  | 'wb-countdown'
  | 'wb-countdown-cat'
  | 'wb-password'
  | 'wb-ledger'
  | 'wb-ledger-cat'

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
  background: { width: 800, height: 85 },
  category: { width: 900, height: 80 },
  backup: { width: 600, height: 80 },
  icon: { width: 900, height: 80 },
  notes: { width: 1000, height: 90 },
  'wb-todo': { width: 480, height: 85 },
  'wb-todo-cat': { width: 480, height: 85 },
  'wb-notes-cat': { width: 480, height: 85 },
  'wb-countdown': { width: 480, height: 85 },
  'wb-countdown-cat': { width: 440, height: 85 },
  'wb-password': { width: 520, height: 90 },
  'wb-ledger': { width: 480, height: 85 },
  'wb-ledger-cat': { width: 480, height: 85 }
}

// 弹窗中文标签
export const DIALOG_LABELS: Record<DialogId, string> = {
  site: '添加/编辑网站',
  engine: '引擎管理',
  background: '背景',
  category: '分类管理',
  backup: '备份',
  icon: '图标管理',
  notes: '便签',
  'wb-todo': '待办表单',
  'wb-todo-cat': '待办分类管理',
  'wb-notes-cat': '便签分类管理',
  'wb-countdown': '倒计时表单',
  'wb-countdown-cat': '倒计时分类管理',
  'wb-password': '密码表单',
  'wb-ledger': '记账表单',
  'wb-ledger-cat': '记账分组管理'
}

// 弹窗对应的 CSS 自定义属性名（字面量逐字等于契约表）
export const DIALOG_VARS: Record<DialogId, { widthVar: string; heightVar: string }> = {
  site: { widthVar: '--dlg-w-site', heightVar: '--dlg-h-site' },
  engine: { widthVar: '--dlg-w-engine', heightVar: '--dlg-h-engine' },
  background: { widthVar: '--dlg-w-background', heightVar: '--dlg-h-background' },
  category: { widthVar: '--dlg-w-category', heightVar: '--dlg-h-category' },
  backup: { widthVar: '--dlg-w-backup', heightVar: '--dlg-h-backup' },
  icon: { widthVar: '--dlg-w-icon', heightVar: '--dlg-h-icon' },
  notes: { widthVar: '--dlg-w-notes', heightVar: '--dlg-h-notes' },
  'wb-todo': { widthVar: '--dlg-w-wb-todo', heightVar: '--dlg-h-wb-todo' },
  'wb-todo-cat': { widthVar: '--dlg-w-wb-todo-cat', heightVar: '--dlg-h-wb-todo-cat' },
  'wb-notes-cat': { widthVar: '--dlg-w-wb-notes-cat', heightVar: '--dlg-h-wb-notes-cat' },
  'wb-countdown': { widthVar: '--dlg-w-wb-countdown', heightVar: '--dlg-h-wb-countdown' },
  'wb-countdown-cat': { widthVar: '--dlg-w-wb-countdown-cat', heightVar: '--dlg-h-wb-countdown-cat' },
  'wb-password': { widthVar: '--dlg-w-wb-password', heightVar: '--dlg-h-wb-password' },
  'wb-ledger': { widthVar: '--dlg-w-wb-ledger', heightVar: '--dlg-h-wb-ledger' },
  'wb-ledger-cat': { widthVar: '--dlg-w-wb-ledger-cat', heightVar: '--dlg-h-wb-ledger-cat' }
}

const SETTINGS_STORAGE_KEY = 'user-app-settings'

// 全部弹窗 id（全量契约遍历来源）
const DIALOG_IDS: DialogId[] = [
  'site',
  'engine',
  'background',
  'category',
  'backup',
  'icon',
  'notes',
  'wb-todo',
  'wb-todo-cat',
  'wb-notes-cat',
  'wb-countdown',
  'wb-countdown-cat',
  'wb-password',
  'wb-ledger',
  'wb-ledger-cat'
]

// 导航设置分组（弹窗尺寸设置 Tab 1）——notes 不属于导航组
export const NAV_DIALOG_IDS: DialogId[] = ['site', 'engine', 'background', 'category', 'backup', 'icon']

// 工作台设置分组（弹窗尺寸设置 Tab 2）
export const WB_DIALOG_IDS: DialogId[] = [
  'notes',
  'wb-todo',
  'wb-todo-cat',
  'wb-notes-cat',
  'wb-countdown',
  'wb-countdown-cat',
  'wb-password',
  'wb-ledger',
  'wb-ledger-cat'
]

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

// 解析原始设置记录 → 校验 + clamp 后的完整 AppSettingsData（缺失/非法字段回退默认值）
function parseSettingsData(raw: unknown): AppSettingsData {
  const out: AppSettingsData = {
    dialogSizes: {},
    buttonOpacity: 1,
    bgOpacity: 1,
    workbenchMenuOrder: [...WORKBENCH_MENU_DEFAULT_ORDER],
    workbenchMenuLabels: {}
  }
  const data = raw as Record<string, unknown>
  if (!data || typeof data !== 'object') return out
  const sizes = data.dialogSizes
  if (sizes && typeof sizes === 'object') {
    const dlg: Record<string, { width: number; height: number }> = {}
    for (const id of DIALOG_IDS) {
      const item = (sizes as Record<string, unknown>)[id]
      let width = DIALOG_DEFAULTS[id].width
      let height = DIALOG_DEFAULTS[id].height
      if (item && typeof item === 'object') {
        const size = item as Record<string, unknown>
        if (typeof size.width === 'number' && Number.isFinite(size.width)) width = clampWidth(size.width)
        if (typeof size.height === 'number' && Number.isFinite(size.height)) height = clampHeight(size.height)
      }
      dlg[id] = { width, height }
    }
    out.dialogSizes = dlg
  }
  if (typeof data.buttonOpacity === 'number' && Number.isFinite(data.buttonOpacity)) {
    out.buttonOpacity = clampOpacity(data.buttonOpacity)
  }
  if (typeof data.bgOpacity === 'number' && Number.isFinite(data.bgOpacity)) {
    out.bgOpacity = clampOpacity(data.bgOpacity)
  }
  // 工作台菜单：顺序/名称归一化（home 恒居 index 0、缺失补全、截断 12 code point），非法/缺失回退默认
  const menu = normalizeWorkbenchMenu(data.workbenchMenuOrder, data.workbenchMenuLabels)
  out.workbenchMenuOrder = menu.order
  out.workbenchMenuLabels = menu.labels
  return out
}

export const useAppSettingsStore = defineStore('app-settings', () => {
  // ========================================
  // 状态
  // ========================================
  const dialogSizes = ref<Record<DialogId, DialogSizeSetting>>(cloneDefaults())
  const buttonOpacity = ref<number>(1)
  const bgOpacity = ref<number>(1)

  // 工作台菜单顺序/名称：初始即默认序（拷贝，勿直接引用只读常量），杜绝空菜单闪屏
  const workbenchMenuOrder = ref<string[]>([...WORKBENCH_MENU_DEFAULT_ORDER])
  const workbenchMenuLabels = ref<Record<string, string>>({})

  // ========================================
  // 持久化
  // ========================================
  function persist() {
    // toRaw：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError）。
    // 嵌套 reactive 记录必须逐字段 toRaw（对新建外层对象整体 toRaw 是 no-op）
    void idbPut('settings', toRaw({
      dialogSizes: toRaw(dialogSizes.value),
      buttonOpacity: buttonOpacity.value,
      bgOpacity: bgOpacity.value,
      workbenchMenuOrder: toRaw(workbenchMenuOrder.value),
      workbenchMenuLabels: toRaw(workbenchMenuLabels.value)
    })).catch(() => {
      // IDB 写入失败静默忽略（fire-and-forget，不抛错）
    })
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
  // 初始化：优先读 IndexedDB，空时尝试从 localStorage 快照一次性非破坏迁移；
  // 逐项校验类型并 clamp，损坏/非法数据/IDB 失败静默回退默认（不抛错）
  // ========================================
  async function initSettings(): Promise<void> {
    // 1. 优先读 IndexedDB（IDB 失败 → undefined，走下方迁移/默认回退）
    let stored: AppSettingsData | undefined
    try {
      stored = await idbGet<AppSettingsData>('settings')
    } catch {
      stored = undefined
    }
    // 2. 一次性非破坏迁移：IDB 空且 localStorage 有遗留快照 → 解析校验后写入 IDB
    //    （localStorage 不删不写，仅作为迁移来源；写入失败静默回退默认）
    let migrated: AppSettingsData | undefined
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (stored === undefined && saved) {
      try {
        migrated = parseSettingsData(JSON.parse(saved))
        await idbPut('settings', toRaw(migrated))
      } catch {
        migrated = undefined
      }
    }
    // 3. 生效来源：IDB 优先，其次 localStorage 迁移结果；缺失/非法字段保持默认值。
    //    菜单两字段在应用前必经 normalizeWorkbenchMenu（两条来源统一归一化，home 恒居 index 0）
    const effective = stored ?? migrated
    if (effective) {
      const menu = normalizeWorkbenchMenu(effective.workbenchMenuOrder, effective.workbenchMenuLabels)
      workbenchMenuOrder.value = menu.order
      workbenchMenuLabels.value = menu.labels
      for (const id of DIALOG_IDS) {
        const size = effective.dialogSizes[id]
        if (size) {
          if (Number.isFinite(size.width)) dialogSizes.value[id].width = clampWidth(size.width)
          if (Number.isFinite(size.height)) dialogSizes.value[id].height = clampHeight(size.height)
        }
      }
      if (Number.isFinite(effective.buttonOpacity)) buttonOpacity.value = clampOpacity(effective.buttonOpacity)
      if (Number.isFinite(effective.bgOpacity)) bgOpacity.value = clampOpacity(effective.bgOpacity)
      // 归一化结果写回 IDB（fire-and-forget）：保证导出/导入往返幂等，镜像迁移分支的 idbPut
      persist()
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
  // 恢复默认：还原状态 → 移除全部弹窗 CSS 变量（不 set 默认值）→ 清除存储（IDB + localStorage 快照）
  // ========================================
  function resetDefaults() {
    dialogSizes.value = cloneDefaults()
    buttonOpacity.value = 1
    bgOpacity.value = 1
    workbenchMenuOrder.value = [...WORKBENCH_MENU_DEFAULT_ORDER]
    workbenchMenuLabels.value = {}
    const root = document.documentElement
    for (const id of DIALOG_IDS) {
      root.style.removeProperty(DIALOG_VARS[id].widthVar)
      root.style.removeProperty(DIALOG_VARS[id].heightVar)
    }
    root.style.removeProperty('--ui-btn-opacity')
    root.style.removeProperty('--app-bg-opacity')
    void idbClear('settings').catch(() => {
      // IDB 清除失败静默忽略（不抛错）
    })
    localStorage.removeItem(SETTINGS_STORAGE_KEY)
  }

  // ========================================
  // 工作台菜单：变更函数全部委托 core（禁止内联排序/截断公式）→ 持久化
  // ========================================
  function moveWorkbenchMenuItem(
    key: string,
    dir: 'up' | 'down'
  ): { ok: boolean; reason: 'locked' | 'boundary' | 'not-found' | 'ok' } {
    const r = moveMenuItem(toRaw(workbenchMenuOrder.value), key, dir)
    if (r.ok && r.order) {
      workbenchMenuOrder.value = r.order
      persist()
    }
    return { ok: r.ok, reason: r.reason }
  }

  function renameWorkbenchMenuItem(
    key: string,
    name: string
  ): { ok: boolean; reason: 'empty' | 'not-found' | 'ok' } {
    const r = renameMenuLabel(toRaw(workbenchMenuLabels.value), key, name)
    if (r.ok && r.labels) {
      workbenchMenuLabels.value = r.labels
      persist()
    }
    return { ok: r.ok, reason: r.reason }
  }

  function resetWorkbenchMenu(): { ok: boolean; reason: 'ok' } {
    // 区块级恢复默认：只重置菜单两字段，不触碰 dialogSizes/opacity/CSS 变量，不调用 resetDefaults
    workbenchMenuOrder.value = [...WORKBENCH_MENU_DEFAULT_ORDER]
    workbenchMenuLabels.value = {}
    persist()
    return { ok: true, reason: 'ok' as const }
  }

  // 菜单渲染项（label 回退默认名，icon 查表）——默认态恒 7 项、home 首位
  const workbenchMenuItems = computed<WorkbenchMenuItem[]>(() =>
    resolveMenuItems(workbenchMenuOrder.value, workbenchMenuLabels.value)
  )

  return {
    dialogSizes,
    buttonOpacity,
    bgOpacity,
    workbenchMenuOrder,
    workbenchMenuLabels,
    workbenchMenuItems,
    initSettings,
    applySettings,
    setDialogSize,
    setButtonOpacity,
    setBgOpacity,
    resetDefaults,
    moveWorkbenchMenuItem,
    renameWorkbenchMenuItem,
    resetWorkbenchMenu
  }
})
