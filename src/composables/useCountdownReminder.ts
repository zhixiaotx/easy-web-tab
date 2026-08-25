// 全局倒计时提醒：分钟级 tick 检查到期 + 每天 9:00 本地时间弹出「最后 3 天」摘要。
// 单例 composable（同 useToast / useHelpModal 模式）：模块级 shallowRef + useX() 返回，非 Pinia。
// 仅由 init() 触发后才访问 Pinia store（init 在 App.vue onMounted 调用，此时 Pinia 已激活）。
import { shallowRef, readonly } from 'vue'
import { useCountdownsStore } from '@/stores/countdowns'
import { useAppSettingsStore } from '@/stores/settings'
import { calcRemaining, getReminderDue } from '@/composables/countdownCore'
import { sendDesktopNotification } from '@/composables/useDesktopNotify'
import { sendReminderEmail } from '@/composables/reminderEmail'
import { isEmailConfigured, shouldSendReminderEmail, buildEmailParams } from '@/composables/reminderCore'
import type { ReminderEmailConfig } from '@/composables/reminderCore'
import { waitForPull } from '@/composables/useCloudSync'

export interface CountdownReminderItem {
  id: string
  name: string
  label: string
  emailReminder?: boolean
}

export interface CountdownReminderState {
  open: boolean
  items: CountdownReminderItem[]
}

// 记录上次弹出 9:00 摘要的本地日期（YYYY-MM-DD）。与当天相同 → 当天已提醒，跳过。
export const STORAGE_KEY = 'user-countdown-reminder-date'

const REMIND_HOUR = 9
const TICK_MS = 60_000
const OVERDUE_THRESHOLD_MS = 10 * 60_000 // 超过 10 分钟不再触发提醒

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
// 三通道分发：弹窗（原有）+ 桌面通知（开关开启）+ 邮件（倒计时 emailReminder 且配置完整，仅到点不发摘要）。
async function tick(): Promise<void> {
  const store = useCountdownsStore()
  // 设置每 tick 只读一次（不逐条读）：desktopNotifyEnabled / 邮件五字段全部来自 useAppSettingsStore
  const settingsStore = useAppSettingsStore()
  await store.loadCountdowns()
  const items: CountdownReminderItem[] = []

  for (const c of store.countdowns) {
    const occ = getReminderDue(c.endDateTime, c.repeat, c.lastRemindedAt)
    if (occ !== null) {
      // 超过 10 分钟的到期：静默更新 lastRemindedAt（防重复触发），不弹窗/不通知/不发邮件
      const occMs = new Date(occ.replace(' ', 'T')).getTime()
      if (!isNaN(occMs) && Date.now() - occMs > OVERDUE_THRESHOLD_MS) {
        await store.updateCountdown(c.id, { lastRemindedAt: occ })
        continue
      }
      items.push({ id: c.id, name: c.name, label: occ.slice(5), emailReminder: c.emailReminder })
      // 桌面通知：开关开启即发（内部自行判定浏览器支持 + 权限 granted），tag 传倒计时 id 去重
      if (settingsStore.desktopNotifyEnabled) {
        sendDesktopNotification(c.name, `${occ} 已到`, c.id)
      }
      // lastRemindedAt 更新是防重复提醒的唯一机制，必须最先落库（不可被邮件发送阻塞）
      await store.updateCountdown(c.id, { lastRemindedAt: occ })
      // 邮件提醒（仅到点，9:00 摘要永不发邮件）：倒计时 emailReminder=true 且 EmailJS 配置完整才发；
      // 失败静默 console.warn，不重试、不 toast
      const emailCfg: ReminderEmailConfig = {
        enabled: settingsStore.reminderEmailEnabled,
        toEmail: settingsStore.reminderEmailTo,
        serviceId: settingsStore.reminderEmailServiceId,
        templateId: settingsStore.reminderEmailTemplateId,
        publicKey: settingsStore.reminderEmailPublicKey
      }
      if (isEmailConfigured(emailCfg) && shouldSendReminderEmail(c, emailCfg)) {
        await sendReminderEmail(emailCfg, buildEmailParams(c, occ, emailCfg.toEmail, window.location.href))
      }
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
      for (const { c, r } of urgent) {
        items.push({ id: c.id, name: c.name, label: r.label, emailReminder: c.emailReminder })
        // 摘要同样走桌面通知（邮件仅限到点，摘要永不发邮件）
        if (settingsStore.desktopNotifyEnabled) {
          sendDesktopNotification(c.name, r.label, c.id)
        }
      }
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
  // 确保先 await 云同步拉取（更新 lastRemindedAt）再 tick，防多台电脑重复提醒。
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      void (async () => {
        await waitForPull()
        await tick()
      })()
    }
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
