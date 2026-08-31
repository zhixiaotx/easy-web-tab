import assert from "node:assert/strict"
import {
  REVIEW_ID_PREFIX, emptyReviewData, normalizeReviewItem, normalizeReviewData,
  sortReview, filterBySubject, isDueToday, isOverdue, calcReviewStats,
  advanceStage, resetStage, stageLabel, daysUntil, calcNextReviewDate
} from "../src/composables/studentReviewCore.ts"

const tests = []
function test(n, f) { tests.push({ name: n, fn: f }) }
function mk(o: any) { return normalizeReviewItem(o) }

test("T1 empty / calcNextReviewDate", () => {
  assert.deepEqual(emptyReviewData(), { entries: [] })
  assert.equal(calcNextReviewDate("2026-02-01", 1), "2026-02-02")
  assert.equal(calcNextReviewDate("2026-02-01", 6), "2026-03-03")
  assert.equal(calcNextReviewDate("bad", 1), null)
  assert.equal(calcNextReviewDate("2026-02-01", 7), null)
})

test("T2 normalizeReviewItem 缺必填→null；knowledge 截断 200；source 可选 50", () => {
  assert.equal(mk(null), null)
  assert.equal(mk({ subject: "", knowledge: "k", learnDate: "2026-02-01" }), null)
  assert.equal(mk({ subject: "s", knowledge: "", learnDate: "2026-02-01" }), null)
  assert.equal(mk({ subject: "s", knowledge: "k" }), null)
  const r = mk({ subject: " 数学 ", knowledge: "A".repeat(300), learnDate: "2026-02-01", source: "B".repeat(80) })
  assert.ok(r.id.startsWith(REVIEW_ID_PREFIX))
  assert.equal(r.subject, "数学")
  assert.equal(r.knowledge.length, 200)
  assert.equal(r.source!.length, 50)
})

test("T3 stage clamp 1..6；nextReviewDate 从 learnDate+stage 自动重算", () => {
  const r = mk({ subject: "s", knowledge: "k", learnDate: "2026-02-01", stage: 100 })
  assert.equal(r.stage, 1)
  assert.equal(r.nextReviewDate, "2026-02-02")
  const r2 = mk({ subject: "s", knowledge: "k", learnDate: "2026-02-01", stage: 5 })
  assert.equal(r2.stage, 5); assert.equal(r2.nextReviewDate, "2026-02-16")
})

test("T4 mastered 布尔；created/updated 回填", () => {
  const a = mk({ subject: "s", knowledge: "k", learnDate: "2026-02-01", mastered: "yes" as any })
  const b = mk({ subject: "s", knowledge: "k", learnDate: "2026-02-01", mastered: true })
  assert.equal(a.mastered, false); assert.equal(b.mastered, true)
  assert.ok(a.createdAt); assert.ok(a.updatedAt)
})

test("T5 normalizeReviewData 兼容裸数组 / 对象 entries / 非法→empty；幂等", () => {
  const it = { subject: "语", knowledge: "文言", learnDate: "2026-02-01" }
  assert.equal(normalizeReviewData([it]).entries.length, 1)
  assert.equal(normalizeReviewData({ entries: [it] }).entries.length, 1)
  assert.deepEqual(normalizeReviewData(123), emptyReviewData())
  const once = normalizeReviewData([it]).entries
  const twice = normalizeReviewData({ entries: once }).entries
  assert.equal(twice[0].id, once[0].id); assert.equal(twice[0].nextReviewDate, once[0].nextReviewDate)
})

test("T6 sortReview mastered 置末 → nextReviewDate 升 → createdAt 降", () => {
  const list = [
    { id: "a", subject: "", knowledge: "", learnDate: "2026-01-01", stage: 1, nextReviewDate: "2026-03-01", mastered: false, createdAt: "2026-02-01T00:00:00Z", updatedAt: "" },
    { id: "b", subject: "", knowledge: "", learnDate: "2026-01-01", stage: 1, nextReviewDate: "2026-02-10", mastered: false, createdAt: "2026-02-01T00:00:00Z", updatedAt: "" },
    { id: "c", subject: "", knowledge: "", learnDate: "2026-01-01", stage: 1, nextReviewDate: "2026-02-10", mastered: false, createdAt: "2026-02-01T12:00:00Z", updatedAt: "" },
    { id: "d", subject: "", knowledge: "", learnDate: "2026-01-01", stage: 1, nextReviewDate: "2026-01-01", mastered: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "" },
  ]
  const s = sortReview(list as any)
  assert.equal(s[0].id, "c"); assert.equal(s[s.length - 1].id, "d")
})

