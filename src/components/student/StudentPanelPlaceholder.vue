<script setup lang="ts">
// 学生工作台占位面板：M1 基础框架下 13 个未实施面板（habits/homework/timetable/plan/
// review/mistakes/reading/exam/diary/pomodoro/achievements/rewards/parent）的统一占位。
// M2-M4 实施各模块时，逐个替换为真实面板组件并接入对应 store。
// 不依赖任何 student store（占位面板只读视图，无状态变更）

import Icon from '@/components/Icon.vue'

defineProps<{
  section: string
  sectionLabel: string
}>()

// 各面板的简短规划文案（M2-M4 上线后将替换为真实功能说明）
const ROADMAP: Record<string, string> = {
  habits: '习惯打卡（M2）：复刻成人习惯打卡，按学段播种默认习惯种子（K 7 项 / P 6 项 / J 5 项），家长协同查看完成情况。',
  homework: '作业管理（M2）：按学科录入作业，支持截止日期、完成状态、附件图片，K 段改为游戏化任务卡片。',
  timetable: '课程表（M2）：周视图 + 当日课时高亮，支持节次配置与调课，K 段改为每日活动安排。',
  plan: '学习计划（M3）：周计划 + 单元计划，自动联动作业/复习/错题，P/J 段专属。',
  review: '复习计划（M3）：艾宾浩斯遗忘曲线提醒，按学科 + 错题关联，P/J 段专属。',
  mistakes: '错题本（M3）：拍照录入 + 学科分类 + 复习关联，P/J 段专属。',
  reading: '阅读记录（M2）：书目 + 阅读时长 + 笔记摘录，全学段开放。',
  exam: '考试倒计时（M3）：复用倒计时引擎，按学科 + 考试类型分类，P/J 段专属。',
  diary: '学习日记（M2）：每日一篇，Markdown 编辑 + 历史回顾，全学段开放。',
  pomodoro: '番茄钟（M2）：复用成人番茄钟，学段默认时长（K 15+5 / P 25+5 / J 50+10）。',
  achievements: '成就勋章（M4）：完成作业/习惯/阅读自动颁发勋章，K/P 段专属。',
  rewards: '奖励积分（M4）：完成动作自动攒积分，家长可兑换奖励，K/P 段专属。',
  parent: '家长协同（M4）：PIN 解锁后查看孩子学习概况、完成情况、奖励兑换，K/P 段专属。'
}
</script>

<template>
  <div class="student-placeholder">
    <div class="ph-card">
      <span class="ph-icon"><Icon name="lightbulb" :size="32" /></span>
      <h2 class="ph-title">{{ sectionLabel }}</h2>
      <p class="ph-stage">规划中</p>
      <p class="ph-desc">{{ ROADMAP[section] ?? '该模块尚未规划。' }}</p>
    </div>
  </div>
</template>

<style scoped>
.student-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 240px;
}
.ph-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 24px;
  max-width: 480px;
  text-align: center;
  background: var(--color-surface, #ffffff);
  border: 1px dashed var(--color-border-strong, #d1d5db);
  border-radius: 12px;
}
.ph-icon {
  color: var(--color-text-muted, #6b7280);
}
.ph-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}
.ph-stage {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  color: var(--color-primary, #3b82f6);
  font-size: 12px;
  margin: 0;
}
.ph-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-muted, #6b7280);
  margin: 0;
}
</style>
