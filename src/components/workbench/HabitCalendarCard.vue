<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkbenchHabitsStore } from '@/stores/workbenchHabits'
import { useToast } from '@/composables/useToast'
import { localToday } from '@/composables/todoCore'
import { DEFAULT_HABIT_COLOR } from '@/composables/habitCore'
import type { Habit } from '@/composables/habitCore'

const props = defineProps<{ habit: Habit }>()
const emit = defineEmits<{ edit: [id: string] }>()

const store = useWorkbenchHabitsStore()
const toast = useToast()

// 今天 = 本地日期 YYYY-MM-DD（防 UTC 偏移）
const today = localToday()

// 该习惯已打卡日期集合（响应式，打卡后自动重算）
const checkedSet = computed(
  () => new Set(store.records.filter(r => r.habitId === props.habit.id).map(r => r.date))
)

// 卡片头部信息：连续 / 本周达成（走 store 薄委托 → habitCore）
const streak = computed(() => store.streakOf(props.habit.id, props.habit.frequency, today))
const week = computed(() => store.weeklyAttainmentOf(props.habit.id, props.habit.frequency, today))

// ===== 月历视图状态（默认当月，可前后切换补卡/回看）=====
const now = new Date()
const viewYear = ref(now.getFullYear())
const viewMonth = ref(now.getMonth()) // 0-based

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const pad = (n: number) => String(n).padStart(2, '0')

const cells = computed<CalCell[]>(() => {
  const y = viewYear.value
  const m = viewMonth.value
  const startW = new Date(y, m, 1).getDay() // 0=周日
  const days = new Date(y, m + 1, 0).getDate()
  const total = Math.ceil((startW + days) / 7) * 7
  const out: CalCell[] = []
  for (let i = 0; i < total; i++) {
    const d = i - startW + 1
    if (d < 1 || d > days) {
      out.push({ blank: true })
      continue
    }
    const ds = `${y}-${pad(m + 1)}-${pad(d)}`
    out.push({
      dateStr: ds,
      dayNum: d,
      isChecked: checkedSet.value.has(ds),
      isToday: ds === today,
      isFuture: ds > today
    })
  }
  return out
})

interface CalCell {
  blank?: boolean
  dateStr?: string
  dayNum?: number
  isChecked?: boolean
  isToday?: boolean
  isFuture?: boolean
}

function prevMonth(): void {
  if (viewMonth.value === 0) {
    viewMonth.value = 11
    viewYear.value--
  } else {
    viewMonth.value--
  }
}

function nextMonth(): void {
  if (viewMonth.value === 11) {
    viewMonth.value = 0
    viewYear.value++
  } else {
    viewMonth.value++
  }
}

// 点日历某天 = 打卡 / 取消（仅今天与过去可点，未来置灰）
async function onDayClick(c: CalCell): Promise<void> {
  if (!c.dateStr || c.isFuture) return
  const res = await store.toggleCheckIn(props.habit.id, c.dateStr)
  if (!res.ok) toast.error('打卡失败，请重试')
}

// 点卡片其它区域（名称/信息/留白）= 打开编辑弹框（由父组件处理）
function onCardClick(): void {
  emit('edit', props.habit.id)
}
</script>

<template>
  <div
    class="hb-cal-card"
    :style="{ '--hb-color': habit.color ?? DEFAULT_HABIT_COLOR }"
    :data-testid="`hb-card-${habit.id}`"
    @click="onCardClick"
  >
    <!-- 头部：色点 + 名称/连续/本周 + 月份切换 -->
    <div class="hb-cal-head">
      <span class="hb-cal-dot"></span>
      <div class="hb-cal-title">
        <div class="hb-cal-name">{{ habit.name }}</div>
        <div class="hb-cal-sub">连续 {{ streak.count }}{{ streak.unit }} · 本周 {{ week.completed }}/{{ week.target }}</div>
      </div>
      <div class="hb-cal-nav" @click.stop>
        <button class="hb-cal-navbtn" type="button" aria-label="上个月" @click="prevMonth">‹</button>
        <span class="hb-cal-month">{{ viewYear }}年{{ viewMonth + 1 }}月</span>
        <button class="hb-cal-navbtn" type="button" aria-label="下个月" @click="nextMonth">›</button>
      </div>
    </div>

    <!-- 当月日历 -->
    <div class="hb-cal-grid">
      <div v-for="w in WEEK_LABELS" :key="w" class="hb-cal-wk">{{ w }}</div>
      <template v-for="(c, idx) in cells" :key="idx">
        <span v-if="c.blank" class="hb-cal-day blank"></span>
        <button
          v-else
          type="button"
          class="hb-cal-day"
          :class="{ checked: c.isChecked, today: c.isToday, future: c.isFuture }"
          :disabled="!!c.isFuture"
          :aria-label="c.dateStr ? (c.isChecked ? '取消打卡 ' + c.dateStr : '打卡 ' + c.dateStr) : ''"
          @click.stop="onDayClick(c)"
        >
          {{ c.dayNum }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* ===== 月历习惯卡片 ===== */
.hb-cal-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 12px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  cursor: pointer;
  transition: border-color var(--transition-fast, 0.15s ease), box-shadow var(--transition-fast, 0.15s ease);
}

.hb-cal-card:hover {
  border-color: var(--hb-color, var(--color-primary, var(--color-primary)));
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
}

/* 头部 */
.hb-cal-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hb-cal-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: var(--hb-color, var(--color-primary, var(--color-primary)));
  flex-shrink: 0;
}

.hb-cal-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hb-cal-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hb-cal-sub {
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

/* 月份切换 */
.hb-cal-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.hb-cal-navbtn {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-size: 16px;
  line-height: 1;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color var(--transition-fast, 0.15s ease), color var(--transition-fast, 0.15s ease);
}

.hb-cal-navbtn:hover {
  background: var(--color-bg-hover, var(--color-bg-input));
  color: var(--hb-color, var(--color-primary, var(--color-primary)));
}

.hb-cal-month {
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  min-width: 64px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* 日历网格 */
.hb-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.hb-cal-wk {
  text-align: center;
  font-size: 11px;
  color: var(--color-text-muted, var(--color-text-muted));
  padding: 2px 0;
}

.hb-cal-day {
  aspect-ratio: 1 / 1;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text, var(--color-text));
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background-color var(--transition-fast, 0.15s ease), color var(--transition-fast, 0.15s ease);
}

.hb-cal-day:hover:not(.blank):not(.checked):not(:disabled) {
  background: color-mix(in srgb, var(--hb-color, var(--color-primary)) 12%, transparent);
}

.hb-cal-day.checked {
  background: var(--hb-color, var(--color-primary, var(--color-primary)));
  color: #fff;
  font-weight: 600;
  border-color: var(--hb-color, var(--color-primary, var(--color-primary)));
}

.hb-cal-day.today {
  border-color: var(--hb-color, var(--color-primary, var(--color-primary)));
}

.hb-cal-day.future {
  color: var(--color-text-muted, var(--color-text-muted));
  cursor: not-allowed;
  opacity: 0.5;
}

.hb-cal-day.blank {
  visibility: hidden;
  cursor: default;
}

/* ===== 暗色模式 ===== */
html.dark .hb-cal-card {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .hb-cal-day:hover:not(.blank):not(.checked):not(:disabled) {
  background: color-mix(in srgb, var(--hb-color, #60a5fa) 18%, transparent);
}

html.dark .hb-cal-wk,
html.dark .hb-cal-sub,
html.dark .hb-cal-month {
  color: #9ca3af;
}

html.dark .hb-cal-day.future {
  color: #6b7280;
}
</style>
