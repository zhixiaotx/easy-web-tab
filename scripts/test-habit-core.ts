import assert from 'node:assert/strict'
import {
  DEFAULT_HABIT_COLOR,
  emptyHabitsData,
  normalizeHabit,
  normalizeHabitRecord,
  normalizeHabitsData,
  streakDays,
  streakOf,
  weekCompletions,
  weeklyAttainment
} from '../src/composables/habitCore.ts'
import type { Habit, HabitRecord, HabitsData } from '../src/composables/habitCore.ts'

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

/** 构造规范打卡记录（仅覆盖给定字段）。 */
function mkRecord(partial: Partial<HabitRecord> & { habitId: string; date: string }): HabitRecord {
  return {
    id: partial.id ?? `hr_${partial.habitId}_${partial.date}`,
    habitId: partial.habitId,
    date: partial.date,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z'
  }
}

/** 构造规范习惯（默认频率 3/每周，仅覆盖给定字段）。 */
function mkHabit(partial: Partial<Habit> & { id: string; name: string }): Habit {
  return {
    id: partial.id,
    name: partial.name,
    frequency: partial.frequency ?? 3,
    color: partial.color ?? DEFAULT_HABIT_COLOR,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z'
  }
}

// 固定日期事实：2026-08-01 为周六 → 2026-08-06（周四）所在周 = 周一 08-03 .. 周日 08-09
const TODAY = '2026-08-06'

// T1 — emptyHabitsData：空习惯 + 空记录 + 每次全新结构
test('T1 emptyHabitsData structure', () => {
  a.deepEqual(emptyHabitsData(), { habits: [], records: [] })
  a.ok(Array.isArray(emptyHabitsData().habits))
  a.ok(Array.isArray(emptyHabitsData().records))
  a.notEqual(emptyHabitsData(), emptyHabitsData()) // 不共享引用
})

// T2 — normalizeHabit name：trim 非空保留；空/纯空白/非对象 → null 剔除
test('T2 normalizeHabit name trim + drop', () => {
  const h = normalizeHabit({ id: 'hb_1', name: '  跑步  ', frequency: 5 })
  a.notEqual(h, null)
  a.equal(h!.name, '跑步')
  a.equal(h!.id, 'hb_1')
  a.equal(h!.frequency, 5)
  a.equal(normalizeHabit({ name: '' }), null)
  a.equal(normalizeHabit({ name: '   ' }), null)
  a.equal(normalizeHabit(null), null)
  a.equal(normalizeHabit(42), null)
  a.equal(normalizeHabit(undefined), null)
})

// T3 — normalizeHabit id：合法 id 保留；缺失 → hb_ 前缀生成；幂等
test('T3 normalizeHabit id handling + idempotent', () => {
  a.equal(normalizeHabit({ id: 'hb_keep', name: '阅读' })!.id, 'hb_keep')
  a.ok(normalizeHabit({ name: '早睡' })!.id.startsWith('hb_'))
  a.ok(normalizeHabit({ id: 42, name: '喝水' })!.id.startsWith('hb_'))
  const once = normalizeHabit({ id: 'hb_x', name: '冥想', frequency: 2, color: '#22c55e' })
  const twice = normalizeHabit(once)
  a.deepEqual(twice, once) // 幂等
})

// T4 — normalizeHabit color：合法 #RGB/#RRGGBB 保留；非法/缺失 → 默认蓝
test('T4 normalizeHabit color hex validation', () => {
  a.equal(normalizeHabit({ id: 'hb_a', name: 'A', color: '#ff0000' })!.color, '#ff0000')
  a.equal(normalizeHabit({ id: 'hb_b', name: 'B', color: '#fff' })!.color, '#fff')
  a.equal(normalizeHabit({ id: 'hb_c', name: 'C', color: 'red' })!.color, DEFAULT_HABIT_COLOR)
  a.equal(normalizeHabit({ id: 'hb_d', name: 'D', color: '#12345' })!.color, DEFAULT_HABIT_COLOR)
  a.equal(normalizeHabit({ id: 'hb_e', name: 'E' })!.color, DEFAULT_HABIT_COLOR)
})

