/**
 * QA: 工作台设置扩展 —— workbenchCity / workbenchSidebarCollapsed（Todo 11 / workbench-improvements）
 *
 * Playwright 方案：后台启动 vite dev（端口 16718 起）→ 打开 /（HomeView，含设置弹窗）→
 * 走真实 UI：⚙️ 设置 → 工作台设置 tab → 城市输入框（data-testid=wb-city-input）输入「北京」→
 * blur 提交 → 关闭 → 刷新 → 断言 store 状态 + IDB 持久化 + 备份导出 JSON 含 workbenchCity。
 * failure 场景：清空城市刷新不复活旧值；非法值（数字 / 空字符串）写 IDB → 回退未配置不抛错。
 * 附带断言 workbenchSidebarCollapsed 经 setter → 刷新 → 导出含该字段。
 * 断言清单与 pass/fail 写入 .omo/evidence/workbench-improvements/task-11-workbench-improvements.json。
 *
 * 运行：node scripts/qa-settings-city.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_PATH = join(ROOT, '.omo', 'evidence', 'workbench-improvements', 'task-11-workbench-improvements.json')

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

/** 判断某端口是否为 vite dev server。 */
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
  // 1) 复用已在跑的 vite dev server（16718 或相邻端口）
  for (let p = 16718; p <= 16726; p++) {
    if (await isViteDevAt(p)) {
      devBase = `http://localhost:${p}`
      console.log(`[dev] reuse running vite dev server at ${devBase}`)
      return
    }
  }
  // 2) 否则找空闲端口自起 dev server
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

