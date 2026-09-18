<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Icon from './Icon.vue'
import { useAppSettingsStore } from '@/stores/settings'
const settingsStore = useAppSettingsStore()
const emit = defineEmits<{
  close: []
}>()

async function downloadExample() {
  try {
    const resp = await fetch('/data/myself-sites.md')
    if (!resp.ok) throw new Error('下载失败')
    const text = await resp.text()
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'site.md'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    alert('示例文件下载失败，请稍后重试')
  }
}

async function downloadIcons() {
  try {
    const resp = await fetch('/icons/icons.json')
    if (!resp.ok) throw new Error('下载失败')
    const text = await resp.text()
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'icons.json'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    alert('图标文件下载失败，请稍后重试')
  }
}

async function downloadSkill() {
  try {
    const resp = await fetch('/skills/easy-webtab-backup-editor.zip')
    if (!resp.ok) throw new Error('下载失败')
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'easy-webtab-backup-editor.zip'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    alert('技能文件下载失败，请稍后重试')
  }
}

const copied = ref('')
async function copyText(text: string, field: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = field
    setTimeout(() => { if (copied.value === field) copied.value = '' }, 1500)
  } catch {
    alert('复制失败，请手动复制')
  }
}

const shortcuts = [
  { key: 'Ctrl + N', action: '新增网址' },
  { key: 'Ctrl + D', action: '切换暗色模式' },
  { key: 'ESC', action: '关闭弹窗' }
]

const features = [
  {
    icon: 'link',
    title: '网址管理',
    desc: '添加、编辑、删除网址。支持自动获取网站标题、描述和图标。'
  },
  {
    icon: 'folder',
    title: '分类管理',
    desc: '内置视频音乐分类，可自定义添加新分类。历史分类自动迁移，不会丢失数据。'
  },
  {
    icon: 'bookmark',
    title: '标签筛选',
    desc: '每个网址可打多个标签，标签根据当前分类动态显示，方便精准筛选。'
  },
  {
    icon: 'link',
    title: '断链检测',
    desc: '点击「检测断链」自动检测所有网址可用性，无效链接显示警告标记，鼠标悬停可手动取消失效标记。'
  },
  {
    icon: 'search',
    title: '全文搜索',
    desc: '支持按名称、描述、标签搜索，输入即显示结果。'
  },
  {
    icon: 'refresh',
    title: '拖拽排序',
    desc: '拖拽网址卡片交换位置，自动保存排序结果。'
  },
  {
    icon: 'download',
    title: '导入/导出',
    desc: '导出为 Markdown 文件备份，支持按分类/搜索引擎/网址排序导出，上传 .md 文件批量导入，自动按 URL 去重。'
  },
  {
    icon: 'save',
    title: '数据备份',
    desc: '自动保存最近10个版本的历史数据，支持一键恢复到任意历史版本。'
  },
  {
    icon: 'weather-night',
    title: '暗色模式',
    desc: '点击右上角月亮图标切换深色主题，适合夜间使用。图片背景模式下自动隐藏。'
  },
  {
    icon: 'image',
    title: '背景图片',
    desc: '支持上传本地图片作为背景，图片背景模式下自动隐藏主题切换按钮。'
  },
  {
    icon: 'trending-up',
    title: '点击频率排序',
    desc: '网址按点击频率自动排序，常用网址置顶，方便快速访问。'
  },
  {
    icon: 'tag',
    title: '图标本地化',
    desc: '网站图标自动缓存到本地，无网络时也能正常显示，同时提供预设图标可选。'
  },
  {
    icon: 'search',
    title: '搜索引擎管理',
    desc: '添加/删除自定义搜索引擎，支持设置默认搜索，可在搜索栏快速切换。提供恢复默认按钮。'
  },
  {
    icon: 'lock',
    title: '密码管理',
    desc: 'AES-CBC 加密存储账号密码（位于「工作台」面板），支持主密码保护、一键复制、按网站名称搜索，新增加密存储时自动关联书签网站信息。'
  }
]

// ===== 标签页 =====
const TABS = [
  { key: 'nav', icon: 'link', label: '网址导航' },
  { key: 'workbench', icon: 'toolbox', label: '个人工作台' },
  { key: 'business', icon: 'store', label: '销售记账台' },
  { key: 'student', icon: 'notes', label: '学生工作台' },
  { key: 'data', icon: 'keyboard', label: '快捷键与数据' }
] as const
type TabKey = (typeof TABS)[number]['key']
const activeTab = ref<TabKey>('nav')

