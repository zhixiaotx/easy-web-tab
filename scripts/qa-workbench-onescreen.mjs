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
 * 本脚本负责「脚手架 + 测量 + 一屏契约断言」：行高测量写 row-heights.json 后，
 * 追加 Wave-3 T13 的 S1-S8 断言波（record()/guard() + 真实 Playwright 交互）：
 *   S1 桌面两视口 × 明暗 × 10 面板（健康 4 子面板并入）无纵向滚动 + 主页概览默认折叠
 *   S2 分页条可见 + 边界禁用 + 翻页内容变化
 *   S3 筛选/分类/月份切换后 goto(1) 回第 1 页
 *   S4 时光轴卡内联 5 条 + 「+N 条」全量浮层（WorkbenchNotes 时光轴折叠）
 *   S5 日记 ≥1100px 双栏 + dj-page-* 分页
 *   S6 375×667 移动端分页惰性 + 页面滚动保留 + 无横向溢出
 *   S7 明暗双主题 × 两视口 × 10 面板无横向溢出
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

// ===== Wave-3 T13：S1-S8 一屏契约断言（record()/guard() + 真实交互）=====

// 10 个菜单面板：wait=进入面板后的首屏 testid；toggle/item 用于展开默认收起的列表（健康子面板/记账）后实测「有数据时仍一屏」
const CONTRACT_PANELS = [
  { key: 'home', menu: 'home', wait: '[data-testid="home-greeting"]' },
  { key: 'todos', menu: 'todos', wait: '[data-testid="td-item"]' },
  { key: 'notes', menu: 'notes', wait: '[data-testid="note-card"]' },
  { key: 'diary', menu: 'diary', wait: '.dj-card' },
  { key: 'countdowns', menu: 'countdowns', wait: '[data-testid="cd-item"]' },
  { key: 'pomodoro', menu: 'pomodoro', wait: '[data-testid="pm-timer-ring"]' },
  { key: 'habits', menu: 'habits', wait: '.hb-card' },
  { key: 'passwords', menu: 'passwords', wait: '[data-testid="pwd-item"]' },
  {
    key: 'ledger',
    menu: 'ledger',
    wait: '[data-testid="ld-toggle-list"]',
    toggle: '[data-testid="ld-toggle-list"]',
    item: '[data-testid="ld-item"]'
  },
  { key: 'health', menu: 'health', wait: '[data-testid="hd-tabs"]' }
]

// 健康 tabs 容器 4 个子面板（同一菜单项，逐 tab 实测展开态）
const CONTRACT_HEALTH_TABS = [
  { key: 'exercise', tab: 'exercise', toggle: '[data-testid="ex-toggle-list"]', item: '[data-testid="ex-item"]' },
  { key: 'diet', tab: 'diet', toggle: '[data-testid="dt-toggle-list"]', item: '[data-testid="dt-item"]' },
  { key: 'sleep', tab: 'sleep', toggle: '[data-testid="sl-toggle-list"]', item: '[data-testid="sl-item"]' },
  { key: 'weight', tab: 'weight', toggle: '[data-testid="wt-toggle-list"]', item: '[data-testid="wt-item"]' }
]

async function navPanel(page, menu) {
  await page.click(`[data-testid="wb-menu-${menu}"]`)
  await page.waitForTimeout(120)
}

/** .wb-content 与 document 的滚动/尺寸度量（S1/S6/S7 共用）。 */
async function metricsOf(page) {
  return page.evaluate(() => {
    const wc = document.querySelector('.wb-content')
    const doc = document.documentElement
    const cs = wc ? getComputedStyle(wc) : null
    return {
      wcScrollH: wc ? wc.scrollHeight : 0,
      wcClientH: wc ? wc.clientHeight : 0,
      wcScrollW: wc ? wc.scrollWidth : 0,
      wcClientW: wc ? wc.clientWidth : 0,
      docScrollH: doc.scrollHeight,
      docClientH: doc.clientHeight,
      docScrollW: doc.scrollWidth,
      docClientW: doc.clientWidth,
      wcOverflowY: cs ? cs.overflowY : ''
    }
  })
}

