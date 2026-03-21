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
  { name: 'zhihu-square', label: '知乎', url: 'https://www.zhihu.com' },
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
  { name: 'csdn', label: 'CSDN', url: 'https://csdn.net' },
  { name: 'juejin', label: '掘金', url: 'https://juejin.cn' },
  { name: 'jianshu', label: '简书', url: 'https://jianshu.com' },

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

  // 国内常用网站
  { name: 'taobao', label: '淘宝', url: 'https://taobao.com' },
  { name: 'tmall', label: '天猫', url: 'https://tmall.com' },
  { name: 'jd', label: '京东', url: 'https://jd.com' },
  { name: 'alipay', label: '支付宝', url: 'https://alipay.com' },
  { name: 'weibo', label: '微博', url: 'https://weibo.com' },
  { name: 'xiaohongshu', label: '小红书', url: 'https://xiaohongshu.com' },
  { name: 'qq', label: 'QQ', url: 'https://im.qq.com' },
  { name: 'wangyi', label: '网易', url: 'https://163.com' },
  { name: 'meituan', label: '美团', url: 'https://meituan.com' },
  { name: 'ctrip', label: '携程', url: 'https://ctrip.com' },
  { name: 'eleme', label: '饿了么', url: 'https://ele.me' },
  { name: 'zhuanzhuan', label: '转转', url: 'https://zhuanzhuan.com' },
  { name: 'kuaishou', label: '快手', url: 'https://kuaishou.com' },
  { name: 'toutiao', label: '今日头条', url: 'https://toutiao.com' },
  { name: 'dianping', label: '大众点评', url: 'https://dianping.com' },
  { name: 'xianyu', label: '闲鱼', url: 'https://xianyu.com' },
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
