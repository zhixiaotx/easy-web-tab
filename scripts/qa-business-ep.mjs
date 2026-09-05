/**
 * QA: 销售记账（摆摊进销存）Element Plus 换皮 · 批次 E（qa-business-ep）
 * 后台启动/复用 vite dev（16718-16726）→ 注入 IndexedDB easy-web-tab store 'business' 种子 → /business：
 *  E1 商品面板：分类 tabs + 卡片在售开关（el-checkbox 往返）+ 详情抽屉（el-drawer，bizprod-detail-*）+ 编辑/新增弹框（同 bizprod-dialog el-dialog）全 el-*
 *  E2 进货面板：分类 tabs 6 个 el-radio-button + 卡片分类徽标 + 网格 5 列 + 新增弹框（日期包装 div 内 el-date-editor/el-select/el-input-number/自动合计）
 *  E3 收摊面板：卡片四项 + 新增弹框（日期包装 div 内 el-date-editor/行内 el-select + 3×el-input-number/静态四项预览）
 *  E4 支出面板：无 tabs（el-radio-button=0）+ ⚙️ 分类管理 el-button + 新增弹框（el-date-editor/行内 el-select/el-input-number/el-input）
 *  E5 库存面板：阈值 el-input（type=number）+ 低库存预警 + 库存卡（库存剩余 75/0）+ 溯源弹框 el-dialog（卡内「查看溯源」按钮点击）→ 阈值 0 清空
 *  E6 统计面板：天数/模式 el-radio-button + SVG（网格线 5/柱/标签/支出折线/双环形图）+ 模式切换回归
 *  E7 设置弹窗「销售记账」tab（activeTab business）→ 子 tab biz-base → 摊位/阈值 el-* + 分类管理入口弹框 5 行
 *  E8 商品分类管理弹框（页面 ⚙️）：el-dialog + 新增「玩具」分类 → 6 行（运行在 settings 之后，避免扰动 E7 的 5 行断言）
 * 全部面板：原生 select/textarea/input 零残留扫描（排除 EP 2.14.5 内部控件）+ 明暗全页截图
 * 数据隔离：不保存任何表单（弹框开→断言→Esc），仅在售开关往返复态、阈值落 0（E7 读取）与新增分类（E8 末位）
 * 与其它 QA 脚本禁止并行（同端口域）。运行：node scripts/qa-business-ep.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'business-ep')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'qa-business-ep.log')

/** 当天回溯 n 天的本地日期键（YYYY-MM-DD） */
function dayAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** 收摊种子日期：动态取昨天（与 qa-business.mjs 同款，保持 30 天趋势窗口内有柱） */
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

/* ---- Element Plus 适配：换皮后 testid 落点（EP 2.14.5 探针实证）---- */
// el-input → testid 落原生 input.el-input__inner（attrs 绑定到 input 本身）
// el-input-number → div.el-input-number；el-select → div.el-select（内层 input.el-select__input）
// el-checkbox → label.el-checkbox（内层 input.el-checkbox__original）
// el-radio-button → label.el-radio-button（内层 input.el-radio-button__original-radio）
// el-button → button.el-button；el-dialog → 根 .el-dialog；el-drawer → 根 .el-drawer

