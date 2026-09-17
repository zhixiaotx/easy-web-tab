/**
 * 零依赖 IndexedDB 封装（工作台数据层）
 * DB: easy-web-tab v7；object store 均无 keyPath，统一使用 out-of-line 键 'items'
 * 核心 9 store + 辅助 pomodoro/habits 参与 JSON 备份导出/导入（备份格式 v8 起）
 * 学生工作台 store 独立信封（v7 新增 student_settings；M2-M4 续添 student_* 模块 store）
 * snapshots 仅本地使用，不参与备份导出/导入
 * 所有请求失败均 reject，由调用方自行 try/catch 降级（不做 localStorage 回退写）
 */
import { WORKBENCH_DATA_VERSION, emptyAppSettingsData } from '../types'
import type { AppSettingsData, AppSettingsDataNoCloudSync, BusinessData, BusinessSyncData, Countdown, DiaryData, GenealogyData, HealthData, IconsSyncData, LedgerData, NavSyncData, NoteData, StudentSyncData, WorkbenchData, WorkbenchSyncData, WorkbenchTodo } from '../types'
import { adoptPasswordIdentity, getStoredSaltHex, getStoredVerification } from './useCrypto'
import { emptyBusinessData } from './businessCore.ts'
import { emptyDiaryData } from './diaryCore'
import { emptyGenealogyData } from './genealogyCore'
import { emptyHabitsData } from './habitCore'
import { emptyHealthData } from './healthCore'
import { emptyLedgerData } from './ledgerCore'
import { emptyNoteData, normalizeNoteData } from './noteCore'
import { emptyPomodoroData } from './pomodoroCore'

export const DB_NAME = 'easy-web-tab'
export const DB_VERSION = 15
/** 核心 9 store：随 JSON 备份导出/导入（v6 新增 business；v15 新增 family 家谱） */
export const IDB_CORE_STORES = ['todos', 'notes', 'diary', 'countdowns', 'passwords', 'health', 'ledger', 'settings', 'business', 'family'] as const
/** 辅助 store：pomodoro/habits 随 v5 备份导出/导入；snapshots 仅本地使用，不参与备份 */
export const IDB_AUX_STORES = ['pomodoro', 'habits', 'snapshots'] as const
/** 自定义图标 store（v11 新增：原 localStorage 容量仅 ~5MB 易抛 QuotaExceededError，迁移至 IDB 获 50MB+ 容量） */
export const IDB_ICONS_STORES = ['icons'] as const
/** 学生工作台 store（独立信封 student-backup，不参与 WorkbenchData 导出/导入）
 *  v8 新增 13 个学生模块 store：4 共享副本 + 8 独立模块 + 1 图片 Blob store
 *  v9 新增 1 个：student_parent_tasks（家长每日任务）
 *  v12 新增 1 个：student_education（教育经历）
 *  v13 新增 1 个：student_health（学生健康管理，复刻成人 health 并含 height 成长记录） */
export const IDB_STUDENT_STORES = [
  'student_settings',
  // 4 共享副本（复用 core 纯函数，严格隔离）
  'student_habits', 'student_pomodoro', 'student_diary', 'student_countdowns',
  // 11 独立模块 store（v9 +student_parent_tasks, v12 +student_education, v13 +student_health）
  'student_homework', 'student_timetable', 'student_plans', 'student_review',
  'student_mistakes', 'student_reading', 'student_achievements', 'student_rewards',
  'student_parent_tasks', 'student_education', 'student_health', 'student_grades',
  // 图片 Blob 独立 store（错题本拍照，导出时 base64 编码）
  'student_images'
] as const
export const IDB_KEY = 'items'

export type IdbStore =
  | (typeof IDB_CORE_STORES)[number]
  | (typeof IDB_AUX_STORES)[number]
  | (typeof IDB_ICONS_STORES)[number]
  | (typeof IDB_STUDENT_STORES)[number]

let dbPromise: Promise<IDBDatabase> | undefined

