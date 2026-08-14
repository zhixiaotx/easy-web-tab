import assert from 'node:assert/strict'
import {
  dateKeyOf,
  diaryDateLabel,
  emptyDiaryData,
  findDiaryByDate,
  isValidDateKey,
  normalizeDiaryData,
  sortDiaryEntries
} from '../src/composables/diaryCore.ts'
import type { WorkbenchDiary } from '../src/types'

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

/** 构造规范日记条目（仅覆盖给定字段）。 */
function mkEntry(partial: Partial<WorkbenchDiary> & { date: string }): WorkbenchDiary {
  return {
    id: partial.id ?? `dy_${partial.date}`,
    date: partial.date,
    content: partial.content ?? '',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z'
  }
}

// T1 — emptyDiaryData：空 entries + 每次全新结构（不共享引用）
test('T1 emptyDiaryData structure', () => {
  a.deepEqual(emptyDiaryData(), { entries: [] })
  a.ok(Array.isArray(emptyDiaryData().entries))
  a.equal(emptyDiaryData().entries.length, 0)
  a.notEqual(emptyDiaryData(), emptyDiaryData()) // 不共享引用
})

// T2 — normalizeDiaryData 幂等：跑两遍结果一致
test('T2 normalizeDiaryData idempotent', () => {
  const raw: any = {
    entries: [
      { id: 'dy_1', date: '2026-08-13', content: '今天写了什么', createdAt: '2026-08-13T10:00:00.000Z', updatedAt: '2026-08-13T10:00:00.000Z' },
      { id: 'dy_2', date: '2026-08-12', content: '昨天', createdAt: '2026-08-12T10:00:00.000Z', updatedAt: '2026-08-12T10:00:00.000Z' }
    ]
  }
  const once = normalizeDiaryData(raw)
  const twice = normalizeDiaryData(once)
  a.deepEqual(twice, once)
})

// T3 — normalizeDiaryData 非对象入参（null/数字/字符串/undefined/数组）→ emptyDiaryData
test('T3 normalizeDiaryData invalid input', () => {
  a.deepEqual(normalizeDiaryData(null), { entries: [] })
  a.deepEqual(normalizeDiaryData(42), { entries: [] })
  a.deepEqual(normalizeDiaryData('str'), { entries: [] })
  a.deepEqual(normalizeDiaryData(undefined), { entries: [] })
  a.deepEqual(normalizeDiaryData([{ date: '2026-08-13' }]), { entries: [] }) // 数组不是 DiaryData 对象格式
  a.deepEqual(normalizeDiaryData({ foo: 1 }), { entries: [] }) // 无 entries 字段 → 空
})

// T4 — normalizeDiaryData 非法 date 条目剔除（'2026-13-99'、'2026-02-30' 语义见 T9）；非对象条目剔除
test('T4 normalizeDiaryData drops invalid-date + non-object entries', () => {
  const data = normalizeDiaryData({
    entries: [
      mkEntry({ date: '2026-08-13' }),
      { date: '2026-13-99', content: '非法月份' }, // 非法 date → 剔除
      { id: 'dy_bad', date: 'x', content: '非法格式' }, // 非法 date → 剔除
      'not-an-object', // 非对象 → 剔除
      null // 非对象 → 剔除
    ]
  })
  a.equal(data.entries.length, 1)
  a.equal(data.entries[0].date, '2026-08-13')
})

// T5 — id 缺失/非字符串 → 回退 `dy_<date>`
test('T5 normalizeDiaryData id fallback dy_date', () => {
  const data = normalizeDiaryData({ entries: [{ date: '2026-08-13', content: '无 id' }] })
  a.equal(data.entries[0].id, 'dy_2026-08-13')
  // 非字符串 id → 回退
  const data2 = normalizeDiaryData({ entries: [{ date: '2026-08-12', id: 42 as unknown as string, content: 'x' }] })
  a.equal(data2.entries[0].id, 'dy_2026-08-12')
  // 合法字符串 id 原样保留
  const data3 = normalizeDiaryData({ entries: [{ date: '2026-08-11', id: 'dy_custom', content: 'x' }] })
  a.equal(data3.entries[0].id, 'dy_custom')
})

