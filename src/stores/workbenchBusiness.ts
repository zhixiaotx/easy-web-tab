import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import type {
  BusinessDailyRecord,
  BusinessData,
  BusinessExpense,
  BusinessExpenseCategory,
  BusinessProduct,
  BusinessProductCategory,
  BusinessPurchase,
  DailyRecordItem
} from '@/types'
import {
  addExpenseCategory as addExpenseCategoryCore,
  addProductCategory as addProductCategoryCore,
  calcDailyRevenue,
  deleteExpenseCategory as deleteExpenseCategoryCore,
  deleteProductCategory as deleteProductCategoryCore,
  emptyBusinessData,
  moveCategory,
  newId,
  normalizeBusinessData,
  renameCategory,
  toggleCategoryVisible
} from '@/composables/businessCore'
import type { CategoryOpResult } from '@/composables/businessCore'
import { idbGet, idbPut } from '../composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'

// 销售记账 store（数据存 IndexedDB store 'business'，key 'items'；随备份 v7 导出/导入）
export const useWorkbenchBusinessStore = defineStore('workbenchBusiness', () => {
  const productCategories = ref<BusinessProductCategory[]>(emptyBusinessData().productCategories)
  const expenseCategories = ref<BusinessExpenseCategory[]>(emptyBusinessData().expenseCategories)
  const products = ref<BusinessProduct[]>([])
  const purchases = ref<BusinessPurchase[]>([])
  const dailyRecords = ref<BusinessDailyRecord[]>([])
  const expenses = ref<BusinessExpense[]>([])
  const settings = ref<BusinessData['settings']>({ stallName: '', lowStockThreshold: 20 })
  // 首屏数据加载态：loadBusiness 完成（成功或失败）后置 true，驱动首页骨架屏
  const loaded = ref(false)

  async function loadBusiness(): Promise<void> {
    try {
      // IDB 存量旧结构/脏数据经 normalizeBusinessData 幂等归一（内置支出分类缺失自动补回）
      const data = normalizeBusinessData(await idbGet<BusinessData>('business'))
      productCategories.value = data.productCategories
      expenseCategories.value = data.expenseCategories
      products.value = data.products
      purchases.value = data.purchases
      dailyRecords.value = data.dailyRecords
      expenses.value = data.expenses
      settings.value = data.settings
    } catch (e) {
      // 加载失败降级为空态（保持种子默认），不向上抛
      console.error('[workbenchBusiness] loadBusiness', e)
    } finally {
      loaded.value = true
    }
  }

  async function saveBusiness(): Promise<void> {
    try {
      // 嵌套 reactive 数组必须逐字段 toRaw（整体 toRaw 解不掉内层 Proxy，DataCloneError 实证）
      await idbPut('business', {
        productCategories: toRaw(productCategories.value),
        expenseCategories: toRaw(expenseCategories.value),
        products: toRaw(products.value),
        purchases: toRaw(purchases.value),
        dailyRecords: toRaw(dailyRecords.value),
        expenses: toRaw(expenses.value),
        settings: toRaw(settings.value)
      })
      markDirty()
    } catch (e) {
      console.error('[workbenchBusiness] saveBusiness', e)
    }
  }

  // ===== 商品分类 CRUD（全部委托 businessCore 纯函数，store 只做薄委托 + 持久化） =====
  function addProductCategory(name: string): CategoryOpResult<BusinessProductCategory> {
    const r = addProductCategoryCore(productCategories.value, name)
    if (r.ok) {
      productCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  function renameProductCategory(id: string, name: string): CategoryOpResult<BusinessProductCategory> {
    const r = renameCategory(productCategories.value, id, name)
    if (r.ok) {
      productCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  function toggleProductCategoryVisible(id: string): CategoryOpResult<BusinessProductCategory> {
    const r = toggleCategoryVisible(productCategories.value, id)
    if (r.ok) {
      productCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  function moveProductCategory(id: string, dir: 'up' | 'down'): CategoryOpResult<BusinessProductCategory> {
    const r = moveCategory(productCategories.value, id, dir)
    if (r.ok) {
      productCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  function deleteProductCategory(id: string): CategoryOpResult<BusinessProductCategory> {
    const inUse = products.value.some(p => p.categoryId === id)
    const r = deleteProductCategoryCore(productCategories.value, id, inUse)
    if (r.ok) {
      productCategories.value = r.list
      // 删除后该分类商品归未分类（toRaw 原始数组上重建，防残留 Proxy 元素 DataCloneError）
      products.value = toRaw(products.value).map(p => (p.categoryId === id ? { ...p, categoryId: undefined } : p))
      void saveBusiness()
    }
    return r
  }

  // ===== 支出分类 CRUD =====
  function addExpenseCategory(name: string): CategoryOpResult<BusinessExpenseCategory> {
    const r = addExpenseCategoryCore(expenseCategories.value, name)
    if (r.ok) {
      expenseCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  function renameExpenseCategory(id: string, name: string): CategoryOpResult<BusinessExpenseCategory> {
    const r = renameCategory(expenseCategories.value, id, name)
    if (r.ok) {
      expenseCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  function toggleExpenseCategoryVisible(id: string): CategoryOpResult<BusinessExpenseCategory> {
    const r = toggleCategoryVisible(expenseCategories.value, id)
    if (r.ok) {
      expenseCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  function moveExpenseCategory(id: string, dir: 'up' | 'down'): CategoryOpResult<BusinessExpenseCategory> {
    const r = moveCategory(expenseCategories.value, id, dir)
    if (r.ok) {
      expenseCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  function deleteExpenseCategory(id: string): CategoryOpResult<BusinessExpenseCategory> {
    const inUse = expenses.value.some(e => e.categoryId === id)
    const r = deleteExpenseCategoryCore(expenseCategories.value, id, inUse)
    if (r.ok) {
      expenseCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  // ===== 商品 CRUD =====
  async function addProduct(input: {
    name: string
    categoryId?: string
    unit: string
    purchasePrice: number
    sellingPrice: number
    active?: boolean
  }): Promise<void> {
    products.value.push({
      id: newId('bp_'),
      name: input.name.trim().slice(0, 40),
      categoryId: input.categoryId ?? undefined,
      unit: input.unit.trim().slice(0, 8) || '件',
      purchasePrice: Math.max(0, input.purchasePrice),
      sellingPrice: Math.max(0, input.sellingPrice),
      active: input.active !== false,
      createdAt: new Date().toISOString()
    })
    await saveBusiness()
  }

  async function updateProduct(
    id: string,
    patch: Partial<Omit<BusinessProduct, 'id' | 'createdAt'>>
  ): Promise<void> {
    const index = products.value.findIndex(p => p.id === id)
    if (index === -1) return
    products.value[index] = { ...toRaw(products.value[index]), ...patch, id }
    await saveBusiness()
  }

  async function deleteProduct(id: string): Promise<{ ok: boolean; reason: 'not-found' | 'in-use' | 'ok' }> {
    const index = products.value.findIndex(p => p.id === id)
    if (index === -1) return { ok: false, reason: 'not-found' }
    // 被进货/收摊记录引用 → 禁删（防历史统计失真）；停售请用 active 开关
    const inUse =
      purchases.value.some(p => p.productId === id) ||
      dailyRecords.value.some(r => r.items.some(it => it.productId === id))
    if (inUse) return { ok: false, reason: 'in-use' }
    products.value = toRaw(products.value).filter(p => p.id !== id)
    await saveBusiness()
    return { ok: true, reason: 'ok' }
  }

  // ===== 进货 CRUD =====
  async function addPurchase(input: {
    productId: string
    quantity: number
    unitPrice: number
    date: string
    note?: string
  }): Promise<void> {
    const quantity = Math.max(0, Math.floor(input.quantity))
    const unitPrice = Math.max(0, input.unitPrice)
    purchases.value.push({
      id: newId('bpr_'),
      productId: input.productId,
      quantity,
      unitPrice,
      total: Math.round(quantity * unitPrice * 100) / 100,
      date: input.date,
      note: input.note?.trim() || undefined,
      createdAt: new Date().toISOString()
    })
    await saveBusiness()
  }

  async function updatePurchase(
    id: string,
    patch: Partial<Omit<BusinessPurchase, 'id' | 'createdAt' | 'total'>>
  ): Promise<void> {
    const index = purchases.value.findIndex(p => p.id === id)
    if (index === -1) return
    const old = toRaw(purchases.value[index])
    const merged = { ...old, ...patch, id }
    merged.quantity = Math.max(0, Math.floor(merged.quantity))
    merged.unitPrice = Math.max(0, merged.unitPrice)
    merged.total = Math.round(merged.quantity * merged.unitPrice * 100) / 100
    purchases.value[index] = merged
    await saveBusiness()
  }

  async function deletePurchase(id: string): Promise<void> {
    purchases.value = toRaw(purchases.value).filter(p => p.id !== id)
    await saveBusiness()
  }

  // ===== 收摊日记录（date 唯一 upsert 语义；totalRevenue 由 core 算好落库） =====
  async function upsertDailyRecord(input: {
    date: string
    items: DailyRecordItem[]
    note?: string
  }): Promise<void> {
    const now = new Date().toISOString()
    const totalRevenue = calcDailyRevenue(input.items, toRaw(products.value))
    const existing = dailyRecords.value.findIndex(r => r.date === input.date)
    if (existing !== -1) {
      const old = toRaw(dailyRecords.value[existing])
      dailyRecords.value[existing] = {
        ...old,
        items: input.items.map(it => ({ ...it })),
        totalRevenue,
        note: input.note?.trim() || undefined,
        updatedAt: now
      }
    } else {
      dailyRecords.value.push({
        id: newId('bd_'),
        date: input.date,
        items: input.items.map(it => ({ ...it })),
        totalRevenue,
        note: input.note?.trim() || undefined,
        createdAt: now,
        updatedAt: now
      })
    }
    await saveBusiness()
  }

  async function deleteDailyRecord(id: string): Promise<void> {
    dailyRecords.value = toRaw(dailyRecords.value).filter(r => r.id !== id)
    await saveBusiness()
  }

  // ===== 支出 CRUD =====
  async function addExpense(input: {
    date: string
    categoryId: string
    amount: number
    note?: string
  }): Promise<void> {
    expenses.value.push({
      id: newId('be_'),
      date: input.date,
      categoryId: input.categoryId,
      amount: Math.max(0, input.amount),
      note: input.note?.trim() || undefined,
      createdAt: new Date().toISOString()
    })
    await saveBusiness()
  }

  async function updateExpense(
    id: string,
    patch: Partial<Omit<BusinessExpense, 'id' | 'createdAt'>>
  ): Promise<void> {
    const index = expenses.value.findIndex(e => e.id === id)
    if (index === -1) return
    const merged = { ...toRaw(expenses.value[index]), ...patch, id }
    merged.amount = Math.max(0, merged.amount)
    expenses.value[index] = merged
    await saveBusiness()
  }

  async function deleteExpense(id: string): Promise<void> {
    expenses.value = toRaw(expenses.value).filter(e => e.id !== id)
    await saveBusiness()
  }

  // ===== 整包导入（销售记账独立 JSON 备份，BusinessView 头部「导入」按钮入口） =====
  async function importData(raw: unknown): Promise<BusinessData> {
    const data = normalizeBusinessData(raw)
    productCategories.value = data.productCategories
    expenseCategories.value = data.expenseCategories
    products.value = data.products
    purchases.value = data.purchases
    dailyRecords.value = data.dailyRecords
    expenses.value = data.expenses
    settings.value = data.settings
    await saveBusiness()
    return data
  }

  // ===== 设置 =====
  async function setStallName(name: string): Promise<void> {
    settings.value.stallName = name.trim().slice(0, 30)
    await saveBusiness()
  }

  async function setLowStockThreshold(n: number): Promise<void> {
    settings.value.lowStockThreshold = Math.max(0, Math.floor(n))
    await saveBusiness()
  }

  return {
    productCategories,
    expenseCategories,
    products,
    purchases,
    dailyRecords,
    expenses,
    settings,
    loaded,
    loadBusiness,
    saveBusiness,
    importData,
    addProductCategory,
    renameProductCategory,
    toggleProductCategoryVisible,
    moveProductCategory,
    deleteProductCategory,
    addExpenseCategory,
    renameExpenseCategory,
    toggleExpenseCategoryVisible,
    moveExpenseCategory,
    deleteExpenseCategory,
    addProduct,
    updateProduct,
    deleteProduct,
    addPurchase,
    updatePurchase,
    deletePurchase,
    upsertDailyRecord,
    deleteDailyRecord,
    addExpense,
    updateExpense,
    deleteExpense,
    setStallName,
    setLowStockThreshold
  }
})
