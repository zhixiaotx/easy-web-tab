<script setup lang="ts">
import { reactive, ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import {
  useAppSettingsStore,
  DIALOG_LABELS,
  DIALOG_DEFAULTS,
  NAV_DIALOG_IDS,
  WB_DIALOG_IDS
} from '@/stores/settings'
import type { DialogId } from '@/stores/settings'
import type { WorkbenchMenuItem } from '@/composables/workbenchMenuCore'
import { useAppSettingsDialog } from '@/composables/useAppSettingsDialog'
import { useToast } from '@/composables/useToast'
import { idbGet, idbPut, idbImportAll } from '@/composables/useIdb'
import { isEmailConfigured, buildEmailParams } from '@/composables/reminderCore'
import { sendReminderEmail } from '@/composables/reminderEmail'
import { requestNotifyPermission } from '@/composables/useDesktopNotify'
import { captureSnapshot } from '@/composables/useSnapshots'
import type { SnapshotWithSource } from '@/composables/useSnapshots'
import { normalizeSnapshotList } from '@/composables/snapshotCore'
import type { SnapshotRecord } from '@/composables/snapshotCore'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import { useWorkbenchNotesStore } from '@/stores/workbenchNotes'
import { useCountdownsStore } from '@/stores/countdowns'
import { usePasswordsStore } from '@/stores/passwords'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { useWorkbenchLedgerStore } from '@/stores/workbenchLedger'
import { useWorkbenchPomodoroStore } from '@/stores/workbenchPomodoro'
import { useWorkbenchHabitsStore } from '@/stores/workbenchHabits'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import type { WorkbenchData } from '@/types'
import { COUNTDOWN_CATEGORIES } from '@/types'
import { categoryLabel } from '@/composables/countdownCore'
import Icon from '@/components/Icon.vue'
import BusinessCategoryManager from '@/components/business/BusinessCategoryManager.vue'

// 弹窗 id 列表：从导出的契约表派生（与 store 内部 DIALOG_IDS 顺序一致），
// 作为 drafts/syncAll 的全量来源；渲染分组用下方导出的 NAV/WB 数组
const DIALOG_IDS = Object.keys(DIALOG_DEFAULTS) as DialogId[]

// 当前激活的设置分组 tab（导航设置 / 工作台设置 / 提醒设置 / 销售记账）
const activeTab = ref<'nav' | 'wb' | 'remind' | 'business'>('nav')

const emit = defineEmits<{
  close: []
}>()

const store = useAppSettingsStore()
const businessStore = useWorkbenchBusinessStore()
// 销售记账分类管理弹框（复用页面内共享组件；null = 关闭）
const bizCatManagerKind = ref<'product' | 'expense' | null>(null)
// 设置弹窗「去设置」入口单例（WeatherCard 等调用 openAppSettings() → 本组件订阅后定位到城市输入框）
const appSettings = useAppSettingsDialog()
const cityInput = ref<HTMLInputElement | null>(null)

// ========================================
// 草稿状态：以字符串保存，允许输入框为空/未提交；
// 输入时实时提交给 store（即时预览），失焦时从 store 的 clamp 值重新同步
// ========================================
function createDrafts(): Record<DialogId, { width: string; height: string }> {
  const drafts = {} as Record<DialogId, { width: string; height: string }>
  for (const id of DIALOG_IDS) {
    drafts[id] = {
      width: String(store.dialogSizes[id].width),
      height: String(store.dialogSizes[id].height)
    }
  }
  return drafts
}

const drafts = reactive(createDrafts())

// 将某一行的草稿从 store（clamp 后）值重新同步
function syncRow(id: DialogId) {
  drafts[id].width = String(store.dialogSizes[id].width)
  drafts[id].height = String(store.dialogSizes[id].height)
}

// 全部行重新同步（store 外部变更如全局重置后调用）
function syncAll() {
  for (const id of DIALOG_IDS) {
    syncRow(id)
  }
}

// 宽度输入：草稿跟随输入框，合法数字才提交给 store（clamp 由 store 负责）
function onWidthInput(id: DialogId, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  drafts[id].width = raw
  const n = Number(raw)
  if (raw === '' || !Number.isFinite(n)) return
  store.setDialogSize(id, n, store.dialogSizes[id].height)
}

// 高度输入
function onHeightInput(id: DialogId, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  drafts[id].height = raw
  const n = Number(raw)
  if (raw === '' || !Number.isFinite(n)) return
  store.setDialogSize(id, store.dialogSizes[id].width, n)
}

// 失焦：草稿回退到 store 的 clamp 值
function onWidthBlur(id: DialogId) {
  drafts[id].width = String(store.dialogSizes[id].width)
}

function onHeightBlur(id: DialogId) {
  drafts[id].height = String(store.dialogSizes[id].height)
}

// 单行恢复默认
function resetRow(id: DialogId) {
  store.setDialogSize(id, DIALOG_DEFAULTS[id].width, DIALOG_DEFAULTS[id].height)
  syncRow(id)
}

// 全局恢复默认
function resetAll() {
  store.resetDefaults()
  syncAll()
}

// ========================================
// 工作台菜单（仅工作台设置 tab 展示）：排序 + 改名 + 区块恢复默认
// ========================================

// 改名输入直接绑定 store 状态（无草稿机制，Metis F11）：
// 输入框 :value = menuEditing[key] ?? item.label —— menuEditing 仅暂存「正在输入」的文本，
// 提交/还原后立即删除对应条目，值回落到 store 派生 label（store.workbenchMenuItems computed 重算）。
// 因此全局 resetAll 重置 store 后 computed 重新派生、menuEditing 为空 → 输入框自动展示新默认值，
// 不会残留旧值（响应式重渲染，无需为区块做任何同步）。
const menuEditing = reactive<Record<string, string>>({})

// 上移/下移：disabled 由模板按 home/边界判定；store 结果兜底（locked/boundary/not-found 直接忽略，无 toast——与「可用+toast」惯例有意偏离）
function onMoveMenu(key: string, dir: 'up' | 'down'): void {
  store.moveWorkbenchMenuItem(key, dir)
}

// 上移按钮禁用：home 恒禁用（store 返回 locked）；index ≤ 1（index 0 恒为 home，index 1 为首个可移动项）达上边界
function isMenuUpDisabled(item: WorkbenchMenuItem, index: number): boolean {
  return item.key === 'home' || index <= 1
}

// 下移按钮禁用：home 恒禁用；末行（index === 全量 items.length - 1）达下边界
function isMenuDownDisabled(item: WorkbenchMenuItem, index: number): boolean {
  return item.key === 'home' || index >= store.workbenchMenuAllItems.length - 1
}

// 改名提交（blur / Enter）：先按 code point 校验 ≤ 12（Metis N2：代理对不得绕过上限）；
// trim 后为空 → 还原上值（纯本地回退，不调 store）；store 拒绝（ok:false）→ 删除暂存即回落到旧值
function commitMenuName(key: string): void {
  const raw = menuEditing[key] ?? ''
  const name = raw.trim()
  if (!name || Array.from(name).length > 12) {
    delete menuEditing[key]
    return
  }
  store.renameWorkbenchMenuItem(key, name)
  delete menuEditing[key]
}

// Esc 还原：删除暂存，输入框回落到 store 当前值（不调 store）
function revertMenuName(key: string): void {
  delete menuEditing[key]
}

// ========================================
// 天气城市（仅工作台设置 tab）：v-model 直绑 store 显示用；change/blur 提交 setWorkbenchCity
// （store 负责 trim 与空串=清除持久化；提交后显示值回落到规范值）
// ========================================
function commitCity(): void {
  store.setWorkbenchCity(store.workbenchCity ?? '')
}

// ========================================
// 数据时光机（仅工作台设置 tab）：快照列表 + 立即备份 + 单条恢复
// 数据存 IDB store 'snapshots'（不进 JSON 备份导出）；恢复流程镜像 WorkbenchView.handleImportFile
// ========================================
const toast = useToast()
const snapshotList = ref<SnapshotWithSource[]>([])
const snapshotBusy = ref(false)

function snapshotTime(createdAt: string): string {
  const d = new Date(createdAt)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 来源展示：手动快照/自动快照（旧记录缺 source 回退「自动」）
function snapshotSourceLabel(s: SnapshotRecord): string {
  return (s as SnapshotWithSource).source === 'manual' ? '手动' : '自动'
}

async function loadSnapshots(): Promise<void> {
  try {
    // 归一化走 snapshotCore（坏项剔除 + createdAt 降序），组件禁止内联列表管理
    snapshotList.value = normalizeSnapshotList(await idbGet<SnapshotRecord[]>('snapshots')) as SnapshotWithSource[]
  } catch (e) {
    console.error('[AppSettings] loadSnapshots', e)
    snapshotList.value = []
  }
}

// 立即备份：force=true 绕过同日去重（手动快照，来源标记 manual）
async function handleSnapshotNow(): Promise<void> {
  if (snapshotBusy.value) return
  snapshotBusy.value = true
  try {
    await captureSnapshot(true)
    await loadSnapshots()
    toast.success('已创建快照')
  } catch (e) {
    console.error('[AppSettings] snapshot now failed', e)
    toast.error('备份失败')
  } finally {
    snapshotBusy.value = false
  }
}

// 恢复快照：confirm → 密码双分支 → idbImportAll → 重载各 store → 清理更新快照 → toast
// （镜像 WorkbenchView.handleImportFile：password-verification-v2 缺失时跳过密码恢复）
async function handleRestoreSnapshot(snapshot: SnapshotRecord): Promise<void> {
  if (!confirm(`确定要恢复到 ${snapshotTime(snapshot.createdAt)} 的快照吗？当前工作台数据将被覆盖。`)) return
  if (snapshotBusy.value) return
  snapshotBusy.value = true
  try {
    // 密码分支先决：本设备没有 v2 主密码验证键（新设备）→ 快照密码 blob 无法解密，跳过
    // （写空串 passwords:'' —— idbImportAll 校验 passwords 为 string，与 handleImportFile 一致）
    const skipPasswords = localStorage.getItem('password-verification-v2') === null
    // 快照来自 reactive ref（snapshotList.value），嵌套字段是 Vue proxy —— IDB 结构化克隆无法处理
    // proxy（DataCloneError: could not be cloned），深拷贝脱 proxy 后再写 IDB（WorkbenchView
    // handleImportFile 从文件读纯对象故无此问题；快照数据本身是 JSON 兼容纯数据，JSON 往返安全）
    const rawData = JSON.parse(JSON.stringify(snapshot.data)) as WorkbenchData
    await idbImportAll(skipPasswords ? { ...rawData, passwords: '' } : rawData)

    // 重载各 store（内存与 IDB 同步；密码库不重载——恢复后若已解锁则强制锁定重新解锁）
    const todosStore = useWorkbenchTodosStore()
    const notesStore = useWorkbenchNotesStore()
    const countdownsStore = useCountdownsStore()
    const healthStore = useWorkbenchHealthStore()
    const ledgerStore = useWorkbenchLedgerStore()
    const pomodoroStore = useWorkbenchPomodoroStore()
    const habitsStore = useWorkbenchHabitsStore()
    const settingsStore = useAppSettingsStore()
    await Promise.all([
      todosStore.loadTodos(),
      notesStore.loadNotes(),
      countdownsStore.loadCountdowns(),
      healthStore.loadHealth(),
      ledgerStore.loadLedger(),
      pomodoroStore.loadPomodoro(),
      habitsStore.loadHabits(),
      settingsStore.initSettings()
    ])
    const passwordsStore = usePasswordsStore()
    if (passwordsStore.isUnlocked) passwordsStore.lock()

    // 清理：删除 createdAt 晚于所恢复快照的快照（Date.parse 精确比较；
    // 覆盖 wb-snapshot-now 同日多份场景，防下次进入工作台自动快照覆盖刚恢复的状态）。
    // snapshots store 本身不恢复——列表不受恢复影响，仅此清理。
    // trimmed 来自 reactive snapshotList.value（.filter() 元素仍为 Vue proxy），
    // toRaw 只解最外层数组、元素 proxy 会让 IDB 结构化克隆抛 DataCloneError，故 JSON 深拷贝
    const restoredTime = Date.parse(snapshot.createdAt)
    const trimmed = snapshotList.value.filter((s) => Date.parse(s.createdAt) <= restoredTime)
    if (trimmed.length !== snapshotList.value.length) {
      await idbPut('snapshots', JSON.parse(JSON.stringify(trimmed)))
    }
    snapshotList.value = trimmed as SnapshotWithSource[]

    toast.success('已恢复快照')
    if (skipPasswords) toast.warning('快照中的密码数据无法在本设备解密（缺少加密密钥），已跳过密码恢复')
  } catch (e) {
    const msg = e instanceof Error ? e.message : '恢复失败'
    toast.error(`恢复失败：${msg}`)
  } finally {
    snapshotBusy.value = false
  }
}

// ========================================
// 提醒设置（仅提醒设置 tab）：桌面通知权限请求 + 邮件提醒（EmailJS）测试发送
// 配置对象形状与 reminderCore/reminderEmail 契约一致（enabled/toEmail/serviceId/templateId/publicKey）
// ========================================
const emailConfig = computed(() => ({
  enabled: store.reminderEmailEnabled,
  toEmail: store.reminderEmailTo,
  serviceId: store.reminderEmailServiceId,
  templateId: store.reminderEmailTemplateId,
  publicKey: store.reminderEmailPublicKey
}))

// 测试按钮可用性：开关开启且四字段非空（isEmailConfigured 纯函数判定，组件禁止内联重算）
const canTestEmail = computed(() => isEmailConfigured(emailConfig.value))

// 桌面通知开关：开启时同步请求浏览器通知权限（须在用户手势内调用，Chrome 要求）
function onToggleDesktopNotify(): void {
  const next = !store.desktopNotifyEnabled
  store.setDesktopNotifyEnabled(next)
  if (next) {
    void requestNotifyPermission()
  }
}

// 发送测试邮件：按 sendReminderEmail 布尔结果 → success/error toast
const testEmailBusy = ref(false)
async function handleTestEmail(): Promise<void> {
  if (testEmailBusy.value) return
  testEmailBusy.value = true
  const cfg = emailConfig.value
  const ok = await sendReminderEmail(
    cfg,
    buildEmailParams({ id: 'test', name: '测试邮件' }, new Date().toLocaleString(), cfg.toEmail, window.location.href)
  )
  testEmailBusy.value = false
  if (ok) {
    toast.success('测试邮件发送成功')
  } else {
    toast.error('测试邮件发送失败，请检查配置')
  }
}

// ESC 键关闭弹框
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

// ========================================
// 分类管理（待办/倒计时/便签，统一放设置弹窗 wb tab）=====
// 三个 store API 不同（待办/倒计时=string[]，便签=NoteCategory[]），组件禁止抽公共组件
// ========================================

// --- 待办分类 ---
const todosCatStore = useWorkbenchTodosStore()
const todoCatDrafts = reactive<Record<string, string>>({})
const newTodoCatName = ref('')

function initTodoCats(): void {
  for (const c of todosCatStore.customCategories) {
    if (!(c in todoCatDrafts)) todoCatDrafts[c] = c
  }
}

function commitTodoCatName(name: string): void {
  const draft = todoCatDrafts[name]
  if (draft === undefined || draft.trim() === name) return
  void todosCatStore.updateCategory(name, draft.trim()).then(res => {
    if (!res.ok) {
      toast.error(res.reason === 'duplicate' ? '待办分类名称已存在' : '分类名称不能为空')
      todoCatDrafts[name] = name
    }
  })
}

function revertTodoCatName(name: string): void {
  todoCatDrafts[name] = name
}

function handleAddTodoCat(): void {
  const name = newTodoCatName.value.trim()
  if (!name) return
  const res = todosCatStore.addCategory(name)
  if (!res.ok) {
    toast.error(res.reason === 'duplicate' ? '待办分类名称已存在' : '分类名称不能为空')
    return
  }
  todoCatDrafts[name] = name
  newTodoCatName.value = ''
}

function handleDeleteTodoCat(name: string): void {
  if (!confirm(`确定要删除待办分类「${name}」吗？该分类下的待办将变为未分类`)) return
  const res = todosCatStore.deleteCategory(name)
  if (!res.ok) {
    toast.error(res.reason === 'in-use' ? '该分类下有待办，无法删除' : '删除失败')
    return
  }
  delete todoCatDrafts[name]
}

function handleMoveTodoCat(name: string, dir: 'up' | 'down'): void {
  todosCatStore.moveCategory(name, dir)
}

// --- 倒计时分类 ---
const countdownsCatStore = useCountdownsStore()
const cdCatDrafts = reactive<Record<string, string>>({})
const newCdCatName = ref('')

function initCdCats(): void {
  for (const c of countdownsCatStore.customCategories) {
    if (!(c in cdCatDrafts)) cdCatDrafts[c] = c
  }
}

function commitCdCatName(name: string): void {
  const draft = cdCatDrafts[name]
  if (draft === undefined || draft.trim() === name) return
  const res = countdownsCatStore.renameCustomCategory(name, draft.trim())
  if (!res.ok) {
    toast.error(res.reason === 'duplicate' ? '倒计时分类名称已存在' : '分类名称不能为空')
    cdCatDrafts[name] = name
  }
}

function revertCdCatName(name: string): void {
  cdCatDrafts[name] = name
}

function handleAddCdCat(): void {
  const name = newCdCatName.value.trim()
  if (!name) return
  const res = countdownsCatStore.addCustomCategory(name)
  if (!res.ok) {
    toast.error(res.reason === 'duplicate' ? '倒计时分类名称已存在' : '分类名称不能为空')
    return
  }
  cdCatDrafts[name] = name
  newCdCatName.value = ''
}

function handleDeleteCdCat(name: string): void {
  if (!confirm(`确定要删除倒计时分类「${name}」吗？该分类下的倒计时将变为未分类`)) return
  const res = countdownsCatStore.deleteCustomCategory(name)
  if (!res.ok) {
    toast.error(res.reason === 'in-use' ? '该分类下有倒计时，无法删除' : '删除失败')
    return
  }
  delete cdCatDrafts[name]
}

function handleMoveCdCat(name: string, dir: 'up' | 'down'): void {
  countdownsCatStore.moveCustomCategory(name, dir)
}

// --- 便签分类 ---
const notesCatStore = useWorkbenchNotesStore()
const noteCatDrafts = reactive<Record<string, string>>({})
const newNoteCatName = ref('')

const sortedNoteCategories = computed(() =>
  [...notesCatStore.categories].sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999))
)

