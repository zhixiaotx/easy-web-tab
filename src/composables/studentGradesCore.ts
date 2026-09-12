// 学生成绩记录纯逻辑模块（零 vue/pinia 运行时依赖，纯函数，node --experimental-strip-types 可测）
// 数据模型：一次考试 = 一条 StudentGradeRecord，内含多科目分数（subjects）。
// 严格隔离成人数据；统计/趋势/排序均为纯函数，store 禁止内联重算。

import type { StudentGradeRecord, StudentGradeSubject, StudentGradesData } from '@/types'
import { GRADE_STAGE_GROUPS } from '@/types'

/** 单科默认满分 */
export const DEFAULT_FULL_SCORE = 100

export type GradeSortMode = 'date' | 'name' | 'created'
export type GradeSortDirection = 'asc' | 'desc'

export type GradeOpError = 'empty' | 'invalid-date' | 'no-subjects' | 'invalid-score' | 'not-found'

/** 新增成绩输入（不含 id/时间戳，由 store 补全） */
export interface NewGradeInput {
  examName: string
  examType: string
  /** 年级分类：STUDENT_GRADE_LEVELS 之一，'' 表示未分类 */
  grade: string
  date: string // 'YYYY-MM-DD' 本地日期
  subjects: StudentGradeSubject[]
}

/** 更新成绩补丁 */
export interface GradeUpdatePatch {
  examName?: string
  examType?: string
  grade?: string
  date?: string
  subjects?: StudentGradeSubject[]
}

function isoNow(): string {
  return new Date().toISOString()
}

/** 'YYYY-MM-DD' 本地日期格式校验 */
function isValidDate(s: string): boolean {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const t = new Date(`${s}T00:00:00`).getTime()
  return !isNaN(t)
}

/** 归一化单科成绩（非法返回 null） */
function normalizeSubject(raw: unknown): StudentGradeSubject | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (typeof o.subject !== 'string' || !o.subject.trim()) return null
  const score = Number(o.score)
  if (!Number.isFinite(score) || score < 0) return null
  if (o.fullScore !== undefined) {
    const full = Number(o.fullScore)
    if (!Number.isFinite(full) || full <= 0) return null
  }
  return {
    subject: o.subject.trim(),
    score: Math.round(score * 100) / 100,
    fullScore: o.fullScore === undefined ? undefined : Math.round(Number(o.fullScore) * 100) / 100
  }
}

/** 归一化单条成绩记录（幂等：补全时间戳、过滤非法科目；任一关键字段非法返回 null） */
export function normalizeGradeRecord(raw: unknown): StudentGradeRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || !o.id) return null
  const examName = typeof o.examName === 'string' ? o.examName.trim() : ''
  if (!examName) return null
  const examType = typeof o.examType === 'string' && o.examType.trim() ? o.examType.trim() : '期中'
  if (!isValidDate(String(o.date ?? ''))) return null
  const subjects = Array.isArray(o.subjects)
    ? (o.subjects.map(normalizeSubject).filter((x): x is StudentGradeSubject => x !== null))
    : []
  if (subjects.length === 0) return null
  const now = isoNow()
  return {
    id: o.id,
    examName,
    examType,
    grade: typeof o.grade === 'string' ? o.grade : '',
    date: String(o.date),
    subjects,
    createdAt: typeof o.createdAt === 'string' && o.createdAt ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === 'string' && o.updatedAt ? o.updatedAt : now
  }
}

/** 空数据信封 */
export function emptyGradesData(): StudentGradesData {
  return { grades: [] }
}

/** 归一化成绩数据（幂等：过滤非法记录，保留合法；非对象输入兜底空） */
export function normalizeGradesData(raw: unknown): StudentGradesData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyGradesData()
  const o = raw as Record<string, unknown>
  const grades = Array.isArray(o.grades)
    ? (o.grades.map(normalizeGradeRecord).filter((x): x is StudentGradeRecord => x !== null))
    : []
  return { grades }
}

/** 录入/编辑时校验输入 */
export function validateNewGrade(input: NewGradeInput): { ok: boolean; reason?: GradeOpError } {
  if (!input.examName.trim()) return { ok: false, reason: 'empty' }
  if (!isValidDate(input.date)) return { ok: false, reason: 'invalid-date' }
  if (!Array.isArray(input.subjects) || input.subjects.length === 0) return { ok: false, reason: 'no-subjects' }
  for (const s of input.subjects) {
    const score = Number(s.score)
    if (!Number.isFinite(score) || score < 0) return { ok: false, reason: 'invalid-score' }
    if (s.fullScore !== undefined) {
      const full = Number(s.fullScore)
      if (!Number.isFinite(full) || full <= 0) return { ok: false, reason: 'invalid-score' }
    }
  }
  return { ok: true }
}

