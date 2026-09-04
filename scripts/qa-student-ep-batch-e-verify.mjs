/**
 * 批次 E 面板 DOM 验证：断言 EP 组件 + testid 保留 + 家长解锁
 * 运行：node scripts/qa-student-ep-batch-e-verify.mjs
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
          'student_settings','student_achievements','student_education','student_parent_tasks',
          'student_rewards','student_homework'
        ], 'readwrite')
        tx.objectStore('student_settings').put({ stage: 'J', stageSeeded: 'J' }, 'items')
        const now = Date.now()
        const iso = (offsetMs) => new Date(now + offsetMs).toISOString()
        const pad = (n) => String(n).padStart(2, '0')
        const dk = (offsetDays) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) }
        tx.objectStore('student_achievements').put({
          definitions: [],
          unlocked: { 'streak-1': iso(-86400000 * 3), 'hw-first': iso(-86400000 * 2), 'book-1': iso(-86400000), 'pomo-1': iso(-3600000) }
        }, 'items')
        tx.objectStore('student_education').put({
          entries: [
            { id: 'edu_demo_1', schoolName: '阳光实验小学', degree: '小学', startDate: '2018-09-01', endDate: '2024-06-30', isActive: false, classTeacher: '王老师', createdAt: iso(-86400000 * 30), updatedAt: iso(-86400000 * 30) },
            { id: 'edu_demo_2', schoolName: '市第一中学', degree: '初中', startDate: '2024-09-01', isActive: true, classTeacher: '张老师', createdAt: iso(-86400000 * 20), updatedAt: iso(-86400000 * 20) }
          ]
        }, 'items')
        tx.objectStore('student_parent_tasks').put({
          tasks: [
            { id: 'pt_demo_1', title: '完成数学作业并检查', date: dk(0), done: true, source: 'parent' },
            { id: 'pt_demo_2', title: '背诵英语单词 20 个', date: dk(0), done: false, source: 'parent' }
          ]
        }, 'items')
        tx.objectStore('student_rewards').put({
          totalPoints: 120,
          history: [{ id: 'rt_demo_1', type: 'earn', points: 50, reason: '完成一周作业打卡', createdAt: iso(-86400000 * 5) }],
          rewards: [{ id: 'rw_demo_1', name: '周末游乐园', cost: 100, stock: 1 }]
        }, 'items')
        tx.objectStore('student_homework').put({
          entries: [
            { id: 'hw_demo_1', subject: '数学', title: '练习册第 3 单元', dueDate: dk(0), status: 'done', priority: 'high', createdAt: iso(-86400000 * 2), updatedAt: iso(-86400000) }
          ]
        }, 'items')
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

async function main() {
  await ensureDevServer()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(devBase + '/student', { waitUntil: 'networkidle' })
  await seedStudentData(page)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)

  // ---- StudentEducation (idx 9) ----
  await navMenuIdx(page, 9)
  check('edu: el-table 渲染', await page.locator('.edu-list .el-table').count() > 0)
  check('edu: 新增按钮 el-button', await page.locator('button:has-text("新增")').count() > 0)
  check('edu: 编辑按钮 testid 保留', await page.locator('[data-testid="edu-edit-edu_demo_1"]').count() === 1)
  check('edu: 删除按钮 testid 保留', await page.locator('[data-testid="edu-delete-edu_demo_1"]').count() === 1)
  // 打开新增弹框 → el-dialog
  await page.locator('button:has-text("新增")').first().click()
  await page.waitForTimeout(400)
  check('edu: 新增弹框 el-dialog', await page.locator('.el-dialog:visible').count() > 0)
  check('edu: 弹框内 el-input', await page.locator('.el-dialog:visible .el-input').count() > 0)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // ---- StudentAchievements (idx 12) ----
  await navMenuIdx(page, 12)
  check('sa: 分类 tabs el-radio-button', await page.locator('.el-radio-button').count() > 0)
  check('sa: 分类 tab testid 保留', await page.locator('[data-testid^="sa-cat-"]').count() > 0)
  check('sa: 勋章卡片渲染', await page.locator('[data-testid^="sa-badge-"]').count() > 0)
  check('sa: 已解锁勋章显示', await page.locator('.sa-badge-status.unlocked').count() > 0)
  // 打开详情弹框
  const firstCard = page.locator('[data-testid^="sa-badge-"]').first()
  if (await firstCard.count() > 0) {
    await firstCard.click()
    await page.waitForTimeout(400)
    check('sa: 详情弹框 el-dialog', await page.locator('.el-dialog:visible').count() > 0)
    check('sa: 弹框 testid 保留', await page.locator('[data-testid="sa-dialog"]').count() > 0)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }

  // ---- StudentParent (idx 14) ----
  await navMenuIdx(page, 14)
  check('stp: 锁态横幅显示', await page.locator('.stp-locked-banner').count() === 1)
  await unlockParent(page)
  check('stp: 解锁后锁态消失', await page.locator('.stp-locked-banner').count() === 0)
  check('stp: 6-tab 容器 testid 保留', await page.locator('[data-testid="stp-tabs"]').count() === 1)
  check('stp: 统计 tab 内容渲染', await page.locator('.stp-stats, .stp-tab-content').count() > 0)
  check('stp: 每日任务 tab 可切换', await page.locator('[data-testid^="stp-tab-"]').count() >= 6)

  await browser.close()
  stopDevServer()
  console.log(failures === 0 ? '\n[ALL PASS]' : '\n[' + failures + ' FAILURES]')
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); stopDevServer(); process.exit(1) })