/**
 * EP 内部输入框解析：用 inner input.fill 交互（复合组件包装根不可直接 fill）
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

/** el-date-picker：填内部 input + Enter 提交（value-format=YYYY-MM-DD）；返回 true（调用方用作 epOkDate 布尔） */
async function epFillDate(page, testid, value) {
  const { target } = await resolveInput(page, testid, 0)
  await target.fill(value)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  return true
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

/**
 * EP 存在性断言：testid 元素类含 cls，或可向上 nearest 到含 cls 的包装（兼容 testid 落原生 input 的情况）
 */
async function assertEp(page, testid, cls) {
  const loc = page.locator(`[data-testid="${testid}"]`)
  const count = await loc.count()
  if (count === 0) return { ok: false, detail: `missing (count=0)` }
  const first = loc.first()
  const ok = await first.evaluate((el, c) => el.classList.contains(c) || !!el.closest('.' + c), cls)
  const detail = await first.evaluate((el) => ({ tag: el.tagName, cls: (el.className?.baseVal ?? el.className) ?? '' }))
  return { ok, detail }
}

/**
 * 日期输入 testid 包装断言：批次 E 修复——el-date-picker 的 testid 经外层 <div data-testid="…form-date"> 包装
 * 断言包装 div 内含 .el-date-editor（采互动由 epFillDate 证明）
 */
async function assertDateEditor(page, testid) {
  const cnt = await page.locator(`[data-testid="${testid}"] .el-date-editor`).count()
  return { ok: cnt === 1, detail: { dateEditorCount: cnt } }
}

/** 原生控件零残留扫描：作用域内可见的 select/textarea/input 排除 EP 内部控件（dialogs = 各弹框 scope 字符串，剩余参数） */
async function scanNativeResidue(page, scopeSel, ...dialogs) {
  const scopes = [scopeSel, ...dialogs].filter(Boolean)
  return page.evaluate(({ sel, scopes }) => {
    const hits = []
    for (const scope of scopes) {
      const root = document.querySelector(scope)
      if (!root) continue
      root.querySelectorAll(sel).forEach((el) => {
        if (el.offsetParent === null) return // 仅可见
        const cls = el.className?.baseVal !== undefined ? el.className.baseVal : el.className
        hits.push({ scope, tag: el.tagName, cls: cls || '', tid: el.getAttribute('data-testid') || '' })
      })
    }
    return hits
  }, {
    sel: `select, textarea, input:not(.el-input__inner):not(.el-input-number__inner):not(.el-checkbox__original):not(.el-radio__original):not(.el-radio-button__original-radio):not(.el-select__input):not(.el-switch__input)`,
    scopes
  })
}

/** 明暗全页截图：<name>-light.png / <name>-dark.png（dark class 幂等往返） */
async function shot(page, name) {
  const light = join(EVIDENCE_DIR, name + '-light.png')
  const dark = join(EVIDENCE_DIR, name + '-dark.png')
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await page.waitForTimeout(200)
  await page.screenshot({ path: light, fullPage: true })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(200)
  await page.screenshot({ path: dark, fullPage: true })
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await page.waitForTimeout(150)
  const lightOk = existsSync(light) && statSync(light).size > 0
  const darkOk = existsSync(dark) && statSync(dark).size > 0
  return { light: lightOk, dark: darkOk }
}

/** 注入销售记账种子数据（2 商品/1 进货/1 收摊/2 支出，阈值 100；与 qa-business.mjs 同款） */
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
      { id: 'qa-b1', productId: 'qa-p1', quantity: 100, unitPrice: 2, total: 200, date: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z' },
      { id: 'qa-b2', productId: 'qa-p2', quantity: 20, unitPrice: 1, total: 20, date: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z' }
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
  const pageErrors = []
  const consoleMsgs = []
  page.on('pageerror', (err) => pageErrors.push(err.message))
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(m.type() + ': ' + m.text()) })

  // 先加载首页（App 初始化建 DB），再注入 business 数据，后进 /business
  await page.goto(devBase + '/', { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(1500)
  await injectIdb(page, buildBusinessData())
  await page.goto(devBase + '/business', { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('[data-testid="bs-menu-home"]', { state: 'visible', timeout: 30000 })

  /* ================= E1 商品面板 ================= */
  await guard('E1) 商品面板：tabs/开关往返/详情抽屉/编辑+新增弹框 el-* + 原生零残留 + 明暗截图', async () => {
    await page.locator('[data-testid="bs-menu-products"]').click()
    await page.waitForSelector('[data-testid="bizprod-cat-all"]', { state: 'visible', timeout: 8000 })
    // 分类 tabs：all 需为 el-radio-button 或 el-button（批次 A 换皮）
    const catAll = await assertEp(page, 'bizprod-cat-all', 'el-radio-button')
    const catAllBtn = await assertEp(page, 'bizprod-cat-all', 'el-button')
    // 在售开关：往返点击复态（先关后开，不污染库存口径）
    await page.locator('[data-testid="bizprod-active-qa-p1"]').click()
    await page.waitForTimeout(300)
    const cardInactive = await page.locator('[data-testid="bizprod-card-qa-p1"]').evaluate((el) => el.classList.contains('inactive'))
    await page.locator('[data-testid="bizprod-active-qa-p1"]').click()
    await page.waitForTimeout(300)
    const cardActiveAgain = !(await page.locator('[data-testid="bizprod-card-qa-p1"]').evaluate((el) => el.classList.contains('inactive')))
    // 详情抽屉（el-drawer，P2-2：bizprod-detail-<id> 触发；编辑走弹框，勿混）
    await page.locator('[data-testid="bizprod-detail-qa-p1"]').click()
    await page.waitForSelector('[data-testid="bizprod-drawer"]', { state: 'visible', timeout: 5000 })
    const drawerEp = await assertEp(page, 'bizprod-drawer', 'el-drawer')
    const drawerBody = await page.locator('[data-testid="bizprod-drawer"] .bizprod-drawer-body').isVisible()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    // 编辑弹框（el-dialog：与新增共用 bizprod-dialog，标题「编辑商品」）
    await page.locator('[data-testid="bizprod-edit-qa-p1"]').click()
    await page.waitForSelector('[data-testid="bizprod-dialog"]', { state: 'visible', timeout: 5000 })
    const editDialogEp = await assertEp(page, 'bizprod-dialog', 'el-dialog')
    const editTitle = (await page.locator('[data-testid="bizprod-dialog"] .el-dialog__title').textContent()).trim()
    const editName = await assertEp(page, 'bizprod-form-name', 'el-input')
    const editCat = await assertEp(page, 'bizprod-form-category', 'el-select')
    const editUnit = await assertEp(page, 'bizprod-form-unit', 'el-input')
    const editPurchase = await assertEp(page, 'bizprod-form-purchase', 'el-input-number')
    const editSelling = await assertEp(page, 'bizprod-form-selling', 'el-input-number')
    const editActive = await assertEp(page, 'bizprod-form-active', 'el-checkbox')
    const editSave = await assertEp(page, 'bizprod-save', 'el-button')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    // 新增弹框（el-dialog：标题「新增商品」全字段 EP，不保存）
    await page.locator('[data-testid="bizprod-add"]').click()
    await page.waitForSelector('[data-testid="bizprod-dialog"]', { state: 'visible', timeout: 5000 })
    const addDialogEp = await assertEp(page, 'bizprod-dialog', 'el-dialog')
    const addTitle = (await page.locator('[data-testid="bizprod-dialog"] .el-dialog__title').textContent()).trim()
    const formName = await assertEp(page, 'bizprod-form-name', 'el-input')
    const formCat = await assertEp(page, 'bizprod-form-category', 'el-select')
    const formUnit = await assertEp(page, 'bizprod-form-unit', 'el-input')
    const formPurchase = await assertEp(page, 'bizprod-form-purchase', 'el-input-number')
    const formSelling = await assertEp(page, 'bizprod-form-selling', 'el-input-number')
    const formActive = await assertEp(page, 'bizprod-form-active', 'el-checkbox')
    const formSave = await assertEp(page, 'bizprod-save', 'el-button')
    const residue = await scanNativeResidue(page, '.bizprod', '[data-testid="bizprod-dialog"]')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const shots = await shot(page, 'products')
    record(
      'E1) 商品面板：tabs + 在售开关往返复态 + 详情抽屉 el-drawer + 编辑/新增弹框 el-dialog 全字段 + 零残留',
      (catAll.ok || catAllBtn.ok) && cardInactive && cardActiveAgain && drawerEp.ok && drawerBody &&
        editDialogEp.ok && editTitle === '编辑商品' && editName.ok && editCat.ok && editUnit.ok && editPurchase.ok && editSelling.ok && editActive.ok && editSave.ok &&
        addDialogEp.ok && addTitle === '新增商品' && formName.ok && formCat.ok && formUnit.ok && formPurchase.ok && formSelling.ok && formActive.ok && formSave.ok &&
        residue.length === 0 && shots.light && shots.dark,
      { catAll: catAll.detail ?? catAllBtn.detail, drawerEp: drawerEp.detail, drawerBody, edit: { title: editTitle, ep: [editName.detail, editCat.detail, editUnit.detail, editPurchase.detail, editSelling.detail, editActive.detail, editSave.detail] }, add: { title: addTitle, ep: [formName.detail, formCat.detail, formUnit.detail, formPurchase.detail, formSelling.detail, formActive.detail, formSave.detail] }, residue, shots }
    )
  })

  /* ================= E2 进货面板 ================= */
  await guard('E2) 进货面板：tabs 6 el-radio-button + 徽标 + 网格 5 列 + 弹框全 el-* 交互', async () => {
    await page.locator('[data-testid="bs-menu-purchases"]').click()
    await page.waitForSelector('[data-testid="bizpur-card-qa-b1"]', { state: 'visible', timeout: 8000 })
    // tabs：全部 + 5 可见分类 = 6 个 el-radio-button（换皮后 .el-radio-button 计数）
    const tabCount = await page.locator('.bizpur-tabs .el-radio-button').count()
    const catAll = await assertEp(page, 'bizpur-cat-all', 'el-radio-button')
    const badgeText = (await page.locator('[data-testid="bizpur-cat-badge-qa-b1"]').textContent()).trim()
    // 网格 5 列
    const gridCols = await page.evaluate(() => {
      const el = document.querySelector('.bizpur-grid')
      return el ? getComputedStyle(el).gridTemplateColumns.split(' ').length : 0
    })
    // 新增弹框：日期包装 div 内 el-date-editor + el-select 选品 + 数量×单价自动合计
    await page.locator('[data-testid="bizpur-add"]').click()
    await page.waitForSelector('[data-testid="bizpur-dialog"]', { state: 'visible', timeout: 5000 })
    const dialogEp = await assertEp(page, 'bizpur-dialog', 'el-dialog')
    const dateEp = await assertDateEditor(page, 'bizpur-form-date')
    const epOkDate = await epFillDate(page, 'bizpur-form-date', SEED_DAILY_DATE)
    await epSelect(page, 'bizpur-form-product', '烤肠')
    await epFill(page, 'bizpur-form-qty', '10')
    await epFill(page, 'bizpur-form-price', '2')
    const totalText = (await page.locator('[data-testid="bizpur-form-total"]').textContent()).trim()
    const qtyEp = await assertEp(page, 'bizpur-form-qty', 'el-input-number')
    const priceEp = await assertEp(page, 'bizpur-form-price', 'el-input-number')
    const noteEp = await assertEp(page, 'bizpur-form-note', 'el-input')
    const saveEp = await assertEp(page, 'bizpur-save', 'el-button')
    const residue = await scanNativeResidue(page, '.bizpur', '[data-testid="bizpur-dialog"]')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const shots = await shot(page, 'purchases')
    record(
      'E2) 进货面板：tabs 6 + 徽标「小吃」+ 网格 5 列 + 弹框日期/选品/合计交互 + 零残留',
      tabCount === 6 && catAll.ok && badgeText === '小吃' && gridCols === 5 && dialogEp.ok && dateEp.ok && epOkDate &&
        qtyEp.ok && priceEp.ok && noteEp.ok && saveEp.ok && totalText.includes('20.00') && residue.length === 0 && shots.light && shots.dark,
      { tabCount, catAll: catAll.detail, badgeText, gridCols, dialogEp: dialogEp.detail, dateEp: dateEp.detail, totalText, qtyEp: qtyEp.detail, priceEp: priceEp.detail, noteEp: noteEp.detail, saveEp: saveEp.detail, residue, shots }
    )
  })

  /* ================= E3 收摊面板 ================= */
  await guard('E3) 收摊面板：卡片四项 + 弹框全 el-*（日期/行内选品/3 数字输入/静态预览）', async () => {
    await page.locator('[data-testid="bs-menu-daily"]').click()
    await page.waitForSelector('[data-testid="bizday-card-qa-d1"]', { state: 'visible', timeout: 8000 })
    const revenue = (await page.locator('[data-testid="bizday-revenue-qa-d1"]').textContent()).trim()
    const cost = (await page.locator('[data-testid="bizday-cost-qa-d1"]').textContent()).trim()
    const profit = (await page.locator('[data-testid="bizday-profit-qa-d1"]').textContent()).trim()
    const loss = (await page.locator('[data-testid="bizday-loss-qa-d1"]').textContent()).trim()
    const editEp = await assertEp(page, 'bizday-edit-qa-d1', 'el-button')
    const delEp = await assertEp(page, 'bizday-del-qa-d1', 'el-button')
    // 新增弹框
    await page.locator('[data-testid="bizday-add"]').click()
    await page.waitForSelector('[data-testid="bizday-dialog"]', { state: 'visible', timeout: 5000 })
    const dialogEp = await assertEp(page, 'bizday-dialog', 'el-dialog')
    const dateEp = await assertDateEditor(page, 'bizday-form-date')
    const epOkDate = await epFillDate(page, 'bizday-form-date', SEED_DAILY_DATE)
    await page.waitForSelector('[data-testid="bizday-row"]', { state: 'visible', timeout: 5000 })
    // 行内：el-select 选品 + 3×el-input-number（class bizday-num-input）
    const rowSelect = await assertEp(page, 'bizday-row-product', 'el-select')
    const numInputs = await page.locator('[data-testid="bizday-row"]').nth(0).locator('.bizday-num-input').count()
    const numInputsEp = await page.locator('[data-testid="bizday-row"]').nth(0).locator('.bizday-num-input').first()
      .evaluate((el) => el.classList.contains('el-input-number'))
    // 静态四项预览
    const fRevenue = (await page.locator('[data-testid="bizday-form-revenue"]').textContent()).trim()
    const fCost = (await page.locator('[data-testid="bizday-form-cost"]').textContent()).trim()
    const fProfit = (await page.locator('[data-testid="bizday-form-profit"]').textContent()).trim()
    const fLoss = (await page.locator('[data-testid="bizday-form-loss"]').textContent()).trim()
    const rowAddEp = await assertEp(page, 'bizday-row-add', 'el-button')
    const rowDelEp = await assertEp(page, 'bizday-row-del-0', 'el-button')
    const saveEp = await assertEp(page, 'bizday-save', 'el-button')
    const residue = await scanNativeResidue(page, '.bizday', '[data-testid="bizday-dialog"]')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const shots = await shot(page, 'daily')
    record(
      'E3) 收摊面板：卡四项 200/68/132/5 + 弹框 el-* 全套 + 零残留',
      revenue.includes('200') && cost.includes('68.00') && profit.includes('132.00') && loss.includes('5.00') &&
        editEp.ok && delEp.ok && dialogEp.ok && dateEp.ok && epOkDate && rowSelect.ok && numInputs === 3 && numInputsEp &&
        fRevenue && fCost && fProfit && fLoss && rowAddEp.ok && rowDelEp.ok && saveEp.ok && residue.length === 0 && shots.light && shots.dark,
      { revenue, cost, profit, loss, editEp: editEp.detail, delEp: delEp.detail, dialogEp: dialogEp.detail, dateEp: dateEp.detail, rowSelect: rowSelect.detail, numInputs, numInputsEp, preview: [fRevenue, fCost, fProfit, fLoss], rowAddEp: rowAddEp.detail, rowDelEp: rowDelEp.detail, saveEp: saveEp.detail, residue, shots }
    )
  })

  /* ================= E4 支出面板 ================= */
  await guard('E4) 支出面板：无 tabs（el-radio-button=0）+ 分类管理 el-button + 弹框全 el-*', async () => {
    await page.locator('[data-testid="bs-menu-expenses"]').click()
    await page.waitForSelector('[data-testid="bizexp-cat-manager"]', { state: 'visible', timeout: 8000 })
    await page.waitForSelector('[data-testid^="bizexp-card-"]', { state: 'visible', timeout: 8000 })
    // 支出面板无 tabs 容器：el-radio-button 计数 0（与业务页其他 tabs 面板区分）
    const radioCount = await page.locator('.bizexp .el-radio-button').count()
    const catMgrEp = await assertEp(page, 'bizexp-cat-manager', 'el-button')
    const addEp = await assertEp(page, 'bizexp-add', 'el-button')
    const cardEp = await assertEp(page, 'bizexp-card-2026-08-02', 'bizexp-card')
    // 新增弹框：日期 + 行内 category el-select / amount el-input-number / note el-input
    await page.locator('[data-testid="bizexp-add"]').click()
    await page.waitForSelector('[data-testid="bizexp-dialog"]', { state: 'visible', timeout: 5000 })
    const dialogEp = await assertEp(page, 'bizexp-dialog', 'el-dialog')
    const dateEp = await assertDateEditor(page, 'bizexp-form-date')
    const epOkDate = await epFillDate(page, 'bizexp-form-date', '2026-08-03')
    await page.waitForSelector('[data-testid="bizexp-row-category"]', { state: 'visible', timeout: 5000 })
    const rowCat = await assertEp(page, 'bizexp-row-category', 'el-select')
    const rowAmt = await assertEp(page, 'bizexp-row-amount', 'el-input-number')
    const rowNote = await assertEp(page, 'bizexp-row-note', 'el-input')
    const rowDel = await assertEp(page, 'bizexp-row-del-0', 'el-button')
    const rowAdd = await assertEp(page, 'bizexp-row-add', 'el-button')
    const formTotalVisible = await page.locator('[data-testid="bizexp-form-total"]').isVisible()
    const saveEp = await assertEp(page, 'bizexp-save', 'el-button')
    const residue = await scanNativeResidue(page, '.bizexp', '[data-testid="bizexp-dialog"]')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const shots = await shot(page, 'expenses')
    record(
      'E4) 支出面板：无 tabs + 分类管理/新增 el-button + 弹框选品/金额/备注 el-* + 零残留',
      radioCount === 0 && catMgrEp.ok && addEp.ok && cardEp.ok && dialogEp.ok && dateEp.ok && epOkDate &&
        rowCat.ok && rowAmt.ok && rowNote.ok && rowDel.ok && rowAdd.ok && formTotalVisible && saveEp.ok &&
        residue.length === 0 && shots.light && shots.dark
       ,
      { radioCount, catMgrEp: catMgrEp.detail, addEp: addEp.detail, cardEp: cardEp.detail, dialogEp: dialogEp.detail, dateEp: dateEp.detail, rows: { rowCat: rowCat.detail, rowAmt: rowAmt.detail, rowNote: rowNote.detail, rowDel: rowDel.detail, rowAdd: rowAdd.detail }, formTotal: { visible: formTotalVisible }, saveEp: saveEp.detail, residue, shots }
    )
  })

  /* ================= E5 库存面板 ================= */
  await guard('E5) 库存面板：阈值 el-input + 低库存预警 + 卡库存剩余 + 溯源弹框 el-dialog + 阈值 0 清空', async () => {
    await page.locator('[data-testid="bs-menu-inventory"]').click()
    await page.waitForSelector('[data-testid="bizinv-alert"]', { state: 'visible', timeout: 8000 })
    // 阈值 el-input（attrs 落原生 input）
    const thEp = await assertEp(page, 'bizinv-threshold', 'el-input')
    // 种子库存：qa-p1 = 100-30+5 = 75、qa-p2 = 0-20+0 → clamp 0；阈值 100 → 双预警
    await page.waitForSelector('[data-testid^="bizinv-card-"]', { state: 'visible', timeout: 8000 })
    const lowCount = await page.locator('[data-testid^="bizinv-low-"]:not([data-testid="bizinv-low-empty"])').count()
    const hasP1Low = (await page.locator('[data-testid="bizinv-low-qa-p1"]').count()) === 1
    const hasP2Low = (await page.locator('[data-testid="bizinv-low-qa-p2"]').count()) === 1
    const cardCount = await page.locator('[data-testid^="bizinv-card-"]').count()
    const gridCols = await page.evaluate(() => {
      const el = document.querySelector('.bizinv-grid')
      return el ? getComputedStyle(el).gridTemplateColumns.split(' ').length : 0
    })
    const p1Card = (await page.locator('[data-testid="bizinv-card-qa-p1"]').textContent()) ?? ''
    const p2Card = (await page.locator('[data-testid="bizinv-card-qa-p2"]').textContent()) ?? ''
    // 溯源弹框：卡内「查看溯源」el-button（无 testid，has-text 定位）→ el-dialog 内源记录
    await page.locator('[data-testid="bizinv-card-qa-p1"] button:has-text("查看溯源")').click()
    await page.waitForSelector('[data-testid="bizinv-trace"]', { state: 'visible', timeout: 5000 })
    const traceEp = await assertEp(page, 'bizinv-trace', 'el-dialog')
    const traceBody = await page.locator('[data-testid="bizinv-trace-modal"]').isVisible()
    const traceRows = await page.locator('[data-testid="bizinv-trace-modal"] .bizinv-source-row').count()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    // 阈值改 0 → 预警清空
    await epFill(page, 'bizinv-threshold', '0')
    await page.waitForTimeout(400)
    const lowAfter = await page.locator('[data-testid^="bizinv-low-"]:not([data-testid="bizinv-low-empty"])').count()
    const emptyVisible = (await page.locator('[data-testid="bizinv-low-empty"]').count()) === 1
    const residue = await scanNativeResidue(page, '.bizinv', '[data-testid="bizinv-trace"]')
    const shots = await shot(page, 'inventory')
    record(
      'E5) 库存面板：阈值 el-input + 双预警 + 卡库存剩余 75/0 + 溯源弹框 2 源 + 阈值 0 清空 + 零残留',
      thEp.ok && lowCount === 2 && hasP1Low && hasP2Low && cardCount === 2 && gridCols === 5 &&
        p1Card.includes('库存剩余：75') && p2Card.includes('库存剩余：0') && traceEp.ok && traceBody && traceRows === 2 &&
        lowAfter === 0 && emptyVisible && residue.length === 0 && shots.light && shots.dark,
      { thEp: thEp.detail, lowCount, hasP1Low, hasP2Low, cardCount, gridCols, stock: { p1: p1Card.includes('库存剩余：75'), p2: p2Card.includes('库存剩余：0') }, traceEp: traceEp.detail, traceRows, lowAfter, emptyVisible, residue, shots }
    )
  })

  /* ================= E6 统计面板 ================= */
  await guard('E6) 统计面板：天数/模式 el-radio-button + SVG 几何 + 模式切换回归', async () => {
    await page.locator('[data-testid="bs-menu-stats"]').click()
    await page.waitForSelector('[data-testid="bizstats-trend"]', { state: 'visible', timeout: 8000 })
    const days7 = await assertEp(page, 'bizstats-days-7', 'el-radio-button')
    const days14 = await assertEp(page, 'bizstats-days-14', 'el-radio-button')
    const days30 = await assertEp(page, 'bizstats-days-30', 'el-radio-button')
    const modeAll = await assertEp(page, 'bizstats-mode-all', 'el-radio-button')
    const modeRevenue = await assertEp(page, 'bizstats-mode-revenue', 'el-radio-button')
    const modeProfit = await assertEp(page, 'bizstats-mode-profit', 'el-radio-button')
    // SVG：网格线 5 + 每日一柱（收摊日 cost+profit 两段）+ 单标签 + 支出折线 + 双环形图 + 图例
    await page.waitForSelector('.bizstats-bar', { state: 'visible', timeout: 8000 })
    const gridlines = await page.locator('.bizstats-gridline').count()
    const barsAll = await page.locator('.bizstats-bar').count()
    const labels = await page.locator('.bizstats-bar-label').count()
    const expenseLine = await page.locator('.bizstats-expense-line').count()
    const donuts = await page.locator('.bizstats-donut').count()
    const legend = await page.locator('.bizstats-legend').count()
    // 模式切换回归：营业额模式 1 柱（仅收摊日一段）、利润模式 1 段、回全部 2 段
    await page.locator('[data-testid="bizstats-mode-revenue"]').click()
    await page.waitForTimeout(300)
    const barsRevenue = await page.locator('.bizstats-bar.revenue').count()
    await page.locator('[data-testid="bizstats-mode-profit"]').click()
    await page.waitForTimeout(300)
    const barsProfit = await page.locator('.bizstats-bar.profit').count()
    await page.locator('[data-testid="bizstats-mode-all"]').click()
    await page.waitForTimeout(300)
    const barsBack = await page.locator('.bizstats-bar').count()
    const residue = await scanNativeResidue(page, '.bizstats')
    const shots = await shot(page, 'stats')
    record(
      'E6) 统计面板：6 个 el-radio-button + 网格 5/双段柱/标签/折线/双环 + 模式切换 1→1→2 + 零残留',
      days7.ok && days14.ok && days30.ok && modeAll.ok && modeRevenue.ok && modeProfit.ok &&
        gridlines === 5 && barsAll === 2 && labels === 1 && expenseLine === 1 && donuts === 2 && legend === 1 &&
        barsRevenue === 1 && barsProfit === 1 && barsBack === 2 && residue.length === 0 && shots.light && shots.dark,
      { days: [days7.detail, days14.detail, days30.detail], modes: [modeAll.detail, modeRevenue.detail, modeProfit.detail], gridlines, barsAll, labels, expenseLine, donuts, legend, barsRevenue, barsProfit, barsBack, residue, shots }
    )
  })

  /* ================= E7 设置弹窗「销售记账」tab ================= */
  await guard('E7) 设置弹窗销售记账 tab：子 tab biz-base + 摊位/阈值 el-* + 分类管理弹框 5 行', async () => {
    await page.locator('[data-testid="bs-menu-home"]').click()
    await page.locator('[data-testid="bs-settings"]').click()
    await page.waitForSelector('.manager', { state: 'visible', timeout: 5000 })
    await page.locator('[data-testid="settings-tab-business"]').click()
    await page.waitForSelector('[data-testid="subtab-biz-base"]', { state: 'visible', timeout: 5000 })
    await page.waitForSelector('[data-testid="bizsettings-stall"]', { state: 'visible', timeout: 5000 })
    const subtabBaseEp = await page.locator('[data-testid="subtab-biz-base"]').isVisible()
    const stallEp = await assertEp(page, 'bizsettings-stall', 'el-input')
    const stallVal = await epInputValue(page, 'bizsettings-stall')
    const thEp = await assertEp(page, 'bizsettings-threshold', 'el-input-number')
    const thVal = await epInputValue(page, 'bizsettings-threshold') // E5 已置 0
    const prodCatsEp = await assertEp(page, 'bizsettings-product-cats', 'el-button')
    const expCatsEp = await assertEp(page, 'bizsettings-expense-cats', 'el-button')
    // 商品分类管理入口：弹框 5 行（种子 5 分类；E8 在 E7 之后新增，不扰动此断言）
    await page.locator('[data-testid="bizsettings-product-cats"]').click()
    await page.waitForSelector('[data-testid="bizcat-dialog-product"]', { state: 'visible', timeout: 5000 })
    const catDialogEp = await assertEp(page, 'bizcat-dialog-product', 'el-dialog')
    const productRows = await page.locator('[data-testid^="bizcat-row-product-"]').count()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const shots = await shot(page, 'settings-biz')
    record(
      'E7) 设置弹窗销售记账 tab：子 tab biz-base + 摊位/阈值 el-* + 分类管理弹框 5 行',
      subtabBaseEp && stallEp.ok && stallVal === 'QA 夜市摊' && thEp.ok && thVal === '0' && prodCatsEp.ok && expCatsEp.ok &&
        catDialogEp.ok && productRows === 5 && shots.light && shots.dark,
      { subtabBaseEp, stallEp: stallEp.detail, stallVal, thEp: thEp.detail, thVal, prodCatsEp: prodCatsEp.detail, expCatsEp: expCatsEp.detail, catDialogEp: catDialogEp.detail, productRows, shots }
    )
  })

  /* ================= E8 商品分类管理弹框（页面 ⚙️） ================= */
  await guard('E8) 商品分类管理弹框：el-dialog + 新增「玩具」→ 6 行 + 零残留', async () => {
    await page.locator('[data-testid="bs-menu-products"]').click()
    await page.waitForSelector('[data-testid="bizprod-cat-manager"]', { state: 'visible', timeout: 8000 })
    await page.locator('[data-testid="bizprod-cat-manager"]').click()
    await page.waitForSelector('[data-testid="bizcat-dialog-product"]', { state: 'visible', timeout: 5000 })
    const dialogEp = await assertEp(page, 'bizcat-dialog-product', 'el-dialog')
    const rowsBefore = await page.locator('[data-testid^="bizcat-row-product-"]').count()
    const checkEp = await assertEp(page, 'bizcat-tab-product-product-snack', 'el-checkbox')
    const nameEp = await assertEp(page, 'bizcat-name-product-product-snack', 'el-input')
    const upEp = await assertEp(page, 'bizcat-up-product-product-snack', 'el-button')
    const downEp = await assertEp(page, 'bizcat-down-product-product-snack', 'el-button')
    const delEp = await assertEp(page, 'bizcat-del-product-product-snack', 'el-button')
    // 新增「玩具」：新分类 id 运行时生成，行内名称 testid 落在原生 input 上（value 即名称文本）
    await epFill(page, 'bizcat-new-product', '玩具')
    await page.locator('[data-testid="bizcat-add-product"]').click()
    await page.waitForTimeout(400)
    const rowsAfter = await page.locator('[data-testid^="bizcat-row-product-"]').count()
    const toyValues = await page.locator('[data-testid^="bizcat-name-product-"]').evaluateAll((els) => els.map((e) => e.value ?? ''))
    const hasToy = toyValues.some((v) => v.trim() === '玩具')
    const residue = await scanNativeResidue(page, '.bizprod', '[data-testid="bizcat-dialog-product"]')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const shots = await shot(page, 'catmanager-product')
    record(
      'E8) 商品分类管理弹框：el-dialog + 行内 el-checkbox/input/button + 新增玩具 5→6 行 + 零残留',
      dialogEp.ok && rowsBefore === 5 && checkEp.ok && nameEp.ok && upEp.ok && downEp.ok && delEp.ok &&
        rowsAfter === 6 && hasToy && residue.length === 0 && shots.light && shots.dark,
      { dialogEp: dialogEp.detail, rowsBefore, rowsAfter, hasToy, rowEp: { checkEp: checkEp.detail, nameEp: nameEp.detail, upEp: upEp.detail, downEp: downEp.detail, delEp: delEp.detail }, residue, shots }
    )
  })

  // 浏览器控制台无 error 才算全绿（warning 放行）
  const fatalConsole = consoleMsgs.filter((m) => m.startsWith('error')).length
  const totalPassed = results.filter((r) => r.ok).length
  const verdict = totalPassed === results.length && results.length > 0 && fatalConsole === 0 ? 'PASS' : 'FAIL'
  const qa = {
    command: 'node scripts/qa-business-ep.mjs',
    result: verdict + ' (' + totalPassed + '/' + results.length + ')',
    browser: 'chromium (playwright, headless)',
    dev_server: 'vite on ' + devBase + ' (' + (startedByUs ? 'started by script' : 'reused existing') + ')',
    evidence_dir: EVIDENCE_DIR,
    page_errors: pageErrors,
    console_errors: fatalConsole,
    console: consoleMsgs,
    assertions: results
  }
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  writeFileSync(EVIDENCE_LOG, JSON.stringify({ task: 'business: 销售记账 Element Plus 换皮批次 E QA（E1-E8）', qa }, null, 2), 'utf8')
  console.log('[qa] QA evidence log written: ' + EVIDENCE_LOG)
  if (verdict !== 'PASS') process.exitCode = 1
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  if (browser) await browser.close().catch(() => {})
} finally {
  if (browser) await browser.close()
  stopDevServer()
}