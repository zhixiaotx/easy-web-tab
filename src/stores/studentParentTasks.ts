// 学生工作台 - 家长每日任务 store（家长协同面板调用）
// 数据存 IndexedDB store 'student_parent_tasks' 单对象信封 { tasks: StudentParentTask[] }
// 薄委托 studentParentTaskCore：归一化/排序/按日期过滤/7 日窗口统计/表单校验/新 ID
// CRUD：addTask / updateTask / deleteTask / toggleDone（学生在主页也能打卡 → 双向同读）

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { idbGet, idbPut } from '@/composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'
import {
  emptyParentTasksData,
  normalizeParentTasksData,
  sortParentTasks as sortParentTasksCore,
  parentTasksByDate as parentTasksByDateCore,
  parentTasksWeekStats as parentTasksWeekStatsCore,
  newParentTaskId,
  validateParentTaskForm,
  todayKey as todayKeyCore
} from '@/composables/studentParentTaskCore'
import type { StudentParentTask, StudentParentTasksData } from '@/types'

const STORE_KEY = 'student_parent_tasks'

/** CRUD 操作错误语义 */
export type ParentTaskOpError =
  | 'empty-title'
  | 'long-title'
  | 'invalid-date'
  | 'not-found'

export interface ParentTaskOp {
  ok: boolean
  reason?: ParentTaskOpError
}

export const useStudentParentTasksStore = defineStore('studentParentTasks', () => {
  const tasks = ref<StudentParentTask[]>([])

  // ========================================
  // 持久化
  // ========================================

  async function loadTasks(): Promise<void> {
    try {
      const raw = await idbGet<StudentParentTasksData>(STORE_KEY)
      const norm = normalizeParentTasksData(raw)
      tasks.value = norm.tasks
    } catch (e) {
      console.error('[studentParentTasks] loadTasks failed', e)
      tasks.value = emptyParentTasksData().tasks
    }
  }

  async function saveTasks(): Promise<void> {
    try {
      // 写信封对象（嵌套数组单独, ，防内层 Proxy 致 DataCloneError）
      const payload: StudentParentTasksData = { tasks: JSON.parse(JSON.stringify(tasks.value)) }
      await idbPut(STORE_KEY, payload)
    markDirty()
    } catch (e) {
      console.error('[studentParentTasks] saveTasks failed', e)
    }
  }

  // ========================================
  // 查询辅助（薄委托 core，store 内禁止内联重算）
  // ========================================

  /** 排序后任务：date 升序 → 未完成优先 → id 升序 */
  const sortedTasks = computed<StudentParentTask[]>(() =>
    sortParentTasksCore(tasks.value)
  )

  /** 今日日期键（本地） */
  function todayKey(): string {
    return todayKeyCore()
  }

  /** 指定日期当天的任务（返回新数组，有序） */
  function todayTasks(date: string): StudentParentTask[] {
    return parentTasksByDateCore(tasks.value, date)
  }

  /** 今日任务快捷（不传参） */
  function todayTasksNow(): StudentParentTask[] {
    return todayTasks(todayKeyCore())
  }

  /** 近 7 天窗口统计：[{date, done, total}] 按日期升序 */
  function weekStats(today?: Date): { date: string; done: number; total: number }[] {
    return parentTasksWeekStatsCore(tasks.value, today)
  }

  /** 今日完成率：完成数 / 总数；总为 0 返回 0 */
  function todayCompletion(date: string): number {
    const list = todayTasks(date)
    if (list.length === 0) return 0
    const done = list.filter(t => t.done).length
    return done / list.length
  }

  // ========================================
  // CRUD
  // ========================================

  /**
   * 新增家长任务
   * @returns {ok, reason?} — reason 对齐 validateParentTaskForm 返回值语义
   */
  async function addTask(title: string, date: string): Promise<ParentTaskOp> {
    const v = validateParentTaskForm(title, date)
    if (!v.ok) return { ok: false, reason: v.reason }
    const t: StudentParentTask = {
      id: newParentTaskId(),
      title: title.trim().slice(0, 100),
      date,
      done: false,
      source: 'parent'
    }
    tasks.value = [...tasks.value, t]
    await saveTasks()
    return { ok: true }
  }

  /**
   * 更新任务 patch（title / date / done）
   * - title/date 会校验：非法返回对应的 reason
   * - done 仅布尔，不会触发 title/date 校验分支
   */
  async function updateTask(
    id: string,
    patch: { title?: string; date?: string; done?: boolean }
  ): Promise<ParentTaskOp> {
    const idx = tasks.value.findIndex(t => t.id === id)
    if (idx < 0) return { ok: false, reason: 'not-found' }
    const cur = tasks.value[idx]
    // title / date 校验：仅当 patch 提供对应字段时才校验
    if (patch.title !== undefined || patch.date !== undefined) {
      const nextTitle = patch.title !== undefined ? patch.title : cur.title
      const nextDate = patch.date !== undefined ? patch.date : cur.date
      const v = validateParentTaskForm(nextTitle, nextDate)
      if (!v.ok) return { ok: false, reason: v.reason }
    }
    const updated: StudentParentTask = {
      ...cur,
      ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, 100) } : {}),
      ...(patch.date !== undefined ? { date: patch.date } : {}),
      ...(patch.done !== undefined ? { done: !!patch.done } : {})
    }
    const next = [...tasks.value]
    next[idx] = updated
    tasks.value = next
    await saveTasks()
    return { ok: true }
  }

  /** toggle 完成态：快捷等价于 updateTask(id, { done: !cur.done }) */
  async function toggleDone(id: string): Promise<ParentTaskOp> {
    const cur = tasks.value.find(t => t.id === id)
    if (!cur) return { ok: false, reason: 'not-found' }
    return updateTask(id, { done: !cur.done })
  }

  /** 删除任务（找不到返回 not-found，成功 ok） */
  async function deleteTask(id: string): Promise<ParentTaskOp> {
    const idx = tasks.value.findIndex(t => t.id === id)
    if (idx < 0) return { ok: false, reason: 'not-found' }
    const next = tasks.value.filter(t => t.id !== id)
    tasks.value = next
    await saveTasks()
    return { ok: true }
  }

  return {
    // state
    tasks,
    sortedTasks,
    // persist
    loadTasks,
    saveTasks,
    // queries
    todayKey,
    todayTasks,
    todayTasksNow,
    weekStats,
    todayCompletion,
    // crud
    addTask,
    updateTask,
    toggleDone,
    deleteTask
  }
})
