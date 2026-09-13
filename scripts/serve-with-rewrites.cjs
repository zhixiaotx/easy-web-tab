const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const url = require('url')
const { URL } = require('url')

const PORT = Number(process.env.PORT) || 16718
const DIST_DIR = path.join(__dirname, '..', 'dist')
const PROXY_PATH = '/api/webdav-proxy'
const MAX_ERROR_BYTES = 1024

// 站点元数据同源代理（替代前端直连海外 jina.ai / allorigins.win，解决国内网络不可达 + CORS）
const PROXY_META_PATH = '/api/fetch-meta'
const MAX_META_BYTES = 512 * 1024
const META_TIMEOUT_MS = 8000
// UA 里的站点地址仅用于对方站点识别来源，部署时建议换成自己的域名
const META_UA = process.env.META_UA || 'Mozilla/5.0 (compatible; easywebtab/1.0)'
const MAX_REDIRECTS = 5

function maskAuth(h) {
  if (!h) return '(none)'
  const s = String(h)
  if (s.length <= 16) return s.slice(0, 3) + '***'
  return s.slice(0, 6) + '***' + s.slice(-6) + ' (len=' + s.length + ')'
}

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
}

/**
 * 读取请求 body 的 Promise（用于 API）
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8') || ''))
    req.on('error', reject)
  })
}

/**
 * WebDAV 同源代理：
 *   POST /api/webdav-proxy
 *   body = { target: string, method: string, body?: string }
 *   header X-Webdav-Auth = "Basic <b64>"
 * 服务端代发 WebDAV 请求（GET/PUT/MKCOL）以绕开浏览器 CORS 预检。
 */
/**
 * 把上游响应头写回客户端，剥离 set-cookie 与 www-authenticate：
 *   - WWW-Authenticate 必须去掉，否则浏览器遇到 401 + Basic 会强制弹原生登录框，
 *     前端 JS 就拿不到 401、无法 toast 友好提示。
 *   - 额外加 X-Upstream-Status（坚果云真实返回码，前端可以区分是代理报错
 *     还是坚果云自己返回 401/404）。
 * 返回过滤后的 headers 对象，供调用方继续写自定义诊断头后再 writeHead。
 */
function buildUpstreamHeaders(headers, statusCode) {
  const filtered = {}
  for (const [k, v] of Object.entries(headers || {})) {
    const lk = k.toLowerCase()
    if (lk === 'set-cookie') continue
    if (lk === 'www-authenticate') continue
    filtered[k] = v
  }
  filtered['X-Upstream-Status'] = String(statusCode || 502)
  return filtered
}

async function handleWebdavProxy(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Allow': 'POST' })
    res.end('Method Not Allowed')
    return
  }
  try {
    const raw = await readBody(req)
    const payload = raw ? JSON.parse(raw) : {}
    const { target, method, body } = payload
    const authHeader = req.headers['x-webdav-auth']
    if (!target || !method) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Bad Request: missing target/method')
      return
    }
    const parsed = new URL(target)
    const useHttps = parsed.protocol === 'https:'
    const client = useHttps ? https : http
    const davMethod = String(method).toUpperCase()
    const opts = {
      method: davMethod,
      hostname: parsed.hostname,
      port: parsed.port || (useHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: {}
    }
    if (authHeader) opts.headers['Authorization'] = String(authHeader)
    const bodyBytes = body === undefined ? undefined : Buffer.from(String(body), 'utf8')
    if (bodyBytes) {
      opts.headers['Content-Type'] = 'application/json'
      opts.headers['Content-Length'] = bodyBytes.length
    }

    // 诊断日志（凭证脱敏，避免完整 token 被打日志/截图带走）
    // eslint-disable-next-line no-console
    console.log(`[webdav-proxy] -> ${davMethod} ${parsed.protocol}//${parsed.hostname}${parsed.pathname} auth=${maskAuth(opts.headers.Authorization)} bodyLen=${bodyBytes ? bodyBytes.length : 0}`)

    const upstream = client.request(opts, (upRes) => {
      const statusCode = upRes.statusCode || 502
      const headers = buildUpstreamHeaders(upRes.headers, statusCode)
      const ok2xx = statusCode >= 200 && statusCode < 300
      if (ok2xx) {
        // 正常响应直接管道，避免把 2MB 的工作台同步文件全缓冲到内存
        // eslint-disable-next-line no-console
        console.log(`[webdav-proxy] <- ${statusCode} (pipe)`)
        res.writeHead(statusCode, headers)
        upRes.pipe(res)
        return
      }
      // 非 2xx：攒最多 MAX_ERROR_BYTES 字节，放 X-Upstream-Body-Snippet 里给前端
      const chunks = []
      let total = 0
      upRes.on('data', (c) => {
        if (total >= MAX_ERROR_BYTES) return
        const want = Math.min(MAX_ERROR_BYTES - total, c.length)
        chunks.push(c.slice(0, want))
        total += want
      })
      upRes.on('end', () => {
        const snippet = Buffer.concat(chunks).toString('utf8')
          .replace(/\s+/g, ' ').trim().slice(0, 512)
        if (snippet) headers['X-Upstream-Body-Snippet'] = encodeURIComponent(snippet)
        // eslint-disable-next-line no-console
        console.log(`[webdav-proxy] <- ${statusCode} snippet=${snippet || '(empty)'}`)
        res.writeHead(statusCode, headers)
        res.end()
      })
      upRes.on('error', () => {
        try { res.end() } catch { /* noop */ }
      })
    })
    upstream.on('error', (err) => {
      const headers = {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Upstream-Status': '502',
        'X-Upstream-Body-Snippet': encodeURIComponent(String(err.message || err))
      }
      // eslint-disable-next-line no-console
      console.error(`[webdav-proxy] upstream error:`, err.message)
      res.writeHead(502, headers)
      res.end(`WebDAV proxy upstream error: ${err.message}`)
    })
    if (bodyBytes) upstream.write(bodyBytes)
    upstream.end()
  } catch (e) {
    const headers = {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Upstream-Status': '500',
      'X-Upstream-Body-Snippet': encodeURIComponent(String(e?.message || e))
    }
    // eslint-disable-next-line no-console
    console.error(`[webdav-proxy] handler error:`, e?.message || e)
    res.writeHead(500, headers)
    res.end(`WebDAV proxy error: ${e?.message || e}`)
  }
}

