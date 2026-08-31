<script setup lang="ts">
// 学生工作台首页：问候条 + 三屏轮播骨架（行动台/数据概览/工具栏）
// 复刻 WorkbenchHome.vue 轮播机制：6s 自动轮播 + hover 暂停 + 箭头/圆点切换 + 移动端 swipe
// M1 仅骨架：行动台/概览/工具栏的具体卡片数据待 M2-M4 接入对应 store 后填充

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useStudentSettingsStore } from '@/stores/studentSettings'
import { useStudentHomeworkStore } from '@/stores/studentHomework'
import { useStudentReviewStore } from '@/stores/studentReview'
import { useStudentReadingStore } from '@/stores/studentReading'
import { useStudentHabitsStore } from '@/stores/studentHabits'
import { useStudentRewardsStore } from '@/stores/studentRewards'
import { calcAge } from '@/composables/studentStageCore'
import Icon from '@/components/Icon.vue'

const emit = defineEmits<{
  (e: 'navigate', section: string): void
}>()

const store = useStudentSettingsStore()

// 时间问候
const now = ref(new Date())
let nowTimer = 0
const greeting = computed(() => {
  const h = now.value.getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

// 三屏轮播骨架
const SLIDE_COUNT = 3
const AUTOPLAY_MS = 6000
const slideIndex = ref(0)
const carouselPaused = ref(false)
let carouselTimer = 0

function startAutoplay() {
  stopAutoplay()
  if (carouselPaused.value) return
  carouselTimer = window.setInterval(() => goToSlide(slideIndex.value + 1), AUTOPLAY_MS)
}
function stopAutoplay() {
  if (carouselTimer) {
    clearInterval(carouselTimer)
    carouselTimer = 0
  }
}
function goToSlide(index: number) {
  slideIndex.value = ((index % SLIDE_COUNT) + SLIDE_COUNT) % SLIDE_COUNT
  startAutoplay()
}
function nextSlide() { goToSlide(slideIndex.value + 1) }
function prevSlide() { goToSlide(slideIndex.value - 1) }
function pauseCarousel() { carouselPaused.value = true; stopAutoplay() }
function resumeCarousel() { carouselPaused.value = false; startAutoplay() }

// 触摸手势
const SWIPE_THRESHOLD = 50
let touchStartX = 0
function onTouchStart(e: TouchEvent) { touchStartX = e.touches[0].clientX }
function onTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0].clientX - touchStartX
  if (Math.abs(dx) < SWIPE_THRESHOLD) return
  if (dx > 0) prevSlide()
  else nextSlide()
}

// 加载所有学生 store 数据（主页需要聚合统计）
onMounted(async () => {
  nowTimer = window.setInterval(() => { now.value = new Date() }, 30000)
  startAutoplay()
  await Promise.all([
    hwStore.loadHomework(),
    reviewStore.loadReview(),
    readingStore.loadReading(),
    habitsStore.loadHabits(),
    rewardsStore.loadRewards()
  ])
})
onUnmounted(() => {
  if (nowTimer) clearInterval(nowTimer)
  stopAutoplay()
})

// 学段徽标 + 昵称
const stageBadge = computed(() => store.stageBadgeInfo)
const stageLabel = computed(() => store.stageLabelName)
const displayName = computed(() => store.displayName)
const age = computed(() => calcAge(store.settings.birthday))

// 各模块 store 实例
const hwStore = useStudentHomeworkStore()
const reviewStore = useStudentReviewStore()
const readingStore = useStudentReadingStore()
const habitsStore = useStudentHabitsStore()
const rewardsStore = useStudentRewardsStore()

// 本地日期
function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

// 行动台：今日待办 = 未完成作业数；待复习 = 今日到期复习数
const todayTodoCount = computed(() => {
  const pending = hwStore.entries.filter(e => e.status === 'pending' || e.status === 'doing' || e.status === 'overdue')
  return pending.length
})
const todayReviewCount = computed(() => {
  const s = reviewStore.stats()
  return s.dueToday + s.overdue
})

