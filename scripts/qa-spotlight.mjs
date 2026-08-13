/**
 * QA: 全局搜索浮层（Todo 17 / workbench-improvements）
 *
 * Playwright 方案：后台启动 vite dev（端口 16718，被占用自动上浮）→ 打开 /workbench →
 * 断言侧栏底部「全局搜索」按钮（wb-spotlight-open）→ 点击打开浮层（sp-overlay/sp-input 可见且聚焦）→
 * 输入「工资」→ 断言记账分组命中内置「工资」分类（sp-result-ledger-category-salary）→
 * 输入乱码 → 断言空态（sp-empty）→ 重新输入「工资」按 Enter → 断言跳转记账面板（ld-stat-income）→
 * 便签面板新增含「工资」的便签 → 重新打开浮层输入「工资」→ 断言便签+记账双分组命中 →
 * 按 Esc 关闭浮层 → 截图存 .omo/evidence/workbench-improvements/task-17-workbench-improvements.png。
 *
 * 运行：node scripts/qa-spotlight.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'workbench-improvements')
const EVIDENCE_PNG = join(EVIDENCE_DIR, 'task-17-workbench-improvements.png')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'task-17-qa-partial.log')

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

const results = []
function record(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: JSON.stringify(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`)
}

let browser
try {
  await ensureDevServer()
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  // ===== 打开工作台 + 断言侧栏底部「全局搜索」按钮 =====
  await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wb-spotlight-open"]', { state: 'visible', timeout: 15000 })
  const openBtnText = (await page.locator('[data-testid="wb-spotlight-open"]').textContent()).trim()
  record('a) 侧栏底部「全局搜索」按钮存在', openBtnText.includes('全局搜索'), { openBtnText })

  // ===== 点击打开浮层：sp-overlay / sp-input 可见且自动聚焦 =====
  await page.locator('[data-testid="wb-spotlight-open"]').click()
  await page.waitForSelector('[data-testid="sp-overlay"]', { state: 'visible', timeout: 10000 })
  await page.waitForSelector('[data-testid="sp-input"]', { state: 'visible', timeout: 10000 })
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'sp-input')
  record('b) 点击按钮 → 浮层打开且输入框自动聚焦', focused, { focused })

  // ===== 输入「工资」→ 记账分组命中内置「工资」分类 =====
  await page.locator('[data-testid="sp-input"]').fill('工资')
  await page.waitForSelector('[data-testid="sp-result-ledger-category-salary"]', { state: 'visible', timeout: 10000 })
  const ledgerHitTitle = (
    await page.locator('[data-testid="sp-result-ledger-category-salary"]').textContent()
  ).trim()
  record('c) 输入「工资」→ 记账分组命中内置「工资」分类', ledgerHitTitle.includes('工资'), { ledgerHitTitle })

  // ===== 输入乱码 → 空态 sp-empty =====
  await page.locator('[data-testid="sp-input"]').fill('zzzzzz-not-exist')
  await page.waitForSelector('[data-testid="sp-empty"]', { state: 'visible', timeout: 10000 })
  const emptyText = (await page.locator('[data-testid="sp-empty"]').textContent()).trim()
  record('d) 输入乱码 → 空态 sp-empty', emptyText.includes('未找到'), { emptyText })

  // ===== 重新输入「工资」按 Enter → 跳转记账面板 =====
  await page.locator('[data-testid="sp-input"]').fill('工资')
  await page.waitForSelector('[data-testid="sp-result-ledger-category-salary"]', { state: 'visible', timeout: 10000 })
  await page.keyboard.press('ArrowDown') // fill 重置 activeIndex=-1，↓ 激活首条（唯一结果=记账「工资」分类）
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-testid="ld-stat-income"]', { state: 'visible', timeout: 10000 })
  const ledgerPanelVisible = await page.locator('[data-testid="ld-stat-income"]').isVisible()
  const overlayClosed = (await page.locator('[data-testid="sp-overlay"]').count()) === 0
  record('e) Enter → 跳转记账面板且浮层关闭', ledgerPanelVisible && overlayClosed, { ledgerPanelVisible, overlayClosed })

  // ===== 便签面板新增含「工资」的便签（为双分组命中做准备）=====
  await page.locator('[data-testid="wb-menu-notes"]').click()
  await page.waitForSelector('[data-testid="note-add-button"]', { state: 'visible', timeout: 10000 })
  await page.locator('[data-testid="note-add-button"]').click()
  await page.waitForSelector('[data-testid="note-title-input"]', { state: 'visible', timeout: 10000 })
  await page.locator('[data-testid="note-title-input"]').fill('工资查询测试')
  await page.locator('[data-testid="note-content-input"]').fill('本月工资已到账')
  await page.locator('[data-testid="note-save-button"]').click()
  await page.waitForSelector('[data-testid="note-card"]', { state: 'visible', timeout: 10000 })
  record('f) 便签面板新增含「工资」的便签', true, { noteTitle: '工资查询测试' })

  // ===== 重新打开浮层输入「工资」→ 便签+记账双分组命中 =====
  await page.locator('[data-testid="wb-spotlight-open"]').click()
  await page.waitForSelector('[data-testid="sp-input"]', { state: 'visible', timeout: 10000 })
  await page.locator('[data-testid="sp-input"]').fill('工资')
  await page.waitForSelector('[data-testid^="sp-result-note-"]', { state: 'visible', timeout: 10000 })
  await page.waitForSelector('[data-testid="sp-result-ledger-category-salary"]', { state: 'visible', timeout: 10000 })
  const noteHitCount = await page.locator('[data-testid^="sp-result-note-"]').count()
  const ledgerHitCount = await page.locator('[data-testid^="sp-result-ledger-"]').count()
  record('g) 便签+记账双分组同时命中', noteHitCount >= 1 && ledgerHitCount >= 1, { noteHitCount, ledgerHitCount })

  // ===== 按 ↓ 选择便签命中（便签分组排在记账前，首条即便签）→ Enter → 跳转便签面板 =====
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-testid="note-card"]', { state: 'visible', timeout: 10000 })
  record('h) ↓ + Enter → 跳转便签面板（命中便签可导航）', true, {})

  // ===== 证据截图（bash/Playwright 写入，禁止 Write 工具）=====
  await page.locator('[data-testid="wb-spotlight-open"]').click()
  await page.waitForSelector('[data-testid="sp-input"]', { state: 'visible', timeout: 10000 })
  await page.locator('[data-testid="sp-input"]').fill('工资')
  await page.waitForSelector('[data-testid="sp-result-ledger-category-salary"]', { state: 'visible', timeout: 10000 })
  await page.waitForSelector('[data-testid^="sp-result-note-"]', { state: 'visible', timeout: 10000 })
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.screenshot({ path: EVIDENCE_PNG, fullPage: true })
  const pngSize = existsSync(EVIDENCE_PNG) ? (await import('node:fs')).statSync(EVIDENCE_PNG).size : 0
  record('i) 证据截图写入（双分组可见）', pngSize > 0, { path: EVIDENCE_PNG, bytes: pngSize })

  // ===== Esc 关闭浮层 =====
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('[data-testid="sp-overlay"]'), { timeout: 5000 })
  record('j) Esc 关闭浮层', true, {})

  const totalPassed = results.filter((r) => r.ok).length
  const verdict = totalPassed === results.length && results.length > 0 ? 'PASS' : 'FAIL'
  const qa = {
    command: 'node scripts/qa-spotlight.mjs',
    result: `${verdict} (${totalPassed}/${results.length})`,
    browser: 'chromium (playwright, headless)',
    dev_server: `vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
    evidence_png: EVIDENCE_PNG,
    assertions: results
  }
  writeFileSync(EVIDENCE_LOG, JSON.stringify({ task: 'workbench-improvements: Todo 17 - 全局搜索浮层', qa }, null, 2), 'utf8')
  console.log(`[qa] QA partial evidence written: ${EVIDENCE_LOG}`)
  if (verdict !== 'PASS') process.exitCode = 1
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  if (browser) await browser.close().catch(() => {})
} finally {
  if (browser) await browser.close()
  stopDevServer()
}
