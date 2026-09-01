<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '@/composables/useToast'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import { useWorkbenchNotesStore } from '@/stores/workbenchNotes'
import { useCountdownsStore } from '@/stores/countdowns'
import { usePasswordsStore } from '@/stores/passwords'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { useWorkbenchLedgerStore } from '@/stores/workbenchLedger'
import { useWorkbenchHabitsStore } from '@/stores/workbenchHabits'
import { useWorkbenchDiaryStore } from '@/stores/workbenchDiary'
import { useAppSettingsStore } from '@/stores/settings'
import AppSettingsDialog from '@/components/AppSettingsDialog.vue'
import { HEALTH_TABS, type HealthModule } from '@/types'
import WorkbenchHome from '@/components/workbench/WorkbenchHome.vue'
import WorkbenchTodo from '@/components/workbench/WorkbenchTodo.vue'
import WorkbenchNotes from '@/components/workbench/WorkbenchNotes.vue'
import WorkbenchCountdown from '@/components/workbench/WorkbenchCountdown.vue'
import WorkbenchPomodoro from '@/components/workbench/WorkbenchPomodoro.vue'
import WorkbenchHabits from '@/components/workbench/WorkbenchHabits.vue'
import WorkbenchHabitWeek from '@/components/workbench/WorkbenchHabitWeek.vue'
import WorkbenchPassword from '@/components/workbench/WorkbenchPassword.vue'
import WorkbenchHealth from '@/components/workbench/WorkbenchHealth.vue'
import WorkbenchLedger from '@/components/workbench/WorkbenchLedger.vue'
import WorkbenchDiary from '@/components/workbench/WorkbenchDiary.vue'
import Icon from '@/components/Icon.vue'
import SpotlightOverlay from '@/components/SpotlightOverlay.vue'
import type { SpotlightAction } from '@/components/SpotlightOverlay.vue'
import type { SpotlightData } from '@/composables/spotlightCore'
import { useWorkbenchShortcuts } from '@/composables/useWorkbenchShortcuts'
import { captureSnapshot } from '@/composables/useSnapshots'
import { useSitesStore } from '@/stores/sites'
import { useCloudSync } from '@/composables/useCloudSync'
import type { SyncStatus } from '@/composables/useCloudSync'

const router = useRouter()
const toast = useToast()
const todosStore = useWorkbenchTodosStore()
const notesStore = useWorkbenchNotesStore()
const countdownsStore = useCountdownsStore()
const passwordsStore = usePasswordsStore()
const healthStore = useWorkbenchHealthStore()
const ledgerStore = useWorkbenchLedgerStore()
const habitsStore = useWorkbenchHabitsStore()
const diaryStore = useWorkbenchDiaryStore()
const settingsStore = useAppSettingsStore()
const sitesStore = useSitesStore()

// 移动端菜单导航 ref（用于自动滚动到激活项）
const menuNavRef = ref<HTMLElement | null>(null)

// 左侧菜单导航白名单（10 项；菜单项顺序/名称/图标由 workbenchMenuCore 经设置 store 驱动）
const SECTION_KEYS = [
  'home',
  'todos',
  'notes',
  'diary',
  'countdowns',
  'pomodoro',
  'habits',
  'habit-week',
  'passwords',
  'health',
  'ledger'
] as const
type SectionKey = (typeof SECTION_KEYS)[number]

const activeSection = ref<SectionKey>('home')

// 健康管理面板当前激活 tab（点击菜单「健康管理」不传 tab → 保留上次激活）
const activeHealthTab = ref<HealthModule>('exercise')

// WorkbenchHome 通过 @navigate 请求跳转（emits 声明为 string，这里做白名单收窄）。
// 菜单开关关闭的功能不可进入（白名单 + 开关双重守卫）。
function navigateTo(section: string, tab?: string) {
  if ((SECTION_KEYS as readonly string[]).includes(section) && settingsStore.isWorkbenchMenuEnabled(section)) {
    activeSection.value = section as SectionKey
    if (section === 'health' && tab !== undefined && (HEALTH_TABS as readonly string[]).includes(tab)) {
      activeHealthTab.value = tab as HealthModule
    }
  }
}

// 菜单渲染项：顺序/名称/图标一律来自设置 store（workbenchMenuItems 由 core 解析，home 恒居首）
// 视图禁止内联重算排序/标签（顺序与改名经设置弹窗调整后在此直接生效）
const menuItems = computed(() => settingsStore.workbenchMenuItems)

