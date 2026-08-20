<script setup lang="ts">
// 销售记账独立页面（摆摊进销存）：布局复刻 WorkbenchView（左树 + 右内容，桌面一屏钉满、移动端横排菜单）
import { onMounted, ref, toRaw } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { useToast } from '@/composables/useToast'
import { localDateKey } from '@/composables/businessCore'
import { useAppSettingsStore } from '@/stores/settings'
import BusinessHome from '@/components/business/BusinessHome.vue'
import BusinessProducts from '@/components/business/BusinessProducts.vue'
import BusinessPurchases from '@/components/business/BusinessPurchases.vue'
import BusinessDaily from '@/components/business/BusinessDaily.vue'
import BusinessExpenses from '@/components/business/BusinessExpenses.vue'
import BusinessInventory from '@/components/business/BusinessInventory.vue'
import BusinessStats from '@/components/business/BusinessStats.vue'
import AppSettingsDialog from '@/components/AppSettingsDialog.vue'

const router = useRouter()
const store = useWorkbenchBusinessStore()
const toast = useToast()
const settingsStore = useAppSettingsStore()

// 左树 7 项（固定顺序，emoji 图标常量渲染，不接工作台菜单开关系统）
const SECTIONS = [
  { key: 'home', icon: '🏠', label: '首页' },
  { key: 'products', icon: '📦', label: '商品' },
  { key: 'purchases', icon: '🛒', label: '进货' },
  { key: 'daily', icon: '📋', label: '收摊' },
  { key: 'expenses', icon: '💰', label: '支出' },
  { key: 'inventory', icon: '📈', label: '库存' },
  { key: 'stats', icon: '📊', label: '统计' }
] as const
type SectionKey = (typeof SECTIONS)[number]['key']

const activeSection = ref<SectionKey>('home')
// 支出记录 tabs 受控状态（仿 WorkbenchHealth：切走再回来保留上次激活分类）
const expenseTab = ref('all')

function navigateTo(section: string): void {
  if ((SECTIONS as readonly { key: string }[]).some(s => s.key === section)) {
    activeSection.value = section as SectionKey
  }
}

const showSettingsDialog = ref(false)

