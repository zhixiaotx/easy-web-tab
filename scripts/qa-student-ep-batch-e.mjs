/**
 * 学生工作台 EP 换皮截图（批次 E：StudentAchievements + StudentEducation + StudentParent）
 * 起/复用 vite dev 16718-16726 → 注入 student_settings（stageSeeded 匹配防引导）+
 * achievements/education/parent_tasks/rewards/homework 种子数据 →
 * /student → 切到 achievements(12) / education(9) / parent(14) 面板 →
 * 家长面板走 PIN 首次设置流程解锁 → 明/暗各截 1 张存 .omo/evidence/student-ep/
 * 运行：node scripts/qa-student-ep-batch-e.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'student-ep')
if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true })

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

        // 成就：内置定义自动合并，预解锁 4 枚（streak-1/hw-first/book-1/pomo-1）
        tx.objectStore('student_achievements').put({
          definitions: [],
          unlocked: {
            'streak-1': iso(-86400000 * 3),
            'hw-first': iso(-86400000 * 2),
            'book-1': iso(-86400000),
            'pomo-1': iso(-3600000)
          }
        }, 'items')

        // 教育经历：3 条（含在读 + 已毕业 + 可选字段）
        tx.objectStore('student_education').put({
          entries: [
            { id: 'edu_demo_1', schoolName: '阳光实验小学', degree: '小学', startDate: '2018-09-01', endDate: '2024-06-30', isActive: false, major: '', classTeacher: '王老师', courseTeacher: '李老师', phone: '13800000001', note: '三好学生', createdAt: iso(-86400000 * 30), updatedAt: iso(-86400000 * 30) },
            { id: 'edu_demo_2', schoolName: '市第一中学', degree: '初中', startDate: '2024-09-01', isActive: true, classTeacher: '张老师', createdAt: iso(-86400000 * 20), updatedAt: iso(-86400000 * 20) },
            { id: 'edu_demo_3', schoolName: '启航幼儿园', degree: '幼儿园', startDate: '2015-09-01', endDate: '2018-06-30', isActive: false, note: '毕业', createdAt: iso(-86400000 * 10), updatedAt: iso(-86400000 * 10) }
          ]
        }, 'items')

        // 家长每日任务：今天 3 条（2 完成 1 未完成）+ 昨天 1 条
        tx.objectStore('student_parent_tasks').put({
          tasks: [
            { id: 'pt_demo_1', title: '完成数学作业并检查', date: dk(0), done: true, source: 'parent' },
            { id: 'pt_demo_2', title: '背诵英语单词 20 个', date: dk(0), done: true, source: 'parent' },
            { id: 'pt_demo_3', title: '整理错题本', date: dk(0), done: false, source: 'parent' },
            { id: 'pt_demo_4', title: '阅读课外书 30 分钟', date: dk(-1), done: true, source: 'parent' }
          ]
        }, 'items')

        // 奖励积分：120 分 + 2 条历史 + 2 个可兑换奖励
        tx.objectStore('student_rewards').put({
          totalPoints: 120,
          history: [
            { id: 'rt_demo_1', type: 'earn', points: 50, reason: '完成一周作业打卡', createdAt: iso(-86400000 * 5) },
            { id: 'rt_demo_2', type: 'earn', points: 70, reason: '期中考试进步', createdAt: iso(-86400000 * 2) }
          ],
          rewards: [
            { id: 'rw_demo_1', name: '周末游乐园', cost: 100, stock: 1 },
            { id: 'rw_demo_2', name: '新文具一套', cost: 30, stock: 3 }
          ]
        }, 'items')

        // 作业：3 条（孩子报告 tab 用）
        tx.objectStore('student_homework').put({
          entries: [
            { id: 'hw_demo_1', subject: '数学', title: '练习册第 3 单元', content: '完成 1-15 题', dueDate: dk(0), status: 'done', priority: 'high', createdAt: iso(-86400000 * 2), updatedAt: iso(-86400000) },
            { id: 'hw_demo_2', subject: '语文', title: '背诵古诗三首', dueDate: dk(1), status: 'doing', priority: 'normal', createdAt: iso(-86400000), updatedAt: iso(-3600000) },
            { id: 'hw_demo_3', subject: '英语', title: '单词听写', dueDate: dk(2), status: 'pending', priority: 'low', createdAt: iso(-3600000), updatedAt: iso(-3600000) }
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

async function setDark(page, dark) {
  await page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark)
  await page.waitForTimeout(150)
}

/** 家长面板解锁：首次设置 PIN（4 位 1234）→ 弹窗关闭 → 面板解锁 */
async function unlockParent(page) {
  // 点击锁态横幅的「输入家长 PIN 解锁」按钮
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

  // setup 第一步：输入 1234 → 下一步
  await pressDigits(['1', '2', '3', '4'])
  await pressConfirm()
  // setup 第二步：再次输入 1234 → 保存
  await pressDigits(['1', '2', '3', '4'])
  await pressConfirm()

  // 弹窗关闭 + 面板解锁
  await page.waitForTimeout(600)
  const dialogGone = await page.locator('.st-pin-dialog').count()
  if (dialogGone > 0) {
    // 可能因 toast 或校验失败重开，重试一次完整流程
    await page.locator('.st-pin-close').first().click().catch(() => {})
    await page.waitForTimeout(300)
    await unlockBtn.click()
    await page.waitForTimeout(300)
    await pressDigits(['1', '2', '3', '4'])
    await pressConfirm()
    await pressDigits(['1', '2', '3', '4'])
    await pressConfirm()
    await page.waitForTimeout(600)
  }
  const unlocked = await page.locator('.stp-locked-banner').count()
  console.log('[parent] dialog gone=' + (dialogGone === 0) + ' lockedBanner=' + unlocked)
}

async function main() {
  await ensureDevServer()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(devBase + '/student', { waitUntil: 'networkidle' })
  await seedStudentData(page)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)

  // 面板索引（STUDENT_MENU_DEFAULT_ORDER）：9 education, 12 achievements, 14 parent
  const panels = [
    { name: 'StudentEducation', idx: 9 },
    { name: 'StudentAchievements', idx: 12 },
    { name: 'StudentParent', idx: 14, unlock: true }
  ]

  for (const p of panels) {
    await navMenuIdx(page, p.idx)
    if (p.unlock) await unlockParent(page)
    // 亮色
    await setDark(page, false)
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(EVIDENCE_DIR, p.name + '-light.png'), fullPage: true, type: 'png' })
    console.log('[shot] ' + p.name + '-light.png')
    // 暗色
    await setDark(page, true)
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(EVIDENCE_DIR, p.name + '-dark.png'), fullPage: true, type: 'png' })
    console.log('[shot] ' + p.name + '-dark.png')
  }

  await browser.close()
  stopDevServer()
  console.log('[done] screenshots in ' + EVIDENCE_DIR)
}

main().catch((e) => { console.error(e); stopDevServer(); process.exit(1) })