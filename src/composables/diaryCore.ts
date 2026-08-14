// 工作台日记本纯逻辑模块：normalizeDiaryData 归一化 → sortDiaryEntries/findDiaryByDate 展示层。
// 纯函数硬约束：禁止 import vue/pinia（node --experimental-strip-types 测试运行器无法执行）；
// 类型全部 type-only（与 noteCore 同模式）。
import type { DiaryData, WorkbenchDiary } from '../types/index.ts'

/** 空日记数据：无条目（返回全新结构，不共享任何引用）。 */
export function emptyDiaryData(): DiaryData {
  return { entries: [] }
}

/** 本地日期键正则：结构 ^\d{4}-\d{2}-\d{2}$（不含时间部分）。 */
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 日期键校验：正则 + 范围检查（月 1-12 / 日 1-31），镜像便签 datetime 校验语义
 * （纯正则无法拒绝 '2026-13-99'；同日仅 1-31 范围、不校验当月天数 → '2026-02-30' 通过）。
 */
export function isValidDateKey(key: string): boolean {
  if (typeof key !== 'string' || !DATE_KEY_RE.test(key)) return false
  const [, m, d] = key.split('-').map(Number)
  return m >= 1 && m <= 12 && d >= 1 && d <= 31
}

/** 本地日期 → 'YYYY-MM-DD'（不能用 toISOString，那是 UTC 会偏一天；与 todoCore.localToday 同源防偏移）。 */
export function dateKeyOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 中文星期标签（getDay() 0=周日 .. 6=周六）。 */
const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

/**
 * 日期标签：'YYYY-MM-DD' → 'YYYY-MM-DD 周X'（含中文星期）。
 * 非法日期键原样返回（不吞不抛）。
 */
export function diaryDateLabel(dateKey: string): string {
  if (!isValidDateKey(dateKey)) return dateKey
  const [y, m, d] = dateKey.split('-').map(Number)
  return `${dateKey} ${WEEKDAY_CN[new Date(y, m - 1, d).getDay()]}`
}

/**
 * 单条日记归一化（幂等，脏数据吞掉不抛错）：
 * - 非对象 → null（剔除，不生成兜底条目）
 * - date 缺失/非法（isValidDateKey 拒绝）→ null（剔除）
 * - id 缺失/非字符串 → 回退 `dy_<date>`（与 store.upsertEntry 的 dy_ 前缀一致）
 * - content 非字符串 → ''（字符串原样保留，不 trim——正文空格属用户内容）
 * - createdAt/updatedAt 非法/缺失 → 当前 ISO 字符串
 */
function normalizeDiaryEntry(raw: unknown): WorkbenchDiary | null {
  if (!raw || typeof raw !== 'object') return null
  const src = raw as Record<string, unknown>
  const date = typeof src.date === 'string' ? src.date : ''
  if (!isValidDateKey(date)) return null
  const nowIso = new Date().toISOString()
  return {
    id: typeof src.id === 'string' && src.id ? src.id : `dy_${date}`,
    date,
    content: typeof src.content === 'string' ? src.content : '',
    createdAt: typeof src.createdAt === 'string' ? src.createdAt : nowIso,
    updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : nowIso
  }
}

/**
 * 整库归一化（幂等）：
 * - 非对象入参（null/数字/字符串/数组）→ emptyDiaryData()
 * - 对象含 entries 数组 → 逐条归一（非对象/非法 date 剔除，缺失 id 回退，content 强转）
 * - entries 非数组/缺失 → []
 */
export function normalizeDiaryData(raw: unknown): DiaryData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyDiaryData()
  const src = raw as Record<string, unknown>
  const entries = Array.isArray(src.entries)
    ? src.entries.map(normalizeDiaryEntry).filter((e): e is WorkbenchDiary => e !== null)
    : []
  return { entries }
}

/** 日记排序：date 降序（新的在前）→ createdAt 降序（同日期后写的在前）。返回新数组，不 mutate 入参。 */
export function sortDiaryEntries(entries: WorkbenchDiary[]): WorkbenchDiary[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
    return 0
  })
}

/** 按日期查找日记条目：dateKey 精确匹配，未命中 → undefined。 */
export function findDiaryByDate(entries: WorkbenchDiary[], dateKey: string): WorkbenchDiary | undefined {
  return entries.find(e => e.date === dateKey)
}
