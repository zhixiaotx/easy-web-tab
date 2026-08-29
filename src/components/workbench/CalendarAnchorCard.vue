<script setup lang="ts">
// 日历锚点卡（T16）：发薪日 + category='life' 生日/纪念日 倒计时，最多 3 个锚点。
// 日期推算唯一来源：发薪日走 ledgerCore.nextPayday、纪念日走 countdownCore.calcRemaining（内部已复用
// calcNextOccurrence）——组件禁止内联推算公式；不展示任何金额数值（遵守记账掩码精神）。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useWorkbenchLedgerStore } from '@/stores/workbenchLedger'
import { useCountdownsStore } from '@/stores/countdowns'
import { nextPayday } from '@/composables/ledgerCore'
import { calcRemaining } from '@/composables/countdownCore'
import { localToday } from '@/composables/todoCore'
import Icon from '@/components/Icon.vue'

const ledgerStore = useWorkbenchLedgerStore()
const countdownsStore = useCountdownsStore()

// ===== 每日零点刷新 =====
// 今天 = 本地日期 YYYY-MM-DD（不能用 toISOString，那是 UTC 会偏一天）；跨天由零点定时器 + visibilitychange 刷新
const today = ref(localToday())
let midnightTimer = 0

function refreshToday(): void {
  today.value = localToday()
}

/** 下一个本地零点（+1s 余量）后刷新并重新调度。 */
function scheduleMidnightRefresh(): void {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
  midnightTimer = window.setTimeout(() => {
    refreshToday()
    scheduleMidnightRefresh()
  }, next.getTime() - now.getTime())
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') refreshToday()
}

onMounted(() => {
  void ledgerStore.loadLedger()
  void countdownsStore.loadCountdowns()
  scheduleMidnightRefresh()
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  window.clearTimeout(midnightTimer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

// ===== 锚点推导 =====
interface AnchorRow {
  key: string
  icon: string
  name: string
  days: number
}

/** 距目标日期（YYYY-MM-DD）的天数差：仅展示用，日期推算已由 core 完成。 */
function daysUntil(dateStr: string): number {
  return Math.round((new Date(dateStr + 'T00:00:00').getTime() - new Date(today.value + 'T00:00:00').getTime()) / 86400000)
}

// 发薪锚点：entries 中 salary → ledgerCore.nextPayday（无 salary 记录 → null，显示引导文案）
const payday = computed(() => nextPayday(ledgerStore.entries, today.value))

const paydayRow = computed<AnchorRow | null>(() => {
  const date = payday.value
  if (date === null) return null
  return { key: 'payday', icon: 'timer', name: '发工资', days: daysUntil(date) }
})

// category='life' 的生日/纪念日：calcRemaining 复用（一次性已过期 → isExpired 跳过），
// 按剩余天数升序（最近优先），与发薪锚点合计最多 3 个
const countdownRows = computed<AnchorRow[]>(() =>
  countdownsStore.countdowns
    .filter(c => c.category === 'life')
    .map(c => ({ c, remaining: calcRemaining(c.endDateTime, c.repeat) }))
    .filter(x => !x.remaining.isExpired)
    .sort((a, b) => a.remaining.days - b.remaining.days)
    .slice(0, payday.value === null ? 3 : 2)
    .map(x => ({ key: `countdown-${x.c.id}`, icon: 'cake', name: x.c.name, days: x.remaining.days }))
)

const anchors = computed<AnchorRow[]>(() => {
  const rows: AnchorRow[] = []
  if (paydayRow.value) rows.push(paydayRow.value)
  rows.push(...countdownRows.value)
  return rows.slice(0, 3)
})
</script>

<template>
  <section class="anchor-card" data-testid="ac-card">
    <div class="anchor-header">
      <h3><span class="anchor-title-icon"><Icon name="calendar" /></span>日历锚点</h3>
    </div>
    <ul v-if="anchors.length > 0" class="anchor-list">
      <li v-for="a in anchors" :key="a.key" class="anchor-row" :data-testid="`ac-anchor-${a.key}`">
        <span class="anchor-icon"><Icon :name="a.icon" /></span>
        <span class="anchor-text">
          距{{ a.name }}<template v-if="a.days > 0">还有 {{ a.days }} 天</template><template v-else>就是今天</template>
        </span>
      </li>
    </ul>
    <p v-if="payday === null" class="anchor-guide" data-testid="ac-guide">在记账添加工资记录后显示发薪倒计时</p>
  </section>
</template>

<style scoped>
.anchor-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.anchor-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
}

.anchor-title-icon {
  margin-right: 4px;
}

.anchor-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.anchor-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--color-text, var(--color-text));
}

.anchor-icon {
  flex-shrink: 0;
  font-size: 16px;
  line-height: 1;
}

.anchor-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.anchor-guide {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}
</style>
