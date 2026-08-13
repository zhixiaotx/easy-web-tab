// 临时 QA：Todo 22 数据时光机恢复入口（AppSettingsDialog 工作台设置 tab）
// 复用已运行的 dev server（16719-16723）否则自起 vite；验证：
//   a) 无快照时空态渲染（wb-snapshot-empty，列表不存在）
//   b) 进入 /workbench 自动快照后：设置弹窗列表 1 行（wb-snapshot-<id> + 自动快照来源）
//   c) 修改待办（store.addTodo）→ 立即备份（wb-snapshot-now）→ 快照 2 份（列表 2 行）
//   d) 恢复更早（自动）快照 → confirm 接受 → 待办回退到备份态 + 快照列表裁剪为 1 份（更新的被清）
// 结果写入 .omo/evidence/workbench-improvements/task-22-workbench-improvements.log
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const LOG_PATH = path.join(root, '.omo', 'evidence', 'workbench-improvements', 'task-22-workbench-improvements.log')
const SHOT_PATH = path.join(root, '.omo', 'evidence', 'workbench-improvements', 'task-22-workbench-improvements.png')

async function httpOk(port) {
  try {
    const res = await fetch(`http://localhost:${port}/`)
    const text = await res.text()
    return res.ok && text.includes('id="app"')
  } catch {
    return false
  }
}

function startVite(port) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    let out = ''
    let settled = false
    let timer
    const done = (res) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve(res)
      }
    }
    child.stdout.on('data', (d) => {
      out += d.toString()
      const plain = out.replace(/\u001b\[[0-9;]*m/g, '')
      if (plain.includes('Local:')) done({ ok: true, port, child })
    })
    child.stderr.on('data', () => {})
    child.on('exit', (code) => done({ ok: false, port, code }))
    child.on('error', (e) => done({ ok: false, port, error: e.message }))
    timer = setTimeout(() => done({ ok: false, port, timeout: true }), 15000)
  })
}

const PINIA_STORE_BOOTSTRAP = `
  const mod = await import('/src/stores/workbenchTodos.ts')
  const appEl = document.querySelector('#app')
  const app = appEl ? appEl.__vue_app__ : null
  let pinia = null
  if (app) {
    const gp = app.config && app.config.globalProperties
    if (gp && gp.$pinia) {
      pinia = gp.$pinia
    } else {
      const provides = app._context ? app._context.provides : null
      if (provides) {
        for (const k of [...Object.keys(provides), ...Object.getOwnPropertySymbols(provides)]) {
          if (String(k).includes('pinia')) { pinia = provides[k]; break }
        }
      }
    }
  }
  if (!pinia) return { error: 'pinia not found' }
  const store = mod.useWorkbenchTodosStore(pinia)
`

