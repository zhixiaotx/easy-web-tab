/**
 * QA: 工作台主页轮播布局（workbench-home-carousel）契约 S1-S7
 * 后台启动/复用 vite dev（16718-16726）→ /workbench（主页=菜单 index 0 直达）：
 *  S1 fresh profile：home-greeting 可见 + 轮播骨架（3 圆点/箭头/3 屏）+ 概览空态（无统计卡）
 *  S2 播种待办（切到工具屏快捷添加）→ 行动屏 home-todo-list + 概览屏 home-stats-todos 均出现
 *  S3 手动切换：next 箭头 → 圆点 1 active + track transform translateX(-100%)；dot 2 → 工具屏
 *  S4 自动轮播：鼠标移出轮播区后 ~6.5s → 活动圆点推进
 *  S5 菜单开关联动：设置 → 工作台设置 → 关闭「工作待办」→ 左菜单项消失 + 主页快捷添加/待办面板/待办统计卡消失；重新开启恢复
 *  S6 移动端 375×812：scrollWidth ≤ 375 + 轮播骨架可见
 *  S7 明/暗全页截图（证据恒 PASS）→ .omo/evidence/workbench-home/
 * 与其它 QA 脚本禁止并行（同端口域）。运行：node scripts/qa-workbench-home.mjs
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
    const res = await fetch('http://localhost:' + port + '/src/composables/useIdb.ts')
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
    const res = await fetch('http://localhost:' + port + '/', { signal: AbortSignal.timeout(1500) })
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
      devBase = 'http://localhost:' + p
      console.log('[dev] reuse running vite dev server at ' + devBase)
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
    server.stdout.on('data', (d) => process.stdout.write('[vite] ' + d))
    server.stderr.on('data', (d) => process.stdout.write('[vite] ' + d))
    const ok = await waitForServer('http://localhost:' + p)
    if (ok && (await isViteDevAt(p))) {
      devBase = 'http://localhost:' + p
      console.log('[dev] dev server ready at ' + devBase)
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
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  ' + JSON.stringify(detail))
}

/** 单场景守卫：异常 → 记 FAIL 不中断后续。 */
async function guard(name, fn) {
  try {
    await fn()
  } catch (err) {
    record(name, false, { error: err.message })
  }
}

