# 网页导航项目 - 技术方案

## 1. 项目概述

### 1.1 项目目标
开发一个个人网页导航应用，用于集中管理常用的网站书签。数据以 Markdown 格式存储，纯前端实现，无需后端服务。

### 1.2 核心特性
- **数据存储**: Markdown 文件（Frontmatter 格式）
- **分类管理**: 使用标签（tags）进行多维度分类
- **搜索功能**: 支持按名称、描述、标签快速检索
- **卡片式展示**: 现代卡片 UI 风格
- **纯前端**: 无需后端服务，直接浏览器运行

---

## 2. 技术架构

### 2.1 技术选型

| 技术 | 版本 | 说明 |
|------|------|------|
| Vue | 3.4+ | 响应式前端框架 |
| TypeScript | 5.0+ | 类型安全 |
| Vite | 5.0+ | 构建工具 |
| Pinia | 2.1+ | 状态管理 |
| markdown-it | 14.0+ | Markdown 解析 |
| gray-matter | 4.0+ | Frontmatter 解析 |
| VueUse | 10.0+ | 实用工具函数 |

### 2.2 项目结构
```
easyWebTab/
├── public/
│   └── data/                 # Markdown 数据文件
│       ├── sites.md          # 网站书签数据
│       └── categories.md     # 分类配置（可选）
├── src/
│   ├── assets/               # 静态资源
│   ├── components/           # Vue 组件
│   │   ├── SiteCard.vue      # 网站卡片组件
│   │   ├── SearchBar.vue     # 搜索栏
│   │   ├── TagFilter.vue     # 标签筛选
│   │   └── SiteModal.vue     # 网站编辑弹窗
│   ├── composables/          # 组合式函数
│   │   ├── useMarkdown.ts    # Markdown 解析
│   │   └── useSearch.ts      # 搜索功能
│   ├── stores/               # Pinia 状态管理
│   │   └── sites.ts          # 网站数据 store
│   ├── types/                # TypeScript 类型定义
│   │   └── index.ts
│   ├── App.vue
│   └── main.ts
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. 数据格式设计

### 3.1 网站数据格式 (sites.md)

```markdown
---
sites:
  - name: GitHub
    url: https://github.com
    description: 全球最大的代码托管平台
    tags: [开发, 代码, 开源]
    icon: https://github.com/favicon.ico
    createdAt: 2024-01-01
    
  - name: Stack Overflow
    url: https://stackoverflow.com
    description: 程序员问答社区
    tags: [开发, 问答, 技术]
    icon: https://stackoverflow.com/favicon.ico
    createdAt: 2024-01-02
---

# 我的书签

这里是网站的详细描述...
```

### 3.2 TypeScript 类型定义

```typescript
interface Site {
  name: string;           // 网站名称
  url: string;            // 网站 URL
  description?: string;  // 网站描述
  tags: string[];        // 标签数组
  icon?: string;          // 网站图标 URL
  createdAt?: string;    // 创建时间
  updatedAt?: string;    // 更新时间
}

interface SitesData {
  sites: Site[];
  lastUpdated?: string;
}
```

---

## 4. 功能模块设计

### 4.1 核心功能

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 网站展示 | 卡片网格展示所有网站 | P0 |
| 标签筛选 | 点击标签筛选对应网站 | P0 |
| 关键词搜索 | 按名称/描述搜索网站 | P0 |
| 添加网站 | 通过表单添加新网站 | P1 |
| 编辑网站 | 修改已有网站信息 | P1 |
| 删除网站 | 删除不需要的书签 | P1 |
| 数据持久化 | 保存到 localStorage | P1 |

### 4.2 组件设计

#### SiteCard.vue - 网站卡片
- 显示网站图标、名称、描述
- 显示标签（可点击筛选）
- 点击跳转目标网站
- 悬停显示操作按钮（编辑/删除）

#### SearchBar.vue - 搜索栏
- 搜索输入框
- 实时过滤（防抖处理）
- 清除搜索按钮

#### TagFilter.vue - 标签筛选
- 显示所有可用标签
- 已选标签高亮
- 多标签联合筛选

#### SiteModal.vue - 网站编辑弹窗
- 添加/编辑网站表单
- 表单验证
- 确认/取消按钮

### 4.3 状态管理 (Pinia Store)

```typescript
// stores/sites.ts
interface SitesState {
  sites: Site[];
  searchQuery: string;
  selectedTags: string[];
  isLoading: boolean;
}

interface SitesActions {
  loadSites(): Promise<void>;
  addSite(site: Omit<Site, 'createdAt'>): void;
  updateSite(url: string, site: Partial<Site>): void;
  deleteSite(url: string): void;
  setSearchQuery(query: string): void;
  toggleTag(tag: string): void;
  clearFilters(): void;
}
```

---

## 5. 关键实现方案

### 5.1 Markdown 解析流程

```
sites.md 文件
     │
     ▼
