---
name: workbench-builder
description: 创建 easy-web-tab 工作台面板的全面指南。当用户需要新增工作台面板、修改面板布局、接入分页/云同步/设置联动时使用。涵盖项目架构、数据层、组件模式、一屏布局、云同步、设置联动的完整创建流程。
triggers:
  - 创建工作台面板
  - 新增面板
  - 工作台开发
  - 新增工作台功能
---

# easy-web-tab 工作台面板创建指南

## 1. 项目全景

### 技术栈
- **框架**: Vue 3 + Pinia + TypeScript（`<script setup lang="ts">`，Composition API only）
- **构建**: Vite（`vite.config.js` 非 `.ts`），端口 16718
- **持久化**: IndexedDB（DB `easy-web-tab` v6，12 store）+ localStorage（偏好/密钥）
- **路径别名**: `@` → `/src`（禁止相对路径 `../`）
- **包管理**: npm only
- **UI 语言**: 中文

### 目录结构
```
src/
├── types/index.ts          # 全部接口 + WORKBENCH_DATA_VERSION
├── stores/                 # 16 个 Pinia store（数据层）
├── composables/            # 34 个 composable（纯逻辑 + 封装）
├── components/
│   ├── workbench/          # 18 个工作台 SFC（面板 + PanelPager + 容器）
│   └── business/           # 销售记账 SFC
├── views/
│   ├── WorkbenchView.vue   # 工作台主视图（左菜单 + 右内容）
│   ├── BusinessView.vue    # 销售记账主视图
│   ├── HomeView.vue        # 管理页
│   └── DisplayView.vue     # 新标签页
├── router/index.ts         # 路由（eager import，无 lazy）
└── styles/
    ├── dark.css            # 暗色模式 CSS 变量
    └── background.css      # 背景样式
```

### IDB Store 清单（12 个）
| 类型 | Store 名 | 数据 |
|------|----------|------|
| 核心 | todos | 待办数组 |
| 核心 | notes | `{categories, notes}` 对象 |
| 核心 | diary | `{entries}` 对象（非数组！） |
| 核心 | countdowns | 倒计时数组 |
| 核心 | passwords | 加密密码数组 |
| 核心 | health | `{height, plans, records}` |
| 核心 | ledger | `{categories, entries}` |
| 核心 | settings | 设置对象 |
| 核心 | business | 七字段对象 |
| 辅助 | pomodoro | 番茄钟数据 |
| 辅助 | habits | 习惯数据 |
| 辅助 | snapshots | 快照（永不进备份） |

## 2. 创建新面板：全栈 9 步

### 步骤 1：定义类型 (`src/types/index.ts`)

```typescript
// 1. 面板数据接口
export interface WorkbenchFoo {
  id: string          // 前缀 `fo_`（见步骤 5 ID 生成规则）
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

// 2. 面板数据容器（如有嵌套）
export interface FooData {
  entries: WorkbenchFoo[]  // 或 { categories, entries } 等
}

// 3. 空数据工厂
export function emptyFooData(): FooData {
  return { entries: [] }
}

// 4. 归一化函数（纯函数，幂等，放 composable）
export function normalizeFooData(raw: unknown): FooData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyFooData()
  const obj = raw as Record<string, unknown>
  const entries = Array.isArray(obj.entries) ? obj.entries : []
  return { entries: entries.map(normalizeFoo) }
}
```

### 步骤 2：创建纯逻辑 composable (`src/composables/fooCore.ts`)

纯函数，零 vue/pinia/DOM 依赖，`node --experimental-strip-types` 可测：

```typescript
import type { WorkbenchFoo, FooData } from '@/types'

// 归一化单条
export function normalizeFoo(raw: unknown): WorkbenchFoo {
  if (!raw || typeof raw !== 'object') return /* 默认值 */
  const o = raw as Record<string, unknown>
  return {
    id: typeof o.id === 'string' ? o.id : `fo_${Date.now()}`,
    title: String(o.title ?? ''),
    content: String(o.content ?? ''),
    createdAt: Number(o.createdAt) || Date.now(),
    updatedAt: Number(o.updatedAt) || Date.now(),
  }
}

// 排序（不改入参，返回新数组）
export function sortFoos(entries: WorkbenchFoo[]): WorkbenchFoo[] {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt)
}

// 筛选
export function filterFoos(entries: WorkbenchFoo[], keyword: string): WorkbenchFoo[] {
  if (!keyword) return entries
  const kw = keyword.toLowerCase()
  return entries.filter(e => e.title.toLowerCase().includes(kw))
}
```

在 `package.json` 添加测试脚本：
```json
"test:foo": "node --experimental-strip-types scripts/test-foo.mjs"
```

