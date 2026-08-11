/**
 * QA: 习惯打卡面板（Todo 13 / workbench-improvements）
 *
 * Playwright 方案：后台启动 vite dev（端口 16718，被占用自动上浮）→ 打开 /workbench →
 * 菜单点「习惯打卡」（断言菜单项图标已由 Icon 渲染）→ 断言面板渲染（hb-empty 空态）→
 * 新增习惯（名称/频率/颜色）→ 断言卡片出现 → 打卡 → 断言连续 1 天 + 本周 1/7 → 再点取消 →
 * 断言恢复 0 → 同名再添 → 断言 toast「同名习惯已存在」→
 * 截图存 .omo/evidence/workbench-improvements/task-13-workbench-improvements.png。
 *
 * 运行：node scripts/qa-habits-panel.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'workbench-improvements')
const EVIDENCE_PNG = join(EVIDENCE_DIR, 'task-13-workbench-improvements.png')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'task-13-qa-partial.log')

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

  // ===== 打开工作台 + 菜单点「习惯打卡」 =====
  await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wb-menu-habits"]', { state: 'visible', timeout: 15000 })
  const menuIconCount = await page.locator('[data-testid="wb-menu-habits"] svg').count()
  const menuLabel = (await page.locator('[data-testid="wb-menu-habits"]').textContent()).trim()
  record('a) 菜单项「习惯打卡」存在且图标已渲染（Todo 4 Icon）', menuIconCount === 1 && menuLabel.includes('习惯打卡'), {
    menuIconCount,
    menuLabel
  })
  await page.locator('[data-testid="wb-menu-habits"]').click()

  // ===== 面板渲染（全新 profile → 空态 hb-empty）=====
  await page.waitForSelector('[data-testid="hb-empty"]', { state: 'visible', timeout: 15000 })
  await page.waitForSelector('[data-testid="hb-total-count"]', { state: 'visible', timeout: 15000 })
  const totalText0 = (await page.locator('[data-testid="hb-total-count"]').textContent()).trim()
  const weekText0 = (await page.locator('[data-testid="hb-week-count"]').textContent()).trim()
  record('b) 面板渲染：hb-empty 空态 + 统计卡（习惯 0 / 本周 0/0）', totalText0.startsWith('0') && weekText0.startsWith('0/0'), {
    totalText0,
    weekText0
  })

  // ===== 新增习惯（名称/频率/颜色）=====
  await page.locator('[data-testid="hb-form-name"]').fill('每日喝水')
  await page.locator('[data-testid="hb-form-frequency"]').selectOption('7') // 每天（每周 7 次）
  await page.locator('[data-testid="hb-color-preset-4"]').click() // 绿色
  await page.locator('[data-testid="hb-add-btn"]').click()

  await page.waitForSelector('[data-testid^="hb-card-"]', { state: 'visible', timeout: 15000 })
  const card = page.locator('[data-testid^="hb-card-"]').first()
  const cardTestid = await card.getAttribute('data-testid')
  const habitId = cardTestid.slice('hb-card-'.length)
  const cardName = (await card.textContent()).trim()
  record('c) 新增习惯 → hb-card-<id> 卡片出现（名称/颜色/频率生效）', habitId.startsWith('hb_') && cardName.includes('每日喝水'), {
    cardTestid,
    cardName
  })

  // ===== 打卡：连续 1 天 + 本周 1/7 + 今日 1/1 =====
  await page.locator(`[data-testid="hb-check-${habitId}"]`).click()
  await page.waitForFunction(
    (id) => document.querySelector(`[data-testid="hb-streak-${id}"]`)?.textContent?.includes('连续 1 天'),
    habitId,
    { timeout: 10000, polling: 200 }
  )
  const streak1 = (await page.locator(`[data-testid="hb-streak-${habitId}"]`).textContent()).trim()
  const week1 = (await page.locator(`[data-testid="hb-week-${habitId}"]`).textContent()).trim()
  const today1 = (await page.locator('[data-testid="hb-today-count"]').textContent()).trim()
  record(
    'd) 打卡 → 连续 1 天 + 本周 1/7 + 今日已打卡 1/1',
    streak1.includes('连续 1 天') && week1.includes('1/7') && today1.includes('1/1'),
    { streak1, week1, today1 }
  )

  // ===== 再点取消：幂等取消 → 恢复 0 =====
  await page.locator(`[data-testid="hb-check-${habitId}"]`).click()
  await page.waitForFunction(
    (id) => document.querySelector(`[data-testid="hb-streak-${id}"]`)?.textContent?.includes('连续 0 天'),
    habitId,
    { timeout: 10000, polling: 200 }
  )
  const streak0 = (await page.locator(`[data-testid="hb-streak-${habitId}"]`).textContent()).trim()
  const week0 = (await page.locator(`[data-testid="hb-week-${habitId}"]`).textContent()).trim()
  const today0 = (await page.locator('[data-testid="hb-today-count"]').textContent()).trim()
  record(
    'e) 再点取消（幂等）→ 连续 0 天 + 本周 0/7 + 今日 0/1',
    streak0.includes('连续 0 天') && week0.includes('0/7') && today0.includes('0/1'),
    { streak0, week0, today0 }
  )

  // ===== 恢复打卡（截图好看）+ 同名再添 → toast「同名习惯已存在」 =====
  await page.locator(`[data-testid="hb-check-${habitId}"]`).click()
  await page.waitForFunction(
    (id) => document.querySelector(`[data-testid="hb-streak-${id}"]`)?.textContent?.includes('连续 1 天'),
    habitId,
    { timeout: 10000, polling: 200 }
  )
  await page.locator('[data-testid="hb-form-name"]').fill('每日喝水')
  await page.locator('[data-testid="hb-add-btn"]').click()
  await page.waitForSelector('.toast-message', { state: 'visible', timeout: 10000 })
  await page.waitForTimeout(200)
  const toastText = (await page.locator('.toast-message').first().textContent()).trim()
  record('f) 同名再添 → toast「同名习惯已存在」', toastText.includes('同名习惯已存在'), { toastText })

  // ===== 证据截图（bash/Playwright 写入，禁止 Write 工具）=====
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.screenshot({ path: EVIDENCE_PNG, fullPage: true })
  const pngSize = existsSync(EVIDENCE_PNG) ? (await import('node:fs')).statSync(EVIDENCE_PNG).size : 0
  record('g) 证据截图写入', pngSize > 0, { path: EVIDENCE_PNG, bytes: pngSize })

  const totalPassed = results.filter((r) => r.ok).length
  const verdict = totalPassed === results.length && results.length > 0 ? 'PASS' : 'FAIL'
  const qa = {
    command: 'node scripts/qa-habits-panel.mjs',
    result: `${verdict} (${totalPassed}/${results.length})`,
    browser: 'chromium (playwright, headless)',
    dev_server: `vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
    evidence_png: EVIDENCE_PNG,
    assertions: results
  }
  writeFileSync(EVIDENCE_LOG, JSON.stringify({ task: 'workbench-improvements: Todo 13 - 习惯打卡面板', qa }, null, 2), 'utf8')
  console.log(`[qa] QA partial evidence written: ${EVIDENCE_LOG}`)
  if (verdict !== 'PASS') process.exitCode = 1
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  if (browser) await browser.close().catch(() => {})
} finally {
  if (browser) await browser.close()
  stopDevServer()
}