export function openIdb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        // 幂等 contains 守卫：旧库升级到新版本时自动补建缺失 store（v5 新增 diary / v11 新增 icons），不清空旧数据
        for (const name of [...IDB_CORE_STORES, ...IDB_AUX_STORES, ...IDB_ICONS_STORES, ...IDB_STUDENT_STORES]) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name) // 无 keyPath → out-of-line 键 'items'
          }
        }
      }
      request.onsuccess = () => {
        const db = request.result
        // 另一标签页触发 versionchange（新代码升级 DB）时：关掉旧连接并清缓存，
        // 下次 open 重建连接，避免旧连接阻塞升级
        db.onversionchange = () => {
          db.close()
          dbPromise = undefined
        }
        resolve(db)
      }
      request.onerror = () => {
        // 清除缓存的 rejected promise，下次调用可重试（否则永远返回同一个拒绝态）
        dbPromise = undefined
        reject(request.error)
      }
      request.onblocked = () => {
        // 被其它标签页的旧连接阻塞时：清除缓存并拒绝，用户关闭冲突标签页后可重试
        dbPromise = undefined
        reject(new Error('IDB 升级被阻塞，请关闭其它标签页后重试'))
      }
    })
  }
  return dbPromise
}

function requestToPromise<T>(request: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
  })
}

export function idbGet<T>(store: IdbStore): Promise<T | undefined> {
  return openIdb().then((db) => {
    const tx = db.transaction(store, 'readonly')
    return requestToPromise<T | undefined>(tx.objectStore(store).get(IDB_KEY))
  })
}

export function idbPut(store: IdbStore, value: unknown): Promise<void> {
  return openIdb().then((db) => {
    const tx = db.transaction(store, 'readwrite')
    const request = tx.objectStore(store).put(value, IDB_KEY)
    return requestToPromise<void>(request)
  })
}

export function idbClear(store: IdbStore): Promise<void> {
  return openIdb().then((db) => {
    const tx = db.transaction(store, 'readwrite')
    const request = tx.objectStore(store).clear()
    return requestToPromise<void>(request)
  })
}

/** 云同步 prefs 白名单（仅这些 localStorage key 打包到 v9 信封，不含图标、不含加密身份键） */
export const WORKBENCH_PREFS_KEYS = [
  'user-sites',
  'user-categories',
  'user-deleted-legacy-ids',
  'user-search-engines',
  'built-in-engine-overrides',
  'built-in-engine-default',
  'user-theme',
  'user-background',
  'site-title',
  'site-favicon',
  'user-countdown-categories',
  'user-countdown-tab-categories',
  'user-countdown-sort',
  'user-todo-categories',
  'user-todo-tab-categories'
] as const

/** 打包 localStorage 偏好为 Record<string, string>；idbExportAll 直接调用 */
export function packPrefsFromLocalStorage(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of WORKBENCH_PREFS_KEYS) {
    const v = localStorage.getItem(k)
    if (v !== null) out[k] = v
  }
  return out
}

/** 从 WorkbenchData.prefs 回写 localStorage；idbImportAll 事务成功后调用 */
export function applyPrefsToLocalStorage(prefs: Record<string, string> | undefined): void {
  if (!prefs) return
  for (const k of WORKBENCH_PREFS_KEYS) {
    const v = prefs[k]
    if (v !== undefined) {
      localStorage.setItem(k, v)
    } else {
      localStorage.removeItem(k)
    }
  }
}

export async function idbExportAll(): Promise<WorkbenchData> {
  const [todos, notes, diary, countdowns, passwords, health, ledger, settings, pomodoro, habits, business, family] = await Promise.all([
    idbGet<WorkbenchTodo[]>('todos'),
    idbGet<NoteData>('notes'),
    idbGet<DiaryData>('diary'),
    idbGet<Countdown[]>('countdowns'),
    idbGet<string>('passwords'),
    idbGet<HealthData>('health'),
    idbGet<LedgerData>('ledger'),
    idbGet<AppSettingsData>('settings'),
    idbGet('pomodoro'),
    idbGet('habits'),
    idbGet<BusinessData>('business'),
    idbGet<GenealogyData>('family')
  ])
  return {
    version: WORKBENCH_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    todos: todos ?? [],
    notes: notes ?? emptyNoteData(),
    diary: diary ?? emptyDiaryData(),
    countdowns: countdowns ?? [],
    passwords: passwords ?? '',
    health: health ?? emptyHealthData(),
    ledger: ledger ?? emptyLedgerData(),
    settings: settings ?? emptyAppSettingsData(),
    pomodoro: pomodoro ?? emptyPomodoroData(),
    habits: habits ?? emptyHabitsData(),
    business: business ?? emptyBusinessData(),
    family: family ?? emptyGenealogyData(),
    passwordsSalt: getStoredSaltHex() ?? undefined,
    passwordVerification: getStoredVerification() ?? undefined,
    prefs: packPrefsFromLocalStorage()
  }
}

