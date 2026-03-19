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

const store = useSitesStore()
const router = useRouter()

onMounted(() => {
  store.loadSites()
})

const filteredSites = computed(() => store.paginatedSites)

const goToAdmin = () => {
  router.push('/')
}
</script>

<template>
  <div class="container">
    <header class="header">
      <div class="search-section">
        <GlobalSearch class="global-search-bar" />
      </div>
      <div class="actions-row">
        <button class="btn-admin" @click="goToAdmin">管理后台</button>
        <ThemeToggle />
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
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
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

.actions-row {
  display: flex;
  justify-content: center;
  gap: 12px;
  align-items: center;
}

.btn-admin {
  padding: 10px 16px;
  background-color: #f1f5f9;
  color: #64748b;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-admin:hover {
  background-color: #e2e8f0;
  color: #3b82f6;
  border-color: #3b82f6;
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

@media (max-width: 768px) {
  .actions-row {
    width: 100%;
  }

  .btn-admin {
    width: 100%;
  }
}
</style>
