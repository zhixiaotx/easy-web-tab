<script setup lang="ts">
// 家长协同控制台面板（学生工作台的「家长协同」section）
// 6 个 Tabs：📊 统计 / 📝 每日任务 / 📑 孩子报告 / ➕ 手动加分 / 🏅 发放勋章 / 🎁 配置奖励
// （容器样式参考个人工作台健康管理 WorkbenchHealth.vue 的 tabs 容器）

import { ref, computed, onMounted, watch } from 'vue'
import { useStudentParentTasksStore, type ParentTaskOpError } from '@/stores/studentParentTasks'
import { useStudentHabitsStore } from '@/stores/studentHabits'
import { useStudentHomeworkStore } from '@/stores/studentHomework'
import { useStudentRewardsStore } from '@/stores/studentRewards'
import { useStudentAchievementsStore } from '@/stores/studentAchievements'
import { useToast } from '@/composables/useToast'
import { useThemeStore } from '@/stores/theme'
import Icon from '@/components/Icon.vue'
import StudentToolbar from '@/components/student/StudentToolbar.vue'
import type { StudentParentTask } from '@/types'
import { dateKeyOf } from '@/composables/diaryCore'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent, LegendComponent])

const props = defineProps<{
  /** 家长模式是否解锁：false 时整页锁态 + 居中按钮 → @open-pin 冒泡到父层 */
  parentMode: boolean
}>()

const emit = defineEmits<{
  (e: 'open-pin'): void
  (e: 'tab-focused', tab: ParentTabKey): void
}>()

const toast = useToast()
const themeStore = useThemeStore()

// ===== stores =====
const tasksStore = useStudentParentTasksStore()
const habitsStore = useStudentHabitsStore()
const homeworkStore = useStudentHomeworkStore()
const rewardsStore = useStudentRewardsStore()
const achievementsStore = useStudentAchievementsStore()

let loadedStores = false
async function ensureAllLoaded() {
  if (loadedStores) return
  try {
    await Promise.all([
      tasksStore.loadTasks(),
      habitsStore.loadHabits(),
      homeworkStore.loadHomework(),
      rewardsStore.loadRewards(),
      achievementsStore.loadAchievements()
    ])
  } catch (e) {
    console.error('[StudentParent] ensureAllLoaded failed', e)
  } finally {
    loadedStores = true
  }
}

// ===== Tabs =====
type ParentTabKey = 'stats' | 'tasks' | 'report' | 'points' | 'badges' | 'rewards'
const TABS: { key: ParentTabKey; label: string; emoji: string; icon: string }[] = [
  { key: 'stats',   label: '统计',       emoji: '📊', icon: 'chart-bar' },
  { key: 'tasks',   label: '每日任务',   emoji: '📝', icon: 'clipboard-list' },
  { key: 'report',  label: '孩子报告',   emoji: '📑', icon: 'file-chart' },
  { key: 'points',  label: '手动加分',   emoji: '➕', icon: 'plus-circle' },
  { key: 'badges',  label: '发放勋章',   emoji: '🏅', icon: 'medal' },
  { key: 'rewards', label: '配置奖励',   emoji: '🎁', icon: 'gift' }
]
const activeTab = ref<ParentTabKey>('stats')

const focusTab = (tab: ParentTabKey) => {
  activeTab.value = tab
  emit('tab-focused', tab)
}
defineExpose({ focusTab })

// ===== Toolbar date =====
const toolbarDate = ref<string>(dateKeyOf(new Date()))

// ===== Stats cards =====
const statTaskCompletion = computed<number>(() => tasksStore.todayCompletion(toolbarDate.value))
const statTaskText = computed<string>(() => {
  const list = tasksStore.todayTasks(toolbarDate.value)
  const done = list.filter(t => t.done).length
  return `${done} / ${list.length}`
})

const statHabitCompletion = computed<number>(() => {
  const habits = habitsStore.habits
  if (!habits.length) return 0
  const today = toolbarDate.value
  const percs = habits.map(h => {
    const a = habitsStore.weeklyAttainmentOfHabit(h.id, h.frequency, today)
    return a?.percent ?? 0
  })
  return percs.reduce((s, p) => s + p, 0) / habits.length
})

const statHomeworkCompletion = computed<number>(() => {
  const entries = homeworkStore.entries
  if (!entries.length) return 0
  const base = new Date(toolbarDate.value)
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  start.setDate(base.getDate() - 6)
  const startKey = dateKeyOf(start)
  const inRange = entries.filter(e => e.dueDate >= startKey && e.dueDate <= toolbarDate.value)
  if (!inRange.length) return 0
  const done = inRange.filter(e => e.status === 'done').length
  return done / inRange.length
})

const statTotalPoints = computed<number>(() => rewardsStore.totalPoints())

function pct(v: number): string {
  if (!Number.isFinite(v)) return '0%'
  return `${Math.round(v * 100)}%`
}

// ===== Tab 1: 每日任务 CRUD =====
const taskList = computed<StudentParentTask[]>(() => tasksStore.todayTasks(toolbarDate.value))

const taskFormVisible = ref(false)
const taskFormMode = ref<'add' | 'edit'>('add')
const taskFormEditingId = ref<string>('')
const taskFormTitle = ref('')
const taskFormDate = ref('')

function openAddTask() {
  if (!props.parentMode) return
  taskFormMode.value = 'add'
  taskFormEditingId.value = ''
  taskFormTitle.value = ''
  taskFormDate.value = toolbarDate.value
  taskFormVisible.value = true
}
function openEditTask(t: StudentParentTask) {
  if (!props.parentMode) return
  taskFormMode.value = 'edit'
  taskFormEditingId.value = t.id
  taskFormTitle.value = t.title
  taskFormDate.value = t.date
  taskFormVisible.value = true
}
async function submitTaskForm() {
  const title = taskFormTitle.value
  const date = taskFormDate.value
  if (taskFormMode.value === 'add') {
    const r = await tasksStore.addTask(title, date)
    if (r.ok) { toast.success('任务已添加'); taskFormVisible.value = false }
    else toast.error(taskErrorText(r.reason))
  } else {
    const r = await tasksStore.updateTask(taskFormEditingId.value, { title, date })
    if (r.ok) { toast.success('任务已更新'); taskFormVisible.value = false }
    else toast.error(taskErrorText(r.reason))
  }
}
async function removeTask(t: StudentParentTask) {
  if (!props.parentMode) return
  if (!confirm(`确定删除任务「${t.title}」？`)) return
  const r = await tasksStore.deleteTask(t.id)
  if (r.ok) toast.success('已删除')
  else toast.error(taskErrorText(r.reason))
}
async function toggleTaskDone(t: StudentParentTask) {
  if (!props.parentMode) return
  await tasksStore.toggleDone(t.id)
}
function taskErrorText(r?: ParentTaskOpError): string {
  switch (r) {
    case 'empty-title': return '任务标题不能为空'
    case 'long-title': return '任务标题过长（最多 100 字）'
    case 'invalid-date': return '日期不合法'
    case 'not-found': return '任务不存在，可能已被删除'
    default: return '操作失败，请重试'
  }
}

