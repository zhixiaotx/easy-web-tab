# PROJECT KNOWLEDGE BASE

Personal browser new-tab page / bookmark manager. Vue 3 + Pinia + TypeScript SPA with Markdown-based data, dark mode, multi-engine search, password manager, and standalone mini-games. Chinese-language UI.

## HIERARCHICAL AGENTS.md

Subdirectory `AGENTS.md` files hold per-file detail not repeated here — read the relevant one before working in that area:
- `src/components/AGENTS.md` — the 21 root SFCs + 12 workbench SFCs (10 panels + WorkbenchHealth tabs container + WorkbenchHealthReminders 只读提醒区块), sizes, component-level anti-patterns
- `src/stores/AGENTS.md` — the 12 Pinia stores and data-layer invariants
- `src/composables/AGENTS.md` — the 18 composables (incl. auto-generated `presetIcons.ts`)
- `scripts/AGENTS.md` — build/serve scripts, test scripts, and game rewrite rules

## STRUCTURE

```
easy-web-tab/
├── src/                          # Vue 3 SPA
│   ├── components/               # 21 root SFCs + workbench/ subdir (UI layer)
│   │   └── workbench/            # 10 工作台面板 + WorkbenchHealth tabs 容器 + WorkbenchHealthReminders 只读提醒（运动/饮食/睡眠/体重 四合一）
│   ├── composables/              # 18 composables (reusable logic, 1 auto-generated; incl. useIdb.ts IndexedDB wrapper, noteCore.ts, healthCore.ts, ledgerCore.ts)
│   ├── stores/                   # 12 Pinia stores (data layer; incl. workbenchTodos.ts, workbenchNotes.ts, workbenchHealth.ts, workbenchLedger.ts)
│   ├── views/                    # 3 views: HomeView (admin), DisplayView (read-only), WorkbenchView (个人工作台)
│   ├── router/index.ts           # / → admin, /display → new-tab page, /workbench → 个人工作台 (eager imports)
│   ├── types/index.ts            # Site, Category interfaces + DEFAULT_CATEGORIES
│   └── styles/                   # dark.css, background.css
├── public/
│   ├── data/myself-sites.md      # Only data file — sample sites downloaded via HelpModal.vue
│   ├── icons/                    # 14 .svg brand icons (scanned at build) + icons.json export artifact
│   ├── backgrounds/              # 30 wallpaper images
│   └── games/                    # 4 apps: tetris, gushi, cron-generator, id-generator (+ leftover schulte-grid dir)
├── scripts/                      # Build helpers (see scripts/AGENTS.md)
├── server.cjs / pm2.config.cjs   # PM2 path: npx serve -s dist, port 16718 (NO game rewrites)
├── Dockerfile                    # serve -s, port 16718 (no serve.json copied → no game rewrites)
├── run.bat / start-pm2.ps1       # Windows launch scripts (hardcoded paths — see KEY GOTCHAS)
├── vite.config.js                # NOT .ts — alias @ → /src, dev port 16718
├── serve.json                    # Rewrites for `serve -s` (stale tetris mapping — see KEY GOTCHAS)
└── [config files]
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add/edit bookmark UI | `src/components/SiteModal.vue` | Auto-fetches metadata via Jina.ai |
| Bookmark CRUD logic | `src/stores/sites.ts` | God store: filtering, pagination, import/export |
| Add new route | `src/router/index.ts` | Eager-loaded (no lazy loading) |
| Add new type | `src/types/index.ts` | Single file, all interfaces |
| Dark mode styles | `src/styles/dark.css` | CSS variables, class toggle |
| Sample data | `public/data/myself-sites.md` | Fetched by `HelpModal.vue` (「下载示例数据」source) |
| Keyboard shortcuts | `src/composables/useKeyboardShortcuts.ts` | Ctrl+N/B/D, Esc |
| Icon caching | `src/composables/useIconCache.ts` | localStorage, 30-day expiry |
| Toast notifications | `src/composables/useToast.ts` | Singleton (module-level shallowRef, not Pinia) |
| Password management | `src/stores/passwords.ts` | crypto-js AES-CBC encrypted, `useCrypto.ts` for crypto |
| Countdown management | `src/stores/countdowns.ts` + `src/components/workbench/WorkbenchCountdown.vue` | 6 repeat rules (once/daily/weekly/monthly/yearly/interval), 6 categories (work/life/study/exercise/diet/sleep) + 自定义分类注册表, 5 sort modes |
| Countdown repeat/category math | `src/composables/countdownCore.ts` | `parseRepeat`/`normalizeCountdown`/`calcNextOccurrence`/`getReminderDue`/`repeatLabel`/`categoryLabel`/`serializeRepeatYaml`/`moveCustomCategoryInList` |
| Reminder engine | `src/composables/useCountdownReminder.ts` | Minute-level tick + daily 9am 3-day summary, singleton popup |
| 健康数据（运动/饮食/睡眠/体重） | `src/stores/workbenchHealth.ts` + `src/components/workbench/WorkbenchHealth.vue` | 目标计划+按天记录混合模型；IndexedDB store 'health'；tabs 容器 WorkbenchHealth.vue 内嵌面板 WorkbenchExercise/Diet/Sleep/Weight.vue（受控组件 activeTab + change emit）；运动/饮食/睡眠面板顶部挂只读「定时提醒」区块 WorkbenchHealthReminders.vue（按倒计时 category 1:1 映射，纯展示） |
| 健康纯逻辑（BMI/达标率/睡眠时长/折线图坐标） | `src/composables/healthCore.ts` | `calcExerciseAttainment`/`calcDailyAttainment`/`calcBmi`/`classifyBmi`(国标 WS/T 428-2013)/`weightTarget`/`dietCalories`/`sleepDurationHours`/`weightChartScale`/`normalizeHealthData` |
| 记账数据 | `src/stores/workbenchLedger.ts` + `src/components/workbench/WorkbenchLedger.vue` | 六指标统计（收入/支出/结余/存款/笔数/支出比）+ 行式记录列表可折叠 + 分组管理（内置 8 组不可删）；IndexedDB store 'ledger' |
| 记账纯逻辑（月统计/分类占比/存款累计/自动复制） | `src/composables/ledgerCore.ts` | `calcMonthlyStats`/`calcDepositTotal`/`monthKeyOf`/`prevMonthKeyOf`/`planAutoCopy`/`AUTO_COPY_CATEGORY_IDS`/`formatYuan`/`normalizeLedgerData`/`findCategory`/`maskOrReveal`（金额掩码） |
| 便签数据（分类+时光轴） | `src/stores/workbenchNotes.ts` + `src/components/workbench/WorkbenchNotes.vue` | 便签分类 CRUD（`addCategory`/`updateCategory`/`moveCategory`/`deleteCategory`，名称唯一、删除后该分类便签归未分类）+ 时光轴条目 CRUD（`addTimelineEntry`/`updateTimelineEntry`/`deleteTimelineEntry`）；排序/筛选/归一化一律走 `noteCore` 纯函数（类型筛选默认全部类型 'all'，普通/时光轴精确匹配，拆分走 `noteCore.partitionNotesByType`）；IndexedDB store 'notes' 存 `{categories, notes}`（NoteData） |
| 待办数据（分类注册表） | `src/stores/workbenchTodos.ts` + `src/components/workbench/WorkbenchTodo.vue` | 待办分类 CRUD（`addCategory`/`updateCategory`/`deleteCategory`/`moveCategory`/`toggleTabCategory`，全自定义分类无内置、被引用禁删、重命名同步存量 categoryId、存量 work/life/study 一次性迁移未分类，`user-todo-categories-migrated` marker '2' 门控 + 注册表清理）+ 分类筛选 tabs（`tabCategories` 可见性，`td-cat-*`）+ 表单分类下拉（`allCategories` 仅自定义分类，`td-form-category`）+ 卡片分类徽标；筛选/归一化一律走 `todoCore` 纯函数；分类偏好存 localStorage `user-todo-categories`/`user-todo-tab-categories`（不随 JSON 备份导出）；IndexedDB store 'todos' 存待办数组 |
| Custom icons | `src/stores/icons.ts` | User-uploaded icon storage |
| 设置（弹窗尺寸） | `src/stores/settings.ts` + `src/components/AppSettingsDialog.vue` | 设置数据存 IDB store 'settings'（经 `useIdb.ts` 持久化）；`AppSettingsData` 类型 + `emptyAppSettingsData()` 在 `src/types/index.ts` |
| Game list | `public/games/manifest.json` | 4 entries loaded by `useGames.ts` |
| Game URL rewrites | `scripts/serve-with-rewrites.cjs` | Custom rewrite rules for /games/* |
| Icon generation | `scripts/generate-preset-icons.cjs` | Runs at build time, generates presetIcons.ts |
| 个人工作台 | `src/views/WorkbenchView.vue` + `src/components/workbench/` | 左侧菜单 7 项（主页/待办/便签/倒计时/密码/健康管理/记账）；健康管理=tabs 容器（运动/饮食/睡眠/体重 四合一，WorkbenchHealth.vue）；运动/饮食/睡眠面板含只读定时提醒区块（WorkbenchHealthReminders.vue）；便签面板 WorkbenchNotes.vue 支持类型切换（普通/时光轴）+ 分类筛选 + 时光轴条目；数据经 `useIdb.ts` 存 IndexedDB |

## CODE MAP

| Symbol | Type | Location | Notes |
|--------|------|----------|-------|
| `useSitesStore` | store | `src/stores/sites.ts` | Core data: CRUD, filtering, pagination, import/export |
| `useThemeStore` | store | `src/stores/theme.ts` | Dark mode + background state |
| `useCategoriesStore` | store | `src/stores/categories.ts` | Legacy categories (migrated user-deletable) + custom |
| `useSearchEnginesStore` | store | `src/stores/searchEngines.ts` | 3 built-in + custom engines |
| `usePasswordsStore` | store | `src/stores/passwords.ts` | Encrypted password vault |
| `useIconsStore` | store | `src/stores/icons.ts` | Custom icon uploads |
| `useCountdownsStore` | store | `src/stores/countdowns.ts` | Countdown CRUD + custom-category registry (add/rename/delete/move) + sort preference (rule-based repeat, IndexedDB) |
| `useWorkbenchTodosStore` | store | `src/stores/workbenchTodos.ts` | Workbench todo CRUD + filter/search/sort + 分类注册表（全自定义分类 customCategories/tabCategories/allCategories + addCategory/updateCategory/deleteCategory/moveCategory/toggleTabCategory，localStorage user-todo-categories/user-todo-tab-categories 不随备份导出，重命名同步存量 categoryId、被引用禁删，存量 work/life/study 经 migrateLegacyBuiltinCategories 迁移未分类 + purgeLegacyBuiltinCategories 清理注册表，marker '2' 门控）(IndexedDB store 'todos') |
| `useWorkbenchNotesStore` | store | `src/stores/workbenchNotes.ts` | 便签 CRUD + 置顶 + 分类 CRUD（addCategory/updateCategory/moveCategory/deleteCategory，名称唯一、删除后该分类便签归未分类）+ 时光轴条目 CRUD（addTimelineEntry/updateTimelineEntry/deleteTimelineEntry）；IndexedDB store 'notes' 存 `{categories, notes}`（NoteData） |
| `useWorkbenchHealthStore` | store | `src/stores/workbenchHealth.ts` | 健康数据（height/plans/records 四模块 CRUD，IndexedDB store 'health'） |
| `useWorkbenchLedgerStore` | store | `src/stores/workbenchLedger.ts` | 记账（categories/entries CRUD + 分组管理，内置 8 组不可删，IndexedDB store 'ledger'）；金额可见性 `showAmount`+`toggleAmountVisibility()`（纯内存，不持久化） |
| `useToast` | composable | `src/composables/useToast.ts` | Singleton toast state |
| `getIconUrl` / `getFaviconImgSrc` | functions | `src/composables/useIconCache.ts` | Icon resolution chain |
| `calcRemaining` / `sortCountdowns` / `moveCustomCategoryInList` | functions | `src/composables/countdownCore.ts` | Pure countdown math + sorting |
| `parseRepeat` / `getReminderDue` / `serializeRepeatYaml` | functions | `src/composables/countdownCore.ts` | Repeat rule engine (parse/normalize, due detection, YAML serialization) |
| `calcExerciseAttainment` / `calcDailyAttainment` / `calcBmi` / `classifyBmi` / `weightChartScale` | functions | `src/composables/healthCore.ts` | 健康纯逻辑：达标率/BMI 国标四档/减肥建议/折线图坐标（组件禁止重算） |
| `calcMonthlyStats` / `monthKeyOf` / `formatYuan` | functions | `src/composables/ledgerCore.ts` | 记账纯逻辑：月统计（income/expense/balance/ratio/byCategory）/月份键/金额格式化；金额掩码由 `maskOrReveal`/`MASKED_TEXT` 统一提供 |
| `calcDepositTotal` | function | `src/composables/ledgerCore.ts` | 存款统计：累计结余（≤upToMonthKey，未知分类计支出） |
| `prevMonthKeyOf` / `planAutoCopy` / `AUTO_COPY_CATEGORY_IDS` | functions | `src/composables/ledgerCore.ts` | 每月自动复制计划：目标月缺 salary/mortgage 且上月有记录 → 生成草稿（金额取上月该分类最新一条）；幂等，不跨月回溯 |
| `filterNotes` / `partitionNotesByType` / `sortNotes` / `sortTimelineEntries` | functions | `src/composables/noteCore.ts` | 便签纯逻辑：筛选（type/categoryId/keyword，type='all' 全部类型不过滤、categoryId='uncategorized' 字面量匹配未分类）/拆分（`partitionNotesByType` 过滤后便签 → {normal,timeline}）/排序（置顶优先 → updatedAt 降序）/时光轴条目排序（datetime 升序 → createdAt 升序）+ `normalizeNoteData`（数组旧格式兼容）+ `findNoteCategory`/`isUncategorized` |
| `LEGACY_BUILTIN_TODO_CATEGORIES` / `normalizeTodo` / `filterTodos` / `dueInfo` / `migrateLegacyBuiltinCategories` / `purgeLegacyBuiltinCategories` / `isTodoUncategorized` / `moveCustomCategoryInList` | functions | `src/composables/todoCore.ts` | 待办纯逻辑：归一化（categoryId trim 后空值剔除）/查询筛选（title/description/priority/status/categoryId，categoryId='uncategorized' 字面量匹配未分类）/截止倒计时主角（剩余/今天/逾期）/旧内置分类 work/life/study → 未分类迁移（migrateLegacyBuiltinCategories）+ 注册表残留清理（purgeLegacyBuiltinCategories，不改入参、幂等、返回新数组）/自定义分类移动（组件禁止重算） |
| `useCountdownReminder` | composable | `src/composables/useCountdownReminder.ts` | Singleton reminder popup engine (60s tick + 9am summary) |
| `useCrypto` | composable | `src/composables/useCrypto.ts` | crypto-js AES-CBC + PBKDF2 encryption |
| `idbGet` / `idbPut` / `idbExportAll` / `idbImportAll` | functions | `src/composables/useIdb.ts` | IndexedDB wrapper (DB `easy-web-tab` v3, 7 stores: todos/notes/countdowns/passwords/health/ledger/settings; backup 导出 version 4, v1-v4 兼容导入) |

## CONVENTIONS

- **All components**: `<script setup lang="ts">` (Composition API only, no Options API)
- **State**: Pinia stores for domain state; `useToast` and `useHelpModal` are exceptions (module-level singletons)
- **Styling**: Scoped CSS + CSS custom properties (`var(--color-primary)` etc.)
- **Path alias**: `@` → `/src` (use `@/` imports, not relative `../`)
- **Package manager**: npm only (no pnpm/yarn/bun)
- **Port**: 16718 hardcoded in vite.config.js, serve-with-rewrites.cjs, Dockerfile, run.bat, PM2 flow
- **Module type**: ESM (`"type": "module"`, `.cjs` for CommonJS scripts including PM2 configs)
- **TypeScript**: Strict + noUnusedLocals + noUnusedParameters
- **Commits**: Chinese messages prefixed `fix-` / `feat-` (e.g. `fix-导出不导出默认引擎`)
- **IndexedDB persistence**: 工作台数据（待办/便签/倒计时/密码/健康/记账/设置）存浏览器 IndexedDB — DB 名 `easy-web-tab` v3，7 个 object store（todos/notes/countdowns/passwords/health/ledger/settings），由 `useIdb.ts` 封装；写入前需 `toRaw()`（IDB 结构化克隆无法处理 Vue reactive Proxy，否则 DataCloneError）；notes store 存 NoteData `{categories, notes}` 双数组；导出备份 version 4，v1-v4 备份导入时兼容（v1 补 health/ledger 空数据，v1/v2/v3 补 settings 空数据；notes 旧数组格式归一为 `{categories:[], notes:[...]}`，不拒绝）
- **倒计时 repeat 规范**: `once` 规范存 `null`；旧字符串 `'yearly'` → `{type:'yearly'}`；所有入口（loadCountdowns/importCountdowns/addCountdown/updateCountdown/useMarkdown 解析）经 `normalizeCountdown`/`parseRepeat` 归一化，幂等
- **倒计时分类规范**: 内置 6 类（work/life/study/exercise/diet/sleep）+ 自定义分类注册表（`customCategories`，localStorage `user-countdown-categories`，不随 JSON 备份导出，与排序偏好同策略）；标签页可见分类 `tabCategories` 默认 exercise/diet/sleep（localStorage `user-countdown-tab-categories`，首次无记录时落默认值）；`normalizeCountdown` 保留任意 trim 后非空的自定义分类值（不再剥离为 'work'），`categoryLabel` 对未知分类回退原名；`CountdownCategory` 类型 = `string`；表单下拉全量取 `store.allCategories`（内置+自定义）；自定义分类被倒计时引用时删除返回 `{ ok:false, reason:'in-use' }`；重命名会同步存量条目 category 字段（toRaw 重建后 idbPut）
- **待办分类规范**: 无内置分类，全部自定义；`customCategories`（localStorage `user-todo-categories`，不随 JSON 备份导出）；标签页可见分类 `tabCategories` 默认空数组（无默认定义，仅恢复用户勾选记录，localStorage `user-todo-tab-categories`）；`normalizeTodo` 归一化 categoryId（trim 后空值剔除，保留任意非空自定义值），`WorkbenchTodo.categoryId` 类型 = `string`（undefined/'' = 未分类，`isTodoUncategorized` 判定）；表单下拉全量取 `store.allCategories`（仅自定义分类）；分类 CRUD 统一返回 `{ ok, reason: empty|duplicate|not-found|in-use|boundary }`（无 builtin，组件经 `CAT_ERROR_MESSAGES` 映射中文 toast）；自定义分类被待办引用时删除返回 `{ ok:false, reason:'in-use' }`；重命名会同步存量条目 categoryId 字段（toRaw 重建后 saveTodos）；新建分类自动加入标签页；存量迁移：`user-todo-categories-migrated` marker 数据版本化（当前 '2'），`loadTodos()` 在 `!== '2'` 时触发：`migrateLegacyBuiltinCategories`（todoCore 纯函数）将旧版内置 work/life/study → undefined（未分类）+ `purgeLegacyBuiltinCategories` 清理分类注册表残留（customCategories/tabCategories 两处），持久化后置 marker '2'，幂等，marker '2' 后不再执行；组件禁止重算筛选（走 `filterTodos` categoryId 维度，'uncategorized' 字面量=未分类）
- **健康/记账数据规范**: 健康=「目标计划(HealthPlan)+按天记录(HealthRecord 四模块)」混合模型，达标率/时长/BMI 一律走 `healthCore` 纯函数（组件禁止重算）；记账=内置 8 分组（工资=收入 + 房贷/车贷/早餐/午餐/晚餐/通勤/日常=支出，不可删改）+ 自定义分组（唯一名、被记录引用禁删），月统计/存款累计/自动复制计划一律走 `ledgerCore` 纯函数
- **记账自动复制规范**: `loadLedger()` 成功后调 `applyMonthlyAutoCopy()` 补当前月 — 目标月缺 `salary`/`mortgage` 且上月有该类记录 → 生成草稿（date=`当月-01`，金额取上月该类最新一条），幂等（已存在/上月无记录均跳过），不跨月回溯；生成的条目 id 前缀 `ld_`
- **记账敏感金额掩码规范**: 金额展示（收入/支出/结余/存款/支出比/分类占比金额+百分比/单条记录金额）默认隐藏显示 `****`，经 `ledgerCore` 的 `maskOrReveal`/`MASKED_TEXT` 统一掩码（组件禁止自造掩码串）；`showAmount`+`toggleAmountVisibility()` 为纯内存开关（刷新即重置，不写 IDB/localStorage）；空月 `—` 不掩码、消费笔数/共 N 条不掩码、`0.00` 存款照掩（真实值）；编辑弹框金额回填保持明文（用户主动编辑）；工作台 JSON 导出 `idbExportAll` 保持明文（与密码导出一致）
- **便签数据规范**: 便签=「分类(NoteCategory)+便签(WorkbenchNote)」混合模型，IDB store 'notes' 存 `{categories, notes}`（NoteData）；便签带 `categoryId`（undefined/null/空串 = 未分类）+ `entries`（时光轴条目，仅 type='timeline' 保留，normal 类型归一化时强制剔除）；时光轴条目排序走 `sortTimelineEntries`（datetime 升序 → createdAt 升序，noteCore 纯函数，组件禁止内联排序公式）；类型筛选默认 'all'（全部类型，不过滤），普通/时光轴精确匹配，'all' 视图经 `partitionNotesByType` 拆分为双段（普通+时光轴）渲染；类型切换（normal ↔ timeline）保留 content+entries 数据不删除

## ANTI-PATTERNS (THIS PROJECT)

- **NEVER edit** `src/composables/presetIcons.ts` — auto-generated by `scripts/generate-preset-icons.cjs` at build time
- **NEVER append `.html`** to game/file paths in routes — serve redirects cause content loss
- **Built-in search engines** (local, baidu, bing) cannot be deleted; local engine URL is immutable
- **Only `video` is a permanently built-in category** — others (office, tech, etc.) are legacy seeds users can delete
- **No built-in seed data** — `public/data/sites.md` was removed from the repo; `loadSites()` still fetches `/data/sites.md` (404 → caught → empty), so data comes solely from localStorage/imports
- **No ESLint/Prettier** — code quality relies solely on TypeScript strict mode
- **No test framework** — no vitest/jest/cypress; `countdownCore.ts`/`todoCore.ts`/`healthCore.ts`/`ledgerCore.ts`/`noteCore.ts` pure functions are tested via `node --experimental-strip-types` (`npm run test:countdown` / `test:todo` / `test:health` / `test:ledger` / `test:notes`), UI 验证走手动/Playwright QA
- **User data priority**: localStorage data overrides built-in data (same-URL merge in `loadSites()`)
- **No Pinia `persist` plugin** — persistence is manual: `localStorage.setItem` for sites/categories/engines/theme/icons; `idbPut` (via `useIdb.ts`) for countdowns/passwords/workbench todos/notes/health/ledger

## UNIQUE STYLES

- Data stored as YAML frontmatter Markdown (`myself-sites.md`), parsed by `useMarkdown.ts`
- Icon resolution chain: custom icon → localStorage cache → Google Favicon API → async background cache from page HTML
- Dual server strategy: `server.cjs` (PM2, uses `serve` package, NO game rewrites) vs `scripts/serve-with-rewrites.cjs` (custom, has game rewrites) — **divergent serving**
- Games are standalone HTML files in `public/games/`, registered via `manifest.json`, loaded by `useGames.ts`
- Password storage uses crypto-js (AES-CBC + PBKDF2, pure JS — works without HTTPS), not Web Crypto API or plaintext localStorage
- Categories have a legacy migration system: old hardcoded categories (office, tech, etc.) are seeded once then become user-deletable custom categories
- `serve.json` provides partial game rewrites for `serve -s` (tetris, schulte-grid only) — less comprehensive than the custom server

## COMMANDS

```bash
npm install          # Install deps (first time only)
npm run dev          # Dev server: http://localhost:16718
npm run build        # generate-preset-icons → vue-tsc -b → vite build (3 sequential steps)
npm run preview      # Preview production build
npm run test:countdown  # Pure-function tests for countdownCore.ts (16 assertions, node --experimental-strip-types)
npm run test:todo       # Pure-function tests for todoCore.ts (16 断言 T1-T16: 归一化/筛选/categoryId 维度/dueInfo/移动/旧内置分类迁移/注册表清理, node --experimental-strip-types)
npm run test:health     # Pure-function tests for healthCore.ts (BMI/达标率/睡眠/折线图, node --experimental-strip-types)
npm run test:ledger     # Pure-function tests for ledgerCore.ts (月统计/占比/自动复制, node --experimental-strip-types)
npm run test:notes      # Pure-function tests for noteCore.ts (归一化/排序/筛选, node --experimental-strip-types)
npm run serve        # Production server WITH game rewrites (custom Node.js server)
npm start            # Build + serve
pm2 start pm2.config.cjs  # PM2 production (uses server.cjs, NO game rewrites, uses `serve` package)
```

## KEY GOTCHAS

- `pm2.config.cjs` → `server.cjs` → `npx serve -s dist -l 16718` (no game rewrites); `server.cjs` auto-runs `npm run build` if `dist/` is missing. Dockerfile is the same (`serve -s`, serve.json never copied).
- `npm run serve` → `scripts/serve-with-rewrites.cjs` — rewrites `/games/{tetris,schulte-grid,id-generator,cron-generator}` to `/{game}/index.html` (302 → trailing slash). **`gushi` is in manifest.json but has NO rewrite here** — its relative assets can break via this server.
- `serve.json` maps only tetris (stale: → `/games/tetris.html`, but tetris is now a dir) and schulte-grid — other games 404 or lose assets under plain `serve -s`.
- Real Vite config is `vite.config.js` (not `.ts`); `tsconfig.node.json` still includes a non-existent `vite.config.ts` — harmless, don't "fix" by renaming the config.
- `public/data/sites.md` was **removed from the repo** (exists only in git history); `.gitignore` now ignores `sites.md` + `public/data/sites.md` — do not re-add a seed file there.
- `run.bat` hardcodes Node.js path (`E:\installSoftware\nodejs\`); `start-pm2.ps1` hardcodes project path (`D:\IDEA\easyWebTab`) — both stale for this checkout.
- `presetIcons.ts` is code-generated — edit `scripts/generate-preset-icons.cjs` or add files to `public/icons/` instead.
- `searchEngines.ts` stores engine state across 3 separate localStorage keys.
- `sites.ts` is the largest store (628 lines) — avoid adding more responsibilities.
- `public/games/schulte-grid/` is a leftover dir — NOT in manifest.json (4 registered games); rewrites still reference it.
- 用户数据现主要存 IndexedDB（DB `easy-web-tab`），localStorage 仅剩迁移备份与偏好/密钥等（如 `user-sites`、`password-verification-v2`、`user-countdown-sort`）。
- 倒计时/密码 store 已切换 IndexedDB（store 'countdowns' / 'passwords'），`user-countdowns` / `user-passwords` 旧 localStorage key 仅作一次性非破坏迁移来源，勿再直接读写。
