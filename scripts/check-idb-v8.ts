/**
 * Sanity check for the IDB backup format v8 upgrade (password crypto identity embedding).
 * Run: node --experimental-strip-types scripts/check-idb-v8.ts
 *
 * Two layers:
 * 1. Runtime — registers the extensionless-resolution hook (see
 *    resolve-extensionless.mjs), dynamically imports src/types/index.ts (pure
 *    consts/interfaces, strip-types safe) and asserts WORKBENCH_DATA_VERSION === 8.
 * 2. Source — readFileSync regex assertions over types/index.ts (v8 fields),
 *    useCrypto.ts (identity helpers + adopt writes both localStorage keys) and
 *    useIdb.ts (guard > 8, export side embeds salt+verification, adoption call
 *    strictly AFTER the tx-completion await).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'

// Register hook BEFORE dynamic import so extensionless imports resolve.
register(new URL('./resolve-extensionless.mjs', import.meta.url))

const types = await import('../src/types/index.ts')

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  PASS ${name}`)
}

console.log('[runtime] types exports')
check('WORKBENCH_DATA_VERSION === 8', () => assert.equal(types.WORKBENCH_DATA_VERSION, 8))

console.log('[source] types/index.ts WorkbenchData v8 fields')
const typesSource = readFileSync(new URL('../src/types/index.ts', import.meta.url), 'utf8')
check('WorkbenchData declares passwordsSalt?: string', () =>
  assert.ok(typesSource.includes('passwordsSalt?: string')))
check('WorkbenchData declares passwordVerification?: string', () =>
  assert.ok(typesSource.includes('passwordVerification?: string')))

console.log('[source] useCrypto.ts identity helpers')
const cryptoSource = readFileSync(new URL('../src/composables/useCrypto.ts', import.meta.url), 'utf8')
for (const name of ['getStoredSaltHex', 'getStoredVerification', 'adoptPasswordIdentity']) {
  check(`exports ${name}`, () => assert.ok(cryptoSource.includes(`export function ${name}`)))
}
check(
  'adoptPasswordIdentity writes SALT_KEY via localStorage.setItem',
  () => assert.ok(/adoptPasswordIdentity[\s\S]*localStorage\.setItem\(SALT_KEY/.test(cryptoSource))
)
check(
  'adoptPasswordIdentity writes VERIFICATION_KEY via localStorage.setItem',
  () => assert.ok(/adoptPasswordIdentity[\s\S]*localStorage\.setItem\(VERIFICATION_KEY/.test(cryptoSource))
)

console.log('[source] useIdb.ts v8 contract')
const idbSource = readFileSync(new URL('../src/composables/useIdb.ts', import.meta.url), 'utf8')
check('import guard accepts up to v8 (data.version > 8)', () =>
  assert.ok(idbSource.includes('data.version > 8')))
check('references getStoredSaltHex', () => assert.ok(idbSource.includes('getStoredSaltHex')))
check('references getStoredVerification', () => assert.ok(idbSource.includes('getStoredVerification')))
check('calls adoptPasswordIdentity(backupSalt', () =>
  assert.ok(idbSource.includes('adoptPasswordIdentity(backupSalt')))
check('export side embeds getStoredSaltHex() ?? undefined', () =>
  assert.ok(idbSource.includes('getStoredSaltHex() ?? undefined')))
check('export side embeds getStoredVerification() ?? undefined', () =>
  assert.ok(idbSource.includes('getStoredVerification() ?? undefined')))
check('idbImportAll returns { adoptedPasswordIdentity }', () =>
  assert.ok(idbSource.includes('return { adoptedPasswordIdentity }')))

// Ordering: adoption must run strictly AFTER the tx-completion await marker.
const txAwaitIdx = idbSource.indexOf('await new Promise<void>')
const adoptIdx = idbSource.indexOf('adoptPasswordIdentity(backupSalt')
check('adoption happens strictly after tx completion await', () => {
  assert.ok(txAwaitIdx >= 0, 'tx-await marker `await new Promise<void>` not found')
  assert.ok(adoptIdx > txAwaitIdx, `adoption (idx ${adoptIdx}) must come after tx await (idx ${txAwaitIdx})`)
})

console.log(`\nALL CHECKS PASSED (${passed})`)
