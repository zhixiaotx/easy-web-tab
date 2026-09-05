<script setup lang="ts">
// 习惯打卡 · 周历（独立页）：周一~周日 × 每个习惯一行，可切换上/本周，格内直接补打卡/取消。
// 数据来自 useHomeStats.habitWeekOf(anchor)（按周一锚定），补打卡走 habitsStore.toggleCheckIn。
import { computed, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import { useWorkbenchHabitsStore } from '@/stores/workbenchHabits'
import { useHomeStats, shiftDate } from '@/composables/useHomeStats'

const habitsStore = useWorkbenchHabitsStore()
const { habitWeekOf, localToday } = useHomeStats()

const today = localToday()
const weekAnchor = ref(today)
const weekView = computed(() => habitWeekOf(weekAnchor.value))

function changeWeek(delta: number): void {
  weekAnchor.value = shiftDate(weekAnchor.value, delta * 7)
}

function toggleHabit(habitId: string, date: string): void {
  if (date > today) return // 未来日期不可打卡
  habitsStore.toggleCheckIn(habitId, date)
}
</script>

<template>
  <div class="habit-week-page">
    <header class="hw-page-head">
      <div class="hw-page-title">
        <span class="hw-page-icon"><Icon name="habits" :size="20" /></span>
        <div>
          <h2>习惯打卡 · 周历</h2>
          <p class="hw-page-sub">按周统计（周一 ~ 周日），点击格子可补打卡 / 取消</p>
        </div>
      </div>
      <div class="week-nav">
        <el-button class="week-nav-btn" data-testid="hw-week-prev" @click="changeWeek(-1)" size="small">‹ 上周</el-button>
        <span class="week-nav-range">{{ weekView.rangeText }}</span>
        <el-button
          class="week-nav-btn"
          data-testid="hw-week-next"
          :disabled="weekView.isCurrentWeek"
          @click="changeWeek(1)"
          size="small"
        >下周 ›</el-button>
      </div>
    </header>

    <div v-if="weekView.rows.length" class="week-grid" data-testid="hw-week-grid">
      <div class="week-corner"></div>
      <div
        v-for="d in weekView.days"
        :key="d.date"
        class="week-col-head"
        :class="{ today: d.isToday, future: d.isFuture }"
      >
        <span class="week-col-label">{{ d.label }}</span>
        <span class="week-col-day">{{ d.dayNum }}</span>
      </div>

      <template v-for="row in weekView.rows" :key="row.id">
        <div class="week-row-head" :style="{ color: row.color }">
          <span class="week-row-name">{{ row.name }}</span>
          <span class="week-row-count" :class="{ met: row.met }">{{ row.completed }}/{{ row.target }}</span>
        </div>
        <button
          v-for="c in row.cells"
          :key="c.date"
          type="button"
          class="week-cell"
          :class="{ done: c.done, future: c.date > today }"
          :disabled="c.date > today"
          :title="`${row.name} ${c.date} ${c.done ? '已打卡' : '未打卡'}`"
          @click="toggleHabit(row.id, c.date)"
        >{{ c.done ? '✓' : '' }}</button>
      </template>
    </div>

    <div v-else class="hw-empty" data-testid="hw-empty">
      <Icon name="habits" :size="32" />
      <p>暂无习惯，去「习惯打卡」面板添加后这里会按周显示打卡情况</p>
    </div>
  </div>
</template>

<style scoped>
.habit-week-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
}

.hw-page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.hw-page-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.hw-page-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, #3b82f6);
  flex-shrink: 0;
}

.hw-page-title h2 {
  margin: 0;
  font-size: var(--font-size-2xl, 20px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text, #1e293b);
}

.hw-page-sub {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
}

/* ===== 周导航 ===== */
.week-nav {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.week-nav-btn {
  padding: 6px 14px;
  font-size: 13px;
  border-radius: var(--radius-full, 999px);
}

.week-nav-range {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ===== 周历网格 ===== */
.week-grid {
  display: grid;
  grid-template-columns: minmax(120px, 200px) repeat(7, 1fr);
  gap: 6px;
  align-items: stretch;
}

.week-corner {
  /* 左上角留空 */
}

.week-col-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 0;
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.week-col-head .week-col-label {
  font-weight: 600;
}

.week-col-head .week-col-day {
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
}

.week-col-head.today {
  color: var(--color-primary, #3b82f6);
}

.week-col-head.today .week-col-day {
  color: var(--color-primary, #3b82f6);
}

.week-col-head.future {
  opacity: 0.5;
}

.week-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  padding-right: 10px;
  overflow: hidden;
}

.week-row-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.week-row-count {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
}

.week-row-count.met {
  color: var(--color-success, #16a34a);
}

.week-cell {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 8px);
  background: var(--color-bg-card, #ffffff);
  color: var(--color-text, #1e293b);
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.week-cell:hover:not(:disabled) {
  border-color: var(--color-primary, #3b82f6);
}

.week-cell.done {
  background: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
  color: #fff;
  font-weight: 700;
}

.week-cell.future {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ===== 空状态 ===== */
.hw-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
  color: var(--color-text-secondary, #64748b);
  text-align: center;
}

.hw-empty p {
  margin: 0;
  font-size: 14px;
  max-width: 360px;
}

/* ===== 暗色模式覆盖 ===== */
html.dark .hw-page-title h2 {
  color: var(--color-text, #f9fafb);
}

html.dark .hw-page-icon {
  background-color: #1e3a5f;
  color: #60a5fa;
}

html.dark .week-nav-range {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .week-col-head {
  border-bottom-color: #374151;
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .week-col-head .week-col-day {
  color: var(--color-text-muted, #9ca3af);
}

html.dark .week-row-head {
  color: var(--color-text, #f9fafb);
}

html.dark .week-cell {
  background-color: var(--color-bg-card, #1f2937);
  border-color: #374151;
  color: var(--color-text, #f9fafb);
}

html.dark .hw-empty {
  color: var(--color-text-secondary, #d1d5db);
}
</style>
