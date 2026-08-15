// panelPagingCore.ts 纯函数测试（15 断言 T1-T20：calcRowsPerPage/clampPage/slicePage + 新增 maxRows 行数上限 + clampMaxRows；npm run test:paging）
// 结构镜像 scripts/test-diary-core.ts（node:assert/strict Proxy 计数 + test 注册表 + 汇总退出码）
import assert from 'node:assert/strict'
import { calcRowsPerPage, clampMaxRows, clampPage, slicePage } from '../src/composables/panelPagingCore.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// 断言计数器：Proxy 包装 node:assert/strict，每次断言调用 +1（输出 assertion 总数）
let assertCount = 0
const a: typeof assert = new Proxy(assert, {
  get(t, prop) {
    const v = Reflect.get(t, prop)
    if (typeof v === 'function') {
      return (...args: unknown[]) => {
        assertCount++
        return (v as (...x: unknown[]) => unknown).apply(t, args)
      }
    }
    return v
  }
}) as typeof assert

// T1 — calcRowsPerPage 整除：availH+gap 恰为 rowH+gap 整数倍时行数精确（末行无需 gap）
test('T1 calcRowsPerPage exact multiple', () => {
  a.equal(calcRowsPerPage(48, 48, 12), 1) // (48+12)/(48+12) = 1
  a.equal(calcRowsPerPage(108, 48, 12), 2) // (108+12)/60 = 2
  a.equal(calcRowsPerPage(228, 48, 12), 4) // (228+12)/60 = 4
})

// T2 — calcRowsPerPage 余数向下取整：放不下整行的余量舍去
test('T2 calcRowsPerPage remainder floors', () => {
  a.equal(calcRowsPerPage(120, 48, 12), 2) // 132/60 = 2.2 → 2
  a.equal(calcRowsPerPage(100, 48, 12), 1) // 112/60 = 1.866 → 1
  a.equal(calcRowsPerPage(59, 48, 12), 1) // 71/60 = 1.18 → 1
})

// T3 — calcRowsPerPage availableHeight 0 → 1（保证渲染区域至少 1 行）
test('T3 calcRowsPerPage height 0 -> 1', () => {
  a.equal(calcRowsPerPage(0, 48), 1)
  a.equal(calcRowsPerPage(0, 48, 0), 1)
})

// T4 — calcRowsPerPage 负高度 → 1
test('T4 calcRowsPerPage negative height -> 1', () => {
  a.equal(calcRowsPerPage(-50, 48), 1)
  a.equal(calcRowsPerPage(-1, 48, 0), 1)
})

// T5 — calcRowsPerPage 缺省 gap = 12 生效（96+12 放不下 2 行，缺省 12 时行数 = 1）
test('T5 calcRowsPerPage default gap 12', () => {
  a.equal(calcRowsPerPage(96, 48), 1) // (96+12)/(48+12) = 1.8 → 1；若无 gap 会得 2
  a.equal(calcRowsPerPage(108, 48), 2) // (108+12)/60 = 2
})

// T6 — calcRowsPerPage gap 0 正常工作（无间距行高即槽高）
test('T6 calcRowsPerPage gap 0 works', () => {
  a.equal(calcRowsPerPage(96, 48, 0), 2) // 96/48 = 2
  a.equal(calcRowsPerPage(144, 48, 0), 3) // 144/48 = 3
})

// T7 — clampPage 范围内恒等（含边界 1 与 total）
test('T7 clampPage in-range identity', () => {
  a.equal(clampPage(2, 5), 2)
  a.equal(clampPage(1, 3), 1)
  a.equal(clampPage(5, 5), 5)
})

// T8 — clampPage page 0 → 1
test('T8 clampPage page 0 -> 1', () => {
  a.equal(clampPage(0, 5), 1)
  a.equal(clampPage(0, 3), 1)
})

// T9 — clampPage page > total → total（上界钳制）
test('T9 clampPage page overflow -> total', () => {
  a.equal(clampPage(10, 3), 3)
  a.equal(clampPage(4, 3), 3)
  a.equal(clampPage(99, 1), 1)
})

// T10 — clampPage totalPages <= 0 → 1；totalPages 1 → 恒 1
test('T10 clampPage degenerate totals', () => {
  a.equal(clampPage(5, 0), 1)
  a.equal(clampPage(0, 0), 1)
  a.equal(clampPage(1, 1), 1)
  a.equal(clampPage(-3, 1), 1)
})

// T11 — clampPage 分数页四舍五入
test('T11 clampPage fractional page rounds', () => {
  a.equal(clampPage(2.4, 5), 2)
  a.equal(clampPage(2.6, 5), 3)
  a.equal(clampPage(0.4, 5), 1)
})

