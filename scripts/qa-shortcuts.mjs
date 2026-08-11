/**
 * QA: 工作台快捷键（Todo 20 / workbench-improvements）
 *
 * Playwright 方案：后台启动 vite dev（端口 16718，被占用自动上浮）→ 打开 /workbench →
 * Ctrl+Alt+3 → 便签面板（note-add-button 可见）→ Ctrl+Alt+1 → 主页（bento-card 可见）→
 * Alt+K → 全局搜索浮层打开（sp-overlay/sp-input）→ Esc → 浮层关闭 →
 * 焦点在便签搜索输入框内按 Alt+K → 浮层不打开（skip-input）→
 * Ctrl+Alt+8 → 健康管理面板（hd-tabs 可见）→ Ctrl+Alt+9 → 记账面板（ld-add 可见）→
 * 截图存 .omo/evidence/workbench-improvements/task-20-workbench-improvements.png。
 *
 * 运行：node scripts/qa-shortcuts.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'workbench-improvements')
const EVIDENCE_PNG = join(EVIDENCE_DIR, 'task-20-workbench-improvements.png')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'task-20-qa-partial.log')

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

  // ===== 打开工作台 =====
  await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wb-menu-home"]', { state: 'visible', timeout: 15000 })
  await page.waitForSelector('.bento-card', { state: 'visible', timeout: 10000 })

  // ===== Ctrl+Alt+3 → 便签面板 =====
  await page.keyboard.press('Control+Alt+3')
  await page.waitForSelector('[data-testid="note-add-button"]', { state: 'visible', timeout: 10000 })
  record('a) Ctrl+Alt+3 → 便签面板', true, {})

  // ===== Ctrl+Alt+1 → 主页 =====
  await page.keyboard.press('Control+Alt+1')
  await page.waitForSelector('.bento-card', { state: 'visible', timeout: 10000 })
  record('b) Ctrl+Alt+1 → 主页', true, {})

  // ===== Alt+K → 全局搜索浮层打开 =====
  await page.keyboard.press('Alt+k')
  await page.waitForSelector('[data-testid="sp-overlay"]', { state: 'visible', timeout: 10000 })
  await page.waitForSelector('[data-testid="sp-input"]', { state: 'visible', timeout: 10000 })
  record('c) Alt+K → 全局搜索浮层打开', true, {})

  // ===== Esc → 浮层关闭 =====
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('[data-testid="sp-overlay"]'), { timeout: 5000 })
  record('d) Esc → 浮层关闭', true, {})

  // ===== 焦点在便签搜索输入框内按 Alt+K → 浮层不打开（skip-input）=====
  await page.locator('[data-testid="wb-menu-notes"]').click()
  await page.waitForSelector('[data-testid="nt-search-input"]', { state: 'visible', timeout: 10000 })
  await page.locator('[data-testid="nt-search-input"]').focus()
  await page.keyboard.press('Alt+k')
  await page.waitForTimeout(400)
  const overlayCountInInput = await page.locator('[data-testid="sp-overlay"]').count()
  record('e) 输入框内 Alt+K 不打开浮层（skip-input）', overlayCountInInput === 0, { overlayCountInInput })

  // ===== Ctrl+Alt+8 → 健康管理面板（菜单 index 7 = health）=====
  await page.keyboard.press('Control+Alt+8')
  await page.waitForSelector('[data-testid="hd-tabs"]', { state: 'visible', timeout: 10000 })
  record('f) Ctrl+Alt+8 → 健康管理面板', true, {})

  // ===== Ctrl+Alt+9 → 记账面板（菜单 index 8 = ledger）=====
  await page.keyboard.press('Control+Alt+9')
  await page.waitForSelector('[data-testid="ld-add"]', { state: 'visible', timeout: 10000 })
  record('g) Ctrl+Alt+9 → 记账面板', true, {})

  // ===== 证据截图（Alt+K 浮层打开态）=====
  await page.keyboard.press('Alt+k')
  await page.waitForSelector('[data-testid="sp-input"]', { state: 'visible', timeout: 10000 })
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.screenshot({ path: EVIDENCE_PNG, fullPage: true })
  const pngSize = existsSync(EVIDENCE_PNG) ? (await import('node:fs')).statSync(EVIDENCE_PNG).size : 0
  record('h) 证据截图写入（Alt+K 浮层打开）', pngSize > 0, { path: EVIDENCE_PNG, bytes: pngSize })

  const totalPassed = results.filter((r) => r.ok).length
  const verdict = totalPassed === results.length && results.length > 0 ? 'PASS' : 'FAIL'
  const qa = {
    command: 'node scripts/qa-shortcuts.mjs',
    result: `${verdict} (${totalPassed}/${results.length})`,
    browser: 'chromium (playwright, headless)',
    dev_server: `vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
    evidence_png: EVIDENCE_PNG,
    assertions: results
  }
  writeFileSync(EVIDENCE_LOG, JSON.stringify({ task: 'workbench-improvements: Todo 20 - 工作台快捷键', qa }, null, 2), 'utf8')
  console.log(`[qa] QA partial evidence written: ${EVIDENCE_LOG}`)
  if (verdict !== 'PASS') process.exitCode = 1
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  if (browser) await browser.close().catch(() => {})
} finally {
  if (browser) await browser.close()
  stopDevServer()
}
