/**
 * QA: 工作台头部改造（workbench-header）
 *
 * Playwright 方案：后台启动 vite dev（端口 16718，被占用自动上浮）→ 打开 /workbench →
 * 断言三项改造行为在真实界面上成立：
 *   a) 右上角时钟已移除（无 wb-clock 元素）
 *   b) 「全局搜索」触发按钮已从侧栏底部迁移至头部右侧（wb-header-right 内唯一、文本含「全局搜索」、侧栏 wb-menu 内无残留）
 *   c) 头部全局搜索仍可用：点击 → sp-overlay 浮层打开 → Esc → 浮层关闭
 *   d) 头部新增「⚙️ 设置」按钮可打开 AppSettingsDialog（.manager-overlay 根容器）→ 点击遮罩自闭合关闭
 *   e) 证据截图存 .omo/evidence/workbench-header/（wb-header.png + wb-fullpage-light.png + JSON 证据日志）
 *
 * 说明：本脚本与 qa-ledger-charts.mjs 同为 dev-server UI QA，不能同时占端口，由编排器单独执行。
 *
 * 运行：node scripts/qa-workbench-header.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'workbench-header')
const EVIDENCE_HEADER_PNG = join(EVIDENCE_DIR, 'wb-header.png')
const EVIDENCE_FULL_LIGHT_PNG = join(EVIDENCE_DIR, 'wb-fullpage-light.png')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'qa-workbench-header.log')

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

  // ===== 打开工作台，等待头部「全局搜索」按钮就绪 =====
  await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wb-spotlight-open"]', { state: 'visible', timeout: 15000 })

  // ===== a) 右上角时钟已移除 =====
  const clockCount = await page.locator('[data-testid="wb-clock"]').count()
  record('a) 右上角时钟已移除（无 wb-clock 元素）', clockCount === 0, { clockCount })

  // ===== b) 全局搜索触发按钮已迁移至头部 =====
  const spotCount = await page.locator('[data-testid="wb-spotlight-open"]').count()
  const spotText = (await page.locator('[data-testid="wb-spotlight-open"]').textContent()).trim()
  const spotInHeader = await page.locator('.wb-header-right [data-testid="wb-spotlight-open"]').count()
  const spotInSidebar = await page.locator('.wb-menu [data-testid="wb-spotlight-open"]').count()
  record(
    'b) 「全局搜索」已迁移至头部右侧（文本含「全局搜索」、头部唯一、侧栏无残留）',
    spotCount === 1 && spotInHeader === 1 && spotInSidebar === 0 && spotText.includes('全局搜索'),
    { spotCount, spotText, spotInHeader, spotInSidebar }
  )

  // ===== c) 头部全局搜索仍可用：点击 → 浮层打开 → Esc → 关闭 =====
  await page.locator('.wb-header-right [data-testid="wb-spotlight-open"]').click()
  await page.waitForSelector('[data-testid="sp-overlay"]', { state: 'visible', timeout: 10000 })
  const overlayOpened = (await page.locator('[data-testid="sp-overlay"]').count()) === 1
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('[data-testid="sp-overlay"]'), { timeout: 5000 })
  const overlayClosed = (await page.locator('[data-testid="sp-overlay"]').count()) === 0
  record('c) 头部全局搜索可用（点击打开 → Esc 关闭）', overlayOpened && overlayClosed, { overlayOpened, overlayClosed })

  // ===== d) 头部「⚙️ 设置」按钮打开 AppSettingsDialog（.manager-overlay 根容器）=====
  const settingsBtn = page.locator('.wb-header-right button', { hasText: '设置' })
  const settingsBtnCount = await settingsBtn.count()
  if (settingsBtnCount === 1) {
    await settingsBtn.click()
    await page.waitForSelector('.manager-overlay', { state: 'visible', timeout: 10000 })
    const dialogOpened = (await page.locator('.manager-overlay').count()) === 1
    // @click.self="emit('close')"：点击遮罩自闭合区域（非弹框）关闭
    await page.locator('.manager-overlay').click({ position: { x: 5, y: 5 } })
    await page.waitForFunction(() => !document.querySelector('.manager-overlay'), { timeout: 5000 })
    const dialogClosed = (await page.locator('.manager-overlay').count()) === 0
    record('d) 头部「设置」按钮打开 AppSettingsDialog 且点遮罩自闭合关闭', settingsBtnCount === 1 && dialogOpened && dialogClosed, { settingsBtnCount, dialogOpened, dialogClosed })
  } else {
    record('d) 头部「设置」按钮打开 AppSettingsDialog 且点遮罩自闭合关闭', false, { settingsBtnCount })
  }

  // ===== e) 证据截图（bash/Playwright 写入，禁止 Write 工具）=====
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.locator('.wb-header').screenshot({ path: EVIDENCE_HEADER_PNG })
  await page.screenshot({ path: EVIDENCE_FULL_LIGHT_PNG, fullPage: true })
  const headerPngSize = existsSync(EVIDENCE_HEADER_PNG) ? statSync(EVIDENCE_HEADER_PNG).size : 0
  const fullPngSize = existsSync(EVIDENCE_FULL_LIGHT_PNG) ? statSync(EVIDENCE_FULL_LIGHT_PNG).size : 0
  record('e) 证据截图写入（头部 + 全页浅色，均非空字节）', headerPngSize > 0 && fullPngSize > 0, { headerPng: EVIDENCE_HEADER_PNG, headerBytes: headerPngSize, fullPng: EVIDENCE_FULL_LIGHT_PNG, fullBytes: fullPngSize })

  const totalPassed = results.filter((r) => r.ok).length
  const verdict = totalPassed === results.length && results.length > 0 ? 'PASS' : 'FAIL'
  const qa = {
    command: 'node scripts/qa-workbench-header.mjs',
    result: `${verdict} (${totalPassed}/${results.length})`,
    browser: 'chromium (playwright, headless)',
    dev_server: `vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
    evidence_header_png: EVIDENCE_HEADER_PNG,
    evidence_full_light_png: EVIDENCE_FULL_LIGHT_PNG,
    assertions: results
  }
  writeFileSync(EVIDENCE_LOG, JSON.stringify({ task: 'workbench-header: 时钟移除 / 全局搜索迁移至头部 / 设置按钮打开 AppSettingsDialog', qa }, null, 2), 'utf8')
  console.log(`[qa] QA partial evidence written: ${EVIDENCE_LOG}`)
  if (verdict !== 'PASS') process.exitCode = 1
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  if (browser) await browser.close().catch(() => {})
} finally {
  if (browser) await browser.close()
  stopDevServer()
}