/**
 * 站点元数据同源代理：
 *   POST /api/fetch-meta
 *   body = { url: string }
 * 服务端代发 GET 请求抓取目标网页（国内服务器出网，绕开浏览器→海外服务链路），
 * 解析 <title> / og:description / favicon 后返回 JSON。
 * 强制 Accept-Encoding: identity，避免服务端自动 gzip 导致正文乱码无法解析。
 */
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

// 解析 <title> / og:description 的正则兜底（metascraper 不可用或拿不到时使用）
function parseMetaRegex(html, origin) {
  let title = ''
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch) title = titleMatch[1].replace(/\s+/g, ' ').trim()

  let description = ''
  const ogDesc = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
  if (ogDesc) description = ogDesc[1].trim()
  else {
    const desc = html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i)
    if (desc) description = desc[1].trim()
  }

  return { title, description }
}

// 正则解析 favicon（比 og:image 更适合做站点图标，因此不交给 metascraper-image）
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

function sendMetaError(res, msg) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ error: msg, title: '', description: '', icon: '' }))
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
      headers: { 'User-Agent': META_UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' }
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
          const html = Buffer.concat(chunks).toString('utf8')
          let meta
          try {
            meta = await parseMeta(html, parsed.origin)
          } catch {
            meta = { title: '', description: '', icon: `${parsed.origin}/favicon.ico` }
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

  try {
    const meta = await fetchWithRedirect(target, 0)
    // 反爬站点（JS 渲染/空壳）HTTP 抓取拿不到标题/描述时，用 Headless 兜底；仅此类站点触发，正常站点走快速 HTTP
    if (!meta.title && !meta.description) {
      try {
        const h = await fetchWithHeadless(parsed.href)
        if (h && (h.title || h.description)) {
          meta.title = h.title || meta.title
          meta.description = h.description || meta.description
          if (!meta.icon && h.icon) meta.icon = h.icon
        }
      } catch { /* Headless 不可用（未装浏览器等）时忽略，保留 HTTP 结果 */ }
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(meta))
  } catch (err) {
    sendMetaError(res, err.message || 'fetch error')
  }
}

function serveStatic(filePath, res) {
  // Security: prevent directory traversal
  const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '')
  const fullPath = path.join(DIST_DIR, safePath)

  // Ensure path is within DIST_DIR
  if (!fullPath.startsWith(DIST_DIR)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Try index.html for directories
      const indexPath = path.join(fullPath, 'index.html')
      fs.stat(indexPath, (err2, stats2) => {
        if (err2 || !stats2.isFile()) {
          // Fallback to SPA index.html
          res.writeHead(200, { 'Content-Type': 'text/html' })
          fs.createReadStream(path.join(DIST_DIR, 'index.html')).pipe(res)
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/html' })
        fs.createReadStream(indexPath).pipe(res)
      })
      return
    }

    const ext = path.extname(fullPath).toLowerCase()
    const contentType = mimeTypes[ext] || 'application/octet-stream'

    res.writeHead(200, { 'Content-Type': contentType })
    fs.createReadStream(fullPath).pipe(res)
  })
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url)
  let filePath = parsedUrl.pathname

  // ====== 云同步：WebDAV 同源代理 ======
  if (filePath === PROXY_PATH || filePath.startsWith(PROXY_PATH + '?')) {
    return handleWebdavProxy(req, res)
  }

  // ====== 站点元数据同源代理（替代前端直连海外服务）======
  if (filePath === PROXY_META_PATH || filePath.startsWith(PROXY_META_PATH + '?')) {
    return handleFetchMeta(req, res)
  }

// Game rewrites - with trailing slash for proper relative path resolution
if (filePath === '/games/tetris') {
  // Redirect to index.html with trailing slash for proper relative path resolution
  res.writeHead(302, { 'Location': '/games/tetris/' })
  res.end()
  return
} else if (filePath === '/games/tetris/') {
  // Already has trailing slash, serve the index.html
  filePath = '/games/tetris/index.html'
} else if (filePath === '/games/id-generator') {
  // Redirect to index.html with trailing slash
  res.writeHead(302, { 'Location': '/games/id-generator/' })
  res.end()
  return
} else if (filePath === '/games/id-generator/') {
  // Already has trailing slash, serve the index.html
  filePath = '/games/id-generator/index.html'
} else if (filePath === '/games/cron-generator') {
  // Redirect to index.html with trailing slash
  res.writeHead(302, { 'Location': '/games/cron-generator/' })
  res.end()
  return
} else if (filePath === '/games/cron-generator/') {
  // Already has trailing slash, serve the index.html
  filePath = '/games/cron-generator/index.html'
}

  serveStatic(filePath, res)
})

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} (with WebDAV proxy /api/webdav-proxy)`)
})
