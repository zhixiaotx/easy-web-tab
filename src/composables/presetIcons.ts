/**
 * 预置图标列表 - 自动生成，请勿手动修改
 * 来源: public/icons/ 目录
 * 生成时间: 2026-08-16T07:57:54.575Z
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
  // 国内常用网站
  { name: '12306', label: '12306', ext: 'svg', category: '国内常用网站', url: 'https://www.12306.cn' },
  { name: 'baidu', label: 'Baidu', ext: 'svg', category: '国内常用网站', url: 'https://baidu.com' },
  { name: 'bilibili', label: 'Bilibili', ext: 'svg', category: '国内常用网站', url: 'https://bilibili.com' },
  { name: 'douyin', label: 'Douyin', ext: 'svg', category: '国内常用网站', url: 'https://douyin.com' },
  { name: 'jd', label: 'Jd', ext: 'svg', category: '国内常用网站', url: 'https://jd.com' },

  // 大模型与 AI
  { name: 'deepseek', label: 'Deepseek', ext: 'svg', category: '大模型与 AI', url: 'https://deepseek.com' },

  // 其他
  { name: 'aliyun-drive', label: 'Aliyun-drive', ext: 'svg', category: '其他' },
  { name: 'cron', label: 'Cron', ext: 'svg', category: '其他' },
  { name: 'elsfk', label: 'Elsfk', ext: 'svg', category: '其他' },
  { name: 'fangge', label: 'Fangge', ext: 'svg', category: '其他' },
  { name: 'gushi', label: 'Gushi', ext: 'svg', category: '其他' },
  { name: 'haoma', label: 'Haoma', ext: 'svg', category: '其他' },
  { name: 'jingdong', label: 'Jingdong', ext: 'svg', category: '其他' },
  { name: 'qq-mail', label: 'Qq-mail', ext: 'svg', category: '其他' },
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
