<script setup lang="ts">
import { ref, computed, onMounted, watchEffect } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { Site } from '../types'
import SiteCard from '../components/SiteCard.vue'
import GlobalSearch from '../components/GlobalSearch.vue'
import CategoryTabs from '../components/CategoryTabs.vue'
import TagFilter from '../components/TagFilter.vue'
import Pagination from '../components/Pagination.vue'
import SiteModal from '../components/SiteModal.vue'
import SettingsButton from '../components/SettingsButton.vue'
import SearchEngineManager from '../components/SearchEngineManager.vue'
import HelpModal from '../components/HelpModal.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import { useSitesStore } from '../stores/sites'
import { useSearchEnginesStore } from '../stores/searchEngines'
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts'

const store = useSitesStore()
const enginesStore = useSearchEnginesStore()
const router = useRouter()
const route = useRoute()
const showModal = ref(false)
const showEngineManager = ref(false)
const showHelp = ref(false)
const editingSite = ref<Site | null>(null)

// 拖拽排序状态
const dragSourceUrl = ref<string | null>(null)
const dragOverUrl = ref<string | null>(null)

const handleDragStart = (site: Site) => {
  dragSourceUrl.value = site.url
}

const handleDragOver = (site: Site, event: DragEvent) => {
  event.preventDefault()
  if (dragSourceUrl.value && dragSourceUrl.value !== site.url) {
    dragOverUrl.value = site.url
  }
}

const handleDragLeave = () => {
  dragOverUrl.value = null
}

const handleDrop = (site: Site) => {
  if (dragSourceUrl.value && dragSourceUrl.value !== site.url) {
    store.swapSort(dragSourceUrl.value, site.url)
  }
  dragSourceUrl.value = null
  dragOverUrl.value = null
}

const handleDragEnd = () => {
  dragSourceUrl.value = null
  dragOverUrl.value = null
}

onMounted(() => {
  store.loadSites()
})

// 同步 URL query 参数与弹框状态（Ctrl+N / 直接访问 URL 均可打开弹框）
watchEffect(() => {
  const modal = route.query.modal as string | undefined

  if (modal === 'add') {
    editingSite.value = null
    showModal.value = true
    showEngineManager.value = false
    showHelp.value = false
  } else if (modal === 'edit') {
    const url = route.query.url as string | undefined
    if (url) {
      const site = store.sites.find(s => s.url === decodeURIComponent(url))
      if (site) {
        editingSite.value = { ...site }
        showModal.value = true
        showEngineManager.value = false
        showHelp.value = false
      }
    } else {
      // 有 modal=edit 但无 url → 关闭
      showModal.value = false
      editingSite.value = null
    }
  } else if (modal === 'engines') {
    showEngineManager.value = true
    showModal.value = false
    showHelp.value = false
  } else if (modal === 'help') {
    showHelp.value = true
    showModal.value = false
    showEngineManager.value = false
  } else {
    // 无 modal query → 关闭所有弹框（URL 清除时）
    showModal.value = false
    showEngineManager.value = false
    showHelp.value = false
    editingSite.value = null
  }
})

const filteredSites = computed(() => store.paginatedSites)

// 关闭所有弹框并清除 URL query
const closeAllModals = () => {
  showModal.value = false
  showEngineManager.value = false
  showHelp.value = false
  editingSite.value = null
  // 清除 URL query 参数（如果存在的话）
  if (route.query.modal) {
    router.push({ query: {} })
  }
}

// 切换到前台
const toggleAdmin = () => {
  router.push('/display')
}

// 注册键盘快捷键
useKeyboardShortcuts({
  onAddSite: () => {
    if (!showModal.value && !showEngineManager.value && !showHelp.value) {
      handleAdd()
    }
  },
  onCloseModal: closeAllModals,
  onToggleAdmin: toggleAdmin
})

const handleAdd = () => {
  editingSite.value = null
  router.push({ query: { modal: 'add' } })
}

const handleEdit = (site: Site) => {
  editingSite.value = { ...site }
  router.push({ query: { modal: 'edit', url: encodeURIComponent(site.url) } })
}

const handleDelete = (url: string) => {
  if (confirm('确定要删除这个网站吗？')) {
    store.deleteSite(url)
  }
}

const handleSave = (site: Site) => {
  if (editingSite.value) {
    // 编辑模式 - 直接更新
    store.updateSite(editingSite.value.url, site)
    closeAllModals()
    return
  }

  // 添加模式 - 检查重复
  const existing = store.sites.find(s => s.url === site.url)
  if (existing) {
    const action = confirm(`该网址已存在：${existing.name}\n\n确定更新？取消则跳过。`)
    if (action) {
      store.updateSite(site.url, site)
    }
    closeAllModals()
    return
  }

  // 无重复 - 正常添加
  store.addSite(site)
  closeAllModals()
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

  <!-- 右上角工具栏 -->
  <div class="top-right-toolbar">
    <ThemeToggle />
    <button class="btn-front" @click="toggleAdmin" title="切换到前台 (Ctrl+B)">
      前台
    </button>
  </div>

  <div class="container">
    <header class="header">
      <div class="search-section">
        <GlobalSearch class="global-search-bar" />
      </div>
      <div class="actions-row">
        <div class="action-buttons">
          <button class="btn-action" @click="triggerImport">导入</button>
          <button class="btn-action" @click="store.exportToMarkdown">导出</button>
          <button class="btn-action" @click="router.push({ query: { modal: 'help' } })">❓ 帮助</button>
          <button class="btn-action" @click="handleAdd">+ 添加网址</button>
          <button class="btn-action" @click="store.checkDeadLinks">
            <span v-if="store.isCheckingLinks">⏳ 检测中 ({{ store.linkCheckProgress?.current }}/{{ store.linkCheckProgress?.total }})</span>
            <span v-else>🔗 检测断链<span v-if="store.invalidCount > 0" class="invalid-count">({{ store.invalidCount }})</span></span>
          </button>
          <button class="btn-action" @click="router.push({ query: { modal: 'engines' } })">🔍 引擎管理</button>
          <SettingsButton />
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
        :is-drag-over="dragOverUrl === site.url"
        :is-dragging="dragSourceUrl === site.url"
        draggable="true"
        @edit="handleEdit"
        @delete="handleDelete"
        @dragstart="handleDragStart(site)"
        @dragover="handleDragOver(site, $event)"
        @dragleave="handleDragLeave"
        @drop="handleDrop(site)"
        @dragend="handleDragEnd"
      />
    </main>

    <Pagination />

    <div v-if="store.filteredSites.length === 0" class="empty-state">
      <p v-if="store.showOnlyInvalid">没有检测到无效链接 ✓</p>
      <p v-else>没有找到匹配的网站</p>
    </div>

    <SiteModal
      v-if="showModal"
      :site="editingSite"
      @save="handleSave"
      @close="closeAllModals"
    />

    <SearchEngineManager 
      v-if="showEngineManager" 
      @close="closeAllModals"
    />

    <HelpModal
      v-if="showHelp"
      @close="closeAllModals"
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

.btn-front {
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

.btn-front:hover {
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

/* 暗色模式 */
:root.dark .btn-front {
  background-color: var(--bg-secondary, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .btn-front:hover {
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