// ===== 销售记账独立 JSON 备份（business-backup v1，仅本模块七字段，不含其他工作台数据） =====
// 导出：打包当前 store 七字段为 JSON 下载（嵌套 reactive 逐字段 toRaw，防 JSON 序列化 Proxy 残留）
function handleBusinessExport(): void {
  try {
    const payload = {
      type: 'business-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        productCategories: toRaw(store.productCategories),
        expenseCategories: toRaw(store.expenseCategories),
        products: toRaw(store.products),
        purchases: toRaw(store.purchases),
        dailyRecords: toRaw(store.dailyRecords),
        expenses: toRaw(store.expenses),
        settings: toRaw(store.settings)
      }
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `销售记账备份-${localDateKey()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success('导出成功')
  } catch (e) {
    console.error('[Business] export failed', e)
    toast.error('导出失败')
  }
}

// 导入：解析 JSON 备份 → 格式校验 → 确认覆盖 → importData 归一化写入 → toast
const importInput = ref<HTMLInputElement | null>(null)

function handleBusinessImportClick(): void {
  importInput.value?.click()
}

async function handleBusinessImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (e) => {
    input.value = '' // 允许再次选择同一文件
    const content = e.target?.result as string

    let parsed: { type?: unknown; version?: unknown; data?: unknown }
    try {
      parsed = JSON.parse(content)
    } catch {
      toast.error('文件不是有效 JSON')
      return
    }

    if (
      parsed?.type !== 'business-backup' ||
      parsed.version !== 1 ||
      parsed.data === null ||
      typeof parsed.data !== 'object' ||
      Array.isArray(parsed.data)
    ) {
      toast.error('文件格式不正确（不是销售记账备份）')
      return
    }

    if (!confirm('确定要导入此备份吗？当前销售记账数据将被覆盖。')) return

    try {
      const data = await store.importData(parsed.data)
      toast.success(
        `导入成功：商品 ${data.products.length} 个，进货 ${data.purchases.length} 条，收摊记录 ${data.dailyRecords.length} 条，支出 ${data.expenses.length} 笔`
      )
    } catch (err) {
      toast.error(`导入失败：${err instanceof Error ? err.message : '文件格式无效'}`)
    }
  }
  reader.readAsText(file)
}

onMounted(() => {
  void store.loadBusiness()
})
</script>

<template>
  <div class="bs-shell">
    <!-- 头部：左 = 返回 + 标题；右 = 设置 -->
    <header class="bs-header">
      <div class="bs-header-left">
        <button class="bs-btn" @click="router.push('/')">← 管理页</button>
        <h1>📊 {{ settingsStore.businessPageDisplayName }}</h1>
        <span v-if="store.settings.stallName" class="bs-stall-name">{{ store.settings.stallName }}</span>
      </div>
      <div class="bs-header-right">
        <button class="bs-btn" title="导出销售数据" data-testid="bs-export" @click="handleBusinessExport">📤 导出</button>
        <button class="bs-btn" title="导入销售数据" data-testid="bs-import" @click="handleBusinessImportClick">📥 导入</button>
        <button class="bs-btn" title="设置" data-testid="bs-settings" @click="showSettingsDialog = true">⚙️ 设置</button>
      </div>
    </header>

    <input
      ref="importInput"
      type="file"
      accept=".json,application/json"
      style="display: none"
      data-testid="bs-import-input"
      @change="handleBusinessImportFile"
    />

    <!-- 主体：左树 + 右内容区 -->
    <div class="bs-body">
      <nav class="bs-menu">
        <button
          v-for="item in SECTIONS"
          :key="item.key"
          class="bs-menu-item"
          :class="{ active: activeSection === item.key }"
          :title="item.label"
          :data-testid="`bs-menu-${item.key}`"
          @click="activeSection = item.key"
        >
          <span class="bs-menu-icon">{{ item.icon }}</span>
          <span class="bs-menu-label">{{ item.label }}</span>
        </button>
      </nav>

      <main class="bs-content">
        <BusinessHome v-if="activeSection === 'home'" @navigate="navigateTo" />
        <BusinessProducts v-else-if="activeSection === 'products'" />
        <BusinessPurchases v-else-if="activeSection === 'purchases'" />
        <BusinessDaily v-else-if="activeSection === 'daily'" />
        <BusinessExpenses
          v-else-if="activeSection === 'expenses'"
          :active-tab="expenseTab"
          @change="expenseTab = $event"
        />
        <BusinessInventory v-else-if="activeSection === 'inventory'" />
        <BusinessStats v-else-if="activeSection === 'stats'" />
      </main>
    </div>

    <AppSettingsDialog v-if="showSettingsDialog" @close="showSettingsDialog = false" />
  </div>
</template>

<style scoped>
/* 亮色基础样式（沿用 --color-* 全局 token，复刻 WorkbenchView .wb-*） */
.bs-shell {
  height: 100dvh;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg, #f8fafc);
  color: var(--color-text, #1e293b);
}

.bs-header {
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

.bs-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.bs-header-left h1 {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  white-space: nowrap;
}

.bs-stall-name {
  font-size: 13px;
  color: var(--text-secondary, #64748b);
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: 999px;
  padding: 2px 10px;
  white-space: nowrap;
}

.bs-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.bs-btn {
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

.bs-btn:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

.bs-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.bs-menu {
  width: 160px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 8px;
  background-color: var(--color-bg-card, #ffffff);
  border-right: 1px solid var(--color-border, #e2e8f0);
}

.bs-menu-item {
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

.bs-menu-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  font-size: 15px;
}

.bs-menu-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bs-menu-item:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
}

.bs-menu-item.active {
  background-color: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
}

.bs-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg, #f8fafc);
}

/* 暗色模式覆盖（模式参考 WorkbenchView） */
:root.dark .bs-shell {
  background-color: var(--bg-primary, #111827);
}

:root.dark .bs-header {
  background-color: var(--bg-secondary, #1f2937);
  border-bottom-color: var(--border-color, #374151);
}

:root.dark .bs-header-left h1 {
  color: var(--text-primary, #f9fafb);
}

:root.dark .bs-btn {
  background-color: var(--bg-secondary, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .bs-btn:hover {
  background-color: var(--hover-bg, #374151);
  color: var(--accent-color, #3b82f6);
  border-color: var(--accent-color, #3b82f6);
}

:root.dark .bs-menu {
  background-color: var(--bg-secondary, #1f2937);
  border-right-color: var(--border-color, #374151);
}

:root.dark .bs-menu-item {
  color: var(--text-secondary, #d1d5db);
}

:root.dark .bs-menu-item:hover {
  background-color: var(--hover-bg, #374151);
  color: var(--text-primary, #f9fafb);
}

:root.dark .bs-menu-item.active {
  background-color: #1e3a5f;
  color: #60a5fa;
}

:root.dark .bs-content {
  background-color: var(--bg-primary, #111827);
}

:root.dark .bs-stall-name {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

/* 移动端：左树横排、页面滚动恢复（复刻 WorkbenchView 断点） */
@media (max-width: 768px) {
  .bs-content {
    overflow-y: auto;
  }

  .bs-content > * {
    flex: none;
  }

  .bs-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .bs-body {
    flex-direction: column;
  }

  .bs-menu {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid var(--color-border, #e2e8f0);
  }

  .bs-menu-item {
    white-space: nowrap;
  }
}

/* 桌面一屏契约：面板根钉满内容区（复刻 WorkbenchView T3 shell） */
@media (min-width: 769px) {
  .bs-content {
    overflow: hidden;
  }

  .bs-content > * {
    flex: 1;
    min-height: 0;
  }
}
</style>
