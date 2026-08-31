<script setup lang="ts">
// 家长 PIN 弹窗：两种模式
//   mode='setup'   — 首次设置家长 PIN：输入两次，匹配一致校验，弱口令/长度/格式拒绝
//   mode='verify'  — 验证已设置的家长 PIN：5 次错误 → 锁定 5 分钟
// 数字键盘（0-9 + ⌫ 删除）+ 圆点指示器 + 剩余尝试/锁定倒计时显示

import { ref, computed, watch, onBeforeUnmount, onMounted } from 'vue'
import {
  useStudentSettingsStore,
  PARENT_PIN_MIN_LENGTH as PIN_MIN,
  PARENT_PIN_MAX_LENGTH as PIN_MAX
} from '@/stores/studentSettings'
import { useToast } from '@/composables/useToast'
import Icon from '@/components/Icon.vue'

const props = defineProps<{
  visible: boolean
  mode: 'setup' | 'verify'
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'setup-complete'): void
  (e: 'verified'): void
  (e: 'cancel'): void
}>()

const studentStore = useStudentSettingsStore()
const toast = useToast()

const inputStep1 = ref('')
const inputStep2 = ref('')
const setupStep2 = ref(false)
const submitting = ref(false)
const lockRemainingSeconds = ref<number>(0)
let lockTicker: ReturnType<typeof setInterval> | null = null

const currentInput = computed(() =>
  props.mode === 'verify'
    ? inputStep1.value
    : setupStep2.value
      ? inputStep2.value
      : inputStep1.value
)

const dots = computed(() => {
  const arr: { filled: boolean; isMinPos: boolean }[] = []
  const activeLen = currentInput.value.length
  for (let i = 0; i < PIN_MAX; i++) {
    arr.push({ filled: i < activeLen, isMinPos: i < PIN_MIN })
  }
  return arr
})

const isLocked = computed(() => lockRemainingSeconds.value > 0)

const dialogTitle = computed(() => {
  if (props.mode === 'setup') {
    return setupStep2.value ? '再次输入家长 PIN' : '设置家长 PIN'
  }
  return '请输入家长 PIN'
})

const footerHint = computed(() => {
  if (isLocked.value) return `已锁定，${lockRemainingSeconds.value} 秒后重试`
  if (props.mode === 'verify') {
    const attempts = (studentStore.settings.parentPinFailedAttempts ?? 0)
    const remaining = Math.max(0, 5 - attempts)
    if (remaining <= 2) return `剩余尝试次数：${remaining} 次`
    return `4-8 位数字 PIN`
  }
  if (setupStep2.value) return '两次输入必须一致'
  return `4-8 位数字，不可全部相同（如 0000、1111）`
})

function pressKey(k: string) {
  if (isLocked.value || submitting.value) return
  if (!/^[0-9]$/.test(k)) return
  if (currentInput.value.length >= PIN_MAX) return
  if (props.mode === 'verify') {
    inputStep1.value += k
  } else if (setupStep2.value) {
    inputStep2.value += k
  } else {
    inputStep1.value += k
  }
}

function pressBackspace() {
  if (isLocked.value || submitting.value) return
  if (props.mode === 'verify') {
    inputStep1.value = inputStep1.value.slice(0, -1)
  } else if (setupStep2.value) {
    inputStep2.value = inputStep2.value.slice(0, -1)
  } else {
    inputStep1.value = inputStep1.value.slice(0, -1)
  }
}

function onKeydown(e: KeyboardEvent) {
  if (!props.visible) return
  if (e.key >= '0' && e.key <= '9') {
    pressKey(e.key); e.preventDefault()
  } else if (e.key === 'Backspace') {
    pressBackspace(); e.preventDefault()
  } else if (e.key === 'Escape') {
    onClose(); e.preventDefault()
  } else if (e.key === 'Enter') {
    trySubmit(); e.preventDefault()
  }
}