// ===== Tab 2: 孩子报告 =====
const todaySummary = computed(() => {
  const date = toolbarDate.value
  const habits = habitsStore.habits
  const habitDone = habits.filter(h => {
    const wk = habitsStore.weekCompletionsOfHabit(h.id, date)
    return wk[6] && wk[6] !== ''
  }).length
  const habitTotal = habits.length
  const hw = homeworkStore.entries.filter(e => e.dueDate === date)
  const hwDone = hw.filter(e => e.status === 'done').length
  const hwTotal = hw.length
  return { habitDone, habitTotal, hwDone, hwTotal }
})

const weekTrendData = computed(() => {
  const base = new Date(toolbarDate.value)
  const data: { date: string; habitPct: number; hwPct: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate())
    d.setDate(base.getDate() - i)
    const key = dateKeyOf(d)
    const habits = habitsStore.habits
    const avgHabit = habits.length ? (() => {
      let total = 0
      for (const h of habits) {
        const att = habitsStore.weeklyAttainmentOfHabit(h.id, h.frequency, key)
        total += att?.percent ?? 0
      }
      return total / habits.length
    })() : 0
    const hw = homeworkStore.entries.filter(e => e.dueDate === key)
    const hwPct = hw.length ? hw.filter(e => e.status === 'done').length / hw.length : 0
    data.push({ date: key.slice(5), habitPct: avgHabit, hwPct })
  }
  return data
})

// ===== 近 7 天趋势图（ECharts 柱状图） =====
// canvas 渲染不支持 CSS 变量颜色 → 用 getComputedStyle 解析真实 token 值，
// 并依赖 themeStore.theme 在亮暗切换时重算（ECharts: 柱渐变/轨道/圆角/图例/tooltip/动画）
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

const weekChartOption = computed(() => {
  const days = weekTrendData.value.map(d => d.date)
  const habitPcts = weekTrendData.value.map(d => Math.round(d.habitPct * 100))
  const hwPcts = weekTrendData.value.map(d => Math.round(d.hwPct * 100))
  // 读取主题真实值（亮/暗 token），图表随主题色联动
  const isDark = themeStore.theme === 'dark'
  const text = cssVar('--color-text-secondary', isDark ? '#9ca3af' : '#64748b')
  const border = cssVar('--color-border', isDark ? '#374151' : '#e2e8f0')
  const surface = cssVar('--color-bg-card', isDark ? '#1f2937' : '#ffffff')
  const track = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)'
  const shadow = isDark ? 'rgba(0,0,0,0.45)' : 'rgba(15,23,42,0.12)'
  // 色板：习惯打卡率=主色蓝（--color-primary），作业完成率=success 绿（--color-success）
  const habitTop = cssVar('--color-primary', '#3b82f6')
  const habitBottom = cssVar('--color-primary-hover', '#2563eb')
  const hwTop = cssVar('--color-success', '#10b981')
  const hwBottom = '#059669'
  const radius: [number, number, number, number] = [5, 5, 2, 2]
  const baseBar = {
    barWidth: 18,
    barGap: '30%',
    showBackground: true,
    backgroundStyle: { color: track, borderRadius: radius },
    itemStyle: { borderRadius: radius },
    emphasis: { focus: 'series' as const },
    blur: { itemStyle: { opacity: 0.35 } }
  }
  return {
    animationDuration: 900,
    animationDurationUpdate: 500,
    animationEasing: 'cubicOut' as const,
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
        shadowStyle: { color: track }
      },
      backgroundColor: surface,
      borderColor: border,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: text, fontSize: 12 },
      extraCssText: `border-radius: 8px; box-shadow: 0 4px 16px ${shadow};`,
      formatter: (params: any[]) => {
        const date = params[0].axisValue
        const lines = params.map((p: any) =>
          `${p.marker}${p.seriesName}：${p.value}%`
        )
        return `${date}<br/>${lines.join('<br/>')}`
      }
    },
    legend: {
      data: ['习惯打卡率', '作业完成率'],
      top: 0,
      right: 0,
      icon: 'roundRect',
      itemWidth: 14,
      itemHeight: 8,
      itemGap: 18,
      textStyle: { color: text, fontSize: 12 }
    },
    grid: { left: 40, right: 12, top: 36, bottom: 28, containLabel: false },
    xAxis: {
      type: 'category',
      data: days,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: text, fontSize: 11, margin: 10 }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      interval: 25,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: text,
        fontSize: 11,
        formatter: '{value}%'
      },
      splitLine: { lineStyle: { color: border, type: 'dashed' } }
    },
    series: [
      {
        name: '习惯打卡率',
        type: 'bar',
        data: habitPcts,
        ...baseBar,
        itemStyle: {
          ...baseBar.itemStyle,
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: habitTop },
              { offset: 1, color: habitBottom }
            ]
          }
        }
      },
      {
        name: '作业完成率',
        type: 'bar',
        data: hwPcts,
        ...baseBar,
        itemStyle: {
          ...baseBar.itemStyle,
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: hwTop },
              { offset: 1, color: hwBottom }
            ]
          }
        }
      }
    ]
  }
})

// ===== Tab 3: 手动加分 =====
const pointAmount = ref<number | ''>('')
const pointReason = ref('')

async function submitManualPoints() {
  if (!props.parentMode) return
  const pts = typeof pointAmount.value === 'number' ? pointAmount.value : Number(pointAmount.value)
  if (!Number.isInteger(pts) || pts <= 0 || pts > 9999) {
    toast.error('积分必须是 1-9999 的整数')
    return
  }
  const reason = pointReason.value.trim()
  if (!reason) {
    toast.error('请填写加分原因（如：今日表现优秀）')
    return
  }
  const r = await rewardsStore.manualAddPoints(pts, reason)
  if (r.ok) {
    toast.success(`已 +${pts} 积分：${reason}`)
    pointAmount.value = ''
    pointReason.value = ''
  } else {
    toast.error(`加分失败：${r.reason ?? '未知错误'}`)
  }
}
const recentPointTxns = computed(() =>
  rewardsStore.recentTxns(10).filter(t => t.type === 'earn')
)

