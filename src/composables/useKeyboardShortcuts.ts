import { onMounted, onUnmounted } from 'vue'

export interface KeyboardShortcutsOptions {
  onAddSite?: () => void
  onCloseModal?: () => void
  onToggleTheme?: () => void
  onToggleAdmin?: () => void
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

  function handleKeydown(event: KeyboardEvent) {
    const isMod = isMac ? event.metaKey : event.ctrlKey

    // Ctrl/Cmd + N: 新增网址（通过 router.push 打开，避免被浏览器占用）
    if (isMod && event.key === 'n' && !event.shiftKey) {
      options.onAddSite?.()
      return
    }

    // Ctrl/Cmd + B: 切换后台/前台
    if (isMod && event.key === 'b' && !event.shiftKey) {
      event.preventDefault()
      options.onToggleAdmin?.()
      return
    }

    // Ctrl/Cmd + D: 切换暗色模式
    if (isMod && event.key === 'd') {
      event.preventDefault()
      options.onToggleTheme?.()
      return
    }

    // Escape: 关闭弹框
    if (event.key === 'Escape') {
      event.preventDefault()
      options.onCloseModal?.()
      return
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })

  return {
    isMac,
    shortcuts: {
      addSite: isMac ? '⌘N' : 'Ctrl+N',
      toggleAdmin: isMac ? '⌘B' : 'Ctrl+B',
      toggleTheme: isMac ? '⌘D' : 'Ctrl+D',
      closeModal: 'ESC'
    }
  }
}
