/**
 * 自动扫描 public/icons/ 目录，生成 presetIcons.ts
 * 用户只需将图标文件放入 public/icons/，build 时自动包含
 * 
 * 规则：
 * - 同时有 .svg 和 .ico 时优先 .svg
 * - 中文名称保留，用作 label
 * - 已有 url 映射的图标自动关联 URL
 */
const fs = require('fs')
const path = require('path')

const ICONS_DIR = path.resolve(__dirname, '..', 'public', 'icons')
const OUTPUT_FILE = path.resolve(__dirname, '..', 'src', 'composables', 'presetIcons.ts')

// 中文名称到英文名称的映射
const NAME_TRANSLATIONS = {
  '美团': 'meituan',
  '携程': 'ctrip',
  '支付宝': 'alipay',
  '宝马': 'bmw',
  '本田': 'honda',
  '抖音': 'douyin',
  '豆瓣': 'douban',
  '豆包': 'doubao',
  '硅基流动': 'siliconflow',
  '快手': 'kuaishou',
  '龙虾': 'lobster',
  '淘宝': 'taobao',
  '天猫': 'tmall',
  '微信': 'wechat',
  '咸鱼': 'xianyu',
  '小红书': 'xiaohongshu',
  '智谱': 'zhipu',
  '飞书': 'feishu',
  '高伟达LOGO': 'git-logo',
  '高伟达邮箱': 'git-mail',
  '高德地图': 'amap',
  '阿里云官方-中文LOGO': 'aliyun-logo',
  '阿里云': 'aliyun',
  '阿里云盘': 'aliyun-drive',
  '链家': 'lianjia',
  '邮箱': 'email',
  '智联招聘': 'zhaopin',
  '华为商城': 'vmall',
  '小米': 'xiaomi',
  '小米商城': 'mi-mall',
  'c语言中文网': 'biancheng',
  'xxl开源项目': 'xxl-job',
  '人民网': 'people-com-cn',
  '中国天气网': 'weather-china',
  '计划生育服务站': 'family-planning',
  '魔搭GPT': 'modelscope',
  '百度一下_你就知道': 'baidu',
  '百度云盘': 'baidu-cloud',
  '码云_gitee_': 'gitee',
  '开源中国': 'oschina',
  '天气网': 'weather-com-cn',
  '哔哩哔哩': 'bilibili',
  '腾讯视频': 'tencent-video',
  '网易云音乐': '163-music',
  '今日头条': 'toutiao',
  '淘宝闪购': 'eleme',
  'WPS账号': 'wps-account',
  'QQ邮箱': 'qq-mail',
  'QQ音乐': 'qq-music',
  '百度云盘': 'baidu-cloud',
  '百度一下_你就知道': 'baidu',
  'alimail 阿里邮箱': 'alimail',
}

