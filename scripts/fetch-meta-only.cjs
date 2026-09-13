// 独立的「站点元数据」同源代理服务（专给 Nginx 部署用）
//
// 用途：
//   当你用 Nginx 托管 dist/（纯静态）时，浏览器请求 /api/fetch-meta 会被
//   Nginx 的 location 反代到本机 127.0.0.1:16720，由本 Node 进程代发真实抓取
//   请求（国内服务器出网，绕开浏览器→海外 jina.ai/allorigins 链路），
//   解析 <title> / og:description / favicon 后返回 JSON。
//
//   逻辑与 scripts/serve-with-rewrites.cjs 的 handleFetchMeta 完全一致：
//     - 自动跟随 3xx 重定向与 <meta http-equiv=refresh> 软跳转（最多 5 跳）
//     - 收齐字节后按 content-encoding 整体解压（gzip/br/deflate），避免乱码
//     - metascraper 若已安装则优先提准（动态 import，未装自动回退正则解析）
//     - 反爬站点（JS 壳）走 Playwright 兜底（未装自动忽略，保留 HTTP 结果）
//
//   前端调用契约（与集成版一致）：
//     POST /api/fetch-meta
//       Header Content-Type: application/json
//       Body   { "url": "https://example.com" }
//     Response { "title": "...", "description": "...", "icon": "..." }
//       —— 失败时仍返回 200 + { error: "..." }（前端据此空值处理，不弹硬错误）
//
// 启动：
//   node scripts/fetch-meta-only.cjs                  # 默认 127.0.0.1:16720
//   FETCH_META_HOST=0.0.0.0 FETCH_META_PORT=16720 \
//     node scripts/fetch-meta-only.cjs
//
// 建议 pm2 常驻（同机 Nginx 反代）：
//   pm2 start scripts/fetch-meta-only.cjs --name easy-fetch-meta
//
// Nginx 对应反代段（与 webdav 代理并存，互不冲突）：
//   location = /api/fetch-meta {
//       proxy_pass http://127.0.0.1:16720;
//       proxy_http_version 1.1;
//       proxy_set_header Host $host;
//       proxy_set_header X-Real-IP $remote_addr;
//       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
//       proxy_set_header X-Forwarded-Proto $scheme;
//       proxy_read_timeout 30s;
//   }

const http = require('http')
const https = require('https')
const zlib = require('zlib')
const { URL } = require('url')

const HOST = process.env.FETCH_META_HOST || '127.0.0.1'
const PORT = Number(process.env.FETCH_META_PORT) || 16720

const MAX_META_BYTES = 512 * 1024
const META_TIMEOUT_MS = 8000
// UA 用真实浏览器标识，降低机房 IP 被反爬甩挑战页（无 <title>）的概率
const META_UA = process.env.META_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const MAX_REDIRECTS = 5

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => {
      // 防御：单请求 >32MB 直接拒绝
      if (Buffer.concat(chunks).length > 32 * 1024 * 1024) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8') || ''))
    req.on('error', reject)
  })
}

// ===== 元数据解析（正则兜底 + metascraper 增强） =====

// metascraper（ESM-only）在 CJS 内通过动态 import 加载，并缓存实例避免每次请求重复加载
let _metaScraper = null
async function loadMetascraper() {
  if (_metaScraper) return _metaScraper
  const metascraper = (await import('metascraper')).default
  const ruleTitle = (await import('metascraper-title')).default
  const ruleDesc = (await import('metascraper-description')).default
  _metaScraper = metascraper([ruleTitle(), ruleDesc()])
  return _metaScraper
}

// 解析 HTML 实体（标题/描述里常见 &amp; &#x... 等），避免回显乱码
function decodeEntities(s) {
  if (!s) return s
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
}

// 解析 <title> / og:description 的正则兜底（metascraper 不可用或拿不到时使用）
function parseMetaRegex(html, origin) {
  let title = ''
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch) title = decodeEntities(titleMatch[1].replace(/\s+/g, ' ').trim())

  let description = ''
  const ogDesc = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
  if (ogDesc) description = decodeEntities(ogDesc[1].trim())
  else {
    const desc = html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i)
    if (desc) description = decodeEntities(desc[1].trim())
  }

  // 标题兜底：og:title / twitter:title（部分站点 <title> 为空但社交标签有值）
  if (!title) {
    const ogTitle = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    if (ogTitle) title = decodeEntities(ogTitle[1].trim())
    else {
      const twTitle = html.match(/name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i)
      if (twTitle) title = decodeEntities(twTitle[1].trim())
    }
  }

  return { title, description }
}

