/**
 * QA: 天气卡 WeatherCard + useWeather（Todo 15 / workbench-improvements）
 *
 * Playwright 方案：后台启动 vite dev（端口 16718 起）→ 打开 /workbench →
 * page.evaluate 动态 import WeatherCard.vue 并挂载到实时 Pinia 实例（getActivePinia，
 * 复用应用同一 settingsStore）→ 全程离线零真实网络：page.route 注入固定 fixture
 * （geocode 返回北京坐标，forecast 返回固定 temp/code/humidity）。
 *
 * 场景：
 *   failure A — workbenchCity 未配置 → 卡片固定显示「未设置城市」+「去设置」按钮，无报错无 toast；
 *   happy — setWorkbenchCity('北京') → 卡片显示 29°C / ⛅ / 湿度 55% → 截图存 evidence；
 *   failure B — forecast 路由 abort（mock 断网）→ 保持占位（--°C）不报错无 toast。
 *
 * 证据：task-15-workbench-improvements.png（happy 渲染）+ task-15-workbench-improvements.log（断言摘要）
 *
 * 运行：node scripts/qa-weather-card.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'workbench-improvements')
const EVIDENCE_PNG = join(EVIDENCE_DIR, 'task-15-workbench-improvements.png')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'task-15-workbench-improvements.log')

// 固定 fixture（离线 mock，零真实网络）
const GEO_FIXTURE = { results: [{ latitude: 39.9042, longitude: 116.4074, name: '北京' }] }
const FORECAST_FIXTURE = {
  current: {
    temperature_2m: 28.5,
    relative_humidity_2m: 55,
    weather_code: 1,
    apparent_temperature: 26.3,
    wind_speed_10m: 12.5,
    is_day: 1
  },
  daily: {
    sunrise: ['2026-08-16T05:32:00+08:00'],
    sunset: ['2026-08-16T19:18:00+08:00'],
    temperature_2m_max: [32.1],
    temperature_2m_min: [21.5],
    uv_index_max: [7.2]
  }
}

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

/**
 * 解析 vite 优化依赖 URL（bare specifier 在 page.evaluate 裸 import 无法解析，
 * 需用 vite 已重写后的绝对 URL 才能在浏览器模块图中命中同一模块实例）。
 */
async function resolveDeps(base) {
  const main = await (await fetch(`${base}/src/main.ts`)).text()
  const vueUrl = (main.match(/from\s+"(\/node_modules\/\.vite\/deps\/vue\.js[^"]*)"/) || [])[1]
  const piniaUrl = (main.match(/from\s+"(\/node_modules\/\.vite\/deps\/pinia\.js[^"]*)"/) || [])[1]
  if (!vueUrl || !piniaUrl) throw new Error('cannot resolve vite dep URLs from /src/main.ts')
  return { vueUrl, piniaUrl }
}

/**
 * 在页面上动态挂载 WeatherCard（复用应用同一 Pinia 实例，确保共享 settingsStore）。
 * vue/pinia 经 vite 重写后的 URL 动态 import，保证与应用是同一模块实例。
 */
async function mountWeatherCard(page, deps) {
  await page.evaluate(
    async ({ vueUrl, piniaUrl }) => {
      if (document.getElementById('qa-wx-host')) return
      const { createApp, h } = await import(vueUrl)
      const { getActivePinia } = await import(piniaUrl)
      const { default: WeatherCard } = await import('/src/components/workbench/WeatherCard.vue')
      const pinia = getActivePinia()
      if (!pinia) throw new Error('no active pinia found — store sharing impossible')
      const el = document.createElement('div')
      el.id = 'qa-wx-host'
      el.style.padding = '24px'
      document.body.appendChild(el)
      const app = createApp({ render: () => h(WeatherCard) })
      app.use(pinia)
      app.mount(el)
    },
    deps
  )
}

