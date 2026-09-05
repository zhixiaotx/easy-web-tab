<script setup lang="ts">
import { HEALTH_TABS, type HealthModule } from '@/types'
import WorkbenchExercise from './WorkbenchExercise.vue'
import WorkbenchDiet from './WorkbenchDiet.vue'
import WorkbenchSleep from './WorkbenchSleep.vue'
import WorkbenchWeight from './WorkbenchWeight.vue'
import Icon from '@/components/Icon.vue'

const TAB_META: Record<HealthModule, { label: string; icon: string }> = {
  exercise: { label: '运动', icon: 'exercise' },
  diet: { label: '饮食', icon: 'diet' },
  sleep: { label: '睡眠', icon: 'sleep' },
  weight: { label: '体重', icon: 'weight' },
}

const props = defineProps<{ activeTab: HealthModule }>()
const emit = defineEmits<{ change: [tab: HealthModule] }>()
</script>

<template>
  <div class="wb-health">
    <div class="hd-tabs" data-testid="hd-tabs">
      <el-radio-group
        :model-value="activeTab"
        size="small"
        @update:model-value="emit('change', $event as HealthModule)"
      >
        <el-radio-button
          v-for="tab in HEALTH_TABS"
          :key="tab"
          :value="tab"
          :data-testid="`hd-tab-${tab}`"
        >
          <span class="hd-tab-icon"><Icon :name="TAB_META[tab].icon" /></span>
          <span class="hd-tab-label">{{ TAB_META[tab].label }}</span>
        </el-radio-button>
      </el-radio-group>
    </div>

    <WorkbenchExercise v-if="activeTab === 'exercise'" />
    <WorkbenchDiet v-else-if="activeTab === 'diet'" />
    <WorkbenchSleep v-else-if="activeTab === 'sleep'" />
    <WorkbenchWeight v-else-if="activeTab === 'weight'" />
  </div>
</template>

<style scoped>
.wb-health {
  width: 100%;
}

/* 视觉对齐 WorkbenchView.vue 的 .wb-menu-item（亮色 341-370 / 暗色 414-426） */
.hd-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.hd-tabs :deep(.el-radio-group) {
  flex-wrap: wrap;
  gap: 8px;
}

.hd-tabs :deep(.el-radio-button + .el-radio-button) {
  margin-left: 0;
}

.hd-tabs :deep(.el-radio-button__inner) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: 14px;
  box-shadow: none;
  transition: all 0.15s ease;
}

.hd-tab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.hd-tabs :deep(.el-radio-button__inner:hover) {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
}

.hd-tabs :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
  border-color: var(--color-primary, #3b82f6);
}

/* 暗色模式覆盖（模式参考 WorkbenchView.vue:414-426） */
html.dark .hd-tabs :deep(.el-radio-button__inner) {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .hd-tabs :deep(.el-radio-button__inner:hover) {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text, #f9fafb);
}

html.dark .hd-tabs :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: #1e3a5f;
  color: #60a5fa;
  border-color: #60a5fa;
}
</style>
