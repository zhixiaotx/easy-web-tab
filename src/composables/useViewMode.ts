import { ref, onMounted, onUnmounted } from 'vue'

// 统一「列表 / 卡片」视图模式：
// - 移动端（≤768px）强制卡片视图
// - PC 端默认列表，可通过切换按钮在两者间切换
// 状态为组件实例局部状态，互不干扰；不持久化（符合「PC 默认列表 / 手机默认卡片」）。

const MOBILE_QUERY = '(max-width: 768px)'

export function useViewMode() {
  const isMobile = ref(false)
  const mode = ref<'list' | 'card'>('list')
  let mql: MediaQueryList | null = null
  let handler: ((e: MediaQueryListEvent) => void) | null = null

  const apply = (matches: boolean) => {
    isMobile.value = matches
    mode.value = matches ? 'card' : 'list'
  }

  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    mql = window.matchMedia(MOBILE_QUERY)
    apply(mql.matches)
    handler = (e: MediaQueryListEvent) => apply(e.matches)
    mql.addEventListener('change', handler)
  })

  onUnmounted(() => {
    if (mql && handler) mql.removeEventListener('change', handler)
  })

  const toggle = () => {
    if (isMobile.value) return
    mode.value = mode.value === 'list' ? 'card' : 'list'
  }

  return { mode, isMobile, toggle }
}
