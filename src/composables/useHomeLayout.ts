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
      'exercise', 'diet', 'sleep', 'weight', 'ledger', 'habits'
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

/** 分区中文名（设置面板「主页卡片尺寸」的分组标题） */
export const CONTAINER_LABELS: Record<ContainerId, string> = {
  action: '行动台',
  overview: '数据概览',
  tools: '工具'
}

/**
 * 卡片中文名（设置面板「主页卡片尺寸」逐行渲染用；与 WorkbenchHome.vue 里各卡的
 * 可见标题保持一致）。新增卡片时请同步登记，未登记的 id 在面板里回退显示 id 本身。
 */
export const CARD_LABELS: Record<string, string> = {
  // 行动台
  'quick-add-todo': '快速添加待办',
  'quick-add-note': '快速添加便签',
  upcoming: '即将到期提醒',
  weather: '天气',
  // 数据概览
  todos: '待办任务',
  notes: '便签',
  countdowns: '定时提醒',
  passwords: '密码',
  exercise: '运动',
  diet: '饮食',
  sleep: '睡眠',
  weight: '体重',
  ledger: '记账',
  habits: '习惯打卡',
  // 工具
  'pending-todos': '未完成待办',
  'calendar-anchor': '日历锚点'
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

/** 某卡片在所属容器内的有效排序值：自定义 o 优先，否则取容器内默认序号（保证所有卡 order 基线一致）。 */
function effectiveOrder(id: string): number {
  const c = CONTAINER_OF[id]
  const def = c ? LAYOUT_CONTAINERS[c] : null
  const lay = local.value[id] ?? {}
  if (typeof lay.o === 'number' && Number.isFinite(lay.o)) return lay.o
  return def ? def.ids.indexOf(id) : 0
}

/** 计算某卡片在网格中的 style（列跨度 / 最小高度 / 排序）。defaultW = 无自定义宽度时的默认列数。 */
function cardStyle(id: string, defaultW: number): Record<string, string> {
  const lay = getLayout(id)
  const style: Record<string, string> = {}
  const w = lay.w ?? defaultW
  if (w > 1) style.gridColumn = `span ${w}`
  if (lay.h !== undefined) style.minHeight = `${lay.h}px`
  // 始终输出 order（默认序号兜底）：避免未自定义卡 order:0 被挤到末尾，导致换位后错位
  style.order = String(effectiveOrder(id))
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
  scheduleCloudPush()
}

// ===== 卡片尺寸（设置面板「主页卡片尺寸」）：宽 = 列跨度、高 = 最小高度 px =====

/** 单卡宽度上限 = 所属网格的列数（grid span 超过列数会被浏览器钳到列数，故 UI 直接按此 clamp） */
function maxWidthOf(id: string): number {
  const c = CONTAINER_OF[id]
  return c ? LAYOUT_CONTAINERS[c].maxCols : 1
}

/**
 * 设置单卡尺寸（仅改传入的字段，其余字段原样保留）。
 *
 * 关键：store.setHomeCardLayout 的语义是「patch 里缺失的字段会被删除」，
 * 所以这里必须先把该卡现有布局整包带上（含排序值 o），否则改宽高会连带
 * 清掉用户拖出来的排序。同理用 `'w' in patch` 判定"是否要改这一项"，
 * 而不是判 undefined —— 传 { w: undefined } 才能表达"清除宽度回默认"。
 */
function setCardSize(id: string, patch: HomeCardLayout): void {
  ensure()
  const cur = store!.homeCardLayout[id] ?? {}
  const next: HomeCardLayout = { ...cur }
  if ('w' in patch) {
    const v = patch.w
    if (v === undefined || !Number.isFinite(v)) delete next.w
    else next.w = Math.min(maxWidthOf(id), Math.max(1, Math.round(v)))
  }
  if ('h' in patch) {
    const v = patch.h
    if (v === undefined || !Number.isFinite(v)) delete next.h
    else next.h = v // 60-1200 的 clamp 由 store.setHomeCardLayout 统一负责
  }
  store!.setHomeCardLayout(id, next)
  local.value = { ...store!.homeCardLayout }
  scheduleCloudPush()
}

/** 单卡尺寸恢复默认（只清 w/h，保留该卡已拖出来的排序值 o） */
function resetCardSize(id: string): void {
  ensure()
  const cur = store!.homeCardLayout[id] ?? {}
  store!.setHomeCardLayout(id, typeof cur.o === 'number' ? { o: cur.o } : {})
  local.value = { ...store!.homeCardLayout }
  scheduleCloudPush()
}

/** 全部卡片尺寸恢复默认（同样只清 w/h，逐卡保留排序值 o） */
function resetAllCardSizes(): void {
  ensure()
  const snapshot = { ...store!.homeCardLayout }
  for (const id of Object.keys(snapshot)) {
    const cur = snapshot[id] ?? {}
    store!.setHomeCardLayout(id, typeof cur.o === 'number' ? { o: cur.o } : {})
  }
  local.value = { ...store!.homeCardLayout }
  scheduleCloudPush()
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

// ===== 网格容器级兜底：松手在卡片空隙时取光标最近卡片作为目标，保证每次拖拽都落库 =====
function handleContainerDragOver(_container: ContainerId, event: DragEvent): void {
  event.preventDefault()
  if (!dragSourceId.value) return
  const el = event.currentTarget as HTMLElement | null
  if (!el) return
  const cards = Array.from(el.querySelectorAll<HTMLElement>('[data-card-id]'))
  if (!cards.length) return
  const x = event.clientX
  const y = event.clientY
  let nearest: string | null = null
  let best = Infinity
  for (const c of cards) {
    const r = c.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const d = Math.hypot(x - cx, y - cy)
    if (d < best) {
      best = d
      nearest = c.getAttribute('data-card-id')
    }
  }
  if (nearest && nearest !== dragSourceId.value) {
    dragOverId.value = nearest
  }
}

function handleContainerDrop(container: ContainerId): void {
  const src = dragSourceId.value
  const tgt = dragOverId.value
  if (src && tgt && src !== tgt && CONTAINER_OF[tgt] === container) {
    reorderCard(src, tgt)
  }
  dragSourceId.value = null
  dragOverId.value = null
}

// ===== 调整后立即云同步：开启云同步时，拖完防抖（600ms）静默【直接推送】=====
// 注意：必须用 pushNow（只推不拉），不能用 syncNow（先拉后推）。
// 原因：syncNow 走 pullNow 的「dirty 且 remoteTs<=localTs」静默合并分支，
// 会先 applyRemote(merged)（内部 clearDirty）→ 再 pushNow；若这一步 pushNow
// 因瞬时网络/WebDAV 失败，dirty 已被清空、但云端仍是旧顺序，后续后台拉取
// （visibilitychange / 轮询）命中 !dirty 分支 applyRemote(remote) → 用旧顺序覆盖本地，
// 表现为「顺序调整完立刻被云同步恢复」。改为 pushNow 后：成功则云端已含新顺序且
// clearDirty；失败则 dirty 保持置位、本地不被覆盖，下次自动同步仍走 dirty 分支保护本地。
let pushTimer: ReturnType<typeof setTimeout> | null = null
function scheduleCloudPush(): void {
  if (!store) return
  if (!store.cloudSyncEnabled) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    // 动态导入避免与 useCloudSync 形成静态依赖环；silent=true 不弹 toast
    import('@/composables/useCloudSync')
      .then((m) => m.useCloudSync().pushNow(true))
      .catch(() => {})
  }, 600)
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
    effectiveOrder,
    cardStyle,
    maxWidthOf,
    setCardSize,
    resetCardSize,
    resetAllCardSizes,
    reorderCard,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    handleContainerDragOver,
    handleContainerDrop
  }
}
