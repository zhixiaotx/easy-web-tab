// 学生工作台考试倒计时纯逻辑模块（M2）
// 复用成人 countdownCore：normalizeCountdown/calcRemaining/sortCountdowns/filterCountdowns/
// parseRepeat/repeatLabel/categoryLabel 均为纯函数，考试倒计时仅做信封归一化与学段题型建议。
// 零 vue/pinia 运行时依赖，纯函数。
//
// 数据信封：{ countdowns: Countdown[]; customCategories?: string[]; sortRule?: string }
// IDB store 'student_countdowns'，严格隔离成人 countdowns store。

import {
  normalizeCountdown,
  calcRemaining,
  sortCountdowns,
  filterCountdowns,
  parseRepeat,
  repeatLabel,
  categoryLabel,
  type CountdownSortMode,
  type CountdownSortDirection,
  type CountdownFilterCriteria
} from './countdownCore'
import type { Countdown, CountdownItem, StudentStage } from '@/types'

// 重导出供 store/组件直接引用（统一入口）
export {
  normalizeCountdown,
  calcRemaining,
  sortCountdowns,
  filterCountdowns,
  parseRepeat,
  repeatLabel,
  categoryLabel
}
export type { CountdownSortMode, CountdownSortDirection, CountdownFilterCriteria }

/** 学生考试倒计时数据信封（与 StudentBackupData.studentCountdowns 同构） */
export interface StudentExamData {
  countdowns: Countdown[]
  customCategories?: string[]
  sortRule?: string
}

/** 考试倒计时默认排序模式 */
export const EXAM_DEFAULT_SORT: CountdownSortMode = 'remaining'
export const EXAM_DEFAULT_DIRECTION: CountdownSortDirection = 'asc'

/** 空数据工厂 */
export function emptyExamData(): StudentExamData {
  return { countdowns: [], customCategories: [], sortRule: EXAM_DEFAULT_SORT }
}

/**
 * 归一化考试倒计时信封（幂等）：
 * - countdowns：逐条经 normalizeCountdown 归一（id/repeat/category/color 强制归一）
 * - customCategories：仅保留 trim 后非空字符串、去重
 * - sortRule：归一为已知排序模式，缺失回退 'remaining'
 * 非对象/数组输入 → 空信封。
 */
export function normalizeExamData(raw: unknown): StudentExamData {
  const base = emptyExamData()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>

  const countdowns: Countdown[] = []
  if (Array.isArray(o.countdowns)) {
    const seenIds = new Set<string>()
    for (const c of o.countdowns) {
      const norm = normalizeCountdown(c as Partial<Countdown>)
      if (seenIds.has(norm.id)) continue
      seenIds.add(norm.id)
      countdowns.push(norm)
    }
  }

  const customCategories: string[] = []
  if (Array.isArray(o.customCategories)) {
    const seen = new Set<string>()
    for (const c of o.customCategories) {
      if (typeof c !== 'string') continue
      const name = c.trim()
      if (!name || seen.has(name)) continue
      seen.add(name)
      customCategories.push(name)
    }
  }

  const knownSorts: readonly CountdownSortMode[] = ['remaining', 'name', 'created', 'endTime', 'manual']
  const sortRule: CountdownSortMode =
    typeof o.sortRule === 'string' && (knownSorts as readonly string[]).includes(o.sortRule)
      ? (o.sortRule as CountdownSortMode)
      : EXAM_DEFAULT_SORT

  return { countdowns, customCategories, sortRule }
}

/**
 * 计算考试列表的 CountdownItem（带 remaining）。
 * 薄委托 calcRemaining；不排序（排序由调用方按模式/方向决定）。
 */
export function buildExamItems(countdowns: Countdown[]): CountdownItem[] {
  return countdowns.map(c => ({
    ...c,
    remaining: calcRemaining(c.endDateTime, c.repeat)
  }))
}

// ========================================
// 学段考试题型建议（仅表单下拉候选项，不参与 stageSeeded 播种协调）
// 考试事件由用户主动创建（带具体日期），无需自动播种条目。
// ========================================

/** 学段内置考试题型建议（表单下拉候选项；用户可自由输入不在此列表的分类） */
export const STUDENT_EXAM_TYPE_BUILTINS: Record<StudentStage, string[]> = {
  K: [],
  P: ['单元测', '期中考试', '期末考试'],
  J: ['随堂测', '单元测', '月考', '期中考试', '期末考试'],
  H: ['月考', '期中考试', '期末考试', '模拟考'],
  U: ['期中', '期末', '月考', '测验', '模拟考']
}

/** 学段考试题型建议清单（返回新数组） */
export function stageExamTypeSuggestions(stage: StudentStage): string[] {
  return [...STUDENT_EXAM_TYPE_BUILTINS[stage]]
}

/**
 * 全量考试题型下拉来源：学段内置建议 + 用户自定义分类（去重，内置优先）。
 * 供表单 <select> 渲染。
 */
export function examTypeOptions(stage: StudentStage, customCategories: string[]): string[] {
  const builtins = STUDENT_EXAM_TYPE_BUILTINS[stage]
  const seen = new Set<string>()
  const out: string[] = []
  for (const b of builtins) {
    if (!seen.has(b)) {
      seen.add(b)
      out.push(b)
    }
  }
  for (const c of customCategories) {
    const t = c.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}
