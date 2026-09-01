/**
 * 云同步 composable（WebDAV + v10 多文件同步信封）
 *
 * 5 份独立信封：nav.json / icons.json / workbench.json / business.json / student.json
 *   - nav.json：localStorage 偏好打包（user-sites/categories/engines/theme/countdown-* 等）
 *   - icons.json：自定义图标（localStorage user-custom-icons）
 *   - workbench.json：工作台核心 9 store（不含 business；settings 不含 cloudSync* 5 字段）
 *   - business.json：销售记账独立信封
 *   - student.json：学生工作台 15 store 独立信封
 *
 * 单例设计：模块级 ref 持有全局状态（参考 useCountdownReminder / useToast 的单例模式）
 * 触发器：
 *   - document.visibilitychange  visible → pullNow | hidden + dirty → pushNow
 *   - App.vue onMounted 调 init()
 *   - 设置弹窗「立即同步」按钮
 *   - localStorage dirty 标记（各 store 的 save* 后 markDirty()）
 *
 * 冲突判定：本地 dirty=true 且 远端 pushedAt > lastSyncAt（逐文件独立判定，累积到 conflictData Record）
 * 冲突解决：3 选 1（全部云端覆盖 / 全部本地覆盖 / 全部合并）
 *
 * 首次迁移：5 份都 404 但 backup.json 存在 → 读 backup.json → idbImportAll 落本地 →
 *           export 5 份 → 上传 → DELETE backup.json
 *
 * CORS 兼容：WebDAV 原生自定义方法（MKCOL）+ Authorization 会触发浏览器预检（OPTIONS），
 * 坚果云/Nextcloud 默认不回 Access-Control-Allow-Origin。
 * 解决方案：请求统一走同源代理 `/api/webdav-proxy`（Vite dev 与 Node prod server 均已挂载），
 * 由服务端带凭证直接代发 HTTP → 天然无 CORS。
 */
import { ref, shallowRef } from 'vue'
import {
  idbImportAll,
  exportWorkbench,
  importWorkbenchData,
  exportBusiness,
  importBusinessData,
  exportStudent,
  importStudentData,
  exportNav,
  importNavData,
  exportIcons,
  importIconsData
} from './useIdb'
import { useAppSettingsStore } from '../stores/settings'
import { useToast } from './useToast'
import { getStoredSaltHex, getStoredVerification } from './useCrypto'
import type {
  BusinessData,
  BusinessSyncData,
  Countdown,
  DiaryData,
  HealthData,
  IconsSyncData,
  LedgerData,
  NavSyncData,
  NoteData,
  StudentSyncData,
  WorkbenchData,
  WorkbenchSyncData,
  WorkbenchTodo
} from '../types'
import type { PomodoroData } from './pomodoroCore'
import type { HabitsData } from './habitCore'

const CLIENT_ID_KEY = 'easy-web-tab-client-id'
const LAST_SYNC_KEY = 'easy-web-tab-last-sync'
const DIRTY_KEY = 'easy-web-tab-dirty'
const PROXY_PATH = '/api/webdav-proxy'
const DATA_DIR = 'easy-web-tab'
/** 5 份多文件信封（顺序：nav → icons → workbench → business → student），见下方 FILE_CONFIGS */
/** 仅用于首次迁移检测（v9 单文件 backup.json） */
const LEGACY_BACKUP_FILE = 'backup.json'

export type SyncStatus = 'idle' | 'pushing' | 'pulling' | 'conflict' | 'error'

interface ConflictEntry {
  local: unknown
  remote: unknown
}

interface FileConfig {
  name: string
  exportLocal: () => Promise<unknown> | unknown
  importRemote: (data: unknown) => Promise<unknown>
  signature: (data: unknown) => string
  merge: (local: unknown, remote: unknown) => unknown
  reload: () => Promise<void>
  diffSize: (local: unknown, remote: unknown) => number
}

// 单例状态（模块级引用，composable 返回同一引用）
const status = ref<SyncStatus>('idle')
const lastSyncAt = ref<number | null>(null)
const errorMessage = ref<string>('')
const conflictData = shallowRef<Record<string, ConflictEntry> | null>(null)

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

type DavMethod = 'GET' | 'PUT' | 'MKCOL' | 'DELETE'

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

/** 各信封通用签名：剔除 exportedAt/pushedAt/clientId 三个不稳定元数据字段后 stableStringify */
function envelopeSignature(data: Record<string, unknown>): string {
  const copy: Record<string, unknown> = { ...data }
  delete copy.exportedAt
  delete copy.pushedAt
  delete copy.clientId
  return stableStringify(copy)
}

