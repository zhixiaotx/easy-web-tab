// 独立的 WebDAV 同源代理服务（专给 Nginx 部署用）
//
// 用途：
//   当你用 Nginx 托管 dist/（纯静态）时，浏览器请求 /api/webdav-proxy 会被
//   Nginx 的 location 反代到本机 127.0.0.1:16719，由本 Node 进程代发真实 WebDAV
//   请求。协议与 scripts/serve-with-rewrites.cjs 完全一致：
//
//     POST http://127.0.0.1:16719/
//       Header Content-Type: application/json
//       Header X-Webdav-Auth: Basic <b64(username:password)>
//       Body   { target: "https://dav.jianguoyun.com/dav/easy-web-tab",
//               method: "GET" | "PUT" | "MKCOL",
//               body?: string }
//
//     Response 与 serve-with-rewrites.cjs 代理一致：
//       - 2xx 直接管道响应
//       - 非 2xx 最多攒 1KB body，写 X-Upstream-Body-Snippet (URI-encoded)
//       - 一律剥离 WWW-Authenticate / Set-Cookie
//       - 一律加 X-Upstream-Status
//
// 启动：
//   node scripts/webdav-proxy-only.cjs                 # 默认 127.0.0.1:16719
//   WEBDAV_PROXY_HOST=0.0.0.0 WEBDAV_PROXY_PORT=16719 \
//     node scripts/webdav-proxy-only.cjs
//
// 建议 pm2 常驻（同机 Nginx 反代）：
//   pm2 start scripts/webdav-proxy-only.cjs --name easy-webdav-proxy

const http = require('http')
const https = require('https')
const { URL } = require('url')

const HOST = process.env.WEBDAV_PROXY_HOST || '127.0.0.1'
const PORT = Number(process.env.WEBDAV_PROXY_PORT) || 16719
const MAX_ERROR_BYTES = 1024

function maskAuth(h) {
  if (!h) return '(none)'
  const s = String(h)
  if (s.length <= 16) return s.slice(0, 3) + '***'
  return s.slice(0, 6) + '***' + s.slice(-6) + ' (len=' + s.length + ')'
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (c) => {
      total += c.length
      // 防御：单请求 >32MB 直接拒绝（同步 JSON 不会这么大）
      if (total > 32 * 1024 * 1024) {
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

async function handle(req, res) {
  // 健康检查：GET /healthz
  if (req.method === 'GET' && (req.url === '/healthz' || req.url === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'webdav-proxy-only', time: Date.now() }))
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Allow': 'POST, GET' })
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
    if (davMethod !== 'GET' && davMethod !== 'PUT' && davMethod !== 'MKCOL') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Method Not Allowed (only GET / PUT / MKCOL supported)')
      return
    }
    const opts = {
      method: davMethod,
      hostname: parsed.hostname,
      port: parsed.port || (useHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      servername: useHttps ? parsed.hostname : undefined,  // SNI 必须匹配否则坚果云证书错误
      headers: {}
    }
    if (authHeader) opts.headers['Authorization'] = String(authHeader)
    const bodyBytes = body === undefined ? undefined : Buffer.from(String(body), 'utf8')
    if (bodyBytes) {
      opts.headers['Content-Type'] = 'application/json'
      opts.headers['Content-Length'] = bodyBytes.length
    }

    // eslint-disable-next-line no-console
    console.log(`[webdav-proxy-only] -> ${davMethod} ${parsed.protocol}//${parsed.hostname}${parsed.pathname} auth=${maskAuth(opts.headers.Authorization)} bodyLen=${bodyBytes ? bodyBytes.length : 0}`)

    const upstream = client.request(opts, (upRes) => {
      const statusCode = upRes.statusCode || 502
      const headers = buildUpstreamHeaders(upRes.headers, statusCode)
      const ok2xx = statusCode >= 200 && statusCode < 300
      if (ok2xx) {
        // eslint-disable-next-line no-console
        console.log(`[webdav-proxy-only] <- ${statusCode} (pipe)`)
        res.writeHead(statusCode, headers)
        upRes.pipe(res)
        return
      }
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
        console.log(`[webdav-proxy-only] <- ${statusCode} snippet=${snippet || '(empty)'}`)
        res.writeHead(statusCode, headers)
        res.end()
      })
      upRes.on('error', () => { try { res.end() } catch { /* noop */ } })
    })
    upstream.on('error', (err) => {
      const headers = {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Upstream-Status': '502',
        'X-Upstream-Body-Snippet': encodeURIComponent(String(err.message || err))
      }
      // eslint-disable-next-line no-console
      console.error(`[webdav-proxy-only] upstream error:`, err.message)
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
    console.error(`[webdav-proxy-only] handler error:`, e?.message || e)
    res.writeHead(500, headers)
    res.end(`WebDAV proxy error: ${e?.message || e}`)
  }
}

const server = http.createServer((req, res) => {
  Promise.resolve(handle(req, res)).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`[webdav-proxy-only] top-level error:`, err)
    try {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Internal Server Error')
    } catch { /* noop */ }
  })
})

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`\n✓ webdav-proxy-only listening on http://${HOST}:${PORT}`)
  console.log('  Configure Nginx:  location = /api/webdav-proxy { proxy_pass http://127.0.0.1:16719; }\n')
})
