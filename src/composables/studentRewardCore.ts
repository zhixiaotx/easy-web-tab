// 学生工作台奖励积分纯逻辑模块。
// 积分规则：完成习惯 +5 / 完成作业 +10 / 阅读 ≥30 分钟 +5 / 家长手动加分；
// 兑换扣分；交易历史保留最近 100 条；autoEarn 用 sourceId 幂等防重复加分。
// 零 vue/pinia 运行时依赖，纯函数，node --experimental-strip-types 可测。

import type {
  StudentRewardItem,
  StudentRewardTxn,
  StudentRewardsData
} from '@/types'

/** 奖励项 id 前缀 */
export const REWARD_ITEM_ID_PREFIX = 'rw_'
/** 交易记录 id 前缀 */
export const REWARD_TXN_ID_PREFIX = 'rt_'

/** 历史上限（PRD 约定保留最近 100 条） */
export const MAX_HISTORY = 100
/** 名称上限（按 code point 计） */
export const MAX_NAME_LENGTH = 30
/** 积分上限（PRD 约定 1-9999 正整数） */
export const MAX_COST = 9999
export const MIN_COST = 1

/** 积分加分常量（PRD 4.13.1） */
export const POINTS_HABIT = 5
export const POINTS_HOMEWORK = 10
export const POINTS_READING = 5
/** 阅读加分门槛（分钟） */
export const READING_MIN_MINUTES = 30

/** 操作错误语义 */
export type RewardOpError =
  | 'empty'
  | 'duplicate'
  | 'not-found'
  | 'invalid-cost'
  | 'insufficient'
  | 'out-of-stock'
  | 'invalid-points'
  | 'invalid-source'

export interface RewardOp {
  ok: boolean
  reason?: RewardOpError
  /** 兑换时余额不足，提示差额 */
  shortage?: number
}

function genId(prefix: string): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}

/** 空奖励数据 */
export function emptyRewardsData(): StudentRewardsData {
  return { totalPoints: 0, history: [], rewards: [] }
}

// ---- 归一化（幂等）----

/**
 * 单条奖励项归一化：
 * - name trim 后非空，截断 30 code point；
 * - cost 钳到 [1, 9999] 正整数；
 * - stock 可选，0/正整数；
 * - id 缺失/非字符串 → 生成 rw_ 前缀；
 * - 非法返回 null。
 */
export function normalizeRewardItem(raw: unknown): StudentRewardItem | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.trim() : ''
  if (!name) return null
  const costNum = typeof r.cost === 'number' ? r.cost : Number(r.cost)
  if (!Number.isFinite(costNum) || costNum < MIN_COST) return null
  const cost = Math.min(MAX_COST, Math.max(MIN_COST, Math.floor(costNum)))
  const out: StudentRewardItem = {
    id: typeof r.id === 'string' && r.id !== '' ? r.id : genId(REWARD_ITEM_ID_PREFIX),
    name: Array.from(name).slice(0, MAX_NAME_LENGTH).join(''),
    cost
  }
  if (typeof r.stock === 'number' && Number.isFinite(r.stock) && r.stock >= 0) {
    out.stock = Math.floor(r.stock)
  }
  return out
}

/**
 * 单条交易记录归一化：
 * - type ∈ {'earn','redeem'}；
 * - points 非零整数（earn + / redeem -）；
 * - reason trim 非空，截断 200 code point；
 * - id 缺失 → 生成 rt_ 前缀；
 * - rewardId/sourceId 可选字符串；
 * - 非法返回 null。
 */
export function normalizeRewardTxn(raw: unknown): StudentRewardTxn | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  const type: 'earn' | 'redeem' | undefined =
    t.type === 'earn' || t.type === 'redeem' ? t.type : undefined
  if (!type) return null
  const pointsNum = typeof t.points === 'number' ? t.points : Number(t.points)
  if (!Number.isFinite(pointsNum) || pointsNum === 0) return null
  // earn 必为正，redeem 必为负
  if (type === 'earn' && pointsNum < 0) return null
  if (type === 'redeem' && pointsNum > 0) return null
  const points = Math.trunc(pointsNum)
  const reason = typeof t.reason === 'string' ? t.reason.trim() : ''
  if (!reason) return null
  const out: StudentRewardTxn = {
    id: typeof t.id === 'string' && t.id !== '' ? t.id : genId(REWARD_TXN_ID_PREFIX),
    type,
    points,
    reason: Array.from(reason).slice(0, 200).join(''),
    createdAt: typeof t.createdAt === 'string' ? t.createdAt : isoNow()
  }
  if (typeof t.rewardId === 'string' && t.rewardId.trim()) {
    out.rewardId = t.rewardId.trim()
  }
  if (typeof t.sourceId === 'string' && t.sourceId.trim()) {
    out.sourceId = t.sourceId.trim()
  }
  return out
}

