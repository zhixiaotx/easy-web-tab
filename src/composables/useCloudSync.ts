/**
 * 云同步 composable（WebDAV + v9 同步信封）
 *
 * 单例设计：模块级 ref 持有全局状态（参考 useCountdownReminder / useToast 的单例模式）
 * 触发器：
 *   - document.visibilitychange  visible → pullNow | hidden + dirty → pushNow
 *   - App.vue onMounted 调 init()
 *   - 设置弹窗「立即同步」按钮
 *   - localStorage dirty 标记（各 store 的 save* 后 markDirty()）
 *
 * 冲突判定：本地 dirty=true 且 远端 pushedAt > lastSyncAt
 *
 * CORS 兼容：WebDAV 原生自定义方法（MKCOL）+ Authorization 会触发浏览器预检（OPTIONS），
 * 坚果云/Nextcloud 默认不回 Access-Control-Allow-Origin。
 * 解决方案：请求统一走同源代理 `/api/webdav-proxy`（Vite dev 与 Node prod server 均已挂载），
 * 由服务端带凭证直接代发 HTTP → 天然无 CORS。
 */
import { ref, shallowRef } from 'vue'
import { idbExportAll, idbImportAll } from './useIdb'
import { useAppSettingsStore } from '../stores/settings'
import { useToast } from './useToast'
import { getStoredSaltHex, getStoredVerification } from './useCrypto'
import { WORKBENCH_DATA_VERSION } from '../types'
import type { WorkbenchData, WorkbenchTodo, NoteData, DiaryData, Countdown, HealthData, LedgerData, BusinessData, AppSettingsData } from '../types'
import type { PomodoroData } from './pomodoroCore'
import type { HabitsData } from './habitCore'

const CLIENT_ID_KEY = 'easy-web-tab-client-id'
const LAST_SYNC_KEY = 'easy-web-tab-last-sync'
const DIRTY_KEY = 'easy-web-tab-dirty'
const PROXY_PATH = '/api/webdav-proxy'
const BACKUP_FILE = 'backup.json'
const DATA_DIR = 'easy-web-tab'

export type SyncStatus = 'idle' | 'pushing' | 'pulling' | 'conflict' | 'error'

// 单例状态（模块级引用，composable 返回同一引用）
const status = ref<SyncStatus>('idle')
const lastSyncAt = ref<number | null>(null)
const errorMessage = ref<string>('')
const conflictData = shallowRef<{ local: WorkbenchData; remote: WorkbenchData } | null>(null)

// ========== 基础工具 ==========

function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY)
  if (!id) {
    id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : 'cid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
    localStorage.setItem(CLIENT_ID_KEY, id)
  }
  return id
}

export function markDirty(): void {
  localStorage.setItem(DIRTY_KEY, '1')
}

function clearDirty(): void {
  localStorage.removeItem(DIRTY_KEY)
}

export function isDirty(): boolean {
  return localStorage.getItem(DIRTY_KEY) === '1'
}

function btoaSafe(s: string): string {
  // RFC 7617 Basic 推荐服务端支持 UTF-8 字符的 base64（btoa 只认 Latin-1）
  // 统一走 TextEncoder → Uint8Array → btoa(String.fromCharCode(...))，
  // 避免 unescape(encodeURIComponent) 在新浏览器警告/丢码，中文密码也能校验通过。
  if (typeof TextEncoder !== 'undefined') {
    const bytes = new TextEncoder().encode(s)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin)
  }
  try {
    return btoa(s)
  } catch {
    return btoa(unescape(encodeURIComponent(s)))
  }
}

// ========== WebDAV 通过同源代理请求（彻底避免 CORS）==========

type DavMethod = 'GET' | 'PUT' | 'MKCOL'

interface ProxyRequest {
  target: string
  method: DavMethod
  body?: string
}

/**
 * 走同源 /api/webdav-proxy：
 *   body.method = 真实 WebDAV 方法
 *   body.target = 完整目标 URL（含协议+host+path）
 *   Authorization 头用 X-Webdav-Auth 带基础凭证（避免预检）
 *   body.body = PUT 的 JSON 字符串（仅 PUT）
 *
 * 返回的 Response 还挂有 `diagnostics` 字段（非 2xx 时有用）：
 *   - upstreamStatus：代理端返回的 X-Upstream-Status
 *   - snippet：代理端返回的 X-Upstream-Body-Snippet（坚果云真实错误正文）
 */
async function proxyDav(targetUrl: string, method: DavMethod, username: string, password: string, body?: string): Promise<Response> {
  const payload: ProxyRequest = { target: targetUrl, method }
  if (body !== undefined) payload.body = body
  const proxyUrl = location.origin + PROXY_PATH
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webdav-Auth': 'Basic ' + btoaSafe(`${username}:${password}`)
    },
    body: JSON.stringify(payload)
  })
  return res
}

/** 从代理响应里解析诊断信息（非 2xx 时用），返回 {upstreamStatus, snippet, textBody} */
async function readDavDiagnostics(res: Response): Promise<{ upstreamStatus: string | null; snippet: string | null; textBody: string }> {
  const upstreamStatus = res.headers.get('X-Upstream-Status') || String(res.status)
  const snippetRaw = res.headers.get('X-Upstream-Body-Snippet')
  const snippet = snippetRaw
    ? decodeURIComponent(snippetRaw).replace(/\s+/g, ' ').trim().slice(0, 512)
    : null
  let textBody = ''
  try {
    textBody = (await res.text()).replace(/\s+/g, ' ').trim().slice(0, 512)
  } catch { /* noop: body already consumed by stream */ }
  return { upstreamStatus, snippet, textBody }
}

