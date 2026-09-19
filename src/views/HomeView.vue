<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, watchEffect } from 'vue'
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
import CountdownModal from '@/components/CountdownModal.vue'
import Icon from '../components/Icon.vue'
import AppSettingsDialog from '../components/AppSettingsDialog.vue'
import { useSitesStore } from '../stores/sites'
import { useCategoriesStore } from '../stores/categories'
import { useThemeStore } from '../stores/theme'
import { useAppSettingsStore } from '../stores/settings'
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts'
import { useHelpModal } from '../composables/useHelpModal'
import { useCloudSync } from '../composables/useCloudSync'
import type { SyncStatus } from '../composables/useCloudSync'

const store = useSitesStore()
const categoriesStore = useCategoriesStore()
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
const showCountdownModal = ref(false)
const editingSite = ref<Site | null>(null)

// ===== 视图模式：经典网格 / 侧边栏导航（默认经典，零改动） =====
type ViewMode = 'classic' | 'sidebar'
const viewMode = computed<ViewMode>({
  get: () => settingsStore.viewMode,
  set: (v) => settingsStore.setViewMode(v)
})
const sidebarOpen = ref(false) // 仅移动端抽屉用
function toggleSidebar(): void {
  sidebarOpen.value = !sidebarOpen.value
}
// 侧边栏分类导航（复用 store 分类与筛选，与顶部分类标签共享同一筛选态）
const sidebarCategories = computed(() => categoriesStore.allCategories)
const countByCategory = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  for (const site of store.sites) {
    counts[site.category] = (counts[site.category] ?? 0) + 1
  }
  return counts
})
const totalCount = computed(() => store.sites.length)
function selectCategory(id: string): void {
  if (store.selectedCategory === id) {
    store.setCategory('')
  } else {
    store.setCategory(id)
  }
  sidebarOpen.value = false // 移动端选中后自动收起抽屉
}

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

// ===== 本站筛选：独立输入框，只过滤下方卡片列表；顶部 GlobalSearch 仍走外部搜索引擎 =====
const siteFilter = ref(store.searchQuery)
watch(siteFilter, (v) => {
  store.setSearchQuery(v)
})
// 外部改了 store（清空筛选 / 分类联动）时回写输入框，保持双向一致
watch(
  () => store.searchQuery,
  (v) => {
    if (v !== siteFilter.value) siteFilter.value = v
  }
)

const hasAnyFilter = computed(
  () =>
    store.searchQuery.trim() !== '' ||
    store.selectedCategory !== '' ||
    store.selectedTags.length > 0 ||
    store.showOnlyInvalid
)

const filterCountText = computed(() => {
  const total = store.sites.length
  const shown = store.filteredSites.length
  return hasAnyFilter.value ? `筛选出 ${shown} / ${total} 个` : `共 ${total} 个`
})

function clearAllFilters(): void {
  store.clearFilters()
  store.showOnlyInvalid = false
  siteFilter.value = ''
}

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

