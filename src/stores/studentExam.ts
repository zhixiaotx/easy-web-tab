// 学生工作台考试倒计时 store（数据存 IndexedDB store 'student_countdowns' 单对象信封）
// 薄委托 studentExamCore + countdownCore：归一化/remaining/排序/筛选均为纯函数，store 禁止内联重算。
// 严格隔离成人 countdowns store（独立 IDB 名 + 独立信封 { countdowns, customCategories, sortRule }）。
// 考试事件由用户主动创建（带具体日期），不参与 stageSeeded 自动播种。

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  emptyExamData,
  normalizeExamData,
  buildExamItems,
  examTypeOptions,
  EXAM_DEFAULT_SORT,
  EXAM_DEFAULT_DIRECTION,
  normalizeCountdown,
  calcRemaining,
  sortCountdowns,
  filterCountdowns,
  type CountdownSortMode,
  type CountdownSortDirection,
  type CountdownFilterCriteria
} from '@/composables/studentExamCore'
import { idbGet, idbPut } from '@/composables/useIdb'
import type { Countdown, CountdownCategory, CountdownItem, CountdownRepeat, StudentStage } from '@/types'

const STORE_KEY = 'student_countdowns'

export type StudentExamOpError = 'empty' | 'invalid-time' | 'not-found' | 'duplicate' | 'in-use'
export type StudentExamOp = { ok: boolean; reason?: StudentExamOpError }

export interface NewExamInput {
  name: string
  endDateTime: string // 'YYYY-MM-DDTHH:mm' 本地时间
  category?: CountdownCategory // 考试题型：期中考试/期末考试/月考/自定义
  color?: string
  repeat?: CountdownRepeat | null // 缺省一次性（null）
}

export interface ExamUpdatePatch {
  name?: string
  endDateTime?: string
  category?: CountdownCategory
  color?: string
  repeat?: CountdownRepeat | null
}

const SORT_MODES: readonly CountdownSortMode[] = ['remaining', 'name', 'created', 'endTime', 'manual']

