// 学生工作台教育经历纯逻辑（归一化/校验/排序）
// 零 vue/pinia/DOM 依赖，node --experimental-strip-types 可测。
// store/组件禁止内联重算。

import type { EducationEntry, EducationData } from '@/types'
import { DEGREE_OPTIONS } from '@/types'

export const EDUCATION_ID_PREFIX = 'edu_'

/** 生成教育经历条目 ID */
export function genEducationId(): string {
  return `${EDUCATION_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 空教育经历数据 */
export function emptyEducationData(): EducationData {
  return { entries: [] }
}

/** ISO 时间戳 */
export function isoNow(): string {
  return new Date().toISOString()
}

/**
 * 归一化教育经历数据（幂等）：
 * - 非对象/缺 entries → empty
 * - 逐条校验：id 缺失回退 edu_<timestamp>；schoolName trim；degree 非法→跳过；
 *   startDate/endDate trim；isActive 强制布尔；可选字段 trim
 * - 幂等：多次调用结果一致
 */
export function normalizeEducationData(raw: unknown): EducationData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyEducationData()
  }
  const obj = raw as Record<string, unknown>
  const arr = obj.entries
  if (!Array.isArray(arr)) return emptyEducationData()

  const entries: EducationEntry[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const e = item as Record<string, unknown>
    const schoolName = typeof e.schoolName === 'string' ? e.schoolName.trim() : ''
    const degree = typeof e.degree === 'string' && (DEGREE_OPTIONS as readonly string[]).includes(e.degree) ? e.degree : ''
    if (!schoolName || !degree) continue

    const startDate = typeof e.startDate === 'string' ? e.startDate.trim() : ''
    if (!startDate) continue

    const isActive = e.isActive === true
    const endDate = typeof e.endDate === 'string' ? e.endDate.trim() : ''
    const finalEndDate = isActive ? undefined : (endDate || undefined)

    const entry: EducationEntry = {
      id: typeof e.id === 'string' && e.id.trim() ? e.id.trim() : genEducationId(),
      schoolName,
      degree,
      startDate,
      isActive,
      createdAt: typeof e.createdAt === 'string' ? e.createdAt : isoNow(),
      updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : isoNow()
    }
    if (finalEndDate) entry.endDate = finalEndDate
    if (typeof e.major === 'string' && e.major.trim()) entry.major = e.major.trim()
    if (typeof e.classTeacher === 'string' && e.classTeacher.trim()) entry.classTeacher = e.classTeacher.trim()
    if (typeof e.courseTeacher === 'string' && e.courseTeacher.trim()) entry.courseTeacher = e.courseTeacher.trim()
    if (typeof e.phone === 'string' && e.phone.trim()) entry.phone = e.phone.trim()
    if (typeof e.note === 'string' && e.note.trim()) entry.note = e.note.trim()
    entries.push(entry)
  }
  return { entries }
}

/** 校验结果 */
export interface EducationValidation {
  ok: boolean
  errors: string[]
}

/**
 * 校验教育经历条目（新增/编辑时）：
 * 1. schoolName trim 后非空且 <=50 字符
 * 2. degree 必须在 DEGREE_OPTIONS 中
 * 3. startDate 必填（YYYY-MM-DD）
 * 4. endDate 如填写，必须晚于 startDate
 * 5. isActive===true 时 endDate 必须为空
 */
export function validateEducationEntry(input: {
  schoolName: string
  degree: string
  startDate: string
  endDate?: string
  isActive: boolean
}): EducationValidation {
  const errors: string[] = []
  const schoolName = input.schoolName.trim()
  if (!schoolName) {
    errors.push('学校名称不能为空')
  } else if (Array.from(schoolName).length > 50) {
    errors.push('学校名称不超过 50 字符')
  }

  if (!(DEGREE_OPTIONS as readonly string[]).includes(input.degree)) {
    errors.push('学段/学历无效')
  }

  const startDate = input.startDate.trim()
  if (!startDate) {
    errors.push('入学日期不能为空')
  }

  const endDate = input.endDate?.trim() || ''
  if (input.isActive && endDate) {
    errors.push('在读状态下不可填写毕业日期')
  }
  if (endDate && startDate && endDate <= startDate) {
    errors.push('毕业日期必须晚于入学日期')
  }

  return { ok: errors.length === 0, errors }
}

/**
 * 排序教育经历：按 startDate 降序（最近入学的排前面），不改变入参
 */
export function sortEducationEntries(entries: EducationEntry[]): EducationEntry[] {
  return [...entries].sort((a, b) => {
    return b.startDate.localeCompare(a.startDate)
  })
}
