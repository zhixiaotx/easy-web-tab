/**
 * 工作台主页统计卡逻辑（从 WorkbenchHome.vue 提取）。
 * 纯消费 store state/computed，不直写 IDB。
 * 菜单开关关闭的功能不渲染对应统计卡。
 */
import { computed } from 'vue'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import { useWorkbenchNotesStore } from '@/stores/workbenchNotes'
import { useCountdownsStore } from '@/stores/countdowns'
import { usePasswordsStore } from '@/stores/passwords'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { useWorkbenchLedgerStore } from '@/stores/workbenchLedger'
import { useWorkbenchHabitsStore } from '@/stores/workbenchHabits'
import { useWorkbenchPomodoroStore } from '@/stores/workbenchPomodoro'
import { useAppSettingsStore } from '@/stores/settings'
import { calcBmi, calcDailyAttainment, calcExerciseAttainment } from '@/composables/healthCore'
import { calcMonthlyStats, formatYuan, maskOrReveal, monthKeyOf } from '@/composables/ledgerCore'
import { DEFAULT_HABIT_COLOR } from '@/composables/habitCore'
import type { CountdownItem, HealthPlanMetric, TodoPriority, WorkbenchTodo } from '@/types'

// ===== 优先级 =====
export const PRIORITY_ORDER: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 }

export const PRIORITY_META: Record<TodoPriority, { label: string; className: string }> = {
  high: { label: '高', className: 'prio-high' },
  medium: { label: '中', className: 'prio-medium' },
  low: { label: '低', className: 'prio-low' }
}

// ===== 运动指标单位 =====
const EXERCISE_UNIT: Record<HealthPlanMetric, string> = {
  times: '次',
  minutes: '分钟',
  calories: '千卡',
  duration: '次'
}

// ===== 本地日期工具 =====
// 今天 = 本地日期 YYYY-MM-DD（不能用 toISOString，那是 UTC 会偏一天）
function localToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isOverdue(todo: WorkbenchTodo): boolean {
  return !!todo.dueDate && !todo.completed && todo.dueDate < localToday()
}