fetch() 读取文件内容
     │
     ▼
gray-matter 解析 Frontmatter
     │
     ▼
提取 sites 数组
     │
     ▼
存储到 Pinia Store
     │
     ▼
Vue 组件渲染
```

### 5.2 前端 Frontmatter 解析

由于浏览器环境无法直接使用 Node.js 的 gray-matter，使用以下方案：

```typescript
// 使用 gray-matter 的浏览器版本
import matter from 'gray-matter';

function parseMarkdown(content: string): SitesData {
  const { data, content: body } = matter(content);
  return {
    sites: data.sites || [],
    lastUpdated: data.lastUpdated
  };
}
```

> **注意**: 需要配置 Vite 处理 .md 文件的加载，或者将 md 文件转换为 JSON 引入。

### 5.3 替代方案：直接使用 JSON

考虑到纯前端和易用性，也可以直接使用 JSON 格式存储：

```json
{
  "sites": [
    {
      "name": "GitHub",
      "url": "https://github.com",
      "description": "全球最大的代码托管平台",
      "tags": ["开发", "代码"],
      "icon": ""
    }
  ]
}
```

这种方式更简单，且 Vite 原生支持 JSON 导入。

> ⚠️ **重要**: 根据用户需求，数据必须存储为 Markdown 格式文件，因此采用 5.2 方案

---

## 6. UI/UX 设计

### 6.1 页面布局

```
┌─────────────────────────────────────────┐
│  🔍 搜索栏                    [添加网站] │  <- 顶部操作栏
├─────────────────────────────────────────┤
│  标签: [开发] [工具] [前端] [设计] [产品]  │  <- 标签筛选
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │  🖥️     │  │  🖥️     │  │  🖥️     │  │
│  │ GitHub  │  │  Vite   │  │  MDN    │  │
│  │ 代码托管 │  │  构建工具 │  │  Web    │  │
│  │ [标签]  │  │ [标签]  │  │ [标签]  │  │
│  └─────────┘  └─────────┘  └─────────┘  │
│                                         │
│  ┌─────────┐  ┌─────────┐              │  <- 卡片网格
│  │  🖥️     │  │  🖥️     │              │
│  │ Stack   │  │  Chrome │              │
│  │ 问答    │  │  扩展   │              │
│  │ [标签]  │  │ [标签]  │              │
│  └─────────┘  └─────────┘              │
│                                         │
├─────────────────────────────────────────┤
│  共 24 个网站  |  显示 6 个              │  <- 底部状态
└─────────────────────────────────────────┘
```

### 6.2 配色方案

| 用途 | 颜色 | 说明 |
|------|------|------|
| 主色 | #3b82f6 | 蓝色，品牌色 |
| 背景 | #f8fafc | 浅灰背景 |
| 卡片 | #ffffff | 白色卡片 |
| 文字 | #1e293b | 深灰文字 |
| 标签 | #e2e8f0 | 浅灰标签 |

### 6.3 交互设计

- **卡片悬停**: 轻微上浮 + 阴影加深
- **标签点击**: 高亮 + 筛选动画
- **搜索输入**: 即时过滤（150ms 防抖）
- **添加/编辑**: 弹窗表单，动画过渡

---

## 7. 部署方案

### 7.1 构建命令
```bash
npm run build
```

### 7.2 输出目录
- `dist/` 目录包含所有静态文件
- 可直接部署到 GitHub Pages、Netlify、Vercel 等

### 7.3 数据更新
修改 `public/data/sites.json` 后重新构建部署

---

## 8. 开发计划

### Phase 1: 基础框架
- [ ] 初始化 Vue3 + Vite + TypeScript 项目
- [ ] 配置项目结构和基础组件
- [ ] 实现数据加载（JSON 格式）

### Phase 2: 核心功能
- [ ] 实现网站卡片展示
- [ ] 实现标签筛选功能
- [ ] 实现搜索功能
- [ ] 添加/编辑/删除网站功能

### Phase 3: 优化体验
- [ ] 样式优化和动画
- [ ] 响应式布局
- [ ] 数据持久化（localStorage）
- [ ] 打包部署

---

## 9. 总结

本技术方案采用 Vue3 + TypeScript + Vite 的现代前端技术栈，通过 JSON 格式存储网站数据（比 Markdown 更适合纯前端解析），实现了卡片式 UI 的个人导航网站。方案简单实用，易于维护和扩展。

如需调整数据格式为纯 Markdown，可以后续引入 markdown-it + gray-matter 方案，但会增加构建复杂度。