// 已知图标 URL 映射（用于自动关联）
const KNOWN_URLS = {
  github: 'https://github.com',
  stack_overflow: 'https://stackoverflow.com',
  zhihu: 'https://zhihu.com',
  'zhihu-square': 'https://www.zhihu.com',
  weibo: 'https://weibo.com',
  xiaohongshu: 'https://xiaohongshu.com',
  douban: 'https://douban.com',
  jianshu: 'https://jianshu.com',
  toutiao: 'https://toutiao.com',
  kuaishou: 'https://kuaishou.com',
  xianyu: 'https://xianyu.com',
  zhuanzhuan: 'https://zhuanzhuan.com',
  dianping: 'https://dianping.com',
  x: 'https://x.com',
  twitter: 'https://twitter.com',
  discord: 'https://discord.com',
  baidu: 'https://baidu.com',
  '百度一下_你就知道': 'https://www.baidu.com',
  taobao: 'https://taobao.com',
  tmall: 'https://tmall.com',
  jd: 'https://jd.com',
  '京东': 'https://www.jd.com',
  pinduoduo: 'https://pinduoduo.com',
  alipay: 'https://alipay.com',
  '支付宝': 'https://www.alipay.com',
  meituan: 'https://meituan.com',
  '美团': 'https://www.meituan.com',
  eleme: 'https://ele.me',
  '淘宝闪购': 'https://www.ele.me',
  ctrip: 'https://ctrip.com',
  '携程': 'https://www.ctrip.com',
  '12306': 'https://www.12306.cn',
  '高德地图': 'https://ditu.amap.com',
  qq: 'https://im.qq.com',
  wechat: 'https://weixin.qq.com',
  douyin: 'https://douyin.com',
  bilibili: 'https://bilibili.com',
  '哔哩哔哩': 'https://www.bilibili.com',
  wangyi: 'https://163.com',
  '网易云音乐': 'https://music.163.com',
  '360': 'https://360.com',
  '迅雷': 'https://www.xunlei.com',
  '天气网': 'https://www.weather.com.cn',
  '人民网': 'https://www.people.com.cn',
  goofish: 'https://www.goofish.com',
  '小米商城': 'https://www.mi.com',
  '华为商城': 'https://www.vmall.com',
  browser: '',
  vscode: 'https://code.visualstudio.com',
  jetbrains: 'https://www.jetbrains.com',
  nodejs: 'https://nodejs.org',
  npm: 'https://npmjs.com',
  gitlab: 'https://gitlab.com',
  '码云_gitee_': 'https://gitee.com',
  gitcode: 'https://gitcode.com',
  csdn: 'https://csdn.net',
  juejin: 'https://juejin.cn',
  '开源中国': 'https://www.oschina.net',
  processon: 'https://www.processon.com',
  wps: 'https://www.wps.cn',
  '飞书': 'https://www.feishu.cn',
  '智联招聘': 'https://www.zhaopin.com',
  '链家': 'https://www.lianjia.com',
  deepin: 'https://www.deepin.org',
  'c语言中文网': 'https://c.biancheng.net',
  'xxl开源项目': 'https://www.xuxueli.com',
  '高伟达邮箱': 'http://mail.git.com.cn',
  vue: 'https://vuejs.org',
  react: 'https://react.dev',
  typescript: 'https://typescriptlang.org',
  javascript: '',
  python: 'https://python.org',
  html: '',
  css: '',
  antdesign: 'https://ant.design',
  java: 'https://www.oracle.com/java',
  mysql: 'https://mysql.com',
  postgresql: 'https://postgresql.org',
  redis: 'https://redis.io',
  mongodb: 'https://mongodb.com',
  elasticsearch: 'https://elastic.co',
  sqlite: 'https://sqlite.org',
  supabase: 'https://supabase.com',
  spring: 'https://spring.io',
  nacos: 'https://nacos.io',
  seata: 'https://seata.io',
  apache_tomcat: 'https://tomcat.apache.org',
  apache_skywalking: 'https://skywalking.apache.org',
  arthas: 'https://arthas.aliyun.com',
  dataease: 'https://www.fit2cloud.com/dataease',
  aws: 'https://aws.amazon.com',
  '阿里云': 'https://www.aliyun.com',
  oceanbase: 'https://www.oceanbase.com',
  maven_central: 'https://central.sonatype.com',
  mdn: 'https://developer.mozilla.org',
  css_tricks: 'https://css-tricks.com',
  clawhub: 'https://clawhub.ai',
  trae: 'https://www.trae.com.cn',
  opencode: 'https://opencode.ai',
  tavily: 'https://tavily.com',
  core_s_bitcoin_staking: 'https://stake.coredao.org',
  'halo_建站工具': 'https://www.halo.run',
  microsoft: 'https://www.microsoft.com',
  youtube: 'https://youtube.com',
  google: 'https://google.com',
  apple: '',
  shields: '',
  openclaw: '',
  qwen: 'https://qwen.ai',
  tongyi: 'https://tongyi.aliyun.com',
  wenxin: 'https://yiyan.baidu.com',
  kimi: 'https://kimi.moonshot.cn',
  doubao: 'https://doubao.com',
  xinghuo: 'https://xinghuo.xfyun.cn',
  hunyuan: 'https://hunyuan.tencent.com',
  zhipu: 'https://zhipuai.cn',
  coze: 'https://coze.cn',
  siliconflow: 'https://siliconflow.com',
  metaso: 'https://metaso.cn',
  deepseek: 'https://deepseek.com',
  minimax: 'https://minimax.chat',
  chatgpt: 'https://chatgpt.com',
  modelscope: 'https://modelscope.cn',
  aistudio: 'https://aistudio.baidu.com',
  aibase: 'https://model.aibase.cn',
}

