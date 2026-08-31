import assert from "node:assert/strict"
import {
  HOMEWORK_ID_PREFIX, emptyHomeworkData, normalizeHomework, normalizeHomeworkData,
  autoFlowStatus, filterBySubject, filterByStatus, sortHomework,
  nextStatus, statusLabel, priorityLabel
} from "../src/composables/studentHomeworkCore.ts"

const tests = []
function test(n, f) { tests.push({ name: n, fn: f }) }

test("T1 emptyHomeworkData", () => assert.deepEqual(emptyHomeworkData(), { entries: [] }))

test("T2 normalizeHomework 必填空→null；合法项前缀+默认 pending/self", () => {
  assert.equal(normalizeHomework(null), null)
  assert.equal(normalizeHomework({ title: "", subject: "数学", dueDate: "2026-02-01" }), null)
  const h = normalizeHomework({ title: "习题1", subject: "数学", dueDate: "2026-02-01" })
  assert.ok(h.id.startsWith(HOMEWORK_ID_PREFIX))
  assert.equal(h.status, "pending")
  assert.equal(h.source, "self")
})

test("T3 normalizeHomework 非法 enum 归一为默认；source=parent 保留", () => {
  const h = normalizeHomework({ title: "t", subject: "s", dueDate: "2026-02-01", priority: "bad", status: "weird", source: "parent" })
  assert.equal(h.priority, "normal")
  assert.equal(h.status, "pending")
  assert.equal(h.source, "parent")
})

test("T4 normalizeHomeworkData 裸数组 + 对象 entries 都兼容", () => {
  const it = { title: "A", subject: "数学", dueDate: "2026-02-01" }
  assert.equal(normalizeHomeworkData([it]).entries.length, 1)
  assert.equal(normalizeHomeworkData({ entries: [it] }).entries.length, 1)
  assert.deepEqual(normalizeHomeworkData(null), emptyHomeworkData())
})

test("T5 autoFlowStatus 过去日未完成→overdue；done 不动", () => {
  const today = "2026-02-01"
  const list = [
    { id: "1", subject: "s", title: "", dueDate: "2026-01-01", status: "pending", priority: "normal", source: "self" as const, createdAt: "", updatedAt: "" },
    { id: "2", subject: "s", title: "", dueDate: "2026-01-02", status: "done", priority: "normal", source: "self" as const, createdAt: "", updatedAt: "" },
    { id: "3", subject: "s", title: "", dueDate: "2026-03-01", status: "pending", priority: "normal", source: "self" as const, createdAt: "", updatedAt: "" },
  ]
  const out = autoFlowStatus(list as any, today)
  assert.equal(out[0].status, "overdue")
  assert.equal(out[1].status, "done")
  assert.equal(out[2].status, "pending")
})

test("T6 filterBySubject all/精确", () => {
  const es = [{ id: "a", subject: "数学" }, { id: "b", subject: "语文" }] as any
  assert.equal(filterBySubject(es, "all").length, 2)
  assert.equal(filterBySubject(es, "数学").length, 1)
})

test("T7 filterByStatus all/精确", () => {
  const es = [{ status: "pending" }, { status: "done" }] as any
  assert.equal(filterByStatus(es, "all").length, 2)
  assert.equal(filterByStatus(es, "done").length, 1)
})

test("T8 sortHomework 状态序→due→priority", () => {
  const base = { subject: "s", source: "self" as const }
  const list = [
    { id: "d", title: "", dueDate: "2026-02-05", status: "done" as const, priority: "normal", ...base },
    { id: "o", title: "", dueDate: "2026-01-01", status: "overdue" as const, priority: "normal", ...base },
    { id: "p", title: "", dueDate: "2026-02-10", status: "pending" as const, priority: "normal", ...base },
    { id: "ph", title: "", dueDate: "2026-02-10", status: "pending" as const, priority: "high" as const, ...base },
  ]
  const s = sortHomework(list as any)
  assert.equal(s[0].id, "o")
  assert.equal(s[1].id, "ph")
  assert.equal(s[2].id, "p")
  assert.equal(s[3].id, "d")
})

test("T9 nextStatus 状态机", () => {
  assert.equal(nextStatus("pending"), "doing")
  assert.equal(nextStatus("doing"), "done")
  assert.equal(nextStatus("done"), "done")
  assert.equal(nextStatus("overdue"), "doing")
})

test("T10 statusLabel + priorityLabel 中文", () => {
  assert.equal(statusLabel("pending"), "待办")
  assert.equal(statusLabel("done"), "已完成")
  assert.equal(statusLabel("overdue"), "逾期")
  assert.equal(priorityLabel("low"), "低")
  assert.equal(priorityLabel("high"), "高")
})

test("T11 normalizeHomework 内容保留原文不 trim；回填时间戳", () => {
  const h = normalizeHomework({ title: "x", subject: "y", dueDate: "2026-02-01", content: "  hello  " })
  assert.equal(h.content, "  hello  ")
  assert.ok(h.createdAt && h.updatedAt)
})

test("T12 autoFlowStatus 不修改原数组；状态变更时写 updatedAt", () => {
  const today = "2026-02-01"
  const origUpd = "2020-01-01T00:00:00Z"
  const list = [{ id: "1", subject: "s", title: "A", dueDate: "2026-01-01", status: "pending", priority: "normal", source: "self" as const, createdAt: "", updatedAt: origUpd }]
  const out = autoFlowStatus(list as any, today)
  assert.notEqual(out[0], list[0])
  assert.notEqual(out[0].updatedAt, origUpd)
})

let p = 0, f = 0
for (const t of tests) {
  try { t.fn(); p++; console.log("  OK " + t.name) }
  catch (e) { f++; console.error("  FAIL " + t.name); console.error(e) }
}
console.log("\n" + p + "/" + tests.length + " passed")
if (f > 0) process.exit(1)
