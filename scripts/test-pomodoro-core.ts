import assert from 'node:assert/strict'
import {
  emptyPomodoroData,
  normalizePomodoroData,
  sessionPhase,
  formatRemaining,
  todayStats
} from '../src/composables/pomodoroCore.ts'
import type { PomodoroData, PomodoroPhase, PomodoroRecord, PomodoroSettings } from '../src/composables/pomodoroCore.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

/** 构造 25/5/15/4 的规范化设置（QA happy 场景的默认会话配置）。 */
function mkSettings(): PomodoroSettings {
  return { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, sessionsPerCycle: 4 }
}

function mkRecord(date: string, workSessions: number, createdAt = '2026-08-01T08:00:00.000Z'): PomodoroRecord {
  return { date, workSessions, createdAt }
}

// T1 — emptyPomodoroData：默认 25/5/15/4、records 为空、每次返回全新对象
test('T1 emptyPomodoroData defaults', () => {
  const empty = emptyPomodoroData()
  assert.equal(empty.settings.workMinutes, 25)
  assert.equal(empty.settings.breakMinutes, 5)
  assert.equal(empty.settings.longBreakMinutes, 15)
  assert.equal(empty.settings.sessionsPerCycle, 4)
  assert.deepEqual(empty.records, [])
  assert.notEqual(emptyPomodoroData(), empty, '每次调用返回新对象，防共享引用')
})

// T2 — normalize null/undefined/坏结构回退默认不抛错（failure QA：脏输入兜底）
test('T2 normalizePomodoroData bad structure falls back to defaults', () => {
  const n1 = normalizePomodoroData(null)
  assert.equal(n1.settings.workMinutes, 25)
  assert.equal(n1.settings.breakMinutes, 5)
  assert.deepEqual(n1.records, [])

  const n2 = normalizePomodoroData(undefined)
  assert.equal(n2.settings.workMinutes, 25)
  assert.equal(n2.settings.breakMinutes, 5)

  const n3 = normalizePomodoroData(42)
  assert.equal(n3.settings.workMinutes, 25)
  assert.deepEqual(n3.records, [])

  const n4 = normalizePomodoroData({ settings: 'not-an-object', records: 'not-an-array' })
  assert.equal(n4.settings.workMinutes, 25)
  assert.deepEqual(n4.records, [])
})

// T3 — normalize settings：合法值透传、非法值逐字段回退默认
test('T3 normalizePomodoroData settings validation', () => {
  const ok = normalizePomodoroData({ settings: { workMinutes: 30, breakMinutes: 10 } })
  assert.equal(ok.settings.workMinutes, 30)
  assert.equal(ok.settings.breakMinutes, 10)
  assert.equal(ok.settings.longBreakMinutes, 15, '缺失字段回退默认')
  assert.equal(ok.settings.sessionsPerCycle, 4, '缺失字段回退默认')

  const zero = normalizePomodoroData({ settings: { workMinutes: 0, breakMinutes: 0 } })
  assert.equal(zero.settings.workMinutes, 25, '0 回退默认')
  assert.equal(zero.settings.breakMinutes, 5, '0 回退默认')

  const negative = normalizePomodoroData({ settings: { workMinutes: -5, sessionsPerCycle: -2 } })
  assert.equal(negative.settings.workMinutes, 25, '负数回退默认')
  assert.equal(negative.settings.sessionsPerCycle, 4, '负数回退默认')

  const bad = normalizePomodoroData({ settings: { workMinutes: 'abc', breakMinutes: NaN, longBreakMinutes: Infinity } })
  assert.equal(bad.settings.workMinutes, 25, '非数值回退默认')
  assert.equal(bad.settings.breakMinutes, 5, 'NaN 回退默认')
  assert.equal(bad.settings.longBreakMinutes, 15, 'Infinity 回退默认')

  const round = normalizePomodoroData({ settings: { workMinutes: 25.7 } })
  assert.equal(round.settings.workMinutes, 26, '小数四舍五入为整数分钟')
})

// T4 — normalize records：合法记录透传、workSessions 钳非负、坏记录剔除、createdAt 兜底
test('T4 normalizePomodoroData records', () => {
  const good = normalizePomodoroData({ records: [mkRecord('2026-08-05', 3)] })
  assert.deepEqual(good.records, [mkRecord('2026-08-05', 3)])

  const clamped = normalizePomodoroData({ records: [mkRecord('2026-08-05', -2)] })
  assert.equal(clamped.records[0].workSessions, 0, '负数钳 0')

  const rounded = normalizePomodoroData({ records: [mkRecord('2026-08-05', 2.6)] })
  assert.equal(rounded.records[0].workSessions, 3, '小数四舍五入')

  const dropped = normalizePomodoroData({
    records: [mkRecord('2026-08-05', 1), 'junk', null, { date: 'bad-date', workSessions: 5 }, { workSessions: 3 }]
  })
  assert.equal(dropped.records.length, 1, '坏记录（非对象/日期非法/缺日期）整条剔除')

  const stamped = normalizePomodoroData({ records: [{ date: '2026-08-05', workSessions: 2 }] })
  assert.equal(typeof stamped.records[0].createdAt, 'string', '缺失 createdAt 兜底为 ISO 字符串')
  assert.ok(stamped.records[0].createdAt.length > 0)
})

