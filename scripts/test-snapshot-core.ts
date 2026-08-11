import assert from 'node:assert/strict'
import {
  MAX_SNAPSHOTS,
  makeSnapshotId,
  normalizeSnapshotList,
  pushSnapshot,
  findSnapshot
} from '../src/composables/snapshotCore.ts'
import type { SnapshotRecord } from '../src/composables/snapshotCore.ts'
import { emptyHealthData } from '../src/composables/healthCore.ts'
import { emptyLedgerData } from '../src/composables/ledgerCore.ts'
import { emptyNoteData } from '../src/composables/noteCore.ts'
import { emptyAppSettingsData, WORKBENCH_DATA_VERSION } from '../src/types/index.ts'
import type { WorkbenchData } from '../src/types/index.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// —— 夹具：用各 core 空工厂构造真实 WorkbenchData（不做 as 强转）——
let dataSeq = 0
function makeData(): WorkbenchData {
  dataSeq += 1
  return {
    version: WORKBENCH_DATA_VERSION,
    exportedAt: `2026-08-12T00:00:00.${String(dataSeq).padStart(3, '0')}Z`,
    todos: [],
    notes: emptyNoteData(),
    countdowns: [],
    passwords: '',
    health: emptyHealthData(),
    ledger: emptyLedgerData(),
    settings: emptyAppSettingsData()
  }
}

function makeSnapshot(id: string, createdAt: string): SnapshotRecord {
  // date = id 的 YYYYMMDD 前缀转 YYYY-MM-DD（独立字段，非运行时解析 id）
  return {
    id,
    date: `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}`,
    data: makeData(),
    createdAt
  }
}

// T1 — 常量：上限 10
test('T1 MAX_SNAPSHOTS = 10', () => {
  assert.equal(MAX_SNAPSHOTS, 10)
})

// T2 — makeSnapshotId：格式 YYYYMMDD-HHmmss，前缀派生自 date，总长 15
test('T2 makeSnapshotId format', () => {
  const id = makeSnapshotId('2026-08-12')
  assert.match(id, /^\d{8}-\d{6}$/)
  assert.ok(id.startsWith('20260812-'), 'id 前缀应来自本地日期 YYYYMMDD')
  assert.equal(id.length, 15)
})

// T3 — makeSnapshotId：不同 date → 不同前缀
test('T3 makeSnapshotId derives prefix from date', () => {
  assert.ok(makeSnapshotId('2026-08-12').startsWith('20260812-'))
  assert.ok(makeSnapshotId('2026-08-13').startsWith('20260813-'))
})

// T4 — normalizeSnapshotList：非数组入参 → []
test('T4 normalize non-array returns []', () => {
  assert.deepEqual(normalizeSnapshotList(undefined), [])
  assert.deepEqual(normalizeSnapshotList(null), [])
  assert.deepEqual(normalizeSnapshotList('nope'), [])
  assert.deepEqual(normalizeSnapshotList(42), [])
})

// T5 — normalizeSnapshotList：坏项（null/缺字段/id 格式错）剔除且不抛错（QA failure）
test('T5 normalize drops bad items without throwing', () => {
  const good = makeSnapshot('20260812-100000', '2026-08-12T10:00:00.000Z')
  const badId = makeSnapshot('20260812-110000', '2026-08-12T11:00:00.000Z')
  const out = normalizeSnapshotList([
    good,
    null,
    undefined,
    42,
    { id: 'no-date-field' },
    { ...badId, id: 'not-a-valid-id' }
  ])
  assert.equal(out.length, 1, '仅 good 存活')
  assert.equal(out[0].id, good.id)
})

// T6 — normalizeSnapshotList：按 createdAt 降序（新→旧）
test('T6 normalize sorts by createdAt desc', () => {
  const older = makeSnapshot('20260811-090000', '2026-08-11T09:00:00.000Z')
  const mid = makeSnapshot('20260812-080000', '2026-08-12T08:00:00.000Z')
  const newer = makeSnapshot('20260812-100000', '2026-08-12T10:00:00.000Z')
  const out = normalizeSnapshotList([older, newer, mid])
  assert.deepEqual(out.map(s => s.id), [newer.id, mid.id, older.id])
})

// T7 — pushSnapshot：压入 12 份 → 恒 10 份、最旧被裁（QA happy：环形保留）
test('T7 push 12 keeps newest 10, oldest trimmed', () => {
  let list: SnapshotRecord[] = []
  for (let i = 1; i <= 12; i++) {
    const hh = String(i).padStart(2, '0')
    list = pushSnapshot(list, makeSnapshot(`20260812-${hh}0000`, `2026-08-12T${hh}:00:00.000Z`))
  }
  assert.equal(list.length, MAX_SNAPSHOTS)
  assert.equal(list[0].id, '20260812-120000', '最新在前')
  assert.equal(list[9].id, '20260812-030000', '恒 10 份，最旧保留到 03')
  assert.ok(!list.some(s => s.id === '20260812-010000'), '01 被裁')
  assert.ok(!list.some(s => s.id === '20260812-020000'), '02 被裁')
})

// T8 — pushSnapshot：同 id 幂等不重复、不改入参返回新数组
test('T8 push idempotent and immutable', () => {
  const a = makeSnapshot('20260812-100000', '2026-08-12T10:00:00.000Z')
  const b = makeSnapshot('20260812-110000', '2026-08-12T11:00:00.000Z')
  const list = [a, b]
  const after = pushSnapshot(list, a)
  assert.equal(after.length, 2, '同 id 幂等，不重复追加')
  assert.notEqual(after, list, '返回新数组引用')
  assert.equal(list.length, 2, '入参不被改动')

  const added = pushSnapshot(list, makeSnapshot('20260812-120000', '2026-08-12T12:00:00.000Z'))
  assert.equal(added.length, 3)
  assert.equal(list.length, 2, '入参不被改动')
})

// T9 — findSnapshot：按 id 命中 / 未命中 undefined
test('T9 findSnapshot by id', () => {
  const a = makeSnapshot('20260812-100000', '2026-08-12T10:00:00.000Z')
  const b = makeSnapshot('20260812-110000', '2026-08-12T11:00:00.000Z')
  const list = normalizeSnapshotList([a, b])
  assert.equal(findSnapshot(list, '20260812-110000'), b)
  assert.equal(findSnapshot(list, '20260812-100000'), a)
  assert.equal(findSnapshot(list, 'nope'), undefined)
})

// T10 — SnapshotRecord 契约：携带独立 date 字段（同日去重键，非 id 前缀解析）
test('T10 SnapshotRecord carries date field', () => {
  const s = makeSnapshot('20260812-100000', '2026-08-12T10:00:00.000Z')
  assert.equal(s.date, '2026-08-12')
  assert.equal(typeof s.date, 'string')
  assert.equal(s.id.slice(0, 8), s.date.replace(/-/g, ''), 'id 前缀派生自 date，date 是独立字段')
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
