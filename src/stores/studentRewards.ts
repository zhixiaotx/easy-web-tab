// 学生工作台奖励积分 store
// 数据存 IndexedDB store 'student_rewards' 单对象 {totalPoints, history, rewards}。
// 半自动积分：习惯/作业/阅读完成时由各 store 调用 autoEarn（sourceId 幂等防重复加分）；
// 家长可手动加分（manualEarn）；兑换奖励（redeemReward）扣分 + 减库存 + 写交易历史。
// 历史上限 100 条；奖励项数量无上限，名称唯一（大小写不敏感）、cost ∈ [1,9999]。
// 薄委托 studentRewardCore：归一化/CRUD/加分/兑换/统计/视图辅助均为纯函数，store 禁止内联重算。

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  emptyRewardsData,
  normalizeRewardsData,
  addRewardItem as addRewardItemCore,
  updateRewardItem as updateRewardItemCore,
  deleteRewardItem as deleteRewardItemCore,
  manualEarn as manualEarnCore,
  autoEarn as autoEarnCore,
  redeemReward as redeemRewardCore,
  calcRewardStats as calcRewardStatsCore,
  filterActiveRewards as filterActiveRewardsCore,
  filterSoldOutRewards as filterSoldOutRewardsCore,
  recentHistory as recentHistoryCore,
  formatTxnPoints as formatTxnPointsCore,
  formatTxnDate as formatTxnDateCore,
  pointsRulesText as pointsRulesTextCore,
  hasSourceId,
  habitEarnReason,
  homeworkEarnReason,
  readingEarnReason,
  isReadingEligible,
  POINTS_HABIT,
  POINTS_HOMEWORK,
  POINTS_READING,
  type RewardOp,
  type RewardStats
} from '@/composables/studentRewardCore'
import { idbGet, idbPut } from '@/composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'
import type {
  StudentRewardsData,
  StudentRewardItem,
  StudentRewardTxn,
  StudentHabit,
  StudentHabitRecord,
  StudentHomework,
  StudentReadingEntry
} from '@/types'

const STORE_KEY = 'student_rewards'

/** 错误语义（与 core 的 RewardOpError 对齐，store 对外暴露） */
export type StudentRewardOpError =
  | 'empty'
  | 'duplicate'
  | 'not-found'
  | 'invalid-cost'
  | 'insufficient'
  | 'out-of-stock'
  | 'invalid-points'
  | 'invalid-source'

export type StudentRewardOp = RewardOp