// T5 — normalizeHabit frequency：合法 [1,7] 保留；0→1、越界→7、非 number→1、小数取整
test('T5 normalizeHabit frequency validation', () => {
  a.equal(normalizeHabit({ id: 'hb_f', name: 'F', frequency: 3 })!.frequency, 3)
  a.equal(normalizeHabit({ id: 'hb_g', name: 'G', frequency: 0 })!.frequency, 1)
  a.equal(normalizeHabit({ id: 'hb_h', name: 'H', frequency: 99 })!.frequency, 7)
  a.equal(normalizeHabit({ id: 'hb_i', name: 'I', frequency: 'abc' })!.frequency, 1)
  a.equal(normalizeHabit({ id: 'hb_j', name: 'J', frequency: 2.6 })!.frequency, 3)
})

// T6 — normalizeHabitRecord：合法保留；habitId/date 非法 → null 剔除；id 缺失 → hr_ 前缀
test('T6 normalizeHabitRecord validation', () => {
  const r = normalizeHabitRecord({ id: 'hr_1', habitId: 'hb_1', date: '2026-08-05' })
  a.notEqual(r, null)
  a.equal(r!.habitId, 'hb_1')
  a.equal(r!.date, '2026-08-05')
  a.equal(normalizeHabitRecord({ habitId: '', date: '2026-08-05' }), null)
  a.equal(normalizeHabitRecord({ habitId: 'hb_1', date: '2026-8-5' }), null) // 非严格格式
  a.equal(normalizeHabitRecord({ habitId: 'hb_1', date: 'not-a-date' }), null)
  a.equal(normalizeHabitRecord(null), null)
  a.ok(normalizeHabitRecord({ habitId: 'hb_1', date: '2026-08-05' })!.id.startsWith('hr_'))
})

// T7 — normalizeHabitsData：坏习惯/坏记录/孤儿记录剔除 + 同日去重 + 幂等 + 非法入参兜底
test('T7 normalizeHabitsData drops bad + dedupe + idempotent', () => {
  const raw: any = {
    habits: [
      { id: 'hb_1', name: '跑步', frequency: 5 },
      { id: 'hb_2', name: '   ' }, // name 空 → 剔除
      { id: 'hb_3', name: '阅读', frequency: 99 }, // 频率越界 → 钳 7
      'bad'
    ],
    records: [
      { id: 'hr_a', habitId: 'hb_1', date: '2026-08-05' },
      { id: 'hr_b', habitId: 'hb_1', date: '2026-08-05' }, // 同日重复 → 去重
      { id: 'hr_c', habitId: 'hb_9', date: '2026-08-05' }, // 孤儿记录 → 剔除
      { id: 'hr_d', habitId: 'hb_1', date: '2026-8-5' }, // 坏日期 → 剔除
      { id: 'hr_e', habitId: 'hb_3', date: '2026-08-06' }
    ]
  }
  const data = normalizeHabitsData(raw)
  a.equal(data.habits.length, 2)
  a.deepEqual(data.habits.map(h => h.id), ['hb_1', 'hb_3'])
  a.equal(data.habits[1].frequency, 7) // 越界钳制
  a.equal(data.records.length, 2) // 去重 + 孤儿/坏记录剔除后剩 2
  a.deepEqual(data.records.map(r => r.id), ['hr_a', 'hr_e'])
  a.deepEqual(normalizeHabitsData(data), data) // 幂等
  a.deepEqual(normalizeHabitsData(null), { habits: [], records: [] })
  a.deepEqual(normalizeHabitsData('str'), { habits: [], records: [] })
})

// T8 — weekCompletions：只返回本周（周一 08-03 ~ 周日 08-09）日期、升序、其它习惯忽略
test('T8 weekCompletions current week only + ascending', () => {
  const records = [
    mkRecord({ habitId: 'hb_1', date: '2026-08-05' }),
    mkRecord({ habitId: 'hb_1', date: '2026-08-03' }), // 本周一
    mkRecord({ habitId: 'hb_1', date: '2026-08-06' }),
    mkRecord({ habitId: 'hb_1', date: '2026-08-02' }), // 上周日 → 排除
    mkRecord({ habitId: 'hb_1', date: '2026-08-10' }), // 下周一 → 排除
    mkRecord({ habitId: 'hb_2', date: '2026-08-04' }) // 其它习惯 → 忽略
  ]
  a.deepEqual(weekCompletions(records, 'hb_1', TODAY), ['2026-08-03', '2026-08-05', '2026-08-06'])
  a.deepEqual(weekCompletions([], 'hb_1', TODAY), [])
  a.deepEqual(weekCompletions(records, 'hb_none', TODAY), [])
})

