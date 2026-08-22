// Production startup script (PM2 / node server.cjs)
// 功能与 scripts/serve-with-rewrites.cjs 一致：
//   - 静态托管 dist/ + SPA fallback + 小游戏重写
//   - 挂载 /api/webdav-proxy 同源代理（坚果云等 WebDAV 服务商不允许浏览器 CORS，需 Node 服务端代发请求）
// 原 server.cjs 走 npx serve -s（无 rewrite、无云同步代理）已被替换，避免与 scripts/serve-with-rewrites.cjs 分叉。

const { spawn } = require('child_process');
const path = require('path');

const projectDir = __dirname;
const distDir = path.join(projectDir, 'dist');

// Check if dist exists
const fs = require('fs');
if (!fs.existsSync(distDir)) {
  console.log('Building project...');
  const build = spawn('npm', ['run', 'build'], {
    cwd: projectDir,
    shell: true,
    stdio: 'inherit'
  });

  build.on('close', (code) => {
    if (code !== 0) {
      console.error('Build failed!');
      process.exit(1);
    }
    startServer();
  });
} else {
  startServer();
}

function startServer() {
  console.log('Starting server on http://localhost:16718 (with WebDAV proxy)');
  // 直接 require 本项目自定义 HTTP 服务器（含游戏重写 + 云同步代理）
  // serve-with-rewrites.cjs 会调用 http.createServer(...).listen(16718)，与旧行为端口一致
  require(path.join(projectDir, 'scripts', 'serve-with-rewrites.cjs'));
}
