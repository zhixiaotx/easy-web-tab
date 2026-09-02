// 学生工作台作业管理 store（数据存 IndexedDB store 'student_homework' 单对象 { entries }）
// 薄委托 studentHomeworkCore：归一化/自动状态流转/学科筛选/排序均为纯函数，store 禁止内联重算。
// 严格隔离成人数据（独立 IDB 名 + 独立前缀 hw_）。

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  emptyHomeworkData,
  normalizeHomeworkData,
  autoFlowStatus,
  filterBySubject as filterBySubjectCore,
  filterByStatus as filterByStatusCore,
  sortHomework as sortHomeworkCore,
  nextStatus as nextStatusCore,
  HOMEWORK_ID_PREFIX
} from '@/composables/studentHomeworkCore'
import { localToday } from '@/composables/todoCore'
import { idbGet, idbPut } from '@/composables/useIdb'
import type {
  StudentHomework,
  StudentHomeworkData,
  StudentHomeworkPriority
} from '@/types'
import { useStudentRewardsStore } from '@/stores/studentRewards'
import { markDirty } from '@/composables/useCloudSync'

// 作业 CRUD 操作错误语义
export type StudentHomeworkOpError = 'empty' | 'duplicate' | 'not-found'
export type StudentHomeworkOp = { ok: boolean; reason?: StudentHomeworkOpError }

/** 新增作业的输入（id/createdAt/updatedAt/source 由 store 补全） */
export interface NewHomeworkInput {
  subject: string
  title: string
  content?: string
  dueDate: string
  priority: StudentHomeworkPriority
  source?: 'self' | 'parent'
}

/** 更新作业的 patch（status 单独走 advanceStatus，不在此处） */
export interface HomeworkUpdatePatch {
  subject?: string
  title?: string
  content?: string
  dueDate?: string
  priority?: StudentHomeworkPriority
}

