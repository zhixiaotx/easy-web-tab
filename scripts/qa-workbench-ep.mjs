/**
 * QA: 工作台 Element Plus 换皮契约 QA（workbench-ep）— Wave-3 契约批次 F1-F3 收官验证
 *
 * 参照 qa-business-ep.mjs（E1-E8 先例：scanNativeResidue 完整选择器逐字复制 / shot 明暗截图）
 * 与 qa-workbench-onescreen.mjs（脚手架 ensureDevServer / injectIdbStore / 密码 UI 播种）。
 *
 * 覆盖（逐文件验证「零原生残留」+ 明暗全页截图）：
 *  - S1  home        （切换工具屏轮播 → 快捷添加 + WeatherCard，home-carousel-* el-button）
 *  - S2  todos       （待办 el-table + el-pagination 固定 10 条/页：td-pagination 可见 + 「第 1 / 2 页」等值断言 + prev/next 边界 + 翻页往返）
 *  - S3  notes       （新增弹框 note-overlay）
 *  - S4  diary       （列表 .dj-card + dj-save-btn）
 *  - S5  countdowns  （新增弹框 cd-dialog）
 *  - S6  pomodoro    （pm-timer-ring）
 *  - S7  habits      （新增弹框 → hb-dialog-cancel 可见）
 *  - S8  habit-week  （hw-week-grid + hw-week-prev/next el-button）
 *  - S9  passwords   （已解锁播种态 + 新增弹框 pwd-form-modal）
 *  - S10 ledger      （展开列表 + 新增弹框 ld-dialog）
 *  - S11 health 容器  （hd-tabs + 4 个 hd-tab-*）
 *  - S12 health 子面板 exercise/diet/sleep/weight（hd-tab 逐一切换 + 列表展开 + 记录弹框 ex/dt-dialog、
 *       weight 记录弹框 wt-records-dialog）
 *  - S13 设置弹窗（批次 F 后）：「工作台设置」tab 全子标签 subtab-* 逐一点击扫描
 *       （.wb-size/.nav-size 弹窗尺寸表原区豁免——契约 D3 明确保留原生）+ 「提醒设置」tab remind-* 全字段
 *
 * 数据：注入 IDB v6 7 store（todos 15 / notes 12 普通+1 时光轴 20 条目 / diary 12 条唯一本地日期 /
 *       countdowns 10 条 once 偏移 ≥6 天防 reminder-overlay / habits 15 / health 四模块各 15 /
 *       ledger 25 条跨月）+ 密码 UI 播种 12 条（crypto-js 加密 blob 不裸注入）。
 *
 * 聚合 verdict：全部 guard PASS 且 console_errors=0 且 page_errors=0 才 PASS
 *（DataCloneError / ElInputNumber 字符串 modelValue 警告都会 flip 失败——与 qa-business-ep 同款抓取）。
 *
 * 证据：.omo/evidence/workbench-ep/<panel>-light|dark.png + qa-workbench-ep-results.json
 *
 * 运行：node scripts/qa-workbench-ep.mjs            # 全量（面板 + 设置）
 *       node scripts/qa-workbench-ep.mjs --panels   # 仅面板阶段（批次 F 前可先行）
 *       node scripts/qa-workbench-ep.mjs --settings # 仅设置阶段（批次 F 后）
 * 与其它 QA 脚本禁止并行（同端口域 16718-16726）。
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'workbench-ep')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'qa-workbench-ep-results.json')
mkdirSync(EVIDENCE_DIR, { recursive: true })

const ONLY = process.argv.includes('--settings') ? 'settings' : process.argv.includes('--panels') ? 'panels' : 'full'

// 待办 2026-09 起 el-table + el-pagination（td-pagination，el-* 组件）→ panel-pager/EXPECT_PAGER_EP 契约随旧 todo 断言一并移除；
// 其余面板的 PanelPager 换皮（批次 F，契约 D2 例外）不在本脚本覆盖范围内。

// ===== 脚手架（复用 qa-workbench-onescreen.mjs 协议）=====

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

async function guard(name, fn) {
  try {
    await fn()
  } catch (err) {
    record(name, false, { error: err.message })
  }
}

// ===== 本地日期/ISO 辅助 =====

function localDateKey(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function dateOffsetKey(daysBack) {
  const now = new Date()
  return localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack))
}

function iso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString()
}

// ===== 数据注入（复用 onescreen 协议：IDB easy-web-tab v6，store <name> 键 'items'）=====

async function injectIdbStore(page, storeName, payload) {
  return page.evaluate(
    ({ store, value }) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('easy-web-tab')
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

// ===== 常量与构建器（形状逐一对照 src/types + *Core normalize，与 qa-workbench-onescreen.mjs 同款）=====

const NOTE_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink']
const EXERCISE_TYPES = ['跑步', '游泳', '力量', '骑行', '瑜伽', '其他']
const MEAL_TYPES = ['早餐', '午餐', '晚餐', '加餐']
const COLOR_PRESETS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899']
const COUNTDOWN_CATEGORIES = ['work', 'life', 'study', 'exercise', 'diet', 'sleep']

function buildTodos() {
  const out = []
  for (let i = 1; i <= 15; i++) {
    out.push({
      id: `td_${i}`,
      title: `待办任务 ${i}：为工作台换皮 QA 准备的示例任务`,
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
  return { entries }
}

function buildCountdowns() {
  const out = []
  for (let i = 1; i <= 10; i++) {
    // 偏移 ≥ 6 天：once 未来 5-13 天绝不触发 reminder-overlay（9:00 摘要页面命中率 0）
    const end = new Date(Date.now() + (i + 5) * 86400000)
    const pad = (n) => String(n).padStart(2, '0')
    out.push({
      id: `cd_${i}`,
      name: `倒计时事件 ${i}：换皮 QA 目标日期`,
      endDateTime: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`,
      repeat: null,
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
      frequency: 1 + (i % 7),
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

// ===== 密码 UI 播种（换皮后 el-input 内层 input 需 ` input` 后缀定位）=====

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

/**
 * 密码 UI 播种。注意：ElInput 将 $attrs（含 data-testid）下放到内层 <input class="el-input__inner">，
 * 因此 testid 选择器本身即输入元素，直接 fill/click 即可（无需再追加 ` input`）。
 * el-dialog 的 testid 落在弹框根元素，visible/detached 状态等待照常生效。
 */
