/**
 * 预置图标列表 - 自动生成，请勿手动修改
 * 来源: public/icons/ 目录
 * 生成时间: 2026-09-15T12:22:59.942Z
 * 
 * 用户只需将图标文件放入 public/icons/，build 时自动包含
 */
export interface PresetIcon {
  name: string
  label: string
  ext: 'svg' | 'ico'
  url?: string
  category: string
}

export const PRESET_ICONS: PresetIcon[] = [
  // 云服务与平台
  { name: 'opencode', label: 'Opencode', ext: 'svg', category: '云服务与平台', url: 'https://opencode.ai' },

  // 大模型与 AI
  { name: 'deepseek', label: 'Deepseek', ext: 'svg', category: '大模型与 AI', url: 'https://deepseek.com' },

  // 其他
  { name: 'cron', label: 'Cron', ext: 'svg', category: '其他' },
  { name: 'elsfk', label: 'Elsfk', ext: 'svg', category: '其他' },
  { name: 'fangge', label: 'Fangge', ext: 'svg', category: '其他' },
  { name: 'gushi', label: 'Gushi', ext: 'svg', category: '其他' },
  { name: 'haoma', label: 'Haoma', ext: 'svg', category: '其他' },
  { name: 'szbf', label: 'Szbf', ext: 'svg', category: '其他' },

]

/**
 * 根据 URL 查找预置图标
 */
export function findPresetIconByUrl(url: string): PresetIcon | null {
  try {
    const domain = new URL(url).hostname.replace('www.', '')
    return PRESET_ICONS.find(icon => {
      if (!icon.url) return false
      const iconDomain = new URL(icon.url).hostname.replace('www.', '')
      return domain === iconDomain || domain.endsWith('.' + iconDomain)
    }) ?? null
  } catch {
    return null
  }
}

/**
 * 获取图标的完整路径
 */
export function getIconPath(icon: PresetIcon): string {
  return `/icons/${icon.name}.${icon.ext}`
}
