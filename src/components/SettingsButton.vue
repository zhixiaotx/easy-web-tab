<script setup lang="ts">
import { ref } from 'vue'
import CategoryManager from './CategoryManager.vue'

const showManager = ref(false)

const toggleManager = () => {
  showManager.value = !showManager.value
}
</script>

<template>
  <div class="settings-wrapper">
    <button class="settings-btn" @click="toggleManager" title="分类管理">
      ⚙️ 分类管理
    </button>

    <CategoryManager v-if="showManager" @close="showManager = false" />
  </div>
</template>

<style scoped>
.settings-wrapper {
  display: inline-block;
}

.settings-btn {
  padding: 10px 16px;
  background-color: white;
  color: #64748b;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.settings-btn:hover {
  background-color: #f1f5f9;
  color: #3b82f6;
  border-color: #3b82f6;
}
</style>
