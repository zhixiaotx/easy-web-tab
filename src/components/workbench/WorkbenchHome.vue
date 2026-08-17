<script setup lang="ts">
// 工作台主页仪表盘（轮播布局：问候条 + 三屏轮播「行动台 / 数据概览 / 工具」，6s 自动轮播、hover 暂停）
// 只消费共享 store 的 state/computed，不新增 store、不直写 IDB。
// 外壳通过 @navigate 接收面板跳转请求（WorkbenchView 已做白名单收窄）。
// 菜单开关（设置 → 工作台设置 → 工作台菜单）关闭的功能：左菜单隐藏 + 主页对应统计/面板/快捷添加一并隐藏。
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import { useWorkbenchNotesStore } from '@/stores/workbenchNotes'
import { useCountdownsStore } from '@/stores/countdowns'
import { usePasswordsStore } from '@/stores/passwords'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { useWorkbenchLedgerStore } from '@/stores/workbenchLedger'
import { useAppSettingsStore } from '@/stores/settings'
import { calcBmi, calcDailyAttainment, calcExerciseAttainment } from '@/composables/healthCore'
import { calcMonthlyStats, formatYuan, maskOrReveal, monthKeyOf } from '@/composables/ledgerCore'
import { useToast } from '@/composables/useToast'
import type { CountdownItem, HealthPlanMetric, TodoPriority, WorkbenchTodo } from '@/types'
import Icon from '@/components/Icon.vue'
import WeatherCard from '@/components/workbench/WeatherCard.vue'
import CalendarAnchorCard from '@/components/workbench/CalendarAnchorCard.vue'

const emit = defineEmits<{ navigate: [section: string, tab?: string] }>()

const todosStore = useWorkbenchTodosStore()
const notesStore = useWorkbenchNotesStore()
const countdownsStore = useCountdownsStore()
const passwordsStore = usePasswordsStore()
const healthStore = useWorkbenchHealthStore()
const ledgerStore = useWorkbenchLedgerStore()
const settingsStore = useAppSettingsStore()
const toast = useToast()

// ===== 菜单开关视图（缺失键恒 true；false = 功能已关闭）=====
const menuOn = computed(() => settingsStore.workbenchMenuEnabled)

// ===== 问候 + 时间（按 now 时段问候：早上好/下午好/晚上好）=====
const now = ref(new Date())
let nowTimer = 0

const greeting = computed(() => {
  const h = now.value.getHours()
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
})

const timeText = computed(() =>
  now.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
)

const dateText = computed(() =>
  now.value.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
)

// ===== 轮播图：3 屏（0=行动台 / 1=数据概览 / 2=工具），6s 自动轮播，hover 暂停，手动切换重置计时 =====
const SLIDE_COUNT = 3
const AUTOPLAY_MS = 6000
const slideIndex = ref(0)
const carouselPaused = ref(false)
let carouselTimer = 0

function stopAutoplay(): void {
  window.clearInterval(carouselTimer)
}

function startAutoplay(): void {
  stopAutoplay()
  if (carouselPaused.value) return
  carouselTimer = window.setInterval(() => nextSlide(), AUTOPLAY_MS)
}

function goToSlide(index: number): void {
  slideIndex.value = ((index % SLIDE_COUNT) + SLIDE_COUNT) % SLIDE_COUNT
  startAutoplay()
}

function nextSlide(): void {
  goToSlide(slideIndex.value + 1)
}

function prevSlide(): void {
  goToSlide(slideIndex.value - 1)
}

function pauseCarousel(): void {
  carouselPaused.value = true
  stopAutoplay()
}

function resumeCarousel(): void {
  carouselPaused.value = false
  startAutoplay()
}

onMounted(() => {
  nowTimer = window.setInterval(() => {
    now.value = new Date()
  }, 30000)
  startAutoplay()
})
onUnmounted(() => {
  window.clearInterval(nowTimer)
  stopAutoplay()
})

// ===== 快捷添加待办（回车 addTodo + toast，校验同 WorkbenchTodo.vue 表单）=====
const quickTodoTitle = ref('')

async function handleQuickAdd(): Promise<void> {
  const title = quickTodoTitle.value.trim()
  if (!title) return
  if (title.length > 100) {
    toast.warning('待办标题不能超过 100 字')
    return
  }
  await todosStore.addTodo({ title, priority: 'medium' })
  toast.success('待办已添加')
  quickTodoTitle.value = ''
}

