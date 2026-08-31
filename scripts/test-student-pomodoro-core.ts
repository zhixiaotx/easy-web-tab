import assert from "node:assert/strict"
import {
  emptyPomodoroData, normalizePomodoroData, sessionPhase, formatRemaining, todayStats,
  stageDefaultPomodoroSettings, isStageDefaultSettings
} from "../src/composables/studentPomodoroCore.ts"

const tests = []
function test(n, f) { tests.push({ name: n, fn: f }) }

test("T1 emptyPomodoroData：settings 25/5/15/4 + records 空数组（不含 state 字段）", () => {
  const d = emptyPomodoroData()
  assert.deepEqual(d.settings, { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, sessionsPerCycle: 4 })
  assert.deepEqual(d.records, [])
  assert.equal(Object.keys(d).sort().join(","), "records,settings")
})

test("T2 stageDefaultPomodoroSettings：K 15/5/15/4，P 25/5/15/4，J 50/10/30/4", () => {
  assert.deepEqual(stageDefaultPomodoroSettings("K"), { workMinutes: 15, breakMinutes: 5, longBreakMinutes: 15, sessionsPerCycle: 4 })
  assert.deepEqual(stageDefaultPomodoroSettings("P"), { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, sessionsPerCycle: 4 })
  assert.deepEqual(stageDefaultPomodoroSettings("J"), { workMinutes: 50, breakMinutes: 10, longBreakMinutes: 30, sessionsPerCycle: 4 })
})

test("T3 isStageDefaultSettings：默认 true；学段/字段变更 false", () => {
  assert.equal(isStageDefaultSettings(stageDefaultPomodoroSettings("K"), "K"), true)
  assert.equal(isStageDefaultSettings(stageDefaultPomodoroSettings("K"), "P"), false)
  const mod = { ...stageDefaultPomodoroSettings("J"), workMinutes: 49 }
  assert.equal(isStageDefaultSettings(mod, "J"), false)
})

test("T4 normalizePomodoroData：settings 缺省 25/5/15/4；records 非法 date 剔除；bad records 不报错", () => {
  const n = normalizePomodoroData(null)
  assert.deepEqual(n.settings, { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, sessionsPerCycle: 4 })
  const raw = { settings: { workMinutes: "bad", breakMinutes: "x", longBreakMinutes: 0, sessionsPerCycle: 0 },
    records: [{ date: "2026-02-01", workSessions: 3 }, { date: "bad-date", workSessions: 99 }] }
  const o = normalizePomodoroData(raw)
  assert.equal(o.settings.workMinutes, 25)
  assert.equal(o.settings.breakMinutes, 5)
  assert.equal(o.settings.longBreakMinutes, 15)
  assert.equal(o.settings.sessionsPerCycle, 4)
  assert.equal(o.records.length, 1)
  assert.equal(o.records[0].workSessions, 3)
})

test("T5 sessionPhase 状态机：break/longBreak→回 work；work + 完成 1,2,3 个→短休；刚好 cycle 倍数→长休", () => {
  const settings = stageDefaultPomodoroSettings("P")
  const s = (phase: any, done: number) => ({ phase, completedSessions: done, settings })
  assert.equal(sessionPhase(s("break", 2)), "work")
  assert.equal(sessionPhase(s("longBreak", 4)), "work")
  assert.equal(sessionPhase(s("work", 1)), "break")
  assert.equal(sessionPhase(s("work", 2)), "break")
  assert.equal(sessionPhase(s("work", 3)), "break")
  assert.equal(sessionPhase(s("work", 4)), "longBreak")
  assert.equal(sessionPhase(s("work", 8)), "longBreak")
})

test("T6 formatRemaining 负数/NaN→00:00；正数 MM:SS；超大值分钟溢出两位（但仍 pad）", () => {
  assert.equal(formatRemaining(-5), "00:00")
  assert.equal(formatRemaining(NaN), "00:00")
  assert.equal(formatRemaining(0), "00:00")
  assert.equal(formatRemaining(5), "00:05")
  assert.equal(formatRemaining(75), "01:15")
  assert.equal(formatRemaining(3661), "61:01")
})

test("T7 todayStats：非 date→0；匹配 workSessions 相加；多条同日求和", () => {
  const list = [
    { date: "2026-02-01", workSessions: 2, createdAt: "" },
    { date: "2026-02-01", workSessions: 3, createdAt: "" },
    { date: "2026-02-02", workSessions: 5, createdAt: "" },
  ] as any
  assert.equal(todayStats([], "2026-02-01"), 0)
  assert.equal(todayStats(list, ""), 0)
  assert.equal(todayStats(list, "2026-02-01"), 5)
  assert.equal(todayStats(list, "2026-02-02"), 5)
  assert.equal(todayStats(list, "2026-02-03"), 0)
})

test("T8 stageDefaultPomodoroSettings 返回副本；settings/work/long/break/perCycle 4 字段独立", () => {
  const a = stageDefaultPomodoroSettings("K"); const b = stageDefaultPomodoroSettings("K")
  assert.notEqual(a, b)
  a.workMinutes = 999; a.sessionsPerCycle = 999
  assert.deepEqual(stageDefaultPomodoroSettings("K"), { workMinutes: 15, breakMinutes: 5, longBreakMinutes: 15, sessionsPerCycle: 4 })
})

test("T9 normalizePomodoroData.workSessions 负→0；四舍五入；createdAt 缺省填充", () => {
  const raw = { records: [{ date: "2026-02-01", workSessions: -1 }, { date: "2026-02-02", workSessions: 3.6 }, { date: "2026-02-03", workSessions: 2.3 }] }
  const o = normalizePomodoroData(raw)
  assert.equal(o.records[0].workSessions, 0)
  assert.equal(o.records[1].workSessions, 4)
  assert.equal(o.records[2].workSessions, 2)
  assert.ok(typeof o.records[0].createdAt === "string" && o.records[0].createdAt.length > 0)
})

let p = 0, f = 0
for (const t of tests) {
  try { t.fn(); p++; console.log("  OK " + t.name) }
  catch (e) { f++; console.error("  FAIL " + t.name); console.error(e) }
}
console.log("\n" + p + "/" + tests.length + " passed")
if (f > 0) process.exit(1)
