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

// 预定义分类 (不可删除) - 仅保留 3 个
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'office', name: '办公工具', icon: '💼', isBuiltIn: true, sort: 1 },
  { id: 'tech', name: '开发技术', icon: '💻', isBuiltIn: true, sort: 2 },
  { id: 'video', name: '视频音乐', icon: '🎬', isBuiltIn: true, sort: 3 }
]

export type CategoryId = typeof DEFAULT_CATEGORIES[number]['id']

// 向后兼容
export const CATEGORIES = DEFAULT_CATEGORIES