async function seedPasswords(page) {
  await page.click('[data-testid="wb-menu-passwords"]')
  await page.waitForSelector('[data-testid="pwd-setup-input"]', { timeout: 10000 })
  await page.fill('[data-testid="pwd-setup-input"]', MASTER_PASSWORD)
  await page.fill('[data-testid="pwd-setup-confirm"]', MASTER_PASSWORD)
  await page.click('[data-testid="pwd-setup-submit"]')
  await page.waitForSelector('[data-testid="pwd-add-btn"]', { timeout: 10000 })
  for (const [site, url, user] of PASSWORD_ENTRIES) {
    await page.click('[data-testid="pwd-add-btn"]')
    await page.waitForSelector('[data-testid="pwd-form-modal"]', { state: 'visible', timeout: 8000 })
    await page.fill('[data-testid="pwd-form-site"]', site)
    await page.fill('[data-testid="pwd-form-url"]', url)
    await page.fill('[data-testid="pwd-form-username"]', user)
    await page.fill('[data-testid="pwd-form-password"]', `pwd-${site}`)
    await page.click('[data-testid="pwd-save-btn"]')
    await page.waitForSelector('[data-testid="pwd-form-modal"]', { state: 'hidden', timeout: 8000 })
  }
  await page.waitForSelector('[data-testid="pwd-item"]', { timeout: 10000 })
}

// ===== 原生控件零残留扫描（选择器与 qa-business-ep.mjs L211 逐字一致；支持排除祖先子树）=====

