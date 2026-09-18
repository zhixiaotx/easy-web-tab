import { onMounted, onUnmounted } from 'vue'

export interface KeyboardShortcutsOptions {
  onCloseModal?: () => void
  onToggleTheme?: () => void
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

  function handleKeydown(event: KeyboardEvent) {
    const isMod = isMac ? event.metaKey : event.ctrlKey

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
      toggleTheme: isMac ? '⌘D' : 'Ctrl+D',
      closeModal: 'ESC'
    }
  }
}
