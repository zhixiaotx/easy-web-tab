/**
 * Sanity check for the IDB v4 upgrade (Todo 1 / workbench-improvements).
 * Run: node --experimental-strip-types scripts/check-idb-v4.ts
 *
 * Two layers:
 * 1. Runtime — registers the extensionless-resolution hook (see
 *    resolve-extensionless.mjs), dynamically imports useIdb.ts and asserts the
 *    v4 export contract (DB_VERSION / IDB_CORE_STORES / IDB_AUX_STORES).
 * 2. Source — reads useIdb.ts and asserts the idbImportAll write loop carries
 *    the key-existence guard (never put `undefined` into new stores).
 *
 * RED: written before the useIdb.ts change; fails on DB_VERSION===3 / missing
 *      IDB_AUX_STORES / missing guard.
 * GREEN: after the change, all assertions pass (exit 0).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import type { IdbStore } from '../src/composables/useIdb.ts'

// Register hook BEFORE dynamic import so useIdb.ts's extensionless imports resolve.
register(new URL('./resolve-extensionless.mjs', import.meta.url))

const idb = await import('../src/composables/useIdb.ts')

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  PASS ${name}`)
}

console.log('[runtime] useIdb exports')
check('DB_NAME === "easy-web-tab"', () => assert.equal(idb.DB_NAME, 'easy-web-tab'))
check('DB_VERSION === 4', () => assert.equal(idb.DB_VERSION, 4))
check(
  'IDB_CORE_STORES keeps the original 7 in order',
  () =>
    assert.deepEqual(idb.IDB_CORE_STORES, [
      'todos',
      'notes',
      'countdowns',
      'passwords',
      'health',
      'ledger',
      'settings'
    ])
)
check(
  'IDB_AUX_STORES === ["pomodoro","habits","snapshots"]',
  () => assert.deepEqual(idb.IDB_AUX_STORES, ['pomodoro', 'habits', 'snapshots'])
)
check('IDB_KEY === "items"', () => assert.equal(idb.IDB_KEY, 'items'))
// Type-level: every store name (core + aux) is assignable to the IdbStore union.
const allStores: IdbStore[] = [...(idb.IDB_CORE_STORES as readonly IdbStore[]), ...(idb.IDB_AUX_STORES as readonly IdbStore[])]
check('every core+aux store name is a valid IdbStore', () => assert.equal(allStores.length, 10))

const source = readFileSync(new URL('../src/composables/useIdb.ts', import.meta.url), 'utf8')

console.log('[source] idbImportAll write loop guard')
const importAllStart = source.indexOf('export async function idbImportAll')
assert.ok(importAllStart >= 0, 'idbImportAll export not found in source')
const importAllBody = source.slice(importAllStart)
const writeLoopStart = importAllBody.indexOf('for (const name of')
assert.ok(writeLoopStart >= 0, 'write loop `for (const name of ...)` not found')
const writeLoop = importAllBody.slice(writeLoopStart)
// Loop body = up to the first closing brace of the for statement
let depth = 0
let loopBodyEnd = -1
for (let i = 0; i < writeLoop.length; i++) {
  const ch = writeLoop[i]
  if (ch === '{') depth++
  else if (ch === '}') {
    depth--
    if (depth === 0) {
      loopBodyEnd = i
      break
    }
  }
}
assert.ok(loopBodyEnd > 0, 'could not delimit write loop body')
const loopBody = writeLoop.slice(0, loopBodyEnd + 1)
const hasGuard =
  /name\s+in\s+(?:data|backupFields)/.test(loopBody) || /Object\.prototype\.hasOwnProperty\.call\s*\(\s*data\s*,\s*name/.test(loopBody)
check('write loop guards each key with existence check before put', () => assert.ok(hasGuard, `guard missing; loop body was:\n${loopBody}`))
// No direct `put(backupFields[name]` without a preceding guard line inside the loop
const guardedPut =
  /\bif\s*\([^)]*name\s+in\s+(?:data|backupFields)[^)]*\)[^]*?\.put\((?:data|backupFields)\[name\]/.test(loopBody)
check('store.put(data[name]) is only reachable behind the existence guard', () => assert.ok(guardedPut, `unguarded put found:\n${loopBody}`))

console.log(`\nALL CHECKS PASSED (${passed})`)
