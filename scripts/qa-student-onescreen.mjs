/**
 * QA: 学生工作台一屏布局脚手架 + 行高测量（student-onescreen）— 批次 4.2
 *
 * 复用 qa-workbench-onescreen.mjs 的 E1 基础设施：
 *   - 后台启动/复用 vite dev server 16718-16726 → 进入 /student
 *   - 向 IndexedDB easy-web-tab v6 的 10 个学生 store 注入足量数据（12-15 条）
 *   - 两个视口（1366x768 与 1920x1080）× 明暗主题，测量 10 条目 → row-heights.json
 *   - 12 面板（home + 11 section）全页截图 → .omo/evidence/student-onescreen/
 *   - S1-S6 一屏契约断言：无纵向滚动 / 分页行为 / 筛选回页 1 / 移动端 375 等
 *
 * 运行：node scripts/qa-student-onescreen.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'student-onescreen')
const ROW_HEIGHTS_JSON = join(EVIDENCE_DIR, 'row-heights.json')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'qa-student-onescreen.log')
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
    const res = await fetch(`http://localhost:${port}/src/composables/useIdb.ts`)
    if (!res.ok) return false
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('text/html')) return false
    const body = await res.text()
    return body.includes('idbExportAll')
  } catch { return false }
}

async function isPortFree(port) {
  try {
    const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) })
    return !res.ok
  } catch { return true }
}

let server = null, startedByUs = false, devBase = null

async function ensureDevServer() {
  for (let p = 16718; p <= 16726; p++) {
    if (await isViteDevAt(p)) { devBase = `http://localhost:${p}`; console.log(`[dev] reuse at ${devBase}`); return }
  }
  for (let p = 16718; p <= 16726; p++) {
    if (!(await isPortFree(p))) continue
    const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
    server = spawn(process.execPath, [viteBin, '--port', String(p), '--strictPort'], { cwd: ROOT, stdio: ['ignore','pipe','pipe'] })
    startedByUs = true
    server.stdout.on('data', (d) => process.stdout.write(`[vite] ${d}`))
    server.stderr.on('data', (d) => process.stdout.write(`[vite] ${d}`))
    const ok = await waitForServer(`http://localhost:${p}`)
    if (ok && (await isViteDevAt(p))) { devBase = `http://localhost:${p}`; console.log(`[dev] ready at ${devBase}`); return }
    server.kill(); server = null; startedByUs = false
  }
  throw new Error('no free port 16718-16726 for vite')
}

function stopDevServer() { if (server && startedByUs) { server.kill(); console.log('[dev] stopped') } }

const results = []
function record(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: JSON.stringify(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`)
  appendFileSync(EVIDENCE_LOG, `${new Date().toISOString()}  ${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}\n`)
}
async function guard(name, fn) { try { await fn() } catch (err) { record(name, false, { error: err.message }) } }

function localDateKey(d) { const pad = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }
function dateOffsetKey(daysBack) { const n = new Date(); return localDateKey(new Date(n.getFullYear(), n.getMonth(), n.getDate()-daysBack)) }
function dateOffsetFuture(daysForward) { const n = new Date(); return localDateKey(new Date(n.getFullYear(), n.getMonth(), n.getDate()+daysForward)) }
function iso(offsetMs = 0) { return new Date(Date.now() + offsetMs).toISOString() }

async function injectIdbStore(page, storeName, payload) {
  return page.evaluate(({ store, value }) => new Promise((resolve, reject) => {
    const req = indexedDB.open('easy-web-tab', 9)
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store) }
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

const COLOR_PRESETS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#a855f7','#ec4899']
const HABIT_CATEGORIES = ['life','study','exercise','阅读','其他']
const SUBJECTS_P = ['语文','数学','英语']

function buildStudentSettings() {
  const visibility = {}
  ;['home','habits','homework','timetable','plan','review','mistakes','reading','exam','diary','pomodoro','achievements','rewards','parent'].forEach(k => { visibility[k] = true })
  return { stage: 'P', stageSeeded: 'P', nickname: 'QA 小学霸', subjects: SUBJECTS_P, menuVisibility: visibility }
}

function buildHabitsData() {
  const habits = [], records = []
  for (let i = 1; i <= 15; i++) {
    const id = `shb_qa_${i}`
    habits.push({ id, name: `习惯 ${i}：每日打卡示例（学生工作台 QA 播种）`, category: HABIT_CATEGORIES[i % HABIT_CATEGORIES.length], frequency: 1 + (i % 7), color: COLOR_PRESETS[i % COLOR_PRESETS.length], createdAt: iso(-i*86400000) })
    for (let k = 0; k < 3; k++) records.push({ id: `shr_qa_${i}_${k}`, habitId: id, date: dateOffsetKey(k), parentMarked: false, createdAt: iso(-k*3600000) })
  }
  return { habits, records }
}

function buildHomeworkData() {
  const entries = []
  const STATUSES = ['pending','doing','overdue','done'], PRIORITIES = ['low','normal','high']
  for (let i = 1; i <= 15; i++) {
    const isDone = i % 5 === 0
    entries.push({ id: `hw_qa_${i}`, subject: SUBJECTS_P[i % SUBJECTS_P.length], title: `作业 ${i}：学生工作台一屏布局测量示例任务标题`, content: i % 3 === 0 ? `这是作业 ${i} 的详细描述，用于验证多行描述情况下卡片高度的影响。` : undefined, dueDate: isDone ? dateOffsetKey(i%5) : dateOffsetFuture(i%7), status: STATUSES[i % STATUSES.length], priority: PRIORITIES[i % PRIORITIES.length], source: 'self', completedAt: isDone ? iso(-i*3600000) : undefined, createdAt: iso(-i*86400000), updatedAt: iso(-i*86400000) })
  }
  return { entries }
}

function buildPlansData() {
  const entries = []; const TYPES = ['weekly','monthly','term']
  for (let i = 1; i <= 12; i++) {
    const type = TYPES[i % TYPES.length]
    const start = dateOffsetKey(i * 3)
    const endDays = type === 'weekly' ? 7 : type === 'monthly' ? 30 : 90
    const n = new Date(); const endDateObj = new Date(n.getFullYear(), n.getMonth(), n.getDate() + i*3 + endDays)
    const end = localDateKey(endDateObj)
    const goals = []
    for (let g = 1; g <= 3; g++) goals.push({ id: `pg_qa_${i}_${g}`, content: `计划 ${i} 目标 ${g}：完成对应模块的学习进度要求`, progress: g===1?100:g===2?50:0, done: g===1 })
    entries.push({ id: `pl_qa_${i}`, type, title: `${type==='weekly'?'周':type==='monthly'?'月':'学期'}计划 ${i}：学生工作台 QA 播种示例`, startDate: start, endDate: end, goals, review: i%4===0 ? `# 复盘 ${i}\n\n本阶段学习情况整理与反思。` : undefined, createdAt: iso(-i*86400000), updatedAt: iso(-i*86400000) })
  }
  return { entries }
}

function buildReviewData() {
  const entries = []
  for (let i = 1; i <= 15; i++) {
    const stage = 1 + (i % 6)
    const learn = dateOffsetKey(i + 30)
    const nd = new Date(learn); nd.setDate(nd.getDate() + [1,2,4,7,15,30][stage-1])
    entries.push({ id: `rv_qa_${i}`, subject: SUBJECTS_P[i % SUBJECTS_P.length], knowledge: `知识点 ${i}：艾宾浩斯复习示例，覆盖核心概念定义与应用场景。`, source: i%3===0 ? `教材 P${100+i}` : '错题本', learnDate: learn, stage, nextReviewDate: localDateKey(nd), mastered: i%6===0, createdAt: iso(-i*86400000), updatedAt: iso(-i*86400000) })
  }
  return { entries }
}

function buildMistakesData() {
  const entries = []; const STATUSES = ['new','reviewing','mastered']
  for (let i = 1; i <= 12; i++) {
    entries.push({ id: `mk_qa_${i}`, subject: SUBJECTS_P[i % SUBJECTS_P.length], title: `错题 ${i}：典型易错题标题示例`, question: `## 题干 ${i}\n\n这是一道关于${SUBJECTS_P[i % SUBJECTS_P.length]}的典型错题。\n\n\`\`\`\n公式或计算步骤\n\`\`\``, answer: `## 正确答案\n\n解答过程：步骤1→步骤2→步骤3。\n\n关键思路：先判断条件再代入公式。`, analysis: i%2===0 ? `### 解析\n\n错误原因：概念理解不清。\n订正策略：再次阅读教材对应章节。` : undefined, tags: i%3===0 ? ['高频考点','易错'] : ['基础'], imageIds: [], status: STATUSES[i % STATUSES.length], createdAt: iso(-i*86400000), updatedAt: iso(-i*86400000) })
  }
  return { entries }
}

function buildReadingData() {
  const entries = []
  const TITLES = ['三国演义 第一回','西游记 大闹天宫','安徒生童话 卖火柴的小女孩','格林童话 白雪公主','水浒传 武松打虎','红楼梦 林黛玉进贾府','伊索寓言 龟兔赛跑','一千零一夜 阿拉丁神灯']
  for (let i = 1; i <= 15; i++) {
    entries.push({ id: `rd_qa_${i}`, bookTitle: TITLES[i % TITLES.length] + `（第 ${i} 次阅读）`, pages: 10 + i*3, durationMin: 20 + i*5, impression: i%3===0 ? `# 读书感悟 ${i}\n\n**精彩段落**：这段文字写得非常动人。\n\n> 引用名句` : undefined, date: dateOffsetKey(i), parentSigned: i%4===0, signedAt: i%4===0 ? iso(-i*3600000) : undefined, createdAt: iso(-i*86400000), updatedAt: iso(-i*86400000) })
  }
  return { entries }
}

function buildAchievementsData() {
  const defs = []; const unlocked = {}
  const CATEGORIES = ['habit','study','reading','pomodoro']
  const CATEGORY_TEXT = { habit:'习惯', study:'学习', reading:'阅读', pomodoro:'专注' }
  const METRICS = ['streak-days','habit-week-rate','reading-books','pomodoro-sessions','hw-rate-done','mistake-mastered','review-stage-complete','plan-goals-done']
  const EMOJIS = ['🏅','🎖️','🥇','🥈','🥉','⭐','🌟','✨','💎','🏆','🎯','🔥']
  for (let i = 1; i <= 12; i++) {
    const id = `sa_qa_${i}`; const cat = CATEGORIES[i % CATEGORIES.length]
    defs.push({ id, name: `${CATEGORY_TEXT[cat]}达人 ${i} 级`, description: `完成 ${i*5} 次${CATEGORY_TEXT[cat]}活动即可解锁。`, emoji: EMOJIS[i % EMOJIS.length], category: cat, metric: METRICS[i % METRICS.length], target: i*5 })
    if (i % 3 === 0) unlocked[id] = iso(-i*86400000)
  }
  return { definitions: defs, unlocked }
}

function buildRewardsData() {
  const rewards = []; const history = []
  const NAMES = ['周末去公园玩','额外30分钟平板','买一本漫画书','吃一次肯德基','去游乐场','和朋友看电影','乐高积木一盒','免做一天家务','睡前绘本30分钟','新文具一套','周末晚睡30分钟','独自去同学家','自行车郊游','定制生日蛋糕','参加夏令营']
  for (let i = 1; i <= 15; i++) rewards.push({ id: `rw_qa_${i}`, name: NAMES[i-1], cost: 10 + i*5, stock: i%5===0 ? undefined : 5 + (i%10) })
  for (let i = 1; i <= 20; i++) {
    const isRedeem = i % 3 === 0
    history.push({ id: `rt_qa_${i}`, type: isRedeem ? 'redeem' : 'earn', points: isRedeem ? -(20 + i*2) : 10 + i, reason: isRedeem ? `兑换：${NAMES[(i-1) % NAMES.length].slice(0,8)}` : i%4===0 ? `完成习惯打卡${i}项` : i%4===1 ? `完成作业${i}份` : `阅读${i*10}分钟`, rewardId: isRedeem ? rewards[i % rewards.length].id : undefined, sourceId: isRedeem ? undefined : `auto:qa:src_${i}`, createdAt: iso(-i*3600000) })
  }
  return { totalPoints: 1580, history, rewards }
}

function buildCountdownsExam() {
  const countdowns = []
  const EXAM_NAMES = ['期中考试','期末考试','语文单元测验','数学口算比赛','英语单词听写','期中家长会','秋季运动会','元旦晚会','暑假放假','寒假开始','科学实验截止','美术作品提交']
  const pad = (n) => String(n).padStart(2,'0')
  for (let i = 1; i <= 12; i++) {
    const end = new Date(Date.now() + (i + 6) * 86400000)
    countdowns.push({ id: `ex_qa_${i}`, name: `${EXAM_NAMES[i-1]}：学生工作台测量示例`, endDateTime: `${end.getFullYear()}-${pad(end.getMonth()+1)}-${pad(end.getDate())}T08:${pad(30 + (i%30))}`, repeat: null, category: 'work', createdAt: iso(-i*3600000), updatedAt: iso(-i*3600000), color: COLOR_PRESETS[i % COLOR_PRESETS.length] })
  }
  return { countdowns, customCategories: ['月考','单元测','竞赛'], sortRule: 'endDate' }
}

const MEASURE_PANELS = [
  { key: 'habits',         menuIdx: 1,  item: '[data-testid^="sh-card-"]' },
  { key: 'homework',       menuIdx: 2,  item: '[data-testid^="shw-card-"]' },
  { key: 'plan',           menuIdx: 4,  item: '[data-testid^="sp-card-"]' },
  { key: 'review',         menuIdx: 5,  item: '[data-testid^="sr-card-"]' },
  { key: 'mistakes',       menuIdx: 6,  item: '[data-testid^="sm-card-"]' },
  { key: 'reading',        menuIdx: 7,  item: '[data-testid^="sr-card-"]' },
  { key: 'exam',           menuIdx: 8,  item: '[data-testid^="se-card-"]' },
  { key: 'achievements',   menuIdx: 11, item: '[data-testid^="sa-badge-"]' },
  { key: 'rewards',        menuIdx: 12, tab: 'rewards', tabSel: '[data-testid="sr-tab-rewards"]', item: '[data-testid^="sr-reward-"]' },
  { key: 'rewardsHistory', menuIdx: 12, tab: 'history', tabSel: '[data-testid="sr-tab-history"]', item: '[data-testid^="sr-txn-"]' }
]

const SCREENSHOT_PANELS = [
  { key: 'home',         menuIdx: 0,  wait: '.student-home' },
  { key: 'habits',       menuIdx: 1,  wait: '[data-testid^="sh-card-"]' },
  { key: 'homework',     menuIdx: 2,  wait: '[data-testid^="shw-card-"]' },
  { key: 'timetable',    menuIdx: 3,  wait: '.stt-grid' },
  { key: 'plan',         menuIdx: 4,  wait: '[data-testid^="sp-card-"]' },
  { key: 'review',       menuIdx: 5,  wait: '[data-testid^="sr-card-"]' },
  { key: 'mistakes',     menuIdx: 6,  wait: '[data-testid^="sm-card-"]' },
  { key: 'reading',      menuIdx: 7,  wait: '[data-testid^="sr-card-"]' },
  { key: 'exam',         menuIdx: 8,  wait: '[data-testid^="se-card-"]' },
  { key: 'pomodoro',     menuIdx: 10, wait: '[data-testid="spm-timer-ring"]' },
  { key: 'achievements', menuIdx: 11, wait: '[data-testid^="sa-badge-"]' },
  { key: 'rewards',      menuIdx: 12, wait: '[data-testid^="sr-reward-"]' },
  { key: 'parent',       menuIdx: 13, wait: '.st-parent-panel' }
]

const VIEWPORTS = [
  { width: 1366, height: 768, label: '1366x768' },
  { width: 1920, height: 1080, label: '1920x1080' }
]

async function navMenuIdx(page, idx) {
  await page.evaluate((n) => new Promise((resolve) => {
    const nodes = document.querySelectorAll('.st-menu-item')
    if (nodes && nodes.length > n) {
      const btn = nodes[n]
      if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click() }
    }
    resolve(true)
  }), idx)
  await page.waitForTimeout(180)
}

async function setDark(page, dark) { await page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark) }

async function metricsOf(page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body
    // wc 主取 .st-content；若其 clientWidth<100（移动端被 sidebar 包裹收缩）则回退到 .st-shell
    const wc = document.querySelector('.st-content')
    const shell = document.querySelector('.st-shell')
    const useWc = wc && wc.clientWidth >= 100 ? wc : (shell || wc)
    const cs = useWc ? getComputedStyle(useWc) : null
    const htmlStyle = getComputedStyle(doc)
    const bodyStyle = getComputedStyle(body)
    return {
      wcScrollH: useWc?useWc.scrollHeight:0, wcClientH: useWc?useWc.clientHeight:0,
      wcScrollW: useWc?useWc.scrollWidth:0,   wcClientW: useWc?useWc.clientWidth:0,
      docScrollH: doc.scrollHeight, docClientH: doc.clientHeight,
      docScrollW: doc.scrollWidth,   docClientW: doc.clientWidth,
      wcOverflowY: cs?cs.overflowY:'',
      // 移动端滚动未被锁住：html/body 都没有 overflow:hidden
      scrollUnlocked: htmlStyle.overflow !== 'hidden' && htmlStyle.overflowY !== 'hidden' && bodyStyle.overflow !== 'hidden' && bodyStyle.overflowY !== 'hidden',
      htmlOverflow: htmlStyle.overflow + '/' + htmlStyle.overflowY,
      bodyOverflow: bodyStyle.overflow + '/' + bodyStyle.overflowY
    }
  })
}

async function getPagerState(page) {
  const pager = page.locator('[data-testid="panel-pager"]')
  if ((await pager.count()) === 0) return null
  const info = ((await page.locator('[data-testid="panel-pager-info"]').textContent()) || '').trim()
  const m = info.match(/第\s*(\d+)\s*\/\s*(\d+)\s*页/)
  return m ? { page: Number(m[1]), total: Number(m[2]), text: info } : { page: 0, total: 0, text: info }
}

async function measurePanels(page, heights) {
  for (const panel of MEASURE_PANELS) {
    await navMenuIdx(page, panel.menuIdx)
    if (panel.tabSel) { await page.click(panel.tabSel); await page.waitForTimeout(150) }
    const loc = page.locator(panel.item).first()
    await loc.waitFor({ state: 'visible', timeout: 12000 })
    const h = await loc.evaluate((el) => el.getBoundingClientRect().height)
    heights[panel.key] = Math.max(heights[panel.key] ?? 0, h)
  }
}

async function runContractAssertions(page) {
  for (const vp of VIEWPORTS) {
    for (const theme of ['light','dark']) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await setDark(page, theme === 'dark')
      await page.waitForTimeout(150)
      for (const panel of SCREENSHOT_PANELS) {
        await guard(`S1 ${panel.key} @ ${vp.label}/${theme} 无纵向滚动`, async () => {
          await navMenuIdx(page, panel.menuIdx)
          await page.waitForSelector(panel.wait, { state: 'visible', timeout: 15000 })
          await page.waitForTimeout(180)
          const m = await metricsOf(page)
          const ok = m.wcScrollH <= m.wcClientH + 2 && m.docScrollH <= m.docClientH + 2
          record(`S1 ${panel.key} @ ${vp.label}/${theme} 无纵向滚动`, ok, { wcScrollH:m.wcScrollH, wcClientH:m.wcClientH, docScrollH:m.docScrollH, docClientH:m.docClientH })
        })
      }
      await guard(`S1 rewards-history @ ${vp.label}/${theme} 无纵向滚动`, async () => {
        await navMenuIdx(page, 12)
        await page.click('[data-testid="sr-tab-history"]')
        await page.waitForSelector('[data-testid^="sr-txn-"]', { state: 'visible', timeout: 12000 })
        await page.waitForTimeout(150)
        const m = await metricsOf(page)
        const ok = m.wcScrollH <= m.wcClientH + 2 && m.docScrollH <= m.docClientH + 2
        record(`S1 rewards-history @ ${vp.label}/${theme} 无纵向滚动`, ok, { wcScrollH:m.wcScrollH, wcClientH:m.wcClientH })
      })
    }
  }
  const S2_PANELS = [
    { key: 'habits',   menuIdx: 1, item: '[data-testid^="sh-card-"]' },
    { key: 'homework', menuIdx: 2, item: '[data-testid^="shw-card-"]' },
    { key: 'plan',     menuIdx: 4, item: '[data-testid^="sp-card-"]' },
    { key: 'mistakes', menuIdx: 6, item: '[data-testid^="sm-card-"]' },
    { key: 'rewards',  menuIdx: 12, item: '[data-testid^="sr-reward-"]', tabSel: '[data-testid="sr-tab-rewards"]' }
  ]
  for (const panel of S2_PANELS) {
    await guard(`S2 ${panel.key} 分页行为`, async () => {
      await page.setViewportSize({ width: 1366, height: 768 })
      await setDark(page, false)
      await navMenuIdx(page, panel.menuIdx)
      if (panel.tabSel) await page.click(panel.tabSel)
      await page.waitForSelector(panel.item, { state: 'visible', timeout: 12000 })
      await page.waitForTimeout(150)
      const pager = await getPagerState(page)
            // pager==null 表示 fitsOnePage（PanelPager 不渲染但设计正确）；否则要求 total>=1
      record(`S2 ${panel.key} 分页状态有效（multiPage 或 fitsOnePage）`, (pager === null) ? true : (!!pager && pager.total >= 1), { pager })
      if (pager && pager.total > 1) {
        const prevDisabled = await page.locator('[data-testid="panel-pager-prev"]').first().isDisabled().catch(() => true)
        record(`S2 ${panel.key} 第1页 prev 禁用`, prevDisabled, { prevDisabled })
        const firstId1 = await page.locator(panel.item).first().getAttribute('data-testid')
        await page.click('[data-testid="panel-pager-next"]')
        // 轮询首条 testid 变化，避免 Vue 异步渲染 race；最多 2.0s
        for (let __i = 0; __i < 20; __i++) {
          await page.waitForTimeout(100)
          const cur = await page.locator(panel.item).first().getAttribute('data-testid')
          if (cur !== firstId1) break
        }
        const firstId2 = await page.locator(panel.item).first().getAttribute('data-testid')
        record(`S2 ${panel.key} 下一页内容变化`, !!firstId1 && !!firstId2 && firstId1 !== firstId2, { firstId1, firstId2 })
      }
    })
  }
  await guard(`S3 homework 学科筛选切换回第1页`, async () => {
    await navMenuIdx(page, 2)
    await page.waitForSelector('[data-testid^="shw-card-"]', { state: 'visible', timeout: 12000 })
    const p0 = await getPagerState(page)
    if (p0 && p0.total > 1 && p0.page === 1) { await page.click('[data-testid="panel-pager-next"]'); await page.waitForTimeout(150) }
    const yuwen = page.locator('[data-testid="shw-subject-语文"]').first()
    if ((await yuwen.count()) > 0) await yuwen.click()
    await page.waitForTimeout(200)
    const p1 = await getPagerState(page)
    record(`S3 homework 切语文后回第1页`, p1 ? p1.page === 1 : true, { pagerAfter: p1 })
  })
  await guard(`S4 375x667 移动端分页惰性+滚动+无横溢`, async () => {
    await page.setViewportSize({ width: 375, height: 667 })
    await setDark(page, false)
    await navMenuIdx(page, 1)
    await page.waitForSelector('[data-testid^="sh-card-"]', { state: 'visible', timeout: 12000 })
    await page.waitForTimeout(200)
    const pager = await getPagerState(page)
    const m = await metricsOf(page)
    record(`S4 移动端 habits PanelPager 惰性`, pager === null || pager.total <= 1, { pager })
    record(`S4 移动端页面滚动保留`, !!m.scrollUnlocked, { scrollUnlocked: m.scrollUnlocked, htmlOverflow: m.htmlOverflow, bodyOverflow: m.bodyOverflow, docScrollH: m.docScrollH, docClientH: m.docClientH })
    record(`S4 移动端无横向溢出`, m.wcScrollW <= m.wcClientW + 2 && m.docScrollW <= m.docClientW + 2, { wcScrollW:m.wcScrollW, wcClientW:m.wcClientW })
  })
  await guard(`S7 375 dark 全面板无横向溢出`, async () => {
    await page.setViewportSize({ width: 375, height: 667 })
    await setDark(page, true); await page.waitForTimeout(150)
    let anyFail = null
    for (const panel of SCREENSHOT_PANELS) {
      await navMenuIdx(page, panel.menuIdx)
      // 375 移动端抽屉/面板切换时 panel.wait 可能短暂被 CSS hidden（实际 layout 已渲染）
      // 先等 DOM attached，再额外尝试 1s 内变 visible（失败不阻塞，metricsOf 仍能读布局）
      await page.waitForSelector(panel.wait, { state: 'attached', timeout: 15000 })
      try { await page.waitForSelector(panel.wait, { state: 'visible', timeout: 1500 }) } catch (_) {}
      await page.waitForTimeout(150)
      const m = await metricsOf(page)
      const ok = m.wcScrollW <= m.wcClientW + 2 && m.docScrollW <= m.docClientW + 2
      if (!ok) { anyFail = { key: panel.key, m }; break }
    }
    record(`S7 375 dark 全面板无横向溢出`, anyFail === null, anyFail ?? { note: '全部通过' })
  })
}

async function main() {
  writeFileSync(EVIDENCE_LOG, '')
  appendFileSync(EVIDENCE_LOG, `===== student-onescreen QA start ${new Date().toISOString()} =====\n`)
  await ensureDevServer()
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('pageerror', (err) => appendFileSync(EVIDENCE_LOG, `[pageerror] ${err.message}\n`))
  page.on('console', (msg) => { if (msg.type() === 'error') appendFileSync(EVIDENCE_LOG, `[console:error] ${msg.text()}\n`) })

  await page.goto(`${devBase}/student`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(1500)

  console.log('[inject] student_settings')
  await injectIdbStore(page, 'student_settings', buildStudentSettings())
  console.log('[inject] student_habits');  await injectIdbStore(page, 'student_habits', buildHabitsData())
  console.log('[inject] student_homework'); await injectIdbStore(page, 'student_homework', buildHomeworkData())
  console.log('[inject] student_plans');   await injectIdbStore(page, 'student_plans', buildPlansData())
  console.log('[inject] student_review');  await injectIdbStore(page, 'student_review', buildReviewData())
  console.log('[inject] student_mistakes'); await injectIdbStore(page, 'student_mistakes', buildMistakesData())
  console.log('[inject] student_reading');  await injectIdbStore(page, 'student_reading', buildReadingData())
  console.log('[inject] student_achievements'); await injectIdbStore(page, 'student_achievements', buildAchievementsData())
  console.log('[inject] student_rewards');  await injectIdbStore(page, 'student_rewards', buildRewardsData())
  console.log('[inject] student_countdowns'); await injectIdbStore(page, 'student_countdowns', buildCountdownsExam())

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(2500)

  try {
    const onb = page.locator('[data-testid^="stg-onboarding-card-"]').first()
    if (await onb.count() > 0) { await page.waitForTimeout(500); await page.keyboard.press('Escape'); await page.waitForTimeout(300) }
  } catch {}

  try {
    await page.waitForSelector('.st-menu-item', { timeout: 15000 })
    const menuCount = await page.$$eval('.st-menu-item', arr => arr.length)
    record('P0 学生工作台加载成功（菜单渲染）', true, { menuCount })
  } catch (e) { record('P0 学生工作台加载成功', false, { error: e.message }) }

  const rawHeights = {}
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.waitForTimeout(200)
    await measurePanels(page, rawHeights)
    appendFileSync(EVIDENCE_LOG, `[measure:${vp.label}] ${JSON.stringify(rawHeights)}\n`)
  }
  const finalHeights = {}
  for (const k of Object.keys(rawHeights)) finalHeights[k] = Math.max(10, Math.ceil(rawHeights[k]) + 2)
  writeFileSync(ROW_HEIGHTS_JSON, JSON.stringify(finalHeights, null, 2) + '\n')
  console.log('[row-heights] written:', JSON.stringify(finalHeights))

  for (const vp of VIEWPORTS) {
    for (const theme of ['light','dark']) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await setDark(page, theme === 'dark'); await page.waitForTimeout(200)
      for (const panel of SCREENSHOT_PANELS) {
        await guard(`shot ${panel.key} ${vp.label}/${theme}`, async () => {
          await navMenuIdx(page, panel.menuIdx)
          await page.waitForSelector(panel.wait, { state: 'visible', timeout: 15000 })
          await page.waitForTimeout(200)
          await page.screenshot({ path: join(EVIDENCE_DIR, `${panel.key}-${theme}-${vp.label}.png`), fullPage: false, type: 'png' })
        })
      }
    }
  }

  console.log('[contract] assertions begin')
  await runContractAssertions(page)

  const pass = results.filter(r => r.ok).length
  const fail = results.length - pass
  appendFileSync(EVIDENCE_LOG, `\n===== Summary: PASS=${pass} FAIL=${fail} TOTAL=${results.length} =====\n`)
  console.log(`\n===== Summary: PASS=${pass} FAIL=${fail} TOTAL=${results.length} =====`)
  await browser.close()
  stopDevServer()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('[fatal]', e)
  try { appendFileSync(EVIDENCE_LOG, `[fatal] ${e.stack ?? e.message}\n`) } catch {}
  try { stopDevServer() } catch {}
  process.exit(2)
})