function davErrorLabel(method: string, upstreamStatus: string | null, snippet: string | null, textBody: string, fallbackStatus: number): string {
  const st = upstreamStatus || String(fallbackStatus)
  const detail = snippet || textBody
  if (st === '401') {
    // 坚果云 401 常见 3 种原因：
    //  1) 填了登录密码而不是"应用密码"；
    //  2) 用户名/邮箱大小写不对；
    //  3) 账号含中文但旧版 btoa 编码错误（已修）。
    const base = `WebDAV ${method} ${st}：用户名或应用密码错误。`
    const tips = [
      '坚果云请使用"账户→安全选项→添加应用"生成的专用「应用密码」（不是登录密码）',
      '用户名通常是登录邮箱全拼，注意大小写',
      '路径格式应为 https://dav.jianguoyun.com/dav/ （尾部带斜杠）'
    ]
    if (!detail) return base + tips.map((t, i) => `\n${i + 1}. ${t}`).join('')
    return `${base}\n服务端返回：${detail}` + tips.map((t, i) => `\n${i + 1}. ${t}`).join('')
  }
  if (st === '403') {
    const base = `WebDAV ${method} ${st}：当前账号对该路径无写入权限。`
    return detail ? `${base}\n服务端返回：${detail}` : base
  }
  if (st === '404') return `WebDAV ${method} 404：资源不存在（首次使用是正常的）`
  if (st === '405') return `WebDAV ${method} 405：服务器不允许该方法（MKCOL/GET/PUT）`
  if (st === '409') return `WebDAV ${method} 409：父目录不存在，请确认 WebDAV URL 指向的根路径已在坚果云手动创建`
  if (st === '413' || st === '422' || st === '415') {
    const base = `WebDAV ${method} ${st}：请求被拒绝。`
    return detail ? `${base}\n服务端返回：${detail}` : base
  }
  if (st === '502' || st === '500') {
    const base = `WebDAV ${method} ${st}：代理请求失败，请确认开发/预览服务器已启用代理（npm run dev / serve）。`
    return detail ? `${base}\n错误详情：${detail}` : base
  }
  const base = `WebDAV ${method} ${st}：请求未成功。`
  return detail ? `${base}\n服务端返回：${detail}` : base
}

// ========== 内容 hash（双兜底：优先 SubtleCrypto SHA-1，非安全上下文退化到 32bit FNV-1a）==========

/** 递归排序 key 后 JSON 序列化——消除 key 顺序差异，使相同语义的数据 hash 一致 */
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']'
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k])).join(',') + '}'
}

/**
 * 提取业务数据签名：剔除 exportedAt/pushedAt/clientId 等不稳定元数据字段后，
 * 走 stableStringify（递归排序 key）→ 语义相同的数据必产出相同字符串。
 * 解决：每次 idbExportAll() 的 exportedAt 时间戳不同、不同设备 clientId 不同、
 * JSON key 顺序不同 → hash 永远不等 → 误判冲突。
 */
function businessSignature(data: WorkbenchData): string {
  const copy: Record<string, unknown> = { ...data }
  delete copy.exportedAt
  delete copy.pushedAt
  delete copy.clientId
  // prefs 包含设备级 localStorage 快照（如 user-todo-tab-categories 等可能不同步存在的 key），
  // 不同设备间 prefs 内容天然可能不同 → 哈希永不等 → 误判冲突。
  // prefs 的同步由 idbImportAll/applyPrefsToLocalStorage 负责，不参与内容哈希比较。
  delete copy.prefs
  return stableStringify(copy)
}

/**
 * 计算本地与远程各模块的数据差异总量（Σ|local_len - remote_len|）。
 * 差异总量 < DIFF_THRESHOLD → 视为微小差异，静默合并不弹框。
 */
const MODULE_DIFF_THRESHOLD = 500

function moduleDiffSize(local: WorkbenchData, remote: WorkbenchData): number {
  const keys: Array<keyof WorkbenchData> = ['todos', 'notes', 'diary', 'countdowns', 'passwords', 'health', 'ledger', 'business', 'settings', 'pomodoro', 'habits']
  let total = 0
  for (const k of keys) {
    const lv = local[k]
    const rv = remote[k]
    try {
      const l = lv !== undefined ? stableStringify(lv).length : 0
      const r = rv !== undefined ? stableStringify(rv).length : 0
      total += Math.abs(l - r)
    } catch { /* ignore */ }
  }
  return total
}

// 注：密码在 IndexedDB 中是"整库用一个主密码加密"的单个密文串（savePasswords 里
// encrypt(JSON.stringify(passwords)) 后整体 idbPut），并非逐条加密，密文层面无法条目级合并。
// 同步策略（用户明确要求）：**密码永远云端覆盖本地** —— 由 mergeData 单向取云端实现，
// 拉取 / 静默合并 / 冲突解决选择云端这三条路径因此对密码行为一致，无需在此额外判定。

