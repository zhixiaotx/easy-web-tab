// businessCore.ts 纯函数测试（node --experimental-strip-types 直跑，npm run test:business）
// T1-T18：归一化/种子分类/内置支出补回/分类 CRUD/库存/日收入/统计/排行/趋势坐标
import assert from 'node:assert/strict'
import {
  addExpenseCategory,
  addProductCategory,
  calcBusinessStats,
  calcBusinessTrend,
  calcCategoryRanking,
  calcDailyRevenue,
  calcInventory,
  calcProductRanking,
  businessTrendScale,
  deleteExpenseCategory,
  deleteProductCategory,
  emptyBusinessData,
  isCategoryNameTaken,
  isValidDateKey,
  lowStockProducts,
  moveCategory,
  normalizeBusinessData,
  normalizeExpenseCategories,
  normalizeProductCategories,
  renameCategory,
  soldCount,
  toggleCategoryVisible,
  visibleExpenseCategories,
  visibleProductCategories
} from '../src/composables/businessCore.ts'
import type { BusinessData, BusinessDailyRecord, BusinessProduct, BusinessPurchase } from '../src/types/index.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// T1 — emptyBusinessData：内置种子分类齐、空数组、默认设置
test('T1 emptyBusinessData seeds', () => {
  const d = emptyBusinessData()
  assert.equal(d.productCategories.length, 5)
  assert.equal(d.expenseCategories.length, 5)
  assert.deepEqual(d.expenseCategories.map(c => c.name), ['摊位费', '燃气费', '调料包装', '交通费', '其他'])
  assert.equal(d.products.length, 0)
  assert.equal(d.settings.lowStockThreshold, 20)
  assert.equal(d.settings.stallName, '')
})

// T2 — normalizeBusinessData：非对象/数组 → empty；字段非法剔除
test('T2 normalizeBusinessData degenerate', () => {
  assert.deepEqual(normalizeBusinessData(null).products, [])
  assert.equal(normalizeBusinessData([1, 2]).products.length, 0)
  const d = normalizeBusinessData({ products: [{ id: 'x', name: ' 苹果 ', sellingPrice: 'bad' }] })
  assert.equal(d.products[0].name, '苹果')
  assert.equal(d.products[0].sellingPrice, 0)
})

// T3 — normalizeExpenseCategories：内置缺失自动补回（不可删契约）；非法项剔除
test('T3 normalizeExpenseCategories builtin restore', () => {
  const out = normalizeExpenseCategories([{ id: 'expense-stall', name: '摊位', sortOrder: 1, visible: true, isBuiltIn: true }])
  assert.equal(out.length, 5)
  assert.ok(out.some(c => c.id === 'expense-gas'))
  const empty = normalizeExpenseCategories([])
  assert.equal(empty.length, 5, '空数组也应补回内置')
})

// T4 — normalizeProductCategories：空数组尊重存量（用户删光）；非数组 → 种子
test('T4 normalizeProductCategories', () => {
  assert.equal(normalizeProductCategories([]).length, 0)
  assert.equal(normalizeProductCategories(undefined).length, 5)
  const out = normalizeProductCategories([{ id: 'a', name: '  x ', visible: false }])
  assert.equal(out[0].name, 'x')
  assert.equal(out[0].visible, false)
})

// T5 — addProductCategory/addExpenseCategory：empty/duplicate/ok + 前缀
test('T5 add category', () => {
  const list = emptyBusinessData().productCategories
  assert.equal(addProductCategory(list, '  ').ok, false)
  assert.equal(addProductCategory(list, '小吃').reason, 'duplicate')
  const ok = addProductCategory(list, '玩具')
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.equal(ok.list.length, 6)
    assert.ok(ok.list[5].id.startsWith('bpc_'))
  }
  const elist = emptyBusinessData().expenseCategories
  const eok = addExpenseCategory(elist, '电费')
  if (eok.ok) assert.ok(eok.list[5].id.startsWith('bec_'))
})

// T6 — renameCategory：empty/duplicate/not-found/ok；支出内置可改名
test('T6 renameCategory', () => {
  const list = emptyBusinessData().productCategories
  assert.equal(renameCategory(list, 'nope', 'x').reason, 'not-found')
  assert.equal(renameCategory(list, 'product-snack', '  ').reason, 'empty')
  assert.equal(renameCategory(list, 'product-snack', '饮品').reason, 'duplicate')
  const ok = renameCategory(list, 'product-snack', '热食')
  if (ok.ok) assert.equal(ok.list[0].name, '热食')
  const elist = emptyBusinessData().expenseCategories
  const eok = renameCategory(elist, 'expense-stall', '场地费')
  if (eok.ok) assert.equal(eok.list[0].name, '场地费')
})

