<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watchEffect } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { Site } from '../types'
import SiteCard from '../components/SiteCard.vue'
import GlobalSearch from '../components/GlobalSearch.vue'
import CategoryTabs from '../components/CategoryTabs.vue'
import TagFilter from '../components/TagFilter.vue'
import Pagination from '../components/Pagination.vue'
import SiteModal from '../components/SiteModal.vue'
import BackgroundManager from '../components/BackgroundManager.vue'
import CategoryManager from '../components/CategoryManager.vue'
import BackupManager from '../components/BackupManager.vue'
import IconManager from '../components/IconManager.vue'
import SearchEngineManager from '../components/SearchEngineManager.vue'
import HelpModal from '../components/HelpModal.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import Icon from '../components/Icon.vue'
import AppSettingsDialog from '../components/AppSettingsDialog.vue'
import { useSitesStore } from '../stores/sites'
import { useThemeStore } from '../stores/theme'
import { useAppSettingsStore } from '../stores/settings'
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts'
import { useHelpModal } from '../composables/useHelpModal'
import { useCloudSync } from '../composables/useCloudSync'
import type { SyncStatus } from '../composables/useCloudSync'

const store = useSitesStore()
const themeStore = useThemeStore()
const settingsStore = useAppSettingsStore()
const { showHelp, openHelp, closeHelp } = useHelpModal()
const router = useRouter()
const route = useRoute()
const showModal = ref(false)
const showEngineManager = ref(false)
const showBackgroundManager = ref(false)
const showCategoryManager = ref(false)
const showBackupManager = ref(false)
const showIconManager = ref(false)
const showSettingsDialog = ref(false)
const editingSite = ref<Site | null>(null)

// ===== 右上角云同步快捷按钮（开关开启时显示；共享 useCloudSync 单例，与设置弹窗互相同步状态） =====
const cloudSync = useCloudSync()
const cloudEnabled = computed((): boolean => settingsStore.cloudSyncEnabled === true)
const syncBusy = computed(
  (): boolean => cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing'
)
const syncStatusClass = computed(
  (): Record<string, boolean> => ({
    'wb-sync-btn-pending': cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing',
    'wb-sync-btn-conflict': cloudSync.status.value === 'conflict',
    'wb-sync-btn-error': cloudSync.status.value === 'error'
  })
)
function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n
}
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
const syncLabel = computed((): string => {
  switch (cloudSync.status.value as SyncStatus) {
    case 'pulling': return '拉取中…'
    case 'pushing': return '推送中…'
    case 'conflict': return '处理冲突'
    case 'error': return '同步失败'
    default: return '云同步'
  }
})
const syncTip = computed((): string => {
  const t = cloudSync.lastSyncAt.value
  if (!t) return '未同步过；点击立即同步'
  const d = new Date(t)
  return `上次同步：${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}；点击立即同步`
})
async function handleSyncNowClick(): Promise<void> {
  await cloudSync.syncNow()
}

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
    closeHelp()
  } else if (modal === 'edit') {
    const url = route.query.url as string | undefined
    if (url) {
      const site = store.sites.find(s => s.url === decodeURIComponent(url))
      if (site) {
        editingSite.value = { ...site }
        showModal.value = true
        showEngineManager.value = false
        closeHelp()
      }
    } else {
      // 有 modal=edit 但无 url → 关闭
      showModal.value = false
      editingSite.value = null
    }
  } else if (modal === 'engines') {
    showEngineManager.value = true
    showModal.value = false
    closeHelp()
  } else if (modal === 'help') {
    openHelp()
    showModal.value = false
    showEngineManager.value = false
  } else if (modal === 'background') {
    showBackgroundManager.value = true
    showModal.value = false
    showEngineManager.value = false
    closeHelp()
  } else if (modal === 'category') {
    showCategoryManager.value = true
    showModal.value = false
    showEngineManager.value = false
    closeHelp()
  } else if (modal === 'backup') {
    showBackupManager.value = true
    showModal.value = false
    showEngineManager.value = false
    closeHelp()
  } else if (modal === 'icons') {
    showIconManager.value = true
    showModal.value = false
    showEngineManager.value = false
    closeHelp()
  } else {
    // 无 modal query → 关闭所有弹框（URL 清除时）
    showModal.value = false
    showEngineManager.value = false
    showBackgroundManager.value = false
    showCategoryManager.value = false
    showBackupManager.value = false
    showIconManager.value = false
    closeHelp()
    editingSite.value = null
  }
})