let browser
try {
  await ensureDevServer()
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  await page.goto(devBase + '/workbench', { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="home-greeting"]', { state: 'visible', timeout: 15000 })

  await guard('S1) 轮播骨架：问候条 + 3 圆点/双箭头/3 屏 + 概览空态', async () => {
    const greeting = await page.locator('[data-testid="home-greeting"]').isVisible()
    const carousel = (await page.locator('[data-testid="home-carousel"]').count()) === 1
    const dots = await page.locator('[data-testid^="home-carousel-dot-"]').count()
    const prev = (await page.locator('[data-testid="home-carousel-prev"]').count()) === 1
    const next = (await page.locator('[data-testid="home-carousel-next"]').count()) === 1
    const slides = await page.locator('[data-testid^="home-slide-"]').count()
    const overviewEmpty = (await page.locator('[data-testid="home-overview-empty"]').count()) === 1
    const dot0Active = await page.locator('[data-testid="home-carousel-dot-0"]').evaluate((el) => el.classList.contains('active'))
    record(
      'S1) 轮播骨架：问候条 + 3 圆点/双箭头/3 屏 + 概览空态（fresh）',
      greeting && carousel && dots === 3 && prev && next && slides === 3 && overviewEmpty && dot0Active,
      { greeting, carousel, dots, prev, next, slides, overviewEmpty, dot0Active }
    )
  })

  await guard('S2) 播种待办 → 行动屏列表 + 概览屏统计卡出现', async () => {
    // 切到工具屏（圆点 2）再快捷添加（被裁剪的屏内元素不可交互）
    await page.locator('[data-testid="home-carousel-dot-2"]').click()
    await page.waitForTimeout(500)
    await page.locator('[data-testid="home-quick-add-input"]').fill('qa-seed-todo')
    await page.locator('[data-testid="home-quick-add-btn"]').click()
    await page.waitForSelector('[data-testid="home-todo-list"]', { state: 'attached', timeout: 5000 })
    await page.waitForTimeout(300)
    const todoList = (await page.locator('[data-testid="home-todo-list"]').count()) === 1
    const todoItems = await page.locator('[data-testid="home-todo-list"] .home-list-item').count()
    const statsTodos = (await page.locator('[data-testid="home-stats-todos"]').count()) === 1
    const overviewEmptyNow = (await page.locator('[data-testid="home-overview-empty"]').count()) === 0
    record(
      'S2) 播种待办 → 行动屏 home-todo-list(1 条) + 概览屏 home-stats-todos 出现、概览空态消失',
      todoList && todoItems === 1 && statsTodos && overviewEmptyNow,
      { todoList, todoItems, statsTodos, overviewEmptyNow }
    )
  })

  await guard('S3) 手动切换：next → 圆点 1 active + track 平移；dot 2 → 工具屏', async () => {
    // 先回第 1 屏（S2 结束时停在工具屏），再测 next 前进一步
    await page.locator('[data-testid="home-carousel-dot-0"]').click()
    await page.waitForTimeout(500)
    await page.locator('[data-testid="home-carousel-next"]').click()
    await page.waitForTimeout(500)
    const dot1Active = await page.locator('[data-testid="home-carousel-dot-1"]').evaluate((el) => el.classList.contains('active'))
    const transform = await page.evaluate(() => document.querySelector('.home-carousel-track').style.transform)
    await page.locator('[data-testid="home-carousel-dot-2"]').click()
    await page.waitForTimeout(500)
    const dot2Active = await page.locator('[data-testid="home-carousel-dot-2"]').evaluate((el) => el.classList.contains('active'))
    record(
      'S3) 手动切换：next → 圆点 1 active + translateX(-100%)；dot 2 → 圆点 2 active',
      dot1Active && transform.includes('translateX(-100%)') && dot2Active,
      { dot1Active, transform, dot2Active }
    )
  })

  await guard('S4) 自动轮播：鼠标移出轮播区后 ~6.5s 活动圆点推进', async () => {
    // 回到第 1 屏，鼠标移出轮播区（hover 暂停），等待自动轮播推进到第 2 屏
    await page.locator('[data-testid="home-carousel-dot-0"]').click()
    await page.mouse.move(10, 10)
    await page.waitForTimeout(6700)
    const dot1Active = await page.locator('[data-testid="home-carousel-dot-1"]').evaluate((el) => el.classList.contains('active'))
    record('S4) 自动轮播 6s → 活动圆点从 0 推进到 1', dot1Active, { dot1Active })
  })

  await guard('S5) 菜单开关联动：关闭「工作待办」→ 菜单项 + 快捷添加 + 待办面板/统计卡全隐藏，重新开启恢复', async () => {
    await page.getByRole('button', { name: '⚙️ 设置' }).click()
    await page.waitForSelector('.manager', { state: 'visible', timeout: 5000 })
    await page.getByRole('tab', { name: '工作台设置' }).click()
    await page.waitForSelector('[data-testid="wbmenu-switch-todos"]', { state: 'visible', timeout: 5000 })
    await page.locator('[data-testid="wbmenu-switch-todos"]').click()
    await page.waitForTimeout(300)
    const menuGone = (await page.locator('[data-testid="wb-menu-todos"]').count()) === 0
    const quickAddGone = (await page.locator('[data-testid="home-quick-add-input"]').count()) === 0
    const todoListGone = (await page.locator('[data-testid="home-todo-list"]').count()) === 0
    const statsGone = (await page.locator('[data-testid="home-stats-todos"]').count()) === 0
    // 重新开启（开关行仍在设置弹窗中，不受过滤影响）
    await page.locator('[data-testid="wbmenu-switch-todos"]').click()
    await page.waitForTimeout(300)
    const menuBack = (await page.locator('[data-testid="wb-menu-todos"]').count()) === 1
    const quickAddBack = (await page.locator('[data-testid="home-quick-add-input"]').count()) === 1
    const todoListBack = (await page.locator('[data-testid="home-todo-list"]').count()) === 1
    const statsBack = (await page.locator('[data-testid="home-stats-todos"]').count()) === 1
    await page.keyboard.press('Escape')
    record(
      'S5) 菜单开关联动（关闭隐藏/开启恢复）',
      menuGone && quickAddGone && todoListGone && statsGone && menuBack && quickAddBack && todoListBack && statsBack,
      { menuGone, quickAddGone, todoListGone, statsGone, menuBack, quickAddBack, todoListBack, statsBack }
    )
  })

  await guard('S6) 移动端 375×812：scrollWidth ≤ 375（无横向滚动）+ 轮播骨架可见', async () => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="home-greeting"]', { state: 'visible', timeout: 15000 })
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const carouselVisible = await page.locator('[data-testid="home-carousel"]').isVisible()
    record('S6) 移动端 375×812：scrollWidth ≤ 375 + 轮播可见', scrollWidth <= 375 && carouselVisible, { scrollWidth, carouselVisible })
  })

  await page.setViewportSize({ width: 1280, height: 800 })
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.screenshot({ path: EVIDENCE_LIGHT_PNG, fullPage: true })
  const lightSize = existsSync(EVIDENCE_LIGHT_PNG) ? statSync(EVIDENCE_LIGHT_PNG).size : 0
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(200)
  await page.screenshot({ path: EVIDENCE_DARK_PNG, fullPage: true })
  const darkSize = existsSync(EVIDENCE_DARK_PNG) ? statSync(EVIDENCE_DARK_PNG).size : 0
  record('S7) 明/暗全页截图写入（证据，恒 PASS）', true, { light: { path: EVIDENCE_LIGHT_PNG, bytes: lightSize }, dark: { path: EVIDENCE_DARK_PNG, bytes: darkSize } })

  const totalPassed = results.filter((r) => r.ok).length
  const verdict = totalPassed === results.length && results.length > 0 ? 'PASS' : 'FAIL'
  const qa = {
    command: 'node scripts/qa-workbench-home.mjs',
    result: verdict + ' (' + totalPassed + '/' + results.length + ')',
    browser: 'chromium (playwright, headless)',
    dev_server: 'vite on ' + devBase + ' (' + (startedByUs ? 'started by script' : 'reused existing') + ')',
    evidence_light_png: EVIDENCE_LIGHT_PNG,
    evidence_dark_png: EVIDENCE_DARK_PNG,
    assertions: results
  }
  writeFileSync(EVIDENCE_LOG, JSON.stringify({ task: 'workbench-home: 轮播布局 + 菜单开关联动回归（S1-S7）', qa }, null, 2), 'utf8')
  console.log('[qa] QA evidence log written: ' + EVIDENCE_LOG)
  if (verdict !== 'PASS') process.exitCode = 1
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  if (browser) await browser.close().catch(() => {})
} finally {
  if (browser) await browser.close()
  stopDevServer()
}