async function trySubmit() {
  if (isLocked.value || submitting.value) return
  if (props.mode === 'verify') {
    if (inputStep1.value.length < PIN_MIN) return
    submitting.value = true
    try {
      const res = await studentStore.verifyPin(inputStep1.value)
      if (res.ok) {
        emit('verified')
        emit('update:visible', false)
        closeSelfCleanup()
      } else if (res.reason === 'locked') {
        refreshLockRemaining()
        toast.warning('家长 PIN 锁定中，请稍后重试')
      } else if (res.reason === 'wrong') {
        inputStep1.value = ''
        const msg =
          res.remainingAttempts !== undefined
            ? `家长 PIN 错误，剩余 ${res.remainingAttempts} 次尝试`
            : `家长 PIN 错误`
        toast.warning(msg)
        if (res.lockSeconds !== undefined && res.lockSeconds > 0) {
          refreshLockRemaining()
        }
      }
    } finally {
      submitting.value = false
    }
  } else {
    if (!setupStep2.value) {
      if (inputStep1.value.length < PIN_MIN) return
      setupStep2.value = true
      return
    }
    if (inputStep2.value.length < PIN_MIN) return
    if (inputStep1.value !== inputStep2.value) {
      toast.warning('两次 PIN 输入不一致，请重新输入')
      setupStep2.value = false
      inputStep1.value = ''
      inputStep2.value = ''
      return
    }
    submitting.value = true
    try {
      const ok = await studentStore.setParentPin(inputStep1.value)
      if (ok) {
        toast.success('家长 PIN 设置成功')
        emit('setup-complete')
        emit('update:visible', false)
        closeSelfCleanup()
      } else {
        toast.warning('PIN 格式无效或为弱口令（4-8 位数字，不可全部相同）')
        setupStep2.value = false
        inputStep1.value = ''
        inputStep2.value = ''
      }
    } finally {
      submitting.value = false
    }
  }
}

const canSubmit = computed(() => {
  if (isLocked.value || submitting.value) return false
  if (props.mode === "verify") return inputStep1.value.length >= PIN_MIN
  if (!setupStep2.value) return inputStep1.value.length >= PIN_MIN
  return inputStep2.value.length >= PIN_MIN
})
function refreshLockRemaining() {
  const secs = studentStore.lockRemainingSeconds()
  lockRemainingSeconds.value = secs ?? 0
}

function startLockTicker() {
  if (lockTicker) return
  lockTicker = setInterval(() => {
    if (!props.visible) return
    const secs = studentStore.lockRemainingSeconds()
    lockRemainingSeconds.value = secs ?? 0
  }, 1000)
}

function stopLockTicker() {
  if (lockTicker) { clearInterval(lockTicker); lockTicker = null }
}

function closeSelfCleanup() {
  inputStep1.value = ''
  inputStep2.value = ''
  setupStep2.value = false
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      closeSelfCleanup()
      refreshLockRemaining()
      startLockTicker()
      if (props.mode === 'verify' && !studentStore.hasParentPin()) {
        toast.warning('尚未设置家长 PIN，先完成首次设置')
      }
    } else {
      stopLockTicker()
    }
  },
  { immediate: true }
)

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stopLockTicker()
})

function onClose() {
  emit('cancel')
  emit('update:visible', false)
}

const KEYPAD_ROWS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫']
]
</script>

