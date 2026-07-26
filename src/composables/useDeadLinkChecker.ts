/**
 * 断链检测服务
 * 直连目标 URL 检测可访问性
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

const REQUEST_TIMEOUT = 8000 // 单次请求超时

/**
 * 直连检测 URL 是否可访问
 * 先尝试 HEAD 请求（轻量），失败后降级为 GET
 */
async function checkUrl(url: string): Promise<CheckResult> {
  // 尝试 HEAD 请求
  const headResult = await fetchWithTimeout(url, 'HEAD')
  if (headResult) {
    return { url, isValid: headResult.ok, statusCode: headResult.status }
  }

  // HEAD 失败（可能服务器不支持），降级为 GET
  const getResult = await fetchWithTimeout(url, 'GET')
  if (getResult) {
    return { url, isValid: getResult.ok, statusCode: getResult.status }
  }

  // 两种方法都失败，标记为无效
  return { url, isValid: false }
}

/**
 * 带超时的 fetch 请求
 */
async function fetchWithTimeout(url: string, method: 'HEAD' | 'GET'): Promise<{ status: number; ok: boolean } | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

    const response = await fetch(url, {
      method,
      signal: controller.signal,
      mode: 'no-cors' // 允许跨域请求，opaque response 也算可达
    })
    clearTimeout(timeout)

    const status = response.status
    // no-cors 模式下 response.type === 'opaque' 表示请求已发出（无法读取状态）
    // opaque response 视为可达（至少服务器有响应）
    if (response.type === 'opaque') {
      return { status: 0, ok: true }
    }
    // 2xx 或 3xx 均视为有效
    return { status, ok: status >= 200 && status < 400 }
  } catch {
    return null
  }
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
