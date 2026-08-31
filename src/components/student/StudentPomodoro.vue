<script setup lang="ts">
// 学生工作台番茄钟面板（M3 批次2）
// 布局：计时器卡（环形进度 + 阶段标签 + 控制按钮 + 今日统计）+ 学段推荐 + 时长设置弹框
// 数据：useStudentPomodoroStore（独立 IDB store 'student_pomodoro'，严格隔离成人数据）
// 学段时长：K 15/5、P 25/5、J 50/10（长休=短休×3，每 4 个专注一次长休）
// 状态机/格式化/今日统计一律薄委托 pomodoroCore 纯函数，组件禁止内联重算

import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useStudentPomodoroStore } from '@/stores/studentPomodoro'
import { useStudentSettingsStore } from '@/stores/studentSettings'
import { formatRemaining, sessionPhase, stageDefaultPomodoroSettings } from '@/composables/studentPomodoroCore'
import type { PomodoroPhase } from '@/composables/studentPomodoroCore'
import { localToday } from '@/composables/todoCore'
import Icon from '@/components/Icon.vue'

const store = useStudentPomodoroStore()
const settingsStore = useStudentSettingsStore()

// 本地日期（YYYY-MM-DD，localToday 模式防 UTC 偏移）
const today = localToday()

// ===== 会话 UI 状态 =====
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

// 今日已完成专注会话数（薄委托 store.todayCount → pomodoroCore.todayStats）
const todayCount = computed(() => store.todayCount(today))

// 学段推荐时长（用于显示与一键应用）
const stageRecommended = computed(() => stageDefaultPomodoroSettings(settingsStore.stage))

// ===== 环形进度（SVG stroke-dashoffset）=====
const RING_R = 90
const RING_C = 2 * Math.PI * RING_R

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

// 会话结束：专注结束 → 记录今日会话并经 sessionPhase 判定下一阶段；休息结束 → 回到专注
function completePhase(): void {
  if (phase.value === 'work') {
    const next = sessionPhase({
      phase: 'work',
      completedSessions: todayCount.value + 1,
      settings: store.data.settings
    })
    phase.value = next
    void store.recordSession(today)
  } else {
    phase.value = 'work'
  }
  remainingSeconds.value = phaseMinutes(phase.value) * 60
  // 自动暂停，避免下一阶段无人值守长时间计时（与成人版一致）
  running.value = false
  if (timer !== undefined) {
    clearInterval(timer)
    timer = undefined
  }
}

// ===== 设置弹框 =====
const showSettingsDialog = ref(false)
const formWork = ref(String(store.data.settings.workMinutes))
const formBreak = ref(String(store.data.settings.breakMinutes))
const formLongBreak = ref(String(store.data.settings.longBreakMinutes))
const formSessions = ref(String(store.data.settings.sessionsPerCycle))

function openSettingsDialog(): void {
  formWork.value = String(store.data.settings.workMinutes)
  formBreak.value = String(store.data.settings.breakMinutes)
  formLongBreak.value = String(store.data.settings.longBreakMinutes)
  formSessions.value = String(store.data.settings.sessionsPerCycle)
  showSettingsDialog.value = true
}

function closeSettingsDialog(): void {
  showSettingsDialog.value = false
}

function parsePositiveMinute(v: string | number, fallback: number): number {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 1 ? n : fallback
}

async function commitSettings(): Promise<void> {
  const work = parsePositiveMinute(formWork.value, store.data.settings.workMinutes)
  const brk = parsePositiveMinute(formBreak.value, store.data.settings.breakMinutes)
  const longBrk = parsePositiveMinute(formLongBreak.value, store.data.settings.longBreakMinutes)
  const sessions = parsePositiveMinute(formSessions.value, store.data.settings.sessionsPerCycle)
  formWork.value = String(work)
  formBreak.value = String(brk)
  formLongBreak.value = String(longBrk)
  formSessions.value = String(sessions)
  // 空闲且剩余仍等于旧整段时长时才按新设置重算
  const idleAtFull = !running.value && remainingSeconds.value === totalSeconds.value
  await store.updateSettings({
    workMinutes: work,
    breakMinutes: brk,
    longBreakMinutes: longBrk,
    sessionsPerCycle: sessions
  })
  if (idleAtFull) {
    remainingSeconds.value = phaseMinutes(phase.value) * 60
  }
}

