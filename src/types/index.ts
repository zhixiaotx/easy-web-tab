export interface Site {
  name: string
  url: string
  description?: string
  category: string
  tags: string[]
  icon?: string
  sort?: number
  createdAt?: string
  updatedAt?: string
  isValid?: boolean  // 断链检测结果，undefined=未检测
}

export interface SitesData {
  sites: Site[]
  lastUpdated?: string
}

// 分类接口
export interface Category {
  id: string
  name: string
  icon: string
  isBuiltIn: boolean
  sort?: number
}

// 预定义分类 (不可删除) - 仅保留 video
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'video', name: '视频音乐', icon: '🎬', isBuiltIn: true, sort: 1 }
]

// 向后兼容
export const CATEGORIES = DEFAULT_CATEGORIES

// 密码管理接口
export interface PasswordEntry {
  id: string
  siteName: string
  url: string
  username: string
  password: string // 加密存储 (base64)
  createdAt: string
  updatedAt: string
}

// 倒计时接口
export interface Countdown {
  id: string
  name: string
  endDateTime: string // 'YYYY-MM-DDTHH:mm' LOCAL time, no timezone suffix, e.g. '2026-12-31T23:59'
  repeat?: 'yearly' | null // 'yearly' = recurs every year (birthdays); null/absent = one-off
  createdAt: string
  updatedAt: string
}