/**
 * 整库归一化（幂等，不改入参）：
 * - totalPoints：非有限数 → 0；负数 → 0；
 * - rewards：仅保留合法项；按 cost 升序排序；
 * - history：仅保留合法 txn；按 createdAt 降序排序；截断保留最近 100 条；
 * 非对象/数组输入 → emptyRewardsData()。
 */
export function normalizeRewardsData(raw: unknown): StudentRewardsData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyRewardsData()
  const src = raw as Record<string, unknown>
  const tpNum = typeof src.totalPoints === 'number' ? src.totalPoints : Number(src.totalPoints)
  const totalPoints = Number.isFinite(tpNum) && tpNum >= 0 ? Math.floor(tpNum) : 0
  const rewardsRaw = Array.isArray(src.rewards) ? src.rewards : []
  const rewards = rewardsRaw
    .map(normalizeRewardItem)
    .filter((r): r is StudentRewardItem => r !== null)
    .sort((a, b) => a.cost - b.cost)
  const historyRaw = Array.isArray(src.history) ? src.history : []
  const allHistory = historyRaw
    .map(normalizeRewardTxn)
    .filter((t): t is StudentRewardTxn => t !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  // 截断保留最近 MAX_HISTORY 条
  const history = allHistory.slice(0, MAX_HISTORY)
  return { totalPoints, history, rewards }
}

// ---- 半自动积分加分常量与决策 ----

/**
 * 检查历史中是否已存在相同 sourceId 的 earn txn。
 * 用于 autoEarn 幂等防重复（同一 habit 同一天不重复加分）。
 */
export function hasSourceId(history: readonly StudentRewardTxn[], sourceId: string): boolean {
  if (!sourceId) return false
  for (const t of history) {
    if (t.sourceId === sourceId) return true
  }
  return false
}

/** 习惯打卡加分（+5），reason 模板：完成习惯「<name>」 */
export function habitEarnReason(habitName: string): string {
  return `完成习惯「${habitName}」`
}

/** 作业完成加分（+10），reason 模板：完成作业「<title>」 */
export function homeworkEarnReason(hwTitle: string): string {
  return `完成作业「${hwTitle}」`
}

/** 阅读加分（+5），reason 模板：阅读「<book>」<duration> 分钟 */
export function readingEarnReason(bookTitle: string, durationMin: number): string {
  return `阅读「${bookTitle}」${durationMin} 分钟`
}

/** 阅读加分门槛校验：≥30 分钟才加分 */
export function isReadingEligible(durationMin: number): boolean {
  return Number.isFinite(durationMin) && durationMin >= READING_MIN_MINUTES
}

// ---- CRUD 结果函数（不改入参，返回新对象/数组）----

/**
 * 新增奖励项：name trim 非空、唯一（大小写不敏感）、cost ∈ [1,9999]。
 * 返回 `{ ok, reason?, rewards? }`；成功时 rewards 为新数组（含新增项）。
 */
export function addRewardItem(
  rewards: readonly StudentRewardItem[],
  name: string,
  cost: number,
  stock?: number
): RewardOp & { rewards?: StudentRewardItem[] } {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  const sliced = Array.from(trimmed).slice(0, MAX_NAME_LENGTH).join('')
  if (rewards.some(r => r.name.toLowerCase() === sliced.toLowerCase())) {
    return { ok: false, reason: 'duplicate' }
  }
  if (!Number.isFinite(cost) || cost < MIN_COST || cost > MAX_COST) {
    return { ok: false, reason: 'invalid-cost' }
  }
  const costInt = Math.floor(cost)
  const item: StudentRewardItem = {
    id: genId(REWARD_ITEM_ID_PREFIX),
    name: sliced,
    cost: costInt
  }
  if (stock !== undefined && Number.isFinite(stock) && stock >= 0) {
    item.stock = Math.floor(stock)
  }
  const next = [...rewards, item].sort((a, b) => a.cost - b.cost)
  return { ok: true, rewards: next }
}