<template>
  <div v-if="visible" class="st-pin-mask" @click.self="onClose" role="dialog" aria-modal="true">
    <div class="st-pin-dialog" :class="{ locked: isLocked }">
      <header class="st-pin-header">
        <h3 class="st-pin-title">{{ dialogTitle }}</h3>
        <button class="st-pin-close" type="button" @click="onClose" aria-label="关闭">
          <Icon name="close" />
        </button>
      </header>

      <div class="st-pin-body">
        <div class="st-pin-dots" aria-label="PIN 输入进度">
          <span
            v-for="(d, i) in dots"
            :key="i"
            class="st-pin-dot"
            :class="{ filled: d.filled, 'is-min': d.isMinPos }"
          />
        </div>

        <div v-if="isLocked" class="st-pin-locked">
          <Icon name="passwords" />
          <span>锁定中，{{ lockRemainingSeconds }} 秒后解锁</span>
        </div>

        <p class="st-pin-hint" :class="{ warn: isLocked || (mode === 'verify' && (studentStore.settings.parentPinFailedAttempts ?? 0) >= 3) }">
          {{ footerHint }}
        </p>

        <div class="st-pin-keypad">
          <template v-for="(row, ri) in KEYPAD_ROWS" :key="ri">
            <template v-for="(key, ci) in row" :key="`${ri}-${ci}`">
              <span v-if="key === ''" class="st-pin-key st-pin-key-empty" aria-hidden="true" />
              <button
                v-else-if="key === '⌫'"
                type="button"
                class="st-pin-key st-pin-key-back"
                :disabled="isLocked || submitting"
                @click="pressBackspace"
                aria-label="删除"
              >{{ key }}</button>
              <button
                v-else
                type="button"
                class="st-pin-key"
                :disabled="isLocked || submitting"
                @click="pressKey(key)"
              >{{ key }}</button>
            </template>
          </template>
        </div>

        <button class="st-pin-confirm" type="button" :disabled="!canSubmit" @click="trySubmit()">{{ mode === 'setup' ? (setupStep2 ? '保存' : '下一步') : '确认' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.st-pin-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(3px);
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.st-pin-dialog {
  width: 100%;
  max-width: 360px;
  background: var(--color-surface, #ffffff);
  color: var(--color-text, #1f2937);
  border-radius: 16px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
  border: 1px solid var(--color-border, #e5e7eb);
  overflow: hidden;
  position: relative;
}
.st-pin-dialog.locked::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.03);
  pointer-events: none;
}
.st-pin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.st-pin-title { margin: 0; font-size: 16px; font-weight: 600; }
.st-pin-close {
  border: 0;
  background: transparent;
  color: var(--color-text-secondary, #6b7280);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.st-pin-close:hover {
  background: var(--color-surface-2, #f3f4f6);
  color: var(--color-text, #1f2937);
}
.st-pin-body {
  padding: 24px 20px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}
.st-pin-dots { display: flex; gap: 14px; justify-content: center; }
.st-pin-dot {
  width: 14px; height: 14px; border-radius: 50%;
  border: 1.5px solid var(--color-border, #d1d5db);
  background: transparent; transition: all 0.18s;
}
.st-pin-dot.is-min { border-color: var(--color-primary, #10b981); }
.st-pin-dot.filled {
  background: var(--color-primary, #10b981);
  border-color: var(--color-primary, #10b981);
  transform: scale(1.08);
}
.st-pin-locked {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-radius: 10px;
  background: rgba(239, 68, 68, 0.1); color: #dc2626;
  font-size: 14px; width: 100%; justify-content: center;
}
.st-pin-hint {
  margin: 0; font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
  line-height: 1.5; text-align: center; min-height: 20px;
}
.st-pin-hint.warn { color: #dc2626; font-weight: 500; }
.st-pin-keypad {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 10px; width: 100%; max-width: 280px;
}
.st-pin-key {
  border: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-surface-2, #f9fafb);
  color: var(--color-text, #1f2937);
  height: 52px; border-radius: 12px;
  font-size: 20px; font-weight: 500;
  cursor: pointer; transition: all 0.12s;
}
.st-pin-key:hover:not(:disabled) {
  background: var(--color-primary, #10b981);
  color: #fff;
  border-color: var(--color-primary, #10b981);
}
.st-pin-key:active:not(:disabled) { transform: scale(0.96); }
.st-pin-key:disabled { opacity: 0.45; cursor: not-allowed; }
.st-pin-key-back {
  background: transparent; font-size: 18px;
  color: var(--color-text-secondary, #6b7280);
}
.st-pin-key-empty { visibility: hidden; }
@media (max-width: 420px) {
  .st-pin-dialog { border-radius: 14px; }
  .st-pin-body { padding: 20px 16px 18px; gap: 16px; }
  .st-pin-key { height: 48px; font-size: 18px; }
  .st-pin-dot { width: 12px; height: 12px; }
  .st-pin-dots { gap: 12px; }
}
.st-pin-confirm {
  width: 100%;
  padding: 12px;
  margin-top: 8px;
  border: none;
  border-radius: 8px;
  background: var(--color-primary, #3b82f6);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s, background 0.15s;
}
.st-pin-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.st-pin-confirm:not(:disabled):hover {
  background: var(--color-primary-dark, #2563eb);
}
</style>