/** workbench.json 额外剔除 prefs（设备级 localStorage 快照，不同设备天然不同，避免误判冲突） */
function workbenchSignature(data: WorkbenchSyncData): string {
  const copy: Record<string, unknown> = { ...(data as unknown as Record<string, unknown>) }
  delete copy.exportedAt
  delete copy.pushedAt
  delete copy.clientId
  delete copy.prefs
  return stableStringify(copy)
}

function sigNav(data: NavSyncData): string { return envelopeSignature(data as unknown as Record<string, unknown>) }
function sigIcons(data: IconsSyncData): string { return envelopeSignature(data as unknown as Record<string, unknown>) }
function sigBusiness(data: BusinessSyncData): string { return envelopeSignature(data as unknown as Record<string, unknown>) }
function sigStudent(data: StudentSyncData): string { return envelopeSignature(data as unknown as Record<string, unknown>) }

/**
 * 计算本地与远程的总差异量（Σ|local_len - remote_len|）。
 * 差异总量 < DIFF_THRESHOLD → 视为微小差异，静默合并不弹框。
 */
const MODULE_DIFF_THRESHOLD = 500

function totalDiffSize(local: unknown, remote: unknown): number {
  try {
    const l = local !== undefined && local !== null ? stableStringify(local).length : 0
    const r = remote !== undefined && remote !== null ? stableStringify(remote).length : 0
    return Math.abs(l - r)
  } catch { return 0 }
}

/** workbench 字段级差异量（保留原 moduleDiffSize 行为，移除 business 字段） */
function workbenchDiffSize(local: WorkbenchSyncData, remote: WorkbenchSyncData): number {
  const keys: Array<keyof WorkbenchSyncData> = ['todos', 'notes', 'diary', 'countdowns', 'passwords', 'health', 'ledger', 'settings', 'pomodoro', 'habits', 'prefs']
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
// 同步策略（用户明确要求）：**密码永远云端覆盖本地** —— 由 mergeWorkbench 单向取云端实现，
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
  data: unknown | null
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
  return { data: JSON.parse(text), lastModifiedMs, rawText: text }
}

async function webdavPut(url: string, username: string, password: string, body: string): Promise<void> {
  const res = await proxyDav(url, 'PUT', username, password, body)
  if (!res.ok) {
    const diag = await readDavDiagnostics(res)
    throw new Error(davErrorLabel('PUT', diag.upstreamStatus, diag.snippet, diag.textBody, res.status))
  }
}

async function webdavDelete(url: string, username: string, password: string): Promise<void> {
  const res = await proxyDav(url, 'DELETE', username, password)
  // 404 视作成功（文件本就不存在）
  if (res.ok || res.status === 404) return
  const diag = await readDavDiagnostics(res)
  throw new Error(davErrorLabel('DELETE', diag.upstreamStatus, diag.snippet, diag.textBody, res.status))
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

/** 探测连接 + 确保 easy-web-tab 目录存在（v10 改为只 MKCOL 探目录，不再 GET backup.json） */
export async function testConnection(
  url: string,
  username: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  if (!url || !username || !password) return { ok: false, error: 'URL / 用户名 / 应用密码不能为空' }
  try {
    const dir = dirUrl(url)
    await webdavMkcol(dir, username, password)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '连接失败'
    const hint = msg.includes('Failed to fetch')
      ? '请求失败：请确认本页面通过 Vite dev(npm run dev) 或内置服务(npm run serve) 打开，以启用 WebDAV 代理。'
      : msg
    return { ok: false, error: hint }
  }
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

// ========== 模块级合并函数（workbench.json 复用） ==========

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

// ========== 各信封合并入口 ==========

/** nav.json：复用 mergePrefs（与 workbench.json 的 prefs 同一逻辑） */
function mergeNav(local: NavSyncData, remote: NavSyncData): NavSyncData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    clientId: getClientId(),
    prefs: mergePrefs(local.prefs, remote.prefs)
  }
}

/** icons.json：按 id 去重，同 id 取 createdAt 较新者 */
function mergeIcons(local: IconsSyncData, remote: IconsSyncData): IconsSyncData {
  const map = new Map<string, IconsSyncData['icons'][number]>()
  for (const icon of [...(local.icons ?? []), ...(remote.icons ?? [])]) {
    const existing = map.get(icon.id)
    if (!existing) {
      map.set(icon.id, icon)
    } else if ((icon.createdAt ?? '') > (existing.createdAt ?? '')) {
      map.set(icon.id, icon)
    }
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    clientId: getClientId(),
    icons: [...map.values()]
  }
}

/**
 * workbench.json 合并入口：调用各模块合并函数组装结果，修正元数据字段。
 * 纯函数——不触碰 IDB / localStorage。
 * 例外（不并集、单向覆盖）：密码 + 密码身份整体取云端；settings 整体取本地。
 * 注意：与旧 mergeData 区别——不含 business（独立走 business.json），settings 为 AppSettingsDataNoCloudSync。
 */
