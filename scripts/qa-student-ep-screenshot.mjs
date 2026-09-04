/**
 * 学生工作台 EP 换皮截图（批次 A：StudentDiary + StudentExam）
 * 起/复用 vite dev 16718-16726 → 注入 student_settings（stageSeeded 匹配防引导）→
 * /student → 切到 exam / diary 面板 → 明/暗各截 1 张存 .omo/evidence/student-ep/
 * 运行：node scripts/qa-student-ep-screenshot.mjs
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

async function seedStudentSettings(page) {
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
        const tx = db.transaction(['student_settings','student_countdowns','student_diary'], 'readwrite')
        tx.objectStore('student_settings').put({ stage: 'J', stageSeeded: 'J' }, 'items')
        const now = Date.now()
        const pad = (n) => String(n).padStart(2, '0')
        const dk = (offsetDays) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) }
        tx.objectStore('student_countdowns').put({
          countdowns: [
            { id: 'se_demo_1', name: '期中考试-数学', endDateTime: dk(3) + 'T09:00', category: '期中考试', color: '#10b981', repeat: null, sortOrder: 1, createdAt: now - 3000, updatedAt: now - 3000 },
            { id: 'se_demo_2', name: '期末考试-语文', endDateTime: dk(20) + 'T14:30', category: '期末考试', color: '#3b82f6', repeat: null, sortOrder: 2, createdAt: now - 2000, updatedAt: now - 2000 },
            { id: 'se_demo_3', name: '单元测-英语', endDateTime: dk(-2) + 'T10:00', category: '单元测', color: '#f59e0b', repeat: null, sortOrder: 3, createdAt: now - 1000, updatedAt: now - 1000 }
          ],
          customCategories: [],
          sortRule: 'time'
        }, 'items')
        tx.objectStore('student_diary').put({
          entries: [
            { id: 'dy_demo_1', date: dk(0), content: '## 今天\n\n复习了数学错题，感觉进步很大。\n\n- 完成 3 套卷子\n- 背了 20 个单词', createdAt: now - 5000, updatedAt: now - 5000 },
            { id: 'dy_demo_2', date: dk(-1), content: '今天参加了英语单元测，**听力**部分有点难。', createdAt: now - 4000, updatedAt: now - 4000 },
            { id: 'dy_demo_3', date: dk(-2), content: '周末计划：\n\n1. 复习语文古诗\n2. 预习物理新课', createdAt: now - 3000, updatedAt: now - 3000 }
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
  await page.waitForTimeout(300)
}

async function setDark(page, dark) {
  await page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark)
  await page.waitForTimeout(150)
}

async function main() {
  await ensureDevServer()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(devBase + '/student', { waitUntil: 'networkidle' })
  await seedStudentSettings(page)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)

  // 面板索引：0 home, 8 exam, 10 diary（STUDENT_MENU_DEFAULT_ORDER）
  const panels = [
    { name: 'StudentExam', idx: 8 },
    { name: 'StudentDiary', idx: 10 }
  ]

  for (const p of panels) {
    await navMenuIdx(page, p.idx)
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
