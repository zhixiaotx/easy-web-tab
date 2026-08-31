<script setup lang="ts">
// 学生工作台成就勋章墙面板（M3 批次2）
// 布局：标题 + 统计 + 分类 tabs + 5 列勋章网格 + 详情弹框
// 数据：useStudentAchievementsStore（独立 IDB store 'student_achievements'，单对象 {definitions, unlocked}）
// 解锁由各 store 数据聚合触发（onMounted 时加载 habits/homework/reading/pomodoro → recomputeUnlocks）
// 行高 140px（M3 估值，待 row-heights.json 实测后校准）
// 内置 10 枚勋章定义不可编辑、不可手动撤销；家长手动发放特殊勋章走 manualUnlock（M3 桩）

import { computed, onMounted, ref } from 'vue'
import { useStudentAchievementsStore } from '@/stores/studentAchievements'
import { useStudentHabitsStore } from '@/stores/studentHabits'
import { useStudentHomeworkStore } from '@/stores/studentHomework'
import { useStudentReadingStore } from '@/stores/studentReading'
import { useStudentPomodoroStore } from '@/stores/studentPomodoro'
import { useToast } from '@/composables/useToast'
import {
  calcMaxStreak,
  calcTotalReadingEntries,
  calcTotalPomoSessions,
  calcHwCompletionRate,
  calcHwTotal,
  type AchievementMetrics
} from '@/composables/studentAchievementCore'
import type { StudentAchievementCategory, StudentAchievementDef } from '@/types'
import { localToday } from '@/composables/todoCore'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from '@/components/workbench/PanelPager.vue'
import Icon from '@/components/Icon.vue'

const store = useStudentAchievementsStore()
const habitsStore = useStudentHabitsStore()
const homeworkStore = useStudentHomeworkStore()
const readingStore = useStudentReadingStore()
const pomodoroStore = useStudentPomodoroStore()
const toast = useToast()

const today = localToday()

// 分类 tabs
const CATEGORY_TABS: { key: 'all' | StudentAchievementCategory; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'habit', label: '习惯' },
  { key: 'study', label: '学习' },
  { key: 'reading', label: '阅读' },
  { key: 'pomodoro', label: '专注' }
]
const activeCategory = ref<'all' | StudentAchievementCategory>('all')

// 跨 store 指标聚合（薄委托 core 纯函数）
const metrics = computed<AchievementMetrics>(() => ({
  'max-streak': calcMaxStreak(habitsStore.habits, habitsStore.records, today),
  'reading-count': calcTotalReadingEntries(readingStore.entries),
  'pomo-count': calcTotalPomoSessions(pomodoroStore.data.records),
  'hw-rate': calcHwCompletionRate(homeworkStore.entries),
  'hw-total': calcHwTotal(homeworkStore.entries)
}))

// 视图数据：按分类筛选
const viewDefs = computed<StudentAchievementDef[]>(() => store.filterByCategory(activeCategory.value))