function initNoteCats(): void {
  for (const c of notesCatStore.categories) {
    if (!(c.id in noteCatDrafts)) noteCatDrafts[c.id] = c.name
  }
}

async function commitNoteCatName(cat: { id: string; name: string }): Promise<void> {
  const draft = noteCatDrafts[cat.id]
  if (draft === undefined || draft.trim() === cat.name) return
  const ok = await notesCatStore.updateCategory(cat.id, { name: draft.trim() })
  if (!ok) {
    toast.error('便签分类名称已存在或为空')
    noteCatDrafts[cat.id] = cat.name
  }
}

function revertNoteCatName(cat: { id: string; name: string }): void {
  noteCatDrafts[cat.id] = cat.name
}

async function handleAddNoteCat(): Promise<void> {
  const name = newNoteCatName.value.trim()
  if (!name) return
  const ok = await notesCatStore.addCategory(name)
  if (!ok) {
    toast.error('便签分类名称已存在')
    return
  }
  newNoteCatName.value = ''
}

async function handleDeleteNoteCat(cat: { id: string; name: string }): Promise<void> {
  if (!confirm(`确定要删除便签分类「${cat.name}」吗？该分类下的便签将变为未分类`)) return
  const ok = await notesCatStore.deleteCategory(cat.id)
  if (!ok) {
    toast.error('便签分类删除失败')
    return
  }
  delete noteCatDrafts[cat.id]
}