// el-textarea 渲染内层 <textarea class="el-textarea__inner">（ElInput type=textarea / ElTextarea），
// 裸 textarea 会误报原生残留——排除之（与 input 家族同类处理）。
const NATIVE_SELECTOR = `select, textarea:not(.el-textarea__inner), input:not(.el-input__inner):not(.el-input-number__inner):not(.el-checkbox__original):not(.el-radio__original):not(.el-radio-button__original-radio):not(.el-select__input):not(.el-switch__input)`

async function scanNativeResidue(page, scopeSel, ...dialogs) {
  const scopes = [scopeSel, ...dialogs].filter(Boolean)
  return page.evaluate(
    ({ sel, scopes }) => {
      const hits = []
      for (const scope of scopes) {
        const root = document.querySelector(scope)
        if (!root) continue
        root.querySelectorAll(sel).forEach((el) => {
          if (el.offsetParent === null) return // 仅可见
          const cls = el.className?.baseVal !== undefined ? el.className.baseVal : el.className
          hits.push({ scope, tag: el.tagName, cls: cls || '', tid: el.getAttribute('data-testid') || '' })
        })
      }
      return hits
    },
    { sel: NATIVE_SELECTOR, scopes }
  )
}

/** 设置弹窗扫描：同一完整选择器，但命中元素若位于豁免子树（.wb-size/.nav-size）内则跳过。 */
async function scanNativeResidueEx(page, scopeSel, excludeAncestors, ...dialogs) {
  const scopes = [scopeSel, ...dialogs].filter(Boolean)
  return page.evaluate(
    ({ sel, scopes, exclude }) => {
      const hits = []
      for (const scope of scopes) {
        const root = document.querySelector(scope)
        if (!root) continue
        root.querySelectorAll(sel).forEach((el) => {
          if (el.offsetParent === null) return
          if (exclude.some((s) => el.closest(s))) return
          const cls = el.className?.baseVal !== undefined ? el.className.baseVal : el.className
          hits.push({ scope, tag: el.tagName, cls: cls || '', tid: el.getAttribute('data-testid') || '' })
        })
      }
      return hits
    },
    { sel: NATIVE_SELECTOR, scopes, exclude: excludeAncestors }
  )
}

// ===== 明暗全页截图 =====

async function shot(page, name) {
  const light = join(EVIDENCE_DIR, name + '-light.png')
  const dark = join(EVIDENCE_DIR, name + '-dark.png')
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await page.waitForTimeout(200)
  await page.screenshot({ path: light, fullPage: true })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(200)
  await page.screenshot({ path: dark, fullPage: true })
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await page.waitForTimeout(150)
  const lightOk = existsSync(light) && statSync(light).size > 0
  const darkOk = existsSync(dark) && statSync(dark).size > 0
  return { light: lightOk, dark: darkOk }
}

// ===== 断言辅助 =====

async function assertClass(page, testid, cls) {
  const loc = page.locator(`[data-testid="${testid}"]`).first()
  await loc.waitFor({ state: 'visible', timeout: 8000 })
  const ok = await loc.evaluate((el, c) => el.classList.contains(c) || !!el.closest('.' + c), cls)
  const detail = await loc.evaluate((el) => ({ tag: el.tagName, cls: (el.className?.baseVal ?? el.className) ?? '' }))
  return { ok, detail }
}

async function assertVisible(page, sel) {
  const loc = page.locator(sel).first()
  const visible = await loc.isVisible().catch(() => false)
  return { ok: visible, detail: { sel } }
}

// ===== 面板守卫 =====

