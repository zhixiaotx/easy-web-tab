// 工作台面板自适应分页 composable。
// 核心公式全部委托 panelPagingCore 纯函数（calcRowsPerPage/clampPage/slicePage），组件禁止内联重算。
// 设计契约（计划 R1-R9）：pageSize = rowsPerPage × colsPerRow；列数经 gridRef 实时测
// gridTemplateColumns（auto-fill minmax 网格）；≤768px 分页惰性（渲染全量、不切片）；
// fitsOnePage 驱动列表区 overflow-y:auto 兜底（R7）；区域未渲染时 RO 不挂、分页惰性（R8）。
// 多实例安全（普通工厂函数；便签面板 'all' 视图会用 2 个实例）。
import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from 'vue'
import { calcRowsPerPage, clampPage, slicePage } from './panelPagingCore'

/** 桌面断点：≥769px 启用自适应分页；≤768px（移动端）分页惰性（R2）。 */
const DESKTOP_MEDIA_QUERY = '(min-width: 769px)'

/** ResizeObserver 不可用（老旧环境）时的兜底每页行数：无法测量 → 固定 6 行。 */
const FALLBACK_ROWS_PER_PAGE = 6

/** 行间距缺省（px），与 calcRowsPerPage 的 gap 缺省一致。 */
const DEFAULT_GAP = 12

export interface PanelPagingOptions<T> {
  /** 完整「已筛选/已排序」列表 getter（每次读取返回最新列表；返回的数组引用变化时触发页码钳制）。 */
  items: () => T[]
  /** 每行（卡片/行条目）最大外高 px（来自 .omo/evidence/workbench-onescreen/row-heights.json 实测，MAX + 2px margin，R4）。 */
  rowHeight: number
  /** 行间距 px，默认 12。 */
  gap?: number
  /** flex:1 列表区 DOM（ResizeObserver 测量可用高度）；条件渲染列表未挂载时为 null → 分页惰性（R8）。 */
  containerRef: Ref<HTMLElement | null>
  /** 可选：网格元素（auto-fill minmax 网格），实时读取真实列数（R3）；行式列表不传 → colsPerRow 恒 1。 */
  gridRef?: Ref<HTMLElement | null>
}

export interface PanelPaging<T> {
  /** 是否桌面（≥769px）；false 时分页惰性：pageItems 全量、totalPages 恒 1、pager 隐藏。 */
  isDesktop: Ref<boolean>
  /** 每页行数（RO 实测；0 = 尚未测量/区域未渲染）。 */
  rowsPerPage: Ref<number>
  /** 每行列数（gridTemplateColumns 实测；无 gridRef → 1）。 */
  colsPerRow: Ref<number>
  /** 当前页（1 起，经 clampPage 钳制）。 */
  currentPage: Ref<number>
  /** 总页数（desktop 下 max(1, ceil(len / (rows*cols)))，否则恒 1）。 */
  totalPages: ComputedRef<number>
  /** 当前页条目（desktop 下 slicePage 切片；移动端返回全量 items()）。 */
  pageItems: ComputedRef<T[]>
  /** 一屏能否容纳 ≥1 整行（availH ≥ rowHeight + gap，R7）：false 时列表区回退 overflow-y:auto 兜底。 */
  fitsOnePage: ComputedRef<boolean>
  /** 下一页（钳制）。 */
  next(): void
  /** 上一页（钳制）。 */
  prev(): void
  /** 跳转指定页（钳制）。 */
  goto(p: number): void
}

/** 读取网格真实列数：gridTemplateColumns 拆空格计数；'none'/空串/解析 < 1 → 1（R3）。 */
function readGridCols(grid: HTMLElement): number {
  const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length
  return cols >= 1 ? cols : 1
}

