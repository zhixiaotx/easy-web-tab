<script setup lang="ts">
// 工作台主页仪表盘（轮播布局：问候条 + 三屏轮播「行动台 / 数据概览 / 工具」，6s 自动轮播、hover 暂停）
// 只消费共享 store 的 state/computed，不新增 store、不直写 IDB。
// 外壳通过 @navigate 接收面板跳转请求（WorkbenchView 已做白名单收窄）。
// 菜单开关（设置 → 工作台设置 → 工作台菜单）关闭的功能：左菜单隐藏 + 主页对应统计/面板/快捷添加一并隐藏。
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import { useWorkbenchNotesStore } from '@/stores/workbenchNotes'
import { useToast } from '@/composables/useToast'
import { useHomeStats, PRIORITY_META, statusClass } from '@/composables/useHomeStats'
import Icon from '@/components/Icon.vue'
import HomeLayoutCard from '@/components/workbench/HomeLayoutCard.vue'
import WeatherCard from '@/components/workbench/WeatherCard.vue'
import CalendarAnchorCard from '@/components/workbench/CalendarAnchorCard.vue'

const emit = defineEmits<{ navigate: [section: string, tab?: string] }>()

const todosStore = useWorkbenchTodosStore()
const notesStore = useWorkbenchNotesStore()
const toast = useToast()

// ===== 主页统计逻辑（从 composable 消费）=====
const {
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
  visibleStatCards,
  upcomingCountdowns,
  pendingTodos,
  isOverdue,
  isUnlocked,
  passwordCount
} = useHomeStats()

// ===== 主页卡片布局（鼠标拖拽排序，参考网站管理卡片 SiteCard）=====
// 顺序逻辑在 useHomeLayout 单例中；卡片直接可拖拽，无需编辑模式开关。

// 导航：点击卡片跳转对应面板（卡片同时可拖拽排序，点击与拖拽互不冲突）
function navTo(section: string, tab?: string): void {
  emit('navigate', section, tab)
}

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

// ===== 触摸滑动手势（移动端 swipe left/right 切换轮播）=====
const SWIPE_THRESHOLD = 50
let touchStartX = 0

function onTouchStart(e: TouchEvent): void {
  touchStartX = e.touches[0].clientX
}

