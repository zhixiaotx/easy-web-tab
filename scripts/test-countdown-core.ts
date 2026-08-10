import assert from 'node:assert/strict'
import yaml from 'js-yaml'
import {
  parseRepeat,
  normalizeCountdown,
  calcNextOccurrence,
  getReminderDue,
  calcRemaining,
  repeatLabel,
  categoryLabel,
  serializeRepeatYaml,
  filterCountdowns,
  moveCustomCategoryInList
} from '../src/composables/countdownCore.ts'
import type { Countdown, CountdownCategory, CountdownRepeat } from '../src/types'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// S1 — parseRepeat legacy string
test('S1 parseRepeat legacy', () => {
  assert.deepEqual(parseRepeat('yearly'), { type: 'yearly' })
})

// S2 — parseRepeat invalid / canonical
test('S2 parseRepeat invalid/canonical', () => {
  assert.equal(parseRepeat(42), null)
  assert.equal(parseRepeat({}), null)
  assert.equal(parseRepeat({ type: 'bogus' }), null)
  assert.deepEqual(parseRepeat({ type: 'weekly', daysOfWeek: [0, 8, 1, 1] }), { type: 'weekly', daysOfWeek: [1] })
  assert.equal(parseRepeat({ type: 'interval', intervalMinutes: 0 }), null)
  assert.equal(parseRepeat({ type: 'once' }), null)
  assert.equal(parseRepeat('once'), null)
  assert.equal(parseRepeat(null), null)
})

// S3 — normalizeCountdown defaults + legacy migration + passthrough
test('S3 normalizeCountdown', () => {
  const base = normalizeCountdown({})
  assert.equal(base.category, 'work')
  assert.equal(base.repeat, null)

  const migrated = normalizeCountdown({ repeat: 'yearly' })
  assert.equal(migrated.category, 'work')
  assert.deepEqual(migrated.repeat, { type: 'yearly' })

  const passthrough = normalizeCountdown({ category: 'study', lastRemindedAt: '2026-08-04 09:00' })
  assert.equal(passthrough.category, 'study')
  assert.equal(passthrough.lastRemindedAt, '2026-08-04 09:00')

  // 内置分类：exercise/diet/sleep 保留
  assert.equal(normalizeCountdown({ category: 'exercise' }).category, 'exercise')
  assert.equal(normalizeCountdown({ category: 'diet' }).category, 'diet')
  assert.equal(normalizeCountdown({ category: 'sleep' }).category, 'sleep')
  // 自定义分类：任意非空字符串保留（trim），不再回退 'work'
  assert.equal(normalizeCountdown({ category: 'bogus' }).category, 'bogus')
  assert.equal(normalizeCountdown({ category: ' 健身 ' }).category, '健身')
  // 空串 / 非字符串 → 缺省 'work'
  assert.equal(normalizeCountdown({ category: '' }).category, 'work')
  assert.equal(normalizeCountdown({ category: '   ' }).category, 'work')
  assert.equal(normalizeCountdown({ category: 42 as unknown as string }).category, 'work')
})

// S3b — color normalization: valid hex kept, invalid/absent → default blue
test('S3b normalizeCountdown color', () => {
  assert.equal(normalizeCountdown({}).color, '#3b82f6')
  assert.equal(normalizeCountdown({ color: '#EF4444' }).color, '#EF4444')
  assert.equal(normalizeCountdown({ color: '#f00' }).color, '#f00')
  assert.equal(normalizeCountdown({ color: 'red' }).color, '#3b82f6')
  assert.equal(normalizeCountdown({ color: '' }).color, '#3b82f6')
  assert.equal(normalizeCountdown({ color: 123 as unknown as string }).color, '#3b82f6')
})

