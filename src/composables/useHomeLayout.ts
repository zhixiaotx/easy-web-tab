/**
 * 工作台主页卡片布局控制器（模块级单例：主页只有一个实例）。
 * 负责：编辑模式开关、卡片宽高/位置（order）读取与持久化、拖拽改尺寸、前/后移动、单卡/整页重置。
 * 布局写入 settingsStore.homeCardLayout（卡片 id → { w(列跨度) / h(最小高度) / o(排序) }）。
 */
import { computed, ref, watch } from 'vue'
import { useAppSettingsStore } from '@/stores/settings'
import type { HomeCardLayout } from '@/types'

export type ContainerId = 'action' | 'overview' | 'tools'

/** 每个网格容器的卡片 id 顺序（默认）与最大列数（resize 宽度上限，避免跨屏越界）。 */
export const LAYOUT_CONTAINERS: Record<ContainerId, { ids: string[]; maxCols: number }> = {
  action: {
    ids: ['quick-add-todo', 'quick-add-note', 'upcoming', 'weather'],
    maxCols: 2
  },
  overview: {
    ids: [
      'todos', 'notes', 'countdowns', 'passwords',
      'exercise', 'diet', 'sleep', 'weight', 'ledger', 'habits', 'habits-week'
    ],
    maxCols: 5
  },
  tools: {
    ids: ['pending-todos', 'calendar-anchor'],
    maxCols: 2
  }
}

const CONTAINER_OF: Record<string, ContainerId> = {}
for (const [c, def] of Object.entries(LAYOUT_CONTAINERS)) {
  for (const id of def.ids) CONTAINER_OF[id] = c as ContainerId
}

const W_STEP_PX = 48 // 水平拖拽每 48px 调整 1 列跨度

// ===== 模块级单例状态 =====
let store: ReturnType<typeof useAppSettingsStore> | null = null
const editMode = ref(false)
const local = ref<Record<string, HomeCardLayout>>({})
const resizing = ref<string | null>(null)
let watchReady = false

function ensure(): void {
  if (!store) store = useAppSettingsStore()
  if (!watchReady) {
    watchReady = true
    watch(
      () => store!.homeCardLayout,
      (v) => { local.value = { ...v } },
      { deep: true }
    )
  }
  local.value = { ...store.homeCardLayout }
}

function getLayout(id: string): HomeCardLayout {
  return local.value[id] ?? {}
}

/** 容器内按 o 覆盖默认顺序的有效排序。 */
function orderedIds(container: ContainerId): string[] {
  const def = LAYOUT_CONTAINERS[container]
  return [...def.ids].sort((a, b) => {
    const oa = local.value[a]?.o ?? def.ids.indexOf(a)
    const ob = local.value[b]?.o ?? def.ids.indexOf(b)
    return oa - ob
  })
}

/** 计算某卡片在网格中的 style（列跨度 / 最小高度 / 排序）。defaultW = 无自定义宽度时的默认列数。 */
function cardStyle(id: string, defaultW: number): Record<string, string> {
  const lay = getLayout(id)
  const style: Record<string, string> = {}
  const w = lay.w ?? defaultW
  if (w > 1) style.gridColumn = `span ${w}`
  if (lay.h !== undefined) style.minHeight = `${lay.h}px`
  if (lay.o !== undefined) style.order = String(lay.o)
  return style
}

/** 前移(-1) / 后移(+1)：与当前有序列表中的相邻卡片交换 o 值并持久化。 */
function moveCard(id: string, dir: -1 | 1): void {
  ensure()
  const container = CONTAINER_OF[id]
  if (!container) return
  const order = orderedIds(container)
  const idx = order.indexOf(id)
  const target = idx + dir
  if (target < 0 || target >= order.length) return
  const other = order[target]
  const def = LAYOUT_CONTAINERS[container]
  const oThis = local.value[id]?.o ?? def.ids.indexOf(id)
  const oOther = local.value[other]?.o ?? def.ids.indexOf(other)
  store!.setHomeCardLayout(id, { o: oOther })
  store!.setHomeCardLayout(other, { o: oThis })
  local.value = { ...store!.homeCardLayout }
}

/** 重置单卡：传空布局 → store 移除该条目。 */
function resetCard(id: string): void {
  ensure()
  store!.setHomeCardLayout(id, {})
  local.value = { ...store!.homeCardLayout }
}

/** 整页重置：清空全部自定义布局。 */
function resetAll(): void {
  ensure()
  store!.resetHomeCardLayout()
  local.value = {}
}

/** 拖拽调整宽高（pointer 事件）：实时改本地预览，松手才持久化一次。 */
function startResize(id: string, ev: PointerEvent): void {
  ensure()
  const container = CONTAINER_OF[id]
  if (!container) return
  ev.preventDefault()
  ev.stopPropagation()
  const maxCols = LAYOUT_CONTAINERS[container].maxCols
  const start = getLayout(id)
  const startW = start.w ?? 1
  const startH = start.h ?? 0
  const startX = ev.clientX
  const startY = ev.clientY
  resizing.value = id
  const onMove = (e: PointerEvent) => {
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    let w = startW + Math.round(dx / W_STEP_PX)
    w = Math.min(maxCols, Math.max(1, w))
    let h = startH + dy
    if (h < 0) h = 0
    h = Math.min(1200, h)
    const cur = local.value[id] ?? {}
    local.value = { ...local.value, [id]: { ...cur, w, h: h === 0 ? undefined : h } }
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    resizing.value = null
    const cur = local.value[id] ?? {}
    store!.setHomeCardLayout(id, { w: cur.w, h: cur.h })
    local.value = { ...store!.homeCardLayout }
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

export function useHomeLayout() {
  ensure()
  const hasCustom = computed(() => Object.keys(local.value).length > 0)
  return {
    editMode,
    local,
    resizing,
    hasCustom,
    LAYOUT_CONTAINERS,
    CONTAINER_OF,
    getLayout,
    orderedIds,
    cardStyle,
    moveCard,
    resetCard,
    resetAll,
    startResize
  }
}
