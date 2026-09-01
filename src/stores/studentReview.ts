// 学生工作台复习计划 store（艾宾浩斯间隔复习）
// 数据存 IndexedDB store 'student_review' 单对象 { entries }，严格隔离成人数据。
// 薄委托 studentReviewCore：归一化/排序/学科筛选/阶段推进/统计均为纯函数，store 禁止内联重算。

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  emptyReviewData,
  normalizeReviewData,
  sortReview as sortReviewCore,
  filterBySubject as filterBySubjectCore,
  calcReviewStats as calcReviewStatsCore,
  isDueToday as isDueTodayCore,
  isOverdue as isOverdueCore,
  advanceStage as advanceStageCore,
  resetStage as resetStageCore,
  stageLabel as stageLabelCore,
  daysUntil as daysUntilCore,
  REVIEW_ID_PREFIX
} from '@/composables/studentReviewCore'
import { localToday } from '@/composables/todoCore'
import { idbGet, idbPut } from '@/composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'
import type { StudentReviewData, StudentReviewItem } from '@/types'

const STORE_KEY = 'student_review'

/** 复习 CRUD 操作错误语义 */
export type StudentReviewOpError = 'empty' | 'not-found'
export type StudentReviewOp = { ok: boolean; reason?: StudentReviewOpError }

/** 新增复习条目输入 */
export interface NewReviewInput {
  subject: string
  knowledge: string
  source?: string
  learnDate: string
}

/** 更新复习条目 patch */
export interface ReviewUpdatePatch {
  subject?: string
  knowledge?: string
  source?: string
  learnDate?: string
}

