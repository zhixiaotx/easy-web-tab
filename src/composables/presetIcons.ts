/**
 * 预置图标列表
 * 图标路径: public/icons/{name}.svg
 */
export interface PresetIcon {
  name: string
  label: string
  url?: string  // 如果有对应网站，填 URL
}

export const PRESET_ICONS: PresetIcon[] = [
  // 社交与社区
  { name: 'github', label: 'GitHub', url: 'https://github.com' },
  { name: 'baidu', label: '百度', url: 'https://baidu.com' },
  { name: 'zhihu', label: '知乎', url: 'https://zhihu.com' },
  { name: 'douyin', label: '抖音', url: 'https://douyin.com' },
  { name: 'bilibili', label: '哔哩哔哩', url: 'https://bilibili.com' },
  { name: 'douban', label: '豆瓣', url: 'https://douban.com' },
  { name: 'wechat', label: '微信', url: 'https://weixin.qq.com' },
  { name: 'twitter', label: 'Twitter/X', url: 'https://twitter.com' },
  { name: 'discord', label: 'Discord', url: 'https://discord.com' },
  { name: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com' },

  // 工具与开发
  { name: 'vscode', label: 'VS Code', url: 'https://code.visualstudio.com' },
  { name: 'nodejs', label: 'Node.js', url: 'https://nodejs.org' },
  { name: 'npm', label: 'npm', url: 'https://npmjs.com' },
  { name: 'github', label: 'GitHub', url: 'https://github.com' },
  { name: 'gitlab', label: 'GitLab', url: 'https://gitlab.com' },

  // 前端技术
  { name: 'vue', label: 'Vue', url: 'https://vuejs.org' },
  { name: 'react', label: 'React', url: 'https://react.dev' },
  { name: 'typescript', label: 'TypeScript', url: 'https://typescriptlang.org' },
  { name: 'javascript', label: 'JavaScript' },
  { name: 'antdesign', label: 'Ant Design', url: 'https://ant.design' },
  { name: 'html', label: 'HTML5' },
  { name: 'css', label: 'CSS3' },

  // 视频与媒体
  { name: 'youtube', label: 'YouTube', url: 'https://youtube.com' },
  { name: 'google', label: 'Google', url: 'https://google.com' },

  // 云服务
  { name: 'aws', label: 'AWS', url: 'https://aws.amazon.com' },
  { name: 'apple', label: 'Apple' },
  { name: 'shields', label: 'Shields.io' },

  // 通用
  { name: 'browser', label: '浏览器' },
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
