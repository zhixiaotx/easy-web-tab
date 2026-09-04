<script setup lang="ts">
// 学生工作台共享面板工具条
// 用法：
//   <StudentToolbar title="考试倒计时">
//     <button class="btn-primary" ...>新增</button>
//   </StudentToolbar>
// 左侧标题 h2，右侧默认 slot 放按钮/操作。纯展示，无业务逻辑。
defineProps<{
  title: string
}>()
</script>

<template>
  <div class="st-toolbar">
    <h2 class="st-title">{{ title }}</h2>
    <div class="st-actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.st-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.st-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}
.st-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