const filteredSites = computed(() => store.paginatedSites)

// 关闭所有弹框并清除 URL query
const closeAllModals = () => {
  showModal.value = false
  showEngineManager.value = false
  showBackgroundManager.value = false
  showCategoryManager.value = false
  showBackupManager.value = false
  showIconManager.value = false
  showSettingsDialog.value = false
  closeHelp()
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
  onCloseModal: closeAllModals,
  onToggleAdmin: toggleAdmin,
  onToggleTheme: () => themeStore.toggleTheme()
})

const handleEdit = (site: Site) => {
  editingSite.value = { ...site }
  router.push({ query: { modal: 'edit', url: encodeURIComponent(site.url) } })
}

const handleDelete = (url: string) => {
  if (confirm('确定要删除这个网站吗？')) {
    store.deleteSite(url)
  }
}

const handleUnmark = (url: string) => {
  if (confirm('确定要取消失效标记吗？')) {
    store.unmarkInvalid(url)
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

// 分页切换时只滚动网站区域
const sitesGridRef = ref<HTMLElement | null>(null)
const handlePageChange = () => {
  const grid = sitesGridRef.value
  if (grid) {
    grid.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// ===== 移动端分页：≤768px 默认显示全部、隐藏底部分页条 =====
// 桌面断点与 usePanelPaging 保持一致：(min-width: 769px) 为桌面；≤768px 视为移动端。
// 移动端把 pageSize 设为 99999（Pagination 的「全部」模式），页码按钮随 isAllMode 自动隐藏，列表渲染全量；
// 桌面端恢复此前桌面每页条数，避免覆盖用户在设置里选过的每页条数。
const pagingMql = window.matchMedia('(min-width: 769px)')
let desktopPageSize = 18
function syncMobilePaging(): void {
  if (pagingMql.matches) {
    store.setPageSize(desktopPageSize)
  } else {
    if (store.pageSize !== 99999) desktopPageSize = store.pageSize
    store.setPageSize(99999)
    store.setPage(1)
  }
}
onMounted(() => {
  syncMobilePaging()
  pagingMql.addEventListener('change', syncMobilePaging)
})
onUnmounted(() => {
  pagingMql.removeEventListener('change', syncMobilePaging)
})
</script>

<template>
  <!-- 顶部统一 App Bar：左=工作台/销售台/学生台入口，右=主题/同步/设置/帮助/前台 -->
  <div class="app-bar">
    <div class="app-bar-left">
      <button v-if="settingsStore.workbenchPageVisible !== false" class="btn-help" @click="router.push('/workbench')" :title="settingsStore.workbenchPageDisplayName"><Icon name="toolbox" /> <span class="nav-entry-label">{{ settingsStore.workbenchPageDisplayName }}</span></button>
      <button v-if="settingsStore.businessPageVisible !== false" class="btn-help" data-testid="nav-business-entry" @click="router.push('/business')" :title="settingsStore.businessPageDisplayName"><Icon name="store" /> <span class="nav-entry-label">{{ settingsStore.businessPageDisplayName }}</span></button>
      <button v-if="settingsStore.studentPageVisible !== false" class="btn-help" data-testid="nav-student-entry" @click="router.push('/student')" :title="settingsStore.studentPageDisplayName"><Icon name="notes" /> <span class="nav-entry-label">{{ settingsStore.studentPageDisplayName }}</span></button>
    </div>
    <div class="app-bar-right">
      <ThemeToggle />
      <button
        v-if="cloudEnabled"
        class="btn-help wb-sync-btn"
        :class="syncStatusClass"
        :title="syncTip"
        data-testid="home-sync-now"
        :disabled="syncBusy || cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing'"
        @click="handleSyncNowClick"
      >{{ syncLabel }}</button>
      <button class="btn-help" @click="showSettingsDialog = true" title="设置" aria-label="设置"><Icon name="cog" /></button>
      <button class="btn-help" @click="openHelp" title="帮助" aria-label="帮助"><Icon name="help" /></button>
      <button class="btn-front" @click="toggleAdmin" title="切换到前台 (Ctrl+B)">
        前台
      </button>
    </div>
  </div>

  <div class="container">
    <header class="header">
      <div class="search-section">
        <GlobalSearch class="global-search-bar" />
      </div>
    </header>

    <!-- 分类 · 标签筛选栏：折叠开关（默认收起，可在设置 → 导航设置 → 导航筛选栏切换模式） -->
    <button
      class="nav-filter-toggle"
      data-testid="nav-filter-toggle"
      :aria-expanded="settingsStore.navFiltersExpanded"
      @click="settingsStore.setNavFiltersExpanded(!settingsStore.navFiltersExpanded)"
    >
      <span class="nav-filter-chevron" :class="{ open: settingsStore.navFiltersExpanded }">▸</span>
      <span>分类 · 标签</span>
      <span v-if="!settingsStore.navFiltersExpanded && (store.selectedCategory !== '' || store.selectedTags.length > 0 || store.showOnlyInvalid)" class="nav-filter-hint">
        有筛选
      </span>
    </button>

    <div v-show="settingsStore.navFiltersExpanded" class="nav-filter-panel" data-testid="nav-filter-panel">
      <CategoryTabs />

      <TagFilter />
    </div>

    <main ref="sitesGridRef" class="sites-grid">
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
        @unmark="handleUnmark"
        @dragstart="handleDragStart(site)"
        @dragover="handleDragOver(site, $event)"
        @dragleave="handleDragLeave"
        @drop="handleDrop(site)"
        @dragend="handleDragEnd"
      />
    </main>

    <Pagination class="bottom-pagination" @pageChange="handlePageChange" />

    <div v-if="store.filteredSites.length === 0" class="empty-state">
      <p v-if="store.showOnlyInvalid">没有检测到无效链接 <Icon name="check" /></p>
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

    <AppSettingsDialog
      v-if="showSettingsDialog"
      source="nav"
      @close="showSettingsDialog = false"
    />

    <BackgroundManager v-if="showBackgroundManager" @close="closeAllModals" />

    <CategoryManager v-if="showCategoryManager" @close="closeAllModals" />

    <BackupManager v-if="showBackupManager" @close="closeAllModals" />

    <IconManager v-if="showIconManager" @close="closeAllModals" />
  </div>
</template>

<style scoped>
/* 顶部统一 App Bar */
.app-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background-color: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  box-shadow: 0 1px 2px var(--color-shadow, rgba(0, 0, 0, 0.08));
}

.app-bar-left,
.app-bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* ThemeToggle 自带白卡样式，在 App Bar 内统一为 ghost，与其余按钮视觉一致 */
.app-bar-right :deep(.theme-toggle) {
  background-color: transparent;
  color: var(--color-text-secondary, #64748b);
  border-color: transparent;
  box-shadow: none;
}

.app-bar-right :deep(.theme-toggle:hover) {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-border, #e2e8f0);
}

.nav-entry-label {
  white-space: nowrap;
}

.btn-front {
  padding: 8px 14px;
  background-color: transparent;
  color: var(--color-text-secondary, #64748b);
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-front:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-border, #e2e8f0);
}

.btn-help {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background-color: transparent;
  color: var(--color-text-secondary, #64748b);
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-help:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-border, #e2e8f0);
}

/* 导航页「添加网站」主行动按钮 */
.btn-add-site {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background-color: var(--color-primary, #3b82f6);
  color: #fff;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--motion-duration, 220ms) var(--motion-ease, ease), transform var(--motion-duration, 220ms) var(--motion-ease, ease);
  white-space: nowrap;
}

.btn-add-site:hover {
  background-color: var(--color-primary-hover, #2563eb);
}

.btn-add-site:active {
  transform: var(--motion-press, scale(0.97));
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  padding-top: 84px; /* 为顶部统一 App Bar 留出空间 */
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

/* 分类 · 标签筛选栏折叠开关（默认收起；设置 → 导航设置 → 导航筛选栏可切换模式） */
.nav-filter-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 8px 16px;
  background-color: white;
  color: #64748b;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-filter-toggle:hover {
  color: #3b82f6;
  border-color: #3b82f6;
}

.nav-filter-chevron {
  display: inline-block;
  transition: transform 0.2s ease;
}

.nav-filter-chevron.open {
  transform: rotate(90deg);
}

.nav-filter-panel {
  display: flex;
  flex-direction: column;
}

.nav-filter-hint {
  font-size: 12px;
  color: #b45309;
  background: #fef3c7;
  border-radius: 999px;
  padding: 1px 8px;
}

/* 底部固定分页 */
.bottom-pagination {
  position: fixed;
  bottom: 48px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  background-color: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  padding: 12px 24px;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #64748b;
  font-size: 16px;
}

/* 暗色模式 */
html.dark .bottom-pagination {
  background-color: rgba(31, 41, 55, 0.95);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

html.dark .app-bar {
  background-color: rgba(31, 41, 55, 0.82);
  border-bottom-color: var(--color-border, #374151);
}

html.dark .btn-front {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .btn-front:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-border, #374151);
}

/* 左上角入口按钮（暗色，与全局 .btn-help 暗色一致） */
html.dark .app-bar .btn-help {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .app-bar .btn-help:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-border, #374151);
}

html.dark .app-bar-right :deep(.theme-toggle) {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .app-bar-right :deep(.theme-toggle:hover) {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-border, #374151);
}

@media (max-width: 768px) {
  .app-bar {
    padding: 8px 10px;
    gap: 8px;
    flex-wrap: wrap;
  }

  .app-bar-left,
  .app-bar-right {
    gap: 4px;
    flex: 1 1 100%;
  }

  /* 窄屏左入口（图标+名称）与右侧按钮各占一行，名称常显，避免互相挤压溢出 */
  .app-bar-left {
    overflow-x: auto;
    scrollbar-width: none;
  }
  .app-bar-left::-webkit-scrollbar {
    display: none;
  }
  .app-bar-right {
    justify-content: flex-start;
  }

  .nav-entry-label {
    display: inline; /* 移动端恢复显示名称，与「学生工作台」一致（图标+文字） */
  }

  .btn-help {
    padding: 8px 10px;
  }

  /* 移动端隐藏右上角「前台」按钮（PC 端保留，不动） */
  .btn-front {
    display: none;
  }

  .container {
    padding-top: 112px;
    /* 左右内边距收窄，给卡片网格让出宽度 */
    padding-left: 12px;
    padding-right: 12px;
    /* 移动端底部分页条已隐藏（默认显示全部），仅保留安全区与少量留白 */
    padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  }

  /* 移动端：默认显示全部，隐藏底部分页条（页码按钮随 isAllMode 自动消失，这里连每页条数下拉一并收起） */
  .bottom-pagination {
    display: none;
  }

  /* 站点网格：小屏降为 150px 最小列宽，360px 屏可排两列，一屏看到更多站点 */
  .sites-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }

  .nav-filter-toggle {
    margin-top: 12px;
  }

  .empty-state {
    padding: 40px 16px;
    font-size: 15px;
  }

  /* 底部固定分页：浮空胶囊在窄屏会换行撑高并遮挡内容，改为贴底全宽条 */
  /* 选择器带 .container 提升特异性，覆盖 Pagination 组件内 .pagination-wrapper 的 margin/padding */
  .container .bottom-pagination {
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    transform: none;
    margin-top: 0;
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.12);
  }

  html.dark .container .bottom-pagination {
    background-color: rgba(31, 41, 55, 0.95);
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4);
  }
}

/* ===== 右上角云同步按钮（设置按钮左侧）状态视觉 ===== */
.wb-sync-btn {
  transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease, opacity 120ms ease;
}
.wb-sync-btn.wb-sync-btn-pending {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
  opacity: 0.88;
  cursor: progress !important;
}
.wb-sync-btn.wb-sync-btn-conflict {
  background-color: #f59e0b !important;
  color: #fff !important;
  border-color: #f59e0b !important;
}
.wb-sync-btn.wb-sync-btn-error {
  background-color: #ef4444 !important;
  color: #fff !important;
  border-color: #ef4444 !important;
}
</style>