function mergeWorkbench(local: WorkbenchSyncData, remote: WorkbenchSyncData): WorkbenchSyncData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    clientId: getClientId(),
    todos: mergeTodos(local.todos, remote.todos),
    notes: mergeNotes(local.notes, remote.notes),
    diary: mergeDiary(local.diary, remote.diary),
    countdowns: mergeCountdowns(local.countdowns, remote.countdowns),
    // 密码整体取云端（永不拆分、永不并集），原因详见注释
    passwords: remote.passwords ?? local.passwords,
    passwordsSalt: remote.passwordsSalt ?? local.passwordsSalt,
    passwordVerification: remote.passwordVerification ?? local.passwordVerification,
    health: mergeHealth(local.health, remote.health),
    ledger: mergeLedger(local.ledger, remote.ledger),
    // settings 整体保留本地（本地 settings 不含 cloudSync* 5 字段，由 importWorkbenchData 合并本机凭证）
    settings: local.settings,
    pomodoro: mergePomodoro(local.pomodoro as PomodoroData | undefined, remote.pomodoro as PomodoroData | undefined),
    habits: mergeHabits(local.habits as HabitsData | undefined, remote.habits as HabitsData | undefined),
    prefs: mergePrefs(local.prefs, remote.prefs)
    // pushedAt 不设——由后续 pushNow 写入
  }
}

/** business.json：复用 mergeBusiness，包装信封 */
function mergeBusinessEnvelope(local: BusinessSyncData, remote: BusinessSyncData): BusinessSyncData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    clientId: getClientId(),
    business: mergeBusiness(local.business, remote.business)
  }
}

/**
 * student.json 合并：递归合并对象/数组。
 * 数组走 mergeById（按 id，同 id 取 updatedAt 较新者，缺失则取 createdAt）；
 * 对象逐字段递归合并；单值取云端（无时戳可比较）。
 */
function mergeStudent(local: StudentSyncData, remote: StudentSyncData): StudentSyncData {
  const out: StudentSyncData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    clientId: getClientId()
  }
  const FIELD_KEYS: Array<keyof StudentSyncData> = [
    'studentSettings', 'studentHabits', 'studentPomodoro', 'studentDiary', 'studentCountdowns',
    'homework', 'timetable', 'plans', 'review', 'mistakes', 'reading',
    'achievements', 'rewards', 'parentTasks', 'studentImages', 'education'
  ]
  for (const key of FIELD_KEYS) {
    const lv = local[key]
    const rv = remote[key]
    if (lv === undefined && rv === undefined) continue
    ;(out as unknown as Record<string, unknown>)[key] = mergeStudentValue(lv, rv)
  }
  return out
}

function mergeStudentValue(lv: unknown, rv: unknown): unknown {
  // 都是数组 → mergeById
  if (Array.isArray(lv) && Array.isArray(rv)) {
    return mergeById(
      lv as Array<{ id: string; updatedAt?: string; createdAt?: string }>,
      rv as Array<{ id: string; updatedAt?: string; createdAt?: string }>,
      'id', 'updatedAt'
    )
  }
  // 都是对象（非数组）→ 逐字段递归合并
  if (lv && typeof lv === 'object' && rv && typeof rv === 'object' && !Array.isArray(lv) && !Array.isArray(rv)) {
    const lo = lv as Record<string, unknown>
    const ro = rv as Record<string, unknown>
    const out: Record<string, unknown> = {}
    const allKeys = new Set([...Object.keys(lo), ...Object.keys(ro)])
    for (const k of allKeys) {
      out[k] = mergeStudentValue(lo[k], ro[k])
    }
    return out
  }
  // 单值（string/number/boolean/null/undefined）→ 取云端
  return rv ?? lv
}

// ========== 导入后各 store reload ==========

async function reloadWorkbenchStores(): Promise<void> {
  // 惰性导入避免循环依赖（各 store 在 WorkbenchView 里已 import，此处用动态导入走 onMounted init）
  const [{ useWorkbenchTodosStore }, { useWorkbenchNotesStore }, { useWorkbenchDiaryStore }, { useCountdownsStore }, { useWorkbenchHealthStore }, { useWorkbenchLedgerStore }, { useWorkbenchPomodoroStore }, { useWorkbenchHabitsStore }, { useAppSettingsStore }] = await Promise.all([
    import('../stores/workbenchTodos'),
    import('../stores/workbenchNotes'),
    import('../stores/workbenchDiary'),
    import('../stores/countdowns'),
    import('../stores/workbenchHealth'),
    import('../stores/workbenchLedger'),
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
    useWorkbenchPomodoroStore().loadPomodoro(),
    useWorkbenchHabitsStore().loadHabits(),
    useAppSettingsStore().initSettings()
  ])
}

