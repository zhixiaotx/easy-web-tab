/**
 * QA: 全站底部备案页脚 BeianFooter（icp-beian-footer / Todo 5）
 *
 * Playwright 方案：后台启动 vite dev（端口 16718，被占用自动上浮）→
 * 相 A（现状自适应）：运行时从磁盘读 src/config/beian.ts 正则提取 ICP_NUMBER/PSB_NUMBER 推导期望——
 *   双空 → 断言 4 路由（/ /display /workbench /business）页脚均不存在；
 *   任一非空 → 断言页脚存在且 ICP 链接 href=https://beian.miit.gov.cn/ target=_blank、
 *   公安链接 href 以 code=<数字> 结尾且数字与常量一致、双段并存时分隔条存在。
 *   每路由亮色截图 + 切暗色截图 → .omo/evidence/beian/<slug>-<light|dark>.png。
 * 相 B（自适应契约守卫）：临时把两常量改为非空样例 → 等 HMR → reload 后断言 presence 路径
 *   （含 code=44030402001234 精确尾缀、双 target=_blank）→ 还原原文件内容 → reload 再证 absence。
 *   守卫证据存 adapt-guard.png，绝不覆盖相 A 主证据。
 * 附带信息（不计 FAIL）：/workbench 下若存在 panel-pager，记录其与页脚的包围盒相交情况。
 *
 * 运行：node scripts/qa-beian.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'beian')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'qa-beian.log')
const CONFIG_PATH = join(ROOT, 'src', 'config', 'beian.ts')

/** 从磁盘读备案常量（qa 期望的唯一来源）。 */
function readConstants() {
  const src = readFileSync(CONFIG_PATH, 'utf8')
  const icp = src.match(/ICP_NUMBER\s*=\s*'([^']*)'/)
  const psb = src.match(/PSB_NUMBER\s*=\s*'([^']*)'/)
  if (!icp || !psb) throw new Error('cannot extract ICP_NUMBER/PSB_NUMBER from src/config/beian.ts')
  return { icp: icp[1], psb: psb[1] }
}

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
      stdio: ['ignore', 'pipe', 'pipe'],
      // vite dev 首次全量转译模块图时曾触发 NewSpace OOM（本机内存压力大场景），显式放宽堆
      env: {
        ...process.env,
        NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=4096', '--max-semi-space-size=128']
          .filter(Boolean)
          .join(' ')
      }
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
function record(name, ok, detail, infoOnly = false) {
  results.push({ name, ok: !!ok, infoOnly, detail: JSON.stringify(detail) })
  console.log(`${infoOnly ? 'INFO' : ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`)
}

const ROUTES = [
  { path: '/', slug: 'root' },
  { path: '/display', slug: 'display' },
  { path: '/workbench', slug: 'workbench' },
  { path: '/business', slug: 'business' }
]

/** 断言页脚缺席（双空态）。 */
async function expectFooterAbsent(page, route) {
  const present = await page.evaluate(() => !!document.querySelector('[data-testid="beian-footer"]'))
  record(`A/${route.slug} 双空态页脚不存在`, !present, { selector: '[data-testid="beian-footer"]', present })
}

/** 断言页脚存在 + 链接契约（presence 态）。 */
async function expectFooterContract(page, tag, consts) {
  const sel = '[data-testid="beian-footer"]'
  const footer = page.locator(sel)
  const visible = await footer.isVisible().catch(() => false)
  record(`${tag} 页脚可见`, visible, { selector: sel })
  if (!visible) return
  if (consts.icp) {
    const link = page.locator('[data-testid="beian-icp-link"]')
    const href = (await link.getAttribute('href').catch(() => null)) || ''
    const target = (await link.getAttribute('target').catch(() => null)) || ''
    const rel = (await link.getAttribute('rel').catch(() => null)) || ''
    const text = (await link.textContent().catch(() => '')) || ''
    record(
      `${tag} ICP 链接契约`,
      href === 'https://beian.miit.gov.cn/' && target === '_blank' && rel.includes('noopener') && text === consts.icp,
      { href, target, rel, text }
    )
  }
  if (consts.psb) {
    const link = page.locator('[data-testid="beian-psb-link"]')
    const href = (await link.getAttribute('href').catch(() => null)) || ''
    const target = (await link.getAttribute('target').catch(() => null)) || ''
    const digits = consts.psb.replace(/\D/g, '')
    const imgVisible = await page
      .locator('[data-testid="beian-psb-link"] img')
      .isVisible()
      .catch(() => false)
    record(
      `${tag} 公安链接契约`,
      href.endsWith(`code=${digits}`) && target === '_blank',
      { href, expectedTail: `code=${digits}`, target, badgeImgVisible: imgVisible }
    )
  }
  if (consts.icp && consts.psb) {
    const sep = await page.locator('.beian-sep').isVisible().catch(() => false)
    record(`${tag} 双段并存分隔条`, sep, { selector: '.beian-sep' })
  }
}

