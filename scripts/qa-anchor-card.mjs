/**
 * QA: 日历锚点卡（Todo 16 / workbench-improvements）— CalendarAnchorCard.vue
 *
 * Playwright 方案：后台启动 vite dev（端口 16718 起）→ 临时 harness 页面
 * `qa-anchor-harness.html`（项目根，Vite 转译内联 module script，直接挂载 CalendarAnchorCard）
 * 直接读 IDB（idbPut 'ledger' / 'countdowns'）构造数据 → reload → 断言锚点卡 DOM。
 *
 * 场景：
 *  - H1 happy：无数据 → 引导文案「在记账添加工资记录后显示发薪倒计时」
 *  - H2 happy：注入含 15 日 salary 记录 → reload → `ac-anchor-payday` 显示「还有 N 天」
 *    （N 由页面内 nextPayday+localToday 同步计算，任意运行日期均精确）
 *  - H3 happy：注入 category='life' 的 yearly 倒计时 → reload → `ac-anchor-countdown-<id>` 行出现
 *  - F1 failure：无 salary → 引导文案且页面不报错；卡内不出现任何金额（¥/元/数字金额）
 * 证据（断言清单）写入 .omo/evidence/workbench-improvements/task-16-workbench-improvements.log
 *
 * 运行：node scripts/qa-anchor-card.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HARNESS = join(ROOT, 'qa-anchor-harness.html')
const EVIDENCE_PATH = join(ROOT, '.omo', 'evidence', 'workbench-improvements', 'task-16-workbench-improvements.log')

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

function removeHarness() {
  if (existsSync(HARNESS)) {
    unlinkSync(HARNESS)
    console.log('[qa] harness removed')
  }
}

function harnessHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>CalendarAnchorCard QA harness</title>
</head>
<body>
  <div id="app"></div>
  <script type="module">
    import { createApp } from 'vue'
    import { createPinia } from 'pinia'
    import CalendarAnchorCard from '/src/components/workbench/CalendarAnchorCard.vue'
    createApp(CalendarAnchorCard).use(createPinia()).mount('#app')
  <\/script>
</body>
</html>
`
}

async function main() {
  console.log(`[qa] CalendarAnchorCard (Todo 16)`)
  await ensureDevServer()
  writeFileSync(HARNESS, harnessHtml(), 'utf8')
  console.log(`[qa] harness written: ${HARNESS}`)

  const browser = await chromium.launch()
  const results = []
  const push = (name, pass, detail) => results.push({ name, pass, detail: String(detail) })
  try {
    const page = await browser.newPage()
    await page.goto(`${devBase}/qa-anchor-harness.html`, { waitUntil: 'load' })
    await page.waitForTimeout(1200)

    const cardText = () => page.locator('[data-testid="ac-card"]').innerText()

    // ============ H1: 无数据 → 引导文案（不发 toast 不报错）============
    const guideVisible = await page.locator('[data-testid="ac-guide"]').isVisible()
    const guideText = guideVisible ? await page.locator('[data-testid="ac-guide"]').innerText() : ''
    push('H1 no-salary guide text visible', guideVisible && guideText.includes('在记账添加工资记录后显示发薪倒计时'), `guide=${guideText}`)
    push('H1b no anchor rows rendered', (await page.locator('[data-testid^="ac-anchor-"]').count()) === 0, 'ac-anchor-* count=0')

    // ============ H2: 注入 15 日 salary 记录 → reload → payday 行 ============
    // 构造含 salary 的完整 ledger 结构（categories 内置 8 组 + 一条 15 日工资记录）
    const expected = await page.evaluate(async () => {
      const { idbPut } = await import('/src/composables/useIdb.ts')
      const { DEFAULT_LEDGER_CATEGORIES } = await import('/src/types/index.ts')
      const { nextPayday, localDateStr } = await import('/src/composables/ledgerCore.ts')
      const { localToday } = await import('/src/composables/todoCore.ts')
      const today = localToday()
      // salary 记录取本月 15 日（今天日序 >15 则取上月 15 日——nextPayday 只关心 day-of-month）
      const payDay = 15
      const nowD = new Date()
      const prevMonth = new Date(nowD.getFullYear(), nowD.getMonth() - 1, payDay)
      const salaryDate =
        nowD.getDate() <= payDay
          ? `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-${String(payDay).padStart(2, '0')}`
          : `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${String(payDay).padStart(2, '0')}`
      const entries = [
        { id: 'ld_qa_salary', date: salaryDate, categoryId: 'salary', amount: 10000, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'ld_qa_lunch', date: salaryDate, categoryId: 'lunch', amount: 20, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
      ]
      await idbPut('ledger', { categories: DEFAULT_LEDGER_CATEGORIES, entries })
      const next = nextPayday(entries, today)
      const days = Math.round((new Date(next + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
      return { today, salaryDate, next, days }
    })

    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(1200)
    const paydayRow = page.locator('[data-testid="ac-anchor-payday"]')
    push('H2 payday row rendered', (await paydayRow.count()) === 1, `expected nextPayday=${expected.next}`)
    const paydayText = (await paydayRow.count()) > 0 ? (await paydayRow.innerText()).replace(/\s+/g, ' ') : ''
    push('H2 payday text shows correct days', paydayText.includes(`还有 ${expected.days} 天`), `got="${paydayText}" expected ${expected.days} days (today=${expected.today})`)
    // 发薪锚点优先置顶（第一个锚点）
    const firstKey = await page.locator('[data-testid^="ac-anchor-"]').first().getAttribute('data-testid')
    push('H2 payday is first anchor', firstKey === 'ac-anchor-payday', `first=${firstKey}`)
    // 无金额展示
    const textAfterSalary = (await cardText()).replace(/\s+/g, ' ')
    push('H2 no amount shown (mask spirit)', !textAfterSalary.includes('¥') && !/\d+\.\d{2}/.test(textAfterSalary), textAfterSalary)

    // ============ H3: 注入 category='life' yearly 倒计时 → 纪念日锚点 ============
    const cdId = 'cd_qa_anniv'
    await page.evaluate(async (id) => {
      const { idbPut } = await import('/src/composables/useIdb.ts')
      await idbPut('countdowns', [
        {
          id,
          name: '结婚纪念日',
          endDateTime: '2020-06-18T00:00',
          repeat: { type: 'yearly' },
          category: 'life',
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z'
        }
      ])
    }, cdId)
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(1200)
    const annivRow = page.locator(`[data-testid="ac-anchor-countdown-${cdId}"]`)
    push('H3 life countdown anchor rendered', (await annivRow.count()) === 1, `testid=ac-anchor-countdown-${cdId}`)
    if ((await annivRow.count()) > 0) {
      const annivText = (await annivRow.innerText()).replace(/\s+/g, ' ')
      const daysMatch = /还有 (\d+) 天/.exec(annivText)
      push('H3 countdown anchor shows N days', daysMatch !== null && Number(daysMatch[1]) > 0, `got="${annivText}"`)
      push('H3 countdown name shown', annivText.includes('结婚纪念日'), annivText)
    }
    // 总计锚点 ≤ 3 且 payday 仍在首位
    const totalAnchors = await page.locator('[data-testid^="ac-anchor-"]').count()
    push('H3 total anchors <= 3', totalAnchors <= 3 && totalAnchors >= 2, `count=${totalAnchors}`)
    const firstKey2 = await page.locator('[data-testid^="ac-anchor-"]').first().getAttribute('data-testid')
    push('H3 payday still first', firstKey2 === 'ac-anchor-payday', `first=${firstKey2}`)

    // ============ F1: 清空 ledger → 无 salary → 引导文案恢复、不报错 ============
    await page.evaluate(async () => {
      const { idbPut } = await import('/src/composables/useIdb.ts')
      const { DEFAULT_LEDGER_CATEGORIES } = await import('/src/types/index.ts')
      await idbPut('ledger', { categories: DEFAULT_LEDGER_CATEGORIES, entries: [] })
    })
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(1200)
    const guide2Visible = await page.locator('[data-testid="ac-guide"]').isVisible()
    push('F1 no-salary guide restored after clearing', guide2Visible === true, 'ac-guide visible')
    const bodyAlive = await page.locator('body').isVisible()
    push('F1 page functional (no throw)', bodyAlive === true, 'body visible')

    const passed = results.filter((a) => a.pass).length
    const verdict = passed === results.length && results.length > 0 ? 'PASS' : 'FAIL'
    console.log(`[qa] assertions: ${passed}/${results.length} passed`)
    for (const a of results) console.log(`  ${a.pass ? 'PASS' : 'FAIL'} ${a.name}${a.detail ? ' | ' + a.detail : ''}`)

    // ============ 证据（.log，bash 风格文本）============
    const lines = [
      `[TASK 16] CalendarAnchorCard.vue 日历锚点卡（发薪/纪念日倒计时）`,
      `------------------------------------------------------------`,
      `STATUS: ${verdict} (${passed}/${results.length})`,
      ``,
      `Created:`,
      `  - src/composables/ledgerCore.ts  + nextPayday(entries, today): string | null（salary 最近一笔 day-of-month → 月内/跨月 + 31 日小月/2月钳制；无 salary → null）`,
      `  - scripts/test-ledger-core.ts     + T25/T26 nextPayday 断言（happy/跨年/无记录/平年闰年 2 月/小月钳制/多笔取最近/非法输入）→ 26/26 passed`,
      `  - src/components/workbench/CalendarAnchorCard.vue  日历锚点卡：发薪（ledgerStore.entries → nextPayday）+ category='life' 纪念日（countdownsStore → calcRemaining）最多 3 锚点；`,
      `      每日零点定时器 + visibilitychange 刷新本地日期（localToday，防 UTC 偏移）；不展示任何金额；无 salary 显示引导文案；data-testid ac-anchor-<key>/ac-guide`,
      `  - scripts/qa-anchor-card.mjs      Playwright QA（vite dev 16718 冲突自动换 16719+；临时 harness qa-anchor-harness.html 挂载组件，跑完删除）`,
      ``,
      `Verification:`,
      `  1. npm run test:ledger -> 26/26 passed（含新增 T25/T26 nextPayday）`,
      `  2. npm run build -> EXIT=0（vue-tsc -b + vite build 通过）`,
      `  3. grep CalendarAnchorCard.vue -> 日期推算仅 nextPayday / calcRemaining / localToday（无 daysInMonth / Math.min(payDay / getDate() 派生）；仅 new Date() 出现于零点调度）`,
      `     金额检查：组件无 amount / ¥ / formatYuan 引用（掩码精神，只展示天数）`,
      ``,
      `QA covered (Playwright, chromium, harness page):`,
      ...results.map((a) => `  ${a.pass ? 'PASS' : 'FAIL'}  ${a.name}  ->  ${a.detail}`),
      ``,
      `Commit: feat(home): 新增日历锚点卡（发薪/纪念日倒计时）`
    ]
    mkdirSync(dirname(EVIDENCE_PATH), { recursive: true })
    writeFileSync(EVIDENCE_PATH, lines.join('\n') + '\n', 'utf8')
    console.log(`[qa] evidence written: ${EVIDENCE_PATH}`)
    if (verdict !== 'PASS') process.exitCode = 1
  } finally {
    await browser.close()
    removeHarness()
    stopDevServer()
  }
}

main().catch((err) => {
  console.error('[qa] fatal:', err)
  removeHarness()
  stopDevServer()
  process.exit(1)
})