async function reloadBusinessStore(): Promise<void> {
  const [{ useWorkbenchBusinessStore }] = await Promise.all([import('../stores/workbenchBusiness')])
  await useWorkbenchBusinessStore().loadBusiness()
}

async function reloadStudentStores(): Promise<void> {
  // 学生 13 store 全量 reload（数据被云端覆盖后刷新 Vue 状态）
  // 注：student_diary 数据无独立 Pinia store，直接读 IDB；同步后组件下次访问自动刷新
  const [
    { useStudentSettingsStore }, { useStudentHabitsStore }, { useStudentPomodoroStore },
    { useStudentExamStore }, { useStudentHomeworkStore },
    { useStudentTimetableStore }, { useStudentPlanStore }, { useStudentReviewStore },
    { useStudentMistakesStore }, { useStudentReadingStore }, { useStudentAchievementsStore },
    { useStudentRewardsStore }, { useStudentParentTasksStore }, { useStudentEducationStore },
    { useStudentDiaryStore }
  ] = await Promise.all([
    import('../stores/studentSettings'),
    import('../stores/studentHabits'),
    import('../stores/studentPomodoro'),
    import('../stores/studentExam'),
    import('../stores/studentHomework'),
    import('../stores/studentTimetable'),
    import('../stores/studentPlan'),
    import('../stores/studentReview'),
    import('../stores/studentMistakes'),
    import('../stores/studentReading'),
    import('../stores/studentAchievements'),
    import('../stores/studentRewards'),
    import('../stores/studentParentTasks'),
    import('../stores/studentEducation'),
    import('../stores/studentDiary')
  ])
  await Promise.all([
    useStudentSettingsStore().loadSettings(),
    useStudentHabitsStore().loadHabits(),
    useStudentPomodoroStore().loadPomodoro(),
    useStudentExamStore().loadExams(),
    useStudentHomeworkStore().loadHomework(),
    useStudentTimetableStore().loadTimetable(),
    useStudentPlanStore().loadPlans(),
    useStudentReviewStore().loadReview(),
    useStudentMistakesStore().loadMistakes(),
    useStudentReadingStore().loadReading(),
    useStudentAchievementsStore().loadAchievements(),
    useStudentRewardsStore().loadRewards(),
    useStudentParentTasksStore().loadTasks(),
    useStudentEducationStore().loadEducation(),
    useStudentDiaryStore().loadDiary()
  ])
}

async function reloadNavStores(): Promise<void> {
  // Nav prefs 写入 localStorage 后刷新消费 store（loadSites 内部会 loadGames；
  // categories/engines/theme 等无 reload 方法的 store 由页面刷新或下次渲染自然刷新）
  try {
    const [{ useSitesStore }] = await Promise.all([import('../stores/sites')])
    await useSitesStore().loadSites()
  } catch {
    // store 未就绪（如首次同步早于组件树挂载）→ 静默跳过，下次访问会从 localStorage 自然读取
  }
}

async function reloadIconsStores(): Promise<void> {
  try {
    const { useIconsStore } = await import('../stores/icons')
    await useIconsStore().reloadCustomIcons()
  } catch {
    // 同上：store 未就绪时静默跳过
  }
}

async function reloadAllStores(): Promise<void> {
  await Promise.all([
    reloadWorkbenchStores(),
    reloadBusinessStore(),
    reloadStudentStores(),
    reloadNavStores(),
    reloadIconsStores()
  ])
}

// ========== 文件配置表 ==========