let browser
try {
  const original = readFileSync(CONFIG_PATH, 'utf8')
  const consts = readConstants()
  console.log(`[consts] ICP='${consts.icp}' PSB='${consts.psb}'`)
  await ensureDevServer()
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  // ===== 相 A：现状自适应断言 + 明暗截图 =====
  const bothEmpty = !consts.icp && !consts.psb
  for (const route of ROUTES) {
    await page.goto(`${devBase}${route.path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    if (bothEmpty) {
      await expectFooterAbsent(page, route)
    } else {
      await expectFooterContract(page, `A/${route.slug}`, consts)
    }
    // 附带信息：/workbench 分页条与页脚几何关系（仅记录）
    if (route.path === '/workbench') {
      const geom = await page.evaluate(() => {
        const f = document.querySelector('[data-testid="beian-footer"]')
        const pager = document.querySelector('[data-testid="panel-pager"]')
        if (!f) return { footerPresent: false, pagerPresent: !!pager }
        const fb = f.getBoundingClientRect()
        const pb = pager ? pager.getBoundingClientRect() : null
        const intersect = pb && !(pb.bottom < fb.top || pb.top > fb.bottom)
        return { footerPresent: true, pagerPresent: !!pager, footerTop: fb.top, pagerBottom: pb && pb.bottom, verticalIntersect: intersect }
      })
      record(`A/workbench 分页条与页脚几何（附带信息）`, true, geom, true)
    }
    const pngLight = join(EVIDENCE_DIR, `${route.slug}-light.png`)
    await page.screenshot({ path: pngLight, fullPage: true })
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForTimeout(300)
    const pngDark = join(EVIDENCE_DIR, `${route.slug}-dark.png`)
    await page.screenshot({ path: pngDark, fullPage: true })
    const shotsOk = existsSync(pngLight) && existsSync(pngDark)
    record(`A/${route.slug} 明暗截图落盘`, shotsOk, { pngLight: existsSync(pngLight), pngDark: existsSync(pngDark) })
    await page.evaluate(() => document.documentElement.classList.remove('dark'))
  }

  // ===== 相 B：自适应契约守卫（临时填号 → presence 断言 → 还原 → absence 再证）=====
  const GUARD_ICP = '粤ICP备12345678号'
  const GUARD_PSB = '粤公网安备44030402001234号'
  const patched = original
    .replace(/ICP_NUMBER\s*=\s*'[^']*'/, `ICP_NUMBER = '${GUARD_ICP}'`)
    .replace(/PSB_NUMBER\s*=\s*'[^']*'/, `PSB_NUMBER = '${GUARD_PSB}'`)
  if (patched === original) {
    record('B 守卫相跳过（替换未生效，检查正则）', false, { reason: 'patched===original' })
  } else {
    try {
      writeFileSync(CONFIG_PATH, patched, 'utf8')
      await page.goto(`${devBase}/`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1200) // 等 vite HMR 生效
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(500)
      await expectFooterContract(page, 'B/守卫-填号', { icp: GUARD_ICP, psb: GUARD_PSB })
      await page.screenshot({ path: join(EVIDENCE_DIR, 'adapt-guard.png'), fullPage: false })
    } finally {
      writeFileSync(CONFIG_PATH, original, 'utf8')
    }
    await page.waitForTimeout(1000)
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    await expectFooterAbsent(page, { slug: 'B/守卫-还原' })
  }

  const judged = results.filter((r) => !r.infoOnly)
  const totalPassed = judged.filter((r) => r.ok).length
  const verdict = totalPassed === judged.length && judged.length > 0 ? 'PASS' : 'FAIL'
  const qa = {
    command: 'node scripts/qa-beian.mjs',
    result: `${verdict} (${totalPassed}/${judged.length})`,
    browser: 'chromium (playwright, headless)',
    dev_server: `vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
    consts_at_runtime: consts,
    adaptive_guard: 'temp-fill → presence asserts → restore → absence assert',
    evidence_dir: EVIDENCE_DIR,
    assertions: results
  }
  writeFileSync(EVIDENCE_LOG, JSON.stringify({ task: 'icp-beian-footer: Todo 5 - 全站备案页脚自适应契约', qa }, null, 2), 'utf8')
  console.log(`[qa] evidence written: ${EVIDENCE_LOG}`)
  if (verdict !== 'PASS') process.exitCode = 1
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  writeFileSync(EVIDENCE_LOG, JSON.stringify({ task: 'icp-beian-footer Todo 5', fatal: err.message, assertions: results }, null, 2), 'utf8')
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  stopDevServer()
}
