---
name: "workbench-builder"
description: "创建 easy-web-tab 工作台面板的全面指南。当用户需要新增工作台面板、修改面板布局、接入分页/云同步/设置联动时使用。涵盖项目架构、数据层、组件模式、一屏布局、云同步、设置联动的完整创建流程。"
---

# easy-web-tab 工作台面板创建指南

> **项目根目录**：`d:\opencodeWorkSpace\easy-web-tab`
> **技术栈**：Vue 3 + Pinia + TypeScript + Vite + IndexedDB
> **UI 语言**：中文

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
d:\opencodeWorkSpace\easy-web-tab\src\
├── types/index.ts          # 全部接口 + WORKBENCH_DATA_VERSION
├── stores/                  # 16 个 Pinia store（数据层）
├── composables/             # 34 个 composable（纯逻辑 + 封装）
├── components/
│   ├── workbench/           # 18 个工作台 SFC（面板 + PanelPager + 容器）
│   └── business/            # 销售记账 SFC
├── views/
│   ├── WorkbenchView.vue    # 工作台主视图（左菜单 + 右内容）
│   ├── BusinessView.vue     # 销售记账主视图
│   ├── HomeView.vue         # 管理页
├── router/index.ts          # 路由（eager import，无 lazy）
└── styles/
    ├── dark.css             # 暗色模式 CSS 变量
    └── background.css       # 背景样式
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

> 以下以创建「WorkbenchFoo」面板为例，实际使用时替换 `Foo`/`foo`/`fo_` 为你的面板名。

### 步骤 1：定义类型 (`src/types/index.ts`)

```typescript
// 1. 面板数据接口
export interface WorkbenchFoo {
  id: string          // 前缀 `fo_`
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

// 2. 面板数据容器（如有嵌套）
export interface FooData {
  entries: WorkbenchFoo[]
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

  const sortedFoos = computed(() => sortFoos(data.value.entries))

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

const searchKeyword = ref('')
const filteredFoos = computed(() => filterFoos(store.sortedFoos, searchKeyword.value))

// 分页（一屏布局）
const listEl = ref<HTMLElement>()
const gridEl = ref<HTMLElement>()  // 必须绑定到 grid 元素，不是外层容器！
const paging = usePanelPaging({
  items: () => filteredFoos.value,
  rowHeight: 150,  // 实测后更新到 row-heights.json
  gap: 12,
  maxRows: 2,
  containerRef: listEl,
  gridRef: gridEl,
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev } = paging
</script>
```

### 步骤 5：注册菜单项 (`src/composables/workbenchMenuCore.ts`)

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
  // ...
  foo: '我的面板',  // ← 新增
}

// 4. 添加图标映射（Icon.vue MDI path key）
export const MENU_ICONS: Record<string, string> = {
  // ...
  foo: 'star',  // ← 新增
}
```

### 步骤 6：接入 WorkbenchView (`src/views/WorkbenchView.vue`)

```typescript
// 1. 添加到导航白名单 SECTION_KEYS
const SECTION_KEYS = ['home', 'todos', /* ... */, 'foo'] as const

// 2. onMounted 中加载
await fooStore.loadFoos()

// 3. 模板中条件渲染
<WorkbenchFoo v-if="activeSection === 'foo'" />
```

### 步骤 7：接入云同步 (`src/composables/useIdb.ts`)

```typescript
// 1. idbExportAll：添加到导出
envelope.foo = await idbGet('foo') ?? emptyFooData()