// 菜单开关变化（设置弹窗切换）→ 当前激活区被关闭时回退到首个可见菜单项（home 恒可见）
watch(
  () => menuItems.value.map(item => item.key),
  (keys) => {
    if (keys.length === 0) return
    if (!keys.includes(activeSection.value)) {
      activeSection.value = keys[0] as SectionKey
    }
  }
)

// 移动端菜单：切换激活项时自动滚动到可视区域（横排 overflow-x:auto 容器）
watch(activeSection, async () => {
  await nextTick()
  const nav = menuNavRef.value
  if (!nav) return
  // 仅移动端（横排滚动态）生效；桌面端菜单不滚动
  if (nav.scrollWidth <= nav.clientWidth) return
  const active = nav.querySelector('.wb-menu-item.active') as HTMLElement | null
  if (active) {
    active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }
})

// 侧栏折叠态：undefined（未设置）视为展开；持久化经 settingsStore（IDB store 'settings'）
const sidebarCollapsed = computed(() => settingsStore.workbenchSidebarCollapsed ?? false)

function toggleSidebar() {
  settingsStore.setWorkbenchSidebarCollapsed(!sidebarCollapsed.value)
}

// ===== 全局搜索（右上角按钮 / Alt+K 打开）=====
const spotlightOpen = ref(false)
const showSettingsDialog = ref(false)

// 6 类数据源：密码不解密内容，仅 siteName/url 由 spotlightCore 匹配（core 契约）
const spotlightData = computed<SpotlightData>(() => ({
  todos: todosStore.todos,
  notes: notesStore.notes,
  countdowns: countdownsStore.countdowns,
  ledgerEntries: ledgerStore.entries,
  ledgerCategories: ledgerStore.categories,
  passwords: passwordsStore.passwords,
  sites: sitesStore.sites
}))

function handleSpotlightSelect(action: SpotlightAction) {
  spotlightOpen.value = false
  if (action.kind === 'navigate') {
    navigateTo(action.section)
  } else if (action.kind === 'password') {
    if (passwordsStore.isUnlocked) {
      navigateTo('passwords')
    } else {
      toast.warning('请先在密码管理面板解锁密码库')
    }
  } else if (action.kind === 'site') {
    window.open(action.url, '_blank')
  }
}

// 工作台快捷键：Alt+K 打开全局搜索（输入框内跳过）、Ctrl+Alt+1..9 跳转菜单（按设置 store 当前顺序）、
// Esc 关闭全局搜索（幂等）；g 切换个人/销售工作台，[ / ] 在模块间循环切换
useWorkbenchShortcuts({
  spotlightOpen,
  getMenuKeys: () => menuItems.value.map((item) => item.key),
  getCurrentSection: () => activeSection.value,
  onNavigate: (key) => navigateTo(key as SectionKey),
  isSectionEnabled: (key) => settingsStore.isWorkbenchMenuEnabled(key),
  router
})

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

onMounted(async () => {
  await Promise.all([
    todosStore.loadTodos(),
    notesStore.loadNotes(),
    diaryStore.loadDiary(),
    countdownsStore.loadCountdowns(),
    healthStore.loadHealth(),
    ledgerStore.loadLedger(),
    sitesStore.loadSites()
  ])
  // 习惯面板自管理数据加载（不接入上方 Promise.all，仿 WorkbenchPomodoro onMounted 自加载）
  await habitsStore.loadHabits()
  // 进入工作台自动快照（fire-and-forget：非阻塞、静默失败，绝不阻塞渲染；同日去重由 captureSnapshot 处理）
  captureSnapshot().catch(() => {})
})

// ===== 右上角云同步按钮（开关显示：cloudSyncEnabled 时在设置按钮左边新增）=====
const cloudSync = useCloudSync()
const syncBusy = ref(false)
const cloudEnabled = computed(() => !!settingsStore.cloudSyncEnabled)
const syncStatusClass = computed(
  (): Record<string, boolean> => ({
    'wb-sync-btn-pending': cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing',
    'wb-sync-btn-conflict': cloudSync.status.value === 'conflict',
    'wb-sync-btn-error': cloudSync.status.value === 'error'
  })
)
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
  if (syncBusy.value) return
  syncBusy.value = true
  await cloudSync.syncNow()
  syncBusy.value = false
}
</script>