// T7 — toggleCategoryVisible + visible 过滤
test('T7 toggle visible', () => {
  const list = emptyBusinessData().expenseCategories
  const r = toggleCategoryVisible(list, 'expense-gas')
  if (r.ok) {
    assert.equal(r.list.find(c => c.id === 'expense-gas')!.visible, false)
    assert.equal(visibleExpenseCategories(r.list).length, 4)
  }
  assert.equal(visibleProductCategories(emptyBusinessData().productCategories).length, 5)
})

// T8 — moveCategory：boundary/not-found/中段对调 sortOrder
test('T8 moveCategory', () => {
  const list = emptyBusinessData().expenseCategories
  assert.equal(moveCategory(list, 'nope', 'up').reason, 'not-found')
  assert.equal(moveCategory(list, 'expense-stall', 'up').reason, 'boundary')
  const ok = moveCategory(list, 'expense-gas', 'up')
  if (ok.ok) {
    assert.deepEqual(ok.list.map(c => c.id)[0], 'expense-gas')
    assert.deepEqual(ok.list.map(c => c.id)[1], 'expense-stall')
  }
})

// T9 — deleteProductCategory：in-use/ok；deleteExpenseCategory：builtin/in-use/ok
test('T9 delete category', () => {
  const list = emptyBusinessData().productCategories
  assert.equal(deleteProductCategory(list, 'product-snack', true).reason, 'in-use')
  const ok = deleteProductCategory(list, 'product-snack', false)
  if (ok.ok) assert.equal(ok.list.length, 4)
  const elist = emptyBusinessData().expenseCategories
  assert.equal(deleteExpenseCategory(elist, 'expense-stall', false).reason, 'builtin')
  const custom = addExpenseCategory(elist, '电费')
  if (custom.ok) {
    assert.equal(deleteExpenseCategory(custom.list, custom.list[5].id, true).reason, 'in-use')
    const ok2 = deleteExpenseCategory(custom.list, custom.list[5].id, false)
    if (ok2.ok) assert.equal(ok2.list.length, 5)
  }
})

// T10 — isCategoryNameTaken / isValidDateKey
test('T10 helpers', () => {
  const list = emptyBusinessData().productCategories
  assert.equal(isCategoryNameTaken(' 小吃 ', 'x', list), true)
  assert.equal(isCategoryNameTaken('小吃', 'product-snack', list), false, '自身不判重')
  assert.equal(isValidDateKey('2026-08-15'), true)
  assert.equal(isValidDateKey('2026-13-01'), false)
  assert.equal(isValidDateKey('2026-8-1'), false)
})