// 2. idbImportAll：添加到导入
if (envelope.foo) await idbPut('foo', envelope.foo)
if (!envelope.foo) envelope.foo = emptyFooData()  // 旧版兼容
```

在 `src/types/index.ts` 更新：
```typescript
export const WORKBENCH_DATA_VERSION = 10  // +1
export interface WorkbenchData {
  // ...
  foo: FooData  // ← 新增
}
```

### 步骤 8：确定 rowHeight 常量

`rowHeight` 口径为「列表单行的最大外高 + 2px margin」。测量方式：在浏览器里渲染若干条真实数据，
用 DevTools 量首条卡片的**外层**高度（含 margin），取最大值 +2，作为常量直接写在面板组件里
（参考同类面板的既有取值，如待办 214 / 便签 287 / 日记 192 / 倒计时 158 / 习惯 82）。

```typescript
rowHeight: 152,   // 实测 MAX + 2px，写在面板常量里
```

> 历史上曾用一次性 Playwright 脚本批量测量并导出 JSON，该脚本已移除，现以面板内常量为准。

### 步骤 9：编译验证

```bash
npm run build
```

## 3. 一屏布局 + 分页接入

### 核心规则
- **桌面端（≥769px）**: 页面滚动关闭，`.wb-content` flex 列 + 面板根 `flex:1; min-height:0` 钉满视口
- **长列表**: 经 PanelPager 翻页，不滚动
- **移动端（≤768px）**: 分页惰性（全量渲染，无切片，无 pager）

### usePanelPaging 集成清单

```typescript
const paging = usePanelPaging({
  items: () => filteredList.value,
  rowHeight: 150,           // 实测 MAX+2px
  gap: 12,
  maxRows: undefined,       // 可选：行数上限
  containerRef: listEl,     // 列表区外层 ref
  gridRef: gridEl,          // grid 元素 ref（必须！读 gridTemplateColumns）
})
```

### 关键陷阱
1. **gridRef 必须绑定到 grid 元素**，不是外层 flex 容器。否则 colsPerRow 恒等于 1
2. **rowHeight 必须实测**（单行最大外高 + 2px），不可拍脑袋估 —— 估小了会一屏塞不下
3. **条件渲染列表**（折叠/锁态）containerRef 为 null → 分页惰性直到渲染
4. **面板根必须 flex 列**（桌面端加 `flex:1; min-height:0`）
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

## 4. 云同步数据流

### markDirty 机制
每个 store 的 `save*` 方法末尾调用 `markDirty()`。

### 新增 store 的同步接入
1. `idbExportAll` → 添加 `envelope.foo = await idbGet('foo')`
2. `idbImportAll` → 添加写入 + 旧版兼容补空数据
3. `WORKBENCH_DATA_VERSION` +1
4. `useCloudSync.ts` 的 `businessSignature()` 排除新 store 中的不稳定字段

## 5. 代码约定

### 必须遵守
- `<script setup lang="ts">`，Composition API only
- 路径 `@/` 不用 `../`
- 写入 IDB 前必须 `toRaw()`
- 纯逻辑放 composable（`*Core.ts`），组件禁止内联重算
- store save 方法调 `markDirty()`
- 中文 commit message，前缀 `feat-` / `fix-`

### 禁止
- 编辑 `presetIcons.ts`（自动生成）
- 给游戏路径加 `.html` 后缀
- 使用 pnpm/yarn/bun

### 卡片列表设计规范
- Grid 列数：桌面 5 列（`repeat(5, minmax(0,1fr))`），移动端单列
- `align-content: start`：防止不足 5 卡时 grid 拉伸
- `grid-auto-rows: <rowHeight>px`：统一行高
- 卡片操作栏：`justify-content: flex-end`

### ID 生成规则
```
前缀_YYYYMMDD_HHmmss_XXXX
```

## 6. 完整创建清单

| # | 文件 | 类型 | 改动 |
|---|------|------|------|
| 1 | `src/types/index.ts` | 编辑 | 接口 + emptyFooData + normalizeFooData + WorkbenchData.foo + WORKBENCH_DATA_VERSION+1 |
| 2 | `src/composables/fooCore.ts` | 新建 | 纯函数 |
| 3 | `src/stores/workbenchFoo.ts` | 新建 | Pinia store |
| 4 | `src/components/workbench/WorkbenchFoo.vue` | 新建 | SFC 组件 |
| 5 | `src/composables/workbenchMenuCore.ts` | 编辑 | MENU_KEYS + DEFAULT_ORDER + LABELS + ICONS |
| 6 | `src/views/WorkbenchView.vue` | 编辑 | SECTION_KEYS + onMounted load + 模板渲染 |
| 7 | `src/composables/useIdb.ts` | 编辑 | idbExportAll + idbImportAll + 旧版兼容 |
| 8 | `src/components/workbench/WorkbenchFoo.vue` | 编辑 | rowHeight 常量（实测 MAX+2px） |
| 9 | `src/composables/useCloudSync.ts` | 编辑 | businessSignature 排除不稳定字段 |
| 10 | `package.json` | 编辑 | test:foo 脚本（可选） |

## 7. 常用命令

```bash
npm install          # 安装依赖
npm run dev          # 开发服务器 http://localhost:16718
npm run build        # 编译（generate-preset-icons → vue-tsc → vite build）
npm run test:foo     # 纯函数测试
npm run test:student # 学生工作台 core 测试聚合
```

> 内存紧张的机器上构建需 `NODE_OPTIONS=--max-old-space-size=3072 npm run build`。