<template>
  <div class="wb-shell">
    <!-- 头部：左 = 返回 + 标题；右 = 全局搜索 + 云同步（开关显示）+ 设置 -->
    <header class="wb-header">
      <div class="wb-header-left">
        <button class="wb-btn" @click="router.push('/')" title="返回管理页">
          <Icon name="arrow-left" />
        </button>
        <h1>{{ settingsStore.workbenchPageDisplayName }}</h1>
      </div>
      <div class="wb-header-right">
        <button class="wb-btn" data-testid="wb-spotlight-open" title="全局搜索 (Alt+K)" @click="spotlightOpen = true"><Icon name="search" /> 全局搜索</button>
        <button
          v-if="cloudEnabled"
          class="wb-btn wb-sync-btn"
          :class="syncStatusClass"
          :title="syncTip"
          data-testid="wb-sync-now"
          :disabled="syncBusy || cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing'"
          @click="handleSyncNowClick"
        ><Icon name="cloud" :size="14" /> {{ syncLabel }}</button>
        <button class="wb-btn" title="设置" data-testid="wb-settings" @click="showSettingsDialog = true"><Icon name="cog" :size="15" /> 设置</button>
      </div>
    </header>

    <!-- 主体：左菜单 + 右内容区 -->
    <div class="wb-body">
      <nav ref="menuNavRef" class="wb-menu" :class="{ collapsed: sidebarCollapsed }">
        <button
          class="wb-sidebar-toggle"
          data-testid="wb-sidebar-toggle"
          :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          :aria-label="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          @click="toggleSidebar"
        >
          <span class="wb-menu-icon">
            <Icon :name="sidebarCollapsed ? 'chevron-right' : 'chevron-left'" />
          </span>
          <span class="wb-menu-label">{{ sidebarCollapsed ? '展开' : '收起' }}</span>
        </button>
        <button
          v-for="item in menuItems"
          :key="item.key"
          class="wb-menu-item"
          :class="{ active: activeSection === item.key }"
          :title="item.label"
          :aria-label="item.label"
          :data-testid="`wb-menu-${item.key}`"
          @click="navigateTo(item.key)"
        >
          <span class="wb-menu-icon"><Icon :name="item.icon" /></span>
          <span class="wb-menu-label">{{ item.label }}</span>
        </button>
      </nav>

      <main class="wb-content">
        <WorkbenchHome v-if="activeSection === 'home'" @navigate="navigateTo" />
        <WorkbenchTodo v-else-if="activeSection === 'todos'" />
        <WorkbenchNotes v-else-if="activeSection === 'notes'" />
        <WorkbenchDiary v-else-if="activeSection === 'diary'" />
        <WorkbenchCountdown v-else-if="activeSection === 'countdowns'" />
        <WorkbenchPomodoro v-else-if="activeSection === 'pomodoro'" />
        <WorkbenchHabits v-else-if="activeSection === 'habits'" />
        <WorkbenchHabitWeek v-else-if="activeSection === 'habit-week'" />
        <WorkbenchPassword v-else-if="activeSection === 'passwords'" />
        <WorkbenchHealth v-else-if="activeSection === 'health'" :active-tab="activeHealthTab" @change="activeHealthTab = $event" />
        <WorkbenchLedger v-else-if="activeSection === 'ledger'" />
      </main>
    </div>

    <SpotlightOverlay
      v-if="spotlightOpen"
      :data="spotlightData"
      @select="handleSpotlightSelect"
      @close="spotlightOpen = false"
    />
    <AppSettingsDialog
      v-if="showSettingsDialog"
      @close="showSettingsDialog = false"
    />
  </div>
</template>