// ===== Tab 4: 发放勋章 =====
const badgeList = computed(() => achievementsStore.definitions)
const badgeNote = ref('')
const badgeGrantingId = ref<string | null>(null)

async function grantBadge(id: string) {
  if (!props.parentMode) return
  if (achievementsStore.isUnlocked(id)) { toast.warning('该勋章已解锁'); return }
  badgeGrantingId.value = id
  const r = await achievementsStore.manualUnlock(id)
  badgeGrantingId.value = null
  if (r.ok) toast.success('勋章已发放')
  else toast.error(r.reason === 'not-found' ? '勋章未找到' : '勋章已解锁')
}

// ===== Tab 5: 配置奖励 =====
const rewardFormVisible = ref(false)
const rewardFormMode = ref<'add' | 'edit'>('add')
const rewardFormEditingId = ref('')
const rewardFormName = ref('')
const rewardFormCost = ref<number | ''>('')
const rewardFormStock = ref<number | ''>('')

function openAddReward() {
  if (!props.parentMode) return
  rewardFormMode.value = 'add'
  rewardFormEditingId.value = ''
  rewardFormName.value = ''
  rewardFormCost.value = ''
  rewardFormStock.value = ''
  rewardFormVisible.value = true
}
function openEditReward(id: string) {
  if (!props.parentMode) return
  const r = rewardsStore.allRewards().find(x => x.id === id)
  if (!r) return
  rewardFormMode.value = 'edit'
  rewardFormEditingId.value = id
  rewardFormName.value = r.name
  rewardFormCost.value = r.cost
  rewardFormStock.value = r.stock === undefined ? '' : r.stock
  rewardFormVisible.value = true
}
async function submitRewardForm() {
  const name = rewardFormName.value.trim()
  const cost = typeof rewardFormCost.value === 'number' ? rewardFormCost.value : Number(rewardFormCost.value)
  const stockRaw = rewardFormStock.value === '' ? undefined : Number(rewardFormStock.value)
  if (!name) { toast.error('请填写奖励名称'); return }
  if (!Number.isFinite(cost) || cost < 1 || cost > 9999) { toast.error('积分须 1-9999'); return }
  const stock = stockRaw === undefined ? undefined : (Number.isFinite(stockRaw) ? Math.max(0, Math.floor(stockRaw)) : 0)
  if (rewardFormMode.value === 'add') {
    const r = await rewardsStore.addReward(name, cost, stock)
    if (r.ok) { toast.success('奖励项已添加'); rewardFormVisible.value = false }
    else toast.error(rewardErrorText(r.reason))
  } else {
    const r = await rewardsStore.updateReward(rewardFormEditingId.value, { name, cost, stock })
    if (r.ok) { toast.success('奖励项已更新'); rewardFormVisible.value = false }
    else toast.error(rewardErrorText(r.reason))
  }
}
async function deleteReward(id: string) {
  if (!props.parentMode) return
  const rw = rewardsStore.allRewards().find(x => x.id === id)
  if (!rw) return
  if (!confirm(`确定删除奖励项「${rw.name}」？`)) return
  const r = await rewardsStore.deleteReward(id)
  if (r.ok) toast.success('已删除')
  else toast.error(rewardErrorText(r.reason))
}
function rewardErrorText(reason?: string): string {
  switch (reason) {
    case 'empty': return '名称不能为空'
    case 'duplicate': return '奖励名称已存在'
    case 'not-found': return '奖励项不存在'
    case 'invalid-cost': return '积分不合法（1-9999）'
    default: return '操作失败，请重试'
  }
}

// ===== 重置操作（家长模式：恢复到初始化状态） =====
const resettingAchievements = ref(false)
const resettingRewards = ref(false)

async function handleResetAchievements() {
  if (!props.parentMode) return
  if (!confirm('确定要重置所有成就勋章吗？\n\n27 枚内置勋章将全部变回未解锁状态，\n已获得的勋章解锁时间记录会被清空。此操作不可撤销！')) return
  resettingAchievements.value = true
  try {
    await achievementsStore.resetAchievements()
    toast.success('成就勋章已重置为初始状态')
  } catch {
    toast.error('重置失败，请重试')
  } finally {
    resettingAchievements.value = false
  }
}

async function handleResetRewards() {
  if (!props.parentMode) return
  if (!confirm('确定要重置奖励积分吗？\n\n当前积分将归零、所有加分/兑换历史将清空，\n家长配置的奖励兑换项也会全部删除。此操作不可撤销！')) return
  resettingRewards.value = true
  try {
    await rewardsStore.resetRewards()
    toast.success('奖励积分已重置为初始状态')
  } catch {
    toast.error('重置失败，请重试')
  } finally {
    resettingRewards.value = false
  }
}

// ===== 分页：卡片网格每页 10 个，加分记录每页 5 条 =====
const PAGE_SIZE_CARDS = 10   // 任务/勋章/奖励网格：每页 10 张卡片
const PAGE_SIZE_TXNS = 5    // 加分记录（manual points）：每页 5 条

/** 分页：当前页码（从 1 开始）；4 个列表独立分页互不影响 */
const pageTasks   = ref(1)
const pageBadges  = ref(1)
const pageRewards = ref(1)
const pageTxns    = ref(1)

/** 分页：计算总页数（空 = 1 页，ceil 向上取整） */
function totalPagesOf(len: number, size: number): number {
  if (len <= 0 || size <= 0) return 1
  return Math.max(1, Math.ceil(len / size))
}
/** 分页：钳制 page 到 [1, max]，边界越界修正 */
function clampPage(p: number, max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1
  const v = Math.round(p)
  if (v < 1) return 1
  if (v > max) return max
  return v
}
/** 分页：按当前页切片（page 1 => [0, size），page 2 => [size, 2*size）） */
function slicePage<T>(items: readonly T[], page: number, size: number): T[] {
  if (size <= 0) return []
  const max = totalPagesOf(items.length, size)
  const cur = clampPage(page, max)
  const s = (cur - 1) * size
  return items.slice(s, s + size)
}