async function sha1Hash(text: string): Promise<string> {
  // SubtleCrypto 仅在 localhost / HTTPS / file:// 可用（浏览器定义）；
  // 生产环境如果部署在内网 HTTP IP，会抛 "SubtleCrypto only available in secure contexts"。
  // 这时退化 FNV-1a 32bit，虽然碰撞概率高但 600KB 同步文件级去重够用，且总比 hash 比较缺失强。
  if (typeof crypto !== 'undefined' && 'subtle' in crypto && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    try {
      const bytes = new TextEncoder().encode(text)
      const digest = await crypto.subtle.digest('SHA-1', bytes)
      const arr = new Uint8Array(digest)
      let hex = ''
      for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0')
      return 'sha1:' + hex
    } catch {
      /* fallback to FNV-1a below */
    }
  }
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)
  }
  return 'fnv1a:' + (h >>> 0).toString(16).padStart(8, '0')
}

interface WebdavGetResult {
  data: WorkbenchData | null
  /** 响应头 Last-Modified 解析成的 ms（解析失败 = 0） */
  lastModifiedMs: number
  /** 原始 JSON 字符串（供 hash 比对，避免重复 fetch） */
  rawText: string
}

async function webdavGet(url: string, username: string, password: string): Promise<WebdavGetResult> {
  const res = await proxyDav(url, 'GET', username, password)
  if (res.status === 404) return { data: null, lastModifiedMs: 0, rawText: '' }
  if (!res.ok) {
    const diag = await readDavDiagnostics(res)
    throw new Error(davErrorLabel('GET', diag.upstreamStatus, diag.snippet, diag.textBody, res.status))
  }
  const text = await res.text()
  let lastModifiedMs = 0
  const lm = res.headers.get('Last-Modified')
  if (lm) {
    const t = new Date(lm).getTime()
    if (!Number.isNaN(t)) lastModifiedMs = t
  }
  if (!text) return { data: null, lastModifiedMs, rawText: '' }
  return { data: JSON.parse(text) as WorkbenchData, lastModifiedMs, rawText: text }
}

async function webdavPut(url: string, username: string, password: string, body: string): Promise<void> {
  const res = await proxyDav(url, 'PUT', username, password, body)
  if (!res.ok) {
    const diag = await readDavDiagnostics(res)
    throw new Error(davErrorLabel('PUT', diag.upstreamStatus, diag.snippet, diag.textBody, res.status))
  }
}

/** 创建目录（MKCOL）；代理返回 2xx/405 视作成功 */
async function webdavMkcol(url: string, username: string, password: string): Promise<void> {
  const res = await proxyDav(url, 'MKCOL', username, password)
  if (res.ok || res.status === 405) return
  const diag = await readDavDiagnostics(res)
  throw new Error(davErrorLabel('MKCOL', diag.upstreamStatus, diag.snippet, diag.textBody, res.status))
}

function dirUrl(base: string): string {
  const clean = base.replace(/\/$/, '')
  return clean.endsWith(`/${DATA_DIR}`) ? clean : `${clean}/${DATA_DIR}`
}