### 步骤 3：创建 Pinia store (`src/stores/workbenchFoo.ts`)

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { toRaw } from 'vue'
import { idbGet, idbPut } from '@/composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'
import { normalizeFooData, sortFoos, filterFoos } from '@/composables/fooCore'
import type { WorkbenchFoo, FooData } from '@/types'

const STORE_KEY = 'foo'  // IDB store 名

export const useWorkbenchFooStore = defineStore('workbenchFoo', () => {
  const data = ref<FooData>({ entries: [] })
  const loaded = ref(false)

  // 计算属性：排序后的列表
  const sortedFoos = computed(() => sortFoos(data.value.entries))

  // 加载
  async function loadFoos() {
    if (loaded.value) return
    const raw = await idbGet(STORE_KEY)
    data.value = normalizeFooData(raw)
    loaded.value = true
  }

  // 保存（关键：toRaw + markDirty）
  async function saveFoos() {
    await idbPut(STORE_KEY, toRaw(data.value))
    markDirty()
  }

  // CRUD
  async function addFoo(input: Omit<WorkbenchFoo, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = Date.now()
    const entry: WorkbenchFoo = {
      ...input,
      id: `fo_${now}_${Math.random().toString(16).slice(2, 6)}`,
      createdAt: now,
      updatedAt: now,
    }
    data.value.entries.push(entry)
    await saveFoos()
    return entry
  }

  async function updateFoo(id: string, patch: Partial<WorkbenchFoo>) {
    const idx = data.value.entries.findIndex(e => e.id === id)
    if (idx === -1) return
    data.value.entries[idx] = { ...data.value.entries[idx], ...patch, updatedAt: Date.now() }
    await saveFoos()
  }

  async function deleteFoo(id: string) {
    data.value.entries = toRaw(data.value.entries).filter(e => e.id !== id)
    await saveFoos()
  }

  return {
    data, loaded, sortedFoos,
    loadFoos, saveFoos, addFoo, updateFoo, deleteFoo,
  }
})
```

### 步骤 4：创建组件 (`src/components/workbench/WorkbenchFoo.vue`)

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useWorkbenchFooStore } from '@/stores/workbenchFoo'
import { filterFoos } from '@/composables/fooCore'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from './PanelPager.vue'

const store = useWorkbenchFooStore()

// 搜索
const searchKeyword = ref('')
const filteredFoos = computed(() => filterFoos(store.sortedFoos, searchKeyword.value))

// 分页（一屏布局）
const listEl = ref<HTMLElement>()
const gridEl = ref<HTMLElement>()  // 必须绑定到 grid 元素，不是外层容器！
const paging = usePanelPaging({
  items: () => filteredFoos.value,
  rowHeight: 150,  // 实测后更新到 row-heights.json
  gap: 12,
  maxRows: 2,     // 可选：每页行数上限
  containerRef: listEl,
  gridRef: gridEl,  // 用于读取 gridTemplateColumns 实测列数
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev } = paging
</script>
```

### 步骤 5：注册路由 (`src/router/index.ts`)

路由是 eager import，无需 lazy：
```typescript
import WorkbenchView from '@/views/WorkbenchView.vue'
// 已有，无需新增——面板在 WorkbenchView 内部切换
```

### 步骤 6：注册菜单项 (`src/composables/workbenchMenuCore.ts`)

```typescript
// 1. 添加到 WORKBENCH_MENU_KEYS
export const WORKBENCH_MENU_KEYS = [
  'home', 'todos', 'notes', 'diary', 'countdowns',
  'pomodoro', 'habits', 'passwords', 'health', 'ledger',
  'foo',  // ← 新增
] as const

// 2. 添加默认序号（home 恒 0）
export const WORKBENCH_MENU_DEFAULT_ORDER = [
  'home', 'todos', 'notes', 'diary', 'countdowns',
  'pomodoro', 'habits', 'passwords', 'health', 'ledger',
  'foo',  // ← 追加到末尾
]

// 3. 添加默认名称（逐字一致，load-bearing）
export const MENU_DEFAULT_LABELS: Record<string, string> = {
  home: '主页', todos: '工作待办', notes: '个人便签',
  diary: '日记本', countdowns: '定时提醒',
  pomodoro: '番茄钟', habits: '习惯打卡',
  passwords: '密码管理', health: '健康管理',
  ledger: '记账', foo: '我的面板',  // ← 新增
}

// 4. 添加图标映射（Icon.vue MDI path key）
export const MENU_ICONS: Record<string, string> = {
  home: 'home', todos: 'check-circle', /* ... */
  foo: 'star',  // ← 新增
}
```

### 步骤 7：接入 WorkbenchView (`src/views/WorkbenchView.vue`)