export async function idbImportAll(data: WorkbenchData): Promise<{ adoptedPasswordIdentity: boolean; appliedPrefs: boolean }> {
  // 版本白名单：接受 v1-v9（v1-v7 旧备份兼容导入，不拒绝——AGENTS.md 硬性规范）；
  // 拒绝 v0 与未来 v10+（范围守卫保留 number 类型，下方 v1 分支可正常判定）
  if (data.version < 1 || data.version > 9) {
    throw new Error('备份文件版本不兼容')
  }
  // notes 兼容旧数组（v1/v2 纯便签列表）与新对象（v3 NoteData）两种格式
  const notesValid =
    Array.isArray(data.notes) ||
    (typeof data.notes === 'object' && data.notes !== null && 'categories' in data.notes && 'notes' in data.notes)
  if (
    !Array.isArray(data.todos) ||
    !notesValid ||
    !Array.isArray(data.countdowns) ||
    typeof data.passwords !== 'string'
  ) {
    throw new Error('备份文件格式无效')
  }
  // v1 备份缺 health/ledger 字段 → empty 兜底，归一后统一按 v2 结构逐 store 写入
  if (data.version === 1) {
    data = {
      ...data,
      version: 2,
      health: data.health ?? emptyHealthData(),
      ledger: data.ledger ?? emptyLedgerData()
    }
  }
  // 迁移：notes 在写入循环前统一归一化包装（数组 → { categories: [], notes: [...] }；对象 → 原样归一），
  // 循环直接写归一后的 NoteData，保证 v1/v2/v3/v4 全部入口得到幂等的 v3 结构
  data = { ...data, notes: normalizeNoteData(data.notes) }
  // settings 兼容 v1/v2/v3 备份（运行时无 settings 字段 → empty 兜底）；v4 备份原样透传
  data = { ...data, settings: data.settings ?? emptyAppSettingsData() }
  // pomodoro/habits 兼容 v1-v4 备份（无该字段 → empty 兜底）；v5 备份原样透传。
  // 兜底放在写入循环之前 → 键存在性守卫（下方）对 pomodoro/habits 恒有键可写；
  // snapshots 永不进备份，缺键 → 循环跳过，绝不 put undefined
  data = {
    ...data,
    pomodoro: data.pomodoro ?? emptyPomodoroData(),
    habits: data.habits ?? emptyHabitsData()
  }
  // diary 兼容 v1-v5 备份（无该字段 → empty 兜底）；v6 备份原样透传。
  // 兜底同样放在写入循环之前 → 键存在性守卫对 diary 恒有键可写（v1-v5 导入后日记为空）
  data = { ...data, diary: data.diary ?? emptyDiaryData() }
  // business 兼容 v1-v7 备份（无该字段 → empty 兜底）；v8 备份原样透传（含内置种子分类契约）
  data = { ...data, business: data.business ?? emptyBusinessData() }
  // family 兼容 v1-v14 备份（无该字段 → empty 兜底）；v15 起原样透传
  data = { ...data, family: data.family ?? emptyGenealogyData() }
  // prefs 兼容 v1-v8 备份（无该字段 → {} 空对象兜底，导入后不回写任何 localStorage）
  data = { ...data, prefs: (typeof data.prefs === 'object' && data.prefs !== null) ? data.prefs : {} }
  // 密码加密身份归一化（v8）：仅当备份携带完整身份（盐+验证串均为非空字符串）且密码库非空时才采纳；
  // 字段存在但畸形 → 视同缺失（向后兼容，不硬失败）。身份与密文绑定，二者必须成套迁移。
  const backupSalt = typeof data.passwordsSalt === 'string' && data.passwordsSalt ? data.passwordsSalt : undefined
  const backupVerification =
    typeof data.passwordVerification === 'string' && data.passwordVerification ? data.passwordVerification : undefined
  const adoptedPasswordIdentity = !!(backupSalt && backupVerification && data.passwords)
  const db = await openIdb()
  // 事务范围覆盖核心+辅助全部 store（循环只写 data 中存在的键，
  // v1-v5 备份缺 snapshots 字段 → 跳过写入，绝不 put undefined 进新 store）
  // data 是解析后的备份 JSON：按任意 store 名动态取键需边界断言（WorkbenchData 无索引签名）
  const backupFields = data as unknown as Record<string, unknown>
  const tx = db.transaction([...IDB_CORE_STORES, ...IDB_AUX_STORES], 'readwrite')
  for (const name of [...IDB_CORE_STORES, ...IDB_AUX_STORES]) {
    // 键存在性守卫：v1-v5 备份缺 snapshots 字段 → 跳过，绝不 put undefined
    if (!(name in backupFields)) continue
    const store = tx.objectStore(name)
    store.clear()
    store.put(backupFields[name], IDB_KEY)
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
  // 接管加密身份必须在 IDB 事务成功之后：事务失败不应污染本机加密身份
  if (adoptedPasswordIdentity && backupSalt && backupVerification) {
    adoptPasswordIdentity(backupSalt, backupVerification)
  }
  // v9 prefs 回写 localStorage（事务成功后再回写，失败不影响 localStorage）
  const hasPrefs = typeof data.prefs === 'object' && data.prefs !== null && Object.keys(data.prefs).length > 0
  if (hasPrefs) applyPrefsToLocalStorage(data.prefs)
  return { adoptedPasswordIdentity, appliedPrefs: hasPrefs }
}

// ==================== 云同步多文件信封（v10 拆分）====================
// 5 份独立信封：nav.json / icons.json / workbench.json / business.json / student.json
// workbench 不含 business（独立走 business.json）；settings 不含 cloudSync* 5 字段（保留本地凭证）
// 自定义图标 v11 起从 localStorage 迁移至 IDB icons store（localStorage ~5MB 容量瓶颈）

/** 自定义图标 localStorage 键（与 stores/icons.ts STORAGE_KEY 保持一致） */
export const ICONS_STORAGE_KEY = 'user-custom-icons'

/** settings 中需本机保留、不随 workbench.json 同步的 cloudSync 字段（凭证 + 开关） */
const CLOUD_SYNC_SETTING_KEYS = [
  'cloudSyncEnabled',
  'cloudSyncUrl',
  'cloudSyncUsername',
  'cloudSyncPassword'
] as const

/** 从 AppSettingsData 中剥离 cloudSync 凭证/开关 4 字段，返回 WorkbenchSyncData.settings 形状。
 *  注意：cloudSyncInterval 与 cloudSyncSilentThreshold 作为同步偏好，随 workbench.json 跨设备同步，不在此剔除。 */
function stripCloudSyncSettings(settings: AppSettingsData): AppSettingsDataNoCloudSync {
  const out: Record<string, unknown> = { ...settings }
  for (const k of CLOUD_SYNC_SETTING_KEYS) delete out[k]
  return out as unknown as AppSettingsDataNoCloudSync
}

/** 读取本地 settings 中的 cloudSync 凭证/开关 4 字段（用于 importWorkbenchData 合并回 remote.settings，保留本机凭证） */
function pickLocalCloudSyncSettings(local: AppSettingsData | undefined): Partial<AppSettingsData> {
  if (!local) return {}
  const picked: Record<string, unknown> = {}
  for (const k of CLOUD_SYNC_SETTING_KEYS) {
    picked[k] = local[k as keyof AppSettingsData]
  }
  return picked as Partial<AppSettingsData>
}

// ---------- nav.json（localStorage 偏好打包） ----------

export function exportNav(): NavSyncData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    prefs: packPrefsFromLocalStorage()
  }
}