async function main() {
  console.log(`[qa] settings workbenchCity / workbenchSidebarCollapsed (Todo 11)`)
  await ensureDevServer()
  const browser = await chromium.launch()
  const results = []
  const push = (name, pass, detail) => results.push({ name, pass, detail: String(detail) })
  try {
    const page = await browser.newPage()

    // 读取 settings store 实时状态（Pinia 实例已在应用中激活，取同一实例）
    const storeState = (prop) =>
      page.evaluate(async (p) => {
        const { useAppSettingsStore } = await import('/src/stores/settings.ts')
        const store = useAppSettingsStore()
        const val = store[p]
        return typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val)
      }, prop)

    // ============ HAPPY: 设置城市「北京」→ 关闭 → 刷新 → 持久化 ============
    await page.goto(`${devBase}/`, { waitUntil: 'load' })
    await page.waitForTimeout(1500) // 等 store 初始化完成

    // 打开设置弹窗（HomeView ⚙️ 按钮，title="设置"）
    await page.locator('button[title="设置"]').click()
    await page.locator('.manager').waitFor({ state: 'visible' })
    push('A1 open settings dialog', true, 'HomeView ⚙️ → .manager visible')

    // 切到工作台设置 tab
    await page.getByRole('tab', { name: '工作台设置' }).click()
    await page.locator('[data-testid="wb-city-input"]').waitFor({ state: 'visible' })
    push('A2 wb tab + city input visible', true, 'data-testid=wb-city-input found')

    // 输入北京并失焦提交（@change → setWorkbenchCity → persist）
    const cityInput = page.locator('[data-testid="wb-city-input"]')
    await cityInput.fill('北京')
    await cityInput.blur()
    await page.waitForTimeout(400) // 等 IDB 写入落盘

    const cityAfterInput = await storeState('workbenchCity')
    push('A3 store.workbenchCity === 北京 after input', cityAfterInput === '北京', `got=${cityAfterInput}`)

    // 关闭弹窗
    await page.locator('.manager .close-btn').click()
    await page.locator('.manager').waitFor({ state: 'detached' })
    push('A4 close settings dialog', true, '.manager detached')

    // 刷新页面 → 断言三处持久化
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(1500)
    const cityAfterReload = await storeState('workbenchCity')
    push('A5 store.workbenchCity survives reload', cityAfterReload === '北京', `got=${cityAfterReload}`)

    const idb = await page.evaluate(async () => {
      const { idbGet, idbExportAll } = await import('/src/composables/useIdb.ts')
      const settings = await idbGet('settings')
      const exported = await idbExportAll()
      return {
        idbCity: settings && settings.workbenchCity,
        exportCity: exported.settings && exported.settings.workbenchCity,
        version: exported.version
      }
    })
    push('A6 IDB settings.workbenchCity === 北京', idb.idbCity === '北京', `got=${JSON.stringify(idb.idbCity)}`)
    push('A7 export JSON settings.workbenchCity === 北京', idb.exportCity === '北京', `got=${JSON.stringify(idb.exportCity)}`)
    push('A8 export version is v5 (no bump)', idb.version === 5, `got=${idb.version}`)

    // ============ SIDEBAR: setWorkbenchSidebarCollapsed(true) → 刷新 → 导出含该字段 ============
    const collapsedSet = await page.evaluate(async () => {
      const { useAppSettingsStore } = await import('/src/stores/settings.ts')
      const store = useAppSettingsStore()
      store.setWorkbenchSidebarCollapsed(true)
      return store.workbenchSidebarCollapsed
    })
    push('B1 setWorkbenchSidebarCollapsed(true) reflects in state', collapsedSet === true, `got=${collapsedSet}`)
    await page.waitForTimeout(400)
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(1500)
    const collapsedAfterReload = await storeState('workbenchSidebarCollapsed')
    push('B2 workbenchSidebarCollapsed survives reload', collapsedAfterReload === 'true', `got=${collapsedAfterReload}`)
    const idb2 = await page.evaluate(async () => {
      const { idbGet, idbExportAll } = await import('/src/composables/useIdb.ts')
      const settings = await idbGet('settings')
      const exported = await idbExportAll()
      return {
        idb: settings && settings.workbenchSidebarCollapsed,
        exp: exported.settings && exported.settings.workbenchSidebarCollapsed
      }
    })
    push('B3 IDB workbenchSidebarCollapsed === true', idb2.idb === true, `got=${JSON.stringify(idb2.idb)}`)
    push('B4 export JSON workbenchSidebarCollapsed === true', idb2.exp === true, `got=${JSON.stringify(idb2.exp)}`)

    // ============ FAILURE A: 清空城市 → 刷新不复活旧值 ============
    await page.locator('button[title="设置"]').click()
    await page.locator('.manager').waitFor({ state: 'visible' })
    await page.getByRole('tab', { name: '工作台设置' }).click()
    await page.locator('[data-testid="wb-city-input"]').waitFor({ state: 'visible' })
    const cityInput2 = page.locator('[data-testid="wb-city-input"]')
    await cityInput2.fill('')
    await cityInput2.blur()
    await page.waitForTimeout(400)
    await page.locator('.manager .close-btn').click()
    await page.locator('.manager').waitFor({ state: 'detached' })
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(1500)
    const cityAfterClear = await storeState('workbenchCity')
    push('C1 cleared city: store.workbenchCity === undefined after reload (不复活)', cityAfterClear === 'undefined', `got=${cityAfterClear}`)
    const idb3 = await page.evaluate(async () => {
      const { idbGet } = await import('/src/composables/useIdb.ts')
      const settings = await idbGet('settings')
      return settings && settings.workbenchCity
    })
    push('C2 cleared city: IDB workbenchCity unset', idb3 === undefined, `got=${JSON.stringify(idb3)}`)

    // ============ FAILURE B: 非法值（数字 / 空字符串）写入 IDB → 刷新回退未配置不抛错 ============
    await page.evaluate(async () => {
      const { idbGet, idbPut } = await import('/src/composables/useIdb.ts')
      const cur = (await idbGet('settings')) || {}
      await idbPut('settings', { ...cur, workbenchCity: 123 })
    })
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(1500)
    const cityAfterIllegal = await storeState('workbenchCity')
    push('D1 illegal value 123: store.workbenchCity === undefined (回退未配置)', cityAfterIllegal === 'undefined', `got=${cityAfterIllegal}`)
    const pageAlive = await page.locator('body').isVisible()
    push('D2 page still functional after illegal value (不抛错)', pageAlive === true, 'body visible')

    // 空字符串直接写 IDB（数据层等价于清除）：不复活
    await page.evaluate(async () => {
      const { idbGet, idbPut } = await import('/src/composables/useIdb.ts')
      const cur = (await idbGet('settings')) || {}
      await idbPut('settings', { ...cur, workbenchCity: '' })
    })
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(1500)
    const cityAfterEmpty = await storeState('workbenchCity')
    push('D3 IDB workbenchCity="": store stays unset (空串=未配置)', cityAfterEmpty === 'undefined', `got=${cityAfterEmpty}`)

    const passed = results.filter((a) => a.pass).length
    const verdict = passed === results.length && results.length > 0 ? 'PASS' : 'FAIL'
    console.log(`[qa] assertions: ${passed}/${results.length} passed`)
    for (const a of results) console.log(`  ${a.pass ? 'PASS' : 'FAIL'} ${a.name}${a.detail ? ' | ' + a.detail : ''}`)

    const qa = {
      command: 'node scripts/qa-settings-city.mjs',
      result: `${verdict} (${passed}/${results.length})`,
      browser: 'chromium (playwright, headless)',
      dev_server: `vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
      scenarios: {
        happy: '设置弹窗 → 工作台设置 tab → 城市输入框输入「北京」→ blur 提交 → 关闭 → 刷新 → store/IDB/备份导出 JSON 均含 workbenchCity=北京；workbenchSidebarCollapsed 经 setter 刷新后 IDB/导出含 true；导出仍为 v5 不升版本',
        failure: '清空城市刷新不复活旧值；非法值（数字 123 / 空字符串）写入 IDB 后刷新回退未配置不抛错、页面仍可用'
      },
      assertions: results
    }
    mkdirSync(dirname(EVIDENCE_PATH), { recursive: true })
    writeFileSync(EVIDENCE_PATH, JSON.stringify({ task: 'workbench-improvements: Todo 11 - 工作台城市与侧栏折叠态配置', qa }, null, 2), 'utf8')
    console.log(`[qa] evidence written: ${EVIDENCE_PATH}`)
    if (verdict !== 'PASS') process.exitCode = 1
  } finally {
    await browser.close()
    stopDevServer()
  }
}

main().catch((err) => {
  console.error('[qa] fatal:', err)
  stopDevServer()
  process.exit(1)
})
