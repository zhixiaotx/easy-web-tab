// 学生工作台学习计划 store（数据存 IndexedDB store 'student_plans' 单对象 { entries }）
// 薄委托 studentPlanCore：归一化/筛选/排序/进度统计均为纯函数，store 禁止内联重算。
// 严格隔离成人数据（独立 IDB 名 + 独立前缀 pl_/pg_）。

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  emptyPlanData,
  normalizePlanData,
  sortPlans as sortPlansCore,
  filterByType as filterByTypeCore,
  calcPlanStats as calcPlanStatsCore,
  calcPlanProgress as calcPlanProgressCore,
  isPlanActive as isPlanActiveCore,
  isPlanCompleted as isPlanCompletedCore,
  updateGoalProgress as updateGoalProgressCore,
  toggleGoalDone as toggleGoalDoneCore,
  PLAN_ID_PREFIX,
  PLAN_GOAL_ID_PREFIX
} from '@/composables/studentPlanCore'
import { localToday } from '@/composables/todoCore'
import { idbGet, idbPut } from '@/composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'
import type { StudentPlan, StudentPlanData, StudentPlanGoal, StudentPlanType } from '@/types'

const STORE_KEY = 'student_plans'

/** 计划 CRUD 操作错误语义 */
export type StudentPlanOpError = 'empty' | 'invalid-range' | 'not-found' | 'invalid-progress'
export type StudentPlanOp = { ok: boolean; reason?: StudentPlanOpError }

/** 新增计划输入 */
export interface NewPlanInput {
  type: StudentPlanType
  title: string
  startDate: string
  endDate: string
  goals: { content: string }[]
}

/** 更新计划 patch */
export interface PlanUpdatePatch {
  type?: StudentPlanType
  title?: string
  startDate?: string
  endDate?: string
  review?: string
}

