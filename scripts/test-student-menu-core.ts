import assert from "node:assert/strict"
import {
  STUDENT_MENU_KEYS,
  STUDENT_MENU_DEFAULT_ORDER,
  STUDENT_MENU_DEFAULT_LABELS,
  STUDENT_MENU_ICONS,
  type StudentStage,
  type StudentSettings
} from "../src/types/index.ts"
import {
  applyStageDefaultVisibility,
  defaultStudentMenuOrder,
  isStudentMenuEnabled,
  moveStudentMenuItem,
  normalizeStudentMenu,
  normalizeStudentMenuVisibility,
  renameStudentMenuLabel,
  resolveStudentMenu,
  resolveStudentMenuAll,
  resolveStudentMenuItems
} from "../src/composables/studentMenuCore.ts"

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) { tests.push({ name, fn }) }

// T1 常量完整性：16 键 home 首 + 字典大小匹配
test("T1 STUDENT_MENU 常量 16 项齐、home 首位", () => {
  assert.equal(STUDENT_MENU_KEYS.length, 16)
  assert.equal(STUDENT_MENU_KEYS[0], "home")
  assert.deepEqual(STUDENT_MENU_DEFAULT_ORDER, [...STUDENT_MENU_KEYS])
  assert.equal(Object.keys(STUDENT_MENU_DEFAULT_LABELS).length, 16)
  assert.equal(Object.keys(STUDENT_MENU_ICONS).length, 16)
})

// T2 normalizeStudentMenu 默认：16 项、home 恒 0、labels 空
test("T2 normalizeStudentMenu defaults", () => {
  const out = normalizeStudentMenu(undefined, undefined)
  assert.equal(out.order.length, 16)
  assert.equal(out.order[0], "home")
  assert.deepEqual(out.labels, {})
  assert.deepEqual(out.order, STUDENT_MENU_DEFAULT_ORDER)
})

// T3 未知键剔除、重复首胜、home 强制 0
test("T3 normalizeStudentMenu unknown/dedup/home forced", () => {
  const out = normalizeStudentMenu(["bogus", "homework", "homework", "reading"])
  assert.ok(!out.order.includes("bogus"))
  assert.equal(out.order.filter(k => k === "homework").length, 1)
  assert.equal(out.order[0], "home")
  assert.equal(out.order.length, 16)
})

// T4 labels 归一：trim/去空/截断 12 code point/未知剔除/非字符串剔除
test("T4 normalizeStudentMenu labels normalization", () => {
  const out = normalizeStudentMenu(undefined, {
    homework: "  数学作业  ",
    pomodoro: "   ",
    rewards: "一二三四五六七八九十一二三",
    bogus: "x",
    habits: 123
  })
  assert.equal(out.labels.homework, "数学作业")
  assert.ok(!("pomodoro" in out.labels))
  assert.ok(!("bogus" in out.labels))
  assert.ok(!("habits" in out.labels))
  assert.equal(out.labels.rewards, "一二三四五六七八九十一二")
})

// T5 normalizeStudentMenuVisibility：退化/非法/未知/非布尔剔除
test("T5 normalizeStudentMenuVisibility degenerate", () => {
  assert.deepEqual(normalizeStudentMenuVisibility(null), {})
  assert.deepEqual(normalizeStudentMenuVisibility([]), {})
  assert.deepEqual(normalizeStudentMenuVisibility("x"), {})
  const out = normalizeStudentMenuVisibility({ habits: false, bogus: true, rewards: "yep" })
  assert.equal(out.habits, false)
  assert.ok(!("bogus" in out))
  assert.ok(!("rewards" in out))
})

// T6 moveStudentMenuItem：home locked
test("T6 moveStudentMenuItem home locked", () => {
  assert.deepEqual(moveStudentMenuItem(STUDENT_MENU_DEFAULT_ORDER, "home", "up"), { ok: false, reason: "locked" })
  assert.deepEqual(moveStudentMenuItem(STUDENT_MENU_DEFAULT_ORDER, "home", "down"), { ok: false, reason: "locked" })
})

