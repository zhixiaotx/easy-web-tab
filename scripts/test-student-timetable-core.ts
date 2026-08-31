import assert from "node:assert/strict"
import {
  TIMETABLE_VERSION, DEFAULT_PERIODS_PER_DAY, DEFAULT_WEEKS,
  emptyTimetableData, isValidTime, isValidTimeRange, normalizeCell, normalizeTimetableData,
  cellKey, parseCellKey, weekdayLabel, setCell, clearCell, getCell, sortCellsByStartTime
} from "../src/composables/studentTimetableCore.ts"

const tests = []
function test(n, f) { tests.push({ name: n, fn: f }) }

test("T1 常量 / empty schedule 对象", () => {
  assert.equal(TIMETABLE_VERSION, 1); assert.equal(DEFAULT_PERIODS_PER_DAY, 6); assert.equal(DEFAULT_WEEKS, 20)
  const d = emptyTimetableData()
  assert.equal(d.version, 1); assert.equal(d.weeks, 20); assert.equal(d.periodsPerDay, 6)
  assert.deepEqual(d.schedule, {})
  assert.equal(Array.isArray((d as any).cells), false)
})

test("T2 isValidTime HH:MM", () => {
  assert.equal(isValidTime("08:00"), true)
  assert.equal(isValidTime("24:00"), false)
  assert.equal(isValidTime("08:60"), false)
  assert.equal(isValidTime("8:00"), false)
})

test("T3 isValidTimeRange start<end / 必须都是合法 time", () => {
  assert.equal(isValidTimeRange("08:00", "09:00"), true)
  assert.equal(isValidTimeRange("09:00", "09:00"), false)
  assert.equal(isValidTimeRange("10:00", "09:00"), false)
  assert.equal(isValidTimeRange("bad", "09:00"), false)
})

test("T4 normalizeCell subject 非空 / startHHMM+endHHMM 必填且合法；空 subject→null；teacher/room 非空才写字段", () => {
  assert.equal(normalizeCell(null), null)
  assert.equal(normalizeCell({ subject: "   " }), null)
  assert.equal(normalizeCell({ subject: "S" }), null)
  assert.equal(normalizeCell({ subject: "S", startHHMM: "bad", endHHMM: "09:00" }), null)
  assert.equal(normalizeCell({ subject: "S", startHHMM: "09:00", endHHMM: "08:00" }), null)
  const c = normalizeCell({ subject: " 数学 ", teacher: " 王老师 ", room: " Rm 1 ", startHHMM: "08:00", endHHMM: "09:00" })!
  assert.equal(c.subject, "数学"); assert.equal(c.startHHMM, "08:00"); assert.equal(c.endHHMM, "09:00")
  assert.equal(c.teacher, "王老师"); assert.equal(c.room, "Rm 1")
  const noTr = normalizeCell({ subject: "S", startHHMM: "08:00", endHHMM: "09:00", teacher: "   ", room: "" })!
  assert.ok(!("teacher" in noTr)); assert.ok(!("room" in noTr))
})

test("T5 normalizeCell teacher 20 / room 20 截断", () => {
  const c = normalizeCell({ subject: "S", startHHMM: "08:00", endHHMM: "09:00", teacher: "T".repeat(30), room: "C".repeat(50) })!
  assert.equal(c.teacher!.length, 20); assert.equal(c.room!.length, 20)
})

test("T6 normalizeTimetableData：非法→默认；合法 version/weeks/periods 保留；schedule 仅保留合法；periodsPerDay 范围 1..12", () => {
  assert.deepEqual(normalizeTimetableData(123), emptyTimetableData())
  assert.deepEqual(normalizeTimetableData([]), emptyTimetableData())
  const raw = { version: 2, weeks: 30, periodsPerDay: 8, schedule: { "1_1": { subject: "M", startHHMM: "08:00", endHHMM: "09:00" }, "1_2": { subject: "X" } } }
  const out = normalizeTimetableData(raw)
  assert.equal(out.version, 2); assert.equal(out.weeks, 30); assert.equal(out.periodsPerDay, 8)
  assert.ok(out.schedule["1_1"]); assert.equal(!!out.schedule["1_2"], false)
  // 钳位
  assert.equal(normalizeTimetableData({ weeks: 100 }).weeks, DEFAULT_WEEKS)
  assert.equal(normalizeTimetableData({ periodsPerDay: 0 }).periodsPerDay, DEFAULT_PERIODS_PER_DAY)
  assert.equal(normalizeTimetableData({ periodsPerDay: 13 }).periodsPerDay, DEFAULT_PERIODS_PER_DAY)
})

test("T7 cellKey / parseCellKey (下划线分隔；period 1..12、day 1..7 非法返回 null)", () => {
  assert.equal(cellKey(1, 2), "1_2")
  const p = parseCellKey("5_3")!
  assert.equal(p.day, 5); assert.equal(p.period, 3)
  assert.equal(parseCellKey("5-3"), null)
  assert.equal(parseCellKey("8_1"), null)
  assert.equal(parseCellKey("1_0"), null)
  assert.equal(parseCellKey("1_13"), null)
})

test("T8 weekdayLabel 1-7 正确；越界返回空串", () => {
  const expected = ["周一","周二","周三","周四","周五","周六","周日"]
  for (let i = 1; i <= 7; i++) assert.equal(weekdayLabel(i), expected[i-1])
  assert.equal(weekdayLabel(0), "")
  assert.equal(weekdayLabel(8), "")
})

test("T9 setCell 同 key 覆盖 + 新 key 追加 + 返回新对象；getCell 读取", () => {
  const s = {}
  const s1 = setCell(s, 1, 1, { subject: "数学", startHHMM: "08:00", endHHMM: "09:00" })
  assert.equal(Object.keys(s1).length, 1)
  const s2 = setCell(s1, 1, 1, { subject: "英语", startHHMM: "09:00", endHHMM: "10:00" })
  assert.equal(Object.keys(s2).length, 1)
  assert.equal(getCell(s2, 1, 1)!.subject, "英语")
  const s3 = setCell(s2, 1, 2, { subject: "体育", startHHMM: "10:00", endHHMM: "11:00" })
  assert.equal(Object.keys(s3).length, 2)
  assert.deepEqual(s, {})
})

test("T10 clearCell 删除 + 再删无副作用；getCell 不存在 undefined", () => {
  let s = {}
  s = setCell(s, 2, 3, { subject: "X", startHHMM: "08:00", endHHMM: "09:00" })
  const s2 = clearCell(s, 2, 3)
  assert.equal(Object.keys(s2).length, 0)
  const s3 = clearCell(s2, 2, 3)
  assert.equal(Object.keys(s3).length, 0)
  assert.equal(getCell(s, 2, 4), undefined)
})

test("T11 sortCellsByStartTime startHHMM 升序 + 不改入参", () => {
  const list = [
    { subject: "C", startHHMM: "10:00", endHHMM: "11:00" },
    { subject: "A", startHHMM: "08:00", endHHMM: "09:00" },
    { subject: "B", startHHMM: "09:00", endHHMM: "10:00" },
  ]
  const copy = list.map(x => ({ ...x }))
  const out = sortCellsByStartTime(list)
  assert.equal(out[0].subject, "A"); assert.equal(out[1].subject, "B"); assert.equal(out[2].subject, "C")
  assert.deepEqual(list, copy)
})

let p = 0, f = 0
for (const t of tests) {
  try { t.fn(); p++; console.log("  OK " + t.name) }
  catch (e) { f++; console.error("  FAIL " + t.name); console.error(e) }
}
console.log("\n" + p + "/" + tests.length + " passed")
if (f > 0) process.exit(1)
