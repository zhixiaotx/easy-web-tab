import assert from 'node:assert/strict'
import { MAX_RESULTS, searchAll, rankResults } from '../src/composables/spotlightCore.ts'
import type { SpotlightData, SpotlightGroups } from '../src/composables/spotlightCore.ts'
import type { Countdown, LedgerCategory, PasswordEntry, Site, WorkbenchNote, WorkbenchTodo } from '../src/types'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// ==================== 夹具工厂 ====================

function mkTodo(id: string, title: string, updatedAt = '2026-01-01T00:00:00.000Z', description?: string): WorkbenchTodo {
  return { id, title, description, priority: 'medium', completed: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt }
}

function mkNote(id: string, content: string, title?: string, updatedAt = '2026-01-01T00:00:00.000Z'): WorkbenchNote {
  return { id, content, color: 'blue', pinned: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt, title }
}

function mkCountdown(id: string, name: string, updatedAt = '2026-01-01T00:00:00.000Z'): Countdown {
  return { id, name, endDateTime: '2026-12-31T23:59', createdAt: '2026-01-01T00:00:00.000Z', updatedAt }
}

function mkPassword(id: string, siteName: string, url: string, password = 'S3cret!', updatedAt = '2026-01-01T00:00:00.000Z'): PasswordEntry {
  return { id, siteName, url, username: 'u', password, createdAt: '2026-01-01T00:00:00.000Z', updatedAt }
}

function mkSite(name: string, url: string, updatedAt = '2026-01-01T00:00:00.000Z'): Site {
  return { name, url, category: 'tech', tags: [], updatedAt }
}

const SALARY_CAT: LedgerCategory = { id: 'salary', name: '工资', type: 'income', isBuiltIn: true }
const COMMUTE_CAT: LedgerCategory = { id: 'commute', name: '通勤', type: 'expense', isBuiltIn: true }

function emptyData(): SpotlightData {
  return { todos: [], notes: [], countdowns: [], ledgerEntries: [], ledgerCategories: [], passwords: [], sites: [] }
}

// ==================== 各组匹配 ====================

test('T1 待办：按标题命中（复用 filterTodos title）', () => {
  const g = searchAll('季度', {
    ...emptyData(),
    todos: [mkTodo('a', '提交季度报告'), mkTodo('b', '购买办公用品')]
  })
  assert.deepEqual(g.todos.map(t => t.id), ['a'])
})

test('T2 待办：描述也命中（标题 OR 描述，非 AND）', () => {
  const g = searchAll('财务', {
    ...emptyData(),
    todos: [mkTodo('a', '周报', '2026-01-01T00:00:00.000Z', '季度财务总结'), mkTodo('b', '报销')]
  })
  assert.deepEqual(g.todos.map(t => t.id), ['a'])
})

test('T3 便签：中文标题+内容命中（复用 filterNotes keyword）', () => {
  const hit = mkNote('n1', '本月工资到账，储蓄计划更新')
  const miss = mkNote('n2', '健身打卡第 30 天')
  const g = searchAll('工资', { ...emptyData(), notes: [hit, miss] })
  assert.deepEqual(g.notes.map(n => n.id), ['n1'])
  // 标题命中同样生效
  const g2 = searchAll('番茄', { ...emptyData(), notes: [mkNote('n3', '内容无关', '番茄工作法笔记'), miss] })
  assert.deepEqual(g2.notes.map(n => n.id), ['n3'])
})

test('T4 倒计时：按 name 命中（复用 filterCountdowns name）', () => {
  const g = searchAll('年会', { ...emptyData(), countdowns: [mkCountdown('c1', '公司年会倒计时'), mkCountdown('c2', '生日')] })
  assert.deepEqual(g.countdowns.map(c => c.id), ['c1'])
})

test('T5 密码：按 siteName 命中', () => {
  const g = searchAll('银行', {
    ...emptyData(),
    passwords: [mkPassword('p1', '招商银行', 'https://www.cmbchina.com'), mkPassword('p2', 'GitHub', 'https://github.com')]
  })
  assert.deepEqual(g.passwords.map(p => p.id), ['p1'])
})