async function handleMoveNoteCat(catId: string, dir: 'up' | 'down'): Promise<void> {
  const ok = await notesCatStore.moveCategory(catId, dir)
  if (!ok) toast.warning('已到边界，无法移动')
}

// 便签分类标签页显示切换（归一化为 handler，统一错误处理）
async function handleToggleNoteCatTab(cat: { id: string; showInTabs?: boolean }): Promise<void> {
  const ok = await notesCatStore.updateCategory(cat.id, { showInTabs: cat.showInTabs === false })
  if (!ok) toast.error('分类更新失败')
}

// 订阅「去设置」打开事件（useAppSettingsDialog 单例）：打开时切到工作台设置 tab 并聚焦城市输入框；
// 一次性消费打开标志（closeAppSettings），避免后续挂载重复触发
let stopWatchSettings: (() => void) | undefined

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  // 弹窗打开即加载快照列表（对话框 v-if 挂载，onMounted = 打开时刻）
  loadSnapshots()
  // 初始化分类草稿（确保草稿映射与 store 实时）
  initTodoCats()
  initCdCats()
  initNoteCats()
  stopWatchSettings = watch(
    () => appSettings.showAppSettings.value,
    (open) => {
      if (open) {
        activeTab.value = 'wb'
        nextTick(() => cityInput.value?.focus())
        appSettings.closeAppSettings()
      }
    }
  )
})