// T9 — weekCompletions 同日重复去重（QA failure：重复打卡同一天）
test('T9 weekCompletions dedupes same-day check-ins', () => {
  const records = [
    mkRecord({ habitId: 'hb_1', date: '2026-08-05' }),
    mkRecord({ habitId: 'hb_1', date: '2026-08-05' }), // 同日重复
    mkRecord({ habitId: 'hb_1', date: '2026-08-04' })
  ]
  const result = weekCompletions(records, 'hb_1', TODAY)
  a.equal(result.length, 2)
  a.deepEqual(result, ['2026-08-04', '2026-08-05'])
})

// T10 — streakDays 快乐路径（QA happy）：连续 5 天、今天未打卡仍算连续
test('T10 streakDays 5 consecutive with today unchecked', () => {
  const records = [
    mkRecord({ habitId: 'hb_1', date: '2026-08-05' }),
    mkRecord({ habitId: 'hb_1', date: '2026-08-04' }),
    mkRecord({ habitId: 'hb_1', date: '2026-08-03' }),
    mkRecord({ habitId: 'hb_1', date: '2026-08-02' }),
    mkRecord({ habitId: 'hb_1', date: '2026-08-01' })
  ]
  a.equal(streakDays(records, 'hb_1', TODAY), 5) // 今天 08-06 未打卡，从昨天起算 5 天
  // 今天打卡后 → 6 天
  a.equal(streakDays([...records, mkRecord({ habitId: 'hb_1', date: TODAY })], 'hb_1', TODAY), 6)
})

// T11 — streakDays：今天打卡计入；断档中断；其它习惯忽略；同日去重；空数据 0
test('T11 streakDays gap breaks + today counts + dedupe', () => {
  const consecutive = [
    mkRecord({ habitId: 'hb_1', date: TODAY }),
    mkRecord({ habitId: 'hb_1', date: '2026-08-05' }),
    mkRecord({ habitId: 'hb_1', date: '2026-08-05' }) // 同日重复 → 只计一天
  ]
  a.equal(streakDays(consecutive, 'hb_1', TODAY), 2)
  // 前天打卡但昨天断档 → 只有今天 1 天
  a.equal(
    streakDays(
      [
        mkRecord({ habitId: 'hb_1', date: TODAY }),
        mkRecord({ habitId: 'hb_1', date: '2026-08-04' }) // 08-05 缺 → 断档
      ],
      'hb_1',
      TODAY
    ),
    1
  )
  // 昨天打卡 + 今天未打卡 → 1
  a.equal(streakDays([mkRecord({ habitId: 'hb_1', date: '2026-08-05' })], 'hb_1', TODAY), 1)
  // 其它习惯记录不影响
  a.equal(streakDays([mkRecord({ habitId: 'hb_2', date: TODAY })], 'hb_1', TODAY), 0)
  a.equal(streakDays([], 'hb_1', TODAY), 0)
})

// T14 — streakOf 每日习惯（frequency>=7）：与 streakDays 一致，单位『天』
test('T14 streakOf daily equals streakDays (unit 天)', () => {
  const records = [
    mkRecord({ habitId: 'hb_1', date: '2026-08-05' }),
    mkRecord({ habitId: 'hb_1', date: '2026-08-04' }),
    mkRecord({ habitId: 'hb_1', date: '2026-08-03' }),
    mkRecord({ habitId: 'hb_1', date: '2026-08-02' }),
    mkRecord({ habitId: 'hb_1', date: '2026-08-01' })
  ]
  a.deepEqual(streakOf(records, 'hb_1', 7, TODAY), { count: 5, unit: '天' })
  // 今天 08-06 未打卡，从昨天起算仍是 5（与 streakDays 一致）
  a.equal(streakOf(records, 'hb_1', 7, TODAY).count, streakDays(records, 'hb_1', TODAY))
  a.deepEqual(streakOf(records, 'hb_1', 99, TODAY), { count: 5, unit: '天' }) // 频率越界钳到 7 走每日逻辑
})

