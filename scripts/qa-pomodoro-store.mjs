/**
 * QA: 番茄钟 store（Todo 9 / workbench-improvements）
 *
 * Playwright 方案：后台启动 vite dev（端口 16718，被占用自动上浮 16719-16726）→ 打开 /workbench →
 * 页内动态 import /src/stores/workbenchPomodoro.ts（pinia 实例经转译模块内发现的 deps URL 新建，与 App 隔离）→
 * 跑断言：a) loadPomodoro 后今日统计 0；b) recordSession 后 todayStats=1 且 idbGet('pomodoro') 已持久化
 * （reload 后仍在）；c) updateSettings 改 workMinutes 后持久化；d) clearToday 清零并持久化（顺带）。
 * QA 摘要写入 .omo/evidence/workbench-improvements/task-9-qa-partial.log（主 .log 由任务收尾用 bash 合并）。
 *
 * 运行：node scripts/qa-pomodoro-store.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_PATH = join(ROOT, '.omo', 'evidence', 'workbench-improvements', 'task-9-qa-partial.log')

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

/** 判断某端口是否为 vite dev server（返回转译后的 JS 而非 SPA fallback HTML）。 */
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
  for (let p = 16718; p <= 16726; p++) {
    if (await isViteDevAt(p)) {
      devBase = `http://localhost:${p}`
      console.log(`[dev] reuse running vite dev server at ${devBase}`)
      return
    }
  }
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

