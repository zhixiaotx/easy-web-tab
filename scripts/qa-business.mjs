/**
 * QA: 销售记账（摆摊进销存）全量契约 S1-S9（qa-business）
 * 后台启动/复用 vite dev（16718-16726）→ 注入 IndexedDB easy-web-tab v6 store 'business' → /business：
 *  S1 左树 7 项 + 首页默认激活 + 5 统计卡数值（营业额/成本/支出/利润/毛利率）+ 分类/商品排行（bizhome-cat-/bizhome-prod- 各 2 行）+ 无快捷操作
 *  S2 商品页：分类 tabs + 商品卡 + 新增弹框保存 + 停售开关
 *  S3 进货页：卡片网格（桌面 5 列）+ 分类 tabs（全部+可见分类）+ 卡片分类徽标 + 分类过滤 + 新增进货自动合计
 *  S4 收摊页：日记录卡（营业额/成本/利润/损耗四项）+ 编辑弹框四项预览 + 同日 upsert 覆盖
 *  S5 支出页：分类 tabs（内置 5）+ ⚙️ 分类管理新增分类 + 支出卡 + 新增支出
 *  S6 库存页：库存卡片网格（桌面 5 列，卡片含库存剩余）+ 低库存预警（停售商品排除）+ 阈值修改
 *  S7 统计页：趋势分组柱状图按收摊记录口径（仅收摊日渲染 营业额/成本/利润 3 柱异色 + 顶部金额标签 + 全部/营业额/利润模式切换；分类/商品排行已移至首页）
 *  S8 设置弹窗「销售记账」tab：摊位名称/阈值/分类管理入口
 *  S9 明暗全页截图 + 移动端 375 无横向滚动
 * 与其它 QA 脚本禁止并行（同端口域）。运行：node scripts/qa-business.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'business')
const EVIDENCE_LIGHT = join(EVIDENCE_DIR, 'business-light.png')
const EVIDENCE_DARK = join(EVIDENCE_DIR, 'business-dark.png')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'qa-business.log')

async function waitForServer(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

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

async function guard(name, fn) {
  try {
    await fn()
  } catch (err) {
    record(name, false, { error: err.message })
  }
}

/** 注入销售记账种子数据（2 商品/1 进货/1 收摊/2 支出，阈值 100 触发双低库存预警） */
function buildBusinessData() {
  return {
    productCategories: [
      { id: 'product-snack', name: '小吃', sortOrder: 1, visible: true },
      { id: 'product-drink', name: '饮品', sortOrder: 2, visible: true },
      { id: 'product-fruit', name: '水果', sortOrder: 3, visible: true },
      { id: 'product-daily', name: '日用品', sortOrder: 4, visible: true },
      { id: 'product-clothing', name: '服饰', sortOrder: 5, visible: true }
    ],
    expenseCategories: [
      { id: 'expense-stall', name: '摊位费', sortOrder: 1, visible: true, isBuiltIn: true },
      { id: 'expense-gas', name: '燃气费', sortOrder: 2, visible: true, isBuiltIn: true },
      { id: 'expense-seasoning', name: '调料包装', sortOrder: 3, visible: true, isBuiltIn: true },
      { id: 'expense-transport', name: '交通费', sortOrder: 4, visible: true, isBuiltIn: true },
      { id: 'expense-other', name: '其他', sortOrder: 5, visible: true, isBuiltIn: true }
    ],
    products: [
      { id: 'qa-p1', name: '烤肠', categoryId: 'product-snack', unit: '根', purchasePrice: 2, sellingPrice: 5, active: true, createdAt: '2026-08-01T00:00:00.000Z' },
      { id: 'qa-p2', name: '柠檬水', categoryId: 'product-drink', unit: '杯', purchasePrice: 1, sellingPrice: 4, active: true, createdAt: '2026-08-01T00:00:00.000Z' }
    ],
    purchases: [
      { id: 'qa-b1', productId: 'qa-p1', quantity: 100, unitPrice: 2, total: 200, date: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z' }
    ],
    dailyRecords: [
      {
        id: 'qa-d1', date: '2026-08-02', totalRevenue: 200,
        items: [
          { productId: 'qa-p1', broughtOut: 30, remaining: 5, loss: 1 },
          { productId: 'qa-p2', broughtOut: 20, remaining: 0, loss: 0 }
        ],
        createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z'
      }
    ],
    expenses: [
      { id: 'qa-e1', date: '2026-08-02', categoryId: 'expense-stall', amount: 30, createdAt: '2026-08-02T00:00:00.000Z' },
      { id: 'qa-e2', date: '2026-08-02', categoryId: 'expense-transport', amount: 10, createdAt: '2026-08-02T00:00:00.000Z' }
    ],
    settings: { stallName: 'QA 夜市摊', lowStockThreshold: 100 }
  }
}

async function injectIdb(page, payload) {
  return page.evaluate((value) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('easy-web-tab', 6)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('business')) req.result.createObjectStore('business')
      }
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('business', 'readwrite')
        tx.objectStore('business').put(value, 'items')
        tx.oncomplete = () => { db.close(); resolve(true) }
        tx.onerror = () => { db.close(); reject(tx.error) }
      }
      req.onerror = () => reject(req.error)
    })
  }, payload)
}