// 切到工作台设置 tab 时刷新快照列表（弹窗保持打开状态下重新加载）
watch(
  () => activeTab.value,
  (tab) => {
    if (tab === 'wb') loadSnapshots()
  }
)

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  stopWatchSettings?.()
})
</script>

<template>
  <div class="manager-overlay" @click.self="emit('close')">
    <div class="manager">
      <div class="manager-header">
        <h2>⚙️ 设置</h2>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="manager-body">
        <div class="settings-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="tab-btn"
            :class="{ active: activeTab === 'nav' }"
            :aria-selected="activeTab === 'nav'"
            @click="activeTab = 'nav'"
          >导航设置</button>
          <button
            type="button"
            role="tab"
            class="tab-btn"
            :class="{ active: activeTab === 'wb' }"
            :aria-selected="activeTab === 'wb'"
            @click="activeTab = 'wb'"
          >工作台设置</button>
          <button
            type="button"
            role="tab"
            class="tab-btn"
            :class="{ active: activeTab === 'remind' }"
            :aria-selected="activeTab === 'remind'"
            @click="activeTab = 'remind'"
          >提醒设置</button>
          <button
            type="button"
            role="tab"
            class="tab-btn"
            :class="{ active: activeTab === 'business' }"
            :aria-selected="activeTab === 'business'"
            data-testid="settings-tab-business"
            @click="activeTab = 'business'"
          >销售记账</button>
        </div>

        <p v-if="activeTab === 'nav' || activeTab === 'wb'" class="hint">调整各弹窗的默认尺寸，修改即时生效并自动保存。</p>

        <!-- 导航筛选栏（仅导航设置 tab）：控制导航管理页分类/标签栏展开或收起（默认收起） -->
        <div v-if="activeTab === 'nav'" class="wb-menu-config nav-filter-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">导航筛选栏</h3>
            <button
              type="button"
              class="switch-btn"
              :class="{ on: store.navFiltersExpanded }"
              role="switch"
              :aria-checked="store.navFiltersExpanded"
              data-testid="navfilter-switch"
              @click="store.setNavFiltersExpanded(!store.navFiltersExpanded)"
            >
              <span class="switch-thumb"></span>
            </button>
          </div>
          <p class="wb-menu-hint">
            控制导航管理页「分类 · 标签」筛选栏的展开与收起：{{ store.navFiltersExpanded ? '当前为展开模式' : '当前为收起模式（默认）' }}
          </p>
        </div>

        <!-- 天气城市（仅工作台设置 tab）：配置工作台天气卡显示城市；留空 = 未配置（天气卡显示占位） -->
        <div v-if="activeTab === 'wb'" class="wb-city-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">天气城市</h3>
          </div>
          <p class="wb-menu-hint">设置工作台天气卡显示的城市，留空表示未配置</p>
          <input
            ref="cityInput"
            type="text"
            class="wb-menu-name-input"
            placeholder="如：北京"
            data-testid="wb-city-input"
            v-model="store.workbenchCity"
            @change="commitCity"
          />
        </div>

        <!-- 工作台菜单（仅工作台设置 tab）：排序 + 改名 + 区块恢复默认；主页恒置顶不可动 -->
        <div v-if="activeTab === 'wb'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">工作台菜单</h3>
            <button type="button" class="row-reset" data-testid="wbmenu-reset" @click="store.resetWorkbenchMenu()">恢复默认</button>
          </div>
          <p class="wb-menu-hint">主页固定置顶，不可调整顺序或关闭；开关关闭的功能将从菜单与主页统计中隐藏</p>

          <div class="wb-menu-list">
            <div
              v-for="(item, index) in store.workbenchMenuAllItems"
              :key="item.key"
              class="wb-menu-row"
              :class="{ 'is-disabled-item': !store.isWorkbenchMenuEnabled(item.key) }"
              :data-testid="`wbmenu-row-${item.key}`"
            >
              <span class="wb-menu-icon"><Icon :name="item.icon" /></span>
              <input
                type="text"
                class="wb-menu-name-input"
                maxlength="12"
                :data-testid="`wbmenu-name-${item.key}`"
                :aria-label="`${item.label}名称`"
                :value="menuEditing[item.key] ?? item.label"
                @input="menuEditing[item.key] = ($event.target as HTMLInputElement).value"
                @blur="commitMenuName(item.key)"
                @keydown.enter="commitMenuName(item.key)"
                @keydown.esc.stop="revertMenuName(item.key)"
              />
              <div class="wb-menu-actions">
                <button
                  type="button"
                  class="wb-menu-btn"
                  :data-testid="`wbmenu-up-${item.key}`"
                  :disabled="isMenuUpDisabled(item, index)"
                  :aria-disabled="isMenuUpDisabled(item, index) ? 'true' : 'false'"
                  @click="onMoveMenu(item.key, 'up')"
                >上移</button>
                <button
                  type="button"
                  class="wb-menu-btn"
                  :data-testid="`wbmenu-down-${item.key}`"
                  :disabled="isMenuDownDisabled(item, index)"
                  :aria-disabled="isMenuDownDisabled(item, index) ? 'true' : 'false'"
                  @click="onMoveMenu(item.key, 'down')"
                >下移</button>
              </div>
              <button
                type="button"
                class="switch-btn"
                :class="{ on: store.isWorkbenchMenuEnabled(item.key) }"
                role="switch"
                :aria-checked="store.isWorkbenchMenuEnabled(item.key)"
                :disabled="item.key === 'home'"
                :title="item.key === 'home' ? '主页为默认页，不可关闭' : store.isWorkbenchMenuEnabled(item.key) ? '关闭此功能' : '开启此功能'"
                :data-testid="`wbmenu-switch-${item.key}`"
                @click="store.setWorkbenchMenuVisibility(item.key, !store.isWorkbenchMenuEnabled(item.key))"
              >
                <span class="switch-thumb"></span>
              </button>
            </div>
          </div>
        </div>

        <!-- 待办分类管理（仅工作台设置 tab）：改名/上下移/删除/新增 + 标签页显示勾选 -->
        <div v-if="activeTab === 'wb'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">待办分类</h3>
          </div>
          <p class="wb-menu-hint">管理待办面板的分类列表；分类被待办引用时无法删除；勾选的分类会显示在面板筛选标签页</p>
          <div class="wb-menu-list">
            <div v-for="(cat, idx) in todosCatStore.customCategories" :key="cat" class="wb-menu-row">
              <input
                type="text"
                class="wb-menu-name-input"
                :value="todoCatDrafts[cat] ?? cat"
                @input="todoCatDrafts[cat] = ($event.target as HTMLInputElement).value"
                @blur="commitTodoCatName(cat)"
                @keydown.enter="commitTodoCatName(cat)"
                @keydown.esc="revertTodoCatName(cat)"
                :data-testid="`wbcfg-todo-name-${cat}`"
              />
              <div class="wb-menu-actions">
                <button type="button" class="wb-menu-btn" :disabled="idx <= 0" :data-testid="`wbcfg-todo-up-${cat}`" @click="handleMoveTodoCat(cat, 'up')">上移</button>
                <button type="button" class="wb-menu-btn" :disabled="idx >= todosCatStore.customCategories.length - 1" :data-testid="`wbcfg-todo-down-${cat}`" @click="handleMoveTodoCat(cat, 'down')">下移</button>
              </div>
              <button type="button" class="wb-menu-btn" :data-testid="`wbcfg-todo-del-${cat}`" @click="handleDeleteTodoCat(cat)">删除</button>
              <button
                type="button"
                class="switch-btn"
                :class="{ on: todosCatStore.tabCategories.includes(cat) }"
                role="switch"
                :aria-checked="todosCatStore.tabCategories.includes(cat)"
                :data-testid="`wbcfg-todo-tab-${cat}`"
                @click="todosCatStore.toggleTabCategory(cat, !todosCatStore.tabCategories.includes(cat))"
              >
                <span class="switch-thumb"></span>
              </button>
            </div>
          </div>
          <div class="wb-cat-add-row">
            <input
              v-model="newTodoCatName"
              type="text"
              class="wb-menu-name-input"
              placeholder="新分类名称"
              data-testid="wbcfg-todo-new"
              @keydown.enter="handleAddTodoCat"
            />
            <button type="button" class="wb-menu-btn" :disabled="newTodoCatName.trim() === ''" data-testid="wbcfg-todo-add" @click="handleAddTodoCat">添加</button>
          </div>
        </div>

        <!-- 倒计时分类管理（仅工作台设置 tab）：内置分类标签页显示 + 自定义分类改名/上下移/删除/新增 -->
        <div v-if="activeTab === 'wb'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">倒计时分类</h3>
          </div>
          <p class="wb-menu-hint">管理倒计时面板的分类列表；分类被倒计时引用时无法删除；勾选的分类会显示在面板筛选标签页</p>

          <!-- 内置分类（仅标签页显示，不可改名/移动/删除） -->
          <div class="wb-cat-sub-title">内置分类</div>
          <div class="wbcat-tab-list">
            <label
              v-for="c in COUNTDOWN_CATEGORIES"
              :key="c"
              class="wbcat-tab-row"
              :data-testid="`wbcfg-cd-builtin-tab-${c}`"
            >
              <input
                type="checkbox"
                class="wbcat-tab-check"
                :checked="countdownsCatStore.tabCategories.includes(c)"
                @change="countdownsCatStore.setTabCategory(c, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ categoryLabel(c) }}</span>
            </label>
          </div>

          <!-- 自定义分类 -->
          <div class="wb-cat-sub-title">自定义分类</div>
          <div class="wb-menu-list">
            <div v-for="(cat, idx) in countdownsCatStore.customCategories" :key="cat" class="wb-menu-row">
              <input
                type="text"
                class="wb-menu-name-input"
                :value="cdCatDrafts[cat] ?? cat"
                @input="cdCatDrafts[cat] = ($event.target as HTMLInputElement).value"
                @blur="commitCdCatName(cat)"
                @keydown.enter="commitCdCatName(cat)"
                @keydown.esc="revertCdCatName(cat)"
                :data-testid="`wbcfg-cd-name-${cat}`"
              />
              <div class="wb-menu-actions">
                <button type="button" class="wb-menu-btn" :disabled="idx <= 0" :data-testid="`wbcfg-cd-up-${cat}`" @click="handleMoveCdCat(cat, 'up')">上移</button>
                <button type="button" class="wb-menu-btn" :disabled="idx >= countdownsCatStore.customCategories.length - 1" :data-testid="`wbcfg-cd-down-${cat}`" @click="handleMoveCdCat(cat, 'down')">下移</button>
              </div>
              <button type="button" class="wb-menu-btn" :data-testid="`wbcfg-cd-del-${cat}`" @click="handleDeleteCdCat(cat)">删除</button>
              <button
                type="button"
                class="switch-btn"
                :class="{ on: countdownsCatStore.tabCategories.includes(cat) }"
                role="switch"
                :aria-checked="countdownsCatStore.tabCategories.includes(cat)"
                :data-testid="`wbcfg-cd-tab-${cat}`"
                @click="countdownsCatStore.setTabCategory(cat, !countdownsCatStore.tabCategories.includes(cat))"
              >
                <span class="switch-thumb"></span>
              </button>
            </div>
          </div>
          <div class="wb-cat-add-row">
            <input
              v-model="newCdCatName"
              type="text"
              class="wb-menu-name-input"
              placeholder="新分类名称"
              data-testid="wbcfg-cd-new"
              @keydown.enter="handleAddCdCat"
            />
            <button type="button" class="wb-menu-btn" :disabled="newCdCatName.trim() === ''" data-testid="wbcfg-cd-add" @click="handleAddCdCat">添加</button>
          </div>
        </div>

        <!-- 便签分类管理（仅工作台设置 tab）：改名/上下移/删除/新增 -->
        <div v-if="activeTab === 'wb'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">便签分类</h3>
          </div>
          <p class="wb-menu-hint">管理便签面板的分类列表；删除分类后该分类下的便签将变为未分类</p>
          <div class="wb-menu-list">
            <div v-for="(cat, idx) in sortedNoteCategories" :key="cat.id" class="wb-menu-row">
              <input
                type="text"
                class="wb-menu-name-input"
                :value="noteCatDrafts[cat.id] ?? cat.name"
                @input="noteCatDrafts[cat.id] = ($event.target as HTMLInputElement).value"
                @blur="commitNoteCatName(cat)"
                @keydown.enter="commitNoteCatName(cat)"
                @keydown.esc="revertNoteCatName(cat)"
                :data-testid="`wbcfg-note-name-${cat.id}`"
              />
              <div class="wb-menu-actions">
                <button type="button" class="wb-menu-btn" :disabled="idx <= 0" :data-testid="`wbcfg-note-up-${cat.id}`" @click="handleMoveNoteCat(cat.id, 'up')">上移</button>
                <button type="button" class="wb-menu-btn" :disabled="idx >= sortedNoteCategories.length - 1" :data-testid="`wbcfg-note-down-${cat.id}`" @click="handleMoveNoteCat(cat.id, 'down')">下移</button>
              </div>
              <button type="button" class="wb-menu-btn" :data-testid="`wbcfg-note-del-${cat.id}`" @click="handleDeleteNoteCat(cat)">删除</button>
              <button
                type="button"
                class="switch-btn"
                :class="{ on: cat.showInTabs !== false }"
                role="switch"
                :aria-checked="cat.showInTabs !== false"
                :data-testid="`wbcfg-note-tab-${cat.id}`"
                @click="handleToggleNoteCatTab({ id: cat.id, showInTabs: cat.showInTabs })"
              >
                <span class="switch-thumb"></span>
              </button>
            </div>
          </div>
          <div class="wb-cat-add-row">
            <input
              v-model="newNoteCatName"
              type="text"
              class="wb-menu-name-input"
              placeholder="新分类名称"
              data-testid="wbcfg-note-new"
              @keydown.enter="handleAddNoteCat"
            />
            <button type="button" class="wb-menu-btn" :disabled="newNoteCatName.trim() === ''" data-testid="wbcfg-note-add" @click="handleAddNoteCat">添加</button>
          </div>
        </div>

        <!-- 数据时光机（仅工作台设置 tab）：快照列表 + 立即备份 + 单条恢复；数据存 IDB store 'snapshots' -->
        <div v-if="activeTab === 'wb'" class="wb-menu-config wb-snapshot-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">数据时光机</h3>
            <button
              type="button"
              class="row-reset"
              data-testid="wb-snapshot-now"
              :disabled="snapshotBusy"
              @click="handleSnapshotNow"
            >立即备份</button>
          </div>
          <p class="wb-menu-hint">进入工作台时自动备份当日数据（同日去重），环形保留最近 10 份；可随时恢复至历史快照</p>

          <div v-if="snapshotList.length === 0" class="wb-snapshot-empty" data-testid="wb-snapshot-empty">
            暂无快照
          </div>
          <div v-else class="wb-snapshot-list" data-testid="wb-snapshot-list">
            <div
              v-for="snap in snapshotList"
              :key="snap.id"
              class="wb-snapshot-row"
              :data-testid="`wb-snapshot-${snap.id}`"
            >
              <span class="wb-snapshot-time">{{ snapshotTime(snap.createdAt) }}</span>
              <span class="wb-snapshot-source">{{ snapshotSourceLabel(snap) }}快照</span>
              <button
                type="button"
                class="wb-menu-btn wb-snapshot-restore"
                :data-testid="`wb-snapshot-restore-${snap.id}`"
                :disabled="snapshotBusy"
                @click="handleRestoreSnapshot(snap)"
              >恢复</button>
            </div>
          </div>
        </div>

        <!-- 桌面通知（仅提醒设置 tab）：开关 + 开启时请求浏览器通知权限 + 权限状态提示 -->
        <div v-if="activeTab === 'remind'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">桌面通知</h3>
            <button
              type="button"
              class="switch-btn"
              :class="{ on: store.desktopNotifyEnabled }"
              role="switch"
              :aria-checked="store.desktopNotifyEnabled"
              data-testid="remind-desktop-switch"
              @click="onToggleDesktopNotify"
            >
              <span class="switch-thumb"></span>
            </button>
          </div>
          <p class="wb-menu-hint">
            开启后，倒计时提醒到点会弹出浏览器桌面通知；开启时将自动请求通知权限，若浏览器已拒绝，请在浏览器站点设置中重新授权
          </p>
        </div>

        <!-- 邮件提醒（仅提醒设置 tab）：EmailJS 配置（开关 + 四字段 + 测试发送） -->
        <div v-if="activeTab === 'remind'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">邮件提醒</h3>
            <button
              type="button"
              class="switch-btn"
              :class="{ on: store.reminderEmailEnabled }"
              role="switch"
              :aria-checked="store.reminderEmailEnabled"
              data-testid="remind-email-switch"
              @click="store.setReminderEmailEnabled(!store.reminderEmailEnabled)"
            >
              <span class="switch-thumb"></span>
            </button>
          </div>
          <p class="wb-menu-hint">EmailJS 需注册（emailjs.com）→ 创建 Service + Template（模板变量命名契约：to_email / countdown_name / occurrence_time / app_url）</p>

          <div class="remind-fields">
            <label class="remind-field">
              <span class="remind-label">收件邮箱</span>
              <input
                type="email"
                class="wb-menu-name-input"
                placeholder="example@email.com"
                data-testid="remind-email-to"
                :value="store.reminderEmailTo"
                @input="store.setReminderEmailTo(($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="remind-field">
              <span class="remind-label">Service ID</span>
              <input
                type="text"
                class="wb-menu-name-input"
                placeholder="service_xxxxxxxx"
                data-testid="remind-email-service"
                :value="store.reminderEmailServiceId"
                @input="store.setReminderEmailServiceId(($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="remind-field">
              <span class="remind-label">Template ID</span>
              <input
                type="text"
                class="wb-menu-name-input"
                placeholder="template_xxxxxxxx"
                data-testid="remind-email-template"
                :value="store.reminderEmailTemplateId"
                @input="store.setReminderEmailTemplateId(($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="remind-field">
              <span class="remind-label">Public Key</span>
              <input
                type="text"
                class="wb-menu-name-input"
                placeholder="public key"
                data-testid="remind-email-key"
                :value="store.reminderEmailPublicKey"
                @input="store.setReminderEmailPublicKey(($event.target as HTMLInputElement).value)"
              />
            </label>
          </div>

          <div class="remind-actions">
            <button
              type="button"
              class="wb-menu-btn"
              data-testid="remind-email-test"
              :disabled="!canTestEmail || testEmailBusy"
              @click="handleTestEmail"
            >发送测试邮件</button>
          </div>
        </div>

        <!-- 销售记账（仅销售记账 tab）：摊位名称 + 低库存阈值 + 商品/支出分类管理（复用页面内共享弹框） -->
        <div v-if="activeTab === 'business'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">销售记账设置</h3>
          </div>
          <p class="wb-menu-hint">摊位名称显示在销售记账页头部；库存低于阈值时在库存页与首页预警</p>
          <div class="remind-fields">
            <label class="remind-field">
              <span class="remind-label">摊位名称</span>
              <input
                type="text"
                class="wb-menu-name-input"
                maxlength="30"
                placeholder="例如：夜市A区小吃摊"
                data-testid="bizsettings-stall"
                :value="businessStore.settings.stallName"
                @input="businessStore.setStallName(($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="remind-field">
              <span class="remind-label">低库存阈值</span>
              <input
                type="number"
                min="0"
                step="1"
                class="wb-menu-name-input"
                data-testid="bizsettings-threshold"
                :value="String(businessStore.settings.lowStockThreshold)"
                @change="businessStore.setLowStockThreshold(Number(($event.target as HTMLInputElement).value) || 0)"
              />
            </label>
          </div>
          <div class="remind-actions">
            <button type="button" class="wb-menu-btn" data-testid="bizsettings-product-cats" @click="bizCatManagerKind = 'product'">管理商品分类</button>
            <button type="button" class="wb-menu-btn" data-testid="bizsettings-expense-cats" @click="bizCatManagerKind = 'expense'">管理支出分类</button>
          </div>
        </div>

        <div class="settings-grid" v-if="activeTab === 'nav' || activeTab === 'wb'">
          <div class="grid-header">
            <span class="col-label">弹窗</span>
            <span>宽度 (px)</span>
            <span>高度 (vh)</span>
            <span class="col-action"></span>
          </div>

          <div v-for="id in activeTab === 'nav' ? NAV_DIALOG_IDS : WB_DIALOG_IDS" :key="id" class="settings-row">
            <span class="row-label">{{ DIALOG_LABELS[id] }}</span>

            <div class="field">
              <input
                type="number"
                min="400"
                max="1600"
                step="1"
                class="num-input"
                :aria-label="`${DIALOG_LABELS[id]}宽度`"
                :value="drafts[id].width"
                @input="onWidthInput(id, $event)"
                @blur="onWidthBlur(id)"
              />
              <span class="unit">px</span>
            </div>

            <div class="field">
              <input
                type="number"
                min="30"
                max="100"
                step="1"
                class="num-input"
                :aria-label="`${DIALOG_LABELS[id]}高度`"
                :value="drafts[id].height"
                @input="onHeightInput(id, $event)"
                @blur="onHeightBlur(id)"
              />
              <span class="unit">vh</span>
            </div>

            <button class="row-reset" @click="resetRow(id)">恢复默认</button>
          </div>
        </div>
      </div>

      <div class="manager-footer">
        <span class="footer-hint">修改即时生效</span>
        <div class="footer-actions">
          <button class="btn-reset-all" @click="resetAll">恢复默认</button>
          <button class="btn-cancel" @click="emit('close')">取消</button>
        </div>
      </div>
    </div>

    <!-- 销售记账分类管理（共享弹框，z-index 高于设置弹窗） -->
    <BusinessCategoryManager v-if="bizCatManagerKind" :kind="bizCatManagerKind" @close="bizCatManagerKind = null" />
  </div>
