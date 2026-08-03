/**
 * 零依赖 IndexedDB 封装（工作台数据层）
 * DB: easy-web-tab v1；4 个 object store 均无 keyPath，统一使用 out-of-line 键 'items'
 * 所有请求失败均 reject，由调用方自行 try/catch 降级（不做 localStorage 回退写）
 */
import { WORKBENCH_DATA_VERSION } from '../types'
import type { Countdown, WorkbenchData, WorkbenchNote, WorkbenchTodo } from '../types'

export const DB_NAME = 'easy-web-tab'
export const DB_VERSION = 1
export const IDB_STORES = ['todos', 'notes', 'countdowns', 'passwords'] as const
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
      request.onsuccess = () => resolve(request.result)
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
  const [todos, notes, countdowns, passwords] = await Promise.all([
    idbGet<WorkbenchTodo[]>('todos'),
    idbGet<WorkbenchNote[]>('notes'),
    idbGet<Countdown[]>('countdowns'),
    idbGet<string>('passwords')
  ])
  return {
    version: WORKBENCH_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    todos: todos ?? [],
    notes: notes ?? [],
    countdowns: countdowns ?? [],
    passwords: passwords ?? ''
  }
}

export async function idbImportAll(data: WorkbenchData): Promise<void> {
  if (data.version !== WORKBENCH_DATA_VERSION) {
    throw new Error('备份文件版本不兼容')
  }
  if (
    !Array.isArray(data.todos) ||
    !Array.isArray(data.notes) ||
    !Array.isArray(data.countdowns) ||
    typeof data.passwords !== 'string'
  ) {
    throw new Error('备份文件格式无效')
  }
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
