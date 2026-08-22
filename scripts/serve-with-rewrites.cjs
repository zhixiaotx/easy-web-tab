const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const url = require('url')
const { URL } = require('url')

const PORT = 16718
const DIST_DIR = path.join(__dirname, '..', 'dist')
const PROXY_PATH = '/api/webdav-proxy'
const MAX_ERROR_BYTES = 1024

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

// Game rewrites - with trailing slash for proper relative path resolution
if (filePath === '/games/tetris') {
  // Redirect to index.html with trailing slash for proper relative path resolution
  res.writeHead(302, { 'Location': '/games/tetris/' })
  res.end()
  return
} else if (filePath === '/games/tetris/') {
  // Already has trailing slash, serve the index.html
  filePath = '/games/tetris/index.html'
} else if (filePath === '/games/schulte-grid') {
  // Redirect to index.html with trailing slash for proper relative path resolution
  res.writeHead(302, { 'Location': '/games/schulte-grid/' })
  res.end()
  return
} else if (filePath === '/games/schulte-grid/') {
  // Already has trailing slash, serve the index.html
  filePath = '/games/schulte-grid/index.html'
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