// T6 — content 非字符串 → ''；字符串原样保留；createdAt/updatedAt 非法 → 当前 ISO 兜底
test('T6 normalizeDiaryData content coercion + timestamps fallback', () => {
  const data = normalizeDiaryData({
    entries: [
      { date: '2026-08-13', content: 123 as unknown as string }, // 非字符串 → ''
      { date: '2026-08-12', content: '  正文  ' }, // 字符串原样保留（不 trim）
      { date: '2026-08-11', content: 'x', createdAt: 42 as unknown as string, updatedAt: {} as unknown as string } // 时间戳非法 → 兜底
    ]
  })
  a.equal(data.entries[0].content, '')
  a.equal(data.entries[1].content, '  正文  ')
  a.match(data.entries[2].createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  a.match(data.entries[2].updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
})

// T7 — dateKeyOf：本地日期无 UTC 偏移（new Date(2026,0,5) 本地 1 月 5 日 → '2026-01-05'）
test('T7 dateKeyOf local no UTC offset', () => {
  a.equal(dateKeyOf(new Date(2026, 0, 5)), '2026-01-05') // 防 UTC 偏移回归：UTC 可能是 1/4 或 1/6
  a.equal(dateKeyOf(new Date(2026, 7, 13)), '2026-08-13')
  a.equal(dateKeyOf(new Date(2026, 11, 31)), '2026-12-31')
  a.equal(dateKeyOf(new Date(2026, 0, 1)), '2026-01-01') // 补零
})

// T8 — diaryDateLabel：'YYYY-MM-DD' → 'YYYY-MM-DD 周X'（2026-08-13 是周四）
test('T8 diaryDateLabel weekday', () => {
  a.equal(diaryDateLabel('2026-08-13'), '2026-08-13 周四')
  a.equal(diaryDateLabel('2026-08-14'), '2026-08-14 周五')
  a.equal(diaryDateLabel('2026-08-16'), '2026-08-16 周日') // 周日起始索引
  a.equal(diaryDateLabel('2026-01-01'), '2026-01-01 周四') // 跨年
})

// T9 — isValidDateKey 合法：正则 ^\d{4}-\d{2}-\d{2}$ + 月 1-12 / 日 1-31 范围（镜像便签 datetime 校验语义）
test('T9 isValidDateKey valid', () => {
  a.equal(isValidDateKey('2026-08-13'), true)
  a.equal(isValidDateKey('2026-01-05'), true)
  a.equal(isValidDateKey('2026-12-31'), true)
  a.equal(isValidDateKey('2026-02-30'), true) // 范围检查语义：仅日 1-31，不校验当月天数（镜像便签先例）
})

// T10 — isValidDateKey 非法：正则拒绝 / 月越界 / 日越界
test('T10 isValidDateKey invalid', () => {
  a.equal(isValidDateKey('2026-13-99'), false) // 月越界
  a.equal(isValidDateKey('2026-01-32'), false) // 日越界
  a.equal(isValidDateKey('2026-00-01'), false) // 月 0
  a.equal(isValidDateKey('2026-01-00'), false) // 日 0
  a.equal(isValidDateKey('2026-1-5'), false) // 未补零，正则拒绝
  a.equal(isValidDateKey('abc'), false)
  a.equal(isValidDateKey(''), false)
  a.equal(isValidDateKey('2026/08/13'), false)
})

// T11 — sortDiaryEntries：date 降序（新的在前）
test('T11 sortDiaryEntries date desc', () => {
  const entries = [
    mkEntry({ date: '2026-08-10' }),
    mkEntry({ date: '2026-08-13' }),
    mkEntry({ date: '2026-08-01' }),
    mkEntry({ date: '2026-07-31' })
  ]
  const sorted = sortDiaryEntries(entries)
  a.deepEqual(sorted.map(e => e.date), ['2026-08-13', '2026-08-10', '2026-08-01', '2026-07-31'])
  a.deepEqual(entries.map(e => e.date), ['2026-08-10', '2026-08-13', '2026-08-01', '2026-07-31']) // 入参未被修改
  a.notEqual(sorted, entries) // 返回新数组
})

// T12 — sortDiaryEntries：同 date 按 createdAt 降序（平局分支）+ 稳定空数组
test('T12 sortDiaryEntries createdAt tiebreak + no mutation', () => {
  const entries = [
    mkEntry({ date: '2026-08-13', id: 'a', createdAt: '2026-08-13T08:00:00.000Z' }),
    mkEntry({ date: '2026-08-13', id: 'b', createdAt: '2026-08-13T09:00:00.000Z' }),
    mkEntry({ date: '2026-08-12', id: 'c', createdAt: '2026-08-12T10:00:00.000Z' })
  ]
  const sorted = sortDiaryEntries(entries)
  a.deepEqual(sorted.map(e => e.id), ['b', 'a', 'c']) // 同日 createdAt 新在前
  a.deepEqual(entries.map(e => e.id), ['a', 'b', 'c']) // 入参未被修改
  a.deepEqual(sortDiaryEntries([]), [])
})

// T13 — findDiaryByDate 命中：返回该日期条目
test('T13 findDiaryByDate hit', () => {
  const entries = [
    mkEntry({ date: '2026-08-13', id: 'dy_today', content: '正文' }),
    mkEntry({ date: '2026-08-12', id: 'dy_yesterday' })
  ]
  const hit = findDiaryByDate(entries, '2026-08-13')
  a.ok(hit !== undefined)
  a.equal(hit.id, 'dy_today')
  a.equal(hit.content, '正文')
})

// T14 — findDiaryByDate 未命中：undefined
test('T14 findDiaryByDate miss', () => {
  const entries = [mkEntry({ date: '2026-08-13' })]
  a.equal(findDiaryByDate(entries, '2026-08-12'), undefined)
  a.equal(findDiaryByDate(entries, '2027-01-01'), undefined)
  a.equal(findDiaryByDate([], '2026-08-13'), undefined)
})

// T15 — normalizeDiaryData：无 entries 字段 / entries 非数组 → 空 entries；合法 entries 原样归一（roundtrip）
test('T15 normalizeDiaryData empty entries + roundtrip', () => {
  const empty = normalizeDiaryData({ entries: undefined })
  a.deepEqual(empty, { entries: [] })
  a.deepEqual(normalizeDiaryData({ entries: 'nope' }), { entries: [] })
  // 存库 → 加载 roundtrip：归一化结果再归一化不变（T2 回归守护，含缺失时间戳兜底后的幂等）
  const data = normalizeDiaryData({ entries: [{ id: 'dy_1', date: '2026-08-13', content: 'x' }] })
  a.deepEqual(normalizeDiaryData(data), data)
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
  process.exit(1)
}
console.log(`\n${passed}/${tests.length} passed, ${assertCount} assertions, exit 0`)
