/**
 * 天气数据获取（open-meteo）——composition 函数，非 Pinia。
 * 两段串行 fetch（每段各自 AbortSignal.timeout）：
 *   ① 地理编码 geocoding-api.open-meteo.com（城市名 → lat/lon，超时 4s）
 *   ② 当前天气 api.open-meteo.com（lat/lon → 温度/湿度/天气 code/体感温度/风速/昼夜 + 日出日落/高低温/UV，超时 8s）
 * 任一阶段失败 / 空结果 / 网络错误 / 超时 → 返回 null（静默降级，不抛错、不 toast）。
 */

export interface WeatherInfo {
  temp: number // 摄氏温度
  code: number // WMO weather code
  humidity: number // 相对湿度 %
  feelsLike: number // 体感温度 °C
  windSpeed: number // 风速 km/h
  isDay: boolean // 昼夜
  sunrise: string // 日出 ISO 8601
  sunset: string // 日落 ISO 8601
  dailyHigh: number // 今日最高温 °C
  dailyLow: number // 今日最低温 °C
  uvIndex: number // UV 指数
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
 * WMO weather code → 中文天气描述（纯函数，组件展示用）：
 *   0=晴、1-3=多云、45/48=雾、51-55=毛毛雨、56-57=冻毛毛雨、
 *   61-65=雨、66-67=冻雨、71-77=雪、80-82=阵雨、85-86=阵雪、95-99=雷暴
 */
export function weatherDesc(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? '晴天' : '晴夜'
  if (code === 1) return isDay ? '晴间多云' : '多云'
  if (code === 2) return '多云'
  if (code === 3) return '阴天'
  if (code === 45 || code === 48) return '雾'
  if (code >= 51 && code <= 55) return '毛毛雨'
  if (code === 56 || code === 57) return '冻毛毛雨'
  if (code >= 61 && code <= 63) return '小雨'
  if (code === 64 || code === 65) return '大雨'
  if (code === 66 || code === 67) return '冻雨'
  if (code >= 71 && code <= 75) return '小雪'
  if (code === 77) return '雪粒'
  if (code === 80 || code === 81) return '阵雨'
  if (code === 82) return '暴雨'
  if (code === 85 || code === 86) return '阵雪'
  if (code === 95) return '雷阵雨'
  if (code === 96 || code === 99) return '雷暴冰雹'
  return '未知'
}

/**
 * ISO 8601 时间字符串 → "HH:MM" 格式（纯函数，组件展示用）。
 */
export function formatTime(iso: string): string {
  if (!iso) return '--:--'
  try {
    return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' })
  } catch {
    return '--:--'
  }
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

    // ② 当前天气：温度 / 湿度 / 天气 code / 体感温度 / 风速 / 昼夜 + 日出日落 / 高低温 / UV
    const forecastUrl =
      `${FORECAST_API}?latitude=${location.latitude}&longitude=${location.longitude}` +
      '&current=temperature_2m,relative_humidity_2m,weather_code,apparent_temperature,wind_speed_10m,is_day' +
      '&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,uv_index_max' +
      '&timezone=auto'
    const forecastResponse = await fetch(forecastUrl, { signal: AbortSignal.timeout(FORECAST_TIMEOUT_MS) })
    if (!forecastResponse.ok) return null
    const forecastData = (await forecastResponse.json()) as {
      current?: {
        temperature_2m?: number
        relative_humidity_2m?: number
        weather_code?: number
        apparent_temperature?: number
        wind_speed_10m?: number
        is_day?: number
      }
      daily?: {
        sunrise?: string[]
        sunset?: string[]
        temperature_2m_max?: number[]
        temperature_2m_min?: number[]
        uv_index_max?: number[]
      }
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

    const daily = forecastData.daily

    return {
      temp: current.temperature_2m,
      code: current.weather_code,
      humidity: current.relative_humidity_2m,
      feelsLike: typeof current.apparent_temperature === 'number' ? current.apparent_temperature : current.temperature_2m,
      windSpeed: typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : 0,
      isDay: typeof current.is_day === 'number' ? current.is_day === 1 : true,
      sunrise: daily?.sunrise?.[0] ?? '',
      sunset: daily?.sunset?.[0] ?? '',
      dailyHigh: daily?.temperature_2m_max?.[0] ?? current.temperature_2m,
      dailyLow: daily?.temperature_2m_min?.[0] ?? current.temperature_2m,
      uvIndex: daily?.uv_index_max?.[0] ?? 0
    }
  } catch {
    // 静默降级：网络错误 / 超时 / 响应解析失败均返回 null，不抛错不 toast
    return null
  }
}