test('T6 密码：按 url 命中（次要字段）', () => {
  const g = searchAll('github.com', {
    ...emptyData(),
    passwords: [mkPassword('p1', '招商银行', 'https://www.cmbchina.com'), mkPassword('p2', 'GitHub', 'https://github.com')]
  })
  assert.deepEqual(g.passwords.map(p => p.id), ['p2'])
})

test('T7 密码：绝不匹配加密的 password 内容（不解密）', () => {
  const g = searchAll('S3cret!', { ...emptyData(), passwords: [mkPassword('p1', 'GitHub', 'https://github.com', 'S3cret!')] })
  assert.deepEqual(g.passwords, [], 'password 字段不应参与匹配')
})

test('T8 网址：按 name 命中', () => {
  const g = searchAll('GitHub', { ...emptyData(), sites: [mkSite('GitHub', 'https://github.com'), mkSite('百度', 'https://www.baidu.com')] })
  assert.deepEqual(g.sites.map(s => s.name), ['GitHub'])
})

test('T9 网址：按 url 命中（次要字段）', () => {
  const g = searchAll('baidu.com', { ...emptyData(), sites: [mkSite('GitHub', 'https://github.com'), mkSite('百度', 'https://www.baidu.com')] })
  assert.deepEqual(g.sites.map(s => s.name), ['百度'])
})

test('T10 记账分类：按 name 命中', () => {
  const g = searchAll('通勤', { ...emptyData(), ledgerCategories: [SALARY_CAT, COMMUTE_CAT] })
  assert.equal(g.ledger.length, 1)
  const hit = g.ledger[0]
  assert.equal(hit.kind, 'category')
  if (hit.kind === 'category') assert.equal(hit.category.id, 'commute')
})

