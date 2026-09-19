import { shallowRef, readonly } from 'vue'

// Singleton state - shared across all components (same pattern as useToast.ts)
const showHelp = shallowRef(false)

// 帮助页「知道了」按钮累计点击次数，持久化于 nav.json 偏好（localStorage key 见下）。
// 默认 0：网站加载时自动弹出帮助页；大于 0 不再自动弹出。
const HELP_ACK_KEY = 'help-ack-count'
// 保证「网站加载时」只自动弹一次：路由来回切回首页不会反复弹出
let autoOpenShown = false

export function getHelpAckCount(): number {
  const raw = localStorage.getItem(HELP_ACK_KEY)
  const n = raw === null ? 0 : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function incrementHelpAckCount(): number {
  const next = getHelpAckCount() + 1
  localStorage.setItem(HELP_ACK_KEY, String(next))
  return next
}

export function useHelpModal() {
  const openHelp = () => { showHelp.value = true }
  const closeHelp = () => { showHelp.value = false }

  /**
   * 网站加载时调用一次：helpAckCount 为 0（首次访问 / 尚未点过「知道了」）则自动弹出帮助页；
   * 大于 0 不再自动弹出。autoOpenShown 保证整个页面生命周期内只触发一次，
   * 避免路由回退到首页时反复弹出。
   */
  const maybeAutoOpenHelp = () => {
    if (autoOpenShown) return
    autoOpenShown = true
    if (getHelpAckCount() === 0) openHelp()
  }

  return {
    showHelp: readonly(showHelp),
    openHelp,
    closeHelp,
    maybeAutoOpenHelp,
    getHelpAckCount,
    incrementHelpAckCount
  }
}
