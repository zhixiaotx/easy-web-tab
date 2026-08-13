<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '@/composables/useToast'
import { idbExportAll, idbImportAll } from '@/composables/useIdb'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import { useWorkbenchNotesStore } from '@/stores/workbenchNotes'
import { useCountdownsStore } from '@/stores/countdowns'
import { usePasswordsStore } from '@/stores/passwords'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { useWorkbenchLedgerStore } from '@/stores/workbenchLedger'
import { useWorkbenchHabitsStore } from '@/stores/workbenchHabits'
import { useAppSettingsStore } from '@/stores/settings'
import { HEALTH_TABS, type HealthModule, type WorkbenchData } from '@/types'
import WorkbenchHome from '@/components/workbench/WorkbenchHome.vue'
import WorkbenchTodo from '@/components/workbench/WorkbenchTodo.vue'
import WorkbenchNotes from '@/components/workbench/WorkbenchNotes.vue'
import WorkbenchCountdown from '@/components/workbench/WorkbenchCountdown.vue'
import WorkbenchPomodoro from '@/components/workbench/WorkbenchPomodoro.vue'
import WorkbenchHabits from '@/components/workbench/WorkbenchHabits.vue'
import WorkbenchPassword from '@/components/workbench/WorkbenchPassword.vue'
import WorkbenchHealth from '@/components/workbench/WorkbenchHealth.vue'
import WorkbenchLedger from '@/components/workbench/WorkbenchLedger.vue'
import Icon from '@/components/Icon.vue'
import SpotlightOverlay from '@/components/SpotlightOverlay.vue'
import type { SpotlightAction } from '@/components/SpotlightOverlay.vue'
import type { SpotlightData } from '@/composables/spotlightCore'
import { useWorkbenchShortcuts } from '@/composables/useWorkbenchShortcuts'
import { captureSnapshot } from '@/composables/useSnapshots'
import { useSitesStore } from '@/stores/sites'

const router = useRouter()
const toast = useToast()
const todosStore = useWorkbenchTodosStore()
const notesStore = useWorkbenchNotesStore()
const countdownsStore = useCountdownsStore()
const passwordsStore = usePasswordsStore()
const healthStore = useWorkbenchHealthStore()
const ledgerStore = useWorkbenchLedgerStore()
const habitsStore = useWorkbenchHabitsStore()
const settingsStore = useAppSettingsStore()
const sitesStore = useSitesStore()

// 左侧菜单导航白名单（9 项；菜单项顺序/名称/图标由 workbenchMenuCore 经设置 store 驱动）
const SECTION_KEYS = [
  'home',
  'todos',
  'notes',
  'countdowns',
  'pomodoro',
  'habits',
  'passwords',
  'health',
  'ledger'
] as const
type SectionKey = (typeof SECTION_KEYS)[number]

const activeSection = ref<SectionKey>('home')

// 健康管理面板当前激活 tab（点击菜单「健康管理」不传 tab → 保留上次激活）
const activeHealthTab = ref<HealthModule>('exercise')

// WorkbenchHome 通过 @navigate 请求跳转（emits 声明为 string，这里做白名单收窄）
function navigateTo(section: string, tab?: string) {
  if ((SECTION_KEYS as readonly string[]).includes(section)) {
    activeSection.value = section as SectionKey
    if (section === 'health' && tab !== undefined && (HEALTH_TABS as readonly string[]).includes(tab)) {
      activeHealthTab.value = tab as HealthModule
    }
  }
}

// 菜单渲染项：顺序/名称/图标一律来自设置 store（workbenchMenuItems 由 core 解析，home 恒居首）
// 视图禁止内联重算排序/标签（顺序与改名经设置弹窗调整后在此直接生效）
const menuItems = computed(() => settingsStore.workbenchMenuItems)

// 侧栏折叠态：undefined（未设置）视为展开；持久化经 settingsStore（IDB store 'settings'）
const sidebarCollapsed = computed(() => settingsStore.workbenchSidebarCollapsed ?? false)

function toggleSidebar() {
  settingsStore.setWorkbenchSidebarCollapsed(!sidebarCollapsed.value)
}

