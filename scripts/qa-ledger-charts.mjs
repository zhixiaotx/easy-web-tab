/**
 * QA: 记账面板图表全量契约 S1-S7（ledger-charts）
 *
 * 在 E1 脚手架（后台启动/复用 vite dev 16718-16726 → /workbench → 点击 wb-menu-ledger →
 * 6 统计卡 + 月份导航 + 截图 + JSON 日志）基础上，扩展完整场景契约：
 *
 *  - 数据注入：在点击菜单触发 loadLedger 之前，直接向 IndexedDB（easy-web-tab v5，store 'ledger'，键 'items'）
 *    写入 6 个月（当前真实月 + 前 5 个月，跨年安全）的记账数据——每月 4 条（工资收入 + 房贷/餐饮/出行支出）。
 *    注意 income 取 `10000 + 月索引×2000`（最大值 20000 = nice 天花板，使最高柱顶与顶部网格线严格对齐，
 *    满足 S1 的对齐断言；若用 ×1000 则最大值 15000 → nice 天花板 20000，顶部对齐断言不成立）。
 *  - S1 趋势柱状图：12 柱 / 5 网格线 / 6 月标签 / max 标签 / 柱顶与顶部网格线对齐 ≤1px。
 *  - S2 环形图周长不变量：各段 dash 长度之和 ≈ 2π×90；每段 dash+rest ≈ 2π×90；首段 accent、后续段 hex 且互异；
 *    中心金额默认掩码 '****'。
 *  - S3 趋势空态：注入「远未来月份（2999-01）」数据 → 近 6 月窗口全 0 → ld-trend-empty 可见、0 柱、卡仍在；
 *    随后恢复正常数据。
 *  - S4 显示金额不改变几何：reveal 前后 dasharray/dashoffset/柱高/y 恒等（≤0.01），中心与图例变明文。
 *  - S5 图例完整性：3 个支出分类行（房贷/餐饮/出行，不含收入分类工资），含色点、名称、·分隔值、百分比。
 *  - S6 回归：统计卡/月份导航/新增/掩码开关/列表开关/记录条目（展开后）全在。
 *  - S7 截图：明/暗两套 fullPage 截图。
 *
 * 运行：node scripts/qa-ledger-charts.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'ledger-charts')
const EVIDENCE_PNG = join(EVIDENCE_DIR, 'task-ledger-charts-harness.png')
const EVIDENCE_LIGHT = join(EVIDENCE_DIR, 'task-ledger-charts-light.png')
const EVIDENCE_DARK = join(EVIDENCE_DIR, 'task-ledger-charts-dark.png')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'harness.log')

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

// 记账面板统计卡 6 项（testid 已在 WorkbenchLedger.vue 核实存在）
const STAT_TESTIDS = [
  'ld-stat-income',
  'ld-stat-expense',
  'ld-stat-balance',
  'ld-stat-deposit',
  'ld-stat-count',
  'ld-stat-ratio'
]

// 月份导航 testid（WorkbenchLedger.vue 核实存在）
const MONTH_TESTIDS = ['ld-prev', 'ld-next', 'ld-month', 'ld-today']

// ===== QA 注入数据 =====
const RING_C = 2 * Math.PI * 90 // ≈ 565.4867，WorkbenchLedger.vue 环形图常量
const QA_CATEGORIES = [
  { id: 'salary', name: '工资', type: 'income', isBuiltIn: true },
  { id: 'mortgage', name: '房贷', type: 'expense', isBuiltIn: true },
  { id: 'food', name: '餐饮', type: 'expense', isBuiltIn: false },
  { id: 'travel', name: '出行', type: 'expense', isBuiltIn: false }
]

/** offset 为 -5..0 的月键（'YYYY-MM'，跨年安全）。offset=0 → 当前真实月。 */
function monthKeyOffset(offset) {
  const now = new Date()
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`
}

/**
 * 正常场景：当前月 + 前 5 个月，每月 4 条（salary/mortgage/food/travel）。
 * income = 10000 + 月索引×2000 → 最大 20000 = trendChartScale 的 nice 天花板（maxY），
 * 最高柱顶与顶部网格线（maxY 线）严格对齐，供 S1 对齐断言使用。
 * expense = 4000+m / 1500+m / 600+m（m=0..5），全部互异且为正。
 */
function buildNormalLedgerData() {
  const entries = []
  for (let offset = -5; offset <= 0; offset++) {
    const mk = monthKeyOffset(offset)
    const m = offset + 5 // 0..5
    const date = `${mk}-10`
    const ts = `${mk}-10T08:00:00.000Z`
    const specs = [
      { id: 'salary', categoryId: 'salary', amount: 10000 + m * 2000 },
      { id: 'mortgage', categoryId: 'mortgage', amount: 4000 + m },
      { id: 'food', categoryId: 'food', amount: 1500 + m },
      { id: 'travel', categoryId: 'travel', amount: 600 + m }
    ]
    for (const s of specs) {
      entries.push({
        id: `mx_${mk}_${s.id}`,
        date,
        categoryId: s.categoryId,
        amount: s.amount,
        note: 'qa',
        createdAt: ts,
        updatedAt: ts
      })
    }
  }
  return { categories: QA_CATEGORIES, entries }
}

/** 空场景：全部流水在远未来 '2999-01' → 以当前月为末月的近 6 月窗口全 0 → 趋势空态。 */
function buildFutureLedgerData() {
  const date = '2999-01-10'
  const ts = '2999-01-10T08:00:00.000Z'
  const entries = [
    { id: 'fx_salary', date, categoryId: 'salary', amount: 50000, note: 'qa', createdAt: ts, updatedAt: ts },
    { id: 'fx_mortgage', date, categoryId: 'mortgage', amount: 4000, note: 'qa', createdAt: ts, updatedAt: ts },
    { id: 'fx_food', date, categoryId: 'food', amount: 1500, note: 'qa', createdAt: ts, updatedAt: ts },
    { id: 'fx_travel', date, categoryId: 'travel', amount: 600, note: 'qa', createdAt: ts, updatedAt: ts }
  ]
  return { categories: QA_CATEGORIES, entries }
}

/**
 * 向 IndexedDB easy-web-tab v5 的 store 'ledger' 以键 'items' 写入 LedgerData。
 * 在页面上下文执行（应用自身的 openIdb 缓存独立，二次连接同版本不触发 versionchange）。
 */
async function injectLedgerData(page, data) {
  return page.evaluate((payload) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('easy-web-tab', 6)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('ledger')) req.result.createObjectStore('ledger')
      }
      req.onsuccess = () => {
        const db = req.result
        try {
          const tx = db.transaction('ledger', 'readwrite')
          tx.objectStore('ledger').put(payload, 'items')
          tx.oncomplete = () => {
            db.close()
            resolve(true)
          }
          tx.onerror = () => {
            db.close()
            reject(tx.error)
          }
        } catch (e) {
          db.close()
          reject(e)
        }
      }
      req.onerror = () => reject(req.error)
    })
  }, data)
}

/** 采集环形图各段 dasharray/dashoffset + 趋势各柱 height/y（S4 几何对比用）。 */
async function captureChartGeometry(page) {
  return page.evaluate(() => {
    const segs = Array.from(document.querySelectorAll('[data-testid^="ld-donut-seg-"]'))
    const bars = Array.from(document.querySelectorAll('[data-testid^="ld-trend-bar-"]'))
    return {
      segs: segs.map((s) => ({
        dasharray: s.getAttribute('stroke-dasharray') ?? '',
        dashoffset: s.getAttribute('stroke-dashoffset') ?? '0'
      })),
      bars: bars.map((b) => ({
        h: b.getAttribute('height') ?? '0',
        y: b.getAttribute('y') ?? '0'
      }))
    }
  })
}

/** 两次几何采样的最大绝对差（<0.01 → 几何未变）。 */
function geometryDiff(a, b) {
  const flat = (g) => [
    ...g.segs.flatMap((s) => [...s.dasharray.split(/\s+/).map(Number), Number(s.dashoffset)]),
    ...g.bars.flatMap((bar) => [Number(bar.h), Number(bar.y)])
  ]
  const fa = flat(a)
  const fb = flat(b)
  let maxDiff = 0
  for (let i = 0; i < Math.max(fa.length, fb.length); i++) {
    maxDiff = Math.max(maxDiff, Math.abs((fa[i] ?? 0) - (fb[i] ?? 0)))
  }
  return maxDiff
}

/** 点击菜单进入记账面板（仅等待面板出现；loadLedger 为异步，等待统计卡可见即可）。 */
async function openLedgerPanelRaw(page) {
  await page.locator('[data-testid="wb-menu-ledger"]').click()
  await page.waitForSelector('[data-testid="ld-stat-income"]', { state: 'visible', timeout: 15000 })
}

/** 点击菜单进入记账面板并等待图表渲染完成（正常场景：柱/环出现即数据已就绪）。 */
async function openLedgerPanel(page) {
  await openLedgerPanelRaw(page)
  await page.waitForSelector('[data-testid="ld-trend-bar-0-income"]', { state: 'visible', timeout: 15000 })
  await page.waitForSelector('[data-testid="ld-donut-seg-0"]', { state: 'visible', timeout: 15000 })
}

let browser
try {
  await ensureDevServer()
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  // ===== 打开工作台 + 点击「记账」菜单 =====
  await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wb-menu-ledger"]', { state: 'visible', timeout: 15000 })
  const menuLabel = (await page.locator('[data-testid="wb-menu-ledger"] .wb-menu-label').textContent()).trim()
  record('a) 左侧菜单「记账」项存在', menuLabel.includes('记账'), { menuLabel })

  // ===== 数据注入（必须早于 loadLedger：WorkbenchLedger 每次挂载 onMounted 都重读 IDB，
  //     故在本页已打开、菜单点击前注入即可，注入 promise 返回后数据已落库）=====
  const normalData = buildNormalLedgerData()
  const injected = await injectLedgerData(page, normalData)
  record('注入正常场景数据（6 个月 × 4 分类，含当前月，共 24 条）', injected === true, {
    categories: normalData.categories.length,
    entries: normalData.entries.length
  })

  await openLedgerPanel(page)
  record('b) 点击「记账」菜单 → 记账面板可见', await page.locator('[data-testid="ld-stat-income"]').isVisible(), {})

  // ===== 断言 6 个统计卡存在且可见 =====
  const statResults = {}
  for (const tid of STAT_TESTIDS) {
    await page.waitForSelector(`[data-testid="${tid}"]`, { state: 'visible', timeout: 10000 })
    const visible = await page.locator(`[data-testid="${tid}"]`).isVisible()
    const text = (await page.locator(`[data-testid="${tid}"]`).textContent()).trim()
    statResults[tid] = { visible, text: text.slice(0, 40) }
  }
  const allStatsVisible = STAT_TESTIDS.every((tid) => statResults[tid].visible)
  record('c) 6 个统计卡（income/expense/balance/deposit/count/ratio）全部可见', allStatsVisible, statResults)

  // ===== 月份导航元素存在 =====
  const monthResults = {}
  for (const tid of MONTH_TESTIDS) {
    await page.waitForSelector(`[data-testid="${tid}"]`, { state: 'visible', timeout: 10000 })
    monthResults[tid] = await page.locator(`[data-testid="${tid}"]`).isVisible()
  }
  const allMonthNav = MONTH_TESTIDS.every((v) => monthResults[v])
  record('d) 月份导航（上月/下月/月份输入/本月）存在', allMonthNav, monthResults)

  // ===== S1) 趋势柱状图：6 个月 × 2 柱 + 网格线 + 坐标对齐 =====
  const barCount = await page.locator('[data-testid^="ld-trend-bar-"]').count()
  const gridCount = await page.locator('[data-testid="ld-trend"] .ld-trend-gridline').count()
  const maxLabelVisible = await page.locator('[data-testid="ld-trend-max"]').isVisible()
  const maxLabelText = (await page.locator('[data-testid="ld-trend-max"]').textContent()).trim()
  const monthLabelCount = await page.locator('[data-testid^="ld-trend-month-"]').count()
  let wellFormedBars = true
  for (let i = 0; i < 6; i++) {
    for (const kind of ['income', 'expense']) {
      const c = await page.locator(`[data-testid="ld-trend-bar-${i}-${kind}"]`).count()
      if (c !== 1) wellFormedBars = false
    }
  }
  const barGeos = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="ld-trend-bar-"]')).map((b) => ({
      h: Number(b.getAttribute('height')),
      y: Number(b.getAttribute('y'))
    }))
  )
  const gridYs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="ld-trend"] .ld-trend-gridline')).map((l) =>
      Number(l.getAttribute('y1'))
    )
  )
  const topGridY = Math.min(...gridYs) // 顶部网格线 = maxY 线
  const maxBar = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="ld-trend-bar-5-income"]')
    return { h: Number(b.getAttribute('height')), y: Number(b.getAttribute('y')) }
  })
  const allBarsPositive = barGeos.every((b) => b.h > 0 && b.y >= 0)
  const topAligned = Math.abs(maxBar.y - topGridY) <= 1
  record(
    'S1) 趋势柱状图 6 个月×2 柱 + 5 网格线 + 6 月标签 + 最高柱与顶部网格线对齐 ≤1px',
    barCount === 12 &&
      gridCount === 5 &&
      maxLabelVisible &&
      monthLabelCount === 6 &&
      wellFormedBars &&
      allBarsPositive &&
      topAligned,
    { barCount, gridCount, maxLabelText, monthLabelCount, wellFormedBars, allBarsPositive, topBarY: maxBar.y, topGridY, topAligned }
  )

  // ===== S2) 环形图周长不变量 + 配色 + 中心默认掩码 =====
  const segData = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="ld-ratio-block"] [data-testid^="ld-donut-seg-"]')).map((s) => ({
      dasharray: s.getAttribute('stroke-dasharray'),
      stroke: s.getAttribute('stroke'),
      cls: s.getAttribute('class') ?? ''
    }))
  )
  const dashTokens = segData.map((s) => s.dasharray.split(/\s+/).map(Number))
  const sumFirstTokens = dashTokens.reduce((acc, t) => acc + t[0], 0)
  const perSegSumOk = dashTokens.every((t) => Math.abs(t[0] + t[1] - RING_C) < 2)
  const segCountOk = segData.length >= 2 && segData.length === 3
  const firstIsAccent = segData.length > 0 && segData[0].cls.includes('is-accent') && segData[0].stroke === null
  const laterStrokes = segData.slice(1).map((s) => s.stroke)
  const laterHexDistinct =
    laterStrokes.length >= 2 &&
    laterStrokes.every((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) &&
    new Set(laterStrokes).size === laterStrokes.length
  const centerText = (await page.locator('[data-testid="ld-donut-center"]').textContent()).trim()
  record(
    'S2) 环形图周长不变量（Σdash≈2π×90；每段 dash+rest≈2π×90）+ 首段 accent/后续 hex 互异 + 中心默认掩码 ****',
    segCountOk &&
      Math.abs(sumFirstTokens - RING_C) < 2 &&
      perSegSumOk &&
      firstIsAccent &&
      laterHexDistinct &&
      centerText === '****',
    {
      segCount: segData.length,
      sumFirstTokens: +sumFirstTokens.toFixed(3),
      RING_C: +RING_C.toFixed(4),
      perSegSumOk,
      firstIsAccent,
      laterStrokes,
      centerText
    }
  )

  // ===== S3) 趋势空态：注入远未来数据 → 近 6 月窗口全 0 =====
  const futureInjected = await injectLedgerData(page, buildFutureLedgerData())
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wb-menu-ledger"]', { state: 'visible', timeout: 15000 })
  await openLedgerPanelRaw(page)
  await page.locator('[data-testid="ld-today"]').click() // 确保当前展示月 = 当月
  await page.waitForSelector('[data-testid="ld-trend-empty"]', { state: 'visible', timeout: 15000 })
  const emptyVisible = await page.locator('[data-testid="ld-trend-empty"]').isVisible()
  const trendCardExists = (await page.locator('[data-testid="ld-trend"]').count()) === 1
  const emptyBarCount = await page.locator('[data-testid^="ld-trend-bar-"]').count()
  const donutAbsent = (await page.locator('[data-testid="ld-donut"]').count()) === 0
  record(
    'S3) 趋势空态（远未来数据 → ld-trend-empty 可见、0 柱、趋势卡仍在、环形图隐藏）',
    futureInjected === true && emptyVisible && trendCardExists && emptyBarCount === 0 && donutAbsent,
    { emptyVisible, trendCardExists, emptyBarCount, donutAbsent }
  )

  // ===== 恢复正常场景（供 S4-S7 使用）=====
  await injectLedgerData(page, buildNormalLedgerData())
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wb-menu-ledger"]', { state: 'visible', timeout: 15000 })
  await openLedgerPanel(page)

  // ===== S4) 显示金额不改变几何 =====
  const geoBefore = await captureChartGeometry(page)
  const centerBefore = (await page.locator('[data-testid="ld-donut-center"]').textContent()).trim()
  const legendBefore = await page.locator('[data-testid^="ld-donut-legend-"]').allTextContents()
  await page.locator('[data-testid="ld-toggle-amounts"]').click()
  await page.waitForFunction(() => {
    const t = document.querySelector('[data-testid="ld-donut-center"]')?.textContent ?? ''
    return t.trim() !== '****'
  })
  const geoAfter = await captureChartGeometry(page)
  const centerAfter = (await page.locator('[data-testid="ld-donut-center"]').textContent()).trim()
  const legendAfter = await page.locator('[data-testid^="ld-donut-legend-"]').allTextContents()
  const maxGeoDiff = geometryDiff(geoBefore, geoAfter)
  const legendChanged = legendAfter.some((t, i) => t !== (legendBefore[i] ?? ''))
  const legendRevealed = legendAfter.some((t) => !t.includes('****') && /\d/.test(t))
  record(
    'S4) 显示金额不改变图表几何（dasharray/dashoffset/柱高/y 差 <0.01），中心与图例转明文',
    maxGeoDiff < 0.01 && centerBefore === '****' && centerAfter !== '****' && legendChanged && legendRevealed,
    { maxGeoDiff: +maxGeoDiff.toFixed(4), centerBefore, centerAfter, legendChanged, legendRevealed }
  )

  // ===== S5) 环形图图例完整性（当前处于 reveal 态，可校验真实百分比）=====
  const legendIds = await page
    .locator('[data-testid^="ld-donut-legend-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
  const legendTexts = await page.locator('[data-testid^="ld-donut-legend-"]').allTextContents()
  const expectedLegendIds = ['ld-donut-legend-mortgage', 'ld-donut-legend-food', 'ld-donut-legend-travel']
  const idsOk = expectedLegendIds.every((id) => legendIds.includes(id)) && legendIds.length === expectedLegendIds.length
  const dotCount = await page.locator('[data-testid^="ld-donut-legend-"] .ld-donut-dot').count()
  const dotsOk = dotCount === expectedLegendIds.length
  const namesOk = ['房贷', '餐饮', '出行'].every((n) => legendTexts.some((t) => t.includes(n)))
  const noIncomeCat = legendTexts.every((t) => !t.includes('工资'))
  const sepOk = legendTexts.every((t) => t.includes('·'))
  const percentOk = legendTexts.some((t) => /%/.test(t))
  record(
    'S5) 环形图图例完整（3 个支出分类：房贷/餐饮/出行，含色点+名称+·分隔值+百分比，不含收入分类）',
    idsOk && dotsOk && namesOk && noIncomeCat && sepOk && percentOk,
    { legendIds, legendTexts, dotsOk, namesOk, noIncomeCat, sepOk, percentOk }
  )

  // ===== S6) 回归：既有 UI 全部完好 =====
  let statsVisibleAgain = true
  const statAgain = {}
  for (const tid of STAT_TESTIDS) {
    const v = await page.locator(`[data-testid="${tid}"]`).isVisible()
    statAgain[tid] = v
    if (!v) statsVisibleAgain = false
  }
  let monthNavAgain = true
  const navAgain = {}
  for (const tid of MONTH_TESTIDS) {
    const v = await page.locator(`[data-testid="${tid}"]`).isVisible()
    navAgain[tid] = v
    if (!v) monthNavAgain = false
  }
  const addVisible = await page.locator('[data-testid="ld-add"]').isVisible()
  const toggleVisible = await page.locator('[data-testid="ld-toggle-amounts"]').isVisible()
  const listToggleVisible = await page.locator('[data-testid="ld-toggle-list"]').isVisible()
  const ratioVisible = await page.locator('[data-testid="ld-ratio-block"]').isVisible()
  // 记录列表默认收起 → 展开后校验条目存在；展开列表自动收起图表（一屏空间契约）
  await page.locator('[data-testid="ld-toggle-list"]').click()
  await page.waitForSelector('[data-testid="ld-item"]', { state: 'visible', timeout: 5000 })
  const itemCount = await page.locator('[data-testid="ld-item"]').count()
  const chartsToggleExists = (await page.locator('[data-testid="ld-charts-toggle"]').count()) === 1
  const chartsRowHidden = await page.locator('.ld-charts-row').evaluate((el) => getComputedStyle(el).display === 'none')
  record(
    'S6) 回归：6 统计卡/月份导航/新增/掩码开关/列表开关/占比块 + 记录条目（展开后 ≥1）+ 展开列表自动收起图表全部完好',
    statsVisibleAgain &&
      monthNavAgain &&
      addVisible &&
      toggleVisible &&
      listToggleVisible &&
      ratioVisible &&
      itemCount >= 1 &&
      chartsToggleExists &&
      chartsRowHidden,
    { statAgain, navAgain, addVisible, toggleVisible, listToggleVisible, ratioVisible, itemCount, chartsToggleExists, chartsRowHidden }
  )

  // 收起记录 → 图表恢复展开（S7 截图呈现默认视觉形态）
  await page.locator('[data-testid="ld-toggle-list"]').click()
  await page.waitForTimeout(300)

  // ===== e) 证据截图（脚本内 fs.writeFileSync，禁止 Write 工具）=====
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.screenshot({ path: EVIDENCE_PNG, fullPage: true })
  const pngSize = existsSync(EVIDENCE_PNG) ? statSync(EVIDENCE_PNG).size : 0
  record('e) 证据截图写入', pngSize > 0, { path: EVIDENCE_PNG, bytes: pngSize })

  // ===== S7) 明/暗主题全页截图 =====
  // 回到默认掩码态（视觉上展示默认形态），确保当前处于 reveal 态则切回
  const centerNow = (await page.locator('[data-testid="ld-donut-center"]').textContent()).trim()
  if (centerNow !== '****') {
    await page.locator('[data-testid="ld-toggle-amounts"]').click()
    await page.waitForFunction(() => {
      const t = document.querySelector('[data-testid="ld-donut-center"]')?.textContent ?? ''
      return t.trim() === '****'
    })
  }
  await page.screenshot({ path: EVIDENCE_LIGHT, fullPage: true })
  const lightSize = existsSync(EVIDENCE_LIGHT) ? statSync(EVIDENCE_LIGHT).size : 0
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(200)
  await page.screenshot({ path: EVIDENCE_DARK, fullPage: true })
  const darkSize = existsSync(EVIDENCE_DARK) ? statSync(EVIDENCE_DARK).size : 0
  record('S7) 明/暗主题全页截图写入', lightSize > 0 && darkSize > 0, {
    light: { path: EVIDENCE_LIGHT, bytes: lightSize },
    dark: { path: EVIDENCE_DARK, bytes: darkSize }
  })

  const totalPassed = results.filter((r) => r.ok).length
  const verdict = totalPassed === results.length && results.length > 0 ? 'PASS' : 'FAIL'
  const qa = {
    command: 'node scripts/qa-ledger-charts.mjs',
    result: `${verdict} (${totalPassed}/${results.length})`,
    browser: 'chromium (playwright, headless)',
    dev_server: `vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
    injection: 'page.evaluate → IndexedDB easy-web-tab v5 / ledger / items（点击菜单挂载 loadLedger 前注入）',
    evidence_png: EVIDENCE_PNG,
    evidence_light: EVIDENCE_LIGHT,
    evidence_dark: EVIDENCE_DARK,
    assertions: results
  }
  writeFileSync(
    EVIDENCE_LOG,
    JSON.stringify({ task: 'ledger-charts: QA 全量契约 S1-S7（近 6 月收支趋势柱状图 + 支出分类占比环形图 + 回归断言）', qa }, null, 2),
    'utf8'
  )
  console.log(`[qa] QA evidence log written: ${EVIDENCE_LOG}`)
  if (verdict !== 'PASS') process.exitCode = 1
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  if (browser) await browser.close().catch(() => {})
} finally {
  if (browser) await browser.close()
  stopDevServer()
}