function onTouchEnd(e: TouchEvent): void {
  const deltaX = e.changedTouches[0].clientX - touchStartX
  if (Math.abs(deltaX) < SWIPE_THRESHOLD) return
  if (deltaX < 0) {
    nextSlide()
  } else {
    prevSlide()
  }
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

// ===== 快捷添加便签（回车 addNote + toast）=====
const quickNoteTitle = ref('')

async function handleQuickNote(): Promise<void> {
  const title = quickNoteTitle.value.trim()
  if (!title) return
  if (title.length > 100) {
    toast.warning('便签标题不能超过 100 字')
    return
  }
  await notesStore.addNote({ title, content: '', color: 'blue' })
  toast.success('便签已添加')
  quickNoteTitle.value = ''
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

    <!-- 轮播区：行动台 / 数据概览 / 工具 三屏自动轮播（hover 暂停，箭头/圆点/触摸滑动手势切换） -->
    <section
      class="home-carousel"
      data-testid="home-carousel"
      aria-label="主页轮播"
      @mouseenter="pauseCarousel"
      @mouseleave="resumeCarousel"
    >
      <div
        class="home-carousel-window"
        @touchstart="onTouchStart"
        @touchend="onTouchEnd"
      >
        <div class="home-carousel-track" :style="{ transform: `translateX(-${slideIndex * 100}%)` }">
          <!-- 第 1 屏：行动台（快捷添加待办/便签 + 即将到期提醒 + 天气 + 日历锚点） -->
          <div class="home-slide" data-testid="home-slide-action">
            <div v-if="menuOn.todos || menuOn.notes || menuOn.countdowns" class="home-slide-grid">
              <HomeLayoutCard v-if="menuOn.todos" card-id="quick-add-todo" :default-w="1">
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
                    <button type="button" class="quick-add-btn" data-testid="home-quick-add-btn" @click="handleQuickAdd">添加</button>
                  </div>
                </section>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="menuOn.notes" card-id="quick-add-note" :default-w="1">
                <section class="bento-card bento-quick-add">
                  <div class="quick-add-label"><Icon name="notes" :size="16" />快速添加便签</div>
                  <div class="quick-add-row">
                    <input
                      v-model="quickNoteTitle"
                      class="quick-add-input"
                      data-testid="home-quick-note-input"
                      type="text"
                      maxlength="100"
                      placeholder="输入便签标题，回车即可添加…"
                      @keyup.enter="handleQuickNote"
                    />
                    <button type="button" class="quick-add-btn" data-testid="home-quick-note-btn" @click="handleQuickNote">添加</button>
                  </div>
                </section>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="menuOn.countdowns" card-id="upcoming" :default-w="1">
                <section class="bento-card bento-panel">
                  <div class="panel-header">
                    <h3><span class="panel-icon"><Icon name="countdowns" /></span>即将到期定时提醒</h3>
                    <button class="nav-btn" data-testid="home-nav-countdowns" @click="navTo('countdowns')">前往 →</button>
                  </div>
                  <ul v-if="upcomingCountdowns.length > 0" class="home-list" data-testid="home-upcoming-list">
                    <li v-for="item in upcomingCountdowns" :key="item.id" class="home-list-item">
                      <span class="home-list-title">{{ item.name }}</span>
                      <span class="home-list-meta" :class="statusClass(item.remaining.status)">{{ item.remaining.label }}</span>
                    </li>
                  </ul>
                  <div v-else class="home-empty" data-testid="home-upcoming-empty">暂无即将到期的定时提醒</div>
                </section>
              </HomeLayoutCard>

              <HomeLayoutCard card-id="weather" :default-w="1">
                <WeatherCard class="bento-weather" />
              </HomeLayoutCard>

            </div>
            <div v-else class="home-empty" data-testid="home-action-empty">快捷添加与定时提醒功能已关闭，可在工作台菜单设置中开启</div>
          </div>

          <!-- 第 2 屏：数据概览（统计卡；卡按 visibleStatCards 隐藏纯占位，全空时显示空态） -->
          <div class="home-slide" data-testid="home-slide-overview">
            <div v-if="visibleStatCards.length > 0" class="home-slide-grid home-slide-grid-stats" data-testid="home-overview">
              <HomeLayoutCard v-if="visibleStatCards.includes('todos')" card-id="todos" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-todos" @click="navTo('todos')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="todos" :size="16" /></span>
                    <span class="stat-label">待办任务</span>
                    <button class="nav-btn" data-testid="home-nav-todos" @click.stop="navTo('todos')">前往 →</button>
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
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('notes')" card-id="notes" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-notes" @click="navTo('notes')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="notes" :size="16" /></span>
                    <span class="stat-label">便签</span>
                    <button class="nav-btn" data-testid="home-nav-notes" @click.stop="navTo('notes')">前往 →</button>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-notes">{{ noteStats.total }}</div>
                  <div class="stat-sub">{{ noteStats.pinned }} 置顶</div>
                </div>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('countdowns')" card-id="countdowns" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-countdowns" @click="navTo('countdowns')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="countdowns" :size="16" /></span>
                    <span class="stat-label">定时提醒</span>
                    <button class="nav-btn" data-testid="home-nav-countdowns" @click.stop="navTo('countdowns')">前往 →</button>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-countdowns">{{ countdownStats.total }}</div>
                  <div class="stat-sub">{{ countdownStats.near30 }} 项 30 天内到期</div>
                </div>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('passwords')" card-id="passwords" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-passwords" @click="navTo('passwords')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="passwords" :size="16" /></span>
                    <span class="stat-label">密码</span>
                    <button class="nav-btn" data-testid="home-nav-passwords" @click.stop="navTo('passwords')">前往 →</button>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-passwords">
                    <template v-if="isUnlocked">{{ passwordCount }} 条</template>
                    <template v-else><Icon name="lock" :size="14" /> 解锁后可见</template>
                  </div>
                  <div class="stat-sub">{{ isUnlocked ? '已解锁' : '未解锁' }}</div>
                </div>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('exercise')" card-id="exercise" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-exercise" @click="navTo('health', 'exercise')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="exercise" :size="16" /></span>
                    <span class="stat-label">运动</span>
                    <button class="nav-btn" data-testid="home-nav-exercise" @click.stop="navTo('health', 'exercise')">前往 →</button>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-exercise">{{ exerciseStats.value }}</div>
                  <div class="stat-sub" data-testid="home-stats-sub-exercise">{{ exerciseStats.sub }}</div>
                </div>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('diet')" card-id="diet" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-diet" @click="navTo('health', 'diet')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="diet" :size="16" /></span>
                    <span class="stat-label">饮食</span>
                    <button class="nav-btn" data-testid="home-nav-diet" @click.stop="navTo('health', 'diet')">前往 →</button>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-diet">{{ dietStats.value }}</div>
                  <div class="stat-sub" data-testid="home-stats-sub-diet">{{ dietStats.sub }}</div>
                </div>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('sleep')" card-id="sleep" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-sleep" @click="navTo('health', 'sleep')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="sleep" :size="16" /></span>
                    <span class="stat-label">睡眠</span>
                    <button class="nav-btn" data-testid="home-nav-sleep" @click.stop="navTo('health', 'sleep')">前往 →</button>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-sleep">{{ sleepStats.value }}</div>
                  <div class="stat-sub" data-testid="home-stats-sub-sleep">{{ sleepStats.sub }}</div>
                </div>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('weight')" card-id="weight" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-weight" @click="navTo('health', 'weight')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="weight" :size="16" /></span>
                    <span class="stat-label">体重</span>
                    <button class="nav-btn" data-testid="home-nav-weight" @click.stop="navTo('health', 'weight')">前往 →</button>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-weight">{{ weightStats.value }}</div>
                  <div class="stat-sub" data-testid="home-stats-sub-weight">{{ weightStats.sub }}</div>
                </div>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('ledger')" card-id="ledger" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-ledger" @click="navTo('ledger')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="ledger" :size="16" /></span>
                    <span class="stat-label">记账</span>
                    <button class="nav-btn" data-testid="home-nav-ledger" @click.stop="navTo('ledger')">前往 →</button>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-ledger">{{ ledgerStats.value }}</div>
                  <div class="stat-sub" data-testid="home-stats-sub-ledger">{{ ledgerStats.sub }}</div>
                </div>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('habits')" card-id="habits" :default-w="1">
                <div class="bento-card bento-stat bento-stat-habits" data-testid="home-stats-habits" @click="navTo('habit-week')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="habits" :size="16" /></span>
                    <span class="stat-label">习惯打卡</span>
                    <button class="nav-btn" data-testid="home-nav-habits" @click.stop="navTo('habit-week')">前往 →</button>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-habits">{{ habitStats.metCount }}/{{ habitStats.total }}</div>
                  <div class="stat-sub" data-testid="home-stats-sub-habits">本周打卡 {{ habitStats.weekCheckins }} 次</div>

                  <!-- 悬停展开：每个习惯的本周进度 -->
                  <div class="habit-detail" data-testid="home-habit-detail">
                    <div
                      v-for="h in habitDetails"
                      :key="h.id"
                      class="habit-detail-row"
                      :data-testid="`home-habit-row-${h.id}`"
                    >
                      <div class="habit-detail-top">
                        <span class="habit-detail-name">{{ h.name }}</span>
                        <span class="habit-detail-count" :class="{ met: h.met }">
                          {{ h.completed }}/{{ h.target }}
                          <Icon v-if="h.met" name="check" :size="12" class="habit-detail-check" />
                        </span>
                      </div>
                      <div class="habit-detail-bar">
                        <div
                          class="habit-detail-fill"
                          :style="{ width: h.percent + '%', background: h.color }"
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </HomeLayoutCard>
            </div>
            <div v-else class="home-empty" data-testid="home-overview-empty">暂无统计数据，去各功能面板添加数据吧</div>
          </div>

          <!-- 第 3 屏：工具（未完成待办 + 日历锚点） -->
          <div class="home-slide" data-testid="home-slide-tools">
            <div class="home-slide-tools-grid" data-testid="home-tools-grid">
              <!-- 未完成待办 -->
              <HomeLayoutCard v-if="menuOn.todos" card-id="pending-todos" :default-w="1">
                <section class="bento-card bento-panel">
                  <div class="panel-header">
                    <h3><span class="panel-icon"><Icon name="todos" /></span>未完成待办</h3>
                    <button class="nav-btn" data-testid="home-nav-todos" @click.stop="navTo('todos')">前往 →</button>
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
              </HomeLayoutCard>

              <!-- 日历锚点卡（发薪/纪念日倒计时） -->
              <HomeLayoutCard card-id="calendar-anchor" :default-w="1">
                <CalendarAnchorCard class="bento-anchor" />
              </HomeLayoutCard>
            </div>
            <!-- 所有工具卡片均隐藏时的兜底空态 -->
            <div
              v-if="!menuOn.todos"
              class="home-empty"
              data-testid="home-tools-empty"
            >功能已关闭，可在设置中开启</div>
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

.home-slide-grid-stats {
  grid-template-columns: repeat(5, minmax(0, 1fr));
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
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
}

.bento-card:hover {
  border-color: var(--color-primary, var(--color-primary));
}

/* 统计卡瘦身：padding 覆盖（12px 14px），不改共享 .bento-card 的 16px */
.bento-stat {
  padding: 12px 14px;
  cursor: pointer;
  user-select: none;
}

.bento-stat:active {
  transform: scale(0.98);
}

/* ===== 问候条 ===== */
.bento-greeting {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #3b82f6) 8%, transparent), transparent),
    var(--color-bg-card, var(--color-bg-card));
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
  color: var(--color-text, var(--color-text));
}

.greeting-sub {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
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
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.greeting-date {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
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
  color: var(--color-text-secondary, var(--color-text-secondary));
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
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-sm, 8px);
  color: var(--color-text, var(--color-text));
  outline: none;
  transition: border-color var(--transition-fast, 0.15s ease);
}

.quick-add-input:focus {
  border-color: var(--color-primary, var(--color-primary));
}

.quick-add-input::placeholder {
  color: var(--color-text-muted, var(--color-text-muted));
}

.quick-add-btn {
  flex-shrink: 0;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  border-radius: var(--radius-sm, 8px);
  background: var(--color-primary, var(--color-primary));
  border: 1px solid var(--color-primary, var(--color-primary));
  color: #fff;
  cursor: pointer;
  transition: filter var(--transition-fast, 0.15s ease);
}

.quick-add-btn:hover {
  filter: brightness(1.1);
}

/* ===== 工具页网格布局 ===== */
.home-slide-tools-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 12px;
  height: 100%;
  box-sizing: border-box;
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
  color: var(--color-text-secondary, var(--color-text-secondary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-btn {
  flex-shrink: 0;
  padding: 3px 8px;
  font-size: 12px;
  border-radius: var(--radius-full, 999px);
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  color: var(--color-primary, var(--color-primary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.nav-btn:hover {
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
  color: #fff;
}

.stat-value {
  min-width: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-sub {
  min-width: 0;
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== 习惯卡悬停展开（逐条本周进度浮层）===== */
.bento-stat-habits {
  position: relative;
}

.habit-detail {
  position: absolute;
  top: calc(100% - 4px);
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-primary, var(--color-primary));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 6px 18px rgba(0, 0, 0, 0.18));
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: opacity var(--transition-fast, 0.15s ease), transform var(--transition-fast, 0.15s ease), visibility 0s linear 0.15s;
  max-height: 260px;
  overflow-y: auto;
  pointer-events: none;
}

.bento-stat-habits:hover .habit-detail,
.bento-stat-habits:focus-within .habit-detail {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  transition: opacity var(--transition-fast, 0.15s ease), transform var(--transition-fast, 0.15s ease), visibility 0s;
  pointer-events: auto;
}

.habit-detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.habit-detail-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.habit-detail-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.habit-detail-count {
  flex-shrink: 0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary, var(--color-text-secondary));
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.habit-detail-count.met {
  color: var(--color-success, var(--color-success));
  font-weight: 600;
}

.habit-detail-check {
  color: var(--color-success, var(--color-success));
}

.habit-detail-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--color-border, var(--color-border));
  overflow: hidden;
}

.habit-detail-fill {
  height: 100%;
  border-radius: 999px;
  transition: width var(--transition-fast, 0.15s ease);
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
  stroke: var(--color-border, var(--color-border));
  stroke-width: 3;
}

.ring-bar {
  stroke: var(--color-primary, var(--color-primary));
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
  color: var(--color-text-secondary, var(--color-text-secondary));
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
  color: var(--color-text, var(--color-text));
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
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-sm, 8px);
  transition: border-color var(--transition-fast, 0.15s ease);
}

.home-list-item:hover {
  border-color: var(--color-primary, var(--color-primary));
}

.home-list-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text, var(--color-text));
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
  color: var(--color-success, var(--color-success));
}

.cd-urgent {
  color: var(--color-warning, var(--color-warning));
}

.cd-critical {
  color: var(--color-error, var(--color-error));
}

/* ===== 截止日期 ===== */
.due {
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.due.overdue {
  color: var(--color-error, #ef4444);
  font-weight: 600;
}

/* ===== 空态 ===== */
.home-empty {
  text-align: center;
  color: var(--color-text-muted, var(--color-text-muted));
  font-size: 13px;
  padding: 24px 12px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px dashed var(--color-border, var(--color-border));
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
  border: 1px solid var(--color-border, var(--color-border));
  background: var(--color-bg-card, var(--color-bg-card));
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.home-carousel-arrow:hover {
  color: #fff;
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
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
  background: var(--color-border, var(--color-border));
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s ease);
}

.home-carousel-dot.active {
  width: 22px;
  border-radius: 999px;
  background: var(--color-primary, var(--color-primary));
}

/* ===== 暗色模式覆盖 ===== */
:root.dark .bento-card {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

:root.dark .bento-greeting {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #3b82f6) 12%, transparent), transparent),
    var(--color-bg-card, #1f2937);
}

:root.dark .greeting-title,
:root.dark .stat-value,
:root.dark .panel-header h3,
:root.dark .home-list-title {
  color: var(--color-text, #f9fafb);
}

:root.dark .greeting-time {
  color: #60a5fa;
}

:root.dark .greeting-sub,
:root.dark .stat-label,
:root.dark .stat-sub,
:root.dark .ring-text {
  color: var(--color-text-secondary, #d1d5db);
}

:root.dark .home-list-item {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}

:root.dark .quick-add-input {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
  color: var(--color-text, #f9fafb);
}

:root.dark .nav-btn {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

:root.dark .nav-btn:hover {
  background-color: var(--color-primary, #3b82f6);
  color: #fff;
}

:root.dark .home-empty {
  background-color: var(--color-bg-card, #1f2937);
}

:root.dark .habit-detail {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
}

:root.dark .habit-detail-name {
  color: var(--color-text, #f9fafb);
}

:root.dark .habit-detail-bar {
  background-color: #374151;
}

:root.dark .home-carousel-arrow {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

:root.dark .home-carousel-dot {
  background-color: var(--color-border, #4b5563);
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

  .home-slide-grid-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .home-slide-grid,
  .home-slide-grid-stats {
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

