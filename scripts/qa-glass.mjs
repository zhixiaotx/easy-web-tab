/**
 * QA: 工作台共享全局背景 + 玻璃卡片（Todo 19 / workbench-improvements）
 *
 * Playwright 方案：后台启动 vite dev（端口 16718，被占用自动上浮）→
 * 无背景态打开 /workbench → 断言 .wb-content 不透明（glass 未生效）→
 * 经 localStorage user-background 注入图片背景并刷新 → 断言 html.app-has-background.image、
 * .wb-content 透明、.bento-card 半透明 + backdrop-filter blur → 切暗色 → 断言深色玻璃 →
 * 截图存 .omo/evidence/workbench-improvements/task-19-workbench-improvements.png。
 *
 * 运行：node scripts/qa-glass.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'workbench-improvements')
const EVIDENCE_PNG = join(EVIDENCE_DIR, 'task-19-workbench-improvements.png')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'task-19-qa-partial.log')

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

/** 读取元素计算样式关键字段。 */
async function cssOf(page, selector) {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const s = getComputedStyle(el)
    return {
      backgroundColor: s.backgroundColor,
      backdropFilter: s.backdropFilter,
      webkitBackdropFilter: s.webkitBackdropFilter
    }
  }, selector)
}

/** 判断某计算样式是否含 backdrop blur（backdropFilter 在部分 Chromium 下可能为 undefined，做空值兜底）。 */
function hasBlur(css) {
  if (!css) return false
  const bf = css.backdropFilter || ''
  const wbf = css.webkitBackdropFilter || ''
  return bf.includes('blur') || wbf.includes('blur')
}

let browser
try {
  await ensureDevServer()
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  // ===== 无背景态：.wb-content 不透明、卡片无玻璃效果 =====
  await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wb-menu-home"]', { state: 'visible', timeout: 15000 })
  await page.waitForSelector('.bento-card', { state: 'visible', timeout: 10000 })
  const hasBgClass = await page.evaluate(() => document.documentElement.classList.contains('app-has-background'))
  const contentCss = await cssOf(page, '.wb-content')
  const cardCss = await cssOf(page, '.bento-card')
  const contentTransparent = contentCss && contentCss.backgroundColor === 'rgba(0, 0, 0, 0)'
  const cardGlass = hasBlur(cardCss)
  record('a) 无背景态：无 app-has-background、内容区不透明、卡片无玻璃', !hasBgClass && !contentTransparent && !cardGlass, {
    hasBgClass,
    contentTransparent,
    cardGlass
  })

  // ===== 注入图片背景（localStorage user-background）+ 刷新 → 共享全局背景 + 玻璃卡片 =====
  await page.evaluate(() => {
    localStorage.setItem(
      'user-background',
      JSON.stringify({ type: 'image', value: '/backgrounds/preset-1.jpg', opacity: 1, customs: [] })
    )
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.bento-card', { state: 'visible', timeout: 15000 })
  const bgOn = await page.evaluate(() => {
    const html = document.documentElement
    return html.classList.contains('app-has-background') && html.classList.contains('image')
  })
  const contentCssOn = await cssOf(page, '.wb-content')
  const cardCssOn = await cssOf(page, '.bento-card')
  const contentTransparentOn = contentCssOn && contentCssOn.backgroundColor === 'rgba(0, 0, 0, 0)'
  const cardGlassOn = hasBlur(cardCssOn)
  const cardTranslucentOn = cardCssOn && /rgba\(255, 255, 255, 0\./.test(cardCssOn.backgroundColor)
  record(
    'b) 图片背景：app-has-background.image + 内容区透明 + 卡片玻璃半透明',
    bgOn && contentTransparentOn && cardGlassOn && cardTranslucentOn,
    { bgOn, contentTransparentOn, cardGlassOn, cardTranslucentOn, cardBg: cardCssOn && cardCssOn.backgroundColor }
  )

  // ===== 证据截图（亮色 + 背景 + 玻璃卡片）=====
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.screenshot({ path: EVIDENCE_PNG, fullPage: true })
  const pngSize = existsSync(EVIDENCE_PNG) ? (await import('node:fs')).statSync(EVIDENCE_PNG).size : 0
  record('c) 证据截图写入（亮色玻璃卡片可见）', pngSize > 0, { path: EVIDENCE_PNG, bytes: pngSize })

  // ===== 切暗色 → 深色玻璃卡片 =====
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(300)
  const cardCssDark = await cssOf(page, '.bento-card')
  const cardDarkTranslucent = cardCssDark && /rgba\(17, 24, 39, 0\./.test(cardCssDark.backgroundColor)
  const cardGlassDark = hasBlur(cardCssDark)
  record('d) 暗色 + 背景：卡片深色半透明 + 玻璃保持', cardDarkTranslucent && cardGlassDark, {
    cardDarkTranslucent,
    cardGlassDark,
    cardBg: cardCssDark && cardCssDark.backgroundColor
  })

  const totalPassed = results.filter((r) => r.ok).length
  const verdict = totalPassed === results.length && results.length > 0 ? 'PASS' : 'FAIL'
  const qa = {
    command: 'node scripts/qa-glass.mjs',
    result: `${verdict} (${totalPassed}/${results.length})`,
    browser: 'chromium (playwright, headless)',
    dev_server: `vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
    evidence_png: EVIDENCE_PNG,
    assertions: results
  }
  writeFileSync(EVIDENCE_LOG, JSON.stringify({ task: 'workbench-improvements: Todo 19 - 共享背景+玻璃卡片', qa }, null, 2), 'utf8')
  console.log(`[qa] QA partial evidence written: ${EVIDENCE_LOG}`)
  if (verdict !== 'PASS') process.exitCode = 1
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  if (browser) await browser.close().catch(() => {})
} finally {
  if (browser) await browser.close()
  stopDevServer()
}