// —— 分页 computed：每个列表独立 ——
const tasksTotalPages   = computed(() => totalPagesOf(taskList.value.length, PAGE_SIZE_CARDS))
const pagedTasks        = computed(() => slicePage(taskList.value, pageTasks.value, PAGE_SIZE_CARDS))

const badgesTotalPages  = computed(() => totalPagesOf(badgeList.value.length, PAGE_SIZE_CARDS))
const pagedBadges       = computed(() => slicePage(badgeList.value, pageBadges.value, PAGE_SIZE_CARDS))

// 奖励配置：注意这里用 rewardsStore.allRewards() 直接取全量（保持跟 template 一致）
const allRewards        = computed(() => rewardsStore.allRewards())
const rewardsTotalPages = computed(() => totalPagesOf(allRewards.value.length, PAGE_SIZE_CARDS))
const pagedRewards      = computed(() => slicePage(allRewards.value, pageRewards.value, PAGE_SIZE_CARDS))

const txnsTotalPages    = computed(() => totalPagesOf(recentPointTxns.value.length, PAGE_SIZE_TXNS))
const pagedPointTxns    = computed(() => slicePage(recentPointTxns.value, pageTxns.value, PAGE_SIZE_TXNS))

// —— 列表长度变化时：如果超界则回退；切日期（任务）/切数据（其他）导致本页变空时自动回到第 1 页，避免白屏 ——
watch([tasksTotalPages,   pageTasks],   ([m, p]) => { pageTasks.value   = clampPage(p, m) })
watch([badgesTotalPages,  pageBadges],  ([m, p]) => { pageBadges.value  = clampPage(p, m) })
watch([rewardsTotalPages, pageRewards], ([m, p]) => { pageRewards.value = clampPage(p, m) })
watch([txnsTotalPages,    pageTxns],    ([m, p]) => { pageTxns.value    = clampPage(p, m) })
// 日期一换：任务列表所属日期变了 → 回到第 1 页
watch(toolbarDate, () => { pageTasks.value = 1 })

onMounted(ensureAllLoaded)
watch(() => props.parentMode, (v) => { if (v) ensureAllLoaded() }, { immediate: true })
</script>

