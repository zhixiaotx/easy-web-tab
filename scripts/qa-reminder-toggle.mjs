/**
 * QA: 前台倒计时弹框邮件提醒开关（cd-email-toggle / cd-email-switch）— 计划 Task 2 验收（QA-only）
 * 后台启动/复用 vite dev（16718-16726）→ /display → 点击 .btn-countdown 打开倒计时弹框 → 断言契约 S1-S4：
 *
 *  S1 渲染与缺省态：注入 2 条倒计时（cd_qa_on emailReminder:true + cd_qa_off 缺省无该字段）→ 弹框出 2 张
 *     .countdown-item 卡片；每张卡各含恰好 1 个 [data-testid="cd-email-toggle"] 与 1 个
 *     [data-testid="cd-email-switch"]；「QA 开」开关 checked、「QA 关」开关 unchecked（缺省态=不开邮件）。
 *  S2 点击切换 + IDB 持久化 + toast：对「QA 关」卡点击 cd-email-toggle → 开关变 checked +
 *     readIdb 断言 cd_qa_off.emailReminder === true + toast「已开启邮件提醒」；再次点击 → 开关 unchecked +
 *     记录 emailReminder === false + toast「已关闭邮件提醒」。
 *  S3 刷新持久化：把「QA 关」打开后等待 ≥300ms（IDB 提交）→ page.reload() → 重开弹框 → 开关仍 checked +
 *     readIdb 断言 cd_qa_off.emailReminder === true。
 *  S4 明暗证据截图：重开弹框使两种状态同屏可见（一开一关）→ .omo/evidence/reminder-toggle/ 全页截图
 *     light + dark + 写 qa-reminder-toggle.log JSON（command/verdict/注入形状/断言清单）→ 两张 PNG > 0 字节
 *     （恒 PASS，仿 qa-reminder-upgrade S9 惯例）。
 *
 * 注入形状（与 store 真实持久化一致）：
 *   store 'countdowns' 键 'items' = Countdown[]（id/name/endDateTime/repeat/category/createdAt/updatedAt，
 *   cd_qa_on 含 emailReminder:true；cd_qa_off 不含 emailReminder 字段模拟缺省），加载经 normalizeCountdown
 *   归一化（emailReminder 仅布尔透传、once 规范为 null、showOnDisplay 缺省=可见）。
 *   endDateTime 取未来 6 天（> 3 天摘要窗口且未到期 → 9:00 摘要弹框/到期弹框均不触发，避免干扰）。
 * 前端目标结构（并行 Task 1 实现，本脚本按契约断言；选择器缺失时 S1 失败属预期 TDD RED）：
 *   .countdown-item 纵向布局，底部 label.countdown-email-toggle[data-testid="cd-email-toggle"]
 *   （含 input[type=checkbox].email-toggle-input[data-testid="cd-email-switch"] + span「📧 邮件提醒」），
 *   :checked="item.emailReminder === true"，点击调 store.updateCountdown(item.id, { emailReminder }) 持久化 + toast。
 * toast 结构：App.vue 全局 <Toast> → .toast-container > .toast > .toast-message（文本为消息体）。
 * 本项目 dev server 无 auth、直接 localhost 访问。
 * ⚠️ 禁止与其它 QA 脚本并行（同端口域 16718-16726 抢占 dev server / 端口冲突）。
 * 运行：node scripts/qa-reminder-toggle.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'reminder-toggle')
const EVIDENCE_LIGHT_PNG = join(EVIDENCE_DIR, 'reminder-toggle-light.png')
const EVIDENCE_DARK_PNG = join(EVIDENCE_DIR, 'reminder-toggle-dark.png')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'qa-reminder-toggle.log')

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

/** 单场景守卫：异常 → 记 FAIL 不中断后续。 */
async function guard(name, fn) {
  try {
    await fn()
  } catch (err) {
    record(name, false, { error: err.message })
  }
}

/** Node 侧轮询等待条件（最多 timeoutMs，间隔 intervalMs）。 */
async function waitFor(predicate, timeoutMs = 15000, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}

// ===================== 本地时间工具（防 UTC 偏移，与引擎 formatLocal 同源）=====================
function pad(n) {
  return String(n).padStart(2, '0')
}