export function usePanelPaging<T>(opts: PanelPagingOptions<T>): PanelPaging<T> {
  const gap = opts.gap ?? DEFAULT_GAP
  const roAvailable = typeof ResizeObserver !== 'undefined'

  const isDesktop = ref(false)
  const rowsPerPage = ref(0) // 0 = 尚未测量（区域未渲染/RO 未回调）→ pageSize 0 → 分页惰性
  const colsPerRow = ref(1)
  const currentPage = ref(1)
  const availHeight = ref(0) // 最新 RO 实测可用高度（fitsOnePage 依赖）

  // --- 桌面检测（R2）：matchMedia 监听 change，onScopeDispose 移除
  const mql = window.matchMedia(DESKTOP_MEDIA_QUERY)
  isDesktop.value = mql.matches
  const onMediaChange = (e: MediaQueryListEvent): void => {
    isDesktop.value = e.matches
  }
  mql.addEventListener('change', onMediaChange)

  // --- 分页参数（核心公式走 panelPagingCore）
  const pageSize = computed(() => rowsPerPage.value * colsPerRow.value)

  const totalPages = computed(() => {
    if (!isDesktop.value) return 1 // R2：移动端惰性
    const size = pageSize.value
    if (size <= 0) return 1 // R8：区域未渲染/未测量 → 惰性
    return Math.max(1, Math.ceil(opts.items().length / size))
  })

  const pageItems = computed<T[]>(() => {
    if (!isDesktop.value) return opts.items() // R2：移动端渲染全量
    return slicePage(opts.items(), currentPage.value, pageSize.value)
  })

  const fitsOnePage = computed(() => isDesktop.value && availHeight.value >= opts.rowHeight + gap)

  // --- ResizeObserver：容器测高 + 网格测列（R3）；区域未渲染时不挂（R8）
  let ro: ResizeObserver | null = null
  let observedContainer: HTMLElement | null = null
  let observedGrid: HTMLElement | null = null

  function observeGrid(): void {
    const grid = opts.gridRef?.value ?? null
    if (grid === observedGrid) return
    if (observedGrid && ro) ro.unobserve(observedGrid)
    observedGrid = grid
    if (grid && ro) ro.observe(grid)
    colsPerRow.value = grid ? readGridCols(grid) : 1
  }

  function attachRo(el: HTMLElement): void {
    ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === observedContainer) {
          availHeight.value = entry.contentRect.height
          rowsPerPage.value = calcRowsPerPage(entry.contentRect.height, opts.rowHeight, gap)
        } else if (entry.target === observedGrid && observedGrid) {
          colsPerRow.value = readGridCols(observedGrid) // 宽度变化（列数变化）→ 重读列数
        }
      }
    })
    observedContainer = el
    ro.observe(el)
    observeGrid()
  }

  function detachRo(): void {
    ro?.disconnect()
    ro = null
    observedContainer = null
    observedGrid = null
  }

  // 容器挂载/卸载：挂载后（RO 可用）立即测量；卸载 → 分页惰性（rowsPerPage 0）
  watch(
    opts.containerRef,
    (el) => {
      detachRo()
      availHeight.value = 0
      if (!el) {
        rowsPerPage.value = 0
        return
      }
      if (!roAvailable) {
        rowsPerPage.value = FALLBACK_ROWS_PER_PAGE // RO 不可用 → 兜底常量
        return
      }
      rowsPerPage.value = 0 // RO 回调前保持惰性（回调在渲染前送达，首帧不可见）
      attachRo(el)
    },
    { immediate: true }
  )

  // 网格元素变化（条件渲染/类名切换）→ 重读列数；RO 已挂时同步观察目标。
  // 仅当调用方传入 gridRef 才挂 watch（可选参数，undefined 源会被 Vue 判为非法 watch 源）。
  if (opts.gridRef) {
    watch(
      opts.gridRef,
      () => {
        if (ro) observeGrid()
        else colsPerRow.value = opts.gridRef?.value ? readGridCols(opts.gridRef.value) : 1
      },
      { immediate: true }
    )
  }

  // 页码钳制：items/行数/列数/桌面态任一变化 → clampPage（不自动回 1，筛选变化由调用方 goto(1)）
  watch([opts.items, rowsPerPage, colsPerRow, isDesktop], () => {
    currentPage.value = clampPage(currentPage.value, totalPages.value)
  })

  // --- 清理：matchMedia 监听 + RO 断开
  onScopeDispose(() => {
    mql.removeEventListener('change', onMediaChange)
    detachRo()
  })

  function next(): void {
    currentPage.value = clampPage(currentPage.value + 1, totalPages.value)
  }
  function prev(): void {
    currentPage.value = clampPage(currentPage.value - 1, totalPages.value)
  }
  function goto(p: number): void {
    currentPage.value = clampPage(p, totalPages.value)
  }

  return {
    isDesktop,
    rowsPerPage,
    colsPerRow,
    currentPage,
    totalPages,
    pageItems,
    fitsOnePage,
    next,
    prev,
    goto
  }
}