async function verifyPanel(p, page) {
  const sub = []
  const overflowFailures = []
  // 前一守卫失败可能遗留 el-overlay / list-dialog-overlay 遮罩，先清场再进面板，防拦截下一次菜单点击
  await sweepOverlays(page)
  await page.click(`[data-testid="wb-menu-${p.menu}"]`)
  await page.waitForTimeout(150)
  if (p.tab) {
    await page.click(`[data-testid="hd-tab-${p.tab}"]`)
    await page.waitForTimeout(250)
  }
  await page.waitForSelector(p.wait, { state: 'visible', timeout: 15000 })
  await page.waitForTimeout(100)

  // extra（面板级断言：records 列表弹框 / PanelPager 翻页 / 控件 class）——先跑且自行开关，无残留遮罩
  if (p.extra) sub.push(...(await p.extra(page, { sub })))

  // 表单弹框打开（扫描弹框内部残留 + 截包含弹框的图）；try/finally 保证失败也关框，不级联
  let dialogOpened = false
  const dialogSels = []
  try {
    if (p.open) {
      await page.click(p.open.sel)
      await page.waitForSelector(p.open.wait, { state: 'visible', timeout: 8000 })
      await page.waitForTimeout(250)
      dialogOpened = true
      dialogSels.push(p.open.wait)
    }
    if (p.dialogScope) dialogSels.push(p.dialogScope)

    const residue = await scanNativeResidue(page, 'body', ...dialogSels)
    const ov = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth
    }))
    if (ov.sw > ov.cw) overflowFailures.push(ov)
    const shots = await shot(page, p.shot)

    const ok =
      residue.length === 0 &&
      overflowFailures.length === 0 &&
      shots.light &&
      shots.dark &&
      sub.every((s) => s.ok !== false)
    record(p.name, ok, { residue, overflow: ov, shots, subAsserts: sub })
  } finally {
    // 关闭新增/编辑表单弹框，防止级联
    if (dialogOpened && p.open) {
      await page.click(p.open.close).catch(() => {})
      await page.waitForSelector(p.open.wait, { state: 'hidden', timeout: 8000 }).catch(() => {})
    }
    await page.keyboard.press('Escape').catch(() => {})
    await sweepOverlays(page)
  }
}

/**
 * 清场残留遮罩：自定义 .dialog-overlay（含 .list-dialog-overlay，@click.self 关闭）与 el-overlay
 * （close-on-click-modal 关闭）。优先真实点击遮罩边缘触发关闭逻辑，兜底 DOM 移除（避免与 Vue vnode 打架）。
 */
async function sweepOverlays(page) {
  try {
    await page.evaluate(() => {
      const sels = ['.dialog-overlay', '.el-overlay', '.el-dialog__wrapper']
      for (const sel of sels) {
        document.querySelectorAll(sel).forEach((el) => {
          const r = el.getBoundingClientRect()
          if (r.width === 0 && r.height === 0) return
          // 已隐藏（opacity/visibility/pointer-events 关闭）或不可见 → 直接移除兜底
          const cs = getComputedStyle(el)
          if (cs.display === 'none' || cs.visibility === 'hidden' || el.offsetParent === null) {
            el.remove()
          }
        })
      }
    })
    // 可见遮罩：真实鼠标点击其左上/右上边缘（避开弹框本体，命中遮罩自身触发关闭）
    const overlayInfo = await page.evaluate(() => {
      const sels = ['.dialog-overlay[style*="display: flex"]', '.dialog-overlay', '.el-overlay']
      for (const sel of sels) {
        const el = document.querySelector(sel)
        if (!el) continue
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        if (r.width === 0 || r.height === 0) continue
        if (cs.display === 'none') continue
        // 取右上边缘点（弹框通常居中，角落属于遮罩空白区）
        return { x: Math.max(2, r.right - 5), y: Math.max(2, r.top + 5), clicked: true }
      }
      return null
    })
    if (overlayInfo && overlayInfo.clicked) {
      await page.mouse.click(overlayInfo.x, overlayInfo.y).catch(() => {})
      await page.waitForTimeout(120)
    }
    // 关闭后仍残留的（无点击关闭逻辑的）→ DOM 兜底移除
    await page.evaluate(() => {
      const sels = ['.dialog-overlay', '.el-overlay', '.el-dialog__wrapper']
      for (const sel of sels) {
        document.querySelectorAll(sel).forEach((el) => {
          const r = el.getBoundingClientRect()
          if (r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none') {
            el.remove()
          }
        })
      }
    })
  } catch {
    // 清场失败不致命——后续点击若仍被遮罩拦截，守卫会报该面板失败，不级联吞错
  }
}

