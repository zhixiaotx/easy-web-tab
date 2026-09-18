import { ref, watch } from 'vue'

/** 可选的每页条数（各面板统一） */
export const PAGE_SIZES = [10, 20, 50]

const STORAGE_PREFIX = 'ewt-page-size:'

/**
 * 每页条数：可切换并持久化到 localStorage。
 *
 * 背景：原先各面板把每页条数写死成常量（LIST_PAGE_SIZE = 10）并传给
 * `:page-sizes="[LIST_PAGE_SIZE]"` —— 单元素数组等于没有"每页条数"选择器，
 * 用户永远只能看 10 条。这里改成真实可选的 10/20/50，并把选择记住。
 *
 * 用法：
 *   const { pageSize, PAGE_SIZES } = usePageSize('td-list-pager', LIST_PAGE_SIZE)
 *   // 模板：v-model:page-size="pageSize"  :page-sizes="PAGE_SIZES"
 *   // 切片逻辑里用 pageSize.value（替代原来的常量），否则条数改了切片不变。
 *
 * @param key  持久化键（传分页容器类名即可，保证各面板互不干扰）
 * @param fallback 默认值；同时用于校验历史值合法
 */
export function usePageSize(key: string, fallback = 10) {
  const storageKey = STORAGE_PREFIX + key
  let initial = fallback
  try {
    const raw = localStorage.getItem(storageKey)
    const n = raw == null ? NaN : Number(raw)
    if (Number.isFinite(n) && PAGE_SIZES.includes(n)) initial = n
  } catch {
    /* localStorage 不可用（隐私模式/配额）时静默回落默认值 */
  }

  const pageSize = ref(initial)

  watch(pageSize, (v) => {
    try {
      localStorage.setItem(storageKey, String(v))
    } catch {
      /* 写入失败不影响使用，仅本次会话生效 */
    }
  })

  return { pageSize, PAGE_SIZES }
}
