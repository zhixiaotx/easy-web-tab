<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useCountdownsStore } from '@/stores/countdowns'
import { calcNextOccurrence, repeatLabel } from '@/composables/countdownCore'

/**
 * 健康面板「定时提醒」只读小模块（纯展示，无编辑/删除/跳转动作）。
 * 读取倒计时 store，按面板分类（exercise/diet/sleep）1:1 过滤，
 * 展示 名称 + 下次触发时间 + 重复规则，按下次触发时间升序排列。
 */
const props = defineProps<{ module: 'exercise' | 'diet' | 'sleep' }>()

const store = useCountdownsStore()

interface ReminderRow {
  id: string
  name: string
  nextTime: string
  repeatText: string
}

const reminders = computed<ReminderRow[]>(() => {
  const rows: ReminderRow[] = []
  for (const item of store.countdowns) {
    if (item.category !== props.module) continue
    // calcNextOccurrence 恒返回非空字符串（一次性/过期条目返回其 past endDateTime），
    // 这里仅作防御性兜底：空/未定义 → 显示「—」并排到最后
    const nextTime = calcNextOccurrence(item.endDateTime, item.repeat) || '—'
    rows.push({
      id: item.id,
      name: item.name,
      nextTime,
      repeatText: repeatLabel(item.repeat)
    })
  }
  rows.sort((a, b) => {
    const aHas = a.nextTime !== '' && a.nextTime !== '—'
    const bHas = b.nextTime !== '' && b.nextTime !== '—'
    if (!aHas && !bHas) return 0
    if (!aHas) return 1
    if (!bHas) return -1
    // 'YYYY-MM-DD HH:mm' 本地时间串，可直接按字符串比较
    if (a.nextTime !== b.nextTime) return a.nextTime < b.nextTime ? -1 : 1
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })
  return rows
})

// 防御性幂等加载：store 未加载时才补载（WorkbenchView 已加载则跳过）
onMounted(async () => {
  if (store.countdowns.length === 0) {
    await store.loadCountdowns()
  }
})
</script>

<template>
  <div v-if="reminders.length > 0" class="health-reminders" :data-testid="`${module}-reminders`">
    <h4 class="hr-title">定时提醒</h4>
    <ul class="hr-list">
      <li v-for="row in reminders" :key="row.id" class="hr-item" :data-testid="`${module}-reminder-item`">
        <span class="hr-name">{{ row.name }}</span>
        <span class="hr-meta">
          <span class="hr-time">{{ row.nextTime }}</span>
          <span class="hr-repeat">{{ row.repeatText }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* ===== 定时提醒（只读小模块，视觉上从属于面板统计卡）===== */
.health-reminders {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-top: 2px solid var(--accent-color, var(--color-primary));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.hr-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, var(--color-text-secondary));
}

.hr-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.hr-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 13px;
}

.hr-name {
  flex: 1;
  min-width: 0;
  color: var(--text-primary, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hr-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.hr-time {
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
}

.hr-repeat {
  font-size: 12px;
  color: var(--text-secondary, var(--color-text-secondary));
}

/* ===== 暗色模式覆盖 ===== */
:root.dark .health-reminders {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .hr-title,
:root.dark .hr-repeat {
  color: var(--text-secondary, #d1d5db);
}

:root.dark .hr-name,
:root.dark .hr-time {
  color: var(--text-primary, #f9fafb);
}
</style>
