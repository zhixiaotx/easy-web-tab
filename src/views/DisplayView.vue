<script setup lang="ts">
import Icon from '../components/Icon.vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSitesStore } from '../stores/sites'
import { useCountdownsStore } from '@/stores/countdowns'
import SiteCard from '../components/SiteCard.vue'
import GlobalSearch from '../components/GlobalSearch.vue'
import CategoryTabs from '../components/CategoryTabs.vue'
import TagFilter from '../components/TagFilter.vue'
import Pagination from '../components/Pagination.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import CountdownModal from '@/components/CountdownModal.vue'
import HelpModal from '../components/HelpModal.vue'
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts'
import { useHelpModal } from '../composables/useHelpModal'

const store = useSitesStore()
const countdownsStore = useCountdownsStore()
const router = useRouter()
const { showHelp, openHelp, closeHelp } = useHelpModal()
const showCountdownModal = ref(false)

onMounted(async () => {
  store.loadSites()
  await countdownsStore.loadCountdowns()
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

// 分页切换时只滚动网站区域
const sitesGridRef = ref<HTMLElement | null>(null)
const handlePageChange = () => {
  const grid = sitesGridRef.value
  if (grid) {
    grid.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}
</script>

<template>
  <!-- 右上角工具栏 -->
  <div class="top-right-toolbar">
    <ThemeToggle />
    <button class="btn-countdown" @click="showCountdownModal = true" title="倒计时"><Icon name="timer-sand" /></button>
    <button class="btn-help" @click="openHelp" title="帮助"><Icon name="help" /></button>
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

    <CategoryTabs :hideEmpty="true" />

    <TagFilter />

    <main ref="sitesGridRef" class="sites-grid">
      <SiteCard
        v-for="site in filteredSites"
        :key="site.url"
        :site="site"
        :readonly="true"
      />
    </main>

    <Pagination class="bottom-pagination" @pageChange="handlePageChange" />

    <div v-if="store.filteredSites.length === 0" class="empty-state">
      <p>没有找到匹配的网站</p>
    </div>

    <HelpModal
      v-if="showHelp"
      @close="closeHelp"
    />

    <CountdownModal
      v-if="showCountdownModal"
      @close="showCountdownModal = false"
    />
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
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.btn-admin:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

.btn-help,
.btn-countdown {
  padding: 8px 12px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.btn-help:hover,
.btn-countdown:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  padding-top: 70px; /* 为右上角工具栏留出空间 */
  padding-bottom: 120px; /* 为底部固定分页留出空间 */
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
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-secondary, #64748b);
  font-size: 16px;
}

/* 底部固定分页 */
.bottom-pagination {
  position: fixed;
  bottom: 48px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  background-color: var(--color-bg-card, rgba(255, 255, 255, 0.95));
  backdrop-filter: blur(10px);
  padding: 12px 24px;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

/* 暗色模式 */
html.dark .bottom-pagination {
  background-color: var(--color-bg-card, rgba(31, 41, 55, 0.95));
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

html.dark .btn-admin,
html.dark .btn-help,
html.dark .btn-countdown {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .btn-admin:hover,
html.dark .btn-help:hover,
html.dark .btn-countdown:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
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