const FILE_CONFIGS: FileConfig[] = [
  {
    name: 'nav.json',
    exportLocal: () => exportNav(),
    importRemote: async (data) => { importNavData(data as NavSyncData); return undefined },
    signature: (data) => sigNav(data as NavSyncData),
    merge: (l, r) => mergeNav(l as NavSyncData, r as NavSyncData),
    reload: reloadNavStores,
    diffSize: (l, r) => totalDiffSize(l, r)
  },
  {
    name: 'icons.json',
    exportLocal: () => exportIcons(),
    importRemote: async (data) => { await importIconsData(data as IconsSyncData); return undefined },
    signature: (data) => sigIcons(data as IconsSyncData),
    merge: (l, r) => mergeIcons(l as IconsSyncData, r as IconsSyncData),
    reload: reloadIconsStores,
    diffSize: (l, r) => totalDiffSize(l, r)
  },
  {
    name: 'workbench.json',
    exportLocal: () => exportWorkbench(),
    importRemote: (data) => importWorkbenchData(data as WorkbenchSyncData),
    signature: (data) => workbenchSignature(data as WorkbenchSyncData),
    merge: (l, r) => mergeWorkbench(l as WorkbenchSyncData, r as WorkbenchSyncData),
    reload: reloadWorkbenchStores,
    diffSize: (l, r) => workbenchDiffSize(l as WorkbenchSyncData, r as WorkbenchSyncData)
  },
  {
    name: 'business.json',
    exportLocal: () => exportBusiness(),
    importRemote: async (data) => { await importBusinessData(data as BusinessSyncData); return undefined },
    signature: (data) => sigBusiness(data as BusinessSyncData),
    merge: (l, r) => mergeBusinessEnvelope(l as BusinessSyncData, r as BusinessSyncData),
    reload: reloadBusinessStore,
    diffSize: (l, r) => totalDiffSize(l, r)
  },
  {
    name: 'student.json',
    exportLocal: () => exportStudent(),
    importRemote: async (data) => { await importStudentData(data as StudentSyncData); return undefined },
    signature: (data) => sigStudent(data as StudentSyncData),
    merge: (l, r) => mergeStudent(l as StudentSyncData, r as StudentSyncData),
    reload: reloadStudentStores,
    diffSize: (l, r) => totalDiffSize(l, r)
  }
]

// ========== 首次迁移：v9 单文件 backup.json → v10 多文件 ==========

/**
 * 首次迁移流程：
 * 1. 已读 backup.json（WorkbenchData）传入
 * 2. idbImportAll 落本地 IDB（含密码身份接管）
 * 3. 调用 5 个 export 函数从本地拆出 5 份信封
 * 4. 为每份信封设置 clientId + pushedAt
 * 5. PUT 5 份到 cloud
 * 6. DELETE cloud 上的 backup.json
 * 7. 更新 lastSyncAt + clearDirty + reloadAllStores
 */
async function migrateFromLegacyBackup(
  legacyBackup: WorkbenchData,
  dir: string,
  username: string,
  password: string,
  silent: boolean
): Promise<void> {
  // 1) 先记录本地密码身份（用于检测是否变更）
  const localSaltBefore = getStoredSaltHex()
  const localVerificationBefore = getStoredVerification()
  // 2) 落本地 IDB（idbImportAll 会接管密码身份）
  const importResult = await idbImportAll(legacyBackup)
  // 3) 5 个 export 函数从本地拆出 5 份信封
  const clientId = getClientId()
  const pushedAt = Date.now()
  const [nav, icons, workbench, business, student] = await Promise.all([
    exportNav(),
    exportIcons(),
    exportWorkbench(),
    exportBusiness(),
    exportStudent()
  ])
  // 4) 设置 clientId + pushedAt
  const envelopes: Array<{ name: string; data: unknown }> = [
    { name: 'nav.json', data: { ...(nav as unknown as Record<string, unknown>), clientId, pushedAt } },
    { name: 'icons.json', data: { ...(icons as unknown as Record<string, unknown>), clientId, pushedAt } },
    { name: 'workbench.json', data: { ...(workbench as unknown as Record<string, unknown>), clientId, pushedAt } },
    { name: 'business.json', data: { ...(business as unknown as Record<string, unknown>), clientId, pushedAt } },
    { name: 'student.json', data: { ...(student as unknown as Record<string, unknown>), clientId, pushedAt } }
  ]
  // 5) PUT 5 份到 cloud（任一失败标记 error 不中断后续）
  let pushError: string | null = null
  for (const env of envelopes) {
    try {
      await webdavPut(`${dir}/${env.name}`, username, password, JSON.stringify(env.data))
    } catch (e) {
      if (!pushError) pushError = e instanceof Error ? e.message : '推送失败'
    }
  }
  // 6) DELETE backup.json（即使 5 份中有失败，仍尝试删除 legacy 文件，避免下次再次走迁移）
  try {
    await webdavDelete(`${dir}/${LEGACY_BACKUP_FILE}`, username, password)
  } catch {
    // 删除失败不阻塞：下次 pullNow 会检测到 5 份已存在，跳过迁移分支
  }
  // 7) 更新 lastSyncAt + clearDirty + reload
  localStorage.setItem(LAST_SYNC_KEY, String(pushedAt))
  lastSyncAt.value = pushedAt
  clearDirty()
  status.value = pushError ? 'error' : 'idle'
  if (pushError) {
    errorMessage.value = pushError
    if (!silent) useToast().error(`云同步首次迁移部分失败：${pushError}`)
  } else {
    errorMessage.value = ''
    const identityChanged = importResult.adoptedPasswordIdentity
      && (legacyBackup.passwordsSalt !== localSaltBefore || legacyBackup.passwordVerification !== localVerificationBefore)
    if (identityChanged) {
      useToast().success('云同步首次迁移完成，密码面板已锁定，请输入来源设备主密码解锁')
    } else if (!silent) {
      useToast().success('云同步首次迁移完成')
    }
  }
  await reloadAllStores()
  // clearDirty 必须在 reloadAllStores 之后：部分 store 的 load 方法会触发 save
  clearDirty()
}

