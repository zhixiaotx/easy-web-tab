<script setup lang="ts">
import { ref } from 'vue'
import CategoryManager from './CategoryManager.vue'
import BackupManager from './BackupManager.vue'
import BackgroundManager from './BackgroundManager.vue'

const showCategoryManager = ref(false)
const showBackupManager = ref(false)
const showBackgroundManager = ref(false)
</script>

<template>
  <div class="settings-wrapper">
    <button 
      class="settings-btn background-btn" 
      @click="showBackgroundManager = true" 
      title="背景管理"
    >
      🖼️ 背景
    </button>
    
    <button 
      class="settings-btn" 
      @click="showCategoryManager = true" 
      title="分类管理"
    >
      ⚙️ 分类管理
    </button>
    
    <button 
      class="settings-btn backup-btn" 
      @click="showBackupManager = true" 
      title="数据备份"
    >
      📦 备份
    </button>

    <BackgroundManager v-if="showBackgroundManager" @close="showBackgroundManager = false" />
    
    <CategoryManager v-if="showCategoryManager" @close="showCategoryManager = false" />
    
    <BackupManager v-if="showBackupManager" @close="showBackupManager = false" />
  </div>
</template>

<style scoped>
.settings-wrapper {
  display: inline-flex;
  gap: 8px;
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

.background-btn {
  background-color: #fdf4ff;
}

.background-btn:hover {
  background-color: #fae8ff;
  border-color: #d946ef;
  color: #d946ef;
}

.backup-btn {
  background-color: #f0fdf4;
}

.backup-btn:hover {
  background-color: #dcfce7;
  border-color: #22c55e;
  color: #16a34a;
}
</style>
