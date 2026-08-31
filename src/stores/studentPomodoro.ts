// 学生工作台番茄钟 store（学段时长版）
// 数据存 IndexedDB store 'student_pomodoro' 单对象 { settings, records }，严格隔离成人数据。
// 薄委托 studentPomodoroCore（复用成人 pomodoroCore 纯函数）+ 学段默认时长播种。
// 云同步 markDirty 留 M5 批次，本 store 不调用。

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  emptyPomodoroData,
  normalizePomodoroData,
  todayStats as pomodoroTodayStats,
  stageDefaultPomodoroSettings,
  type PomodoroData,
  type PomodoroSettings
} from '@/composables/studentPomodoroCore'
import { idbGet, idbPut } from '@/composables/useIdb'
import type { StudentStage } from '@/types'

const STORE_KEY = 'student_pomodoro'

export const useStudentPomodoroStore = defineStore('studentPomodoro', () => {
  const data = ref<PomodoroData>(emptyPomodoroData())

  // ========================================
  // 持久化
  // ========================================

  async function loadPomodoro(): Promise<void> {
    try {
      data.value = normalizePomodoroData(await idbGet<PomodoroData>(STORE_KEY))
    } catch (e) {
      console.error('[studentPomodoro] load failed', e)
      data.value = emptyPomodoroData()
    }
  }

  async function savePomodoro(): Promise<void> {
    try {
      //,  分别解开 settings 对象与 records 数组，避免 IDB 结构化克隆 DataCloneError
      await idbPut(STORE_KEY, {
        settings: JSON.parse(JSON.stringify(data.value.settings)),
        records: JSON.parse(JSON.stringify(data.value.records))
      })
    } catch (e) {
      console.error('[studentPomodoro] save failed', e)
    }
  }

  // ========================================
  // 设置 CRUD
  // ========================================

  async function updateSettings(patch: Partial<PomodoroSettings>): Promise<void> {
    data.value.settings = { ...data.value.settings, ...patch }
    await savePomodoro()
  }

  /**
   * 学段默认番茄钟时长播种：首次进入或学段切换后调用。
   * 仅当用户未自定义设置（仍为学段默认值）时覆盖；已自定义则保留。
   * 幂等：已是目标学段默认值则跳过。
   */
  async function seedStagePomodoro(stage: StudentStage): Promise<void> {
    const stageDef = stageDefaultPomodoroSettings(stage)
    // 当前设置与目标学段默认一致 → 无需播种
    const cur = data.value.settings
    const isSame =
      cur.workMinutes === stageDef.workMinutes &&
      cur.breakMinutes === stageDef.breakMinutes &&
      cur.longBreakMinutes === stageDef.longBreakMinutes &&
      cur.sessionsPerCycle === stageDef.sessionsPerCycle
    if (isSame) return
    // 判断当前设置是否为「未自定义」：与成人默认 25/5/15/4 一致视为未自定义
    // （首次进入时 normalizePomodoroData 兜底为成人默认，此时应改为学段默认）
    const adultDefault: PomodoroSettings = {
      workMinutes: 25,
      breakMinutes: 5,
      longBreakMinutes: 15,
      sessionsPerCycle: 4
    }
    const isUncustomized =
      cur.workMinutes === adultDefault.workMinutes &&
      cur.breakMinutes === adultDefault.breakMinutes &&
      cur.longBreakMinutes === adultDefault.longBreakMinutes &&
      cur.sessionsPerCycle === adultDefault.sessionsPerCycle
    if (!isUncustomized) return
    data.value.settings = { ...stageDef }
    await savePomodoro()
  }

  // ========================================
  // 会话记录
  // ========================================

  async function recordSession(date: string): Promise<void> {
    const today = data.value.records.find(r => r.date === date)
    if (today) {
      today.workSessions += 1
    } else {
      data.value.records.push({
        date,
        workSessions: 1,
        createdAt: new Date().toISOString()
      })
    }
    await savePomodoro()
  }

  async function clearToday(date: string): Promise<void> {
    data.value.records = data.value.records.filter(r => r.date !== date)
    await savePomodoro()
  }

  /** 今日已完成专注会话数（薄委托 pomodoroCore.todayStats，禁止内联重算） */
  function todayCount(date: string): number {
    return pomodoroTodayStats(data.value.records, date)
  }

  return {
    // 状态
    data,
    // 持久化
    loadPomodoro,
    savePomodoro,
    // 设置
    updateSettings,
    seedStagePomodoro,
    // 会话记录
    recordSession,
    clearToday,
    // 查询
    todayCount
  }
})
