import assert from 'node:assert/strict'
import {
  WORKBENCH_MENU_KEYS,
  WORKBENCH_MENU_DEFAULT_ORDER,
  MENU_DEFAULT_LABELS,
  MENU_ICONS,
  normalizeWorkbenchMenu,
  moveMenuItem,
  renameMenuLabel,
  resolveMenuItems
} from '../src/composables/workbenchMenuCore.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// T1 — normalizeWorkbenchMenu 缺省：无输入 → 默认 7 键顺序、home 首位、labels 为空
test('T1 normalizeWorkbenchMenu defaults', () => {
  const out = normalizeWorkbenchMenu(undefined, undefined)
  assert.deepEqual(out.order, WORKBENCH_MENU_DEFAULT_ORDER)
  assert.equal(out.order.length, 7)
  assert.equal(out.order[0], 'home')
  assert.deepEqual(out.labels, {})
})

// T2 — normalizeWorkbenchMenu 未知 key 过滤：bogus 剔除、已知 key 保留
test('T2 normalizeWorkbenchMenu unknown keys filtered', () => {
  const out = normalizeWorkbenchMenu(['bogus', 'todos', 'home'])
  assert.deepEqual(out.order, WORKBENCH_MENU_DEFAULT_ORDER)
  assert.ok(!out.order.includes('bogus'))
})

// T3 — normalizeWorkbenchMenu 去重：first occurrence wins
test('T3 normalizeWorkbenchMenu dedupe', () => {
  const out = normalizeWorkbenchMenu(['todos', 'todos', 'notes', 'todos'])
  assert.equal(out.order.filter(k => k === 'todos').length, 1)
  assert.equal(out.order[1], 'todos')
  assert.equal(out.order[2], 'notes')
})

// T4 — normalizeWorkbenchMenu home 强制 index 0（Metis F1）：输入中 home 后置也移到最前
test('T4 normalizeWorkbenchMenu home forced to index 0', () => {
  const out = normalizeWorkbenchMenu(['todos', 'home', 'notes', 'countdowns', 'passwords', 'health', 'ledger'])
  assert.equal(out.order[0], 'home')
  assert.deepEqual(out.order, WORKBENCH_MENU_DEFAULT_ORDER)
})

// T5 — normalizeWorkbenchMenu 缺失 key 按默认序补全 → 恒 7 项
test('T5 normalizeWorkbenchMenu missing keys appended', () => {
  const out = normalizeWorkbenchMenu(['todos'])
  assert.equal(out.order.length, 7)
  assert.deepEqual(out.order, WORKBENCH_MENU_DEFAULT_ORDER)
  const out2 = normalizeWorkbenchMenu(null)
  assert.deepEqual(out2.order, WORKBENCH_MENU_DEFAULT_ORDER)
})

// T6 — normalizeWorkbenchMenu labels：trim/去空/截断 12 code point/未知 key 剔除
test('T6 normalizeWorkbenchMenu labels normalization', () => {
  const out = normalizeWorkbenchMenu(undefined, {
    todos: '  工作待办  ',
    notes: '   ',
    passwords: '一二三四五六七八九十一二三',
    bogus: 'x',
    countdowns: 123
  })
  assert.equal(out.labels.todos, '工作待办')
  assert.ok(!('notes' in out.labels), '空串标签应剔除')
  assert.ok(!('bogus' in out.labels), '未知 key 标签应剔除')
  assert.ok(!('countdowns' in out.labels), '非字符串标签应剔除')
  assert.equal(out.labels.passwords, '一二三四五六七八九十一二')
  // emoji 代理对按 1 个 code point 计，截断不拆对
  const emoji = normalizeWorkbenchMenu(undefined, { ledger: '🏠'.repeat(13) })
  assert.equal(emoji.labels.ledger, '🏠'.repeat(12))
})

// T7 — moveMenuItem home 恒 locked
test('T7 moveMenuItem home locked', () => {
  assert.deepEqual(moveMenuItem(WORKBENCH_MENU_DEFAULT_ORDER, 'home', 'up'), { ok: false, reason: 'locked' })
  assert.deepEqual(moveMenuItem(WORKBENCH_MENU_DEFAULT_ORDER, 'home', 'down'), { ok: false, reason: 'locked' })
})

// T8 — moveMenuItem 边界：index 1 上移 / 末尾下移 → boundary
test('T8 moveMenuItem boundary', () => {
  assert.deepEqual(moveMenuItem(WORKBENCH_MENU_DEFAULT_ORDER, 'todos', 'up'), { ok: false, reason: 'boundary' })
  assert.deepEqual(moveMenuItem(WORKBENCH_MENU_DEFAULT_ORDER, 'ledger', 'down'), { ok: false, reason: 'boundary' })
})

