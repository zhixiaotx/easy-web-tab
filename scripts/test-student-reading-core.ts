import assert from "node:assert/strict"
import {
  READING_ID_PREFIX, emptyReadingData, normalizeReadingEntry, normalizeReadingData,
  sortReading, filterByDateRange, calcReadingStats, formatDuration
} from "../src/composables/studentReadingCore.ts"

const tests = []
function test(n, f) { tests.push({ name: n, fn: f }) }

test("T1 emptyReadingData", () => assert.deepEqual(emptyReadingData(), { entries: [] }))

test("T2 normalizeReadingEntry 必填缺失→null；字段钳位 + parentSigned 回填 signedAt", () => {
  assert.equal(normalizeReadingEntry(null), null)
  assert.equal(normalizeReadingEntry({ bookTitle: "" }), null)
  assert.equal(normalizeReadingEntry({ bookTitle: "三体", pages: 0, durationMin: 10, date: "2026-02-01" }), null)
  assert.equal(normalizeReadingEntry({ bookTitle: "三体", pages: 10, durationMin: 0, date: "2026-02-01" }), null)
  assert.equal(normalizeReadingEntry({ bookTitle: "三体", pages: 20, durationMin: 30 }), null)
  const e = normalizeReadingEntry({ bookTitle: "  三体  ", pages: 20, durationMin: 30, date: "2026-02-01", parentSigned: true })
  assert.ok(e.id.startsWith(READING_ID_PREFIX))
  assert.equal(e.bookTitle, "三体")
  assert.equal(e.parentSigned, true)
  assert.ok(e.signedAt)
})

test("T3 impression 截断 2000 / bookTitle 截断 50", () => {
  const e = normalizeReadingEntry({ bookTitle: "A".repeat(80), pages: 10, durationMin: 10, date: "2026-02-01", impression: "X".repeat(3000) })
  assert.equal(e.bookTitle.length, 50)
  assert.equal(e.impression.length, 2000)
})

test("T4 signedAt 用户提供优先于默认", () => {
  const e = normalizeReadingEntry({ bookTitle: "B", pages: 10, durationMin: 10, date: "2026-02-01", parentSigned: true, signedAt: "2099-01-01T00:00:00Z" })
  assert.equal(e.signedAt, "2099-01-01T00:00:00Z")
})

test("T5 normalizeReadingData 兼容裸数组 / 对象 entries / 非法→empty", () => {
  const it = { bookTitle: "三体", pages: 20, durationMin: 30, date: "2026-02-01" }
  assert.equal(normalizeReadingData([it]).entries.length, 1)
  assert.equal(normalizeReadingData({ entries: [it] }).entries.length, 1)
  assert.deepEqual(normalizeReadingData(123), emptyReadingData())
})

test("T6 sortReading date 降 → createdAt 降", () => {
  const list = [
    { id: "a", bookTitle: "", pages: 1, durationMin: 1, date: "2026-02-01", createdAt: "2026-02-01T00:00:00Z", updatedAt: "" },
    { id: "b", bookTitle: "", pages: 1, durationMin: 1, date: "2026-03-01", createdAt: "2026-03-01T00:00:00Z", updatedAt: "" },
    { id: "c", bookTitle: "", pages: 1, durationMin: 1, date: "2026-03-01", createdAt: "2026-03-01T12:00:00Z", updatedAt: "" },
  ]
  const s = sortReading(list as any)
  assert.equal(s[0].id, "c"); assert.equal(s[2].id, "a")
})

test("T7 filterByDateRange 含两端", () => {
  const list = [{ date: "2026-01-31" }, { date: "2026-02-01" }, { date: "2026-02-15" }, { date: "2026-02-28" }, { date: "2026-03-01" }] as any
  assert.equal(filterByDateRange(list, "2026-02-01", "2026-02-28").length, 3)
})

test("T8 calcReadingStats 空列表全 0", () => {
  const s = calcReadingStats([])
  assert.deepEqual(s, { totalEntries: 0, totalPages: 0, totalDurationMin: 0, distinctDays: 0, avgPagesPerDay: 0, avgDurationPerEntry: 0 })
})

test("T9 calcReadingStats 求和 + 日均页数 + 均次时长", () => {
  const s = calcReadingStats([
    { bookTitle: "A", pages: 10, durationMin: 20, date: "2026-02-01" },
    { bookTitle: "B", pages: 20, durationMin: 40, date: "2026-02-01" },
    { bookTitle: "C", pages: 30, durationMin: 30, date: "2026-02-03" },
  ] as any)
  assert.equal(s.totalEntries, 3)
  assert.equal(s.totalPages, 60)
  assert.equal(s.totalDurationMin, 90)
  assert.equal(s.distinctDays, 2)
  assert.equal(s.avgPagesPerDay, 30)
  assert.equal(s.avgDurationPerEntry, 30)
})

test("T10 formatDuration 分钟→小时分钟", () => {
  assert.equal(formatDuration(30), "30 分钟")
  assert.equal(formatDuration(120), "2 小时")
  assert.equal(formatDuration(90), "1 小时 30 分钟")
})

test("T11 normalizeReadingData 坏条目被过滤 + 返回新数组（不共享引用）", () => {
  const raw = { entries: [{ bookTitle: "A", pages: 10, durationMin: 10, date: "2026-02-01" }, { bookTitle: "" }] }
  const a = normalizeReadingData(raw); assert.equal(a.entries.length, 1)
  a.entries.push("x" as any)
  const b = normalizeReadingData(raw)
  assert.equal(b.entries.length, 1)
})

test("T12 pages 999 合法；1000→null；duration 480 合法；481→null（钳 max 480）", () => {
  assert.ok(normalizeReadingEntry({ bookTitle: "X", pages: 999, durationMin: 480, date: "2026-02-01" }))
  assert.equal(normalizeReadingEntry({ bookTitle: "X", pages: 1000, durationMin: 10, date: "2026-02-01" }), null)
  assert.equal(normalizeReadingEntry({ bookTitle: "X", pages: 10, durationMin: 481, date: "2026-02-01" }), null)
})

let p = 0, f = 0
for (const t of tests) {
  try { t.fn(); p++; console.log("  OK " + t.name) }
  catch (e) { f++; console.error("  FAIL " + t.name); console.error(e) }
}
console.log("\n" + p + "/" + tests.length + " passed")
if (f > 0) process.exit(1)