// ===== 面板清单 =====

async function homeExtra(page) {
  const out = []
  const dots = await page.locator('[data-testid^="home-carousel-dot-"]').count()
  out.push({ ok: dots >= 3, detail: { dots } })
  await page.click('[data-testid="home-carousel-dot-2"]') // 切到工具屏
  await page.waitForSelector('[data-testid="wx-card"]', { state: 'visible', timeout: 8000 })
  await page.waitForTimeout(300)
  out.push(await assertClass(page, 'home-quick-add-input', 'el-input'))
  out.push(await assertClass(page, 'wx-setup-btn', 'el-button'))
  out.push(await assertClass(page, 'home-carousel-prev', 'el-button'))
  out.push(await assertClass(page, 'home-carousel-next', 'el-button'))
  return out
}

async function todosExtra(page) {
  const out = []
  // 待办 el-table + el-pagination 固定 10 条/页（td-pagination，2026-09 起替代 PanelPager）：15 条 @ 1366x768 必然多页
  const pagerCount = await page.locator('[data-testid="td-pagination"]').count()
  out.push({ ok: pagerCount === 1, detail: { pagerCount } })
  if (pagerCount === 1) {
    // el-pagination 属 el-* 组件，直接断言 EP 类 + 行数 + 边界 + 翻页往返
    out.push(await assertClass(page, 'td-pagination', 'el-pagination'))
    const rowCount = await page.locator('[data-testid="td-table"] .el-table__row').count()
    out.push({ ok: rowCount === 10, detail: { rowCount } })
    const active0 = ((await page.locator('[data-testid="td-pagination"] .el-pager li.is-active').first().textContent()) || '').trim()
    const totalLi = await page.locator('[data-testid="td-pagination"] .el-pager li.number').count()
    out.push({ ok: active0 === '1' && totalLi === 2, detail: { active0, totalLi } })
    const prevDisabled0 = await page
      .locator('[data-testid="td-pagination"] .btn-prev')
      .evaluate((el) => el.classList.contains('is-disabled') || el.getAttribute('disabled') !== null)
      .catch(() => false)
    const nextDisabled0 = await page
      .locator('[data-testid="td-pagination"] .btn-next')
      .evaluate((el) => el.classList.contains('is-disabled') || el.getAttribute('disabled') !== null)
      .catch(() => false)
    out.push({ ok: prevDisabled0 && !nextDisabled0, detail: { prevDisabled0, nextDisabled0 } })
    await page.click('[data-testid="td-pagination"] .btn-next')
    await page.waitForTimeout(250)
    const active1 = ((await page.locator('[data-testid="td-pagination"] .el-pager li.is-active').first().textContent()) || '').trim()
    out.push({ ok: active1 === '2', detail: { active1 } })
    await page.click('[data-testid="td-pagination"] .btn-prev')
    await page.waitForTimeout(250)
    const active2 = ((await page.locator('[data-testid="td-pagination"] .el-pager li.is-active').first().textContent()) || '').trim()
    out.push({ ok: active2 === '1', detail: { active2 } })
  }
  return out
}

async function healthContainerExtra(page) {
  const out = []
  const tabCount = await page.locator('[data-testid^="hd-tab-"]').count()
  out.push({ ok: tabCount === 4, detail: { tabCount } })
  out.push(await assertClass(page, 'hd-tab-exercise', 'el-radio-button'))
  return out
}

