import { onMounted, onUnmounted, type Ref } from 'vue'

/**
 * 工作台快捷键（仅 /workbench 页面生效，由 WorkbenchView 挂载）：
 *
 * - Alt+K：打开全局搜索浮层。焦点在输入类元素（INPUT/TEXTAREA/SELECT/contenteditable）时跳过，
 *   避免打断打字（如便签/待办表单）。
 * - Ctrl+Alt+1..7：跳转左侧菜单第 1..7 项（按设置 store 当前菜单顺序，跟随用户排序）。
 * - Ctrl+Alt+8：打开全局搜索浮层（Alt+K 同义显式映射）。
 * - Ctrl+Alt+9：折叠/展开侧栏。
 * - Esc：关闭全局搜索浮层（幂等；浮层自身也处理 Esc，双保险不重复触发）。
 */
export interface WorkbenchShortcutsOptions {
  /** 全局搜索浮层开合状态（视图持有，本 composable 只读/写回）。 */
  spotlightOpen: Ref<boolean>
  /** 当前菜单顺序键（settingsStore.workbenchMenuItems → map(i => i.key)，键按序对应 Ctrl+Alt+1..N）。 */
  getMenuKeys: () => readonly string[]
  /** 跳转到工作台分区（key 已由调用方白名单收窄）。 */
  onNavigate: (key: string) => void
  /** 折叠/展开侧栏。 */
  onToggleSidebar: () => void
}

/** 输入类元素判定：焦点在其中时不劫持快捷键（Alt+K / Ctrl+Alt+digit 均跳过）。 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function useWorkbenchShortcuts(options: WorkbenchShortcutsOptions) {
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

    // Ctrl+Alt+1..9：菜单跳转 / 全局搜索 / 侧栏折叠（输入框内同样生效，与 Alt+K 的 skip-input 语义区分）
    // 菜单跳转仅覆盖前 7 位（idx 0..6）：Ctrl+Alt+8/9 恒为全局搜索/侧栏折叠，不随菜单项数量增长被吞掉。
    if (event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey && /^[1-9]$/.test(event.key)) {
      const idx = Number(event.key) - 1
      const menuKeys = options.getMenuKeys()
      if (idx < 7 && idx < menuKeys.length) {
        event.preventDefault()
        options.onNavigate(menuKeys[idx])
      } else if (idx === 7) {
        // Ctrl+Alt+8 → 全局搜索
        event.preventDefault()
        options.spotlightOpen.value = true
      } else if (idx === 8) {
        // Ctrl+Alt+9 → 折叠/展开侧栏
        event.preventDefault()
        options.onToggleSidebar()
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
}