// 注册键盘快捷键
useKeyboardShortcuts({
  onCloseModal: closeAllModals,
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
  <!-- 顶部统一 App Bar：左=工作台/销售台/学生台入口，右=同步/设置/帮助/倒计时；主题与经典侧边栏已迁入 设置→导航设置→显示控制 -->
  <div class="app-bar">
    <div class="app-bar-left">
      <button v-if="settingsStore.workbenchPageVisible !== false" class="btn-help" @click="router.push('/workbench')" :title="settingsStore.workbenchPageDisplayName"><Icon name="toolbox" /> <span class="nav-entry-label">{{ settingsStore.workbenchPageDisplayName }}</span></button>
      <button v-if="settingsStore.businessPageVisible !== false" class="btn-help" data-testid="nav-business-entry" @click="router.push('/business')" :title="settingsStore.businessPageDisplayName"><Icon name="store" /> <span class="nav-entry-label">{{ settingsStore.businessPageDisplayName }}</span></button>
      <button v-if="settingsStore.studentPageVisible !== false" class="btn-help" data-testid="nav-student-entry" @click="router.push('/student')" :title="settingsStore.studentPageDisplayName"><Icon name="notes" /> <span class="nav-entry-label">{{ settingsStore.studentPageDisplayName }}</span></button>
    </div>
    <div class="app-bar-right">
      <button
        v-if="cloudEnabled"
        class="btn-help wb-sync-btn"
        :class="syncStatusClass"
        :title="syncTip"
        data-testid="home-sync-now"
        :disabled="syncBusy || cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing'"
        @click="handleSyncNowClick"
      >{{ syncLabel }}</button>
      <button class="btn-help" @click="showSettingsDialog = true" title="设置" aria-label="设置">设置</button>
      <button class="btn-help" @click="openHelp" title="帮助" aria-label="帮助">帮助</button>
      <button class="btn-help" @click="showCountdownModal = true" title="倒计时" aria-label="倒计时"><Icon name="timer-sand" /></button>

    </div>
  </div>

  <!-- 视图外壳：侧边栏模式下挂左侧菜单；经典模式无额外包裹，布局完全不变 -->
  <div class="home-shell" :class="{ 'is-sidebar': viewMode === 'sidebar' }">
    <aside
      v-if="viewMode === 'sidebar'"
      class="nav-sidebar"
      :class="{ open: sidebarOpen }"
      aria-label="分类导航"
    >
      <div class="nav-sidebar-brand">
        <svg class="nav-brand-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2L2 7l10 5 10-5-10-5m0 7L2 14l10 5 10-5-10-5m0 7L2 21l10 5 10-5-10-5z" /></svg>
        <span>导航</span>
      </div>
      <div class="nav-sidebar-scroll">
        <div class="nav-sidebar-section-title">分类</div>
        <nav class="nav-sidebar-menu">
          <button
            type="button"
            class="nav-menu-item"
            :class="{ active: store.selectedCategory === '' }"
            @click="selectCategory('')"
          >
            <span class="nav-menu-icon">🗂️</span>
            <span class="nav-menu-label">全部</span>
            <span class="nav-menu-count">{{ totalCount }}</span>
          </button>
          <button
            v-for="cat in sidebarCategories"
            :key="cat.id"
            type="button"
            class="nav-menu-item"
            :class="{ active: store.selectedCategory === cat.id }"
            @click="selectCategory(cat.id)"
          >
            <span class="nav-menu-icon">{{ cat.icon }}</span>
            <span class="nav-menu-label">{{ cat.name }}</span>
            <span class="nav-menu-count">{{ countByCategory[cat.id] ?? 0 }}</span>
          </button>
        </nav>
        <div class="nav-sidebar-divider"></div>
        <div class="nav-sidebar-section-title">标签</div>
        <TagFilter />
      </div>
    </aside>

    <!-- 移动端抽屉遮罩 -->
    <div
      v-if="viewMode === 'sidebar' && sidebarOpen"
      class="nav-sidebar-backdrop"
      @click="sidebarOpen = false"
    ></div>

    <div class="container" :class="{ 'container-sidebar': viewMode === 'sidebar' }">
      <header class="header">
        <div class="header-top">
          <button
            v-if="viewMode === 'sidebar'"
            type="button"
            class="view-hamburger"
            @click="toggleSidebar"
            aria-label="打开/关闭分类菜单"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v2H3V6m0 5h18v2H3v-2m0 5h18v2H3v-2z" /></svg>
          </button>
          <div class="search-section">
            <GlobalSearch class="global-search-bar" />
          </div>
        </div>
      </header>

      <!-- 工具条：左侧「分类 · 标签」折叠开关（默认收起，可在设置 → 导航设置 → 导航筛选栏切换模式；侧边栏模式下由左侧菜单接管），右侧「筛选本站」只过滤下方卡片，与顶部外链搜索互不干扰 -->
      <div class="nav-toolbar">
        <button
          v-if="viewMode === 'classic'"
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

        <span class="nav-filter-count">{{ filterCountText }}</span>

        <div class="nav-site-filter">
          <svg class="nsf-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>
          <input
            v-model="siteFilter"
            type="text"
            class="nsf-input"
            data-testid="nav-site-filter"
            placeholder="筛选本站…"
            aria-label="按名称、描述或标签筛选本站"
          />
          <button v-if="siteFilter" type="button" class="nsf-clear" aria-label="清除关键词" @click="siteFilter = ''">×</button>
        </div>

        <button v-if="hasAnyFilter" type="button" class="nav-filter-clear" @click="clearAllFilters">清空筛选</button>
      </div>

      <div v-if="viewMode === 'classic' && settingsStore.navFiltersExpanded" class="nav-filter-panel" data-testid="nav-filter-panel">
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

      <Pagination @pageChange="handlePageChange" />

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

      <CountdownModal
        v-if="showCountdownModal"
        @close="showCountdownModal = false"
      />
    </div>
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

/* ===== 侧边栏导航布局 ===== */
.home-shell {
  min-height: 100vh;
}
.nav-sidebar {
  position: fixed;
  top: 56px;
  left: 0;
  bottom: 0;
  width: 240px;
  z-index: 90;
  display: flex;
  flex-direction: column;
  background-color: var(--color-surface, #fff);
  border-right: 1px solid var(--color-border, #e2e8f0);
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.04);
  transform: translateX(-100%);
  transition: transform 0.25s var(--motion-ease, ease);
  overflow: hidden;
}
.nav-sidebar.open {
  transform: translateX(0);
}
.nav-sidebar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 18px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}
.nav-brand-ico {
  width: 18px;
  height: 18px;
  fill: var(--color-primary, #3b82f6);
}
.nav-sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.nav-sidebar-section-title {
  font-size: 12px;
  color: var(--color-text-secondary, #94a3b8);
  padding: 8px 8px 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.nav-sidebar-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  color: var(--color-text-secondary, #64748b);
  font-size: 14px;
  transition: background-color 0.15s, color 0.15s;
}
.nav-menu-item:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text, #1e293b);
}
.nav-menu-item.active {
  background-color: rgba(59, 130, 246, 0.14);
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
}
.nav-menu-item:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: 1px;
}
.nav-menu-icon {
  width: 20px;
  flex: none;
  text-align: center;
  font-size: 15px;
}
.nav-menu-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nav-menu-count {
  font-size: 12px;
  color: var(--color-text-secondary, #94a3b8);
  background: var(--color-bg-hover, #f1f5f9);
  border-radius: 999px;
  padding: 1px 8px;
}
.nav-menu-item.active .nav-menu-count {
  background: rgba(59, 130, 246, 0.2);
  color: var(--color-primary, #3b82f6);
}
.nav-sidebar-divider {
  height: 1px;
  background: var(--color-border, #e2e8f0);
  margin: 12px 4px;
}
.nav-sidebar-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 85;
}

/* 侧边栏模式下容器让出左侧 240px（桌面端常驻显示） */
.container.container-sidebar {
  max-width: none;
  margin: 0;
  padding-left: 264px;
}

/* 移动端侧边栏汉堡按钮（仅侧边栏模式显示） */
.view-hamburger {
  display: none;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
}
.view-hamburger svg {
  width: 20px;
  height: 20px;
  fill: currentColor;
}
.header-top {
  display: flex;
  align-items: center;
  gap: 12px;
}
.header-top .search-section {
  flex: 1;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  padding-top: 84px; /* 为顶部统一 App Bar 留出空间 */
  padding-bottom: 32px;
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

/* 工具条：分类·标签开关 + 结果计数 + 本站筛选 + 清空（右侧对齐） */
.nav-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 16px;
}

.nav-toolbar .nav-filter-toggle {
  margin-top: 0;
}

.nav-filter-count {
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  white-space: nowrap;
}

.nav-site-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  height: 36px;
  min-width: 200px;
  padding: 0 10px;
  background: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 18px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.nav-site-filter:focus-within {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.nsf-icon {
  flex: none;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: var(--color-text-muted, #94a3b8);
  stroke-width: 2;
  stroke-linecap: round;
}

.nsf-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--color-text, #334155);
}

.nsf-input::placeholder {
  color: var(--color-text-muted, #94a3b8);
}

.nsf-clear {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-secondary, #64748b);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.nsf-clear:hover {
  background: var(--color-border, #e2e8f0);
  color: #ef4444;
}

.nav-filter-clear {
  flex: none;
  padding: 7px 12px;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
  background: transparent;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 18px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}

.nav-filter-clear:hover {
  color: #ef4444;
  border-color: #ef4444;
}

.nav-filter-hint {
  font-size: 12px;
  color: #b45309;
  background: #fef3c7;
  border-radius: 999px;
  padding: 1px 8px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #64748b;
  font-size: 16px;
}

/* 暗色模式 */
html.dark .app-bar {
  background-color: rgba(31, 41, 55, 0.82);
  border-bottom-color: var(--color-border, #374151);
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

/* 暗色模式下的侧边栏 */
html.dark .nav-sidebar {
  background-color: var(--color-surface, #1f2937);
  border-right-color: var(--color-border, #374151);
}
html.dark .nav-sidebar-brand {
  border-bottom-color: var(--color-border, #374151);
  color: var(--color-text, #e5e7eb);
}
html.dark .nav-menu-item {
  color: var(--color-text-secondary, #d1d5db);
}
html.dark .nav-menu-item:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text, #e5e7eb);
}
html.dark .nav-menu-item.active {
  background-color: rgba(59, 130, 246, 0.22);
  color: var(--color-primary, #60a5fa);
}
html.dark .nav-menu-count {
  background: var(--color-bg-hover, #374151);
  color: var(--color-text-secondary, #9ca3af);
}
html.dark .nav-menu-item.active .nav-menu-count {
  background: rgba(59, 130, 246, 0.32);
  color: var(--color-primary, #60a5fa);
}
html.dark .nav-sidebar-divider {
  background: var(--color-border, #374151);
}
html.dark .view-hamburger {
  border-color: var(--color-border, #374151);
  color: var(--color-text-secondary, #d1d5db);
}
html.dark .nav-site-filter {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}
html.dark .nsf-input {
  color: var(--color-text, #e5e7eb);
}
html.dark .nsf-clear {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text-secondary, #d1d5db);
}
html.dark .nav-filter-clear {
  color: var(--color-text-secondary, #d1d5db);
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
    /* 按钮放不下时内部横向滚动，避免溢出后被裁掉够不着 */
    flex-wrap: nowrap;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .app-bar-right::-webkit-scrollbar {
    display: none;
  }

  /* 视图切换收窄为纯图标，给工具按钮让出空间 */
  .view-toggle {
    width: 92px;
    margin-left: 4px;
  }
  .view-toggle-opt span {
    display: none;
  }

  .nav-entry-label {
    display: inline; /* 移动端恢复显示名称，与「学生工作台」一致（图标+文字） */
  }

  .btn-help {
    padding: 8px 10px;
  }

  .container {
    padding-top: 112px;
    /* 左右内边距收窄，给卡片网格让出宽度 */
    padding-left: 12px;
    padding-right: 12px;
    /* 分页已回归文档流，底部仅保留安全区与少量留白 */
    padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  }

  /* 站点网格：小屏降为 150px 最小列宽，360px 屏可排两列，一屏看到更多站点 */
  .sites-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }

  .nav-toolbar {
    margin-top: 12px;
    gap: 8px;
  }

  /* 窄屏：筛选框独占一行，避免和折叠开关互相挤压 */
  .nav-site-filter {
    margin-left: 0;
    flex: 1 1 100%;
    min-width: 0;
    height: 40px;
  }

  .empty-state {
    padding: 40px 16px;
    font-size: 15px;
  }

  /* 移动端侧边栏：改为抽屉（默认移出视口，open 时滑入） */
  .nav-sidebar {
    transform: translateX(-100%);
    width: 260px;
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.25);
  }
  .nav-sidebar.open {
    transform: translateX(0);
  }
  .view-hamburger {
    display: inline-flex;
  }
  /* 移动端侧边栏模式下容器不预留左侧空间（抽屉覆盖） */
  .container.container-sidebar {
    padding-left: 12px;
  }
}

/* 桌面端侧边栏常驻显示（覆盖移动端抽屉态） */
@media (min-width: 769px) {
  .nav-sidebar {
    transform: translateX(0) !important;
  }
  /* 桌面端不需要汉堡按钮与遮罩 */
  .view-hamburger {
    display: none !important;
  }
  .nav-sidebar-backdrop {
    display: none !important;
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
