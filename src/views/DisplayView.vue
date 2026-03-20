<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSitesStore } from '../stores/sites'
import SiteCard from '../components/SiteCard.vue'
import GlobalSearch from '../components/GlobalSearch.vue'
import CategoryTabs from '../components/CategoryTabs.vue'
import TagFilter from '../components/TagFilter.vue'
import Pagination from '../components/Pagination.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts'

const store = useSitesStore()
const router = useRouter()

onMounted(() => {
  store.loadSites()
})

const filteredSites = computed(() => store.paginatedSites)

// 切换到管理后台
const toggleAdmin = () => {
  router.push('/')
}

// 注册键盘快捷键
useKeyboardShortcuts({
  onToggleAdmin: toggleAdmin
})
</script>

<template>
  <!-- 右上角工具栏 -->
  <div class="top-right-toolbar">
    <ThemeToggle />
    <button class="btn-admin" @click="toggleAdmin" title="切换到管理后台 (Ctrl+B)">
      管理
    </button>
  </div>

  <div class="container">
    <header class="header">
      <div class="search-section">
        <GlobalSearch class="global-search-bar" />
      </div>
    </header>

    <CategoryTabs />

    <TagFilter />

    <main class="sites-grid">
      <SiteCard
        v-for="site in filteredSites"
        :key="site.url"
        :site="site"
        :readonly="true"
      />
    </main>

    <Pagination />

    <div v-if="store.filteredSites.length === 0" class="empty-state">
      <p>没有找到匹配的网站</p>
    </div>
  </div>
</template>

<style scoped>
/* 右上角工具栏 */
.top-right-toolbar {
  position: fixed;
  top: 16px;
  right: 16px;
  display: flex;
  gap: 8px;
  z-index: 100;
}

.btn-admin {
  padding: 8px 14px;
  background-color: white;
  color: #64748b;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.btn-admin:hover {
  background-color: #f1f5f9;
  color: #3b82f6;
  border-color: #3b82f6;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  padding-top: 70px; /* 为右上角工具栏留出空间 */
}

.header {
  margin-bottom: 24px;
}

.search-section {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.global-search-bar {
  max-width: 750px;
  width: 100%;
}

.sites-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  margin-top: 24px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #64748b;
  font-size: 16px;
}

/* 暗色模式 */
:root.dark .btn-admin {
  background-color: var(--bg-secondary, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .btn-admin:hover {
  background-color: var(--hover-bg, #374151);
  color: var(--accent-color, #3b82f6);
  border-color: var(--accent-color, #3b82f6);
}

@media (max-width: 768px) {
  .top-right-toolbar {
    top: 8px;
    right: 8px;
  }

  .container {
    padding-top: 60px;
  }
}
</style>