// 一键应用学段推荐时长
async function applyStageRecommended(): Promise<void> {
  const def = stageRecommended.value
  formWork.value = String(def.workMinutes)
  formBreak.value = String(def.breakMinutes)
  formLongBreak.value = String(def.longBreakMinutes)
  formSessions.value = String(def.sessionsPerCycle)
  await commitSettings()
}

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
  <div class="spm-shell">
    <div class="spm-toolbar">
      <h2 class="spm-title">番茄钟</h2>
      <button class="btn-primary spm-settings-btn" data-testid="spm-settings-btn" @click="openSettingsDialog">
        <Icon name="cog" :size="16" /> 时长设置
      </button>
    </div>

    <!-- 学段推荐提示 -->
    <div class="spm-stage-hint">
      <span class="spm-stage-badge">{{ settingsStore.stageBadgeInfo.label }}</span>
      <span class="spm-stage-text">
        {{ settingsStore.stageLabelName }}推荐：专注 {{ stageRecommended.workMinutes }} 分钟 / 短休 {{ stageRecommended.breakMinutes }} 分钟 / 长休 {{ stageRecommended.longBreakMinutes }} 分钟
      </span>
    </div>

    <!-- 计时器卡 -->
    <div class="spm-timer-card">
      <div class="spm-ring-wrap">
        <svg class="spm-ring-svg" viewBox="0 0 220 220" width="220" height="220" data-testid="spm-timer-ring">
          <circle class="spm-ring-track" cx="110" cy="110" :r="RING_R" />
          <circle
            class="spm-ring-fg"
            :class="`phase-${phase}`"
            cx="110"
            cy="110"
            :r="RING_R"
            :stroke-dasharray="RING_C"
            :stroke-dashoffset="ringOffset"
            transform="rotate(-90 110 110)"
          />
        </svg>
        <div class="spm-ring-center">
          <div class="spm-phase" data-testid="spm-phase">{{ PHASE_LABELS[phase] }}</div>
          <div class="spm-time" data-testid="spm-remaining">{{ formatRemaining(remainingSeconds) }}</div>
        </div>
      </div>

      <div class="spm-controls">
        <button class="btn-primary" data-testid="spm-start" :disabled="running" @click="start">开始</button>
        <button class="btn-secondary" data-testid="spm-pause" :disabled="!running" @click="pause">暂停</button>
        <button class="btn-secondary" data-testid="spm-reset" @click="reset">重置</button>
      </div>

      <div class="spm-today" data-testid="spm-today-count">今日完成 {{ todayCount }} 个番茄</div>
    </div>

    <!-- 设置弹框 -->
    <div v-if="showSettingsDialog" class="spm-dialog-overlay" @click.self="closeSettingsDialog">
      <div class="spm-dialog" data-testid="spm-settings-dialog">
        <div class="spm-dialog-head">
          <h3>时长设置</h3>
          <button class="spm-dialog-close" @click="closeSettingsDialog" title="关闭">
            <Icon name="close" :size="18" />
          </button>
        </div>
        <div class="spm-dialog-body">
          <div class="spm-stage-recommend">
            <span>{{ settingsStore.stageLabelName }}推荐：专注 {{ stageRecommended.workMinutes }} 分钟 / 短休 {{ stageRecommended.breakMinutes }} 分钟 / 长休 {{ stageRecommended.longBreakMinutes }} 分钟</span>
            <button class="spm-apply-btn" data-testid="spm-apply-stage" @click="applyStageRecommended">应用学段推荐</button>
          </div>
          <div class="spm-form-row">
            <label class="spm-form-label">专注（分钟）</label>
            <input
              v-model="formWork"
              type="number"
              min="1"
              step="1"
              class="spm-form-input"
              data-testid="spm-form-work"
            />
          </div>
          <div class="spm-form-row">
            <label class="spm-form-label">短休（分钟）</label>
            <input
              v-model="formBreak"
              type="number"
              min="1"
              step="1"
              class="spm-form-input"
              data-testid="spm-form-break"
            />
          </div>
          <div class="spm-form-row">
            <label class="spm-form-label">长休（分钟）</label>
            <input
              v-model="formLongBreak"
              type="number"
              min="1"
              step="1"
              class="spm-form-input"
              data-testid="spm-form-long-break"
            />
          </div>
          <div class="spm-form-row">
            <label class="spm-form-label">每几个专注一次长休</label>
            <input
              v-model="formSessions"
              type="number"
              min="1"
              step="1"
              class="spm-form-input"
              data-testid="spm-form-sessions"
            />
          </div>
        </div>
        <div class="spm-dialog-foot">
          <button class="spm-btn-cancel" @click="closeSettingsDialog">取消</button>
          <button class="btn-primary" data-testid="spm-form-save" @click="commitSettings().then(closeSettingsDialog)">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.spm-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;
  align-items: center;
}

