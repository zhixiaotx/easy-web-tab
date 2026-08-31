import assert from "node:assert/strict"
import {
  EXAM_DEFAULT_SORT, EXAM_DEFAULT_DIRECTION,
  emptyExamData, normalizeExamData, buildExamItems,
  STUDENT_EXAM_TYPE_BUILTINS, stageExamTypeSuggestions, examTypeOptions,
  normalizeCountdown, categoryLabel, parseRepeat, sortCountdowns, calcRemaining
} from "../src/composables/studentExamCore.ts"

const tests = []
function test(n, f) { tests.push({ name: n, fn: f }) }

test("T1 默认常量 / emptyExamData", () => {
  assert.equal(EXAM_DEFAULT_SORT, "remaining")
  assert.equal(EXAM_DEFAULT_DIRECTION, "asc")
  assert.deepEqual(emptyExamData(), { countdowns: [], customCategories: [], sortRule: "remaining" })
})

test("T2 normalizeExamData 非对象 / 数组 → empty；customCategories trim+去重；非法分类被过滤", () => {
  assert.deepEqual(normalizeExamData("x"), emptyExamData())
  assert.deepEqual(normalizeExamData([]), emptyExamData())
  const o = { customCategories: [" 期中 ", "", "期中", 123 as any, "期末"] }
  assert.deepEqual(normalizeExamData(o).customCategories, ["期中", "期末"])
})

test("T3 normalizeExamData sortRule 已知模式保留；非法回退 remaining；countdowns 空数组 OK", () => {
  assert.equal(normalizeExamData({ sortRule: "name" }).sortRule, "name")
  assert.equal(normalizeExamData({ sortRule: "manual" }).sortRule, "manual")
  assert.equal(normalizeExamData({ sortRule: "bad-mode" }).sortRule, "remaining")
  assert.equal(normalizeExamData({ countdowns: [] }).countdowns.length, 0)
})

test("T4 countdowns 归一 + 重复 id 去重（首条保留）", () => {
  const raw = {
    countdowns: [
      { id: "c1", name: "中考", endDateTime: "2026-06-20T09:00:00Z", category: "exam", repeat: "once" },
      { id: "c1", name: "中考2", endDateTime: "2026-07-01T09:00:00Z", category: "exam", repeat: "once" },
    ]
  }
  const out = normalizeExamData(raw)
  assert.equal(out.countdowns.length, 1)
  assert.equal(out.countdowns[0].name, "中考")
})

test("T5 normalizeCountdown (重导出) + parseRepeat 生效", () => {
  const c = normalizeCountdown({ name: "A", endDateTime: "2026-01-01T00:00:00Z", category: "custom", repeat: "once" })
  assert.equal(c.name, "A")
  assert.equal(parseRepeat("once"), null)
  assert.equal(parseRepeat({ type: "yearly" }).type, "yearly")
  assert.equal(categoryLabel("unknown-category"), "unknown-category")
})

test("T6 buildExamItems 追加 remaining 字段；不改变原 countdowns 引用", () => {
  const c = normalizeCountdown({ name: "A", endDateTime: "2999-01-01T00:00:00Z", category: "work", repeat: "once" })
  const items = buildExamItems([c])
  assert.equal(items.length, 1)
  assert.equal(typeof items[0].remaining, "object")
  assert.ok(!(c as any).remaining)
})

test("T7 STUDENT_EXAM_TYPE_BUILTINS：K 空 / P 有期中期末 / J 有月考随堂测；examTypeSuggestions 副本", () => {
  assert.deepEqual(STUDENT_EXAM_TYPE_BUILTINS.K, [])
  assert.deepEqual(STUDENT_EXAM_TYPE_BUILTINS.P, ["单元测","期中考试","期末考试"])
  assert.ok(STUDENT_EXAM_TYPE_BUILTINS.J.includes("月考"))
  const a = stageExamTypeSuggestions("J")
  const b = stageExamTypeSuggestions("J")
  assert.notEqual(a, b)
  b.pop()
  assert.equal(a.length, stageExamTypeSuggestions("J").length)
})

test("T8 examTypeOptions 内置优先 + custom 去重 + 空分类剔除；内置与 custom 重叠去重", () => {
  const opts = examTypeOptions("P", ["期中", " 期中期末 ", "期中考试", "", "单元测", " 竞赛 "])
  assert.deepEqual(opts, ["单元测", "期中考试", "期末考试", "期中", "期中期末", "竞赛"])
})

test("T9 sortCountdowns (重导出)：EXAM_DEFAULT_SORT remaining + direction asc 要求 CountdownItem[]", () => {
  const countdowns = [
    normalizeCountdown({ id: "c1", name: "早", endDateTime: "2026-01-10T00:00:00Z", category: "work", repeat: "once" }),
    normalizeCountdown({ id: "c2", name: "中", endDateTime: "2026-01-05T00:00:00Z", category: "work", repeat: "once" }),
    normalizeCountdown({ id: "c3", name: "晚", endDateTime: "2999-03-01T00:00:00Z", category: "work", repeat: "once" }),
    normalizeCountdown({ id: "c4", name: "超远", endDateTime: "2999-01-05T00:00:00Z", category: "work", repeat: "once" }),
  ]
  const items = buildExamItems(countdowns)
  const s = sortCountdowns(items, EXAM_DEFAULT_SORT, EXAM_DEFAULT_DIRECTION)
  // 未过期先：c4(2999-01) → c3(2999-03)；已过期 c2 → c1
  assert.equal(s[0].id, "c4")
  assert.equal(s[1].id, "c3")
  assert.equal(s[s.length - 1].id, "c2")
})

test("T10 calcRemaining 未过期返回 days/hours；normalizeExamData 幂等：二次归一结果一致", () => {
  const c = normalizeCountdown({ name: "期末", endDateTime: "2999-06-20T09:00:00Z", category: "study", repeat: { type: "yearly" } })
  const rem = calcRemaining(c.endDateTime, c.repeat)
  assert.equal(rem.isExpired, false)
  const once = normalizeExamData({ countdowns: [c], customCategories: ["模拟"], sortRule: "name" })
  const twice = normalizeExamData(once)
  assert.deepEqual(twice, once)
})

let p = 0, f = 0
for (const t of tests) {
  try { t.fn(); p++; console.log("  OK " + t.name) }
  catch (e) { f++; console.error("  FAIL " + t.name); console.error(e) }
}
console.log("\n" + p + "/" + tests.length + " passed")
if (f > 0) process.exit(1)