// 正则解析 favicon（比 og:image 更适合做站点图标）
function parseIcon(html, origin) {
  const iconMatch =
    html.match(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon)["']/i)
  if (iconMatch) {
    const href = iconMatch[1].trim()
    // 过滤空值 / data: / javascript: 等非法协议，回退到站点 favicon
    if (!href || /^data:/i.test(href) || /^(javascript|vbscript):/i.test(href)) {
      return `${origin}/favicon.ico`
    }
    return href.startsWith('http') ? href
      : href.startsWith('//') ? 'https:' + href
      : `${origin}${href.startsWith('/') ? '' : '/'}${href}`
  }
  return `${origin}/favicon.ico`
}

async function parseMeta(html, origin) {
  let { title, description } = parseMetaRegex(html, origin)

  // 优先用 metascraper 提准（覆盖 og:title、twitter:title、<title>、h1 等优先级规则）
  try {
    const scrape = await loadMetascraper()
    const m = await scrape({ html, url: origin })
    if (m.title) title = m.title.trim()
    if (m.description) description = m.description.trim()
  } catch {
    // metascraper 未安装或异常：保留正则结果
  }

  return {
    title: title.slice(0, 200),
    description: description.slice(0, 300),
    icon: parseIcon(html, origin)
  }
}

// Headless 兜底：HTTP 抓取拿不到标题/描述时，用 Playwright 执行 JS 渲染抓取（解决百度等 JS 反爬壳）
let _playwright = null
function loadPlaywright() {
  if (!_playwright) _playwright = require('playwright')
  return _playwright
}

async function fetchWithHeadless(targetUrl) {
  let browser
  try {
    const { chromium } = loadPlaywright()
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage({ userAgent: META_UA })
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 10000 })
    await page.waitForTimeout(1200)
    const data = await page.evaluate(() => {
      const title = (document.title || '').trim()
      let description = ''
      const og = document.querySelector('meta[property="og:description"], meta[name="og:description"]')
      const desc = document.querySelector('meta[name="description"]')
      if (og && og.getAttribute('content')) description = og.getAttribute('content')
      else if (desc && desc.getAttribute('content')) description = desc.getAttribute('content')
      let icon = ''
      const link = document.querySelector('link[rel~="icon"]')
      if (link && link.href) icon = link.href
      else icon = location.origin + '/favicon.ico'
      return { title, description: description.trim(), icon }
    })
    return {
      title: data.title.slice(0, 200),
      description: data.description.slice(0, 300),
      icon: data.icon
    }
  } catch {
    return null
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

// 递归抓取目标 URL：自动跟随 3xx 重定向与 <meta http-equiv=refresh> 软跳转
function fetchWithRedirect(targetUrl, depth) {
  return new Promise((resolve) => {
    if (depth > MAX_REDIRECTS) return resolve({ title: '', description: '', icon: '' })
    let parsed
    try {
      parsed = new URL(targetUrl)
    } catch {
      return resolve({ title: '', description: '', icon: '' })
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return resolve({ title: '', description: '', icon: '' })
    }

    const client = parsed.protocol === 'https:' ? https : http
    const opts = {
      method: 'GET',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: (parsed.pathname || '/') + parsed.search,
      headers: { 'User-Agent': META_UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8', 'Accept-Encoding': 'identity' }
    }

    const chunks = []
    let total = 0
    let settled = false
    const timer = setTimeout(() => { try { upstream.destroy() } catch { /* noop */ } }, META_TIMEOUT_MS)

    const upstream = client.request(opts, (upRes) => {
      const status = upRes.statusCode || 0
      const ctype = (upRes.headers['content-type'] || '').toLowerCase()
      const loc = upRes.headers['location']

      // 3xx 重定向：跟随最多 MAX_REDIRECTS 跳
      if ((status === 301 || status === 302 || status === 303 || status === 307 || status === 308) && loc) {
        clearTimeout(timer)
        upRes.resume()
        const next = new URL(loc, targetUrl).href
        return resolve(fetchWithRedirect(next, depth + 1))
      }

      if (status >= 200 && status < 300 && (ctype.includes('html') || ctype.includes('text/'))) {
        // 先收齐原始字节，再按 content-encoding 整体解压（避免 pipe 到 zlib 后
        // 在 data listener 注册前丢失首块 → 解压不完整 → <title> 匹配不上）
        upRes.on('data', (c) => {
          if (total >= MAX_META_BYTES) { try { upstream.destroy() } catch { /* noop */ } return }
          const want = Math.min(MAX_META_BYTES - total, c.length)
          chunks.push(c.slice(0, want))
          total += want
        })
        upRes.on('end', async () => {
          clearTimeout(timer)
          if (settled) return
          settled = true
          const raw = Buffer.concat(chunks)
          const enc = (upRes.headers['content-encoding'] || '').toLowerCase()
          let html = ''
          try {
            if (enc.includes('gzip')) html = zlib.gunzipSync(raw).toString('utf8')
            else if (enc.includes('br')) html = zlib.brotliDecompressSync(raw).toString('utf8')
            else if (enc.includes('deflate')) html = zlib.inflateSync(raw).toString('utf8')
            else html = raw.toString('utf8')
          } catch {
            // 声明压缩却解压失败（少数服务器乱标头）→ 退化为明文
            html = raw.toString('utf8')
          }
          let meta
          try {
            meta = await parseMeta(html, parsed.origin)
          } catch {
            meta = { title: '', description: '', icon: `${parsed.origin}/favicon.ico` }
          }
          // 诊断：title 仍空时打印编码/状态码/正文前 160 字符，
          // 用于区分「挑战页 / 压缩异常 / 重定向壳」三种成因
          if (!meta.title) {
            // eslint-disable-next-line no-console
            console.log(`[fetch-meta-only] empty title diag: enc=${enc || 'none'} status=${status} htmlHead=${JSON.stringify(html.slice(0, 160))}`)
          }
          // 软跳转（meta refresh）：title/desc 都为空时尝试跟随一次
          if ((!meta.title && !meta.description) && depth < MAX_REDIRECTS) {
            const mr = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"']+)["']/i) ||
                       html.match(/<meta[^>]+content=["'][^"']*url=([^"']+)["'][^>]*http-equiv=["']?refresh["']?/i)
            if (mr) {
              try {
                const next = new URL(mr[1].trim(), targetUrl).href
                const r2 = await fetchWithRedirect(next, depth + 1)
                if (r2.title || r2.description) return resolve(r2)
              } catch { /* 软跳转失败则用当前结果 */ }
            }
          }
          resolve(meta)
        })
        upRes.on('error', () => {
          clearTimeout(timer)
          if (settled) return
          settled = true
          resolve({ title: '', description: '', icon: `${parsed.origin}/favicon.ico` })
        })
      } else {
        // 非文本或异常状态码：兜底返回站点 favicon
        clearTimeout(timer)
        if (settled) return
        settled = true
        resolve({ title: '', description: '', icon: `${parsed.origin}/favicon.ico` })
      }
    })
    upstream.on('error', () => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      resolve({ title: '', description: '', icon: `${parsed.origin}/favicon.ico` })
    })
    upstream.end()
  })
}

