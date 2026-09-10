<script setup lang="ts">
// 学生健康管理（复刻成人 WorkbenchHealth 的四个模块，并新增「身高」标签页）
// 数据隔离：provideHealthStore 注入 useStudentHealthStore，让 WorkbenchExercise/Diet/Sleep/Weight
//   四个成人端子组件改成读写学生自己的数据（IDB 'student_health'），UI 零复制、成人端零改动。
// 切换动画与样式均对齐学生端（StudentToolbar + el-radio-button + scoped 变量）。

import { onMounted, ref } from 'vue'
import { STUDENT_HEALTH_TABS, type StudentHealthModule } from '@/types'
import { useStudentHealthStore } from '@/stores/studentHealth'
import { provideHealthStore } from '@/composables/healthStoreContext'
import WorkbenchExercise from '@/components/workbench/WorkbenchExercise.vue'
import WorkbenchDiet from '@/components/workbench/WorkbenchDiet.vue'
import WorkbenchSleep from '@/components/workbench/WorkbenchSleep.vue'
import WorkbenchWeight from '@/components/workbench/WorkbenchWeight.vue'
import StudentHealthHeight from '@/components/student/StudentHealthHeight.vue'
import Icon from '@/components/Icon.vue'

const TAB_META: Record<StudentHealthModule, { label: string; icon: string }> = {
  exercise: { label: '运动', icon: 'exercise' },
  diet: { label: '饮食', icon: 'diet' },
  sleep: { label: '睡眠', icon: 'sleep' },
  weight: { label: '体重', icon: 'weight' },
  height: { label: '身高', icon: 'trending-up' }
}

const store = useStudentHealthStore()
// 注入必须在子组件（Workbench* ）创建前完成 → setup 顶层同步调用
provideHealthStore(store)

const activeTab = ref<StudentHealthModule>('exercise')

onMounted(async () => {
  await store.loadHealth()
})
</script>

<template>
  <div class="st-health">
    <div class="sth-tabs" data-testid="sth-tabs">
      <el-radio-group v-model="activeTab" size="small">
        <el-radio-button
          v-for="tab in STUDENT_HEALTH_TABS"
          :key="tab"
          :value="tab"
          :data-testid="`sth-tab-${tab}`"
        >
          <span class="sth-tab-icon"><Icon :name="TAB_META[tab].icon" /></span>
          <span class="sth-tab-label">{{ TAB_META[tab].label }}</span>
        </el-radio-button>
      </el-radio-group>
    </div>

    <WorkbenchExercise v-if="activeTab === 'exercise'" />
    <WorkbenchDiet v-else-if="activeTab === 'diet'" />
    <WorkbenchSleep v-else-if="activeTab === 'sleep'" />
    <WorkbenchWeight v-else-if="activeTab === 'weight'" />
    <StudentHealthHeight v-else-if="activeTab === 'height'" />
  </div>
</template>

<style scoped>
.st-health {
  width: 100%;
}

/* 视觉对齐 WorkbenchHealth.vue 的 .hd-tabs（el-radio-button 组） */
.sth-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.sth-tabs :deep(.el-radio-group) {
  flex-wrap: wrap;
  gap: 8px;
}

.sth-tabs :deep(.el-radio-button + .el-radio-button) {
  margin-left: 0;
}

.sth-tabs :deep(.el-radio-button__inner) {
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

.sth-tab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.sth-tabs :deep(.el-radio-button__inner:hover) {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
}

.sth-tabs :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
  border-color: var(--color-primary, #3b82f6);
}

/* 暗色模式覆盖（同 WorkbenchHealth.vue） */
html.dark .sth-tabs :deep(.el-radio-button__inner) {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .sth-tabs :deep(.el-radio-button__inner:hover) {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text, #f9fafb);
}

html.dark .sth-tabs :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: #1e3a5f;
  color: #60a5fa;
  border-color: #60a5fa;
}

@media (max-width: 768px) {
  .sth-tabs :deep(.el-radio-button__inner) {
    padding: 6px 12px;
    font-size: 13px;
  }
}
</style>
