/**
 * QA: 站点管理九动作迁入设置「导航设置」tab（nav-settings-admin-actions / Todo 4）
 *
 * Playwright 方案：后台启动 vite dev（端口 16718 起，被占用自动上浮）→
 *   S1 设置弹窗默认导航 tab：「站点管理」区块可见 + 九钮 testid 齐全且文案正确；
 *   S2 管理页工具栏已移除：/.actions-row 不存在、.btn-action 计数 0、#import-file 隐藏输入不存在；
 *   S3 add 链路：点 stg-act-add → 设置弹窗关闭 + URL query modal=add；Esc 关闭后 query 清空；
 *   S4 engines 链路：同上 modal=engines；
 *   S5 background/category/backup/icons 四链路循环：modal=<key> + 弹窗关闭（覆盖层探测为附带信息）；
 *   S6 纯动作就地执行不关设置：
 *      export → download 事件触发（文件名以 .md 结尾）、设置弹窗保持打开、URL 无变化；
 *      import → filechooser 事件触发、设置弹窗保持打开；
 *      check-links → 点击后无跳转、无 modal query、设置保持打开；
 *   S7 明暗截图：设置导航 tab 明/暗 + 管理页全页明/暗 → .omo/evidence/settings-actions/*.png。
 *
 * 运行：node scripts/qa-settings-actions.mjs（与其它 QA 脚本禁止并行，同端口域）
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'settings-actions')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'qa-settings-actions.log')

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

const ACTIONS = [
  ['import', '导入'],
  ['export', '导出'],
  ['add', '添加网址'],
  ['check-links', '检测断链'],
  ['engines', '引擎管理'],
  ['background', '背景'],
  ['category', '分类管理'],
  ['backup', '备份'],
  ['icons', '图标管理']
]

const MODAL_KEYS = ['background', 'category', 'backup', 'icons']

/** 打开设置弹窗并等待站点管理区块可见。 */
async function openSettings(page) {
  await page.click('button.btn-help[title="设置"]')
  await page
    .locator('[data-testid="stg-site-actions"]')
    .waitFor({ state: 'visible', timeout: 5000 })
    .catch(() => {})
}