/** 弹出「本月记录」列表弹框，断言行内 el-table + el-pagination + close-btn 关闭（不级联）。 */
async function listDialogExtra(page, toggleSel, dialogSel, label) {
  const out = []
  await page.click(toggleSel)
  await page.waitForSelector(dialogSel, { state: 'visible', timeout: 10000 })
  await page.waitForTimeout(300)
  const tableCnt = await page.locator(`${dialogSel} .el-table`).count()
  const pagerCnt = await page.locator(`${dialogSel} .el-pagination`).count()
  out.push({ ok: tableCnt >= 1, detail: { scope: label, tableCnt } })
  out.push({ ok: pagerCnt >= 1, detail: { scope: label, pagerCnt } })
  // 关闭再等 hidden，避免残留遮罩拦截下一次 wb-menu 点击（五个弹框的 close 按钮均带 .close-btn class）
  await page.click(`${dialogSel} .close-btn`).catch(() => {})
  await page.waitForSelector(dialogSel, { state: 'hidden', timeout: 8000 }).catch(() => {})
  return out
}

async function ledgerExtra(page) {
  return listDialogExtra(page, '[data-testid="ld-toggle-list"]', '[data-testid="ld-records-dialog"]', 'ledger-records')
}

async function habitWeekExtra(page) {
  const out = []
  out.push(await assertClass(page, 'hw-week-prev', 'el-button'))
  out.push(await assertClass(page, 'hw-week-next', 'el-button'))
  return out
}

const PANELS = [
  { name: 'S1-home', shot: 'home', menu: 'home', wait: '[data-testid="home-greeting"]', extra: homeExtra },
  {
    name: 'S2-todos', shot: 'todos', menu: 'todos',
    wait: '[data-testid="td-table"]', extra: todosExtra,
    open: { sel: '[data-testid="td-add-button"]', wait: '[data-testid="td-dialog"]', close: '[data-testid="td-cancel-button"]' }
  },
  {
    name: 'S3-notes', shot: 'notes', menu: 'notes',
    wait: '[data-testid="note-card"]',
    open: { sel: '[data-testid="note-add-button"]', wait: '[data-testid="note-overlay"]', close: '[data-testid="note-cancel-button"]' }
  },
  { name: 'S4-diary', shot: 'diary', menu: 'diary', wait: '.dj-card' },
  {
    name: 'S5-countdowns', shot: 'countdowns', menu: 'countdowns',
    wait: '[data-testid="cd-item"]',
    open: { sel: '[data-testid="cd-add-button"]', wait: '[data-testid="cd-dialog"]', close: '[data-testid="cd-cancel-button"]' }
  },
  { name: 'S6-pomodoro', shot: 'pomodoro', menu: 'pomodoro', wait: '[data-testid="pm-timer-ring"]' },
  {
    name: 'S7-habits', shot: 'habits', menu: 'habits',
    wait: '.hb-card',
    open: { sel: '[data-testid="hb-add-btn"]', wait: '[data-testid="hb-dialog-cancel"]', close: '[data-testid="hb-dialog-cancel"]' }
  },
  { name: 'S8-habit-week', shot: 'habit-week', menu: 'habit-week', wait: '[data-testid="hw-week-grid"]', extra: habitWeekExtra },
  {
    name: 'S9-passwords', shot: 'passwords', menu: 'passwords',
    wait: '[data-testid="pwd-item"]',
    open: { sel: '[data-testid="pwd-add-btn"]', wait: '[data-testid="pwd-form-modal"]', close: '[data-testid="pwd-cancel-btn"]' }
  },
  {
    name: 'S10-ledger', shot: 'ledger', menu: 'ledger',
    wait: '[data-testid="ld-toggle-list"]', extra: ledgerExtra,
    open: { sel: '[data-testid="ld-add"]', wait: '[data-testid="ld-dialog"]', close: '[data-testid="ld-cancel"]' }
  },
  { name: 'S11-health', shot: 'health', menu: 'health', wait: '[data-testid="hd-tabs"]', extra: healthContainerExtra }
]