async function main() {
  console.log(`[qa] WeatherCard / useWeather (Todo 15)`)
  await ensureDevServer()
  const browser = await chromium.launch()
  const results = []
  const push = (name, pass, detail) => results.push({ name, pass, detail: String(detail) })
  const pageErrors = []
  let geocodeHits = 0
  let forecastHits = 0
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 640 } })
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    // ============ 离线 mock：全部 open-meteo 请求注入固定 fixture ============
    await page.route('https://geocoding-api.open-meteo.com/**', (route) => {
      geocodeHits++
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GEO_FIXTURE) })
    })
    await page.route('https://api.open-meteo.com/**', (route) => {
      forecastHits++
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FORECAST_FIXTURE) })
    })

    // ============ 打开 /workbench → 挂载天气卡（实时 store 实例） ============
    await page.goto(`${devBase}/workbench`, { waitUntil: 'load' })
    await page.waitForTimeout(1500) // 等 store 初始化完成
    const deps = await resolveDeps(devBase)
    await mountWeatherCard(page, deps)
    await page.locator('#qa-wx-host [data-testid="wx-card"]').waitFor({ state: 'visible' })
    push('A1 WeatherCard mounted', true, 'wx-card visible on /workbench')

    // ============ FAILURE A: 未配置城市 → 固定占位 + 去设置 ============
    const placeholderText = await page.locator('#qa-wx-host .wx-placeholder-text').textContent()
    push('A2 unconfigured → 「未设置城市」placeholder', placeholderText === '未设置城市', `got=${placeholderText}`)
    const setupBtn = await page.locator('#qa-wx-host [data-testid="wx-setup-btn"]').isVisible()
    push('A3 unconfigured → 「去设置」button visible', setupBtn === true, `testid=wx-setup-btn`)
    const noToast1 = (await page.locator('.toast-container .toast').count()) === 0
    push('A4 unconfigured → no toast', noToast1 === true, '.toast-container .toast count=0')

    // ============ HAPPY: 配置城市「北京」→ 显示温度/emoji/湿度 ============
    const setCity = await page.evaluate(async () => {
      const { useAppSettingsStore } = await import('/src/stores/settings.ts')
      const store = useAppSettingsStore()
      store.setWorkbenchCity('北京')
      return store.workbenchCity
    })
    push('B1 setWorkbenchCity(北京) reflected in store', setCity === '北京', `got=${setCity}`)

    const temp = page.locator('#qa-wx-host [data-testid="wx-temp"]')
    await temp.waitFor({ state: 'visible', timeout: 8000 })
    const tempText = (await temp.textContent()) || ''
    push('B2 temperature shown (28.5 → 29°C)', tempText === '29°C', `got=${tempText}`)

    const emojiText = (await page.locator('#qa-wx-host [data-testid="wx-emoji"]').textContent()) || ''
    push('B3 weather emoji shown (code=1 → ⛅ 多云)', emojiText === '⛅', `got=${emojiText}`)

    const humidityText = (await page.locator('#qa-wx-host [data-testid="wx-humidity"]').textContent()) || ''
    push('B4 humidity shown (55%)', humidityText.includes('55'), `got=${humidityText}`)

    const cityText = (await page.locator('#qa-wx-host [data-testid="wx-city"]').textContent()) || ''
    push('B5 city label shown', cityText === '北京', `got=${cityText}`)

    // 新增字段断言（B6-B14）
    const feelsLikeText = (await page.locator('#qa-wx-host [data-testid="wx-feels"]').textContent()) || ''
    push('B6 feelsLike shown (26.3 → 26°C)', feelsLikeText === '体感 26°C', `got=${feelsLikeText}`)

    const descText = (await page.locator('#qa-wx-host [data-testid="wx-desc"]').textContent()) || ''
    push('B7 weather desc shown (code=1, isDay=1 → 晴间多云)', descText === '晴间多云', `got=${descText}`)

    const windText = (await page.locator('#qa-wx-host [data-testid="wx-wind"]').textContent()) || ''
    push('B8 wind speed shown (12.5 km/h)', windText.includes('12.5'), `got=${windText}`)

    const sunriseText = (await page.locator('#qa-wx-host [data-testid="wx-sunrise"]').textContent()) || ''
    push('B9 sunrise shown (HH:MM format)', sunriseText.includes('05:32') || sunriseText.includes('5:32'), `got=${sunriseText}`)

    const sunsetText = (await page.locator('#qa-wx-host [data-testid="wx-sunset"]').textContent()) || ''
    push('B10 sunset shown (HH:MM format)', sunsetText.includes('19:18') || sunsetText.includes('7:18'), `got=${sunsetText}`)

    const highLowText = (await page.locator('#qa-wx-host [data-testid="wx-highlow"]').textContent()) || ''
    push('B11 high/low shown (32°/22°)', highLowText.includes('32') && highLowText.includes('22'), `got=${highLowText}`)

    const uvText = (await page.locator('#qa-wx-host [data-testid="wx-uv"]').textContent()) || ''
    push('B12 UV index shown (7.2)', uvText.includes('7.2'), `got=${uvText}`)

    // fixture 命中计数：确认数据确实来自 mock 而非真实网络
    push('B13 geocode fixture hit', geocodeHits >= 1, `hits=${geocodeHits}`)
    push('B14 forecast fixture hit', forecastHits >= 1, `hits=${forecastHits}`)

    // 证据截图：happy 渲染
    mkdirSync(EVIDENCE_DIR, { recursive: true })
    await page.locator('#qa-wx-host').screenshot({ path: EVIDENCE_PNG })
    push('B15 evidence screenshot written', true, EVIDENCE_PNG)

    // ============ FAILURE B: mock 断网（forecast abort）→ 保持占位不报错 ============
    await page.route('https://api.open-meteo.com/**', (route) => route.abort()) // 最新注册优先命中
    await page.evaluate(async () => {
      const { useAppSettingsStore } = await import('/src/stores/settings.ts')
      const store = useAppSettingsStore()
      store.setWorkbenchCity('上海')
    })
    const loading = page.locator('#qa-wx-host [data-testid="wx-loading"]')
    await loading.waitFor({ state: 'visible', timeout: 12000 })
    await page.waitForFunction(() => {
      const el = document.querySelector('#qa-wx-host [data-testid="wx-loading"]')
      return el && el.textContent === '--°C'
    }, { timeout: 12000 })
    const loadingText = (await loading.textContent()) || ''
    push('C1 aborted fetch → placeholder --°C', loadingText === '--°C', `got=${loadingText}`)
    const noToast2 = (await page.locator('.toast-container .toast').count()) === 0
    push('C2 aborted fetch → no toast', noToast2 === true, '.toast-container .toast count=0')
    push('C3 no pageerror across whole session', pageErrors.length === 0, `errors=${pageErrors.length}`)

    const passed = results.filter((a) => a.pass).length
    const verdict = passed === results.length && results.length > 0 ? 'PASS' : 'FAIL'
    console.log(`[qa] assertions: ${passed}/${results.length} passed`)
    for (const a of results) console.log(`  ${a.pass ? 'PASS' : 'FAIL'} ${a.name}${a.detail ? ' | ' + a.detail : ''}`)

    // 文字摘要追加到 evidence log
    const logLines = [
      `task: workbench-improvements: Todo 15 - 天气卡 useWeather + WeatherCard`,
      `plan_ref: .omo/plans/workbench-improvements.md lines 214-220`,
      `date: ${new Date().toISOString()}`,
      `verdict: ${verdict} (${passed}/${results.length})`,
      `command: node scripts/qa-weather-card.mjs`,
      `browser: chromium (playwright, headless)`,
      `dev_server: vite on ${devBase} (${startedByUs ? 'started by script' : 'reused existing'})`,
      `network: fully offline — page.route mocks (geocoding-api.open-meteo.com/** + api.open-meteo.com/**)`,
      `scenarios:`,
      `  failure A — workbenchCity 未配置 → 卡片固定显示「未设置城市」+「去设置」按钮，无报错无 toast`,
      `  happy — setWorkbenchCity('北京') → 卡片显示 29°C / ⛅ / 湿度 55%（fixture 命中，见 B6/B7）→ 截图 ${EVIDENCE_PNG}`,
      `  failure B — forecast 路由 abort（mock 断网）→ 保持占位（--°C）不报错无 toast`,
      `assertions:`,
      ...results.map((a) => `  ${a.pass ? 'PASS' : 'FAIL'} ${a.name}${a.detail ? ' | ' + a.detail : ''}`)
    ]
    writeFileSync(EVIDENCE_LOG, logLines.join('\n') + '\n', 'utf8')
    console.log(`[qa] evidence written: ${EVIDENCE_PNG} + ${EVIDENCE_LOG}`)
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