// 标签页可见性：工作台/销售记账/学生工作台开关关闭时对应标签页隐藏
const visibleTabs = computed(() => TABS.filter(t => {
  if (t.key === 'workbench') return settingsStore.workbenchPageVisible !== false
  if (t.key === 'business') return settingsStore.businessPageVisible !== false
  if (t.key === 'student') return settingsStore.studentPageVisible !== false
  return true
}))

// 确保当前激活标签页可见，开关关闭后自动回退到首项
const visibleActiveTab = computed(() => {
  const keys = visibleTabs.value.map(t => t.key)
  return keys.includes(activeTab.value) ? activeTab.value : keys[0]
})
watch(visibleActiveTab, (v) => { if (v && v !== activeTab.value) activeTab.value = v })

// ===== 个人工作台：10 个面板 =====
interface PanelDoc {
  icon: string
  name: string
  desc: string
  tips: string
}

const wbPanels: PanelDoc[] = [
  {
    icon: 'home',
    name: '主页',
    desc: '工作台总览：待办 / 便签快捷添加，今日数据速览，即将到期的定时提醒。',
    tips: '内嵌天气卡与日历锚点（发薪日、生日纪念日倒计时）。'
  },
  {
    icon: 'todos',
    name: '工作待办',
    desc: '自定义分类管理待办，支持分类筛选、优先级标记与完成状态。',
    tips: '分类被引用时禁止删除；重命名会自动同步历史条目的分类。'
  },
  {
    icon: 'notes',
    name: '个人便签',
    desc: '便签 + 时光轴双形态：普通便签随手记，时光轴按时间线留存重要节点。',
    tips: '便签分类删除后，其下便签自动归入「未分类」，不会丢失。'
  },
  {
    icon: 'diary',
    name: '日记本',
    desc: '每日一篇，按本地日期唯一存储，同一天再次保存即为更新。',
    tips: '日期键按本地时区计算，不会因 UTC 偏移串到前一天。'
  },
  {
    icon: 'countdowns',
    name: '定时提醒',
    desc: '6 种重复规则（一次 / 每天 / 每周 / 每月 / 每年 / 自定义间隔），6 类默认分类可自定义扩展。',
    tips: '三通道提醒：弹框 + 桌面通知 + 邮件（需单独开启）；每天 9:00 发送当日摘要，摘要永不发邮件。'
  },
  {
    icon: 'pomodoro',
    name: '番茄钟',
    desc: '专注计时器，工作与休息交替，帮助保持节奏。',
    tips: '配合「定时提醒」的倒计时分类，可统一管理专注时段。'
  },
  {
    icon: 'habits',
    name: '习惯打卡',
    desc: '建立习惯清单，按天打卡，连续天数与完成率一目了然。',
    tips: '适合配合每日固定时间的倒计时提醒，形成稳定节奏。'
  },
  {
    icon: 'passwords',
    name: '密码管理',
    desc: 'AES-CBC 加密存储账号密码，主密码解锁后才能查看，支持一键复制与按网站名搜索。',
    tips: '安全策略：5 分钟无操作自动锁定；云同步采用「云端覆盖本地」，增删改后立即推送。'
  },
  {
    icon: 'health',
    name: '健康管理',
    desc: '四个子面板：运动、饮食、睡眠、体重，含目标计划与按天记录。',
    tips: 'BMI 按国标 WS/T 428-2013 分级；面板顶部「定时提醒」区块按倒计时分类 1:1 映射，只读展示。'
  },
  {
    icon: 'ledger',
    name: '记账',
    desc: '六指标统计（收入 / 支出 / 结余 / 存款 / 笔数 / 支出比），近 6 个月收支趋势柱图与支出分类环形图。',
    tips: '支持分组管理与金额一键掩码；图表区可折叠，防止挤压记录列表。'
  }
]

// ===== 销售记账台：7 个模块 =====
const bsModules: PanelDoc[] = [
  {
    icon: 'home',
    name: '首页',
    desc: '经营总览：营业额与利润总额主指标，成本 / 支出 / 毛利率统计卡。',
    tips: '含低库存预警清单（默认阈值 20）与分类销售排行树状图，可直接跳转对应模块。'
  },
  {
    icon: 'products',
    name: '商品',
    desc: '商品档案：名称、分类、进货价、售价，自动计算加价率，可标记停售。',
    tips: '商品分类支持自定义、排序与显隐；停售商品不参与低库存预警。'
  },
  {
    icon: 'purchases',
    name: '进货',
    desc: '记录每次进货的商品、数量与金额，是库存的唯一增加来源。',
    tips: '进货价变动会同步影响成本与利润计算，务必如实填写。'
  },
  {
    icon: 'daily',
    name: '收摊',
    desc: '每日收摊登记：每件商品带出多少、剩余多少、损耗多少，自动算出当日营业额。',
    tips: '核心数据入口，营业额与成本全部由这里的三条数量推导。'
  },
  {
    icon: 'expenses',
    name: '支出',
    desc: '记录摊位费、交通等经营支出，按分类归集，可查看支出占比与趋势。',
    tips: '内置 8 个分类不可删除；支出独立统计，不计入商品成本。'
  },
  {
    icon: 'inventory',
    name: '库存',
    desc: '实时库存由进货与收摊记录自动推导，无需手工盘点。',
    tips: '可查看每个商品的库存构成来源（进货、带出、剩余明细）。'
  },
  {
    icon: 'stats',
    name: '统计',
    desc: '近 N 天经营趋势（每日一柱）、支出占比、营业占比，支持切换天数。',
    tips: '趋势图支持分段查看，长按或悬停可看具体数值。'
  }
]

