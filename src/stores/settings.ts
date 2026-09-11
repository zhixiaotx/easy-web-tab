import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import { idbGet, idbPut, idbClear } from '@/composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'
import {
  WORKBENCH_MENU_DEFAULT_ORDER,
  WORKBENCH_MENU_KEYS,
  normalizeWorkbenchMenu,
  normalizeWorkbenchMenuVisibility,
  moveMenuItem,
  renameMenuLabel,
  resolveMenuItems
} from '@/composables/workbenchMenuCore'
import type { WorkbenchMenuItem, WorkbenchMenuVisibility } from '@/composables/workbenchMenuCore'
import type { AppSettingsData, HomeCardLayout } from '@/types'

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

// 站点外观 localStorage 键（浏览器标签标题 + favicon；进 nav.json prefs 云同步白名单）
const SITE_TITLE_KEY = 'site-title'
const SITE_FAVICON_KEY = 'site-favicon'

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

// 销售记账工作台合法模块键（用于 businessActiveSection 校验与持久化；缺失/非法回退首页）
export const BUSINESS_SECTION_KEYS = [
  'home',
  'products',
  'purchases',
  'daily',
  'expenses',
  'inventory',
  'stats'
] as const
const BUSINESS_SECTION_SET = new Set<string>(BUSINESS_SECTION_KEYS)

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
// 主页卡片布局 clamp：列跨度 1-5（各屏列数上限由组件再收窄）、最小高度 60-1200px、排序值整数 -9999~9999
const clampCardW = (n: number) => Math.min(5, Math.max(1, Math.round(n)))
const clampCardH = (n: number) => Math.min(1200, Math.max(60, Math.round(n)))
const clampCardO = (n: number) => Math.min(9999, Math.max(-9999, Math.round(n)))

// 深拷贝默认尺寸
const cloneDefaults = (): Record<DialogId, DialogSizeSetting> => {
  const sizes = {} as Record<DialogId, DialogSizeSetting>
  for (const id of DIALOG_IDS) {
    sizes[id] = { ...DIALOG_DEFAULTS[id] }
  }
  return sizes
}

/**
 * 主页卡片布局归一（幂等）：仅采纳数值合法字段（w/h/o 各自 clamp）；
 * 非法/缺失字段丢弃，全空条目剔除，非对象入参 → {}（全部回退组件内置默认布局）。
 */
function normalizeHomeCardLayout(raw: unknown): Record<string, HomeCardLayout> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, HomeCardLayout> = {}
  for (const [cardId, item] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof cardId !== 'string' || cardId === '') continue
    if (!item || typeof item !== 'object') continue
    const src = item as Record<string, unknown>
    const entry: HomeCardLayout = {}
    if (typeof src.w === 'number' && Number.isFinite(src.w)) entry.w = clampCardW(src.w)
    if (typeof src.h === 'number' && Number.isFinite(src.h)) entry.h = clampCardH(src.h)
    if (typeof src.o === 'number' && Number.isFinite(src.o)) entry.o = clampCardO(src.o)
    if (entry.w !== undefined || entry.h !== undefined || entry.o !== undefined) out[cardId] = entry
  }
  return out
}