/** 探测连接 + 确保 easy-web-tab 目录存在 */
export async function testConnection(
  url: string,
  username: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  if (!url || !username || !password) return { ok: false, error: 'URL / 用户名 / 应用密码不能为空' }
  try {
    const dir = dirUrl(url)
    await webdavMkcol(dir, username, password)
    // 探测 GET（404 正常，因为第一次可能无文件）
    try {
      const probe = await webdavGet(`${dir}/${BACKUP_FILE}`, username, password)
      // 404 已经在 webdavGet 内部返回 data=null，data===null 即等价 404；
      // 其余 status code（比如 401/403）在 webdavGet 里已经 throw
      void probe
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (!msg.includes('404')) throw e
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '连接失败'
    const hint = msg.includes('Failed to fetch')
      ? '请求失败：请确认本页面通过 Vite dev(npm run dev) 或内置服务(npm run serve) 打开，以启用 WebDAV 代理。'
      : msg
    return { ok: false, error: hint }
  }
}

// ========== 导入后各 store reload ==========

async function reloadAllStores(): Promise<void> {
  // 惰性导入避免循环依赖（各 store 在 WorkbenchView 里已 import，此处用动态导入走 onMounted init）
  const [{ useWorkbenchTodosStore }, { useWorkbenchNotesStore }, { useWorkbenchDiaryStore }, { useCountdownsStore }, { useWorkbenchHealthStore }, { useWorkbenchLedgerStore }, { useWorkbenchBusinessStore }, { useWorkbenchPomodoroStore }, { useWorkbenchHabitsStore }, { useAppSettingsStore }] = await Promise.all([
    import('../stores/workbenchTodos'),
    import('../stores/workbenchNotes'),
    import('../stores/workbenchDiary'),
    import('../stores/countdowns'),
    import('../stores/workbenchHealth'),
    import('../stores/workbenchLedger'),
    import('../stores/workbenchBusiness'),
    import('../stores/workbenchPomodoro'),
    import('../stores/workbenchHabits'),
    import('../stores/settings')
  ])
  await Promise.all([
    useWorkbenchTodosStore().loadTodos(),
    useWorkbenchNotesStore().loadNotes(),
    useWorkbenchDiaryStore().loadDiary(),
    useCountdownsStore().loadCountdowns(),
    useWorkbenchHealthStore().loadHealth(),
    useWorkbenchLedgerStore().loadLedger(),
    useWorkbenchBusinessStore().loadBusiness(),
    useWorkbenchPomodoroStore().loadPomodoro(),
    useWorkbenchHabitsStore().loadHabits(),
    useAppSettingsStore().initSettings()
  ])
}

// ========== 核心同步流程 ==========

async function pushNow(silent = false): Promise<boolean> {
  const settings = useAppSettingsStore()
  if (!settings.cloudSyncEnabled || !settings.cloudSyncUrl || !settings.cloudSyncUsername || !settings.cloudSyncPassword) {
    return false
  }
  status.value = 'pushing'
  errorMessage.value = ''
  try {
    const data = await idbExportAll()
    data.clientId = getClientId()
    data.pushedAt = Date.now()
    const dir = dirUrl(settings.cloudSyncUrl!)
    try {
      await webdavMkcol(dir, settings.cloudSyncUsername!, settings.cloudSyncPassword!)
    } catch {
      // 目录已存在或 MKCOL 失败（后续 PUT 会直接抛错），这里不中断
    }
    await webdavPut(`${dir}/${BACKUP_FILE}`, settings.cloudSyncUsername!, settings.cloudSyncPassword!, JSON.stringify(data))
    const now = data.pushedAt
    localStorage.setItem(LAST_SYNC_KEY, String(now))
    lastSyncAt.value = now
    clearDirty()
    status.value = 'idle'
    if (!silent) useToast().success('云同步推送成功')
    return true
  } catch (e) {
    status.value = 'error'
    errorMessage.value = e instanceof Error ? e.message : '推送失败'
    if (!silent) useToast().error(`云同步推送失败：${errorMessage.value}`)
    return false
  }
}

async function applyRemote(remote: WorkbenchData, silent = false): Promise<void> {
  // 在 idbImportAll 覆盖前，先保存本地已有的密码身份
  const localSaltBefore = getStoredSaltHex()
  const localVerificationBefore = getStoredVerification()
  const result = await idbImportAll(remote)
  localStorage.setItem(LAST_SYNC_KEY, String(remote.pushedAt ?? Date.now()))
  lastSyncAt.value = remote.pushedAt ?? Date.now()
  // 判断密码身份是否真的变了：远端 salt/verification 与本地已有不同才算"新身份"
  // 同设备推后拉、或远端密码身份未变时 → 不提示"已锁定"，避免频繁打扰
  const identityChanged = result.adoptedPasswordIdentity
    && (remote.passwordsSalt !== localSaltBefore || remote.passwordVerification !== localVerificationBefore)
  if (!silent) {
    if (identityChanged) {
      useToast().success('云同步完成，密码面板已锁定，请输入来源设备主密码解锁')
    } else {
      useToast().success('云同步完成')
    }
  }
  status.value = 'idle'
  await reloadAllStores()
  // clearDirty 必须在 reloadAllStores 之后：部分 store 的 load 方法会触发 save（如记账自动复制计划），
  // 若在 reload 之前清 dirty，reload 中的 markDirty 会重新置位 → 下次 pullNow 误判冲突。
  clearDirty()
}

// ========== 字段级合并辅助函数 ==========

/**
 * 按 idKey 做并集（union）；同 id 时若 tsKey 存在则取该字段较大者，
 * ISO 字符串用字符串比较、number 用数值比较；tsKey 不存在则取本地。
 * 对 undefined/null 入参用空数组兜底。
 */
function mergeById<T>(local: T[] | undefined | null, remote: T[] | undefined | null, idKey: keyof T, tsKey?: keyof T): T[] {
  const l = local ?? []
  const r = remote ?? []
  const map = new Map<string, T>()
  for (const item of l) map.set(String(item[idKey]), item)
  for (const item of r) {
    const id = String(item[idKey])
    const existing = map.get(id)
    if (!existing) {
      map.set(id, item)
    } else if (tsKey) {
      const lTs = existing[tsKey]
      const rTs = item[tsKey]
      let rNewer = false
      if (typeof lTs === 'number' && typeof rTs === 'number') {
        rNewer = rTs > lTs
      } else if (typeof lTs === 'string' && typeof rTs === 'string') {
        rNewer = rTs > lTs
      }
      if (rNewer) map.set(id, item)
    }
  }
  return [...map.values()]
}

/** 专为 pomodoro.records：按 date 去重，同 date 取 workSessions 较大者。 */
function mergeByDateWithMax<T extends { date: string; workSessions: number }>(local: T[] | undefined, remote: T[] | undefined): T[] {
  const l = local ?? []
  const r = remote ?? []
  const map = new Map<string, T>()
  for (const item of l) map.set(item.date, item)
  for (const item of r) {
    const existing = map.get(item.date)
    if (!existing) {
      map.set(item.date, item)
    } else if (item.workSessions > existing.workSessions) {
      map.set(item.date, item)
    }
  }
  return [...map.values()]
}

/** 用于 diary.entries / business.dailyRecords 的二次去重：同 date 只保留 updatedAt（或 createdAt）最新的一条。 */
function dedupeByDateKeepNewest<T extends { date: string; updatedAt?: string; createdAt?: string; id: string }>(arr: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of arr) {
    const existing = map.get(item.date)
    if (!existing) {
      map.set(item.date, item)
    } else {
      const exTs = existing.updatedAt ?? existing.createdAt ?? ''
      const itemTs = item.updatedAt ?? item.createdAt ?? ''
      if (itemTs > exTs) map.set(item.date, item)
    }
  }
  return [...map.values()]
}

