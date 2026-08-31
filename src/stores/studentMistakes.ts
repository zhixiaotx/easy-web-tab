// 学生工作台错题本 store
// 数据存 IndexedDB store 'student_mistakes' 单对象 { entries }，严格隔离成人数据。
// 薄委托 studentMistakesCore：归一化/排序/学科筛选/状态/标签/关键词/统计/状态流转均为纯函数，
// store 禁止内联重算。

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  emptyMistakesData,
  normalizeMistakesData,
  sortMistakes as sortMistakesCore,
  filterBySubjectMistakes as filterBySubjectCore,
  filterByStatus as filterByStatusCore,
  filterByTags as filterByTagsCore,
  filterByKeyword as filterByKeywordCore,
  calcMistakeStats as calcMistakeStatsCore,
  advanceStatus as advanceStatusCore,
  resetStatus as resetStatusCore,
  statusLabel as statusLabelCore,
  MISTAKE_ID_PREFIX
} from '@/composables/studentMistakesCore'
import { localToday } from '@/composables/todoCore'
import { idbGet, idbPut } from '@/composables/useIdb'
import type { StudentMistake, StudentMistakeStatus, StudentMistakesData } from '@/types'

const STORE_KEY = 'student_mistakes'

/** 错题 CRUD 操作错误语义 */
export type StudentMistakesOpError = 'empty' | 'not-found'
export type StudentMistakesOp = { ok: boolean; reason?: StudentMistakesOpError }

/** 新增错题输入 */
export interface NewMistakeInput {
  subject: string
  title?: string
  question: string
  answer: string
  analysis?: string
  tags?: string[]
  linkedReviewId?: string
}

/** 更新错题 patch */
export interface MistakeUpdatePatch {
  subject?: string
  title?: string
  question?: string
  answer?: string
  analysis?: string
  tags?: string[]
  linkedReviewId?: string
}

