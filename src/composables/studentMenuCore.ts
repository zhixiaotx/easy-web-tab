// 学生工作台菜单纯逻辑模块：14 项菜单（home 恒居首位）的顺序归一化 / 上移下移 / 改名 / 解析渲染。
// 仿 workbenchMenuCore.ts 模式：零 vue/pinia 运行时依赖，纯函数，node --experimental-strip-types 可测。
// 默认名称逐字一致（load-bearing）。

import {
  STUDENT_MENU_KEYS,
  STUDENT_MENU_DEFAULT_ORDER,
  STUDENT_MENU_DEFAULT_LABELS,
  STUDENT_MENU_ICONS,
  type StudentSettings
} from '@/types'

const KNOWN_MENU_KEYS: ReadonlySet<string> = new Set<string>(STUDENT_MENU_KEYS)

/** 改名上限（按 code point 计，emoji 代理对算 1 个） */
const MAX_LABEL_LENGTH = 12

/** 截断到 12 个 code point */
function truncateTo12(name: string): string {
  return Array.from(name).slice(0, MAX_LABEL_LENGTH).join('')
}

/** 归一化后的菜单数据形状 */
export interface StudentMenuData {
  order: string[]
  labels: Record<string, string>
}

/** 解析后的菜单项（Vue 侧渲染消费） */
export interface StudentMenuItem {
  key: string
  label: string
  icon: string
}

/** 菜单可见性开关（key → 是否显示；缺失键一律视为显示，false = 隐藏） */
export type StudentMenuVisibility = Record<string, boolean>

/**
 * 菜单可见性归一化（幂等）：仅保留已知键的布尔值，缺失/非法一律视为显示（不写入 out）。
 * 非对象/数组输入按缺省处理（全显示）。
 */
export function normalizeStudentMenuVisibility(visibility?: unknown): StudentMenuVisibility {
  const out: StudentMenuVisibility = {}
  if (visibility === null || typeof visibility !== 'object' || Array.isArray(visibility)) return out
  for (const [key, value] of Object.entries(visibility as Record<string, unknown>)) {
    if (!KNOWN_MENU_KEYS.has(key) || typeof value !== 'boolean') continue
    out[key] = value
  }
  return out
}

/**
 * 归一化菜单顺序与名称（幂等）：
 * order → 仅保留已知键、去重（首次出现优先）、home 强制 index 0（缺失则前插、后置则前移）、
 *         缺失已知键按默认序补全 → 恒 14 项；
 * labels → 仅保留已知键、trim、去空、截断 12 code point。
 * 非数组 / 非对象输入按缺省处理（兜底默认）。
 */
export function normalizeStudentMenu(order?: unknown, labels?: unknown): StudentMenuData {
  const seen = new Set<string>()
  const filtered: string[] = []
  if (Array.isArray(order)) {
    for (const key of order) {
      if (typeof key !== 'string' || key === 'home' || seen.has(key) || !KNOWN_MENU_KEYS.has(key)) continue
      seen.add(key)
      filtered.push(key)
    }
  }
  for (const key of STUDENT_MENU_KEYS) {
    if (key === 'home' || seen.has(key)) continue
    seen.add(key)
    filtered.push(key)
  }
  return { order: ['home', ...filtered], labels: normalizeMenuLabels(labels) }
}

