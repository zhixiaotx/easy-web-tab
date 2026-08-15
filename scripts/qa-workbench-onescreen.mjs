/**
 * QA: 工作台一屏布局脚手架 + 行高测量（workbench-onescreen）— Wave-1 T4（TDD RED/GREEN 前置契约）
 *
 * 在既有 E1 脚手架（后台启动/复用 vite dev 16718-16726 → /workbench → wb-menu-*）基础上：
 *
 *  - 数据注入：向 IndexedDB easy-web-tab v5（见 src/composables/useIdb.ts DB_VERSION=5，out-of-line 键
 *    'items'）的 11 个 store（todos/notes/diary/countdowns/habits/health/ledger + pomodoro/habits/snapshots 辅助）
 *    写入各 store normalize 函数接受的形状（形状逐一对照 src/stores/* 与 src/composables/*Core.ts）：
 *      todos      → 15 条 WorkbenchTodo
 *      notes      → NoteData { categories: [], notes: [12 普通 + 1 时光轴(20 entries)] }
 *      diary      → DiaryData { entries: [12 条唯一本地日期] }（对象形状，非裸数组）
 *      countdowns → 10 条 Countdown
 *      habits     → 15 条习惯
 *      health     → { height, plans, records }，exercise/diet/sleep/weight 各 15 条记录
 *      ledger     → { categories, entries }，25 条流水跨当前月与上月
 *      passwords  → 不注入 IDB（crypto-js 加密 blob 需设备密钥，裸注入会损坏）——改走 UI 流程：
 *                   进密码面板 → 设置主密码 → 添加 12 条
 *  - 行高测量（R4）：两个视口（1366x768 与 1920x1080）分别测量各面板列表「首个条目」的外层高度
 *    （page.evaluate + Element.getBoundingClientRect），取两视口 MAX + 2px 边距 → 写
 *    .omo/evidence/workbench-onescreen/row-heights.json：
 *    { todo, notes, timeline, diary, countdown, habits, password, exercise, diet, sleep, weight, ledger }（整数 px）
 *  - 截图：10 个菜单面板明/暗全页截图 → .omo/evidence/workbench-onescreen/<panel>-<light|dark>-<viewport>.png
 *  - 清理：结束杀掉自起的 dev server + 关闭 browser；与其它 QA 脚本禁止并行（同端口域）
 *
 * 本脚本只负责「脚手架 + 测量」，不实现最终的一屏无滚动断言（scrollHeight<=clientHeight+1 等）——
 * 那是 Wave-3 T13 的扩展点（本文件同路径继续扩展）。
 *
 * 运行：node scripts/qa-workbench-onescreen.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'workbench-onescreen')
const ROW_HEIGHTS_JSON = join(EVIDENCE_DIR, 'row-heights.json')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'qa-workbench-onescreen.log')

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

/** 本地日期 'YYYY-MM-DD'（手动 pad，无 UTC 偏移——与 dateKeyOf 同源）。 */
function localDateKey(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 距今 daysBack 天的本地日期键。 */
function dateOffsetKey(daysBack) {
  const now = new Date()
  return localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack))
}