/**
 * 更新奖励项：name 唯一校验排除自身；cost 钳到 [1,9999]；stock 可选。
 * 返回 `{ ok, reason?, rewards? }`；成功时 rewards 为新数组。
 */
export function updateRewardItem(
  rewards: readonly StudentRewardItem[],
  id: string,
  patch: { name?: string; cost?: number; stock?: number }
): RewardOp & { rewards?: StudentRewardItem[] } {
  const idx = rewards.findIndex(r => r.id === id)
  if (idx === -1) return { ok: false, reason: 'not-found' }
  const cur = rewards[idx]
  const next: StudentRewardItem = { ...cur }
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim()
    if (!trimmed) return { ok: false, reason: 'empty' }
    const sliced = Array.from(trimmed).slice(0, MAX_NAME_LENGTH).join('')
    if (rewards.some(r => r.id !== id && r.name.toLowerCase() === sliced.toLowerCase())) {
      return { ok: false, reason: 'duplicate' }
    }
    next.name = sliced
  }
  if (patch.cost !== undefined) {
    if (!Number.isFinite(patch.cost) || patch.cost < MIN_COST || patch.cost > MAX_COST) {
      return { ok: false, reason: 'invalid-cost' }
    }
    next.cost = Math.floor(patch.cost)
  }
  if (patch.stock !== undefined) {
    if (!Number.isFinite(patch.stock) || patch.stock < 0) {
      return { ok: false, reason: 'invalid-cost' }
    }
    next.stock = Math.floor(patch.stock)
  }
  const nextRewards = [...rewards.slice(0, idx), next, ...rewards.slice(idx + 1)]
    .sort((a, b) => a.cost - b.cost)
  return { ok: true, rewards: nextRewards }
}

/**
 * 删除奖励项：返回新数组（不改入参）；不存在 → not-found。
 */
export function deleteRewardItem(
  rewards: readonly StudentRewardItem[],
  id: string
): RewardOp & { rewards?: StudentRewardItem[] } {
  if (!rewards.some(r => r.id === id)) return { ok: false, reason: 'not-found' }
  return { ok: true, rewards: rewards.filter(r => r.id !== id) }
}

// ---- 加分/扣分核心 ----

/**
 * 手动加分（家长模式）：points > 0 才生效；写入 earn txn（不带 sourceId）。
 * 返回新 data（不改入参）。
 */
export function manualEarn(
  data: StudentRewardsData,
  points: number,
  reason: string
): RewardOp & { data?: StudentRewardsData } {
  if (!Number.isFinite(points) || points <= 0) return { ok: false, reason: 'invalid-points' }
  const reasonTrim = reason.trim()
  if (!reasonTrim) return { ok: false, reason: 'empty' }
  const txn: StudentRewardTxn = {
    id: genId(REWARD_TXN_ID_PREFIX),
    type: 'earn',
    points: Math.floor(points),
    reason: Array.from(reasonTrim).slice(0, 200).join(''),
    createdAt: isoNow()
  }
  return { ok: true, data: appendTxn(data, txn, data.totalPoints + txn.points) }
}

/**
 * 半自动加分（习惯/作业/阅读完成时触发）：
 * - points > 0；
 * - sourceId 必填（去重键，如 `habit:${habitId}:${date}`）；
 * - 已存在相同 sourceId 的 earn txn → noop（不加分，不写 txn）；
 * - 否则写 earn txn + 加分。
 */
export function autoEarn(
  data: StudentRewardsData,
  points: number,
  reason: string,
  sourceId: string
): RewardOp & { data?: StudentRewardsData } {
  if (!Number.isFinite(points) || points <= 0) return { ok: false, reason: 'invalid-points' }
  const sourceIdTrim = sourceId.trim()
  if (!sourceIdTrim) return { ok: false, reason: 'invalid-source' }
  if (hasSourceId(data.history, sourceIdTrim)) {
    // 幂等：已加过分，noop（不算错，但不写入）
    return { ok: true }
  }
  const reasonTrim = reason.trim()
  if (!reasonTrim) return { ok: false, reason: 'empty' }
  const txn: StudentRewardTxn = {
    id: genId(REWARD_TXN_ID_PREFIX),
    type: 'earn',
    points: Math.floor(points),
    reason: Array.from(reasonTrim).slice(0, 200).join(''),
    sourceId: sourceIdTrim,
    createdAt: isoNow()
  }
  return { ok: true, data: appendTxn(data, txn, data.totalPoints + txn.points) }
}

