// 全局每日定时提醒：每天 9:00 本地时间，若有倒计时进入最后 3 天（未过期），弹出提醒对话框。
// 单例 composable（同 useToast / useHelpModal 模式）：模块级 shallowRef + useX() 返回，非 Pinia。
// 仅由 init() 触发时才访问 Pinia store（init 在 App.vue onMounted 调用，此时 Pinia 已激活）。
import { shallowRef, readonly } from 'vue'
import { useCountdownsStore } from '@/stores/countdowns'
import { calcRemaining } from '@/composables/countdownCore'

export interface CountdownReminderItem {
  id: string
  name: string
  label: string
}

export interface CountdownReminderState {
  open: boolean
  items: CountdownReminderItem[]
}

// 记录上次弹出提醒的本地日期（YYYY-MM-DD）。与当天相同 → 当天已提醒，跳过。
export const STORAGE_KEY = 'user-countdown-reminder-date'

const REMIND_HOUR = 9

// 单例状态：所有组件共享
const state = shallowRef<CountdownReminderState>({ open: false, items: [] })
let initialized = false
let timer: ReturnType<typeof setTimeout> | undefined

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// 本地日期 YYYY-MM-DD。勿用 toISOString()（UTC 会偏一天）。
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 距下一次 9:00 的毫秒数（今天 9:00 已过则明天 9:00），恒 < 24h，远低于 setTimeout 的 2^31ms 上限。
function next9amDelay(): number {
  const now = new Date()
  const today9 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), REMIND_HOUR, 0, 0, 0)
  if (now.getTime() < today9.getTime()) return today9.getTime() - now.getTime()
  const tomorrow9 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, REMIND_HOUR, 0, 0, 0)
  return tomorrow9.getTime() - now.getTime()
}

// 检查并弹出提醒。仅当存在处于最后 3 天（未过期）的倒计时时才写入日期 key；
// 无匹配则不写 key，当日保持可重查。
async function checkNow(): Promise<void> {
  const countdownsStore = useCountdownsStore()
  await countdownsStore.loadCountdowns()
  const urgent = countdownsStore.countdowns
    .map((c) => ({ c, r: calcRemaining(c.endDateTime, c.repeat) }))
    .filter(({ r }) => !r.isExpired && r.days <= 3)
  if (urgent.length === 0) return
  state.value = {
    open: true,
    items: urgent.map(({ c, r }) => ({ id: c.id, name: c.name, label: r.label }))
  }
  localStorage.setItem(STORAGE_KEY, localToday())
}

// 调度下一次 9:00 检查（setTimeout → checkAndSchedule，形成每日循环）。
function schedule(): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = setTimeout(() => {
    void checkAndSchedule()
  }, next9amDelay())
}

async function checkAndSchedule(): Promise<void> {
  if (localStorage.getItem(STORAGE_KEY) !== localToday()) {
    await checkNow()
  }
  schedule()
}

// 页面重新可见时兜底：浏览器可能节流 setTimeout / 系统休眠跨过 9:00。
async function onVisibilityChange(): Promise<void> {
  if (document.hidden) return
  if (localStorage.getItem(STORAGE_KEY) !== localToday()) {
    await checkNow()
    schedule()
  }
}

function init(): void {
  if (initialized) return
  initialized = true
  void checkAndSchedule()
  document.addEventListener('visibilitychange', () => {
    void onVisibilityChange()
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