// 解析原始设置记录 → 校验 + clamp 后的完整 AppSettingsData（缺失/非法字段回退默认值）
function parseSettingsData(raw: unknown): AppSettingsData {
  const out: AppSettingsData = {
    dialogSizes: {},
    buttonOpacity: 1,
    bgOpacity: 1,
    workbenchMenuOrder: [...WORKBENCH_MENU_DEFAULT_ORDER],
    workbenchMenuLabels: {},
    workbenchMenuVisibility: {},
    desktopNotifyEnabled: false,
    reminderEmailEnabled: false,
    reminderEmailTo: '',
    reminderEmailServiceId: '',
    reminderEmailTemplateId: '',
    reminderEmailPublicKey: ''
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
  // 工作台菜单开关：仅已知键布尔值（false = 隐藏）；非法/缺失一律显示
  out.workbenchMenuVisibility = normalizeWorkbenchMenuVisibility(data.workbenchMenuVisibility)
  // 导航筛选栏展开态：仅采纳布尔；非法/缺失回退默认（收起）
  if (typeof data.navFiltersExpanded === 'boolean') {
    out.navFiltersExpanded = data.navFiltersExpanded
  }
  // 页面命名与可见性（工作台/销售记账）
  if (typeof data.workbenchPageName === 'string') {
    out.workbenchPageName = data.workbenchPageName.trim()
  }
  if (typeof data.workbenchPageVisible === 'boolean') {
    out.workbenchPageVisible = data.workbenchPageVisible
  }
  if (typeof data.businessPageName === 'string') {
    out.businessPageName = data.businessPageName.trim()
  }
  if (typeof data.businessPageVisible === 'boolean') {
    out.businessPageVisible = data.businessPageVisible
  }
  if (typeof data.studentPageName === 'string') {
    out.studentPageName = data.studentPageName.trim()
  }
  if (typeof data.studentPageVisible === 'boolean') {
    out.studentPageVisible = data.studentPageVisible
  }
  // 工作台城市：仅采纳 trim 后非空字符串；空串/undefined/null/非字符串一律视为「未配置」
  // （清除城市后重载不复活旧值，非法值回退默认即未配置）
  if (typeof data.workbenchCity === 'string' && data.workbenchCity.trim() !== '') {
    out.workbenchCity = data.workbenchCity.trim()
  }
  // 侧栏折叠态：仅采纳布尔；非法/缺失回退默认（未配置即展开）
  if (typeof data.workbenchSidebarCollapsed === 'boolean') {
    out.workbenchSidebarCollapsed = data.workbenchSidebarCollapsed
  }
  // 销售记账侧栏折叠态：仅采纳布尔；非法/缺失回退默认（未配置即展开）
  if (typeof data.businessSidebarCollapsed === 'boolean') {
    out.businessSidebarCollapsed = data.businessSidebarCollapsed
  }
  // 销售记账当前模块：仅采纳合法 section 键；非法/缺失回退默认（首页）
  if (typeof data.businessActiveSection === 'string' && BUSINESS_SECTION_SET.has(data.businessActiveSection)) {
    out.businessActiveSection = data.businessActiveSection
  }
  // 提醒设置：6 字段白名单解析（布尔仅采纳 true/false，字符串仅采纳 string 原样透传不 trim，非法/缺失回退默认）
  out.desktopNotifyEnabled = typeof data.desktopNotifyEnabled === 'boolean' ? data.desktopNotifyEnabled : false
  out.reminderEmailEnabled = typeof data.reminderEmailEnabled === 'boolean' ? data.reminderEmailEnabled : false
  out.reminderEmailTo = typeof data.reminderEmailTo === 'string' ? data.reminderEmailTo : ''
  out.reminderEmailServiceId = typeof data.reminderEmailServiceId === 'string' ? data.reminderEmailServiceId : ''
  out.reminderEmailTemplateId = typeof data.reminderEmailTemplateId === 'string' ? data.reminderEmailTemplateId : ''
  out.reminderEmailPublicKey = typeof data.reminderEmailPublicKey === 'string' ? data.reminderEmailPublicKey : ''
  // 云同步：5 字段解析（布尔仅采纳 true/false，字符串原样透传，数字 clamp >=0 整数，非法/缺失回退默认）
  out.cloudSyncEnabled = typeof data.cloudSyncEnabled === 'boolean' ? data.cloudSyncEnabled : false
  out.cloudSyncUrl = typeof data.cloudSyncUrl === 'string' ? data.cloudSyncUrl : ''
  out.cloudSyncUsername = typeof data.cloudSyncUsername === 'string' ? data.cloudSyncUsername : ''
  out.cloudSyncPassword = typeof data.cloudSyncPassword === 'string' ? data.cloudSyncPassword : ''
  if (typeof data.cloudSyncInterval === 'number' && Number.isFinite(data.cloudSyncInterval)) {
    out.cloudSyncInterval = Math.max(0, Math.floor(data.cloudSyncInterval))
  } else {
    out.cloudSyncInterval = 0
  }
  // 静默合并阈值：数字则 clamp >=0 取整，否则回退默认 1000
  if (typeof data.cloudSyncSilentThreshold === 'number' && Number.isFinite(data.cloudSyncSilentThreshold)) {
    out.cloudSyncSilentThreshold = Math.max(0, Math.floor(data.cloudSyncSilentThreshold))
  } else {
    out.cloudSyncSilentThreshold = 1000
  }
  out.homeCardLayout = normalizeHomeCardLayout(data.homeCardLayout)
  return out
}

export const useAppSettingsStore = defineStore('app-settings', () => {
  // ========================================
  // 状态
  // ========================================
  const dialogSizes = ref<Record<DialogId, DialogSizeSetting>>(cloneDefaults())
  const buttonOpacity = ref<number>(1)
  const bgOpacity = ref<number>(1)

  // 工作台菜单顺序/名称/开关：初始即默认（顺序拷贝，勿直接引用只读常量），杜绝空菜单闪屏
  const workbenchMenuOrder = ref<string[]>([...WORKBENCH_MENU_DEFAULT_ORDER])
  const workbenchMenuLabels = ref<Record<string, string>>({})
  const workbenchMenuVisibility = ref<WorkbenchMenuVisibility>({})

  // 工作台城市（天气卡显示城市）与侧栏折叠态：默认未配置（undefined = 无城市 / 不折叠）
  const workbenchCity = ref<string | undefined>(undefined)
  const workbenchSidebarCollapsed = ref<boolean | undefined>(undefined)
  const businessSidebarCollapsed = ref<boolean | undefined>(undefined)
  const businessActiveSection = ref<string | undefined>(undefined)

  // 导航管理页分类/标签栏展开态：默认收起（false）
  const navFiltersExpanded = ref<boolean>(false)

  // 页面命名与可见性（工作台/销售记账/学生工作台）
  const workbenchPageName = ref<string>('')
  const workbenchPageVisible = ref<boolean>(true)
  const businessPageName = ref<string>('')
  const businessPageVisible = ref<boolean>(true)
  const studentPageName = ref<string>('')
  const studentPageVisible = ref<boolean>(true)

  // 站点外观（浏览器标签标题 + favicon）：localStorage 驱动（site-title / site-favicon），
  // 与主题同构——不进 IDB persist，经 nav.json prefs 云同步跨设备生效；空值回退默认
  const siteTitle = ref<string>('')
  const siteFavicon = ref<string>('')

  // 提醒设置：桌面通知开关 + 邮件提醒（EmailJS）开关与四字段配置——默认关闭/空串
  const desktopNotifyEnabled = ref<boolean>(false)
  const reminderEmailEnabled = ref<boolean>(false)
  const reminderEmailTo = ref<string>('')
  const reminderEmailServiceId = ref<string>('')
  const reminderEmailTemplateId = ref<string>('')
  const reminderEmailPublicKey = ref<string>('')

  // 工作台主页卡片布局（卡片 id → 列跨度/最小高度/排序）：默认空 = 全部用组件内置默认布局
  const homeCardLayout = ref<Record<string, HomeCardLayout>>({})

  // 云同步配置（6 字段）：默认关闭/空串/间隔0/静默阈值1000
  const cloudSyncEnabled = ref<boolean>(false)
  const cloudSyncUrl = ref<string>('')
  const cloudSyncUsername = ref<string>('')
  const cloudSyncPassword = ref<string>('')
  const cloudSyncInterval = ref<number>(0)
  const cloudSyncSilentThreshold = ref<number>(1000)

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
      workbenchMenuLabels: toRaw(workbenchMenuLabels.value),
      workbenchMenuVisibility: toRaw(workbenchMenuVisibility.value),
      workbenchCity: toRaw(workbenchCity.value),
      workbenchSidebarCollapsed: toRaw(workbenchSidebarCollapsed.value),
      businessSidebarCollapsed: toRaw(businessSidebarCollapsed.value),
      businessActiveSection: toRaw(businessActiveSection.value),
      navFiltersExpanded: navFiltersExpanded.value,
      workbenchPageName: workbenchPageName.value,
      workbenchPageVisible: workbenchPageVisible.value,
      businessPageName: businessPageName.value,
      businessPageVisible: businessPageVisible.value,
      studentPageName: studentPageName.value,
      studentPageVisible: studentPageVisible.value,
      desktopNotifyEnabled: desktopNotifyEnabled.value,
      reminderEmailEnabled: reminderEmailEnabled.value,
      reminderEmailTo: reminderEmailTo.value,
      reminderEmailServiceId: reminderEmailServiceId.value,
      reminderEmailTemplateId: reminderEmailTemplateId.value,
      reminderEmailPublicKey: reminderEmailPublicKey.value,
      cloudSyncEnabled: cloudSyncEnabled.value,
      cloudSyncUrl: cloudSyncUrl.value,
      cloudSyncUsername: cloudSyncUsername.value,
      cloudSyncPassword: cloudSyncPassword.value,
      cloudSyncInterval: cloudSyncInterval.value,
      cloudSyncSilentThreshold: cloudSyncSilentThreshold.value,
      homeCardLayout: toRaw(homeCardLayout.value)
    })).catch(() => {
      // IDB 写入失败静默忽略（fire-and-forget，不抛错）
    })
    markDirty()
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
      workbenchMenuVisibility.value = normalizeWorkbenchMenuVisibility(effective.workbenchMenuVisibility)
      navFiltersExpanded.value = effective.navFiltersExpanded === true
      workbenchPageName.value = typeof effective.workbenchPageName === 'string' ? effective.workbenchPageName.trim() : ''
      workbenchPageVisible.value = effective.workbenchPageVisible !== false
      businessPageName.value = typeof effective.businessPageName === 'string' ? effective.businessPageName.trim() : ''
      businessPageVisible.value = effective.businessPageVisible !== false
      studentPageName.value = typeof effective.studentPageName === 'string' ? effective.studentPageName.trim() : ''
      studentPageVisible.value = effective.studentPageVisible !== false
      for (const id of DIALOG_IDS) {
        const size = effective.dialogSizes[id]
        if (size) {
          if (Number.isFinite(size.width)) dialogSizes.value[id].width = clampWidth(size.width)
          if (Number.isFinite(size.height)) dialogSizes.value[id].height = clampHeight(size.height)
        }
      }
      if (Number.isFinite(effective.buttonOpacity)) buttonOpacity.value = clampOpacity(effective.buttonOpacity)
      if (Number.isFinite(effective.bgOpacity)) bgOpacity.value = clampOpacity(effective.bgOpacity)
      // 工作台城市/侧栏折叠态：仅采纳合法值（城市 trim 后非空、折叠态布尔），
      // 空串/undefined/非法一律回退未配置（清除后重载不复活旧值）
      if (typeof effective.workbenchCity === 'string' && effective.workbenchCity.trim() !== '') {
        workbenchCity.value = effective.workbenchCity.trim()
      } else {
        workbenchCity.value = undefined
      }
      if (typeof effective.workbenchSidebarCollapsed === 'boolean') {
        workbenchSidebarCollapsed.value = effective.workbenchSidebarCollapsed
      } else {
        workbenchSidebarCollapsed.value = undefined
      }
      if (typeof effective.businessSidebarCollapsed === 'boolean') {
        businessSidebarCollapsed.value = effective.businessSidebarCollapsed
      } else {
        businessSidebarCollapsed.value = undefined
      }
      // 销售记账当前模块：仅采纳合法 section 键；非法/缺失回退默认（首页）
      if (typeof effective.businessActiveSection === 'string' && BUSINESS_SECTION_SET.has(effective.businessActiveSection)) {
        businessActiveSection.value = effective.businessActiveSection
      } else {
        businessActiveSection.value = undefined
      }
      // 提醒设置：6 字段白名单应用（布尔仅采纳 true/false，字符串仅采纳 string 原样透传不 trim，非法/缺失回退默认）
      desktopNotifyEnabled.value = effective.desktopNotifyEnabled === true
      reminderEmailEnabled.value = effective.reminderEmailEnabled === true
      reminderEmailTo.value = typeof effective.reminderEmailTo === 'string' ? effective.reminderEmailTo : ''
      reminderEmailServiceId.value = typeof effective.reminderEmailServiceId === 'string' ? effective.reminderEmailServiceId : ''
      reminderEmailTemplateId.value = typeof effective.reminderEmailTemplateId === 'string' ? effective.reminderEmailTemplateId : ''
      reminderEmailPublicKey.value = typeof effective.reminderEmailPublicKey === 'string' ? effective.reminderEmailPublicKey : ''
      // 云同步：5 字段白名单应用
      cloudSyncEnabled.value = effective.cloudSyncEnabled === true
      cloudSyncUrl.value = typeof effective.cloudSyncUrl === 'string' ? effective.cloudSyncUrl : ''
      cloudSyncUsername.value = typeof effective.cloudSyncUsername === 'string' ? effective.cloudSyncUsername : ''
      cloudSyncPassword.value = typeof effective.cloudSyncPassword === 'string' ? effective.cloudSyncPassword : ''
      if (typeof effective.cloudSyncInterval === 'number' && Number.isFinite(effective.cloudSyncInterval)) {
        cloudSyncInterval.value = Math.max(0, Math.floor(effective.cloudSyncInterval))
      } else {
        cloudSyncInterval.value = 0
      }
      if (typeof effective.cloudSyncSilentThreshold === 'number' && Number.isFinite(effective.cloudSyncSilentThreshold)) {
        cloudSyncSilentThreshold.value = Math.max(0, Math.floor(effective.cloudSyncSilentThreshold))
      } else {
        cloudSyncSilentThreshold.value = 1000
      }
      // 主页卡片布局：整包归一（IDB 直读路径不经过 parseSettingsData，此处必须自行 clamp）
      homeCardLayout.value = normalizeHomeCardLayout(effective.homeCardLayout)
      // 归一化结果写回 IDB（fire-and-forget）：保证导出/导入往返幂等，镜像迁移分支的 idbPut
      persist()
    }
    applySettings()
    // 站点外观：localStorage 驱动（非 IDB），启动时读入并应用到 document
    initSiteMeta()
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

  // 工作台城市：trim 后空串/全空白 = 清除（存 undefined，重载不复活旧值）；非空存 trim 后规范值
  function setWorkbenchCity(name: string) {
    const trimmed = name.trim()
    workbenchCity.value = trimmed === '' ? undefined : trimmed
    persist()
  }

  // 工作台侧栏折叠态：纯布尔（undefined 仅由非法/缺失回退产生，不主动写入）
  function setWorkbenchSidebarCollapsed(v: boolean) {
    workbenchSidebarCollapsed.value = v
    persist()
  }

  // 销售记账侧栏折叠态：纯布尔（undefined 仅由非法/缺失回退产生，不主动写入）
  function setBusinessSidebarCollapsed(v: boolean) {
    businessSidebarCollapsed.value = v
    persist()
  }

  // 销售记账当前模块：仅合法 section 键写入（undefined = 回退首页，不主动写入）
  function setBusinessActiveSection(v: string | undefined) {
    businessActiveSection.value = v && BUSINESS_SECTION_SET.has(v) ? v : undefined
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
    workbenchMenuVisibility.value = {}
    workbenchCity.value = undefined
    workbenchSidebarCollapsed.value = undefined
    businessSidebarCollapsed.value = undefined
    businessActiveSection.value = undefined
    homeCardLayout.value = {}
    navFiltersExpanded.value = false
    workbenchPageName.value = ''
    workbenchPageVisible.value = true
    businessPageName.value = ''
    businessPageVisible.value = true
    studentPageName.value = ''
    studentPageVisible.value = true
    desktopNotifyEnabled.value = false
    reminderEmailEnabled.value = false
    reminderEmailTo.value = ''
    reminderEmailServiceId.value = ''
    reminderEmailTemplateId.value = ''
    reminderEmailPublicKey.value = ''
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
    // 区块级恢复默认：只重置菜单三字段（顺序/名称/开关），不触碰 dialogSizes/opacity/CSS 变量，不调用 resetDefaults
    workbenchMenuOrder.value = [...WORKBENCH_MENU_DEFAULT_ORDER]
    workbenchMenuLabels.value = {}
    workbenchMenuVisibility.value = {}
    persist()
    return { ok: true, reason: 'ok' as const }
  }

  // ========================================
  // 工作台菜单开关 / 导航筛选栏展开态
  // ========================================
  function setWorkbenchMenuVisibility(key: string, visible: boolean) {
    const next = { ...workbenchMenuVisibility.value }
    if (visible) delete next[key] // 恢复显示 = 移除记录（缺省即显示）
    else next[key] = false
    workbenchMenuVisibility.value = next
    persist()
  }

  function setNavFiltersExpanded(v: boolean) {
    navFiltersExpanded.value = v
    persist()
  }

  // ========================================
  // 工作台主页卡片布局（宽高/位置）：单卡 patch 合并（undefined = 删除该字段回组件默认）→ 持久化
  // ========================================
  function setHomeCardLayout(cardId: string, patch: HomeCardLayout) {
    const next: HomeCardLayout = { ...(homeCardLayout.value[cardId] ?? {}) }
    if (patch.w === undefined) delete next.w
    else next.w = clampCardW(patch.w)
    if (patch.h === undefined) delete next.h
    else next.h = clampCardH(patch.h)
    if (patch.o === undefined) delete next.o
    else next.o = clampCardO(patch.o)
    const all = { ...homeCardLayout.value }
    if (Object.keys(next).length === 0) delete all[cardId] // 全空 = 无自定义，移除条目
    else all[cardId] = next
    homeCardLayout.value = all
    persist()
  }

  // 整页重置：清空全部自定义布局，回退组件内置默认（宽高与顺序）
  function resetHomeCardLayout() {
    homeCardLayout.value = {}
    persist()
  }

  // 页面命名与可见性 setters
  function setWorkbenchPageName(s: string) {
    workbenchPageName.value = s
    persist()
  }
  function setWorkbenchPageVisible(v: boolean) {
    workbenchPageVisible.value = v
    persist()
  }
  function setBusinessPageName(s: string) {
    businessPageName.value = s
    persist()
  }
  function setBusinessPageVisible(v: boolean) {
    businessPageVisible.value = v
    persist()
  }
  function setStudentPageName(s: string) {
    studentPageName.value = s
    persist()
  }
  function setStudentPageVisible(v: boolean) {
    studentPageVisible.value = v
    persist()
  }

  // 页面显示名 computed
  const workbenchPageDisplayName = computed(() => workbenchPageName.value || '工作台')
  const businessPageDisplayName = computed(() => businessPageName.value || '销售记账')
  const studentPageDisplayName = computed(() => studentPageName.value || '学生工作台')

  // ========================================
  // 站点外观：浏览器标签标题 + favicon（localStorage 驱动，云同步经 nav.json prefs；空值回退默认）
  // ========================================

  /** 写 <head> 的 favicon link（无则创建）；按 href 推断 mime 保持 type 一致 */
  function setFaviconLink(href: string) {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = href
    link.type = href.includes('svg') ? 'image/svg+xml' : 'image/png'
  }

  /** 应用站点外观到 document：标签标题 + favicon */
  function applySiteMeta() {
    const title = siteTitle.value.trim()
    document.title = title !== '' ? title : '网页导航'
    const favicon = siteFavicon.value.trim()
    setFaviconLink(favicon !== '' ? favicon : '/vite.svg')
  }

  /**
   * 从 localStorage 读入站点外观并应用。
   * App 启动（initSettings 末尾）与云同步拉取 nav.json 后各调用一次，幂等。
   */
  function initSiteMeta() {
    siteTitle.value = localStorage.getItem(SITE_TITLE_KEY) ?? ''
    siteFavicon.value = localStorage.getItem(SITE_FAVICON_KEY) ?? ''
    applySiteMeta()
  }

  /** 设置站点名称（浏览器标签标题）：trim 后空串 = 恢复默认「网页导航」 */
  function setSiteTitle(v: string) {
    siteTitle.value = v
    localStorage.setItem(SITE_TITLE_KEY, v)
    markDirty()
    applySiteMeta()
  }

  /** 设置站点图标（data URL 或相对路径；空串 = 恢复默认 vite.svg） */
  function setSiteFavicon(v: string) {
    siteFavicon.value = v
    localStorage.setItem(SITE_FAVICON_KEY, v)
    markDirty()
    applySiteMeta()
  }

  // 提醒设置：桌面通知/邮件提醒开关（纯布尔）+ 邮件配置四字段（原样透传不 trim）——更新 ref → persist
  function setDesktopNotifyEnabled(v: boolean) {
    desktopNotifyEnabled.value = v
    persist()
  }

  function setReminderEmailEnabled(v: boolean) {
    reminderEmailEnabled.value = v
    persist()
  }

  function setReminderEmailTo(s: string) {
    reminderEmailTo.value = s
    persist()
  }

  function setReminderEmailServiceId(s: string) {
    reminderEmailServiceId.value = s
    persist()
  }

  function setReminderEmailTemplateId(s: string) {
    reminderEmailTemplateId.value = s
    persist()
  }

  function setReminderEmailPublicKey(s: string) {
    reminderEmailPublicKey.value = s
    persist()
  }

  // 云同步 setters
  function setCloudSyncEnabled(v: boolean) {
    cloudSyncEnabled.value = v
    persist()
  }
  function setCloudSyncUrl(s: string) {
    cloudSyncUrl.value = s
    persist()
  }
  function setCloudSyncUsername(s: string) {
    cloudSyncUsername.value = s
    persist()
  }
  function setCloudSyncPassword(s: string) {
    cloudSyncPassword.value = s
    persist()
  }
  function setCloudSyncInterval(n: number) {
    cloudSyncInterval.value = Math.max(0, Math.floor(n))
    persist()
  }
  function setCloudSyncSilentThreshold(n: number) {
    cloudSyncSilentThreshold.value = Math.max(0, Math.floor(n))
    persist()
  }

  // 菜单开关判定（缺失键 = 显示）；home 恒显示（视图/设置弹窗锁定其开关）
  function isWorkbenchMenuEnabled(key: string): boolean {
    return workbenchMenuVisibility.value[key] !== false
  }

  // 全键开关视图（模板/组件消费：Record<菜单键, boolean>，缺失恒 true）
  const workbenchMenuEnabled = computed<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {}
    for (const key of WORKBENCH_MENU_KEYS) {
      out[key] = workbenchMenuVisibility.value[key] !== false
    }
    return out
  })

  // 菜单渲染项（label 回退默认名，icon 查表；开关关闭的键剔除）——默认态恒 10 项、home 首位
  const workbenchMenuItems = computed<WorkbenchMenuItem[]>(() =>
    resolveMenuItems(workbenchMenuOrder.value, workbenchMenuLabels.value, workbenchMenuVisibility.value)
  )

  // 全量菜单项（不受开关过滤）：设置弹窗「工作台菜单」列表渲染用——开关关闭的行仍保留，
  // 否则关闭后该行消失将无法重新开启
  const workbenchMenuAllItems = computed<WorkbenchMenuItem[]>(() =>
    resolveMenuItems(workbenchMenuOrder.value, workbenchMenuLabels.value)
  )

  return {
    dialogSizes,
    buttonOpacity,
    bgOpacity,
    workbenchMenuOrder,
    workbenchMenuLabels,
    workbenchMenuVisibility,
    workbenchMenuEnabled,
    workbenchMenuItems,
    workbenchMenuAllItems,
    workbenchCity,
    workbenchSidebarCollapsed,
    businessActiveSection,
    navFiltersExpanded,
    workbenchPageName,
    workbenchPageVisible,
    businessPageName,
    businessPageVisible,
    studentPageName,
    studentPageVisible,
    siteTitle,
    siteFavicon,
    workbenchPageDisplayName,
    businessPageDisplayName,
    studentPageDisplayName,
    desktopNotifyEnabled,
    reminderEmailEnabled,
    reminderEmailTo,
    reminderEmailServiceId,
    reminderEmailTemplateId,
    reminderEmailPublicKey,
    cloudSyncEnabled,
    cloudSyncUrl,
    cloudSyncUsername,
    cloudSyncPassword,
    cloudSyncInterval,
    cloudSyncSilentThreshold,
    homeCardLayout,
    initSettings,
    applySettings,
    setDialogSize,
    setButtonOpacity,
    setBgOpacity,
    setWorkbenchCity,
    setWorkbenchSidebarCollapsed,
    businessSidebarCollapsed,
    setBusinessSidebarCollapsed,
    setBusinessActiveSection,
    setWorkbenchMenuVisibility,
    isWorkbenchMenuEnabled,
    setNavFiltersExpanded,
    setWorkbenchPageName,
    setWorkbenchPageVisible,
    setBusinessPageName,
    setBusinessPageVisible,
    setStudentPageName,
    setStudentPageVisible,
    initSiteMeta,
    applySiteMeta,
    setSiteTitle,
    setSiteFavicon,
    setDesktopNotifyEnabled,
    setReminderEmailEnabled,
    setReminderEmailTo,
    setReminderEmailServiceId,
    setReminderEmailTemplateId,
    setReminderEmailPublicKey,
    setCloudSyncEnabled,
    setCloudSyncUrl,
    setCloudSyncUsername,
    setCloudSyncPassword,
    setCloudSyncInterval,
    setCloudSyncSilentThreshold,
    setHomeCardLayout,
    resetHomeCardLayout,
    resetDefaults,
    moveWorkbenchMenuItem,
    renameWorkbenchMenuItem,
    resetWorkbenchMenu
  }
})