// T7 moveStudentMenuItem：边界 not-found/boundary + 中段邻居对调
test("T7 moveStudentMenuItem boundary & swap", () => {
  assert.equal(moveStudentMenuItem(STUDENT_MENU_DEFAULT_ORDER, "nope", "up").reason, "not-found")
  assert.equal(moveStudentMenuItem(STUDENT_MENU_DEFAULT_ORDER, "habits", "up").reason, "boundary") // habits=1 -> up idx0=home(locked 边界 <1)
  const last = STUDENT_MENU_DEFAULT_ORDER[STUDENT_MENU_DEFAULT_ORDER.length - 1]
  assert.equal(moveStudentMenuItem(STUDENT_MENU_DEFAULT_ORDER, last, "down").reason, "boundary")
  const r = moveStudentMenuItem(STUDENT_MENU_DEFAULT_ORDER, "homework", "up") // homework=2 <-> habits=1
  assert.equal(r.ok, true)
  if (r.order) { assert.equal(r.order[1], "homework"); assert.equal(r.order[2], "habits") }
})

// T8 rename：empty/not-found/ok + 截断 12
test("T8 renameStudentMenuLabel", () => {
  assert.equal(renameStudentMenuLabel({}, "habits", "   ").reason, "empty")
  assert.equal(renameStudentMenuLabel({}, "bogus", "x").reason, "not-found")
  const r = renameStudentMenuLabel({}, "habits", "一二三四五六七八九十一二三四")
  assert.equal(r.ok, true)
  assert.equal(r.labels?.habits, "一二三四五六七八九十一二")
})

// T9 resolveStudentMenuItems 无 visibility = 恒 16 项、label 回退默认、icon 查表
test("T9 resolveStudentMenuItems without visibility = 16 items", () => {
  const { order } = normalizeStudentMenu()
  const items = resolveStudentMenuItems(order, {})
  assert.equal(items.length, 16)
  assert.equal(items[0].key, "home")
  assert.equal(items[0].label, STUDENT_MENU_DEFAULT_LABELS.home)
  assert.equal(items[0].icon, STUDENT_MENU_ICONS.home)
})

// T10 resolveStudentMenuItems 带 visibility 过滤关闭项
test("T10 resolveStudentMenuItems with visibility filters hidden", () => {
  const { order } = normalizeStudentMenu()
  const items = resolveStudentMenuItems(order, {}, { homework: false, rewards: false })
  const keys = items.map(i => i.key)
  assert.ok(!keys.includes("homework"))
  assert.ok(!keys.includes("rewards"))
  assert.equal(keys[0], "home")
  assert.equal(keys.length, 14)
})

// T11 applyStageDefaultVisibility 保留用户已显式覆盖项
test("T11 applyStageDefaultVisibility keeps user overrides", () => {
  const applied = applyStageDefaultVisibility({ homework: false }, { homework: true, rewards: false })
  assert.equal(applied.homework, false, "用户已设 false 不应被学段默认覆盖")
  assert.equal(applied.rewards, false)
  assert.equal(applied.home, true) // 缺失应用学段默认，缺省 true
})

// T12 resolveStudentMenu + resolveStudentMenuAll：关闭项参与 all、不参与渲染
test("T12 resolveStudentMenu vs resolveStudentMenuAll hidden items", () => {
  const settings = {
    menuOrder: undefined, menuLabels: undefined,
    menuVisibility: { pomodoro: false },
    stage: "J1" as StudentStage, childName: "",
    parentPinHash: undefined, parentPinSalt: undefined,
    navFiltersExpanded: false
  } as StudentSettings
  const items = resolveStudentMenu(settings)
  const all = resolveStudentMenuAll(settings)
  assert.equal(all.length, 16)
  assert.equal(items.length, 15)
  assert.ok(!items.map(i => i.key).includes("pomodoro"))
  assert.equal(isStudentMenuEnabled(settings, "home"), true)
  assert.equal(isStudentMenuEnabled(settings, "pomodoro"), false)
})

// T13 defaultStudentMenuOrder 返回新数组（引用安全）
test("T13 defaultStudentMenuOrder defensive copy", () => {
  const a = defaultStudentMenuOrder()
  const b = defaultStudentMenuOrder()
  assert.notEqual(a, b)
  assert.deepEqual(a, STUDENT_MENU_DEFAULT_ORDER)
  a.shift()
  assert.deepEqual(defaultStudentMenuOrder(), STUDENT_MENU_DEFAULT_ORDER)
})

let passed = 0, failed = 0
for (const t of tests) {
  try { t.fn(); passed++; console.log(`  OK ${t.name}`) }
  catch (e) { failed++; console.error(`  FAIL ${t.name}`); console.error(e) }
}
console.log(`\n${passed}/${tests.length} passed`)
if (failed > 0) process.exit(1)