function genId(): string {
  return `${HOMEWORK_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}

export const useStudentHomeworkStore = defineStore('studentHomework', () => {
  const entries = ref<StudentHomework[]>([])

  // ========================================
  // 持久化
  // ========================================

  async function loadHomework(): Promise<void> {
    try {
      const norm = normalizeHomeworkData(await idbGet<StudentHomeworkData>('student_homework'))
      // 加载时自动流转逾期状态（done 不动；pending/doing 且 dueDate < today → overdue）
      const flowed = autoFlowStatus(norm.entries, localToday())
      entries.value = flowed
      // 若流转产生变化则持久化一次
      const changed = flowed.some((e, i) => e.status !== norm.entries[i]?.status)
      if (changed) await saveHomework()
    } catch (e) {
      console.error('[studentHomework] load failed', e)
      entries.value = emptyHomeworkData().entries
    }
  }

  async function saveHomework(): Promise<void> {
    try {
      //, ：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError）
      await idbPut('student_homework', { entries: JSON.parse(JSON.stringify(entries.value)) })
      markDirty()
      // M2-M4 云同步 student-backup 信封留后续阶段接入
    } catch (e) {
      console.error('[studentHomework] save failed', e)
    }
  }

  // ========================================
  // CRUD
  // ========================================

  /**
   * 新增作业：subject/title/dueDate trim 非空；
   * 同 subject + title + dueDate 视为重复（避免误触多次新增）→ duplicate。
   */
  async function addHomework(input: NewHomeworkInput): Promise<StudentHomeworkOp> {
    const subject = input.subject.trim()
    const title = input.title.trim()
    const dueDate = input.dueDate.trim()
    if (!subject || !title || !dueDate) return { ok: false, reason: 'empty' }
    const dup = entries.value.some(
      e => e.subject === subject && e.title === title && e.dueDate === dueDate
    )
    if (dup) return { ok: false, reason: 'duplicate' }
    const now = isoNow()
    entries.value.push({
      id: genId(),
      subject,
      title,
      content: input.content?.trim() || undefined,
      dueDate,
      status: 'pending',
      priority: input.priority,
      source: input.source === 'parent' ? 'parent' : 'self',
      createdAt: now,
      updatedAt: now
    })
    await saveHomework()
    return { ok: true }
  }

  /** 更新作业字段（不含 status；status 走 advanceStatus）。 */
  async function updateHomework(id: string, patch: HomeworkUpdatePatch): Promise<StudentHomeworkOp> {
    const index = entries.value.findIndex(e => e.id === id)
    if (index === -1) return { ok: false, reason: 'not-found' }
    const cur = entries.value[index]
    const next: StudentHomework = { ...cur, updatedAt: isoNow() }
    if (patch.subject !== undefined) {
      const s = patch.subject.trim()
      if (!s) return { ok: false, reason: 'empty' }
      next.subject = s
    }
    if (patch.title !== undefined) {
      const t = patch.title.trim()
      if (!t) return { ok: false, reason: 'empty' }
      next.title = t
    }
    if (patch.content !== undefined) {
      next.content = patch.content.trim() || undefined
    }
    if (patch.dueDate !== undefined) {
      const d = patch.dueDate.trim()
      if (!d) return { ok: false, reason: 'empty' }
      next.dueDate = d
    }
    if (patch.priority !== undefined) {
      next.priority = patch.priority
    }
    // 重复校验排除自身
    const dup = entries.value.some(
      e => e.id !== id && e.subject === next.subject && e.title === next.title && e.dueDate === next.dueDate
    )
    if (dup) return { ok: false, reason: 'duplicate' }
    entries.value[index] = next
    await saveHomework()
    return { ok: true }
  }

  /** 删除作业：若已完成则撤销加分。 */
  async function deleteHomework(id: string): Promise<StudentHomeworkOp> {
    const hw = entries.value.find(e => e.id === id)
    if (!hw) return { ok: false, reason: 'not-found' }
    // 如果作业已完成，撤销加分
    if (hw.status === 'done') {
      try {
        const rewardsStore = useStudentRewardsStore()
        await rewardsStore.revokeFromHomework(id)
      } catch (e) {
        console.warn('[studentHomework] revokeFromHomework (delete) failed', e)
      }
    }
    entries.value = entries.value.filter(e => e.id !== id)
    await saveHomework()
    return { ok: true }
  }

  /**
   * 推进作业状态：pending → doing → done；doing → done；overdue → doing。
   * 切到 done 时写 completedAt + 联动积分 earnFromHomework（sourceId 幂等）。
   * 从 done 切回非 done 时清除 completedAt + 撤销加分（revokeFromHomework）。
   */
  async function advanceStatus(id: string): Promise<StudentHomeworkOp> {
    const index = entries.value.findIndex(e => e.id === id)
    if (index === -1) return { ok: false, reason: 'not-found' }
    const cur = entries.value[index]
    const next = nextStatusCore(cur.status)
    if (next === cur.status) return { ok: true } // done → done 幂等
    const updated: StudentHomework = {
      ...cur,
      status: next,
      updatedAt: isoNow()
    }
    const becameDone = next === 'done'
    const leftDone = cur.status === 'done' && next !== 'done'
    if (becameDone) {
      updated.completedAt = isoNow()
    } else {
      updated.completedAt = undefined
    }
    entries.value[index] = updated
    await saveHomework()
    const rewardsStore = useStudentRewardsStore()
    if (becameDone) {
      try {
        await rewardsStore.earnFromHomework(cur.id, cur.title)
      } catch (e) {
        console.warn('[studentHomework] earnFromHomework failed', e)
      }
    } else if (leftDone) {
      try {
        await rewardsStore.revokeFromHomework(cur.id)
      } catch (e) {
        console.warn('[studentHomework] revokeFromHomework failed', e)
      }
    }
    return { ok: true }
  }

  // ========================================
  // 只读薄委托（core 纯函数）
  // ========================================

  function filterBySubject(subject: string): StudentHomework[] {
    return filterBySubjectCore(entries.value, subject)
  }

  function filterByStatus(status: string): StudentHomework[] {
    return filterByStatusCore(entries.value, status)
  }

  function sortEntries(list: StudentHomework[]): StudentHomework[] {
    return sortHomeworkCore(list)
  }

  return {
    entries,
    loadHomework,
    saveHomework,
    addHomework,
    updateHomework,
    deleteHomework,
    advanceStatus,
    filterBySubject,
    filterByStatus,
    sortEntries
  }
})
