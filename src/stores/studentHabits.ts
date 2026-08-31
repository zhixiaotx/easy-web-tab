// 学生工作台习惯打卡 store（数据存 IndexedDB store 'student_habits'：双数组 habits + records）
// 复用成人 habitCore 连续天数/周达成率纯函数 + studentHabitsCore 扩展归一化与学段播种。
// 严格隔离成人 habits store（独立 IDB 名 + 独立前缀 shb_/shr_）。

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  STUDENT_HABIT_ID_PREFIX,
  STUDENT_HABIT_RECORD_ID_PREFIX,
  emptyStudentHabitsData,
  normalizeStudentHabitsData,
  weekCompletionsOf,
  streakOf as streakOfCore,
  weeklyAttainmentOf,
  buildStageSeedHabits,
  mergeStageSeedHabits,
  filterHabitsByCategory
} from '@/composables/studentHabitsCore'
import type { HabitFrequency, StreakResult, WeeklyAttainment } from '@/composables/habitCore'
import { idbGet, idbPut } from '@/composables/useIdb'
import type {
  StudentHabit,
  StudentHabitCategory,
  StudentHabitRecord,
  StudentHabitsData,
  StudentStage
} from '@/types'
import { useStudentRewardsStore } from '@/stores/studentRewards'

// 分类 CRUD 操作错误语义
export type StudentHabitOpError = 'empty' | 'duplicate' | 'not-found' | 'in-use'
export type StudentHabitOp = { ok: boolean; reason?: StudentHabitOpError }

export const useStudentHabitsStore = defineStore('studentHabits', () => {
  const habits = ref<StudentHabit[]>([])
  const records = ref<StudentHabitRecord[]>([])

  async function loadHabits(): Promise<void> {
    try {
      const norm = normalizeStudentHabitsData(await idbGet<StudentHabitsData>('student_habits'))
      habits.value = norm.habits
      records.value = norm.records
    } catch (e) {
      console.error('[studentHabits] load failed', e)
      const empty = emptyStudentHabitsData()
      habits.value = empty.habits
      records.value = empty.records
    }
  }

  async function saveHabits(): Promise<void> {
    try {
      //, ：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError）
      await idbPut('student_habits', { habits: JSON.parse(JSON.stringify(habits.value)), records: JSON.parse(JSON.stringify(records.value)) })
      // M2-M4 云同步 student-backup 信封留后续阶段接入
    } catch (e) {
      console.error('[studentHabits] save failed', e)
    }
  }

  /** 新增习惯：name trim 非空、同分类内唯一（大小写不敏感）→ 写入；id 前缀 shb_。 */
  async function addHabit(name: string, category: StudentHabitCategory, frequency: HabitFrequency, color?: string): Promise<StudentHabitOp> {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, reason: 'empty' }
    if (habits.value.some(h => h.category === category && h.name.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, reason: 'duplicate' }
    }
    habits.value.push({
      id: `${STUDENT_HABIT_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      category: category.trim(),
      frequency,
      color,
      createdAt: new Date().toISOString()
    })
    await saveHabits()
    return { ok: true }
  }

  /** 改名/改分类/改频次/改颜色：name 唯一校验排除自身。 */
  async function updateHabit(
    id: string,
    patch: Partial<Pick<StudentHabit, 'name' | 'category' | 'frequency' | 'color'>>
  ): Promise<StudentHabitOp> {
    const index = habits.value.findIndex(h => h.id === id)
    if (index === -1) return { ok: false, reason: 'not-found' }
    const changes: Partial<StudentHabit> = {}
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) return { ok: false, reason: 'empty' }
      const targetCategory = patch.category ?? habits.value[index].category
      if (habits.value.some(h => h.id !== id && h.category === targetCategory && h.name.toLowerCase() === name.toLowerCase())) {
        return { ok: false, reason: 'duplicate' }
      }
      changes.name = name
    }
    if (patch.category !== undefined) changes.category = patch.category.trim()
    if (patch.frequency !== undefined) changes.frequency = patch.frequency
    if (patch.color !== undefined) changes.color = patch.color
    habits.value[index] = { ...habits.value[index], ...changes }
    await saveHabits()
    return { ok: true }
  }

  /** 删除习惯：同时清理全部打卡记录（,  原始数组 filter 防 DataCloneError）。 */
  async function deleteHabit(id: string): Promise<StudentHabitOp> {
    if (!habits.value.some(h => h.id === id)) return { ok: false, reason: 'not-found' }
    habits.value = habits.value.filter(h => h.id !== id)
    records.value = records.value.filter(r => r.habitId !== id)
    await saveHabits()
    return { ok: true }
  }

  /** 打卡/取消打卡：同一天已打卡 → 移除（取消），未打卡 → 追加（id 前缀 shr_）；幂等。
   *  注意：追加打卡成功时联动积分（useStudentRewardsStore.earnFromHabit），取消打卡不扣分。
   */
  async function toggleCheckIn(habitId: string, date: string, parentMarked = false): Promise<StudentHabitOp> {
    const habit = habits.value.find(h => h.id === habitId)
    if (!habit) return { ok: false, reason: 'not-found' }
    const existing = records.value.find(r => r.habitId === habitId && r.date === date)
    let shouldEarn = false
    if (existing) {
      records.value = records.value.filter(r => r.id !== existing.id)
    } else {
      records.value.push({
        id: `${STUDENT_HABIT_RECORD_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        habitId,
        date,
        parentMarked: parentMarked || undefined,
        createdAt: new Date().toISOString()
      })
      shouldEarn = true
    }
    await saveHabits()
    // 积分联动：在 save 后触发，失败仅记录日志不回滚
    if (shouldEarn) {
      try {
        const rewardsStore = useStudentRewardsStore()
        await rewardsStore.earnFromHabit(habit.id, habit.name, date)
      } catch (e) {
        console.warn('[studentHabits] earnFromHabit failed', e)
      }
    }
    return { ok: true }
  }

  // ---- 只读薄委托 studentHabitsCore（公式属 core，store 禁止内联重算）----

  function weekCompletionsOfHabit(habitId: string, date: string): string[] {
    return weekCompletionsOf(records.value, habitId, date)
  }

  function streakOfHabit(habitId: string, frequency: HabitFrequency, today: string): StreakResult {
    return streakOfCore(records.value, habitId, frequency, today)
  }

  function weeklyAttainmentOfHabit(habitId: string, frequency: HabitFrequency, date: string): WeeklyAttainment {
    return weeklyAttainmentOf(records.value, habitId, frequency, date)
  }

  function filterByCategory(category: string): StudentHabit[] {
    return filterHabitsByCategory(habits.value, category)
  }

  /**
   * 学段默认习惯播种：首次进入或学段切换后调用。
   * 合并学段种子到现有习惯（不覆盖用户已新增的同名习惯），写入 stageHabitsSeeded。
   * 幂等：已播种该学段则跳过。
   */
  async function seedStageHabits(stage: StudentStage): Promise<void> {
    const seed = buildStageSeedHabits(stage)
    habits.value = mergeStageSeedHabits(habits.value, seed)
    await saveHabits()
  }

  return {
    habits,
    records,
    loadHabits,
    saveHabits,
    addHabit,
    updateHabit,
    deleteHabit,
    toggleCheckIn,
    weekCompletionsOfHabit,
    streakOfHabit,
    weeklyAttainmentOfHabit,
    filterByCategory,
    seedStageHabits
  }
})