// ===== 逾期判断（同 WorkbenchTodo.vue）=====
// 今天 = 本地日期 YYYY-MM-DD（不能用 toISOString，那是 UTC，会偏一天）
function localToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isOverdue(todo: WorkbenchTodo): boolean {
  return !!todo.dueDate && !todo.completed && todo.dueDate < localToday()
}

// ===== 统计卡 =====
const todoStats = computed(() => ({
  total: todosStore.todos.length,
  active: todosStore.activeCount,
  overdue: todosStore.todos.filter(t => isOverdue(t)).length
}))

// 待办完成率（微可视化进度环，数值仅由 store 的 total/active 派生，不重算统计）
const todoCompletionRate = computed(() => {
  const total = todoStats.value.total
  if (total === 0) return 0
  return Math.round(((total - todoStats.value.active) / total) * 100)
})

const noteStats = computed(() => ({
  total: notesStore.notes.length,
  pinned: notesStore.notes.filter(n => n.pinned).length
}))

// 30 天内到期：itemsWithRemaining 中未过期且 status 非 normal（critical ≤7 天、urgent ≤30 天，均在 30 天内）
const countdownStats = computed(() => ({
  total: countdownsStore.countdowns.length,
  near30: countdownsStore.itemsWithRemaining.filter(
    i => !i.remaining.isExpired && i.remaining.status !== 'normal'
  ).length
}))

// ===== 健康 & 记账统计卡（数值全部走 healthCore/ledgerCore 纯函数，不在此重写公式）=====

// 运动指标单位（周达标 sub：次/分钟/千卡）
const EXERCISE_UNIT: Record<HealthPlanMetric, string> = {
  times: '次',
  minutes: '分钟',
  calories: '千卡',
  duration: '次'
}

// 运动：本周达标（times=条数 / minutes=Σduration / calories=Σcalories）
const exerciseStats = computed(() => {
  const plan = healthStore.plans.exercise
  const at = calcExerciseAttainment(healthStore.records.exercise, plan, localToday())
  if (!at || !plan) return { value: '未设定目标', sub: '点击前往设置' }
  return { value: `${at.current}/${at.target}`, sub: `本周 · ${EXERCISE_UNIT[plan.metric]}` }
})

// 饮食：今日热量合计
const dietStats = computed(() => {
  const at = calcDailyAttainment(healthStore.records.diet, healthStore.plans.diet, localToday())
  if (!at) return { value: '未设定目标', sub: '点击前往设置' }
  return { value: `${at.current}/${at.target}`, sub: '今日 · 千卡' }
})

// 睡眠：今日时长（今日无记录但有计划 → '—'）
const sleepStats = computed(() => {
  const today = localToday()
  const plan = healthStore.plans.sleep
  if (!plan) return { value: '未设定目标', sub: '点击前往设置' }
  if (!healthStore.records.sleep.some(r => r.date === today)) return { value: '—', sub: '今日暂无记录' }
  const at = calcDailyAttainment(healthStore.records.sleep, plan, today)
  // 计划存在且今日有记录 → at 必非 null（calcDailyAttainment 仅无计划/模块非 diet|sleep 时返回 null）
  if (!at) return { value: '—', sub: '今日暂无记录' }
  return { value: `${at.current}/${at.target}`, sub: '今日 · 小时' }
})

// 体重：最近一条（date 降序，同日取 createdAt 新者）+ 身高 → BMI
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

// 记账：本月收入/支出（金额走掩码：默认隐藏 ****，跟随记账面板可见性开关实时联动；结余由记账面板承载）
const ledgerStats = computed(() => {
  const stats = calcMonthlyStats(ledgerStore.entries, monthKeyOf(localToday()), ledgerStore.categories)
  return {
    value: `支出 ¥${maskOrReveal(formatYuan(stats.expense), !ledgerStore.showAmount)}`,
    sub: `收入 ¥${maskOrReveal(formatYuan(stats.income), !ledgerStore.showAmount)}`
  }
})

// ===== 概览可见统计卡（纯占位隐藏：无数据的卡不渲染；菜单开关关闭的功能不渲染；有目标但 0 值的卡保留）=====
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
  return keys
})

// ===== 即将到期倒计时：itemsWithRemaining 中未过期的前 3 条（已按 store 排序）=====
const upcomingCountdowns = computed<CountdownItem[]>(() =>
  countdownsStore.itemsWithRemaining.filter(i => !i.remaining.isExpired).slice(0, 3)
)