// 今日阅读时长
const todayReadingMin = computed(() => {
  const today = localToday()
  return readingStore.entries
    .filter(e => e.date === today)
    .reduce((sum, e) => sum + (e.durationMin || 0), 0)
})

// 习惯打卡：今日已打卡数 / 总习惯数
const todayHabitDone = computed(() => {
  const today = localToday()
  return habitsStore.records.filter(r => r.date === today).length
})
const todayHabitTotal = computed(() => habitsStore.habits.length)

// 奖励积分
const rewardPoints = computed(() => rewardsStore.totalPoints())

// 数据概览统计卡
const overviewCards = computed(() => [
  { label: '待办作业', value: todayTodoCount.value + ' 项', icon: 'todos' },
  { label: '待复习', value: todayReviewCount.value + ' 项', icon: 'diary' },
  { label: '今日阅读', value: todayReadingMin.value + ' 分钟', icon: 'notes' },
  { label: '习惯打卡', value: todayHabitDone.value + '/' + todayHabitTotal.value, icon: 'habits' },
  { label: '积分余额', value: rewardPoints.value + ' 分', icon: 'countdowns' },
  { label: '复习掌握', value: reviewStore.stats().masteryRate + '%', icon: 'pomodoro' }
])

// 工具栏快捷入口
const toolEntries = [
  { key: 'pomodoro', label: '番茄钟', icon: 'pomodoro' },
  { key: 'timetable', label: '课程表', icon: 'countdowns' },
  { key: 'achievements', label: '勋章墙', icon: 'habits' }
]

function onToolClick(key: string) {
  emit('navigate', key)
}

function onActionClick(section: string) {
  emit('navigate', section)
}
</script>

<template>
  <div class="student-home">
    <!-- 问候条（全宽静态卡，不进轮播） -->
    <div class="greeting-card">
      <div class="greeting-left">
        <span class="greeting-text">{{ greeting }}，{{ displayName }}！<span v-if="age !== null" class="greeting-age">{{ age }} 岁</span></span>
        <span class="greeting-sub">今日待办 {{ todayTodoCount }} 项 · 待复习 {{ todayReviewCount }} 项</span>
      </div>
      <div class="greeting-right">
        <span
          class="greeting-stage"
          :style="{ backgroundColor: stageBadge.color }"
          :title="`当前学段：${stageLabel}`"
        >{{ stageBadge.label }}</span>
      </div>
    </div>

    <!-- 轮播区 -->
    <div
      class="carousel"
      @mouseenter="pauseCarousel"
      @mouseleave="resumeCarousel"
      @touchstart="onTouchStart"
      @touchend="onTouchEnd"
    >
      <div class="carousel-track" :style="{ transform: `translateX(-${slideIndex * 100}%)` }">
        <!-- 屏 1：行动台 -->
        <section class="slide slide-action" data-testid="student-slide-action">
          <h3 class="slide-title">行动台</h3>
          <div class="action-grid">
            <button class="action-card" @click="onActionClick('homework')">
              <span class="action-icon"><Icon name="todos" /></span>
              <span class="action-label">待办作业</span>
              <span class="action-count">{{ todayTodoCount }} 项</span>
              <span class="action-cta">去完成</span>
            </button>
            <button class="action-card" @click="onActionClick('review')">
              <span class="action-icon"><Icon name="diary" /></span>
              <span class="action-label">待复习</span>
              <span class="action-count">{{ todayReviewCount }} 项</span>
              <span class="action-cta">去复习</span>
            </button>
            <button class="action-card" @click="onActionClick('reading')">
              <span class="action-icon"><Icon name="notes" /></span>
              <span class="action-label">今日阅读</span>
              <span class="action-count">{{ todayReadingMin }} 分钟</span>
              <span class="action-cta">去记录</span>
            </button>
          </div>
        </section>

        <!-- 屏 2：数据概览 -->
        <section class="slide slide-overview" data-testid="student-slide-overview">
          <h3 class="slide-title">数据概览</h3>
          <div class="overview-grid">
            <div v-for="card in overviewCards" :key="card.label" class="overview-card">
              <span class="overview-icon"><Icon :name="card.icon" /></span>
              <span class="overview-value">{{ card.value }}</span>
              <span class="overview-label">{{ card.label }}</span>
            </div>
          </div>
        </section>

        <!-- 屏 3：工具栏 -->
        <section class="slide slide-tools" data-testid="student-slide-tools">
          <h3 class="slide-title">工具栏</h3>
          <div class="tools-grid">
            <button
              v-for="tool in toolEntries"
              :key="tool.key"
              class="tool-card"
              @click="onToolClick(tool.key)"
            >
              <span class="tool-icon"><Icon :name="tool.icon" /></span>
              <span class="tool-label">{{ tool.label }}</span>
            </button>
          </div>
        </section>
      </div>

      <!-- 翻页箭头 + 圆点 -->
      <div class="carousel-bar">
        <button class="carousel-arrow" data-testid="student-carousel-prev" @click="prevSlide">‹</button>
        <div class="carousel-dots">
          <button
            v-for="i in SLIDE_COUNT"
            :key="i"
            class="carousel-dot"
            :class="{ active: slideIndex === i - 1 }"
            @click="goToSlide(i - 1)"
          />
        </div>
        <button class="carousel-arrow" data-testid="student-carousel-next" @click="nextSlide">›</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.student-home {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow: hidden;
}

