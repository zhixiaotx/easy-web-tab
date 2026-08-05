import assert from 'node:assert/strict'
import { normalizeTodo, filterTodos, dueInfo, localToday } from '../src/composables/todoCore.ts'
import type { WorkbenchTodo } from '../src/types'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// T1 — normalizeTodo defaults: priority=medium, completed=false, color=default blue
test('T1 normalizeTodo defaults', () => {
  const base = normalizeTodo({})
  assert.equal(base.priority, 'medium')
  assert.equal(base.completed, false)
  assert.equal(base.color, '#3b82f6')
  assert.equal(typeof base.id, 'string')
  assert.ok(base.createdAt.length > 0)
  assert.ok(base.updatedAt.length > 0)
})

// T2 — normalizeTodo passthrough + priority/color validation + completed coercion
test('T2 normalizeTodo normalize', () => {
  const passthrough = normalizeTodo({ title: '周报', priority: 'high', dueDate: '2026-12-31' })
  assert.equal(passthrough.title, '周报')
  assert.equal(passthrough.priority, 'high')
  assert.equal(passthrough.dueDate, '2026-12-31')

  const migrated = normalizeTodo({ priority: 'bogus' as never, completed: 1 as never })
  assert.equal(migrated.priority, 'medium')
  // 严格布尔：非 true 一律视为未完成（防脏数据误标完成）
  assert.equal(migrated.completed, false)
  assert.equal(normalizeTodo({ completed: true }).completed, true)

  const colorOk = normalizeTodo({ color: '#EF4444' })
  assert.equal(colorOk.color, '#EF4444')
  assert.equal(normalizeTodo({ color: '#f00' }).color, '#f00')
  assert.equal(normalizeTodo({ color: 'red' }).color, '#3b82f6')
  assert.equal(normalizeTodo({ color: '' }).color, '#3b82f6')
  assert.equal(normalizeTodo({ color: 123 as unknown as string }).color, '#3b82f6')
})

// T3 — filterTodos: name (title/desc) / priority / status / combined / empty
function mkTodo(id: string, title: string, priority: WorkbenchTodo['priority'], completed = false, description?: string): WorkbenchTodo {
  return {
    id,
    title,
    description,
    priority,
    completed,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

test('T3 filterTodos', () => {
  const items = [
    mkTodo('a', '提交季度报告', 'high', false, '财务部'),
    mkTodo('b', '购买办公用品', 'low', false),
    mkTodo('c', '周会记录', 'medium', true, '整理本周会议纪要')
  ]

  // 空条件返回全部（且保持顺序）
  assert.equal(filterTodos(items).length, 3)

  // 名称模糊：命中标题
  assert.deepEqual(filterTodos(items, { name: '季度' }).map(t => t.id), ['a'])
  // 名称模糊：命中描述
  assert.deepEqual(filterTodos(items, { name: '纪要' }).map(t => t.id), ['c'])
  // 名称不区分大小写（英文标题场景）
  assert.deepEqual(filterTodos(items, { name: '购买' }).map(t => t.id), ['b'])
  // 优先级精确
  assert.deepEqual(filterTodos(items, { priority: 'medium' }).map(t => t.id), ['c'])
  // 状态：待办（未完成）
  assert.deepEqual(filterTodos(items, { status: 'active' }).map(t => t.id), ['a', 'b'])
  // 状态：已完成
  assert.deepEqual(filterTodos(items, { status: 'completed' }).map(t => t.id), ['c'])
  // 状态 all = 不限制
  assert.equal(filterTodos(items, { status: 'all' }).length, 3)
  // 组合：高优先级 + 待办
  assert.deepEqual(filterTodos(items, { priority: 'high', status: 'active' }).map(t => t.id), ['a'])
  // 名称 + 状态组合无结果
  assert.equal(filterTodos(items, { name: '周会', status: 'active' }).length, 0)
})

// T4 — dueInfo: future / today / overdue / no date
test('T4 dueInfo', () => {
  const now = new Date(2026, 7, 5) // 2026-08-05 本地
  assert.deepEqual(dueInfo('2026-08-08', false, now), { label: '剩余 3 天', status: 'normal' })
  assert.deepEqual(dueInfo('2026-08-05', false, now), { label: '今天到期', status: 'today' })
  assert.deepEqual(dueInfo('2026-08-02', false, now), { label: '已逾期 3 天', status: 'overdue' })
  assert.equal(dueInfo(undefined, false, now), null)
  assert.equal(dueInfo('2026-08-08', true, now), null)
  assert.equal(dueInfo('not-a-date', false, now), null)
})

// T5 — localToday uses local date, not UTC
test('T5 localToday', () => {
  // 2026-08-05 00:30 本地时刻：UTC 前一天，验证不偏移
  const d = new Date(2026, 7, 5, 0, 30)
  assert.equal(localToday(d), '2026-08-05')
})

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    passed++
    console.log(`  ✓ ${t.name}`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${t.name}`)
    console.error(e)
  }
}
console.log(`\n${passed}/${tests.length} passed`)
if (failed > 0) process.exit(1)