let browser
try {
  await ensureDevServer()
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true
  })
  const page = await context.newPage()

  // ===== S1 设置弹窗导航 tab 站点管理区块 =====
  await page.goto(`${devBase}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await openSettings(page)
  const containerVisible = await page.locator('[data-testid="stg-site-actions"]').isVisible().catch(() => false)
  record('S1 站点管理区块可见', containerVisible, { selector: '[data-testid="stg-site-actions"]' })

  for (const [key, label] of ACTIONS) {
    const sel = `[data-testid="stg-act-${key}"]`
    const loc = page.locator(sel)
    const visible = await loc.isVisible().catch(() => false)
    const text = (await loc.textContent().catch(() => '')) || ''
    record(
      `S1 按钮 ${key}`,
      visible && text.includes(label),
      { selector: sel, expectedLabel: label, actualText: text.trim(), visible }
    )
  }

  // ===== S2 管理页工具栏九钮已移除 =====
  const removal = await page.evaluate(() => ({
    actionsRowPresent: !!document.querySelector('.actions-row'),
    btnActionCount: document.querySelectorAll('.btn-action').length,
    importFileInputPresent: !!document.getElementById('import-file'),
    settingsButtonImported: !!document.querySelector('.settings-wrapper')
  }))
  record(
    'S2 工具栏移除',
    !removal.actionsRowPresent && removal.btnActionCount === 0 && !removal.importFileInputPresent && !removal.settingsButtonImported,
    removal
  )

  // ===== S3 add 链路（当前设置弹窗仍开着）=====
  await page.click('[data-testid="stg-act-add"]')
  await page.waitForTimeout(500)
  const s3UrlHasModal = page.url().includes('modal=add')
  const s3DialogClosed = !(await page.locator('[data-testid="stg-site-actions"]').isVisible().catch(() => false))
  record('S3 add 打开', s3UrlHasModal && s3DialogClosed, { urlModalAdd: s3UrlHasModal, dialogClosed: s3DialogClosed, url: page.url() })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const s3Cleared = !page.url().includes('modal=')
  record('S3 add Esc 清除 query', s3Cleared, { urlAfterEsc: page.url() })

  // ===== S4 engines 链路 =====
  await openSettings(page)
  await page.click('[data-testid="stg-act-engines"]')
  await page.waitForTimeout(500)
  const s4UrlHasModal = page.url().includes('modal=engines')
  const s4DialogClosed = !(await page.locator('[data-testid="stg-site-actions"]').isVisible().catch(() => false))
  record('S4 engines 打开', s4UrlHasModal && s4DialogClosed, { urlModalEngines: s4UrlHasModal, dialogClosed: s4DialogClosed, url: page.url() })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // ===== S5 background/category/backup/icons 循环 =====
  for (const key of MODAL_KEYS) {
    await openSettings(page)
    await page.click(`[data-testid="stg-act-${key}"]`)
    await page.waitForTimeout(500)
    const hasModal = page.url().includes(`modal=${key}`)
    const dialogClosed = !(await page.locator('[data-testid="stg-site-actions"]').isVisible().catch(() => false))
    record(`S5 ${key} 打开`, hasModal && dialogClosed, { urlModal: hasModal, dialogClosed, url: page.url() })
    const overlayProbe = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('body *'))
      const ov = els.find((el) => {
        const cls = typeof el.className === 'string' ? el.className : ''
        return /overlay|manager/i.test(cls) && el.offsetParent !== null && el.children.length > 0
      })
      return { overlayFound: !!ov, cls: ov ? String(ov.className).slice(0, 60) : null }
    })
    record(`S5/${key} 覆盖层探测（附带信息）`, true, overlayProbe, true)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const cleared = !page.url().includes(`modal=${key}`)
    record(`S5 ${key} Esc 清除`, cleared, { urlAfterEsc: page.url() })
  }

  // ===== S6 纯动作就地执行（不关设置、不改 URL）=====
  await page.goto(`${devBase}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await openSettings(page)

  // 导出：download 事件 + 设置保持打开 + URL 不变
  const urlBeforeExport = page.url()
  const dlPromise = page.waitForEvent('download', { timeout: 8000 }).catch(() => null)
  await page.click('[data-testid="stg-act-export"]')
  const download = await dlPromise
  const fname = download ? download.suggestedFilename() : null
  const stillOpenAfterExport = await page.locator('[data-testid="stg-site-actions"]').isVisible().catch(() => false)
  record(
    'S6 导出就地执行',
    !!download && /\.md$/i.test(fname || '') && stillOpenAfterExport && page.url() === urlBeforeExport,
    { downloadFired: !!download, filename: fname, dialogStillOpen: stillOpenAfterExport, urlUnchanged: page.url() === urlBeforeExport }
  )

  // 导入：filechooser 事件 + 设置保持打开
  const fcPromise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null)
  await page.click('[data-testid="stg-act-import"]')
  const chooser = await fcPromise
  if (chooser) {
    // 不真正选文件，避免污染数据；直接关闭选择器语义上无需操作
  }
  const stillOpenAfterImport = await page.locator('[data-testid="stg-site-actions"]').isVisible().catch(() => false)
  record('S6 导入入口触发文件选择器', !!chooser && stillOpenAfterImport, { fileChooserFired: !!chooser, dialogStillOpen: stillOpenAfterImport })

  // 检测断链：点击后无跳转、无 modal query、设置保持打开
  const urlBeforeCheck = page.url()
  await page.click('[data-testid="stg-act-check-links"]')
  await page.waitForTimeout(1200)
  const noNav = page.url() === urlBeforeCheck && !page.url().includes('modal=')
  const stillOpenAfterCheck = await page.locator('[data-testid="stg-site-actions"]').isVisible().catch(() => false)
  const checkBtnDisabledDuringRun = await page.locator('[data-testid="stg-act-check-links"]').isDisabled().catch(() => false)
  record(
    'S6 断链检测就地执行',
    noNav && stillOpenAfterCheck,
    { urlUnchanged: noNav, dialogStillOpen: stillOpenAfterCheck, btnDisabledDuringRun: checkBtnDisabledDuringRun },
    false
  )

  // ===== S7 明暗截图 =====
  const shots = []
  const shotLight = join(EVIDENCE_DIR, 'settings-nav-light.png')
  await page.screenshot({ path: shotLight, fullPage: false })
  shots.push(shotLight)
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(300)
  const shotDark = join(EVIDENCE_DIR, 'settings-nav-dark.png')
  await page.screenshot({ path: shotDark, fullPage: false })
  shots.push(shotDark)
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const homeLight = join(EVIDENCE_DIR, 'home-after-removal-light.png')
  await page.screenshot({ path: homeLight, fullPage: true })
  shots.push(homeLight)
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(300)
  const homeDark = join(EVIDENCE_DIR, 'home-after-removal-dark.png')
  await page.screenshot({ path: homeDark, fullPage: true })
  shots.push(homeDark)
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  const allShotsOk = shots.every((s) => existsSync(s))
  record('S7 明暗截图落盘', allShotsOk, { shots: shots.map((s) => s.split(/[\\/]/).pop()), allShotsOk })

  const judged = results.filter((r) => !r.infoOnly)
  const totalPassed = judged.filter((r) => r.ok).length
  const verdict = totalPassed === judged.length && judged.length > 0 ? 'PASS' : 'FAIL'
  const qa = {
    command: 'node scripts/qa-settings-actions.mjs',
    result: `${verdict} (${totalPassed}/${judged.length})`,
    browser: 'chromium (playwright, headless)',
    dev_server: `vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
    evidence_dir: EVIDENCE_DIR,
    assertions: results
  }
  writeFileSync(EVIDENCE_LOG, JSON.stringify({ task: 'nav-settings-admin-actions: T4 - 站点管理九动作迁入设置导航tab', qa }, null, 2), 'utf8')
  console.log(`[qa] evidence written: ${EVIDENCE_LOG}`)
  console.log(`[qa] VERDICT: ${verdict} (${totalPassed}/${judged.length})`)
  if (verdict !== 'PASS') process.exitCode = 1
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  try {
    mkdirSync(EVIDENCE_DIR, { recursive: true })
    writeFileSync(EVIDENCE_LOG, JSON.stringify({ task: 'nav-settings-admin-actions T4', fatal: err.message, assertions: results }, null, 2), 'utf8')
  } catch {
    // ignore secondary failure during fatal logging
  }
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  stopDevServer()
}
