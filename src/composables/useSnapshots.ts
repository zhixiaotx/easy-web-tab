/**
 * 工作台数据时光机：自动/手动快照捕获（Todo 21 自动 + Todo 22 立即备份按钮共用）。
 * 数据来源：idbExportAll()（7 核心 store + 版本/时间戳）+ 直接读 IDB 补 pomodoro/habits
 * （面板懒加载、Pinia 内存态可能不完整——直接 IDB 读取保证快照数据完备）。
 * 同日去重（比较 date 字段）在此处；列表管理（pushSnapshot 按 createdAt 降序 + 环形 10 份）委托 snapshotCore。
 */
import { toRaw } from 'vue'
import { idbExportAll, idbGet, idbPut } from './useIdb'
import { localToday } from './todoCore'
import { makeSnapshotId, pushSnapshot } from './snapshotCore'
import type { SnapshotRecord } from './snapshotCore'

/**
 * 捕获一份工作台快照并写入 IDB store 'snapshots'。
 * @param force true 绕过同日去重（「立即备份」按钮用）；false 时若当天已有快照则跳过（进入工作台自动快照）。
 * 失败向上抛（调用方自行 try/catch 降级——自动快照静默、手动按钮 toast）。
 */
export async function captureSnapshot(force = false): Promise<void> {
  const data = await idbExportAll()

  // 补 pomodoro/habits：直接读 IDB（不经 Pinia 面板状态），仅在 IDB 有值（undefined 除外）时覆盖，
  // 保证快照含面板懒加载期间也完备的番茄钟/习惯数据（idbExportAll 兜底 empty 结构后这里精确覆盖真实值）
  const pomodoro = await idbGet('pomodoro')
  const habits = await idbGet('habits')
  if (pomodoro !== undefined) data.pomodoro = pomodoro
  if (habits !== undefined) data.habits = habits

  const today = localToday()

  // 同日去重：比较 date 字段（YYYY-MM-DD），绝不比较 id（id 含 HHmmss，同日永不相等）
  const existing = (await idbGet<SnapshotRecord[]>('snapshots')) ?? []
  if (!force && existing.some((s) => s.date === today)) return

  const snapshot: SnapshotRecord = {
    id: makeSnapshotId(today),
    date: today,
    data,
    createdAt: new Date().toISOString()
  }

  // pushSnapshot：同 id 幂等 + createdAt 降序 + 环形裁剪 MAX_SNAPSHOTS=10（返回新纯数组）
  const newList = pushSnapshot(existing, snapshot)
  // toRaw 显式兜底：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError）
  await idbPut('snapshots', toRaw(newList))
}