/** 本地日期 'YYYY-MM-DD'。 */
function localDateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 本地日期时间 'YYYY-MM-DDTHH:mm'（倒计时 endDateTime 格式）。 */
function localDateTime(d) {
  return `${localDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ===================== IndexedDB 注入/读取（easy-web-tab v5，out-of-line 键 'items'）=====================

/** 向 IndexedDB easy-web-tab v5 的 store 以键 'items' 写入 payload（与 idbPut 形状一致）。 */
async function injectIdb(page, storeName, payload) {
  return page.evaluate(
    ({ storeName, payload }) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('easy-web-tab', 5)
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName)
        }
        req.onsuccess = () => {
          const db = req.result
          try {
            const tx = db.transaction(storeName, 'readwrite')
            tx.objectStore(storeName).put(payload, 'items')
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
      }),
    { storeName, payload }
  )
}

/** 读取 IndexedDB easy-web-tab v5 store 'items' 的值。 */
async function readIdb(page, storeName) {
  return page.evaluate(
    (storeName) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('easy-web-tab', 5)
        req.onsuccess = () => {
          const db = req.result
          try {
            const tx = db.transaction(storeName, 'readonly')
            const r = tx.objectStore(storeName).get('items')
            r.onsuccess = () => {
              db.close()
              resolve(r.result)
            }
            r.onerror = () => {
              db.close()
              reject(r.error)
            }
          } catch (e) {
            db.close()
            reject(e)
          }
        }
        req.onerror = () => reject(req.error)
      }),
    storeName
  )
}

// ===================== 倒计时构造 / 弹框交互辅助 =====================

/**
 * 构造测试倒计时：未来 6 天（> 3 天摘要窗口且未到期 → 9:00 摘要/到期弹框均不触发）。
 * emailReminder 仅当显式 true 时输出该字段（cd_qa_off 走缺省路径，模拟未勾选）。
 */
function buildCountdown(id, name, withEmailReminder) {
  const c = {
    id,
    name,
    endDateTime: localDateTime(new Date(Date.now() + 6 * 24 * 3600 * 1000)),
    repeat: null, // once 规范化值
    category: 'work',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
    // showOnDisplay 缺省 → frontCountdowns 显示
  }
  if (withEmailReminder) c.emailReminder = true
  return c
}

/** 打开前台倒计时弹框并等待卡片渲染。 */
async function openCountdownModal(page) {
  await page.locator('.btn-countdown').click()
  await page.waitForSelector('.countdown-item', { state: 'visible', timeout: 15000 })
}

/** 按名称定位倒计时卡片（hasText 子串匹配，避免依赖排序）。 */
function cardByName(page, name) {
  return page.locator('.countdown-item', { hasText: name })
}

/** 卡片内邮件开关的 checked 状态（元素缺失/隐藏 → 返回 null，不抛异常）。 */
async function switchChecked(page, name) {
  try {
    return await cardByName(page, name).locator('[data-testid="cd-email-switch"]').isChecked()
  } catch {
    return null
  }
}

/** 轮询等待 toast 出现且文本含指定子串。 */
async function toastVisibleWithText(page, text, timeoutMs = 5000) {
  return waitFor(
    async () => {
      try {
        return (await page.locator('.toast-message', { hasText: text }).count()) > 0
      } catch {
        return false
      }
    },
    timeoutMs,
    100
  )
}

let browser
try {
  await ensureDevServer()
  browser = await chromium.launch()

  // ===================== S1 渲染与缺省态：2 卡片 + 每卡各 1 开关对 + 缺省 unchecked =====================
  await guard('S1) 渲染与缺省态：2 张卡片、每卡各含恰好 1 个 cd-email-toggle + cd-email-switch、QA 开 checked / QA 关 unchecked', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    try {
      const page = await ctx.newPage()
      page.on('dialog', (d) => d.accept())
      const payload = [buildCountdown('cd_qa_on', 'QA 开', true), buildCountdown('cd_qa_off', 'QA 关', false)]
      await page.goto(`${devBase}/display`, { waitUntil: 'domcontentloaded' })
      await injectIdb(page, 'countdowns', payload)
      await openCountdownModal(page)

      const itemCount = await page.locator('.countdown-item').count()
      const perCard = []
      for (const name of ['QA 开', 'QA 关']) {
        const card = cardByName(page, name)
        perCard.push({
          name,
          toggleCount: await card.locator('[data-testid="cd-email-toggle"]').count(),
          switchCount: await card.locator('[data-testid="cd-email-switch"]').count(),
          checked: await switchChecked(page, name)
        })
      }
      const onInfo = perCard.find((p) => p.name === 'QA 开')
      const offInfo = perCard.find((p) => p.name === 'QA 关')
      const perCardOk = perCard.every((p) => p.toggleCount === 1 && p.switchCount === 1)
      const ok = itemCount === 2 && perCardOk && onInfo.checked === true && offInfo.checked === false

      record(
        'S1) 渲染与缺省态：2 张卡片、每卡各含恰好 1 个 cd-email-toggle + cd-email-switch、QA 开 checked / QA 关 unchecked',
        ok,
        { itemCount, perCard, perCardOk }
      )
    } finally {
      await ctx.close()
    }
  })

  // ===================== S2 点击切换 + IDB 持久化 + toast =====================
  await guard('S2) 点击切换：QA 关开 → checked + IDB emailReminder:true + toast 已开启；再点关 → unchecked + IDB false + toast 已关闭', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    try {
      const page = await ctx.newPage()
      page.on('dialog', (d) => d.accept())
      const payload = [buildCountdown('cd_qa_on', 'QA 开', true), buildCountdown('cd_qa_off', 'QA 关', false)]
      await page.goto(`${devBase}/display`, { waitUntil: 'domcontentloaded' })
      await injectIdb(page, 'countdowns', payload)
      await openCountdownModal(page)

      const offCard = cardByName(page, 'QA 关')
      // 第一次点击：开
      await offCard.locator('[data-testid="cd-email-toggle"]').click()
      const checked1 = await waitFor(async () => (await switchChecked(page, 'QA 关')) === true, 5000)
      const toastOn = await toastVisibleWithText(page, '已开启邮件提醒')
      await page.waitForTimeout(300) // IDB 提交
      const idb1 = (await readIdb(page, 'countdowns')) ?? []
      const rec1 = idb1.find((c) => c && c.id === 'cd_qa_off')
      const idbOn = !!rec1 && rec1.emailReminder === true

      // 第二次点击：关
      await offCard.locator('[data-testid="cd-email-toggle"]').click()
      const checked2 = await waitFor(async () => (await switchChecked(page, 'QA 关')) === false, 5000)
      const toastOff = await toastVisibleWithText(page, '已关闭邮件提醒')
      await page.waitForTimeout(300)
      const idb2 = (await readIdb(page, 'countdowns')) ?? []
      const rec2 = idb2.find((c) => c && c.id === 'cd_qa_off')
      const idbOff = !!rec2 && rec2.emailReminder === false

      record(
        'S2) 点击切换：QA 关开 → checked + IDB emailReminder:true + toast 已开启；再点关 → unchecked + IDB false + toast 已关闭',
        checked1 && toastOn && idbOn && checked2 && toastOff && idbOff,
        {
          checked1,
          toastOn,
          idb1: rec1 ? { id: rec1.id, emailReminder: rec1.emailReminder } : null,
          checked2,
          toastOff,
          idb2: rec2 ? { id: rec2.id, emailReminder: rec2.emailReminder } : null
        }
      )
    } finally {
      await ctx.close()
    }
  })

  // ===================== S3 刷新持久化：打开后 reload → 开关仍 checked + IDB 仍 true =====================
  await guard('S3) 刷新持久化：QA 关打开 → 等 300ms → reload → 重开弹框开关仍 checked + IDB emailReminder:true', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    try {
      const page = await ctx.newPage()
      page.on('dialog', (d) => d.accept())
      const payload = [buildCountdown('cd_qa_on', 'QA 开', true), buildCountdown('cd_qa_off', 'QA 关', false)]
      await page.goto(`${devBase}/display`, { waitUntil: 'domcontentloaded' })
      await injectIdb(page, 'countdowns', payload)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await openCountdownModal(page)

      // 打开「QA 关」邮件开关
      await cardByName(page, 'QA 关').locator('[data-testid="cd-email-toggle"]').click()
      const turnedOn = await waitFor(async () => (await switchChecked(page, 'QA 关')) === true, 5000)
      await page.waitForTimeout(300) // ≥300ms IDB 提交

      // 刷新后重开弹框
      await page.reload({ waitUntil: 'domcontentloaded' })
      await openCountdownModal(page)
      const persistedChecked = (await switchChecked(page, 'QA 关')) === true
      const idb = (await readIdb(page, 'countdowns')) ?? []
      const rec = idb.find((c) => c && c.id === 'cd_qa_off')
      const idbPersisted = !!rec && rec.emailReminder === true

      record(
        'S3) 刷新持久化：QA 关打开 → 等 300ms → reload → 重开弹框开关仍 checked + IDB emailReminder:true',
        turnedOn && persistedChecked && idbPersisted,
        { turnedOn, persistedChecked, idb: rec ? { id: rec.id, emailReminder: rec.emailReminder } : null }
      )
    } finally {
      await ctx.close()
    }
  })

  // ===================== S4 明暗证据截图：一开一关同屏 → light/dark 全页截图 + JSON 日志 =====================
  await guard('S4) 明暗证据截图：一开一关同屏可见 → light/dark 全页截图写入（PNG > 0 字节，恒 PASS）', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    try {
      const page = await ctx.newPage()
      page.on('dialog', (d) => d.accept())
      const payload = [buildCountdown('cd_qa_on', 'QA 开', true), buildCountdown('cd_qa_off', 'QA 关', false)]
      await page.goto(`${devBase}/display`, { waitUntil: 'domcontentloaded' })
      await injectIdb(page, 'countdowns', payload)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await openCountdownModal(page)

      // 两种状态同屏可见：QA 开 checked + QA 关 unchecked（缺省态）
      const onChecked = (await switchChecked(page, 'QA 开')) === true
      const offUnchecked = (await switchChecked(page, 'QA 关')) === false
      const toggleVisible =
        (await cardByName(page, 'QA 开').locator('[data-testid="cd-email-toggle"]').count()) === 1 &&
        (await cardByName(page, 'QA 关').locator('[data-testid="cd-email-toggle"]').count()) === 1

      mkdirSync(EVIDENCE_DIR, { recursive: true })
      await page.screenshot({ path: EVIDENCE_LIGHT_PNG, fullPage: true })
      const lightSize = existsSync(EVIDENCE_LIGHT_PNG) ? statSync(EVIDENCE_LIGHT_PNG).size : 0
      await page.evaluate(() => document.documentElement.classList.add('dark'))
      await page.waitForTimeout(300)
      await page.screenshot({ path: EVIDENCE_DARK_PNG, fullPage: true })
      const darkSize = existsSync(EVIDENCE_DARK_PNG) ? statSync(EVIDENCE_DARK_PNG).size : 0

      record(
        'S4) 明暗证据截图：一开一关同屏可见 → light/dark 全页截图写入（PNG > 0 字节，恒 PASS）',
        lightSize > 0 && darkSize > 0,
        {
          onChecked,
          offUnchecked,
          toggleVisible,
          light: { path: EVIDENCE_LIGHT_PNG, bytes: lightSize },
          dark: { path: EVIDENCE_DARK_PNG, bytes: darkSize }
        }
      )
    } finally {
      await ctx.close()
    }
  })

  // ===================== 汇总 =====================
  const totalPassed = results.filter((r) => r.ok).length
  const verdict = totalPassed === results.length && results.length > 0 ? 'PASS' : 'FAIL'
  const qa = {
    command: 'node scripts/qa-reminder-toggle.mjs',
    result: `${verdict} (${totalPassed}/${results.length})`,
    browser: 'chromium (playwright, headless)',
    dev_server: `vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
    injection:
      'page.evaluate → IndexedDB easy-web-tab v5 / countdowns / 键 items（Countdown[]：cd_qa_on emailReminder:true + cd_qa_off 缺省无 emailReminder 字段；repeat:null、showOnDisplay 缺省可见、endDateTime 未来 6 天防提醒弹框干扰）',
    mocks: '无（开关仅 UI + store.updateCountdown + IDB 持久化 + toast，不涉及 emailjs/Notification）',
    evidence_light_png: EVIDENCE_LIGHT_PNG,
    evidence_dark_png: EVIDENCE_DARK_PNG,
    assertions: results
  }
  writeFileSync(
    EVIDENCE_LOG,
    JSON.stringify(
      {
        task: 'reminder-toggle: 前台倒计时弹框邮件提醒开关 QA（S1-S4 场景 + S4 截图证据）',
        qa
      },
      null,
      2
    ),
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
