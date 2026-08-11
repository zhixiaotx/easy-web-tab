<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useWorkbenchPomodoroStore } from '@/stores/workbenchPomodoro'
import { formatRemaining, sessionPhase } from '@/composables/pomodoroCore'
import type { PomodoroPhase } from '@/composables/pomodoroCore'
import { localToday } from '@/composables/todoCore'

const store = useWorkbenchPomodoroStore()

// 本地日期（YYYY-MM-DD，localToday 模式防 UTC 偏移）——今日统计/记录会话的入参
const today = localToday()

// ===== 会话 UI 状态 =====
// 状态机判定（sessionPhase）与剩余时间格式化（formatRemaining）一律走 pomodoroCore，
// 组件只持有 setInterval 秒级 tick 计时与纯 UI 状态，禁止内联状态机/格式化公式
const phase = ref<PomodoroPhase>('work')
const running = ref(false)
const remainingSeconds = ref(store.data.settings.workMinutes * 60)

let timer: ReturnType<typeof setInterval> | undefined

const PHASE_LABELS: Record<PomodoroPhase, string> = {
  work: '专注',
  break: '短休',
  longBreak: '长休'
}

function phaseMinutes(p: PomodoroPhase): number {
  const s = store.data.settings
  return p === 'work' ? s.workMinutes : p === 'break' ? s.breakMinutes : s.longBreakMinutes
}

const totalSeconds = computed(() => phaseMinutes(phase.value) * 60)

// 今日已完成专注会话数（薄委托 store.todayStats → pomodoroCore.todayStats，禁止内联重算）
const todayCount = computed(() => store.todayStats(today))

// ===== 环形进度（SVG stroke-dashoffset，视觉对齐 WorkbenchWeight 内联 SVG 风格）=====
const RING_R = 90
const RING_C = 2 * Math.PI * RING_R

// 剩余越少 offset 越大 → 圆环随计时逐渐耗尽；剩余分数钳制 0-1 防越界
const ringOffset = computed(() => {
  const total = totalSeconds.value
  if (total <= 0) return 0
  const frac = Math.min(Math.max(remainingSeconds.value / total, 0), 1)
  return RING_C * (1 - frac)
})

// ===== 计时控制 =====
function start(): void {
  if (running.value) return
  if (remainingSeconds.value <= 0) {
    remainingSeconds.value = totalSeconds.value
  }
  running.value = true
  timer = setInterval(tick, 1000)
}

function pause(): void {
  if (!running.value) return
  running.value = false
  if (timer !== undefined) {
    clearInterval(timer)
    timer = undefined
  }
}

function reset(): void {
  pause()
  phase.value = 'work'
  remainingSeconds.value = phaseMinutes('work') * 60
}

function tick(): void {
  if (remainingSeconds.value <= 1) {
    remainingSeconds.value = 0
    completePhase()
    return
  }
  remainingSeconds.value -= 1
}

// 会话结束：专注结束 → 记录今日会话并经 sessionPhase 判定下一阶段（短休/长休）；
// 休息结束 → 一律回到专注。阶段/剩余同步更新，recordSession 异步持久化不阻塞切换。
function completePhase(): void {
  if (phase.value === 'work') {
    const next = sessionPhase({
      phase: 'work',
      // completedSessions = 完成本次工作会话后的累计专注数（今日已完成 + 本次）
      completedSessions: todayCount.value + 1,
      settings: store.data.settings
    })
    phase.value = next
    void store.recordSession(today)
  } else {
    phase.value = 'work'
  }
  remainingSeconds.value = phaseMinutes(phase.value) * 60
}

// ===== 设置区（工作/休息分钟数，persist 到 store）=====
const formWork = ref(String(store.data.settings.workMinutes))
const formBreak = ref(String(store.data.settings.breakMinutes))

/** 正整数分钟解析：非法/<1 → 回退现值（store.updateSettings 不做校验，先在这里钳制）。
 * 注意：v-model 在 type="number" 输入框会把值强转为 number，故入参兼容 string | number。 */
function parsePositiveMinute(v: string | number, fallback: number): number {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 1 ? n : fallback
}

async function commitSettings(): Promise<void> {
  const work = parsePositiveMinute(formWork.value, store.data.settings.workMinutes)
  const brk = parsePositiveMinute(formBreak.value, store.data.settings.breakMinutes)
  formWork.value = String(work)
  formBreak.value = String(brk)
  // 空闲且剩余仍等于旧整段时长时才按新设置重算（进行中/暂停中的会话不受干扰）
  const idleAtFull = !running.value && remainingSeconds.value === totalSeconds.value
  await store.updateSettings({ workMinutes: work, breakMinutes: brk })
  if (idleAtFull) {
    remainingSeconds.value = phaseMinutes(phase.value) * 60
  }
}

// 面板自管理数据加载（WorkbenchView Promise.all 不接入本 store）；加载后按真实设置初始化表单与计时器。
// 竞态守卫：加载期间用户已改过表单/计时（首次交互先于 IDB 返回）→ 不覆盖，防止异步晚到回滚 UI。
onMounted(async () => {
  const initialWork = formWork.value
  const initialBreak = formBreak.value
  const initialRemaining = remainingSeconds.value
  await store.loadPomodoro()
  if (formWork.value === initialWork) formWork.value = String(store.data.settings.workMinutes)
  if (formBreak.value === initialBreak) formBreak.value = String(store.data.settings.breakMinutes)
  if (remainingSeconds.value === initialRemaining) {
    remainingSeconds.value = phaseMinutes('work') * 60
  }
})