// ===== 未完成待办前 5：todos 中未完成，按 visibleTodos 排序语义
//（优先级高→低 → 截止日期升序，无截止排最后 → 创建时间降序，新的在前）=====
const PRIORITY_ORDER: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 }

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

// ===== 优先级徽章（同 WorkbenchTodo.vue）=====
const PRIORITY_META: Record<TodoPriority, { label: string; className: string }> = {
  high: { label: '高', className: 'prio-high' },
  medium: { label: '中', className: 'prio-medium' },
  low: { label: '低', className: 'prio-low' }
}

// 倒计时剩余状态色（同 WorkbenchCountdown.vue）
function statusClass(status: CountdownItem['remaining']['status']): string {
  return `cd-${status}`
}
</script>

<template>
  <div class="wb-home">
    <!-- 问候条（静态，全宽） -->
    <section class="bento-card bento-greeting" data-testid="home-greeting">
      <div class="greeting-info">
        <h2 class="greeting-title">{{ greeting }}，欢迎回来</h2>
        <p class="greeting-sub">把今天要做的事，一件一件完成吧</p>
      </div>
      <div class="greeting-clock">
        <div class="greeting-time">{{ timeText }}</div>
        <div class="greeting-date">{{ dateText }}</div>
      </div>
    </section>

    <!-- 轮播区：行动台 / 数据概览 / 工具 三屏自动轮播（hover 暂停，箭头/圆点手动切换） -->
    <section
      class="home-carousel"
      data-testid="home-carousel"
      aria-label="主页轮播"
      @mouseenter="pauseCarousel"
      @mouseleave="resumeCarousel"
    >
      <div class="home-carousel-window">
        <div class="home-carousel-track" :style="{ transform: `translateX(-${slideIndex * 100}%)` }">
          <!-- 第 1 屏：行动台（即将到期提醒 + 未完成待办 + 天气 + 日历锚点，开关关闭的功能整块隐藏） -->
          <div class="home-slide" data-testid="home-slide-action">
            <div v-if="menuOn.countdowns || menuOn.todos || true" class="home-slide-grid">
              <section v-if="menuOn.countdowns" class="bento-card bento-panel">
                <div class="panel-header">
                  <h3><span class="panel-icon"><Icon name="countdowns" /></span>即将到期定时提醒</h3>
                  <button class="nav-btn" data-testid="home-nav-countdowns" @click="emit('navigate', 'countdowns')">前往 →</button>
                </div>
                <ul v-if="upcomingCountdowns.length > 0" class="home-list" data-testid="home-upcoming-list">
                  <li v-for="item in upcomingCountdowns" :key="item.id" class="home-list-item">
                    <span class="home-list-title">{{ item.name }}</span>
                    <span class="home-list-meta" :class="statusClass(item.remaining.status)">{{ item.remaining.label }}</span>
                  </li>
                </ul>
                <div v-else class="home-empty" data-testid="home-upcoming-empty">暂无即将到期的定时提醒</div>
              </section>

              <section v-if="menuOn.todos" class="bento-card bento-panel">
                <div class="panel-header">
                  <h3><span class="panel-icon"><Icon name="todos" /></span>未完成待办</h3>
                  <button class="nav-btn" data-testid="home-nav-todos" @click="emit('navigate', 'todos')">前往 →</button>
                </div>
                <ul v-if="pendingTodos.length > 0" class="home-list" data-testid="home-todo-list">
                  <li v-for="todo in pendingTodos" :key="todo.id" class="home-list-item">
                    <span class="home-list-title">{{ todo.title }}</span>
                    <span class="prio-badge" :class="PRIORITY_META[todo.priority].className">
                      {{ PRIORITY_META[todo.priority].label }}
                    </span>
                    <span v-if="todo.dueDate" class="home-list-meta due" :class="{ overdue: isOverdue(todo) }">
                      {{ todo.dueDate }}
                    </span>
                  </li>
                </ul>
                <div v-else class="home-empty" data-testid="home-todo-empty">暂无未完成待办</div>
              </section>

              <!-- 天气卡（第一页嵌入，未配置城市显示占位+去设置） -->
              <WeatherCard class="bento-weather" />

              <!-- 日历锚点卡（第一页嵌入，发薪/纪念日倒计时） -->
              <CalendarAnchorCard class="bento-anchor" />
            </div>
            <div v-else class="home-empty" data-testid="home-action-empty">待办与定时提醒功能已关闭，可在设置中开启</div>
          </div>

          <!-- 第 2 屏：数据概览（统计卡；卡按 visibleStatCards 隐藏纯占位，全空时显示空态） -->
          <div class="home-slide" data-testid="home-slide-overview">
            <div v-if="visibleStatCards.length > 0" class="home-slide-grid home-slide-grid-stats" data-testid="home-overview">
              <div class="bento-card bento-stat" data-testid="home-stats-todos" v-if="visibleStatCards.includes('todos')">
                <div class="stat-header">
                  <span class="stat-icon"><Icon name="todos" :size="16" /></span>
                  <span class="stat-label">待办任务</span>
                  <button class="nav-btn" data-testid="home-nav-todos" @click="emit('navigate', 'todos')">前往 →</button>
                </div>
                <div class="stat-body">
                  <div class="stat-value" data-testid="home-stats-value-todos">{{ todoStats.total }}</div>
                  <div class="ring-wrap" :title="`已完成 ${todoCompletionRate}%`">
                    <svg class="progress-ring" viewBox="0 0 36 36" aria-hidden="true">
                      <circle class="ring-track" cx="18" cy="18" r="15.9155" fill="none" />
                      <circle
                        class="ring-bar"
                        cx="18"
                        cy="18"
                        r="15.9155"
                        fill="none"
                        :stroke-dasharray="`${todoCompletionRate} 100`"
                      />
                    </svg>
                    <span class="ring-text">{{ todoCompletionRate }}%</span>
                  </div>
                </div>
                <div class="stat-sub">{{ todoStats.active }} 未完成 · {{ todoStats.overdue }} 已逾期</div>
              </div>

              <div class="bento-card bento-stat" data-testid="home-stats-notes" v-if="visibleStatCards.includes('notes')">
                <div class="stat-header">
                  <span class="stat-icon"><Icon name="notes" :size="16" /></span>
                  <span class="stat-label">便签</span>
                  <button class="nav-btn" data-testid="home-nav-notes" @click="emit('navigate', 'notes')">前往 →</button>
                </div>
                <div class="stat-value" data-testid="home-stats-value-notes">{{ noteStats.total }}</div>
                <div class="stat-sub">{{ noteStats.pinned }} 置顶</div>
              </div>

              <div class="bento-card bento-stat" data-testid="home-stats-countdowns" v-if="visibleStatCards.includes('countdowns')">
                <div class="stat-header">
                  <span class="stat-icon"><Icon name="countdowns" :size="16" /></span>
                  <span class="stat-label">定时提醒</span>
                  <button class="nav-btn" data-testid="home-nav-countdowns" @click="emit('navigate', 'countdowns')">前往 →</button>
                </div>
                <div class="stat-value" data-testid="home-stats-value-countdowns">{{ countdownStats.total }}</div>
                <div class="stat-sub">{{ countdownStats.near30 }} 项 30 天内到期</div>
              </div>

              <div class="bento-card bento-stat" data-testid="home-stats-passwords" v-if="visibleStatCards.includes('passwords')">
                <div class="stat-header">
                  <span class="stat-icon"><Icon name="passwords" :size="16" /></span>
                  <span class="stat-label">密码</span>
                  <button class="nav-btn" data-testid="home-nav-passwords" @click="emit('navigate', 'passwords')">前往 →</button>
                </div>
                <div class="stat-value" data-testid="home-stats-value-passwords">
                  {{ passwordsStore.isUnlocked ? `${passwordsStore.passwords.length} 条` : '🔒 解锁后可见' }}
                </div>
                <div class="stat-sub">{{ passwordsStore.isUnlocked ? '已解锁' : '未解锁' }}</div>
              </div>

              <div class="bento-card bento-stat" data-testid="home-stats-exercise" v-if="visibleStatCards.includes('exercise')">
                <div class="stat-header">
                  <span class="stat-icon"><Icon name="exercise" :size="16" /></span>
                  <span class="stat-label">运动</span>
                  <button class="nav-btn" data-testid="home-nav-exercise" @click="emit('navigate', 'health', 'exercise')">前往 →</button>
                </div>
                <div class="stat-value" data-testid="home-stats-value-exercise">{{ exerciseStats.value }}</div>
                <div class="stat-sub" data-testid="home-stats-sub-exercise">{{ exerciseStats.sub }}</div>
              </div>

              <div class="bento-card bento-stat" data-testid="home-stats-diet" v-if="visibleStatCards.includes('diet')">
                <div class="stat-header">
                  <span class="stat-icon"><Icon name="diet" :size="16" /></span>
                  <span class="stat-label">饮食</span>
                  <button class="nav-btn" data-testid="home-nav-diet" @click="emit('navigate', 'health', 'diet')">前往 →</button>
                </div>
                <div class="stat-value" data-testid="home-stats-value-diet">{{ dietStats.value }}</div>
                <div class="stat-sub" data-testid="home-stats-sub-diet">{{ dietStats.sub }}</div>
              </div>

              <div class="bento-card bento-stat" data-testid="home-stats-sleep" v-if="visibleStatCards.includes('sleep')">
                <div class="stat-header">
                  <span class="stat-icon"><Icon name="sleep" :size="16" /></span>
                  <span class="stat-label">睡眠</span>
                  <button class="nav-btn" data-testid="home-nav-sleep" @click="emit('navigate', 'health', 'sleep')">前往 →</button>
                </div>
                <div class="stat-value" data-testid="home-stats-value-sleep">{{ sleepStats.value }}</div>
                <div class="stat-sub" data-testid="home-stats-sub-sleep">{{ sleepStats.sub }}</div>
              </div>

              <div class="bento-card bento-stat" data-testid="home-stats-weight" v-if="visibleStatCards.includes('weight')">
                <div class="stat-header">
                  <span class="stat-icon"><Icon name="weight" :size="16" /></span>
                  <span class="stat-label">体重</span>
                  <button class="nav-btn" data-testid="home-nav-weight" @click="emit('navigate', 'health', 'weight')">前往 →</button>
                </div>
                <div class="stat-value" data-testid="home-stats-value-weight">{{ weightStats.value }}</div>
                <div class="stat-sub" data-testid="home-stats-sub-weight">{{ weightStats.sub }}</div>
              </div>

              <div class="bento-card bento-stat" data-testid="home-stats-ledger" v-if="visibleStatCards.includes('ledger')">
                <div class="stat-header">
                  <span class="stat-icon"><Icon name="ledger" :size="16" /></span>
                  <span class="stat-label">记账</span>
                  <button class="nav-btn" data-testid="home-nav-ledger" @click="emit('navigate', 'ledger')">前往 →</button>
                </div>
                <div class="stat-value" data-testid="home-stats-value-ledger">{{ ledgerStats.value }}</div>
                <div class="stat-sub" data-testid="home-stats-sub-ledger">{{ ledgerStats.sub }}</div>
              </div>
            </div>
            <div v-else class="home-empty" data-testid="home-overview-empty">暂无统计数据，去各功能面板添加数据吧</div>
          </div>

          <!-- 第 3 屏：工具（快捷添加待办；待办关闭时整块隐藏） -->
          <div class="home-slide" data-testid="home-slide-tools">
            <div v-if="menuOn.todos" class="home-slide-tools-single">
              <section class="bento-card bento-quick-add">
                <div class="quick-add-label"><Icon name="todos" :size="16" />快速添加待办</div>
                <div class="quick-add-row">
                  <input
                    v-model="quickTodoTitle"
                    class="quick-add-input"
                    data-testid="home-quick-add-input"
                    type="text"
                    maxlength="100"
                    placeholder="输入待办标题，回车即可添加…"
                    @keyup.enter="handleQuickAdd"
                  />
                  <button type="button" class="quick-add-btn" data-testid="home-quick-add-btn" @click="handleQuickAdd">
                    添加
                  </button>
                </div>
              </section>
            </div>
            <div v-else class="home-empty" data-testid="home-tools-empty">快速添加待办功能已关闭，可在设置中开启</div>
          </div>
        </div>
      </div>

      <!-- 轮播控制条：箭头 + 圆点 -->
      <div class="home-carousel-bar">
        <button type="button" class="home-carousel-arrow" data-testid="home-carousel-prev" aria-label="上一屏" @click="prevSlide">‹</button>
        <div class="home-carousel-dots">
          <button
            v-for="i in SLIDE_COUNT"
            :key="i"
            type="button"
            class="home-carousel-dot"
            :class="{ active: slideIndex === i - 1 }"
            :data-testid="`home-carousel-dot-${i - 1}`"
            :aria-label="`第 ${i} 屏`"
            @click="goToSlide(i - 1)"
          ></button>
        </div>
        <button type="button" class="home-carousel-arrow" data-testid="home-carousel-next" aria-label="下一屏" @click="nextSlide">›</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* 面板容器（WorkbenchView 的 .wb-content 已提供滚动与背景，此处不 position:fixed） */