function genPlanId(): string {
  return `${PLAN_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function genGoalId(): string {
  return `${PLAN_GOAL_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}

export const useStudentPlanStore = defineStore('studentPlan', () => {
  const entries = ref<StudentPlan[]>([])

  // ========================================
  // 持久化
  // ========================================

  async function loadPlans(): Promise<void> {
    try {
      const norm = normalizePlanData(await idbGet<StudentPlanData>(STORE_KEY))
      entries.value = sortPlansCore(norm.entries)
    } catch (e) {
      console.error('[studentPlan] load failed', e)
      entries.value = emptyPlanData().entries
    }
  }

  async function savePlans(): Promise<void> {
    try {
      // 深拷贝：剥离 reactive Proxy，防 IDB DataCloneError
      await idbPut(STORE_KEY, { entries: JSON.parse(JSON.stringify(entries.value)) })
      markDirty()
    } catch (e) {
      console.error('[studentPlan] save failed', e)
      // eslint-disable-next-line no-console
      console.warn('[studentPlan] save error:', e instanceof Error ? e.message : String(e))
    }
  }

  // ========================================
  // CRUD
  // ========================================

  /**
   * 新增计划：title/startDate/endDate 必填，endDate > startDate，至少 1 个目标 content 非空。
   */
  async function addPlan(input: NewPlanInput): Promise<StudentPlanOp> {
    const title = input.title.trim()
    if (!title) return { ok: false, reason: 'empty' }
    if (!input.startDate || !input.endDate || input.endDate <= input.startDate) {
      return { ok: false, reason: 'invalid-range' }
    }
    const goals: StudentPlanGoal[] = input.goals
      .map(g => g.content.trim())
      .filter(content => content)
      .map(content => ({
        id: genGoalId(),
        content: Array.from(content).slice(0, 100).join(''),
        progress: 0,
        done: false
      }))
    if (goals.length === 0) return { ok: false, reason: 'empty' }
    const now = isoNow()
    entries.value.push({
      id: genPlanId(),
      type: input.type,
      title: Array.from(title).slice(0, 50).join(''),
      startDate: input.startDate,
      endDate: input.endDate,
      goals,
      createdAt: now,
      updatedAt: now
    })
    entries.value = sortPlansCore(entries.value)
    await savePlans()
    return { ok: true }
  }

  /**
   * 更新计划基础字段（type/title/startDate/endDate/review）。
   * 不在此处修改 goals——goals 走 updateProgress / toggleGoal / addGoal / removeGoal。
   */
  async function updatePlan(id: string, patch: PlanUpdatePatch): Promise<StudentPlanOp> {
    const idx = entries.value.findIndex(p => p.id === id)
    if (idx === -1) return { ok: false, reason: 'not-found' }
    const current = entries.value[idx]
    const nextTitle = patch.title !== undefined ? patch.title.trim() : current.title
    if (!nextTitle) return { ok: false, reason: 'empty' }
    const nextStart = patch.startDate ?? current.startDate
    const nextEnd = patch.endDate ?? current.endDate
    if (nextEnd <= nextStart) return { ok: false, reason: 'invalid-range' }
    const next: StudentPlan = {
      ...current,
      type: patch.type ?? current.type,
      title: Array.from(nextTitle).slice(0, 50).join(''),
      startDate: nextStart,
      endDate: nextEnd,
      updatedAt: isoNow()
    }
    if (patch.review !== undefined) {
      const reviewTrim = patch.review.trim()
      next.review = reviewTrim ? Array.from(reviewTrim).slice(0, 5000).join('') : undefined
    }
    entries.value = [...entries.value.slice(0, idx), next, ...entries.value.slice(idx + 1)]
    entries.value = sortPlansCore(entries.value)
    await savePlans()
    return { ok: true }
  }

  async function deletePlan(id: string): Promise<void> {
    entries.value = entries.value.filter(p => p.id !== id)
    await savePlans()
  }

  // ========================================
  // 目标 CRUD
  // ========================================

  async function addGoal(planId: string, content: string): Promise<StudentPlanOp> {
    const plan = entries.value.find(p => p.id === planId)
    if (!plan) return { ok: false, reason: 'not-found' }
    const text = content.trim()
    if (!text) return { ok: false, reason: 'empty' }
    plan.goals.push({
      id: genGoalId(),
      content: Array.from(text).slice(0, 100).join(''),
      progress: 0,
      done: false
    })
    plan.updatedAt = isoNow()
    await savePlans()
    return { ok: true }
  }

  async function removeGoal(planId: string, goalId: string): Promise<StudentPlanOp> {
    const plan = entries.value.find(p => p.id === planId)
    if (!plan) return { ok: false, reason: 'not-found' }
    const before = plan.goals.length
    plan.goals = plan.goals.filter(g => g.id !== goalId)
    if (plan.goals.length === before) return { ok: false, reason: 'not-found' }
    plan.updatedAt = isoNow()
    await savePlans()
    return { ok: true }
  }

  /**
   * 更新目标进度：递增不递减；progress=100 自动 done=true。
   */
  async function updateProgress(planId: string, goalId: string, newProgress: number): Promise<StudentPlanOp> {
    const idx = entries.value.findIndex(p => p.id === planId)
    if (idx === -1) return { ok: false, reason: 'not-found' }
    const updated = updateGoalProgressCore(entries.value[idx], goalId, newProgress)
    entries.value = [
      ...entries.value.slice(0, idx),
      updated,
      ...entries.value.slice(idx + 1)
    ]
    await savePlans()
    return { ok: true }
  }

  /** 切换目标完成态 */
  async function toggleGoal(planId: string, goalId: string): Promise<StudentPlanOp> {
    const idx = entries.value.findIndex(p => p.id === planId)
    if (idx === -1) return { ok: false, reason: 'not-found' }
    const updated = toggleGoalDoneCore(entries.value[idx], goalId)
    entries.value = [
      ...entries.value.slice(0, idx),
      updated,
      ...entries.value.slice(idx + 1)
    ]
    await savePlans()
    return { ok: true }
  }

  // ========================================
  // 薄委托查询（视图层禁止内联重算）
  // ========================================

  /** 按类型筛选 */
  function filterByType(type: StudentPlanType | 'all'): StudentPlan[] {
    return filterByTypeCore(entries.value, type)
  }

  /** 计划整体进度（0-100） */
  function planProgress(plan: StudentPlan): number {
    return calcPlanProgressCore(plan)
  }

  /** 活跃判定 */
  function isActive(plan: StudentPlan): boolean {
    return isPlanActiveCore(plan, localToday())
  }

  /** 已完成判定 */
  function isCompleted(plan: StudentPlan): boolean {
    return isPlanCompletedCore(plan)
  }

  /** 统计（基于今日） */
  function stats() {
    return calcPlanStatsCore(entries.value, localToday())
  }

  return {
    // 状态
    entries,
    // 持久化
    loadPlans,
    savePlans,
    // CRUD
    addPlan,
    updatePlan,
    deletePlan,
    // 目标 CRUD
    addGoal,
    removeGoal,
    updateProgress,
    toggleGoal,
    // 查询
    filterByType,
    planProgress,
    isActive,
    isCompleted,
    stats
  }
})
