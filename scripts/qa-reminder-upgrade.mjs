/**
 * QA: 定时提醒三通道升级（弹框 + 桌面通知 + EmailJS 邮件）— 计划 S4-S8 验收（QA-only）
 * 后台启动/复用 vite dev（16718-16726）→ /workbench → 断言：
 *
 *  S4 表单开关：倒计时新增弹框勾选「发送邮件提醒」（cd-form-email 复选框）→ 保存（cd-save-button）
 *     → IDB countdowns（键 items）新增记录含 emailReminder: true
 *  S5 三通道触发：注入 settings（desktopNotifyEnabled:true + reminderEmailEnabled:true + to/service/template/publicKey
 *     四字段非空）+ 已到期 once 倒计时（endDateTime 过去、无 lastRemindedAt、emailReminder:true）→ reload →
 *     init tick 触发三通道：.reminder-overlay 出现 + 弹框含倒计时名 + window.__notifications 收到同名通知
 *     + emailjs mock（page.route 拦截 api.emailjs.com 全域，POST → {service_id,template_id,user_id,template_params}）
 *     收到含 template_params{to_email, countdown_name, occurrence_time, app_url} 的请求 → 点 .reminder-close 关闭
 *  S6 开关门控：
 *     a) emailReminder 缺省 + 邮件配置完整 → emailjs mock 零调用（弹框/桌面通知仍触发）
 *     b) emailReminder:true + 配置不完整（serviceId 空）→ emailjs 零调用 + 页面无 pageerror
 *     c) 9:00 摘要不触发邮件：STORAGE_KEY('user-countdown-reminder-date') 置为过去日期 + 注入未来 3 天内
 *        未过期倒计时 → 本地小时 ≥9 时断言弹框出摘要条目但 emailjs 零调用（摘要永不发邮件）；当前小时 <9 时
 *        引擎条件 now.getHours()>=9 不满足，记录 SKIP 不 FAIL（脚本必须容忍）
 *  S7 桌面权限：设置弹窗（⚙️ 设置）→ tab「提醒设置」→ 点 remind-desktop-switch → desktopNotifyEnabled 开启
 *     且 window.Notification.requestPermission 被调用过（spy 记录）→ IDB settings desktopNotifyEnabled:true
 *     → 再点一次关闭恢复 false
 *  S8 设置持久化：提醒设置 tab 开 remind-email-switch + 填 remind-email-to/service/template/key 四输入框
 *     → IDB settings 记录字段落库 → page.reload() → 重开设置弹窗切到提醒 tab → 四输入框值回填 + 开关仍开
 *  S9 明/暗全页截图（提醒弹框 + 工作台）→ .omo/evidence/reminder-upgrade/（恒 PASS）
 *
 * 注入形状（与 store 真实持久化一致）：
 *   store 'countdowns' 键 'items' = Countdown[]（id/name/endDateTime/repeat/category/emailReminder/lastRemindedAt），
 *   加载经 normalizeCountdown 归一化（emailReminder 仅布尔透传、once 规范为 null）。
 *   store 'settings' 键 'items' = AppSettingsData（提醒设置 6 字段 desktopNotifyEnabled/reminderEmailEnabled/
 *   reminderEmailTo/reminderEmailServiceId/reminderEmailTemplateId/reminderEmailPublicKey）。
 * mock：
 *   EmailJS v4 @emailjs/browser send() → POST https://api.emailjs.com/api/v1.0/email/send，body 为 JSON
 *   {lib_version,user_id,service_id,template_id,template_params}；route.fulfill 200 使 res.status===200。
 *   Notification spy（page.addInitScript 替换 window.Notification）：static permission='granted'，
 *   static requestPermission() 返回 Promise.resolve('granted') 并计数 window.__notifPermissionCalls；
 *   new Notification(title, options) 记录 {title, options} 到 window.__notifications。
 * 引擎契约（useCountdownReminder.ts）：init 立即 tick + 60s interval + visibilitychange tick；到期经
 * getReminderDue（null=不提醒），到点先写 lastRemindedAt 去重再发邮件；9:00 摘要仅弹框+桌面通知永不发邮件。
 * 与其它 QA 脚本禁止并行（同端口域）。运行：node scripts/qa-reminder-upgrade.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'reminder-upgrade')
const EVIDENCE_LIGHT_PNG = join(EVIDENCE_DIR, 'reminder-upgrade-light.png')
const EVIDENCE_DARK_PNG = join(EVIDENCE_DIR, 'reminder-upgrade-dark.png')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'qa-reminder-upgrade.log')

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

/** 距今 days 天的本地日期键（正=未来，负=过去）。 */
function dateOffsetKey(days) {
  const now = new Date()
  return localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days))
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

