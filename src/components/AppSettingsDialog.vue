<script setup lang="ts">
import { reactive, ref, computed, onMounted, onUnmounted, watch, nextTick, toRaw } from 'vue'
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
import { idbGet, idbPut, idbImportAll, idbExportAll } from '@/composables/useIdb'
import { localDateKey } from '@/composables/businessCore'
import { isEmailConfigured, buildEmailParams } from '@/composables/reminderCore'
import { sendReminderEmail } from '@/composables/reminderEmail'
import { requestNotifyPermission } from '@/composables/useDesktopNotify'
import yaml from 'js-yaml'
import { useRouter } from 'vue-router'
import { useSitesStore } from '@/stores/sites'
import { useSearchEnginesStore } from '@/stores/searchEngines'
import { captureSnapshot } from '@/composables/useSnapshots'
import type { SnapshotWithSource } from '@/composables/useSnapshots'
import { normalizeSnapshotList } from '@/composables/snapshotCore'
import type { SnapshotRecord } from '@/composables/snapshotCore'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import { useWorkbenchNotesStore } from '@/stores/workbenchNotes'
import { useWorkbenchDiaryStore } from '@/stores/workbenchDiary'
import { useCountdownsStore } from '@/stores/countdowns'
import { usePasswordsStore } from '@/stores/passwords'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { useWorkbenchLedgerStore } from '@/stores/workbenchLedger'
import { useWorkbenchPomodoroStore } from '@/stores/workbenchPomodoro'
import { useWorkbenchHabitsStore } from '@/stores/workbenchHabits'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { useStudentSettingsStore } from '@/stores/studentSettings'
import { STAGE_BADGE, type StudentStage } from '@/types'
import type { WorkbenchData } from '@/types'
import { COUNTDOWN_CATEGORIES } from '@/types'
import { categoryLabel } from '@/composables/countdownCore'
import { useCloudSync } from '@/composables/useCloudSync'
import {
  useHomeLayout,
  LAYOUT_CONTAINERS,
  CONTAINER_LABELS,
  CARD_LABELS
} from '@/composables/useHomeLayout'
import type { ContainerId } from '@/composables/useHomeLayout'
import Icon from '@/components/Icon.vue'
import BusinessCategoryManager from '@/components/business/BusinessCategoryManager.vue'
import CloudSyncConflictModal from './CloudSyncConflictModal.vue'

// 弹窗 id 列表：从导出的契约表派生（与 store 内部 DIALOG_IDS 顺序一致），
// 作为 drafts/syncAll 的全量来源；渲染分组用下方导出的 NAV/WB 数组
const DIALOG_IDS = Object.keys(DIALOG_DEFAULTS) as DialogId[]

// 当前激活的设置分组 tab（导航设置 / 工作台设置 / 提醒设置 / 销售记账 / 学生工作台 / 云同步）
type SettingsTabKey = 'nav' | 'wb' | 'remind' | 'business' | 'student' | 'sync'
// 子 tab keys：每个主 tab 下的子分组（仅内容多的主 tab 定义）
type NavSubTab = 'nav-appearance' | 'nav-display' | 'nav-site' | 'nav-size'
type WbSubTab = 'wb-city' | 'wb-menu' | 'wb-card' | 'wb-cat' | 'wb-backup' | 'wb-snapshot' | 'wb-size'
type BizSubTab = 'biz-base' | 'biz-backup'
type StuSubTab = 'stu-stage' | 'stu-info' | 'stu-subject' | 'stu-menu'
/** 来源页：nav=管理页、workbench=个人工作台、business=销售记账、student=学生工作台、all=全显示(向后兼容) */
type SettingsSource = 'nav' | 'workbench' | 'business' | 'student' | 'all'
const props = withDefaults(defineProps<{ source?: SettingsSource }>(), { source: 'all' })

/** 来源页 → 允许显示的 tab keys：按需求始终保留 sync 云同步 + remind 提醒设置，其余只显示来源页自己的 */
const SOURCE_TABS: Record<SettingsSource, SettingsTabKey[]> = {
  nav:        ['nav',      'sync', 'remind'],
  workbench:  ['wb',       'sync', 'remind'],
  business:   ['business', 'sync', 'remind'],
  student:    ['student',  'sync', 'remind'],
  all:        ['nav', 'wb', 'remind', 'business', 'student', 'sync']
}

/** 来源页默认激活的 tab（第一个=自己页面的设置tab），若不在可见集合里会被 visibleTabs watcher 回退到第一个可见 */
const DEFAULT_TAB_FOR_SOURCE: Record<SettingsSource, SettingsTabKey> = {
  nav: 'nav',
  workbench: 'wb',
  business: 'business',
  student: 'student',
  all: 'nav'
}
const activeTab = ref<SettingsTabKey>(DEFAULT_TAB_FOR_SOURCE[props.source] ?? 'nav')

// ========================================
// 第二层：子 tab（每个内容较多的主 tab 内部再分组）
// 子 tab 列表定义：key + 显示名称；主 tab 切换时 activeSubTab 回退到该主 tab 默认的第一个
// ========================================
type SubTabKey = NavSubTab | WbSubTab | BizSubTab | StuSubTab
interface SubTabDef { key: SubTabKey; label: string }
/** 主 tab → 子 tab 列表（顺序即显示顺序，第一个 = 默认选中） */
const SUB_TABS: Record<'nav' | 'wb' | 'business' | 'student', SubTabDef[]> = {
  nav: [
    { key: 'nav-appearance', label: '站点外观' },
    { key: 'nav-display', label: '显示控制' },
    { key: 'nav-site',    label: '站点管理' },
    { key: 'nav-size',    label: '弹窗尺寸' }
  ],
  wb: [
    { key: 'wb-city',     label: '天气城市' },
    { key: 'wb-menu',     label: '工作台菜单' },
    { key: 'wb-card',     label: '卡片尺寸' },
    { key: 'wb-cat',      label: '分类管理' },
    { key: 'wb-backup',   label: '工作台备份' },
    { key: 'wb-snapshot', label: '数据时光机' },
    { key: 'wb-size',     label: '弹窗尺寸' }
  ],
  business: [
    { key: 'biz-base',    label: '基础设置' },
    { key: 'biz-backup',  label: '备份导入导出' }
  ],
  student: [
    { key: 'stu-stage',   label: '学段' },
    { key: 'stu-info',    label: '学生信息' },
    { key: 'stu-subject', label: '学科清单' },
    { key: 'stu-menu',    label: '学生菜单' }
  ]
}
/** 当前激活的子 tab（主 tab 为 remind/sync 时此值无意义，模板不会渲染第二层） */
const activeSubTab = ref<SubTabKey>((SUB_TABS[DEFAULT_TAB_FOR_SOURCE[props.source] as 'nav']?.[0]?.key as SubTabKey) ?? 'nav-display')

/** 当前主 tab 的子 tab 列表（用于模板渲染第二层子 tab 条；主 tab 无 sub-tabs 时返回空数组） */
const currentSubTabs = computed<SubTabDef[]>(() => {
  const k = activeTab.value as SettingsTabKey
  if (k === 'nav' || k === 'wb' || k === 'business' || k === 'student') return SUB_TABS[k]
  return []
})

/** 切主 tab 时：若子 tab 不在新主 tab 的列表里，回退到新列表第一个（保证永不白屏） */
watch(activeTab, (_tab) => {
  const list = currentSubTabs.value
  if (list.length === 0) return
  if (!list.some(s => s.key === activeSubTab.value)) {
    activeSubTab.value = list[0].key
  }
}, { immediate: true })

const emit = defineEmits<{
  close: []
}>()

const store = useAppSettingsStore()
const businessStore = useWorkbenchBusinessStore()
const studentStore = useStudentSettingsStore()

/**
 * 最终可见 tabs：
 *   1) 按来源页 SOURCE_TABS 白名单过滤（只显示该页面专属 + 云同步 + 提醒设置）
 *   2) 再叠加 pageVisible 关闭隐藏（保留旧行为：入口被关的 tab 仍然隐藏）
 */
const visibleTabs = computed<SettingsTabKey[]>(() => {
  const allowed = SOURCE_TABS[props.source]
  return allowed.filter(tab => {
    if (tab === 'wb' || tab === 'remind') return store.workbenchPageVisible !== false
    if (tab === 'business') return store.businessPageVisible !== false
    if (tab === 'student') return store.studentPageVisible !== false
    return true
  })
})
// 可见 tabs 变化时：若当前激活 tab 已被隐藏，跳到第一个可见 tab
// 保证 source='student' 打开时不会停在不存在的 'nav' tab 导致白屏
watch(visibleTabs, (tabs) => {
  if (tabs.length > 0 && !tabs.includes(activeTab.value)) {
    activeTab.value = tabs[0]
  }
}, { immediate: true })

// 销售记账分类管理弹框（复用页面内共享组件；null = 关闭）
const bizCatManagerKind = ref<'product' | 'expense' | null>(null)
// 设置弹窗「去设置」入口单例（WeatherCard 等调用 openAppSettings() → 本组件订阅后定位到城市输入框）
const appSettings = useAppSettingsDialog()
const cityInput = ref<HTMLInputElement | null>(null)

// ========================================
// 站点管理（导航设置 tab）：原管理页工具栏九动作的迁移入口。
// 弹窗类动作 = 先关本设置弹窗，再经 URL query 打开目标（与 HomeView 既有 URL 协议一致）；
// 纯动作（导出/检测断链/导入）= 就地执行，不关设置。
// ========================================
const router = useRouter()
const sitesStore = useSitesStore()
const enginesStore = useSearchEnginesStore()
const siteImportInput = ref<HTMLInputElement | null>(null)

type SiteActionModalKey = 'add' | 'engines' | 'background' | 'category' | 'backup' | 'icons'

function openSiteManagerViaQuery(key: SiteActionModalKey) {
  emit('close')
  router.push({ query: { modal: key } })
}

// ========================================
// 站点外观（导航设置 tab）：浏览器标签标题 + favicon 上传/重置
// ========================================
const faviconFileInput = ref<HTMLInputElement | null>(null)

function triggerFaviconPick() {
  faviconFileInput.value?.click()
}

/** 读文件为 data URL（Promise 包装 FileReader） */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

/** 图片文件 → favicon data URL：SVG 原样保留，位图经 canvas 压缩至 ≤128px PNG 控体积 */
async function readFaviconFile(file: File): Promise<string> {
  if (file.type === 'image/svg+xml') return readFileAsDataUrl(file)
  const dataUrl = await readFileAsDataUrl(file)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('decode failed'))
    el.src = dataUrl
  })
  const MAX = 128
  const longest = Math.max(img.width || 1, img.height || 1)
  const scale = Math.min(1, MAX / longest)
  const w = Math.max(1, Math.round((img.width || MAX) * scale))
  const h = Math.max(1, Math.round((img.height || MAX) * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')?.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/png')
}

async function onFaviconFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const dataUrl = await readFaviconFile(file)
    store.setSiteFavicon(dataUrl)
  } catch {
    toast.error('图片读取失败，请换一张图片试试')
  } finally {
    input.value = ''
  }
}

function resetSiteFavicon() {
  store.setSiteFavicon('')
}

function triggerSiteImport() {
  siteImportInput.value?.click()
}

function handleSiteImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (e) => {
    const content = e.target?.result as string

    // 导入网站
    const result = await sitesStore.importFromMarkdown(content)

    // 如果有错误，直接显示错误信息
    if (result.error) {
      toast.error(`导入失败：${result.error}`)
      input.value = ''
      return
    }

    // 尝试导入搜索引擎
    let msg = `导入完成！新增 ${result.added} 条，跳过 ${result.skipped} 条`
    try {
      const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*/)
      if (frontmatterMatch) {
        const data = yaml.load(frontmatterMatch[1]) as Record<string, unknown>
        if (data?.searchEngines && Array.isArray(data.searchEngines)) {
          enginesStore.importEngines(data.searchEngines)
          msg += `；搜索引擎：已导入 ${data.searchEngines.length} 个`
        }
      }
    } catch {
      // 忽略搜索引擎导入错误
    }

    toast.success(msg)
    input.value = ''
  }
  reader.readAsText(file)
}

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
// 主页卡片尺寸（工作台设置 tab）：逐卡设置宽（占几列）/ 高（最小高度 px）
// 落库走 store.homeCardLayout；改完由 useHomeLayout 内部 600ms 防抖 pushNow 直推云端
// ========================================
const layout = useHomeLayout()

/** 按分区组织的卡片列表（顺序取自 LAYOUT_CONTAINERS，与主页网格默认顺序一致） */
const CARD_SIZE_GROUPS = (Object.keys(LAYOUT_CONTAINERS) as ContainerId[]).map((container) => ({
  container,
  label: CONTAINER_LABELS[container],
  maxCols: LAYOUT_CONTAINERS[container].maxCols,
  cards: LAYOUT_CONTAINERS[container].ids.map((id) => ({
    id,
    label: CARD_LABELS[id] ?? id
  }))
}))
const ALL_CARD_IDS = CARD_SIZE_GROUPS.flatMap((g) => g.cards.map((c) => c.id))

// 草稿态：数字框允许中间态（空串 / 超范围），失焦再回到 store 的 clamp 值
function createCardSizeDrafts(): Record<string, { w: string; h: string }> {
  const out: Record<string, { w: string; h: string }> = {}
  for (const id of ALL_CARD_IDS) {
    const lay = store.homeCardLayout[id] ?? {}
    out[id] = { w: lay.w === undefined ? '' : String(lay.w), h: lay.h === undefined ? '' : String(lay.h) }
  }
  return out
}
const cardSizeDraft = reactive(createCardSizeDrafts())

function syncCardSizeRow(id: string) {
  const lay = store.homeCardLayout[id] ?? {}
  cardSizeDraft[id].w = lay.w === undefined ? '' : String(lay.w)
  cardSizeDraft[id].h = lay.h === undefined ? '' : String(lay.h)
}

function syncAllCardSizes() {
  for (const id of ALL_CARD_IDS) syncCardSizeRow(id)
}

// 宽/高输入：空串 = 清除该项自定义、回退组件默认；合法数字才提交（clamp 由 composable + store 负责）
function onCardWInput(id: string, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  cardSizeDraft[id].w = raw
  if (raw === '') {
    layout.setCardSize(id, { w: undefined })
    return
  }
  const n = Number(raw)
  if (!Number.isFinite(n)) return
  layout.setCardSize(id, { w: n })
}

function onCardHInput(id: string, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  cardSizeDraft[id].h = raw
  if (raw === '') {
    layout.setCardSize(id, { h: undefined })
    return
  }
  const n = Number(raw)
  if (!Number.isFinite(n)) return
  layout.setCardSize(id, { h: n })
}

// 单行恢复默认：只重置该卡宽高，保留用户已拖出来的排序
function resetCardSizeRow(id: string) {
  layout.resetCardSize(id)
  syncCardSizeRow(id)
}