/** 页内断言主体（阶段 1：加载/记录/设置/清除，阶段 2：reload 后持久化验证）。 */
async function runAssertions() {
  const results = []
  const push = (name, pass, detail) => results.push({ name, pass, detail: String(detail) })
  const localToday = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  try {
    // 发现 vite 重写后的 pinia deps URL（从转译的 store 模块源码提取，稳健于 hash 变化）
    const src = await (await fetch('/src/stores/workbenchPomodoro.ts')).text()
    const m = src.match(/from\s+["']([^"']*pinia[^"']*)["']/)
    const piniaMod = await import(m ? m[1] : '/node_modules/.vite/deps/pinia.js')
    piniaMod.setActivePinia(piniaMod.createPinia())
    const { useWorkbenchPomodoroStore } = await import('/src/stores/workbenchPomodoro.ts')
    const { idbGet } = await import('/src/composables/useIdb.ts')
    const store = useWorkbenchPomodoroStore()
    const today = localToday()

    // ===== 阶段 1a：loadPomodoro → 今日统计 0 =====
    await store.loadPomodoro()
    push('loadPomodoro: 今日统计为 0', store.todayStats(today) === 0, 'todayStats=' + store.todayStats(today))
    const s = store.data.settings
    push(
      'loadPomodoro: settings 默认 25/5/15/4',
      s.workMinutes === 25 && s.breakMinutes === 5 && s.longBreakMinutes === 15 && s.sessionsPerCycle === 4,
      JSON.stringify(s)
    )

    // ===== 阶段 1b：recordSession → todayStats=1 + idbGet 已持久化 =====
    await store.recordSession(today)
    push('recordSession: todayStats 为 1', store.todayStats(today) === 1, 'todayStats=' + store.todayStats(today))
    const persisted = await idbGet('pomodoro')
    const rec = persisted && persisted.records && persisted.records.find((r) => r.date === today)
    push(
      'recordSession: idbGet 持久化单日记录 workSessions=1',
      !!rec && rec.workSessions === 1,
      JSON.stringify(rec)
    )
    push('recordSession: 再次调用累加为 2', (await (async () => { await store.recordSession(today); return store.todayStats(today) })()) === 2, '')

    // ===== 阶段 1c：updateSettings → data + idbGet 均持久化 =====
    await store.updateSettings({ workMinutes: 30 })
    const persisted2 = await idbGet('pomodoro')
    push(
      'updateSettings: data.settings.workMinutes 为 30',
      store.data.settings.workMinutes === 30,
      'workMinutes=' + store.data.settings.workMinutes
    )
    push(
      'updateSettings: idbGet settings.workMinutes 为 30',
      persisted2 && persisted2.settings && persisted2.settings.workMinutes === 30,
      persisted2 ? JSON.stringify(persisted2.settings) : 'idbGet undefined'
    )

    // ===== 阶段 1d（顺带）：clearToday → 今日统计归零并持久化 =====
    await store.clearToday(today)
    const persisted3 = await idbGet('pomodoro')
    push('clearToday: todayStats 归零', store.todayStats(today) === 0, 'todayStats=' + store.todayStats(today))
    push(
      'clearToday: idbGet records 移除当日条目',
      !persisted3.records || persisted3.records.every((r) => r.date !== today),
      JSON.stringify(persisted3 && persisted3.records)
    )

    // 留一条记录供 reload 后验证持久化
    await store.recordSession(today)
    window.__qaPomodoroPhase = 'done'
    localStorage.setItem('qa-pomodoro-phase', 'done')
  } catch (err) {
    push('phase-1 evaluate completed without fatal error', false, String((err && err.stack) || err))
  }
  return results
}

/** reload 后阶段 2：数据仍在 IDB 中，loadPomodoro 恢复。 */
async function runReloadAssertions() {
  const results = []
  const push = (name, pass, detail) => results.push({ name, pass, detail: String(detail) })
  const localToday = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  try {
    const src = await (await fetch('/src/stores/workbenchPomodoro.ts')).text()
    const m = src.match(/from\s+["']([^"']*pinia[^"']*)["']/)
    const piniaMod = await import(m ? m[1] : '/node_modules/.vite/deps/pinia.js')
    piniaMod.setActivePinia(piniaMod.createPinia())
    const { useWorkbenchPomodoroStore } = await import('/src/stores/workbenchPomodoro.ts')
    const store = useWorkbenchPomodoroStore()
    const today = localToday()
    await store.loadPomodoro()
    push('reload 后: todayStats 仍为 1（持久化生效）', store.todayStats(today) === 1, 'todayStats=' + store.todayStats(today))
    push('reload 后: workMinutes 仍为 30（持久化生效）', store.data.settings.workMinutes === 30, 'workMinutes=' + store.data.settings.workMinutes)
    // 收尾：清空 QA 污染数据，恢复默认设置
    await store.clearToday(today)
    await store.updateSettings({ workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, sessionsPerCycle: 4 })
    localStorage.removeItem('qa-pomodoro-phase')
  } catch (err) {
    push('phase-2 evaluate completed without fatal error', false, String((err && err.stack) || err))
  }
  return results
}

async function main() {
  console.log(`[qa] pomodoro store (Todo 9)`)
  await ensureDevServer()
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    const assertions = await page.evaluate(runAssertions)
    let passed = assertions.filter((a) => a.pass).length
    console.log(`[qa] phase-1 assertions: ${passed}/${assertions.length} passed`)
    for (const a of assertions) console.log(`  ${a.pass ? 'PASS' : 'FAIL'} ${a.name}${a.detail ? ' | ' + a.detail : ''}`)

    // reload 验证持久化
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    const reloadAssertions = await page.evaluate(runReloadAssertions)
    passed = reloadAssertions.filter((a) => a.pass).length
    console.log(`[qa] phase-2 (reload) assertions: ${passed}/${reloadAssertions.length} passed`)
    for (const a of reloadAssertions) console.log(`  ${a.pass ? 'PASS' : 'FAIL'} ${a.name}${a.detail ? ' | ' + a.detail : ''}`)

    const all = [...assertions, ...reloadAssertions]
    const totalPassed = all.filter((a) => a.pass).length
    const verdict = totalPassed === all.length && all.length > 0 ? 'PASS' : 'FAIL'
    const qa = {
      command: 'node scripts/qa-pomodoro-store.mjs',
      result: `${verdict} (${totalPassed}/${all.length})`,
      browser: 'chromium (playwright, headless)',
      dev_server: `vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
      scenarios: {
        a: 'loadPomodoro → todayStats(今日) 0、settings 默认 25/5/15/4',
        b: 'recordSession → todayStats=1，idbGet(pomodoro) 当日记录 workSessions=1，再调用累加为 2；reload 后仍在',
        c: 'updateSettings({workMinutes:30}) → data 与 idbGet 均持久化，reload 后仍在',
        d: 'clearToday（顺带）→ todayStats 归零且 idbGet 移除当日条目'
      },
      assertions: all
    }
    mkdirSync(dirname(EVIDENCE_PATH), { recursive: true })
    writeFileSync(EVIDENCE_PATH, JSON.stringify({ task: 'workbench-improvements: Todo 9 - 番茄钟 store（IDB 持久化）', qa }, null, 2), 'utf8')
    console.log(`[qa] QA partial evidence written: ${EVIDENCE_PATH}`)
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