.wb-home {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 桌面一屏契约（T3 shell 已给 .wb-home flex:1 + min-height:0；轮播区独占剩余高度并区内滚动兜底） */
@media (min-width: 769px) {
  .home-carousel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}

/* ===== 轮播图 ===== */
.home-carousel-window {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.home-carousel-track {
  display: flex;
  transition: transform 0.4s ease;
}

.home-slide {
  min-width: 100%;
  box-sizing: border-box;
}

.home-slide-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

.home-slide-grid-stats,
.home-slide-grid-tools {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

/* 工具页单卡居中容器 */
.home-slide-tools-single {
  display: flex;
  justify-content: center;
  padding: 16px;
}

.home-slide-tools-single .bento-quick-add {
  width: 100%;
  max-width: 400px;
}

/* ===== 卡片基础（统一 .bento-card）===== */
.bento-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
}

.bento-card:hover {
  border-color: var(--accent-color, var(--color-primary));
}

/* 统计卡瘦身：padding 覆盖（12px 14px），不改共享 .bento-card 的 16px */
.bento-stat {
  padding: 12px 14px;
}

/* ===== 问候条 ===== */
.bento-greeting {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent-color, #3b82f6) 8%, transparent), transparent),
    var(--bg-card, var(--color-bg-card));
}

.greeting-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.greeting-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary, var(--color-text));
}