```typescript
// 1. 添加到导航白名单 SECTION_KEYS
const SECTION_KEYS = ['home', 'todos', /* ... */, 'foo'] as const

// 2. onMounted 中加载
await fooStore.loadFoos()

// 3. 模板中条件渲染
<WorkbenchFoo v-if="activeSection === 'foo'" />
```

### 步骤 8：接入云同步 (`src/composables/useIdb.ts`)

```typescript
// 1. idbExportAll：添加到导出
const fooData = await idbGet('foo')
envelope.foo = fooData ?? emptyFooData()

// 2. idbImportAll：添加到导入
if (envelope.foo) await idbPut('foo', envelope.foo)
// 旧版本兼容：v1-v8 补 foo 空数据
if (!envelope.foo) envelope.foo = emptyFooData()
```

在 `src/types/index.ts` 更新：
```typescript
export const WORKBENCH_DATA_VERSION = 10  // +1
export interface WorkbenchData {
  version: number
  exportedAt: number
  // ... 现有字段
  foo: FooData  // ← 新增
  clientId?: string
  pushedAt?: number
  prefs?: Record<string, string>
}
```

### 步骤 9：更新设置弹窗 (`src/components/AppSettingsDialog.vue`)

无需额外工作——菜单项自动出现在「工作台菜单」列表中（由 `workbenchMenuAllItems` 驱动全量渲染）。

## 3. 一屏布局 + 分页接入

### 核心规则
- **桌面端（≥769px）**: 页面滚动关闭，`.wb-content` flex 列 + 面板根 `flex:1; min-height:0` 钉满视口
- **长列表**: 经 PanelPager 翻页，不滚动
- **移动端（≤768px）**: 分页惰性（全量渲染，无切片，无 pager）

### usePanelPaging 集成清单

```typescript
const paging = usePanelPaging({
  items: () => filteredList.value,  // 返回数组的函数
  rowHeight: 150,                    // 实测 MAX+2px，存 row-heights.json
  gap: 12,                           // grid gap，默认 12
  maxRows: undefined,                // 可选：行数上限（如密码 maxRows:3）
  containerRef: listEl,              // 列表区外层 ref
  gridRef: gridEl,                   // grid 元素 ref（必须！读 gridTemplateColumns）
})
```

### 关键陷阱
1. **gridRef 必须绑定到 grid 元素**，不是外层 flex 容器。否则 `getComputedStyle(grid).gridTemplateColumns` 返回 `'none'`，`colsPerRow` 恒等于 1，分页错误
2. **rowHeight 来自实测**：`.omo/evidence/workbench-onescreen/row-heights.json`，值为 MAX+2px
3. **条件渲染列表**（折叠/锁态）containerRef 为 null → 分页惰性直到渲染
4. **面板根必须 flex 列**（桌面端加 `flex:1; min-height:0`），否则 RO 只测到 1 行
5. **!fitsOnePage 时**列表区回退 `overflow-y:auto`

### PanelPager 使用

```vue
<div ref="listEl" class="foo-list" :class="{ 'foo-list-scroll': !fitsOnePage }">
  <div ref="gridEl" class="foo-grid">
    <div v-for="item in pageItems" :key="item.id" class="foo-card">
      <!-- 卡片内容 -->
    </div>
  </div>
  <PanelPager
    v-if="totalPages > 1"
    :page="currentPage"
    :total="totalPages"
    @prev="prev()"
    @next="next()"
  />
</div>
```

### row-heights.json
```json
{
  "todo": 214, "notes": 287, "timeline": 2343, "diary": 192,
  "countdown": 158, "habits": 82, "password": 116,
  "exercise": 533, "diet": 537, "sleep": 563, "weight": 88, "ledger": 49,
  "foo": 152  // ← 新面板实测后添加
}
```

## 4. 云同步数据流

### markDirty 机制
每个 store 的 `save*` 方法末尾调用 `markDirty()`：
```typescript
async function saveFoos() {
  await idbPut(STORE_KEY, toRaw(data.value))
  markDirty()  // ← 触发云同步推送状态
}
```

### 备份信封结构（WorkbenchData v9+）
```typescript
{
  version: 9,
  exportedAt: 1724...
  todos: [...],
  notes: { categories, notes },
  diary: { entries },
  countdowns: [...],
  passwords: [...],
  health: { height, plans, records },
  ledger: { categories, entries },
  settings: {...},
  business: {...},
  pomodoro: {...},
  habits: {...},
  passwordsSalt: "...",
  passwordVerification: "...",
  clientId: "...",
  pushedAt: 1724...,
  prefs: { "user-sites": "...", ... }
}
```

