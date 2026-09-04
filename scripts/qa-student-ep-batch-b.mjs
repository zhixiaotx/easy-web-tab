/**
 * 学生工作台 EP 换皮截图（批次 B：StudentHabits + StudentHomework + StudentPlan）
 * 起/复用 vite dev 16718-16726 → 注入 student_settings/habits/homework/plans →
 * /student → 切到 habits(idx1) / homework(idx2) / plan(idx4) 面板 → 明/暗各截 1 张
 * 存 .omo/evidence/student-ep/；运行：node scripts/qa-student-ep-batch-b.mjs
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

function pad(n) { return String(n).padStart(2, '0') }
function localDateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) }
function dateOffsetKey(daysBack) { const n = new Date(); return localDateKey(new Date(n.getFullYear(), n.getMonth(), n.getDate()-daysBack)) }
function iso(offsetMs) { return new Date(Date.now() + (offsetMs || 0)).toISOString() }

const SUBJECTS = ['语文', '数学', '英语']

function buildSettings() {
  const visibility = {}
  const ALL_KEYS = ['home','habits','homework','timetable','plan','review','mistakes','reading','exam','diary','pomodoro','achievements','rewards','parent']
  ALL_KEYS.forEach(k => { visibility[k] = true })
  return { stage: 'K', stageSeeded: 'K', nickname: 'QA 小萌娃', subjects: SUBJECTS, menuVisibility: visibility }
}

function buildHabits() {
  const today = dateOffsetKey(0)
  const y1 = dateOffsetKey(1), y2 = dateOffsetKey(2), y3 = dateOffsetKey(3)
  return {
    habits: [
      { id: 'shb_1', name: '每天阅读 20 分钟', category: 'study', frequency: 7, color: '#3b82f6', createdAt: iso(-86400000 * 30), updatedAt: iso(-86400000 * 30) },
      { id: 'shb_2', name: '跳绳 500 个', category: 'exercise', frequency: 5, color: '#10b981', createdAt: iso(-86400000 * 20), updatedAt: iso(-86400000 * 20) },
      { id: 'shb_3', name: '早睡早起', category: 'life', frequency: 7, color: '#f59e0b', createdAt: iso(-86400000 * 10), updatedAt: iso(-86400000 * 10) }
    ],
    records: [
      { id: 'shr_1', habitId: 'shb_1', date: y3, createdAt: iso(-86400000 * 3) },
      { id: 'shr_2', habitId: 'shb_1', date: y2, createdAt: iso(-86400000 * 2) },
      { id: 'shr_3', habitId: 'shb_1', date: y1, createdAt: iso(-86400000) },
      { id: 'shr_4', habitId: 'shb_1', date: today, createdAt: iso(0) },
      { id: 'shr_5', habitId: 'shb_2', date: y2, createdAt: iso(-86400000 * 2) },
      { id: 'shr_6', habitId: 'shb_2', date: y1, createdAt: iso(-86400000) },
      { id: 'shr_7', habitId: 'shb_3', date: y1, createdAt: iso(-86400000) }
    ]
  }
}

function buildHomework() {
  return {
    entries: [
      { id: 'hw_1', subject: '语文', title: '背诵《静夜思》并默写', content: '要求家长签字确认', dueDate: dateOffsetKey(1), status: 'pending', priority: 'high', createdAt: iso(-86400000 * 2), updatedAt: iso(-86400000 * 2) },
      { id: 'hw_2', subject: '数学', title: '口算练习 50 题', content: 'P32-P33', dueDate: dateOffsetKey(0), status: 'doing', priority: 'normal', createdAt: iso(-86400000), updatedAt: iso(-3600000) },
      { id: 'hw_3', subject: '英语', title: 'Unit 3 单词抄写 3 遍', dueDate: dateOffsetKey(-1), status: 'overdue', priority: 'normal', createdAt: iso(-86400000 * 3), updatedAt: iso(-86400000 * 3) },
      { id: 'hw_4', subject: '数学', title: '预习第 5 单元', dueDate: dateOffsetKey(2), status: 'pending', priority: 'low', createdAt: iso(-3600000), updatedAt: iso(-3600000) },
      { id: 'hw_5', subject: '语文', title: '周记一篇', content: '主题：我的周末', dueDate: dateOffsetKey(-2), status: 'done', priority: 'normal', completedAt: iso(-86400000), createdAt: iso(-86400000 * 4), updatedAt: iso(-86400000) }
    ]
  }
}

function buildPlans() {
  const today = dateOffsetKey(0)
  const endWeekly = dateOffsetKey(-7), endMonthly = dateOffsetKey(-30), endTerm = dateOffsetKey(-120)
  return {
    entries: [
      { id: 'pl_1', type: 'weekly', title: '本周学习计划', startDate: dateOffsetKey(-7), endDate: endWeekly, goals: [
        { id: 'pg_1', content: '完成语文课后练习', progress: 100, done: true },
        { id: 'pg_2', content: '数学口算 100 题', progress: 60, done: false },
        { id: 'pg_3', content: '英语单词听写', progress: 30, done: false }
      ], review: '本周整体完成度不错，数学口算还需加强。', createdAt: iso(-86400000 * 7), updatedAt: iso(-86400000) },
      { id: 'pl_2', type: 'monthly', title: '本月阅读计划', startDate: dateOffsetKey(-30), endDate: endMonthly, goals: [
        { id: 'pg_4', content: '读完《格林童话》', progress: 80, done: false },
        { id: 'pg_5', content: '读完《安徒生童话》', progress: 40, done: false }
      ], createdAt: iso(-86400000 * 30), updatedAt: iso(-86400000 * 2) },
      { id: 'pl_3', type: 'term', title: '学期目标', startDate: dateOffsetKey(-120), endDate: endTerm, goals: [
        { id: 'pg_6', content: '期末数学 95 分以上', progress: 50, done: false },
        { id: 'pg_7', content: '学会跳绳', progress: 100, done: true }
      ], review: '跳绳目标已达成！', createdAt: iso(-86400000 * 120), updatedAt: iso(-86400000 * 3) }
    ]
  }
}

async function injectIdbStore(page, storeName, payload) {
  return page.evaluate(({ store, value }) => new Promise((resolve, reject) => {
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
        const tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).put(value, 'items')
        tx.oncomplete = () => { db.close(); resolve(true) }
        tx.onerror = () => { db.close(); reject(tx.error) }
      } catch (e) { db.close(); reject(e) }
    }
    req.onerror = () => reject(req.error)
  }), { store: storeName, value: payload })
}

async function navMenuIdx(page, idx) {
  await page.evaluate((n) => new Promise((resolve) => {
    const nodes = document.querySelectorAll('.st-menu-item')
    if (nodes && nodes.length > n) { const b = nodes[n]; if (b) { b.scrollIntoView({ block: 'center' }); b.click() } }
    resolve(true)
  }), idx)
  await page.waitForTimeout(350)
}
async function setDark(page, dark) { await page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark) }

const PANELS = [
  { name: 'StudentHabits', idx: 1, testid: 'sh-' },
  { name: 'StudentHomework', idx: 2, testid: 'shw-' },
  { name: 'StudentPlan', idx: 4, testid: 'sp-' }
]

async function main() {
  await ensureDevServer()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(devBase + '/student', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.st-menu-item', { timeout: 15000 })

  await injectIdbStore(page, 'student_settings', buildSettings())
  await injectIdbStore(page, 'student_habits', buildHabits())
  await injectIdbStore(page, 'student_homework', buildHomework())
  await injectIdbStore(page, 'student_plans', buildPlans())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.st-menu-item', { timeout: 15000 })
  await page.waitForTimeout(600)

  for (const p of PANELS) {
    await navMenuIdx(page, p.idx)
    await page.waitForTimeout(400)
    const visible = await page.evaluate((prefix) => {
      const el = document.querySelector('[data-testid^="' + prefix + '"]')
      if (!el) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }, p.testid)
    console.log(`[panel] ${p.name} visible=${visible}`)

    await setDark(page, false)
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(EVIDENCE_DIR, p.name + '-light.png'), fullPage: true, type: 'png' })

    await setDark(page, true)
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(EVIDENCE_DIR, p.name + '-dark.png'), fullPage: true, type: 'png' })
    console.log(`[shot] ${p.name} light+dark saved`)
  }

  await browser.close()
  stopDevServer()
  console.log('[done] screenshots in ' + EVIDENCE_DIR)
}

main().catch((err) => { console.error(err); stopDevServer(); process.exit(1) })