// ===================== mock：EmailJS 路由 + Notification spy =====================

/** EmailJS 完整配置（S5/S6a/S6c 用）。 */
const COMPLETE_EMAIL_SETTINGS = {
  desktopNotifyEnabled: true,
  reminderEmailEnabled: true,
  reminderEmailTo: 'qa-reminder@example.com',
  reminderEmailServiceId: 'service_qa_test',
  reminderEmailTemplateId: 'template_qa_test',
  reminderEmailPublicKey: 'public_key_qa_test'
}

/** 构造 settings store 注入对象（6 提醒字段 + 弹窗尺寸等默认字段，与 parseSettingsData/initSettings 兼容）。 */
function buildSettings(overrides) {
  return {
    dialogSizes: {},
    buttonOpacity: 1,
    bgOpacity: 1,
    desktopNotifyEnabled: false,
    reminderEmailEnabled: false,
    reminderEmailTo: '',
    reminderEmailServiceId: '',
    reminderEmailTemplateId: '',
    reminderEmailPublicKey: '',
    ...overrides
  }
}

/** 已到期 once 倒计时（无 lastRemindedAt → getReminderDue 返回发生时刻）。 */
function buildDueCountdown(id, name, minutesAgo = 1) {
  const endDateTime = localDateTime(new Date(Date.now() - minutesAgo * 60000))
  return {
    id,
    name,
    endDateTime,
    repeat: null,
    category: 'work',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

/**
 * Notification spy（addInitScript）：替换 window.Notification 为 spy class。
 * - static permission = 'granted'（useDesktopNotify 发送前判定 granted）
 * - static requestPermission() 返回 Promise.resolve('granted') 并计数 window.__notifPermissionCalls
 * - new Notification(title, options) 记录 {title, options} 到 window.__notifications
 */
async function addNotificationSpy(page) {
  await page.addInitScript(() => {
    window.__notifications = []
    window.__notifPermissionCalls = 0
    class NotificationSpy {
      static permission = 'granted'
      static requestPermission() {
        window.__notifPermissionCalls = (window.__notifPermissionCalls || 0) + 1
        return Promise.resolve('granted')
      }
      constructor(title, options) {
        window.__notifications.push({ title, options: options || {} })
      }
    }
    window.Notification = NotificationSpy
  })
}

/**
 * EmailJS mock：拦截 api.emailjs.com 全域（@emailjs/browser v4 send() → POST 该域 /api/v1.0/email/send）。
 * 记录 {url, body} 到 requests；route.fulfill 200 使 res.status===200（sendReminderEmail 判定成功）。
 */
async function setupEmailMock(page, requests) {
  await page.route('**/api.emailjs.com/**', async (route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      let body = {}
      try {
        body = JSON.parse(req.postData() || '{}')
      } catch {
        body = { raw: req.postData() }
      }
      requests.push({ url: req.url(), body })
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 200, message: 'OK' })
    })
  })
}

/** 打开 /workbench 并进入倒计时面板。 */
async function openCountdownPanel(page) {
  await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wb-menu-countdowns"]', { state: 'visible', timeout: 15000 })
  await page.locator('[data-testid="wb-menu-countdowns"]').click()
}