test('T11 记账记录：按 note 命中', () => {
  const g = searchAll('房租', {
    ...emptyData(),
    ledgerEntries: [
      { id: 'ld1', date: '2026-08-01', categoryId: 'daily', amount: 3200, note: '房租水电', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
      { id: 'ld2', date: '2026-08-02', categoryId: 'lunch', amount: 25, note: '午餐', createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z' }
    ]
  })
  assert.equal(g.ledger.length, 1)
  const hit = g.ledger[0]
  assert.equal(hit.kind, 'entry')
  if (hit.kind === 'entry') assert.equal(hit.entry.id, 'ld1')
})

test('T12 QA-happy：「工资」同时命中记账分类与便签', () => {
  const note = mkNote('n1', '本月工资到账，储蓄计划更新')
  const g = searchAll('工资', {
    ...emptyData(),
    ledgerCategories: [SALARY_CAT, COMMUTE_CAT],
    notes: [note]
  })
  // 记账分组含分类命中
  const catHit = g.ledger.find(h => h.kind === 'category' && h.category.id === 'salary')
  assert.ok(catHit, 'ledger 分组应含 工资 分类命中')
  // 便签分组含内容命中
  assert.deepEqual(g.notes.map(n => n.id), ['n1'])
})

// ==================== 大小写不敏感 ====================

test('T13 大小写不敏感：大写 query 命中小写数据', () => {
  const g = searchAll('GITHUB', { ...emptyData(), sites: [mkSite('GitHub', 'https://github.com')] })
  assert.deepEqual(g.sites.map(s => s.name), ['GitHub'])
})

test('T14 大小写不敏感：小写 query 命中大写数据（url）', () => {
  const g = searchAll('api.github', {
    ...emptyData(),
    passwords: [mkPassword('p1', 'GitHub API', 'https://API.Github.com')]
  })
  assert.deepEqual(g.passwords.map(p => p.id), ['p1'])
})

// ==================== 空 query 容错 ====================

test('T15 QA-failure：空串 query 返回全空分组且不抛错', () => {
  const g = searchAll('', {
    ...emptyData(),
    todos: [mkTodo('a', '任意待办')],
    notes: [mkNote('n1', '任意便签')],
    sites: [mkSite('GitHub', 'https://github.com')]
  })
  assert.deepEqual(g, { todos: [], notes: [], countdowns: [], ledger: [], passwords: [], sites: [] })
})

test('T16 QA-failure：undefined 与纯空白 query 均返回全空分组且不抛错', () => {
  for (const bad of [undefined, '   ', '\t\n']) {
    const g = searchAll(bad, { ...emptyData(), todos: [mkTodo('a', '任意待办')] })
    assert.equal(g.todos.length, 0)
    assert.equal(g.notes.length, 0)
    assert.equal(g.countdowns.length, 0)
    assert.equal(g.ledger.length, 0)
    assert.equal(g.passwords.length, 0)
    assert.equal(g.sites.length, 0)
  }
})

test('T17 结果形状：全空数据 + 命中 query 仍返回全部 6 个分组键', () => {
  const g = searchAll('随便', emptyData())
  assert.deepEqual(Object.keys(g).sort(), ['countdowns', 'ledger', 'notes', 'passwords', 'sites', 'todos'])
  assert.equal(g.todos.length, 0)
})

// ==================== MAX_RESULTS 截断 ====================

test('T18 MAX_RESULTS：每类最多 5 条', () => {
  assert.equal(MAX_RESULTS, 5)
  const many = Array.from({ length: 7 }, (_, i) => mkTodo(`t${i}`, `提交季度报告 ${i}`))
  const g = searchAll('季度', { ...emptyData(), todos: many })
  assert.equal(g.todos.length, MAX_RESULTS)
  assert.deepEqual(g.todos.map(t => t.id), ['t0', 't1', 't2', 't3', 't4'])
})

// ==================== 排序 ====================

test('T19 rankResults：标题命中优先于次要字段命中', () => {
  // a：name 命中（score 2）；b：仅 url 命中（score 1）
  const groups: SpotlightGroups = {
    todos: [], notes: [], countdowns: [], ledger: [], passwords: [],
    sites: [mkSite('GitHub', 'https://github.com', '2026-01-02T00:00:00.000Z'), mkSite('码云', 'https://github.com/mirror', '2026-01-03T00:00:00.000Z')]
  }
  const ranked = rankResults(groups, 'github')
  assert.deepEqual(ranked.sites.map(s => s.name), ['GitHub', '码云'])
})

test('T20 rankResults：同分按 updatedAt 降序（新的在前）', () => {
  const groups: SpotlightGroups = {
    todos: [], notes: [], countdowns: [], ledger: [], passwords: [],
    sites: [
      mkSite('GitHub', 'https://github.com', '2026-01-01T00:00:00.000Z'),
      mkSite('GitHub Enterprise', 'https://enterprise.github.com', '2026-01-03T00:00:00.000Z'),
      mkSite('GitHub Docs', 'https://docs.github.com', '2026-01-02T00:00:00.000Z')
    ]
  }
  const ranked = rankResults(groups, 'github')
  assert.deepEqual(
    ranked.sites.map(s => s.name),
    ['GitHub Enterprise', 'GitHub Docs', 'GitHub'],
    'updatedAt 降序：最新在前'
  )
})

test('T21 rankResults：不改入参（返回新分组对象与新数组）', () => {
  const sites = [mkSite('码云', 'https://github.com/mirror', '2026-01-03T00:00:00.000Z'), mkSite('GitHub', 'https://github.com', '2026-01-01T00:00:00.000Z')]
  const groups: SpotlightGroups = { todos: [], notes: [], countdowns: [], ledger: [], passwords: [], sites }
  const ranked = rankResults(groups, 'github')
  assert.deepEqual(groups.sites.map(s => s.name), ['码云', 'GitHub'], '入参顺序不被修改')
  assert.notEqual(ranked, groups, '应返回新分组对象')
  assert.notEqual(ranked.sites, groups.sites, '应返回新数组')
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