/** 日期 +delta 天（'YYYY-MM-DD'）。先 setDate 再取日期组件，防 DST 偏移（同 habitCore addDays）。 */
export function shiftDate(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 周历表头星期标签（周一 → 周日）。 */
export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

// ===== 倒计时剩余状态色 =====
export function statusClass(status: CountdownItem['remaining']['status']): string {
  return `cd-${status}`
}

export function useHomeStats() {
  const todosStore = useWorkbenchTodosStore()
  const notesStore = useWorkbenchNotesStore()
  const countdownsStore = useCountdownsStore()
  const passwordsStore = usePasswordsStore()
  const healthStore = useWorkbenchHealthStore()
  const ledgerStore = useWorkbenchLedgerStore()
  const habitsStore = useWorkbenchHabitsStore()
  const pomodoroStore = useWorkbenchPomodoroStore()
  const settingsStore = useAppSettingsStore()

  // ===== 菜单开关视图（缺失键恒 true；false = 功能已关闭）=====
  const menuOn = computed(() => settingsStore.workbenchMenuEnabled)

  // ===== 待办统计 =====
  const todoStats = computed(() => ({
    total: todosStore.todos.length,
    active: todosStore.activeCount,
    overdue: todosStore.todos.filter(t => isOverdue(t)).length
  }))

  const todoCompletionRate = computed(() => {
    const total = todoStats.value.total
    if (total === 0) return 0
    return Math.round(((total - todoStats.value.active) / total) * 100)
  })

  // ===== 便签统计 =====
  const noteStats = computed(() => ({
    total: notesStore.notes.length,
    pinned: notesStore.notes.filter(n => n.pinned).length
  }))

  // ===== 倒计时统计 =====
  const countdownStats = computed(() => ({
    total: countdownsStore.countdowns.length,
    near30: countdownsStore.itemsWithRemaining.filter(
      i => !i.remaining.isExpired && i.remaining.status !== 'normal'
    ).length
  }))

  // ===== 健康统计 =====
  const exerciseStats = computed(() => {
    const plan = healthStore.plans.exercise
    const at = calcExerciseAttainment(healthStore.records.exercise, plan, localToday())
    if (!at || !plan) return { value: '未设定目标', sub: '点击前往设置' }
    return { value: `${at.current}/${at.target}`, sub: `本周 · ${EXERCISE_UNIT[plan.metric]}` }
  })

  const dietStats = computed(() => {
    const at = calcDailyAttainment(healthStore.records.diet, healthStore.plans.diet, localToday())
    if (!at) return { value: '未设定目标', sub: '点击前往设置' }
    return { value: `${at.current}/${at.target}`, sub: '今日 · 千卡' }
  })

  const sleepStats = computed(() => {
    const today = localToday()
    const plan = healthStore.plans.sleep
    if (!plan) return { value: '未设定目标', sub: '点击前往设置' }
    if (!healthStore.records.sleep.some(r => r.date === today)) return { value: '—', sub: '今日暂无记录' }
    const at = calcDailyAttainment(healthStore.records.sleep, plan, today)
    if (!at) return { value: '—', sub: '今日暂无记录' }
    return { value: `${at.current}/${at.target}`, sub: '今日 · 小时' }
  })

  const weightStats = computed(() => {
    const height = healthStore.height
    const latest = [...healthStore.records.weight].sort((a, b) =>
      a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1
    )[0]
    if (latest === undefined || height === undefined) return { value: '—', sub: '点击前往设置' }
    const bmi = calcBmi(latest.weightKg, height)
    if (bmi === null) return { value: '—', sub: '点击前往设置' }
    return { value: `BMI ${bmi.toFixed(1)}`, sub: `最近 ${latest.weightKg} kg` }
  })

  // ===== 记账统计 =====
  const ledgerStats = computed(() => {
    const stats = calcMonthlyStats(ledgerStore.entries, monthKeyOf(localToday()), ledgerStore.categories)
    return {
      value: `支出 ¥${maskOrReveal(formatYuan(stats.expense), !ledgerStore.showAmount)}`,
      sub: `收入 ¥${maskOrReveal(formatYuan(stats.income), !ledgerStore.showAmount)}`
    }
  })

  // ===== 习惯统计（本周）=====
  // 本周达标 = 该习惯本周打卡次数 >= 频率目标；weekCheckins = 全部习惯本周打卡次数之和
  const habitStats = computed(() => {
    const today = localToday()
    let metCount = 0
    let weekCheckins = 0
    for (const h of habitsStore.habits) {
      const at = habitsStore.weeklyAttainmentOf(h.id, h.frequency, today)
      weekCheckins += at.completed
      if (at.completed >= at.target) metCount += 1
    }
    return {
      total: habitsStore.habits.length,
      metCount,
      weekCheckins
    }
  })

  // ===== 每个习惯的本周进度明细（主页习惯卡悬停展开用）=====
  const habitDetails = computed(() => {
    const today = localToday()
    return habitsStore.habits.map(h => {
      const at = habitsStore.weeklyAttainmentOf(h.id, h.frequency, today)
      const percent = at.target > 0 ? Math.min(100, Math.round((at.completed / at.target) * 100)) : 0
      return {
        id: h.id,
        name: h.name,
        color: h.color ?? DEFAULT_HABIT_COLOR,
        completed: at.completed,
        target: at.target,
        percent,
        met: at.completed >= at.target
      }
    })
  })

  // ===== 番茄钟：今日已完成专注会话数 =====
  const todayPomodoro = computed(() => pomodoroStore.todayStats(localToday()))

  // ===== 今日概览聚合（首页顶部三合一：待办未完成 / 今日番茄 / 本周打卡）=====
  // 用于「今日概览」聚合卡：一眼掌握今天的三件核心进度。
  const todayOverview = computed(() => ({
    todos: todoStats.value.active,
    pomodoro: todayPomodoro.value,
    habits: habitStats.value.weekCheckins
  }))

  // ===== 概览可见统计卡（纯占位隐藏：无数据的卡不渲染；菜单开关关闭的功能不渲染）=====
  const visibleStatCards = computed<string[]>(() => {
    const keys: string[] = []
    const on = menuOn.value
    const height = healthStore.height
    if (on.todos && todosStore.todos.length > 0) keys.push('todos')
    if (on.notes && notesStore.notes.length > 0) keys.push('notes')
    if (on.countdowns && countdownsStore.countdowns.length > 0) keys.push('countdowns')
    if (on.passwords && passwordsStore.isUnlocked && passwordsStore.passwords.length > 0) keys.push('passwords')
    if (on.health && healthStore.plans.exercise) keys.push('exercise')
    if (on.health && healthStore.plans.diet) keys.push('diet')
    if (on.health && healthStore.plans.sleep) keys.push('sleep')
    if (on.health && height !== undefined && height > 0 && healthStore.records.weight.length > 0) keys.push('weight')
    if (on.ledger && ledgerStore.entries.length > 0) keys.push('ledger')
    if (on.habits && habitsStore.habits.length > 0) keys.push('habits')
    return keys
  })

  // ===== 即将到期倒计时：前 3 条未过期 =====
  const upcomingCountdowns = computed<CountdownItem[]>(() =>
    countdownsStore.itemsWithRemaining.filter(i => !i.remaining.isExpired).slice(0, 3)
  )

  // ===== 未完成待办前 5（优先级高→低 → 截止日期升序 → 创建时间降序）=====
  const pendingTodos = computed<WorkbenchTodo[]>(() =>
    todosStore.todos
      .filter(t => !t.completed)
      .sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority]
        const pb = PRIORITY_ORDER[b.priority]
        if (pa !== pb) return pa - pb
        if (a.dueDate !== b.dueDate) {
          if (!a.dueDate) return 1
          if (!b.dueDate) return -1
          return a.dueDate < b.dueDate ? -1 : 1
        }
        return a.createdAt < b.createdAt ? 1 : -1
      })
      .slice(0, 5)
  )

  return {
    menuOn,
    todoStats,
    todoCompletionRate,
    noteStats,
    countdownStats,
    exerciseStats,
    dietStats,
    sleepStats,
    weightStats,
    ledgerStats,
    habitStats,
    habitDetails,
    todayOverview,
    visibleStatCards,
    upcomingCountdowns,
    pendingTodos,
    localToday,
    isOverdue,
    // 密码状态（模板直接消费）
    isUnlocked: computed(() => passwordsStore.isUnlocked),
    passwordCount: computed(() => passwordsStore.passwords.length)
  }
}
