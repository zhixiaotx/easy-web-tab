import assert from 'node:assert/strict'
import {
  emptyNoteData,
  filterNotes,
  findNoteCategory,
  hasActiveNoteFilter,
  isUncategorized,
  normalizeNote,
  normalizeNoteData,
  normalizeNotes,
  noteCountText,
  sortNotes,
  sortTimelineEntries,
  tabCategoriesOf
} from '../src/composables/noteCore.ts'
import type { NoteCategory, NoteData, TimelineEntry, WorkbenchNote } from '../src/types'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// 断言计数器：Proxy 包装 node:assert/strict，每次断言调用 +1（输出 assertion 总数）
let assertCount = 0
const a: typeof assert = new Proxy(assert, {
  get(t, prop) {
    const v = Reflect.get(t, prop)
    if (typeof v === 'function') {
      return (...args: unknown[]) => {
        assertCount++
        return (v as (...x: unknown[]) => unknown).apply(t, args)
      }
    }
    return v
  }
}) as typeof assert

/** 构造规范便签（默认蓝/未分类/普通，仅覆盖给定字段）。 */
function mkNote(partial: Partial<WorkbenchNote> & { id: string }): WorkbenchNote {
  const note: WorkbenchNote = {
    id: partial.id,
    content: partial.content ?? '',
    color: partial.color ?? 'blue',
    pinned: partial.pinned ?? false,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z'
  }
  if (partial.title !== undefined) note.title = partial.title
  if (partial.type !== undefined) note.type = partial.type
  if (partial.categoryId !== undefined) note.categoryId = partial.categoryId
  if (partial.entries !== undefined) note.entries = partial.entries
  return note
}

// T1 — emptyNoteData：空分类 + 空便签 + 每次全新结构
test('T1 emptyNoteData structure', () => {
  a.deepEqual(emptyNoteData(), { categories: [], notes: [] })
  a.ok(Array.isArray(emptyNoteData().categories))
  a.ok(Array.isArray(emptyNoteData().notes))
  a.notEqual(emptyNoteData(), emptyNoteData()) // 不共享引用
})

// T2 — normalizeNote 幂等：跑两遍结果一致
test('T2 normalizeNote idempotent', () => {
  const raw: any = {
    id: 'n1',
    title: '标题',
    content: '内容',
    color: 'red',
    pinned: true,
    categoryId: 'life',
    type: 'normal',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z'
  }
  const once = normalizeNote(raw)
  const twice = normalizeNote(once)
  a.deepEqual(twice, once)
})

// T3 — normalizeNote 各兜底：缺失 type→normal、categoryId→undefined、content→''、pinned→false、entries→undefined、color→blue
test('T3 normalizeNote defaults', () => {
  const n = normalizeNote({ id: 'n2' })
  a.equal(n.type, 'normal')
  a.equal(n.categoryId, undefined)
  a.equal(n.content, '')
  a.equal(n.pinned, false)
  a.equal(n.entries, undefined)
  a.equal(n.color, 'blue')
  a.ok(typeof n.createdAt === 'string' && n.createdAt.length > 0)
  a.ok(typeof n.updatedAt === 'string' && n.updatedAt.length > 0)
})

// T4 — normalizeNote 合法值透传 + 非法 type 归 normal + id 缺失生成 nt_ 前缀
test('T4 normalizeNote passthrough + generated id', () => {
  const n = normalizeNote({ id: 'n3', title: 'T', content: 'C', color: 'purple', pinned: true, categoryId: 'work', type: 'foo' })
  a.equal(n.id, 'n3')
  a.equal(n.title, 'T')
  a.equal(n.content, 'C')
  a.equal(n.color, 'purple')
  a.equal(n.pinned, true)
  a.equal(n.categoryId, 'work')
  a.equal(n.type, 'normal') // 非法 type → normal
  a.ok(normalizeNote({}).id.startsWith('nt_')) // id 缺失 → 生成
  a.ok(normalizeNote(undefined).id.startsWith('nt_')) // undefined 入参兜底
})

