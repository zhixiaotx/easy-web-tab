/**
 * QA: 工作台主页布局重构（workbench-home）— TDD RED 脚本
 * 后台启动/复用 vite dev（16718-16726）→ /workbench（主页=菜单 index 0 直达）→ S1-S8：
 *  S1 fresh profile：home-greeting 可见 + home-overview-toggle 不存在（9 卡全空 → 概览区不渲染）
 *  S2 播种 1 待办 → toggle 存在且默认折叠（home-stats-todos count 0）
 *  S3 点击 toggle → 卡片可见 + localStorage user-home-overview-collapsed='0' → reload 后仍展开
 *  S4 面板（home-todo-list + home-upcoming-empty，R6）y < home-overview y
 *  S5 折叠态作用域（R8 反证）：toggle 含「概览」/📊 + chevron 可见 + home-nav-todos 在概览区外（区内 count 0）
 *  S6 视觉瘦身（R7 不断言 ledger sub）：.stat-value 20px / .bento-stat padding 12px 14px / .nav-btn 12px
 *  S7 移动端 375×812：scrollWidth ≤ 375 + toggle 可见
 *  S8 明/暗全页截图（证据恒 PASS）→ .omo/evidence/workbench-home/
 * 目标功能（home-overview* 折叠区）未实现 = TDD RED，S2-S7 预期 FAIL；与其它 QA 脚本禁止并行（同端口域）。
 * 运行：node scripts/qa-workbench-home.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'workbench-home')
const EVIDENCE_LIGHT_PNG = join(EVIDENCE_DIR, 'workbench-home-light.png')
const EVIDENCE_DARK_PNG = join(EVIDENCE_DIR, 'workbench-home-dark.png')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'qa-workbench-home.log')

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

/** 单场景守卫：异常 → 记 FAIL 不中断后续（RED 下新元素缺失属预期）。 */
async function guard(name, fn) {
  try {
    await fn()
  } catch (err) {
    record(name, false, { error: err.message })
  }
}
/** 确保概览展开/折叠（wantExpanded）：toggle 存在时按需点击。新元素缺失时静默跳过，不抛错。 */
async function ensureState(page, wantExpanded) {
  const toggle = page.locator('[data-testid="home-overview-toggle"]')
  const stats = page.locator('[data-testid="home-stats-todos"]')
  const statsCount = await stats.count()
  if ((await toggle.count()) === 1 && (wantExpanded ? statsCount === 0 : statsCount > 0)) {
    await toggle.click()
    if (wantExpanded) await page.waitForSelector('[data-testid="home-stats-todos"]', { state: 'visible', timeout: 5000 }).catch(() => {})
    else await page.waitForFunction(() => !document.querySelector('[data-testid="home-stats-todos"]'), { timeout: 5000 }).catch(() => {})
  }
}