// ===== 销售记账核心公式 =====
const bsFormulas = [
  { label: '售出数量', expr: '带出 - 剩余 - 损耗' },
  { label: '当前库存', expr: '累计进货 - 累计售出 - 累计损耗' },
  { label: '营业额', expr: '累计（售出数量 × 售价）' },
  { label: '成本 COGS', expr: '累计（售出数量 × 进货价）' },
  { label: '利润', expr: '营业额 - 成本' },
  { label: '毛利率', expr: '利润 ÷ 营业额' }
]

// ===== 销售记账推荐流程 =====
const bsFlow = [
  { step: '1', text: '建商品档案：先录入商品与进货价、售价' },
  { step: '2', text: '记进货：每次进货登记数量，库存随之增加' },
  { step: '3', text: '每日收摊：填带出、剩余、损耗，当日营业额自动生成' },
  { step: '4', text: '记支出：登记摊位费等经营支出' },
  { step: '5', text: '看统计：在统计页查看趋势、占比与排行' }
]

// ===== 学生工作台模块 =====
const studentModules: PanelDoc[] = [
  {
    icon: 'home',
    name: '主页',
    desc: '问候条 + 三屏轮播（行动台/数据概览/工具栏），6 秒自动轮播，鼠标悬停暂停。',
    tips: '学段徽标显示在问候条右侧，点击行动台卡片直接进入对应面板。'
  },
  {
    icon: 'habits',
    name: '习惯打卡',
    desc: '按学段播种默认习惯种子（K 7 项 / P 6 项 / J 5 项），家长协同查看完成情况。',
    tips: 'K 段为家长主导，J 段隐藏习惯面板（自主学习）。'
  },
  {
    icon: 'todos',
    name: '作业管理',
    desc: '按学科录入作业，支持截止日期、完成状态、附件图片；K 段改为游戏化任务卡片。',
    tips: 'P/J 段专属，K 段默认隐藏。'
  },
  {
    icon: 'countdowns',
    name: '课程表',
    desc: '周视图 + 当日课时高亮，支持节次配置与调课；K 段改为每日活动安排。',
    tips: 'P/J 段专属，K 段默认隐藏。'
  },
  {
    icon: 'notes',
    name: '学习计划',
    desc: '周计划 + 单元计划，自动联动作业/复习/错题。',
    tips: 'P/J 段专属，K 段默认隐藏。'
  },
  {
    icon: 'diary',
    name: '复习计划',
    desc: '艾宾浩斯遗忘曲线提醒，按学科 + 错题关联。',
    tips: 'P/J 段专属，K 段默认隐藏。'
  },
  {
    icon: 'passwords',
    name: '错题本',
    desc: '拍照录入 + 学科分类 + 复习关联。',
    tips: 'P/J 段专属，K 段默认隐藏。'
  },
  {
    icon: 'notes',
    name: '阅读记录',
    desc: '书目 + 阅读时长 + 笔记摘录，全学段开放。',
    tips: '所有学段默认显示。'
  },
  {
    icon: 'countdowns',
    name: '考试倒计时',
    desc: '复用倒计时引擎，按学科 + 考试类型分类。',
    tips: 'J 段默认显示，K/P 段默认隐藏。'
  },
  {
    icon: 'diary',
    name: '学习日记',
    desc: '每日一篇，Markdown 编辑 + 历史回顾，全学段开放。',
    tips: '所有学段默认显示。'
  },
  {
    icon: 'pomodoro',
    name: '番茄钟',
    desc: '复用成人番茄钟，学段默认时长（K 15+5 / P 25+5 / J 50+10 分钟）。',
    tips: 'J 段默认显示，K/P 段默认隐藏。'
  },
  {
    icon: 'habits',
    name: '成就勋章',
    desc: '完成作业/习惯/阅读自动颁发勋章，K/P 段专属。',
    tips: 'J 段隐藏（无激励引导）。'
  },
  {
    icon: 'ledger',
    name: '奖励积分',
    desc: '完成动作自动攒积分，家长可兑换奖励，K/P 段专属。',
    tips: 'J 段隐藏（无激励引导）。'
  },
  {
    icon: 'health',
    name: '家长协同',
    desc: 'PIN 解锁后查看孩子学习概况、完成情况、奖励兑换，K/P 段专属。',
    tips: 'J 段隐藏（独立学习，无家长入口）。'
  }
]