function genId(): string {
  return `${REVIEW_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}

export const useStudentReviewStore = defineStore('studentReview', () => {
  const entries = ref<StudentReviewItem[]>([])

  // ========================================
  // 持久化
  // ========================================

  async function loadReview(): Promise<void> {
    try {
      const norm = normalizeReviewData(await idbGet<StudentReviewData>(STORE_KEY))
      entries.value = sortReviewCore(norm.entries)
    } catch (e) {
      console.error('[studentReview] load failed', e)
      entries.value = emptyReviewData().entries
    }
  }

  async function saveReview(): Promise<void> {
    try {
      await idbPut(STORE_KEY, { entries: JSON.parse(JSON.stringify(entries.value)) })
    markDirty()
    } catch (e) {
      console.error('[studentReview] save failed', e)
    }
  }

  // ========================================
  // CRUD
  // ========================================

  /**
   * 新增复习条目：subject/knowledge/learnDate 必填；stage 默认 1；
   * nextReviewDate 由 core 自动计算（learnDate + 1 天）。
   */
  async function addReview(input: NewReviewInput): Promise<StudentReviewOp> {
    const subject = input.subject.trim()
    const knowledge = input.knowledge.trim()
    if (!subject || !knowledge) return { ok: false, reason: 'empty' }
    if (!input.learnDate) return { ok: false, reason: 'empty' }
    const now = isoNow()
    const stage = 1
    const base = new Date(`${input.learnDate}T00:00:00`)
    base.setDate(base.getDate() + 1)
    const nextReviewDate = base.toISOString().slice(0, 10)
    entries.value.push({
      id: genId(),
      subject,
      knowledge: Array.from(knowledge).slice(0, 200).join(''),
      learnDate: input.learnDate,
      stage,
      nextReviewDate,
      mastered: false,
      createdAt: now,
      updatedAt: now,
      ...(input.source && input.source.trim() ? { source: Array.from(input.source.trim()).slice(0, 50).join('') } : {})
    })
    entries.value = sortReviewCore(entries.value)
    await saveReview()
    return { ok: true }
  }

  async function updateReview(id: string, patch: ReviewUpdatePatch): Promise<StudentReviewOp> {
    const idx = entries.value.findIndex(e => e.id === id)
    if (idx === -1) return { ok: false, reason: 'not-found' }
    const current = entries.value[idx]
    const nextSubject = patch.subject !== undefined ? patch.subject.trim() : current.subject
    const nextKnowledge = patch.knowledge !== undefined ? patch.knowledge.trim() : current.knowledge
    if (!nextSubject || !nextKnowledge) return { ok: false, reason: 'empty' }
    const nextLearnDate = patch.learnDate ?? current.learnDate
    if (!nextLearnDate) return { ok: false, reason: 'empty' }
    // learnDate 变了 → nextReviewDate 重算（保持 stage 不变）
    let nextReviewDate = current.nextReviewDate
    if (patch.learnDate && patch.learnDate !== current.learnDate) {
      const base = new Date(`${patch.learnDate}T00:00:00`)
      const intervals = [1, 2, 4, 7, 15, 30]
      base.setDate(base.getDate() + (intervals[current.stage - 1] ?? 1))
      nextReviewDate = base.toISOString().slice(0, 10)
    }
    const next: StudentReviewItem = {
      ...current,
      subject: nextSubject,
      knowledge: Array.from(nextKnowledge).slice(0, 200).join(''),
      learnDate: nextLearnDate,
      nextReviewDate,
      updatedAt: isoNow()
    }
    if (patch.source !== undefined) {
      const srcTrim = patch.source.trim()
      next.source = srcTrim ? Array.from(srcTrim).slice(0, 50).join('') : undefined
    }
    entries.value = [...entries.value.slice(0, idx), next, ...entries.value.slice(idx + 1)]
    entries.value = sortReviewCore(entries.value)
    await saveReview()
    return { ok: true }
  }

  async function deleteReview(id: string): Promise<void> {
    entries.value = entries.value.filter(e => e.id !== id)
    await saveReview()
  }

  // ========================================
  // 阶段推进 / 重置
  // ========================================

  /** 标记复习完成 → 推进到下一阶段；末阶段自动 mastered=true */
  async function advance(id: string): Promise<StudentReviewOp> {
    const idx = entries.value.findIndex(e => e.id === id)
    if (idx === -1) return { ok: false, reason: 'not-found' }
    const updated = advanceStageCore(entries.value[idx])
    entries.value = [...entries.value.slice(0, idx), updated, ...entries.value.slice(idx + 1)]
    entries.value = sortReviewCore(entries.value)
    await saveReview()
    return { ok: true }
  }

  /** 重置到阶段 1（用户反馈未掌握） */
  async function reset(id: string): Promise<StudentReviewOp> {
    const idx = entries.value.findIndex(e => e.id === id)
    if (idx === -1) return { ok: false, reason: 'not-found' }
    const updated = resetStageCore(entries.value[idx])
    entries.value = [...entries.value.slice(0, idx), updated, ...entries.value.slice(idx + 1)]
    entries.value = sortReviewCore(entries.value)
    await saveReview()
    return { ok: true }
  }

  // ========================================
  // 薄委托查询（视图层禁止内联重算）
  // ========================================

  /** 按学科筛选 */
  function filterBySubject(subject: 'all' | string): StudentReviewItem[] {
    return filterBySubjectCore(entries.value, subject)
  }

  /** 今日到期 */
  function isDueToday(item: StudentReviewItem): boolean {
    return isDueTodayCore(item, localToday())
  }

  /** 逾期 */
  function isOverdue(item: StudentReviewItem): boolean {
    return isOverdueCore(item, localToday())
  }

  /** 阶段标签 */
  function stageText(stage: number): string {
    return stageLabelCore(stage)
  }

  /** 距离今日的天数 */
  function daysToReview(nextReviewDate: string): number {
    return daysUntilCore(nextReviewDate, localToday())
  }

  /** 统计 */
  function stats() {
    return calcReviewStatsCore(entries.value, localToday())
  }

  return {
    // 状态
    entries,
    // 持久化
    loadReview,
    saveReview,
    // CRUD
    addReview,
    updateReview,
    deleteReview,
    // 阶段
    advance,
    reset,
    // 查询
    filterBySubject,
    isDueToday,
    isOverdue,
    stageText,
    daysToReview,
    stats
  }
})