<template>
  <section class="st-parent-panel">
    <!-- 锁态守卫（parentMode=false 时整页锁态） -->
    <div v-if="!parentMode" class="stp-locked-banner">
      <div class="stp-locked-card">
        <div class="stp-lock-icon"><Icon name="passwords" /></div>
        <h3 class="stp-lock-title">🔒 家长模式未解锁</h3>
        <p class="stp-lock-desc">家长控制台包含加分、发放勋章、删除记录等敏感操作，需要输入家长 PIN 验证后再使用。</p>
        <el-button type="primary" size="large" @click="emit('open-pin')">输入家长 PIN 解锁</el-button>
      </div>
    </div>

    <template v-else>
      <!-- 工具条 -->
      <StudentToolbar title="👨‍👩‍👧 家长协同控制台" />

      <!-- Tabs 标签栏（样式参考健康管理 WorkbenchHealth.vue 的 hd-tabs/hd-tab） -->
      <nav class="hd-tabs stp-tabs" role="tablist" data-testid="stp-tabs">
        <button
          v-for="t in TABS"
          :key="t.key"
          role="tab"
          type="button"
          class="hd-tab stp-tab"
          :class="{ active: activeTab === t.key }"
          :aria-selected="activeTab === t.key"
          :data-testid="`stp-tab-${t.key}`"
          @click="activeTab = t.key"
        >
          <span class="hd-tab-icon stp-tab-icon"><Icon :name="t.icon" /></span>
          <span class="hd-tab-label">{{ t.label }}</span>
        </button>
      </nav>

      <div class="stp-tab-content">
        <!-- Tab 1: 统计（4 张统计卡 + 重置操作卡） -->
        <section v-if="activeTab === 'stats'" class="stp-tab-pane">
          <!-- 统计卡 4 张 -->
          <div class="stp-stats-grid">
            <div class="stp-stat-card">
              <div class="stp-stat-label">今日任务完成率</div>
              <div class="stp-stat-value">{{ pct(statTaskCompletion) }}</div>
              <div class="stp-stat-sub">{{ statTaskText }}</div>
            </div>
            <div class="stp-stat-card">
              <div class="stp-stat-label">本周习惯打卡率</div>
              <div class="stp-stat-value">{{ pct(statHabitCompletion) }}</div>
              <div class="stp-stat-sub">{{ habitsStore.habits.length }} 个习惯</div>
            </div>
            <div class="stp-stat-card">
              <div class="stp-stat-label">本周作业完成率</div>
              <div class="stp-stat-value">{{ pct(statHomeworkCompletion) }}</div>
              <div class="stp-stat-sub">近 7 天作业条目</div>
            </div>
            <div class="stp-stat-card stp-stat-accent">
              <div class="stp-stat-label">奖励积分余额</div>
              <div class="stp-stat-value">{{ statTotalPoints }}</div>
              <div class="stp-stat-sub">可用积分</div>
            </div>
          </div>

          <!-- 重置操作卡片 -->
          <div class="stp-reset-card">
            <div class="stp-reset-info">
              <span class="stp-reset-title">⚠️ 重置操作</span>
              <span class="stp-reset-desc">以下操作会将对应数据恢复到初始化状态，不可撤销，请谨慎使用。</span>
            </div>
            <div class="stp-reset-actions">
              <el-button
                type="danger"
                plain
                :disabled="resettingAchievements"
                @click="handleResetAchievements"
              >{{ resettingAchievements ? '重置中…' : '🏅 重置成就勋章' }}</el-button>
              <el-button
                type="danger"
                plain
                :disabled="resettingRewards"
                @click="handleResetRewards"
              >{{ resettingRewards ? '重置中…' : '🎁 重置奖励积分' }}</el-button>
            </div>
          </div>
        </section>

        <!-- Tab 2: 每日任务（日期选择器放在 pane-toolbar 右侧） -->
        <section v-else-if="activeTab === 'tasks'" class="stp-tab-pane">
          <div class="stp-pane-toolbar">
            <h3 class="stp-pane-title">当日任务</h3>
            <div class="stp-pane-actions">
              <label class="stp-date-label">
                <span>日期</span>
                <el-input v-model="toolbarDate" type="date" size="small" style="width: 150px" />
              </label>
              <el-button type="primary" @click="openAddTask">＋ 新增当日任务</el-button>
            </div>
          </div>
          <div class="stp-pane-toolbar-sub">
            <span class="stp-date-chip">📅 {{ toolbarDate }}</span>
            <span class="stp-pane-sub-hint">布置/批改今天的任务条清单；完成勾选自动进入统计</span>
          </div>
          <div v-if="taskList.length === 0" class="stp-empty">
            <p>暂无任务。点击右上角「＋ 新增当日任务」开始布置今天的任务条吧～</p>
          </div>
          <div v-else class="stp-task-grid">
            <article
              v-for="t in pagedTasks"
              :key="t.id"
              class="stp-task-card"
              :class="{ done: t.done }"
            >
              <el-checkbox class="stp-task-check" :model-value="t.done" @change="toggleTaskDone(t)" />
              <div class="stp-task-body">
                <div class="stp-task-title">{{ t.title }}</div>
                <div class="stp-task-date">{{ t.date }}</div>
              </div>
              <div class="stp-task-actions">
                <el-button size="small" type="primary" link @click="openEditTask(t)">编辑</el-button>
                <el-button size="small" type="danger" link @click="removeTask(t)">删除</el-button>
              </div>
            </article>
          </div>
          <!-- 任务分页器（>1 页才显示） -->
          <nav v-if="tasksTotalPages > 1" class="stp-pager" data-testid="stp-pager-tasks" role="navigation" aria-label="任务分页">
            <button type="button" class="stp-pager-btn" data-testid="stp-pager-tasks-prev" :disabled="pageTasks <= 1" @click="pageTasks = clampPage(pageTasks - 1, tasksTotalPages)"><Icon name="chevron-left" /></button>
            <span class="stp-pager-info" data-testid="stp-pager-tasks-info">第 {{ pageTasks }} / {{ tasksTotalPages }} 页 · 共 {{ taskList.length }} 条</span>
            <button type="button" class="stp-pager-btn" data-testid="stp-pager-tasks-next" :disabled="pageTasks >= tasksTotalPages" @click="pageTasks = clampPage(pageTasks + 1, tasksTotalPages)"><Icon name="chevron-right" /></button>
          </nav>
        </section>

        <!-- Tab 3: 孩子报告 -->
        <section v-else-if="activeTab === 'report'" class="stp-tab-pane">
          <div class="stp-pane-toolbar">
            <h3 class="stp-pane-title">📑 孩子报告</h3>
          </div>
          <div class="stp-report-block">
            <h4 class="stp-report-subtitle">今日摘要</h4>
            <div class="stp-summary-grid">
              <div class="stp-summary-card">
                <div class="stp-summary-label">习惯打卡</div>
                <div class="stp-summary-value">{{ todaySummary.habitDone }}<span class="stp-summary-slash">/</span>{{ todaySummary.habitTotal }}</div>
                <div class="stp-summary-sub">{{ pct(todaySummary.habitTotal ? todaySummary.habitDone / todaySummary.habitTotal : 0) }}</div>
              </div>
              <div class="stp-summary-card">
                <div class="stp-summary-label">作业完成</div>
                <div class="stp-summary-value">{{ todaySummary.hwDone }}<span class="stp-summary-slash">/</span>{{ todaySummary.hwTotal }}</div>
                <div class="stp-summary-sub">{{ pct(todaySummary.hwTotal ? todaySummary.hwDone / todaySummary.hwTotal : 0) }}</div>
              </div>
              <div class="stp-summary-card stp-summary-soft">
                <div class="stp-summary-label">阅读时长</div>
                <div class="stp-summary-value">—</div>
                <div class="stp-summary-sub">后续接入阅读面板</div>
              </div>
              <div class="stp-summary-card stp-summary-soft">
                <div class="stp-summary-label">番茄个数</div>
                <div class="stp-summary-value">—</div>
                <div class="stp-summary-sub">后续接入番茄钟面板</div>
              </div>
            </div>
          </div>
          <div class="stp-report-block">
            <h4 class="stp-report-subtitle">近 7 天趋势</h4>
            <div class="stp-chart-wrap">
              <v-chart
                class="stp-week-chart"
                :option="weekChartOption"
                autoresize
                aria-label="近 7 天趋势图"
              />
            </div>
          </div>
        </section>

        <!-- Tab 4: 手动加分 -->
        <section v-else-if="activeTab === 'points'" class="stp-tab-pane">
          <div class="stp-pane-toolbar">
            <h3 class="stp-pane-title">➕ 手动加分（家长模式）</h3>
          </div>
          <div class="stp-points-form">
            <label class="stp-field">
              <span class="stp-field-label">积分</span>
              <el-input type="number" min="1" max="9999" step="1" placeholder="1-9999 的整数" v-model.number="pointAmount" />
            </label>
            <label class="stp-field stp-field-flex">
              <span class="stp-field-label">原因</span>
              <el-input type="text" placeholder="如：今日表现优秀、按时完成作业、帮忙做家务等" v-model="pointReason" />
            </label>
            <el-button type="primary" @click="submitManualPoints">提交加分</el-button>
          </div>
          <div class="stp-report-block">
            <h4 class="stp-report-subtitle">最近 10 条加分记录</h4>
            <div v-if="recentPointTxns.length === 0" class="stp-empty stp-empty-small">暂无加分记录</div>
            <ul v-else class="stp-txn-list">
              <li v-for="t in pagedPointTxns" :key="t.id" class="stp-txn-item">
                <span class="stp-txn-pts earn">{{ rewardsStore.txnPointsText(t) }}</span>
                <span class="stp-txn-reason">{{ t.reason }}</span>
                <span class="stp-txn-date">{{ rewardsStore.txnDateText(t.createdAt) }}</span>
              </li>
            </ul>
            <!-- 加分记录分页器（>1 页才显示） -->
            <nav v-if="txnsTotalPages > 1" class="stp-pager" data-testid="stp-pager-txns" role="navigation" aria-label="加分记录分页">
              <button type="button" class="stp-pager-btn" data-testid="stp-pager-txns-prev" :disabled="pageTxns <= 1" @click="pageTxns = clampPage(pageTxns - 1, txnsTotalPages)"><Icon name="chevron-left" /></button>
              <span class="stp-pager-info" data-testid="stp-pager-txns-info">第 {{ pageTxns }} / {{ txnsTotalPages }} 页 · 共 {{ recentPointTxns.length }} 条</span>
              <button type="button" class="stp-pager-btn" data-testid="stp-pager-txns-next" :disabled="pageTxns >= txnsTotalPages" @click="pageTxns = clampPage(pageTxns + 1, txnsTotalPages)"><Icon name="chevron-right" /></button>
            </nav>
          </div>
        </section>

        <!-- Tab 5: 发放勋章 -->
        <section v-else-if="activeTab === 'badges'" class="stp-tab-pane">
          <div class="stp-pane-toolbar">
            <h3 class="stp-pane-title">🏅 发放特殊勋章</h3>
            <label class="stp-field stp-field-inline">
              <span class="stp-field-label">备注</span>
              <el-input type="text" placeholder="发放理由（可选）" v-model="badgeNote" style="width: 260px" />
            </label>
          </div>
          <div class="stp-badge-grid">
            <div
              v-for="b in pagedBadges"
              :key="b.id"
              class="stp-badge-card"
              :class="{ unlocked: achievementsStore.isUnlocked(b.id) }"
            >
              <div class="stp-badge-icon">{{ b.emoji || '🏅' }}</div>
              <div class="stp-badge-name">{{ b.name }}</div>
              <div class="stp-badge-desc">{{ b.description }}</div>
              <div class="stp-badge-status">
                <template v-if="achievementsStore.isUnlocked(b.id)">
                  已解锁 · {{ achievementsStore.unlockTimeText(b.id) }}
                </template>
                <template v-else>未解锁</template>
              </div>
              <el-button
                type="primary"
                size="small"
                :disabled="achievementsStore.isUnlocked(b.id) || badgeGrantingId === b.id"
                @click="grantBadge(b.id)"
              >{{ badgeGrantingId === b.id ? '发放中…' : '手动发放' }}</el-button>
            </div>
          </div>
          <!-- 勋章分页器（>1 页才显示） -->
          <nav v-if="badgesTotalPages > 1" class="stp-pager" data-testid="stp-pager-badges" role="navigation" aria-label="勋章分页">
            <button type="button" class="stp-pager-btn" data-testid="stp-pager-badges-prev" :disabled="pageBadges <= 1" @click="pageBadges = clampPage(pageBadges - 1, badgesTotalPages)"><Icon name="chevron-left" /></button>
            <span class="stp-pager-info" data-testid="stp-pager-badges-info">第 {{ pageBadges }} / {{ badgesTotalPages }} 页 · 共 {{ badgeList.length }} 枚</span>
            <button type="button" class="stp-pager-btn" data-testid="stp-pager-badges-next" :disabled="pageBadges >= badgesTotalPages" @click="pageBadges = clampPage(pageBadges + 1, badgesTotalPages)"><Icon name="chevron-right" /></button>
          </nav>
        </section>

        <!-- Tab 6: 配置奖励 -->
        <section v-else-if="activeTab === 'rewards'" class="stp-tab-pane">
          <div class="stp-pane-toolbar">
            <h3 class="stp-pane-title">🎁 奖励项管理</h3>
            <el-button type="primary" @click="openAddReward">＋ 新增奖励项</el-button>
          </div>
          <div v-if="allRewards.length === 0" class="stp-empty">
            暂无奖励项。点击右上角「＋ 新增奖励项」来创建孩子可以用积分兑换的奖励吧～
          </div>
          <div v-else class="stp-reward-grid">
            <div
              v-for="r in pagedRewards"
              :key="r.id"
              class="stp-reward-card"
              :class="{ 'out-of-stock': (r.stock ?? 1) === 0 }"
            >
              <div class="stp-reward-name">{{ r.name }}</div>
              <div class="stp-reward-cost">{{ r.cost }} 积分</div>
              <div class="stp-reward-stock">库存：{{ r.stock === undefined ? '不限' : r.stock }}</div>
              <div class="stp-reward-actions">
                <el-button size="small" type="primary" link @click="openEditReward(r.id)">编辑</el-button>
                <el-button size="small" type="danger" link @click="deleteReward(r.id)">删除</el-button>
              </div>
            </div>
          </div>
          <!-- 奖励分页器（>1 页才显示） -->
          <nav v-if="rewardsTotalPages > 1" class="stp-pager" data-testid="stp-pager-rewards" role="navigation" aria-label="奖励分页">
            <button type="button" class="stp-pager-btn" data-testid="stp-pager-rewards-prev" :disabled="pageRewards <= 1" @click="pageRewards = clampPage(pageRewards - 1, rewardsTotalPages)"><Icon name="chevron-left" /></button>
            <span class="stp-pager-info" data-testid="stp-pager-rewards-info">第 {{ pageRewards }} / {{ rewardsTotalPages }} 页 · 共 {{ allRewards.length }} 项</span>
            <button type="button" class="stp-pager-btn" data-testid="stp-pager-rewards-next" :disabled="pageRewards >= rewardsTotalPages" @click="pageRewards = clampPage(pageRewards + 1, rewardsTotalPages)"><Icon name="chevron-right" /></button>
          </nav>
        </section>
      </div>
    </template>

    <!-- 任务表单弹框 -->
    <el-dialog
      v-model="taskFormVisible"
      :title="taskFormMode === 'add' ? '新增任务' : '编辑任务'"
      width="440px"
      class="stp-task-dialog"
      @close="taskFormVisible = false"
    >
      <div class="stp-modal-body">
        <label class="stp-field">
          <span class="stp-field-label">任务标题</span>
          <el-input type="text" maxlength="100" v-model="taskFormTitle" />
        </label>
        <label class="stp-field">
          <span class="stp-field-label">日期</span>
          <el-input type="date" v-model="taskFormDate" />
        </label>
      </div>
      <template #footer>
        <el-button @click="taskFormVisible = false">取消</el-button>
        <el-button type="primary" @click="submitTaskForm">保存</el-button>
      </template>
    </el-dialog>

    <!-- 奖励表单弹框 -->
    <el-dialog
      v-model="rewardFormVisible"
      :title="rewardFormMode === 'add' ? '新增奖励项' : '编辑奖励项'"
      width="440px"
      class="stp-reward-dialog"
      @close="rewardFormVisible = false"
    >
      <div class="stp-modal-body">
        <label class="stp-field">
          <span class="stp-field-label">名称</span>
          <el-input type="text" maxlength="50" v-model="rewardFormName" />
        </label>
        <label class="stp-field">
          <span class="stp-field-label">所需积分</span>
          <el-input type="number" min="1" max="9999" step="1" v-model.number="rewardFormCost" />
        </label>
        <label class="stp-field">
          <span class="stp-field-label">库存（留空=不限）</span>
          <el-input type="number" min="0" step="1" v-model.number="rewardFormStock" />
        </label>
      </div>
      <template #footer>
        <el-button @click="rewardFormVisible = false">取消</el-button>
        <el-button type="primary" @click="submitRewardForm">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.st-parent-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 18px 20px;
  overflow: auto;
  gap: 16px;
  background: var(--color-bg, #f5f5f5);
}

