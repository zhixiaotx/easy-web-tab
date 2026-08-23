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
import type { WorkbenchData } from '../types'

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

async function pushNow(): Promise<boolean> {
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
    useToast().success('云同步推送成功')
    return true
  } catch (e) {
    status.value = 'error'
    errorMessage.value = e instanceof Error ? e.message : '推送失败'
    useToast().error(`云同步推送失败：${errorMessage.value}`)
    return false
  }
}

async function applyRemote(remote: WorkbenchData): Promise<void> {
  const result = await idbImportAll(remote)
  localStorage.setItem(LAST_SYNC_KEY, String(remote.pushedAt ?? Date.now()))
  lastSyncAt.value = remote.pushedAt ?? Date.now()
  clearDirty()
  if (result.adoptedPasswordIdentity) {
    useToast().success('云同步完成，密码面板已锁定，请输入来源设备主密码解锁')
  } else {
    useToast().success('云同步完成')
  }
  status.value = 'idle'
  await reloadAllStores()
}

export async function resolveConflict(decision: 'remote' | 'local' | 'cancel'): Promise<void> {
  if (!conflictData.value) return
  const { remote } = conflictData.value
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

    // 2) 内容 hash：远端原始 rawText 和 本地导出 JSON 分别 hash
    //    解决：pushedAt 和 Last-Modified 都没变化（比如代理响应头丢了、系统时间被回拨）
    //    时，只要内容变了就不会盲推
    const remoteHash = await sha1Hash(getResult.rawText)
    const localExport = await idbExportAll()
    const localRaw = JSON.stringify(localExport)
    const localHash = await sha1Hash(localRaw)
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
      // 双方都有新变更（时间戳维度）→ 冲突
      const local = localExport
      conflictData.value = { local, remote }
      status.value = 'conflict'
      useToast().warning('云同步检测到冲突，请选择解决方式')
      return
    }
    if (dirty && remoteTs <= localTs) {
      // 本地 dirty 但 remoteTs 看起来没更新 —— 不能盲推！
      // 内容 hash 已不同，说明要么：
      //   a) 时间戳机制全部失效（Last-Modified 丢头 + pushedAt 被外部改文件保留）
      //   b) 外部设备写了内容但由于某种原因时钟比本地慢
      // 安全选择：仍然触发冲突（至少不会静默回滚用户手动改的文件）
      const local = localExport
      conflictData.value = { local, remote }
      status.value = 'conflict'
      useToast().warning('云同步检测到内容不一致（本地有未同步变更），请选择解决方式')
      return
    }
    if (!dirty) {
      // 本地无变更、内容 hash 不同 → 远端有新变更（不管时间戳维度谁大）→ 直接拉取覆盖本地
      // 这正是"用户在坚果云手动改 backup.json → 回到 Web 端点立即同步"的目标场景：
      //   → 直接 applyRemote（不会盲推覆盖远端了！）
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
      void pullNow()
    } else if (document.visibilityState === 'hidden' && isDirty()) {
      void pushNow()
    }
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
    isDirty
  }
}