.greeting-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: var(--color-surface, #ffffff);
  border-radius: 12px;
  border: 1px solid var(--color-border, #e5e7eb);
}
.greeting-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.greeting-text {
  font-size: 18px;
  font-weight: 600;
}
.greeting-sub {
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
}
.greeting-stage {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
}

.carousel {
  flex: 1;
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e5e7eb);
  min-height: 0;
}
.carousel-track {
  display: flex;
  height: 100%;
  transition: transform 0.4s ease;
}
.slide {
  flex: 0 0 100%;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}
.slide-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
}
.action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background 0.15s;
}
.action-card:hover {
  background: var(--color-hover, #f3f4f6);
}
.action-icon {
  font-size: 24px;
}
.action-label {
  font-size: 14px;
  font-weight: 500;
}
.action-count {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}
.action-cta {
  margin-top: 4px;
  padding: 4px 12px;
  border-radius: 16px;
  background: var(--color-primary, #3b82f6);
  color: #ffffff;
  font-size: 12px;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
  flex: 1;
}
.overview-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px 8px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  text-align: center;
}
.overview-icon {
  color: var(--color-primary, #3b82f6);
  display: flex;
  align-items: center;
  justify-content: center;
}
.overview-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text, #111827);
}
.overview-label {
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
}
.tool-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background 0.15s;
}
.tool-card:hover {
  background: var(--color-hover, #f3f4f6);
}
.tool-icon {
  font-size: 28px;
}
.tool-label {
  font-size: 14px;
}

.carousel-bar {
  position: absolute;
  bottom: 12px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
}
.carousel-arrow {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-surface, #ffffff);
  color: inherit;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}
.carousel-arrow:hover {
  background: var(--color-hover, #f3f4f6);
}
.carousel-dots {
  display: flex;
  gap: 6px;
}
.carousel-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: none;
  background: var(--color-border-strong, #d1d5db);
  cursor: pointer;
  transition: background 0.15s;
}
.carousel-dot.active {
  background: var(--color-primary, #3b82f6);
}

@media (max-width: 768px) {
  .action-grid,
  .tools-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.greeting-age {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-primary, #3b82f6);
  margin-left: 6px;
}
</style>
