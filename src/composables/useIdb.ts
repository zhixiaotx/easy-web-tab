/**
 * 零依赖 IndexedDB 封装（工作台数据层）
 * DB: easy-web-tab v2；6 个 object store 均无 keyPath，统一使用 out-of-line 键 'items'
 * 所有请求失败均 reject，由调用方自行 try/catch 降级（不做 localStorage 回退写）
 */
import { WORKBENCH_DATA_VERSION, emptyAppSettingsData } from '../types'
import type { Countdown, HealthData, LedgerData, NoteData, WorkbenchData, WorkbenchTodo } from '../types'
import { emptyHealthData } from './healthCore'
import { emptyLedgerData } from './ledgerCore'
import { emptyNoteData, normalizeNoteData } from './noteCore'

export const DB_NAME = 'easy-web-tab'
export const DB_VERSION = 2
export const IDB_STORES = ['todos', 'notes', 'countdowns', 'passwords', 'health', 'ledger'] as const
export const IDB_KEY = 'items'

export type IdbStore = (typeof IDB_STORES)[number]

let dbPromise: Promise<IDBDatabase> | undefined

export function openIdb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        for (const name of IDB_STORES) {
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
      request.onerror = () => reject(request.error)
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

export async function idbExportAll(): Promise<WorkbenchData> {
  const [todos, notes, countdowns, passwords, health, ledger] = await Promise.all([
    idbGet<WorkbenchTodo[]>('todos'),
    idbGet<NoteData>('notes'),
    idbGet<Countdown[]>('countdowns'),
    idbGet<string>('passwords'),
    idbGet<HealthData>('health'),
    idbGet<LedgerData>('ledger')
  ])
  return {
    version: WORKBENCH_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    todos: todos ?? [],
    notes: notes ?? emptyNoteData(),
    countdowns: countdowns ?? [],
    passwords: passwords ?? '',
    health: health ?? emptyHealthData(),
    ledger: ledger ?? emptyLedgerData(),
    settings: emptyAppSettingsData()
  }
}

export async function idbImportAll(data: WorkbenchData): Promise<void> {
  if (data.version !== 1 && data.version !== 2 && data.version !== 3) {
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
  // 循环直接写归一后的 NoteData，保证 v1/v2/v3 全部入口得到幂等的 v3 结构
  data = { ...data, notes: normalizeNoteData(data.notes) }
  const db = await openIdb()
  const tx = db.transaction([...IDB_STORES], 'readwrite')
  for (const name of IDB_STORES) {
    const store = tx.objectStore(name)
    store.clear()
    store.put(data[name], IDB_KEY)
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}