// 自适应分页（5 列网格，行高 109px，row-heights.json achievements MAX 107 + 2）
const mainEl = ref<HTMLElement | null>(null)
const gridEl = ref<HTMLElement | null>(null)
const paging = usePanelPaging({
  items: () => viewDefs.value,
  rowHeight: 109,
  containerRef: mainEl,
  gridRef: gridEl
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev } = paging

// 统计卡数据（薄委托 core）
const stats = computed(() => store.stats())

// 详情弹框
const showDetailDialog = ref(false)
const detailDef = ref<StudentAchievementDef | null>(null)

function openDetail(def: StudentAchievementDef): void {
  detailDef.value = def
  showDetailDialog.value = true
}

function closeDetail(): void {
  showDetailDialog.value = false
  detailDef.value = null
}

// 单条进度百分比（薄委托 store.progressPercent → core.calcProgressPercent）
function progressOf(def: StudentAchievementDef): number {
  return store.progressPercent(def, metrics.value)
}

// 单条当前指标值（用于详情弹框显示「X / target」）
function metricCurrentOf(def: StudentAchievementDef): number {
  switch (def.metric) {
    case 'max-streak': return metrics.value['max-streak']
    case 'reading-count': return metrics.value['reading-count']
    case 'pomo-count': return metrics.value['pomo-count']
    case 'hw-rate': return metrics.value['hw-rate']
    default: return 0
  }
}

// 弹框内显示文案：已解锁 → 解锁时间；未解锁 → 如何解锁 + 进度
const detailUnlocked = computed(() => detailDef.value ? store.isUnlocked(detailDef.value.id) : false)
const detailUnlockTime = computed(() => detailDef.value ? store.unlockTimeText(detailDef.value.id) : '')
const detailProgress = computed(() => detailDef.value ? progressOf(detailDef.value) : 0)

onMounted(async () => {
  // 并行加载：成就定义 + 4 个指标来源 store
  await Promise.all([
    store.loadAchievements(),
    habitsStore.loadHabits(),
    homeworkStore.loadHomework(),
    readingStore.loadReading(),
    pomodoroStore.loadPomodoro()
  ])
  // 基于当前指标重算解锁（新达成的写入 IDB，幂等）
  const newlyUnlocked = await store.recomputeUnlocks(metrics.value)
  if (newlyUnlocked.length > 0) {
    // 取首条新解锁的勋章名展示 toast
    const firstName = store.definitions.find(d => d.id === newlyUnlocked[0])
    toast.success(`🎉 解锁勋章「${firstName?.name ?? ''}」！`)
  }
})
</script>

<template>
  <div class="sa-shell">
    <div class="sa-toolbar">
      <h2 class="sa-title">成就勋章墙</h2>
      <span class="sa-trophy" title="解锁进度">🏆</span>
    </div>

    <div class="sa-stats-row">
      <div class="sa-stat-card sa-stat-main">
        <span class="sa-stat-emoji">🏆</span>
        <span class="sa-stat-text">已解锁 <strong>{{ stats.unlocked }}</strong> / {{ stats.total }}</span>
      </div>
      <div class="sa-stat-card">
        <span class="sa-stat-label">完成率</span>
        <span class="sa-stat-value">{{ stats.rate }}%</span>
      </div>
      <div class="sa-stat-card">
        <span class="sa-stat-label">未解锁</span>
        <span class="sa-stat-value locked">{{ stats.locked }}</span>
      </div>
      <div v-if="stats.allUnlocked" class="sa-stat-card sa-stat-all">
        <span class="sa-stat-label">🎉 全部解锁！等待新勋章上线</span>
      </div>
    </div>

    <div class="sa-tabs">
      <button
        v-for="tab in CATEGORY_TABS"
        :key="tab.key"
        class="sa-tab"
        :class="{ active: activeCategory === tab.key }"
        :data-testid="`sa-cat-${tab.key}`"
        @click="activeCategory = tab.key"
      >{{ tab.label }}</button>
      <span class="sa-count">{{ viewDefs.length }} 枚</span>
    </div>

    <div ref="mainEl" class="sa-main">
      <div v-if="viewDefs.length === 0" class="empty-state" data-testid="sa-empty">
        <p>当前分类暂无勋章</p>
      </div>

      <div v-else ref="gridEl" class="sa-grid" :class="{ 'sa-grid-scroll': !fitsOnePage }">
        <button
          v-for="def in pageItems"
          :key="def.id"
          class="sa-badge-card"
          :class="{ unlocked: store.isUnlocked(def.id), locked: !store.isUnlocked(def.id) }"
          :data-testid="`sa-badge-${def.id}`"
          @click="openDetail(def)"
        >
          <div class="sa-badge-emoji">{{ def.emoji }}</div>
          <div class="sa-badge-name">{{ def.name }}</div>
          <div v-if="store.isUnlocked(def.id)" class="sa-badge-status unlocked">✅ 已解锁</div>
          <div v-else class="sa-badge-status locked">
            <span class="sa-badge-progress-text">{{ metricCurrentOf(def) }}/{{ def.target }}</span>
            <div class="sa-badge-progress-bar">
              <div class="sa-badge-progress-fill" :style="{ width: `${progressOf(def)}%` }"></div>
            </div>
          </div>
        </button>
      </div>
    </div>

    <PanelPager
      v-if="totalPages > 1"
      :page="currentPage"
      :total="totalPages"
      @prev="prev"
      @next="next"
    />

    <!-- 详情弹框 -->
    <div v-if="showDetailDialog && detailDef" class="sa-dialog-overlay" @click.self="closeDetail">
      <div class="sa-dialog" data-testid="sa-dialog">
        <div class="sa-dialog-head">
          <span class="sa-dialog-emoji">{{ detailDef.emoji }}</span>
          <h3 class="sa-dialog-name">{{ detailDef.name }}</h3>
          <button class="sa-dialog-close" @click="closeDetail" title="关闭">
            <Icon name="close" :size="18" />
          </button>
        </div>
        <div class="sa-dialog-body">
          <p class="sa-dialog-desc">{{ detailDef.description }}</p>

          <div v-if="detailUnlocked" class="sa-dialog-unlocked">
            <div class="sa-dialog-unlocked-badge">✅ 已解锁</div>
            <div class="sa-dialog-unlocked-time">解锁时间：{{ detailUnlockTime }}</div>
          </div>

          <div v-else class="sa-dialog-locked">
            <div class="sa-dialog-progress-row">
              <span class="sa-dialog-progress-label">进度</span>
              <span class="sa-dialog-progress-value">{{ metricCurrentOf(detailDef) }} / {{ detailDef.target }}</span>
            </div>
            <div class="sa-dialog-progress-bar">
              <div class="sa-dialog-progress-fill" :style="{ width: `${detailProgress}%` }"></div>
            </div>
            <div class="sa-dialog-progress-percent">{{ detailProgress }}%</div>
            <div class="sa-dialog-howto">
              <Icon name="countdowns" :size="14" />
              <span>{{ detailDef.description }}</span>
            </div>
          </div>

          <div class="sa-dialog-meta">
            <span class="sa-dialog-meta-item">分类：{{ store.categoryText(detailDef.category) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sa-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 10px;
}

.sa-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.sa-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}
.sa-trophy {
  font-size: 20px;
}

.sa-stats-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.sa-stat-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  padding: 6px 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.sa-stat-main {
  background: linear-gradient(135deg, #f59e0b, #f97316);
  color: #fff;
  border-color: transparent;
}
.sa-stat-emoji {
  font-size: 16px;
}
.sa-stat-text strong {
  font-size: 16px;
  font-weight: 700;
}
.sa-stat-label {
  font-size: 11px;
  color: var(--color-text-soft, #6b7280);
}
.sa-stat-value {
  font-size: 16px;
  font-weight: 600;
}
.sa-stat-value.locked {
  color: #9ca3af;
}
.sa-stat-all {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border-color: #10b981;
  font-weight: 600;
}

.sa-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.sa-tab {
  padding: 4px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  background: transparent;
  color: inherit;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}
.sa-tab.active {
  background: var(--color-primary, #3b82f6);
  color: #fff;
  border-color: var(--color-primary, #3b82f6);
}
.sa-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--color-text-soft, #6b7280);
}

.sa-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-soft, #6b7280);
  font-size: 14px;
}

.sa-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  overflow: hidden;
  align-content: start;
}
.sa-grid-scroll {
  overflow-y: auto;
}

.sa-badge-card {
  background: var(--color-surface, #fff);
  border: 2px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}
.sa-badge-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.sa-badge-card.unlocked {
  border-color: #f59e0b;
  background: linear-gradient(180deg, rgba(245, 158, 11, 0.08), var(--color-surface, #fff));
}
.sa-badge-card.locked {
  opacity: 0.75;
  filter: grayscale(0.4);
}

.sa-badge-emoji {
  font-size: 32px;
  line-height: 1;
}
.sa-badge-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  line-height: 1.3;
}
.sa-badge-status {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.sa-badge-status.unlocked {
  color: #f59e0b;
  font-size: 11px;
  font-weight: 600;
}
.sa-badge-status.locked {
  color: var(--color-text-soft, #6b7280);
}
.sa-badge-progress-text {
  font-size: 10px;
}
.sa-badge-progress-bar {
  width: 100%;
  height: 4px;
  background: var(--color-border, #e5e7eb);
  border-radius: 2px;
  overflow: hidden;
}
.sa-badge-progress-fill {
  height: 100%;
  background: #3b82f6;
  transition: width 0.3s;
}

/* 详情弹框 */
.sa-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.sa-dialog {
  width: 420px;
  max-width: calc(100vw - 32px);
  background: var(--color-surface, #fff);
  border-radius: 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sa-dialog-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.sa-dialog-emoji {
  font-size: 32px;
  line-height: 1;
}
.sa-dialog-name {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  flex: 1;
}
.sa-dialog-close {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 4px;
  opacity: 0.6;
  display: inline-flex;
}
.sa-dialog-close:hover {
  opacity: 1;
}
.sa-dialog-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sa-dialog-desc {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-soft, #6b7280);
  line-height: 1.6;
}

.sa-dialog-unlocked {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid #f59e0b;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sa-dialog-unlocked-badge {
  color: #f59e0b;
  font-size: 14px;
  font-weight: 600;
}
.sa-dialog-unlocked-time {
  font-size: 12px;
  color: var(--color-text-soft, #6b7280);
}

.sa-dialog-locked {
  background: rgba(59, 130, 246, 0.06);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sa-dialog-progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}
.sa-dialog-progress-label {
  color: var(--color-text-soft, #6b7280);
}
.sa-dialog-progress-value {
  font-weight: 600;
}
.sa-dialog-progress-bar {
  width: 100%;
  height: 8px;
  background: var(--color-border, #e5e7eb);
  border-radius: 4px;
  overflow: hidden;
}
.sa-dialog-progress-fill {
  height: 100%;
  background: #3b82f6;
  transition: width 0.3s;
}
.sa-dialog-progress-percent {
  font-size: 12px;
  color: var(--color-text-soft, #6b7280);
  text-align: right;
}
.sa-dialog-howto {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-soft, #6b7280);
  line-height: 1.5;
  padding-top: 4px;
  border-top: 1px dashed var(--color-border, #e5e7eb);
}

.sa-dialog-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--color-text-soft, #6b7280);
  padding-top: 4px;
  border-top: 1px dashed var(--color-border, #e5e7eb);
}

@media (max-width: 640px) {
  .sa-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
