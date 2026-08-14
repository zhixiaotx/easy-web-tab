// 工作台面板自适应分页纯逻辑模块。
// 零 vue/pinia/DOM 依赖（node --experimental-strip-types 可运行）：
// calcRowsPerPage 按可用高度/行高算每页行数 → clampPage 钳制页码 → slicePage 切片。
// 运行期仅用 Math 与 Array.prototype.slice，无任何浏览器 API。
// 组件/视图禁止内联重算这些公式（usePanelPaging 统一消费）。

/**
 * 计算每页可容纳的行数（自适应分页核心公式）。
 *
 * 行槽高度 = rowHeight + gap（末行无需 gap 仍能放下，故分子加 gap）：
 * `Math.max(1, Math.floor((availableHeight + gap) / (rowHeight + gap)))`。
 * availableHeight <= 0 时返回 1（保证渲染区域至少容纳 1 行）。
 *
 * @param availableHeight 列表区可用高度（px，来自 ResizeObserver contentRect.height）
 * @param rowHeight 每行（卡片/行条目）最大外高（px）
 * @param gap 行间距（px），默认 12
 * @returns 每页行数，恒 >= 1
 */
export function calcRowsPerPage(availableHeight: number, rowHeight: number, gap = 12): number {
  if (availableHeight <= 0) return 1
  return Math.max(1, Math.floor((availableHeight + gap) / (rowHeight + gap)))
}

/**
 * 将页码钳制到 [1, totalPages] 区间。
 *
 * totalPages <= 0（空列表/分页惰性态）时返回 1；分数页码四舍五入后再钳制。
 *
 * @param page 目标页码（可越界/非整数）
 * @param totalPages 总页数
 * @returns 有效页码，恒 >= 1 且 <= max(1, totalPages)
 */
export function clampPage(page: number, totalPages: number): number {
  if (totalPages <= 0) return 1
  return Math.min(Math.max(1, Math.round(page)), totalPages)
}

/**
 * 取出第 page 页的条目切片（基于 pageSize 等分切片）。
 *
 * pageSize <= 0 时返回 []；页越界钳制到末页（空列表钳到第 1 页 → 空切片）。
 * 不修改入参（Array.prototype.slice 语义，返回新数组）。
 *
 * @param items 完整条目列表（readonly，不会被修改）
 * @param page 目标页码（1 起，可越界）
 * @param pageSize 每页条目数（= rowsPerPage × colsPerRow）
 * @returns 该页切片；非法入参返回空数组
 */
export function slicePage<T>(items: readonly T[], page: number, pageSize: number): T[] {
  if (pageSize <= 0) return []
  const totalPages = Math.ceil(items.length / pageSize)
  const p = clampPage(page, totalPages)
  return items.slice((p - 1) * pageSize, p * pageSize)
}
