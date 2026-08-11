import type { WorkbenchData } from '../types/index.ts'

/**
 * 时光机快照纯逻辑引擎。
 * 纯函数、零 vue/pinia 运行时依赖（node --experimental-strip-types 可测）。
 * 本文件定义 SnapshotRecord 契约（Todo 21/22 消费）；
 * 同日去重（比较 date 字段）属 Todo 21，core 只做列表管理不掺去重。
 */

// ==================== 契约 ====================

/** 快照上限：环形保留，超出裁剪最旧。 */
export const MAX_SNAPSHOTS = 10

/**
 * 快照记录契约（Todo 21 存储、Todo 22 恢复时消费）：
 * - id：`YYYYMMDD-HHmmss`，展示/查找用
 * - date：本地日期 `YYYY-MM-DD`（WorkbenchHome localToday 模式），同日去重键
 * - data：快照时刻的完整工作台数据
 * - createdAt：ISO 时间戳，列表展示与恢复后清理用
 */
export interface SnapshotRecord {
  id: string
  date: string
  data: WorkbenchData
  createdAt: string
}

// ==================== 命名 ====================

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * 生成快照 id：由本地日期 `YYYY-MM-DD` 去掉分隔符得到 `YYYYMMDD` 前缀，
 * 拼接当前本地时间 `HHmmss` → `YYYYMMDD-HHmmss`。
 */
export function makeSnapshotId(date: string): string {
  const base = date.replace(/-/g, '')
  const now = new Date()
  return `${base}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

// ==================== 归一化 ====================

const ID_RE = /^\d{8}-\d{6}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isSnapshotRecord(value: unknown): value is SnapshotRecord {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    ID_RE.test(v.id) &&
    typeof v.date === 'string' &&
    DATE_RE.test(v.date) &&
    typeof v.createdAt === 'string' &&
    !Number.isNaN(Date.parse(v.createdAt)) &&
    typeof v.data === 'object' &&
    v.data !== null
  )
}

/**
 * 归一化快照列表：非数组 → []；坏项（null/字段缺失/格式不符）剔除；
 * 按 createdAt 降序（新→旧）。返回新数组，不改入参。
 */
export function normalizeSnapshotList(raw: unknown): SnapshotRecord[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isSnapshotRecord)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

// ==================== 列表管理 ====================

/**
 * 追加快照：返回新数组（不改入参），同 id 已存在则幂等跳过（不重复追加）。
 * 追加后按 createdAt 降序整理，超出 MAX_SNAPSHOTS 裁剪最旧（环形保留）。
 * 同日去重（比较 date）不在此处——属 Todo 21。
 */
export function pushSnapshot(list: SnapshotRecord[], snapshot: SnapshotRecord): SnapshotRecord[] {
  if (list.some(s => s.id === snapshot.id)) return [...list]
  return [...list, snapshot]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_SNAPSHOTS)
}

/** 按 id 查找快照；不存在返回 undefined。 */
export function findSnapshot(list: SnapshotRecord[], id: string): SnapshotRecord | undefined {
  return list.find(s => s.id === id)
}