.greeting-sub {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.greeting-clock {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}

.greeting-time {
  font-size: 34px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--accent-color, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.greeting-date {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

/* ===== 快捷添加待办 ===== */
.bento-quick-add {
  gap: 10px;
}

.quick-add-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, var(--color-text-secondary));
}

.quick-add-row {
  display: flex;
  gap: 8px;
}

.quick-add-input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  font-size: 14px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm, 8px);
  color: var(--text-primary, var(--color-text));
  outline: none;
  transition: border-color var(--transition-fast, 0.15s ease);
}

.quick-add-input:focus {
  border-color: var(--accent-color, var(--color-primary));
}

.quick-add-input::placeholder {
  color: var(--text-muted, var(--color-text-muted));
}

.quick-add-btn {
  flex-shrink: 0;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  border-radius: var(--radius-sm, 8px);
  background: var(--accent-color, var(--color-primary));
  border: 1px solid var(--accent-color, var(--color-primary));
  color: #fff;
  cursor: pointer;
  transition: filter var(--transition-fast, 0.15s ease);
}

.quick-add-btn:hover {
  filter: brightness(1.1);
}

/* ===== 统计卡头部 ===== */
.stat-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-label {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, var(--color-text-secondary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-btn {
  flex-shrink: 0;
  padding: 3px 8px;
  font-size: 12px;
  border-radius: var(--radius-full, 999px);
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--accent-color, var(--color-primary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.nav-btn:hover {
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
  color: #fff;
}

.stat-value {
  min-width: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-sub {
  min-width: 0;
  font-size: 12px;
  color: var(--text-secondary, var(--color-text-secondary));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== 待办完成率进度环（微可视化，数值来自 store）===== */
.stat-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ring-wrap {
  position: relative;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

.progress-ring {
  width: 44px;
  height: 44px;
  transform: rotate(-90deg);
}

.ring-track {
  stroke: var(--border-color, var(--color-border));
  stroke-width: 3;
}

.ring-bar {
  stroke: var(--accent-color, var(--color-primary));
  stroke-width: 3;
  stroke-linecap: round;
  transition: stroke-dasharray var(--transition-fast, 0.3s ease);
}

.ring-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

/* ===== 列表面板 ===== */
.bento-panel {
  gap: 12px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.panel-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-icon {
  display: inline-flex;
  align-items: center;
  margin-right: 4px;
}

/* ===== 列表 ===== */
.home-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.home-list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm, 8px);
  transition: border-color var(--transition-fast, 0.15s ease);
}

.home-list-item:hover {
  border-color: var(--accent-color, var(--color-primary));
}

.home-list-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-list-meta {
  flex-shrink: 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ===== 优先级徽章（同 WorkbenchTodo.vue）===== */
.prio-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  border: 1px solid transparent;
}

.prio-high {
  color: #b91c1c;
  background: #fee2e2;
  border-color: #fca5a5;
}

.prio-medium {
  color: #b45309;
  background: #fef3c7;
  border-color: #fcd34d;
}

.prio-low {
  color: #475569;
  background: #f1f5f9;
  border-color: #cbd5e1;
}

/* ===== 倒计时剩余状态色 ===== */
.cd-normal {
  color: var(--success-color, var(--color-success));
}

.cd-urgent {
  color: var(--warning-color, var(--color-warning));
}

.cd-critical {
  color: var(--error-color, var(--color-error));
}

/* ===== 截止日期 ===== */
.due {
  color: var(--text-secondary, var(--color-text-secondary));
}

.due.overdue {
  color: var(--error-color, #ef4444);
  font-weight: 600;
}

/* ===== 空态 ===== */
.home-empty {
  text-align: center;
  color: var(--text-muted, var(--color-text-muted));
  font-size: 13px;
  padding: 24px 12px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px dashed var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

/* ===== 轮播控制条 ===== */
.home-carousel-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding-top: 10px;
}

.home-carousel-arrow {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border-color, var(--color-border));
  background: var(--bg-card, var(--color-bg-card));
  color: var(--text-secondary, var(--color-text-secondary));
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.home-carousel-arrow:hover {
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.home-carousel-dots {
  display: flex;
  align-items: center;
  gap: 8px;
}

.home-carousel-dot {
  width: 10px;
  height: 10px;
  padding: 0;
  border-radius: 50%;
  border: none;
  background: var(--border-color, var(--color-border));
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s ease);
}

.home-carousel-dot.active {
  width: 22px;
  border-radius: 999px;
  background: var(--accent-color, var(--color-primary));
}

/* ===== 暗色模式覆盖 ===== */
:root.dark .bento-card {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .bento-greeting {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent-color, #3b82f6) 12%, transparent), transparent),
    var(--bg-secondary, #1f2937);
}

:root.dark .greeting-title,
:root.dark .stat-value,
:root.dark .panel-header h3,
:root.dark .home-list-title {
  color: var(--text-primary, #f9fafb);
}

:root.dark .greeting-time {
  color: #60a5fa;
}

:root.dark .greeting-sub,
:root.dark .stat-label,
:root.dark .stat-sub,
:root.dark .ring-text {
  color: var(--text-secondary, #d1d5db);
}

:root.dark .home-list-item {
  background-color: var(--bg-card, #1f2937);
  border-color: var(--border-color, #374151);
}

:root.dark .quick-add-input {
  background-color: var(--bg-card, #1f2937);
  border-color: var(--border-color, #374151);
  color: var(--text-primary, #f9fafb);
}

:root.dark .nav-btn {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .nav-btn:hover {
  background-color: var(--accent-color, #3b82f6);
  color: #fff;
}

:root.dark .home-empty {
  background-color: var(--bg-secondary, #1f2937);
}

:root.dark .home-carousel-arrow {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .home-carousel-dot {
  background-color: var(--border-color, #4b5563);
}

:root.dark .prio-high {
  color: #fca5a5;
  background: rgba(185, 28, 28, 0.35);
  border-color: #991b1b;
}

:root.dark .prio-medium {
  color: #fbbf24;
  background: rgba(180, 83, 9, 0.35);
  border-color: #92400e;
}

:root.dark .prio-low {
  color: #cbd5e1;
  background: rgba(71, 85, 105, 0.35);
  border-color: #475569;
}

:root.dark .cd-normal {
  color: #4ade80;
}

:root.dark .cd-urgent {
  color: #fbbf24;
}

:root.dark .cd-critical {
  color: #f87171;
}

/* ===== 响应式：平板双列 / 手机单列 ===== */
@media (max-width: 1100px) {
  .home-slide-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .home-slide-grid-stats,
  .home-slide-grid-tools {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .home-slide-grid,
  .home-slide-grid-stats,
  .home-slide-grid-tools {
    grid-template-columns: 1fr;
  }

  .bento-greeting {
    flex-direction: column;
    align-items: flex-start;
  }

  .greeting-clock {
    align-items: flex-start;
  }
}
</style>
