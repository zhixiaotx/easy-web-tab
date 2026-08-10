import assert from 'node:assert/strict'
import {
  AUTO_COPY_CATEGORY_IDS,
  calcDepositTotal,
  calcMonthlyStats,
  emptyLedgerData,
  expenseCategories,
  findCategory,
  formatYuan,
  incomeCategories,
  maskOrReveal,
  monthKeyOf,
  normalizeLedgerData,
  normalizeLedgerEntry,
  planAutoCopy,
  prevMonthKeyOf
} from '../src/composables/ledgerCore.ts'
import { DEFAULT_LEDGER_CATEGORIES } from '../src/types/index.ts'
import type { LedgerCategory, LedgerEntry } from '../src/types'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

/** 构造规范流水（分类 id 直接引用 DEFAULT_LEDGER_CATEGORIES 的内置 id）。 */
function mkEntry(id: string, date: string, categoryId: string, amount: number): LedgerEntry {
  return {
    id,
    date,
    categoryId,
    amount,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

// T1 — emptyLedgerData：内置分类展开拷贝 + 空流水 + mutation 隔离
test('T1 emptyLedgerData copy + isolation', () => {
  const empty = emptyLedgerData()
  assert.deepEqual(empty.categories, DEFAULT_LEDGER_CATEGORIES)
  assert.deepEqual(empty.entries, [])
  assert.equal(empty.categories.length, 8)
  assert.ok(empty.categories.every(c => c.isBuiltIn === true))
  // 修改返回值不影响常量（展开拷贝防共享引用）
  empty.categories[0].name = '被改'
  empty.categories[0].type = 'expense'
  assert.equal(DEFAULT_LEDGER_CATEGORIES[0].name, '工资')
  assert.equal(DEFAULT_LEDGER_CATEGORIES[0].type, 'income')
})

// T2 — monthKeyOf：取前 7 位 'YYYY-MM'
test('T2 monthKeyOf', () => {
  assert.equal(monthKeyOf('2026-08-15'), '2026-08')
  assert.equal(monthKeyOf('2026-12-31'), '2026-12')
  assert.equal(monthKeyOf('2026-08'), '2026-08')
})

// T3 — 空月：income/expense/balance/count 全 0，ratio null，byCategory 空
test('T3 calcMonthlyStats empty month', () => {
  const stats = calcMonthlyStats([], '2026-08', DEFAULT_LEDGER_CATEGORIES)
  assert.equal(stats.income, 0)
  assert.equal(stats.expense, 0)
  assert.equal(stats.balance, 0)
  assert.equal(stats.expenseCount, 0)
  assert.equal(stats.expenseRatio, null)
  assert.deepEqual(stats.byCategory, [])
})

// T4 — 收入 10000 + 支出 2500（早餐20+午餐30+房贷2450），跨月流水被过滤
test('T4 calcMonthlyStats income + expense with month filter', () => {
  const entries = [
    mkEntry('e1', '2026-08-05', 'salary', 10000),
    mkEntry('e2', '2026-08-01', 'breakfast', 20),
    mkEntry('e3', '2026-08-02', 'lunch', 30),
    mkEntry('e4', '2026-08-03', 'mortgage', 2450),
    mkEntry('e5', '2026-07-31', 'lunch', 999), // 上月，应被过滤
    mkEntry('e6', '2026-09-01', 'lunch', 999) // 下月，应被过滤
  ]
  const stats = calcMonthlyStats(entries, '2026-08', DEFAULT_LEDGER_CATEGORIES)
  assert.equal(stats.income, 10000)
  assert.equal(stats.expense, 2500)
  assert.equal(stats.balance, 7500)
  assert.equal(stats.expenseCount, 3)
  assert.equal(stats.expenseRatio, 0.25)
})

// T5 — 结余为负（支出 > 收入）
test('T5 calcMonthlyStats negative balance', () => {
  const entries = [mkEntry('e1', '2026-08-01', 'salary', 50), mkEntry('e2', '2026-08-02', 'mortgage', 100)]
  const stats = calcMonthlyStats(entries, '2026-08', DEFAULT_LEDGER_CATEGORIES)
  assert.equal(stats.income, 50)
  assert.equal(stats.expense, 100)
  assert.equal(stats.balance, -50)
  assert.equal(stats.expenseRatio, 2)
})

// T6 — byCategory 占比：100 + 300 → 0.25 / 0.75，sum 1
test('T6 calcMonthlyStats byCategory percent', () => {
  const entries = [mkEntry('e1', '2026-08-01', 'breakfast', 100), mkEntry('e2', '2026-08-02', 'dinner', 300)]
  const stats = calcMonthlyStats(entries, '2026-08', DEFAULT_LEDGER_CATEGORIES)
  assert.equal(stats.expense, 400)
  assert.deepEqual(stats.byCategory, [
    { categoryId: 'breakfast', total: 100, percent: 0.25 },
    { categoryId: 'dinner', total: 300, percent: 0.75 }
  ])
  const sum = stats.byCategory.reduce((s, b) => s + b.percent, 0)
  assert.equal(Math.round(sum * 10000) / 10000, 1)
})

// T7 — expense===0：byCategory 空；income>0 时 ratio 为 0
test('T7 calcMonthlyStats no expense', () => {
  const entries = [mkEntry('e1', '2026-08-01', 'salary', 10000)]
  const stats = calcMonthlyStats(entries, '2026-08', DEFAULT_LEDGER_CATEGORIES)
  assert.equal(stats.income, 10000)
  assert.equal(stats.expense, 0)
  assert.equal(stats.expenseCount, 0)
  assert.equal(stats.expenseRatio, 0)
  assert.deepEqual(stats.byCategory, [])
})

// T8 — unknown 分类（categoryId 不存在）计入支出，byCategory 用 'unknown'
test('T8 calcMonthlyStats unknown category', () => {
  const entries = [mkEntry('e1', '2026-08-01', 'nonexistent', 80), mkEntry('e2', '2026-08-02', 'breakfast', 20)]
  const stats = calcMonthlyStats(entries, '2026-08', DEFAULT_LEDGER_CATEGORIES)
  assert.equal(stats.expense, 100)
  assert.equal(stats.expenseCount, 2)
  assert.equal(stats.expenseRatio, null) // income 0 → null
  assert.deepEqual(stats.byCategory, [
    { categoryId: 'unknown', total: 80, percent: 0.8 },
    { categoryId: 'breakfast', total: 20, percent: 0.2 }
  ])
})

// T9 — normalizeLedgerData：内置脏改恢复 / 自定义保留 / 空名剔除 / isBuiltIn 脏 true → false / id 冲突重排
test('T9 normalizeLedgerData categories', () => {
  const data = normalizeLedgerData({
    categories: [
      { id: 'salary', name: '被乱改', type: 'expense', isBuiltIn: true },
      { id: 'custom-a', name: ' 旅行 ', type: 'expense', isBuiltIn: true },
      { id: 'custom-b', name: '奖金', type: 'income', isBuiltIn: false },
      { id: 'custom-c', name: '   ', type: 'expense', isBuiltIn: false },
      { id: 'salary', name: '撞内置id', type: 'income', isBuiltIn: false },
      { id: 'custom-b', name: '撞自定义id', type: 'expense', isBuiltIn: false }
    ]
  })
  const cats = data.categories
  assert.deepEqual(data.entries, [])
  // 8 内置 + custom-a + custom-b + 2 条 id 冲突重排 = 12
  assert.equal(cats.length, 12)
  // id 全部唯一
  assert.equal(new Set(cats.map(c => c.id)).size, cats.length)
  // 内置 8 组恒取常量值（脏改的 salary 恢复为 工资/income）
  for (const b of DEFAULT_LEDGER_CATEGORIES) {
    const found = cats.find(c => c.id === b.id)
    assert.ok(found)
    assert.deepEqual(found, b)
  }
  // 自定义：trim 保留、类型保留、isBuiltIn 脏 true → false
  const customA = cats.find(c => c.id === 'custom-a')
  assert.ok(customA)
  assert.equal(customA.name, '旅行')
  assert.equal(customA.type, 'expense')
  assert.equal(customA.isBuiltIn, false)
  const customB = cats.find(c => c.id === 'custom-b')
  assert.ok(customB)
  assert.equal(customB.name, '奖金')
  assert.equal(customB.type, 'income')
  assert.equal(customB.isBuiltIn, false)
  // 空名剔除
  assert.ok(cats.every(c => c.name.trim().length > 0))
  // 冲突重排的两条 id 为 cat_ 前缀
  assert.equal(cats.filter(c => c.id.startsWith('cat_')).length, 2)
})

// T10 — normalizeLedgerEntry：负数钳 0 / NaN→0 / 非法日期回落当天（只断言格式）/ 非字符串兜底 / id 前缀
test('T10 normalizeLedgerEntry dirty data', () => {
  const e = normalizeLedgerEntry({
    amount: -5,
    date: '2026/08/01',
    categoryId: 123,
    note: 42,
    id: '',
    createdAt: 7,
    updatedAt: 8
  })
  assert.equal(e.amount, 0) // 负数钳 0
  assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/) // 非法日期 → 当天，只断言格式（不依赖当前日期）
  assert.equal(e.categoryId, '')
  assert.equal(e.note, undefined)
  assert.ok(e.id.startsWith('ld_'))
  assert.ok(e.createdAt.length > 0)
  assert.ok(e.updatedAt.length > 0)

  assert.equal(normalizeLedgerEntry({ amount: '12.345' }).amount, 12.35) // 保留 2 位小数（round 具体值）
  assert.equal(normalizeLedgerEntry({ amount: 'abc' }).amount, 0) // NaN → 0

  const passthrough = normalizeLedgerEntry({ id: 'keep-me', date: '2026-08-15', categoryId: 'lunch', amount: 33.3, note: '备注' })
  assert.equal(passthrough.id, 'keep-me')
  assert.equal(passthrough.date, '2026-08-15')
  assert.equal(passthrough.categoryId, 'lunch')
  assert.equal(passthrough.amount, 33.3)
  assert.equal(passthrough.note, '备注')

  const empty = normalizeLedgerEntry(undefined)
  assert.ok(empty.id.startsWith('ld_'))
  assert.match(empty.date, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(empty.categoryId, '')
  assert.equal(empty.amount, 0)
})

// T11 — findCategory / incomeCategories / expenseCategories（filter 新数组不 mutate）
test('T11 findCategory + income/expenseCategories', () => {
  assert.equal(findCategory(DEFAULT_LEDGER_CATEGORIES, 'salary')?.id, 'salary')
  assert.equal(findCategory(DEFAULT_LEDGER_CATEGORIES, 'breakfast')?.name, '早餐')
  assert.equal(findCategory(DEFAULT_LEDGER_CATEGORIES, 'nope'), undefined)

  const incomes = incomeCategories(DEFAULT_LEDGER_CATEGORIES)
  const expenses = expenseCategories(DEFAULT_LEDGER_CATEGORIES)
  assert.equal(incomes.length, 1)
  assert.equal(incomes[0].id, 'salary')
  assert.equal(expenses.length, 7)
  assert.ok(incomes.every(c => c.type === 'income'))
  assert.ok(expenses.every(c => c.type === 'expense'))
  // filter 返回新数组，入参不被 mutate
  assert.notEqual(incomes, DEFAULT_LEDGER_CATEGORIES)
  assert.notEqual(expenses, DEFAULT_LEDGER_CATEGORIES)
  assert.equal(DEFAULT_LEDGER_CATEGORIES.length, 8)
})

// T12 — formatYuan 固定 2 位小数
test('T12 formatYuan', () => {
  assert.equal(formatYuan(100), '100.00')
  assert.equal(formatYuan(12.5), '12.50')
  assert.equal(formatYuan(0), '0.00')
  assert.equal(formatYuan(0.256), '0.26')
})

// T13 — normalizeLedgerData：entries 非数组 → []；不 mutate 入参；undefined 入参兜底；entries 逐条归一
test('T13 normalizeLedgerData entries + no mutation', () => {
  const raw = {
    categories: [{ id: 'custom-x', name: '宠物', type: 'expense', isBuiltIn: false }],
    entries: 'not-an-array'
  }
  const data = normalizeLedgerData(raw as unknown as Partial<LedgerData>)
  assert.deepEqual(data.entries, [])
  // 不 mutate 入参
  assert.equal(raw.categories[0].name, '宠物')
  assert.equal(raw.categories[0].type, 'expense')
  assert.equal(raw.categories[0].isBuiltIn, false)
  assert.equal(data.categories.length, 9) // 8 内置 + custom-x
  const customX = data.categories.find(c => c.id === 'custom-x')
  assert.ok(customX)
  assert.equal(customX.name, '宠物')

  // undefined 入参 → 全内置 + 空流水
  const empty = normalizeLedgerData(undefined)
  assert.deepEqual(empty.categories, DEFAULT_LEDGER_CATEGORIES)
  assert.deepEqual(empty.entries, [])

  // entries 逐条归一
  const withEntries = normalizeLedgerData({ entries: [{ amount: -5, date: 'bad/date', id: '' }] })
  assert.equal(withEntries.entries.length, 1)
  assert.equal(withEntries.entries[0].amount, 0)
  assert.ok(withEntries.entries[0].id.startsWith('ld_'))
  assert.match(withEntries.entries[0].date, /^\d{4}-\d{2}-\d{2}$/)
})

// T14 — calcDepositTotal：空流水 → 0
test('T14 calcDepositTotal empty entries', () => {
  assert.equal(calcDepositTotal([], '2026-08', DEFAULT_LEDGER_CATEGORIES), 0)
})

// T15 — calcDepositTotal：跨月累计结余（每月 income - expense 累加；只累计到 upToMonthKey）
test('T15 calcDepositTotal cross-month cumulative balance', () => {
  const entries = [
    mkEntry('e1', '2026-06-05', 'salary', 10000),
    mkEntry('e2', '2026-06-06', 'lunch', 200), // 6 月结余 9800
    mkEntry('e3', '2026-07-01', 'breakfast', 100),
    mkEntry('e4', '2026-07-02', 'dinner', 300) // 7 月结余 -400
  ]
  // 累计到 7 月：9800 - 400 = 9400
  assert.equal(calcDepositTotal(entries, '2026-07', DEFAULT_LEDGER_CATEGORIES), 9400)
  // 只累计到 6 月：9800（证明 upToMonthKey 之后的月份被排除）
  assert.equal(calcDepositTotal(entries, '2026-06', DEFAULT_LEDGER_CATEGORIES), 9800)
})

// T16 — calcDepositTotal：只计 ≤ upToMonthKey 的月份 + 未知分类计入支出
test('T16 calcDepositTotal month cutoff + unknown category as expense', () => {
  const entries = [
    mkEntry('e1', '2026-07-01', 'salary', 5000),
    mkEntry('e2', '2026-07-02', 'mortgage', 2000),
    mkEntry('e3', '2026-07-03', 'nonexistent', 300), // 未知分类 → 支出
    mkEntry('e4', '2026-08-01', 'salary', 8000) // 8 月，超出 upToMonthKey → 排除
  ]
  // 7 月结余 = 5000 - 2000 - 300 = 2700；8 月（超出 upToMonthKey）排除、未知分类计入支出
  assert.equal(
    calcDepositTotal(entries, '2026-07', DEFAULT_LEDGER_CATEGORIES),
    2700,
    '应只累计到 2026-07：salary 5000 减 mortgage 2000 再减 unknown 300，8 月流水不参与'
  )
})

// T17 — planAutoCopy：目标月无工资/房贷、上月有 → 复制上月金额（date=目标月-01）
test('T17 planAutoCopy copies from last month', () => {
  const entries = [
    mkEntry('e1', '2026-07-10', 'salary', 10000),
    mkEntry('e2', '2026-07-01', 'mortgage', 2450)
  ]
  const drafts = planAutoCopy(entries, '2026-08')
  assert.equal(drafts.length, 2)
  const salary = drafts.find(d => d.categoryId === 'salary')
  const mortgage = drafts.find(d => d.categoryId === 'mortgage')
  assert.deepEqual(salary, { date: '2026-08-01', categoryId: 'salary', amount: 10000 })
  assert.deepEqual(mortgage, { date: '2026-08-01', categoryId: 'mortgage', amount: 2450 })
})

// T18 — planAutoCopy：目标月已有该分类 → 幂等跳过（不重复复制）
test('T18 planAutoCopy idempotent when target month has entry', () => {
  const entries = [
    mkEntry('e1', '2026-07-10', 'salary', 10000),
    mkEntry('e2', '2026-07-01', 'mortgage', 2450),
    mkEntry('e3', '2026-08-15', 'salary', 12000) // 本月已有工资 → 跳过
  ]
  const drafts = planAutoCopy(entries, '2026-08')
  assert.equal(drafts.length, 1)
  assert.deepEqual(drafts[0], { date: '2026-08-01', categoryId: 'mortgage', amount: 2450 })
})

// T19 — planAutoCopy：上月无记录/目标月无上月数据 → 空（不跨月回溯）
test('T19 planAutoCopy skips when no source in last month', () => {
  // 上月只有 salary，无 mortgage → 只补 salary
  const entries = [mkEntry('e1', '2026-07-10', 'salary', 10000)]
  const drafts = planAutoCopy(entries, '2026-08')
  assert.equal(drafts.length, 1)
  assert.deepEqual(drafts[0], { date: '2026-08-01', categoryId: 'salary', amount: 10000 })

  // 上月完全没有记录 → 空
  assert.deepEqual(planAutoCopy([mkEntry('e2', '2026-06-01', 'salary', 5000)], '2026-08'), [])
  // 空库 → 空
  assert.deepEqual(planAutoCopy([], '2026-08'), [])
})

// T20 — prevMonthKeyOf：跨年回退
test('T20 prevMonthKeyOf cross-year', () => {
  assert.equal(prevMonthKeyOf('2026-08'), '2026-07')
  assert.equal(prevMonthKeyOf('2026-01'), '2025-12')
  assert.equal(prevMonthKeyOf('2025-03'), '2025-02')
})

// T21 — planAutoCopy：上月同分类多条 → 取 date 最新一条；AUTO_COPY_CATEGORY_IDS 固定为 salary+mortgage
test('T21 planAutoCopy latest entry + category ids constant', () => {
  const entries = [
    mkEntry('e1', '2026-07-05', 'salary', 9000),
    mkEntry('e2', '2026-07-20', 'salary', 11000), // 最新
    mkEntry('e3', '2026-07-01', 'mortgage', 2450)
  ]
  const drafts = planAutoCopy(entries, '2026-08')
  const salary = drafts.find(d => d.categoryId === 'salary')
  assert.deepEqual(salary, { date: '2026-08-01', categoryId: 'salary', amount: 11000 })

  assert.deepEqual(AUTO_COPY_CATEGORY_IDS, ['salary', 'mortgage'])
  for (const id of AUTO_COPY_CATEGORY_IDS) {
    const cat = DEFAULT_LEDGER_CATEGORIES.find(c => c.id === id)
    assert.ok(cat, `内置分类应存在: ${id}`)
    assert.equal(cat.type, id === 'salary' ? 'income' : 'expense')
  }
})

// T22 — maskOrReveal：mask 为 true → 掩码
test('T22 maskOrReveal masks amount when hide is true', () => {
  assert.strictEqual(maskOrReveal('123.45', true), '****')
})

// T23 — maskOrReveal：mask 为 false → 原样返回
test('T23 maskOrReveal reveals amount when hide is false', () => {
  assert.strictEqual(maskOrReveal('123.45', false), '123.45')
})

// T24 — maskOrReveal：空串也掩码
test('T24 maskOrReveal masks empty string too', () => {
  assert.strictEqual(maskOrReveal('', true), '****')
})

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    passed++
    console.log(`  ✓ ${t.name}`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${t.name}`)
    console.error(e)
  }
}
console.log(`\n${passed}/${tests.length} passed`)
if (failed > 0) process.exit(1)