</template>

<style scoped>
.manager-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  padding: 20px;
}

.manager {
  background-color: var(--bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 1296px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-modal);
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color, var(--color-border));
  flex-shrink: 0;
}

.manager-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-muted, var(--color-text-muted));
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: color var(--transition-fast, 0.15s ease);
}

.close-btn:hover {
  color: var(--text-primary, var(--color-text));
}

.manager-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.hint {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  margin: 0 0 16px 0;
}

/* 顶部 tab 栏（视觉对齐 workbench 面板 tabs，如 WorkbenchHealth.vue 的 .hd-tab） */
.settings-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.tab-btn {
  padding: 8px 16px;
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md);
  background-color: var(--bg-card, var(--color-bg-card));
  color: var(--text-secondary, var(--color-text-secondary));
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.tab-btn:hover {
  background-color: var(--bg-secondary, var(--color-bg-hover));
  color: var(--accent-color, var(--color-primary));
}

.tab-btn.active {
  background-color: var(--color-primary-light, #eff6ff);
  color: var(--accent-color, var(--color-primary));
  font-weight: 600;
}

:root.dark .tab-btn {
  background-color: var(--bg-secondary, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .tab-btn:hover {
  background-color: var(--hover-bg, #374151);
  color: var(--text-primary, #f9fafb);
}

:root.dark .tab-btn.active {
  background-color: #1e3a5f;
  color: #60a5fa;
}

/* 设置表格 */
.settings-grid {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md);
  overflow: hidden;
}

.grid-header,
.settings-row {
  display: grid;
  grid-template-columns: minmax(100px, 1.4fr) minmax(120px, 1fr) minmax(110px, 1fr) 92px;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
}

.grid-header {
  background: var(--bg-secondary, var(--color-bg-hover));
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted, var(--color-text-muted));
}

.settings-row {
  border-top: 1px solid var(--border-color, var(--color-border));
}

.row-label {
  font-size: 13px;
  color: var(--text-primary, var(--color-text));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field {
  display: flex;
  align-items: center;
  gap: 6px;
}

.num-input {
  width: 90px;
  padding: 6px 8px;
  background-color: var(--input-bg, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-primary, var(--color-text));
  box-sizing: border-box;
  transition: border-color var(--transition-fast, 0.15s ease);
}

.num-input:focus {
  outline: none;
  border-color: var(--accent-color, var(--color-primary));
}

.unit {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
  white-space: nowrap;
}

/* 重置类按钮共用样式 */
.row-reset,
.btn-reset-all {
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  transition: all var(--transition-fast, 0.15s ease);
}

.row-reset {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}

.btn-reset-all {
  padding: 10px 16px;
  font-size: 14px;
  border-radius: var(--radius-md);
}

.row-reset:hover,
.btn-reset-all:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

/* 底部操作栏 */
.manager-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-color, var(--color-border));
  flex-shrink: 0;
}

.footer-hint {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
}

.footer-actions {
  display: flex;
  gap: 12px;
}

.btn-cancel {
  padding: 10px 16px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md);
  font-size: 14px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-cancel:hover {
  background: var(--hover-bg, var(--color-bg-active));
}

/* 工作台菜单/城市配置区块（独立于 .settings-grid，不复用其列定义——R6） */
.wb-menu-config,
.wb-city-config {
  margin-bottom: 20px;
  padding: 14px;
  background-color: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md);
}

.wb-menu-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wb-menu-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
}

