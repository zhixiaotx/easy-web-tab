import assert from "node:assert/strict"
import {
  emptyParentTasksData, normalizeParentTasksData,
  sortParentTasks, parentTasksByDate, todayKey, newParentTaskId, parentTasksWeekStats, validateParentTaskForm
} from "../src/composables/studentParentTaskCore.ts"

const tests = []
function test(n, f) { tests.push({ name: n, fn: f }) }

test("T1 empty / todayKey 是合法 YYYY-MM-DD", () => {
  assert.deepEqual(emptyParentTasksData(), { tasks: [] })
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(todayKey()))
})

test("T2 normalizeParentTasksData：字符串/数字/null → empty；支持对象{ tasks }或裸数组", () => {
  assert.deepEqual(normalizeParentTasksData("x"), emptyParentTasksData())
  assert.deepEqual(normalizeParentTasksData(123), emptyParentTasksData())
  assert.deepEqual(normalizeParentTasksData(null), emptyParentTasksData())
  const arr = [{ title: "A", date: "2026-02-01" }]
  assert.equal(normalizeParentTasksData(arr).tasks.length, 1)
  assert.equal(normalizeParentTasksData({ tasks: arr }).tasks.length, 1)
})

test("T3 normalizeOne：title 空→剔除；title 超长→截断 100；date 非法→fallbackDate（今日）；done 强制布尔；id 格式正则 pt_...", () => {
  const a = normalizeParentTasksData([{ title: " ", date: "2026-02-01" }, { title: "B", date: "2026-02-01", done: "any truthy" as any }])
  assert.equal(a.tasks.length, 1)
  assert.equal(a.tasks[0].done, true)
  const long = normalizeParentTasksData([{ title: "T".repeat(200), date: "2026-02-01" }]).tasks[0]
  assert.equal(long.title.length, 100)
  const badDate = normalizeParentTasksData([{ title: "T", date: "BAD-DATE-X" }]).tasks[0]
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(badDate.date))
  const t = normalizeParentTasksData([{ title: "T", date: "2026-02-01", id: "pt_ok-id-01" }]).tasks[0]
  assert.equal(t.id, "pt_ok-id-01")
  const badId = normalizeParentTasksData([{ title: "T", date: "2026-02-01", id: "!invalid!pt_" }]).tasks[0]
  assert.ok(/^pt_\d{4}-\d{2}-\d{2}_\d{3}$/.test(badId.id))
  // 所有条目恒含 source: 'parent'
  assert.equal(t.source, "parent")
  assert.equal(badDate.source, "parent")
})

test("T4 同 id 冲突自动追加随机后缀去重（fallbackIndex 两任务 title 同 但 date 同时→同默认 id）", () => {
  const raw = [
    { title: "同1", date: "2026-02-01" },
    { title: "同2", date: "2026-02-01" },
    { title: "同3", date: "2026-02-01", id: "pt_2026-02-01_001" } // 与第 1 条默认 id 冲突
  ]
  const out = normalizeParentTasksData(raw).tasks
  assert.equal(out.length, 3)
  const ids = new Set(out.map(t => t.id))
  assert.equal(ids.size, 3)
})

test("T5 sortParentTasks：date 升 → !done 先 → id 升；返回新数组不改入参", () => {
  const list = [
    { id: "z", title: "", date: "2026-02-03", done: false, source: "parent" as const },
    { id: "a", title: "", date: "2026-02-01", done: true, source: "parent" as const },
    { id: "b", title: "", date: "2026-02-01", done: false, source: "parent" as const },
    { id: "m", title: "", date: "2026-02-03", done: true, source: "parent" as const },
  ]
  const copy = list.map(x => ({ ...x }))
  const s = sortParentTasks(list)
  assert.equal(s[0].id, "b"); assert.equal(s[1].id, "a"); assert.equal(s[2].id, "z"); assert.equal(s[3].id, "m")
  assert.deepEqual(list, copy)
})

test("T6 parentTasksByDate：非法 date → []；合法 date 过滤 + 排序", () => {
  const list = [
    { id: "a", title: "", date: "2026-02-05", done: true, source: "parent" as const },
    { id: "b", title: "", date: "2026-02-05", done: false, source: "parent" as const },
    { id: "c", title: "", date: "2026-02-03", done: false, source: "parent" as const },
  ]
  assert.deepEqual(parentTasksByDate(list, "bad"), [])
  const d5 = parentTasksByDate(list, "2026-02-05")
  assert.equal(d5.length, 2); assert.equal(d5[0].id, "b"); assert.equal(d5[1].id, "a")
})

test("T7 newParentTaskId：前缀 pt_YYYYMMDD_HHmmss_XXXX；参数固定时间相同两次结果不同 (随机部分)", () => {
  const now = new Date(2026, 1, 5, 8, 5, 3)
  const a = newParentTaskId(now)
  const b = newParentTaskId(now)
  assert.ok(a.startsWith("pt_20260205_"))
  assert.ok(a.includes("_080503_"))
  assert.notEqual(a, b) // 随机 4 hex
  const noArg = newParentTaskId()
  assert.ok(/^pt_\d{8}_\d{6}_[0-9a-f]{4}$/.test(noArg))
})

test("T8 parentTasksWeekStats：7 条数据升序 6→0 天前；today 固定后，7 个日期连续且不含非窗口期", () => {
  const today = new Date(2026, 1, 5) // 本地 2026-02-05
  // 只填 3 条：昨、今、再 7 天外（不在窗口）
  const list = [
    { id: "a", title: "t", date: "2026-02-04", done: true, source: "parent" as const },
    { id: "b", title: "t", date: "2026-02-05", done: false, source: "parent" as const },
    { id: "c", title: "t", date: "2026-02-05", done: true, source: "parent" as const },
    { id: "d", title: "t", date: "2026-01-20", done: true, source: "parent" as const },
  ]
  const s = parentTasksWeekStats(list, today)
  assert.equal(s.length, 7)
  assert.equal(s[0].date, "2026-01-30"); assert.equal(s[6].date, "2026-02-05")
  // 今日总 2 条完成 1
  const tod = s[6]
  assert.equal(tod.total, 2); assert.equal(tod.done, 1)
  // 昨日 1 条完成 1
  assert.equal(s[5].total, 1); assert.equal(s[5].done, 1)
  // 其余日全空
  for (let i = 0; i < 5; i++) {
    assert.equal(s[i].total, 0, s[i].date); assert.equal(s[i].done, 0)
  }
})

test("T9 validateParentTaskForm：title 空→empty；超长>100→long；date 非法→invalid；三者合法→ok", () => {
  assert.deepEqual(validateParentTaskForm("   ", "2026-02-01"), { ok: false, reason: "empty-title" })
  assert.deepEqual(validateParentTaskForm("T".repeat(101), "2026-02-01"), { ok: false, reason: "long-title" })
  assert.deepEqual(validateParentTaskForm("T", "BAD"), { ok: false, reason: "invalid-date" })
  assert.deepEqual(validateParentTaskForm("正常任务", "2026-02-01"), { ok: true })
})

let p = 0, f = 0
for (const t of tests) {
  try { t.fn(); p++; console.log("  OK " + t.name) }
  catch (e) { f++; console.error("  FAIL " + t.name); console.error(e) }
}
console.log("\n" + p + "/" + tests.length + " passed")
if (f > 0) process.exit(1)