export function importNavData(remote: NavSyncData): void {
  applyPrefsToLocalStorage(remote?.prefs)
}

// ---------- icons.json（v11 起存 IDB 'icons' object store，值为 CustomIcon[] 数组；首次从 localStorage 迁移） ----------

export async function exportIcons(): Promise<IconsSyncData> {
  let icons: IconsSyncData['icons'] = []
  try {
    const raw = await idbGet<IconsSyncData['icons']>('icons')
    icons = Array.isArray(raw) ? raw : []
  } catch {
    // IDB 不可用时兜底：尝试读取 localStorage 旧键（可能尚未迁移）
    try {
      const legacy = localStorage.getItem(ICONS_STORAGE_KEY)
      icons = legacy ? (JSON.parse(legacy) as IconsSyncData['icons']) : []
    } catch { icons = [] }
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    icons
  }
}

export async function importIconsData(remote: IconsSyncData): Promise<void> {
  if (!remote || !Array.isArray(remote.icons)) return
  await idbPut('icons', remote.icons)
  // 同步写一份到 localStorage 作为过渡冗余（迁移期双写；IDB 为主），便于旧版回退时不至于丢数据
  try {
    localStorage.setItem(ICONS_STORAGE_KEY, JSON.stringify(remote.icons))
  } catch {
    // localStorage 可能超配额；IDB 已写成功即可，忽略此处异常
  }
}

