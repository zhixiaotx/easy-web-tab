const http = require('http')
const fs = require('fs')
const path = require('path')
const url = require('url')

const PORT = 16718
const DIST_DIR = path.join(__dirname, '..', 'dist')

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

const server = http.createServer((req, res) => {
  let filePath = url.parse(req.url).pathname

// Game rewrites - with trailing slash for proper relative path resolution
if (filePath === '/games/tetris') {
  // Redirect to .html version
  res.writeHead(302, { 'Location': '/games/tetris.html' })
  res.end()
  return
} else if (filePath === '/games/schulte-grid') {
  // Redirect to index.html with trailing slash for proper relative path resolution
  res.writeHead(302, { 'Location': '/games/schulte-grid/' })
  res.end()
  return
} else if (filePath === '/games/schulte-grid/') {
  // Already has trailing slash, serve the index.html
  filePath = '/games/schulte-grid/index.html'
}

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
})

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