// ===== 全局搜索（侧栏底部按钮 / Alt+K 打开）=====
const spotlightOpen = ref(false)

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
// Esc 关闭全局搜索（幂等）
useWorkbenchShortcuts({
  spotlightOpen,
  getMenuKeys: () => menuItems.value.map((item) => item.key),
  onNavigate: (key) => navigateTo(key as SectionKey)
})

// 实时时钟（每秒更新）
const now = ref(new Date())
let clockTimer: ReturnType<typeof setInterval> | undefined

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function formatClock(d: Date): string {
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  const weekday = d.toLocaleDateString('zh-CN', { weekday: 'long' })
  return `${formatDate(d)} ${time} ${weekday}`
}

const clockText = computed(() => formatClock(now.value))

onMounted(async () => {
  clockTimer = setInterval(() => {
    now.value = new Date()
  }, 1000)
  await Promise.all([
    todosStore.loadTodos(),
    notesStore.loadNotes(),
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

onUnmounted(() => {
  if (clockTimer !== undefined) clearInterval(clockTimer)
})

// 导出：读取全部 4 store 打包为 JSON 下载
async function handleExport() {
  try {
    const data = await idbExportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `工作台备份-${formatDate(new Date())}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // 稍后撤销对象 URL，避免影响下载的发起
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) {
    console.error('[Workbench] export failed', e)
    toast.error('导出失败')
  }
}

// 导入：解析 JSON → 密码双分支 → idbImportAll → 重载 → toast
const importInput = ref<HTMLInputElement | null>(null)

function handleImportClick() {
  importInput.value?.click()
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (e) => {
    input.value = '' // 允许再次选择同一文件
    const content = e.target?.result as string

    let parsed: WorkbenchData
    try {
      parsed = JSON.parse(content) as WorkbenchData
    } catch {
      toast.error('文件不是有效 JSON')
      return
    }

    // 密码分支先决：本设备没有 v2 主密码验证键（新设备/新 profile）→
    // 备份中的密码 blob 无法用本设备密钥解密，跳过密码导入（不写入 IDB，避免被空库覆盖）
    const skipPasswords = localStorage.getItem('password-verification-v2') === null

    try {
      if (skipPasswords) {
        await idbImportAll({ ...parsed, passwords: '' })
      } else {
        await idbImportAll(parsed)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '文件格式无效'
      toast.error(`导入失败：${msg}`)
      return
    }

    // 重载各 store（数据在内存中与 IDB 同步）
    await Promise.all([
      todosStore.loadTodos(),
      notesStore.loadNotes(),
      countdownsStore.loadCountdowns(),
      healthStore.loadHealth(),
      ledgerStore.loadLedger(),
      settingsStore.initSettings()
    ])

    if (skipPasswords) {
      toast.warning('备份中的密码数据无法在本设备解密（缺少加密密钥），已跳过密码导入')
    } else {
      // 用户此前已解锁过密码库 → 锁定，强制重新解锁后查看新数据
      if (passwordsStore.isUnlocked) {
        passwordsStore.lock()
        toast.success('密码库已导入，请重新解锁查看')
      }
    }

    // 成功 toast：仅统计 todos/notes/countdowns/健康/记账（密码不解密不计条数）
    const healthCount =
      healthStore.records.exercise.length +
      healthStore.records.diet.length +
      healthStore.records.sleep.length +
      healthStore.records.weight.length
    const countMsg = `导入成功：待办 ${todosStore.todos.length} 条，便签 ${notesStore.notes.length} 条，倒计时 ${countdownsStore.countdowns.length} 条，健康 运动/饮食/睡眠/体重 记录 ${healthCount} 条，记账 ${ledgerStore.entries.length} 笔`
    toast.success(skipPasswords ? `${countMsg}（密码已跳过）` : `${countMsg}；密码库已导入`)
  }
  reader.readAsText(file)
}
</script>

<template>
  <div class="wb-shell">
    <!-- 头部：左 = 返回 + 标题；右 = 时钟 + 导入导出 -->
    <header class="wb-header">
      <div class="wb-header-left">
        <button class="wb-btn" @click="router.back()">← 返回</button>
        <h1>工作台</h1>
      </div>
      <div class="wb-header-right">
        <span class="wb-clock" data-testid="wb-clock">{{ clockText }}</span>
        <button class="wb-btn" @click="handleImportClick">导入</button>
        <button class="wb-btn" @click="handleExport">导出</button>
        <input
          ref="importInput"
          type="file"
          accept=".json,application/json"
          style="display: none"
          @change="handleImportFile"
        />
      </div>
    </header>

    <!-- 主体：左菜单 + 右内容区 -->
    <div class="wb-body">
      <nav class="wb-menu" :class="{ collapsed: sidebarCollapsed }">
        <button
          class="wb-sidebar-toggle"
          data-testid="wb-sidebar-toggle"
          :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
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
          :data-testid="`wb-menu-${item.key}`"
          @click="navigateTo(item.key)"
        >
          <span class="wb-menu-icon"><Icon :name="item.icon" /></span>
          <span class="wb-menu-label">{{ item.label }}</span>
        </button>
        <button
          class="wb-menu-item wb-spotlight-open"
          data-testid="wb-spotlight-open"
          title="全局搜索 (Alt+K)"
          @click="spotlightOpen = true"
        >
          <span class="wb-menu-icon"><Icon name="search" /></span>
          <span class="wb-menu-label">全局搜索</span>
        </button>
      </nav>

      <main class="wb-content">
        <WorkbenchHome v-if="activeSection === 'home'" @navigate="navigateTo" />
        <WorkbenchTodo v-else-if="activeSection === 'todos'" />
        <WorkbenchNotes v-else-if="activeSection === 'notes'" />
        <WorkbenchCountdown v-else-if="activeSection === 'countdowns'" />
        <WorkbenchPomodoro v-else-if="activeSection === 'pomodoro'" />
        <WorkbenchHabits v-else-if="activeSection === 'habits'" />
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
  </div>
</template>

<style scoped>
/* 亮色基础样式（沿用 --color-* 全局 token） */
.wb-shell {
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
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  white-space: nowrap;
}

.wb-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.wb-clock {
  font-size: 14px;
  color: var(--color-text-secondary, #64748b);
  font-variant-numeric: tabular-nums;
  margin-right: 8px;
  white-space: nowrap;
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

/* 全局搜索入口固定在菜单底部（margin-top:auto 撑开与导航项间距） */
.wb-menu-item.wb-spotlight-open {
  margin-top: auto;
}

.wb-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  background-color: var(--color-bg, #f8fafc);
}

/* 暗色模式覆盖（模式参考 DisplayView.vue:199-215 与 dark.css:4-44） */
:root.dark .wb-shell {
  background-color: var(--bg-primary, #111827);
}

:root.dark .wb-header {
  background-color: var(--bg-secondary, #1f2937);
  border-bottom-color: var(--border-color, #374151);
}

:root.dark .wb-header-left h1 {
  color: var(--text-primary, #f9fafb);
}

:root.dark .wb-clock {
  color: var(--text-secondary, #d1d5db);
}

:root.dark .wb-btn {
  background-color: var(--bg-secondary, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .wb-btn:hover {
  background-color: var(--hover-bg, #374151);
  color: var(--accent-color, #3b82f6);
  border-color: var(--accent-color, #3b82f6);
}

:root.dark .wb-menu {
  background-color: var(--bg-secondary, #1f2937);
  border-right-color: var(--border-color, #374151);
}

:root.dark .wb-sidebar-toggle {
  color: var(--text-secondary, #d1d5db);
}

:root.dark .wb-sidebar-toggle:hover {
  background-color: var(--hover-bg, #374151);
  color: var(--text-primary, #f9fafb);
}

:root.dark .wb-menu-item {
  color: var(--text-secondary, #d1d5db);
}

:root.dark .wb-menu-item:hover {
  background-color: var(--hover-bg, #374151);
  color: var(--text-primary, #f9fafb);
}

:root.dark .wb-menu-item.active {
  background-color: #1e3a5f;
  color: #60a5fa;
}

:root.dark .wb-content {
  background-color: var(--bg-primary, #111827);
}

/* 移动端菜单底边框沿用亮色 token，暗色下需覆盖 */
@media (max-width: 768px) {
  :root.dark .wb-menu {
    border-bottom-color: var(--border-color, #374151);
  }
}

@media (max-width: 768px) {
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
  }
}
</style>
