import assert from "node:assert/strict"
import {
  MISTAKE_ID_PREFIX, KNOWN_STATUSES,
  emptyMistakesData, normalizeMistake, normalizeMistakesData,
  sortMistakes, filterBySubjectMistakes, filterByStatus, filterByTags, filterByKeyword,
  calcMistakeStats, advanceStatus, resetStatus, statusLabel, getToday, isValidDate
} from "../src/composables/studentMistakesCore.ts"

const tests = []
function test(n, f) { tests.push({ name: n, fn: f }) }
function mk(o: any) { return normalizeMistake(o) }

test("T1 常量 / empty / getToday / isValidDate", () => {
  assert.deepEqual(KNOWN_STATUSES, ["new", "reviewing", "mastered"])
  assert.deepEqual(emptyMistakesData(), { entries: [] })
  assert.equal(isValidDate("2026-02-01"), true)
  assert.equal(isValidDate("bad"), false)
  assert.ok(isValidDate(getToday()))
})

test("T2 normalizeMistake subject/question/answer 缺任一→null；imageIds 恒 []", () => {
  assert.equal(normalizeMistake(null), null)
  assert.equal(normalizeMistake({ subject: "", question: "q", answer: "a" }), null)
  assert.equal(normalizeMistake({ subject: "s", question: "", answer: "a" }), null)
  assert.equal(normalizeMistake({ subject: "s", question: "q", answer: "" }), null)
  const m = mk({ subject: " 数学 ", question: " Q ", answer: " A ", imageIds: ["1"] })
  assert.ok(m.id.startsWith(MISTAKE_ID_PREFIX))
  assert.equal(m.subject, "数学"); assert.equal(m.question, "Q"); assert.equal(m.answer, "A")
  assert.deepEqual(m.imageIds, [])
})

test("T3 subject 50 / question 5000 / answer 5000 截断", () => {
  const m = mk({ subject: "A".repeat(80), question: "B".repeat(6000), answer: "C".repeat(6000) })
  assert.equal(m.subject.length, 50)
  assert.equal(m.question.length, 5000)
  assert.equal(m.answer.length, 5000)
})

test("T4 status 非法→new；合法 status 保留；tags 去重+10条上限", () => {
  assert.equal(mk({ subject: "s", question: "q", answer: "a", status: "xxx" }).status, "new")
  assert.equal(mk({ subject: "s", question: "q", answer: "a", status: "reviewing" }).status, "reviewing")
  const tags = ["代数","代数","函数","极限","导数","积分","三角","向量","概率","统计","几何","复数"]
  const m = mk({ subject: "s", question: "q", answer: "a", tags })
  assert.equal(m.tags.length, 10)
})

test("T5 title/analysis/linkedReviewId 可选；空字符串不输字段", () => {
  const m = mk({ subject: "s", question: "q", answer: "a", title: "T", analysis: "A", linkedReviewId: "rv_1 " })
  assert.equal(m.title, "T"); assert.equal(m.analysis, "A"); assert.equal(m.linkedReviewId, "rv_1")
  const m2 = mk({ subject: "s", question: "q", answer: "a", title: "   ", analysis: "" })
  assert.ok(!("title" in m2)); assert.ok(!("analysis" in m2))
})

test("T6 normalizeMistakesData 裸数组 / 对象 entries / 非法→empty；幂等", () => {
  const it = { subject: "语", question: "文言", answer: "之乎" }
  assert.equal(normalizeMistakesData([it]).entries.length, 1)
  assert.equal(normalizeMistakesData({ entries: [it] }).entries.length, 1)
  assert.deepEqual(normalizeMistakesData("bad"), emptyMistakesData())
  const once = normalizeMistakesData([it]).entries
  const twice = normalizeMistakesData({ entries: once }).entries
  assert.equal(twice[0].id, once[0].id); assert.equal(twice[0].status, once[0].status)
})

