// 临时 QA：Todo 21 自动快照（进入 /workbench 时 captureSnapshot fire-and-forget）
// 复用已运行 dev server（16719）否则自起 vite；验证：
//   a) 首次进入 /workbench → snapshots store 恰 1 份，形状正确（id=YYYYMMDD-HHmmss、date=本地今日、
//      data 含 todos/pomodoro/habits 键、createdAt 可解析）
//   b) 快照数据来自 IDB（data.todos === idbExportAll().todos）
//   c) 快照不进 JSON 备份导出（idbExportAll 结果无 'snapshots' 键）
//   d) 同页 reload → 仍 1 份（同日去重按 date 字段生效）
// 结果写入 .omo/evidence/workbench-improvements/task-21-workbench-improvements.log
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const LOG_PATH = path.join(root, '.omo', 'evidence', 'workbench-improvements', 'task-21-workbench-improvements.log')

// ---------- 探测已运行 dev server / 自起 vite（strictPort）----------
async function httpOk(port) {
  try {
    const res = await fetch(`http://localhost:${port}/`)
    const text = await res.text()
    return res.ok && text.includes('id="app"')
  } catch {
    return false
  }
}

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
      const plain = out.replace(/\u001b\[[0-9;]*m/g, '')
      if (plain.includes('Local:')) done({ ok: true, port, child })
    })
    child.stderr.on('data', () => {})
    child.on('exit', (code) => done({ ok: false, port, code }))
    child.on('error', (e) => done({ ok: false, port, error: e.message }))
    timer = setTimeout(() => done({ ok: false, port, timeout: true }), 15000)
  })
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: JSON.stringify(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`)
}

let browser
let server
let baseUrl
try {
  // 先复用 16719（若为本站 dev server），否则 16719 起（被占则换 16720+）
  let reused = false
  for (const port of [16719, 16720, 16721, 16722, 16723]) {
    if (await httpOk(port)) {
      reused = true
      baseUrl = `http://localhost:${port}`
      break
    }
    const s = await startVite(port)
    if (s.ok) {
      server = s
      baseUrl = `http://localhost:${port}`
      break
    }
  }
  if (!baseUrl) throw new Error('vite dev 起不来（16719-16723 均不可用）')
  console.log(`[qa] dev server ${reused ? '复用' : '自起'} @ ${baseUrl}`)

  browser = await chromium.launch()
  const page = await browser.newPage()

  // a) 首次进入 /workbench → 等自动快照落库 → 校验形状
  await page.goto(`${baseUrl}/workbench`, { waitUntil: 'networkidle' })
  const first = await page.evaluate(async () => {
    const { idbGet, idbExportAll } = await import('/src/composables/useIdb.ts')
    let list = []
    for (let i = 0; i < 40; i++) {
      list = (await idbGet('snapshots')) ?? []
      if (list.length > 0) break
      await new Promise((r) => setTimeout(r, 250))
    }
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    const exp = await idbExportAll()
    const snap = list[0]
    return {
      count: list.length,
      id: snap?.id ?? null,
      date: snap?.date ?? null,
      createdAt: snap?.createdAt ?? null,
      idOk: typeof snap?.id === 'string' && /^\d{8}-\d{6}$/.test(snap.id),
      dateOk: snap?.date === today,
      createdParsed: !Number.isNaN(Date.parse(snap?.createdAt ?? '')),
      dataKeys: snap?.data ? Object.keys(snap.data) : [],
      hasTodos: Array.isArray(snap?.data?.todos),
      hasPomodoro: 'pomodoro' in (snap?.data ?? {}),
      hasHabits: 'habits' in (snap?.data ?? {}),
      todosFromIdb: JSON.stringify(snap?.data?.todos) === JSON.stringify(exp.todos),
      exportHasSnapshots: 'snapshots' in exp
    }
  })
  record(
    'a) 首次进入自动快照 1 份且形状正确',
    first.count === 1 &&
      first.idOk &&
      first.dateOk &&
      first.createdParsed &&
      first.hasTodos &&
      first.hasPomodoro &&
      first.hasHabits,
    first
  )
  record('b) 快照数据来自 IDB（todos 与 idbExportAll 一致）', first.todosFromIdb === true, first)
  record('c) 快照不进 JSON 备份导出', first.exportHasSnapshots === false, first)

  // d) 同页 reload → 同日去重仍 1 份（同 id）
  await page.reload({ waitUntil: 'networkidle' })
  const second = await page.evaluate(async () => {
    const { idbGet } = await import('/src/composables/useIdb.ts')
    let list = []
    for (let i = 0; i < 40; i++) {
      list = (await idbGet('snapshots')) ?? []
      if (list.length > 0) break
      await new Promise((r) => setTimeout(r, 250))
    }
    return { count: list.length, ids: list.map((s) => s.id) }
  })
  record(
    'd) reload 后同日去重仍 1 份（同 id）',
    second.count === 1 && second.ids[0] === first.id,
    second
  )

  // 清理：清空 snapshots store，不留残留（QA 后 Todo 22 有独立脚本）
  await page.evaluate(async () => {
    const { idbClear } = await import('/src/composables/useIdb.ts')
    await idbClear('snapshots')
  })

  await browser.close()
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  if (browser) await browser.close().catch(() => {})
} finally {
  if (server) server.child?.kill()
}

const passed = results.filter((r) => r.ok).length
const summary = { suite: 'task-21-workbench-improvements', passed, failed: results.length - passed, results }
console.log(`\n${passed}/${results.length} passed`)
mkdirSync(path.dirname(LOG_PATH), { recursive: true })
writeFileSync(LOG_PATH, JSON.stringify(summary, null, 2) + '\n', 'utf8')
if (passed !== results.length) process.exit(1)