### 新增 store 的同步接入
1. `idbExportAll` → 添加 `envelope.foo = await idbGet('foo')`
2. `idbImportAll` → 添加 `if (envelope.foo) await idbPut('foo', envelope.foo)`
3. 旧版本兼容 → `if (!envelope.foo) envelope.foo = emptyFooData()`
4. `WORKBENCH_DATA_VERSION` +1
5. `businessSignature()` 排除新 store 中的不稳定字段（时间戳等）

## 5. 设置联动

### 菜单开关
- 设置弹窗「工作台设置」tab → 菜单列表（`workbenchMenuAllItems` 全量渲染）
- 开关关闭 → 左菜单隐藏 + 面板不可进入 + 主页对应统计/面板隐藏
- `home` 恒 index 0，开关锁定不可关

### 页面可见性
- `workbenchPageVisible`：控制管理页「工作台」按钮 + 设置弹窗工作台/提醒/sync tab
- `businessPageVisible`：控制管理页「销售记账」按钮
- HelpModal 标签页：`workbench` / `business` 标签随开关联动隐藏

## 6. 代码约定

### 必须遵守
- `<script setup lang="ts">`，Composition API only
- 路径 `@/` 不用 `../`
- 写入 IDB 前必须 `toRaw()`（Vue reactive Proxy 无法结构化克隆）
- 纯逻辑放 composable（`*Core.ts`），组件禁止内联重算
- store save 方法调 `markDirty()`
- 中文 commit message，前缀 `feat-` / `fix-`

### 禁止
- 编辑 `presetIcons.ts`（自动生成）
- 给游戏路径加 `.html` 后缀
- 删除内置搜索引擎
- 使用 pnpm/yarn/bun
- 使用 `git add -A`（用具体文件名）
- ESLint/Prettier（项目无配置，靠 TS strict）

### 组件结构模板
```
<template>
  <div class="wb-foo">
    <!-- 搜索区 -->
    <div class="foo-search">...</div>
    <!-- 分类 tabs + 新增按钮靠右 -->
    <div class="foo-cat-tabs">
      <button>全部</button>
      <span class="toolbar-count" style="margin-left:auto">{{ count }}</span>
      <button class="btn-add">＋ 新增</button>
    </div>
    <!-- 列表 + 分页 -->
    <div ref="listEl" class="foo-list">
      <div ref="gridEl" class="foo-grid">
        <div v-for="item in pageItems" :key="item.id" class="foo-card">...</div>
      </div>
      <PanelPager v-if="totalPages > 1" ... />
    </div>
  </div>
</template>
```

## 7. 卡片列表设计规范

- Grid 列数：桌面 5 列（`repeat(5, minmax(0,1fr))`），移动端单列
- `align-content: start`：防止不足 5 卡时 grid 拉伸
- `grid-auto-rows: <rowHeight>px`：统一行高
- 卡片操作栏：`justify-content: flex-end`，编辑入口靠点击卡片主体
- hover 显示删除按钮：绝对定位 `right:10px; bottom:10px`

## 8. ID 生成规则

```
前缀_YYYYMMDD_HHmmss_XXXX
```
- 前缀：面板专属（`fo_` / `td_` / `nt_` / `dy_` / `cd_` / `ld_`）
- XXXX：4 位随机 hex

## 9. 完整创建清单

创建一个新工作台面板需要修改的文件：

| # | 文件 | 改动 |
|---|------|------|
| 1 | `src/types/index.ts` | 接口 + emptyFooData + normalizeFooData + WorkbenchData.foo + WORKBENCH_DATA_VERSION+1 |
| 2 | `src/composables/fooCore.ts` | 新建纯函数 |
| 3 | `src/stores/workbenchFoo.ts` | 新建 Pinia store |
| 4 | `src/components/workbench/WorkbenchFoo.vue` | 新建 SFC |
| 5 | `src/composables/workbenchMenuCore.ts` | MENU_KEYS + DEFAULT_ORDER + LABELS + ICONS |
| 6 | `src/views/WorkbenchView.vue` | SECTION_KEYS + onMounted load + 模板渲染 |
| 7 | `src/composables/useIdb.ts` | idbExportAll + idbImportAll + 旧版兼容 |
| 8 | `.omo/evidence/workbench-onescreen/row-heights.json` | 实测行高 |
| 9 | `package.json` | test:foo 脚本（可选） |
| 10 | `src/composables/useCloudSync.ts` | businessSignature 排除新 store不稳定字段 |

## 10. 常用命令

```bash
npm run dev          # 开发服务器
npm run build        # 编译（generate-preset-icons → vue-tsc → vite build）
npm run test:foo     # 纯函数测试
node scripts/qa-workbench-onescreen.mjs  # 一屏布局 QA + 行高测量
```
