/**
 * 工作台主页卡片布局控制器（模块级单例：主页只有一个实例）。
 * 卡片顺序（order）持久化到 settingsStore.homeCardLayout（卡片 id → { w/h/o }）。
 * 排序交互：参考网站管理卡片（SiteCard / HomeView）—— 原生 HTML5 拖拽
 * （draggable + dragstart/dragover/drop），拖起某卡落到另一卡上即交换两者顺序并落库。
 */
import { ref, watch } from 'vue'
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

// ===== 模块级单例状态 =====
let store: ReturnType<typeof useAppSettingsStore> | null = null
const local = ref<Record<string, HomeCardLayout>>({})
const dragSourceId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)
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

/** 容器内按 o 覆盖默认顺序的有效排序（CSS order 复用此值）。 */
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

/** 拖拽排序：把 from 卡与 to 卡的顺序对调（仅限同一容器内；跨容器忽略）。 */
function reorderCard(fromId: string, toId: string): void {
  ensure()
  if (fromId === toId) return
  const cFrom = CONTAINER_OF[fromId]
  const cTo = CONTAINER_OF[toId]
  if (!cFrom || cFrom !== cTo) return
  const def = LAYOUT_CONTAINERS[cFrom]
  const oFrom = local.value[fromId]?.o ?? def.ids.indexOf(fromId)
  const oTo = local.value[toId]?.o ?? def.ids.indexOf(toId)
  store!.setHomeCardLayout(fromId, { o: oTo })
  store!.setHomeCardLayout(toId, { o: oFrom })
  local.value = { ...store!.homeCardLayout }
}

// ===== 原生拖拽事件（对齐网站管理卡片 HomeView 的 swapSort 行为）=====
function handleDragStart(id: string): void {
  dragSourceId.value = id
}

function handleDragOver(id: string, event: DragEvent): void {
  event.preventDefault()
  if (dragSourceId.value && dragSourceId.value !== id) {
    dragOverId.value = id
  }
}

function handleDragLeave(): void {
  dragOverId.value = null
}

function handleDrop(id: string): void {
  if (dragSourceId.value && dragSourceId.value !== id) {
    reorderCard(dragSourceId.value, id)
  }
  dragSourceId.value = null
  dragOverId.value = null
}

function handleDragEnd(): void {
  dragSourceId.value = null
  dragOverId.value = null
}

export function useHomeLayout() {
  ensure()
  return {
    local,
    dragSourceId,
    dragOverId,
    LAYOUT_CONTAINERS,
    CONTAINER_OF,
    getLayout,
    orderedIds,
    cardStyle,
    reorderCard,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd
  }
}
