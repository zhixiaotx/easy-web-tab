import { defineStore } from 'pinia'
import { ref } from 'vue'
import { idbGet, idbPut } from '@/composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'
import {
  emptyGenealogyData,
  getAncestors,
  getChildren,
  getDescendants,
  getSiblings,
  wouldCreateCycle
} from '@/composables/genealogyCore'
import type { FamilyMember, GenealogyData } from '@/types'

let idSeq = 0
function newMemberId(): string {
  idSeq += 1
  return `fm_${Date.now().toString(36)}_${idSeq.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export interface MemberInput {
  name: string
  gender?: 'male' | 'female' | '' | null
  birthDate?: string
  deathDate?: string
  phone?: string
  note?: string
  avatar?: string
}

export const useGenealogyStore = defineStore('genealogy', () => {
  const members = ref<FamilyMember[]>([])
  const rootId = ref<string | null>(null)

  // ===== 持久化 =====
  async function load(): Promise<void> {
    try {
      const data = await idbGet<GenealogyData>('family')
      const d = data ?? emptyGenealogyData()
      members.value = Array.isArray(d.members) ? d.members : []
      rootId.value = d.rootId ?? null
    } catch {
      members.value = []
      rootId.value = null
    }
  }

  function persist(): void {
    // 深拷贝成纯对象再落盘：避免 Vue 响应式代理影响 IndexedDB 结构化克隆。
    // 写入失败必须可见（此前 .catch 静默吞掉，导致"数据存了却没落盘"无法察觉）。
    const snapshot: GenealogyData = JSON.parse(JSON.stringify({ members: members.value, rootId: rootId.value }))
    void idbPut('family', snapshot).catch((e) => {
      console.error('[genealogy] 家谱数据写入 IndexedDB 失败：', e)
    })
    markDirty()
  }

  // ===== 增删改 =====
  async function addMember(input: MemberInput): Promise<FamilyMember> {
    const now = new Date().toISOString()
    const m: FamilyMember = {
      id: newMemberId(),
      name: input.name.trim(),
      gender: input.gender ?? '',
      birthDate: input.birthDate || undefined,
      deathDate: input.deathDate || undefined,
      phone: input.phone || undefined,
      note: input.note || undefined,
      parents: [],
      spouses: [],
      createdAt: now,
      updatedAt: now
    }
    members.value.push(m)
    persist()
    return m
  }

  async function updateMember(id: string, patch: Partial<MemberInput>): Promise<void> {
    const m = members.value.find((x) => x.id === id)
    if (!m) return
    if (patch.name !== undefined) m.name = patch.name.trim()
    if (patch.gender !== undefined) m.gender = patch.gender
    if (patch.birthDate !== undefined) m.birthDate = patch.birthDate || undefined
    if (patch.deathDate !== undefined) m.deathDate = patch.deathDate || undefined
    if (patch.phone !== undefined) m.phone = patch.phone || undefined
    if (patch.note !== undefined) m.note = patch.note || undefined
    m.updatedAt = new Date().toISOString()
    persist()
  }

  /**
   * 删除成员：仅删该成员，并清理其它成员 parents/spouses 中对它的悬空引用
   * （子女保留为孤儿，符合需求决策④：不做级联删后代）。
   * 若被删者是主根，则清空 rootId。
   */
  async function deleteMember(id: string): Promise<void> {
    members.value = members.value.filter((x) => x.id !== id)
    for (const m of members.value) {
      if (m.parents.includes(id)) m.parents = m.parents.filter((p) => p !== id)
      if (m.spouses.includes(id)) m.spouses = m.spouses.filter((s) => s !== id)
    }
    if (rootId.value === id) rootId.value = null
    persist()
  }

  // ===== 建立关系 =====
  /** 设父母：环检测（自引用 / 后代变父）拦截，返回是否成功 */
  async function setParent(childId: string, parentId: string): Promise<boolean> {
    if (childId === parentId) return false
    if (wouldCreateCycle(members.value, childId, parentId)) return false
    const child = members.value.find((x) => x.id === childId)
    if (!child) return false
    if (!child.parents.includes(parentId)) {
      child.parents = [...child.parents, parentId]
      child.updatedAt = new Date().toISOString()
    }
    persist()
    return true
  }

  /** 设配偶：UI 限制一对一——设新配偶前清空双方旧的配偶引用 */
  async function setSpouse(aId: string, bId: string): Promise<boolean> {
    if (aId === bId) return false
    const a = members.value.find((x) => x.id === aId)
    const b = members.value.find((x) => x.id === bId)
    if (!a || !b) return false
    a.spouses = [bId]
    b.spouses = [aId]
    a.updatedAt = new Date().toISOString()
    b.updatedAt = new Date().toISOString()
    persist()
    return true
  }

  /** 解除父母关系（仅改被改方 parents，不级联删后代） */
  async function removeParent(childId: string, parentId: string): Promise<void> {
    const child = members.value.find((x) => x.id === childId)
    if (!child) return
    if (child.parents.includes(parentId)) {
      child.parents = child.parents.filter((p) => p !== parentId)
      child.updatedAt = new Date().toISOString()
      persist()
    }
  }

  /** 解除配偶关系（双向清除） */
  async function removeSpouse(aId: string, bId: string): Promise<void> {
    const a = members.value.find((x) => x.id === aId)
    const b = members.value.find((x) => x.id === bId)
    if (a && a.spouses.includes(bId)) {
      a.spouses = a.spouses.filter((s) => s !== bId)
      a.updatedAt = new Date().toISOString()
    }
    if (b && b.spouses.includes(aId)) {
      b.spouses = b.spouses.filter((s) => s !== aId)
      b.updatedAt = new Date().toISOString()
    }
    persist()
  }

  async function setRoot(id: string): Promise<void> {
    rootId.value = id
    persist()
  }

  async function clearRoot(): Promise<void> {
    rootId.value = null
    persist()
  }

  // ===== 派生 getter =====
  const childrenOf = (id: string) => getChildren(members.value, id)
  const siblingsOf = (id: string) => getSiblings(members.value, id)
  const ancestorsOf = (id: string) => getAncestors(members.value, id)
  const descendantsOf = (id: string) => getDescendants(members.value, id)

  return {
    members,
    rootId,
    load,
    persist,
    addMember,
    updateMember,
    deleteMember,
    setParent,
    setSpouse,
    removeParent,
    removeSpouse,
    setRoot,
    clearRoot,
    childrenOf,
    siblingsOf,
    ancestorsOf,
    descendantsOf
  }
})
