/**
 * QA: 工作台侧栏折叠（Todo 18 / workbench-improvements）
 *
 * Playwright 方案：后台启动 vite dev（端口 16718，被占用自动上浮）→ 打开 /workbench →
 * 断言折叠按钮存在（wb-sidebar-toggle）→ 点击收起 → 断言 wb-menu.collapsed 且宽度 56px →
 * 刷新页面 → 断言折叠态持久化（settingsStore → IDB store 'settings'）→
 * 再次点击展开 → 断言宽度恢复 200px → 刷新页面 → 断言展开态持久化 →
 * 截图存 .omo/evidence/workbench-improvements/task-18-workbench-improvements.png。
 *
 * 运行：node scripts/qa-sidebar.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'workbench-improvements')
const EVIDENCE_PNG = join(EVIDENCE_DIR, 'task-18-workbench-improvements.png')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'task-18-qa-partial.log')

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

/** 读取 wb-menu 当前宽度（px 数字）。 */
async function menuWidth(page) {
  return await page.evaluate(() => {
    const el = document.querySelector('.wb-menu')
    return el ? Math.round(el.getBoundingClientRect().width) : -1
  })
}

let browser
try {
  await ensureDevServer()
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  // ===== 打开工作台 + 断言折叠按钮存在（未折叠：200px）=====
  await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wb-sidebar-toggle"]', { state: 'visible', timeout: 15000 })
  await page.waitForSelector('[data-testid="wb-menu-home"]', { state: 'visible', timeout: 10000 })
  const widthInitial = await menuWidth(page)
  record('a) 折叠按钮存在，初始未折叠（菜单 200px）', widthInitial === 200, { widthInitial })

  // ===== 点击折叠按钮 → wb-menu.collapsed 且宽度 56px =====
  await page.locator('[data-testid="wb-sidebar-toggle"]').click()
  await page.waitForFunction(() => document.querySelector('.wb-menu')?.classList.contains('collapsed'), {
    timeout: 5000
  })
  await page.waitForTimeout(300) // 等 width 过渡完成
  const widthCollapsed = await menuWidth(page)
  const labelHidden = await page.evaluate(() => {
    const label = document.querySelector('.wb-menu-label')
    if (!label) return false
    const style = getComputedStyle(label)
    return style.display === 'none'
  })
  record('b) 点击折叠 → collapsed 生效（56px + label 隐藏）', widthCollapsed === 56 && labelHidden, {
    widthCollapsed,
    labelHidden
  })

  // ===== 刷新页面 → 折叠态持久化（IDB settings）=====
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wb-sidebar-toggle"]', { state: 'visible', timeout: 15000 })
  await page.waitForTimeout(300)
  const widthAfterReload = await menuWidth(page)
  record('c) 刷新后折叠态持久化（仍 56px）', widthAfterReload === 56, { widthAfterReload })

  // ===== 再次点击展开 → 200px =====
  await page.locator('[data-testid="wb-sidebar-toggle"]').click()
  await page.waitForFunction(() => !document.querySelector('.wb-menu')?.classList.contains('collapsed'), {
    timeout: 5000
  })
  await page.waitForTimeout(300)
  const widthExpanded = await menuWidth(page)
  record('d) 再次点击展开 → 恢复 200px', widthExpanded === 200, { widthExpanded })

  // ===== 刷新页面 → 展开态持久化 =====
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wb-sidebar-toggle"]', { state: 'visible', timeout: 15000 })
  await page.waitForTimeout(300)
  const widthExpandedAfterReload = await menuWidth(page)
  record('e) 刷新后展开态持久化（仍 200px）', widthExpandedAfterReload === 200, { widthExpandedAfterReload })

  // ===== 证据截图（折叠态）=====
  await page.locator('[data-testid="wb-sidebar-toggle"]').click()
  await page.waitForFunction(() => document.querySelector('.wb-menu')?.classList.contains('collapsed'), {
    timeout: 5000
  })
  await page.waitForTimeout(300)
  await page.locator('[data-testid="wb-menu-home"]').click()
  await page.waitForSelector('[data-testid="wb-home-weather"]', { state: 'visible', timeout: 10000 }).catch(() => {})
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.screenshot({ path: EVIDENCE_PNG, fullPage: true })
  const pngSize = existsSync(EVIDENCE_PNG) ? (await import('node:fs')).statSync(EVIDENCE_PNG).size : 0
  record('f) 证据截图写入（折叠态可见）', pngSize > 0, { path: EVIDENCE_PNG, bytes: pngSize })

  const totalPassed = results.filter((r) => r.ok).length
  const verdict = totalPassed === results.length && results.length > 0 ? 'PASS' : 'FAIL'
  const qa = {
    command: 'node scripts/qa-sidebar.mjs',
    result: `${verdict} (${totalPassed}/${results.length})`,
    browser: 'chromium (playwright, headless)',
    dev_server: `vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
    evidence_png: EVIDENCE_PNG,
    assertions: results
  }
  writeFileSync(EVIDENCE_LOG, JSON.stringify({ task: 'workbench-improvements: Todo 18 - 侧栏折叠', qa }, null, 2), 'utf8')
  console.log(`[qa] QA partial evidence written: ${EVIDENCE_LOG}`)
  if (verdict !== 'PASS') process.exitCode = 1
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  if (browser) await browser.close().catch(() => {})
} finally {
  if (browser) await browser.close()
  stopDevServer()
}