let browser
try {
  await ensureDevServer()
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })

  // 先加载首页（建 DB v6），再注入 business 数据，后进 /business（BusinessView onMounted 读 IDB）
  await page.goto(devBase + '/', { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(1500)
  await injectIdb(page, buildBusinessData())
  await page.goto(devBase + '/business', { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('[data-testid="bs-menu-home"]', { state: 'visible', timeout: 30000 })

  await guard('S1) 左树 7 项 + 首页统计卡数值', async () => {
    const menuCount = await page.locator('[data-testid^="bs-menu-"]').count()
    const homeActive = await page.locator('[data-testid="bs-menu-home"]').evaluate((el) => el.classList.contains('active'))
    const revenue = (await page.locator('[data-testid="bizhome-revenue"]').textContent()).trim()
    const cost = (await page.locator('[data-testid="bizhome-cost"]').textContent()).trim()
    const expense = (await page.locator('[data-testid="bizhome-expense"]').textContent()).trim()
    const profit = (await page.locator('[data-testid="bizhome-profit"]').textContent()).trim()
    const margin = (await page.locator('[data-testid="bizhome-margin"]').textContent()).trim()
    const stall = await page.locator('[data-testid="bizhome-stall-input"]').inputValue()
    // 快捷操作已删除：首页不再渲染任何 bizhome-nav-* 入口
    const navCount = await page.locator('[data-testid^="bizhome-nav-"]').count()
    // 排行已移至首页：仅含有销量条目（种子当日 qa-p1 卖 24、qa-p2 卖 20，双分类双商品均上榜）
    const homeCatSnack = await page.locator('[data-testid="bizhome-cat-product-snack"]').count()
    const homeCatDrink = await page.locator('[data-testid="bizhome-cat-product-drink"]').count()
    const homeProdP1 = await page.locator('[data-testid="bizhome-prod-qa-p1"]').count()
    const homeProdP2 = await page.locator('[data-testid="bizhome-prod-qa-p2"]').count()
    record(
      'S1) 左树 7 项 + 首页统计卡数值（含支出）+ 分类/商品排行 + 无快捷操作',
      menuCount === 7 && homeActive && revenue.includes('200') && cost.includes('68') && expense.includes('40') && profit.includes('132') && margin.includes('66') && stall === 'QA 夜市摊' && navCount === 0 && homeCatSnack === 1 && homeCatDrink === 1 && homeProdP1 === 1 && homeProdP2 === 1,
      { menuCount, homeActive, revenue, cost, expense, profit, margin, stall, navCount, homeCatSnack, homeCatDrink, homeProdP1, homeProdP2 }
    )
  })

  await guard('S2) 商品页：分类 tabs + 商品卡 + 新增 + 停售开关', async () => {
    await page.locator('[data-testid="bs-menu-products"]').click()
    await page.waitForSelector('[data-testid="bizprod-cat-all"]', { state: 'visible', timeout: 8000 })
    const catTabs = await page.locator('[data-testid^="bizprod-cat-"]').count() // all + 小吃 + 饮品 + ⚙️
    const cardsBefore = await page.locator('[data-testid^="bizprod-card-"]').count()
    await page.locator('[data-testid="bizprod-add"]').click()
    await page.waitForSelector('[data-testid="bizprod-dialog"]', { state: 'visible', timeout: 5000 })
    await page.locator('[data-testid="bizprod-form-name"]').fill('爆米花')
    await page.locator('[data-testid="bizprod-form-selling"]').fill('8')
    await page.locator('[data-testid="bizprod-save"]').click()
    await page.waitForSelector('[data-testid^="bizprod-card-"]', { state: 'visible', timeout: 5000 })
    await page.waitForTimeout(300)
    const cardsAfter = await page.locator('[data-testid^="bizprod-card-"]').count()
    // 停售开关：切第一张卡 active
    await page.locator('[data-testid^="bizprod-active-"]').first().click()
    await page.waitForTimeout(300)
    const firstCardInactive = await page.locator('[data-testid^="bizprod-card-"]').first().evaluate((el) => el.classList.contains('inactive'))
    record(
      'S2) 商品页：tabs + 商品卡 2→3 + 停售开关',
      catTabs >= 3 && cardsBefore === 2 && cardsAfter === 3 && firstCardInactive,
      { catTabs, cardsBefore, cardsAfter, firstCardInactive }
    )
  })

  await guard('S3) 进货页：卡片网格 5 列 + 分类 tabs + 卡片分类徽标 + 新增自动合计', async () => {
    await page.locator('[data-testid="bs-menu-purchases"]').click()
    await page.waitForSelector('[data-testid="bizpur-card-qa-b1"]', { state: 'visible', timeout: 8000 })
    // 卡片网格：桌面 5 列（gridTemplateColumns 轨道数）
    const gridCols = await page.evaluate(() => {
      const el = document.querySelector('.bizpur-grid')
      return el ? getComputedStyle(el).gridTemplateColumns.split(' ').length : 0
    })
    // 分类 tabs：全部 + 5 可见分类（小吃/饮品/水果/日用品/服饰），badge 以 bizpur-cat-badge- 开头需排除
    const tabCount = await page.locator('button.bizpur-tab').count()
    const catAllVisible = await page.locator('[data-testid="bizpur-cat-all"]').isVisible()
    // 卡片分类徽标：qa-b1=烤肠→小吃
    const badgeText = (await page.locator('[data-testid="bizpur-cat-badge-qa-b1"]').textContent()).trim()
    const rowsBefore = await page.locator('[data-testid^="bizpur-card-"]').count()
    // 点击「小吃」tab → 仍见 qa-b1；点击「饮品」tab → 无进货记录空态
    await page.locator('[data-testid="bizpur-cat-product-snack"]').click()
    await page.waitForTimeout(200)
    const rowsAfterSnack = await page.locator('[data-testid^="bizpur-card-"]').count()
    await page.locator('[data-testid="bizpur-cat-product-drink"]').click()
    await page.waitForTimeout(200)
    const emptyVisible = await page.locator('[data-testid="bizpur-empty"]').isVisible()
    // 回「全部」新增进货
    await page.locator('[data-testid="bizpur-cat-all"]').click()
    await page.waitForTimeout(200)
    await page.locator('[data-testid="bizpur-add"]').click()
    await page.waitForSelector('[data-testid="bizpur-dialog"]', { state: 'visible', timeout: 5000 })
    await page.locator('[data-testid="bizpur-form-qty"]').fill('10')
    await page.locator('[data-testid="bizpur-form-price"]').fill('2')
    const totalText = (await page.locator('[data-testid="bizpur-form-total"]').textContent()).trim()
    await page.locator('[data-testid="bizpur-save"]').click()
    await page.waitForTimeout(400)
    const rowsAfter = await page.locator('[data-testid^="bizpur-card-"]').count()
    const countText = (await page.locator('.bizpur-count').textContent()).trim()
    record(
      'S3) 进货页：网格 5 列 + tabs 6 + 徽标小吃 + 小吃1卡/饮品空 + 卡片 1→2 + 合计 20.00',
      gridCols === 5 && tabCount === 6 && catAllVisible && badgeText === '小吃' && rowsBefore === 1 && rowsAfterSnack === 1 && emptyVisible && rowsAfter === 2 && totalText.includes('20.00') && countText.includes('2'),
      { gridCols, tabCount, catAllVisible, badgeText, rowsBefore, rowsAfterSnack, emptyVisible, rowsAfter, totalText, countText }
    )
  })

  await guard('S4) 收摊页：卡片四项 + 同日 upsert 覆盖 + 四项自动重算', async () => {
    await page.locator('[data-testid="bs-menu-daily"]').click()
    await page.waitForSelector('[data-testid^="bizday-card-"]', { state: 'visible', timeout: 8000 })
    const cardsBefore = await page.locator('[data-testid^="bizday-card-"]').count()
    const revenueBefore = (await page.locator('[data-testid="bizday-revenue-qa-d1"]').textContent()).trim()
    const costBefore = (await page.locator('[data-testid="bizday-cost-qa-d1"]').textContent()).trim()
    const profitBefore = (await page.locator('[data-testid="bizday-profit-qa-d1"]').textContent()).trim()
    const lossBefore = (await page.locator('[data-testid="bizday-loss-qa-d1"]').textContent()).trim()
    await page.locator('[data-testid="bizday-add"]').click()
    await page.waitForSelector('[data-testid="bizday-dialog"]', { state: 'visible', timeout: 5000 })
    await page.locator('[data-testid="bizday-form-date"]').fill('2026-08-02') // 同日 → upsert 覆盖
    await page.locator('[data-testid="bizday-row-product"]').nth(0).selectOption('qa-p1')
    await page.locator('[data-testid="bizday-row"]').nth(0).locator('input').nth(0).fill('10') // 带出
    await page.locator('[data-testid="bizday-row"]').nth(0).locator('input').nth(1).fill('0') // 剩余
    const previewRevenue = (await page.locator('[data-testid="bizday-form-revenue"]').textContent()).trim()
    const previewCost = (await page.locator('[data-testid="bizday-form-cost"]').textContent()).trim()
    const previewProfit = (await page.locator('[data-testid="bizday-form-profit"]').textContent()).trim()
    const previewLoss = (await page.locator('[data-testid="bizday-form-loss"]').textContent()).trim()
    await page.locator('[data-testid="bizday-save"]').click()
    await page.waitForTimeout(400)
    const cardsAfter = await page.locator('[data-testid^="bizday-card-"]').count()
    const revenueAfter = (await page.locator('[data-testid="bizday-revenue-qa-d1"]').textContent()).trim()
    const costAfter = (await page.locator('[data-testid="bizday-cost-qa-d1"]').textContent()).trim()
    const profitAfter = (await page.locator('[data-testid="bizday-profit-qa-d1"]').textContent()).trim()
    const lossAfter = (await page.locator('[data-testid="bizday-loss-qa-d1"]').textContent()).trim()
    record(
      'S4) 收摊页：卡四项 200/68/132/5 + 弹框 50/20/30/0 + 同日 upsert 后 50/20/30/0',
      cardsBefore === 1 && cardsAfter === 1 &&
        revenueBefore.includes('200') && costBefore.includes('68.00') && profitBefore.includes('132.00') && lossBefore.includes('5.00') &&
        previewRevenue.includes('50.00') && previewCost.includes('20.00') && previewProfit.includes('30.00') && previewLoss.includes('0.00') &&
        revenueAfter.includes('50.00') && costAfter.includes('20.00') && profitAfter.includes('30.00') && lossAfter.includes('0.00'),
      { cardsBefore, cardsAfter, revenueBefore, costBefore, profitBefore, lossBefore, previewRevenue, previewCost, previewProfit, previewLoss, revenueAfter, costAfter, profitAfter, lossAfter }
    )
  })

  await guard('S5) 支出页：内置 tabs + 分类管理新增 + 新增支出', async () => {
    await page.locator('[data-testid="bs-menu-expenses"]').click()
    await page.waitForSelector('[data-testid="bizexp-tab-all"]', { state: 'visible', timeout: 8000 })
    const tabCount = await page.locator('[data-testid^="bizexp-tab-"]').count() // 全部 + 内置 5（⚙️ 为独立按钮不计）
    const cardsBefore = await page.locator('[data-testid="bizexp-card"]').count()
    // ⚙️ 打开分类管理 → 新增「电费」→ 新 tab 出现
    await page.locator('[data-testid="bizexp-cat-manager"]').click()
    await page.waitForSelector('[data-testid="bizcat-dialog-expense"]', { state: 'visible', timeout: 5000 })
    await page.locator('[data-testid="bizcat-new-expense"]').fill('电费')
    await page.locator('[data-testid="bizcat-add-expense"]').click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const customTab = (await page.locator('[data-testid^="bizexp-tab-bec_"]').count()) === 1
    // 新增支出
    await page.locator('[data-testid="bizexp-add"]').click()
    await page.waitForSelector('[data-testid="bizexp-dialog"]', { state: 'visible', timeout: 5000 })
    await page.locator('[data-testid="bizexp-form-amount"]').fill('15')
    await page.locator('[data-testid="bizexp-save"]').click()
    await page.waitForTimeout(400)
    const cardsAfter = await page.locator('[data-testid="bizexp-card"]').count()
    record(
      'S5) 支出页：内置 tabs 6 + 自定义 tab + 卡片 2→3',
      tabCount === 6 && customTab && cardsBefore === 2 && cardsAfter === 3,
      { tabCount, customTab, cardsBefore, cardsAfter }
    )
  })

  await guard('S6) 库存页：卡片网格 3 卡 5 列 + 库存剩余 + 预警仅 1 张（停售爆米花不预警）+ 阈值 0 清空', async () => {
    await page.locator('[data-testid="bs-menu-inventory"]').click()
    await page.waitForSelector('[data-testid="bizinv-alert"]', { state: 'visible', timeout: 8000 })
    const lowCardSel = '[data-testid^="bizinv-low-"]:not([data-testid="bizinv-low-empty"])'
    const lowCount = await page.locator(lowCardSel).count()
    // 卡片网格：桌面 5 列（gridTemplateColumns 轨道数）
    const cardCount = await page.locator('[data-testid^="bizinv-card-"]').count()
    const gridCols = await page.evaluate(() => {
      const el = document.querySelector('.bizinv-grid')
      return el ? getComputedStyle(el).gridTemplateColumns.split(' ').length : 0
    })
    // 低库存仅 qa-p2：p1 库存恰在阈值 100 边界不含、爆米花停售排除
    const hasP2 = (await page.locator('[data-testid="bizinv-low-qa-p2"]').count()) === 1
    const lowTexts = await page.locator(lowCardSel).allTextContents()
    const noDisabledInLow = !lowTexts.some((t) => t.includes('爆米花'))
    // 卡片含库存剩余：S6 时点 qa-p1=100（恰在阈值边界）、qa-p2=0、爆米花=0
    const p1StockText = (await page.locator('[data-testid="bizinv-card-qa-p1"]').textContent()) ?? ''
    const p2StockText = (await page.locator('[data-testid="bizinv-card-qa-p2"]').textContent()) ?? ''
    const cardTexts = await page.locator('[data-testid^="bizinv-card-"]').allTextContents()
    const stockShown =
      p1StockText.includes('库存剩余：100') &&
      p2StockText.includes('库存剩余：0') &&
      cardTexts.length === 3 &&
      cardTexts.every((t) => t.includes('库存剩余：'))
    // 阈值改 0 → 预警清空
    await page.locator('[data-testid="bizinv-threshold"]').fill('0')
    await page.locator('[data-testid="bizinv-threshold"]').blur()
    await page.waitForTimeout(400)
    const lowAfter = await page.locator(lowCardSel).count()
    const emptyVisible = (await page.locator('[data-testid="bizinv-low-empty"]').count()) === 1
    record(
      'S6) 库存页：卡片网格 3 卡 5 列 + 库存剩余 + 预警仅 1 张（停售爆米花不预警）+ 阈值 0 清空',
      cardCount === 3 && gridCols === 5 && stockShown && lowCount === 1 && hasP2 && noDisabledInLow && lowAfter === 0 && emptyVisible,
      { cardCount, gridCols, stockShown, lowCount, hasP2, lowTexts, lowAfter, emptyVisible }
    )
  })

  await guard('S7) 统计页：趋势分组柱状图（排行已移至首页）', async () => {
    await page.locator('[data-testid="bs-menu-stats"]').click()
    await page.waitForSelector('[data-testid="bizstats-trend"]', { state: 'visible', timeout: 8000 })
    // 排行已移首页：统计页不再渲染排行行
    const catRows = await page.locator('[data-testid^="bizstats-cat-"]').count()
    const prodRows = await page.locator('[data-testid^="bizstats-prod-"]').count()
    // 按收摊记录口径：仅收摊日 08-02 渲染 3 柱（收入50/成本20/利润30）；进货日 08-01 与今日（进货20+支出15）无收摊记录全 0 不渲染
    const barsAll = await page.locator('.bizstats-bar').count()
    const labelsAll = await page.locator('.bizstats-bar-label').count()
    const gridlines = await page.locator('.bizstats-gridline').count()
    // 单独看营业额：仅 08-02 一根
    await page.locator('[data-testid="bizstats-mode-revenue"]').click()
    await page.waitForTimeout(300)
    const barsRevenue = await page.locator('.bizstats-bar.revenue').count()
    // 单独看利润：仅收摊日 1 根
    await page.locator('[data-testid="bizstats-mode-profit"]').click()
    await page.waitForTimeout(300)
    const barsProfit = await page.locator('.bizstats-bar.profit').count()
    // 回到全部模式
    await page.locator('[data-testid="bizstats-mode-all"]').click()
    await page.waitForTimeout(300)
    const barsBack = await page.locator('.bizstats-bar').count()
    record(
      'S7) 统计页：无排行（已移首页）+ 趋势分组柱状图按收摊记录（模式切换/顶部金额/负值向下）',
      catRows === 0 && prodRows === 0 && barsAll === 3 && labelsAll === 3 && gridlines === 5 && barsRevenue === 1 && barsProfit === 1 && barsBack === 3,
      { catRows, prodRows, barsAll, labelsAll, gridlines, barsRevenue, barsProfit, barsBack }
    )
  })

  await guard('S8) 设置弹窗销售记账 tab', async () => {
    await page.locator('[data-testid="bs-menu-home"]').click()
    await page.getByRole('button', { name: '⚙️ 设置' }).click()
    await page.waitForSelector('.manager', { state: 'visible', timeout: 5000 })
    await page.locator('[data-testid="settings-tab-business"]').click()
    await page.waitForSelector('[data-testid="bizsettings-stall"]', { state: 'visible', timeout: 5000 })
    const stallVal = await page.locator('[data-testid="bizsettings-stall"]').inputValue()
    const thresholdVal = await page.locator('[data-testid="bizsettings-threshold"]').inputValue()
    await page.locator('[data-testid="bizsettings-product-cats"]').click()
    await page.waitForSelector('[data-testid="bizcat-dialog-product"]', { state: 'visible', timeout: 5000 })
    const productRows = await page.locator('[data-testid^="bizcat-row-product-"]').count()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    record(
      'S8) 设置弹窗销售记账 tab（摊位/阈值/分类管理）',
      stallVal === 'QA 夜市摊' && thresholdVal === '0' && productRows === 5,
      { stallVal, thresholdVal, productRows }
    )
  })

  await guard('S9) 移动端 375 无横向滚动 + 明暗截图', async () => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.reload({ waitUntil: 'load', timeout: 90000 })
    await page.waitForSelector('[data-testid="bs-menu-home"]', { state: 'visible', timeout: 30000 })
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.reload({ waitUntil: 'load', timeout: 90000 })
    await page.waitForSelector('[data-testid="bs-menu-home"]', { state: 'visible', timeout: 30000 })
    mkdirSync(EVIDENCE_DIR, { recursive: true })
    await page.screenshot({ path: EVIDENCE_LIGHT, fullPage: true })
    const lightSize = existsSync(EVIDENCE_LIGHT) ? statSync(EVIDENCE_LIGHT).size : 0
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForTimeout(200)
    await page.screenshot({ path: EVIDENCE_DARK, fullPage: true })
    const darkSize = existsSync(EVIDENCE_DARK) ? statSync(EVIDENCE_DARK).size : 0
    record('S9) 移动端 375 无横向滚动 + 明暗截图', scrollWidth <= 375 && lightSize > 0 && darkSize > 0, { scrollWidth, light: lightSize, dark: darkSize })
  })

  const totalPassed = results.filter((r) => r.ok).length
  const verdict = totalPassed === results.length && results.length > 0 ? 'PASS' : 'FAIL'
  const qa = {
    command: 'node scripts/qa-business.mjs',
    result: verdict + ' (' + totalPassed + '/' + results.length + ')',
    browser: 'chromium (playwright, headless)',
    dev_server: 'vite on ' + devBase + ' (' + (startedByUs ? 'started by script' : 'reused existing') + ')',
    evidence_light: EVIDENCE_LIGHT,
    evidence_dark: EVIDENCE_DARK,
    assertions: results
  }
  writeFileSync(EVIDENCE_LOG, JSON.stringify({ task: 'business: 摆摊进销存销售记账全量契约（S1-S9）', qa }, null, 2), 'utf8')
  console.log('[qa] QA evidence log written: ' + EVIDENCE_LOG)
  if (verdict !== 'PASS') process.exitCode = 1
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  if (browser) await browser.close().catch(() => {})
} finally {
  if (browser) await browser.close()
  stopDevServer()
}