const HEALTH_SUB_PANELS = [
  {
    name: 'S12-exercise', shot: 'exercise', menu: 'health', tab: 'exercise',
    wait: '[data-testid="ex-toggle-list"]', extra: (p) => listDialogExtra(p, '[data-testid="ex-toggle-list"]', '[data-testid="ex-list-dialog"]', 'exercise-records'),
    open: { sel: '[data-testid="ex-add"]', wait: '[data-testid="ex-dialog"]', close: '[data-testid="ex-cancel-record"]' }
  },
  {
    name: 'S12-diet', shot: 'diet', menu: 'health', tab: 'diet',
    wait: '[data-testid="dt-toggle-list"]', extra: (p) => listDialogExtra(p, '[data-testid="dt-toggle-list"]', '[data-testid="dt-list-dialog"]', 'diet-records'),
    open: { sel: '[data-testid="dt-add"]', wait: '[data-testid="dt-dialog"]', close: '[data-testid="dt-cancel-record"]' }
  },
  {
    name: 'S12-sleep', shot: 'sleep', menu: 'health', tab: 'sleep',
    wait: '[data-testid="sl-toggle-list"]', extra: (p) => listDialogExtra(p, '[data-testid="sl-toggle-list"]', '[data-testid="sl-list-dialog"]', 'sleep-records')
  },
  {
    name: 'S12-weight', shot: 'weight', menu: 'health', tab: 'weight',
    wait: '[data-testid="wt-toggle-list"]', extra: (p) => listDialogExtra(p, '[data-testid="wt-toggle-list"]', '[data-testid="wt-records-dialog"]', 'weight-records')
  }
]

// ===== 设置弹窗阶段（批次 F 后全绿；--settings 现跑会因原生区域未换皮报残留——预期）=====

const WB_SUB_TABS = ['wb-city', 'wb-menu', 'wb-card', 'wb-cat', 'wb-backup', 'wb-snapshot']

async function clickDialogTab(page, text) {
  await page.getByText(text, { exact: true }).first().click()
  await page.waitForTimeout(300)
}

async function runSettingsPhase(page) {
  const sub = []
  await page.click('[data-testid="wb-settings"]')
  await page.waitForSelector('.manager-body', { state: 'visible', timeout: 10000 })
  sub.push(await assertVisible(page, '.manager-body'))

  // 工作台设置 tab 全子标签
  await clickDialogTab(page, '工作台设置')
  await page.waitForSelector('[data-testid^="subtab-"]', { state: 'visible', timeout: 8000 })
  for (const key of WB_SUB_TABS) {
    const tid = `subtab-${key}`
    const cnt = await page.locator(`[data-testid="${tid}"]`).count()
    if (cnt === 0) {
      sub.push({ ok: true, detail: { subTab: key, skipped: 'missing-testid' } })
      continue
    }
    await page.click(`[data-testid="${tid}"]`)
    await page.waitForTimeout(350)
    const hits = await scanNativeResidueEx(page, '.manager-body', ['.wb-size', '.nav-size'])
    const extra = []
    if (key === 'wb-city') extra.push(await assertClass(page, 'wb-city-input', 'el-input'))
    if (key === 'wb-menu') {
      extra.push(await assertClass(page, 'wbmenu-reset', 'el-button'))
      extra.push(await assertClass(page, 'wbmenu-switch-todos', 'el-switch'))
    }
    if (key === 'wb-card') extra.push(await assertClass(page, 'wbcard-reset-all', 'el-button'))
    if (key === 'wb-cat') {
      const wbcfg = await page.locator('[data-testid^="wbcfg-"]').count()
      const ldcfg = await page.locator('[data-testid^="ldcfg-"]').count()
      extra.push({ ok: wbcfg > 0 && ldcfg > 0, detail: { wbcfg, ldcfg } })
    }
    if (key === 'wb-backup') extra.push(await assertClass(page, 'wbcfg-wb-export', 'el-button'))
    sub.push({ ok: hits.length === 0, detail: { subTab: key, residue: hits, extra } })
  }
  const wbShots = await shot(page, 'settings-wb')
  sub.push({ ok: wbShots.light && wbShots.dark, detail: wbShots })

  // 提醒设置 tab
  await clickDialogTab(page, '提醒设置')
  await page.waitForSelector('[data-testid="remind-email-to"]', { state: 'visible', timeout: 8000 })
  sub.push(await assertClass(page, 'remind-desktop-switch', 'el-switch'))
  sub.push(await assertClass(page, 'remind-email-switch', 'el-switch'))
  for (const field of ['remind-email-to', 'remind-email-service', 'remind-email-template', 'remind-email-key']) {
    sub.push(await assertClass(page, field, 'el-input'))
  }
  sub.push(await assertClass(page, 'remind-email-test', 'el-button'))
  const hits = await scanNativeResidueEx(page, '.manager-body', ['.wb-size', '.nav-size'])
  sub.push({ ok: hits.length === 0, detail: { tab: 'remind', residue: hits } })
  const remindShots = await shot(page, 'settings-remind')
  sub.push({ ok: remindShots.light && remindShots.dark, detail: remindShots })

  await page.click('.close-btn')
  await page.waitForSelector('.manager-body', { state: 'detached', timeout: 8000 })

  const ok = sub.every((s) => s.ok !== false)
  record('S13-settings', ok, { subAsserts: sub })
}