function genId(): string {
  return `${MISTAKE_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}

/** 标签归一化（与 core 一致；用于新增/更新时的输入处理） */
function normalizeTagsInput(raw: string[] | undefined): string[] {
  if (!raw || !Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of raw) {
    if (typeof t !== 'string') continue
    const trimmed = t.trim()
    if (!trimmed) continue
    const sliced = Array.from(trimmed).slice(0, 20).join('')
    if (seen.has(sliced)) continue
    seen.add(sliced)
    out.push(sliced)
    if (out.length >= 10) break
  }
  return out
}

export const useStudentMistakesStore = defineStore('studentMistakes', () => {
  const entries = ref<StudentMistake[]>([])

  // ========================================
  // 持久化
  // ========================================

  async function loadMistakes(): Promise<void> {
    try {
      const norm = normalizeMistakesData(await idbGet<StudentMistakesData>(STORE_KEY))
      entries.value = sortMistakesCore(norm.entries)
    } catch (e) {
      console.error('[studentMistakes] load failed', e)
      entries.value = emptyMistakesData().entries
    }
  }

  async function saveMistakes(): Promise<void> {
    try {
      await idbPut(STORE_KEY, { entries: JSON.parse(JSON.stringify(entries.value)) })
    } catch (e) {
      console.error('[studentMistakes] save failed', e)
    }
  }

  // ========================================
  // CRUD
  // ========================================

  /** 新增错题：subject/question/answer 必填 */
  async function addMistake(input: NewMistakeInput): Promise<StudentMistakesOp> {
    const subject = input.subject.trim()
    const question = input.question.trim()
    const answer = input.answer.trim()
    if (!subject || !question || !answer) return { ok: false, reason: 'empty' }
    const now = isoNow()
    const out: StudentMistake = {
      id: genId(),
      subject: Array.from(subject).slice(0, 50).join(''),
      question: Array.from(question).slice(0, 5000).join(''),
      answer: Array.from(answer).slice(0, 5000).join(''),
      tags: normalizeTagsInput(input.tags),
      imageIds: [], // M3 不支持图片
      status: 'new',
      createdAt: now,
      updatedAt: now
    }
    if (input.title && input.title.trim()) {
      out.title = Array.from(input.title.trim()).slice(0, 100).join('')
    }
    if (input.analysis && input.analysis.trim()) {
      out.analysis = Array.from(input.analysis.trim()).slice(0, 5000).join('')
    }
    if (input.linkedReviewId && input.linkedReviewId.trim()) {
      out.linkedReviewId = input.linkedReviewId.trim()
    }
    entries.value.push(out)
    entries.value = sortMistakesCore(entries.value)
    await saveMistakes()
    return { ok: true }
  }

  async function updateMistake(id: string, patch: MistakeUpdatePatch): Promise<StudentMistakesOp> {
    const idx = entries.value.findIndex(e => e.id === id)
    if (idx === -1) return { ok: false, reason: 'not-found' }
    const current = entries.value[idx]
    const nextSubject = patch.subject !== undefined ? patch.subject.trim() : current.subject
    const nextQuestion = patch.question !== undefined ? patch.question.trim() : current.question
    const nextAnswer = patch.answer !== undefined ? patch.answer.trim() : current.answer
    if (!nextSubject || !nextQuestion || !nextAnswer) return { ok: false, reason: 'empty' }
    const next: StudentMistake = {
      ...current,
      subject: Array.from(nextSubject).slice(0, 50).join(''),
      question: Array.from(nextQuestion).slice(0, 5000).join(''),
      answer: Array.from(nextAnswer).slice(0, 5000).join(''),
      tags: patch.tags !== undefined ? normalizeTagsInput(patch.tags) : current.tags,
      updatedAt: isoNow()
    }
    if (patch.title !== undefined) {
      const t = patch.title.trim()
      if (t) next.title = Array.from(t).slice(0, 100).join('')
      else delete next.title
    }
    if (patch.analysis !== undefined) {
      const a = patch.analysis.trim()
      if (a) next.analysis = Array.from(a).slice(0, 5000).join('')
      else delete next.analysis
    }
    if (patch.linkedReviewId !== undefined) {
      const r = patch.linkedReviewId.trim()
      if (r) next.linkedReviewId = r
      else delete next.linkedReviewId
    }
    entries.value = [...entries.value.slice(0, idx), next, ...entries.value.slice(idx + 1)]
    entries.value = sortMistakesCore(entries.value)
    await saveMistakes()
    return { ok: true }
  }

  async function deleteMistake(id: string): Promise<void> {
    entries.value = entries.value.filter(e => e.id !== id)
    await saveMistakes()
  }

  // ========================================
  // 状态流转
  // ========================================

  /** 推进状态：new → reviewing → mastered */
  async function advance(id: string): Promise<StudentMistakesOp> {
    const idx = entries.value.findIndex(e => e.id === id)
    if (idx === -1) return { ok: false, reason: 'not-found' }
    const updated = advanceStatusCore(entries.value[idx])
    entries.value = [...entries.value.slice(0, idx), updated, ...entries.value.slice(idx + 1)]
    entries.value = sortMistakesCore(entries.value)
    await saveMistakes()
    return { ok: true }
  }

  /** 重置为未复习状态 */
  async function reset(id: string): Promise<StudentMistakesOp> {
    const idx = entries.value.findIndex(e => e.id === id)
    if (idx === -1) return { ok: false, reason: 'not-found' }
    const updated = resetStatusCore(entries.value[idx])
    entries.value = [...entries.value.slice(0, idx), updated, ...entries.value.slice(idx + 1)]
    entries.value = sortMistakesCore(entries.value)
    await saveMistakes()
    return { ok: true }
  }

  /** 关联复习条目（错题已掌握后挂到复习计划） */
  async function linkReview(id: string, reviewId: string | undefined): Promise<StudentMistakesOp> {
    const idx = entries.value.findIndex(e => e.id === id)
    if (idx === -1) return { ok: false, reason: 'not-found' }
    const current = entries.value[idx]
    const next: StudentMistake = { ...current, updatedAt: isoNow() }
    const r = reviewId?.trim()
    if (r) next.linkedReviewId = r
    else delete next.linkedReviewId
    entries.value = [...entries.value.slice(0, idx), next, ...entries.value.slice(idx + 1)]
    entries.value = sortMistakesCore(entries.value)
    await saveMistakes()
    return { ok: true }
  }

  // ========================================
  // 薄委托查询（视图层禁止内联重算）
  // ========================================

  /** 按学科筛选 */
  function filterBySubject(subject: 'all' | string): StudentMistake[] {
    return filterBySubjectCore(entries.value, subject)
  }

  /** 按状态筛选 */
  function filterByStatus(status: 'all' | StudentMistakeStatus): StudentMistake[] {
    return filterByStatusCore(entries.value, status)
  }

  /** 按标签筛选 */
  function filterByTags(tags: string[]): StudentMistake[] {
    return filterByTagsCore(entries.value, tags)
  }

  /** 关键词筛选 */
  function filterByKeyword(keyword: string): StudentMistake[] {
    return filterByKeywordCore(entries.value, keyword)
  }

  /** 状态中文标签 */
  function statusText(status: StudentMistakeStatus): string {
    return statusLabelCore(status)
  }

  /** 统计 */
  function stats() {
    return calcMistakeStatsCore(entries.value, localToday())
  }

  return {
    // 状态
    entries,
    // 持久化
    loadMistakes,
    saveMistakes,
    // CRUD
    addMistake,
    updateMistake,
    deleteMistake,
    // 状态流转
    advance,
    reset,
    linkReview,
    // 查询
    filterBySubject,
    filterByStatus,
    filterByTags,
    filterByKeyword,
    statusText,
    stats
  }
})