/** 当月键 'YYYY-MM'（offset 为相对当月的月份偏移，跨年安全）。 */
function monthKeyOffset(offset) {
  const now = new Date()
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`
}

// ===== 数据注入 =====

/**
 * 向 IndexedDB easy-web-tab v5 的指定 store 以键 'items' 写入 payload。
 * 在页面上下文执行（应用自身 openIdb 缓存独立，同版本不触发 versionchange）。
 */
async function injectIdbStore(page, storeName, payload) {
  return page.evaluate(
    ({ store, value }) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('easy-web-tab', 5)
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store)
        }
        req.onsuccess = () => {
          const db = req.result
          try {
            const tx = db.transaction(store, 'readwrite')
            tx.objectStore(store).put(value, 'items')
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
    { store: storeName, value: payload }
  )
}

// ===== 常量（形状逐一对照 src/types/index.ts 与 src/composables/*Core.ts）=====

const NOTE_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink']
const EXERCISE_TYPES = ['跑步', '游泳', '力量', '骑行', '瑜伽', '其他']
const MEAL_TYPES = ['早餐', '午餐', '晚餐', '加餐']
const COLOR_PRESETS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899']
const COUNTDOWN_CATEGORIES = ['work', 'life', 'study', 'exercise', 'diet', 'sleep']

// ===== 数据构建（均按各 store normalize 接受/保留的形状）=====

function iso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString()
}

function buildTodos() {
  const out = []
  for (let i = 1; i <= 15; i++) {
    out.push({
      id: `td_${i}`,
      title: `待办任务 ${i}：为工作台一屏布局测量准备的示例任务`,
      description: i % 3 === 0 ? `这是待办 ${i} 的描述信息，验证多行描述对卡片高度的影响。` : undefined,
      priority: i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low',
      dueDate: i % 4 === 0 ? dateOffsetKey(i % 7) : undefined,
      completed: i % 5 === 0,
      createdAt: iso(-i * 86400000),
      updatedAt: iso(-i * 86400000),
      color: COLOR_PRESETS[i % COLOR_PRESETS.length],
      categoryId: undefined
    })
  }
  return out
}

function buildNotesData() {
  const notes = []
  for (let i = 1; i <= 12; i++) {
    notes.push({
      id: `nt_n${i}`,
      title: `普通便签 ${i}`,
      content: `这是普通便签 ${i} 的内容，包含 **加粗** 与 [链接](https://example.com)。`,
      color: NOTE_COLORS[i % NOTE_COLORS.length],
      pinned: i <= 2,
      createdAt: iso(-i * 3600000),
      updatedAt: iso(-i * 3600000),
      type: 'normal',
      categoryId: undefined,
      entries: undefined
    })
  }
  const timelineEntries = []
  for (let j = 1; j <= 20; j++) {
    timelineEntries.push({
      id: `te_${j}`,
      datetime: `${dateOffsetKey(20 - j)} 09:${String(j % 60).padStart(2, '0')}`,
      content: `时光轴条目 ${j}：这是一条事件记录，用于测量时光轴卡片高度。`,
      createdAt: iso(-(20 - j) * 3600000)
    })
  }
  notes.push({
    id: 'nt_timeline_1',
    title: '时光轴便签',
    content: '时光轴便签内容',
    color: 'blue',
    pinned: false,
    createdAt: iso(-3600000),
    updatedAt: iso(-3600000),
    type: 'timeline',
    categoryId: undefined,
    entries: timelineEntries
  })
  return { categories: [], notes }
}

function buildDiaryData() {
  const entries = []
  for (let i = 0; i < 12; i++) {
    const date = dateOffsetKey(i)
    entries.push({
      id: `dy_${date.replaceAll('-', '')}`,
      date,
      content: `# 日记 ${i + 1}\n\n今天记录了一些内容，**重要事项**。[参考](https://example.com)`,
      createdAt: iso(-i * 86400000),
      updatedAt: iso(-i * 86400000)
    })
  }
  return { entries } // DiaryData 对象形状（normalizeDiaryData 拒绝裸数组）
}