/** 供 icons store 一次性迁移用：若 localStorage 有旧数据且 IDB 为空 → 搬入 IDB 并删除旧 localStorage 键 */
export async function migrateIconsFromLocalStorageIfNeeded(): Promise<{ migrated: boolean; count: number }> {
  const legacyRaw = localStorage.getItem(ICONS_STORAGE_KEY)
  let legacyList: IconsSyncData['icons'] = []
  if (legacyRaw) {
    try {
      const parsed = JSON.parse(legacyRaw)
      legacyList = Array.isArray(parsed) ? parsed : []
    } catch { legacyList = [] }
  }
  const idbRaw = await idbGet<IconsSyncData['icons']>('icons').catch(() => undefined)
  const idbEmpty = !Array.isArray(idbRaw) || idbRaw.length === 0
  // 仅当 IDB 空且 localStorage 有数据时迁移；否则认为已迁移完成或 IDB 数据为新
  if (idbEmpty && legacyList.length > 0) {
    await idbPut('icons', legacyList)
    // 删除旧键（双写逻辑仅在云同步导入时保留，主动迁移后清理 localStorage 避免重复占用）
    try { localStorage.removeItem(ICONS_STORAGE_KEY) } catch { /* ignore */ }
    return { migrated: true, count: legacyList.length }
  }
  return { migrated: false, count: 0 }
}

// ---------- workbench.json（不含 business；settings 不含 cloudSync*） ----------

export async function exportWorkbench(): Promise<WorkbenchSyncData> {
  const full = await idbExportAll()
  return {
    version: 1,
    exportedAt: full.exportedAt,
    clientId: full.clientId,
    pushedAt: full.pushedAt,
    todos: full.todos,
    notes: full.notes,
    diary: full.diary,
    countdowns: full.countdowns,
    passwords: full.passwords,
    health: full.health,
    ledger: full.ledger,
    // 剥离 cloudSync 凭证/开关 4 字段：workbench.json 不携带云同步凭证（仅本地保留，避免覆盖其他设备）；
    // cloudSyncInterval / cloudSyncSilentThreshold 作为同步偏好随 settings 一起同步
    settings: stripCloudSyncSettings(full.settings),
    pomodoro: full.pomodoro,
    habits: full.habits,
    passwordsSalt: full.passwordsSalt,
    passwordVerification: full.passwordVerification,
    prefs: full.prefs,
    family: full.family
    // 注意：business 字段独立走 business.json，不在此输出
  }
}

export async function importWorkbenchData(remote: WorkbenchSyncData): Promise<{ adoptedPasswordIdentity: boolean; appliedPrefs: boolean }> {
  // 1) 读本地 settings（用于把 cloudSync 凭证/开关 4 字段合并回 remote.settings，保留本机凭证）
  // 2) 读本地 business（idbImportAll 会写 business store，workbench.json 不携带 business 时需保留本地数据）
  const [localSettings, localBusiness] = await Promise.all([
    idbGet<AppSettingsData>('settings'),
    idbGet<BusinessData>('business')
  ])

  // 合并：remote.settings（含同步偏好 cloudSyncInterval/cloudSyncSilentThreshold）+ 本机 cloudSync 凭证/开关 4 字段
  const mergedSettings: AppSettingsData = {
    ...(remote.settings ?? emptyAppSettingsData()),
    ...pickLocalCloudSyncSettings(localSettings)
  }

  const workbenchData: WorkbenchData = {
    version: WORKBENCH_DATA_VERSION,
    exportedAt: remote.exportedAt,
    todos: remote.todos ?? [],
    notes: normalizeNoteData(remote.notes ?? emptyNoteData()),
    diary: remote.diary ?? emptyDiaryData(),
    countdowns: remote.countdowns ?? [],
    passwords: remote.passwords ?? '',
    health: remote.health ?? emptyHealthData(),
    ledger: remote.ledger ?? emptyLedgerData(),
    settings: mergedSettings,
    pomodoro: remote.pomodoro ?? emptyPomodoroData(),
    habits: remote.habits ?? emptyHabitsData(),
    // 家谱并入 workbench.json（明文同步，不加密）；缺失 → empty 兜底
    family: remote.family ?? emptyGenealogyData(),
    // 保留本地 business（workbench.json 不携带；idbImportAll 会写入此值，等同 no-op）
    business: localBusiness ?? emptyBusinessData(),
    passwordsSalt: remote.passwordsSalt,
    passwordVerification: remote.passwordVerification,
    prefs: remote.prefs,
    clientId: remote.clientId,
    pushedAt: remote.pushedAt
  }

  return await idbImportAll(workbenchData)
}