function sendMetaError(res, msg) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ error: msg, title: '', description: '', icon: '' }))
}

// ===== 请求入口：只处理 POST /api/fetch-meta =====

async function handleFetchMeta(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Allow': 'POST' })
    res.end('Method Not Allowed')
    return
  }
  let payload
  try {
    const raw = await readBody(req)
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'Bad Request: invalid JSON' }))
    return
  }

  const target = payload && payload.url
  if (!target || typeof target !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'missing url' }))
    return
  }

  let parsed
  try {
    parsed = new URL(target)
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'invalid url' }))
    return
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'unsupported protocol' }))
    return
  }

// 空结果重试：上游（如百度对机房 IP）偶发甩挑战页/压缩异常导致解析为空。
// 以 title 为命中判据（UI 主要展示 title），最多 3 次、间隔 400ms，显著提升命中率
async function fetchWithRetry(target, maxAttempts = 3) {
  let last = { title: '', description: '', icon: `${new URL(target).origin}/favicon.ico` }
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const m = await fetchWithRedirect(target, 0)
    if (m.title) return m
    last = m
    if (attempt < maxAttempts - 1) {
      // eslint-disable-next-line no-console
      console.log(`[fetch-meta-only] empty title, retry ${attempt + 1}/${maxAttempts - 1}`)
      await new Promise((r) => setTimeout(r, 400))
    }
  }
  return last
}

  try {
    // eslint-disable-next-line no-console
    console.log(`[fetch-meta-only] -> ${parsed.protocol}//${parsed.hostname}${parsed.pathname}`)
    const meta = await fetchWithRetry(target)
    // 反爬站点（JS 渲染/空壳）HTTP 抓取拿不到标题时，用 Headless 兜底
    if (!meta.title) {
      try {
        const h = await fetchWithHeadless(parsed.href)
        if (h && (h.title || h.description)) {
          meta.title = h.title || meta.title
          meta.description = h.description || meta.description
          if (!meta.icon && h.icon) meta.icon = h.icon
        }
      } catch { /* Headless 不可用（未装浏览器等）时忽略，保留 HTTP 结果 */ }
    }
    // eslint-disable-next-line no-console
    console.log(`[fetch-meta-only] <- title=${meta.title ? '(ok)' : '(empty)'} icon=${meta.icon ? '(ok)' : '(empty)'}`)
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(meta))
  } catch (err) {
    sendMetaError(res, err.message || 'fetch error')
  }
}

async function handle(req, res) {
  // 健康检查
  if (req.method === 'GET' && (req.url === '/healthz' || req.url === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'fetch-meta-only', time: Date.now() }))
    return
  }
  if (req.url !== '/api/fetch-meta') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not Found')
    return
  }
  await handleFetchMeta(req, res)
}

const server = http.createServer((req, res) => {
  Promise.resolve(handle(req, res)).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`[fetch-meta-only] top-level error:`, err)
    try {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Internal Server Error')
    } catch { /* noop */ }
  })
})

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`\n✓ fetch-meta-only listening on http://${HOST}:${PORT}`)
  console.log('  Configure Nginx:  location = /api/fetch-meta { proxy_pass http://127.0.0.1:16720; }\n')
})
