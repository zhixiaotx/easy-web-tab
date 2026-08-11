/**
 * QA: 番茄钟面板（Todo 12 / workbench-improvements）
 *
 * Playwright 方案：后台启动 vite dev（端口 16718，被占用自动上浮）→ 打开 /workbench →
 * 菜单点「番茄钟」（断言菜单项图标已由 Icon 渲染）→ 断言面板渲染（pm-timer-ring/pm-today-count 存在）→
 * 设置专注 1 分钟 → 启动 → 断言计时推进（剩余时间递减）→ 等待会话完成（阶段切「短休」）→
 * 断言今日统计 +1 → 截图存 .omo/evidence/workbench-improvements/task-12-workbench-improvements.png。
 *
 * 运行：node scripts/qa-pomodoro-panel.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'workbench-improvements')
const EVIDENCE_PNG = join(EVIDENCE_DIR, 'task-12-workbench-improvements.png')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'task-12-qa-partial.log')

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

  // ===== 打开工作台 + 菜单点「番茄钟」 =====
  await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wb-menu-pomodoro"]', { state: 'visible', timeout: 15000 })
  const menuIconCount = await page.locator('[data-testid="wb-menu-pomodoro"] svg').count()
  record('a) 菜单项「番茄钟」存在且图标已渲染（Todo 4 Icon）', menuIconCount === 1, { menuIconCount })
  await page.locator('[data-testid="wb-menu-pomodoro"]').click()

  // ===== 面板渲染 =====
  await page.waitForSelector('[data-testid="pm-timer-ring"]', { state: 'visible', timeout: 15000 })
  await page.waitForSelector('[data-testid="pm-today-count"]', { state: 'visible', timeout: 15000 })
  const todayText0 = (await page.locator('[data-testid="pm-today-count"]').textContent()).trim()
  record('b) 面板渲染：pm-timer-ring / pm-today-count 存在，今日完成 0', todayText0.includes('今日完成 0'), { todayText0 })

  // ===== 设置专注 1 分钟（走 UI 输入 + blur 触发 change → store.updateSettings）=====
  await page.locator('[data-testid="pm-settings-work"]').fill('1')
  await page.locator('[data-testid="pm-settings-work"]').blur()
  await page.waitForTimeout(400)
  const remainingText0 = (await page.locator('[data-testid="pm-remaining"]').textContent()).trim()
  record('c) 设置专注 1 分钟生效（空闲整段重算 → 01:00）', remainingText0 === '01:00', { remainingText0 })

  // ===== 启动 → 计时推进 =====
  await page.locator('[data-testid="pm-start"]').click()
  const t1 = (await page.locator('[data-testid="pm-remaining"]').textContent()).trim()
  await page.waitForTimeout(2100)
  const t2 = (await page.locator('[data-testid="pm-remaining"]').textContent()).trim()
  record('d) 启动后计时推进（剩余时间递减）', t1 !== t2 && t2 < t1, { t1, t2 })

  // ===== 等待会话完成（1 分钟专注 → 切「短休」），轮询最多 90s =====
  await page.waitForFunction(
    () => document.querySelector('[data-testid="pm-phase"]')?.textContent?.trim() === '短休',
    undefined,
    { timeout: 90000, polling: 1000 }
  )
  const phaseAfter = (await page.locator('[data-testid="pm-phase"]').textContent()).trim()
  const todayText1 = (await page.locator('[data-testid="pm-today-count"]').textContent()).trim()
  record('e) 会话完成 → 阶段切「短休」，今日统计 +1', phaseAfter === '短休' && todayText1.includes('今日完成 1'), {
    phaseAfter,
    todayText1
  })

  // ===== 证据截图（bash/Playwright 写入，禁止 Write 工具）=====
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.screenshot({ path: EVIDENCE_PNG, fullPage: true })
  const pngSize = existsSync(EVIDENCE_PNG) ? (await import('node:fs')).statSync(EVIDENCE_PNG).size : 0
  record('f) 证据截图写入', pngSize > 0, { path: EVIDENCE_PNG, bytes: pngSize })

  const totalPassed = results.filter((r) => r.ok).length
  const verdict = totalPassed === results.length && results.length > 0 ? 'PASS' : 'FAIL'
  const qa = {
    command: 'node scripts/qa-pomodoro-panel.mjs',
    result: `${verdict} (${totalPassed}/${results.length})`,
    browser: 'chromium (playwright, headless)',
    dev_server: `vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
    evidence_png: EVIDENCE_PNG,
    assertions: results
  }
  writeFileSync(EVIDENCE_LOG, JSON.stringify({ task: 'workbench-improvements: Todo 12 - 番茄钟面板', qa }, null, 2), 'utf8')
  console.log(`[qa] QA partial evidence written: ${EVIDENCE_LOG}`)
  if (verdict !== 'PASS') process.exitCode = 1
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  if (browser) await browser.close().catch(() => {})
} finally {
  if (browser) await browser.close()
  stopDevServer()
}