// 区块恢复默认：全部卡片宽高回默认，同样逐卡保留排序
function resetAllCardSizes() {
  layout.resetAllCardSizes()
  syncAllCardSizes()
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
// （镜像 WorkbenchView.handleImportFile：备份携带完整加密身份则接管，password-verification-v2 缺失且无身份时跳过密码恢复）
async function handleRestoreSnapshot(snapshot: SnapshotRecord): Promise<void> {
  if (!confirm(`确定要恢复到 ${snapshotTime(snapshot.createdAt)} 的快照吗？当前工作台数据将被覆盖。`)) return
  if (snapshotBusy.value) return
  snapshotBusy.value = true
  try {
    // 快照来自 reactive ref（snapshotList.value），嵌套字段是 Vue proxy —— IDB 结构化克隆无法处理
    // proxy（DataCloneError: could not be cloned），深拷贝脱 proxy 后再写 IDB（WorkbenchView
    // handleImportFile 从文件读纯对象故无此问题；快照数据本身是 JSON 兼容纯数据，JSON 往返安全）
    const rawData = JSON.parse(JSON.stringify(snapshot.data)) as WorkbenchData
    // 密码分支先决（镜像 WorkbenchView.handleImportFile）：
    // - 备份携带完整加密身份（v8：盐+验证串+非空密码库）→ 整包恢复并接管身份，解锁密码=来源设备的主密码
    // - 备份无身份且本设备无 v2 验证键（旧 v1-v7 数据恢复到新设备）→ 跳过密码恢复
    //   （写空串 passwords:'' —— idbImportAll 校验 passwords 为 string）
    const hasVaultIdentity = !!rawData.passwordsSalt && !!rawData.passwordVerification && !!rawData.passwords
    const localHasPassword = localStorage.getItem('password-verification-v2') !== null
    const skipPasswords = !hasVaultIdentity && !localHasPassword

    const { adoptedPasswordIdentity: adoptedIdentity } = await idbImportAll(
      skipPasswords ? { ...rawData, passwords: '' } : rawData
    )

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
    if (!skipPasswords) {
      // 身份接管可能已替换本机加密凭据（或覆盖已解锁会话的密文）→ 无条件锁定，
      // 强制重新解锁后查看新数据（已锁时 lock 为廉价 no-op）
      passwordsStore.lock()
      if (adoptedIdentity) {
        toast.success('导入成功：密码库已随备份迁移，请使用原设备的主密码解锁密码管理')
      }
    }

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
    if (skipPasswords) toast.warning('备份未内嵌密码加密身份（旧格式），已跳过密码恢复')
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

// ====================
// 工作台导入/导出（仅工作台设置 tab；原 WorkbenchView 头部按钮迁移过来）
// ====================
const wbTodosStore = useWorkbenchTodosStore()
const wbNotesStore = useWorkbenchNotesStore()
const wbDiaryStore = useWorkbenchDiaryStore()
const cdStore = useCountdownsStore()
const pwdsStore = usePasswordsStore()
const hlthStore = useWorkbenchHealthStore()
const ledStore = useWorkbenchLedgerStore()

function wbPad2(n: number): string {
  return String(n).padStart(2, '0')
}
function wbFormatDate(d: Date): string {
  return `${d.getFullYear()}-${wbPad2(d.getMonth() + 1)}-${wbPad2(d.getDate())}`
}

const wbImportInput = ref<HTMLInputElement | null>(null)

async function handleWbExport() {
  try {
    const data = await idbExportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `工作台备份-${wbFormatDate(new Date())}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success('工作台数据已导出')
  } catch (e) {
    console.error('[AppSettings] wb export failed', e)
    toast.error('导出失败')
  }
}
function handleWbImportClick(): void {
  wbImportInput.value?.click()
}
async function handleWbImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async (e) => {
    input.value = ''
    const content = e.target?.result as string
    let parsed: WorkbenchData
    try {
      parsed = JSON.parse(content) as WorkbenchData
    } catch {
      toast.error('文件不是有效 JSON')
      return
    }
    const hasVaultIdentity = !!parsed.passwordsSalt && !!parsed.passwordVerification && !!parsed.passwords
    const localHasPassword = localStorage.getItem('password-verification-v2') !== null
    const skipPasswords = !hasVaultIdentity && !localHasPassword
    let adoptedIdentity = false
    try {
      adoptedIdentity = (
        await idbImportAll(skipPasswords ? { ...parsed, passwords: '' } : parsed)
      ).adoptedPasswordIdentity
    } catch (err) {
      const msg = err instanceof Error ? err.message : '文件格式无效'
      toast.error(`导入失败：${msg}`)
      return
    }
    await Promise.all([
      wbTodosStore.loadTodos(),
      wbNotesStore.loadNotes(),
      wbDiaryStore.loadDiary(),
      cdStore.loadCountdowns(),
      hlthStore.loadHealth(),
      ledStore.loadLedger(),
      store.initSettings()
    ])
    if (skipPasswords) {
      toast.warning('备份未内嵌密码加密身份（旧格式），已跳过密码导入')
    } else {
      pwdsStore.lock()
      if (adoptedIdentity) {
        toast.success('导入成功：密码库已随备份迁移，请使用原设备的主密码解锁密码管理')
      }
    }
    const healthCount =
      hlthStore.records.exercise.length +
      hlthStore.records.diet.length +
      hlthStore.records.sleep.length +
      hlthStore.records.weight.length
    const countMsg = `导入成功：待办 ${wbTodosStore.todos.length} 条，便签 ${wbNotesStore.notes.length} 条，日记 ${wbDiaryStore.entries.length} 篇，倒计时 ${cdStore.countdowns.length} 条，健康 运动/饮食/睡眠/体重 记录 ${healthCount} 条，记账 ${ledStore.entries.length} 笔`
    toast.success(skipPasswords ? `${countMsg}（密码已跳过）` : `${countMsg}；密码库已导入`)
  }
  reader.readAsText(file)
}

// ====================
// 销售记账导入/导出（仅销售记账 tab；原 BusinessView 头部按钮迁移过来）
// ====================
const bizImportInput = ref<HTMLInputElement | null>(null)
function handleBizExport(): void {
  try {
    const payload = {
      type: 'business-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        productCategories: toRaw(businessStore.productCategories),
        expenseCategories: toRaw(businessStore.expenseCategories),
        products: toRaw(businessStore.products),
        purchases: toRaw(businessStore.purchases),
        dailyRecords: toRaw(businessStore.dailyRecords),
        expenses: toRaw(businessStore.expenses),
        settings: toRaw(businessStore.settings)
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
    toast.success('销售记账数据已导出')
  } catch (e) {
    console.error('[AppSettings] biz export failed', e)
    toast.error('导出失败')
  }
}
function handleBizImportClick(): void {
  bizImportInput.value?.click()
}
async function handleBizImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async (e) => {
    input.value = ''
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
      const data = await businessStore.importData(parsed.data)
      toast.success(
        `导入成功：商品 ${data.products.length} 个，进货 ${data.purchases.length} 条，收摊记录 ${data.dailyRecords.length} 条，支出 ${data.expenses.length} 笔`
      )
    } catch (err) {
      toast.error(`导入失败：${err instanceof Error ? err.message : '文件格式无效'}`)
    }
  }
  reader.readAsText(file)
}

// ====================
// 学生工作台（仅学生工作台 tab）：页面名称/可见性 + 学段切换 + 昵称 + 学科清单
// ====================
const studentStageOptions: { key: StudentStage; label: string; desc: string }[] = [
  { key: 'K', label: '幼儿园', desc: '游戏化任务 · 家长主导 · 图标卡片' },
  { key: 'P', label: '小学', desc: '作业管理 · 习惯养成 · 阅读记录' },
  { key: 'J', label: '初中', desc: '学科管理 · 复习计划 · 错题本' }
]
const studentStageBadgeColor = computed(() => STAGE_BADGE[studentStore.stage].color)
const studentStageBadgeLabel = computed(() => STAGE_BADGE[studentStore.stage].label)
const studentStageName = computed(() => studentStore.stageLabelName)

const studentNicknameInput = ref<HTMLInputElement | null>(null)
const studentNewSubject = ref('')

async function onStudentStageSwitch(newStage: StudentStage): Promise<void> {
  if (newStage === studentStore.stage) return
  // 切学段会重置菜单可见性到学段默认值 + 播种默认学科（M2 起补习惯/番茄钟）
  if (!confirm(`切换到「${studentStageOptions.find(o => o.key === newStage)?.label ?? ''}」学段？\n菜单可见性将应用该学段默认值，已有学段默认学科将重新初始化。`)) return
  try {
    await studentStore.switchStage(newStage)
    toast.success(`已切换到「${studentStageName.value}」学段`)
  } catch (err) {
    console.warn('student stage switch failed:', err)
    toast.error('学段切换失败，请重试')
  }
}

function onStudentNicknameCommit(): void {
  const input = studentNicknameInput.value
  if (!input) return
  const name = input.value.trim()
  studentStore.setNickname(name)
  toast.success(name ? `昵称已更新为「${name}」` : '昵称已清空')
}

function onStudentAddSubject(): void {
  const name = studentNewSubject.value.trim()
  if (!name) return
  const ok = studentStore.addSubject(name)
  if (ok) {
    studentNewSubject.value = ''
    toast.success(`已新增学科「${name}」`)
  } else {
    toast.error('学科已存在')
  }
}

function onStudentRemoveSubject(name: string): void {
  if (!confirm(`删除学科「${name}」？\n已有作业/复习/错题记录不会自动迁移到其他学科。`)) return
  const ok = studentStore.removeSubject(name)
  if (ok) toast.success(`已删除学科「${name}」`)
  else toast.error('删除失败')
}

function onStudentResetMenu(): void {
  if (!confirm('恢复学生菜单为当前学段默认顺序与可见性？')) return
  studentStore.resetMenu()
  toast.success('学生菜单已恢复默认')
}

function onStudentMoveMenu(key: string, dir: 'up' | 'down'): void {
  const r = studentStore.moveMenuItem(key, dir)
  if (!r.ok && r.reason === 'boundary') {
    toast.info('已在边界，无法继续移动')
  }
}

function onStudentRenameMenu(key: string): void {
  // 简易内联改名：使用 prompt（避免引入额外弹窗组件）
  const current = studentStore.menuLabels[key] ?? ''
  const next = window.prompt('请输入菜单名称', current)
  if (next === null) return
  const r = studentStore.renameMenuItem(key, next)
  if (!r.ok && r.reason === 'empty') toast.error('名称不能为空')
}

function onStudentToggleMenu(key: string, visible: boolean): void {
  studentStore.setMenuVisibility(key, visible)
}

// 设置弹窗打开时切到学生工作台 tab 的支持（外部 openAppSettings 入口用）
watch(
  () => activeTab.value,
  (tab) => {
    if (tab === 'student' && !studentStore.loaded) {
      // 弹窗内首次切到学生 tab 时再异步加载（避免阻塞弹窗初始化）
      void studentStore.loadSettings()
    }
  }
)

// ====================
// 云同步（仅云同步 tab）
// ====================
const cloudSync = useCloudSync()
const syncTestBusy = ref(false)
const syncNowBusy = ref(false)
const forcePullBusy = ref(false)
const pushLocalBusy = ref(false)

const lastSyncText = computed(() => {
  const t = cloudSync.lastSyncAt.value
  if (!t) return '未同步'
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})

async function onToggleCloudSync(): Promise<void> {
  const next = !store.cloudSyncEnabled
  store.setCloudSyncEnabled(next)
  if (next) {
    toast.info('云同步已启用，请填入 WebDAV 配置后点「测试连接」')
  }
}

async function handleSyncTest(): Promise<void> {
  if (syncTestBusy.value) return
  syncTestBusy.value = true
  const result = await cloudSync.testConnection(store.cloudSyncUrl, store.cloudSyncUsername, store.cloudSyncPassword)
  syncTestBusy.value = false
  if (result.ok) {
    toast.success('连接成功')
  } else {
    toast.error(result.error ?? '连接失败')
  }
}

async function handleSyncNow(): Promise<void> {
  if (syncNowBusy.value) return
  syncNowBusy.value = true
  await cloudSync.syncNow()
  syncNowBusy.value = false
}

/** 以云端覆盖本地：外部工具改过云端 JSON 后常规同步不生效时的兜底入口 */
async function handleForcePull(): Promise<void> {
  if (forcePullBusy.value) return
  const confirmed = window.confirm(
    '将忽略本地未推送的改动，无条件用云端数据覆盖本地。\n\n适用于：用备份编辑技能或手工改过云端文件后，「立即同步」未生效的情况。\n\n确定继续吗？'
  )
  if (!confirmed) return
  forcePullBusy.value = true
  await cloudSync.forcePullRemote()
  forcePullBusy.value = false
}

/** 本地推送云端：跳过远端变更检测守卫，强制以本地数据覆盖云端 */
async function handlePushLocal(): Promise<void> {
  if (pushLocalBusy.value) return
  const confirmed = window.confirm(
    '将用本地数据覆盖云端（其他设备 / 外部工具对云端的改动会丢失）。\n\n适用于：要把本机最新改动强制推上云、且不在乎云端旧版本时。\n\n确定继续吗？'
  )
  if (!confirmed) return
  pushLocalBusy.value = true
  await cloudSync.pushNow(false, true)
  pushLocalBusy.value = false
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

// --- 记账分类（复用 workbenchLedger 的 addCategory/updateCategory/deleteCategory，内置8分组不可删） ---
const ledgerCatDrafts = reactive<Record<string, string>>({})
const ledgerCatEditType = reactive<Record<string, 'income' | 'expense'>>({})
const ledgerCatEditingId = ref<string | null>(null)
const newLedgerCatName = ref('')
const newLedgerCatType = ref<'income' | 'expense'>('expense')

const sortedLedgerCategories = computed(() => ledStore.sortedCategories)

function initLedgerCats(): void {
  for (const c of sortedLedgerCategories.value) {
    if (!(c.id in ledgerCatDrafts)) ledgerCatDrafts[c.id] = c.name
    if (!(c.id in ledgerCatEditType)) ledgerCatEditType[c.id] = c.type
  }
}

async function ledgerCatStartEdit(c: { id: string; name: string; type: 'income' | 'expense' }): Promise<void> {
  ledgerCatEditingId.value = c.id
  ledgerCatDrafts[c.id] = c.name
  ledgerCatEditType[c.id] = c.type
}
function ledgerCatCancelEdit(): void { ledgerCatEditingId.value = null }

async function ledgerCatSave(id: string): Promise<void> {
  if (ledgerCatEditingId.value !== id) return
  const name = ledgerCatDrafts[id]?.trim() ?? ''
  if (!name) { toast.error('分类名称不能为空'); return }
  const type = ledgerCatEditType[id] ?? 'expense'
  const ok = await ledStore.updateCategory(id, { name, type })
  if (!ok) { toast.error('分类名称已存在'); return }
  ledgerCatEditingId.value = null
}

async function handleAddLedgerCat(): Promise<void> {
  const name = newLedgerCatName.value.trim()
  if (!name) return
  const ok = await ledStore.addCategory({ name, type: newLedgerCatType.value })
  if (!ok) { toast.error('分类名称已存在'); return }
  newLedgerCatName.value = ''
}

async function handleDeleteLedgerCat(id: string): Promise<void> {
  const c = sortedLedgerCategories.value.find(x => x.id === id)
  if (!c) return
  if (!confirm(`确定要删除记账分类「${c.name}」吗？\n\n该分类被记账记录使用时将无法删除。`)) return
  const res = await ledStore.deleteCategory(id)
  if (!res.ok) {
    if (res.reason === 'in-use') toast.error('该分类已被记账记录使用，无法删除')
    else if (res.reason === 'builtin') toast.error('内置分类不可删除')
    else toast.error('分类删除失败')
    return
  }
  delete ledgerCatDrafts[id]
  delete ledgerCatEditType[id]
}

// 订阅「去设置」打开事件（useAppSettingsDialog 单例）：打开时切到工作台设置 tab 并聚焦城市输入框；
// 一次性消费打开标志（closeAppSettings），避免后续挂载重复触发
let stopWatchSettings: (() => void) | undefined

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  // 弹窗打开即加载快照列表（对话框 v-if 挂载，onMounted = 打开时刻）
  loadSnapshots()
  // 初始化分类草稿（确保草稿映射与 store 实时）
  initTodoCats()
  initCdCats()
  initNoteCats()
  // 记账 store 可能还未随工作台挂载加载 → 防御性加载一次
  try { await ledStore.loadLedger() } catch { /* ignore */ }
  initLedgerCats()
  stopWatchSettings = watch(
    () => appSettings.showAppSettings.value,
    async (open) => {
      if (open) {
        // WeatherCard 入口只在工作台页面有意义；如果来源页不含 wb（极端来源），仍然选首个可见 tab
        if (visibleTabs.value.includes('wb')) {
          activeTab.value = 'wb'
        } else if (visibleTabs.value.length > 0 && !visibleTabs.value.includes(activeTab.value)) {
          activeTab.value = visibleTabs.value[0]
        }
        // 每次打开设置弹窗，重新拉取记账分类（与工作台页面保持最新）
        try { await ledStore.loadLedger() } catch { /* ignore */ }
        initLedgerCats()
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
    if (tab === 'wb') {
      loadSnapshots()
      // 切回工作台 tab 时也刷新记账分类（工作台页面可能刚改过）
      initLedgerCats()
    }
  }
)

// 当工作台/销售记账/学生工作台可见性关闭时，自动切离对应 tab
// visibleTabs 已经把 pageVisible 关闭的过滤掉了，所以只要当前激活的 tab 不在可见集合里，就回退可见 tab 的第一个
watch(
  [() => store.workbenchPageVisible, () => store.businessPageVisible, () => store.studentPageVisible],
  () => {
    const tabs = visibleTabs.value
    if (tabs.length > 0 && !tabs.includes(activeTab.value)) {
      activeTab.value = tabs[0]
    }
  }
)

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  stopWatchSettings?.()
})
</script>

<template>
  <Transition name="dialog">
    <div class="manager-overlay" @click.self="emit('close')">
    <div class="manager">
      <div class="manager-header">
        <h2><Icon name="cog" /> 设置</h2>
        <button class="close-btn" @click="emit('close')"><Icon name="close" /></button>
      </div>

      <div class="manager-body">
        <div class="settings-tabs" role="tablist">
          <button
            v-if="visibleTabs.includes('nav')"
            type="button"
            role="tab"
            class="tab-btn"
            :class="{ active: activeTab === 'nav' }"
            :aria-selected="activeTab === 'nav'"
            @click="activeTab = 'nav'"
          >导航设置</button>
          <button
            v-if="visibleTabs.includes('wb')"
            type="button"
            role="tab"
            class="tab-btn"
            :class="{ active: activeTab === 'wb' }"
            :aria-selected="activeTab === 'wb'"
            @click="activeTab = 'wb'"
          >工作台设置</button>
          <button
            v-if="visibleTabs.includes('remind')"
            type="button"
            role="tab"
            class="tab-btn"
            :class="{ active: activeTab === 'remind' }"
            :aria-selected="activeTab === 'remind'"
            @click="activeTab = 'remind'"
          >提醒设置</button>
          <button
            v-if="visibleTabs.includes('business')"
            type="button"
            role="tab"
            class="tab-btn"
            :class="{ active: activeTab === 'business' }"
            :aria-selected="activeTab === 'business'"
            data-testid="settings-tab-business"
            @click="activeTab = 'business'"
          >{{ store.businessPageDisplayName }}</button>
          <button
            v-if="visibleTabs.includes('student')"
            type="button"
            role="tab"
            class="tab-btn"
            :class="{ active: activeTab === 'student' }"
            :aria-selected="activeTab === 'student'"
            data-testid="settings-tab-student"
            @click="activeTab = 'student'"
          >{{ store.studentPageDisplayName }}</button>
          <button
            v-if="visibleTabs.includes('sync')"
            type="button"
            role="tab"
            class="tab-btn"
            :class="{ active: activeTab === 'sync' }"
            :aria-selected="activeTab === 'sync'"
            @click="activeTab = 'sync'"
          >云同步</button>
        </div>

        <!-- 第二层：子 tab 条（仅 nav/wb/business/student 四个内容多的主 tab 才渲染；remind/sync 不显示） -->
        <div v-if="currentSubTabs.length > 0" class="settings-tabs settings-tabs-sub" role="tablist">
          <button
            v-for="st in currentSubTabs"
            :key="st.key"
            type="button"
            role="tab"
            class="tab-btn sub-tab-btn"
            :class="{ active: activeSubTab === st.key }"
            :aria-selected="activeSubTab === st.key"
            :data-testid="`subtab-${st.key}`"
            @click="activeSubTab = st.key"
          >{{ st.label }}</button>
        </div>

        <!-- 弹窗尺寸提示：仅当导航/工作台 tab 且子 tab 切到"弹窗尺寸"时才显示 -->
        <p v-if="(activeTab === 'nav' && activeSubTab === 'nav-size') || (activeTab === 'wb' && activeSubTab === 'wb-size')" class="hint">调整各弹窗的默认尺寸，修改即时生效并自动保存。</p>

        <!-- 站点外观（导航设置 tab - 站点外观）：浏览器标签页标题与图标 -->
        <div v-if="activeTab === 'nav' && activeSubTab === 'nav-appearance'" class="wb-menu-config">
          <h3 class="wb-menu-title">站点外观</h3>

          <!-- 站点名称（浏览器标签页标题） -->
          <div class="wb-menu-head">
            <span class="wb-menu-label">站点名称</span>
            <input
              type="text"
              class="wb-menu-name-input"
              :value="store.siteTitle"
              placeholder="网页导航"
              maxlength="30"
              data-testid="site-title-input"
              @input="store.setSiteTitle(($event.target as HTMLInputElement).value)"
            />
          </div>
          <p class="wb-menu-hint">
            显示在浏览器标签页的标题，留空使用默认「网页导航」，修改即时生效。
          </p>

          <!-- 站点图标（浏览器标签 favicon） -->
          <div class="wb-menu-head">
            <span class="wb-menu-label">站点图标</span>
            <div class="site-favicon-row">
              <img class="site-favicon-preview" :src="store.siteFavicon || '/vite.svg'" alt="站点图标预览" />
              <input
                ref="faviconFileInput"
                type="file"
                accept="image/*"
                class="site-favicon-file"
                data-testid="site-favicon-file"
                @change="onFaviconFileChange"
              />
              <button type="button" class="site-action-btn" data-testid="site-favicon-upload" @click="triggerFaviconPick">上传图标</button>
              <button type="button" class="site-action-btn" data-testid="site-favicon-reset" @click="resetSiteFavicon">恢复默认</button>
            </div>
          </div>
          <p class="wb-menu-hint">
            浏览器标签页的图标，支持 PNG / JPG / SVG / ICO，自动压缩至 128px；「恢复默认」还原为内置图标。
          </p>
        </div>

        <!-- 导航筛选栏（导航设置 tab - 显示控制）：控制导航管理页分类/标签栏展开或收起（默认收起） -->
        <div v-if="activeTab === 'nav' && activeSubTab === 'nav-display'" class="wb-menu-config nav-filter-config">
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

        <!-- 页面导航名称与可见性（导航设置 tab - 显示控制） -->
        <div v-if="activeTab === 'nav' && activeSubTab === 'nav-display'" class="wb-menu-config">
          <h3 class="wb-menu-title">页面导航</h3>

          <!-- 工作台 -->
          <div class="wb-menu-head">
            <span class="wb-menu-label">工作台</span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <input
                type="text"
                class="wb-menu-name-input"
                :value="store.workbenchPageName"
                placeholder="工作台"
                maxlength="20"
                @input="store.setWorkbenchPageName(($event.target as HTMLInputElement).value)"
              />
              <button type="button" class="switch-btn"
                :class="{ on: store.workbenchPageVisible !== false }"
                role="switch"
                :aria-checked="store.workbenchPageVisible !== false"
                data-testid="workbench-visible-switch"
                @click="store.setWorkbenchPageVisible(store.workbenchPageVisible === false)">
                <span class="switch-thumb"></span>
              </button>
            </div>
          </div>
          <p class="wb-menu-hint">
            控制管理页「工作台」按钮的显示。关闭后工作台设置和提醒设置一并隐藏。
          </p>

          <!-- 销售记账 -->
          <div class="wb-menu-head">
            <span class="wb-menu-label">销售记账</span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <input
                type="text"
                class="wb-menu-name-input"
                :value="store.businessPageName"
                placeholder="销售记账"
                maxlength="20"
                @input="store.setBusinessPageName(($event.target as HTMLInputElement).value)"
              />
              <button type="button" class="switch-btn"
                :class="{ on: store.businessPageVisible !== false }"
                role="switch"
                :aria-checked="store.businessPageVisible !== false"
                data-testid="business-visible-switch"
                @click="store.setBusinessPageVisible(store.businessPageVisible === false)">
                <span class="switch-thumb"></span>
              </button>
            </div>
          </div>
          <p class="wb-menu-hint">
            控制管理页「销售记账」按钮的显示。关闭后销售记账设置页一并隐藏。
          </p>

          <!-- 学生工作台 -->
          <div class="wb-menu-head">
            <span class="wb-menu-label">学生工作台</span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <input
                type="text"
                class="wb-menu-name-input"
                :value="store.studentPageName"
                placeholder="学生工作台"
                maxlength="20"
                @input="store.setStudentPageName(($event.target as HTMLInputElement).value)"
              />
              <button type="button" class="switch-btn"
                :class="{ on: store.studentPageVisible !== false }"
                role="switch"
                :aria-checked="store.studentPageVisible !== false"
                data-testid="student-visible-switch"
                @click="store.setStudentPageVisible(store.studentPageVisible === false)">
                <span class="switch-thumb"></span>
              </button>
            </div>
          </div>
          <p class="wb-menu-hint">
            控制管理页「学生工作台」按钮的显示。关闭后学生工作台设置页一并隐藏。
          </p>
        </div>

        <!-- 站点管理（导航设置 tab - 站点管理）：原管理页工具栏九动作迁移入口；弹窗类先关设置再开目标，纯动作就地执行 -->
        <div v-if="activeTab === 'nav' && activeSubTab === 'nav-site'" class="wb-menu-config">
          <h3 class="wb-menu-title">站点管理</h3>
          <div class="site-actions-grid" data-testid="stg-site-actions">
            <button type="button" class="site-action-btn" data-testid="stg-act-import" @click="triggerSiteImport"><Icon name="download" /> 导入</button>
            <button type="button" class="site-action-btn" data-testid="stg-act-export" @click="sitesStore.exportToMarkdown()"><Icon name="upload" /> 导出</button>
            <button type="button" class="site-action-btn" data-testid="stg-act-add" @click="openSiteManagerViaQuery('add')">＋ 添加网址</button>
            <button
              type="button"
              class="site-action-btn"
              data-testid="stg-act-check-links"
              :disabled="sitesStore.isCheckingLinks"
              @click="sitesStore.checkDeadLinks()"
            >
              <span v-if="sitesStore.isCheckingLinks"><Icon name="timer-sand" /> 检测中 ({{ sitesStore.linkCheckProgress?.current }}/{{ sitesStore.linkCheckProgress?.total }})</span>
              <span v-else><Icon name="link" /> 检测断链<span v-if="sitesStore.invalidCount > 0" class="site-invalid-count">({{ sitesStore.invalidCount }})</span></span>
            </button>
            <button type="button" class="site-action-btn" data-testid="stg-act-engines" @click="openSiteManagerViaQuery('engines')"><Icon name="search" /> 引擎管理</button>
            <button type="button" class="site-action-btn" data-testid="stg-act-background" @click="openSiteManagerViaQuery('background')"><Icon name="image" /> 背景</button>
            <button type="button" class="site-action-btn" data-testid="stg-act-category" @click="openSiteManagerViaQuery('category')"><Icon name="cog" /> 分类管理</button>
            <button type="button" class="site-action-btn" data-testid="stg-act-backup" @click="openSiteManagerViaQuery('backup')"><Icon name="package" /> 备份</button>
            <button type="button" class="site-action-btn" data-testid="stg-act-icons" @click="openSiteManagerViaQuery('icons')"><Icon name="palette" /> 图标管理</button>
          </div>
          <input
            ref="siteImportInput"
            type="file"
            accept=".md,text/markdown"
            style="display: none"
            @change="handleSiteImport"
          />
          <input
            ref="wbImportInput"
            type="file"
            accept=".json,application/json"
            style="display: none"
            @change="handleWbImportFile"
          />
          <input
            ref="bizImportInput"
            type="file"
            accept=".json,application/json"
            style="display: none"
            @change="handleBizImportFile"
          />
        </div>

        <!-- 天气城市（工作台设置 tab - 天气城市）：配置工作台天气卡显示城市；留空 = 未配置（天气卡显示占位） -->
        <div v-if="activeTab === 'wb' && activeSubTab === 'wb-city'" class="wb-city-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">天气城市</h3>
          </div>
          <p class="wb-menu-hint">设置工作台天气卡显示的城市，留空表示未配置</p>
          <el-input
            ref="cityInput"
            placeholder="如：北京"
            data-testid="wb-city-input"
            v-model="store.workbenchCity"
            @change="commitCity"
          />
        </div>

        <!-- 工作台菜单（工作台设置 tab - 工作台菜单）：排序 + 改名 + 区块恢复默认；主页恒置顶不可动 -->
        <div v-if="activeTab === 'wb' && activeSubTab === 'wb-menu'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">工作台菜单</h3>
            <el-button size="small" data-testid="wbmenu-reset" @click="store.resetWorkbenchMenu()">恢复默认</el-button>
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
              <el-input
                :maxlength="12"
                :data-testid="`wbmenu-name-${item.key}`"
                :aria-label="`${item.label}名称`"
                :model-value="menuEditing[item.key] ?? item.label"
                @update:model-value="menuEditing[item.key] = $event"
                @blur="commitMenuName(item.key)"
                @keydown.enter="commitMenuName(item.key)"
                @keydown.esc.stop="revertMenuName(item.key)"
              />
              <div class="wb-menu-actions">
                <el-button
                  size="small"
                  :data-testid="`wbmenu-up-${item.key}`"
                  :disabled="isMenuUpDisabled(item, index)"
                  :aria-disabled="isMenuUpDisabled(item, index) ? 'true' : 'false'"
                  @click="onMoveMenu(item.key, 'up')"
                >上移</el-button>
                <el-button
                  size="small"
                  :data-testid="`wbmenu-down-${item.key}`"
                  :disabled="isMenuDownDisabled(item, index)"
                  :aria-disabled="isMenuDownDisabled(item, index) ? 'true' : 'false'"
                  @click="onMoveMenu(item.key, 'down')"
                >下移</el-button>
              </div>
              <el-switch
                :model-value="store.isWorkbenchMenuEnabled(item.key)"
                @change="store.setWorkbenchMenuVisibility(item.key, $event)"
                :disabled="item.key === 'home'"
                :title="item.key === 'home' ? '主页为默认页，不可关闭' : store.isWorkbenchMenuEnabled(item.key) ? '关闭此功能' : '开启此功能'"
                :data-testid="`wbmenu-switch-${item.key}`"
              />
            </div>
          </div>
        </div>

        <!-- 主页卡片尺寸（工作台设置 tab - 卡片尺寸）：逐卡设置宽（占几列）/ 高（最小高度 px） -->
        <div v-if="activeTab === 'wb' && activeSubTab === 'wb-card'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">主页卡片尺寸</h3>
            <el-button size="small" data-testid="wbcard-reset-all" @click="resetAllCardSizes()">恢复默认</el-button>
          </div>
          <p class="wb-menu-hint">宽度 = 卡片横向占几列（上限为所属网格的列数）；高度 = 卡片最小高度（px），内容更高时自动撑开。留空即回退默认。修改后立即保存并推送到云同步文件。</p>

          <div v-for="group in CARD_SIZE_GROUPS" :key="group.container" class="wb-cardsize-group">
            <div class="wb-cardsize-group-title">{{ group.label }}</div>
            <div class="wb-menu-list">
              <div
                v-for="card in group.cards"
                :key="card.id"
                class="wb-menu-row wb-cardsize-row"
                :data-testid="`wbcard-row-${card.id}`"
              >
                <span class="wb-cardsize-name">{{ card.label }}</span>
                <label class="wb-cardsize-field">
                  宽
                  <el-input-number
                    :min="1"
                    :step="1"
                    :max="group.maxCols"
                    :model-value="cardSizeDraft[card.id].w === '' ? undefined : Number(cardSizeDraft[card.id].w)"
                    :aria-label="`${card.label}宽度`"
                    :data-testid="`wbcard-w-${card.id}`"
                    @input="onCardWInput(card.id, { target: { value: String($event ?? '') } } as unknown as Event)"
                    @blur="syncCardSizeRow(card.id)"
                  />
                </label>
                <label class="wb-cardsize-field">
                  高
                  <el-input-number
                    :min="60"
                    :max="1200"
                    :step="10"
                    :model-value="cardSizeDraft[card.id].h === '' ? undefined : Number(cardSizeDraft[card.id].h)"
                    :aria-label="`${card.label}高度`"
                    :data-testid="`wbcard-h-${card.id}`"
                    @input="onCardHInput(card.id, { target: { value: String($event ?? '') } } as unknown as Event)"
                    @blur="syncCardSizeRow(card.id)"
                  />
                </label>
                <button
                  type="button"
                  class="row-reset"
                  :data-testid="`wbcard-reset-${card.id}`"
                  @click="resetCardSizeRow(card.id)"
                >默认</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 待办分类管理（工作台设置 tab - 分类管理）：改名/上下移/删除/新增 + 标签页显示勾选 -->
        <div v-if="activeTab === 'wb' && activeSubTab === 'wb-cat'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">待办分类</h3>
          </div>
          <p class="wb-menu-hint">管理待办面板的分类列表；分类被待办引用时无法删除；勾选的分类会显示在面板筛选标签页</p>
          <div class="wb-menu-list">
            <div v-for="(cat, idx) in todosCatStore.customCategories" :key="cat" class="wb-menu-row">
              <el-input
                :model-value="todoCatDrafts[cat] ?? cat"
                @update:model-value="todoCatDrafts[cat] = $event"
                @blur="commitTodoCatName(cat)"
                @keydown.enter="commitTodoCatName(cat)"
                @keydown.esc="revertTodoCatName(cat)"
                :data-testid="`wbcfg-todo-name-${cat}`"
              />
              <div class="wb-menu-actions">
                <el-button size="small" :disabled="idx <= 0" :data-testid="`wbcfg-todo-up-${cat}`" @click="handleMoveTodoCat(cat, 'up')">上移</el-button>
                <el-button size="small" :disabled="idx >= todosCatStore.customCategories.length - 1" :data-testid="`wbcfg-todo-down-${cat}`" @click="handleMoveTodoCat(cat, 'down')">下移</el-button>
              </div>
              <el-button size="small" type="danger" :data-testid="`wbcfg-todo-del-${cat}`" @click="handleDeleteTodoCat(cat)">删除</el-button>
              <el-switch
                :model-value="todosCatStore.tabCategories.includes(cat)"
                @change="todosCatStore.toggleTabCategory(cat, $event)"
                :data-testid="`wbcfg-todo-tab-${cat}`"
              />
            </div>
          </div>
          <div class="wb-cat-add-row">
            <el-input
              v-model="newTodoCatName"
              placeholder="新分类名称"
              data-testid="wbcfg-todo-new"
              @keydown.enter="handleAddTodoCat"
            />
            <el-button size="small" :disabled="newTodoCatName.trim() === ''" data-testid="wbcfg-todo-add" @click="handleAddTodoCat">添加</el-button>
          </div>
        </div>

        <!-- 倒计时分类管理（工作台设置 tab - 分类管理）：内置分类标签页显示 + 自定义分类改名/上下移/删除/新增 -->
        <div v-if="activeTab === 'wb' && activeSubTab === 'wb-cat'" class="wb-menu-config">
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
              <el-checkbox
                :model-value="countdownsCatStore.tabCategories.includes(c)"
                @change="countdownsCatStore.setTabCategory(c, $event)"
              />
              <span>{{ categoryLabel(c) }}</span>
            </label>
          </div>

          <!-- 自定义分类 -->
          <div class="wb-cat-sub-title">自定义分类</div>
          <div class="wb-menu-list">
            <div v-for="(cat, idx) in countdownsCatStore.customCategories" :key="cat" class="wb-menu-row">
              <el-input
                :model-value="cdCatDrafts[cat] ?? cat"
                @update:model-value="cdCatDrafts[cat] = $event"
                @blur="commitCdCatName(cat)"
                @keydown.enter="commitCdCatName(cat)"
                @keydown.esc="revertCdCatName(cat)"
                :data-testid="`wbcfg-cd-name-${cat}`"
              />
              <div class="wb-menu-actions">
                <el-button size="small" :disabled="idx <= 0" :data-testid="`wbcfg-cd-up-${cat}`" @click="handleMoveCdCat(cat, 'up')">上移</el-button>
                <el-button size="small" :disabled="idx >= countdownsCatStore.customCategories.length - 1" :data-testid="`wbcfg-cd-down-${cat}`" @click="handleMoveCdCat(cat, 'down')">下移</el-button>
              </div>
              <el-button size="small" type="danger" :data-testid="`wbcfg-cd-del-${cat}`" @click="handleDeleteCdCat(cat)">删除</el-button>
              <el-switch
                :model-value="countdownsCatStore.tabCategories.includes(cat)"
                @change="countdownsCatStore.setTabCategory(cat, $event)"
                :data-testid="`wbcfg-cd-tab-${cat}`"
              />
            </div>
          </div>
          <div class="wb-cat-add-row">
            <el-input
              v-model="newCdCatName"
              placeholder="新分类名称"
              data-testid="wbcfg-cd-new"
              @keydown.enter="handleAddCdCat"
            />
            <el-button size="small" :disabled="newCdCatName.trim() === ''" data-testid="wbcfg-cd-add" @click="handleAddCdCat">添加</el-button>
          </div>
        </div>

        <!-- 便签分类管理（工作台设置 tab - 分类管理）：改名/上下移/删除/新增 -->
        <div v-if="activeTab === 'wb' && activeSubTab === 'wb-cat'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">便签分类</h3>
          </div>
          <p class="wb-menu-hint">管理便签面板的分类列表；删除分类后该分类下的便签将变为未分类</p>
          <div class="wb-menu-list">
            <div v-for="(cat, idx) in sortedNoteCategories" :key="cat.id" class="wb-menu-row">
              <el-input
                :model-value="noteCatDrafts[cat.id] ?? cat.name"
                @update:model-value="noteCatDrafts[cat.id] = $event"
                @blur="commitNoteCatName(cat)"
                @keydown.enter="commitNoteCatName(cat)"
                @keydown.esc="revertNoteCatName(cat)"
                :data-testid="`wbcfg-note-name-${cat.id}`"
              />
              <div class="wb-menu-actions">
                <el-button size="small" :disabled="idx <= 0" :data-testid="`wbcfg-note-up-${cat.id}`" @click="handleMoveNoteCat(cat.id, 'up')">上移</el-button>
                <el-button size="small" :disabled="idx >= sortedNoteCategories.length - 1" :data-testid="`wbcfg-note-down-${cat.id}`" @click="handleMoveNoteCat(cat.id, 'down')">下移</el-button>
              </div>
              <el-button size="small" type="danger" :data-testid="`wbcfg-note-del-${cat.id}`" @click="handleDeleteNoteCat(cat)">删除</el-button>
              <el-switch
                :model-value="cat.showInTabs !== false"
                @change="handleToggleNoteCatTab({ id: cat.id, showInTabs: cat.showInTabs })"
                :data-testid="`wbcfg-note-tab-${cat.id}`"
              />
            </div>
          </div>
          <div class="wb-cat-add-row">
            <el-input
              v-model="newNoteCatName"
              placeholder="新分类名称"
              data-testid="wbcfg-note-new"
              @keydown.enter="handleAddNoteCat"
            />
            <el-button size="small" :disabled="newNoteCatName.trim() === ''" data-testid="wbcfg-note-add" @click="handleAddNoteCat">添加</el-button>
          </div>
        </div>

        <!-- 记账分类管理（工作台设置 tab - 分类管理）：改名/类型切换/删除/新增；内置 8 分组不可删 -->
        <div v-if="activeTab === 'wb' && activeSubTab === 'wb-cat'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">记账分类</h3>
          </div>
          <p class="wb-menu-hint">管理记账面板的分类列表；收入类分组（含内置「工资」）、支出类分组（含内置「房贷/车贷/早餐/午餐/晚餐/通勤/日常」共 7 个）共 8 个内置分组不可删除</p>
          <div class="wb-menu-list">
            <div v-for="c in sortedLedgerCategories" :key="c.id" class="wb-menu-row" :data-testid="`ldcfg-ledgercat-row-${c.id}`">
              <template v-if="ledgerCatEditingId === c.id">
                <el-input
                  :model-value="ledgerCatDrafts[c.id] ?? c.name"
                  @update:model-value="ledgerCatDrafts[c.id] = $event"
                  @keydown.enter="ledgerCatSave(c.id)"
                  @keydown.esc="ledgerCatCancelEdit()"
                  :data-testid="`ldcfg-ledgercat-edit-name-${c.id}`"
                />
                <el-select
                  style="max-width: 120px; flex: 0 0 120px;"
                  :model-value="ledgerCatEditType[c.id] ?? c.type"
                  @change="ledgerCatEditType[c.id] = $event"
                  :data-testid="`ldcfg-ledgercat-edit-type-${c.id}`"
                >
                  <el-option value="income" label="收入" />
                  <el-option value="expense" label="支出" />
                </el-select>
                <div class="wb-menu-actions">
                  <el-button
                    size="small"
                    :disabled="(ledgerCatDrafts[c.id] ?? c.name).trim() === ''"
                    :data-testid="`ldcfg-ledgercat-save-${c.id}`"
                    @click="ledgerCatSave(c.id)"
                  >保存</el-button>
                  <el-button size="small" :data-testid="`ldcfg-ledgercat-cancel-${c.id}`" @click="ledgerCatCancelEdit()">取消</el-button>
                </div>
              </template>
              <template v-else>
                <span class="wb-menu-name-input" style="border:none;background:transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ c.name }}</span>
                <span class="ld-cat-type-badge" :class="{ 'is-income': c.type === 'income' }" style="margin-right: 6px;">{{ c.type === 'income' ? '收入' : '支出' }}</span>
                <span v-if="c.isBuiltIn" class="ld-builtin-tag">内置</span>
                <template v-if="!c.isBuiltIn">
                  <div style="flex: 1"></div>
                  <el-button size="small" :data-testid="`ldcfg-ledgercat-edit-${c.id}`" @click="ledgerCatStartEdit(c)">编辑</el-button>
                  <el-button size="small" type="danger" :data-testid="`ldcfg-ledgercat-del-${c.id}`" @click="handleDeleteLedgerCat(c.id)">删除</el-button>
                </template>
                <template v-else><div style="flex: 1"></div></template>
              </template>
            </div>
          </div>
          <div class="wb-cat-add-row">
            <el-input
              v-model="newLedgerCatName"
              placeholder="新记账分类名称"
              data-testid="ldcfg-ledgercat-new-name"
              @keydown.enter="handleAddLedgerCat"
            />
            <el-select
              v-model="newLedgerCatType"
              style="max-width: 120px; flex: 0 0 120px;"
              data-testid="ldcfg-ledgercat-new-type"
            >
              <el-option value="income" label="收入" />
              <el-option value="expense" label="支出" />
            </el-select>
            <el-button size="small" :disabled="newLedgerCatName.trim() === ''" data-testid="ldcfg-ledgercat-add" @click="handleAddLedgerCat">添加</el-button>
          </div>
        </div>

        <!-- 工作台导入/导出（工作台设置 tab - 工作台备份；原 WorkbenchView 头部按钮迁移入口） -->
        <div v-if="activeTab === 'wb' && activeSubTab === 'wb-backup'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">工作台备份（导入/导出）</h3>
          </div>
          <p class="wb-menu-hint">整包导出工作台所有数据（待办/便签/日记/倒计时/密码/健康/记账/销售记账/工作台设置）为 JSON 文件；导入时当前数据将被覆盖</p>
          <div class="remind-actions">
            <el-button size="small" data-testid="wbcfg-wb-export" @click="handleWbExport"><Icon name="upload" /> 导出工作台备份</el-button>
            <el-button size="small" data-testid="wbcfg-wb-import" @click="handleWbImportClick"><Icon name="download" /> 导入工作台备份</el-button>
          </div>
        </div>

        <!-- 数据时光机（工作台设置 tab - 数据时光机）：快照列表 + 立即备份 + 单条恢复；数据存 IDB store 'snapshots' -->
        <div v-if="activeTab === 'wb' && activeSubTab === 'wb-snapshot'" class="wb-menu-config wb-snapshot-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">数据时光机</h3>
            <el-button
              size="small"
              data-testid="wb-snapshot-now"
              :disabled="snapshotBusy"
              @click="handleSnapshotNow"
            >立即备份</el-button>
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
              <el-button
                size="small"
                class="wb-snapshot-restore"
                :data-testid="`wb-snapshot-restore-${snap.id}`"
                :disabled="snapshotBusy"
                @click="handleRestoreSnapshot(snap)"
              >恢复</el-button>
            </div>
          </div>
        </div>

        <!-- 桌面通知（仅提醒设置 tab）：开关 + 开启时请求浏览器通知权限 + 权限状态提示 -->
        <div v-if="activeTab === 'remind'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">桌面通知</h3>
            <el-switch
              :model-value="store.desktopNotifyEnabled"
              @change="onToggleDesktopNotify"
              data-testid="remind-desktop-switch"
            />
          </div>
          <p class="wb-menu-hint">
            开启后，倒计时提醒到点会弹出浏览器桌面通知；开启时将自动请求通知权限，若浏览器已拒绝，请在浏览器站点设置中重新授权
          </p>
        </div>

        <!-- 邮件提醒（仅提醒设置 tab）：EmailJS 配置（开关 + 四字段 + 测试发送） -->
        <div v-if="activeTab === 'remind'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">邮件提醒</h3>
            <el-switch
              :model-value="store.reminderEmailEnabled"
              @change="store.setReminderEmailEnabled($event as boolean)"
              data-testid="remind-email-switch"
            />
          </div>
          <p class="wb-menu-hint">EmailJS 需注册（emailjs.com）→ 创建 Service + Template（模板变量命名契约：to_email / countdown_name / occurrence_time / app_url）</p>

          <div class="remind-fields">
            <label class="remind-field">
              <span class="remind-label">收件邮箱</span>
              <el-input
                placeholder="example@email.com"
                data-testid="remind-email-to"
                :model-value="store.reminderEmailTo"
                @update:model-value="store.setReminderEmailTo($event)"
              />
            </label>
            <label class="remind-field">
              <span class="remind-label">Service ID</span>
              <el-input
                placeholder="service_xxxxxxxx"
                data-testid="remind-email-service"
                :model-value="store.reminderEmailServiceId"
                @update:model-value="store.setReminderEmailServiceId($event)"
              />
            </label>
            <label class="remind-field">
              <span class="remind-label">Template ID</span>
              <el-input
                placeholder="template_xxxxxxxx"
                data-testid="remind-email-template"
                :model-value="store.reminderEmailTemplateId"
                @update:model-value="store.setReminderEmailTemplateId($event)"
              />
            </label>
            <label class="remind-field">
              <span class="remind-label">Public Key</span>
              <el-input
                placeholder="public key"
                data-testid="remind-email-key"
                :model-value="store.reminderEmailPublicKey"
                @update:model-value="store.setReminderEmailPublicKey($event)"
              />
            </label>
          </div>

          <div class="remind-actions">
            <el-button
              size="small"
              data-testid="remind-email-test"
              :disabled="!canTestEmail || testEmailBusy"
              @click="handleTestEmail"
            >发送测试邮件</el-button>
          </div>
        </div>

        <!-- 销售记账（销售记账 tab - 基础设置）：摊位名称 + 低库存阈值 + 商品/支出分类管理（复用页面内共享弹框） -->
        <div v-if="activeTab === 'business' && activeSubTab === 'biz-base'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">销售记账设置</h3>
          </div>
          <p class="wb-menu-hint">摊位名称显示在销售记账页头部；库存低于阈值时在库存页与首页预警</p>
          <div class="remind-fields">
            <label class="remind-field">
              <span class="remind-label">摊位名称</span>
              <el-input
                maxlength="30"
                placeholder="例如：夜市A区小吃摊"
                data-testid="bizsettings-stall"
                :model-value="businessStore.settings.stallName"
                @input="businessStore.setStallName($event)"
              />
            </label>
            <label class="remind-field">
              <span class="remind-label">低库存阈值</span>
              <el-input-number
                :min="0"
                :step="1"
                data-testid="bizsettings-threshold"
                :model-value="businessStore.settings.lowStockThreshold"
                @change="businessStore.setLowStockThreshold(Number($event) || 0)"
              />
            </label>
          </div>
          <div class="remind-actions">
            <el-button size="small" data-testid="bizsettings-product-cats" @click="bizCatManagerKind = 'product'">管理商品分类</el-button>
            <el-button size="small" data-testid="bizsettings-expense-cats" @click="bizCatManagerKind = 'expense'">管理支出分类</el-button>
          </div>
        </div>

        <!-- 销售记账备份（销售记账 tab - 备份导入导出）：独立导出/导入销售记账七字段 -->
        <div v-if="activeTab === 'business' && activeSubTab === 'biz-backup'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">销售记账备份（导入/导出）</h3>
          </div>
          <p class="wb-menu-hint">独立导出销售记账七字段（商品/进货/收摊/支出/分类/设置）为 JSON 文件；导入时当前销售记账数据将被覆盖</p>
          <div class="remind-actions">
            <el-button size="small" data-testid="bizsettings-export" @click="handleBizExport"><Icon name="upload" /> 导出销售备份</el-button>
            <el-button size="small" data-testid="bizsettings-import" @click="handleBizImportClick"><Icon name="download" /> 导入销售备份</el-button>
          </div>
        </div>

        <!-- 学段（学生工作台 tab - 学段）：幼儿园/小学/初中 三卡片选择 + 当前学段徽章 -->
        <div v-if="activeTab === 'student' && activeSubTab === 'stu-stage'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">学段</h3>
            <span
              class="student-stage-pill"
              :style="{ backgroundColor: studentStageBadgeColor }"
              :title="`当前学段：${studentStageName}`"
            >{{ studentStageBadgeLabel }} {{ studentStageName }}</span>
          </div>
          <p class="wb-menu-hint">
            切换学段会重新应用该学段默认菜单可见性与默认学科清单（已有的自定义学科保留）。
          </p>
          <div class="student-stage-grid">
            <button
              v-for="opt in studentStageOptions"
              :key="opt.key"
              type="button"
              class="student-stage-card"
              :class="{ active: studentStore.stage === opt.key }"
              :data-testid="`stg-stage-card-${opt.key}`"
              @click="onStudentStageSwitch(opt.key)"
            >
              <span
                class="student-stage-badge"
                :style="{ backgroundColor: STAGE_BADGE[opt.key].color }"
              >{{ STAGE_BADGE[opt.key].label }}</span>
              <span class="student-stage-name">{{ opt.label }}</span>
              <span class="student-stage-desc">{{ opt.desc }}</span>
            </button>
          </div>
        </div>

        <!-- 学生信息（学生工作台 tab - 学生信息）：昵称/学号/学校/年级/出生日期 -->
        <div v-if="activeTab === 'student' && activeSubTab === 'stu-info'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">学生信息</h3>
          </div>
          <div class="wb-field">
            <label class="wb-field-label">昵称</label>
            <input
              ref="studentNicknameInput"
              type="text"
              class="wb-menu-name-input"
              :value="studentStore.settings.nickname"
              placeholder="同学"
              maxlength="12"
              data-testid="stg-nickname-input"
              @change="onStudentNicknameCommit"
            />
          </div>
          <div class="wb-field">
            <label class="wb-field-label">学号</label>
            <input
              type="text"
              class="wb-menu-name-input"
              :value="studentStore.settings.studentNo"
              placeholder="选填"
              maxlength="20"
              data-testid="stg-studentno-input"
              @input="studentStore.setStudentNo(($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="wb-field">
            <label class="wb-field-label">学校</label>
            <input
              type="text"
              class="wb-menu-name-input"
              :value="studentStore.settings.school"
              placeholder="选填"
              maxlength="40"
              data-testid="stg-school-input"
              @input="studentStore.setSchool(($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="wb-field">
            <label class="wb-field-label">年级</label>
            <input
              type="text"
              class="wb-menu-name-input"
              :value="studentStore.settings.grade"
              placeholder="选填，如 三年级 / 初二"
              maxlength="20"
              data-testid="stg-grade-input"
              @input="studentStore.setGrade(($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="wb-menu-field">
            <label class="wb-menu-label">出生日期</label>
            <input
              type="date"
              class="wb-menu-name-input"
              :value="studentStore.settings.birthday"
              data-testid="stg-birthday-input"
              @input="studentStore.setBirthday(($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>

        <!-- 学科清单（学生工作台 tab - 学科清单）：学科芯片列表 + 新增/删除 -->
        <div v-if="activeTab === 'student' && activeSubTab === 'stu-subject'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">学科清单</h3>
            <span class="wb-menu-hint-inline">{{ studentStore.subjects.length }} 项</span>
          </div>
          <p class="wb-menu-hint">
            K 段无学科；P 段默认 3 科，J 段默认 9 科。可自定义增删，已有作业/复习/错题记录的学科删除后不会自动迁移。
          </p>
          <div class="student-subject-chips">
            <span
              v-for="s in studentStore.subjects"
              :key="s"
              class="student-subject-chip"
            >
              <span class="chip-label">{{ s }}</span>
              <button
                type="button"
                class="chip-remove"
                :data-testid="`stg-subject-remove-${s}`"
                @click="onStudentRemoveSubject(s)"
                aria-label="删除"
              ><Icon name="close" :size="12" /></button>
            </span>
            <span v-if="studentStore.subjects.length === 0" class="student-subject-empty">暂无学科</span>
          </div>
          <div class="student-subject-add">
            <input
              type="text"
              class="wb-menu-name-input"
              v-model="studentNewSubject"
              placeholder="新增学科名称"
              maxlength="20"
              data-testid="stg-subject-input"
              @keydown.enter.prevent="onStudentAddSubject"
            />
            <button
              type="button"
              class="ob-btn-primary student-subject-add-btn"
              data-testid="stg-subject-add"
              @click="onStudentAddSubject"
            >新增</button>
          </div>
        </div>

        <!-- 学生菜单（学生工作台 tab - 学生菜单）：菜单列表上下移/改名/显示开关 + 恢复默认 -->
        <div v-if="activeTab === 'student' && activeSubTab === 'stu-menu'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">学生菜单</h3>
            <button type="button" class="row-reset" data-testid="stg-menu-reset" @click="onStudentResetMenu">恢复默认</button>
          </div>
          <p class="wb-menu-hint">
            主页固定置顶，不可调整顺序或关闭；开关关闭的功能将从学生菜单与首页行动台中隐藏。学段切换会重置开关到该学段默认值。
          </p>
          <ul class="wb-menu-list">
            <li
              v-for="item in studentStore.menuAllItems"
              :key="item.key"
              class="wb-menu-row"
              :data-testid="`stg-menu-row-${item.key}`"
            >
              <span class="wb-menu-icon"><Icon :name="item.icon" /></span>
              <span class="wb-menu-name">{{ item.label }}</span>
              <div class="wb-menu-actions">
                <button
                  type="button"
                  class="mini-btn"
                  :disabled="item.key === 'home'"
                  :data-testid="`stg-menu-up-${item.key}`"
                  @click="onStudentMoveMenu(item.key, 'up')"
                  title="上移"
                >↑</button>
                <button
                  type="button"
                  class="mini-btn"
                  :disabled="item.key === 'home'"
                  :data-testid="`stg-menu-down-${item.key}`"
                  @click="onStudentMoveMenu(item.key, 'down')"
                  title="下移"
                >↓</button>
                <button
                  type="button"
                  class="mini-btn"
                  :disabled="item.key === 'home'"
                  :data-testid="`stg-menu-rename-${item.key}`"
                  @click="onStudentRenameMenu(item.key)"
                  title="改名"
                >✎</button>
                <button
                  type="button"
                  class="switch-btn mini-switch"
                  :class="{ on: studentStore.isMenuEnabled(item.key) }"
                  role="switch"
                  :aria-checked="studentStore.isMenuEnabled(item.key)"
                  :data-testid="`stg-menu-toggle-${item.key}`"
                  :disabled="item.key === 'home'"
                  @click="onStudentToggleMenu(item.key, !studentStore.isMenuEnabled(item.key))"
                >
                  <span class="switch-thumb"></span>
                </button>
              </div>
            </li>
          </ul>
        </div>

        <!-- 云同步（仅云同步 tab）：WebDAV 配置（开关 + 三字段 + 测试连接 + 立即同步 + 上次同步时间 + 首次使用引导） -->
        <div v-if="activeTab === 'sync'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">云同步总开关</h3>
            <button
              type="button"
              class="switch-btn"
              :class="{ on: store.cloudSyncEnabled }"
              role="switch"
              :aria-checked="store.cloudSyncEnabled"
              data-testid="sync-switch"
              @click="onToggleCloudSync"
            >
              <span class="switch-thumb"></span>
            </button>
          </div>
          <p class="wb-menu-hint">
            启用后将通过 WebDAV 同步导航、自定义图标、工作台、销售记账、学生工作台等全部数据（含自定义图标），按 5 份独立信封（nav.json / icons.json / workbench.json / business.json / student.json）分别上传。推荐使用坚果云（国内访问稳定）或任意支持 WebDAV 的服务。
          </p>
          <p v-if="!store.cloudSyncEnabled" class="wb-menu-hint" style="color: var(--color-text-muted); opacity: 0.7; margin-top: 0;">
            首次使用指引：① 注册坚果云账号；② 账户信息 → 安全选项 → 添加应用，获取应用密码（非账户密码）；③ 开启开关，填入下方配置；④ 点「测试连接」确认无误后点「立即同步」。
          </p>
          <div class="wb-menu-hint" style="background: var(--color-bg-2); border-left: 3px solid var(--color-primary); padding: 10px 14px; border-radius: 4px; margin: 8px 0 16px;">
            <strong style="color: var(--color-text);">CORS 兼容说明：</strong>坚果云 / Nextcloud 等 WebDAV 服务商默认不返回 CORS 预检响应头（浏览器 MKCOL+Authorization 会触发 OPTIONS 拦截）。<br />
            本应用已自动在以下三种启动方式内置「同源代理」<code style="background: rgba(0,0,0,.12); padding: 1px 5px; border-radius: 3px;">/api/webdav-proxy</code>，可直接跨域：
            <ul style="margin: 6px 0 0 20px; padding: 0;">
              <li>开发环境：<code style="background: rgba(0,0,0,.12); padding: 1px 5px; border-radius: 3px;">npm run dev</code>（Vite dev 中间件）</li>
              <li>预览环境：<code style="background: rgba(0,0,0,.12); padding: 1px 5px; border-radius: 3px;">npm run serve / node server.cjs / pm2 start pm2.config.cjs</code>（内置 Node HTTP 服务）</li>
              <li>预览构建包：<code style="background: rgba(0,0,0,.12); padding: 1px 5px; border-radius: 3px;">npm run preview</code>（Vite preview 已附加代理）</li>
            </ul>
            <Icon name="alert" /> 若将 <code style="background: rgba(0,0,0,.12); padding: 1px 5px; border-radius: 3px;">dist/</code> 部署到其他纯静态托管（Nginx、GitHub Pages 等）但未挂载代理，会出现「Failed to fetch / CORS」报错。需自行在同域部署 <code style="background: rgba(0,0,0,.12); padding: 1px 5px; border-radius: 3px;">/api/webdav-proxy</code>，或改成使用本项目的 <code style="background: rgba(0,0,0,.12); padding: 1px 5px; border-radius: 3px;">node server.cjs</code> 启动。
          </div>

          <div v-if="store.cloudSyncEnabled" class="remind-fields">
            <label class="remind-field">
              <span class="remind-label">WebDAV URL</span>
              <input
                type="text"
                class="wb-menu-name-input"
                placeholder="https://dav.jianguake.com/dav/"
                data-testid="sync-url"
                :value="store.cloudSyncUrl"
                @input="store.setCloudSyncUrl(($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="remind-field">
              <span class="remind-label">用户名</span>
              <input
                type="text"
                class="wb-menu-name-input"
                placeholder="云盘账号邮箱"
                data-testid="sync-username"
                :value="store.cloudSyncUsername"
                @input="store.setCloudSyncUsername(($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="remind-field">
              <span class="remind-label">应用密码</span>
              <input
                type="password"
                class="wb-menu-name-input"
                placeholder="云盘应用密码（非账户密码）"
                data-testid="sync-password"
                :value="store.cloudSyncPassword"
                @input="store.setCloudSyncPassword(($event.target as HTMLInputElement).value)"
              />
            </label>
          </div>

          <div v-if="store.cloudSyncEnabled" class="remind-actions" style="display: flex; align-items: center; gap: 12px;">
            <button
              type="button"
              class="wb-menu-btn"
              data-testid="sync-test"
              :disabled="syncTestBusy || !store.cloudSyncUrl || !store.cloudSyncUsername || !store.cloudSyncPassword"
              @click="handleSyncTest"
            >测试连接</button>
            <button
              type="button"
              class="wb-menu-btn"
              style="background: var(--color-primary); color: #fff; border-color: var(--color-primary);"
              data-testid="sync-now"
              :disabled="syncNowBusy || !store.cloudSyncUrl || !store.cloudSyncUsername || !store.cloudSyncPassword"
              @click="handleSyncNow"
            >立即同步</button>
            <button
              type="button"
              class="wb-menu-btn"
              data-testid="sync-force-pull"
              title="忽略本地未推送的改动，无条件用云端数据覆盖本地。用于外部工具（备份编辑技能）改过云端 JSON 后同步不生效的情况"
              :disabled="forcePullBusy || !store.cloudSyncUrl || !store.cloudSyncUsername || !store.cloudSyncPassword"
              @click="handleForcePull"
            >以云端覆盖本地</button>
            <button
              type="button"
              class="wb-menu-btn"
              data-testid="sync-push-local"
              title="用本地数据覆盖云端（跳过远端变更检测，强制以本地为准）"
              :disabled="pushLocalBusy || !store.cloudSyncUrl || !store.cloudSyncUsername || !store.cloudSyncPassword"
              @click="handlePushLocal"
            >本地推送云端</button>
            <span data-testid="sync-last" class="wb-menu-hint" style="margin-left: auto;">上次同步：{{ lastSyncText }}</span>
          </div>
          <p v-if="store.cloudSyncEnabled" class="wb-menu-hint" style="color: var(--color-text-muted); opacity: 0.7; font-size: 12px; margin-top: 6px;">
            用外部工具改过云端文件后若「立即同步」未生效，点「以云端覆盖本地」强制采纳云端（本地未推送的改动会被覆盖）。
          </p>
          <div v-if="store.cloudSyncEnabled" class="remind-field" style="margin-top: 8px;">
            <span class="remind-label">自动同步间隔（分钟，0=关闭）</span>
            <input
              type="number"
              class="wb-menu-name-input"
              style="width: 80px;"
              min="0"
              placeholder="0"
              data-testid="sync-interval"
              :value="store.cloudSyncInterval"
              @input="store.setCloudSyncInterval(Number(($event.target as HTMLInputElement).value)); cloudSync.startInterval()"
            />
            <span class="wb-menu-hint" style="color: var(--color-text-muted); opacity: 0.7; font-size: 12px;">设为 0 则完全关闭自动同步（含切换标签页时的自动拉取），所有同步需手动触发</span>
          </div>
          <div v-if="store.cloudSyncEnabled" class="remind-field" style="margin-top: 8px;">
            <span class="remind-label">静默合并阈值（字符数，0=永不静默）</span>
            <input
              type="number"
              class="wb-menu-name-input"
              style="width: 100px;"
              min="0"
              placeholder="1000"
              data-testid="sync-silent-threshold"
              :value="store.cloudSyncSilentThreshold"
              @input="store.setCloudSyncSilentThreshold(Number(($event.target as HTMLInputElement).value))"
            />
            <span class="wb-menu-hint" style="color: var(--color-text-muted); opacity: 0.7; font-size: 12px;">本地与云端内容差异小于此值时，后台自动静默合并而不弹冲突框</span>
          </div>
        </div>

        <div class="settings-grid" v-if="(activeTab === 'nav' && activeSubTab === 'nav-size') || (activeTab === 'wb' && activeSubTab === 'wb-size')">
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

    <!-- 云同步冲突弹框（z-index 高于设置弹窗） -->
    <CloudSyncConflictModal v-if="cloudSync.conflictData.value" />
  </div>
  </Transition>
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
  background-color: var(--color-bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg);
  /* 设置弹框默认尺寸：宽度 60vw / 高度 80vh；大屏限 max-width，小屏保底 min-* */
  width: 60vw;
  max-width: 1200px;
  min-width: 320px;
  height: 80vh;
  min-height: 480px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-modal);
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
  flex-shrink: 0;
}

.manager-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--color-text-muted, var(--color-text-muted));
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: color var(--transition-fast, 0.15s ease);
}

.close-btn:hover {
  color: var(--color-text, var(--color-text));
}

.manager-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.hint {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  margin: 0 0 16px 0;
}

/* 顶部 tab 栏（视觉对齐 workbench 面板 tabs，如 WorkbenchHealth.vue 的 .hd-tab） */
.settings-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

/* 第二层：子 tab 条（视觉层级稍低——字号更小、padding 更紧凑，作为主 tab 条下的内容分组切换） */
.settings-tabs.settings-tabs-sub {
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
  flex-wrap: wrap;
}
.sub-tab-btn {
  padding: 6px 12px !important;
  font-size: 12px !important;
  border-radius: calc(var(--radius-md, 8px) - 2px) !important;
}
.sub-tab-btn.active {
  border-color: var(--color-primary, var(--color-primary)) !important;
  box-shadow: 0 0 0 1px var(--color-primary, var(--color-primary)) inset;
}
html.dark .sub-tab-btn.active {
  border-color: #60a5fa !important;
  box-shadow: 0 0 0 1px #60a5fa inset;
}

.tab-btn {
  padding: 8px 16px;
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md);
  background-color: var(--color-bg-card, var(--color-bg-card));
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.tab-btn:hover {
  background-color: var(--color-bg-card, var(--color-bg-hover));
  color: var(--color-primary, var(--color-primary));
}

.tab-btn.active {
  background-color: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, var(--color-primary));
  font-weight: 600;
}

html.dark .tab-btn {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .tab-btn:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text, #f9fafb);
}

html.dark .tab-btn.active {
  background-color: #1e3a5f;
  color: #60a5fa;
}

/* 设置表格 */
.settings-grid {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border, var(--color-border));
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
  background: var(--color-bg-card, var(--color-bg-hover));
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-muted, var(--color-text-muted));
}

.settings-row {
  border-top: 1px solid var(--color-border, var(--color-border));
}

.row-label {
  font-size: 13px;
  color: var(--color-text, var(--color-text));
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
  background-color: var(--color-bg-input, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--color-text, var(--color-text));
  box-sizing: border-box;
  transition: border-color var(--transition-fast, 0.15s ease);
}

.num-input:focus {
  outline: none;
  border-color: var(--color-primary, var(--color-primary));
}

.unit {
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
  white-space: nowrap;
}

/* 重置类按钮共用样式 */
.row-reset,
.btn-reset-all {
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
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
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

/* 底部操作栏 */
.manager-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border, var(--color-border));
  flex-shrink: 0;
}

.footer-hint {
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
}

.footer-actions {
  display: flex;
  gap: 12px;
}

.btn-cancel {
  padding: 10px 16px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md);
  font-size: 14px;
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-cancel:hover {
  background: var(--color-bg-hover, var(--color-bg-active));
}

/* 工作台菜单/城市配置区块（独立于 .settings-grid，不复用其列定义——R6） */
.wb-menu-config,
.wb-city-config {
  margin-bottom: 20px;
  padding: 14px;
  background-color: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
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
  color: var(--color-text, var(--color-text));
}

.wb-menu-hint {
  margin: 6px 0 12px;
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
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
  color: var(--color-text, var(--color-text));
  background-color: var(--color-bg-input, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-sm);
  transition: border-color var(--transition-fast, 0.15s ease);
}

.wb-menu-name-input:focus {
  outline: none;
  border-color: var(--color-primary, var(--color-primary));
}

/* EP 换皮：wb/remind 分支 el-input/el-select/el-input-number 在 flex 行内撑满（替代原 .wb-menu-name-input 的 flex:1） */
.wb-menu-row :deep(.el-input),
.wb-menu-row :deep(.el-select),
.wb-menu-row :deep(.el-input-number),
.wb-cat-add-row :deep(.el-input),
.wb-cat-add-row :deep(.el-select),
.wb-cat-add-row :deep(.el-input-number) {
  flex: 1;
  min-width: 0;
}

/* 天气城市输入框：整行撑满 */
.wb-city-config :deep(.el-input) {
  width: 100%;
}

/* 卡片尺寸数字框：收窄到与旧 .num-input 相近的宽度 */
.wb-cardsize-field :deep(.el-input-number) {
  width: 110px;
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
  color: var(--color-text-secondary, var(--color-text-secondary));
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast, 0.15s ease);
}

.wb-menu-btn:hover:not(:disabled) {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
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
  border: 1px solid var(--color-border, var(--color-border));
  background-color: var(--color-bg-card, var(--color-bg-hover));
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
  background-color: var(--color-text-muted, var(--color-text-muted));
  transition: transform var(--transition-fast, 0.15s ease), background-color var(--transition-fast, 0.15s ease);
}

.switch-btn.on {
  background-color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
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

/* 主页卡片尺寸：按分区分组 + 逐卡宽/高数字框 */
.wb-cardsize-group + .wb-cardsize-group {
  margin-top: 14px;
}

.wb-cardsize-group-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted, var(--color-text-muted));
  margin-bottom: 6px;
}

.wb-cardsize-row {
  padding: 2px 0;
}

.wb-cardsize-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wb-cardsize-field {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.wb-cardsize-field .num-input {
  width: 72px;
}

html.dark .switch-btn {
  background-color: var(--color-bg-input, #374151);
  border-color: var(--color-border, #4b5563);
}

html.dark .switch-btn.on {
  background-color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
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
  color: var(--color-text, var(--color-text));
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
  color: var(--color-text, var(--color-text));
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
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  color: var(--color-text-secondary, var(--color-text-secondary));
  cursor: pointer;
}

.wbcat-tab-row input[type='checkbox'] {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--color-primary, var(--color-primary));
}

.wb-snapshot-source {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
}

.wb-snapshot-restore {
  flex-shrink: 0;
}

.wb-snapshot-empty {
  padding: 12px 0;
  font-size: 13px;
  color: var(--color-text-muted, var(--color-text-muted));
}

/* 暗色模式：沿用文件现有 html.dark 变量覆盖惯例，确保区块文字可读 */
html.dark .wb-menu-config,
html.dark .wb-city-config {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}

html.dark .wb-menu-title {
  color: var(--color-text, #f9fafb);
}

html.dark .wb-menu-hint {
  color: var(--color-text-muted, #9ca3af);
}

html.dark .wb-menu-name-input {
  color: var(--color-text, #f9fafb);
  background-color: var(--color-bg-input, #111827);
  border-color: var(--color-border, #374151);
}

html.dark .wb-menu-btn {
  color: var(--color-text-secondary, #d1d5db);
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}

html.dark .wb-snapshot-time {
  color: var(--color-text, #f9fafb);
}

html.dark .wb-snapshot-source,
html.dark .wb-snapshot-empty {
  color: var(--color-text-muted, #9ca3af);
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

/* 销售记账 tab：el-input/el-input-number 在 .remind-field 行内 flex 撑满（原生 .wb-menu-name-input 样式不适用于 el 外壳） */
.remind-field :deep(.el-input),
.remind-field :deep(.el-input-number) {
  flex: 1;
  min-width: 0;
}

.remind-label {
  flex-shrink: 0;
  width: 92px;
  font-size: 13px;
  color: var(--color-text, var(--color-text));
}

.remind-actions {
  margin-top: 12px;
}

html.dark .remind-label {
  color: var(--color-text, #f9fafb);
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

/* ========================================
   站点管理（导航设置 tab）：原管理页工具栏九动作按钮网格。
   风格沿用管理页原 .btn-action（白底灰字蓝 hover）；暗色走文件既有 html.dark 变量惯例
   ======================================== */
.site-actions-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.site-action-btn {
  padding: 8px 14px;
  background-color: white;
  color: #64748b;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.site-action-btn:hover:not(:disabled) {
  background-color: #f1f5f9;
  color: #3b82f6;
  border-color: #3b82f6;
}

.site-action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.site-invalid-count {
  margin-left: 4px;
  font-weight: 600;
  color: #ef4444;
}

/* 站点管理暗色模式 */
html.dark .site-action-btn {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .site-action-btn:hover:not(:disabled) {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

/* ===== 站点外观（导航设置 tab）：favicon 上传行与预览 ===== */
.site-favicon-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.site-favicon-preview {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-bg-input, #f1f5f9);
  object-fit: contain;
  flex-shrink: 0;
}

.site-favicon-file {
  display: none;
}

/* ===== 记账分类：类型徽标（支出蓝 / 收入绿）+ 内置徽标 ===== */
.ld-cat-type-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  color: var(--color-primary, #3b82f6);
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
}
.ld-cat-type-badge.is-income {
  color: #15803d;
  background: #dcfce7;
  border-color: #86efac;
}
.ld-builtin-tag {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-secondary, #9ca3af);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 999px;
  padding: 2px 10px;
}
html.dark .ld-cat-type-badge {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}
html.dark .ld-cat-type-badge.is-income {
  color: #4ade80;
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.45);
}
html.dark .ld-builtin-tag {
  color: #9ca3af;
  border-color: #4b5563;
}

/* ===== 学生工作台 tab 专属样式 ===== */
.student-stage-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 10px;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
}
.student-stage-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.student-stage-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}
.student-stage-card:hover {
  background: var(--color-hover, #f3f4f6);
}
.student-stage-card.active {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
}
.student-stage-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}
.student-stage-name {
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}
.student-stage-desc {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
  margin-left: auto;
}

.wb-field {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 6px 0;
}
.wb-field-label {
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
  width: 56px;
  flex-shrink: 0;
}
.wb-menu-hint-inline {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}

.student-subject-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0;
}
.student-subject-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 4px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 14px;
  background: var(--color-surface, #ffffff);
  font-size: 13px;
}
.chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted, #6b7280);
  cursor: pointer;
  padding: 0;
}
.chip-remove:hover {
  background: var(--color-hover, #f3f4f6);
  color: var(--color-danger, #ef4444);
}
.student-subject-empty {
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
  font-style: italic;
}
.student-subject-add {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.student-subject-add .wb-menu-name-input {
  flex: 1;
}
.student-subject-add-btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  background: var(--color-primary, #3b82f6);
  color: #ffffff;
  border: 1px solid var(--color-primary, #3b82f6);
}
.student-subject-add-btn:hover {
  filter: brightness(0.95);
}

.wb-menu-list {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
}
.wb-menu-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  margin-bottom: 6px;
}
.wb-menu-icon {
  display: inline-flex;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.wb-menu-name {
  flex: 1;
  font-size: 13px;
}
.wb-menu-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.mini-btn {
  width: 26px;
  height: 26px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
}
.mini-btn:hover:not(:disabled) {
  background: var(--color-hover, #f3f4f6);
}
.mini-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.mini-switch {
  width: 32px;
  height: 18px;
  border: none;
  padding: 0;
}
.mini-switch .switch-thumb {
  width: 14px;
  height: 14px;
}
</style>