// T12 — slicePage 空列表 → []；pageSize <= 0 → []
test('T12 slicePage empty input guards', () => {
  a.deepEqual(slicePage([], 1, 10), [])
  a.deepEqual(slicePage([1, 2, 3], 1, 0), [])
  a.deepEqual(slicePage([1, 2, 3], 2, -1), [])
})

// T13 — slicePage 精确 3 页切片：9 项 / 3 每页 → 三页各 3 项
test('T13 slicePage exact 3-page slicing', () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  a.deepEqual(slicePage(items, 1, 3), [1, 2, 3])
  a.deepEqual(slicePage(items, 2, 3), [4, 5, 6])
  a.deepEqual(slicePage(items, 3, 3), [7, 8, 9])
})

// T14 — slicePage 页越界钳制：5 项 / 2 每页 → 3 页；page 5 → 第 3 页；page 0 → 第 1 页
test('T14 slicePage page overflow clamped', () => {
  const items = [1, 2, 3, 4, 5]
  a.deepEqual(slicePage(items, 5, 2), [5]) // clamp 到第 3 页
  a.deepEqual(slicePage(items, 99, 2), [5])
  a.deepEqual(slicePage(items, 0, 2), [1, 2]) // clamp 到第 1 页
  a.deepEqual(slicePage(items, 3, 2), [5]) // 末页余项
})

// T15 — slicePage 不改入参（快照对比）+ 泛型类型正常工作
test('T15 slicePage no mutation + generic', () => {
  const items = ['a', 'b', 'c', 'd', 'e']
  const snapshot = [...items]
  const page = slicePage<string>(items, 2, 2)
  a.deepEqual(page, ['c', 'd'])
  a.deepEqual(items, snapshot) // 入参未被修改
  a.notEqual(page, items) // 返回新数组（slice 语义）
})

// T16 — calcRowsPerPage maxRows 上限低于自然行数 → 钳制到上限（第 4 参生效）
test('T16 calcRowsPerPage maxRows cap below natural', () => {
  a.equal(calcRowsPerPage(480, 48, 12, 3), 3) // 自然 8 行 → 上限 3
  a.equal(calcRowsPerPage(228, 48, 12, 2), 2) // 自然 4 行 → 上限 2
  a.equal(calcRowsPerPage(5000, 48, 12, 1), 1) // 自然 83 行 → 上限 1
})

// T17 — calcRowsPerPage maxRows 上限高于自然 / 缺省 / Infinity / NaN → 自然行数不变
test('T17 calcRowsPerPage maxRows above natural or absent', () => {
  a.equal(calcRowsPerPage(228, 48, 12, 20), 4) // 上限 20 > 自然 4
  a.equal(calcRowsPerPage(228, 48, 12), 4) // 缺省上限 = Infinity
  a.equal(calcRowsPerPage(228, 48, 12, Infinity), 4) // Infinity 不设上限
  a.equal(calcRowsPerPage(228, 48, 12, NaN), 4) // NaN 不设上限
})

// T18 — calcRowsPerPage 退化 maxRows（0/负/小数）→ 至少 1 行，小数向下取整
test('T18 calcRowsPerPage degenerate maxRows', () => {
  a.equal(calcRowsPerPage(480, 48, 12, 0), 1) // 上限 0 → 保底 1
  a.equal(calcRowsPerPage(480, 48, 12, -3), 1) // 负上限 → 保底 1
  a.equal(calcRowsPerPage(480, 48, 12, 2.9), 2) // 2.9 → floor 2
  a.equal(calcRowsPerPage(480, 48, 12, 3.9), 3) // 3.9 → floor 3
})

// T19 — calcRowsPerPage availableHeight <= 0 忽略上限 → 恒 1（区域至少 1 行兜底优先）
test('T19 calcRowsPerPage height <= 0 ignores maxRows', () => {
  a.equal(calcRowsPerPage(0, 48, 12, 3), 1)
  a.equal(calcRowsPerPage(-50, 48, 12, 1), 1)
})

// T20 — clampMaxRows 独立纯函数：undefined/Infinity/NaN → Infinity；0/负 → 1；小数向下取整
test('T20 clampMaxRows unit', () => {
  a.equal(clampMaxRows(undefined), Infinity)
  a.equal(clampMaxRows(5), 5)
  a.equal(clampMaxRows(0), 1)
  a.equal(clampMaxRows(-3), 1)
  a.equal(clampMaxRows(3.7), 3)
  a.equal(clampMaxRows(Infinity), Infinity)
  a.equal(clampMaxRows(NaN), Infinity)
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
if (failed > 0) {
  console.error(`\n${passed}/${tests.length} passed, ${assertCount} assertions, exit 1`)
  process.exitCode = 1
} else {
  console.log(`\n${passed}/${tests.length} passed, ${assertCount} assertions, exit 0`)
}
