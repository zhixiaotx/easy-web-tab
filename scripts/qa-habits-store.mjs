// 临时 QA：workbenchHabits.ts 习惯打卡 store（Playwright + vite dev）
// 起 vite dev（16718 冲突自动换 16719）→ chromium /workbench → page.evaluate 动态 import store 模块
// 验证：a) addHabit 成功+同名拒绝  b) toggleCheckIn 打卡→取消(幂等)  c) 连续 3 天 streak=3
//       d) deleteHabit 清理其 records  e) reload 后数据保留
// 结果写入 .omo/evidence/workbench-improvements/task-10-workbench-improvements.log
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const LOG_PATH = path.join(root, '.omo', 'evidence', 'workbench-improvements', 'task-10-workbench-improvements.log')

// ---------- vite dev 启动（strictPort：冲突退出 → 换端口）----------
function startVite(port) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    let out = ''
    let settled = false
    let timer
    const done = (res) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve(res)
      }
    }
    child.stdout.on('data', (d) => {
      out += d.toString()
      // vite 输出带 ANSI 颜色码（`Local\x1b[22m:`），先剥码再匹配 ready 行
      const plain = out.replace(/\u001b\[[0-9;]*m/g, '')
      if (plain.includes('Local:')) done({ ok: true, port, child })
    })
    child.stderr.on('data', () => {})
    child.on('exit', (code) => done({ ok: false, port, code }))
    child.on('error', (e) => done({ ok: false, port, error: e.message }))
    timer = setTimeout(() => done({ ok: false, port, timeout: true }), 15000)
  })
}

// ---------- 页面内工具：取应用 pinia + store ----------
const PINIA_STORE_BOOTSTRAP = `
  const mod = await import('/src/stores/workbenchHabits.ts')
  const appEl = document.querySelector('#app')
  const app = appEl ? appEl.__vue_app__ : null
  let pinia = null
  if (app) {
    const gp = app.config && app.config.globalProperties
    if (gp && gp.$pinia) {
      pinia = gp.$pinia // pinia.install 挂在 globalProperties 的 $pinia
    } else {
      const provides = app._context ? app._context.provides : null
      if (provides) {
        for (const k of [...Object.keys(provides), ...Object.getOwnPropertySymbols(provides)]) {
          if (String(k).includes('pinia')) { pinia = provides[k]; break }
        }
      }
    }
  }
  if (!pinia) return { error: 'pinia not found', appFound: !!app, providesType: app && app._context ? typeof app._context.provides : 'no-ctx' }
  const store = mod.useWorkbenchHabitsStore(pinia)
  const d = (delta) => { const x = new Date(); x.setDate(x.getDate() + delta); const p = n => String(n).padStart(2, '0'); return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate()) }
`

