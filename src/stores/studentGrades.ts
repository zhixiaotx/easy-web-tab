// 学生工作台成绩记录 store（数据存 IndexedDB store 'student_grades' 单对象信封）
// 薄委托 studentGradesCore：归一化/校验/统计/排序均为纯函数，store 禁止内联重算。
// 严格隔离成人数据；成绩事件由用户主动创建（带具体日期），不参与 stageSeeded 自动播种。

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  emptyGradesData,
  normalizeGradesData,
  normalizeGradeRecord,
  validateNewGrade,
  calcGradeStats,
  sortGrades,
  gradeToStageKey,
  paginate,
  type NewGradeInput,
  type GradeUpdatePatch,
  type GradeOpError,
  type GradeSortMode,
  type GradeSortDirection,
  type GradeStats,
  type Paginated
} from '@/composables/studentGradesCore'
import { idbGet, idbPut } from '@/composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'
import { GRADE_LEVEL_ALL, GRADE_STAGE_GROUPS, STUDENT_GRADE_LEVELS } from '@/types'
import type { StudentGradeRecord } from '@/types'

const STORE_KEY = 'student_grades'

/** 每页展示条数 */
export const GRADE_PAGE_SIZE = 10

export type GradeOp = { ok: boolean; reason?: GradeOpError }

const SORT_MODES: readonly GradeSortMode[] = ['date', 'name', 'created']

function genId(): string {
  return `gr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}

export const useStudentGradesStore = defineStore('studentGrades', () => {
  const grades = ref<StudentGradeRecord[]>([])
  const sortMode = ref<GradeSortMode>('date')
  const sortDirection = ref<GradeSortDirection>('desc')
  /** 当前年级标签页：'' = 全部（该学段/全部学段总览） */
  const activeLevel = ref<string>(GRADE_LEVEL_ALL)
  /** 当前学段分组：'' = 全部学段，否则 GRADE_STAGE_GROUPS 的 key（K/P/J/H/U） */
  const activeStage = ref<string>('')
  /** 当前页码（从 1 起） */
  const page = ref<number>(1)

  // ===== 加载/保存 =====

  async function loadGrades(): Promise<void> {
    try {
      const norm = normalizeGradesData(await idbGet<unknown>(STORE_KEY))
      grades.value = norm.grades
    } catch (e) {
      console.error('[studentGrades] load failed', e)
      grades.value = emptyGradesData().grades
    }
  }

  async function saveGrades(): Promise<void> {
    try {
      // IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError）
      await idbPut(STORE_KEY, { grades: JSON.parse(JSON.stringify(grades.value)) })
      markDirty()
    } catch (e) {
      console.error('[studentGrades] save failed', e)
    }
  }

  // ===== 成绩 CRUD =====

  async function addGrade(input: NewGradeInput): Promise<GradeOp> {
    const v = validateNewGrade(input)
    if (!v.ok) return v
    const now = isoNow()
    const record = normalizeGradeRecord({
      id: genId(),
      grade: input.grade.trim(),
      examName: input.examName.trim(),
      examType: input.examType.trim() || '期中',
      date: input.date,
      subjects: input.subjects,
      createdAt: now,
      updatedAt: now
    })
    if (!record) return { ok: false, reason: 'invalid-score' }
    grades.value.push(record)
    await saveGrades()
    return { ok: true }
  }

  async function updateGrade(id: string, patch: GradeUpdatePatch): Promise<GradeOp> {
    const index = grades.value.findIndex(g => g.id === id)
    if (index === -1) return { ok: false, reason: 'not-found' }
    if (patch.examName !== undefined && !patch.examName.trim()) return { ok: false, reason: 'empty' }
    if (patch.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(patch.date)) {
      return { ok: false, reason: 'invalid-date' }
    }
    if (patch.subjects !== undefined && (!Array.isArray(patch.subjects) || patch.subjects.length === 0)) {
      return { ok: false, reason: 'no-subjects' }
    }
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, val]) => val !== undefined)
    ) as GradeUpdatePatch
    const merged = normalizeGradeRecord({ ...grades.value[index], ...clean, updatedAt: isoNow() })
    if (!merged) return { ok: false, reason: 'invalid-score' }
    grades.value[index] = merged
    await saveGrades()
    return { ok: true }
  }

  async function deleteGrade(id: string): Promise<GradeOp> {
    if (!grades.value.some(g => g.id === id)) return { ok: false, reason: 'not-found' }
    grades.value = grades.value.filter(g => g.id !== id)
    await saveGrades()
    return { ok: true }
  }

  // ===== 排序 =====

  function setSort(mode: GradeSortMode): void {
    if (!SORT_MODES.includes(mode) || mode === sortMode.value) return
    sortMode.value = mode
    void saveGrades()
  }

  function toggleDirection(): void {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  }

  // ===== 学段 / 年级标签页 / 分页 =====

  /** 切换学段分组（重置年级标签页与页码，回到该学段总览） */
  function setActiveStage(stage: string): void {
    if (stage === activeStage.value) return
    activeStage.value = stage
    activeLevel.value = GRADE_LEVEL_ALL
    page.value = 1
  }

  /** 切换年级标签页（重置到第 1 页） */
  function setActiveLevel(level: string): void {
    if (level === activeLevel.value) return
    activeLevel.value = level
    page.value = 1
  }

  /** 切换页码 */
  function setPage(p: number): void {
    page.value = p
  }

  // ===== 只读薄委托 =====

  /** 排序后的成绩列表（按当前排序模式/方向，跨全部年级） */
  const sortedGrades = computed<StudentGradeRecord[]>(() => sortGrades(grades.value, sortMode.value, sortDirection.value))

  /** 总览统计：记录数 / 总均分 / 各科均分 / 最近一次考试（跨全部年级） */
  const stats = computed<GradeStats>(() => calcGradeStats(grades.value))

  /** 当前学段分组下的年级标签页列表（'' 时返回全部 19 个年级） */
  const visibleGradeTabs = computed<string[]>(() => {
    if (!activeStage.value) return [...STUDENT_GRADE_LEVELS]
    const g = GRADE_STAGE_GROUPS.find(x => x.key === activeStage.value)
    return g ? [...g.grades] : []
  })

  /** 当前作用域下的成绩：先按学段收敛，再按年级收敛，最后排序 */
  const levelGrades = computed<StudentGradeRecord[]>(() => {
    let list = grades.value
    if (activeStage.value) list = list.filter(g => gradeToStageKey(g.grade) === activeStage.value)
    if (activeLevel.value) list = list.filter(g => g.grade === activeLevel.value)
    return sortGrades(list, sortMode.value, sortDirection.value)
  })

  /** 当前年级标签页下的分页结果（每页 GRADE_PAGE_SIZE 条） */
  const pagedLevelGrades = computed<Paginated<StudentGradeRecord>>(() =>
    paginate(levelGrades.value, page.value, GRADE_PAGE_SIZE)
  )

  /** 当前年级标签页下的统计 */
  const levelStats = computed<GradeStats>(() => calcGradeStats(levelGrades.value))

  return {
    // 状态
    grades,
    sortMode,
    sortDirection,
    activeLevel,
    activeStage,
    page,
    // 加载/保存
    loadGrades,
    saveGrades,
    // 成绩 CRUD
    addGrade,
    updateGrade,
    deleteGrade,
    // 排序
    setSort,
    toggleDirection,
    // 学段 / 年级标签页 / 分页
    setActiveStage,
    setActiveLevel,
    setPage,
    visibleGradeTabs,
    // 只读
    sortedGrades,
    stats,
    levelGrades,
    pagedLevelGrades,
    levelStats
  }
})