.wb-menu-hint {
  margin: 6px 0 12px;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
}

.wb-menu-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wb-menu-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.wb-menu-icon {
  flex-shrink: 0;
  width: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.wb-menu-name-input {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  padding: 6px 8px;
  font-size: 13px;
  color: var(--text-primary, var(--color-text));
  background-color: var(--input-bg, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm);
  transition: border-color var(--transition-fast, 0.15s ease);
}

.wb-menu-name-input:focus {
  outline: none;
  border-color: var(--accent-color, var(--color-primary));
}

.wb-menu-actions {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
}

.wb-menu-btn {
  padding: 4px 10px;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast, 0.15s ease);
}

.wb-menu-btn:hover:not(:disabled) {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.wb-menu-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

/* 开关按钮（工作台菜单显示开关 / 导航筛选栏展开控制共用） */
.switch-btn {
  flex-shrink: 0;
  width: 40px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid var(--border-color, var(--color-border));
  background-color: var(--bg-secondary, var(--color-bg-hover));
  cursor: pointer;
  padding: 0;
  position: relative;
  transition: background-color var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease);
}

.switch-btn .switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: var(--text-muted, var(--color-text-muted));
  transition: transform var(--transition-fast, 0.15s ease), background-color var(--transition-fast, 0.15s ease);
}

