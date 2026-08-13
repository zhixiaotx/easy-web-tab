/**
 * 天气数据获取（open-meteo）——composition 函数，非 Pinia。
 * 两段串行 fetch（每段各自 AbortSignal.timeout）：
 *   ① 地理编码 geocoding-api.open-meteo.com（城市名 → lat/lon，超时 4s）
 *   ② 当前天气 api.open-meteo.com（lat/lon → 温度/湿度/天气 code，超时 8s）
 * 任一阶段失败 / 空结果 / 网络错误 / 超时 → 返回 null（静默降级，不抛错、不 toast）。
 */

export interface WeatherInfo {
  temp: number // 摄氏温度
  code: number // WMO weather code
  humidity: number // 相对湿度 %
}

const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_API = 'https://api.open-meteo.com/v1/forecast'

// 每段 fetch 各自的超时上限：geocode 4s + forecast 8s（串行总上限约 12s）
const GEOCODING_TIMEOUT_MS = 4000
const FORECAST_TIMEOUT_MS = 8000

/**
 * WMO weather code → emoji 映射（纯函数，组件展示用）：
 *   0=晴、1-3=多云、45/48=雾、51-67=雨、71-77=雪、80-82=阵雨、95-99=雷暴
 */
export function weatherEmoji(code: number): string {
  if (code === 0) return '☀️' // 晴
  if (code >= 1 && code <= 3) return '⛅' // 多云
  if (code === 45 || code === 48) return '🌫️' // 雾
  if (code >= 51 && code <= 67) return '🌧️' // 雨（毛毛雨/冻雨/雨夹雪）
  if (code >= 71 && code <= 77) return '❄️' // 雪
  if (code >= 80 && code <= 82) return '🌦️' // 阵雨
  if (code >= 95 && code <= 99) return '⛈️' // 雷暴
  return '🌡️' // 未知/其他
}

/**
 * 获取指定城市的当前天气。city 为空 → null；任一阶段失败 → null（静默降级）。
 */
export async function fetchWeather(city: string): Promise<WeatherInfo | null> {
  if (!city || city.trim() === '') return null

  try {
    // ① 地理编码：城市名 → 经纬度（只取第一个结果）
    const geoUrl = `${GEOCODING_API}?name=${encodeURIComponent(city.trim())}&count=1&language=zh`
    const geoResponse = await fetch(geoUrl, { signal: AbortSignal.timeout(GEOCODING_TIMEOUT_MS) })
    if (!geoResponse.ok) return null
    const geoData = (await geoResponse.json()) as { results?: Array<{ latitude?: number; longitude?: number }> }
    const location = geoData.results?.[0]
    if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
      return null
    }

    // ② 当前天气：温度 / 湿度 / 天气 code
    const forecastUrl =
      `${FORECAST_API}?latitude=${location.latitude}&longitude=${location.longitude}` +
      '&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto'
    const forecastResponse = await fetch(forecastUrl, { signal: AbortSignal.timeout(FORECAST_TIMEOUT_MS) })
    if (!forecastResponse.ok) return null
    const forecastData = (await forecastResponse.json()) as {
      current?: { temperature_2m?: number; relative_humidity_2m?: number; weather_code?: number }
    }
    const current = forecastData.current
    if (
      !current ||
      typeof current.temperature_2m !== 'number' ||
      typeof current.relative_humidity_2m !== 'number' ||
      typeof current.weather_code !== 'number'
    ) {
      return null
    }

    return {
      temp: current.temperature_2m,
      code: current.weather_code,
      humidity: current.relative_humidity_2m
    }
  } catch {
    // 静默降级：网络错误 / 超时 / 响应解析失败均返回 null，不抛错不 toast
    return null
  }
}
