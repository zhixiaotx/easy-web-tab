/**
 * QA: 销售记账（摆摊进销存）全量契约 S1-S9（qa-business）
 * 后台启动/复用 vite dev（16718-16726）→ 注入 IndexedDB easy-web-tab v6 store 'business' → /business：
 *  S1 左树 7 项 + 首页默认激活 + 5 统计卡数值（营业额/成本/支出/利润/毛利率）+ 分类/商品排行（bizhome-cat-/bizhome-prod- 各 2 行）+ 无快捷操作
 *  S2 商品页：分类 tabs + 商品卡 + 新增弹框保存 + 停售开关
 *  S3 进货页：卡片网格（桌面 5 列）+ 分类 tabs（全部+可见分类）+ 卡片分类徽标 + 分类过滤 + 新增进货自动合计
 *  S4 收摊页：日记录卡（营业额/成本/利润/损耗四项）+ 编辑弹框四项预览 + 同日 upsert 覆盖
 *  S5 支出页：分类 tabs（内置 5）+ ⚙️ 分类管理新增分类 + 支出卡 + 新增支出
 *  S6 库存页：库存卡片网格（桌面 5 列，卡片含库存剩余）+ 低库存预警（停售商品排除）+ 阈值修改
 *  S7 统计页：趋势每日一柱堆叠分色按收摊记录口径（仅收摊日渲染 成本琥珀+利润绿两段（段高和=营业额）+ 单标签 + 柱宽>12/viewBox 320 放大 + 全部/营业额/利润模式切换；分类/商品排行已移至首页）
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

/** 当天回溯 n 天的本地日期键（YYYY-MM-DD） */
function dayAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** 收摊种子日期：动态取昨天（S4 同日 upsert 覆盖 + S7 趋势窗口共用，写死会随运行日过期） */
const SEED_DAILY_DATE = dayAgo(1)

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

/* ---- Element Plus 适配：换皮后 testid 落在 el-* 包装根（div），交互需落到内部原生控件 ---- */

/**
 * EP 内部输入框解析：el-input 的 data-testid 直接落在原生 <input>（attrs 绑到 input 本身），
 * 其余复合组件（el-input-number/el-select/el-date-editor/el-checkbox）落在包装根——统一走此处解析。
 */
async function resolveInput(page, testid, index = 0) {
  const root = page.locator(`[data-testid="${testid}"]`).nth(index)
  const isInput = await root.evaluate((el) => el.tagName === 'INPUT').catch(() => false)
  return isInput ? { target: root } : { target: root.locator('input').first() }
}

/** 填 el-input/el-input-number/el-date-editor 内部原生 input（index 横向跨同 testid 的多个实例） */
async function epFill(page, testid, value, index = 0) {
  const { target } = await resolveInput(page, testid, index)
  await target.fill(value)
  await target.blur()
  await page.waitForTimeout(150)
}

/** el-date-picker：填内部 input + Enter 提交（value-format=YYYY-MM-DD） */
async function epFillDate(page, testid, value) {
  const { target } = await resolveInput(page, testid, 0)
  await target.fill(value)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
}

/** el-select：点击包装根开下拉 → 点可见下拉项（按文本） */
async function epSelect(page, testid, optionText, index = 0) {
  await page.locator(`[data-testid="${testid}"]`).nth(index).click()
  await page.waitForTimeout(250)
  await page.locator('.el-select-dropdown__item:visible', { hasText: optionText }).first().click()
  await page.waitForTimeout(200)
}

/** 读 el-input/el-input-number/el-date-editor 内部 input 值 */
async function epInputValue(page, testid) {
  const { target } = await resolveInput(page, testid, 0)
  return target.inputValue()
}

