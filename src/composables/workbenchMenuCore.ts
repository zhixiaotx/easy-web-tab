// 工作台菜单纯逻辑模块：7 项菜单（home 恒居首位）的顺序归一化 / 上移下移 / 改名 / 解析渲染。
// 零 vue/pinia 运行时依赖（node --experimental-strip-types 可运行），无 DOM，纯函数。
// 默认名称逐字一致（qa-notes-tabs.spec.ts 按文本「个人便签」定位菜单，改动会破坏回归）。

/** 菜单键集合（顺序即默认展示顺序）。 */
export const WORKBENCH_MENU_KEYS: readonly string[] = [
  'home',
  'todos',
  'notes',
  'countdowns',
  'passwords',
  'health',
  'ledger'
]

/** 默认菜单顺序（home 首位，与键集合一致）。 */
export const WORKBENCH_MENU_DEFAULT_ORDER: readonly string[] = [...WORKBENCH_MENU_KEYS]

/** 菜单默认名称（与现状逐字一致，load-bearing）。 */
export const MENU_DEFAULT_LABELS: Record<string, string> = {
  home: '主页',
  todos: '工作待办',
  notes: '个人便签',
  countdowns: '定时提醒',
  passwords: '密码管理',
  health: '健康管理',
  ledger: '记账'
}

/** 菜单图标映射。 */
export const MENU_ICONS: Record<string, string> = {
  home: '🏠',
  todos: '☑️',
  notes: '📝',
  countdowns: '⏳',
  passwords: '🔑',
  health: '💪',
  ledger: '💰'
}

const KNOWN_MENU_KEYS: ReadonlySet<string> = new Set<string>(WORKBENCH_MENU_KEYS)

/** 改名上限（按 code point 计，emoji 代理对算 1 个，绝不拆对）。 */
const MAX_LABEL_LENGTH = 12

/** 截断到 12 个 code point：Array.from 按码点切分，代理对不会被从中间截断。 */
function truncateTo12(name: string): string {
  return Array.from(name).slice(0, MAX_LABEL_LENGTH).join('')
}

/** 归一化后的菜单数据形状。 */
export interface WorkbenchMenuData {
  order: string[]
  labels: Record<string, string>
}

/** 解析后的菜单项（Vue 侧渲染消费）。 */
export interface WorkbenchMenuItem {
  key: string
  label: string
  icon: string
}

/**
 * 归一化菜单顺序与名称（幂等）：
 * order → 仅保留已知键、去重（首次出现优先）、home 强制 index 0（缺失则前插、后置则前移）、
 *         缺失已知键按默认序补全 → 恒 7 项；
 * labels → 仅保留已知键、trim、去空、截断 12 code point。
 * 非数组 / 非对象输入按缺省处理（兜底默认）。
 */
export function normalizeWorkbenchMenu(order?: unknown, labels?: unknown): WorkbenchMenuData {
  const seen = new Set<string>()
  const filtered: string[] = []
  if (Array.isArray(order)) {
    for (const key of order) {
      if (typeof key !== 'string' || key === 'home' || seen.has(key) || !KNOWN_MENU_KEYS.has(key)) continue
      seen.add(key)
      filtered.push(key)
    }
  }
  for (const key of WORKBENCH_MENU_KEYS) {
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

/** 上移/下移结果。 */
export interface MoveMenuResult {
  ok: boolean
  reason: 'locked' | 'boundary' | 'not-found' | 'ok'
  order?: string[]
}

/**
 * 菜单项上移/下移一格。home 恒 locked（index 0 恒归 home，任何键不得移入/越过）；
 * 已在边界（index 1 上移 / 末位下移）→ boundary；未知键 → not-found；
 * 成功时返回对调后的新顺序（不改入参），home 仍居 index 0。
 */
export function moveMenuItem(order: string[], key: string, dir: 'up' | 'down'): MoveMenuResult {
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

/** 改名结果。 */
export interface RenameMenuLabelResult {
  ok: boolean
  reason: 'empty' | 'not-found' | 'ok'
  labels?: Record<string, string>
}

/**
 * 重命名菜单项。trim 后为空 → empty；未知键 → not-found；
 * 成功时返回含新名的新 labels 对象（不可变，不改入参），值截断 12 code point。
 */
export function renameMenuLabel(labels: Record<string, string>, key: string, name: string): RenameMenuLabelResult {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  if (!KNOWN_MENU_KEYS.has(key)) return { ok: false, reason: 'not-found' }
  return { ok: true, reason: 'ok', labels: { ...labels, [key]: truncateTo12(trimmed) } }
}

/**
 * 解析菜单渲染项：按 order 顺序迭代，label = 用户改名 ?? 默认名，icon 查表。
 */
export function resolveMenuItems(order: string[], labels: Record<string, string>): WorkbenchMenuItem[] {
  return order.map(key => ({
    key,
    label: labels[key] ?? MENU_DEFAULT_LABELS[key],
    icon: MENU_ICONS[key]
  }))
}
