import { onMounted, onUnmounted, type Ref } from 'vue'
import type { Router } from 'vue-router'

/**
 * 工作台快捷键（/workbench 与 /business 两个页面均挂载，行为一致）：
 *
 * - Alt+K：打开全局搜索浮层。焦点在输入类元素（INPUT/TEXTAREA/SELECT/contenteditable）时跳过，
 *   避免打断打字（如便签/待办表单）。
 * - Ctrl+Alt+1..9：跳转左侧菜单第 1..9 项（按设置 store 当前菜单顺序映射）。
 * - Esc：关闭全局搜索浮层（幂等；浮层自身也处理 Esc，双保险不重复触发）。
 * - g：在「个人工作台 / 销售记账」之间切换（router 跳转，依据当前路由）。
 * - [ / ]：在当前工作台的上一个 / 下一个模块间切换（按菜单顺序，循环；跳过被关闭的菜单项）。
 *   单键快捷键（g / [ / ]）仅在无修饰键且焦点不在输入类元素时触发，避免误触与打断打字。
 */
export interface WorkbenchShortcutsOptions {
  /** 全局搜索浮层开合状态（视图持有，本 composable 只读/写回）。 */
  spotlightOpen: Ref<boolean>
  /** 当前菜单顺序键（按序对应 Ctrl+Alt+1..N；[ ] 在其中的相邻项间循环）。 */
  getMenuKeys: () => readonly string[]
  /** 当前激活模块 key（[ ] 以此为起点定位相邻项）。 */
  getCurrentSection: () => string
  /** 跳转到工作台分区（key 已由调用方白名单 / 开关守卫收窄）。 */
  onNavigate: (key: string) => void
  /** 模块是否可进入（用于 [ ] 跳过被关闭菜单项；不传则全部可进入）。 */
  isSectionEnabled?: (key: string) => boolean
  /** 路由实例（g 切换工作台、必要时跳转）。 */
  router: Router
}

/** 输入类元素判定：焦点在其中时不劫持快捷键（Alt+K / Ctrl+Alt+digit / g / [ / ] 均跳过）。 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function useWorkbenchShortcuts(options: WorkbenchShortcutsOptions) {
  /** g：在个人工作台 / 销售记账之间切换（依据当前路由路径）。 */
  function switchWorkbench(): void {
    const path = options.router.currentRoute.value.path
    if (path.startsWith('/business')) {
      options.router.push('/workbench')
    } else if (path.startsWith('/workbench')) {
      options.router.push('/business')
    }
  }

  /** [ / ]：在当前工作台菜单顺序的相邻模块间循环切换（跳过被关闭项）。 */
  function stepSection(dir: 1 | -1): void {
    const keys = options.getMenuKeys()
    if (keys.length === 0) return
    const enabled = (k: string): boolean => (options.isSectionEnabled ? options.isSectionEnabled(k) : true)
    let idx = keys.indexOf(options.getCurrentSection())
    if (idx < 0) idx = 0
    for (let i = 0; i < keys.length; i++) {
      idx = (idx + dir + keys.length) % keys.length
      if (enabled(keys[idx])) {
        options.onNavigate(keys[idx])
        return
      }
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    // Esc：关闭全局搜索（幂等，浮层自身也处理 Esc）
    if (event.key === 'Escape') {
      if (options.spotlightOpen.value) {
        event.preventDefault()
        options.spotlightOpen.value = false
      }
      return
    }

    // Alt+K：打开全局搜索（Ctrl/Shift/Meta 组合键不误触；输入框内跳过，避免打断打字）
    if (
      event.altKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.metaKey &&
      event.key.toLowerCase() === 'k' &&
      !isTypingTarget(event.target)
    ) {
      event.preventDefault()
      options.spotlightOpen.value = true
      return
    }

    // Ctrl+Alt+1..9：跳转菜单第 1..9 项（输入框内同样生效，与 Alt+K 的 skip-input 语义区分）
    if (event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey && /^[1-9]$/.test(event.key)) {
      const idx = Number(event.key) - 1
      const menuKeys = options.getMenuKeys()
      if (idx < menuKeys.length) {
        event.preventDefault()
        options.onNavigate(menuKeys[idx])
      }
      return
    }

    // 单键快捷键（g / [ / ]）：无修饰键 + 焦点不在输入类元素时触发，避免误触与打断打字
    const plain = !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey
    if (!plain || isTypingTarget(event.target)) return

    if (event.key === 'g') {
      event.preventDefault()
      switchWorkbench()
    } else if (event.key === '[') {
      event.preventDefault()
      stepSection(-1)
    } else if (event.key === ']') {
      event.preventDefault()
      stepSection(1)
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
}
