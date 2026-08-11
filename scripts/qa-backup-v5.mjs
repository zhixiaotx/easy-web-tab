/**
 * QA: 工作台 JSON 备份格式 v4→v5（Todo 2 / workbench-improvements）
 *
 * Playwright 方案：后台启动 vite dev（端口 16718）→ 打开 /workbench 等待加载 →
 * 页内动态 import /src/composables/useIdb.ts → 跑导出/导入断言（happy + failure 场景）→
 * 把断言清单与 pass/fail 写入 .omo/evidence/workbench-improvements/task-2-workbench-improvements.json
 * （仅 QA 段，commit 信息由任务收尾用 bash 合并）→ 关闭 dev server（若为本脚本启动）。
 *
 * 运行：node scripts/qa-backup-v5.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 16718
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_PATH = join(ROOT, '.omo', 'evidence', 'workbench-improvements', 'task-2-workbench-improvements.json')

/** 轮询等待 dev server 就绪（最多 40s）。 */
async function waitForServer(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

/** 判断某端口是否为 vite dev server：/src/... 模块返回转译后的 JS（含 useIdb 导出符号），而非 SPA fallback 的 HTML。 */
async function isViteDevAt(port) {
  try {
    const res = await fetch(`http://localhost:${port}/src/composables/useIdb.ts`)
    if (!res.ok) return false
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('text/html')) return false
    const body = await res.text()
    return body.includes('idbExportAll')
  } catch {
    return false
  }
}

/** 判断端口空闲（连接被拒）。 */
async function isPortFree(port) {
  try {
    const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) })
    return !res.ok
  } catch {
    return true
  }
}

let server = null
let startedByUs = false
let devBase = null

