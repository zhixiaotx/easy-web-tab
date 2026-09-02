<script setup lang="ts">
// 家长协同控制台面板（学生工作台的「家长协同」section）
// 5 个 Tabs：📝 每日任务 / 📊 孩子报告 / ➕ 手动加分 / 🏅 发放勋章 / 🎁 配置奖励
// 4 张统计卡：今日任务完成率 / 本周习惯打卡率 / 本周作业完成率 / 当前奖励积分余额

import { ref, computed, onMounted, watch } from 'vue'
import { useStudentParentTasksStore, type ParentTaskOpError } from '@/stores/studentParentTasks'
import { useStudentHabitsStore } from '@/stores/studentHabits'
import { useStudentHomeworkStore } from '@/stores/studentHomework'
import { useStudentRewardsStore } from '@/stores/studentRewards'
import { useStudentAchievementsStore } from '@/stores/studentAchievements'
import { useToast } from '@/composables/useToast'
import Icon from '@/components/Icon.vue'
import type { StudentParentTask } from '@/types'
import { dateKeyOf } from '@/composables/diaryCore'

const props = defineProps<{
  /** 家长模式是否解锁：false 时整页锁态 + 居中按钮 → @open-pin 冒泡到父层 */
  parentMode: boolean
}>()

const emit = defineEmits<{
  (e: 'open-pin'): void
  (e: 'tab-focused', tab: ParentTabKey): void
}>()

const toast = useToast()

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
type ParentTabKey = 'tasks' | 'report' | 'points' | 'badges' | 'rewards'
const TABS: { key: ParentTabKey; label: string; emoji: string }[] = [
  { key: 'tasks', label: '每日任务', emoji: '📝' },
  { key: 'report', label: '孩子报告', emoji: '📊' },
  { key: 'points', label: '手动加分', emoji: '➕' },
  { key: 'badges', label: '发放勋章', emoji: '🏅' },
  { key: 'rewards', label: '配置奖励', emoji: '🎁' }
]
const activeTab = ref<ParentTabKey>('tasks')

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

