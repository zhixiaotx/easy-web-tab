# Task 14 — 更新 AGENTS.md 层级文档 + 根 README.md

日期：2026-08-04
范围：纯文档任务（4 个 AGENTS.md + 根 README.md + 本证据文件）。未改任何源码、未运行 npm/build/Playwright。

## 一、磁盘实际计数（Get-ChildItem 核对）

```
src/components/ 根目录 .vue = 22        （含遗漏的 AppSettingsDialog.vue）
src/components/workbench/ .vue = 5      （WorkbenchHome/Todo/Notes/Countdown/Password）
src/stores/ .ts = 10                    （含遗漏的 settings.ts）
src/composables/ .ts = 13               （含 useIdb.ts）
src/views/ .vue = 3                     （HomeView/DisplayView/WorkbenchView）
```

全部为真实核对结果，未照抄任务描述数字。

## 二、逐文件改动点

### 1. 根 AGENTS.md（D:\opencodeWorkSpace\easy-web-tab\AGENTS.md）

- HIERARCHICAL 段计数校准：21 SFCs →「22 root SFCs + 5 workbench panels」；7 stores → 10；12 composables → 13
- STRUCTURE 树：components 下补 `workbench/ 5 工作台面板` 子分支；stores 注释补 workbenchTodos.ts + workbenchNotes.ts；composables 注释补 useIdb.ts；views 2 routes → 3 views（+ WorkbenchView 个人工作台）；router 注释补 `/workbench`
- WHERE TO LOOK 新增「个人工作台」行（WorkbenchView.vue + src/components/workbench/，经 useIdb.ts 存 IndexedDB）
- CODE MAP 新增 3 行：useWorkbenchTodosStore、useWorkbenchNotesStore、idbGet/idbPut/idbExportAll/idbImportAll (useIdb.ts)
- CONVENTIONS 新增「IndexedDB persistence」一条（DB easy-web-tab、4 object store、写入需 toRaw 防 DataCloneError）
- ANTI-PATTERNS 修正「No persist plugin」行：原「all persistence is manual localStorage.setItem」→ 区分 localStorage.setItem 与 idbPut（避免与新 CONVENTIONS 矛盾）
- KEY GOTCHAS 新增 2 条：① 用户数据现主要存 IndexedDB，localStorage 仅剩迁移备份与偏好/密钥（user-sites、password-verification-v2、user-countdown-sort）；② countdowns/passwords 已切 IndexedDB，user-countdowns/user-passwords 仅一次性非破坏迁移来源
- 其余内容保留

### 2. src/components/AGENTS.md

- OVERVIEW：21 →「22 root + 5 workbench panels」
- STRUCTURE：补遗漏的 `AppSettingsDialog.vue`（389 行，useAppSettingsStore）；新增 `workbench/` 子目录 5 面板树（注明数据经 useIdb.ts 存 IndexedDB；倒计时/密码面板复用既有 store）
- WHERE TO LOOK 新增「工作台面板」行

### 3. src/stores/AGENTS.md

- OVERVIEW：7 → 10
- STRUCTURE：补遗漏 `settings.ts`（216 行，useAppSettingsStore / DIALOG_DEFAULTS / DIALOG_LABELS）、`workbenchTodos.ts`（131 行，store 'todos'）、`workbenchNotes.ts`（88 行，store 'notes'）；countdowns/passwords 行注明 IndexedDB store
- WHERE TO LOOK 新增「Dialog size settings」「工作台待办」「工作台便签」3 行
- CONVENTIONS：localStorage 单存储表述 → 混合存储（sites/categories/searchEngines/theme/icons 仍 localStorage；countdowns/passwords/workbench todos/notes 走 useIdb.ts）；补 toRaw 要求；初始化加载补 idbGet + 一次性迁移说明
- ANTI-PATTERNS：passwords 行补 IndexedDB；新增 countdowns/passwords 旧 localStorage key 一次性迁移来源说明；修正 persist 插件行（localStorage + idbPut 混合）

### 4. src/composables/AGENTS.md

- OVERVIEW：12 → 13
- STRUCTURE：补 `useIdb.ts` 行（零依赖 IndexedDB 封装，DB easy-web-tab v1，4 store，idbGet/idbPut/idbClear/idbExportAll/idbImportAll）
- WHERE TO LOOK 新增「IndexedDB data layer」行
- ANTI-PATTERNS 新增 1 条：useIdb 失败即 reject 无 localStorage 回退；调用方需 toRaw（DataCloneError）

### 5. README.md（仅 2 个章节，其余一律未动）

- 「自定义开发 → 数据存储」：在「用户数据：localStorage」旁新增「个人工作台数据：IndexedDB（easy-web-tab）」小节，注明 4 个 object store 及 localStorage 仍存的 key
- 「使用技巧 → 多浏览器共享」：「清除」说明更新为 IndexedDB → easy-web-tab → Delete database；注明仅清 IndexedDB 会从陈旧 localStorage 快照（user-countdowns/user-passwords）重新迁移；补多浏览器迁移提示（工作台 JSON 导出不含密码加密密钥，密码仅原设备可恢复）
- 未改动：部署/使用/快捷键/添加网址/导入导出/分类管理/引擎管理/项目结构/数据模型/安装/智能体开发指南

## 三、grep 核对结果（Select-String）

```
# 根 AGENTS.md 出现 useIdb.ts
AGENTS.md:      ...|   ├── composables/              # 13 composables (..., incl. useIdb.ts IndexedDB wrapper)
AGENTS.md:      | `idbGet` / `idbPut` / `idbExportAll` / `idbImportAll` | functions | `src/composables/useIdb.ts` | ...
AGENTS.md:      - **IndexedDB persistence**: 工作台数据（...）由 `useIdb.ts` 封装；...
AGENTS.md:      | 个人工作台 | `src/views/WorkbenchView.vue` + `src/components/workbench/` | ... 数据经 `useIdb.ts` 存 IndexedDB |

# 根 AGENTS.md 出现 workbenchTodos
AGENTS.md:      - `src/stores/AGENTS.md` — the 10 Pinia stores ...
AGENTS.md:      | `useWorkbenchTodosStore` | store | `src/stores/workbenchTodos.ts` | Workbench todo CRUD + filter/search/sort (IndexedDB) |
AGENTS.md:      - 用户数据现主要存 IndexedDB（DB `easy-web-tab`）...

# README.md 出现 IndexedDB 清除说明
README.md:       - **个人工作台数据**：浏览器 IndexedDB（数据库名 `easy-web-tab`）
README.md:       - **清除** F12 打开 Application，在 IndexedDB 下找到 `easy-web-tab` 数据库，选中点击右键 → Delete database，...
README.md:       - 注意：只清 IndexedDB 时，若 Local storage 仍残留旧快照（`user-countdowns` / `user-passwords`）...

# 计数核对（Get-ChildItem，与本任务文档一致）
components 根 .vue = 22 | workbench .vue = 5 | stores .ts = 10 | composables .ts = 13 | views .vue = 3
```

## 四、commit

`docs-更新AGENTS.md与README`（仅 5 个文档 + 本证据，未含 presetIcons.ts / tsconfig.tsbuildinfo / dist / node_modules）