// T15 — streakOf 每周习惯（frequency<7）：连续「周达标」周数，单位『周』
test('T15 streakOf weekly counts consecutive met weeks (unit 周)', () => {
  const mk = (date: string) => mkRecord({ habitId: 'hb_1', date })
  // 本周（周一 08-03~周日 08-09，TODAY=08-06）：3 次达标
  const thisWeek = [mk('2026-08-03'), mk('2026-08-04'), mk('2026-08-05')]
  // 上周（周一 07-27~周日 08-02）：3 次达标
  const lastWeek = [mk('2026-07-27'), mk('2026-07-28'), mk('2026-07-29')]

  // 场景A：本周+上周达标，上上周（07-20~26）仅 1 次未达标 → 连击中断于 2 周
  const beforeWeekIncomplete = [mk('2026-07-20')]
  const recordsA = [...thisWeek, ...lastWeek, ...beforeWeekIncomplete]
  a.deepEqual(streakOf(recordsA, 'hb_1', 3, TODAY), { count: 2, unit: '周' })

  // 场景B：本周仅 1 次未达标 → 不中断连击，从上周起算；上周+上上周均达标 → 连续 2 周
  const thisWeekIncomplete = [mk('2026-08-03')]
  const beforeWeekMet = [mk('2026-07-20'), mk('2026-07-21'), mk('2026-07-22')]
  const recordsB = [...thisWeekIncomplete, ...lastWeek, ...beforeWeekMet]
  a.deepEqual(streakOf(recordsB, 'hb_1', 3, TODAY), { count: 2, unit: '周' })

  // 空记录 → 0 周
  a.deepEqual(streakOf([], 'hb_1', 3, TODAY), { count: 0, unit: '周' })
})

// T12 — weeklyAttainment：completed/target/percent 正确（3/5=0.6），完成超目标不封顶，非法频率回退 1
test('T12 weeklyAttainment completed vs target', () => {
  const records = [
    mkRecord({ habitId: 'hb_1', date: '2026-08-03' }),
    mkRecord({ habitId: 'hb_1', date: '2026-08-05' }),
    mkRecord({ habitId: 'hb_1', date: '2026-08-06' }),
    mkRecord({ habitId: 'hb_1', date: '2026-08-09' }) // 本周日，计入
    // 频率目标 5
  ]
  const att = weeklyAttainment(records, 'hb_1', 5, TODAY)
  a.equal(att.completed, 4)
  a.equal(att.target, 5)
  a.equal(att.percent, 0.8)
  a.deepEqual(weeklyAttainment([], 'hb_1', 7, TODAY), { completed: 0, target: 7, percent: 0 })
  // 完成超目标（6 次 > 目标 3）→ percent 不截断
  const over = weeklyAttainment(records.slice(0, 3), 'hb_1', 2, TODAY)
  a.equal(over.completed, 3)
  a.equal(over.target, 2)
  a.equal(over.percent, 1.5)
  // 非法频率 → 回退 1
  a.equal(weeklyAttainment(records, 'hb_1', NaN, TODAY).target, 1)
})

// T13 — normalizeHabitsData 空对象/缺字段 → 空数据（幂等回归）
test('T13 normalizeHabitsData empty object fallback', () => {
  a.deepEqual(normalizeHabitsData({}), { habits: [], records: [] })
  a.deepEqual(normalizeHabitsData({ habits: [] }), { habits: [], records: [] })
  a.deepEqual(normalizeHabitsData({ habits: undefined, records: undefined }), { habits: [], records: [] })
  const data: HabitsData = normalizeHabitsData({
    habits: [mkHabit({ id: 'hb_1', name: '跑步', frequency: 7 })],
    records: [mkRecord({ habitId: 'hb_1', date: '2026-08-05' })]
  })
  a.deepEqual(normalizeHabitsData(data), data) // 幂等
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
