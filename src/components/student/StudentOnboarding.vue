<script setup lang="ts">
// 学生工作台学段引导弹窗：首次进入未初始化学段时强制选择 K/P/J。
// 复刻学段徽标 + 简短描述；选择后调用 studentStore.switchStage() 应用默认值后关闭。
// 用户也可跳过（保持默认 P 学段，stageSeeded 不变 → 下次进入仍会引导）

import { ref, computed } from 'vue'
import { useStudentSettingsStore } from '@/stores/studentSettings'
import { useToast } from '@/composables/useToast'
import { STAGE_BADGE, type StudentStage } from '@/types'
import Icon from '@/components/Icon.vue'

const emit = defineEmits<{
  (e: 'complete'): void
  (e: 'close'): void
}>()

const studentStore = useStudentSettingsStore()
const toast = useToast()

const STAGE_OPTIONS: { key: StudentStage; label: string; desc: string }[] = [
  { key: 'K', label: '幼儿园', desc: '游戏化任务 · 家长主导 · 图标卡片' },
  { key: 'P', label: '小学', desc: '作业管理 · 习惯养成 · 阅读记录' },
  { key: 'J', label: '初中', desc: '学科管理 · 复习计划 · 错题本' }
]

const currentStage = computed<StudentStage>(() => studentStore.stage)
const selected = ref<StudentStage>(currentStage.value)
const birthday = ref<string>(studentStore.settings.birthday ?? '')

async function onConfirm() {
  // 已是当前学段且已播种 → 直接关闭
  if (selected.value === currentStage.value) {
    emit('complete')
    return
  }
  try {
    await studentStore.switchStage(selected.value)
    if (birthday.value) studentStore.setBirthday(birthday.value)
    toast.success(`已切换到「${stageNameOf(selected.value)}」学段`)
    emit('complete')
  } catch (err) {
    console.error('[StudentOnboarding] switchStage failed:', err)
    toast.error( `学段切换失败：${err instanceof Error ? err.message : '请重试'}`)
  }
}

function onSkip() {
  emit('close')
}

function stageNameOf(s: StudentStage): string {
  return STAGE_OPTIONS.find(o => o.key === s)?.label ?? ''
}
</script>

<template>
  <div class="onboarding-mask" @click.self="onSkip">
    <div class="onboarding-dialog" role="dialog" aria-labelledby="stg-onboarding-title">
      <header class="ob-header">
        <h2 id="stg-onboarding-title" class="ob-title">选择学段</h2>
        <button class="ob-close" type="button" @click="onSkip" aria-label="关闭"><Icon name="close" /></button>
      </header>
      <div class="ob-body">
        <p class="ob-hint">
          不同学段对应不同的功能面板组合。请选择当前学段，将自动初始化相应菜单与默认数据。
        </p>
        <div class="ob-stage-grid">
          <button
            v-for="opt in STAGE_OPTIONS"
            :key="opt.key"
            type="button"
            class="ob-stage-card"
            :class="{ active: selected === opt.key }"
            :data-testid="`stg-onboarding-card-${opt.key}`"
            @click="selected = opt.key"
          >
            <span
              class="ob-stage-badge"
              :style="{ backgroundColor: STAGE_BADGE[opt.key].color }"
            >{{ STAGE_BADGE[opt.key].label }}</span>
            <span class="ob-stage-name">{{ opt.label }}</span>
            <span class="ob-stage-desc">{{ opt.desc }}</span>
          </button>
        </div>
        <div class="ob-birthday-field">
          <label class="ob-birthday-label" for="stg-onboarding-birthday">出生日期（选填）</label>
          <input
            id="stg-onboarding-birthday"
            type="date"
            class="ob-birthday-input"
            v-model="birthday"
            data-testid="stg-onboarding-birthday"
          />
          <span class="ob-birthday-hint">用于在主页显示年龄</span>
        </div>
      </div>
      <footer class="ob-footer">
        <button type="button" class="ob-btn-secondary" @click="onSkip">跳过</button>
        <button type="button" class="ob-btn-primary" @click="onConfirm" :data-testid="`stg-onboarding-confirm`">确定</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.onboarding-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.onboarding-dialog {
  width: 520px;
  max-width: calc(100vw - 32px);
  background: var(--color-surface, #ffffff);
  border-radius: 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ob-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.ob-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}
.ob-close {
  padding: 4px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.6;
}
.ob-close:hover {
  opacity: 1;
}
.ob-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.ob-hint {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
  line-height: 1.6;
}
.ob-stage-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ob-stage-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}
.ob-stage-card:hover {
  background: var(--color-hover, #f3f4f6);
}
.ob-stage-card.active {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
}
.ob-stage-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}
.ob-stage-name {
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}
.ob-stage-desc {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
  margin-left: auto;
}
.ob-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border, #e5e7eb);
}
.ob-btn-secondary,
.ob-btn-primary {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid var(--color-border, #e5e7eb);
}
.ob-btn-secondary {
  background: transparent;
  color: inherit;
}
.ob-btn-secondary:hover {
  background: var(--color-hover, #f3f4f6);
}
.ob-btn-primary {
  background: var(--color-primary, #3b82f6);
  color: #ffffff;
  border-color: var(--color-primary, #3b82f6);
}
.ob-btn-primary:hover {
  filter: brightness(0.95);
}
.ob-birthday-field {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ob-birthday-label {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}
.ob-birthday-input {
  padding: 4px 8px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  font-size: 13px;
  color: inherit;
  background: var(--color-surface, #fff);
}
.ob-birthday-hint {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}
</style>