// ===== 学生工作台使用流程 =====
const studentFlow = [
  { step: '1', text: '选择学段：首次进入弹出学段引导，K/P/J 三段菜单自动适配' },
  { step: '2', text: '设学生信息：昵称、学号、学校、年级（选填）' },
  { step: '3', text: '管学科清单：K 段无学科，P 段 3 科，J 段 9 科，可自定义增删' },
  { step: '4', text: '调菜单开关：根据学段默认隐藏的菜单可手动开启' },
  { step: '5', text: '开始使用：进入各面板录入数据（M2 起逐步上线各模块）' }
]

// ===== 工作台快捷键 =====
const wbShortcuts = [
  { key: 'Alt + K', action: '打开全局搜索浮层' },
  { key: 'Ctrl + Alt + 1~9', action: '跳转左侧菜单第 N 项' },
  { key: 'g', action: '个人工作台与销售记账台互相切换' },
  { key: '[ / ]', action: '切换到上一个 / 下一个模块' },
  { key: 'ESC', action: '关闭搜索浮层' }
]

// ===== 云同步要点 =====
const syncNotes = [
  '基于 WebDAV 协议，坚果云等任意 WebDAV 服务均可，在「设置 - 云同步」中配置。',
  '后台自动同步静默执行，不会弹提示打扰；同步按钮变红代表失败，点一下即可看到具体错误。',
  '密码库采用「云端覆盖本地」策略：拉取时以云端为准，避免本地旧密文覆盖新数据。',
  '密码增删改后会立即主动推送，无需等待定时轮询。',
  '两端主密码不一致时，面板会锁定并要求输入来源设备的主密码解锁。',
  '所有数据都会写成 backup.json 并随云同步落地；配置好云同步后，可直接用智能体（技能）以自然语言新增网站与工作台内容，无需手动导出导入。'
]

// ===== 用智能体（技能）新增 / 修改数据 =====
const skillName = 'easy-webtab-backup-editor'

// 提示词示例：直接对智能体说出即可触发技能
const skillPrompts = [
  { scenario: '新增网站', text: '帮我在导航里加一个网站：淘宝，链接 https://www.taobao.com，标签 购物' },
  { scenario: '记一笔消费', text: '记一笔消费：今天早餐 16.5 元，备注两杯豆浆一个馅饼' },
  { scenario: '新增商品', text: '新增商品 烤冷面，进货价 3 元，售价 8 元' },
  { scenario: '记收摊记录', text: '记今天收摊：烤冷面带出 30 份、剩余 5 份、损耗 1 份' },
  { scenario: '加一条待办', text: '加一条待办：周五前写完周报，优先级高' },
  { scenario: '写便签', text: '写个便签：购物清单，内容 牛奶、面包、鸡蛋' }
]