// ========== 模块级合并函数 ==========

function mergeTodos(l: WorkbenchTodo[], r: WorkbenchTodo[]): WorkbenchTodo[] {
  return mergeById(l ?? [], r ?? [], 'id', 'updatedAt')
}

function mergeNotes(l: NoteData | undefined, r: NoteData | undefined): NoteData {
  const lc = l?.categories ?? []
  const rc = r?.categories ?? []
  const categories = mergeById(lc, rc, 'id') // 同 id 取本地

  const ln = l?.notes ?? []
  const rn = r?.notes ?? []
  const notes = mergeById(ln, rn, 'id', 'updatedAt').map(note => {
    if (note.type !== 'timeline') return note
    const localNote = ln.find(n => n.id === note.id)
    const remoteNote = rn.find(n => n.id === note.id)
    if (localNote?.entries && remoteNote?.entries) {
      return { ...note, entries: mergeById(localNote.entries, remoteNote.entries, 'id', 'createdAt') }
    }
    return note
  })
  return { categories, notes }
}

function mergeDiary(l: DiaryData | undefined, r: DiaryData | undefined): DiaryData {
  const le = l?.entries ?? []
  const re = r?.entries ?? []
  return { entries: dedupeByDateKeepNewest(mergeById(le, re, 'id', 'updatedAt')) }
}

function mergeCountdowns(l: Countdown[], r: Countdown[]): Countdown[] {
  return mergeById(l ?? [], r ?? [], 'id', 'updatedAt')
}

function mergeHealth(l: HealthData | undefined, r: HealthData | undefined): HealthData {
  const lr = l?.records ?? { exercise: [], diet: [], sleep: [], weight: [] }
  const rr = r?.records ?? { exercise: [], diet: [], sleep: [], weight: [] }
  const records = {
    exercise: mergeById(lr.exercise ?? [], rr.exercise ?? [], 'id', 'updatedAt'),
    diet: mergeById(lr.diet ?? [], rr.diet ?? [], 'id', 'updatedAt'),
    sleep: mergeById(lr.sleep ?? [], rr.sleep ?? [], 'id', 'updatedAt'),
    weight: mergeById(lr.weight ?? [], rr.weight ?? [], 'id', 'updatedAt')
  }
  const lp: HealthData['plans'] = l?.plans ?? {}
  const rp: HealthData['plans'] = r?.plans ?? {}
  const plans: HealthData['plans'] = {}
  for (const m of ['exercise', 'diet', 'sleep'] as const) {
    const lPlan = lp[m]
    const rPlan = rp[m]
    if (lPlan && rPlan) {
      plans[m] = lPlan.updatedAt >= rPlan.updatedAt ? lPlan : rPlan
    } else {
      plans[m] = lPlan ?? rPlan
    }
  }
  const height = l?.height ?? r?.height
  return { height, plans, records }
}

function mergeLedger(l: LedgerData | undefined, r: LedgerData | undefined): LedgerData {
  const categories = mergeById(l?.categories ?? [], r?.categories ?? [], 'id') // 同 id 取本地
  const entries = mergeById(l?.entries ?? [], r?.entries ?? [], 'id', 'updatedAt')
  return { categories, entries }
}

function mergeHabits(l: HabitsData | undefined, r: HabitsData | undefined): HabitsData {
  return {
    habits: mergeById(l?.habits ?? [], r?.habits ?? [], 'id', 'createdAt'),
    records: mergeById(l?.records ?? [], r?.records ?? [], 'id', 'createdAt')
  }
}

function mergeBusiness(l: BusinessData | undefined, r: BusinessData | undefined): BusinessData {
  const productCategories = mergeById(l?.productCategories ?? [], r?.productCategories ?? [], 'id')
  const expenseCategories = mergeById(l?.expenseCategories ?? [], r?.expenseCategories ?? [], 'id')
  const products = mergeById(l?.products ?? [], r?.products ?? [], 'id', 'createdAt')
  const purchases = mergeById(l?.purchases ?? [], r?.purchases ?? [], 'id', 'createdAt')
  const dailyRecords = dedupeByDateKeepNewest(mergeById(l?.dailyRecords ?? [], r?.dailyRecords ?? [], 'id', 'updatedAt'))
  const expenses = mergeById(l?.expenses ?? [], r?.expenses ?? [], 'id', 'createdAt')
  const settings = l?.settings ?? r?.settings ?? { stallName: '', lowStockThreshold: 20 }
  return { productCategories, expenseCategories, products, purchases, dailyRecords, expenses, settings }
}

function mergePomodoro(l: PomodoroData | undefined, r: PomodoroData | undefined): PomodoroData {
  return {
    settings: l?.settings ?? r?.settings ?? { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, sessionsPerCycle: 4 },
    records: mergeByDateWithMax(l?.records ?? [], r?.records ?? [])
  }
}

function mergeSettings(l: AppSettingsData, _r: AppSettingsData): AppSettingsData {
  return l // 整体保留本地（包含云同步凭证）
}