let browser
try {
  await ensureDevServer()
  browser = await chromium.launch()

  // ===================== S4 表单开关：新增倒计时勾选「发送邮件提醒」→ IDB emailReminder:true =====================
  await guard('S4) 新增弹框勾选 cd-form-email → 保存 → IDB countdowns 含 emailReminder:true', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    try {
      const page = await ctx.newPage()
      page.on('dialog', (d) => d.accept())
      await openCountdownPanel(page)
      await page.locator('[data-testid="cd-add-button"]').click()
      await page.waitForSelector('[data-testid="cd-dialog"]', { state: 'visible', timeout: 10000 })

      const name = 'QA 表单邮件倒计时'
      const futureDate = dateOffsetKey(1)
      const futureTime = '10:30'
      await page.locator('[data-testid="cd-form-email"] input[type="checkbox"]').check()
      const checked = await page.locator('[data-testid="cd-form-email"] input[type="checkbox"]').isChecked()
      await page.locator('[data-testid="cd-name-input"]').fill(name)
      await page.locator('[data-testid="cd-date-input"]').fill(futureDate)
      await page.locator('[data-testid="cd-time-input"]').fill(futureTime)
      await page.locator('[data-testid="cd-save-button"]').click()
      await page.waitForFunction(() => !document.querySelector('[data-testid="cd-dialog"]'), { timeout: 5000 })

      const countdowns = (await readIdb(page, 'countdowns')) ?? []
      const record_ = countdowns.find((c) => c && c.name === name)
      record(
        'S4) 新增弹框勾选 cd-form-email → 保存 → IDB countdowns 含 emailReminder:true',
        checked && !!record_ && record_.emailReminder === true && record_.endDateTime === `${futureDate}T${futureTime}`,
        {
          checked,
          saved: !!record_,
          emailReminder: record_ ? record_.emailReminder : undefined,
          endDateTime: record_ ? record_.endDateTime : undefined,
          expected: `${futureDate}T${futureTime}`,
          count: countdowns.length
        }
      )
    } finally {
      await ctx.close()
    }
  })

  // ===================== S5 三通道触发：弹框 + 桌面通知 + EmailJS 邮件 =====================
  await guard('S5) 三通道触发：到期倒计时 → 弹框含名 + __notifications 同名通知 + emailjs mock 收到模板参数', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    try {
      const page = await ctx.newPage()
      page.on('dialog', (d) => d.accept())
      const emailRequests = []
      await setupEmailMock(page, emailRequests)
      await addNotificationSpy(page)

      const name = 'QA 到期倒计时'
      const due = buildDueCountdown('cd_qa_due', name, 1)
      due.emailReminder = true // opt-in 邮件提醒 → shouldSendReminderEmail 通过
      const occurrenceTime = due.endDateTime.replace('T', ' ')
      await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
      await injectIdb(page, 'settings', buildSettings(COMPLETE_EMAIL_SETTINGS))
      await injectIdb(page, 'countdowns', [due])
      await page.reload({ waitUntil: 'networkidle' })

      await page.waitForSelector('.reminder-overlay', { state: 'visible', timeout: 15000 })
      const emailArrived = await waitFor(() => emailRequests.length >= 1, 10000)
      await page.waitForTimeout(300)

      const overlayCount = await page.locator('.reminder-overlay').count()
      const nameText = (await page.locator('.reminder-item .reminder-name').allTextContents()).join(' | ')
      const notifications = await page.evaluate(() => window.__notifications ?? [])
      const notifMatch = notifications.some((n) => n && n.title === name)
      const emailBody = emailRequests.length >= 1 ? emailRequests[0].body : null
      const tp = emailBody ? emailBody.template_params : null
      const emailOk =
        !!tp &&
        tp.to_email === COMPLETE_EMAIL_SETTINGS.reminderEmailTo &&
        tp.countdown_name === name &&
        typeof tp.occurrence_time === 'string' &&
        tp.occurrence_time === occurrenceTime &&
        typeof tp.app_url === 'string' &&
        tp.app_url.length > 0

      await page.locator('.reminder-close').click()
      await page.waitForTimeout(200)
      const overlayClosed = (await page.locator('.reminder-overlay').count()) === 0

      record(
        'S5) 三通道触发：到期倒计时 → 弹框含名 + __notifications 同名通知 + emailjs mock 收到模板参数',
        overlayCount > 0 && nameText.includes(name) && notifMatch && emailArrived && emailOk && overlayClosed,
        {
          overlayCount,
          nameText,
          notifications,
          emailCount: emailRequests.length,
          emailUrl: emailRequests.length >= 1 ? emailRequests[0].url : null,
          template_params: tp,
          occurrenceTime,
          overlayClosed
        }
      )
    } finally {
      await ctx.close()
    }
  })

  // ===================== S6a 门控：emailReminder 缺省 + 配置完整 → 邮件零调用 =====================
  await guard('S6a) 门控：emailReminder 缺省 + 配置完整 → emailjs 零调用（弹框仍出）', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    try {
      const page = await ctx.newPage()
      page.on('dialog', (d) => d.accept())
      const emailRequests = []
      await setupEmailMock(page, emailRequests)
      await addNotificationSpy(page)

      const name = 'QA 缺省邮件倒计时'
      // emailReminder 字段缺省（不输出）→ normalizeCountdown 不输出该字段 → 缺省不发邮件
      const due = buildDueCountdown('cd_qa_noemail', name, 1)
      delete due.emailReminder
      await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
      await injectIdb(page, 'settings', buildSettings(COMPLETE_EMAIL_SETTINGS))
      await injectIdb(page, 'countdowns', [due])
      await page.reload({ waitUntil: 'networkidle' })

      await page.waitForSelector('.reminder-overlay', { state: 'visible', timeout: 15000 })
      await page.waitForTimeout(1500)
      const emailCount = emailRequests.length
      const nameText = (await page.locator('.reminder-item .reminder-name').allTextContents()).join(' | ')
      await page.locator('.reminder-close').click()

      record(
        'S6a) 门控：emailReminder 缺省 + 配置完整 → emailjs 零调用（弹框仍出）',
        emailCount === 0 && nameText.includes(name),
        { emailCount, nameText }
      )
    } finally {
      await ctx.close()
    }
  })

  // ===================== S6b 门控：emailReminder:true + 配置不完整（serviceId 空）→ 邮件零调用 + 页面无 pageerror =====================
  await guard('S6b) 门控：emailReminder:true + 配置不完整（serviceId 空）→ emailjs 零调用 + 页面无 pageerror', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    try {
      const page = await ctx.newPage()
      page.on('dialog', (d) => d.accept())
      const pageErrors = []
      page.on('pageerror', (e) => pageErrors.push(e.message))
      const emailRequests = []
      await setupEmailMock(page, emailRequests)
      await addNotificationSpy(page)

      const name = 'QA 配置缺失倒计时'
      const due = buildDueCountdown('cd_qa_badcfg', name, 1)
      due.emailReminder = true
      // 配置不完整：serviceId 空串 → isEmailConfigured 短路 false，sendReminderEmail 不被调用
      const badSettings = buildSettings({ ...COMPLETE_EMAIL_SETTINGS, reminderEmailServiceId: '' })
      await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
      await injectIdb(page, 'settings', badSettings)
      await injectIdb(page, 'countdowns', [due])
      await page.reload({ waitUntil: 'networkidle' })

      await page.waitForSelector('.reminder-overlay', { state: 'visible', timeout: 15000 })
      await page.waitForTimeout(1500)
      const emailCount = emailRequests.length
      const nameText = (await page.locator('.reminder-item .reminder-name').allTextContents()).join(' | ')
      await page.locator('.reminder-close').click()

      record(
        'S6b) 门控：emailReminder:true + 配置不完整（serviceId 空）→ emailjs 零调用 + 页面无 pageerror',
        emailCount === 0 && pageErrors.length === 0 && nameText.includes(name),
        { emailCount, pageErrors, nameText }
      )
    } finally {
      await ctx.close()
    }
  })

  // ===================== S6c 9:00 摘要不触发邮件（小时<9 记 SKIP 不 FAIL）=====================
  await guard('S6c) 9:00 摘要：STORAGE_KEY 置过去 + 未来3天内未过期倒计时 → 弹框出摘要 + emailjs 零调用（<9 时 SKIP）', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    try {
      const page = await ctx.newPage()
      page.on('dialog', (d) => d.accept())
      const emailRequests = []
      await setupEmailMock(page, emailRequests)
      await addNotificationSpy(page)

      const name = 'QA 摘要倒计时'
      // 未来 2 小时（未过期、days=0 ≤ 3）→ 进「最后 3 天」摘要
      const summaryCountdown = {
        id: 'cd_qa_summary',
        name,
        endDateTime: localDateTime(new Date(Date.now() + 2 * 3600 * 1000)),
        repeat: null,
        category: 'work',
        emailReminder: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
      // STORAGE_KEY 置为过去日期（≠ 今天）→ 引擎 9:00 摘要防同日重复条件通过
      await page.evaluate(() => localStorage.setItem('user-countdown-reminder-date', '2000-01-01'))
      const browserHour = await page.evaluate(() => new Date().getHours())

      if (browserHour < 9) {
        // 引擎条件 now.getHours() >= 9 不满足 → 摘要分支本就不可能执行，无法实测 → SKIP 不 FAIL
        record(
          'S6c) 9:00 摘要：STORAGE_KEY 置过去 + 未来3天内未过期倒计时 → 弹框出摘要 + emailjs 零调用（<9 时 SKIP）',
          true,
          { skipped: true, reason: `当前浏览器本地小时 ${browserHour} < 9，9:00 摘要分支不可测（引擎条件 now.getHours() >= 9）` }
        )
      } else {
        await injectIdb(page, 'settings', buildSettings(COMPLETE_EMAIL_SETTINGS))
        await injectIdb(page, 'countdowns', [summaryCountdown])
        await page.reload({ waitUntil: 'networkidle' })

        await page.waitForSelector('.reminder-overlay', { state: 'visible', timeout: 15000 })
        await page.waitForTimeout(1500)
        const emailCount = emailRequests.length
        const nameText = (await page.locator('.reminder-item .reminder-name').allTextContents()).join(' | ')
        const storedDate = await page.evaluate(() => localStorage.getItem('user-countdown-reminder-date'))
        const todayKey = localDateKey(new Date())
        // 摘要仅弹框+桌面通知，永不发邮件；且同日去重 key 被写入今天
        const summaryOk =
          emailCount === 0 && nameText.includes(name) && storedDate === todayKey
        await page.locator('.reminder-close').click()
        record(
          'S6c) 9:00 摘要：STORAGE_KEY 置过去 + 未来3天内未过期倒计时 → 弹框出摘要 + emailjs 零调用（<9 时 SKIP）',
          summaryOk,
          { emailCount, nameText, storedDate, todayKey, browserHour }
        )
      }
    } finally {
      await ctx.close()
    }
  })

  // ===================== S7 桌面权限：提醒设置开关 → requestPermission 调用 + IDB 持久化 =====================
  await guard('S7) 桌面权限：提醒设置 tab 开 remind-desktop-switch → requestPermission 被调用 + IDB 落库 → 再点关闭恢复', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    try {
      const page = await ctx.newPage()
      page.on('dialog', (d) => d.accept())
      await addNotificationSpy(page)

      await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: '⚙️ 设置' }).click()
      await page.waitForSelector('.manager', { state: 'visible', timeout: 5000 })
      await page.getByRole('tab', { name: '提醒设置' }).click()
      const sw = page.locator('[data-testid="remind-desktop-switch"]')
      await sw.waitFor({ state: 'visible', timeout: 5000 })

      const initialChecked = (await sw.getAttribute('aria-checked')) === 'true'
      await sw.click()
      await page.waitForTimeout(500)
      const afterOnChecked = (await sw.getAttribute('aria-checked')) === 'true'
      const permissionCalls = await page.evaluate(() => window.__notifPermissionCalls ?? 0)
      const settingsOn = await readIdb(page, 'settings')
      const onPersisted = settingsOn && settingsOn.desktopNotifyEnabled === true

      await sw.click()
      await page.waitForTimeout(500)
      const afterOffChecked = (await sw.getAttribute('aria-checked')) === 'true'
      const settingsOff = await readIdb(page, 'settings')
      const offPersisted = settingsOff && settingsOff.desktopNotifyEnabled === false

      record(
        'S7) 桌面权限：提醒设置 tab 开 remind-desktop-switch → requestPermission 被调用 + IDB 落库 → 再点关闭恢复',
        !initialChecked && afterOnChecked && permissionCalls >= 1 && onPersisted && !afterOffChecked && offPersisted,
        { initialChecked, afterOnChecked, permissionCalls, onPersisted, afterOffChecked, offPersisted }
      )
    } finally {
      await ctx.close()
    }
  })

  // ===================== S8 设置持久化：四字段 + 开关 → IDB 落库 → reload 回填 =====================
  await guard('S8) 设置持久化：提醒设置 tab 填四字段 + 开开关 → IDB 落库 → reload 后回填 + 开关仍开', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    try {
      const page = await ctx.newPage()
      page.on('dialog', (d) => d.accept())

      const values = {
        to: 'persist-qa@example.com',
        service: 'service_persist',
        template: 'template_persist',
        key: 'public_key_persist'
      }
      await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: '⚙️ 设置' }).click()
      await page.waitForSelector('.manager', { state: 'visible', timeout: 5000 })
      await page.getByRole('tab', { name: '提醒设置' }).click()

      const emailSwitch = page.locator('[data-testid="remind-email-switch"]')
      await emailSwitch.waitFor({ state: 'visible', timeout: 5000 })
      await emailSwitch.click()
      await page.locator('[data-testid="remind-email-to"]').fill(values.to)
      await page.locator('[data-testid="remind-email-service"]').fill(values.service)
      await page.locator('[data-testid="remind-email-template"]').fill(values.template)
      await page.locator('[data-testid="remind-email-key"]').fill(values.key)
      await page.waitForTimeout(600) // persist() fire-and-forget IDB 写提交

      const persisted = await readIdb(page, 'settings')
      const persistedOk =
        persisted &&
        persisted.reminderEmailEnabled === true &&
        persisted.reminderEmailTo === values.to &&
        persisted.reminderEmailServiceId === values.service &&
        persisted.reminderEmailTemplateId === values.template &&
        persisted.reminderEmailPublicKey === values.key

      await page.keyboard.press('Escape')
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByRole('button', { name: '⚙️ 设置' }).click()
      await page.waitForSelector('.manager', { state: 'visible', timeout: 5000 })
      await page.getByRole('tab', { name: '提醒设置' }).click()
      const restoredSwitch = page.locator('[data-testid="remind-email-switch"]')
      await restoredSwitch.waitFor({ state: 'visible', timeout: 5000 })
      const restoredChecked = (await restoredSwitch.getAttribute('aria-checked')) === 'true'
      const restoredTo = await page.locator('[data-testid="remind-email-to"]').inputValue()
      const restoredService = await page.locator('[data-testid="remind-email-service"]').inputValue()
      const restoredTemplate = await page.locator('[data-testid="remind-email-template"]').inputValue()
      const restoredKey = await page.locator('[data-testid="remind-email-key"]').inputValue()
      const restoredOk =
        restoredChecked &&
        restoredTo === values.to &&
        restoredService === values.service &&
        restoredTemplate === values.template &&
        restoredKey === values.key

      record(
        'S8) 设置持久化：提醒设置 tab 填四字段 + 开开关 → IDB 落库 → reload 后回填 + 开关仍开',
        persistedOk && restoredOk,
        { persisted: persistedOk, restored: restoredOk, values, restoredChecked }
      )
    } finally {
      await ctx.close()
    }
  })

  // ===================== S9 明/暗全页截图（提醒弹框 + 工作台，证据恒 PASS）=====================
  await guard('S9) 明/暗全页截图写入（证据，恒 PASS）', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    try {
      const page = await ctx.newPage()
      page.on('dialog', (d) => d.accept())
      await setupEmailMock(page, [])
      await addNotificationSpy(page)

      const due = buildDueCountdown('cd_qa_evidence', 'QA 证据倒计时', 1)
      due.emailReminder = true
      await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
      await injectIdb(page, 'settings', buildSettings(COMPLETE_EMAIL_SETTINGS))
      await injectIdb(page, 'countdowns', [due])
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForSelector('.reminder-overlay', { state: 'visible', timeout: 15000 })
      await page.waitForTimeout(300)

      mkdirSync(EVIDENCE_DIR, { recursive: true })
      await page.screenshot({ path: EVIDENCE_LIGHT_PNG, fullPage: true })
      const lightSize = existsSync(EVIDENCE_LIGHT_PNG) ? statSync(EVIDENCE_LIGHT_PNG).size : 0
      await page.evaluate(() => document.documentElement.classList.add('dark'))
      await page.waitForTimeout(300)
      await page.screenshot({ path: EVIDENCE_DARK_PNG, fullPage: true })
      const darkSize = existsSync(EVIDENCE_DARK_PNG) ? statSync(EVIDENCE_DARK_PNG).size : 0
      record('S9) 明/暗全页截图写入（证据，恒 PASS）', lightSize > 0 && darkSize > 0, {
        light: { path: EVIDENCE_LIGHT_PNG, bytes: lightSize },
        dark: { path: EVIDENCE_DARK_PNG, bytes: darkSize }
      })
    } finally {
      await ctx.close()
    }
  })

  // ===================== 汇总 =====================
  const totalPassed = results.filter((r) => r.ok).length
  const verdict = totalPassed === results.length && results.length > 0 ? 'PASS' : 'FAIL'
  const skipped = results.filter((r) => {
    try {
      return JSON.parse(r.detail).skipped === true
    } catch {
      return false
    }
  }).length
  const qa = {
    command: 'node scripts/qa-reminder-upgrade.mjs',
    result: `${verdict} (${totalPassed}/${results.length}${skipped > 0 ? `, ${skipped} SKIP` : ''})`,
    browser: 'chromium (playwright, headless)',
    dev_server: `vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
    injection:
      'page.evaluate → IndexedDB easy-web-tab v5 / countdowns+settings / 键 items（Countdown[] 与 AppSettingsData 形状，与 store 持久化一致）',
    mocks: {
      emailjs: 'page.route **/api.emailjs.com/** → POST body {service_id,template_id,user_id,template_params} → fulfill 200',
      notification: 'addInitScript 替换 window.Notification spy（permission=granted，记录到 window.__notifications / __notifPermissionCalls）'
    },
    evidence_light_png: EVIDENCE_LIGHT_PNG,
    evidence_dark_png: EVIDENCE_DARK_PNG,
    assertions: results
  }
  writeFileSync(
    EVIDENCE_LOG,
    JSON.stringify(
      {
        task: 'reminder-upgrade: 定时提醒三通道升级（弹框+桌面通知+EmailJS 邮件）QA（S4-S8 场景 + S9 截图证据）',
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