/** 注入销售记账种子数据（2 商品/1 进货/1 收摊/2 支出，阈值 100 触发双低库存预警） */
function buildBusinessData() {
  // 收摊日期动态取昨天（模块级 SEED_DAILY_DATE 共享：S4 同日 upsert、S7 趋势窗口用同一日期）
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
        id: 'qa-d1', date: SEED_DAILY_DATE, totalRevenue: 200,
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
      const req = indexedDB.open('easy-web-tab')
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
  // S9 类失败诊断：收集页面崩溃/控制台错误，超时后随 diag 一并输出
  const pageErrors = []
  const consoleMsgs = []
  page.on('pageerror', (err) => pageErrors.push(err.message))
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(m.type() + ': ' + m.text()) })

  // 先加载首页（App 初始化建 DB v12），再注入 business 数据（open 不带版本号 → 连接既有 v12，不复刻 v6 冲突），后进 /business（BusinessView onMounted 读 IDB）
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
    const stall = (await page.locator('.bs-stall-name').textContent()).trim()
    // 快捷操作已删除：首页不再渲染任何 bizhome-nav-* 入口
    const navCount = await page.locator('[data-testid^="bizhome-nav-"]').count()
    // 排行已移至首页：分类→商品树状展开（种子当日 qa-p1 卖 24、qa-p2 卖 20，双分类双商品均上榜且默认展开前 2 个分类）
    const treeCatCount = await page.locator('[data-testid^="bizhome-tree-cat-"]').count()
    const treeProdCount = await page.locator('[data-testid^="bizhome-tree-prod-"]').count()
    record(
      'S1) 左树 7 项 + 首页统计卡数值（含支出）+ 分类/商品排行树 + 无快捷操作',
      menuCount === 7 && homeActive && revenue.includes('200') && cost.includes('68') && expense.includes('40') && profit.includes('132') && margin.includes('66') && stall === 'QA 夜市摊' && navCount === 0 && treeCatCount === 2 && treeProdCount === 2,
      { menuCount, homeActive, revenue, cost, expense, profit, margin, stall, navCount, treeCatCount, treeProdCount }
    )
  })

  await guard('S2) 商品页：分类 tabs + 商品卡 + 新增 + 停售开关', async () => {
    await page.locator('[data-testid="bs-menu-products"]').click()
    await page.waitForSelector('[data-testid="bizprod-cat-all"]', { state: 'visible', timeout: 8000 })
    const catTabs = await page.locator('[data-testid^="bizprod-cat-"]').count() // all + 小吃 + 饮品 + ⚙️
    const cardsBefore = await page.locator('[data-testid^="bizprod-card-"]').count()
    await page.locator('[data-testid="bizprod-add"]').click()
    await page.waitForSelector('[data-testid="bizprod-dialog"]', { state: 'visible', timeout: 5000 })
    await epFill(page, 'bizprod-form-name', '爆米花')
    await epFill(page, 'bizprod-form-selling', '8')
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
    // 分类 tabs：全部 + 5 可见分类（小吃/饮品/水果/日用品/服饰），badge 以 bizpur-cat-badge- 开头需排除（EP 换皮后 el-radio-button 渲染 <label> 非 <button>）
    const tabCount = await page.locator('.bizpur-tabs .el-radio-button').count()
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
    await epFill(page, 'bizpur-form-qty', '10')
    await epFill(page, 'bizpur-form-price', '2')
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
    await epFillDate(page, 'bizday-form-date', SEED_DAILY_DATE) // 与种子同日 → upsert 覆盖
    await epSelect(page, 'bizday-row-product', '烤肠', 0)
    // 行内为 el-select + 3 个 el-input-number（class bizday-num-input）；原 `input` nth(0/1) 会命中 el-select 内部输入框
    const rowNumInputs = page.locator('[data-testid="bizday-row"]').nth(0).locator('.bizday-num-input input')
    await rowNumInputs.nth(0).fill('10') // 带出
    await rowNumInputs.nth(0).blur()
    await rowNumInputs.nth(1).fill('0') // 剩余
    await rowNumInputs.nth(1).blur()
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

  await guard('S5) 支出页：分类管理新增电费 + 新增支出日卡片 1→2', async () => {
    await page.locator('[data-testid="bs-menu-expenses"]').click()
    await page.waitForSelector('[data-testid="bizexp-cat-manager"]', { state: 'visible', timeout: 8000 })
    // 支出按日分组卡片：种子 2 笔支出同在 2026-08-02 → 1 张日卡片（count() 不自动等待，先等卡片渲染）
    await page.waitForSelector('[data-testid^="bizexp-card-"]', { state: 'visible', timeout: 8000 })
    const cardsBefore = await page.locator('[data-testid^="bizexp-card-"]').count()
    // ⚙️ 打开分类管理 → 新增「电费」→ 分类行出现
    await page.locator('[data-testid="bizexp-cat-manager"]').click()
    await page.waitForSelector('[data-testid="bizcat-dialog-expense"]', { state: 'visible', timeout: 5000 })
    await epFill(page, 'bizcat-new-expense', '电费')
    await page.locator('[data-testid="bizcat-add-expense"]').click()
    await page.waitForTimeout(300)
    const customCatRow = (await page.locator('[data-testid^="bizcat-row-expense-bec_"]').count()) === 1
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    // 新增支出：2026-08-03 两行（电费 15 + 摊位费 5）→ 新日卡片
    await page.locator('[data-testid="bizexp-add"]').click()
    await page.waitForSelector('[data-testid="bizexp-dialog"]', { state: 'visible', timeout: 5000 })
    await epFillDate(page, 'bizexp-form-date', '2026-08-03')
    await epSelect(page, 'bizexp-row-category', '电费', 0)
    await epFill(page, 'bizexp-row-amount', '15', 0)
    await page.locator('[data-testid="bizexp-row-add"]').click()
    await epSelect(page, 'bizexp-row-category', '摊位费', 1)
    await epFill(page, 'bizexp-row-amount', '5', 1)
    await page.locator('[data-testid="bizexp-save"]').click()
    await page.waitForTimeout(400)
    const cardsAfter = await page.locator('[data-testid^="bizexp-card-"]').count()
    record(
      'S5) 支出页：分类管理新增电费 + 新增支出日卡片 1→2',
      customCatRow && cardsBefore === 1 && cardsAfter === 2,
      { customCatRow, cardsBefore, cardsAfter }
    )
  })

  await guard('S6) 库存页：卡片网格 3 卡 5 列 + 库存剩余 + 预警仅 1 张（停售爆米花不预警）+ 阈值 0 清空', async () => {
    await page.locator('[data-testid="bs-menu-inventory"]').click()
    await page.waitForSelector('[data-testid="bizinv-alert"]', { state: 'visible', timeout: 8000 })
    const lowCardSel = '[data-testid^="bizinv-low-"]:not([data-testid="bizinv-low-empty"])'
    const lowCount = await page.locator(lowCardSel).count()
    // 卡片网格：桌面 5 列（gridTemplateColumns 轨道数）；count() 不自动等待，先等卡片渲染
    await page.waitForSelector('[data-testid^="bizinv-card-"]', { state: 'visible', timeout: 8000 })
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
    // 阈值改 0 → 预警清空（el-input type="number"，fill 内部 input + blur 触发 commitThreshold）
    await epFill(page, 'bizinv-threshold', '0')
    await page.waitForTimeout(400)
    const lowAfter = await page.locator(lowCardSel).count()
    const emptyVisible = (await page.locator('[data-testid="bizinv-low-empty"]').count()) === 1
    record(
      'S6) 库存页：卡片网格 3 卡 5 列 + 库存剩余 + 预警仅 1 张（停售爆米花不预警）+ 阈值 0 清空',
      cardCount === 3 && gridCols === 5 && stockShown && lowCount === 1 && hasP2 && noDisabledInLow && lowAfter === 0 && emptyVisible,
      { cardCount, gridCols, stockShown, lowCount, hasP2, lowTexts, lowAfter, emptyVisible }
    )
  })

  await guard('S7) 统计页：趋势每日一柱堆叠分色（排行已移至首页）', async () => {
    await page.locator('[data-testid="bs-menu-stats"]').click()
    await page.waitForSelector('[data-testid="bizstats-trend"]', { state: 'visible', timeout: 8000 })
    // 排行已移首页：统计页不再渲染排行行（bizstats-cat-pie 为支出分类占比环形图，需排除）
    const catRows = await page.locator('[data-testid^="bizstats-cat-product-"]').count()
    const prodRows = await page.locator('[data-testid^="bizstats-prod-"]').count()
    // 每日一柱堆叠分色按收摊记录口径：仅收摊日（昨天，种子 dayAgo(1) 已保证在窗口内）两段（成本琥珀+利润绿）；count() 不自动等待，先等柱渲染
    await page.waitForSelector('.bizstats-bar', { state: 'visible', timeout: 8000 })
    const barsAll = await page.locator('.bizstats-bar').count()
    const costSegs = await page.locator('.bizstats-bar.cost').count()
    const profitSegs = await page.locator('.bizstats-bar.profit').count()
    const labelsAll = await page.locator('.bizstats-bar-label').count()
    const gridlines = await page.locator('.bizstats-gridline').count()
    // 视觉放大：单柱宽（900 宽/30 天 → barW≈20.4 > 12）远超旧分组槽位柱；viewBox 高度放大至 320
    const firstBarW = Number(await page.locator('.bizstats-bar').first().getAttribute('width'))
    const svgViewBox = String(await page.locator('.bizstats-svg').getAttribute('viewBox'))
    // 单独看营业额：仅 08-02 一段
    await page.locator('[data-testid="bizstats-mode-revenue"]').click()
    await page.waitForTimeout(300)
    const barsRevenue = await page.locator('.bizstats-bar.revenue').count()
    // 单独看利润：仅收摊日 1 段
    await page.locator('[data-testid="bizstats-mode-profit"]').click()
    await page.waitForTimeout(300)
    const barsProfit = await page.locator('.bizstats-bar.profit').count()
    // 回到全部模式
    await page.locator('[data-testid="bizstats-mode-all"]').click()
    await page.waitForTimeout(300)
    const barsBack = await page.locator('.bizstats-bar').count()
    record(
      'S7) 统计页：无排行（已移首页）+ 趋势每日一柱堆叠分色按收摊记录（2 段/单标签/宽>12/viewBox 320/模式切换）',
      catRows === 0 && prodRows === 0 && barsAll === 2 && costSegs === 1 && profitSegs === 1 && labelsAll === 1 && gridlines === 5 && firstBarW > 12 && svgViewBox.includes('900 320') && barsRevenue === 1 && barsProfit === 1 && barsBack === 2,
      { catRows, prodRows, barsAll, costSegs, profitSegs, labelsAll, gridlines, firstBarW, svgViewBox, barsRevenue, barsProfit, barsBack }
    )
  })

  await guard('S8) 设置弹窗销售记账 tab', async () => {
    await page.locator('[data-testid="bs-menu-home"]').click()
    // 设置按钮实为 <Icon name="cog"> + 文本「设置」（无障碍名无 ⚙️ 前缀），getByRole 按名字匹配失败 → 用 testid
    await page.locator('[data-testid="bs-settings"]').click()
    await page.waitForSelector('.manager', { state: 'visible', timeout: 5000 })
    await page.locator('[data-testid="settings-tab-business"]').click()
    await page.waitForSelector('[data-testid="bizsettings-stall"]', { state: 'visible', timeout: 5000 })
    const stallVal = await epInputValue(page, 'bizsettings-stall')
    const thresholdVal = await epInputValue(page, 'bizsettings-threshold')
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
    try {
      await page.waitForSelector('[data-testid="bs-menu-home"]', { state: 'visible', timeout: 30000 })
    } catch (e) {
      // 诊断：reload 后页面实际状态（URL/菜单 DOM/控制台错误），避免盲改
      const diag = await page.evaluate(() => {
        const menu = document.querySelector('[data-testid="bs-menu-home"]')
        return {
          url: location.href,
          menuExists: !!menu,
          menuCount: document.querySelectorAll('[data-testid^="bs-menu-"]').length,
          hasApp: !!document.querySelector('#app'),
          appChildren: document.querySelector('#app')?.children.length ?? -1,
          bodyText: (document.body?.innerText || '').slice(0, 160)
        }
      })
      throw new Error(
        e.message.split('\n')[0] +
          ' | diag: ' + JSON.stringify(diag) +
          ' | pageErrors: ' + JSON.stringify(pageErrors) +
          ' | console: ' + JSON.stringify(consoleMsgs.slice(-6))
      )
    }
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