/** 逐 key 合并 prefs（值均为 JSON 字符串）；单个 key 损坏不中断整体合并。 */
function mergePrefs(l: Record<string, string> | undefined, r: Record<string, string> | undefined): Record<string, string> {
  const local = l ?? {}
  const remote = r ?? {}
  const out: Record<string, string> = {}
  const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)])

  for (const key of allKeys) {
    try {
      const lv = local[key]
      const rv = remote[key]
      // 远端有而本地缺失 → 补入
      if (lv === undefined) { if (rv !== undefined) out[key] = rv; continue }
      // 本地有而远端缺失 → 保留本地
      if (rv === undefined) { out[key] = lv; continue }

      // user-sites: JSON.parse 后按 url 去重，同 url 取 updatedAt 较新者
      if (key === 'user-sites') {
        try {
          const ls = JSON.parse(lv) as { url: string; updatedAt?: string }[]
          const rs = JSON.parse(rv) as { url: string; updatedAt?: string }[]
          const map = new Map<string, { url: string; updatedAt?: string }>()
          for (const s of ls) map.set(s.url, s)
          for (const s of rs) {
            const ex = map.get(s.url)
            if (!ex) map.set(s.url, s)
            else if ((s.updatedAt ?? '') > (ex.updatedAt ?? '')) map.set(s.url, s)
          }
          out[key] = JSON.stringify([...map.values()])
        } catch { out[key] = lv } // 解析失败取本地
        continue
      }

      // user-categories: JSON.parse 后按 id 去重，内置不丢（同 id 取本地）
      if (key === 'user-categories') {
        try {
          const lc = JSON.parse(lv) as { id: string }[]
          const rc = JSON.parse(rv) as { id: string }[]
          const map = new Map<string, { id: string }>()
          for (const c of lc) map.set(c.id, c)
          for (const c of rc) { if (!map.has(c.id)) map.set(c.id, c) }
          out[key] = JSON.stringify([...map.values()])
        } catch { out[key] = lv }
        continue
      }

      // 带结构的数组型 key：按 id 或按值去重
      const ARRAY_KEYS = [
        'user-search-engines', 'built-in-engine-overrides', 'built-in-engine-default',
        'user-todo-categories', 'user-todo-tab-categories',
        'user-countdown-categories', 'user-countdown-tab-categories',
        'user-deleted-legacy-ids'
      ]
      if (ARRAY_KEYS.includes(key)) {
        try {
          const la = JSON.parse(lv)
          const ra = JSON.parse(rv)
          if (Array.isArray(la) && Array.isArray(ra)) {
            const hasId = la.some((x: unknown) => x && typeof x === 'object' && 'id' in (x as object))
            if (hasId) {
              const map = new Map<string, unknown>()
              for (const item of la) map.set(String((item as { id: string }).id), item)
              for (const item of ra) {
                const id = String((item as { id: string }).id)
                if (!map.has(id)) map.set(id, item)
              }
              out[key] = JSON.stringify([...map.values()])
            } else {
              const set = new Set(la as (string | number)[])
              for (const item of ra) set.add(item)
              out[key] = JSON.stringify([...set])
            }
          } else {
            out[key] = lv // 非数组取本地
          }
        } catch { out[key] = lv }
        continue
      }

      // 非数组型 key（user-theme / user-background / user-countdown-sort 等）：取本地
      out[key] = lv
    } catch {
      // 单 key 损坏不影响其他 key
      if (local[key] !== undefined) out[key] = local[key]
      else if (remote[key] !== undefined) out[key] = remote[key]!
    }
  }
  return out
}

/**
 * 顶层合并入口：调用各模块合并函数组装结果，修正元数据字段。
 * 纯函数——不触碰 IDB / localStorage。
 * 例外（不并集、单向覆盖）：密码 + 密码身份整体取云端；settings 整体取本地。
 */
function mergeData(local: WorkbenchData, remote: WorkbenchData): WorkbenchData {
  return {
    version: WORKBENCH_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    todos: mergeTodos(local.todos, remote.todos),
    notes: mergeNotes(local.notes, remote.notes),
    diary: mergeDiary(local.diary, remote.diary),
    countdowns: mergeCountdowns(local.countdowns, remote.countdowns),
    // 密码整体取云端（永不拆分、永不并集）：
    // 1. 密码是"整库用一个主密码加密成的单个密文串"，密文层面无法按条目合并；
    // 2. 用户明确要求"密码同步永远云端覆盖本地"——任何以本地为准的合并都会让
    //    另一台设备的更新无声消失，属于数据丢失；
    // 3. 密文必须与其加密身份（salt/verification）同源，否则换了密文留着旧盐
    //    → 本地主密码解不开 → 不可恢复。故三者必须一起取云端。
    // remote 缺省时回退本地，避免旧备份文件（无 passwords 字段）清空本地密码库。
    passwords: remote.passwords ?? local.passwords,
    passwordsSalt: remote.passwordsSalt ?? local.passwordsSalt,
    passwordVerification: remote.passwordVerification ?? local.passwordVerification,
    health: mergeHealth(local.health, remote.health),
    ledger: mergeLedger(local.ledger, remote.ledger),
    settings: mergeSettings(local.settings, remote.settings),
    pomodoro: mergePomodoro(local.pomodoro as PomodoroData | undefined, remote.pomodoro as PomodoroData | undefined),
    habits: mergeHabits(local.habits as HabitsData | undefined, remote.habits as HabitsData | undefined),
    business: mergeBusiness(local.business, remote.business),
    prefs: mergePrefs(local.prefs, remote.prefs),
    clientId: getClientId()
    // pushedAt 不设——由后续 pushNow 写入
  }
}