.spm-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  flex-shrink: 0;
}
.spm-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}
.spm-settings-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
}

.spm-stage-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-text-soft, #6b7280);
  flex-shrink: 0;
}
.spm-stage-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-primary, #3b82f6);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.spm-timer-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-height: 0;
  justify-content: center;
}

.spm-ring-wrap {
  position: relative;
  width: 220px;
  height: 220px;
  flex-shrink: 0;
}
.spm-ring-svg {
  display: block;
}
.spm-ring-track {
  fill: none;
  stroke: var(--color-border, #e5e7eb);
  stroke-width: 12;
}
.spm-ring-fg {
  fill: none;
  stroke: var(--color-primary, #3b82f6);
  stroke-width: 12;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.3s linear;
}
.spm-ring-fg.phase-work { stroke: #3b82f6; }
.spm-ring-fg.phase-break { stroke: #10b981; }
.spm-ring-fg.phase-longBreak { stroke: #a855f7; }

.spm-ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.spm-phase {
  font-size: 14px;
  color: var(--color-text-soft, #6b7280);
  font-weight: 600;
}
.spm-time {
  font-size: 36px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
}

.spm-controls {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.spm-today {
  font-size: 13px;
  color: var(--color-text-soft, #6b7280);
  flex-shrink: 0;
}

.spm-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.spm-dialog {
  background: var(--color-surface, #fff);
  border-radius: 8px;
  width: 90%;
  max-width: 420px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.spm-dialog-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.spm-dialog-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.spm-dialog-close {
  border: none;
  background: transparent;
  color: var(--color-text-soft, #6b7280);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}
.spm-dialog-close:hover {
  background: var(--color-hover, #f3f4f6);
}
.spm-dialog-body {
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.spm-stage-recommend {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.08));
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-text-soft, #6b7280);
}
.spm-apply-btn {
  align-self: flex-start;
  padding: 4px 10px;
  border: 1px solid var(--color-primary, #3b82f6);
  background: transparent;
  color: var(--color-primary, #3b82f6);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.spm-apply-btn:hover {
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
}
.spm-form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.spm-form-label {
  font-size: 13px;
  font-weight: 600;
}
.spm-form-input {
  padding: 6px 8px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 4px;
  background: var(--color-surface, #fff);
  color: inherit;
  font-size: 13px;
}
.spm-dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border, #e5e7eb);
}
.spm-btn-cancel {
  padding: 6px 14px;
  border: 1px solid var(--color-border, #e5e7eb);
  background: transparent;
  color: inherit;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.spm-btn-cancel:hover {
  background: var(--color-hover, #f3f4f6);
}
</style>