/** labels 归一化：仅已知键、trim、去空、截断 12 code point；非字符串值剔除。 */
function normalizeMenuLabels(labels?: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (labels === null || typeof labels !== 'object' || Array.isArray(labels)) return out
  for (const [key, value] of Object.entries(labels)) {
    if (!KNOWN_MENU_KEYS.has(key) || typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    out[key] = truncateTo12(trimmed)
  }
  return out
}

/** 上移/下移结果 */
export interface MoveStudentMenuResult {
  ok: boolean
  reason: 'locked' | 'boundary' | 'not-found' | 'ok'
  order?: string[]
}

/**
 * 菜单项上移/下移一格。home 恒 locked（index 0）；
 * 已在边界 → boundary；未知键 → not-found；
 * 成功时返回对调后的新顺序（不改入参），home 仍居 index 0。
 */
export function moveStudentMenuItem(order: string[], key: string, dir: 'up' | 'down'): MoveStudentMenuResult {
  if (key === 'home') return { ok: false, reason: 'locked' }
  const idx = order.indexOf(key)
  if (idx === -1) return { ok: false, reason: 'not-found' }
  const target = dir === 'up' ? idx - 1 : idx + 1
  if (target < 1 || target >= order.length) return { ok: false, reason: 'boundary' }
  const next = [...order]
  const tmp = next[idx]
  next[idx] = next[target]
  next[target] = tmp
  return { ok: true, reason: 'ok', order: next }
}

/** 改名结果 */
export interface RenameStudentMenuResult {
  ok: boolean
  reason: 'empty' | 'not-found' | 'ok'
  labels?: Record<string, string>
}

/**
 * 重命名菜单项。trim 后为空 → empty；未知键 → not-found；
 * 成功时返回含新名的新 labels 对象（不可变，不改入参），值截断 12 code point。
 */
export function renameStudentMenuLabel(
  labels: Record<string, string>,
  key: string,
  name: string
): RenameStudentMenuResult {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  if (!KNOWN_MENU_KEYS.has(key)) return { ok: false, reason: 'not-found' }
  return { ok: true, reason: 'ok', labels: { ...labels, [key]: truncateTo12(trimmed) } }
}

/**
 * 解析菜单渲染项：按 order 顺序迭代，label = 用户改名 ?? 默认名，icon 查表。
 * 可选 visibility：false 的键从渲染列表剔除（未传/缺失 = 全显示，向后兼容）。
 */
export function resolveStudentMenuItems(
  order: string[],
  labels: Record<string, string>,
  visibility?: StudentMenuVisibility
): StudentMenuItem[] {
  const visible = normalizeStudentMenuVisibility(visibility)
  return order
    .filter(key => visible[key] !== false)
    .map(key => ({
      key,
      label: labels[key] ?? STUDENT_MENU_DEFAULT_LABELS[key],
      icon: STUDENT_MENU_ICONS[key]
    }))
}

/**
 * 应用学段默认可见性：保留用户已显式配置的覆盖项，对未配置的键应用学段默认值。
 * 用于学段切换时——只播种未配置的键，已配置的保持用户选择（避免覆盖手动开启的项）。
 */
export function applyStageDefaultVisibility(
  current: StudentMenuVisibility,
  stageDefaults: Record<string, boolean>
): StudentMenuVisibility {
  const out: StudentMenuVisibility = { ...current }
  for (const key of STUDENT_MENU_KEYS) {
    if (out[key] === undefined) {
      out[key] = stageDefaults[key] ?? true
    }
  }
  return out
}

/**
 * 从 StudentSettings 解析菜单（统一入口，避免视图/组件重复实现）。
 */
export function resolveStudentMenu(settings: StudentSettings): StudentMenuItem[] {
  const { order, labels } = normalizeStudentMenu(settings.menuOrder, settings.menuLabels)
  return resolveStudentMenuItems(order, labels, settings.menuVisibility)
}

/** 全量解析（含关闭项，设置弹窗列表用） */
export function resolveStudentMenuAll(settings: StudentSettings): StudentMenuItem[] {
  const { order, labels } = normalizeStudentMenu(settings.menuOrder, settings.menuLabels)
  return order.map(key => ({
    key,
    label: labels[key] ?? STUDENT_MENU_DEFAULT_LABELS[key],
    icon: STUDENT_MENU_ICONS[key]
  }))
}

/** 菜单键是否启用（含 home 恒 true 守卫） */
export function isStudentMenuEnabled(settings: StudentSettings, key: string): boolean {
  if (key === 'home') return true
  const visible = normalizeStudentMenuVisibility(settings.menuVisibility)
  return visible[key] !== false
}

/** 默认顺序导出（保留引用，给 store init 用） */
export function defaultStudentMenuOrder(): string[] {
  return [...STUDENT_MENU_DEFAULT_ORDER]
}