export async function resolveConflict(decision: 'remote' | 'local' | 'cancel' | 'merge'): Promise<void> {
  if (!conflictData.value) return
  const { local, remote } = conflictData.value
  if (decision === 'remote') {
    conflictData.value = null
    await applyRemote(remote)
    return
  }
  if (decision === 'local') {
    conflictData.value = null
    await pushNow()
    return
  }
  if (decision === 'merge') {
    conflictData.value = null
    status.value = 'pushing'
    try {
      const merged = mergeData(local, remote)
      await applyRemote(merged, true) // 写本地 + reload stores（静默，不弹 toast）
      const pushOk = await pushNow(true) // 推云端（静默）
      if (pushOk) {
        useToast().success('云同步合并完成')
      } else {
        useToast().error(`云同步合并失败：${errorMessage.value}`)
      }
    } catch (e) {
      status.value = 'error'
      errorMessage.value = e instanceof Error ? e.message : '合并同步失败'
      useToast().error(`云同步合并失败：${errorMessage.value}`)
    }
    return
  }
  // cancel：保留本地，但记下 lastSyncAt = remote.pushedAt 避免重复弹框
  const ts = remote.pushedAt ?? Date.now()
  localStorage.setItem(LAST_SYNC_KEY, String(ts))
  lastSyncAt.value = ts
  clearDirty()
  conflictData.value = null
  status.value = 'idle'
  useToast().info('已取消同步冲突')
}

async function pullNow(): Promise<void> {
  const settings = useAppSettingsStore()
  if (!settings.cloudSyncEnabled || !settings.cloudSyncUrl || !settings.cloudSyncUsername || !settings.cloudSyncPassword) {
    return
  }
  status.value = 'pulling'
  errorMessage.value = ''
  try {
    const dir = dirUrl(settings.cloudSyncUrl!)
    const getResult = await webdavGet(`${dir}/${BACKUP_FILE}`, settings.cloudSyncUsername!, settings.cloudSyncPassword!)
    const remote = getResult.data
    if (!remote) {
      status.value = 'idle'
      // 远端无备份（首次使用）→ 若本地 dirty 则推送
      if (isDirty()) await pushNow()
      return
    }
    // ===== 修复方案 B：双兜底判定 =====
    // 1) 时间戳：remote.pushedAt（信封内嵌）和 Last-Modified（WebDAV 响应头）取较大值
    //    解决：用户手动改坚果云文件没更新 pushedAt → Last-Modified 兜底
    const remoteTs = Math.max(remote.pushedAt ?? 0, getResult.lastModifiedMs)
    const localTs = Number(localStorage.getItem(LAST_SYNC_KEY) || '0')
    const dirty = isDirty()

    // 2) 内容 hash：剔除元数据字段（exportedAt/pushedAt/clientId）+ 递归排序 key 后比较
    //    解决：每次 idbExportAll() 的 exportedAt 时间戳不同、不同设备 clientId 不同、
    //    JSON key 顺序不同 → hash 永远不等 → 误判冲突
    const remoteSig = businessSignature(remote)
    const localExport = await idbExportAll()
    const localSig = businessSignature(localExport)
    const remoteHash = await sha1Hash(remoteSig)
    const localHash = await sha1Hash(localSig)
    const contentSame = remoteHash === localHash

    // ===== 快速路径：内容完全一致 → noop =====
    if (contentSame) {
      // lastSyncAt 补到最新（避免下次再走重复流程），但不做任何导入/推送
      const ceiling = Math.max(remoteTs, localTs)
      if (ceiling > 0 && ceiling !== localTs) {
        localStorage.setItem(LAST_SYNC_KEY, String(ceiling))
        lastSyncAt.value = ceiling
      }
      clearDirty()
      status.value = 'idle'
      return
    }

    // ===== 内容不同：走 4 分支决策 =====
    // 注意：remoteTs <= localTs 的场景现在也不能盲推，因为"外部手动改文件
    // 但 pushedAt 没动 + Last-Modified 没变化 / 代理丢头"时 hash 已经判定内容不同。
    if (dirty && remoteTs > localTs) {
      // 双方都有新变更（时间戳维度）→ 计算模块级差异量
      const local = localExport
      const diffSize = moduleDiffSize(local, remote)
      if (diffSize < MODULE_DIFF_THRESHOLD) {
        // 微小差异（归一化/时间戳/设备级噪音）→ 静默合并，不弹框
        // 密码在此由 mergeData 单向取云端，无需额外保护
        const merged = mergeData(local, remote)
        await applyRemote(merged, true)
        await pushNow(true)
        return
      }
      conflictData.value = { local, remote }
      status.value = 'conflict'
      useToast().warning('云同步检测到冲突，请选择解决方式')
      return
    }
    if (dirty && remoteTs <= localTs) {
      // 本地 dirty 但 remoteTs 看起来没更新 —— 计算模块级差异量
      const local = localExport
      const diffSize = moduleDiffSize(local, remote)
      if (diffSize < MODULE_DIFF_THRESHOLD) {
        // 微小差异 → 静默合并，不弹框
        // 密码在此由 mergeData 单向取云端，无需额外保护
        const merged = mergeData(local, remote)
        await applyRemote(merged, true)
        await pushNow(true)
        return
      }
      // 差异较大 + remoteTs 没更新 → 可能外部手动改文件，弹框让用户选择
      conflictData.value = { local, remote }
      status.value = 'conflict'
      useToast().warning('云同步检测到内容不一致（本地有未同步变更），请选择解决方式')
      return
    }
    if (!dirty) {
      // 本地无变更、内容 hash 不同 → 远端有新变更（不管时间戳维度谁大）→ 直接拉取覆盖本地
      // 这正是"用户在坚果云手动改 backup.json → 回到 Web 端点立即同步"的目标场景：
      //   → 直接 applyRemote（不会盲推覆盖远端了！）
      //
      // 密码在此一并被云端覆盖（mergeData 语义：passwords + salt + verification 单向取云端），
      // 符合"密码同步永远云端覆盖本地"的策略。若两端主密码不同，applyRemote 会采用云端
      // 密码身份并锁定面板，提示用户输入来源设备主密码解锁——这是预期行为，非异常。
      await applyRemote(remote)
      return
    }
    // 都无新变更 → noop（理论上已被 contentSame 短路吞掉，留作兜底）
    status.value = 'idle'
  } catch (e) {
    status.value = 'error'
    errorMessage.value = e instanceof Error ? e.message : '拉取失败'
    useToast().error(`云同步拉取失败：${errorMessage.value}`)
  }
}

