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
      const jinaUrl = 'https://r.jina.ai/http://' + urlObj.host + urlObj.pathname
      const response = await fetch(jinaUrl)
      
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
        
        if (title) {
          return {
            title,
            description: description.slice(0, 300) || '暂无描述',
            icon: `${urlObj.origin}/favicon.ico`
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

  async function fetchMetadata(url: string): Promise<UrlMetadata | null> {
    if (!url) return null

    try {
      // 先尝试 jina.ai
      let metadata = await fetchViaJina(url)
      
      // 如果失败，使用 fallback
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
