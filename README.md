# Easy Web Tab

简洁的个人网址导航页，支持分类管理、全文搜索、键盘快捷键、暗色模式，以及导入/导出为 Markdown 文件。

---

## 项目结构

```
easyWebTab/
├── public/
│   └── data/
│       └── sites.md              # 内置网址数据（分类、搜索引擎、网址）
├── src/
│   ├── components/
│   │   ├── CategoryManager.vue   # 分类管理弹窗（增删改分类）
│   │   ├── CategoryTabs.vue      # 分类标签栏（横向分类切换）
│   │   ├── GlobalSearch.vue       # 顶部全局搜索栏（支持多搜索引擎）
│   │   ├── Pagination.vue         # 分页组件
│   │   ├── SearchBar.vue          # 搜索输入框
│   │   ├── SearchEngineManager.vue # 搜索引擎管理弹窗
│   │   ├── SettingsButton.vue     # 设置按钮
│   │   ├── SiteCard.vue           # 网址卡片（hover 显示编辑/删除）
│   │   ├── SiteModal.vue          # 添加/编辑网址弹窗（含自动获取元数据）
│   │   ├── TagFilter.vue           # 标签筛选栏
│   │   └── ThemeToggle.vue         # 暗色模式切换
│   ├── composables/
│   │   ├── useKeyboardShortcuts.ts # 键盘快捷键（Ctrl+N 新增、Ctrl+B 切换后台等）
│   │   ├── useMarkdown.ts         # 解析 sites.md（YAML frontmatter）
│   │   └── useUrlMetadata.ts      # 自动获取网址元数据（标题、描述、图标）
│   ├── router/
│   │   └── index.ts               # 路由（/ 管理后台，/display 前台展示）
│   ├── stores/
│   │   ├── categories.ts          # 分类状态（内置分类 + 自定义分类）
│   │   ├── searchEngines.ts      # 搜索引擎状态
│   │   ├── sites.ts              # 网址状态（添加/编辑/删除/导入/导出）
│   │   └── theme.ts              # 主题状态（明/暗）
│   ├── styles/
│   │   └── dark.css              # 暗色模式样式
│   ├── types/
│   │   └── index.ts              # TypeScript 类型定义（Site、Category）
│   ├── views/
│   │   ├── DisplayView.vue       # 前台展示页（只读，无管理按钮）
│   │   └── HomeView.vue          # 管理后台（可添加/编辑/删除/导入/导出）
│   ├── App.vue                   # 根组件
│   ├── main.ts                   # 应用入口
│   └── style.css                 # 全局样式
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 数据模型

### 网址（Site）

所有数据存储在 `public/data/sites.md`，格式为 YAML frontmatter：

```yaml
sites:
  - name: GitHub
    url: https://github.com
    description: 全球最大的代码托管平台
    category: tech          # 分类 ID
    tags: [开源, 代码]       # 标签数组
    icon: https://github.com/favicon.ico  # 可选，自定义图标
    sort: 10                # 可选，数字越小排越前
    createdAt: 2024-01-01T00:00:00.000Z
```

### 分类（Category）

```yaml
categories:
  - id: tech
    name: 开发技术
    icon: 💻
    sort: 1
```

- 内置分类（不可删除）：`office` 办公工具、`tech` 开发技术、`video` 视频音乐
- 自定义分类：用户可在管理后台添加/编辑/删除，存储于 `localStorage`

### 搜索引擎（SearchEngine）

```yaml
searchEngines:
  - id: baidu
    name: 百度
    url: https://www.baidu.com/s?wd=   # 搜索词用 = 拼接
    isDefault: true
    sort: 1
```

---

## 安装

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
# 访问 http://localhost:5173

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

---

## 使用

### 页面模式

| 页面 | 路由 | 说明 |
|------|------|------|
| 管理后台 | `/` | 添加/编辑/删除网址，管理分类和搜索引擎 |
| 前台展示 | `/display` | 纯展示，隐藏管理功能，适合设为浏览器新标签页 |

右上角「前台」按钮切换到 `/display`，「管理」按钮返回后台。

### 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+N` | 新增网址 |
| `Ctrl+B` | 切换前台/后台 |
| `Ctrl+D` | 切换暗色模式 |
| `ESC` | 关闭弹窗 |

### 添加网址

1. 点击「+ 添加网址」或按 `Ctrl+N`
2. 输入网站名称和地址
3. 点击「获取」自动拉取标题、描述、图标（也可手动填写）
4. 选择分类、填写标签
5. 点击「添加」保存

> 网址重复检测：
> - 输入已有网址后点击「获取」→ 显示 ⚠️ 警告
> - 点击「添加」时弹出确认框：确定更新现有条目，取消跳过

### 导入 / 导出

- **导入**：上传 `.md` 文件（支持含 YAML frontmatter 的格式），按 URL 去重，保留原有数据
- **导出**：点击「导出」下载 `sites.md`，包含所有分类、搜索引擎和网址

### 分类管理

点击右上角「⚙️」打开设置，可增删自定义分类。

### 搜索引擎管理

点击工具栏「🔍 引擎管理」添加/删除/设置默认搜索引擎。搜索栏下拉切换。

---

## 自定义开发

### 修改内置网址数据

直接编辑 `public/data/sites.md`，符合上述 YAML 格式即可。构建时会自动复制到 `dist/data/sites.md`。

### 添加新组件

1. 在 `src/components/` 下创建 `.vue` 文件
2. 在需要的视图（`HomeView.vue` 或 `DisplayView.vue`）中 `import` 并使用
3. 有状态逻辑则在 `src/stores/` 下创建 Pinia store

### 数据存储

- **内置数据**：`public/data/sites.md`（构建进包）
- **用户数据**：`localStorage`
  - `user-sites`：用户添加/修改的网址
  - `user-categories`：自定义分类
  - `user-search-engines`：自定义搜索引擎

用户数据优先于内置数据加载（同名 URL 覆盖）。

### 元数据获取

`useUrlMetadata.ts` 提供了自动获取网址元数据的能力：
1. 优先使用 **Jina.ai**（`https://r.jina.ai/`）获取标题和摘要
2. 失败时降级使用 **allorigins.win** 代理抓取页面 meta 标签

如需更换方案，修改 `fetchViaJina` 或 `fetchViaProxy` 函数即可。