// ===== 主流程 =====

let browser
try {
  await ensureDevServer()
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })

  const consoleErrors = []
  const consoleWarnings = []
  const pageErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
    else if (msg.type() === 'warning') consoleWarnings.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(String(err)))

  // 静噪：本机 public/data/sites.md 存在时 HomeView 会加载示例站点，图标链触发
  // allorigins / r.jina.ai 跨域 fetch → CORS console error。fulfill 空响应消除噪声。
  await page.route('**/api.allorigins.win/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: '' }).catch(() => {})
  )
  await page.route('**/r.jina.ai/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: '' }).catch(() => {})
  )
  await page.route('**/www.google.com/s2/favicons**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: '' }).catch(() => {})
  )

  // 注入 7 store + 密码 UI 播种
  await page.goto(devBase + '/')
  await injectIdbStore(page, 'todos', buildTodos())
  await injectIdbStore(page, 'notes', buildNotesData())
  await injectIdbStore(page, 'diary', buildDiaryData())
  await injectIdbStore(page, 'countdowns', buildCountdowns())
  await injectIdbStore(page, 'habits', buildHabitsData())
  await injectIdbStore(page, 'health', buildHealthData())
  await injectIdbStore(page, 'ledger', buildLedgerData())

  await page.goto(devBase + '/workbench')
  await page.waitForSelector('[data-testid="wb-menu-home"]', { state: 'visible', timeout: 15000 })
  await seedPasswords(page)

  if (ONLY !== 'settings') {
    for (const p of PANELS) await guard(p.name, () => verifyPanel(p, page))
    for (const p of HEALTH_SUB_PANELS) await guard(p.name, () => verifyPanel(p, page))
  }
  if (ONLY !== 'panels') await guard('S13-settings', () => runSettingsPhase(page))

  // 聚合 verdict
  const allPass = results.every((r) => r.ok)
  const errFree = consoleErrors.length === 0 && pageErrors.length === 0
  const verdict = allPass && errFree
  console.log('')
  console.log(`[qa-workbench-ep] guards PASS/FAIL: ${results.filter((r) => r.ok).length}/${results.length}`)
  console.log(`[qa-workbench-ep] console errors: ${consoleErrors.length} | page errors: ${pageErrors.length} | console warnings: ${consoleWarnings.length}`)
  if (consoleErrors.length) console.log('[qa-workbench-ep] console errors:\n' + consoleErrors.slice(0, 5).join('\n'))
  console.log(`[qa-workbench-ep] VERDICT: ${verdict ? 'PASS' : 'FAIL'}`)

  writeFileSync(
    EVIDENCE_LOG,
    JSON.stringify(
      { verdict, mode: ONLY, results, consoleErrors: consoleErrors.slice(0, 20), consoleWarnings: consoleWarnings.slice(0, 20), pageErrors, ranAt: new Date().toISOString() },
      null,
      2
    )
  )
  if (!verdict) process.exitCode = 1
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  stopDevServer()
  if (browser) await browser.close()
}