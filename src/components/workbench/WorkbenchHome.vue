<script setup lang="ts">
// 主页概览仪表盘（T12 填充）
// 必须声明 navigate：外壳通过 @navigate 接收面板跳转请求
const emit = defineEmits<{ navigate: [section: string] }>()
</script>

<template>
  <div class="wb-panel-stub">主页（开发中）</div>
</template>

<style scoped>
.wb-panel-stub {
  padding: 32px;
  color: var(--color-text-secondary, #64748b);
  font-size: 15px;
}
</style>
