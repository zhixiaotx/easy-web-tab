/**
 * 图标缓存服务
 * 将获取到的网站图标 base64 存入 localStorage，避免重复请求
 */

const ICON_CACHE_KEY = 'icon-cache'
const CACHE_EXPIRY_DAYS = 30

interface CacheEntry {
  dataUrl: string
  timestamp: number
}

type IconCache = Record<string, CacheEntry>

/**
 * 从 localStorage 获取完整缓存
 */
function getCache(): IconCache {
  try {
    const raw = localStorage.getItem(ICON_CACHE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/**
 * 保存缓存到 localStorage
 */
function saveCache(cache: IconCache): void {
  try {
    localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // 存储满时清理过期项
    cleanExpiredCache()
    try {
      localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(cache))
    } catch {
      // 仍然失败，忽略
    }
  }
}

/**
 * 清理过期缓存项
 */
function cleanExpiredCache(): void {
  const cache = getCache()
  const now = Date.now()
  const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  const filtered: IconCache = {}
  for (const [key, entry] of Object.entries(cache)) {
    if (now - entry.timestamp < expiryMs) {
      filtered[key] = entry
    }
  }
  saveCache(filtered)
}

/**
 * 获取域名的缓存图标
 */
export function getCachedIcon(domain: string): string | null {
  const cache = getCache()
  return cache[domain]?.dataUrl ?? null
}

/**
 * 缓存图标（将 dataUrl 存入 localStorage）
 */
export function cacheIcon(domain: string, dataUrl: string): void {
  const cache = getCache()
  cache[domain] = {
    dataUrl,
    timestamp: Date.now()
  }
  // 检查大小，超限时清理最旧的
  try {
    localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // 超出容量，删除最旧的
    const entries = Object.entries(cache).sort((a, b) => a[1].timestamp - b[1].timestamp)
    const half = Math.floor(entries.length / 2)
    const toDelete = entries.slice(0, half)
    for (const [key] of toDelete) {
      delete cache[key]
    }
    localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(cache))
  }
}

/**
 * 从 URL 下载图标并转为 dataUrl
 */
async function fetchIconAsDataUrl(iconUrl: string): Promise<string | null> {
  try {
    const response = await fetch(iconUrl, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return null
    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/**
 * 获取图标的最佳 URL
 * 优先：本地缓存 → Google Favicon API
 */
export function getIconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname
    const cached = getCachedIcon(domain)
    if (cached) return cached
    // 异步缓存（不阻塞返回）
    cacheIconAsync(domain, url)
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
  } catch {
    return ''
  }
}

/**
 * 异步缓存图标（background fetch）
 * 从网页 HTML 中提取真实 icon URL，下载并缓存
 */
export async function cacheIconAsync(domain: string, pageUrl: string): Promise<void> {
  try {
    // 尝试从 allorigins 获取网页，提取 icon
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(pageUrl)}`
    const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return
    const html = await response.text()

    // 提取 <link rel="icon"> 或 <link rel="shortcut icon">
    const iconMatch =
      html.match(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i) ||
      html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon)["']/i)

    if (!iconMatch) return

    let iconHref = iconMatch[1]
    // 相对路径转绝对路径
    if (!iconHref.startsWith('http')) {
      const origin = new URL(pageUrl).origin
      iconHref = iconHref.startsWith('/')
        ? origin + iconHref
        : origin + '/' + iconHref
    }

    // 过滤非图片 URL
    if (!iconHref.match(/\.(ico|png|jpg|jpeg|svg|gif|webp)(\?|$)/i)) return

    const dataUrl = await fetchIconAsDataUrl(iconHref)
    if (dataUrl) {
      cacheIcon(domain, dataUrl)
    }
  } catch {
    // 完全静默失败，不影响正常流程
  }
}

/**
 * 获取用于 <img> src 的图标 URL
 * 优先级：site.icon（用户自定义）→ 本地缓存 → Google API → 默认图标
 */
export function getFaviconImgSrc(siteUrl: string, customIcon?: string): string {
  if (customIcon) return customIcon
  return getIconUrl(siteUrl)
}