// ============ 统计 ============

export interface SubjectAverage {
  subject: string
  avg: number
  count: number
  fullScore: number
}

export interface GradeStats {
  recordCount: number
  /** 各科均分的平均（null = 无数据） */
  overallAvg: number | null
  subjectAverages: SubjectAverage[]
  latestExam: StudentGradeRecord | null
}

/** 各科平均分（按学科名排序） */
export function calcSubjectAverages(grades: StudentGradeRecord[]): SubjectAverage[] {
  const map = new Map<string, { sum: number; count: number; full: number }>()
  for (const g of grades) {
    for (const s of g.subjects) {
      const cur = map.get(s.subject) ?? { sum: 0, count: 0, full: s.fullScore ?? DEFAULT_FULL_SCORE }
      cur.sum += s.score
      cur.count += 1
      map.set(s.subject, cur)
    }
  }
  const out: SubjectAverage[] = []
  for (const [subject, v] of map) {
    out.push({
      subject,
      avg: Math.round((v.sum / v.count) * 100) / 100,
      count: v.count,
      fullScore: v.full
    })
  }
  out.sort((a, b) => a.subject.localeCompare(b.subject, 'zh'))
  return out
}

/** 总览统计：记录数 / 总均分（各科均分均值） / 各科均分 / 最近一次考试 */
export function calcGradeStats(grades: StudentGradeRecord[]): GradeStats {
  const subjectAverages = calcSubjectAverages(grades)
  const overallAvg = subjectAverages.length
    ? Math.round((subjectAverages.reduce((s, x) => s + x.avg, 0) / subjectAverages.length) * 100) / 100
    : null
  const latest = grades.length
    ? [...grades].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0]
    : null
  return { recordCount: grades.length, overallAvg, subjectAverages, latestExam: latest }
}

// ============ 趋势 ============

export interface SubjectTrendPoint {
  date: string
  examName: string
  score: number
  fullScore: number
}

/** 某科目历次考试分数（按日期升序，供折线图） */
export function subjectTrend(grades: StudentGradeRecord[], subject: string): SubjectTrendPoint[] {
  const pts: SubjectTrendPoint[] = []
  const sorted = [...grades].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  for (const g of sorted) {
    const s = g.subjects.find(x => x.subject === subject)
    if (s) pts.push({ date: g.date, examName: g.examName, score: s.score, fullScore: s.fullScore ?? DEFAULT_FULL_SCORE })
  }
  return pts
}

/** 全部出现过的学科（排序，供趋势图科目选择） */
export function subjectUniverse(grades: StudentGradeRecord[]): string[] {
  const set = new Set<string>()
  for (const g of grades) for (const s of g.subjects) set.add(s.subject)
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'))
}

// ============ 排序 ============

/** 排序（默认按日期降序） */
export function sortGrades(
  grades: StudentGradeRecord[],
  mode: GradeSortMode = 'date',
  dir: GradeSortDirection = 'desc'
): StudentGradeRecord[] {
  const arr = [...grades]
  arr.sort((a, b) => {
    let cmp = 0
    if (mode === 'name') cmp = a.examName.localeCompare(b.examName, 'zh')
    else if (mode === 'created') cmp = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
    else cmp = a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    return dir === 'asc' ? cmp : -cmp
  })
  return arr
}

// ============ 年级过滤 / 分页 ============

/** 按年级过滤；level 为空串时返回全部（含未分类） */
export function filterGradesByLevel(grades: StudentGradeRecord[], level: string): StudentGradeRecord[] {
  if (!level) return grades
  return grades.filter(g => g.grade === level)
}

/** 年级 → 学段分组 key（用于成绩 tabs 分组；不在任何分组内的年级返回 ''） */
export function gradeToStageKey(grade: string): string {
  for (const g of GRADE_STAGE_GROUPS) {
    if (g.grades.includes(grade)) return g.key
  }
  return ''
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** 分页（页码从 1 起；越界页码自动收敛到最后一页） */
export function paginate<T>(list: T[], page: number, pageSize: number): Paginated<T> {
  const total = list.length
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages)
  const start = (safePage - 1) * pageSize
  const items = pageSize > 0 ? list.slice(start, start + pageSize) : list
  return { items, total, page: safePage, pageSize, totalPages }
}
