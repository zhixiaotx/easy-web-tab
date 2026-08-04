<script setup lang="ts">
// 工作台主页概览仪表盘（T12）
// 只消费 4 个共享 store 的 state/computed，不新增 store、不直写 IDB。
// 外壳通过 @navigate 接收面板跳转请求（WorkbenchView 已做白名单收窄）。
import { computed } from 'vue'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import { useWorkbenchNotesStore } from '@/stores/workbenchNotes'
import { useCountdownsStore } from '@/stores/countdowns'
import { usePasswordsStore } from '@/stores/passwords'
import type { CountdownItem, TodoPriority, WorkbenchTodo } from '@/types'

const emit = defineEmits<{ navigate: [section: string] }>()

const todosStore = useWorkbenchTodosStore()
const notesStore = useWorkbenchNotesStore()
const countdownsStore = useCountdownsStore()
const passwordsStore = usePasswordsStore()

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
    <!-- 统计卡片行 -->
    <div class="stats-grid">
      <div class="stat-card" data-testid="home-stats-todos">
        <div class="stat-header">
          <span class="stat-icon">☑️</span>
          <span class="stat-label">待办任务</span>
          <button class="nav-btn" data-testid="home-nav-todos" @click="emit('navigate', 'todos')">前往 →</button>
        </div>
        <div class="stat-value" data-testid="home-stats-value-todos">{{ todoStats.total }}</div>
        <div class="stat-sub">{{ todoStats.active }} 未完成 · {{ todoStats.overdue }} 已逾期</div>
      </div>

      <div class="stat-card" data-testid="home-stats-notes">
        <div class="stat-header">
          <span class="stat-icon">📝</span>
          <span class="stat-label">便签</span>
          <button class="nav-btn" data-testid="home-nav-notes" @click="emit('navigate', 'notes')">前往 →</button>
        </div>
        <div class="stat-value" data-testid="home-stats-value-notes">{{ noteStats.total }}</div>
        <div class="stat-sub">{{ noteStats.pinned }} 置顶</div>
      </div>

      <div class="stat-card" data-testid="home-stats-countdowns">
        <div class="stat-header">
          <span class="stat-icon">⏳</span>
          <span class="stat-label">定时提醒</span>
          <button class="nav-btn" data-testid="home-nav-countdowns" @click="emit('navigate', 'countdowns')">前往 →</button>
        </div>
        <div class="stat-value" data-testid="home-stats-value-countdowns">{{ countdownStats.total }}</div>
        <div class="stat-sub">{{ countdownStats.near30 }} 项 30 天内到期</div>
      </div>

      <div class="stat-card" data-testid="home-stats-passwords">
        <div class="stat-header">
          <span class="stat-icon">🔑</span>
          <span class="stat-label">密码</span>
          <button class="nav-btn" data-testid="home-nav-passwords" @click="emit('navigate', 'passwords')">前往 →</button>
        </div>
        <div class="stat-value" data-testid="home-stats-value-passwords">
          {{ passwordsStore.isUnlocked ? `${passwordsStore.passwords.length} 条` : '🔒 解锁后可见' }}
        </div>
        <div class="stat-sub">{{ passwordsStore.isUnlocked ? '已解锁' : '未解锁' }}</div>
      </div>
    </div>

    <!-- 下方两块列表 -->
    <div class="panels-grid">
      <section class="panel-card">
        <div class="panel-header">
          <h3><span class="panel-icon">⏳</span>即将到期定时提醒</h3>
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

      <section class="panel-card">
        <div class="panel-header">
          <h3><span class="panel-icon">☑️</span>未完成待办</h3>
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
    </div>
  </div>
</template>

<style scoped>
/* 面板容器（WorkbenchView 的 .wb-content 已提供滚动与背景，此处不 position:fixed） */
.wb-home {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== 统计卡片行 ===== */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.stat-card {
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

.stat-card:hover {
  border-color: var(--accent-color, var(--color-primary));
}

.stat-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-icon {
  font-size: 18px;
  line-height: 1;
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
  padding: 4px 10px;
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
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.stat-sub {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

/* ===== 下方列表块 ===== */
.panels-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  align-items: start;
}

.panel-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
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

/* ===== 暗色模式覆盖 ===== */
:root.dark .stat-card,
:root.dark .panel-card {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .stat-value,
:root.dark .panel-header h3,
:root.dark .home-list-title {
  color: var(--text-primary, #f9fafb);
}

:root.dark .stat-label,
:root.dark .stat-sub {
  color: var(--text-secondary, #d1d5db);
}

:root.dark .home-list-item {
  background-color: var(--bg-card, #1f2937);
  border-color: var(--border-color, #374151);
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

@media (max-width: 640px) {
  .panels-grid {
    grid-template-columns: 1fr;
  }
}
</style>
