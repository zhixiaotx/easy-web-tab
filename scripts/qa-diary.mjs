/**
 * QA: 工作台「日记本」面板（diary）— Todo 5 验收（T5, QA-only）
 * 后台启动/复用 vite dev（16718-16726）→ /workbench → 点击 wb-menu-diary → 断言：
 *
 *  S1 全新 profile：dj-empty 可见（空态契约「还没有日记…」，0 条）
 *  S2 注入 IndexedDB（easy-web-tab v5 / store 'diary' / 键 'items'，值 = DiaryData {entries} 9 条含今天）
 *     → reload → 第 1 页恰好 8 张 dj-card / 第 1 / 2 页 / next 可用 prev 禁用 /
 *     至少一个 dj-card-date-* 含中文星期（diaryDateLabel 输出「周X」）/ 今天卡显示 dj-card-today-* = 今天
 *  S3 分页：next → 1 卡 + 第 2 / 2 页 + next 禁用 prev 可用；prev → 回 8 卡
 *  S4 保存流（date=今天 默认，upsert 今天条目）：填 Markdown → dj-char-count 更新 →
 *     保存 → toast「日记已保存」→ 今天卡仍在第 1 页带徽标 → reload 后持久化（卡片+徽标+新内容仍在）
 *  S5 空保存守卫：清空 → 保存 → toast「内容为空，未保存」+ 卡片数不变
 *  S6 删除流：点击今天卡 → dj-delete-btn 出现 → 删除（confirm 自动接受）→ 卡片消失
 *  S7 明/暗全页截图 + JSON 日志 → .omo/evidence/workbench-diary/
 *
 * 注入形状 = store.saveDiary 实际写入的 DiaryData { entries: toRaw(entries.value) }（非裸数组——
 * T5 曾实证裸数组被 normalizeDiaryData 拒绝（Array.isArray → empty）导致 reload 丢数据，已修复 saveDiary 为对象形状），
 * round-trip 与真实保存会话一致。
 *
 * 与其它 QA 脚本禁止并行（同端口域）。运行：node scripts/qa-diary.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'workbench-diary')
const EVIDENCE_LIGHT_PNG = join(EVIDENCE_DIR, 'task-5-diary-light.png')
const EVIDENCE_DARK_PNG = join(EVIDENCE_DIR, 'task-5-diary-dark.png')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'task-5-qa-log.json')

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

/** 本地日期 'YYYY-MM-DD'（手动 pad，无 UTC 偏移——与 panel todayKey/diaryCore.dateKeyOf 同源）。 */
function localDateKey(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 距今 daysBack 天的本地日期键。 */
function dateOffsetKey(daysBack) {
  const now = new Date()
  return localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack))
}

const todayKey = dateOffsetKey(0)

/** 注入数据：ARRAY 9 条 WorkbenchDiary（今天 + 前 8 天，唯一 id dy_ 前缀，date 降序后第 1 页 8 条 / 第 2 页 1 条）。 */
function buildDiaryEntries() {
  const mk = (id, daysBack, content) => {
    const date = dateOffsetKey(daysBack)
    return {
      id,
      date,
      content,
      createdAt: `${date}T09:00:00.000Z`,
      updatedAt: `${date}T09:00:00.000Z`
    }
  }
  return [
    mk('dy_qa_today', 0, '# 今天\n**第一条** QA 日记'),
    mk('dy_qa_d1', 1, '昨天写的内容'),
    mk('dy_qa_d2', 2, '前天写的内容'),
    mk('dy_qa_d3', 3, '三天前写的内容'),
    mk('dy_qa_d4', 4, '四天前写的内容'),
    mk('dy_qa_d5', 5, '五天前写的内容'),
    mk('dy_qa_d6', 6, '六天前写的内容'),
    mk('dy_qa_d7', 7, '七天前写的内容'),
    mk('dy_qa_d8', 8, '八天前写的内容')
  ]
}

