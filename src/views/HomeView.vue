<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { Site } from '../types'
import SiteCard from '../components/SiteCard.vue'
import GlobalSearch from '../components/GlobalSearch.vue'
import CategoryTabs from '../components/CategoryTabs.vue'
import TagFilter from '../components/TagFilter.vue'
import Pagination from '../components/Pagination.vue'
import SiteModal from '../components/SiteModal.vue'
import SettingsButton from '../components/SettingsButton.vue'
import SearchEngineManager from '../components/SearchEngineManager.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import { useSitesStore } from '../stores/sites'
import { useSearchEnginesStore } from '../stores/searchEngines'

const store = useSitesStore()
const enginesStore = useSearchEnginesStore()
const router = useRouter()
const showModal = ref(false)
const showEngineManager = ref(false)
const editingSite = ref<Site | null>(null)

onMounted(() => {
  store.loadSites()
})

const filteredSites = computed(() => store.paginatedSites)

const handleAdd = () => {
  editingSite.value = null
  showModal.value = true
}

const handleEdit = (site: Site) => {
  editingSite.value = { ...site }
  showModal.value = true
}

const handleDelete = (url: string) => {
  if (confirm('确定要删除这个网站吗？')) {
    store.deleteSite(url)
  }
}

const handleSave = (site: Site) => {
  if (editingSite.value) {
    store.updateSite(editingSite.value.url, site)
  } else {
    store.addSite(site)
  }
  showModal.value = false
}

const goToDisplay = () => {
  router.push('/display')
}

// 处理文件导入
const handleImport = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    
    // 导入网站
    const result = store.importFromMarkdown(content)
    
    // 尝试导入搜索引擎
    try {
      const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*/)
      if (frontmatterMatch) {
        const yaml = (window as any).yaml
        if (yaml) {
          const data = yaml.load(frontmatterMatch[1])
          if (data?.searchEngines && Array.isArray(data.searchEngines)) {
            enginesStore.importEngines(data.searchEngines)
            alert(`导入完成！网站：新增 ${result.added} 条，跳过 ${result.skipped} 条；搜索引擎：已导入 ${data.searchEngines.length} 个`)
          } else {
            alert(`导入完成！新增 ${result.added} 条，跳过 ${result.skipped} 条（已存在）`)
          }
        } else {
          alert(`导入完成！新增 ${result.added} 条，跳过 ${result.skipped} 条（已存在）`)
        }
      } else {
        alert(`导入完成！新增 ${result.added} 条，跳过 ${result.skipped} 条（已存在）`)
      }
    } catch {
      alert(`导入完成！新增 ${result.added} 条，跳过 ${result.skipped} 条（已存在）`)
    }
    
    input.value = ''
  }
  reader.readAsText(file)
}

// 触发文件选择
const triggerImport = () => {
  const input = document.getElementById('import-file') as HTMLInputElement
  input?.click()
}
</script>

<template>
  <!-- 隐藏的文件输入框 -->
  <input
    id="import-file"
    type="file"
    accept=".md,text/markdown"
    style="display: none"
    @change="handleImport"
  />

  <div class="container">
    <header class="header">
      <div class="search-section">
        <GlobalSearch class="global-search-bar" />
      </div>
      <div class="actions-row">
        <div class="action-buttons">
          <button class="btn-action" @click="triggerImport">导入</button>
          <button class="btn-action" @click="store.exportToMarkdown">导出</button>
          <button class="btn-action" @click="goToDisplay">前台</button>
          <button class="btn-action" @click="handleAdd">+ 添加网址</button>
          <button class="btn-action" @click="showEngineManager = true">🔍 引擎管理</button>
          <SettingsButton />
          <ThemeToggle />
        </div>
      </div>
    </header>

    <CategoryTabs />

    <TagFilter />

    <main class="sites-grid">
      <SiteCard
        v-for="site in filteredSites"
        :key="site.url"
        :site="site"
        :readonly="false"
        @edit="handleEdit"
        @delete="handleDelete"
      />
    </main>

    <Pagination />

    <div v-if="store.filteredSites.length === 0" class="empty-state">
      <p>没有找到匹配的网站</p>
    </div>

    <SiteModal
      v-if="showModal"
      :site="editingSite"
      @save="handleSave"
      @close="showModal = false"
    />

    <SearchEngineManager 
      v-if="showEngineManager" 
      @close="showEngineManager = false" 
    />
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
  flex-wrap: wrap;
}

.action-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-action {
  padding: 10px 16px;
  background-color: white;
  color: #64748b;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-action:hover {
  background-color: #f1f5f9;
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
    flex-direction: column;
    align-items: stretch;
  }

  .action-buttons {
    width: 100%;
    flex-wrap: wrap;
  }

  .btn-action {
    flex: 1;
    min-width: 80px;
  }
}
</style>
