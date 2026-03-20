/**
 * 断链检测服务
 * 使用 allorigins.win 代理检测 URL 可访问性
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

/**
 * 检测单个 URL 是否可访问
 */
async function checkUrl(url: string): Promise<CheckResult> {
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const response = await fetch(proxyUrl, {
      method: 'HEAD',
      signal: controller.signal,
      mode: 'cors'
    })
    clearTimeout(timeout)

    const status = response.status
    // 2xx 或 3xx 均视为有效
    const isValid = status >= 200 && status < 400
    return { url, isValid, statusCode: status }
  } catch {
    // 网络错误、超时等视为无效
    return { url, isValid: false }
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