// 技能安装步骤
const skillInstall = [
  { step: '1', text: '打开 WorkBuddy「专家 / 技能」中心，搜索并进入 easy-webtab-backup-editor 技能页。' },
  { step: '2', text: '点击「安装」，技能会写入用户级目录 ~/.workbuddy/skills/，无需手动配置路径即可生效。' },
  { step: '3', text: '安装后，直接用自然语言对智能体说出新增需求（如“加一个网站 / 记一笔消费”），智能体自动触发该技能。' },
  { step: '4', text: '技能把数据写入云端备份文件 backup.json，随云同步在任意设备自动生效；修改或删除请在管理界面操作。' }
]
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="help-modal">
      <div class="modal-header">
        <h2><Icon name="lightbulb" /> 使用帮助</h2>
        <button class="close-btn" @click="emit('close')" title="关闭">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- 标签页导航 -->
      <div class="help-tabs" role="tablist">
        <button
          v-for="tab in visibleTabs"
          :key="tab.key"
          class="help-tab"
          :class="{ active: activeTab === tab.key }"
          :aria-selected="activeTab === tab.key"
          :data-testid="`help-tab-${tab.key}`"
          role="tab"
          @click="activeTab = tab.key"
        >
          <span class="help-tab-icon"><Icon :name="tab.icon" :size="16" /></span>
          <span class="help-tab-label">{{ tab.label }}</span>
        </button>
      </div>

      <div class="modal-body">
        <!-- ===== 标签 1：网址导航 ===== -->
        <template v-if="activeTab === 'nav'">
        <!-- 云同步体验账号 -->
        <section class="help-section">
          <div class="download-card">
            <div class="download-info">
              <span class="download-icon"><Icon name="cloud" /></span>
              <div>
                <h4>云同步 · 体验账号</h4>
                <p>想先体验云同步、又不想自己搭服务器？可用下面的公共体验账号（WebDAV 直连，与本站同源，无需额外配置）：</p>
                <ul class="sync-account">
                  <li>
                    <span class="sync-label">同步地址</span>
                    <code>https://www.codehelp.com.cn/dav/</code>
                    <button class="btn-copy" @click="copyText('https://www.codehelp.com.cn/dav/', 'url')">{{ copied === 'url' ? '已复制' : '复制' }}</button>
                  </li>
                  <li>
                    <span class="sync-label">用户名</span>
                    <code>public</code>
                    <button class="btn-copy" @click="copyText('public', 'user')">{{ copied === 'user' ? '已复制' : '复制' }}</button>
                  </li>
                  <li>
                    <span class="sync-label">密码</span>
                    <code>public</code>
                    <button class="btn-copy" @click="copyText('public', 'pass')">{{ copied === 'pass' ? '已复制' : '复制' }}</button>
                  </li>
                </ul>
                <p class="sync-note"><Icon name="info" :size="13" />
                  在「设置 → 云同步」中填入以上三项后点「测试连接」即可。
                  该账号为 <strong>公共共享账号</strong>，<strong>每晚凌晨 2 点自动恢复初始数据</strong>，
                  请勿存放重要或私密信息，也不要期待数据长期保留。
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- 示例数据下载 -->
        <section class="help-section download-section">
          <div class="download-card">
            <div class="download-info">
              <span class="download-icon"><Icon name="package" /></span>
              <div>
                <h4>下载示例数据</h4>
                <p>下载预置的网址导航示例文件 <code>site.md</code> 与图标数据 <code>icons.json</code>，包含常用网站分类、链接和预设图标。网址文件下载后在管理后台点击「导入」上传，即可快速初始化导航页。</p>
              </div>
            </div>
            <div class="download-actions">
              <button class="btn-download" @click="downloadExample">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                下载网址
              </button>
              <button class="btn-download" @click="downloadIcons">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                下载图标
              </button>
            </div>
          </div>
        </section>

        <!-- 功能介绍 -->
        <section class="help-section">
          <h3 class="section-title"><Icon name="target" /> 功能介绍</h3>
          <div class="features-grid">
            <div
              v-for="feature in features"
              :key="feature.title"
              class="feature-item"
            >
              <span class="feature-icon"><Icon :name="feature.icon" /></span>
              <div class="feature-content">
                <h4>{{ feature.title }}</h4>
                <p>{{ feature.desc }}</p>
              </div>
            </div>
          </div>
        </section>

        <!-- 页面模式 -->
        <section class="help-section">
          <h3 class="section-title"><Icon name="document" /> 页面模式</h3>
          <div class="mode-info">
            <div class="mode-item">
              <span class="mode-badge mode-admin">管理后台</span>
              <p>路由 <code>/</code>，默认页面，可添加/编辑/删除网址，管理分类和搜索引擎。</p>
            </div>
          </div>
        </section>

        </template>

        <!-- ===== 标签 2：个人工作台 ===== -->
        <template v-if="activeTab === 'workbench'">
          <section class="help-section">
            <h3 class="section-title"><Icon name="toolbox" /> 个人工作台</h3>
            <div class="panel-intro">
              <p>路由 <code>/workbench</code>。10 个面板覆盖日常事务管理，菜单顺序、名称与显隐可在「设置 - 工作台」中调整，不用的面板可以关掉。</p>
            </div>
            <div class="panels-grid">
              <div v-for="p in wbPanels" :key="p.name" class="panel-item">
                <div class="panel-head">
                  <span class="panel-icon"><Icon :name="p.icon" :size="18" /></span>
                  <h4>{{ p.name }}</h4>
                </div>
                <p class="panel-desc">{{ p.desc }}</p>
                <p class="panel-tips"><Icon name="lightbulb" :size="13" /> {{ p.tips }}</p>
              </div>
            </div>
          </section>
        </template>

        <!-- ===== 标签 3：销售记账台 ===== -->
        <template v-if="activeTab === 'business'">
          <section class="help-section">
            <h3 class="section-title"><Icon name="store" /> 销售记账台</h3>
            <div class="panel-intro">
              <p>路由 <code>/business</code>。面向摆摊与小微零售的进销存闭环：只需录入进货、收摊、支出三类动作，库存与利润全部自动推导。</p>
            </div>
            <div class="panels-grid">
              <div v-for="m in bsModules" :key="m.name" class="panel-item">
                <div class="panel-head">
                  <span class="panel-icon"><Icon :name="m.icon" :size="18" /></span>
                  <h4>{{ m.name }}</h4>
                </div>
                <p class="panel-desc">{{ m.desc }}</p>
                <p class="panel-tips"><Icon name="lightbulb" :size="13" /> {{ m.tips }}</p>
              </div>
            </div>
          </section>

          <section class="help-section">
            <h3 class="section-title"><Icon name="trending-up" /> 核心计算公式</h3>
            <div class="formula-list">
              <div v-for="f in bsFormulas" :key="f.label" class="formula-item">
                <span class="formula-label">{{ f.label }}</span>
                <code class="formula-expr">{{ f.expr }}</code>
              </div>
            </div>
            <p class="formula-note">支出为独立统计项，不计入成本，因此「利润」是毛利口径；算净利请用利润减去支出。</p>
          </section>

          <section class="help-section">
            <h3 class="section-title"><Icon name="target" /> 推荐使用流程</h3>
            <ol class="flow-list">
              <li v-for="s in bsFlow" :key="s.step">
                <span class="flow-step">{{ s.step }}</span>
                <span class="flow-text">{{ s.text }}</span>
              </li>
            </ol>
          </section>
        </template>

        <!-- ===== 标签 4：学生工作台 ===== -->
        <template v-if="activeTab === 'student'">
          <section class="help-section">
            <h3 class="section-title"><Icon name="notes" /> 学生工作台</h3>
            <div class="panel-intro">
              <p>路由 <code>/student</code>。面向幼儿园、小学、初中学生的学习成长工作台：复用成人工作台架构，按学段差异化加载面板与默认数据，K/P/J 三段菜单与默认习惯/学科清单自动适配。</p>
            </div>
            <div class="panels-grid">
              <div v-for="m in studentModules" :key="m.name" class="panel-item">
                <div class="panel-head">
                  <span class="panel-icon"><Icon :name="m.icon" :size="18" /></span>
                  <h4>{{ m.name }}</h4>
                </div>
                <p class="panel-desc">{{ m.desc }}</p>
                <p class="panel-tips"><Icon name="lightbulb" :size="13" /> {{ m.tips }}</p>
              </div>
            </div>
          </section>

          <section class="help-section">
            <h3 class="section-title"><Icon name="target" /> 学段差异</h3>
            <ul class="storage-list">
              <li><strong>幼儿园（K）</strong>：游戏化任务卡片、家长主导、图标化界面；7 项默认习惯种子（刷牙/洗脸/收拾玩具/阅读绘本等）；无学科；番茄钟默认 15+5 分钟。</li>
              <li><strong>小学（P）</strong>：作业管理 + 课程表 + 习惯养成 + 阅读记录；3 科默认学科（语数英）；6 项默认习惯种子；番茄钟默认 25+5 分钟。</li>
              <li><strong>初中（J）</strong>：学科管理 + 复习计划 + 错题本 + 考试倒计时；9 科默认学科；5 项默认习惯种子；番茄钟默认 50+10 分钟；家长入口隐藏。</li>
            </ul>
          </section>

          <section class="help-section">
            <h3 class="section-title"><Icon name="lightbulb" /> 使用流程</h3>
            <ol class="flow-list">
              <li v-for="s in studentFlow" :key="s.step">
                <span class="flow-step">{{ s.step }}</span>
                <span class="flow-text">{{ s.text }}</span>
              </li>
            </ol>
            <p class="formula-note">学段切换将应用该学段默认菜单可见性与默认学科清单，已有自定义学科保留。</p>
          </section>
        </template>

        <!-- ===== 标签 5：快捷键与数据 ===== -->
        <template v-if="activeTab === 'data'">
        <!-- 数据存储 -->
        <section class="help-section">
          <h3 class="section-title"><Icon name="save" /> 数据存储</h3>
          <ul class="storage-list">
            <li><strong>内置数据</strong>：构建进包，不可动态修改</li>
            <li><strong>用户数据</strong>：存储于浏览器 <code>localStorage</code>，包括网址、分类、搜索引擎</li>
            <li><strong>工作台数据</strong>：存储于浏览器 <code>IndexedDB</code>，包括待办、便签、倒计时、密码</li>
            <li><strong>密码数据</strong>：AES-CBC 加密后存储于 IndexedDB，需主密码解锁才能查看</li>
            <li><strong>断链检测结果</strong>：存储于 <code>localStorage</code>，关闭页面后保留</li>
          </ul>
        </section>

        <!-- 网址导航快捷键 -->
        <section class="help-section">
          <h3 class="section-title"><Icon name="keyboard" /> 网址导航快捷键</h3>
          <div class="shortcuts-list">
            <div v-for="shortcut in shortcuts" :key="shortcut.key" class="shortcut-item">
              <kbd class="shortcut-key">{{ shortcut.key }}</kbd>
              <span class="shortcut-action">{{ shortcut.action }}</span>
            </div>
          </div>
        </section>

        <!-- 工作台快捷键 -->
        <section class="help-section">
          <h3 class="section-title"><Icon name="keyboard" /> 工作台快捷键</h3>
          <p class="panel-intro">以下快捷键在个人工作台与销售记账台中均生效。焦点位于输入框时，单键快捷键（g / [ / ]）不会触发，避免打断打字。</p>
          <div class="shortcuts-list">
            <div v-for="s in wbShortcuts" :key="s.key" class="shortcut-item">
              <kbd class="shortcut-key">{{ s.key }}</kbd>
              <span class="shortcut-action">{{ s.action }}</span>
            </div>
          </div>
        </section>

        <!-- 云同步 -->
        <section class="help-section">
          <h3 class="section-title"><Icon name="cloud" /> 云同步</h3>
          <ul class="storage-list">
            <li v-for="(note, i) in syncNotes" :key="i">{{ note }}</li>
          </ul>
        </section>

        <!-- 用智能体（技能）新增与修改数据 -->
        <section class="help-section">
          <h3 class="section-title"><Icon name="cog" /> 用智能体（技能）管理数据</h3>
          <p class="panel-intro">
            你的所有数据都会写成 <code>backup.json</code> 并随云同步落地到坚果云等 WebDAV 服务。
            配置好云同步后，无需手动导出导入——直接向 WorkBuddy 智能体说出需求，它会调用
            <code>{{ skillName }}</code> 技能，把网站与工作台内容写入云端备份文件，并在任意设备自动生效。
          </p>

          <div class="download-card">
            <div class="download-info">
              <span class="download-icon"><Icon name="package" /></span>
              <div>
                <h4>下载技能</h4>
                <p>技能含 <code>SKILL.md</code> 与 <code>add_entry.py</code>，解压到 <code>~/.workbuddy/skills/</code> 即可使用。</p>
              </div>
            </div>
            <div class="download-actions">
              <button class="btn-download" @click="downloadSkill">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                下载技能
              </button>
            </div>
          </div>

          <h4 class="sub-title">提示词示例</h4>
          <p class="sub-desc">以下说法都会触发技能，直接对智能体说即可（替换为你自己的内容）：</p>
          <div class="skill-prompts">
            <div v-for="p in skillPrompts" :key="p.scenario" class="skill-prompt">
              <span class="skill-prompt-label">{{ p.scenario }}</span>
              <pre class="code-block">{{ p.text }}</pre>
            </div>
          </div>

          <p class="skill-note"><Icon name="info" :size="13" /> 技能当前支持「新增 / 记录」网站与工作台内容；修改或删除已有条目请在对应管理界面操作。</p>

          <h4 class="sub-title">技能安装</h4>
          <ol class="flow-list">
            <li v-for="s in skillInstall" :key="s.step">
              <span class="flow-step">{{ s.step }}</span>
              <span class="flow-text">{{ s.text }}</span>
            </li>
          </ol>
        </section>
        </template>
      </div>

      <div class="modal-footer">
        <button class="btn-primary" @click="emit('close')">知道了</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.help-modal {
  background-color: white;
  border-radius: 16px;
  width: 100%;
  max-width: 680px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #f1f5f9;
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1e293b;
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: #94a3b8;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  color: #64748b;
  background-color: #f1f5f9;
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.help-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #3b82f6;
  padding-bottom: 8px;
  border-bottom: 1px solid #f1f5f9;
}