function genId(): string {
  return `cd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}

/** 'YYYY-MM-DDTHH:mm' 本地时间格式校验（与成人 countdown 一致） */
function isValidLocalDateTime(s: string): boolean {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return false
  const t = new Date(s.replace('T', ' ')).getTime()
  return !isNaN(t)
}

export const useStudentExamStore = defineStore('studentExam', () => {
  const countdowns = ref<Countdown[]>([])
  const customCategories = ref<string[]>([])
  const sortMode = ref<CountdownSortMode>(EXAM_DEFAULT_SORT)
  const sortDirection = ref<CountdownSortDirection>(EXAM_DEFAULT_DIRECTION)

  // ===== 加载/保存 =====

  async function loadExams(): Promise<void> {
    try {
      const norm = normalizeExamData(await idbGet<unknown>(STORE_KEY))
      countdowns.value = norm.countdowns
      customCategories.value = norm.customCategories ?? []
      const rule = norm.sortRule as CountdownSortMode
      if (SORT_MODES.includes(rule)) sortMode.value = rule
    } catch (e) {
      console.error('[studentExam] load failed', e)
      const empty = emptyExamData()
      countdowns.value = empty.countdowns
      customCategories.value = empty.customCategories ?? []
    }
  }

  async function saveExams(): Promise<void> {
    try {
      //, ：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError）
      await idbPut(STORE_KEY, {
        countdowns: JSON.parse(JSON.stringify(countdowns.value)),
        customCategories: JSON.parse(JSON.stringify(customCategories.value)),
        sortRule: sortMode.value
      })
      // M2-M4 云同步 student-backup 信封留后续阶段接入
    } catch (e) {
      console.error('[studentExam] save failed', e)
    }
  }

  // ===== 考试 CRUD =====

  async function addExam(input: NewExamInput): Promise<StudentExamOp> {
    const name = input.name.trim()
    if (!name) return { ok: false, reason: 'empty' }
    if (!isValidLocalDateTime(input.endDateTime)) return { ok: false, reason: 'invalid-time' }
    const now = isoNow()
    countdowns.value.push(
      normalizeCountdown({
        id: genId(),
        name,
        endDateTime: input.endDateTime,
        repeat: input.repeat ?? null,
        category: input.category,
        color: input.color,
        createdAt: now,
        updatedAt: now,
        sortOrder:
          countdowns.value.reduce((m, c) => Math.max(m, typeof c.sortOrder === 'number' ? c.sortOrder : 0), 0) + 1
      })
    )
    await saveExams()
    return { ok: true }
  }

  async function updateExam(id: string, patch: ExamUpdatePatch): Promise<StudentExamOp> {
    const index = countdowns.value.findIndex(c => c.id === id)
    if (index === -1) return { ok: false, reason: 'not-found' }
    if (patch.name !== undefined && !patch.name.trim()) return { ok: false, reason: 'empty' }
    if (patch.endDateTime !== undefined && !isValidLocalDateTime(patch.endDateTime)) {
      return { ok: false, reason: 'invalid-time' }
    }
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined)
    ) as ExamUpdatePatch
    countdowns.value[index] = normalizeCountdown({
      ...countdowns.value[index],
      ...clean,
      updatedAt: isoNow()
    })
    await saveExams()
    return { ok: true }
  }

  async function deleteExam(id: string): Promise<StudentExamOp> {
    if (!countdowns.value.some(c => c.id === id)) return { ok: false, reason: 'not-found' }
    countdowns.value = countdowns.value.filter(c => c.id !== id)
    await saveExams()
    return { ok: true }
  }

  // ===== 考试题型（customCategories）CRUD =====

  function addExamType(name: string): StudentExamOp {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, reason: 'empty' }
    if (customCategories.value.includes(trimmed)) return { ok: false, reason: 'duplicate' }
    customCategories.value.push(trimmed)
    void saveExams()
    return { ok: true }
  }

  function renameExamType(oldName: string, newName: string): StudentExamOp {
    const trimmed = newName.trim()
    if (!trimmed) return { ok: false, reason: 'empty' }
    if (trimmed === oldName) return { ok: true }
    if (customCategories.value.includes(trimmed)) return { ok: false, reason: 'duplicate' }
    const idx = customCategories.value.indexOf(oldName)
    if (idx === -1) return { ok: false, reason: 'not-found' }
    customCategories.value[idx] = trimmed
    // 同步考试条目 category 字段（,  重建触发响应式）
    countdowns.value = countdowns.value.map(c =>
      c.category === oldName ? { ...c, category: trimmed, updatedAt: isoNow() } : c
    )
    void saveExams()
    return { ok: true }
  }

  function deleteExamType(name: string): StudentExamOp {
    if (!customCategories.value.includes(name)) return { ok: false, reason: 'not-found' }
    // 被考试引用禁删（同成人 countdown 分类策略）
    if (countdowns.value.some(c => c.category === name)) return { ok: false, reason: 'in-use' }
    customCategories.value = customCategories.value.filter(c => c !== name)
    void saveExams()
    return { ok: true }
  }

  // ===== 排序 =====

  function setSort(mode: CountdownSortMode): void {
    if (!SORT_MODES.includes(mode) || mode === sortMode.value) return
    sortMode.value = mode
    void saveExams()
  }

  function toggleDirection(): void {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  }

  // ===== 只读薄委托 =====

  /** 带剩余时间的考试列表（按当前排序模式/方向） */
  const itemsWithRemaining = computed<CountdownItem[]>(() =>
    sortCountdowns(buildExamItems(countdowns.value), sortMode.value, sortDirection.value)
  )

  /** 按条件筛选（name 模糊 / category 精确 / repeat 规则类型） */
  function filterExams(items: CountdownItem[], criteria: CountdownFilterCriteria): CountdownItem[] {
    return filterCountdowns(items, criteria)
  }

  /** 表单下拉全量题型来源：学段内置建议 + 自定义分类 */
  function examTypeOptionsForStage(stage: StudentStage): string[] {
    return examTypeOptions(stage, customCategories.value)
  }

  /** 单条 remaining 计算（编辑预览用） */
  function remainingOf(endDateTime: string, repeat?: CountdownRepeat | null) {
    return calcRemaining(endDateTime, repeat)
  }

  return {
    // 状态
    countdowns,
    customCategories,
    sortMode,
    sortDirection,
    // 加载/保存
    loadExams,
    saveExams,
    // 考试 CRUD
    addExam,
    updateExam,
    deleteExam,
    // 题型 CRUD
    addExamType,
    renameExamType,
    deleteExamType,
    // 排序
    setSort,
    toggleDirection,
    // 只读
    itemsWithRemaining,
    filterExams,
    examTypeOptionsForStage,
    remainingOf
  }
})
