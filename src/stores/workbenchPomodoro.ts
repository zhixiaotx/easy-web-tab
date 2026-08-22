import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import type { PomodoroData, PomodoroSettings } from '@/composables/pomodoroCore'
import { emptyPomodoroData, normalizePomodoroData, todayStats as pomodoroTodayStats } from '@/composables/pomodoroCore'
import { idbGet, idbPut } from '../composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'

// 工作台番茄钟 store（数据存 IndexedDB store 'pomodoro'，key 'items'；经 pomodoroCore 归一化后读写）。
// 今日统计等纯逻辑一律委托 pomodoroCore，store 只做薄委托 + 持久化。
export const useWorkbenchPomodoroStore = defineStore('workbenchPomodoro', () => {
  const data = ref<PomodoroData>(emptyPomodoroData())

  async function loadPomodoro(): Promise<void> {
    try {
      // IDB 存量脏数据/空值（undefined → {}）经 normalizePomodoroData 幂等归一，
      // 空数据兜底天然由 normalize 保证（settings 回退默认 25/5/15/4，records 坏记录剔除）
      data.value = normalizePomodoroData(await idbGet<PomodoroData>('pomodoro'))
    } catch (e) {
      // 加载失败（IDB 不可用/坏库）静默回退空数据，不向上抛
      console.error('[workbenchPomodoro] loadPomodoro', e)
      data.value = emptyPomodoroData()
    }
  }

  async function savePomodoro(): Promise<void> {
    try {
      // toRaw：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError）。
      // ref 的 .value 是深层 reactive Proxy，toRaw 只解开最外层一层——对 settings 对象与
      // records 数组分别 toRaw 后再组装纯对象写入（仿 workbenchLedger 现有做法）
      await idbPut('pomodoro', {
        settings: toRaw(data.value.settings),
        records: toRaw(data.value.records)
      })
      markDirty()
    } catch (e) {
      console.error('[workbenchPomodoro] savePomodoro', e)
    }
  }

  async function updateSettings(patch: Partial<PomodoroSettings>): Promise<void> {
    data.value.settings = { ...data.value.settings, ...patch }
    await savePomodoro()
  }

  async function recordSession(date: string): Promise<void> {
    const today = data.value.records.find(r => r.date === date)
    if (today) {
      today.workSessions += 1
    } else {
      // 当日无记录 → 新建 { date, workSessions: 1, createdAt: ISO }
      data.value.records.push({ date, workSessions: 1, createdAt: new Date().toISOString() })
    }
    await savePomodoro()
  }

  async function clearToday(date: string): Promise<void> {
    // 在 toRaw 的原始数组上 filter：reactive 代理上直接 filter 会得到 Proxy 元素，
    // toRaw 只解开一层数组，残留的 Proxy 元素会让 IDB 结构化克隆抛 DataCloneError
    data.value.records = toRaw(data.value.records).filter(r => r.date !== date)
    await savePomodoro()
  }

  // 今日已完成专注会话数（薄委托 pomodoroCore.todayStats，禁止内联 filter/count 公式）
  const todayStats = (date: string): number => pomodoroTodayStats(data.value.records, date)

  return {
    data,
    loadPomodoro,
    savePomodoro,
    updateSettings,
    recordSession,
    clearToday,
    todayStats
  }
})