async function ensureDevServer() {
  // 1) 复用已在跑的 vite dev server（16718 或相邻端口）
  for (let p = 16718; p <= 16726; p++) {
    if (await isViteDevAt(p)) {
      devBase = `http://localhost:${p}`
      console.log(`[dev] reuse running vite dev server at ${devBase}`)
      return
    }
  }
  // 2) 否则找空闲端口自起 dev server（16718 可能被生产 serve 占用 → --strictPort 上浮）
  for (let p = 16718; p <= 16726; p++) {
    if (!(await isPortFree(p))) continue
    const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
    server = spawn(process.execPath, [viteBin, '--port', String(p), '--strictPort'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    startedByUs = true
    server.stdout.on('data', (d) => process.stdout.write(`[vite] ${d}`))
    server.stderr.on('data', (d) => process.stdout.write(`[vite] ${d}`))
    const ok = await waitForServer(`http://localhost:${p}`)
    if (ok && (await isViteDevAt(p))) {
      devBase = `http://localhost:${p}`
      console.log(`[dev] dev server ready at ${devBase}`)
      return
    }
    // 端口占用或非 vite → 关掉重试下一端口
    server.kill()
    server = null
    startedByUs = false
  }
  throw new Error('no free port found for vite dev server (16718-16726)')
}

function stopDevServer() {
  if (server && startedByUs) {
    server.kill()
    console.log('[dev] dev server stopped')
  }
}

/** 页内断言主体：全部在浏览器 IndexedDB 上直跑，返回序列化断言清单。 */
async function runAssertions() {
  const results = []
  const push = (name, pass, detail) => results.push({ name, pass, detail: String(detail) })
  const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const EMPTY_POMODORO = { settings: { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, sessionsPerCycle: 4 }, records: [] }
  const EMPTY_HABITS = { habits: [], records: [] }
  try {
    const m = await import('/src/composables/useIdb.ts')

    // ===== A. 导出 =====
    const seed = [{ id: 't1', title: 'qa-seed' }]
    await m.idbPut('todos', seed)
    const exported = await m.idbExportAll()
    push('export.version === 5', exported.version === 5, 'version=' + exported.version)
    push('export has pomodoro key', 'pomodoro' in exported, 'keys=' + Object.keys(exported).join(','))
    push('export has habits key', 'habits' in exported, '')
    push('export has NO snapshots key', !('snapshots' in exported), '')
    const legacy = ['todos', 'notes', 'countdowns', 'passwords', 'health', 'ledger', 'settings']
    push('export keeps 7 legacy fields', legacy.every((k) => k in exported), '')
    push('export.todos carries seeded data', deepEq(exported.todos, seed), JSON.stringify(exported.todos))
    push(
      'export.pomodoro is non-empty structure',
      exported.pomodoro !== null && typeof exported.pomodoro === 'object' && 'settings' in exported.pomodoro,
      JSON.stringify(exported.pomodoro)
    )

    // ===== B. v4 备份导入 → 新 store 空数据兜底 + 旧 store 数据完好 =====
    const v4 = { ...exported, version: 4 }
    delete v4.pomodoro
    delete v4.habits
    await m.idbImportAll(v4)
    const pomodoro = await m.idbGet('pomodoro')
    const habits = await m.idbGet('habits')
    const todos = await m.idbGet('todos')
    push('v4 import: pomodoro empty fallback', deepEq(pomodoro, EMPTY_POMODORO), JSON.stringify(pomodoro))
    push('v4 import: habits empty fallback', deepEq(habits, EMPTY_HABITS), JSON.stringify(habits))
    push('v4 import: todos intact', deepEq(todos, seed), JSON.stringify(todos))

    // ===== C. 失败场景：v5 备份缺 pomodoro 字段 → 导入不抛错、兜底空数据 =====
    const v5missing = { ...(await m.idbExportAll()) }
    delete v5missing.pomodoro
    let threw = false
    try {
      await m.idbImportAll(v5missing)
    } catch (err) {
      threw = true
    }
    push('v5 missing pomodoro: import does not throw', !threw, threw ? 'threw' : 'ok')
    const pomodoro2 = await m.idbGet('pomodoro')
    push('v5 missing pomodoro: empty fallback', deepEq(pomodoro2, EMPTY_POMODORO), JSON.stringify(pomodoro2))

    // ===== D. 负向控制：v6 备份仍被拒绝 =====
    let threwV6 = false
    try {
      await m.idbImportAll({ ...v4, version: 6 })
    } catch (err) {
      threwV6 = true
    }
    push('v6 rejected with version error', threwV6, threwV6 ? 'threw' : 'no-throw')

    // ===== E. 既有 settings 兜底路径未破坏（v3 备份无 settings → empty 兜底）=====
    const v3 = { ...v4, version: 3 }
    delete v3.settings
    await m.idbImportAll(v3)
    const settings = await m.idbGet('settings')
    push(
      'v3 import: settings empty fallback preserved',
      settings !== null && typeof settings === 'object' && 'dialogSizes' in settings,
      JSON.stringify(settings)
    )
  } catch (err) {
    push('evaluate block completed without fatal error', false, String((err && err.stack) || err))
  }
  return results
}

async function main() {
  console.log(`[qa] backup format v4->v5 (Todo 2)`)
  await ensureDevServer()
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500) // 等应用 store 完成加载，避免与断言竞争
    const assertions = await page.evaluate(runAssertions)
    const passed = assertions.filter((a) => a.pass).length
    const verdict = passed === assertions.length && assertions.length > 0 ? 'PASS' : 'FAIL'
    console.log(`[qa] assertions: ${passed}/${assertions.length} passed`)
    for (const a of assertions) console.log(`  ${a.pass ? 'PASS' : 'FAIL'} ${a.name}${a.detail ? ' | ' + a.detail : ''}`)

    const qa = {
      command: 'node scripts/qa-backup-v5.mjs',
      result: `${verdict} (${passed}/${assertions.length})`,
      browser: 'chromium (playwright 1.62.1, headless)',
      dev_server: `vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
      scenarios: {
        happy: 'idbExportAll v5 导出（version=5、含 pomodoro/habits、无 snapshots、7 旧字段不变）+ v4 备份导入（pomodoro/habits 空数据兜底、旧 store 数据完好）',
        failure: 'v5 备份缺 pomodoro 字段 → 导入不抛错且兜底空数据；v6 备份 → 抛「备份文件版本不兼容」；v3 备份无 settings → empty 兜底仍生效'
      },
      assertions
    }
    mkdirSync(dirname(EVIDENCE_PATH), { recursive: true })
    writeFileSync(EVIDENCE_PATH, JSON.stringify({ task: 'workbench-improvements: Todo 2 - 备份格式 v4→v5 纳入 pomodoro/habits', qa }, null, 2), 'utf8')
    console.log(`[qa] evidence written: ${EVIDENCE_PATH}`)
    if (verdict !== 'PASS') process.exitCode = 1
  } finally {
    await browser.close()
    stopDevServer()
  }
}

main().catch((err) => {
  console.error('[qa] fatal:', err)
  stopDevServer()
  process.exit(1)
})