// ========== 核心同步流程 ==========

/**
 * 推送本地到云端：串行 5 export → 5 PUT，任一失败标记 error 不中断后续。
 * silent=true 用于后台自动同步：不弹任何 toast。
 */
async function pushNow(silent = false): Promise<boolean> {
  const settings = useAppSettingsStore()
  if (!settings.cloudSyncEnabled || !settings.cloudSyncUrl || !settings.cloudSyncUsername || !settings.cloudSyncPassword) {
    return false
  }
  status.value = 'pushing'
  errorMessage.value = ''
  const dir = dirUrl(settings.cloudSyncUrl!)
  const username = settings.cloudSyncUsername!
  const password = settings.cloudSyncPassword!
  try {
    // 确保 easy-web-tab 目录存在（MKCOL 失败不中断，PUT 会再次抛错）
    try {
      await webdavMkcol(dir, username, password)
    } catch {
      // 目录已存在或 MKCOL 失败，后续 PUT 直接尝试
    }
    // 串行 export → PUT 5 份；任一失败累积到 errors 但不中断后续
    const clientId = getClientId()
    const pushedAt = Date.now()
    let hasError = false
    let firstError = ''
    for (const cfg of FILE_CONFIGS) {
      try {
        const local = await cfg.exportLocal()
        const envelope = { ...(local as Record<string, unknown>), clientId, pushedAt }
        await webdavPut(`${dir}/${cfg.name}`, username, password, JSON.stringify(envelope))
      } catch (e) {
        hasError = true
        if (!firstError) firstError = e instanceof Error ? e.message : `${cfg.name} 推送失败`
      }
    }
    if (hasError) {
      status.value = 'error'
      errorMessage.value = firstError
      if (!silent) useToast().error(`云同步推送部分失败：${firstError}`)
      return false
    }
    localStorage.setItem(LAST_SYNC_KEY, String(pushedAt))
    lastSyncAt.value = pushedAt
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

/**
 * 应用远端到本地（workbench 文件额外检测密码身份变更）。
 * 注意：此函数仅写本地（IDB/localStorage），不 reload Vue stores —— reload 由调用方在所有文件处理完后统一执行。
 */
async function applyFileRemote(cfg: FileConfig, remote: unknown): Promise<{ identityChanged: boolean }> {
  let identityChanged = false
  if (cfg.name === 'workbench.json') {
    const localSaltBefore = getStoredSaltHex()
    const localVerificationBefore = getStoredVerification()
    const result = await cfg.importRemote(remote) as { adoptedPasswordIdentity?: boolean } | undefined
    const remoteData = remote as WorkbenchSyncData
    identityChanged = !!result?.adoptedPasswordIdentity
      && (remoteData.passwordsSalt !== localSaltBefore || remoteData.passwordVerification !== localVerificationBefore)
  } else {
    await cfg.importRemote(remote)
  }
  return { identityChanged }
}

/**
 * 拉取云端并落地本地。
 *
 * silent=true 用于后台自动同步（定时轮询 / 页面重新可见）：全程不弹 toast。
 * 失败也不会被吞掉——status 置为 'error'、errorMessage 落值、同步按钮会变红并显示
 * 「同步失败」，用户点「立即同步」即可看到具体错误提示。
 */
async function pullNow(silent = false): Promise<void> {
  const settings = useAppSettingsStore()
  if (!settings.cloudSyncEnabled || !settings.cloudSyncUrl || !settings.cloudSyncUsername || !settings.cloudSyncPassword) {
    return
  }
  status.value = 'pulling'
  errorMessage.value = ''
  const dir = dirUrl(settings.cloudSyncUrl!)
  const username = settings.cloudSyncUsername!
  const password = settings.cloudSyncPassword!
  try {
    // ===== 1) 串行 GET 5 份文件，记录 data + lastModifiedMs =====
    const remoteResults: Record<string, { data: unknown; lastModifiedMs: number }> = {}
    let allMissing = true
    for (const cfg of FILE_CONFIGS) {
      const result = await webdavGet(`${dir}/${cfg.name}`, username, password)
      if (result.data) {
        allMissing = false
        remoteResults[cfg.name] = { data: result.data, lastModifiedMs: result.lastModifiedMs }
      }
    }

    // ===== 2) 首次迁移检测：5 份全 404 但 backup.json 存在 =====
    if (allMissing) {
      let legacyBackup: WorkbenchData | null = null
      try {
        const legacyResult = await webdavGet(`${dir}/${LEGACY_BACKUP_FILE}`, username, password)
        legacyBackup = (legacyResult.data ?? null) as WorkbenchData | null
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (!msg.includes('404')) throw e
      }
      if (legacyBackup) {
        await migrateFromLegacyBackup(legacyBackup, dir, username, password, silent)
        return
      }
      // 无任何云端数据 → 若本地 dirty 则推送
      status.value = 'idle'
      if (isDirty()) await pushNow(silent)
      return
    }

    // ===== 3) 逐文件处理：contentSame / dirty / conflict 判定 =====
    const dirty = isDirty()
    const localTs = Number(localStorage.getItem(LAST_SYNC_KEY) || '0')
    let hasConflict = false
    let appliedAny = false
    let workbenchIdentityChanged = false

    for (const cfg of FILE_CONFIGS) {
      const remoteInfo = remoteResults[cfg.name]
      if (!remoteInfo) continue  // 此文件远端不存在 → 跳过
      const remote = remoteInfo.data

      // 内容 hash：剔除元数据后 stableStringify → sha1 比较
      const remoteSig = cfg.signature(remote)
      const localExport = await cfg.exportLocal()
      const localSig = cfg.signature(localExport)
      const remoteHash = await sha1Hash(remoteSig)
      const localHash = await sha1Hash(localSig)
      if (remoteHash === localHash) continue  // 内容一致 → noop

      // remoteTs：信封内嵌 pushedAt 与 Last-Modified 取较大值
      const remoteTs = Math.max(
        (remote as { pushedAt?: number }).pushedAt ?? 0,
        remoteInfo.lastModifiedMs
      )

      if (dirty && (remoteTs > localTs || remoteTs <= localTs)) {
        // 本地 dirty 且内容不同 → 计算差异量
        const diff = cfg.diffSize(localExport, remote)
        if (diff < MODULE_DIFF_THRESHOLD) {
          // 微小差异 → 静默合并
          const merged = cfg.merge(localExport, remote)
          await cfg.importRemote(merged)
          appliedAny = true
        } else {
          // 差异较大 → 冲突
          if (!conflictData.value) conflictData.value = {}
          conflictData.value[cfg.name] = { local: localExport, remote }
          hasConflict = true
        }
      } else if (!dirty) {
        // 本地无变更 → 直接拉取覆盖本地
        const result = await applyFileRemote(cfg, remote)
        if (result.identityChanged) workbenchIdentityChanged = true
        appliedAny = true
      }
    }

    // ===== 4) 处理完毕：reload / clearDirty / 状态 =====
    if (hasConflict) {
      status.value = 'conflict'
      useToast().warning('云同步检测到冲突，请选择解决方式')
      // 即使有冲突，对已应用的无冲突文件仍需 reload（让 Vue 状态刷新）
      if (appliedAny) {
        await reloadAllStores()
      }
      return
    }

    if (appliedAny) {
      // 更新 lastSyncAt（取所有 remoteTs 最大值）
      let maxTs = localTs
      for (const cfg of FILE_CONFIGS) {
        const info = remoteResults[cfg.name]
        if (!info) continue
        const ts = Math.max((info.data as { pushedAt?: number }).pushedAt ?? 0, info.lastModifiedMs)
        if (ts > maxTs) maxTs = ts
      }
      localStorage.setItem(LAST_SYNC_KEY, String(maxTs))
      lastSyncAt.value = maxTs
      await reloadAllStores()
      // clearDirty 必须在 reloadAllStores 之后：reload 中的 save 会 markDirty
      clearDirty()
      if (workbenchIdentityChanged) {
        useToast().success('云同步完成，密码面板已锁定，请输入来源设备主密码解锁')
      } else if (!silent) {
        useToast().success('云同步完成')
      }
    }
    status.value = 'idle'
  } catch (e) {
    status.value = 'error'
    errorMessage.value = e instanceof Error ? e.message : '拉取失败'
    if (silent) {
      console.error('[CloudSync] 后台拉取失败：', errorMessage.value)
    } else {
      useToast().error(`云同步拉取失败：${errorMessage.value}`)
    }
  }
}

/**
 * 解决冲突：3 选 1（全部云端覆盖 / 全部本地覆盖 / 全部合并）。
 * conflictData 形状：Record<fileName, {local, remote}>，决策对全部冲突文件统一生效。
 */
export async function resolveConflict(decision: 'remote' | 'local' | 'cancel' | 'merge'): Promise<void> {
  if (!conflictData.value) return
  const conflicts = conflictData.value

  if (decision === 'remote') {
    // 全部取云端：逐文件 apply remote
    conflictData.value = null
    status.value = 'pulling'
    let workbenchIdentityChanged = false
    try {
      for (const cfg of FILE_CONFIGS) {
        const entry = conflicts[cfg.name]
        if (!entry) continue
        const result = await applyFileRemote(cfg, entry.remote)
        if (result.identityChanged) workbenchIdentityChanged = true
      }
      const now = Date.now()
      localStorage.setItem(LAST_SYNC_KEY, String(now))
      lastSyncAt.value = now
      await reloadAllStores()
      clearDirty()
      status.value = 'idle'
      if (workbenchIdentityChanged) {
        useToast().success('云同步完成（云端覆盖本地），密码面板已锁定，请输入来源设备主密码解锁')
      } else {
        useToast().success('云同步完成（云端覆盖本地）')
      }
    } catch (e) {
      status.value = 'error'
      errorMessage.value = e instanceof Error ? e.message : '应用云端失败'
      useToast().error(`云同步解决冲突失败：${errorMessage.value}`)
    }
    return
  }

  if (decision === 'local') {
    // 全部推送本地
    conflictData.value = null
    await pushNow()
    return
  }

  if (decision === 'merge') {
    // 全部走各自 merge 函数：apply merged → push merged
    conflictData.value = null
    status.value = 'pushing'
    try {
      // 1) 计算并应用 merged 到本地（写本地）
      for (const cfg of FILE_CONFIGS) {
        const entry = conflicts[cfg.name]
        if (!entry) continue
        const merged = cfg.merge(entry.local, entry.remote)
        await cfg.importRemote(merged)
      }
      // 2) reload stores（让 Vue 刷新到 merged 数据）
      await reloadAllStores()
      // 3) 推送 merged 到云端（静默 push，最后统一 toast）
      const pushOk = await pushNow(true)
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

  // cancel：保留本地，但更新 lastSyncAt 避免重复弹框
  // 取所有 remote.pushedAt 最大值（或 Date.now() 兜底）
  let maxTs = Date.now()
  for (const cfg of FILE_CONFIGS) {
    const entry = conflicts[cfg.name]
    if (!entry) continue
    const ts = (entry.remote as { pushedAt?: number }).pushedAt ?? 0
    if (ts > maxTs) maxTs = ts
  }
  localStorage.setItem(LAST_SYNC_KEY, String(maxTs))
  lastSyncAt.value = maxTs
  clearDirty()
  conflictData.value = null
  status.value = 'idle'
  useToast().info('已取消同步冲突')
}

/**
 * 立即同步入口：按状态决定先拉还是先推。
 *
 * silent=true 供后台自动同步（定时轮询）使用：不弹任何 toast。
 * 用户点击「立即同步」的三个入口（HomeView / WorkbenchView / BusinessView）走默认 false，
 * 保留成功/失败反馈——主动操作需要明确结果。
 */
export async function syncNow(silent = false): Promise<void> {
  const settings = useAppSettingsStore()
  if (!settings.cloudSyncEnabled || !settings.cloudSyncUrl) {
    if (!silent) useToast().error('请先在设置中启用并配置云同步')
    return
  }
  if (isDirty()) {
    // 本地有变更 → 先拉（避免盲推覆盖），拉取流程会在 !dirty 分支触发推送
    await pullNow(silent)
    // 如果拉取后仍 dirty 且没冲突 → 补推一次
    if (isDirty() && status.value === 'idle') await pushNow(silent)
  } else {
    await pullNow(silent)
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
      // 后台轮询：静默（不弹 toast），状态通过同步按钮的颜色/文案反馈
      void syncNow(true)
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
  setInterval(() => {
    try { startInterval() } catch { /* ignore */ }
  }, 60 * 1000).unref?.()

  document.addEventListener('visibilitychange', () => {
    if (status.value !== 'idle' && status.value !== 'error') return
    if (document.visibilityState === 'visible') {
      // 页面重新可见 → 拉取远程更新（技能改文件/其他设备推送都会被检测到）
      // 静默执行：切回标签页就弹「云同步完成」会严重打扰使用
      // 设置栅栏 Promise 供其他模块（倒计时提醒）await 后再 tick
      pendingPull = pullNow(true).finally(() => { pendingPull = null })
    }
    // hidden 时不自动推送（避免盲推覆盖技能修改的远程文件）
    // 推送统一由定时轮询 + 手动「立即同步」触发，都会先 pullNow 检测冲突
  })

  window.addEventListener('beforeunload', () => {
    // beforeunload 中 fetch 可能被中断（尤其是异步）；仅在 visibilitychange hidden 已兜底
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