const results = []
function record(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: JSON.stringify(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`)
}

let browser
let server
let baseUrl
try {
  let reused = false
  for (const port of [16719, 16720, 16721, 16722, 16723]) {
    if (await httpOk(port)) {
      reused = true
      baseUrl = `http://localhost:${port}`
      break
    }
    const s = await startVite(port)
    if (s.ok) {
      server = s
      baseUrl = `http://localhost:${port}`
      break
    }
  }
  if (!baseUrl) throw new Error('vite dev 起不来（16719-16723 均不可用）')
  console.log(`[qa] dev server ${reused ? '复用' : '自起'} @ ${baseUrl}`)

  browser = await chromium.launch()
  const page = await browser.newPage()

  // ---------- a) 空态：全新 profile 无快照 → 设置弹窗工作台 tab 显示「暂无快照」 ----------
  await page.goto(`${baseUrl}/`, { waitUntil: 'load' })
  await page.click('button.btn-help[title="设置"]')
  await page.click('button.tab-btn:has-text("工作台设置")')
  await page.waitForSelector('[data-testid="wb-snapshot-empty"]', { timeout: 8000 })
  const emptyOk = (await page.locator('[data-testid="wb-snapshot-empty"]').count()) === 1
  const noListOnEmpty = (await page.locator('[data-testid="wb-snapshot-list"]').count()) === 0
  record('a) 无快照时空态渲染（暂无快照，无列表）', emptyOk && noListOnEmpty, { emptyOk, noListOnEmpty })
  // 关掉设置弹窗
  await page.click('button.close-btn')

  // ---------- b) 进入 /workbench 自动快照 → 设置弹窗列表 1 行 ----------
  await page.goto(`${baseUrl}/workbench`, { waitUntil: 'load' })
  const auto = await page.evaluate(async () => {
    const { idbGet } = await import('/src/composables/useIdb.ts')
    let list = []
    for (let i = 0; i < 40; i++) {
      list = (await idbGet('snapshots')) ?? []
      if (list.length > 0) break
      await new Promise((r) => setTimeout(r, 250))
    }
    const s = list[0]
    return { count: list.length, id: s?.id ?? null, source: s?.source ?? null, createdAt: s?.createdAt ?? null }
  })
  record('b-1) 进入工作台自动快照 1 份', auto.count === 1 && auto.id && auto.source === 'auto', auto)

  await page.goto(`${baseUrl}/`, { waitUntil: 'load' })
  await page.click('button.btn-help[title="设置"]')
  await page.click('button.tab-btn:has-text("工作台设置")')
  await page.waitForSelector('[data-testid="wb-snapshot-list"]', { timeout: 8000 })
  const listCount1 = await page.locator('[data-testid^="wb-snapshot-restore-"]').count()
  const rowVisible = await page.locator(`[data-testid="wb-snapshot-${auto.id}"]`).count()
  const sourceText = await page.locator(`[data-testid="wb-snapshot-${auto.id}"] .wb-snapshot-source`).textContent()
  record('b-2) 设置弹窗列表 1 行且来源=自动快照', listCount1 === 1 && rowVisible === 1 && sourceText === '自动快照', {
    listCount1,
    rowVisible,
    sourceText
  })
  await page.click('button.close-btn')

  // ---------- c) 修改待办（addTodo）→ 立即备份 → 快照 2 份 ----------
  const MARKER = `QA-RESTORE-MARKER-${Date.now()}`
  const added = await page.evaluate(async ({ boot, marker }) => {
    const { idbGet } = await import('/src/composables/useIdb.ts')
    await (0, eval)(`(async () => {
      ${boot}
      await store.addTodo({ title: ${JSON.stringify(marker)}, priority: 'medium' })
    })()`)
    const todos = (await idbGet('todos')) ?? []
    return { markerInIdb: todos.some((t) => t.title === marker) }
  }, { boot: PINIA_STORE_BOOTSTRAP, marker: MARKER })
  record('c-1) 修改待办后写入 IDB', added.markerInIdb === true, added)

  await page.click('button.btn-help[title="设置"]')
  await page.click('button.tab-btn:has-text("工作台设置")')
  await page.waitForSelector('[data-testid="wb-snapshot-list"]', { timeout: 8000 })
  await page.click('[data-testid="wb-snapshot-now"]')
  // 等待 toast「已创建快照」+ 列表更新为 2 行
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="wb-snapshot-restore-"]').length === 2,
    undefined,
    { timeout: 8000 }
  )
  const ids2 = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="wb-snapshot-restore-"]')).map((el) =>
      el.getAttribute('data-testid').replace('wb-snapshot-restore-', '')
    )
  )
  const idb2 = await page.evaluate(async () => {
    const { idbGet } = await import('/src/composables/useIdb.ts')
    return ((await idbGet('snapshots')) ?? []).map((s) => ({ id: s.id, source: s.source }))
  })
  const manualSource = await page.locator(`[data-testid="wb-snapshot-${ids2[0]}"] .wb-snapshot-source`).textContent()
  record(
    'c-2) 立即备份后快照 2 份（列表 2 行 + IDB 2 份，最新为手动）',
    ids2.length === 2 && idb2.length === 2 && idb2.some((s) => s.source === 'manual') && idb2.some((s) => s.source === 'auto'),
    { ids2, idb2, manualSource }
  )

  // 确定两份的先后：list 已按 createdAt 降序 → ids2[0] 为最新（手动），ids2[1] 为更早（自动）
  const olderId = ids2[1]
  const newerId = ids2[0]
  // 屏幕截图（恢复前：列表 2 行）
  await page.screenshot({ path: SHOT_PATH, fullPage: false })

  // ---------- d) 恢复更早快照 → confirm 接受 → 待办回退 + 列表裁剪 1 份 ----------
  let confirmMsg = ''
  page.once('dialog', async (dialog) => {
    confirmMsg = dialog.message()
    await dialog.accept()
  })
  await page.click(`[data-testid="wb-snapshot-restore-${olderId}"]`)
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="wb-snapshot-restore-"]').length === 1,
    undefined,
    { timeout: 8000 }
  )
  const after = await page.evaluate(async ({ marker }) => {
    const { idbGet } = await import('/src/composables/useIdb.ts')
    const todos = (await idbGet('todos')) ?? []
    const snaps = (await idbGet('snapshots')) ?? []
    return {
      markerGone: !todos.some((t) => t.title === marker),
      snapCount: snaps.length,
      snapIds: snaps.map((s) => s.id),
      listRows: document.querySelectorAll('[data-testid^="wb-snapshot-restore-"]').length
    }
  }, { marker: MARKER })
  record(
    'd) 恢复更早快照：待办回退 + 快照裁剪为 1 份（更新的被清）',
    after.markerGone === true &&
      after.snapCount === 1 &&
      after.snapIds[0] === olderId &&
      after.listRows === 1 &&
      after.snapIds[0] !== newerId,
    { ...after, olderId, newerId, confirmShown: confirmMsg.length > 0 }
  )

  // 恢复后截图（列表 1 行）与最终截图
  await page.screenshot({ path: SHOT_PATH, fullPage: false })

  // 清理：清掉 snapshots + todos，不留残留
  await page.evaluate(async () => {
    const { idbClear } = await import('/src/composables/useIdb.ts')
    await idbClear('snapshots')
    await idbClear('todos')
  })

  await browser.close()
} catch (err) {
  record('QA 脚本异常', false, { message: err.message })
  if (browser) await browser.close().catch(() => {})
} finally {
  if (server) server.child?.kill()
}

const passed = results.filter((r) => r.ok).length
const summary = { suite: 'task-22-workbench-improvements', passed, failed: results.length - passed, results }
console.log(`\n${passed}/${results.length} passed`)
mkdirSync(path.dirname(LOG_PATH), { recursive: true })
writeFileSync(LOG_PATH, JSON.stringify(summary, null, 2) + '\n', 'utf8')
if (passed !== results.length) process.exit(1)