/** 立即同步按钮入口：按状态决定先拉还是先推 */
export async function syncNow(): Promise<void> {
  const settings = useAppSettingsStore()
  if (!settings.cloudSyncEnabled || !settings.cloudSyncUrl) {
    useToast().error('请先在设置中启用并配置云同步')
    return
  }
  if (isDirty()) {
    // 本地有变更 → 先拉（避免盲推覆盖），拉取流程会在 !dirty 分支触发推送
    await pullNow()
    // 如果拉取后仍 dirty 且没冲突 → 补推一次
    if (isDirty() && status.value === 'idle') await pushNow()
  } else {
    await pullNow()
  }
}

// ========== 拉取栅栏：visibilitychange visible 时 pullNow 的 Promise ==========
// 其他模块（如倒计时提醒）可 await waitForPull() 确保先拉取最新数据再 tick
let pendingPull: Promise<void> | null = null

export function waitForPull(): Promise<void> {
  return pendingPull ?? Promise.resolve()
}

// ========== 触发器：visibilitychange + beforeunload + 轮询 ==========

let initialized = false
let intervalTimer: ReturnType<typeof setInterval> | null = null

function stopInterval(): void {
  if (intervalTimer) {
    clearInterval(intervalTimer)
    intervalTimer = null
  }
}

function startInterval(): void {
  stopInterval()
  const settings = useAppSettingsStore()
  const minutes = Number(settings.cloudSyncInterval) || 0
  if (minutes <= 0) return
  const ms = minutes * 60 * 1000
  intervalTimer = setInterval(() => {
    if (status.value === 'idle' || status.value === 'error') {
      void syncNow()
    }
  }, ms)
}

/** 在 App.vue onMounted 调用；幂等 */
export function init(): void {
  if (initialized) return
  initialized = true
  const saved = Number(localStorage.getItem(LAST_SYNC_KEY) || '0')
  lastSyncAt.value = saved || null

  // settingsStore 需在组件树挂载后才初始化好，保证 store 已就绪再读轮询
  queueMicrotask(() => {
    try {
      startInterval()
    } catch {
      /* ignore: store 未就绪，下一次修改会重启 */
    }
  })
  // 每次设置变更（间隔/开关）重启轮询：通过 visibilitychange+操作时兜底 + 简单轮询 watch 即可
  // 这里不直接 watch settings 实例（避免单例 init 早于 store 初始化报错）
  setInterval(() => {
    try { startInterval() } catch { /* ignore */ }
  }, 60 * 1000).unref?.()

  document.addEventListener('visibilitychange', () => {
    if (status.value !== 'idle' && status.value !== 'error') return
    if (document.visibilityState === 'visible') {
      // 页面重新可见 → 拉取远程更新（技能改文件/其他设备推送都会被检测到）
      // 设置栅栏 Promise 供其他模块（倒计时提醒）await 后再 tick
      pendingPull = pullNow().finally(() => { pendingPull = null })
    }
    // hidden 时不自动推送（避免盲推覆盖技能修改的远程文件）
    // 推送统一由定时轮询 + 手动「立即同步」触发，都会先 pullNow 检测冲突
  })

  window.addEventListener('beforeunload', () => {
    // beforeunload 中 fetch 可能被中断（尤其是异步）；仅在 visibilitychange hidden 已兜底
    // 此处用 sendBeacon 仅做最佳尝试（PUT body 需 blob，但 sendBeacon 对大文件不可靠）
    // 简化：依赖 visibilitychange hidden 推送，beforeunload 不额外推送
  })
}

export function useCloudSync() {
  return {
    status,
    lastSyncAt,
    errorMessage,
    conflictData,
    init,
    pushNow,
    pullNow,
    syncNow,
    resolveConflict,
    testConnection,
    markDirty,
    isDirty,
    startInterval
  }
}
