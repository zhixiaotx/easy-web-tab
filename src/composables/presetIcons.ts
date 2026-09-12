/**
 * 预置图标列表 - 自动生成，请勿手动修改
 * 来源: public/icons/ 目录
 * 生成时间: 2026-09-12T12:26:44.371Z
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