/**
 * 兑换奖励：扣分 + 写 redeem txn；余额不足 → insufficient（带 shortage）；库存为 0 → out-of-stock；
 * 库存减 1（若配置了 stock 且 > 0）。
 */
export function redeemReward(
  data: StudentRewardsData,
  rewardId: string
): RewardOp & { data?: StudentRewardsData; shortage?: number } {
  const reward = data.rewards.find(r => r.id === rewardId)
  if (!reward) return { ok: false, reason: 'not-found' }
  // 库存为 0 → 售罄
  if (reward.stock !== undefined && reward.stock <= 0) {
    return { ok: false, reason: 'out-of-stock' }
  }
  // 余额不足
  if (data.totalPoints < reward.cost) {
    return { ok: false, reason: 'insufficient', shortage: reward.cost - data.totalPoints }
  }
  // 写 txn + 扣分 + 减库存
  const txn: StudentRewardTxn = {
    id: genId(REWARD_TXN_ID_PREFIX),
    type: 'redeem',
    points: -reward.cost,
    reason: `兑换「${reward.name}」`,
    rewardId: reward.id,
    createdAt: isoNow()
  }
  // 减库存
  const nextRewards = reward.stock !== undefined
    ? data.rewards.map(r => r.id === rewardId ? { ...r, stock: Math.max(0, (r.stock ?? 0) - 1) } : r)
    : data.rewards
  const nextData: StudentRewardsData = {
    ...data,
    rewards: nextRewards
  }
  return { ok: true, data: appendTxn(nextData, txn, data.totalPoints - reward.cost) }
}

/** 内部：追加 txn 到历史，截断保留最近 MAX_HISTORY 条 */
function appendTxn(data: StudentRewardsData, txn: StudentRewardTxn, newTotal: number): StudentRewardsData {
  const history = [txn, ...data.history].slice(0, MAX_HISTORY)
  return {
    totalPoints: Math.max(0, newTotal),
    history,
    rewards: data.rewards
  }
}

// ---- 视图辅助（不改入参）----

/** 按库存筛选：返回非售罄（stock !== 0）的奖励项副本 */
export function filterActiveRewards(rewards: readonly StudentRewardItem[]): StudentRewardItem[] {
  return rewards.filter(r => r.stock === undefined || r.stock > 0)
}

/** 售罄奖励项 */
export function filterSoldOutRewards(rewards: readonly StudentRewardItem[]): StudentRewardItem[] {
  return rewards.filter(r => r.stock !== undefined && r.stock <= 0)
}

/** 取最近 N 条历史（默认 10） */
export function recentHistory(history: readonly StudentRewardTxn[], limit = 10): StudentRewardTxn[] {
  return history.slice(0, Math.max(1, limit))
}

/** 奖励统计 */
export interface RewardStats {
  totalPoints: number
  /** 累计已赚取积分（所有 earn txn 之和） */
  totalEarned: number
  /** 累计已兑换积分（所有 redeem txn 绝对值之和） */
  totalRedeemed: number
  /** 交易总数 */
  txnCount: number
  /** 奖励项总数 */
  rewardCount: number
  /** 售罄奖励项数 */
  soldOutCount: number
}

export function calcRewardStats(data: StudentRewardsData): RewardStats {
  let totalEarned = 0
  let totalRedeemed = 0
  for (const t of data.history) {
    if (t.type === 'earn') totalEarned += t.points
    else totalRedeemed += Math.abs(t.points)
  }
  const soldOutCount = data.rewards.filter(r => r.stock !== undefined && r.stock <= 0).length
  return {
    totalPoints: data.totalPoints,
    totalEarned,
    totalRedeemed,
    txnCount: data.history.length,
    rewardCount: data.rewards.length,
    soldOutCount
  }
}

/** 格式化交易积分显示（earn → +N / redeem → -N） */
export function formatTxnPoints(txn: StudentRewardTxn): string {
  return txn.points > 0 ? `+${txn.points}` : `${txn.points}`
}

/** 格式化日期为本地可读（YYYY-MM-DD HH:mm） */
export function formatTxnDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 积分规则说明（用于「积分规则」说明页） */
export function pointsRulesText(): { action: string; points: number }[] {
  return [
    { action: '完成一次习惯打卡', points: POINTS_HABIT },
    { action: '完成一次作业', points: POINTS_HOMEWORK },
    { action: '阅读单次 ≥30 分钟', points: POINTS_READING },
    { action: '家长手动加分', points: 0 }
  ]
}