.switch-btn.on {
  background-color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.switch-btn.on .switch-thumb {
  transform: translateX(18px);
  background-color: #fff;
}

.switch-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

/* 菜单行开关关闭时的弱化态（行内输入/按钮整体降透明度提示） */
.wb-menu-row.is-disabled-item {
  opacity: 0.55;
}

:root.dark .switch-btn {
  background-color: var(--input-bg, #374151);
  border-color: var(--border-color, #4b5563);
}

:root.dark .switch-btn.on {
  background-color: var(--accent-color, #3b82f6);
  border-color: var(--accent-color, #3b82f6);
}

/* 数据时光机区块（复用 .wb-menu-config 容器，仅补充快照专属样式） */
.wb-snapshot-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wb-snapshot-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.wb-snapshot-time {
  font-size: 13px;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 分类管理：新增行（输入框 + 添加按钮，紧跟分类列表下方） */
.wb-cat-add-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

/* 分类管理：子标题（内置分类 / 自定义分类） */
.wb-cat-sub-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  margin-bottom: 8px;
}

/* 分类管理：标签页显示复选行（用于内置分类的 tab 可见性） */
.wbcat-tab-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.wbcat-tab-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 13px;
  border-radius: var(--radius-full, 999px);
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
}

.wbcat-tab-row input[type='checkbox'] {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--accent-color, var(--color-primary));
}

.wb-snapshot-source {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
}

.wb-snapshot-restore {
  flex-shrink: 0;
}

.wb-snapshot-empty {
  padding: 12px 0;
  font-size: 13px;
  color: var(--text-muted, var(--color-text-muted));
}

/* 暗色模式：沿用文件现有 :root.dark 变量覆盖惯例，确保区块文字可读 */
:root.dark .wb-menu-config,
:root.dark .wb-city-config {
  background-color: var(--bg-secondary, #1f2937);
  border-color: var(--border-color, #374151);
}

:root.dark .wb-menu-title {
  color: var(--text-primary, #f9fafb);
}

:root.dark .wb-menu-hint {
  color: var(--text-muted, #9ca3af);
}

:root.dark .wb-menu-name-input {
  color: var(--text-primary, #f9fafb);
  background-color: var(--input-bg, #111827);
  border-color: var(--border-color, #374151);
}

:root.dark .wb-menu-btn {
  color: var(--text-secondary, #d1d5db);
  background-color: var(--bg-card, #1f2937);
  border-color: var(--border-color, #374151);
}

:root.dark .wb-snapshot-time {
  color: var(--text-primary, #f9fafb);
}

:root.dark .wb-snapshot-source,
:root.dark .wb-snapshot-empty {
  color: var(--text-muted, #9ca3af);
}

/* 提醒设置区块：邮件配置字段行（输入框复用 .wb-menu-name-input，仅补标签列与操作区） */
.remind-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.remind-field {
  display: flex;
  align-items: center;
  gap: 10px;
}

.remind-label {
  flex-shrink: 0;
  width: 92px;
  font-size: 13px;
  color: var(--text-primary, var(--color-text));
}

.remind-actions {
  margin-top: 12px;
}

:root.dark .remind-label {
  color: var(--text-primary, #f9fafb);
}

@media (max-width: 640px) {
  .manager {
    max-height: 90vh;
  }

  .grid-header {
    display: none;
  }

  .settings-row {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .row-label {
    grid-column: 1 / -1;
  }

  .row-reset {
    grid-column: 1 / -1;
    justify-self: end;
  }
}
</style>
