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
    <div class="hd-tabs" role="tablist" data-testid="hd-tabs">
      <button
        v-for="tab in HEALTH_TABS"
        :key="tab"
        type="button"
        role="tab"
        class="hd-tab"
        :class="{ active: activeTab === tab }"
        :aria-selected="activeTab === tab"
        :data-testid="`hd-tab-${tab}`"
        @click="emit('change', tab)"
      >
        <span class="hd-tab-icon"><Icon :name="TAB_META[tab].icon" /></span>
        <span class="hd-tab-label">{{ TAB_META[tab].label }}</span>
      </button>
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

.hd-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.hd-tab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.hd-tab:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
}

.hd-tab.active {
  background-color: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
}

/* 暗色模式覆盖（模式参考 WorkbenchView.vue:414-426） */
:root.dark .hd-tab {
  background-color: var(--bg-secondary, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .hd-tab:hover {
  background-color: var(--hover-bg, #374151);
  color: var(--text-primary, #f9fafb);
}

:root.dark .hd-tab.active {
  background-color: #1e3a5f;
  color: #60a5fa;
}
</style>