<style scoped>
/* 亮色基础样式（沿用 --color-* 全局 token） */
.wb-shell {
  height: 100dvh;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg, #f8fafc);
  color: var(--color-text, #1e293b);
}

.wb-header {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
  background-color: var(--color-bg-card, #ffffff);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.wb-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.wb-header-left h1 {
  font-size: var(--font-size-2xl, 20px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text, #1e293b);
  white-space: nowrap;
}

.wb-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.wb-btn {
  padding: 8px 12px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  white-space: nowrap;
}

.wb-btn:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

.wb-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.wb-menu {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 8px;
  background-color: var(--color-bg-card, #ffffff);
  border-right: 1px solid var(--color-border, #e2e8f0);
  transition: width 0.2s ease;
}

/* 侧栏折叠：56px 仅图标（label 隐藏、图标居中），展开宽度 200px 平滑过渡 */
.wb-menu.collapsed {
  width: 56px;
}

.wb-sidebar-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 4px;
  border: 1px solid transparent;
  border-radius: 8px;
  background-color: transparent;
  color: var(--color-text-secondary, #64748b);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.wb-sidebar-toggle:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
}

.wb-menu.collapsed .wb-sidebar-toggle {
  justify-content: center;
  padding: 10px 0;
}

.wb-menu.collapsed .wb-menu-label {
  display: none;
}

.wb-menu.collapsed .wb-menu-item {
  justify-content: center;
  padding: 10px 0;
}

.wb-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background-color: transparent;
  color: var(--color-text-secondary, #64748b);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.wb-menu-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 溢出省略作用于内部 label span（对按钮本身设 ellipsis 不会截断子 span 文本）：
   min-width:0 允许 flex 项收缩，配合 overflow/text-overflow/nowrap 生效 */
.wb-menu-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wb-menu-item:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
}

.wb-menu-item.active {
  background-color: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
}

.wb-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg, #f8fafc);
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}

/* 暗色模式覆盖（模式参考 DisplayView.vue:199-215 与 dark.css:4-44） */
:root.dark .wb-shell {
  background-color: var(--color-bg, #111827);
}

:root.dark .wb-header {
  background-color: var(--color-bg-card, #1f2937);
  border-bottom-color: var(--color-border, #374151);
}

:root.dark .wb-header-left h1 {
  color: var(--color-text, #f9fafb);
}

:root.dark .wb-btn {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

:root.dark .wb-btn:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

:root.dark .wb-menu {
  background-color: var(--color-bg-card, #1f2937);
  border-right-color: var(--color-border, #374151);
}

:root.dark .wb-sidebar-toggle {
  color: var(--color-text-secondary, #d1d5db);
}

:root.dark .wb-sidebar-toggle:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text, #f9fafb);
}

:root.dark .wb-menu-item {
  color: var(--color-text-secondary, #d1d5db);
}

:root.dark .wb-menu-item:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text, #f9fafb);
}

:root.dark .wb-menu-item.active {
  background-color: #1e3a5f;
  color: #60a5fa;
}

:root.dark .wb-content {
  background-color: var(--color-bg, #111827);
}

/* 移动端菜单底边框沿用亮色 token，暗色下需覆盖 */
@media (max-width: 768px) {
  :root.dark .wb-menu {
    border-bottom-color: var(--color-border, #374151);
  }
}

/* 桌面一屏契约：面板根钉满内容区（flex-stretch，不用百分比高度） */
@media (min-width: 769px) {
  .wb-content { overflow: hidden; }
  .wb-content > * { flex: 1; min-height: 0; }
}

@media (max-width: 768px) {
  .wb-content { overflow-y: auto; }
  .wb-content > * { flex: none; }

  .wb-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .wb-body {
    flex-direction: column;
  }

  .wb-menu {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    border-right: none;
    border-bottom: 1px solid var(--color-border, #e2e8f0);
  }

  /* 移动端横排布局：忽略折叠态（始终全宽 + 显示 label），隐藏折叠按钮 */
  .wb-menu.collapsed {
    width: 100%;
  }

  .wb-menu.collapsed .wb-menu-label {
    display: inline;
  }

  .wb-menu.collapsed .wb-menu-item {
    justify-content: flex-start;
    padding: 10px 12px;
  }

  .wb-sidebar-toggle {
    display: none;
  }

  .wb-menu-item {
    white-space: nowrap;
    scroll-snap-align: start;
  }

  /* P3-14 移动端触控目标 ≥40px（侧栏菜单项 / 头部按钮） */
  .wb-menu-item {
    min-height: 40px;
    min-width: 40px;
  }

  .wb-btn {
    min-height: 40px;
  }

  /* P3-13 窄屏间距压缩：内容区内边距收窄 */
  .wb-content {
    padding: 12px;
  }
}

/* ===== 右上角云同步按钮（头部设置按钮左侧）状态视觉 ===== */
.wb-sync-btn {
  transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease, opacity 120ms ease;
}
.wb-sync-btn.wb-sync-btn-pending {
  background-color: var(--color-primary, #3b82f6);
  color: #fff;
  border-color: var(--color-primary, #3b82f6);
  opacity: 0.88;
  cursor: progress !important;
}
.wb-sync-btn.wb-sync-btn-conflict {
  background-color: #f59e0b;
  color: #fff;
  border-color: #f59e0b;
}
.wb-sync-btn.wb-sync-btn-error {
  background-color: #ef4444;
  color: #fff;
  border-color: #ef4444;
}
</style>
