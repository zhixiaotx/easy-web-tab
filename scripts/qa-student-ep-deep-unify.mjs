/**
 * 深统一专项 QA：断言 5 处残余原生控件已换 el-*（el-color-picker / el-checkbox / el-slider）
 * 覆盖：StudentHabits sh-form-color → el-color-picker
 *      StudentParent stp-task-check → el-checkbox
 *      StudentPlan    sp-goal-toggle-* → el-checkbox + sp-goal-range-* → el-slider
 *      StudentTimetable stt-custom-toggle → el-checkbox
 * 断言：根元素含 el-* class（testid/class 保留在 el 根上）+ 作用域内无裸原生 input 残留
 * 运行：node scripts/qa-student-ep-deep-unify.mjs
 * 注意：与其它 16718-16726 域 QA 脚本禁并行
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

async function waitForServer(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { const res = await fetch(url); if (res.ok) return true } catch { }
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
  } catch { return false }
}
async function isPortFree(port) {
  try { const res = await fetch('http://localhost:' + port + '/', { signal: AbortSignal.timeout(1500) }); return !res.ok } catch { return true }
}

let server = null, startedByUs = false, devBase = null
async function ensureDevServer() {
  for (let p = 16718; p <= 16726; p++) { if (await isViteDevAt(p)) { devBase = 'http://localhost:' + p; console.log('[dev] reuse at ' + devBase); return } }
  for (let p = 16718; p <= 16726; p++) {
    if (!(await isPortFree(p))) continue
    const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
    server = spawn(process.execPath, [viteBin, '--port', String(p), '--strictPort'], { cwd: ROOT, stdio: ['ignore','pipe','pipe'] })
    startedByUs = true
    server.stdout.on('data', (d) => process.stdout.write('[vite] ' + d))
    server.stderr.on('data', (d) => process.stdout.write('[vite] ' + d))
    const ok = await waitForServer('http://localhost:' + p)
    if (ok && (await isViteDevAt(p))) { devBase = 'http://localhost:' + p; console.log('[dev] ready at ' + devBase); return }
    server.kill(); server = null; startedByUs = false
  }
  throw new Error('no free port 16718-16726 for vite')
}
function stopDevServer() { if (server && startedByUs) { server.kill(); console.log('[dev] stopped') } }

async function seedStudentData(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('easy-web-tab', 12)
    const ALL_STORES = [
      "todos","notes","diary","countdowns","passwords","health","ledger","settings","business",
      "pomodoro","habits","snapshots",
      "student_settings","student_habits","student_pomodoro","student_diary","student_countdowns",
      "student_homework","student_timetable","student_plans","student_review",
      "student_mistakes","student_reading","student_achievements","student_rewards",
      "student_parent_tasks","student_images"
    ]
    req.onupgradeneeded = () => {
      const db = req.result
      for (const s of ALL_STORES) { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s) }
    }
    req.onsuccess = () => {
      const db = req.result
      try {
        const tx = db.transaction([
          'student_settings','student_habits','student_plans','student_parent_tasks','student_timetable'
        ], 'readwrite')
        const now = Date.now()
        const iso = (offsetMs) => new Date(now + offsetMs).toISOString()
        const pad = (n) => String(n).padStart(2, '0')
        const dk = (offsetDays) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) }
        const visibility = {}
        const ALL_KEYS = ['home','habits','homework','timetable','plan','review','mistakes','reading','exam','diary','pomodoro','achievements','rewards','parent']
        ALL_KEYS.forEach(k => { visibility[k] = true })
        tx.objectStore('student_settings').put({ stage: 'J', stageSeeded: 'J', nickname: 'QA 小萌娃', subjects: ['语文','数学','英语'], menuVisibility: visibility }, 'items')
        tx.objectStore('student_habits').put({
          habits: [
            { id: 'shb_1', name: '每天阅读 20 分钟', category: 'study', frequency: 7, color: '#3b82f6', createdAt: iso(-86400000 * 30), updatedAt: iso(-86400000 * 30) }
          ],
          records: [
            { id: 'shr_1', habitId: 'shb_1', date: dk(0), createdAt: iso(-86400000) }
          ]
        }, 'items')
        tx.objectStore('student_plans').put({
          entries: [
            { id: 'pl_1', type: 'weekly', title: '本周学习计划', startDate: dk(-7), endDate: dk(0), goals: [
              { id: 'pg_1', content: '完成语文课后练习', progress: 100, done: true },
              { id: 'pg_2', content: '数学口算 100 题', progress: 60, done: false },
              { id: 'pg_3', content: '英语单词听写', progress: 30, done: false }
            ], createdAt: iso(-86400000 * 7), updatedAt: iso(-86400000) }
          ]
        }, 'items')
        tx.objectStore('student_parent_tasks').put({
          tasks: [
            { id: 'pt_1', title: '完成数学作业并检查', date: dk(0), done: true, source: 'parent' },
            { id: 'pt_2', title: '背诵英语单词 20 个', date: dk(0), done: false, source: 'parent' }
          ]
        }, 'items')
        tx.objectStore('student_timetable').put({ weeks: 20, periodsPerDay: 8, cells: {} }, 'items')
        tx.oncomplete = () => { db.close(); resolve(true) }
        tx.onerror = () => { db.close(); reject(tx.error) }
      } catch (e) { db.close(); reject(e) }
    }
    req.onerror = () => reject(req.error)
  }))
}

async function navMenuIdx(page, idx) {
  await page.evaluate((n) => new Promise((resolve) => {
    const nodes = document.querySelectorAll('.st-menu-item')
    if (nodes && nodes.length > n) { const b = nodes[n]; if (b) { b.scrollIntoView({ block: 'center' }); b.click() } }
    resolve(true)
  }), idx)
  await page.waitForTimeout(400)
}

async function unlockParent(page) {
  const unlockBtn = page.locator('.stp-locked-card button:has-text("输入家长 PIN 解锁")')
  await unlockBtn.waitFor({ state: 'visible', timeout: 8000 })
  await unlockBtn.click()
  await page.waitForTimeout(300)
  const keypad = page.locator('.st-pin-keypad')
  await keypad.waitFor({ state: 'visible', timeout: 8000 })
  async function pressDigits(digits) {
    for (const d of digits) {
      await page.locator('.st-pin-key', { hasText: d }).first().click()
      await page.waitForTimeout(80)
    }
  }
  async function pressConfirm() {
    await page.locator('.st-pin-confirm:not(:disabled)').click()
    await page.waitForTimeout(300)
  }
  await pressDigits(['1', '2', '3', '4'])
  await pressConfirm()
  await pressDigits(['1', '2', '3', '4'])
  await pressConfirm()
  await page.waitForTimeout(600)
}

let failures = 0
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name)
  if (!cond) failures++
}

// 断言 sel 首个可见元素根 classList 含 elClass（testid/class 已平移保留在 el 根上）
async function rootHasElClass(page, sel, elClass) {
  return page.evaluate(({ sel, elClass }) => {
    let found = false
    document.querySelectorAll(sel).forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      if (el.classList && el.classList.contains(elClass)) found = true
    })
    return found
  }, { sel, elClass })
}

// 断言 scope 选择器内（可见元素）裸原生 input 计数为 0
async function noNativeInputIn(page, scopeSel, inputType) {
  return page.evaluate(({ scopeSel, inputType }) => {
    let native = 0
    document.querySelectorAll(scopeSel).forEach((scope) => {
      const r = scope.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      scope.querySelectorAll('input').forEach((inp) => {
        if (inp.type === inputType) native++
      })
    })
    return native === 0
  }, { scopeSel, inputType })
}

async function main() {
  await ensureDevServer()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(devBase + '/student', { waitUntil: 'networkidle' })
  await seedStudentData(page)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)

  // ---- StudentHabits (idx 1)：新增弹框 → sh-form-color 为 el-color-picker ----
  await navMenuIdx(page, 1)
  check('sh: 面板 data-testid 可见', await page.evaluate(() => {
    const el = document.querySelector('[data-testid^="sh-card-"]')
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }))
  await page.locator('[data-testid="sh-add-btn"]').click()
  await page.waitForTimeout(400)
  check('sh: 新增弹框 el-dialog 打开', await page.locator('.el-dialog:visible').count() > 0)
  check('sh: form-color 根为 el-color-picker', await rootHasElClass(page, '[data-testid="sh-form-color"]', 'el-color-picker'))
  check('sh: 弹框内无原生 input[type=color]', await noNativeInputIn(page, '.el-dialog', 'color'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // ---- StudentTimetable (idx 3)：点击空白格子 → 弹框内 stt-custom-toggle 为 el-checkbox ----
  await navMenuIdx(page, 3)
  await page.evaluate(() => new Promise((resolve) => {
    const cell = document.querySelector('.stt-body-cell')
    if (cell) cell.click()
    resolve(true)
  }))
  await page.waitForTimeout(400)
  check('tt: 课程弹框 el-dialog 打开', await page.locator('.el-dialog:visible').count() > 0)
  check('tt: stt-custom-toggle 根为 el-checkbox', await rootHasElClass(page, '.stt-custom-toggle', 'el-checkbox'))
  check('tt: 弹框内无裸原生 checkbox（非 el 内部 __original）', await page.evaluate(() => {
    let bare = 0
    document.querySelectorAll('.el-dialog').forEach((dlg) => {
      const r = dlg.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      dlg.querySelectorAll('input[type="checkbox"]').forEach((inp) => {
        if (!inp.classList.contains('el-checkbox__original')) bare++
      })
    })
    return bare === 0
  }))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // ---- StudentPlan (idx 4)：展开首行 → sp-goal-toggle-* 为 el-checkbox + sp-goal-range-* 为 el-slider ----
  await navMenuIdx(page, 4)
  await page.waitForTimeout(300)
  // 注意：el-table 展开图标必须真实鼠标点击（DOM click() 不触发 expand）
  await page.locator('.sp-list .el-table__expand-icon').first().click()
  await page.waitForTimeout(600)
  check('pl: 目标行展开后 goals 出现', await page.evaluate(() => {
    const el = document.querySelector('[data-testid^="sp-goal-toggle-"]')
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }))
  check('pl: goal-toggle 根为 el-checkbox', await rootHasElClass(page, '[data-testid^="sp-goal-toggle-"]', 'el-checkbox'))
  check('pl: goal-range 根为 el-slider', await rootHasElClass(page, '[data-testid^="sp-goal-range-"]', 'el-slider'))
  check('pl: 展开区内无原生 input[type=range]', await noNativeInputIn(page, '.sp-goals-expand', 'range'))
  check('pl: 展开区内无裸原生 checkbox', await page.evaluate(() => {
    let bare = 0
    document.querySelectorAll('.sp-goals-expand').forEach((scope) => {
      const r = scope.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      scope.querySelectorAll('input[type="checkbox"]').forEach((inp) => {
        if (!inp.classList.contains('el-checkbox__original')) bare++
      })
    })
    return bare === 0
  }))

  // ---- StudentParent (idx 14)：解锁 → 每日任务 tab → stp-task-check 为 el-checkbox ----
  await navMenuIdx(page, 14)
  check('stp: 锁态横幅显示', await page.locator('.stp-locked-banner').count() === 1)
  await unlockParent(page)
  check('stp: 解锁后锁态消失', await page.locator('.stp-locked-banner').count() === 0)
  await page.locator('[data-testid="stp-tab-tasks"]').click()
  await page.waitForTimeout(400)
  check('stp: 每日任务 tab 卡片渲染', await page.locator('.stp-task-card').count() > 0)
  check('stp: stp-task-check 根为 el-checkbox', await rootHasElClass(page, '.stp-task-check', 'el-checkbox'))
  check('stp: 任务卡内无裸原生 checkbox', await page.evaluate(() => {
    let bare = 0
    document.querySelectorAll('.stp-task-card').forEach((scope) => {
      scope.querySelectorAll('input[type="checkbox"]').forEach((inp) => {
        if (!inp.classList.contains('el-checkbox__original')) bare++
      })
    })
    return bare === 0
  }))

  await browser.close()
  stopDevServer()
  console.log(failures === 0 ? '\n[ALL PASS]' : '\n[' + failures + ' FAILURES]')
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); stopDevServer(); process.exit(1) })