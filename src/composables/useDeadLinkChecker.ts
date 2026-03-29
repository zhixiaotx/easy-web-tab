/**
 * 断链检测服务
 * 使用多个代理服务检测 URL 可访问性，支持降级
 */

export interface CheckResult {
  url: string
  isValid: boolean
  statusCode?: number
}

export interface CheckProgress {
  total: number
  current: number
  invalidCount: number
}

// 代理服务列表（按优先级排序）
const PROXY_SERVICES = [
  { name: 'allorigins', url: (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
  { name: 'corsproxy', url: (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}` },
]

const REQUEST_TIMEOUT = 8000 // 单次请求超时

/**
 * 使用指定代理检测 URL
 */
async function checkWithProxy(proxyUrl: string): Promise<{ status: number; ok: boolean } | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

    const response = await fetch(proxyUrl, {
      method: 'GET',
      signal: controller.signal,
      mode: 'cors'
    })
    clearTimeout(timeout)

    const status = response.status
    // 2xx 或 3xx 均视为有效
    return { status, ok: status >= 200 && status < 400 }
  } catch {
    return null
  }
}

/**
 * 检测单个 URL 是否可访问（多代理降级）
 */
async function checkUrl(url: string): Promise<CheckResult> {
  // 依次尝试每个代理服务
  for (const proxy of PROXY_SERVICES) {
    const proxyUrl = proxy.url(url)
    const result = await checkWithProxy(proxyUrl)
    
    if (result) {
      // 如果代理返回了结果，使用该结果
      // 排除代理自身的错误状态码（500, 502, 503 等）
      if (result.status >= 500 && result.status < 600) {
        // 代理服务器错误，尝试下一个代理
        continue
      }
      return { url, isValid: result.ok, statusCode: result.status }
    }
    // 当前代理失败，尝试下一个
  }
  
  // 所有代理都失败，标记为无效
  return { url, isValid: false }
}

/**
 * 批量检测断链
 * @param urls 要检测的 URL 列表
 * @param onProgress 进度回调
 * @param abortSignal 可选的中断信号
 */
export async function checkDeadLinks(
  urls: string[],
  onProgress: (progress: CheckProgress, result: CheckResult) => void,
  abortSignal?: AbortSignal
): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  let invalidCount = 0

  for (let i = 0; i < urls.length; i++) {
    // 检查是否被中断
    if (abortSignal?.aborted) {
      break
    }

    const result = await checkUrl(urls[i])

    if (!result.isValid) {
      invalidCount++
    }

    results.push(result)
    onProgress({ total: urls.length, current: i + 1, invalidCount }, result)

    // 间隔 500ms 避免过快请求
    if (i < urls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  return results
}

/**
 * 保存检测结果到 localStorage
 */
export function saveCheckResults(results: CheckResult[]): void {
  const map: Record<string, boolean> = {}
  for (const r of results) {
    map[r.url] = r.isValid
  }
  localStorage.setItem('link-check-results', JSON.stringify(map))
}

/**
 * 从 localStorage 加载检测结果
 */
export function loadCheckResults(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem('link-check-results')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/**
 * 清除所有检测结果
 */
export function clearCheckResults(): void {
  localStorage.removeItem('link-check-results')
}