// T5 — createdAt/updatedAt 非法或缺失 → 当前 ISO 字符串
test('T5 normalizeNote timestamps fallback', () => {
  const n = normalizeNote({ id: 'n4', createdAt: 42, updatedAt: {} })
  a.ok(typeof n.createdAt === 'string')
  a.ok(typeof n.updatedAt === 'string')
  a.match(n.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  a.match(n.updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
})

// T6 — normalizeNotes：数组逐条归一，非数组 → []
test('T6 normalizeNotes array mapping', () => {
  const arr = normalizeNotes([{ id: 'a', content: 'x' }, 'bad', null])
  a.equal(arr.length, 3)
  a.equal(arr[0].id, 'a')
  a.ok(arr[1].id.startsWith('nt_'))
  a.ok(arr[2].id.startsWith('nt_'))
  a.deepEqual(normalizeNotes('not-array'), [])
  a.deepEqual(normalizeNotes(undefined), [])
})

// T7 — normalizeNoteData 数组入参（旧格式）：categories 空 + notes 逐条归一
test('T7 normalizeNoteData array input (legacy)', () => {
  const data = normalizeNoteData([{ id: 'a', content: 'x' }, { id: 'b' }])
  a.deepEqual(data.categories, [])
  a.equal(data.notes.length, 2)
  a.equal(data.notes[0].id, 'a')
  a.equal(data.notes[1].content, '')
})

// T8 — normalizeNoteData 对象入参（新格式）：分类逐条兜底 + notes 归一 + 幂等
test('T8 normalizeNoteData object input + idempotent', () => {
  const data = normalizeNoteData({
    categories: [
      { id: 'work', name: '工作', sort: 1 },
      { id: '', name: '空id' },
      { id: 'noname', name: '' },
      { id: 'nosort', name: '无排序', sort: 'x' },
      null
    ],
    notes: [{ id: 'n1', content: 'c', categoryId: 'work' }]
  })
  a.equal(data.categories.length, 2) // 空id/空名/非对象 → 剔除
  a.deepEqual(data.categories[0], { id: 'work', name: '工作', sort: 1 })
  a.deepEqual(data.categories[1], { id: 'nosort', name: '无排序' }) // sort 非数字 → 不保留
  a.equal(data.notes.length, 1)
  a.equal(data.notes[0].categoryId, 'work')
  a.deepEqual(normalizeNoteData(data), data) // 幂等
})

// T9 — normalizeNoteData 非法入参（null/数字/字符串/undefined）→ emptyNoteData
test('T9 normalizeNoteData invalid input', () => {
  a.deepEqual(normalizeNoteData(null), { categories: [], notes: [] })
  a.deepEqual(normalizeNoteData(42), { categories: [], notes: [] })
  a.deepEqual(normalizeNoteData('str'), { categories: [], notes: [] })
  a.deepEqual(normalizeNoteData(undefined), { categories: [], notes: [] })
  a.deepEqual(normalizeNoteData({ foo: 1 }), { categories: [], notes: [] }) // 无 categories/notes 字段的对象 → 空
})

// T10 — sortNotes：置顶在前 → updatedAt 降序；不改入参
test('T10 sortNotes pinned first + updatedAt desc + no mutation', () => {
  const notes = [
    mkNote({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }),
    mkNote({ id: 'b', pinned: true, updatedAt: '2026-06-01T00:00:00.000Z' }),
    mkNote({ id: 'c', pinned: true, updatedAt: '2026-03-01T00:00:00.000Z' }),
    mkNote({ id: 'd', updatedAt: '2026-05-01T00:00:00.000Z' })
  ]
  const sorted = sortNotes(notes)
  a.deepEqual(sorted.map(n => n.id), ['b', 'c', 'd', 'a'])
  a.deepEqual(notes.map(n => n.id), ['a', 'b', 'c', 'd']) // 入参未被修改
  a.notEqual(sorted, notes) // 返回新数组
})

// T11 — sortTimelineEntries：datetime 升序，同 datetime 按 createdAt 升序
test('T11 sortTimelineEntries ascending order', () => {
  const entries: TimelineEntry[] = [
    { id: 'b', datetime: '2026-08-02 10:00', content: 'b', createdAt: '2026-08-01T00:00:00.000Z' },
    { id: 'a1', datetime: '2026-08-01 09:00', content: 'a1', createdAt: '2026-08-01T00:00:00.000Z' },
    { id: 'a2', datetime: '2026-08-01 09:00', content: 'a2', createdAt: '2026-08-01T00:00:01.000Z' }
  ]
  const sorted = sortTimelineEntries(entries)
  a.deepEqual(sorted.map(e => e.id), ['a1', 'a2', 'b'])
  a.deepEqual(entries.map(e => e.id), ['b', 'a1', 'a2']) // 入参未被修改
})

// T12 — filterNotes type 过滤：undefined 不过滤；timeline/normal 精确匹配
test('T12 filterNotes by type', () => {
  const notes = [
    mkNote({ id: 'n1', type: 'timeline', content: '时光轴', entries: [] }),
    mkNote({ id: 'n2', content: '普通' }),
    mkNote({ id: 'n3', type: 'timeline', content: '时光2', entries: [] })
  ]
  a.deepEqual(filterNotes(notes, { type: 'timeline' }).map(n => n.id), ['n1', 'n3'])
  a.deepEqual(filterNotes(notes, { type: 'normal' }).map(n => n.id), ['n2'])
  a.equal(filterNotes(notes, {}).length, 3) // type undefined → 不过滤
})

// T13 — filterNotes categoryId 过滤：具体 id / 'uncategorized' 字面量（含 undefined/null/空串）/ undefined 不过滤
test('T13 filterNotes by categoryId', () => {
  const notes = [
    mkNote({ id: 'a', categoryId: 'work' }),
    mkNote({ id: 'b', categoryId: 'life' }),
    mkNote({ id: 'c' }), // categoryId undefined
    mkNote({ id: 'd', categoryId: '' }), // 空串
    mkNote({ id: 'e', categoryId: null as unknown as string }) // null
  ]
  a.deepEqual(filterNotes(notes, { categoryId: 'work' }).map(n => n.id), ['a'])
  a.deepEqual(filterNotes(notes, { categoryId: 'uncategorized' }).map(n => n.id), ['c', 'd', 'e'])
  a.equal(filterNotes(notes, {}).length, 5) // categoryId undefined → 不过滤
})

// T14 — filterNotes keyword 过滤：title+content 大小写不敏感 includes；空白不过滤；无命中空数组
test('T14 filterNotes by keyword', () => {
  const notes = [
    mkNote({ id: 'k1', title: '学习计划', content: '背单词' }),
    mkNote({ id: 'k2', title: '购物', content: '买牛奶' }),
    mkNote({ id: 'k3', title: 'NOTE', content: '英文标题' }),
    mkNote({ id: 'k4' })
  ]
  a.deepEqual(filterNotes(notes, { keyword: '单词' }).map(n => n.id), ['k1']) // content 命中
  a.deepEqual(filterNotes(notes, { keyword: '计划' }).map(n => n.id), ['k1']) // title 命中
  a.deepEqual(filterNotes(notes, { keyword: 'note' }).map(n => n.id), ['k3']) // 大小写不敏感
  a.equal(filterNotes(notes, { keyword: '   ' }).length, 4) // 纯空白 → 不过滤
  a.deepEqual(filterNotes(notes, { keyword: '不存在' }), [])
})

// T15 — filterNotes 组合过滤（type + categoryId + keyword）
test('T15 filterNotes combined filters', () => {
  const notes = [
    mkNote({ id: 'c1', categoryId: 'work', type: 'timeline', content: '工作时光轴', entries: [] }),
    mkNote({ id: 'c2', categoryId: 'work', content: '工作普通' }),
    mkNote({ id: 'c3', categoryId: 'life', content: '生活工作平衡' })
  ]
  a.deepEqual(filterNotes(notes, { type: 'normal', categoryId: 'work', keyword: '普通' }).map(n => n.id), ['c2'])
  a.deepEqual(filterNotes(notes, { categoryId: 'work', keyword: '工作' }).map(n => n.id), ['c1', 'c2'])
})

// T16 — findNoteCategory：按 id 找到 / 找不到 undefined / id 缺失 undefined
test('T16 findNoteCategory', () => {
  const cats: NoteCategory[] = [
    { id: 'work', name: '工作', sort: 1 },
    { id: 'life', name: '生活' }
  ]
  a.deepEqual(findNoteCategory(cats, 'work'), { id: 'work', name: '工作', sort: 1 })
  a.equal(findNoteCategory(cats, 'nope'), undefined)
  a.equal(findNoteCategory(cats, undefined), undefined)
  a.equal(findNoteCategory([], 'x'), undefined)
})

// T17 — isUncategorized：undefined / null / 空串 → true；具体 id → false
test('T17 isUncategorized', () => {
  a.equal(isUncategorized(mkNote({ id: 'a' })), true)
  a.equal(isUncategorized(mkNote({ id: 'b', categoryId: '' })), true)
  a.equal(isUncategorized(mkNote({ id: 'c', categoryId: null as unknown as string })), true)
  a.equal(isUncategorized(mkNote({ id: 'd', categoryId: 'work' })), false)
})

// T18 — normal 类型：entries 强制剔除（置 undefined）
test('T18 normal type strips entries', () => {
  const n = normalizeNote({ id: 'n9', type: 'normal', content: 'x', entries: [{ id: 'e1', datetime: 'x', content: 'c' }] })
  a.equal(n.type, 'normal')
  a.equal(n.entries, undefined)
})

// T19 — timeline 类型：entries 保留且逐条归一（id/content/createdAt 兜底）
test('T19 timeline type keeps + normalizes entries', () => {
  const n = normalizeNote({
    id: 'n10',
    type: 'timeline',
    content: '时光轴',
    entries: [
      { id: '', datetime: '2026-08-01 09:00', content: '', createdAt: 42 },
      { id: 'e2', datetime: '2026-08-02 10:00', content: '第二条', createdAt: '2026-08-01T00:00:00.000Z' },
      'bad'
    ]
  })
  a.equal(n.type, 'timeline')
  a.ok(Array.isArray(n.entries))
  a.equal(n.entries!.length, 3)
  a.ok(n.entries![0].id.startsWith('tle_')) // id 空 → 生成
  a.equal(n.entries![0].content, '')
  a.ok(typeof n.entries![0].createdAt === 'string') // createdAt 非法 → 兜底
  a.equal(n.entries![1].id, 'e2')
  a.equal(n.entries![1].content, '第二条')
  a.equal(n.entries![1].datetime, '2026-08-02 10:00')
  a.ok(n.entries![2].id.startsWith('tle_')) // 非对象 → 兜底生成
  // timeline 缺 entries → []
  a.deepEqual(normalizeNote({ id: 'n11', type: 'timeline' }).entries, [])
})

// T20 — hasActiveNoteFilter：type 非 normal / categoryId 已定义 / keyword trim 后非空（工具栏计数「是否有筛选」判定）
test('T20 hasActiveNoteFilter', () => {
  a.equal(hasActiveNoteFilter('normal', undefined, ''), false)
  a.equal(hasActiveNoteFilter('normal', undefined, '   '), false) // 纯空白不算
  a.equal(hasActiveNoteFilter('timeline', undefined, ''), true) // 类型非普通
  a.equal(hasActiveNoteFilter('normal', 'work', ''), true) // 已选分类
  a.equal(hasActiveNoteFilter('normal', undefined, ' 字 '), true) // 关键词（前后空白 trim）
  a.equal(hasActiveNoteFilter('timeline', 'work', 'x'), true) // 组合
})

// T21 — noteCountText：active → 筛选出 X / Y 个；非 active → 共 Y 个便签
test('T21 noteCountText', () => {
  a.equal(noteCountText(3, 10, true), '筛选出 3 / 10 个')
  a.equal(noteCountText(0, 5, true), '筛选出 0 / 5 个')
  a.equal(noteCountText(10, 10, false), '共 10 个便签')
  a.equal(noteCountText(0, 0, false), '共 0 个便签')
})

// T22 — tabCategoriesOf：showInTabs===false 剔除，undefined/true 保留，保序，返回新数组
test('T22 tabCategoriesOf filters hidden + keeps order + new array', () => {
  const cats: NoteCategory[] = [
    { id: 'a', name: 'A', sort: 1, showInTabs: false },
    { id: 'b', name: 'B', sort: 2 }, // undefined → 显示
    { id: 'c', name: 'C', sort: 3, showInTabs: true }, // 显式显示
    { id: 'd', name: 'D', sort: 4, showInTabs: false }
  ]
  const visible = tabCategoriesOf(cats)
  a.deepEqual(visible.map(c => c.id), ['b', 'c'])
  a.notEqual(visible, cats) // 新数组，不 mutate 入参
  a.deepEqual(cats.map(c => c.id), ['a', 'b', 'c', 'd']) // 入参未被修改
  a.deepEqual(tabCategoriesOf([]), [])
  a.deepEqual(tabCategoriesOf(undefined as unknown as NoteCategory[]), [])
})

// T23 — normalizeNoteData：showInTabs 仅布尔透传（false/true 保留），非布尔剔除，缺失不新增，幂等（T8 回归守护）
test('T23 normalizeNoteData showInTabs boolean passthrough', () => {
  const data = normalizeNoteData({
    categories: [
      { id: 'work', name: '工作', sort: 1, showInTabs: false },
      { id: 'life', name: '生活', sort: 2, showInTabs: true },
      { id: 'study', name: '学习', sort: 'x', showInTabs: 'yes' }, // 非布尔 → 不保留
      { id: 'ok', name: '正常' } // 无 key → 不新增
    ],
    notes: []
  })
  a.equal(data.categories.length, 4)
  a.deepEqual(data.categories[0], { id: 'work', name: '工作', sort: 1, showInTabs: false })
  a.deepEqual(data.categories[1], { id: 'life', name: '生活', sort: 2, showInTabs: true })
  a.deepEqual(data.categories[2], { id: 'study', name: '学习' }) // 非布尔 → 剔除
  a.deepEqual(data.categories[3], { id: 'ok', name: '正常' }) // 无 key → 不新增
  a.deepEqual(normalizeNoteData(data), data) // 幂等
})

// T24 — 归一化后 tabCategoriesOf 组合验证（存库 → 加载 → 标签页可见分类闭环）
test('T24 tabCategoriesOf after normalizeNoteData roundtrip', () => {
  const data = normalizeNoteData({
    categories: [
      { id: 'a', name: 'A', showInTabs: false },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C', showInTabs: true }
    ],
    notes: []
  })
  a.deepEqual(tabCategoriesOf(data.categories).map(c => c.id), ['b', 'c'])
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
if (failed > 0) {
  console.error(`\n${passed}/${tests.length} passed, ${assertCount} assertions, exit 1`)
  process.exit(1)
}
console.log(`\n${passed}/${tests.length} passed, ${assertCount} assertions, exit 0`)