// T9 — moveMenuItem 中段交换：邻居对调且 home 仍 index 0
test('T9 moveMenuItem middle swap keeps home at 0', () => {
  const up = moveMenuItem(WORKBENCH_MENU_DEFAULT_ORDER, 'notes', 'up')
  assert.equal(up.ok, true)
  assert.equal(up.reason, 'ok')
  assert.deepEqual(up.order, ['home', 'notes', 'todos', 'countdowns', 'passwords', 'health', 'ledger'])
  assert.equal(up.order![0], 'home')
  const down = moveMenuItem(WORKBENCH_MENU_DEFAULT_ORDER, 'health', 'down')
  assert.equal(down.ok, true)
  assert.deepEqual(down.order, ['home', 'todos', 'notes', 'countdowns', 'passwords', 'ledger', 'health'])
  assert.equal(down.order![0], 'home')
})

// T10 — moveMenuItem 未知 key → not-found
test('T10 moveMenuItem unknown key not-found', () => {
  assert.deepEqual(moveMenuItem(WORKBENCH_MENU_DEFAULT_ORDER, 'bogus', 'up'), { ok: false, reason: 'not-found' })
})

// T11 — renameMenuLabel：ok（不可变返回新对象）/ empty（空白）/ not-found / 截断 12
test('T11 renameMenuLabel', () => {
  const labels: Record<string, string> = { todos: '工作待办' }
  const ok = renameMenuLabel(labels, 'todos', '  工作记录  ')
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.labels, { todos: '工作记录' })
  assert.deepEqual(labels, { todos: '工作待办' }, '入参 labels 不可变')
  assert.notEqual(ok.labels, labels, '应返回新对象引用')

  const long = renameMenuLabel({ todos: 'x' }, 'todos', '一二三四五六七八九十一二三')
  assert.equal(long.ok, true)
  assert.equal(long.labels!.todos, '一二三四五六七八九十一二')

  const empty = renameMenuLabel({ todos: 'x' }, 'todos', '   ')
  assert.deepEqual(empty, { ok: false, reason: 'empty' })

  const nf = renameMenuLabel({ todos: 'x' }, 'bogus', '任意名')
  assert.deepEqual(nf, { ok: false, reason: 'not-found' })
})

// T12 — resolveMenuItems：label 缺省回退默认、icon 查表、跟随 order、恒 7 项
test('T12 resolveMenuItems', () => {
  const items = resolveMenuItems(WORKBENCH_MENU_DEFAULT_ORDER, { todos: '工作记录' })
  assert.equal(items.length, 7)
  assert.equal(items[0].key, 'home')
  assert.equal(items[0].label, MENU_DEFAULT_LABELS.home)
  assert.equal(items[0].icon, MENU_ICONS.home)
  assert.equal(items[1].key, 'todos')
  assert.equal(items[1].label, '工作记录')
  assert.equal(items[1].icon, MENU_ICONS.todos)
  const reordered = resolveMenuItems(['home', 'notes', 'todos', 'countdowns', 'passwords', 'health', 'ledger'], {})
  assert.deepEqual(reordered.map(i => i.key), ['home', 'notes', 'todos', 'countdowns', 'passwords', 'health', 'ledger'])
  assert.equal(reordered[1].label, MENU_DEFAULT_LABELS.notes, '缺省回退默认名')
  for (const item of items) {
    assert.equal(typeof item.icon, 'string')
    assert.ok(item.icon.length > 0)
  }
})

// T13 — 常量完整性：7 键、默认序 = 键序、默认名逐字一致、图标映射齐
test('T13 constants integrity', () => {
  assert.deepEqual(WORKBENCH_MENU_KEYS, ['home', 'todos', 'notes', 'countdowns', 'passwords', 'health', 'ledger'])
  assert.deepEqual(WORKBENCH_MENU_DEFAULT_ORDER, WORKBENCH_MENU_KEYS)
  assert.deepEqual(MENU_DEFAULT_LABELS, {
    home: '主页',
    todos: '工作待办',
    notes: '个人便签',
    countdowns: '定时提醒',
    passwords: '密码管理',
    health: '健康管理',
    ledger: '记账'
  })
  assert.equal(MENU_ICONS.home, '🏠')
  assert.equal(MENU_ICONS.todos, '☑️')
  assert.equal(MENU_ICONS.notes, '📝')
  assert.equal(MENU_ICONS.countdowns, '⏳')
  assert.equal(MENU_ICONS.passwords, '🔑')
  assert.equal(MENU_ICONS.health, '💪')
  assert.equal(MENU_ICONS.ledger, '💰')
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