// S3c — filterCountdowns: name fuzzy / category / repeat type / combined / empty
function mkCountdown(id: string, name: string, repeat: Countdown['repeat'], category: Countdown['category'] = 'work'): Countdown {
  return {
    id,
    name,
    endDateTime: '2026-12-31T09:00',
    repeat,
    category,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

test('S3c filterCountdowns', () => {
  const items = [
    mkCountdown('a', '年终总结', null, 'work'),
    mkCountdown('b', '周会提醒', { type: 'weekly', daysOfWeek: [1] }, 'work'),
    mkCountdown('c', '年体检', 'yearly', 'life'),
    mkCountdown('d', '晨练', { type: 'daily' }, 'life'),
    mkCountdown('e', '发薪日', { type: 'monthly', dayOfMonth: 15 }, 'exercise'),
    mkCountdown('f', '撸铁计划', { type: 'daily' }, '健身')
  ]
  // 空条件 → 全部
  assert.equal(filterCountdowns(items).length, 6)
  assert.equal(filterCountdowns(items, {}).length, 6)
  // 名称模糊（子串 + trim + 大小写无关）
  assert.deepEqual(filterCountdowns(items, { name: '年' }).map(i => i.id), ['a', 'c'])
  assert.deepEqual(filterCountdowns(items, { name: ' 周会 ' }).map(i => i.id), ['b'])
  // 分类精确
  assert.deepEqual(filterCountdowns(items, { category: 'life' }).map(i => i.id), ['c', 'd'])
  // 新分类 exercise 精确筛选
  assert.deepEqual(filterCountdowns(items, { category: 'exercise' }).map(i => i.id), ['e'])
  // 自定义分类精确筛选（字符串相等即可）
  assert.deepEqual(filterCountdowns(items, { category: '健身' }).map(i => i.id), ['f'])
  // 重复规则：once（null 归一）、daily、旧字符串 'yearly'
  assert.deepEqual(filterCountdowns(items, { repeat: 'once' }).map(i => i.id), ['a'])
  assert.deepEqual(filterCountdowns(items, { repeat: 'daily' }).map(i => i.id), ['d', 'f'])
  assert.deepEqual(filterCountdowns(items, { repeat: 'yearly' }).map(i => i.id), ['c'])
  // 组合条件
  assert.deepEqual(filterCountdowns(items, { category: 'work', repeat: 'weekly' }).map(i => i.id), ['b'])
  assert.equal(filterCountdowns(items, { name: '年', category: 'life' }).length, 1)
})

// S4 — calcNextOccurrence once: future + expired display semantics
test('S4 calcNextOccurrence once', () => {
  assert.equal(calcNextOccurrence('2026-08-10T09:00', null, new Date('2026-08-04T12:00')), '2026-08-10 09:00')
  assert.equal(calcNextOccurrence('2026-08-10T09:00', null, new Date('2026-08-12T12:00')), '2026-08-10 09:00')
})

// S5 — daily rollover
test('S5 calcNextOccurrence daily', () => {
  assert.equal(calcNextOccurrence('2026-08-04T09:00', { type: 'daily' }, new Date('2026-08-04T08:00')), '2026-08-04 09:00')
  assert.equal(calcNextOccurrence('2026-08-04T09:00', { type: 'daily' }, new Date('2026-08-04T12:00')), '2026-08-05 09:00')
})

// S6 — weekly slots + endDate anchoring
test('S6 calcNextOccurrence weekly (anchor respected)', () => {
  assert.equal(
    calcNextOccurrence('2026-08-04T09:00', { type: 'weekly', daysOfWeek: [1, 3, 5] }, new Date('2026-08-04T12:00')),
    '2026-08-05 09:00'
  )
  assert.equal(
    calcNextOccurrence('2026-08-10T09:00', { type: 'weekly', daysOfWeek: [1, 3, 5] }, new Date('2026-08-04T12:00')),
    '2026-08-10 09:00'
  )
})

// S7 — monthly day-of-month clamping
test('S7 calcNextOccurrence monthly clamp', () => {
  assert.equal(
    calcNextOccurrence('2026-01-31T09:00', { type: 'monthly', dayOfMonth: 31 }, new Date('2026-02-10T12:00')),
    '2026-02-28 09:00'
  )
  assert.equal(
    calcNextOccurrence('2026-01-31T09:00', { type: 'monthly', dayOfMonth: 31 }, new Date('2026-03-01T08:00')),
    '2026-03-31 09:00'
  )
})

// S8 — yearly rollover + leap-day clamping
test('S8 calcNextOccurrence yearly (rollover + leap)', () => {
  assert.equal(calcNextOccurrence('2025-06-15T09:00', { type: 'yearly' }, new Date('2026-08-04T12:00')), '2027-06-15 09:00')
  assert.equal(calcNextOccurrence('2024-02-29T09:00', { type: 'yearly' }, new Date('2026-08-04T12:00')), '2027-02-28 09:00')
})

// S9 — interval slots + future anchoring
test('S9 calcNextOccurrence interval', () => {
  assert.equal(
    calcNextOccurrence('2026-08-04T08:00', { type: 'interval', intervalMinutes: 45 }, new Date('2026-08-04T08:00')),
    '2026-08-04 08:00'
  )
  assert.equal(
    calcNextOccurrence('2026-08-04T08:00', { type: 'interval', intervalMinutes: 45 }, new Date('2026-08-04T09:30')),
    '2026-08-04 09:30'
  )
  assert.equal(
    calcNextOccurrence('2026-08-04T08:00', { type: 'interval', intervalMinutes: 45 }, new Date('2026-08-04T09:00')),
    '2026-08-04 09:30'
  )
  assert.equal(
    calcNextOccurrence('2026-08-10T09:00', { type: 'interval', intervalMinutes: 45 }, new Date('2026-08-04T12:00')),
    '2026-08-10 09:00'
  )
})

// S10 — getReminderDue: once suppress, daily cycle, interval catch-up
test('S10 getReminderDue', () => {
  // once: fires once, suppressed by lastRemindedAt
  assert.equal(getReminderDue('2026-08-04T09:00', null, undefined, new Date('2026-08-04T10:00')), '2026-08-04 09:00')
  assert.equal(getReminderDue('2026-08-04T09:00', null, '2026-08-04 09:00', new Date('2026-08-04T10:00')), null)

  // daily: due at the 09:00 slot; same slot already reminded → null; next day → next slot
  assert.equal(getReminderDue('2026-08-04T09:00', { type: 'daily' }, undefined, new Date('2026-08-04T09:00')), '2026-08-04 09:00')
  assert.equal(getReminderDue('2026-08-04T09:00', { type: 'daily' }, '2026-08-04 09:00', new Date('2026-08-04T12:00')), null)
  assert.equal(getReminderDue('2026-08-04T09:00', { type: 'daily' }, '2026-08-04 09:00', new Date('2026-08-05T10:00')), '2026-08-05 09:00')

  // interval catch-up: 3-day suspension → most recent slot only (fires once)
  assert.equal(
    getReminderDue('2026-08-01T08:00', { type: 'interval', intervalMinutes: 60 }, undefined, new Date('2026-08-04T10:30')),
    '2026-08-04 10:00'
  )
})

// S11 — labels + YAML round-trip
test('S11 repeatLabel/categoryLabel', () => {
  assert.equal(repeatLabel(null), '一次性')
  assert.equal(repeatLabel({ type: 'daily' }), '每天')
  const weeklyLabel = repeatLabel({ type: 'weekly', daysOfWeek: [1, 3, 5] })
  assert.ok(weeklyLabel.includes('周一') && weeklyLabel.includes('周五'), `weekly label: ${weeklyLabel}`)
  assert.equal(repeatLabel({ type: 'monthly', dayOfMonth: 15 }), '每月 15 日')
  assert.equal(repeatLabel({ type: 'yearly' }), '每年')
  assert.equal(repeatLabel({ type: 'interval', intervalMinutes: 45 }), '每 45 分钟')

  assert.equal(categoryLabel(), '工作')
  assert.equal(categoryLabel('life'), '生活')
  assert.equal(categoryLabel('exercise'), '运动')
  assert.equal(categoryLabel('diet'), '饮食')
  assert.equal(categoryLabel('sleep'), '睡眠')
  // 自定义分类：分类名即标签；空串/undefined 按缺省 '工作'
  assert.equal(categoryLabel('健身'), '健身')
  assert.equal(categoryLabel('bogus'), 'bogus')
  assert.equal(categoryLabel(''), '工作')
})

test('S11 serializeRepeatYaml round-trip via js-yaml', () => {
  assert.equal(serializeRepeatYaml(null), '')

  const rules: CountdownRepeat[] = [
    { type: 'weekly', daysOfWeek: [1, 3, 5] },
    { type: 'monthly', dayOfMonth: 31 },
    { type: 'interval', intervalMinutes: 45 }
  ]
  for (const r of rules) {
    const loaded = yaml.load(serializeRepeatYaml(r)) as { repeat?: unknown }
    assert.deepEqual(parseRepeat(loaded.repeat), r, `round-trip ${JSON.stringify(r)}`)
  }
})

// calcRemaining: shape/structure only (no exact-time assertions)
test('calcRemaining shape', () => {
  const once = calcRemaining('2030-01-01T09:00')
  for (const key of ['days', 'hours', 'minutes', 'label', 'status', 'nextTime', 'isExpired'] as const) {
    assert.ok(key in once, `missing key: ${key}`)
  }
  assert.equal(typeof once.days, 'number')
  assert.equal(typeof once.hours, 'number')
  assert.equal(typeof once.minutes, 'number')
  assert.equal(typeof once.label, 'string')
  assert.equal(typeof once.status, 'string')
  assert.equal(typeof once.nextTime, 'string')
  assert.equal(typeof once.isExpired, 'boolean')
})

// S12 — moveCustomCategoryInList（上移/下移交换、边界原地、not-found 原地、不修改入参）
test('S12 moveCustomCategoryInList', () => {
  const list = ['a', 'b', 'c']
  assert.deepEqual(moveCustomCategoryInList(list, 'b', 'up'), ['b', 'a', 'c'])
  assert.deepEqual(moveCustomCategoryInList(list, 'b', 'down'), ['a', 'c', 'b'])
  assert.deepEqual(moveCustomCategoryInList(list, 'a', 'up'), ['a', 'b', 'c'])
  assert.deepEqual(moveCustomCategoryInList(list, 'c', 'down'), ['a', 'b', 'c'])
  assert.deepEqual(moveCustomCategoryInList(list, 'x', 'up'), ['a', 'b', 'c'])
  assert.deepEqual(list, ['a', 'b', 'c'])
})

let failed = 0
for (const t of tests) {
  try {
    t.fn()
    console.log(`PASS  ${t.name}`)
  } catch (e) {
    failed++
    console.error(`FAIL  ${t.name}\n      ${e instanceof Error ? e.message : e}`)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`)
process.exit(failed > 0 ? 1 : 0)