onUnmounted(() => {
  if (timer !== undefined) clearInterval(timer)
})
</script>

<template>
  <div class="wb-pomodoro">
    <!-- 计时器卡：大号环形进度 + 阶段标签 + 控制按钮 + 今日统计 -->
    <div class="stat-card pm-timer-card">
      <div class="pm-ring-wrap">
        <svg class="pm-ring-svg" viewBox="0 0 220 220" width="220" height="220" data-testid="pm-timer-ring">
          <circle class="pm-ring-track" cx="110" cy="110" :r="RING_R" />
          <circle
            class="pm-ring-fg"
            :class="`phase-${phase}`"
            cx="110"
            cy="110"
            :r="RING_R"
            :stroke-dasharray="RING_C"
            :stroke-dashoffset="ringOffset"
            transform="rotate(-90 110 110)"
          />
        </svg>
        <div class="pm-ring-center">
          <div class="pm-phase" data-testid="pm-phase">{{ PHASE_LABELS[phase] }}</div>
          <div class="pm-time" data-testid="pm-remaining">{{ formatRemaining(remainingSeconds) }}</div>
        </div>
      </div>

      <div class="pm-controls">
        <button class="btn-primary" data-testid="pm-start" :disabled="running" @click="start">开始</button>
        <button class="btn-secondary" data-testid="pm-pause" :disabled="!running" @click="pause">暂停</button>
        <button class="btn-secondary" data-testid="pm-reset" @click="reset">重置</button>
      </div>

      <div class="pm-today" data-testid="pm-today-count">今日完成 {{ todayCount }} 个番茄</div>
    </div>

    <!-- 设置卡：工作/休息分钟数（persist 到 store） -->
    <div class="stat-card">
      <div class="stat-header">
        <span class="stat-icon">⚙️</span>
        <span class="stat-label">时长设置</span>
      </div>
      <div class="pm-settings-row">
        <div class="field">
          <label class="field-label">专注（分钟）</label>
          <input
            v-model="formWork"
            type="number"
            min="1"
            step="1"
            class="form-input field-short"
            placeholder="例如：25"
            data-testid="pm-settings-work"
            @change="commitSettings"
          />
        </div>
        <div class="field">
          <label class="field-label">休息（分钟）</label>
          <input
            v-model="formBreak"
            type="number"
            min="1"
            step="1"
            class="form-input field-short"
            placeholder="例如：5"
            data-testid="pm-settings-break"
            @change="commitSettings"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 面板容器（复用 WorkbenchExercise/Weight stat-card 结构） */
.wb-pomodoro {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 520px;
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

/* ===== 计时器卡 ===== */
.pm-timer-card {
  align-items: center;
}

/* 大号环形进度（SVG stroke-dashoffset） */
.pm-ring-wrap {
  position: relative;
  width: 220px;
  height: 220px;
}

.pm-ring-svg {
  display: block;
  width: 220px;
  height: 220px;
}

.pm-ring-track {
  fill: none;
  stroke: var(--bg-secondary, var(--color-bg-hover));
  stroke-width: 12;
}

.pm-ring-fg {
  fill: none;
  stroke: var(--accent-color, var(--color-primary));
  stroke-width: 12;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.4s linear, stroke 0.3s ease;
}

/* 阶段配色：专注=主色 / 短休=绿 / 长休=紫 */
.pm-ring-fg.phase-break {
  stroke: #10b981;
}

.pm-ring-fg.phase-longBreak {
  stroke: #8b5cf6;
}

.pm-ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  pointer-events: none;
}

.pm-phase {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, var(--color-text-secondary));
}

.pm-time {
  font-size: 40px;
  font-weight: 700;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.pm-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.btn-primary {
  padding: 10px 20px;
  background-color: var(--accent-color, var(--color-primary));
  color: #fff;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--accent-hover, var(--color-primary-hover));
}

.btn-primary:disabled {
  background: var(--text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

.btn-secondary {
  padding: 10px 20px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-secondary:hover:not(:disabled) {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pm-today {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-color, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

/* ===== 设置卡 ===== */
.pm-settings-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.field-short {
  width: 140px;
}

.form-input {
  padding: 9px 12px;
  background-color: var(--input-bg, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--text-primary, var(--color-text));
  box-sizing: border-box;
  transition: border-color var(--transition-fast, 0.15s ease);
}

.form-input:focus {
  outline: none;
  border-color: var(--accent-color, var(--color-primary));
}

/* ===== 暗色模式覆盖 ===== */
:root.dark .stat-card {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .pm-ring-track {
  stroke: var(--input-bg, #374151);
}

:root.dark .pm-ring-fg {
  stroke: #60a5fa;
}

:root.dark .pm-ring-fg.phase-break {
  stroke: #34d399;
}

:root.dark .pm-ring-fg.phase-longBreak {
  stroke: #a78bfa;
}

:root.dark .pm-time {
  color: var(--text-primary, #f9fafb);
}

:root.dark .btn-secondary {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .btn-primary:disabled {
  background-color: var(--input-bg, #374151);
  color: var(--text-muted, #9ca3af);
}

:root.dark .form-input,
:root.dark select.form-input,
:root.dark input.form-input {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}

@media (max-width: 640px) {
  .field-short {
    width: 100%;
  }
}
</style>
