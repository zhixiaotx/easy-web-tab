// 学生工作台教育经历 store（数据存 IndexedDB store 'student_education' 单对象 { entries }）
// 薄委托 studentEducationCore：归一化/校验/排序均为纯函数，store 禁止内联重算。

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { idbGet, idbPut } from '@/composables/useIdb'
import type { EducationEntry, EducationData } from '@/types'
import {
  emptyEducationData,
  normalizeEducationData,
  validateEducationEntry,
  sortEducationEntries,
  genEducationId,
  isoNow
} from '@/composables/studentEducationCore'

export type EducationOpError = 'empty' | 'duplicate' | 'not-found' | 'validation'
export type EducationOp = { ok: boolean; reason?: EducationOpError; errors?: string[] }

export interface NewEducationInput {
  schoolName: string
  degree: string
  major?: string
  startDate: string
  endDate?: string
  isActive: boolean
  classTeacher?: string
  courseTeacher?: string
  phone?: string
  note?: string
}

export type EducationUpdatePatch = Partial<NewEducationInput>

export const useStudentEducationStore = defineStore('studentEducation', () => {
  const entries = ref<EducationEntry[]>([])

  // ========================================
  // 持久化
  // ========================================

  async function loadEducation(): Promise<void> {
    try {
      const norm = normalizeEducationData(await idbGet<EducationData>('student_education'))
      entries.value = sortEducationEntries(norm.entries)
    } catch (e) {
      console.error('[studentEducation] load failed', e)
      entries.value = emptyEducationData().entries
    }
  }

  async function saveEducation(): Promise<void> {
    try {
      await idbPut('student_education', { entries: JSON.parse(JSON.stringify(entries.value)) })
    } catch (e) {
      console.error('[studentEducation] save failed', e)
    }
  }

  // ========================================
  // 只读 computed
  // ========================================

  const sortedEntries = computed(() => sortEducationEntries(entries.value))

  const totalCount = computed(() => entries.value.length)

  // ========================================
  // CRUD
  // ========================================

  /** 新增教育经历 */
  async function addEducation(input: NewEducationInput): Promise<EducationOp> {
    const validation = validateEducationEntry(input)
    if (!validation.ok) {
      return { ok: false, reason: 'validation', errors: validation.errors }
    }

    const entry: EducationEntry = {
      id: genEducationId(),
      schoolName: input.schoolName.trim(),
      degree: input.degree,
      startDate: input.startDate.trim(),
      isActive: input.isActive,
      createdAt: isoNow(),
      updatedAt: isoNow()
    }
    if (input.endDate && !input.isActive) entry.endDate = input.endDate.trim()
    if (input.major?.trim()) entry.major = input.major.trim()
    if (input.classTeacher?.trim()) entry.classTeacher = input.classTeacher.trim()
    if (input.courseTeacher?.trim()) entry.courseTeacher = input.courseTeacher.trim()
    if (input.phone?.trim()) entry.phone = input.phone.trim()
    if (input.note?.trim()) entry.note = input.note.trim()

    entries.value.push(entry)
    entries.value = sortEducationEntries(entries.value)
    await saveEducation()
    return { ok: true }
  }

  /** 更新教育经历 */
  async function updateEducation(id: string, patch: EducationUpdatePatch): Promise<EducationOp> {
    const idx = entries.value.findIndex(e => e.id === id)
    if (idx === -1) return { ok: false, reason: 'not-found' }

    const current = entries.value[idx]
    const merged: NewEducationInput = {
      schoolName: patch.schoolName ?? current.schoolName,
      degree: patch.degree ?? current.degree,
      major: patch.major ?? current.major,
      startDate: patch.startDate ?? current.startDate,
      endDate: patch.endDate ?? current.endDate,
      isActive: patch.isActive ?? current.isActive,
      classTeacher: patch.classTeacher ?? current.classTeacher,
      courseTeacher: patch.courseTeacher ?? current.courseTeacher,
      phone: patch.phone ?? current.phone,
      note: patch.note ?? current.note
    }

    const validation = validateEducationEntry(merged)
    if (!validation.ok) {
      return { ok: false, reason: 'validation', errors: validation.errors }
    }

    entries.value[idx] = {
      ...current,
      schoolName: merged.schoolName.trim(),
      degree: merged.degree,
      startDate: merged.startDate.trim(),
      isActive: merged.isActive,
      updatedAt: isoNow()
    }
    // 处理可选字段
    if (merged.endDate && !merged.isActive) {
      entries.value[idx].endDate = merged.endDate.trim()
    } else {
      delete entries.value[idx].endDate
    }
    if (merged.major?.trim()) entries.value[idx].major = merged.major.trim()
    else delete entries.value[idx].major
    if (merged.classTeacher?.trim()) entries.value[idx].classTeacher = merged.classTeacher.trim()
    else delete entries.value[idx].classTeacher
    if (merged.courseTeacher?.trim()) entries.value[idx].courseTeacher = merged.courseTeacher.trim()
    else delete entries.value[idx].courseTeacher
    if (merged.phone?.trim()) entries.value[idx].phone = merged.phone.trim()
    else delete entries.value[idx].phone
    if (merged.note?.trim()) entries.value[idx].note = merged.note.trim()
    else delete entries.value[idx].note

    entries.value = sortEducationEntries(entries.value)
    await saveEducation()
    return { ok: true }
  }

  /** 删除教育经历 */
  async function deleteEducation(id: string): Promise<EducationOp> {
    const idx = entries.value.findIndex(e => e.id === id)
    if (idx === -1) return { ok: false, reason: 'not-found' }
    entries.value.splice(idx, 1)
    await saveEducation()
    return { ok: true }
  }

  return {
    entries,
    sortedEntries,
    totalCount,
    loadEducation,
    saveEducation,
    addEducation,
    updateEducation,
    deleteEducation
  }
})