/**
 * 向 IndexedDB easy-web-tab v5 的 store 'diary' 以键 'items' 写入 DiaryData {entries}（与
 * store.saveDiary 的 { entries: toRaw(entries.value) } 形状一致）。在页面上下文执行
 * （应用自身 openIdb 缓存独立，同版本不触发 versionchange）。
 */
async function injectDiaryArray(page, entries) {
  return page.evaluate((payload) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('easy-web-tab', 5)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('diary')) req.result.createObjectStore('diary')
      }
      req.onsuccess = () => {
        const db = req.result
        try {
          const tx = db.transaction('diary', 'readwrite')
          tx.objectStore('diary').put({ entries: payload }, 'items')
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
    })
  }, entries)
}

/** 当前可见的历史卡片 id 列表（排除 dj-card-date- / dj-card-today- / dj-card-preview- 子元素）。 */
async function cardIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="dj-card-"]'))
      .map((el) => el.getAttribute('data-testid') ?? '')
      .filter((tid) => /^dj-card-(?!date-|today-|preview-)/.test(tid))
  )
}

let browser
try {
  await ensureDevServer()
  browser = await chromium.launch()

  // ===================== S1 全新 profile：空态契约 =====================
  await guard('S1) 全新 profile：点击日记本菜单 → dj-empty 可见（空态契约，0 条）', async () => {
    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const pageA = await ctxA.newPage()
    pageA.on('dialog', (d) => d.accept())
    try {
      await pageA.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
      await pageA.waitForSelector('[data-testid="wb-menu-diary"]', { state: 'visible', timeout: 15000 })
      await pageA.locator('[data-testid="wb-menu-diary"]').click()
      await pageA.waitForSelector('[data-testid="dj-empty"]', { state: 'visible', timeout: 15000 })
      const emptyText = (await pageA.locator('[data-testid="dj-empty"]').textContent()).trim()
      const emptyCardCount = (await cardIds(pageA)).length
      const paginationAbsent = (await pageA.locator('[data-testid="dj-page-info"]').count()) === 0
      record(
        'S1) 全新 profile：点击日记本菜单 → dj-empty 可见（空态契约，0 条）',
        emptyText.includes('还没有日记') && emptyCardCount === 0 && paginationAbsent,
        { emptyText, emptyCardCount, paginationAbsent }
      )
    } finally {
      await ctxA.close()
    }
  })

  // ===================== S2 注入 ARRAY → reload → 第 1 页断言 =====================
  const diaryEntries = buildDiaryEntries()
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const pageB = await ctxB.newPage()
  pageB.on('dialog', (d) => d.accept())
  try {
    await pageB.goto(`${devBase}/workbench`, { waitUntil: 'networkidle' })
    await pageB.waitForSelector('[data-testid="wb-menu-diary"]', { state: 'visible', timeout: 15000 })

    let injected = false
    await guard('S2a) 注入 IndexedDB（easy-web-tab v5 / diary / items，ARRAY 9 条含今天）', async () => {
      injected = await injectDiaryArray(pageB, diaryEntries)
      if (injected !== true) throw new Error(`inject 返回 ${injected}`)
      record('S2a) 注入 IndexedDB（easy-web-tab v5 / diary / items，ARRAY 9 条含今天）', true, {
        entries: diaryEntries.length,
        todayId: 'dy_qa_today',
        todayDate: todayKey
      })
    })

    await guard('S2b) reload 后第 1 页恰好 8 张卡片 + 第 1 / 2 页 + next 可用 + prev 禁用', async () => {
      await pageB.reload({ waitUntil: 'networkidle' })
      await pageB.waitForSelector('[data-testid="wb-menu-diary"]', { state: 'visible', timeout: 15000 })
      await pageB.locator('[data-testid="wb-menu-diary"]').click()
      await pageB.waitForSelector('[data-testid="dj-page-info"]', { state: 'visible', timeout: 15000 })
      const p1Cards = await cardIds(pageB)
      const pageInfo = (await pageB.locator('[data-testid="dj-page-info"]').textContent()).trim()
      const nextDisabled = await pageB.locator('[data-testid="dj-page-next"]').isDisabled()
      const prevDisabled = await pageB.locator('[data-testid="dj-page-prev"]').isDisabled()
      record(
        'S2b) reload 后第 1 页恰好 8 张卡片 + 第 1 / 2 页 + next 可用 + prev 禁用',
        injected === true && p1Cards.length === 8 && pageInfo === '第 1 / 2 页' && !nextDisabled && prevDisabled,
        { cardCount: p1Cards.length, pageInfo, nextDisabled, prevDisabled, firstCardIds: p1Cards.slice(0, 3) }
      )
    })

    await guard('S2c) 至少一个 dj-card-date-* 含中文星期（diaryDateLabel 输出「周X」）', async () => {
      const dateTexts = await pageB.locator('[data-testid^="dj-card-date-"]').allTextContents()
      const hasWeekday = dateTexts.some((t) => /周[一二三四五六日]/.test(t))
      record(
        'S2c) 至少一个 dj-card-date-* 含中文星期（diaryDateLabel 输出「周X」）',
        dateTexts.length > 0 && hasWeekday,
        { dateLabels: dateTexts.slice(0, 3), total: dateTexts.length }
      )
    })

    await guard('S2d) 今天条目卡片显示 dj-card-today-dy_qa_today = 今天', async () => {
      const badge = pageB.locator('[data-testid="dj-card-today-dy_qa_today"]')
      const count = await badge.count()
      const text = count === 1 ? (await badge.textContent()).trim() : ''
      const visible = count === 1 && (await badge.isVisible())
      record('S2d) 今天条目卡片显示 dj-card-today-dy_qa_today = 今天', count === 1 && visible && text === '今天', {
        count,
        text
      })
    })

    // ===================== S3 分页 =====================
    await guard('S3a) 点击下一页 → 1 张卡片 + 第 2 / 2 页 + next 禁用 + prev 可用', async () => {
      await pageB.locator('[data-testid="dj-page-next"]').click()
      await pageB.waitForFunction(() => {
        const info = document.querySelector('[data-testid="dj-page-info"]')
        return !!info && info.textContent.includes('第 2 / 2 页')
      }, { timeout: 5000 })
      const cards = await cardIds(pageB)
      const pageInfo = (await pageB.locator('[data-testid="dj-page-info"]').textContent()).trim()
      const nextDisabled = await pageB.locator('[data-testid="dj-page-next"]').isDisabled()
      const prevDisabled = await pageB.locator('[data-testid="dj-page-prev"]').isDisabled()
      record(
        'S3a) 点击下一页 → 1 张卡片 + 第 2 / 2 页 + next 禁用 + prev 可用',
        cards.length === 1 && pageInfo === '第 2 / 2 页' && nextDisabled && !prevDisabled,
        { cardCount: cards.length, pageInfo, nextDisabled, prevDisabled, lastCardIds: cards }
      )
    })

    await guard('S3b) 点击上一页 → 回到 8 张卡片 + 第 1 / 2 页', async () => {
      await pageB.locator('[data-testid="dj-page-prev"]').click()
      await pageB.waitForFunction(() => {
        const info = document.querySelector('[data-testid="dj-page-info"]')
        return !!info && info.textContent.includes('第 1 / 2 页')
      }, { timeout: 5000 })
      const cards = await cardIds(pageB)
      const pageInfo = (await pageB.locator('[data-testid="dj-page-info"]').textContent()).trim()
      record('S3b) 点击上一页 → 回到 8 张卡片 + 第 1 / 2 页', cards.length === 8 && pageInfo === '第 1 / 2 页', {
        cardCount: cards.length,
        pageInfo
      })
    })

    // ===================== S4 保存流（date=今天 默认 → upsert 今天条目）=====================
    const saveContent = '# QA 测试\n今天写的第一篇日记'
    await guard('S4a) 保存流：填 Markdown → dj-char-count 更新 → 保存 → toast 日记已保存 + 今天卡在第 1 页带徽标', async () => {
      const input = pageB.locator('[data-testid="dj-content-input"]')
      await input.waitFor({ state: 'visible', timeout: 5000 })
      await input.fill(saveContent)
      const charCountText = (await pageB.locator('[data-testid="dj-char-count"]').textContent()).trim()
      const expectedCount = `${saveContent.length} 字`
      await pageB.locator('[data-testid="dj-save-btn"]').click()
      await pageB.waitForSelector('.toast:has-text("日记已保存")', { state: 'visible', timeout: 5000 }).catch(() => {})
      const toastVisible = (await pageB.locator('.toast:has-text("日记已保存")').count()) > 0
      const todayCardOnPage = (await pageB.locator('[data-testid="dj-card-dy_qa_today"]').count()) === 1
      const badgeVisible = (await pageB.locator('[data-testid="dj-card-today-dy_qa_today"]').count()) === 1
      const previewText = todayCardOnPage
        ? (await pageB.locator('[data-testid="dj-card-preview-dy_qa_today"]').textContent()).trim()
        : ''
      const cardCount = (await cardIds(pageB)).length
      record(
        'S4a) 保存流：填 Markdown → dj-char-count 更新 → 保存 → toast 日记已保存 + 今天卡在第 1 页带徽标',
        charCountText === expectedCount &&
          toastVisible &&
          todayCardOnPage &&
          badgeVisible &&
          previewText.includes('第一篇'),
        { charCountText, expectedCount, toastVisible, todayCardOnPage, badgeVisible, previewText, cardCount }
      )
    })

    await guard('S4b) 持久化：reload 后今天卡片仍在（含徽标 + 新内容）', async () => {
      // idbPut 事务已 oncomplete（upsertEntry 内 await saveDiary），稍候确保提交再刷新
      await pageB.waitForTimeout(400)
      await pageB.reload({ waitUntil: 'networkidle' })
      await pageB.waitForSelector('[data-testid="wb-menu-diary"]', { state: 'visible', timeout: 15000 })
      await pageB.locator('[data-testid="wb-menu-diary"]').click()
      await pageB.waitForSelector('[data-testid="dj-page-info"]', { state: 'visible', timeout: 10000 }).catch(() => {})
      const todayCardAfter = (await pageB.locator('[data-testid="dj-card-dy_qa_today"]').count()) === 1
      const badgeAfter = (await pageB.locator('[data-testid="dj-card-today-dy_qa_today"]').count()) === 1
      const previewAfter = todayCardAfter
        ? (await pageB.locator('[data-testid="dj-card-preview-dy_qa_today"]').textContent()).trim()
        : ''
      const contentOk = previewAfter.includes('第一篇')
      const pageInfoAfter = (await pageB.locator('[data-testid="dj-page-info"]').count()) === 1
        ? (await pageB.locator('[data-testid="dj-page-info"]').textContent()).trim()
        : '(无分页)'
      record(
        'S4b) 持久化：reload 后今天卡片仍在（含徽标 + 新内容）',
        todayCardAfter && badgeAfter && contentOk,
        { todayCardAfter, badgeAfter, previewAfter, pageInfoAfter }
      )
    })

    // ===================== S5 空保存守卫 =====================
    await guard('S5) 空保存守卫：清空文本 → 保存 → toast 内容为空，未保存 + 卡片数不变', async () => {
      const before = (await cardIds(pageB)).length
      await pageB.locator('[data-testid="dj-content-input"]').fill('')
      await pageB.locator('[data-testid="dj-save-btn"]').click()
      await pageB
        .waitForSelector('.toast:has-text("内容为空，未保存")', { state: 'visible', timeout: 5000 })
        .catch(() => {})
      const toastVisible = (await pageB.locator('.toast:has-text("内容为空，未保存")').count()) > 0
      const after = (await cardIds(pageB)).length
      record('S5) 空保存守卫：清空文本 → 保存 → toast 内容为空，未保存 + 卡片数不变', toastVisible && after === before, {
        toastVisible,
        before,
        after
      })
    })

    // ===================== S6 删除流（optional）=====================
    await guard('S6) 删除流：点击今天卡 → dj-delete-btn 出现 → 删除（confirm 自动接受）→ 卡片消失', async () => {
      const card = pageB.locator('[data-testid="dj-card-dy_qa_today"]')
      if ((await card.count()) !== 1) throw new Error('今天卡片不存在（数据未加载）')
      await card.click()
      const delBtn = pageB.locator('[data-testid="dj-delete-btn"]')
      await delBtn.waitFor({ state: 'visible', timeout: 5000 })
      const before = (await cardIds(pageB)).length
      await delBtn.click()
      await pageB
        .waitForFunction(() => !document.querySelector('[data-testid="dj-card-dy_qa_today"]'), { timeout: 5000 })
        .catch(() => {})
      const after = (await cardIds(pageB)).length
      const gone = (await pageB.locator('[data-testid="dj-card-dy_qa_today"]').count()) === 0
      // 9 条（8 在第 1 页 + 1 在第 2 页）删除今天条目后剩 8 条 → 第 1 页仍满 8 张（第 2 页溢出回填），
      // 但总页数 2→1：断言「卡片消失 + 第 1 / 1 页」，不能断言 after === before - 1（回填使 after 恒等于 before）
      const pageInfo = ((await pageB.locator('[data-testid="dj-page-info"]').textContent()) ?? '').trim()
      record('S6) 删除流：点击今天卡 → dj-delete-btn 出现 → 删除（confirm 自动接受）→ 卡片消失', gone && pageInfo === '第 1 / 1 页', {
        before,
        after,
        gone,
        pageInfo
      })
    })

    // ===================== S7 明/暗全页截图 =====================
    mkdirSync(EVIDENCE_DIR, { recursive: true })
    await pageB.screenshot({ path: EVIDENCE_LIGHT_PNG, fullPage: true })
    const lightSize = existsSync(EVIDENCE_LIGHT_PNG) ? statSync(EVIDENCE_LIGHT_PNG).size : 0
    await pageB.evaluate(() => document.documentElement.classList.add('dark'))
    await pageB.waitForTimeout(200)
    await pageB.screenshot({ path: EVIDENCE_DARK_PNG, fullPage: true })
    const darkSize = existsSync(EVIDENCE_DARK_PNG) ? statSync(EVIDENCE_DARK_PNG).size : 0
    record('S7) 明/暗全页截图写入（证据）', lightSize > 0 && darkSize > 0, {
      light: { path: EVIDENCE_LIGHT_PNG, bytes: lightSize },
      dark: { path: EVIDENCE_DARK_PNG, bytes: darkSize }
    })
  } finally {
    await ctxB.close()
  }

  const totalPassed = results.filter((r) => r.ok).length
  const verdict = totalPassed === results.length && results.length > 0 ? 'PASS' : 'FAIL'
  const qa = {
    command: 'node scripts/qa-diary.mjs',
    result: `${verdict} (${totalPassed}/${results.length})`,
    browser: 'chromium (playwright, headless)',
    dev_server: `vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
    injection: 'page.evaluate → IndexedDB easy-web-tab v5 / diary / items（DiaryData {entries} 形状，与修复后 store.saveDiary 一致）',
    evidence_light_png: EVIDENCE_LIGHT_PNG,
    evidence_dark_png: EVIDENCE_DARK_PNG,
    assertions: results
  }
  writeFileSync(
    EVIDENCE_LOG,
    JSON.stringify({ task: 'workbench-diary: 日记本面板 QA（S1-S7：空态/注入 round-trip/分页/保存/空保存守卫/删除/截图）', qa }, null, 2),
    'utf8'
  )
  console.log(`[qa] QA evidence log written: ${EVIDENCE_LOG}`)
  if (verdict !== 'PASS') process.exitCode = 1
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  if (browser) await browser.close().catch(() => {})
} finally {
  if (browser) await browser.close()
  stopDevServer()
}