test("T7 sortMistakes：new→reviewing→mastered 未掌握优先；同状态 updatedAt 降序；不修改入参", () => {
  const list = [
    { id: "a", subject: "", question: "", answer: "", status: "mastered" as const, createdAt: "", updatedAt: "2026-03-01T00:00:00Z" },
    { id: "b", subject: "", question: "", answer: "", status: "new" as const, createdAt: "", updatedAt: "2026-02-01T00:00:00Z" },
    { id: "c", subject: "", question: "", answer: "", status: "reviewing" as const, createdAt: "", updatedAt: "2026-04-01T00:00:00Z" },
    { id: "d", subject: "", question: "", answer: "", status: "new" as const, createdAt: "", updatedAt: "2026-02-10T00:00:00Z" },
  ]
  const copy = list.map(x => ({ ...x }))
  const s = sortMistakes(list as any)
  assert.deepEqual(list, copy)
  assert.equal(s[0].id, "d"); assert.equal(s[s.length - 1].id, "a")
})

test("T8 四种筛选：subject/status/tags(任一)/keyword(大小写不敏感)", () => {
  const list = [
    { id: "1", subject: "数学", title: "第一章", question: "分数", answer: "答案1", analysis: "约分", status: "new", tags: ["数论"] },
    { id: "2", subject: "语文", question: "古文", answer: "答案2", analysis: "", status: "reviewing", tags: ["文言文", "默写"] },
    { id: "3", subject: "数学", question: "方程", answer: "答案3", analysis: "移项", status: "mastered", tags: ["代数"] },
  ] as any
  assert.equal(filterBySubjectMistakes(list, "数学").length, 2)
  assert.equal(filterBySubjectMistakes(list, "all").length, 3)
  assert.equal(filterByStatus(list, "mastered").length, 1)
  assert.equal(filterByStatus(list, "all").length, 3)
  assert.equal(filterByTags(list, ["代数", "默写"]).length, 2)
  assert.equal(filterByTags(list, []).length, 3)
  assert.equal(filterByKeyword(list, "约分").length, 1)
  assert.equal(filterByKeyword(list, "一章").length, 1)
  assert.equal(filterByKeyword(list, "古文").length, 1)
  assert.equal(filterByKeyword(list, "   ").length, 3)
})

test("T9 calcMistakeStats 空 → 全 0；非空三状态 + 掌握率 + 本周新增 + 独立学科数", () => {
  const t = "2026-06-01"
  const s0 = calcMistakeStats([], t)
  assert.deepEqual(s0, { total: 0, fresh: 0, reviewing: 0, mastered: 0, masteryRate: 0, thisWeekCreated: 0, distinctSubjects: 0 })
  const list = [
    { id: "1", subject: "数学", status: "new", createdAt: "2026-05-26T00:00:00Z" },
    { id: "2", subject: "数学", status: "reviewing", createdAt: "2026-05-30T00:00:00Z" },
    { id: "3", subject: "语文", status: "mastered", createdAt: "2026-01-01T00:00:00Z" },
  ] as any
  const s = calcMistakeStats(list, t)
  assert.equal(s.total, 3); assert.equal(s.fresh, 1); assert.equal(s.reviewing, 1); assert.equal(s.mastered, 1)
  assert.equal(s.masteryRate, Math.round(1 / 3 * 100)); assert.equal(s.thisWeekCreated, 2); assert.equal(s.distinctSubjects, 2)
})

test("T10 advanceStatus 新→复习中→已掌握；已掌握 idem；resetStatus 回 new", () => {
  const a = { id: "1", subject: "s", question: "q", answer: "a", status: "new" as const, createdAt: "", updatedAt: "" }
  const b = advanceStatus(a)
  assert.equal(b.status, "reviewing"); assert.ok(b.updatedAt !== a.updatedAt || b.status !== a.status)
  const c = advanceStatus(b)
  assert.equal(c.status, "mastered")
  const d = advanceStatus(c)
  assert.equal(d, c)
  assert.equal(resetStatus(c).status, "new")
  const e = { ...a }
  assert.equal(resetStatus(e), e)
})

test("T11 statusLabel", () => {
  assert.equal(statusLabel("new"), "未复习")
  assert.equal(statusLabel("reviewing"), "复习中")
  assert.equal(statusLabel("mastered"), "已掌握")
})

let p = 0, f = 0
for (const t of tests) {
  try { t.fn(); p++; console.log("  OK " + t.name) }
  catch (e) { f++; console.error("  FAIL " + t.name); console.error(e) }
}
console.log("\n" + p + "/" + tests.length + " passed")
if (f > 0) process.exit(1)