export const useStudentRewardsStore = defineStore('studentRewards', () => {
  const data = ref<StudentRewardsData>(emptyRewardsData())

  // ========================================
  // 持久化
  // ========================================

  async function loadRewards(): Promise<void> {
    try {
      const norm = normalizeRewardsData(await idbGet<StudentRewardsData>(STORE_KEY))
      data.value = norm
    } catch (e) {
      console.error('[studentRewards] load failed', e)
      data.value = emptyRewardsData()
    }
  }

  async function saveRewards(): Promise<void> {
    try {
      //, ：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError）
      await idbPut(STORE_KEY, {
        totalPoints: data.value.totalPoints,
        history: JSON.parse(JSON.stringify(data.value.history)),
        rewards: JSON.parse(JSON.stringify(data.value.rewards))
      })
      markDirty()
    } catch (e) {
      console.error('[studentRewards] save failed', e)
    }
  }

  // ========================================
  // 奖励项 CRUD（薄委托 core 结果函数）
  // ========================================

  /** 新增奖励项 */
  async function addReward(name: string, cost: number, stock?: number): Promise<StudentRewardOp> {
    const result = addRewardItemCore(data.value.rewards, name, cost, stock)
    if (!result.ok || !result.rewards) return { ok: false, reason: result.reason }
    data.value = { ...data.value, rewards: result.rewards }
    await saveRewards()
    return { ok: true }
  }

  /** 更新奖励项 */
  async function updateReward(
    id: string,
    patch: { name?: string; cost?: number; stock?: number }
  ): Promise<StudentRewardOp> {
    const result = updateRewardItemCore(data.value.rewards, id, patch)
    if (!result.ok || !result.rewards) return { ok: false, reason: result.reason }
    data.value = { ...data.value, rewards: result.rewards }
    await saveRewards()
    return { ok: true }
  }

  /** 删除奖励项 */
  async function deleteReward(id: string): Promise<StudentRewardOp> {
    const result = deleteRewardItemCore(data.value.rewards, id)
    if (!result.ok || !result.rewards) return { ok: false, reason: result.reason }
    data.value = { ...data.value, rewards: result.rewards }
    await saveRewards()
    return { ok: true }
  }

  // ========================================
  // 积分加分（半自动 + 手动）
  // ========================================

  /** 家长手动加分（不带 sourceId，允许重复加分） */
  async function manualAddPoints(points: number, reason: string): Promise<StudentRewardOp> {
    const result = manualEarnCore(data.value, points, reason)
    if (!result.ok || !result.data) return { ok: false, reason: result.reason }
    data.value = result.data
    await saveRewards()
    return { ok: true }
  }

  /**
   * 半自动加分（习惯/作业/阅读完成触发）。
   * sourceId 必填，幂等：相同 sourceId 已加分则 noop。
   * 返回 ok:true 但 data 为 undefined 表示幂等跳过（未实际加分）。
   */
  async function autoAddPoints(
    points: number,
    reason: string,
    sourceId: string
  ): Promise<StudentRewardOp> {
    const result = autoEarnCore(data.value, points, reason, sourceId)
    // 幂等跳过：ok:true 但无 data，不写库
    if (!result.ok) return { ok: false, reason: result.reason }
    if (result.data) {
      data.value = result.data
      await saveRewards()
    }
    return { ok: true }
  }

  // ========================================
  // 习惯/作业/阅读完成的便捷入口（薄委托 core 加分常量与决策）
  // ========================================

  /**
   * 习惯打卡完成时触发加分（+5）。
   * sourceId 模板：`habit:${habitId}:${date}`，确保同一习惯同一天只加一次。
   */
  async function earnFromHabit(habitId: string, habitName: string, date: string): Promise<StudentRewardOp> {
    return autoAddPoints(POINTS_HABIT, habitEarnReason(habitName), `habit:${habitId}:${date}`)
  }

  /**
   * 作业完成时触发加分（+10）。
   * sourceId 模板：`homework:${hwId}`，确保同一作业只加一次。
   */
  async function earnFromHomework(hwId: string, hwTitle: string): Promise<StudentRewardOp> {
    return autoAddPoints(POINTS_HOMEWORK, homeworkEarnReason(hwTitle), `homework:${hwId}`)
  }

  /**
   * 阅读完成时触发加分（≥30 分钟 +5）。
   * sourceId 模板：`reading:${entryId}`，确保同一阅读记录只加一次。
   * durationMin < 30 分钟直接 noop（不加分）。
   */
  async function earnFromReading(
    entryId: string,
    bookTitle: string,
    durationMin: number
  ): Promise<StudentRewardOp> {
    if (!isReadingEligible(durationMin)) return { ok: true } // 不达门槛不算错
    return autoAddPoints(
      POINTS_READING,
      readingEarnReason(bookTitle, durationMin),
      `reading:${entryId}`
    )
  }

  // ========================================
  // 兑换
  // ========================================

  /** 兑换奖励：扣分 + 减库存 + 写 redeem txn */
  async function redeem(rewardId: string): Promise<StudentRewardOp & { shortage?: number }> {
    const result = redeemRewardCore(data.value, rewardId)
    if (!result.ok) return { ok: false, reason: result.reason, shortage: result.shortage }
    if (result.data) {
      data.value = result.data
      await saveRewards()
    }
    return { ok: true }
  }

  // ========================================
  // 薄委托查询（视图层禁止内联重算）
  // ========================================

  /** 当前总积分 */
  function totalPoints(): number {
    return data.value.totalPoints
  }

  /** 是否已对某 sourceId 加分（视图层提示用） */
  function isAlreadyEarned(sourceId: string): boolean {
    return hasSourceId(data.value.history, sourceId)
  }

  /** 在售奖励项（stock !== 0） */
  function activeRewards(): StudentRewardItem[] {
    return filterActiveRewardsCore(data.value.rewards)
  }

  /** 售罄奖励项（stock === 0） */
  function soldOutRewards(): StudentRewardItem[] {
    return filterSoldOutRewardsCore(data.value.rewards)
  }

  /** 最近 N 条交易记录（默认 10） */
  function recentTxns(limit = 10): StudentRewardTxn[] {
    return recentHistoryCore(data.value.history, limit)
  }

  /** 全部奖励项（按 cost 升序） */
  function allRewards(): StudentRewardItem[] {
    return data.value.rewards
  }

  /** 全部交易记录（按 createdAt 降序） */
  function allHistory(): StudentRewardTxn[] {
    return data.value.history
  }

  /** 统计（含累计赚取/兑换/总数/售罄数） */
  function stats(): RewardStats {
    return calcRewardStatsCore(data.value)
  }

  /** 交易积分显示（+N / -N） */
  function txnPointsText(txn: StudentRewardTxn): string {
    return formatTxnPointsCore(txn)
  }

  /** 交易日期本地可读（YYYY-MM-DD HH:mm） */
  function txnDateText(iso: string): string {
    return formatTxnDateCore(iso)
  }

  /** 积分规则说明文本（用于「积分规则」说明页） */
  function rulesText(): { action: string; points: number }[] {
    return pointsRulesTextCore()
  }

  // ========================================
  // 存量数据回溯加分（修复"过往习惯/作业/阅读已完成但积分为 0"）
  // 所有条目基于 sourceId 幂等判定，已加过分的 noop，未加的补分。
  // 由 StudentView / StudentReward onMounted 在 loadRewards 之后调用（非每次页面切换）。
  // ========================================

  interface BackfillInput {
    habits: readonly StudentHabit[]
    habitRecords: readonly StudentHabitRecord[]
    homeworks: readonly StudentHomework[]
    readings: readonly StudentReadingEntry[]
  }

  /** 回溯加分：扫描存量行为，返回本次新增加分的条数。 */
  async function backfillFromAll(input: BackfillInput): Promise<number> {
    const habitMap = new Map<string, StudentHabit>()
    for (const h of input.habits) habitMap.set(h.id, h)

    const earnCalls: Array<() => Promise<StudentRewardOp>> = []
    for (const r of input.habitRecords) {
      const habit = habitMap.get(r.habitId)
      if (!habit) continue
      const points = POINTS_HABIT
      const reason = habitEarnReason(habit.name)
      const sourceId = `habit:${habit.id}:${r.date}`
      earnCalls.push(() => autoAddPoints(points, reason, sourceId))
    }
    for (const hw of input.homeworks) {
      if (hw.status !== 'done') continue
      const points = POINTS_HOMEWORK
      const reason = homeworkEarnReason(hw.title)
      const sourceId = `homework:${hw.id}`
      earnCalls.push(() => autoAddPoints(points, reason, sourceId))
    }
    for (const rd of input.readings) {
      if (!isReadingEligible(rd.durationMin)) continue
      const points = POINTS_READING
      const reason = readingEarnReason(rd.bookTitle, rd.durationMin)
      const sourceId = `reading:${rd.id}`
      earnCalls.push(() => autoAddPoints(points, reason, sourceId))
    }
    // 串行执行：避免 autoAddPoints 内并发 saveRewards 覆盖 data.value
    let earned = 0
    for (const fn of earnCalls) {
      try {
        const result = await fn()
        if (result.ok) earned++
      } catch (e) {
        console.warn('[studentRewards] backfill item failed', e)
      }
    }
    return earned
  }

  return {
    // 状态
    data,
    // 持久化
    loadRewards,
    saveRewards,
    // 奖励 CRUD
    addReward,
    updateReward,
    deleteReward,
    // 加分
    manualAddPoints,
    autoAddPoints,
    earnFromHabit,
    earnFromHomework,
    earnFromReading,
    // 回溯
    backfillFromAll,
    // 兑换
    redeem,
    // 查询
    totalPoints,
    isAlreadyEarned,
    activeRewards,
    soldOutRewards,
    recentTxns,
    allRewards,
    allHistory,
    stats,
    txnPointsText,
    txnDateText,
    rulesText
  }
})
