import assert from "node:assert/strict"
import {
  STUDENT_HABIT_ID_PREFIX, STUDENT_HABIT_RECORD_ID_PREFIX,
  categoryLabel, isBuiltinCategory,
  emptyStudentHabitsData, normalizeStudentHabit, normalizeStudentHabitRecord,
  normalizeStudentHabitsData, shouldSeedStageHabits, buildStageSeedHabits,
  mergeStageSeedHabits, filterHabitsByCategory
} from "../src/composables/studentHabitsCore.ts"

const tests = []
function test(n, f) { tests.push({ name: n, fn: f }) }

test("T1 empty 零引用", () => {
  const a = emptyStudentHabitsData(), b = emptyStudentHabitsData()
  assert.deepEqual(a, { habits: [], records: [] })
  assert.notEqual(a, b)
})
test("T2 categoryLabel 内置+回退", () => {
  assert.equal(categoryLabel("life"), "生活")
  assert.equal(categoryLabel("study"), "学习")
  assert.equal(categoryLabel("exercise"), "运动")
  assert.equal(categoryLabel(""), "未分类")
  assert.equal(categoryLabel("cu"), "cu")
})
test("T3 isBuiltinCategory", () => {
  assert.equal(isBuiltinCategory("life"), true)
  assert.equal(isBuiltinCategory(""), false)
})
test("T4 normalizeHabit 空名→null / 合法回填前缀", () => {
  assert.equal(normalizeStudentHabit(null), null)
  assert.equal(normalizeStudentHabit({ name: "   " }), null)
  const h = normalizeStudentHabit({ name: "背", category: "study" })
  assert.ok(h)
  assert.ok(h.id.startsWith(STUDENT_HABIT_ID_PREFIX))
  assert.equal(h.category, "study")
  assert.equal(h.frequency, 7)
})
test("T5 normalizeHabit freq 钳 1..7 / color 默认", () => {
  const a = normalizeStudentHabit({ name: "A", frequency: 99 })
  assert.equal(a.frequency, 7)
  const b = normalizeStudentHabit({ name: "B", frequency: -1, color: "bad" })
  assert.equal(b.frequency, 1)
  assert.ok(b.color.startsWith("#"))
})
test("T6 normalizeRecord 缺 habitId/date → null / parentMarked=true 保留", () => {
  assert.equal(normalizeStudentHabitRecord(null), null)
  assert.equal(normalizeStudentHabitRecord({ date: "2026-01-01" }), null)
  const r = normalizeStudentHabitRecord({ habitId: "h1", date: "2026-01-01", parentMarked: true })
  assert.ok(r)
  assert.ok(r.id.startsWith(STUDENT_HABIT_RECORD_ID_PREFIX))
  assert.equal(r.parentMarked, true)
})
test("T7 normalizeData 孤儿剔除 + 同日去重", () => {
  const raw = {
    habits: [{ id: "h1", name: "跑", category: "exercise", frequency: 7, color: "#10b981", createdAt: "" }],
    records: [
      { habitId: "h1", date: "2026-01-01" },
      { habitId: "h1", date: "2026-01-01" },
      { habitId: "xx", date: "2026-01-01" },
    ]
  }
  const o = normalizeStudentHabitsData(raw)
  assert.equal(o.habits.length, 1)
  assert.equal(o.records.length, 1)
})
test("T8 normalizeData 非法→empty", () => {
  assert.deepEqual(normalizeStudentHabitsData(null), emptyStudentHabitsData())
})
test("T9 shouldSeedStageHabits", () => {
  assert.equal(shouldSeedStageHabits(undefined, "P"), true)
  assert.equal(shouldSeedStageHabits("P", "P"), false)
})
test("T10 buildStageSeedHabits K=7 P=6 J=5 freq=每日", () => {
  assert.equal(buildStageSeedHabits("K").length, 7)
  assert.equal(buildStageSeedHabits("P").length, 6)
  assert.equal(buildStageSeedHabits("J").length, 5)
})
test("T11 merge 同名大小写不敏感跳过", () => {
  const ex = [{ id: "e1", name: "运动", category: "exercise", frequency: 7, color: "#10b981", createdAt: "" }]
  const sd = buildStageSeedHabits("K")
  const m = mergeStageSeedHabits(ex, sd)
  assert.equal(m.length, ex.length + sd.length - 1)
})
test("T12 filterHabitsByCategory all/uncategorized/精确", () => {
  const hs = [
    { id: "a", name: "A", category: "", frequency: 1, color: "#10b981", createdAt: "" },
    { id: "b", name: "B", category: "study", frequency: 1, color: "#10b981", createdAt: "" },
  ]
  assert.equal(filterHabitsByCategory(hs, "all").length, 2)
  assert.equal(filterHabitsByCategory(hs, "uncategorized").length, 1)
  assert.equal(filterHabitsByCategory(hs, "study").length, 1)
})

let p = 0, f = 0
for (const t of tests) {
  try { t.fn(); p++; console.log("  OK " + t.name) }
  catch (e) { f++; console.error("  FAIL " + t.name); console.error(e) }
}
console.log("\n" + p + "/" + tests.length + " passed")
if (f > 0) process.exit(1)