/** 读取 PanelPager 状态：无分页条（total≤1）→ null；否则 {page, total, text}。 */
async function getPagerState(page) {
  const pager = page.locator('[data-testid="panel-pager"]')
  if ((await pager.count()) === 0) return null
  const info = ((await page.locator('[data-testid="panel-pager-info"]').textContent()) || '').trim()
  const m = info.match(/第\s*(\d+)\s*\/\s*(\d+)\s*页/)
  return m ? { page: Number(m[1]), total: Number(m[2]), text: info } : { page: 0, total: 0, text: info }
}

/** 确保列表处于展开态（SPA 内切换面板列表状态持久化，重复点击会误收起——先探测再点）。 */
async function ensureExpanded(page, toggleSel, itemSel) {
  const visible = await page.locator(itemSel).first().isVisible().catch(() => false)
  if (!visible) {
    await page.click(toggleSel)
    await page.waitForTimeout(120)
  }
  await page.waitForSelector(itemSel, { state: 'visible', timeout: 10000 })
  await page.waitForTimeout(100)
}

async function runContractAssertions(page) {
  // ===== S1+S7：桌面两视口 × 明暗 × 10 面板（健康 4 子面板并入）无纵向滚动 + 无横向溢出；主页断言概览默认折叠 =====
  for (const vp of VIEWPORTS) {
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await setDark(page, theme === 'dark')
      await page.waitForTimeout(150)
      for (const panel of CONTRACT_PANELS) {
        await guard(`S1 ${panel.key} @ ${vp.label}/${theme} 无纵向滚动`, async () => {
          await navPanel(page, panel.menu)
          await page.waitForSelector(panel.wait, { state: 'visible', timeout: 10000 })
          if (panel.toggle) await ensureExpanded(page, panel.toggle, panel.item)
          await page.waitForTimeout(120)
          const m = await metricsOf(page)
          const ok = m.wcScrollH <= m.wcClientH + 1 && m.docScrollH <= m.docClientH + 1
          record(`S1 ${panel.key} @ ${vp.label}/${theme} 无纵向滚动`, ok, {
            wc: `${m.wcScrollH}/${m.wcClientH}`,
            doc: `${m.docScrollH}/${m.docClientH}`
          })
          if (panel.key === 'home') {
            const collapsed = await page.evaluate(() => {
              const chev = document.querySelector('[data-testid="home-overview-chevron"]')
              return !chev || !chev.classList.contains('open')
            })
            record(`S1 home @ ${vp.label}/${theme} 概览默认折叠`, collapsed, {})
          }
        })
        await guard(`S7 ${panel.key} @ ${vp.label}/${theme} 无横向溢出`, async () => {
          const m = await metricsOf(page)
          const ok = m.wcScrollW <= m.wcClientW + 1 && m.docScrollW <= m.docClientW + 1
          record(`S7 ${panel.key} @ ${vp.label}/${theme} 无横向溢出`, ok, {
            wc: `${m.wcScrollW}/${m.wcClientW}`,
            doc: `${m.docScrollW}/${m.docClientW}`
          })
        })
      }
      for (const sub of CONTRACT_HEALTH_TABS) {
        await guard(`S1 health/${sub.key} @ ${vp.label}/${theme} 无纵向滚动`, async () => {
          await navPanel(page, 'health')
          await page.waitForSelector('[data-testid="hd-tabs"]', { state: 'visible', timeout: 10000 })
          await page.click(`[data-testid="hd-tab-${sub.tab}"]`)
          await page.waitForTimeout(100)
          await ensureExpanded(page, sub.toggle, sub.item)
          await page.waitForTimeout(120)
          const m = await metricsOf(page)
          const ok = m.wcScrollH <= m.wcClientH + 1 && m.docScrollH <= m.docClientH + 1
          record(`S1 health/${sub.key} @ ${vp.label}/${theme} 无纵向滚动`, ok, {
            wc: `${m.wcScrollH}/${m.wcClientH}`,
            doc: `${m.docScrollH}/${m.docClientH}`
          })
        })
        await guard(`S7 health/${sub.key} @ ${vp.label}/${theme} 无横向溢出`, async () => {
          const m = await metricsOf(page)
          const ok = m.wcScrollW <= m.wcClientW + 1 && m.docScrollW <= m.docClientW + 1
          record(`S7 health/${sub.key} @ ${vp.label}/${theme} 无横向溢出`, ok, {
            wc: `${m.wcScrollW}/${m.wcClientW}`,
            doc: `${m.docScrollW}/${m.docClientW}`
          })
        })
      }
    }
  }

  // ===== S2：待办分页条可见 + 边界禁用 + 翻页内容变化（15 条 @ 1366x768 必多页）=====
  await page.setViewportSize({ width: 1366, height: 768 })
  await setDark(page, false)
  await page.waitForTimeout(150)
  await guard('S2 待办分页条：可见 + 边界禁用 + 翻页变化', async () => {
    await navPanel(page, 'todos')
    await page.waitForSelector('[data-testid="td-item"]', { state: 'visible', timeout: 10000 })
    await page.click('[data-testid="td-search-reset"]')
    await page.waitForTimeout(120)
    const p0 = await getPagerState(page)
    if (!p0 || p0.total < 2) {
      record('S2 待办分页条（跳过：数据不足一页）', true, { pager: p0 })
      return
    }
    const prevDisabled0 = await page.locator('[data-testid="panel-pager-prev"]').isDisabled()
    const nextDisabled0 = await page.locator('[data-testid="panel-pager-next"]').isDisabled()
    const first0 = ((await page.locator('[data-testid="td-item"]').first().textContent()) || '').trim().slice(0, 24)
    record(`S2 初始第 ${p0.page} / ${p0.total} 页（prev=${prevDisabled0} next=${nextDisabled0}）`, p0.page === 1 && prevDisabled0 && !nextDisabled0, { p0 })
    await page.locator('[data-testid="panel-pager-next"]').click()
    await page.waitForTimeout(120)
    const p1 = await getPagerState(page)
    const prevDisabled1 = await page.locator('[data-testid="panel-pager-prev"]').isDisabled()
    const first1 = ((await page.locator('[data-testid="td-item"]').first().textContent()) || '').trim().slice(0, 24)
    record(`S2 下一页 → 第 ${p1 ? p1.page : '?'} 页 + 首条变化`, p1 && p1.page === 2 && !prevDisabled1 && first1 !== first0, { p1, first1 })
    await page.locator('[data-testid="panel-pager-prev"]').click()
    await page.waitForTimeout(120)
    const p2 = await getPagerState(page)
    const first2 = ((await page.locator('[data-testid="td-item"]').first().textContent()) || '').trim().slice(0, 24)
    record(`S2 上一页 → 第 ${p2 ? p2.page : '?'} 页 + 首条还原`, p2 && p2.page === 1 && first2 === first0, { p2 })
    let guardN = 0
    while (guardN < 12) {
      const cur = await getPagerState(page)
      if (!cur || cur.page >= cur.total) break
      await page.locator('[data-testid="panel-pager-next"]').click()
      await page.waitForTimeout(100)
      guardN++
    }
    const pLast = await getPagerState(page)
    const nextDisabledLast = await page.locator('[data-testid="panel-pager-next"]').isDisabled()
    record(`S2 末页 next 禁用（第 ${pLast ? pLast.page : '?'} / ${pLast ? pLast.total : '?'} 页）`, pLast && pLast.page === pLast.total && nextDisabledLast, { pLast })
  })

  // ===== S3：筛选/分类/月份切换后 goto(1) 回第 1 页 =====
  await guard('S3 待办搜索 goto(1)', async () => {
    await navPanel(page, 'todos')
    await page.waitForSelector('[data-testid="td-item"]', { state: 'visible', timeout: 10000 })
    await page.click('[data-testid="td-search-reset"]')
    await page.waitForTimeout(100)
    const p0 = await getPagerState(page)
    if (!p0 || p0.total < 2) {
      record('S3 待办搜索 goto(1)（跳过：无分页）', true, {})
      return
    }
    await page.locator('[data-testid="panel-pager-next"]').click()
    await page.waitForTimeout(100)
    // 「待办任务 1」命中 td_1 + td_10..td_15 共 7 条 → 仍 2 页 → 断言回第 1 页
    await page.fill('[data-testid="td-search-title"]', '待办任务 1')
    await page.click('[data-testid="td-search-btn"]')
    await page.waitForTimeout(150)
    const p1 = await getPagerState(page)
    const itemCount = await page.locator('[data-testid="td-item"]').count()
    const ok = itemCount > 0 && (!p1 || p1.page === 1)
    record(`S3 待办搜索 goto(1)（搜索后第 ${p1 ? p1.page : '—'} 页 / 命中 ${itemCount} 条）`, ok, { p1, itemCount })
  })
  await guard('S3 待办分类 tab goto(1)', async () => {
    const p0 = await getPagerState(page)
    if (!p0 || p0.total < 2) {
      record('S3 待办分类 tab goto(1)（跳过：无分页）', true, {})
    } else {
      await page.locator('[data-testid="panel-pager-next"]').click()
      await page.waitForTimeout(100)
      await page.click('[data-testid="td-cat-all"]')
      await page.waitForTimeout(120)
      const p1 = await getPagerState(page)
      const itemCount = await page.locator('[data-testid="td-item"]').count()
      const ok = itemCount > 0 && (!p1 || p1.page === 1)
      record(`S3 待办分类 tab goto(1)（点击后第 ${p1 ? p1.page : '—'} 页 / ${itemCount} 条）`, ok, { p1, itemCount })
    }
    await page.click('[data-testid="td-search-reset"]')
    await page.waitForTimeout(100)
  })
  await guard('S3 倒计时搜索 goto(1)', async () => {
    await navPanel(page, 'countdowns')
    await page.waitForSelector('[data-testid="cd-item"]', { state: 'visible', timeout: 10000 })
    const p0 = await getPagerState(page)
    if (!p0 || p0.total < 2) {
      record('S3 倒计时搜索 goto(1)（跳过：无分页）', true, {})
    } else {
      await page.locator('[data-testid="panel-pager-next"]').click()
      await page.waitForTimeout(100)
      // 「倒计时事件 1」命中 cd_1 + cd_10 共 2 条 → 单页 → 分页条隐藏且条目仍在（页若卡在第 2 页则列表空）
      await page.fill('[data-testid="cd-search-name"]', '倒计时事件 1')
      await page.click('[data-testid="cd-search-btn"]')
      await page.waitForTimeout(150)
      const p1 = await getPagerState(page)
      const itemCount = await page.locator('[data-testid="cd-item"]').count()
      const ok = itemCount > 0 && (!p1 || p1.page === 1)
      record(`S3 倒计时搜索 goto(1)（搜索后第 ${p1 ? p1.page : '—'} 页 / 命中 ${itemCount} 条）`, ok, { p1, itemCount })
      await page.click('[data-testid="cd-search-reset"]')
      await page.waitForTimeout(100)
    }
  })
  await guard('S3 记账月份切换 goto(1)', async () => {
    await navPanel(page, 'ledger')
    await page.waitForSelector('[data-testid="ld-toggle-list"]', { state: 'visible', timeout: 10000 })
    await ensureExpanded(page, '[data-testid="ld-toggle-list"]', '[data-testid="ld-item"]')
    const p0 = await getPagerState(page)
    if (!p0 || p0.total < 2) {
      record('S3 记账月份切换 goto(1)（跳过：无分页）', true, {})
    } else {
      await page.locator('[data-testid="panel-pager-next"]').click()
      await page.waitForTimeout(100)
      await page.click('[data-testid="ld-prev"]')
      await page.waitForTimeout(150)
      const p1 = await getPagerState(page)
      record(`S3 记账上月切换 goto(1)（第 ${p1 ? p1.page : '—'} 页）`, !p1 || p1.page === 1, { p1 })
      await page.click('[data-testid="ld-today"]')
      await page.waitForTimeout(150)
      const p2 = await getPagerState(page)
      record(`S3 记账本月切换 goto(1)（第 ${p2 ? p2.page : '—'} 页）`, !p2 || p2.page === 1, { p2 })
    }
  })

  // ===== S4：时光轴卡内联 5 条 + 「+15 条」全量浮层（WorkbenchNotes S4 修复契约）=====
  await guard('S4 时光轴卡内联 5 条 + 「+15 条」浮层', async () => {
    await navPanel(page, 'notes')
    await page.waitForSelector('[data-testid="nt-timeline-card"]', { state: 'visible', timeout: 10000 })
    // 类型切「时光轴」+ 查询应用，保证只渲染 1 张时光轴卡（'all' 视图也会渲染时光轴段）
    await page.selectOption('[data-testid="nt-type-select"]', 'timeline')
    await page.click('[data-testid="nt-search-btn"]')
    await page.waitForTimeout(150)
    await page.waitForSelector('[data-testid="nt-timeline-card"]', { state: 'visible', timeout: 10000 })
    const inlineCount = await page.locator('.timeline-card .timeline-item').count()
    record('S4 时光轴卡内联条目 == 5', inlineCount === 5, { inlineCount })
    const moreBtn = page.locator('[data-testid="nt-entry-more-nt_timeline_1"]')
    const moreVisible = await moreBtn.isVisible().catch(() => false)
    const moreText = moreVisible ? ((await moreBtn.textContent()) || '').trim() : ''
    record('S4 「+N 条」按钮文案 == +15 条', moreVisible && moreText.includes('15'), { moreText })
    if (moreVisible) {
      await moreBtn.click()
      await page.waitForSelector('[data-testid="nt-entry-overlay"]', { state: 'visible', timeout: 10000 })
      await page.waitForTimeout(150)
      const overlayCount = await page.locator('[data-testid="nt-entry-overlay"] .timeline-item').count()
      record('S4 浮层全量条目 == 20', overlayCount === 20, { overlayCount })
      const scroll = await page.evaluate(() => {
        const list = document.querySelector('[data-testid="nt-entry-overlay"] .timeline-expand-list')
        return list ? { sh: list.scrollHeight, ch: list.clientHeight } : { sh: 0, ch: 0 }
      })
      record('S4 浮层列表区内滚动', scroll.sh > scroll.ch, scroll)
      await page.click('[data-testid="nt-entry-overlay-close"]')
      await page.waitForSelector('[data-testid="nt-entry-overlay"]', { state: 'detached' })
      record('S4 浮层关闭', true, {})
    }
  })

  // ===== S5：日记 ≥1100px 双栏 + dj-page-* 分页 =====
  for (const vp of VIEWPORTS) {
    await guard(`S5 日记双栏 @ ${vp.label}`, async () => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.waitForTimeout(150)
      await navPanel(page, 'diary')
      await page.waitForSelector('.dj-card', { state: 'visible', timeout: 10000 })
      await page.waitForTimeout(150)
      const pos = await page.evaluate(() => {
        const ed = document.querySelector('.dj-editor')
        const hist = document.querySelector('.dj-history')
        if (!ed || !hist) return null
        const r1 = ed.getBoundingClientRect()
        const r2 = hist.getBoundingClientRect()
        return { edX: r1.x, histX: r2.x, edY: r1.y, histY: r2.y, edW: r1.width, histW: r2.width }
      })
      const ok = Boolean(pos && pos.histX > pos.edX && Math.abs(pos.edY - pos.histY) < 20)
      record(
        `S5 日记双栏 @ ${vp.label}（编辑器 ${Math.round((pos && pos.edX) || 0)}px < 历史 ${Math.round((pos && pos.histX) || 0)}px）`,
        ok,
        pos
      )
    })
  }
  await guard('S5 日记 dj-page-* 分页 @ 1366x768', async () => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.waitForTimeout(150)
    await navPanel(page, 'diary')
    await page.waitForSelector('.dj-card', { state: 'visible', timeout: 10000 })
    await page.waitForTimeout(150)
    const pagerCount = await page.locator('[data-testid="dj-page-info"]').count()
    if (pagerCount === 0) {
      record('S5 日记 dj-page-*（跳过：单页）', true, {})
    } else {
      const info = ((await page.locator('[data-testid="dj-page-info"]').textContent()) || '').trim()
      const prevDisabled = await page.locator('[data-testid="dj-page-prev"]').isDisabled()
      const nextDisabled = await page.locator('[data-testid="dj-page-next"]').isDisabled()
      const m = info.match(/第\s*(\d+)\s*\/\s*(\d+)\s*页/)
      const ok = Boolean(m && Number(m[1]) === 1 && Number(m[2]) >= 2 && prevDisabled && !nextDisabled)
      record(`S5 日记 dj-page-* @ 1366x768（${info}，prev=${prevDisabled} next=${nextDisabled}）`, ok, { info })
    }
  })

  // ===== S6：375×667 移动端分页惰性 + 页面滚动保留（.wb-content overflow-y auto）+ 无横向溢出 =====
  await guard('S6 移动端 375×667：待办全量渲染 + 无分页条 + 滚动保留', async () => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(200)
    await navPanel(page, 'todos')
    await page.waitForSelector('[data-testid="td-item"]', { state: 'visible', timeout: 10000 })
    await page.click('[data-testid="td-search-reset"]')
    await page.waitForTimeout(120)
    const todoCount = await page.locator('[data-testid="td-item"]').count()
    const pagerCount = await page.locator('[data-testid="panel-pager"]').count()
    const m = await metricsOf(page)
    const overflowAuto = m.wcOverflowY === 'auto'
    const scrollable = m.wcScrollH > m.wcClientH
    const noHOverflow = m.wcScrollW <= m.wcClientW + 1 && m.docScrollW <= m.docClientW + 1
    record(
      `S6 待办 @ 375×667（全量 ${todoCount} 条 / 分页条 ${pagerCount} / overflow-y=${m.wcOverflowY} / 可滚动=${scrollable} / 无横向溢出=${noHOverflow}）`,
      todoCount === 15 && pagerCount === 0 && overflowAuto && scrollable && noHOverflow,
      { todoCount, pagerCount, overflowY: m.wcOverflowY, scrollable, noHOverflow }
    )
  })
  await guard('S6 移动端 375×667：记账展开列表无分页条 + 无横向溢出', async () => {
    await navPanel(page, 'ledger')
    await page.waitForSelector('[data-testid="ld-toggle-list"]', { state: 'visible', timeout: 10000 })
    await ensureExpanded(page, '[data-testid="ld-toggle-list"]', '[data-testid="ld-item"]')
    const pagerCount = await page.locator('[data-testid="panel-pager"]').count()
    const m = await metricsOf(page)
    const noHOverflow = m.wcScrollW <= m.wcClientW + 1 && m.docScrollW <= m.docClientW + 1
    record(`S6 记账 @ 375×667（分页条 ${pagerCount} / 无横向溢出=${noHOverflow}）`, pagerCount === 0 && noHOverflow, { pagerCount, m })
  })
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

  // 7. Wave-3 T13：S1-S8 一屏契约断言（真实交互 + record()/guard()）
  await runContractAssertions(page)

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
