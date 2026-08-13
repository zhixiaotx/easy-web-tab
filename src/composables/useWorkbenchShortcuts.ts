import { onMounted, onUnmounted, type Ref } from 'vue'

/**
 * 工作台快捷键（仅 /workbench 页面生效，由 WorkbenchView 挂载）：
 *
 * - Alt+K：打开全局搜索浮层。焦点在输入类元素（INPUT/TEXTAREA/SELECT/contenteditable）时跳过，
 *   避免打断打字（如便签/待办表单）。
 * - Ctrl+Alt+1..9：跳转左侧菜单第 1..9 项（按设置 store 当前菜单顺序映射：
 *   Ctrl+Alt+1=index0 主页 … Ctrl+Alt+9=index8，菜单重排后跟随新位置；禁用裸 Ctrl+1..9）。
 * - Esc：关闭全局搜索浮层（幂等；浮层自身也处理 Esc，双保险不重复触发）。
 */
export interface WorkbenchShortcutsOptions {
  /** 全局搜索浮层开合状态（视图持有，本 composable 只读/写回）。 */
  spotlightOpen: Ref<boolean>
  /** 当前菜单顺序键（settingsStore.workbenchMenuItems → map(i => i.key)，键按序对应 Ctrl+Alt+1..N）。 */
  getMenuKeys: () => readonly string[]
  /** 跳转到工作台分区（key 已由调用方白名单收窄）。 */
  onNavigate: (key: string) => void
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

    // Ctrl+Alt+1..9：跳转菜单第 1..9 项（输入框内同样生效，与 Alt+K 的 skip-input 语义区分）。
    // 全量映射：数字 n → menuKeys[n-1]（settingsStore.workbenchMenuItems 当前位置序），
    // 菜单恒归一化为 9 项，Ctrl+Alt+9=index8 → ledger；菜单重排后跟随新位置。
    if (event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey && /^[1-9]$/.test(event.key)) {
      const idx = Number(event.key) - 1
      const menuKeys = options.getMenuKeys()
      if (idx < menuKeys.length) {
        event.preventDefault()
        options.onNavigate(menuKeys[idx])
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
