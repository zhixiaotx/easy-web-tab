import assert from "node:assert/strict"
import {
  normalizeStage, stageLabel, stageBadge,
  stageDefaultSubjects, stageDefaultHabits, stageDefaultPomodoro, stageDefaultMenuVisibility,
  shouldSeedStageDefaults, computeStageSwitchVisibility, planStageSwitch
} from "../src/composables/studentStageCore.ts"

const tests = []
function test(n, f) { tests.push({ name: n, fn: f }) }

test("T1 normalizeStage K/P/J 保留；非法一律 P", () => {
  assert.equal(normalizeStage("K"), "K")
  assert.equal(normalizeStage("P"), "P")
  assert.equal(normalizeStage("J"), "J")
  assert.equal(normalizeStage("X"), "P")
  assert.equal(normalizeStage(123), "P")
  assert.equal(normalizeStage(null), "P")
})

test("T2 stageLabel 中文：幼儿园/小学/初中", () => {
  assert.equal(stageLabel("K"), "幼儿园")
  assert.equal(stageLabel("P"), "小学")
  assert.equal(stageLabel("J"), "初中")
})

test("T3 stageBadge 每学段 label+color", () => {
  const k = stageBadge("K"); const p = stageBadge("P"); const j = stageBadge("J")
  assert.ok(k.label && k.color); assert.ok(p.label && p.color); assert.ok(j.label && j.color)
  assert.notEqual(k.color, p.color); assert.notEqual(p.color, j.color)
})

test("T4 stageDefaultSubjects 返回副本；K 空 / P 少 / J 多", () => {
  const k = stageDefaultSubjects("K"); const p = stageDefaultSubjects("P"); const j = stageDefaultSubjects("J")
  assert.deepEqual(k, [])
  assert.ok(p.length >= 3)
  assert.ok(j.length >= 9)
  const p2 = stageDefaultSubjects("P")
  p2.push("新学科")
  assert.equal(stageDefaultSubjects("P").length, p.length)
})

test("T5 stageDefaultHabits：K 7 / P 6 / J 5；副本", () => {
  const k = stageDefaultHabits("K"); const p = stageDefaultHabits("P"); const j = stageDefaultHabits("J")
  assert.equal(k.length, 7); assert.equal(p.length, 6); assert.equal(j.length, 5)
  const k2 = stageDefaultHabits("K")
  k2.pop()
  assert.equal(stageDefaultHabits("K").length, 7)
  // 非空 name + category
  k.forEach(h => { assert.ok(h.name); assert.ok(h.category) })
})

test("T6 stageDefaultPomodoro 分钟为正整数；focus>break；副本", () => {
  for (const s of ["K","P","J"] as const) {
    const r = stageDefaultPomodoro(s)
    assert.equal(Number.isInteger(r.focus), true)
    assert.equal(Number.isInteger(r.break), true)
    assert.ok(r.focus > 0 && r.break > 0)
    assert.ok(r.focus > r.break)
  }
  const a = stageDefaultPomodoro("P"); a.focus = 999
  const b = stageDefaultPomodoro("P")
  assert.notEqual(b.focus, 999)
})

test("T7 stageDefaultMenuVisibility 返回副本（含 10 个学生菜单键）", () => {
  for (const s of ["K","P","J"] as const) {
    const v = stageDefaultMenuVisibility(s)
    const keys = Object.keys(v)
    assert.ok(keys.length >= 10, `阶段 ${s} keys = ${keys.length}`)
  }
})

test("T8 shouldSeedStageDefaults settings.stageSeeded === stage → false；否则 true", () => {
  assert.equal(shouldSeedStageDefaults({ stageSeeded: "P" } as any, "P"), false)
  assert.equal(shouldSeedStageDefaults({ stageSeeded: "K" } as any, "P"), true)
  assert.equal(shouldSeedStageDefaults({} as any, "J"), true)
})

test("T9 computeStageSwitchVisibility：用户显式项保留，缺省字段按学段默认补齐", () => {
  const def = stageDefaultMenuVisibility("K")
  const keys = Object.keys(def) as (keyof typeof def)[]
  // 先把用户显式设 homework 为与默认相反（保证断言）
  const flipHomework = !def.homework
  const r = computeStageSwitchVisibility({ menuVisibility: { homework: flipHomework } } as any, "K")
  assert.equal(r.homework, flipHomework)
  for (const k of keys) assert.equal(typeof r[k], "boolean", `K ${String(k)}`)
})

test("T10 planStageSwitch：学段同 + needSeed=false；学段变 + needSeed=true；返回值字段齐全；pure 不改入参", () => {
  const orig = { stageSeeded: "P", menuVisibility: { exams: true } }
  const s1 = planStageSwitch(orig as any, "P")
  assert.equal(s1.stage, "P"); assert.equal(s1.needSeed, false)
  assert.equal(Array.isArray(s1.subjects), true)
  assert.equal(typeof s1.pomodoro.focus, "number")
  assert.equal(typeof s1.menuVisibility.homework, "boolean")
  const s2 = planStageSwitch(orig as any, "J")
  assert.equal(s2.stage, "J"); assert.equal(s2.needSeed, true)
  // 入参未被修改
  assert.equal(Object.keys(orig).length, 2)
})

test("T11 planStageSwitch subjects/pomodoro 与阶段默认值一致（内容一致性）", () => {
  const p = planStageSwitch({ stageSeeded: undefined } as any, "J")
  assert.deepEqual(p.subjects, stageDefaultSubjects("J"))
  assert.deepEqual(p.pomodoro, stageDefaultPomodoro("J"))
})

let p = 0, f = 0
for (const t of tests) {
  try { t.fn(); p++; console.log("  OK " + t.name) }
  catch (e) { f++; console.error("  FAIL " + t.name); console.error(e) }
}
console.log("\n" + p + "/" + tests.length + " passed")
if (f > 0) process.exit(1)