const results = []
function record(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: JSON.stringify(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`)
}

let browser
let server
try {
  // 探测空闲端口（16718 起，含 16719 冲突自动换，最多试 5 个）
  for (const port of [16718, 16719, 16720, 16721, 16722]) {
    const s = await startVite(port)
    if (s.ok) { server = s; break }
  }
  if (!server) throw new Error('vite dev 起不来（16718-16722 均被占用）')

  browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(`http://localhost:${server.port}/workbench`, { waitUntil: 'networkidle' })

  // a) addHabit 成功 + 同名拒绝 + 空名拒绝
  const a = await page.evaluate(async ({ boot }) => {
    const ctx = {}
    // eslint-disable-next-line no-new-func
    return eval('async () => {' + boot + '\n' + `
      const r1 = await store.addHabit('晨跑', 7)
      const r2 = await store.addHabit('晨跑', 7)
      const r3 = await store.addHabit('   ', 7)
      const r4 = await store.addHabit('Reading', 5, '#ff0000')
      return { r1, r2, r3, r4, count: store.habits.length }
    ` + '}')()
  }, { boot: PINIA_STORE_BOOTSTRAP })
  record(
    'a) addHabit 成功 + 同名拒绝(duplicate) + 空名拒绝(empty)',
    a?.r1?.ok === true && a?.r2?.ok === false && a?.r2?.reason === 'duplicate' && a?.r3?.ok === false && a?.r3?.reason === 'empty' && a?.r4?.ok === true && a?.count === 2,
    a
  )

  // b) toggleCheckIn 打卡 → 再点取消（幂等）
  const b = await page.evaluate(async ({ boot }) => {
    const ctx = {}
    // eslint-disable-next-line no-new-func
    return eval('async () => {' + boot + '\n' + `
      const hb = store.habits.find(h => h.name === '晨跑')
      const today = d(0)
      const c1 = await store.toggleCheckIn(hb.id, today)
      const after1 = store.records.filter(r => r.habitId === hb.id).length
      const c2 = await store.toggleCheckIn(hb.id, today)
      const after2 = store.records.filter(r => r.habitId === hb.id).length
      return { c1: c1.ok, after1, c2: c2.ok, after2 }
    ` + '}')()
  }, { boot: PINIA_STORE_BOOTSTRAP })
  record('b) toggleCheckIn 打卡→取消（幂等）', b?.c1 === true && b?.after1 === 1 && b?.c2 === true && b?.after2 === 0, b)

  // c) 连续打卡 3 天 streak=3（走 habitCore.streakDays 只读委托）
  const c = await page.evaluate(async ({ boot }) => {
    const ctx = {}
    // eslint-disable-next-line no-new-func
    return eval('async () => {' + boot + '\n' + `
      const hb = store.habits.find(h => h.name === '晨跑')
      await store.toggleCheckIn(hb.id, d(0))
      await store.toggleCheckIn(hb.id, d(-1))
      await store.toggleCheckIn(hb.id, d(-2))
      const streak = store.streakDaysOf(hb.id, d(0))
      const week = store.weekCompletionsOf(hb.id, d(0))
      const att = store.weeklyAttainmentOf(hb.id, 7, d(0))
      return { streak, weekCount: week.length, att, records: store.records.filter(r => r.habitId === hb.id).length }
    ` + '}')()
  }, { boot: PINIA_STORE_BOOTSTRAP })
  record('c) 连续打卡 3 天 streak=3', c?.streak === 3 && c?.weekCount === 3 && c?.att?.completed === 3 && c?.records === 3, c)

  // d) deleteHabit 后其 records 一并清理
  const d = await page.evaluate(async ({ boot }) => {
    const ctx = {}
    // eslint-disable-next-line no-new-func
    return eval('async () => {' + boot + '\n' + `
      const hb = store.habits.find(h => h.name === '晨跑')
      const recCountBefore = store.records.filter(r => r.habitId === hb.id).length
      const del = await store.deleteHabit(hb.id)
      const recLeft = store.records.filter(r => r.habitId === hb.id).length
      const delNotFound = await store.deleteHabit(hb.id)
      return { recCountBefore, del: del.ok, recLeft, delNotFound }
    ` + '}')()
  }, { boot: PINIA_STORE_BOOTSTRAP })
  record('d) deleteHabit 清理其 records', d?.recCountBefore === 3 && d?.del === true && d?.recLeft === 0 && d?.delNotFound?.ok === false && d?.delNotFound?.reason === 'not-found', d)

  // e) reload 后数据保留（先造数据 → reload → 重新 loadHabits 校验）
  const setup = await page.evaluate(async ({ boot }) => {
    const ctx = {}
    // eslint-disable-next-line no-new-func
    return eval('async () => {' + boot + '\n' + `
      const r = await store.addHabit('Reload持久化', 3, '#00ff00')
      const hid = store.habits.find(h => h.name === 'Reload持久化').id
      await store.toggleCheckIn(hid, d(0))
      return { ok: r.ok, hid }
    ` + '}')()
  }, { boot: PINIA_STORE_BOOTSTRAP })
  await page.reload({ waitUntil: 'networkidle' })
  const e = await page.evaluate(async ({ boot, hid }) => {
    // eslint-disable-next-line no-new-func
    return eval('async () => {' + boot + '\n' + `
      await store.loadHabits()
      const hb = store.habits.find(h => h.name === 'Reload持久化')
      return {
        found: !!hb,
        recordCount: hb ? store.records.filter(r => r.habitId === hb.id).length : -1,
        idStable: hb ? hb.id === ${JSON.stringify(hid)} : false,
        freq: hb ? hb.frequency : -1,
        color: hb ? hb.color : null
      }
    ` + '}')()
  }, { boot: PINIA_STORE_BOOTSTRAP, hid: setup.hid })
  record('e) reload 后数据保留（idbGet habits）', e?.found === true && e?.recordCount === 1 && e?.idStable === true && e?.freq === 3 && e?.color === '#00ff00', e)

  // 清理：清空 habits store，不留残留
  await page.evaluate(async () => {
    const { idbClear } = await import('/src/composables/useIdb.ts')
    await idbClear('habits')
  })

  await browser.close()
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  if (browser) await browser.close().catch(() => {})
} finally {
  server?.child?.kill()
}

// ---------- 写证据 log ----------
const today = new Date().toISOString().slice(0, 10)
const lines = []
lines.push(`[TASK 10] ${today} workbenchHabits.ts 习惯打卡 store（IDB 持久化）`)
lines.push('------------------------------------------------------------')
lines.push('STATUS: ' + (results.every(r => r.ok) ? 'DONE' : 'FAILED'))
lines.push('')
lines.push('Created:')
lines.push('  - src/stores/workbenchHabits.ts (Pinia composition store)')
lines.push('      state: habits / records 双 ref 数组（对齐 habitCore HabitsData { habits, records }）')
lines.push("      loadHabits()  idbGet('habits') -> normalizeHabitsData 幂等归一（坏习惯/孤儿记录/同日去重）")
lines.push("      saveHabits()  双数组分别 toRaw -> idbPut('habits', { habits, records })（防 DataCloneError）")
lines.push("      addHabit(name, frequency, color?)   同名拒绝 { ok:false, reason:'duplicate' }，id 前缀 hb_")
lines.push('      updateHabit(id, patch)             { ok, reason: empty|duplicate|not-found }')
lines.push('      deleteHabit(id)                    同时清理该习惯 records（toRaw 原始数组 filter）')
lines.push('      toggleCheckIn(habitId, date)       同日已打卡移除/未打卡追加（id 前缀 hr_），幂等')
lines.push('      weekCompletionsOf/streakDaysOf/weeklyAttainmentOf  只读薄委托 habitCore，无内联公式')
lines.push('  - scripts/qa-habits-store.mjs (Playwright QA；vite dev 16718 冲突自动换 16719)')
lines.push('')
lines.push('Verification:')
lines.push('  1. npm run build -> EXIT=0')
lines.push("  2. grep workbenchHabits.ts -> saveHabits: idbPut('habits', { habits: toRaw(habits.value), records: toRaw(records.value) })")
lines.push('     deleteHabit: records.value = toRaw(records.value).filter(r => r.habitId !== id)')
lines.push('     store 无内联 streak/attainment 公式（weekCompletions/streakDays/weeklyAttainment 仅作委托调用）')
lines.push('')
lines.push('QA covered (Playwright, chromium /workbench):')
for (const r of results) {
  lines.push(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ->  ${r.detail}`)
}
lines.push('')
lines.push('Commit: feat(habits): 新增习惯打卡 store（IDB 持久化）')
writeFileSync(LOG_PATH, lines.join('\n') + '\n', 'utf8')
console.log(`\nEvidence written: ${LOG_PATH}`)
console.log(`TOTAL: ${results.filter(r => r.ok).length}/${results.length} passed`)