function buildCountdowns() {
  const out = []
  for (let i = 1; i <= 10; i++) {
    // 偏移 ≥ 6 天（i=1 → now+6d）：9:00 摘要会命中「未来 ≤3 天」的倒计时并弹 reminder-overlay 遮罩
    // （endDateTime 含当前时分，now+6d 的 diff ≈ 5 天 23 小时 → days=5 > 3，永不命中；once 到点也远在未来）
    const end = new Date(Date.now() + (i + 5) * 86400000)
    const pad = (n) => String(n).padStart(2, '0')
    out.push({
      id: `cd_${i}`,
      name: `倒计时事件 ${i}：一屏布局测量的目标日期`,
      endDateTime: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`,
      repeat: null, // 全部 once：daily 会把时分映射到今天（已过时刻 → 触发 reminder-overlay 遮罩拦截点击），once 未来 3-13 天绝不触发
      category: COUNTDOWN_CATEGORIES[i % COUNTDOWN_CATEGORIES.length],
      createdAt: iso(-i * 3600000),
      updatedAt: iso(-i * 3600000),
      color: COLOR_PRESETS[i % COLOR_PRESETS.length]
    })
  }
  return out
}

function buildHabitsData() {
  const habits = []
  const records = []
  for (let i = 1; i <= 15; i++) {
    const id = `hb_${i}`
    habits.push({
      id,
      name: `习惯 ${i}：每日打卡示例`,
      frequency: 1 + (i % 7), // 钳制 [1,7]
      color: COLOR_PRESETS[i % COLOR_PRESETS.length],
      createdAt: iso(-i * 86400000)
    })
    for (let k = 0; k < 3; k++) {
      records.push({
        id: `hr_${i}_${k}`,
        habitId: id,
        date: dateOffsetKey(k),
        createdAt: iso(-k * 3600000)
      })
    }
  }
  return { habits, records }
}

function buildHealthData() {
  const records = { exercise: [], diet: [], sleep: [], weight: [] }
  for (let i = 1; i <= 15; i++) {
    records.exercise.push({
      id: `ex_${i}`, module: 'exercise', date: dateOffsetKey(i % 14),
      exerciseType: EXERCISE_TYPES[i % EXERCISE_TYPES.length], duration: 30 + i, calories: 200 + i * 10,
      distanceKm: i % 3 === 0 ? 2 + i : undefined,
      note: i % 4 === 0 ? `运动备注 ${i}` : undefined,
      createdAt: iso(-i * 3600000), updatedAt: iso(-i * 3600000)
    })
    records.diet.push({
      id: `dt_${i}`, module: 'diet', date: dateOffsetKey(i % 14),
      mealType: MEAL_TYPES[i % MEAL_TYPES.length], content: `饮食内容 ${i}：均衡搭配示例`, calories: 400 + i * 20,
      note: i % 4 === 0 ? `饮食备注 ${i}` : undefined,
      createdAt: iso(-i * 3600000), updatedAt: iso(-i * 3600000)
    })
    records.sleep.push({
      id: `sl_${i}`, module: 'sleep', date: dateOffsetKey(i % 14),
      sleepTime: '23:00', wakeTime: '07:00', durationHours: 8, quality: (i % 5) + 1,
      note: i % 4 === 0 ? `睡眠备注 ${i}` : undefined,
      createdAt: iso(-i * 3600000), updatedAt: iso(-i * 3600000)
    })
    records.weight.push({
      id: `wt_${i}`, module: 'weight', date: dateOffsetKey(i % 14),
      weightKg: 60 + (i % 10),
      note: i % 4 === 0 ? `体重备注 ${i}` : undefined,
      createdAt: iso(-i * 3600000), updatedAt: iso(-i * 3600000)
    })
  }
  return {
    height: 170,
    plans: {
      exercise: { module: 'exercise', metric: 'times', period: 'weekly', target: 3, updatedAt: iso(-3600000) },
      diet: { module: 'diet', metric: 'calories', period: 'daily', target: 1800, updatedAt: iso(-3600000) },
      sleep: { module: 'sleep', metric: 'duration', period: 'daily', target: 8, updatedAt: iso(-3600000) }
    },
    records
  }
}

function buildLedgerData() {
  const categories = [
    { id: 'salary', name: '工资', type: 'income', isBuiltIn: true },
    { id: 'mortgage', name: '房贷', type: 'expense', isBuiltIn: true },
    { id: 'carloan', name: '车贷', type: 'expense', isBuiltIn: true },
    { id: 'breakfast', name: '早餐', type: 'expense', isBuiltIn: true },
    { id: 'lunch', name: '午餐', type: 'expense', isBuiltIn: true },
    { id: 'dinner', name: '晚餐', type: 'expense', isBuiltIn: true },
    { id: 'commute', name: '通勤', type: 'expense', isBuiltIn: true },
    { id: 'daily', name: '日常', type: 'expense', isBuiltIn: true }
  ]
  const EXPENSE_IDS = ['mortgage', 'carloan', 'breakfast', 'lunch', 'dinner', 'commute', 'daily']
  const entries = []
  const now = new Date()
  for (let i = 1; i <= 25; i++) {
    const day = (i % 27) + 1 // 1..27，任何月份都安全
    const monthOffset = i > 15 ? -1 : 0
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, day)
    const pad = (n) => String(n).padStart(2, '0')
    const isIncome = i % 5 === 0
    entries.push({
      id: `ld_${i}`,
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      categoryId: isIncome ? 'salary' : EXPENSE_IDS[i % EXPENSE_IDS.length],
      amount: isIncome ? 15000 + i * 100 : 20 + i * 5,
      note: i % 4 === 0 ? `记账备注 ${i}` : undefined,
      createdAt: iso(-i * 3600000),
      updatedAt: iso(-i * 3600000)
    })
  }
  return { categories, entries }
}

// ===== 面板测量目标（testid 已逐一核对组件源码；静态 testid 必须 .first()）=====

const MEASURE_PANELS = [
  { key: 'todo', menu: 'todos', item: '[data-testid="td-item"]' },
  { key: 'notes', menu: 'notes', item: '[data-testid="note-card"]' },
  { key: 'timeline', menu: 'notes', item: '[data-testid="nt-timeline-card"]' },
  { key: 'diary', menu: 'diary', item: '.dj-card' },
  { key: 'countdown', menu: 'countdowns', item: '[data-testid="cd-item"]' },
  { key: 'habits', menu: 'habits', item: '.hb-card' },
  { key: 'password', menu: 'passwords', item: '[data-testid="pwd-item"]' },
  { key: 'exercise', menu: 'health', tab: 'exercise', toggle: '[data-testid="ex-toggle-list"]', item: '[data-testid="ex-item"]' },
  { key: 'diet', menu: 'health', tab: 'diet', toggle: '[data-testid="dt-toggle-list"]', item: '[data-testid="dt-item"]' },
  { key: 'sleep', menu: 'health', tab: 'sleep', toggle: '[data-testid="sl-toggle-list"]', item: '[data-testid="sl-item"]' },
  { key: 'weight', menu: 'health', tab: 'weight', toggle: '[data-testid="wt-toggle-list"]', item: '[data-testid="wt-item"]' },
  { key: 'ledger', menu: 'ledger', toggle: '[data-testid="ld-toggle-list"]', item: '[data-testid="ld-item"]' }
]

const SCREENSHOT_PANELS = [
  { key: 'home', menu: 'home', wait: '[data-testid="home-greeting"]' },
  { key: 'todos', menu: 'todos', wait: '[data-testid="td-item"]' },
  { key: 'notes', menu: 'notes', wait: '[data-testid="note-card"]' },
  { key: 'diary', menu: 'diary', wait: '.dj-card' },
  { key: 'countdowns', menu: 'countdowns', wait: '[data-testid="cd-item"]' },
  { key: 'pomodoro', menu: 'pomodoro', wait: '[data-testid="pm-timer-ring"]' },
  { key: 'habits', menu: 'habits', wait: '.hb-card' },
  { key: 'passwords', menu: 'passwords', wait: '[data-testid="pwd-item"]' },
  { key: 'health', menu: 'health', wait: '[data-testid="hd-tabs"]' },
  { key: 'ledger', menu: 'ledger', wait: '[data-testid="ld-toggle-list"]' }
]

const VIEWPORTS = [
  { width: 1366, height: 768, label: '1366x768' },
  { width: 1920, height: 1080, label: '1920x1080' }
]

// ===== 密码 UI 播种（不注入 IDB——crypto-js 加密 blob 需设备密钥，裸注入损坏）=====

const PASSWORD_ENTRIES = [
  ['GitHub', 'https://github.com', 'qa.user@gmail.com'],
  ['Google', 'https://google.com', 'qa.user@gmail.com'],
  ['Vue 官网', 'https://vuejs.org', 'vue.dev@example.com'],
  ['掘金', 'https://juejin.cn', 'juejin.qa@example.com'],
  ['哔哩哔哩', 'https://bilibili.com', 'bili.qa@example.com'],
  ['MDN', 'https://developer.mozilla.org', 'mdn.qa@example.com'],
  ['Stack Overflow', 'https://stackoverflow.com', 'so.qa@example.com'],
  ['淘宝', 'https://taobao.com', 'taobao.qa@example.com'],
  ['京东', 'https://jd.com', 'jd.qa@example.com'],
  ['知乎', 'https://zhihu.com', 'zhihu.qa@example.com'],
  ['微信读书', 'https://weread.qq.com', 'weread.qa@example.com'],
  ['网易云音乐', 'https://music.163.com', 'music.qa@example.com']
]
const MASTER_PASSWORD = 'QA-Master-2026!'

async function seedPasswords(page) {
  await page.click('[data-testid="wb-menu-passwords"]')
  await page.waitForSelector('[data-testid="pwd-setup-input"]', { timeout: 10000 })
  await page.fill('[data-testid="pwd-setup-input"]', MASTER_PASSWORD)
  await page.fill('[data-testid="pwd-setup-confirm"]', MASTER_PASSWORD)
  await page.click('[data-testid="pwd-setup-submit"]')
  await page.waitForSelector('[data-testid="pwd-add-btn"]', { timeout: 10000 })
  for (const [site, url, user] of PASSWORD_ENTRIES) {
    await page.click('[data-testid="pwd-add-btn"]')
    await page.waitForSelector('[data-testid="pwd-form-modal"]')
    await page.fill('[data-testid="pwd-form-site"]', site)
    await page.fill('[data-testid="pwd-form-url"]', url)
    await page.fill('[data-testid="pwd-form-username"]', user)
    await page.fill('[data-testid="pwd-form-password"]', `pwd-${site}`)
    await page.click('[data-testid="pwd-save-btn"]')
    await page.waitForSelector('[data-testid="pwd-form-modal"]', { state: 'detached' })
  }
  await page.waitForSelector('[data-testid="pwd-item"]', { timeout: 10000 })
}

// ===== 行高测量 =====

async function measurePanels(page, heights) {
  for (const panel of MEASURE_PANELS) {
    await page.click(`[data-testid="wb-menu-${panel.menu}"]`)
    if (panel.tab) {
      await page.click(`[data-testid="hd-tab-${panel.tab}"]`)
      await page.waitForTimeout(150)
    }
    if (panel.toggle) {
      await page.click(panel.toggle) // 展开列表（健康/记账列表默认收起）
      await page.waitForTimeout(150)
    }
    const loc = page.locator(panel.item).first()
    await loc.waitFor({ state: 'visible', timeout: 10000 })
    const h = await loc.evaluate((el) => el.getBoundingClientRect().height)
    heights[panel.key] = Math.max(heights[panel.key] ?? 0, h)
  }
}

async function setDark(page, dark) {
  await page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark)
}

let browser
let qaFailed = false
const screenshotCount = { n: 0 }
try {
  await ensureDevServer()
  browser = await chromium.launch()
  const page = await browser.newPage()

  // 1. 进入工作台（应用自建 DB v5 与全部 store）
  await page.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wb-menu-home"]', { timeout: 20000 })

  // 2. 注入 IDB 数据（密码除外——走 UI 流程）
  await injectIdbStore(page, 'todos', buildTodos())
  await injectIdbStore(page, 'notes', buildNotesData())
  await injectIdbStore(page, 'diary', buildDiaryData())
  await injectIdbStore(page, 'countdowns', buildCountdowns())
  await injectIdbStore(page, 'habits', buildHabitsData())
  await injectIdbStore(page, 'health', buildHealthData())
  await injectIdbStore(page, 'ledger', buildLedgerData())
  record('注入 7 个 IDB store（todos/notes/diary/countdowns/habits/health/ledger）', true, {})

  // 3. reload → WorkbenchView onMounted 从 IDB 加载数据
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wb-menu-home"]', { timeout: 20000 })
  record('reload 后数据加载', true, {})

  // 4. 密码 UI 播种（此页面会话内不再 reload，isUnlocked 保持）
  await guard('密码 UI 播种（12 条）', async () => {
    await seedPasswords(page)
    record('密码 UI 播种（12 条）', true, {})
  })

  // 5. 行高测量：两个视口分别测首条外层高度，取 MAX
  const heights = {}
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.waitForTimeout(200)
    await measurePanels(page, heights)
  }
  const rowHeights = {}
  for (const p of MEASURE_PANELS) {
    const h = heights[p.key] ?? 0
    rowHeights[p.key] = Math.ceil(h + 2) // MAX + 2px，整数
    record(`行高 ${p.key}`, h > 0, { max: Math.round(h * 100) / 100, final: rowHeights[p.key] })
  }
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  writeFileSync(ROW_HEIGHTS_JSON, JSON.stringify(rowHeights, null, 2))
  console.log(`[evidence] row-heights.json written: ${ROW_HEIGHTS_JSON}`)

  // 6. 截图：10 面板 × 明/暗 × 两个视口
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    for (const theme of ['light', 'dark']) {
      await setDark(page, theme === 'dark')
      for (const sp of SCREENSHOT_PANELS) {
        await page.click(`[data-testid="wb-menu-${sp.menu}"]`)
        await page
          .waitForSelector(sp.wait, { state: 'visible', timeout: 10000 })
          .catch(() => {})
        await page.waitForTimeout(300)
        const file = join(EVIDENCE_DIR, `${sp.key}-${theme}-${vp.label}.png`)
        await page.screenshot({ path: file, fullPage: true })
        screenshotCount.n++
      }
    }
  }
  record(`截图完成（${SCREENSHOT_PANELS.length} 面板 × 明/暗 × ${VIEWPORTS.length} 视口）`, true, {
    count: screenshotCount.n
  })

  qaFailed = results.some((r) => !r.ok)
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  qaFailed = true
} finally {
  if (browser) await browser.close().catch(() => {})
  stopDevServer()
  // 清理确认：自起的端口必须恢复空闲
  if (devBase) {
    const port = Number(new URL(devBase).port)
    await new Promise((r) => setTimeout(r, 500))
    const free = await isPortFree(port)
    record(`清理确认：端口 ${port} 空闲`, free, {})
  }
  // 证据日志：脚本路径 + 运行输出尾部 + row-heights.json + 清理确认（目录可能尚未创建——先 mkdir）
  try {
    mkdirSync(EVIDENCE_DIR, { recursive: true })
    const rows = existsSync(ROW_HEIGHTS_JSON) ? JSON.parse(readFileSync(ROW_HEIGHTS_JSON, 'utf8')) : {}
    const lines = [
      `=== qa-workbench-onescreen ===`,
      `script: scripts/qa-workbench-onescreen.mjs`,
      `row-heights.json: ${JSON.stringify(rows)}`,
      `screenshots written: ${screenshotCount.n} (${EVIDENCE_DIR})`,
      `results: ${results.length} (${results.filter((r) => r.ok).length} pass / ${results.filter((r) => !r.ok).length} fail)`,
      ...results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`),
      `exit: ${qaFailed ? 1 : 0}`
    ]
    writeFileSync(EVIDENCE_LOG, lines.join('\n'))
  } catch (e) {
    console.error('[evidence] log write failed', e)
  }
}
process.exitCode = qaFailed ? 1 : 0