// 分类规则（根据名称自动归类）
function getCategory(name) {
  const n = name.toLowerCase()
  if (['github', 'stack_overflow', 'zhihu', 'zhihu-square', 'weibo', 'xiaohongshu', 'douban', 'jianshu', 'toutiao', 'kuaishou', 'xianyu', 'zhuanzhuan', 'dianping', 'x', 'twitter', 'discord', 'goofish'].includes(n)) return '社交与社区'
  if (['baidu', '百度一下_你就知道', 'taobao', 'tmall', 'jd', '京东', 'pinduoduo', 'alipay', '支付宝', 'meituan', '美团', 'eleme', '淘宝闪购', 'ctrip', '携程', '12306', '高德地图', 'qq', 'wechat', 'douyin', 'bilibili', '哔哩哔哩', 'wangyi', '网易云音乐', '360', '迅雷', '天气网', '人民网', '小米商城', '华为商城', 'openclaw_icon-logo'].includes(n)) return '国内常用网站'
  if (['browser', 'vscode', 'jetbrains', 'nodejs', 'npm', 'gitlab', '码云_gitee_', 'gitcode', 'csdn', 'juejin', '开源中国', 'processon', 'wps', '飞书', '智联招聘', '链家', 'deepin', 'c语言中文网', 'xxl开源项目', '高伟达邮箱'].includes(n)) return '工具与开发'
  if (['vue', 'react', 'typescript', 'javascript', 'python', 'html', 'css', 'antdesign'].includes(n)) return '前端技术'
  if (['java', 'mysql', 'postgresql', 'redis', 'mongodb', 'elasticsearch', 'sqlite', 'supabase', 'spring', 'nacos', 'seata', 'apache_tomcat', 'apache_skywalking', 'arthas', 'dataease'].includes(n)) return '后端与数据库'
  if (['aws', '阿里云', 'oceanbase', 'maven_central', 'mdn', 'css_tricks', 'clawhub', 'trae', 'opencode', 'tavily', 'core_s_bitcoin_staking', 'halo_建站工具', 'microsoft'].includes(n)) return '云服务与平台'
  if (['youtube', 'google', 'apple', 'shields'].includes(n)) return '视频与媒体'
  if (['qwen', 'tongyi', 'wenxin', 'kimi', 'doubao', 'xinghuo', 'hunyuan', 'zhipu', 'coze', 'siliconflow', 'metaso', 'deepseek', 'minimax', 'chatgpt', 'modelscope', 'aistudio', 'aibase'].includes(n)) return '大模型与 AI'
  return '其他'
}

