// 全局倒计时提醒：分钟级 tick 检查到期 + 每天 9:00 本地时间弹出「最后 3 天」摘要。
// 单例 composable（同 useToast / useHelpModal 模式）：模块级 shallowRef + useX() 返回，非 Pinia。
// 仅由 init() 触发后才访问 Pinia store（init 在 App.vue onMounted 调用，此时 Pinia 已激活）。
import { shallowRef, readonly } from 'vue'
import { useCountdownsStore } from '@/stores/countdowns'
import { calcRemaining, getReminderDue } from '@/composables/countdownCore'

export interface CountdownReminderItem {
  id: string
  name: string
  label: string
}

export interface CountdownReminderState {
  open: boolean
  items: CountdownReminderItem[]
}

// 记录上次弹出 9:00 摘要的本地日期（YYYY-MM-DD）。与当天相同 → 当天已提醒，跳过。
export const STORAGE_KEY = 'user-countdown-reminder-date'

const REMIND_HOUR = 9
const TICK_MS = 60_000

// 单例状态：所有组件共享
const state = shallowRef<CountdownReminderState>({ open: false, items: [] })
let initialized = false

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// 本地日期 YYYY-MM-DD。勿用 toISOString()（UTC 会偏一天）。
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 合并新 items 到状态：已打开则并入现有（按 id 去重，保留首次出现），否则整体替换。
function pushItems(items: CountdownReminderItem[]): void {
  const merged = state.value.open ? [...state.value.items, ...items] : items
  const seen = new Set<string>()
  const deduped: CountdownReminderItem[] = []
  for (const item of merged) {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      deduped.push(item)
    }
  }
  state.value = { open: true, items: deduped }
}

// 分钟级 tick：到期发生时刻 → 记录 lastRemindedAt 并提醒；每天 9:00 后补「最后 3 天」摘要。
async function tick(): Promise<void> {
  const store = useCountdownsStore()
  await store.loadCountdowns()
  const items: CountdownReminderItem[] = []

  for (const c of store.countdowns) {
    const occ = getReminderDue(c.endDateTime, c.repeat, c.lastRemindedAt)
    if (occ !== null) {
      items.push({ id: c.id, name: c.name, label: occ.slice(5) })
      await store.updateCountdown(c.id, { lastRemindedAt: occ })
    }
  }

  // 9:00 摘要（当天未提醒且已过 9 点才查）：存在进入最后 3 天（未过期）的倒计时时才写入日期 key；
  // 无匹配则不写 key，当日保持可重查。
  const now = new Date()
  if (localStorage.getItem(STORAGE_KEY) !== localToday() && now.getHours() >= REMIND_HOUR) {
    const urgent = store.countdowns
      .map((c) => ({ c, r: calcRemaining(c.endDateTime, c.repeat) }))
      .filter(({ r }) => !r.isExpired && r.days <= 3)
    if (urgent.length > 0) {
      items.push(...urgent.map(({ c, r }) => ({ id: c.id, name: c.name, label: r.label })))
      localStorage.setItem(STORAGE_KEY, localToday())
    }
  }

  if (items.length > 0) pushItems(items)
}

function init(): void {
  if (initialized) return
  initialized = true
  void tick()
  setInterval(() => {
    void tick()
  }, TICK_MS)
  // 页面重新可见时立即 tick：浏览器可能节流 setInterval / 系统休眠跨过到期时刻。
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void tick()
  })
}

function close(): void {
  state.value = { ...state.value, open: false }
}

export function useCountdownReminder() {
  return {
    state: readonly(state),
    close,
    init
  }
}
