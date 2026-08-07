import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import type { LedgerCategory, LedgerData, LedgerEntry } from '@/types'
import { emptyLedgerData, localDateStr, monthKeyOf, normalizeLedgerData, normalizeLedgerEntry, planAutoCopy } from '@/composables/ledgerCore'
import { idbGet, idbPut } from '../composables/useIdb'

// 工作台记账本 store（数据存 IndexedDB store 'ledger'，经 ledgerCore 归一化后读写）
export const useWorkbenchLedgerStore = defineStore('workbenchLedger', () => {
  const categories = ref<LedgerCategory[]>([])
  const entries = ref<LedgerEntry[]>([])
  // 内存态金额可见性开关（仅 UI，不持久化，刷新即重置）
  const showAmount = ref(false)

  async function loadLedger(): Promise<void> {
    try {
      // 存量脏数据（内置组被改/amount 负数等）经 normalizeLedgerData 幂等归一
      const data = normalizeLedgerData(await idbGet<LedgerData>('ledger'))
      categories.value = data.categories
      entries.value = data.entries
      // 每月自动复制：当前月缺工资/房贷且上月存在 → 补齐（幂等，详见 ledgerCore.planAutoCopy）
      await applyMonthlyAutoCopy()
    } catch (e) {
      console.error('[Ledger] load failed', e)
      // IDB 空/坏 → 内置 8 分组兜底，保证组始终存在
      const empty = emptyLedgerData()
      categories.value = empty.categories
      entries.value = empty.entries
    }
  }

  /** 自动复制上月工资/房贷到当前月（仅当月缺该分类且上月存在时补入；id 用 base+序号防同毫秒碰撞）。 */
  async function applyMonthlyAutoCopy(): Promise<void> {
    const drafts = planAutoCopy(entries.value, monthKeyOf(localDateStr()))
    if (drafts.length === 0) return
    const now = new Date().toISOString()
    const base = Date.now()
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i]
      entries.value.push(
        normalizeLedgerEntry({
          ...d,
          id: `ld_${base}_${i}`,
          createdAt: now,
          updatedAt: now
        })
      )
    }
    await saveLedger()
  }

  function toggleAmountVisibility(): void {
    showAmount.value = !showAmount.value
  }

  async function saveLedger(): Promise<void> {
    try {
      // toRaw：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError）。
      // toRaw 只解开最外层代理，故对每个 reactive 数组分别 toRaw 后再放入普通对象——
      // 对 { ... } 字面量整体 toRaw 无效（字面量本身非响应式，嵌套 Proxy 不会被解开）。
      await idbPut('ledger', { categories: toRaw(categories.value), entries: toRaw(entries.value) })
    } catch (e) {
      console.error('[Ledger] save failed', e)
    }
  }

  async function addEntry(input: { date: string; categoryId: string; amount: number; note?: string }): Promise<void> {
    const now = new Date().toISOString()
    entries.value.push(
      normalizeLedgerEntry({
        ...input,
        id: `ld_${Date.now()}`,
        createdAt: now,
        updatedAt: now
      })
    )
    await saveLedger()
  }

  async function updateEntry(id: string, patch: Partial<LedgerEntry>): Promise<void> {
    const index = entries.value.findIndex(e => e.id === id)
    if (index !== -1) {
      entries.value[index] = {
        ...entries.value[index],
        ...patch,
        id: entries.value[index].id,
        updatedAt: new Date().toISOString()
      }
      await saveLedger()
    } else {
      console.warn(`[Ledger] entry not found: ${id}`)
    }
  }

  async function deleteEntry(id: string): Promise<void> {
    // 从 toRaw 的原始数组 filter：在 reactive 代理上直接 filter 会得到 Proxy 元素，
    // toRaw 只解开一层数组，残留的 Proxy 元素会让 IDB 结构化克隆抛 DataCloneError
    entries.value = toRaw(entries.value).filter(e => e.id !== id)
    await saveLedger()
  }

  async function addCategory(input: { name: string; type: 'income' | 'expense' }): Promise<boolean> {
    const name = input.name.trim()
    if (!name) return false
    const lower = name.toLowerCase()
    // 与现有全部（含内置）名称唯一，冲突不写入
    if (categories.value.some(c => c.name.trim().toLowerCase() === lower)) return false
    categories.value.push({
      id: `cat_${Date.now()}`,
      name,
      type: input.type,
      isBuiltIn: false
    })
    await saveLedger()
    return true
  }

  async function updateCategory(id: string, patch: { name?: string; type?: 'income' | 'expense' }): Promise<boolean> {
    const index = categories.value.findIndex(c => c.id === id)
    if (index === -1) return false
    const target = categories.value[index]
    if (target.isBuiltIn) return false // 内置不可改
    if (patch.type !== undefined && patch.type !== 'income' && patch.type !== 'expense') return false

    const changes: Partial<LedgerCategory> = {}
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) return false
      // 名称唯一校验（排除自身）
      if (categories.value.some(c => c.id !== id && c.name.trim().toLowerCase() === name.toLowerCase())) return false
      changes.name = name
    }
    if (patch.type !== undefined) {
      changes.type = patch.type
    }

    categories.value[index] = { ...target, ...changes }
    await saveLedger()
    return true
  }

  async function deleteCategory(id: string): Promise<{ ok: boolean; reason?: 'builtin' | 'in-use' }> {
    const target = categories.value.find(c => c.id === id)
    if (target?.isBuiltIn) return { ok: false, reason: 'builtin' }
    // 全部月份：任一流水引用即视为在用
    if (entries.value.some(e => e.categoryId === id)) return { ok: false, reason: 'in-use' }
    categories.value = toRaw(categories.value).filter(c => c.id !== id)
    await saveLedger()
    return { ok: true }
  }

  // 收入在前，同类保持数组序（filter 返回新数组，不 mutate）
  const sortedCategories = computed<LedgerCategory[]>(() => [
    ...categories.value.filter(c => c.type === 'income'),
    ...categories.value.filter(c => c.type === 'expense')
  ])
  const incomeCategories = computed<LedgerCategory[]>(() => categories.value.filter(c => c.type === 'income'))
  const expenseCategories = computed<LedgerCategory[]>(() => categories.value.filter(c => c.type === 'expense'))

  return {
    categories,
    entries,
    showAmount,
    toggleAmountVisibility,
    loadLedger,
    saveLedger,
    addEntry,
    updateEntry,
    deleteEntry,
    addCategory,
    updateCategory,
    deleteCategory,
    sortedCategories,
    incomeCategories,
    expenseCategories
  }
})