// 构造一个满数据 BusinessData（复用各场景）
function buildData(): BusinessData {
  const base = emptyBusinessData()
  const products: BusinessProduct[] = [
    { id: 'p1', name: '烤肠', categoryId: 'product-snack', unit: '根', purchasePrice: 2, sellingPrice: 5, active: true, createdAt: '2026-08-01T00:00:00.000Z' },
    { id: 'p2', name: '柠檬水', categoryId: 'product-drink', unit: '杯', purchasePrice: 1, sellingPrice: 4, active: true, createdAt: '2026-08-01T00:00:00.000Z' }
  ]
  const purchases: BusinessPurchase[] = [
    { id: 'b1', productId: 'p1', quantity: 100, unitPrice: 2, total: 200, date: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z' },
    { id: 'b2', productId: 'p2', quantity: 50, unitPrice: 1, total: 50, date: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z' }
  ]
  const daily: BusinessDailyRecord[] = [
    {
      id: 'd1', date: '2026-08-02', totalRevenue: 100,
      items: [
        { productId: 'p1', broughtOut: 30, remaining: 5, loss: 1 },
        { productId: 'p2', broughtOut: 20, remaining: 0, loss: 0 }
      ],
      createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z'
    }
  ]
  return {
    ...base,
    products,
    purchases,
    dailyRecords: daily,
    expenses: [
      { id: 'e1', date: '2026-08-02', categoryId: 'expense-stall', amount: 30, createdAt: '2026-08-02T00:00:00.000Z' }
    ]
  }
}

// T11 — soldCount：负值钳 0、公式
test('T11 soldCount', () => {
  assert.equal(soldCount({ productId: 'x', broughtOut: 30, remaining: 5, loss: 1 }), 24)
  assert.equal(soldCount({ productId: 'x', broughtOut: 10, remaining: 12, loss: 0 }), 0)
})

// T12 — calcDailyRevenue：sold×售价、缺失商品计 0
test('T12 calcDailyRevenue', () => {
  const d = buildData()
  const items = d.dailyRecords[0].items
  // p1: 24×5=120；p2: 20×4=80 → 200（历史 totalRevenue 为示例值，此断言按公式重算）
  assert.equal(calcDailyRevenue(items, d.products), 200)
  assert.equal(calcDailyRevenue(items.concat([{ productId: 'ghost', broughtOut: 9, remaining: 0, loss: 0 }]), d.products), 200)
})

// T13 — calcInventory：进货 − 带出 + 剩余
test('T13 calcInventory', () => {
  const d = buildData()
  const stock = calcInventory(d.products, d.purchases, d.dailyRecords)
  assert.equal(stock.p1, 75) // 100 - 30 + 5
  assert.equal(stock.p2, 30) // 50 - 20 + 0
})

// T14 — calcBusinessStats：营业额/成本/利润/毛利率（成本 = 纯 COGS：Σ售出数量 × 进货价，不计支出）
test('T14 calcBusinessStats', () => {
  const d = buildData()
  // 营业额 100（示例落库值）；成本 = 售出 24×2 + 20×1 = 68（不再含进货 250 / 支出 30）
  const s = calcBusinessStats(d)
  assert.equal(s.revenue, 100)
  assert.equal(s.cost, 68)
  assert.equal(s.profit, 32)
  assert.equal(s.margin, 0.32)
  const d2: BusinessData = { ...d, dailyRecords: [{ ...d.dailyRecords[0], totalRevenue: 400 }] }
  const s2 = calcBusinessStats(d2)
  assert.equal(s2.cost, 68)
  assert.equal(s2.profit, 332)
  assert.ok(Math.abs(s2.margin - 0.83) < 1e-9)
})

// T19 — calcBusinessStats 边界：缺失商品计 0、空数据成本 0 / 营业额 0 → 毛利率 0
test('T19 calcBusinessStats edge', () => {
  const d = buildData()
  // 幽灵商品（无对应产品记录）→ COGS 计 0
  const ghost = { ...d, dailyRecords: [{ ...d.dailyRecords[0], items: [...d.dailyRecords[0].items, { productId: 'ghost', broughtOut: 9, remaining: 0, loss: 0 }] }] }
  const s1 = calcBusinessStats(ghost)
  assert.equal(s1.cost, 68) // ghost 售出 9 个不计成本
  assert.equal(s1.profit, 32)
  const empty = calcBusinessStats(emptyBusinessData())
  assert.equal(empty.revenue, 0)
  assert.equal(empty.cost, 0)
  assert.equal(empty.profit, 0)
  assert.equal(empty.margin, 0) // 营业额 0 → 毛利率 0
})

// T15 — lowStockProducts：阈值过滤 + 升序
test('T15 lowStockProducts', () => {
  const d = buildData()
  const low = lowStockProducts(d)
  // p2 库存 30 不小于阈值 20；p1 75 → 空
  assert.equal(low.length, 0)
  const d2: BusinessData = { ...d, settings: { ...d.settings, lowStockThreshold: 100 } }
  const low2 = lowStockProducts(d2)
  assert.equal(low2.length, 2)
  assert.equal(low2[0].product.id, 'p2') // 30 < 75 升序
})

// T16 — calcProductRanking / calcCategoryRanking
test('T16 rankings', () => {
  const d = buildData()
  const prod = calcProductRanking(d)
  assert.equal(prod.length, 2)
  assert.equal(prod[0].productId, 'p1') // 120 > 80
  assert.equal(prod[0].sold, 24)
  const cat = calcCategoryRanking(d)
  assert.equal(cat[0].categoryId, 'product-snack')
  assert.equal(cat[0].revenue, 120)
  assert.equal(cat[1].name, '饮品')
})

// T17 — calcBusinessTrend：窗口/缺失补零/成本利润
test('T17 calcBusinessTrend', () => {
  const d = buildData()
  const t = calcBusinessTrend(d, '2026-08-05', 7)
  assert.equal(t.length, 7)
  assert.equal(t[0].date, '2026-07-30')
  const day = t.find(x => x.date === '2026-08-02')!
  assert.equal(day.revenue, 100)
  assert.equal(day.cost, 30) // 当日仅支出 30（进货在 08-01）
  assert.equal(day.profit, 70)
  const zero = t.find(x => x.date === '2026-07-30')!
  assert.equal(zero.revenue, 0)
  assert.equal(calcBusinessTrend(d, 'bad-date').length, 0)
})

// T18 — businessTrendScale：坐标/网格线/全零态
test('T18 businessTrendScale', () => {
  const d = buildData()
  const series = calcBusinessTrend(d, '2026-08-05', 7)
  const scale = businessTrendScale(series, 900, 260)
  assert.ok(scale)
  assert.equal(scale!.gridlines.length, 5)
  assert.equal(scale!.points.length, 7)
  assert.equal(scale!.dayLabels.length > 0, true)
  const empty = calcBusinessTrend(emptyBusinessData(), '2026-08-05', 7)
  const s2 = businessTrendScale(empty, 900, 260)
  assert.ok(s2)
  assert.equal(s2!.allZero, true)
  assert.equal(businessTrendScale([], 900, 260), null)
})

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    passed++
    console.log('  ✓ ' + t.name)
  } catch (e) {
    failed++
    console.error('  ✗ ' + t.name)
    console.error(e)
  }
}
console.log('\n' + passed + '/' + tests.length + ' passed')
if (failed > 0) process.exit(1)