test("T7 filterBySubject all 保留副本；'all' 不筛选", () => {
  const list = [
    { id: "1", subject: "数学" }, { id: "2", subject: "语文" },
  ] as any
  const a = filterBySubject(list, "all")
  assert.equal(a.length, 2); a.push("x" as any); assert.equal(list.length, 2)
  assert.equal(filterBySubject(list, "数学").length, 1)
})

test("T8 isDueToday / isOverdue", () => {
  const due = (nr: string, m: boolean) => ({ nextReviewDate: nr, mastered: m }) as any
  assert.equal(isDueToday(due("2026-02-01", false), "2026-02-01"), true)
  assert.equal(isDueToday(due("2026-02-01", true), "2026-02-01"), false)
  assert.equal(isOverdue(due("2026-01-20", false), "2026-02-01"), true)
  assert.equal(isOverdue(due("2026-02-01", false), "2026-02-01"), false)
})

test("T9 calcReviewStats 空全 0；非空：due today/overdue/mastered + masteryRate + 本周新增", () => {
  const s0 = calcReviewStats([], "2026-02-01")
  assert.equal(s0.total, 0); assert.equal(s0.masteryRate, 0); assert.equal(s0.thisWeekCreated, 0)
  const today = "2026-06-01"
  const list = [
    { id: "1", nextReviewDate: "2026-05-25", mastered: false, createdAt: "2026-05-28T00:00:00Z" },
    { id: "2", nextReviewDate: "2026-06-01", mastered: false, createdAt: "2026-05-26T00:00:00Z" },
    { id: "3", nextReviewDate: "2026-06-10", mastered: true, createdAt: "2026-01-01T00:00:00Z" },
  ] as any
  const s = calcReviewStats(list, today)
  assert.equal(s.total, 3)
  assert.equal(s.dueToday, 2)
  assert.equal(s.overdue, 1)
  assert.equal(s.mastered, 1)
  assert.equal(s.masteryRate, Math.round(1 / 3 * 100))
  assert.equal(s.thisWeekCreated, 2)
})

test("T10 advanceStage 6 阶段后 mastered=true；普通推进更新 nextReviewDate", () => {
  const base = mk({ subject: "s", knowledge: "k", learnDate: "2026-02-01" })
  let cur = base
  for (let i = 1; i <= 5; i++) cur = advanceStage(cur)
  assert.equal(cur.stage, 6); assert.equal(cur.mastered, false)
  cur = advanceStage(cur)
  assert.equal(cur.mastered, true)
  const mAgain = advanceStage(cur)
  assert.equal(mAgain, cur)
})

test("T11 resetStage：已掌握/阶段1 回重置；其他重置 stage 1 + P1 重算", () => {
  const r = mk({ subject: "s", knowledge: "k", learnDate: "2026-02-01", stage: 5 })
  const x = resetStage(r)
  assert.equal(x.stage, 1); assert.equal(x.nextReviewDate, "2026-02-02")
  const m = mk({ subject: "s", knowledge: "k", learnDate: "2026-02-01", mastered: true })
  const y = resetStage(m)
  assert.equal(y.mastered, false); assert.equal(y.stage, 1)
})

test("T12 stageLabel / daysUntil", () => {
  assert.equal(stageLabel(3), "阶段 3/6")
  assert.equal(daysUntil("2026-02-05", "2026-02-01"), 4)
  assert.equal(daysUntil("2026-02-01", "2026-02-05"), -4)
  assert.equal(daysUntil("bad", "2026-02-01"), 0)
})

let p = 0, f = 0
for (const t of tests) {
  try { t.fn(); p++; console.log("  OK " + t.name) }
  catch (e) { f++; console.error("  FAIL " + t.name); console.error(e) }
}
console.log("\n" + p + "/" + tests.length + " passed")
if (f > 0) process.exit(1)