/* 功能网格 */
.features-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  background-color: #f8fafc;
  border-radius: 10px;
  border: 1px solid #f1f5f9;
}

.feature-icon {
  font-size: 20px;
  flex-shrink: 0;
  margin-top: 2px;
}

.feature-content h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.feature-content p {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

/* 快捷键列表 */
.shortcuts-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background-color: #f8fafc;
  border-radius: 8px;
}

.shortcut-key {
  background-color: #e2e8f0;
  color: #3b82f6;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  white-space: nowrap;
}

.shortcut-action {
  font-size: 13px;
  color: #475569;
}

/* 页面模式 */
.mode-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mode-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background-color: #f8fafc;
  border-radius: 10px;
}

.mode-badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.mode-admin {
  background-color: #eff6ff;
  color: #3b82f6;
}

.mode-item p {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}

.mode-item code {
  background-color: #e2e8f0;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  color: #3b82f6;
}

/* 数据存储 */
.storage-list {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.storage-list li {
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
}

.storage-list strong {
  color: #1e293b;
}

.storage-list code {
  background-color: #e2e8f0;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  color: #3b82f6;
}

/* 底部 */
.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: center;
}

.btn-primary {
  padding: 10px 32px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-primary:hover {
  background-color: #2563eb;
}

/* 示例数据下载 */
.download-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
  border-radius: 12px;
  border: 1px solid #bfdbfe;
}