const recentBadges = computed(() => {
  const unlocked = Object.entries(achievementsStore.unlocked || {})
  return unlocked
    .sort((a, b) => (b[1] > a[1] ? 1 : -1))
    .slice(0, 10)
    .map(([id, time]) => ({
      id,
      time,
      def: achievementsStore.definitions.find(d => d.id === id)
    }))
})

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
        <button class="stp-lock-btn" type="button" @click="emit('open-pin')">输入家长 PIN 解锁</button>
      </div>
    </div>

    <template v-else>
      <!-- 工具条 -->
      <header class="stp-toolbar">
        <div class="stp-title-group">
          <h2 class="stp-title">👨‍👩‍👧 家长协同控制台</h2>
        </div>
        <div class="stp-toolbar-actions">
          <label class="stp-date-label">
            <span>日期</span>
            <input type="date" class="stp-date-input" v-model="toolbarDate" />
          </label>
        </div>
      </header>

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
          <button
            type="button"
            class="stp-btn-reset"
            :disabled="resettingAchievements"
            @click="handleResetAchievements"
          >{{ resettingAchievements ? '重置中…' : '🏅 重置成就勋章' }}</button>
          <button
            type="button"
            class="stp-btn-reset"
            :disabled="resettingRewards"
            @click="handleResetRewards"
          >{{ resettingRewards ? '重置中…' : '🎁 重置奖励积分' }}</button>
        </div>
      </div>

      <!-- Tabs 标签栏 -->
      <nav class="stp-tabs" role="tablist">
        <button
          v-for="t in TABS"
          :key="t.key"
          role="tab"
          type="button"
          class="stp-tab"
          :class="{ active: activeTab === t.key }"
          @click="activeTab = t.key"
        >
          <span class="stp-tab-emoji">{{ t.emoji }}</span>
          <span>{{ t.label }}</span>
        </button>
      </nav>

      <div class="stp-tab-content">
        <!-- Tab 1: 每日任务 -->
        <section v-if="activeTab === 'tasks'" class="stp-tab-pane">
          <div class="stp-pane-toolbar">
            <h3 class="stp-pane-title">{{ toolbarDate }} · 当日任务</h3>
            <button type="button" class="stp-btn-primary" @click="openAddTask">＋ 新增当日任务</button>
          </div>
          <div v-if="taskList.length === 0" class="stp-empty">
            <p>暂无任务。点击右上角「＋ 新增当日任务」开始布置今天的任务条吧～</p>
          </div>
          <div v-else class="stp-task-grid">
            <article
              v-for="t in taskList"
              :key="t.id"
              class="stp-task-card"
              :class="{ done: t.done }"
            >
              <label class="stp-task-check">
                <input type="checkbox" :checked="t.done" @change="toggleTaskDone(t)" />
              </label>
              <div class="stp-task-body">
                <div class="stp-task-title">{{ t.title }}</div>
                <div class="stp-task-date">{{ t.date }}</div>
              </div>
              <div class="stp-task-actions">
                <button class="stp-btn-ghost" type="button" @click="openEditTask(t)">编辑</button>
                <button class="stp-btn-danger" type="button" @click="removeTask(t)">删除</button>
              </div>
            </article>
          </div>
        </section>

        <!-- Tab 2: 孩子报告 -->
        <section v-else-if="activeTab === 'report'" class="stp-tab-pane">
          <div class="stp-pane-toolbar">
            <h3 class="stp-pane-title">📊 孩子报告</h3>
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
              <svg class="stp-week-chart" viewBox="0 0 560 200" preserveAspectRatio="none" aria-label="近 7 天趋势图">
                <g stroke="var(--color-border, #e5e7eb)" stroke-dasharray="3 4">
                  <line x1="40" y1="40"  x2="540" y2="40" />
                  <line x1="40" y1="90"  x2="540" y2="90" />
                  <line x1="40" y1="140" x2="540" y2="140" />
                </g>
                <g fill="var(--color-text-secondary, #6b7280)" font-size="10" text-anchor="end">
                  <text x="34" y="44">100%</text>
                  <text x="34" y="94">50%</text>
                  <text x="34" y="144">0%</text>
                </g>
                <g v-for="(d, i) in weekTrendData" :key="d.date">
                  <rect :x="50 + i * 72" :y="140 - Math.round(d.habitPct * 100)" width="22" :height="Math.round(d.habitPct * 100)" fill="var(--color-primary, #10b981)" rx="3" />
                  <rect :x="78 + i * 72" :y="140 - Math.round(d.hwPct * 100)" width="22" :height="Math.round(d.hwPct * 100)" fill="#f59e0b" rx="3" />
                  <text :x="61 + i * 72" y="164" text-anchor="middle" font-size="10" fill="var(--color-text-secondary, #6b7280)">{{ d.date }}</text>
                </g>
                <g font-size="11" fill="var(--color-text-secondary, #6b7280)">
                  <rect x="50"  y="178" width="12" height="12" rx="2" fill="var(--color-primary, #10b981)" />
                  <text x="68" y="188">习惯打卡率</text>
                  <rect x="160" y="178" width="12" height="12" rx="2" fill="#f59e0b" />
                  <text x="178" y="188">作业完成率</text>
                </g>
              </svg>
            </div>
          </div>
        </section>

        <!-- Tab 3: 手动加分 -->
        <section v-else-if="activeTab === 'points'" class="stp-tab-pane">
          <div class="stp-pane-toolbar">
            <h3 class="stp-pane-title">➕ 手动加分（家长模式）</h3>
          </div>
          <div class="stp-points-form">
            <label class="stp-field">
              <span class="stp-field-label">积分</span>
              <input type="number" min="1" max="9999" step="1" class="stp-field-input" placeholder="1-9999 的整数" v-model.number="pointAmount" />
            </label>
            <label class="stp-field stp-field-flex">
              <span class="stp-field-label">原因</span>
              <input type="text" class="stp-field-input" placeholder="如：今日表现优秀、按时完成作业、帮忙做家务等" v-model="pointReason" />
            </label>
            <button type="button" class="stp-btn-primary" @click="submitManualPoints">提交加分</button>
          </div>
          <div class="stp-report-block">
            <h4 class="stp-report-subtitle">最近 10 条加分记录</h4>
            <div v-if="recentPointTxns.length === 0" class="stp-empty stp-empty-small">暂无加分记录</div>
            <ul v-else class="stp-txn-list">
              <li v-for="t in recentPointTxns" :key="t.id" class="stp-txn-item">
                <span class="stp-txn-pts earn">{{ rewardsStore.txnPointsText(t) }}</span>
                <span class="stp-txn-reason">{{ t.reason }}</span>
                <span class="stp-txn-date">{{ rewardsStore.txnDateText(t.createdAt) }}</span>
              </li>
            </ul>
          </div>
        </section>

        <!-- Tab 4: 发放勋章 -->
        <section v-else-if="activeTab === 'badges'" class="stp-tab-pane">
          <div class="stp-pane-toolbar">
            <h3 class="stp-pane-title">🏅 发放特殊勋章</h3>
            <label class="stp-field stp-field-inline">
              <span class="stp-field-label">备注</span>
              <input type="text" class="stp-field-input" placeholder="发放理由（可选）" v-model="badgeNote" />
            </label>
          </div>
          <div class="stp-badge-grid">
            <div
              v-for="b in badgeList"
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
              <button
                type="button"
                class="stp-btn-primary stp-btn-small"
                :disabled="achievementsStore.isUnlocked(b.id) || badgeGrantingId === b.id"
                @click="grantBadge(b.id)"
              >{{ badgeGrantingId === b.id ? '发放中…' : '手动发放' }}</button>
            </div>
          </div>
          <div class="stp-report-block">
            <h4 class="stp-report-subtitle">最近解锁</h4>
            <div v-if="recentBadges.length === 0" class="stp-empty stp-empty-small">暂未解锁任何勋章</div>
            <ul v-else class="stp-badge-history">
              <li v-for="b in recentBadges" :key="b.id" class="stp-badge-history-item">
                <span class="stp-badge-history-emoji">{{ b.def?.emoji || '🏅' }}</span>
                <span class="stp-badge-history-name">{{ b.def?.name ?? b.id }}</span>
                <span class="stp-badge-history-time">{{ b.time }}</span>
              </li>
            </ul>
          </div>
        </section>

        <!-- Tab 5: 配置奖励 -->
        <section v-else-if="activeTab === 'rewards'" class="stp-tab-pane">
          <div class="stp-pane-toolbar">
            <h3 class="stp-pane-title">🎁 奖励项管理</h3>
            <button type="button" class="stp-btn-primary" @click="openAddReward">＋ 新增奖励项</button>
          </div>
          <div v-if="rewardsStore.allRewards().length === 0" class="stp-empty">
            暂无奖励项。点击右上角「＋ 新增奖励项」来创建孩子可以用积分兑换的奖励吧～
          </div>
          <div v-else class="stp-reward-grid">
            <div
              v-for="r in rewardsStore.allRewards()"
              :key="r.id"
              class="stp-reward-card"
              :class="{ 'out-of-stock': (r.stock ?? 1) === 0 }"
            >
              <div class="stp-reward-name">{{ r.name }}</div>
              <div class="stp-reward-cost">{{ r.cost }} 积分</div>
              <div class="stp-reward-stock">库存：{{ r.stock === undefined ? '不限' : r.stock }}</div>
              <div class="stp-reward-actions">
                <button class="stp-btn-ghost" type="button" @click="openEditReward(r.id)">编辑</button>
                <button class="stp-btn-danger" type="button" @click="deleteReward(r.id)">删除</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>

    <!-- 任务表单弹框 -->
    <div v-if="taskFormVisible" class="stp-modal-mask" @click.self="taskFormVisible = false">
      <div class="stp-modal-dialog">
        <header class="stp-modal-header">
          <h3>{{ taskFormMode === 'add' ? '新增任务' : '编辑任务' }}</h3>
          <button class="stp-close-btn" type="button" @click="taskFormVisible = false"><Icon name="close" /></button>
        </header>
        <div class="stp-modal-body">
          <label class="stp-field">
            <span class="stp-field-label">任务标题</span>
            <input type="text" class="stp-field-input" maxlength="100" v-model="taskFormTitle" />
          </label>
          <label class="stp-field">
            <span class="stp-field-label">日期</span>
            <input type="date" class="stp-field-input" v-model="taskFormDate" />
          </label>
        </div>
        <footer class="stp-modal-footer">
          <button class="stp-btn-ghost" type="button" @click="taskFormVisible = false">取消</button>
          <button class="stp-btn-primary" type="button" @click="submitTaskForm">保存</button>
        </footer>
      </div>
    </div>

    <!-- 奖励表单弹框 -->
    <div v-if="rewardFormVisible" class="stp-modal-mask" @click.self="rewardFormVisible = false">
      <div class="stp-modal-dialog">
        <header class="stp-modal-header">
          <h3>{{ rewardFormMode === 'add' ? '新增奖励项' : '编辑奖励项' }}</h3>
          <button class="stp-close-btn" type="button" @click="rewardFormVisible = false"><Icon name="close" /></button>
        </header>
        <div class="stp-modal-body">
          <label class="stp-field">
            <span class="stp-field-label">名称</span>
            <input type="text" class="stp-field-input" maxlength="50" v-model="rewardFormName" />
          </label>
          <label class="stp-field">
            <span class="stp-field-label">所需积分</span>
            <input type="number" min="1" max="9999" step="1" class="stp-field-input" v-model.number="rewardFormCost" />
          </label>
          <label class="stp-field">
            <span class="stp-field-label">库存（留空=不限）</span>
            <input type="number" min="0" step="1" class="stp-field-input" v-model.number="rewardFormStock" />
          </label>
        </div>
        <footer class="stp-modal-footer">
          <button class="stp-btn-ghost" type="button" @click="rewardFormVisible = false">取消</button>
          <button class="stp-btn-primary" type="button" @click="submitRewardForm">保存</button>
        </footer>
      </div>
    </div>
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
.stp-lock-btn {
  padding: 10px 20px;
  background: var(--color-primary, #10b981);
  color: #fff; border: 0; border-radius: 10px;
  font-size: 15px; font-weight: 500; cursor: pointer;
  transition: all 0.15s;
}
.stp-lock-btn:hover { filter: brightness(1.05); transform: translateY(-1px); }

.stp-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.stp-title-group { display: flex; align-items: baseline; gap: 12px; }
.stp-title { margin: 0; font-size: 20px; font-weight: 700; }
.stp-toolbar-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.stp-date-label { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-text-secondary, #6b7280); }
.stp-date-input {
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 8px; padding: 6px 10px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #1f2937);
  font-size: 13px;
}

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
.stp-btn-reset {
  background: transparent; color: #dc2626;
  border: 1px solid rgba(220, 38, 38, 0.3);
  padding: 8px 16px; border-radius: 8px;
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: all 0.12s; white-space: nowrap;
}
.stp-btn-reset:hover:not(:disabled) { background: rgba(220, 38, 38, 0.08); }
.stp-btn-reset:disabled { opacity: 0.5; cursor: not-allowed; }

.stp-tabs {
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 6px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px;
}
.stp-tab {
  flex: 1 1 auto; min-width: 108px;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 12px; border: 0; background: transparent; border-radius: 8px;
  font-size: 14px; font-weight: 500; color: var(--color-text-secondary, #6b7280);
  cursor: pointer; transition: all 0.15s;
}
.stp-tab:hover { background: var(--color-surface-2, #f3f4f6); color: var(--color-text, #1f2937); }
.stp-tab.active {
  background: var(--color-primary, #10b981); color: #fff;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.22);
}
.stp-tab-emoji { font-size: 15px; }

.stp-tab-content {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px; padding: 16px;
  display: flex; flex-direction: column; gap: 18px;
  flex: 1; min-height: 0;
}
.stp-tab-pane { display: flex; flex-direction: column; gap: 16px; }

.stp-pane-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.stp-pane-title { margin: 0; font-size: 16px; font-weight: 600; }

.stp-btn-primary {
  background: var(--color-primary, #10b981); color: #fff; border: 0;
  padding: 8px 16px; border-radius: 8px;
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: all 0.12s;
}
.stp-btn-primary:hover:not(:disabled) { filter: brightness(1.06); transform: translateY(-1px); }
.stp-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.stp-btn-small { padding: 6px 12px; font-size: 12px; }

.stp-btn-ghost {
  background: transparent; color: var(--color-text-secondary, #6b7280);
  border: 1px solid var(--color-border, #d1d5db);
  padding: 6px 12px; border-radius: 8px; font-size: 12px; cursor: pointer;
}
.stp-btn-ghost:hover { background: var(--color-surface-2, #f3f4f6); color: var(--color-text, #1f2937); }

.stp-btn-danger {
  background: transparent; color: #dc2626;
  border: 1px solid rgba(220, 38, 38, 0.3);
  padding: 6px 12px; border-radius: 8px; font-size: 12px; cursor: pointer;
}
.stp-btn-danger:hover { background: rgba(220, 38, 38, 0.08); }

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
  border-radius: 10px; padding: 10px;
  width: 100%; overflow-x: auto;
}
.stp-week-chart { width: 100%; min-width: 500px; height: 200px; }

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
.stp-field-input {
  padding: 7px 10px;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #1f2937);
  font-size: 13px;
}
.stp-field-input:focus { outline: 2px solid var(--color-primary, #10b981); outline-offset: -1px; }

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

.stp-badge-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.stp-badge-card {
  background: var(--color-surface-2, #fafafa);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px; padding: 14px;
  display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px;
}
.stp-badge-card.unlocked { border-color: var(--color-primary, #10b981); background: rgba(16, 185, 129, 0.08); }
.stp-badge-icon { font-size: 32px; }
.stp-badge-name { font-size: 14px; font-weight: 600; }
.stp-badge-desc { font-size: 12px; color: var(--color-text-secondary, #6b7280); line-height: 1.4; min-height: 32px; }
.stp-badge-status { font-size: 11px; color: var(--color-text-secondary, #6b7280); }

.stp-badge-history { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.stp-badge-history-item {
  display: grid; grid-template-columns: 32px 1fr auto;
  gap: 12px; align-items: center;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px; font-size: 13px;
}
.stp-badge-history-emoji { font-size: 18px; text-align: center; }
.stp-badge-history-name { font-weight: 500; }
.stp-badge-history-time { font-size: 12px; color: var(--color-text-secondary, #6b7280); }

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

.stp-modal-mask {
  position: fixed; inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
  z-index: 2500;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.stp-modal-dialog {
  width: 100%; max-width: 440px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #1f2937);
  border-radius: 14px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
  border: 1px solid var(--color-border, #e5e7eb);
  overflow: hidden;
}
.stp-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.stp-modal-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
.stp-close-btn {
  border: 0; background: transparent; color: var(--color-text-secondary, #6b7280);
  padding: 4px; border-radius: 6px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.stp-close-btn:hover { background: var(--color-surface-2, #f3f4f6); color: var(--color-text, #1f2937); }
.stp-modal-body { padding: 18px; display: flex; flex-direction: column; gap: 12px; }
.stp-modal-footer {
  padding: 12px 18px;
  display: flex; justify-content: flex-end; gap: 8px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-surface-2, #fafafa);
}

@media (max-width: 1100px) {
  .stp-stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stp-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stp-task-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .stp-reward-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .stp-points-form { grid-template-columns: 160px 1fr; }
  .stp-points-form .stp-btn-primary { grid-column: 1 / -1; }
}
@media (max-width: 768px) {
  .st-parent-panel { padding: 12px; }
  .stp-stats-grid { grid-template-columns: 1fr 1fr; }
  .stp-stat-value { font-size: 22px; }
  .stp-task-grid, .stp-reward-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stp-reset-actions { flex-direction: column; width: 100%; }
  .stp-btn-reset { text-align: center; }
  .stp-badge-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stp-tabs { flex-direction: row; }
  .stp-tab { min-width: 0; flex: 1 1 0; padding: 8px 6px; font-size: 12px; }
  .stp-summary-grid { grid-template-columns: 1fr 1fr; }
  .stp-points-form { grid-template-columns: 1fr; }
  .stp-txn-item { grid-template-columns: 72px 1fr; }
  .stp-txn-date { grid-column: 1 / -1; text-align: right; }
}
@media (max-width: 480px) {
  .stp-stats-grid { grid-template-columns: 1fr; }
  .stp-task-grid, .stp-reward-grid, .stp-badge-grid, .stp-summary-grid { grid-template-columns: 1fr; }
}
</style>