// T5 — normalize 幂等：归一化结果再归一化无变化
test('T5 normalizePomodoroData idempotent', () => {
  const once = normalizePomodoroData({ settings: { workMinutes: 40, sessionsPerCycle: 6 }, records: [mkRecord('2026-08-05', 4)] })
  const twice = normalizePomodoroData(once)
  assert.deepEqual(twice, once)
  const empty = normalizePomodoroData(null)
  assert.deepEqual(normalizePomodoroData(empty), empty)
})

// T6 — sessionPhase：work 结束后进入短休（25min work → 5min break 边界）
test('T6 sessionPhase work -> break', () => {
  const settings = mkSettings()
  const state = (completedSessions: number) => ({ phase: 'work' as PomodoroPhase, completedSessions, settings })
  assert.equal(sessionPhase(state(1)), 'break')
  assert.equal(sessionPhase(state(2)), 'break')
  assert.equal(sessionPhase(state(3)), 'break')
  assert.equal(sessionPhase(state(0)), 'break', '累计 0 也进短休，不触发长休')
})

// T7 — sessionPhase：循环边界（每 sessionsPerCycle 个 work 后进入长休）
test('T7 sessionPhase cycle boundary -> longBreak', () => {
  const settings = mkSettings() // sessionsPerCycle=4
  const next = (n: number) => sessionPhase({ phase: 'work', completedSessions: n, settings })
  assert.equal(next(4), 'longBreak', '第 4 个会话完成 → 长休')
  assert.equal(next(8), 'longBreak', '第 8 个会话完成 → 长休')
  assert.equal(next(5), 'break', '第 5 个会话完成 → 短休')
  assert.equal(next(7), 'break', '第 7 个会话完成 → 短休')
  // sessionsPerCycle=1 → 每个 work 后都长休
  const one = sessionPhase({ phase: 'work', completedSessions: 1, settings: { ...settings, sessionsPerCycle: 1 } })
  assert.equal(one, 'longBreak')
})

// T8 — sessionPhase：break / longBreak 结束后一律回到 work
test('T8 sessionPhase break -> work', () => {
  const settings = mkSettings()
  assert.equal(sessionPhase({ phase: 'break', completedSessions: 3, settings }), 'work')
  assert.equal(sessionPhase({ phase: 'longBreak', completedSessions: 4, settings }), 'work')
  // 非法 settings.sessionsPerCycle 不产生 NaN 除零（cycle 钳最小 1）
  const bad = sessionPhase({ phase: 'work', completedSessions: 2, settings: { ...settings, sessionsPerCycle: 0 } })
  assert.equal(bad, 'longBreak', 'cycle=0 钳为 1 → 每完成即长休，不抛错')
})

// T9 — formatRemaining：MM:SS 标准格式
test('T9 formatRemaining basic', () => {
  assert.equal(formatRemaining(1500), '25:00')
  assert.equal(formatRemaining(0), '00:00')
  assert.equal(formatRemaining(59), '00:59')
  assert.equal(formatRemaining(600), '10:00')
  assert.equal(formatRemaining(61), '01:01')
  assert.equal(formatRemaining(5), '00:05')
})

// T10 — formatRemaining：负数/非有限值/超小时钳制
test('T10 formatRemaining edge cases', () => {
  assert.equal(formatRemaining(-10), '00:00', '负数钳 0')
  assert.equal(formatRemaining(NaN), '00:00')
  assert.equal(formatRemaining(Infinity), '00:00')
  assert.equal(formatRemaining(3661), '61:01', '分钟可超两位')
})

// T11 — todayStats：今日完成数精确匹配 + 同日求和
test('T11 todayStats matching date', () => {
  const records = [mkRecord('2026-08-05', 3), mkRecord('2026-08-05', 2), mkRecord('2026-08-04', 1)]
  assert.equal(todayStats(records, '2026-08-05'), 5, '同日多条记录求和')
  assert.equal(todayStats(records, '2026-08-04'), 1)
  assert.equal(todayStats(records, '2026-08-06'), 0, '无记录返回 0')
})

// T12 — todayStats：空/脏记录与非法日期
test('T12 todayStats edge cases', () => {
  assert.equal(todayStats([], '2026-08-05'), 0)
  assert.equal(todayStats([mkRecord('2026-08-05', -1)], '2026-08-05'), 0, '负数钳 0')
  assert.equal(todayStats([mkRecord('2026-08-05', 2)], 'not-a-date'), 0, '非法日期返回 0')
  assert.equal(todayStats([mkRecord('2026-08-05', 2)], '2026/08/05'), 0, '非 YYYY-MM-DD 格式不匹配')
})

// T13 — 集成形状：normalize → 会话状态机 → 今日统计 全链路（QA happy 场景：25min work → 5min break → 循环边界）
test('T13 happy path integration', () => {
  const data: PomodoroData = normalizePomodoroData({
    settings: { workMinutes: 25, breakMinutes: 5 },
    records: [mkRecord('2026-08-05', 3)]
  })
  assert.equal(data.settings.workMinutes, 25)
  assert.equal(data.settings.breakMinutes, 5)
  assert.equal(todayStats(data.records, '2026-08-05'), 3, '今日已完成 3 个番茄')
  assert.equal(sessionPhase({ phase: 'work', completedSessions: 3, settings: data.settings }), 'break', '未到循环边界 → 短休')
  assert.equal(sessionPhase({ phase: 'work', completedSessions: 4, settings: data.settings }), 'longBreak', '到达循环边界 → 长休')
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