// ---------- business.json（销售记账独立信封） ----------

export async function exportBusiness(): Promise<BusinessSyncData> {
  const business = await idbGet<BusinessData>('business')
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    business: business ?? emptyBusinessData()
  }
}

export async function importBusinessData(remote: BusinessSyncData): Promise<void> {
  const data = remote?.business ?? emptyBusinessData()
  await idbPut('business', data)
}

// ---------- student.json（学生工作台 15 store 单事务写入） ----------

/** student store 名 → StudentSyncData 字段名映射 */
const STUDENT_STORE_TO_FIELD: Record<string, keyof StudentSyncData> = {
  student_settings: 'studentSettings',
  student_habits: 'studentHabits',
  student_pomodoro: 'studentPomodoro',
  student_diary: 'studentDiary',
  student_countdowns: 'studentCountdowns',
  student_homework: 'homework',
  student_timetable: 'timetable',
  student_plans: 'plans',
  student_review: 'review',
  student_mistakes: 'mistakes',
  student_reading: 'reading',
  student_achievements: 'achievements',
  student_rewards: 'rewards',
  student_parent_tasks: 'parentTasks',
  student_education: 'education',
  student_health: 'health',
  student_images: 'studentImages'
}

export async function exportStudent(): Promise<StudentSyncData> {
  const [
    studentSettings, studentHabits, studentPomodoro, studentDiary, studentCountdowns,
    homework, timetable, plans, review, mistakes, reading,
    achievements, rewards, parentTasks, education, health, studentImages, studentGrades
  ] = await Promise.all([
    idbGet('student_settings'),
    idbGet('student_habits'),
    idbGet('student_pomodoro'),
    idbGet('student_diary'),
    idbGet('student_countdowns'),
    idbGet('student_homework'),
    idbGet('student_timetable'),
    idbGet('student_plans'),
    idbGet('student_review'),
    idbGet('student_mistakes'),
    idbGet('student_reading'),
    idbGet('student_achievements'),
    idbGet('student_rewards'),
    idbGet('student_parent_tasks'),
    idbGet('student_education'),
    idbGet('student_health'),
    idbGet('student_grades'),
    idbGet('student_images')
  ])
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    studentSettings,
    studentHabits,
    studentPomodoro,
    studentDiary,
    studentCountdowns,
    homework,
    timetable,
    plans,
    review,
    mistakes,
    reading,
    achievements,
    rewards,
    parentTasks,
    education,
    health,
    studentImages,
    studentGrades
  }
}

export async function importStudentData(remote: StudentSyncData): Promise<void> {
  if (!remote) return
  const db = await openIdb()
  const remoteFields = remote as unknown as Record<string, unknown>
  // 单事务覆盖 15 个学生 store：仅写 remote 中存在的字段，缺失字段不写入（不 put undefined）
  const tx = db.transaction([...IDB_STUDENT_STORES], 'readwrite')
  for (const storeName of [...IDB_STUDENT_STORES]) {
    const fieldName = STUDENT_STORE_TO_FIELD[storeName]
    if (!fieldName) continue
    if (!(fieldName in remoteFields)) continue
    const store = tx.objectStore(storeName)
    store.clear()
    store.put(remoteFields[fieldName], IDB_KEY)
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}
