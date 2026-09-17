/**
 * 家庭家谱纯函数核心（零 vue/pinia 运行时依赖，可单测）。
 * 成员为中心 + 最小边模型：Person 仅挂 parents[] 与 spouses[] 两条边，
 * 子女/兄弟姐妹/祖孙全部运行时派生，不单独建关系表。
 */
import type { FamilyMember, GenealogyData } from '../types'

/** 空家谱数据集（导入兜底 / 初始化） */
export function emptyGenealogyData(): GenealogyData {
  return { members: [], rootId: null }
}

/** 成员名称校验：trim 后非空且 ≤50 字符 */
export function validateMemberName(name: string): boolean {
  const n = name.trim()
  return n.length > 0 && n.length <= 50
}

/** 父母（直接） */
export function getParents(members: FamilyMember[], id: string): FamilyMember[] {
  const m = members.find((x) => x.id === id)
  if (!m) return []
  return members.filter((x) => m.parents.includes(x.id))
}

/** 子女（直接） */
export function getChildren(members: FamilyMember[], id: string): FamilyMember[] {
  return members.filter((x) => x.parents.includes(id))
}

/** 兄弟姐妹（共享任一父母，去重，不含自身） */
export function getSiblings(members: FamilyMember[], id: string): FamilyMember[] {
  const m = members.find((x) => x.id === id)
  if (!m || m.parents.length === 0) return []
  const sibIds = new Set<string>()
  for (const p of m.parents) {
    for (const c of getChildren(members, p)) {
      if (c.id !== id) sibIds.add(c.id)
    }
  }
  return members.filter((x) => sibIds.has(x.id))
}

/** 祖先（沿 parents 上溯，去重，按出现顺序） */
export function getAncestors(members: FamilyMember[], id: string): FamilyMember[] {
  const out: FamilyMember[] = []
  const seen = new Set<string>()
  const stack = [...(members.find((x) => x.id === id)?.parents ?? [])]
  while (stack.length) {
    const pid = stack.pop() as string
    if (seen.has(pid)) continue
    seen.add(pid)
    const p = members.find((x) => x.id === pid)
    if (p) {
      out.push(p)
      stack.push(...p.parents)
    }
  }
  return out
}

/** 后代（沿子女下溯，去重，按出现顺序） */
export function getDescendants(members: FamilyMember[], id: string): FamilyMember[] {
  const out: FamilyMember[] = []
  const seen = new Set<string>()
  const stack = [...getChildren(members, id).map((c) => c.id)]
  while (stack.length) {
    const cid = stack.pop() as string
    if (seen.has(cid)) continue
    seen.add(cid)
    const c = members.find((x) => x.id === cid)
    if (c) {
      out.push(c)
      stack.push(...getChildren(members, cid).map((x) => x.id))
    }
  }
  return out
}

/**
 * 把 newParentId 设为 childId 的父是否会成环。
 * 自引用（childId === newParentId）必为环；若 newParentId 已是 childId 的后代亦为环。
 */
export function wouldCreateCycle(members: FamilyMember[], childId: string, newParentId: string): boolean {
  if (childId === newParentId) return true
  return getDescendants(members, childId).some((d) => d.id === newParentId)
}

/** 家谱树节点 */
export interface FamilyTreeNode {
  member: FamilyMember
  children: FamilyTreeNode[]
}

/**
 * 以主根为根构建家谱树；无主根（或为 null/不存在）时返回森林（多棵根树）。
 * 防御：visited 防重复（理论上最小边无环，仍加保护），depth 上限防极端深递归。
 */
export function buildTree(members: FamilyMember[], rootId: string | null): FamilyTreeNode[] {
  const byId = new Map(members.map((m) => [m.id, m] as const))
  const visited = new Set<string>()
  function nodeOf(id: string, depth: number): FamilyTreeNode | null {
    if (visited.has(id) || depth > 50) return null
    visited.add(id)
    const m = byId.get(id)
    if (!m) return null
    return {
      member: m,
      children: getChildren(members, id)
        .map((c) => nodeOf(c.id, depth + 1))
        .filter((n): n is FamilyTreeNode => n !== null)
    }
  }
  if (rootId && byId.has(rootId)) {
    const root = nodeOf(rootId, 0)
    return root ? [root] : []
  }
  // 森林：父母为空的成员作为根
  return members
    .filter((m) => m.parents.length === 0)
    .map((r) => nodeOf(r.id, 0))
    .filter((n): n is FamilyTreeNode => n !== null)
}

/** 树扁平化为 pre-order 列表（带深度，用于无障碍/无递归渲染） */
export interface FlatTreeNode {
  member: FamilyMember
  depth: number
  hasChildren: boolean
}
export function flattenTree(nodes: FamilyTreeNode[]): FlatTreeNode[] {
  const out: FlatTreeNode[] = []
  const walk = (list: FamilyTreeNode[], depth: number) => {
    for (const n of list) {
      out.push({ member: n.member, depth, hasChildren: n.children.length > 0 })
      if (n.children.length) walk(n.children, depth + 1)
    }
  }
  walk(nodes, 0)
  return out
}

/**
 * 合并家谱（云同步 merge 用）：成员按 id 合并——本地优先（updatedAt 较新者胜，
 * 本地先入 map，远端仅补缺失 id）；rootId 取 本地 ?? 远端。与 mergeStudentValue 的
 * 「本地优先」策略对齐。
 */
export function mergeFamily(local?: GenealogyData, remote?: GenealogyData): GenealogyData {
  const l = local ?? emptyGenealogyData()
  const r = remote ?? emptyGenealogyData()
  const map = new Map<string, FamilyMember>()
  const newer = (a: FamilyMember, b: FamilyMember): FamilyMember =>
    (a.updatedAt || '') >= (b.updatedAt || '') ? a : b
  for (const m of l.members) map.set(m.id, m)
  for (const m of r.members) {
    const existing = map.get(m.id)
    map.set(m.id, existing ? newer(existing, m) : m)
  }
  return {
    members: Array.from(map.values()),
    rootId: l.rootId ?? r.rootId
  }
}