.download-info {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.download-icon {
  font-size: 28px;
  flex-shrink: 0;
  margin-top: 2px;
}

.download-info h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.download-info p {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

.download-info code {
  background-color: #e2e8f0;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  color: #3b82f6;
}

.sync-account {
  list-style: none;
  padding: 0;
  margin: 8px 0;
  display: grid;
  gap: 6px;
}

.sync-account li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  flex-wrap: wrap;
}

.sync-label {
  flex-shrink: 0;
  width: 56px;
  color: #64748b;
}

.btn-copy {
  padding: 2px 10px;
  font-size: 12px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #475569;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-copy:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.download-info .sync-note {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-top: 8px;
  line-height: 1.6;
}

.btn-download {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background-color 0.2s;
}

.btn-download:hover {
  background-color: #2563eb;
}

.download-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

/* 标签页导航 */
.help-tabs {
  display: flex;
  gap: 4px;
  padding: 0 16px;
  border-bottom: 1px solid #f1f5f9;
  overflow-x: auto;
  scrollbar-width: none;
  flex-shrink: 0;
}

.help-tabs::-webkit-scrollbar {
  display: none;
}

.help-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #64748b;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.2s, border-color 0.2s;
}

.help-tab:hover {
  color: #3b82f6;
}

.help-tab.active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
}