.stp-locked-banner { display: flex; align-items: center; justify-content: center; padding: 48px 20px; }
.stp-locked-card {
  max-width: 420px; width: 100%;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 14px; padding: 32px 28px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  text-align: center;
}
.stp-lock-icon { font-size: 40px; color: #f59e0b; margin-bottom: 12px; display: flex; justify-content: center; }
.stp-lock-title { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
.stp-lock-desc { margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: var(--color-text-secondary, #6b7280); }

.stp-stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.stp-stat-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px; padding: 14px 16px;
  display: flex; flex-direction: column; gap: 4px;
}
.stp-stat-label { font-size: 13px; color: var(--color-text-secondary, #6b7280); }
.stp-stat-value { font-size: 26px; font-weight: 700; color: var(--color-text, #1f2937); line-height: 1.2; }
.stp-stat-sub { font-size: 12px; color: var(--color-text-secondary, #6b7280); }
.stp-stat-accent {
  background: linear-gradient(135deg, var(--color-primary, #10b981), #059669);
  border-color: transparent;
  color: #fff;
}
.stp-stat-accent .stp-stat-label,
.stp-stat-accent .stp-stat-sub { color: rgba(255, 255, 255, 0.85); }
.stp-stat-accent .stp-stat-value { color: #fff; }

.stp-reset-card {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
  background: var(--color-surface, #fff);
  border: 1px solid rgba(220, 38, 38, 0.2);
  border-radius: 12px; padding: 12px 16px;
}
.stp-reset-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.stp-reset-title { font-size: 14px; font-weight: 600; color: #dc2626; }
.stp-reset-desc { font-size: 12px; color: var(--color-text-secondary, #6b7280); }
.stp-reset-actions { display: flex; gap: 10px; flex-shrink: 0; }

/* ============================================================
   Tabs：复用健康管理 WorkbenchHealth.vue 的 hd-tabs/hd-tab 样式。
   以下只覆盖局部差异：底部间距、暗色下 stp-tab-icon 与图标字色。
   （hd-tabs/hd-tab/hd-tab-icon/hd-tab-label/暗色覆盖 均已在 WorkbenchHealth.vue 定义了
   全局无 scope 的等价规则是不存在的，因此这里就地补全 hd-tabs/hd-tab 的完整健康管理样式
   以保证 StudentParent.vue scoped 下也能生效。）
   ============================================================ */
.stp-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.stp-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  background-color: var(--color-surface, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.stp-tab-icon { display: inline-flex; align-items: center; justify-content: center; }
.stp-tab:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #10b981);
}
.stp-tab.active {
  background-color: var(--color-primary-light, #ecfdf5);
  color: var(--color-primary, #10b981);
  font-weight: 600;
}
/* 暗色模式（视觉对齐健康管理 WorkbenchHealth.vue:91-105） */
html.dark .stp-tab {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}
html.dark .stp-tab:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text, #f9fafb);
}
html.dark .stp-tab.active {
  background-color: #1e3a5f;
  color: #60a5fa;
}

.stp-tab-content {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px; padding: 16px;
  display: flex; flex-direction: column; gap: 18px;
  flex: 1; min-height: 0;
  /* 各 Tab 内容独立滚动：桌面端 .st-content 为 overflow:hidden + 子元素 flex:1 min-height:0，
     若此处不滚动则超长内容（如孩子报告的折线图）会被截断且无法下滑。 */
  overflow-y: auto;
  overflow-x: hidden;
}
.stp-tab-pane { display: flex; flex-direction: column; gap: 16px; }

.stp-pane-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.stp-pane-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.stp-pane-toolbar-sub {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--color-surface-2, #f9fafb);
  border: 1px solid var(--color-border, #e5e7eb);
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
}
.stp-date-chip {
  font-weight: 600;
  color: var(--color-text, #1f2937);
  background: #fff;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border, #e5e7eb);
}
.stp-pane-sub-hint { opacity: 0.9; }
html.dark .stp-pane-toolbar-sub {
  background: #1f2937;
  border-color: #374151;
  color: #9ca3af;
}
html.dark .stp-date-chip {
  background: #111827;
  border-color: #374151;
  color: #f9fafb;
}
.stp-pane-title { margin: 0; font-size: 16px; font-weight: 600; }

/* 分页器：视觉参考工作台 PanelPager — 左右按钮居中，中间信息，圆角 8px 描边 */
.stp-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 4px;
  padding: 6px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  align-self: stretch;
  width: fit-content;
  margin-left: auto;
  margin-right: auto;
}
.stp-pager-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--color-border, #d1d5db);
  background: var(--color-surface, #fff);
  color: var(--color-text-secondary, #6b7280);
  cursor: pointer;
  transition: all 0.12s;
}
.stp-pager-btn:hover:not(:disabled) {
  background: var(--color-primary, #10b981);
  border-color: var(--color-primary, #10b981);
  color: #fff;
}
.stp-pager-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.stp-pager-info {
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
  padding: 0 6px;
  white-space: nowrap;
}
html.dark .stp-pager {
  background: #1f2937;
  border-color: #374151;
}
html.dark .stp-pager-btn {
  background: #1f2937;
  border-color: #374151;
  color: #d1d5db;
}
html.dark .stp-pager-btn:hover:not(:disabled) {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}
html.dark .stp-pager-info {
  color: #d1d5db;
}

.stp-empty {
  padding: 28px 16px;
  border: 1px dashed var(--color-border, #d1d5db);
  border-radius: 10px;
  text-align: center;
  color: var(--color-text-secondary, #6b7280);
  font-size: 14px;
}
.stp-empty-small { padding: 16px; font-size: 13px; }

.stp-task-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.stp-task-card {
  background: var(--color-surface-2, #fafafa);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px; padding: 12px;
  display: flex; flex-direction: column; gap: 10px; align-items: flex-start;
  transition: all 0.15s;
}
.stp-task-card.done { opacity: 0.7; background: rgba(16, 185, 129, 0.08); }
.stp-task-card.done .stp-task-title { text-decoration: line-through; color: var(--color-text-secondary, #6b7280); }
.stp-task-check input { width: 16px; height: 16px; cursor: pointer; }
.stp-task-body { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; width: 100%; }
.stp-task-title { font-size: 14px; font-weight: 500; word-break: break-word; line-height: 1.4; }
.stp-task-date { font-size: 12px; color: var(--color-text-secondary, #6b7280); }
.stp-task-actions { display: flex; gap: 6px; width: 100%; }

.stp-report-block { display: flex; flex-direction: column; gap: 12px; }
.stp-report-subtitle { margin: 0; font-size: 14px; font-weight: 600; }

.stp-summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.stp-summary-card {
  background: var(--color-surface-2, #fafafa);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px; padding: 12px;
  display: flex; flex-direction: column; gap: 6px; align-items: center; text-align: center;
}
.stp-summary-soft {
  background: repeating-linear-gradient(
    45deg,
    var(--color-surface-2, #fafafa),
    var(--color-surface-2, #fafafa) 6px,
    rgba(0,0,0,0.02) 6px,
    rgba(0,0,0,0.02) 12px
  );
}
.stp-summary-label { font-size: 12px; color: var(--color-text-secondary, #6b7280); }
.stp-summary-value { font-size: 22px; font-weight: 700; line-height: 1.2; }
.stp-summary-slash { color: var(--color-text-secondary, #9ca3af); margin: 0 3px; font-weight: 400; }
.stp-summary-sub { font-size: 11px; color: var(--color-text-secondary, #6b7280); }

.stp-chart-wrap {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  padding: 12px;
  width: 100%;
  box-sizing: border-box;
}
.stp-week-chart { width: 100%; height: 260px; }

.stp-points-form {
  display: grid; grid-template-columns: 160px 1fr auto;
  gap: 12px; align-items: end;
  background: var(--color-surface-2, #fafafa);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px; padding: 14px;
}
.stp-field { display: flex; flex-direction: column; gap: 6px; }
.stp-field-flex { min-width: 0; }
.stp-field-inline { flex-direction: row; align-items: center; gap: 8px; }
.stp-field-label { font-size: 12px; color: var(--color-text-secondary, #6b7280); }

.stp-txn-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.stp-txn-item {
  display: grid; grid-template-columns: 80px 1fr auto;
  align-items: center; gap: 12px;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px; font-size: 13px;
}
.stp-txn-pts { font-weight: 700; }
.stp-txn-pts.earn { color: var(--color-primary, #10b981); }
.stp-txn-reason { color: var(--color-text, #1f2937); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stp-txn-date { color: var(--color-text-secondary, #6b7280); font-size: 12px; font-variant-numeric: tabular-nums; }

.stp-badge-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 10px; }
.stp-badge-card {
  background: var(--color-surface-2, #fafafa);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px; padding: 10px;
  display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px;
}
.stp-badge-card.unlocked { border-color: var(--color-primary, #10b981); background: rgba(16, 185, 129, 0.08); }
.stp-badge-icon { font-size: 26px; line-height: 1; }
.stp-badge-name { font-size: 13px; font-weight: 600; line-height: 1.2; }
.stp-badge-desc {
  font-size: 11px; color: var(--color-text-secondary, #6b7280);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: calc(11px * 1.35 * 2); /* 稳占 2 行高度，避免卡片忽高忽低 */
}
.stp-badge-status { font-size: 11px; color: var(--color-text-secondary, #6b7280); line-height: 1.2; }

.stp-reward-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.stp-reward-card {
  background: var(--color-surface-2, #fafafa);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px; padding: 12px;
  display: flex; flex-direction: column; gap: 8px; align-items: flex-start;
}
.stp-reward-card.out-of-stock { opacity: 0.55; }
.stp-reward-name { font-size: 14px; font-weight: 600; word-break: break-word; }
.stp-reward-cost { font-size: 16px; color: var(--color-primary, #10b981); font-weight: 700; }
.stp-reward-stock { font-size: 12px; color: var(--color-text-secondary, #6b7280); }
.stp-reward-actions { display: flex; gap: 6px; width: 100%; }

.stp-modal-body { display: flex; flex-direction: column; gap: 14px; }
/* el-dialog 对齐项目卡片风格 */
.st-parent-panel :deep(.el-dialog) {
  border-radius: 14px;
}
.st-parent-panel :deep(.el-dialog__title) {
  font-size: 16px;
  font-weight: 600;
}
.st-parent-panel :deep(.el-dialog__body) {
  padding-top: 16px;
}
.st-parent-panel :deep(.el-dialog__footer) {
  padding-top: 12px;
}
.st-parent-panel :deep(.el-input) {
  width: 100%;
}

@media (max-width: 1100px) {
  .stp-stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stp-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stp-task-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .stp-reward-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .stp-points-form { grid-template-columns: 160px 1fr; }
  .stp-points-form :deep(.el-button) { grid-column: 1 / -1; }
}
@media (max-width: 768px) {
  .st-parent-panel { padding: 12px; }
  .stp-stats-grid { grid-template-columns: 1fr 1fr; }
  .stp-stat-value { font-size: 22px; }
  .stp-task-grid, .stp-reward-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stp-reset-actions { flex-direction: column; width: 100%; }
  .stp-badge-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stp-tab { padding: 8px 10px; font-size: 12px; }
  .stp-summary-grid { grid-template-columns: 1fr 1fr; }
  .stp-points-form { grid-template-columns: 1fr; }
  .stp-txn-item { grid-template-columns: 72px 1fr; }
  .stp-txn-date { grid-column: 1 / -1; text-align: right; }
  .stp-pane-actions { width: 100%; }
  .stp-pane-actions .stp-date-label { flex: 1; min-width: 0; }
  .stp-pane-actions .stp-date-label :deep(.el-input) { flex: 1; min-width: 0; }
}
@media (max-width: 480px) {
  .stp-stats-grid { grid-template-columns: 1fr; }
  .stp-task-grid, .stp-reward-grid, .stp-badge-grid, .stp-summary-grid { grid-template-columns: 1fr; }
  /* 弹框在小屏改为视口宽度，避免 440px 固定宽度溢出 */
  .stp-task-dialog :deep(.el-dialog),
  .stp-reward-dialog :deep(.el-dialog) {
    width: 92vw !important;
    max-width: 92vw;
  }
}
</style>
