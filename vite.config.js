import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import os from 'node:os';

// 低内存环境（<2GB）限制 Rolldown 并行线程，避免渲染 chunks 时 OOM panic
// （高内存机器不受影响；本机约 1GB 时必现 out-of-memory，串行渲染可稳定通过）
if (os.totalmem() < 2 * 1024 * 1024 * 1024) {
  process.env.RAYON_NUM_THREADS = process.env.RAYON_NUM_THREADS || '1';
}

/**
 * WebDAV 同源代理处理（Vite dev/preview）：
 *   接收 POST /api/webdav-proxy，body 为 { target, method, body? }，
 *   header X-Webdav-Auth 为 Base64 凭证；由 Node 服务端代发 HTTP → 客户端无 CORS。
 *
 * 非 2xx 响应：
 *   - 代理会在内存里缓冲最多 maxErrorBytes 的上游 body，作为
 *     X-Upstream-Body-Snippet 响应头返回给前端（前端 toast 直接显示
 *     坚果云/Nextcloud 真实错误文本，而不是干巴巴的 401）。
 *   - 开发环境在 Node 命令行打印安全日志（方法、路径、Authorization
 *     头只打前后 6 位避免泄漏完整凭证）。
 */
const IS_DEV = !!process.env.VITE_ENV || true; // vite.config.js 本身只在开发/构建运行
const MAX_ERROR_BYTES = 1024;

function maskAuth(h) {
  if (!h) return '(none)';
  const s = String(h);
  if (s.length <= 16) return s.slice(0, 3) + '***';
  return s.slice(0, 6) + '***' + s.slice(-6) + ' (len=' + s.length + ')';
}

async function handleWebdavProxy(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end('Method Not Allowed');
    return;
  }
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', async () => {
    try {
      const payload = raw ? JSON.parse(raw) : {};
      const { target, method, body } = payload;
      const authHeader = req.headers['x-webdav-auth'];
      if (!target || !method) {
        res.statusCode = 400;
        res.end('Bad Request: missing target/method');
        return;
      }
      const targetUrl = new URL(target);
      const nodeModule = targetUrl.protocol === 'https:' ? await import('node:https') : await import('node:http');
      const davMethod = String(method).toUpperCase();
      const reqOpts = {
        method: davMethod,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        headers: {}
      };
      if (authHeader) {
        reqOpts.headers['Authorization'] = String(authHeader);
      }
      if (body !== undefined) {
        reqOpts.headers['Content-Type'] = 'application/json';
        reqOpts.headers['Content-Length'] = Buffer.byteLength(String(body));
      }

      // 诊断日志（凭证脱敏）
      // eslint-disable-next-line no-console
      console.log(`[webdav-proxy] -> ${davMethod} ${targetUrl.protocol}//${targetUrl.hostname}${targetUrl.pathname} auth=${maskAuth(reqOpts.headers.Authorization)} bodyLen=${body === undefined ? 0 : Buffer.byteLength(String(body))}`);

      const upstream = nodeModule.request(reqOpts, (upRes) => {
        const statusCode = upRes.statusCode || 502;
        res.statusCode = statusCode;
        // 逐头透传（Set-Cookie 不暴露给前端；WWW-Authenticate 必须剥离——
        // 否则浏览器收到 401 + WWW-Authenticate: Basic 会强制弹原生登录框，
        // 把响应「截走」，前端 JS 拿不到 401 也就无法 toast 提示）
        for (const [k, v] of Object.entries(upRes.headers)) {
          const lk = k.toLowerCase();
          if (lk === 'set-cookie') continue;
          if (lk === 'www-authenticate') continue;
          res.setHeader(k, v);
        }
        // 把坚果云的真实 upstream status 再额外写一遍（前端可以区分
        // 「代理本身出错 500/502」和「坚果云回 401/404」）
        res.setHeader('X-Upstream-Status', String(statusCode));

        const ok2xx = statusCode >= 200 && statusCode < 300;
        if (ok2xx) {
          // 正常响应直接管道，避免在内存里缓冲大 JSON
          // eslint-disable-next-line no-console
          console.log(`[webdav-proxy] <- ${statusCode} (pipe)`);
          upRes.pipe(res);
          return;
        }
        // 非 2xx：攒最多 MAX_ERROR_BYTES 字节当诊断用
        const chunks = [];
        let total = 0;
        upRes.on('data', (c) => {
          if (total >= MAX_ERROR_BYTES) return;
          const want = Math.min(MAX_ERROR_BYTES - total, c.length);
          chunks.push(c.slice(0, want));
          total += want;
        });
        upRes.on('end', () => {
          const snippet = Buffer.concat(chunks).toString('utf8')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 512);
          if (snippet) {
            res.setHeader('X-Upstream-Body-Snippet', encodeURIComponent(snippet));
          }
          // eslint-disable-next-line no-console
          console.log(`[webdav-proxy] <- ${statusCode} snippet=${snippet || '(empty)'}`);
          res.end();
        });
        upRes.on('error', () => { res.end(); });
      });
      upstream.on('error', (err) => {
        res.statusCode = 502;
        res.setHeader('X-Upstream-Status', '502');
        res.setHeader('X-Upstream-Body-Snippet', encodeURIComponent(String(err.message || err)));
        // eslint-disable-next-line no-console
        console.error(`[webdav-proxy] upstream error:`, err.message);
        res.end(`WebDAV proxy upstream error: ${err.message}`);
      });
      if (body !== undefined) {
        upstream.write(String(body));
      }
      upstream.end();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[webdav-proxy] handler error:`, e?.message || e);
      res.statusCode = 500;
      res.setHeader('X-Upstream-Status', '500');
      res.setHeader('X-Upstream-Body-Snippet', encodeURIComponent(String(e?.message || e)));
      res.end(`WebDAV proxy error: ${e?.message || e}`);
    }
  });
  req.on('error', () => {
    try { res.destroy(); } catch { /* noop */ }
  });
}

export default defineConfig({
    plugins: [
      vue(),
      {
        name: 'webdav-proxy',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url && req.url.startsWith('/api/webdav-proxy')) {
              return handleWebdavProxy(req, res);
            }
            next();
          });
        },
        configurePreviewServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url && req.url.startsWith('/api/webdav-proxy')) {
              return handleWebdavProxy(req, res);
            }
            next();
          });
        }
      }
    ],
    resolve: {
        alias: {
            '@': '/src'
        }
    },
    server: {
        port: 16718
    }
});