.help-tab-icon {
  display: inline-flex;
  align-items: center;
}

/* 模块说明 */
.panel-intro {
  margin: 0;
  padding: 12px 14px;
  background-color: #f8fafc;
  border-radius: 10px;
  border: 1px solid #f1f5f9;
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
}

.panel-intro code {
  background-color: #e2e8f0;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  color: #3b82f6;
}

.panels-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.panel-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  background-color: #f8fafc;
  border-radius: 10px;
  border: 1px solid #f1f5f9;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-icon {
  display: inline-flex;
  align-items: center;
  color: #3b82f6;
  flex-shrink: 0;
}

.panel-head h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.panel-desc {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.6;
}

.panel-tips {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin: 0;
  padding-top: 6px;
  border-top: 1px dashed #e2e8f0;
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.5;
}

.panel-tips :deep(svg) {
  margin-top: 2px;
  flex-shrink: 0;
}

/* 公式列表 */
.formula-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.formula-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  background-color: #f8fafc;
  border-radius: 8px;
  border: 1px solid #f1f5f9;
}

.formula-label {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
}

.formula-expr {
  font-size: 12px;
  color: #3b82f6;
  background-color: #eff6ff;
  padding: 3px 8px;
  border-radius: 6px;
  white-space: nowrap;
}

.formula-note {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.6;
}

/* 流程列表 */
.flow-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.flow-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background-color: #f8fafc;
  border-radius: 8px;
  border: 1px solid #f1f5f9;
}

.flow-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: #3b82f6;
  color: white;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.flow-text {
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
}

/* 响应式 */
@media (max-width: 600px) {
  .features-grid {
    grid-template-columns: 1fr;
  }

  .shortcuts-list {
    grid-template-columns: 1fr;
  }

  .panels-grid,
  .formula-list {
    grid-template-columns: 1fr;
  }

  .formula-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .help-tab {
    padding: 10px;
    font-size: 12px;
  }

  .help-modal {
    max-height: 90vh;
  }

  .download-card {
    flex-direction: column;
    align-items: stretch;
  }

  .btn-download {
    justify-content: center;
  }
}

/* 技能说明 */
.sub-title {
  margin: 4px 0 0 0;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.sub-desc {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
}

.skill-prompts {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skill-prompt {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  background-color: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
}

.skill-prompt-label {
  font-size: 12px;
  font-weight: 600;
  color: #3b82f6;
}

.code-block {
  margin: 0;
  padding: 8px 10px;
  background-color: #0f172a;
  color: #e2e8f0;
  border-radius: 8px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.skill-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 4px 0 0 0;
  padding: 10px 12px;
  background-color: #eff6ff;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  font-size: 12px;
  color: #475569;
  line-height: 1.5;
}

.skill-note :deep(svg) {
  margin-top: 2px;
  flex-shrink: 0;
  color: #3b82f6;
}
</style>
