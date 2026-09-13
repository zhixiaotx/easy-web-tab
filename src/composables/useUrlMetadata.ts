export interface UrlMetadata {
  title: string
  description: string
  icon: string
}

export function useUrlMetadata() {
  // 方案1: jina.ai (最好的方案)
  async function fetchViaJina(url: string): Promise<UrlMetadata | null> {
    try {
      const urlObj = new URL(url)
      const jinaUrl = 'https://r.jina.ai/' + urlObj.protocol.replace(':', '') + '://' + urlObj.host + urlObj.pathname
      const response = await fetch(jinaUrl, { signal: AbortSignal.timeout(8000) })
      
      if (!response.ok) {
        throw new Error('Failed to fetch')
      }

      const text = await response.text()
      
      // 检查是否返回错误
      if (text.startsWith('{')) {
        throw new Error('Jina returned error')
      }
      
      const lines = text.split('\n')
      
      let title = ''
      let description = ''
      
      for (const line of lines) {
        if (line.startsWith('Title:')) {
          title = line.replace('Title:', '').trim()
          break
        }
      }
      
      const contentStart = text.indexOf('Markdown Content:')
      if (contentStart !== -1) {
        const content = text.slice(contentStart + 'Markdown Content:'.length)
        
        const meaningfulLines: string[] = []
        const skipPatterns = [
          /^#+\s/,
          /^\*+\s/,
          /^!\[[^\]]*\]\(/,
          /^\[[^\]]*\]\(/,
          /^>\s/,
          /^(登录|注册|首页|下载|更多)$/,
          /^\s*$/,
        ]
        
        for (const line of content.split('\n')) {
          const trimmed = line.trim()
          if (trimmed.length > 10 && !skipPatterns.some(p => p.test(trimmed))) {
            const clean = trimmed
              .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
              .replace(/[*_`#]/g, '')
              .replace(/[-]{3,}/g, '')
              .trim()
            if (clean.length > 10) {
              meaningfulLines.push(clean)
            }
          }
        }
        
        description = meaningfulLines.slice(0, 3).join('。').trim()
        if (description.length > 300) {
          description = description.slice(0, 300) + '...'
        }
      }

      const icon = `${urlObj.origin}/favicon.ico`

      return { title, description, icon }
    } catch {
      return null
    }
  }

  // 方案2: 直接获取 meta 标签 (fallback)
  async function fetchViaProxy(url: string): Promise<UrlMetadata | null> {
    try {
      const urlObj = new URL(url)
      
      // 使用 allorigins.win 代理服务
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
      
      try {
        const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) })
        if (!response.ok) return null
        
        const html = await response.text()
        
        // 解析 title - 支持换行和单行
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i) ||
                          html.match(/data-next-head="">([^<]+)<\/title>/i)
        const title = titleMatch ? titleMatch[1].trim() : ''
        
        // 解析 description - 优先 og:description
        let description = ''
        const ogDescMatch = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
        if (ogDescMatch) {
          description = ogDescMatch[1].trim()
        } else {
          const descMatch = html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i)
          if (descMatch) {
            description = descMatch[1].trim()
          }
        }

        // 解析 icon - 优先 <link rel="icon">，再 fallback 到 /favicon.ico
        let icon = ''
        const iconMatch = html.match(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i) ||
                         html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon)["']/i)
        if (iconMatch) {
          const iconHref = iconMatch[1]
          icon = iconHref.startsWith('http') ? iconHref : `${urlObj.origin}${iconHref.startsWith('/') ? '' : '/'}${iconHref}`
        } else {
          icon = `${urlObj.origin}/favicon.ico`
        }

        if (title) {
          return {
            title,
            description: description.slice(0, 300) || '暂无描述',
            icon
          }
        }
      } catch {
        return null
      }
      
      return null
    } catch {
      return null
    }
  }

  // 方案0: 同源后端代理（国内服务器出网，解决海外服务不可达 + CORS）
  async function fetchViaSelfProxy(url: string): Promise<UrlMetadata | null> {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 20000)
      const resp = await fetch('/api/fetch-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal
      })
      clearTimeout(timer)
      if (!resp.ok) {
        // 405 说明请求打到了纯静态服务器（Nginx 未配 /api/fetch-meta 反代）
        // 401/403 一般是反代到错误的后端；502/504 是反代后端未启动
        console.warn(
          `[fetch-meta] ${resp.status} ${resp.statusText || ''}` +
          (resp.status === 405 ? ' —— 同源代理未生效，请检查 Nginx 是否反代 /api/fetch-meta 到 fetch-meta-only 服务' : '')
        )
        return null
      }
      const data = await resp.json()
      if (data && (data.title || data.description || data.icon)) {
        return {
          title: data.title || '',
          description: data.description || '',
          icon: data.icon || ''
        }
      }
      return null
    } catch (e) {
      // 走到这里说明连 HTTP 响应都没拿到（DevTools Network 里显示红色 X / (failed)），
      // 与 405/502 这类「有状态码」的失败不是一回事，常见于：
      //   - 超时被 AbortController 打断（20s）
      //   - 页面是 HTTPS 但 443 server 未配置 / 证书异常 → ERR_CONNECTION_REFUSED / ERR_SSL_*
      //   - 请求被浏览器扩展拦截
      const msg = e instanceof Error ? e.message : String(e)
      const isAbort = e instanceof Error && e.name === 'AbortError'
      console.error(
        `[fetch-meta] 请求失败：` +
        (isAbort
          ? '等待 /api/fetch-meta 超过 20s 被中断（检查 Nginx 是否真把请求转给了 fetch-meta 服务、该服务是否卡住）'
          : `${msg}（网络层失败：检查页面协议与 Nginx 监听端口是否匹配，例如 HTTPS 页面却只配了 80）`)
      )
      return null
    }
  }

  async function fetchMetadata(url: string): Promise<UrlMetadata | null> {
    if (!url) return null

    try {
      // 优先走同源后端代理（国内可达、无 CORS）
      let metadata = await fetchViaSelfProxy(url)

      // 代理不可用时回退到 jina.ai
      if (!metadata) {
        metadata = await fetchViaJina(url)
      }

      // 再不行用 allorigins 代理兜底
      if (!metadata) {
        metadata = await fetchViaProxy(url)
      }

      return metadata
    } catch (error) {
      console.error('Failed to fetch metadata:', error)
      return null
    }
  }

  return {
    fetchMetadata
  }
}