let browser
try {
  await ensureDevServer()
  console.log('--- RED/GREEN marker --- 本运行针对当前代码（home-overview* 未实现）：S1 预期 PASS，S2-S7 预期 FAIL（TDD RED），实现后 GREEN 8/8 ---')
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="home-greeting"]', { state: 'visible', timeout: 15000 })
  const greetingVisible = await page.locator('[data-testid="home-greeting"]').isVisible()
  const s1Toggle = await page.locator('[data-testid="home-overview-toggle"]').count()
  record('S1) 全新 profile：home-greeting 可见 + home-overview-toggle 不存在（9 卡全空 → 概览区不渲染）', greetingVisible && s1Toggle === 0, { greetingVisible, toggleCount: s1Toggle })
  await guard('S2) 播种 1 待办后：home-overview-toggle 存在 + 默认折叠（home-stats-todos count 0）', async () => {
    await page.locator('[data-testid="home-quick-add-input"]').fill('qa-seed-todo')
    await page.locator('[data-testid="home-quick-add-btn"]').click()
    await page.waitForSelector('[data-testid="home-todo-list"]', { state: 'visible', timeout: 5000 })
    await page.waitForTimeout(400)
    const toggleCount = await page.locator('[data-testid="home-overview-toggle"]').count()
    const statsCount = await page.locator('[data-testid="home-stats-todos"]').count()
    record('S2) 播种 1 待办后：home-overview-toggle 存在 + 默认折叠（home-stats-todos count 0）', toggleCount === 1 && statsCount === 0, { toggleCount, statsCount })
  })
  await guard('S3) 展开 + 持久化（点击 toggle → 卡片可见 + localStorage="0" → reload 后仍展开）', async () => {
    const toggle = page.locator('[data-testid="home-overview-toggle"]')
    if ((await toggle.count()) === 1) {
      await toggle.click()
      await page.waitForSelector('[data-testid="home-stats-todos"]', { state: 'visible', timeout: 5000 }).catch(() => {})
    }
    const statsVisible = (await page.locator('[data-testid="home-stats-todos"]').count()) === 1
    const ls = await page.evaluate(() => localStorage.getItem('user-home-overview-collapsed'))
    if (statsVisible) {
      await page.waitForTimeout(600)
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForSelector('[data-testid="home-greeting"]', { state: 'visible', timeout: 15000 })
      await page.waitForSelector('[data-testid="home-stats-todos"]', { state: 'visible', timeout: 5000 }).catch(() => {})
    }
    const persistedVisible = (await page.locator('[data-testid="home-stats-todos"]').count()) === 1
    record('S3) 展开 + 持久化（点击 toggle → 卡片可见 + localStorage="0" → reload 后仍展开）', statsVisible && ls === '0' && persistedVisible, { statsVisible, localStorage: ls, persistedVisible })
  })

  await guard('S4) 顺序：两面板 y < home-overview y（面板上移到概览之上）', async () => {
    await ensureState(page, true)
    const boxes = await page.evaluate(() => {
      const yOf = (tid) => { const el = document.querySelector(`[data-testid="${tid}"]`); return el ? el.getBoundingClientRect().y : null }
      return { todoList: yOf('home-todo-list'), todoEmpty: yOf('home-todo-empty'), upcomingList: yOf('home-upcoming-list'), upcomingEmpty: yOf('home-upcoming-empty'), overview: yOf('home-overview') }
    })
    const panelTodoY = boxes.todoList ?? boxes.todoEmpty
    const panelUpcomingY = boxes.upcomingList ?? boxes.upcomingEmpty
    const ok = panelTodoY !== null && panelUpcomingY !== null && boxes.overview !== null && panelTodoY < boxes.overview && panelUpcomingY < boxes.overview
    record('S4) 顺序：两面板 y < home-overview y（面板上移到概览之上）', ok, { ...boxes, panelTodoY, panelUpcomingY })
  })
  await guard('S5) 作用域：toggle 含「概览」/📊 + chevron 可见 + home-nav-todos 位于 home-overview 之外（区内 count 0）', async () => {
    await ensureState(page, false)
    const toggle = page.locator('[data-testid="home-overview-toggle"]')
    const toggleCount = await toggle.count()
    const toggleText = toggleCount === 1 ? ((await toggle.textContent()) ?? '') : ''
    const toggleHasTitle = toggleText.includes('概览') || toggleText.includes('📊')
    const chevronVisible = await page.locator('[data-testid="home-overview-chevron"]').isVisible()
    const navGlobal = await page.locator('[data-testid="home-nav-todos"]').count()
    const navInside = await page.locator('[data-testid="home-overview"] [data-testid="home-nav-todos"]').count()
    record('S5) 作用域：toggle 含「概览」/📊 + chevron 可见 + home-nav-todos 位于 home-overview 之外（区内 count 0）', toggleCount === 1 && toggleHasTitle && chevronVisible && navGlobal >= 1 && navInside === 0, { toggleText, chevronVisible, navGlobal, navInside })
  })

  await guard('S6) 视觉瘦身（展开态，仅可见卡）：.stat-value 20px / .bento-stat padding 12px 14px / .nav-btn 12px', async () => {
    await ensureState(page, true)
    const statValueCount = await page.locator('[data-testid="home-stats-todos"] .stat-value').count()
    const statFont = statValueCount ? await page.locator('[data-testid="home-stats-todos"] .stat-value').evaluate((el) => getComputedStyle(el).fontSize) : null
    const bsCount = await page.locator('[data-testid="home-overview"] .bento-stat').count()
    const pad = bsCount ? await page.locator('[data-testid="home-overview"] .bento-stat').first().evaluate((el) => { const c = getComputedStyle(el); return { top: c.paddingTop, bottom: c.paddingBottom, left: c.paddingLeft, right: c.paddingRight } }) : null
    const navCount = await page.locator('[data-testid="home-nav-todos"].nav-btn').count()
    const navFont = navCount ? await page.locator('[data-testid="home-nav-todos"].nav-btn').first().evaluate((el) => getComputedStyle(el).fontSize) : null
    const padOk = !!pad && pad.top === '12px' && pad.bottom === '12px' && pad.left === '14px' && pad.right === '14px'
    record('S6) 视觉瘦身（展开态，仅可见卡）：.stat-value 20px / .bento-stat padding 12px 14px / .nav-btn 12px', statFont === '20px' && padOk && navFont === '12px', { statFont, pad, navFont })
  })

  await guard('S7) 移动端 375×812：scrollWidth ≤ 375（无横向滚动）+ toggle 可见', async () => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="home-greeting"]', { state: 'visible', timeout: 15000 })
    await ensureState(page, true)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const toggleVisible = await page.locator('[data-testid="home-overview-toggle"]').isVisible()
    record('S7) 移动端 375×812：scrollWidth ≤ 375（无横向滚动）+ toggle 可见', scrollWidth <= 375 && toggleVisible, { scrollWidth, toggleVisible, viewport: '375x812' })
  })

  await page.setViewportSize({ width: 1280, height: 800 })
  await ensureState(page, true)
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.screenshot({ path: EVIDENCE_LIGHT_PNG, fullPage: true })
  const lightSize = existsSync(EVIDENCE_LIGHT_PNG) ? statSync(EVIDENCE_LIGHT_PNG).size : 0
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(200)
  await page.screenshot({ path: EVIDENCE_DARK_PNG, fullPage: true })
  const darkSize = existsSync(EVIDENCE_DARK_PNG) ? statSync(EVIDENCE_DARK_PNG).size : 0
  record('S8) 明/暗全页截图写入（证据，恒 PASS）', true, { light: { path: EVIDENCE_LIGHT_PNG, bytes: lightSize }, dark: { path: EVIDENCE_DARK_PNG, bytes: darkSize } })

  const totalPassed = results.filter((r) => r.ok).length
  const verdict = totalPassed === results.length && results.length > 0 ? 'PASS' : 'FAIL'
  const qa = {
    command: 'node scripts/qa-workbench-home.mjs',
    result: `${verdict} (${totalPassed}/${results.length})`,
    browser: 'chromium (playwright, headless)',
    dev_server: `vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
    evidence_light_png: EVIDENCE_LIGHT_PNG,
    evidence_dark_png: EVIDENCE_DARK_PNG,
    assertions: results
  }
  writeFileSync(EVIDENCE_LOG, JSON.stringify({ task: 'workbench-home: 概览折叠区布局重构回归（S1-S8）', qa }, null, 2), 'utf8')
  console.log(`[qa] QA evidence log written: ${EVIDENCE_LOG}`)
  if (verdict !== 'PASS') process.exitCode = 1
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  if (browser) await browser.close().catch(() => {})
} finally {
  if (browser) await browser.close()
  stopDevServer()
}
