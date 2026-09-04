/**
 * QA: 学生工作台 EP 换皮截图（M3 批次1：复习/错题/阅读 三面板）
 * 后台/复用 vite dev 16718-16726 → 注入 IDB student_settings/review/mistakes/reading
 * → /student 逐面板（review idx5 / mistakes idx6 / reading idx7）明暗各 1 张全页截图
 * 存 .omo/evidence/student-ep/；node scripts/qa-student-ep-screenshots.mjs
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

const SUBJECTS = ['语文','数学','英语']

function buildSettings() {
  const visibility = {}
  const ALL_KEYS = ['home','habits','homework','timetable','plan','review','mistakes','reading','exam','diary','pomodoro','achievements','rewards','parent']
  ALL_KEYS.forEach(k => { visibility[k] = true })
  return { stage: 'K', stageSeeded: 'K', nickname: 'QA 小萌娃', subjects: SUBJECTS, menuVisibility: visibility }
}
function buildReview() {
  const d1 = dateOffsetKey(3), d2 = dateOffsetKey(10)
  const d1next = (() => { const d = new Date(d1 + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+1); return d.toISOString().slice(0,10) })()
  const d2next = (() => { const d = new Date(d2 + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+7); return d.toISOString().slice(0,10) })()
  return { entries: [
    { id: 'rv_q1', subject: '数学', knowledge: '加法进位法则', source: '教材 P20', learnDate: d1, stage: 1, nextReviewDate: d1next, mastered: false, createdAt: iso(-28800000), updatedAt: iso(-28800000) },
    { id: 'rv_q2', subject: '语文', knowledge: '古诗《静夜思》默写', source: '错题本', learnDate: d2, stage: 3, nextReviewDate: d2next, mastered: false, createdAt: iso(-32400000), updatedAt: iso(-32400000) }
  ]}
}
function buildMistakes() {
  return { entries: [
    { id: 'mk_q1', subject: '数学', title: '典型进位加法错题', question: '## 题干\n\n28 + 47 = ?', answer: '## 正确答案\n\n28 + 47 = 75', analysis: '### 解析\n\n个位 8+7=15，向十位进 1。', tags: ['高频考点','易错'], imageIds: [], status: 'new', createdAt: iso(-172800000), updatedAt: iso(-172800000) },
    { id: 'mk_q2', subject: '语文', title: '易错字练习', question: '## 题干\n\n选择正确字形：再接再厉 / 再接再励', answer: '## 正确答案\n\n「再接再厉」（厉：磨砺）。', tags: ['基础'], imageIds: [], status: 'reviewing', createdAt: iso(-86400000), updatedAt: iso(-86400000) }
  ]}
}
function buildReading() {
  return { entries: [
    { id: 'rd_q1', bookTitle: '格林童话（第 1 次）', pages: 32, durationMin: 25, impression: '# 感悟\n\n白雪公主的故事很精彩。', date: dateOffsetKey(1), parentSigned: false, createdAt: iso(-21600000), updatedAt: iso(-21600000) },
    { id: 'rd_q2', bookTitle: '安徒生童话', pages: 28, durationMin: 22, date: dateOffsetKey(2), parentSigned: true, signedAt: iso(-18000000), createdAt: iso(-28800000), updatedAt: iso(-18000000) }
  ]}
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
  { name: 'review', idx: 5, testid: 'sr-' },
  { name: 'mistakes', idx: 6, testid: 'sm-' },
  { name: 'reading', idx: 7, testid: 'sr-' }
]

async function main() {
  await ensureDevServer()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  await page.goto(devBase + '/student', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.st-menu-item', { timeout: 15000 })

  await injectIdbStore(page, 'student_settings', buildSettings())
  await injectIdbStore(page, 'student_review', buildReview())
  await injectIdbStore(page, 'student_mistakes', buildMistakes())
  await injectIdbStore(page, 'student_reading', buildReading())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.st-menu-item', { timeout: 15000 })
  await page.waitForTimeout(600)

  for (const p of PANELS) {
    await navMenuIdx(page, p.idx)
    await page.waitForTimeout(400)
    // 面板可见性确认：面板根含 testid 前缀元素
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