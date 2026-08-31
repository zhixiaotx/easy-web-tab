import assert from "node:assert/strict"
import {
  PLAN_ID_PREFIX, PLAN_GOAL_ID_PREFIX,
  emptyPlanData, normalizePlanGoal, normalizePlan, normalizePlanData,
  sortPlans, filterByType, isPlanActive, isPlanCompleted, calcPlanProgress,
  calcPlanStats, updateGoalProgress, toggleGoalDone
} from "../src/composables/studentPlanCore.ts"

const tests = []
function test(n, f) { tests.push({ name: n, fn: f }) }

test("T1 empty", () => assert.deepEqual(emptyPlanData(), { entries: [] }))

test("T2 normalizePlanGoal 空→null；progress 钳；done 布尔", () => {
  assert.equal(normalizePlanGoal(null), null)
  const g = normalizePlanGoal({ content: "目标", progress: 150 })
  assert.ok(g.id.startsWith(PLAN_GOAL_ID_PREFIX))
  assert.equal(g.progress, 100)
  assert.equal(g.done, false)
})

test("T3 normalizePlan 必填空/end≤start→null；type 默认 weekly", () => {
  assert.equal(normalizePlan({ title: "" }), null)
  assert.equal(normalizePlan({ title: "A", startDate: "2026-02-01", endDate: "2026-01-01" }), null)
  const p = normalizePlan({ title: "期末复习", startDate: "2026-01-01", endDate: "2026-02-01" })
  assert.equal(p.type, "weekly")
  assert.ok(p.id.startsWith(PLAN_ID_PREFIX))
})

test("T4 normalizePlan goals 空内容被过滤 + review 可选", () => {
  const p = normalizePlan({ title: "P", startDate: "2026-01-01", endDate: "2026-02-01", goals: [{ content: "g1" }, { content: "" }, { content: "g2" }], review: "总体" })
  assert.equal(p.goals.length, 2)
  assert.equal(p.review, "总体")
})

test("T5 normalizePlanData 裸数组 + 对象；非法→empty", () => {
  const it = { title: "X", startDate: "2026-01-01", endDate: "2026-02-01" }
  assert.equal(normalizePlanData([it]).entries.length, 1)
  assert.equal(normalizePlanData({ entries: [it] }).entries.length, 1)
  assert.deepEqual(normalizePlanData(""), emptyPlanData())
})

test("T6 sortPlans startDate 降 → createdAt 降", () => {
  const list = [
    { id: "a", type: "weekly" as const, title: "", startDate: "2026-01-01", endDate: "2026-01-10", goals: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "" },
    { id: "b", type: "weekly" as const, title: "", startDate: "2026-03-01", endDate: "2026-03-10", goals: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "" },
  ]
  assert.equal(sortPlans(list)[0].id, "b")
})

test("T7 filterByType all/weekly/monthly/term", () => {
  const list = [{ type: "weekly" }, { type: "monthly" }, { type: "term" }].map(x => ({ ...x, id: "", title: "", startDate: "2026-01-01", endDate: "2026-02-01", goals: [], createdAt: "", updatedAt: "" }))
  assert.equal(filterByType(list as any, "all").length, 3)
  assert.equal(filterByType(list as any, "term").length, 1)
})

test("T8 isPlanActive 区间闭合", () => {
  const p = { startDate: "2026-01-10", endDate: "2026-01-20" } as any
  assert.equal(isPlanActive(p, "2026-01-09"), false)
  assert.equal(isPlanActive(p, "2026-01-10"), true)
  assert.equal(isPlanActive(p, "2026-01-20"), true)
})

test("T9 isPlanCompleted 无目标视为未完成", () => {
  assert.equal(isPlanCompleted({ goals: [] } as any), false)
  assert.equal(isPlanCompleted({ goals: [{ done: true }, { done: true }] } as any), true)
  assert.equal(isPlanCompleted({ goals: [{ done: false }] } as any), false)
})

test("T10 calcPlanProgress 按目标均分；空目标=0；四舍五入", () => {
  assert.equal(calcPlanProgress({ goals: [] } as any), 0)
  assert.equal(calcPlanProgress({ goals: [{ progress: 50 }, { progress: 60 }] } as any), 55)
})

test("T11 calcPlanStats 空+非空本周新增", () => {
  const today = "2026-06-01"
  assert.deepEqual(calcPlanStats([], today), { total: 0, active: 0, completed: 0, avgProgress: 0, thisWeekCreated: 0 })
  const list = [
    { id: "a", type: "weekly", title: "", startDate: "2026-05-25", endDate: "2026-06-05", goals: [{ done: true, progress: 100, id: "g1", content: "" }], createdAt: "2026-05-28T00:00:00Z", updatedAt: "" },
    { id: "b", type: "weekly", title: "", startDate: "2026-05-01", endDate: "2026-05-10", goals: [{ done: false, progress: 50, id: "g2", content: "" }], createdAt: "2026-04-01T00:00:00Z", updatedAt: "" },
  ] as any
  const s = calcPlanStats(list, today)
  assert.equal(s.total, 2)
  assert.equal(s.active, 1)
  assert.equal(s.completed, 1)
})

test("T12 updateGoalProgress 只增不减 + 100 自动 done", () => {
  const plan = { goals: [{ id: "g1", progress: 40, done: false, content: "A" }] } as any
  const a = updateGoalProgress(plan, "g1", 30)
  assert.equal(a.goals[0].progress, 40)
  const b = updateGoalProgress(plan, "g1", 100)
  assert.equal(b.goals[0].done, true)
})

test("T13 toggleGoalDone 100→false 回退 99；false→true 设 100", () => {
  const plan = { goals: [{ id: "g1", progress: 100, done: true, content: "A" }] } as any
  const a = toggleGoalDone(plan, "g1")
  assert.equal(a.goals[0].done, false)
  assert.equal(a.goals[0].progress, 99)
  const b = toggleGoalDone(a, "g1")
  assert.equal(b.goals[0].done, true)
  assert.equal(b.goals[0].progress, 100)
})

let p = 0, f = 0
for (const t of tests) {
  try { t.fn(); p++; console.log("  OK " + t.name) }
  catch (e) { f++; console.error("  FAIL " + t.name); console.error(e) }
}
console.log("\n" + p + "/" + tests.length + " passed")
if (f > 0) process.exit(1)