// 生成显示名称（label）
function getLabel(name) {
  // 特殊映射
  const labelMap = {
    stack_overflow: 'Stack Overflow',
    'zhihu-square': '知乎',
    '百度一下_你就知道': '百度一下',
    '码云_gitee_': '码云 Gitee',
    'halo_建站工具': 'Halo 建站',
    'c语言中文网': 'C语言中文网',
    'xxl开源项目': 'XXL开源',
    '高伟达邮箱': '高伟达邮箱',
    core_s_bitcoin_staking: 'Core BTC',
    apache_tomcat: 'Tomcat',
    apache_skywalking: 'SkyWalking',
    maven_central: 'Maven Central',
    css_tricks: 'CSS-Tricks',
    openclaw_icon_logo: 'OpenClaw Logo',
    // 英文名称映射
    meituan: 'Meituan',
    ctrip: 'Ctrip',
    alipay: 'Alipay',
    baidu: 'Baidu',
    tmall: 'Tmall',
    jd: 'Jd',
    bilibili: 'Bilibili',
    douyin: 'Douyin',
    douban: 'Douban',
    xiaohongshu: 'Xiaohongshu',
    wechat: 'Wechat',
    zhipu: 'Zhipu',
    siliconflow: 'Siliconflow',
    modelscope: 'Modelscope',
    feishu: 'Feishu',
    gitee: 'Gitee',
    oschina: 'Oschina',
    amap: 'Amap',
    aliyun: 'Aliyun',
    eleme: 'Eleme',
    vmall: 'Vmall',
    xiaomi: 'Xiaomi',
    zhaopin: 'Zhaopin',
    lobsters: 'Lobster',
    family_planning: 'Family Planning',
    weather_china: 'Weather China',
    weather_com_cn: 'Weather.com',
    biancheng: 'Biancheng',
    xxl_job: 'XXL-Job',
    people_com_cn: 'People.com.cn',
    qq_mail: 'QQ Mail',
    qq_music: 'QQ Music',
    toutiao: 'Toutiao',
    tencent_video: 'Tencent Video',
    netease_music: '163 Music',
    wps_account: 'WPS Account',
    alimail: 'Alimail',
  }
  if (labelMap[name]) return labelMap[name]
  // 英文转友好名称：下划线变空格，首字母大写
  return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function main() {
  if (!fs.existsSync(ICONS_DIR)) {
    console.log('Icons directory not found:', ICONS_DIR)
    process.exit(1)
  }

  const files = fs.readdirSync(ICONS_DIR)
  
  // 解析所有图标文件
  const iconFiles = files.map(f => {
    const ext = path.extname(f).toLowerCase()
    if (ext !== '.svg' && ext !== '.ico') return null
    let base = path.basename(f, ext)
    
    // 转换为英文名称
    if (NAME_TRANSLATIONS[base]) {
      base = NAME_TRANSLATIONS[base]
    }
    
    return { file: f, name: base, ext: ext.slice(1) }
  }).filter(Boolean)

  // 按名称分组，优先选 .svg
  const grouped = {}
  iconFiles.forEach(ic => {
    if (!grouped[ic.name]) {
      grouped[ic.name] = { name: ic.name, svg: false, ico: false }
    }
    if (ic.ext === 'svg') grouped[ic.name].svg = true
    if (ic.ext === 'ico') grouped[ic.name].ico = true
  })

  // 生成图标列表
  const icons = Object.values(grouped).map(g => {
    const ext = g.svg ? 'svg' : 'ico'
    const url = KNOWN_URLS[g.name] || ''
    return { name: g.name, ext, url }
  }).sort((a, b) => a.name.localeCompare(b.name, 'zh'))

  // 按分类排序
  const categories = {}
  icons.forEach(icon => {
    const cat = getCategory(icon.name)
    if (!categories[cat]) categories[cat] = []
    categories[cat].push(icon)
  })

  // 生成代码
  let code = `/**
 * 预置图标列表 - 自动生成，请勿手动修改
 * 来源: public/icons/ 目录
 * 生成时间: ${new Date().toISOString()}
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
`

  const catOrder = ['社交与社区', '国内常用网站', '工具与开发', '前端技术', '后端与数据库', '云服务与平台', '大模型与 AI', '视频与媒体', '其他']
  catOrder.forEach(cat => {
    if (!categories[cat]) return
    code += `  // ${cat}\n`
    categories[cat].forEach(icon => {
      const label = getLabel(icon.name)
      const urlStr = icon.url ? `, url: '${icon.url}'` : ''
      code += `  { name: '${icon.name}', label: '${label}', ext: '${icon.ext}', category: '${cat}'${urlStr} },\n`
    })
    code += '\n'
  })

  code += `]

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
  return \`/icons/\${icon.name}.\${icon.ext}\`
}
`

  fs.writeFileSync(OUTPUT_FILE, code, 'utf-8')
  console.log(`Generated ${icons.length} icons -> ${OUTPUT_FILE}`)
}

main()
