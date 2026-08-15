# PROJECT KNOWLEDGE BASE

Personal browser new-tab page / bookmark manager. Vue 3 + Pinia + TypeScript SPA with Markdown-based data, dark mode, multi-engine search, password manager, and standalone mini-games. Chinese-language UI.

## HIERARCHICAL AGENTS.md

Subdirectory `AGENTS.md` files hold per-file detail not repeated here — read the relevant one before working in that area:
- `src/components/AGENTS.md` — the 23 root SFCs + 18 workbench SFCs (13 panels + PanelPager 共享分页条 + WorkbenchHealth tabs container + WorkbenchHealthReminders 只读提醒区块 + WeatherCard/CalendarAnchorCard 主页内嵌卡), sizes, component-level anti-patterns
- `src/stores/AGENTS.md` — the 15 Pinia stores and data-layer invariants
- `src/composables/AGENTS.md` — the 30 composables (incl. auto-generated `presetIcons.ts`)
- `scripts/AGENTS.md` — build/serve scripts, test scripts, and game rewrite rules

## STRUCTURE

```
easy-web-tab/
├── src/                          # Vue 3 SPA
│   ├── components/               # 23 root SFCs + workbench/ subdir (UI layer)
│   │   └── workbench/            # 18 SFC：13 面板（主页/待办/便签/日记本/倒计时/番茄钟/习惯打卡/密码/记账 + 运动/饮食/睡眠/体重）+ PanelPager 共享分页条 + WorkbenchHealth tabs 容器 + WorkbenchHealthReminders 只读提醒 + WeatherCard/CalendarAnchorCard 主页内嵌卡
│   ├── composables/              # 30 composables (reusable logic, 1 auto-generated; incl. useIdb.ts IndexedDB wrapper, workbenchMenuCore.ts, panelPagingCore.ts, usePanelPaging.ts, diaryCore.ts, noteCore.ts, noteMarkdown.ts, healthCore.ts, ledgerCore.ts, spotlightCore.ts, habitCore.ts, pomodoroCore.ts)
│   ├── stores/                   # 15 Pinia stores (data layer; incl. workbenchTodos.ts, workbenchNotes.ts, workbenchDiary.ts, workbenchHealth.ts, workbenchLedger.ts, workbenchPomodoro.ts, workbenchHabits.ts)
│   ├── views/                    # 3 views: HomeView (admin), DisplayView (read-only), WorkbenchView (个人工作台)
│   ├── router/index.ts           # / → admin, /display → new-tab page, /workbench → 个人工作台 (eager imports)
│   ├── types/index.ts            # Site, Category, WorkbenchDiary/DiaryData interfaces + DEFAULT_CATEGORIES + WORKBENCH_DATA_VERSION=6
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
| 记账数据 | `src/stores/workbenchLedger.ts` + `src/components/workbench/WorkbenchLedger.vue` | 六指标统计（收入/支出/结余/存款/笔数/支出比）+ 近 6 月收支趋势柱状图（`ld-trend-*`）+ 支出分类占比环形图（`ld-donut-*`）+ 行式记录列表可折叠 + 分组管理（内置 8 组不可删）；IndexedDB store 'ledger' |
| 记账纯逻辑（月统计/分类占比/存款累计/自动复制/趋势图表） | `src/composables/ledgerCore.ts` | `calcMonthlyStats`/`calcDepositTotal`/`monthKeyOf`/`prevMonthKeyOf`/`planAutoCopy`/`AUTO_COPY_CATEGORY_IDS`/`formatYuan`/`normalizeLedgerData`/`findCategory`/`maskOrReveal`（金额掩码）/`calcTrendSeries`/`trendChartScale`/`LEDGER_CATEGORY_COLORS`（趋势序列/图表坐标/调色板） |
| 日记数据（每日一篇） | `src/stores/workbenchDiary.ts` + `src/components/workbench/WorkbenchDiary.vue` | date 本地 'YYYY-MM-DD' 唯一、upsert 语义、id `dy_` 前缀；`saveDiary` 写 DiaryData 对象形状 `{ entries: toRaw(...) }`（normalizeDiaryData 拒绝裸数组，勿改回数组写入）；排序/归一化一律走 `diaryCore` 纯函数；IndexedDB store 'diary' |
| 日记纯逻辑（日期键/星期标签/排序） | `src/composables/diaryCore.ts` | `dateKeyOf`（本地日期防 UTC 偏移）/`diaryDateLabel`（'YYYY-MM-DD 周X'）/`isValidDateKey`/`normalizeDiaryData`/`sortDiaryEntries`/`findDiaryByDate` |
| 便签数据（分类+时光轴） | `src/stores/workbenchNotes.ts` + `src/components/workbench/WorkbenchNotes.vue` | 便签分类 CRUD（`addCategory`/`updateCategory`/`moveCategory`/`deleteCategory`，名称唯一、删除后该分类便签归未分类）+ 时光轴条目 CRUD（`addTimelineEntry`/`updateTimelineEntry`/`deleteTimelineEntry`）；排序/筛选/归一化一律走 `noteCore` 纯函数（类型筛选默认全部类型 'all'，普通/时光轴精确匹配，拆分走 `noteCore.partitionNotesByType`）；IndexedDB store 'notes' 存 `{categories, notes}`（NoteData） |
| 待办数据（分类注册表） | `src/stores/workbenchTodos.ts` + `src/components/workbench/WorkbenchTodo.vue` | 待办分类 CRUD（`addCategory`/`updateCategory`/`deleteCategory`/`moveCategory`/`toggleTabCategory`，全自定义分类无内置、被引用禁删、重命名同步存量 categoryId、存量 work/life/study 一次性迁移未分类，`user-todo-categories-migrated` marker '2' 门控 + 注册表清理）+ 分类筛选 tabs（`tabCategories` 可见性，`td-cat-*`）+ 表单分类下拉（`allCategories` 仅自定义分类，`td-form-category`）+ 卡片分类徽标；筛选/归一化一律走 `todoCore` 纯函数；分类偏好存 localStorage `user-todo-categories`/`user-todo-tab-categories`（不随 JSON 备份导出）；IndexedDB store 'todos' 存待办数组 |
| Custom icons | `src/stores/icons.ts` | User-uploaded icon storage |
| 设置（弹窗尺寸） | `src/stores/settings.ts` + `src/components/AppSettingsDialog.vue` | 设置数据存 IDB store 'settings'（经 `useIdb.ts` 持久化）；`AppSettingsData` 类型 + `emptyAppSettingsData()` 在 `src/types/index.ts` |
| 工作台菜单设置 | `src/stores/settings.ts` + `src/components/AppSettingsDialog.vue`（工作台设置 tab「工作台菜单」区块）+ `src/composables/workbenchMenuCore.ts` | 10 项菜单顺序/改名（主页恒居 index 0、日记本默认 index 3、名称 ≤12 code point）；排序/改名/归一化一律走 `workbenchMenuCore` 纯函数（组件/视图禁止内联重算）；左菜单渲染由 `settingsStore.workbenchMenuItems` 驱动（WorkbenchView 消费）；IDB store 'settings' 持久化，随备份导出 |
| Game list | `public/games/manifest.json` | 4 entries loaded by `useGames.ts` |
| Game URL rewrites | `scripts/serve-with-rewrites.cjs` | Custom rewrite rules for /games/* |
| Icon generation | `scripts/generate-preset-icons.cjs` | Runs at build time, generates presetIcons.ts |
| 个人工作台 | `src/views/WorkbenchView.vue` + `src/components/workbench/` | 左侧菜单 10 项（主页/待办/便签/日记本/倒计时/番茄钟/习惯打卡/密码/健康管理/记账）；健康管理=tabs 容器（运动/饮食/睡眠/体重 四合一，WorkbenchHealth.vue）；运动/饮食/睡眠面板含只读定时提醒区块（WorkbenchHealthReminders.vue）；便签面板 WorkbenchNotes.vue 支持类型切换（普通/时光轴）+ 分类筛选 + 时光轴条目；日记本面板 WorkbenchDiary.vue（每日一篇，date 本地唯一，Markdown 编辑/预览 + 历史卡片分页）；主页 WorkbenchHome.vue=行动台布局（9 张统计卡收进可折叠「📊 概览」区 home-overview，默认折叠、localStorage user-home-overview-collapsed 记住，空数据按 visibleStatCards 隐藏，两行动面板前置统计卡之前）；数据经 `useIdb.ts` 存 IndexedDB |
| 工作台一屏布局（自适应分页） | `src/composables/usePanelPaging.ts` + `src/composables/panelPagingCore.ts` + `src/components/workbench/PanelPager.vue` | 桌面 ≥769px 一屏布局（页面滚动关闭，`.wb-content` flex 列 + 面板根 flex:1 min-height:0 钉满）；长列表经共享分页条翻页（← 第 X / Y 页 →）；`usePanelPaging` 返回普通对象（非 reactive），ResizeObserver 测列表区可用高 + `gridTemplateColumns` 实测列数，行高常量来自 `.omo/evidence/workbench-onescreen/row-heights.json` 实测（MAX+2px）；`maxRows` 行数上限钳制每页行数（密码 3 行/运动饮食睡眠 1 行）；≤768px 移动端分页惰性（全量渲染无切片）；11 面板接入（todo/notes 双实例/diary/countdown/habits/password/exercise/diet/sleep/weight/ledger），Home 与健康 tabs 容器不接入 |

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
| `useWorkbenchDiaryStore` | store | `src/stores/workbenchDiary.ts` | 日记每日一篇：`loadDiary`/`upsertEntry`（trim 空跳过、同日期更新、新日期 push `dy_` 前缀）/`deleteEntry`；`saveDiary` 写 DiaryData 对象形状 `{ entries: toRaw(...) }`（normalizeDiaryData 拒绝裸数组）；`sortedEntries` 委托 sortDiaryEntries；IndexedDB store 'diary' |
| `useWorkbenchHealthStore` | store | `src/stores/workbenchHealth.ts` | 健康数据（height/plans/records 四模块 CRUD，IndexedDB store 'health'） |
| `useWorkbenchLedgerStore` | store | `src/stores/workbenchLedger.ts` | 记账（categories/entries CRUD + 分组管理，内置 8 组不可删，IndexedDB store 'ledger'）；金额可见性 `showAmount`+`toggleAmountVisibility()`（纯内存，不持久化） |
| `useAppSettingsStore` | store | `src/stores/settings.ts` | 弹窗尺寸/透明度契约 + 工作台菜单：状态 `workbenchMenuOrder`/`workbenchMenuLabels`，变更 `moveWorkbenchMenuItem`/`renameWorkbenchMenuItem`/`resetWorkbenchMenu`（返回 `{ok,reason}`，全部委托 core），computed `workbenchMenuItems`（resolveMenuItems 解析）；IDB store 'settings'，initSettings 两条来源经 `normalizeWorkbenchMenu` |
| `useToast` | composable | `src/composables/useToast.ts` | Singleton toast state |
| `getIconUrl` / `getFaviconImgSrc` | functions | `src/composables/useIconCache.ts` | Icon resolution chain |
| `calcRemaining` / `sortCountdowns` / `moveCustomCategoryInList` | functions | `src/composables/countdownCore.ts` | Pure countdown math + sorting |
| `parseRepeat` / `getReminderDue` / `serializeRepeatYaml` | functions | `src/composables/countdownCore.ts` | Repeat rule engine (parse/normalize, due detection, YAML serialization) |
| `calcExerciseAttainment` / `calcDailyAttainment` / `calcBmi` / `classifyBmi` / `weightChartScale` | functions | `src/composables/healthCore.ts` | 健康纯逻辑：达标率/BMI 国标四档/减肥建议/折线图坐标（组件禁止重算） |
| `calcMonthlyStats` / `monthKeyOf` / `formatYuan` | functions | `src/composables/ledgerCore.ts` | 记账纯逻辑：月统计（income/expense/balance/ratio/byCategory）/月份键/金额格式化；金额掩码由 `maskOrReveal`/`MASKED_TEXT` 统一提供 |
| `calcDepositTotal` | function | `src/composables/ledgerCore.ts` | 存款统计：累计结余（≤upToMonthKey，未知分类计支出） |
| `prevMonthKeyOf` / `planAutoCopy` / `AUTO_COPY_CATEGORY_IDS` | functions | `src/composables/ledgerCore.ts` | 每月自动复制计划：目标月缺 salary/mortgage 且上月有记录 → 生成草稿（金额取上月该分类最新一条）；幂等，不跨月回溯 |
| `calcTrendSeries` / `trendChartScale` / `LEDGER_CATEGORY_COLORS` (+ `TrendMonth` / `TrendChartBar` / `TrendChartScale` types) | functions | `src/composables/ledgerCore.ts` | 记账图表纯逻辑：近 6 月收支序列（`calcTrendSeries(entries, endMonthKey, categories, months=6)`，末月窗口恒 months 条升序、缺失月补 0、跨年走 prevMonthKeyOf、未知分类计支出、非法 endMonthKey → []）+ 分组柱状图坐标（`trendChartScale(series, width, height, pad=24)`，全 0 → null、maxY {1,2,5}×10^k nice 天花板、5 网格线含 label、12 柱、monthLabels + barWidth）+ 8 色暗色安全调色板（`LEDGER_CATEGORY_COLORS`，[0]=`#10b981` emerald 等价应用主色）；组件禁止重算 |
| `filterNotes` / `partitionNotesByType` / `sortNotes` / `sortTimelineEntries` | functions | `src/composables/noteCore.ts` | 便签纯逻辑：筛选（type/categoryId/keyword，type='all' 全部类型不过滤、categoryId='uncategorized' 字面量匹配未分类）/拆分（`partitionNotesByType` 过滤后便签 → {normal,timeline}）/排序（置顶优先 → updatedAt 降序）/时光轴条目排序（datetime 升序 → createdAt 升序）+ `normalizeNoteData`（数组旧格式兼容）+ `findNoteCategory`/`isUncategorized` |
| `renderMarkdown` | function | `src/composables/noteMarkdown.ts` | 便签 Markdown 渲染：markdown-it 懒单例（html:false 防 XSS + linkify:true 自动链接 + breaks:true 单换行→`<br>`）；自定义 link_open 复跑 normalizeLink+validateLink（javascript: 等协议 → 空串锚点抑制）+ target=_blank/rel=noopener nofollow；空/non-string 输入 → ''；幂等 |
| `emptyDiaryData` / `normalizeDiaryData` / `dateKeyOf` / `diaryDateLabel` / `isValidDateKey` / `sortDiaryEntries` / `findDiaryByDate` | functions | `src/composables/diaryCore.ts` | 日记纯逻辑：归一化（非对象/数组 → empty、非法 date 剔除、缺 id 回退 `dy_<date>`、content 强转字符串、时间戳回填，幂等）/本地日期键（`dateKeyOf` 防 UTC 偏移）/星期标签（'YYYY-MM-DD 周X'）/排序（date 降序 → createdAt 降序，不改入参）/按日期查找（组件/视图禁止内联重算） |
| `LEGACY_BUILTIN_TODO_CATEGORIES` / `normalizeTodo` / `filterTodos` / `dueInfo` / `migrateLegacyBuiltinCategories` / `purgeLegacyBuiltinCategories` / `isTodoUncategorized` / `moveCustomCategoryInList` | functions | `src/composables/todoCore.ts` | 待办纯逻辑：归一化（categoryId trim 后空值剔除）/查询筛选（title/description/priority/status/categoryId，categoryId='uncategorized' 字面量匹配未分类）/截止倒计时主角（剩余/今天/逾期）/旧内置分类 work/life/study → 未分类迁移（migrateLegacyBuiltinCategories）+ 注册表残留清理（purgeLegacyBuiltinCategories，不改入参、幂等、返回新数组）/自定义分类移动（组件禁止重算） |
| `WORKBENCH_MENU_KEYS` / `WORKBENCH_MENU_DEFAULT_ORDER` / `MENU_DEFAULT_LABELS` / `MENU_ICONS` + `normalizeWorkbenchMenu` / `moveMenuItem` / `renameMenuLabel` / `resolveMenuItems` | functions | `src/composables/workbenchMenuCore.ts` | 工作台菜单纯逻辑：10 键/默认序/默认名（逐字一致，load-bearing；home/todos/notes/diary/countdowns/pomodoro/habits/passwords/health/ledger，diary 默认名 日记本、图标键 diary→Icon.vue MDI notebook path）/图标常量；归一化（home 恒 index 0、未知键剔除、去重首次优先、缺失按默认序补全恒 10 项、label trim 去空截断 12 code point）/移动（`{ok, reason:'locked'|'boundary'|'not-found'|'ok'}`，不改入参）/改名（`{ok, reason:'empty'|'not-found'|'ok'}`）/解析渲染（label 回退默认名、icon 查表）；组件/视图禁止重算 |
| `calcRowsPerPage` / `clampMaxRows` / `clampPage` / `slicePage` | functions | `src/composables/panelPagingCore.ts` | 面板自适应分页纯逻辑：`calcRowsPerPage(availH, rowHeight, gap=12, maxRows?)` 行槽公式 `Math.max(1, Math.floor((availH + gap) / (rowHeight + gap)))`（availH≤0 → 1），第 4 参 maxRows 上限（经 `clampMaxRows` 归一后 `Math.min`，undefined/NaN/±Infinity → 不钳制）/`clampMaxRows(maxRows?)` 行数上限归一（undefined/NaN/±Infinity → Infinity，否则 `Math.max(1, Math.floor(maxRows))`）/`clampPage(page, totalPages)` 钳制 [1,totalPages]（totalPages≤0 → 1、分数四舍五入）/`slicePage(items, page, pageSize)` 等分切片（pageSize≤0 → []、越界钳末页、返回新数组不改入参）— 纯函数，零 vue/pinia/DOM 依赖，`node --experimental-strip-types` 可测（组件禁止内联重算） |
| `usePanelPaging` | composable | `src/composables/usePanelPaging.ts` | 工作台面板自适应分页：options `{ items: () => T[], rowHeight, gap=12, maxRows?, containerRef, gridRef? }` → 返回**普通对象（非 reactive）**`{ isDesktop, rowsPerPage, colsPerRow, currentPage, totalPages, pageItems, fitsOnePage, next, prev, goto }`；matchMedia `(min-width: 769px)` 桌面检测；ResizeObserver 测高 + `getComputedStyle(grid).gridTemplateColumns` 实测列数；`maxRows` 行数上限（RO 回调传 `calcRowsPerPage` 第 4 参，兜底 FALLBACK 走 `Math.min(6, clampMaxRows(...))`）；≤768px/rowsPerPage 0（未测量/区域未渲染）→ 分页惰性（pageItems 全量、totalPages 恒 1）；`fitsOnePage` = availH ≥ rowHeight+gap，false 时列表区回退 overflow-y:auto（R7） |
| `useCountdownReminder` | composable | `src/composables/useCountdownReminder.ts` | Singleton reminder popup engine (60s tick + 9am summary) |
| `useCrypto` | composable | `src/composables/useCrypto.ts` | crypto-js AES-CBC + PBKDF2 encryption |
| `idbGet` / `idbPut` / `idbExportAll` / `idbImportAll` | functions | `src/composables/useIdb.ts` | IndexedDB wrapper (DB `easy-web-tab` v5, 8 core stores: todos/notes/diary/countdowns/passwords/health/ledger/settings + 3 aux stores: pomodoro/habits/snapshots; backup 导出 version 6, v1-v6 兼容导入, `idbImportAll` 版本范围守卫 `<1 || >6` 拒绝) |

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
- **IndexedDB persistence**: 工作台数据（待办/便签/日记/倒计时/密码/健康/记账/设置/番茄钟/习惯打卡/快照）存浏览器 IndexedDB — DB 名 `easy-web-tab` v5，11 个 object store（8 核心 todos/notes/diary/countdowns/passwords/health/ledger/settings + 3 辅助 pomodoro/habits/snapshots），由 `useIdb.ts` 封装；写入前需 `toRaw()`（IDB 结构化克隆无法处理 Vue reactive Proxy，否则 DataCloneError）；notes store 存 NoteData `{categories, notes}` 双数组；diary store 存 DiaryData `{entries}` 对象（勿写裸数组，normalizeDiaryData 拒绝）；导出备份 version 6，v1-v6 备份导入时兼容（范围守卫 `<1 || >6` 拒绝；v1 补 health/ledger 空数据，v1/v2/v3 补 settings 空数据，v1-v4 补 pomodoro/habits 空数据，v1-v5 补 diary 空数据；notes 旧数组格式归一为 `{categories:[], notes:[...]}`，snapshots 永不进备份）
- **倒计时 repeat 规范**: `once` 规范存 `null`；旧字符串 `'yearly'` → `{type:'yearly'}`；所有入口（loadCountdowns/importCountdowns/addCountdown/updateCountdown/useMarkdown 解析）经 `normalizeCountdown`/`parseRepeat` 归一化，幂等
- **倒计时分类规范**: 内置 6 类（work/life/study/exercise/diet/sleep）+ 自定义分类注册表（`customCategories`，localStorage `user-countdown-categories`，不随 JSON 备份导出，与排序偏好同策略）；标签页可见分类 `tabCategories` 默认 exercise/diet/sleep（localStorage `user-countdown-tab-categories`，首次无记录时落默认值）；`normalizeCountdown` 保留任意 trim 后非空的自定义分类值（不再剥离为 'work'），`categoryLabel` 对未知分类回退原名；`CountdownCategory` 类型 = `string`；表单下拉全量取 `store.allCategories`（内置+自定义）；自定义分类被倒计时引用时删除返回 `{ ok:false, reason:'in-use' }`；重命名会同步存量条目 category 字段（toRaw 重建后 idbPut）
- **待办分类规范**: 无内置分类，全部自定义；`customCategories`（localStorage `user-todo-categories`，不随 JSON 备份导出）；标签页可见分类 `tabCategories` 默认空数组（无默认定义，仅恢复用户勾选记录，localStorage `user-todo-tab-categories`）；`normalizeTodo` 归一化 categoryId（trim 后空值剔除，保留任意非空自定义值），`WorkbenchTodo.categoryId` 类型 = `string`（undefined/'' = 未分类，`isTodoUncategorized` 判定）；表单下拉全量取 `store.allCategories`（仅自定义分类）；分类 CRUD 统一返回 `{ ok, reason: empty|duplicate|not-found|in-use|boundary }`（无 builtin，组件经 `CAT_ERROR_MESSAGES` 映射中文 toast）；自定义分类被待办引用时删除返回 `{ ok:false, reason:'in-use' }`；重命名会同步存量条目 categoryId 字段（toRaw 重建后 saveTodos）；新建分类自动加入标签页；存量迁移：`user-todo-categories-migrated` marker 数据版本化（当前 '2'），`loadTodos()` 在 `!== '2'` 时触发：`migrateLegacyBuiltinCategories`（todoCore 纯函数）将旧版内置 work/life/study → undefined（未分类）+ `purgeLegacyBuiltinCategories` 清理分类注册表残留（customCategories/tabCategories 两处），持久化后置 marker '2'，幂等，marker '2' 后不再执行；组件禁止重算筛选（走 `filterTodos` categoryId 维度，'uncategorized' 字面量=未分类）
- **健康/记账数据规范**: 健康=「目标计划(HealthPlan)+按天记录(HealthRecord 四模块)」混合模型，达标率/时长/BMI 一律走 `healthCore` 纯函数（组件禁止重算）；记账=内置 8 分组（工资=收入 + 房贷/车贷/早餐/午餐/晚餐/通勤/日常=支出，不可删改）+ 自定义分组（唯一名、被记录引用禁删），月统计/存款累计/自动复制计划一律走 `ledgerCore` 纯函数
- **记账自动复制规范**: `loadLedger()` 成功后调 `applyMonthlyAutoCopy()` 补当前月 — 目标月缺 `salary`/`mortgage` 且上月有该类记录 → 生成草稿（date=`当月-01`，金额取上月该类最新一条），幂等（已存在/上月无记录均跳过），不跨月回溯；生成的条目 id 前缀 `ld_`
- **记账敏感金额掩码规范**: 金额展示（收入/支出/结余/存款/支出比/分类占比金额+百分比/单条记录金额）默认隐藏显示 `****`，经 `ledgerCore` 的 `maskOrReveal`/`MASKED_TEXT` 统一掩码（组件禁止自造掩码串）；`showAmount`+`toggleAmountVisibility()` 为纯内存开关（刷新即重置，不写 IDB/localStorage）；空月 `—` 不掩码、消费笔数/共 N 条不掩码、`0.00` 存款照掩（真实值）；编辑弹框金额回填保持明文（用户主动编辑）；工作台 JSON 导出 `idbExportAll` 保持明文（与密码导出一致）
- **便签数据规范**: 便签=「分类(NoteCategory)+便签(WorkbenchNote)」混合模型，IDB store 'notes' 存 `{categories, notes}`（NoteData）；便签带 `categoryId`（undefined/null/空串 = 未分类）+ `entries`（时光轴条目，仅 type='timeline' 保留，normal 类型归一化时强制剔除）；时光轴条目排序走 `sortTimelineEntries`（datetime 升序 → createdAt 升序，noteCore 纯函数，组件禁止内联排序公式）；类型筛选默认 'all'（全部类型，不过滤），普通/时光轴精确匹配，'all' 视图经 `partitionNotesByType` 拆分为双段（普通+时光轴）渲染；类型切换（normal ↔ timeline）保留 content+entries 数据不删除
- **日记数据规范**: 日记=纯条目模型（无分类），每日一篇，`date` 本地 'YYYY-MM-DD' 唯一（`dateKeyOf` 本地日期防 UTC 偏移）；id `dy_` 前缀（缺失回退 `dy_<date>`）；IDB store 'diary' 存 DiaryData 对象 `{ entries }`——**`saveDiary` 写对象形状 `{ entries: toRaw(entries.value) }`，`normalizeDiaryData` 拒绝裸数组（Array.isArray → empty），写裸数组会导致保存后刷新日记全部丢失（T5 round-trip bug 实证），勿改回数组写入**；`upsertEntry` content trim 空跳过不保存；排序/归一化/星期标签一律走 `diaryCore` 纯函数（组件禁止内联重算）
- **工作台一屏布局规范**: 桌面（≥769px，matchMedia `(min-width: 769px)`）页面滚动关闭，`.wb-content` flex 列 + 面板根 `flex:1; min-height:0` 钉满视口，长列表经共享分页条（PanelPager，testid `panel-pager`/`panel-pager-prev`/`panel-pager-info`/`panel-pager-next`，totalPages≤1 不渲染、边界禁用）翻页；分页一律走 `usePanelPaging` composable（核心公式委托 `panelPagingCore` 纯函数，组件禁止内联重算）；rowHeight 常量来自 `.omo/evidence/workbench-onescreen/row-heights.json` 实测 MAX+2px（todo 214/notes 287/timeline 2343/diary 192/countdown 158/habits 82/password 116/exercise 533/diet 537/sleep 563/weight 88/ledger 49，被测文件勿手改）；密码/运动/饮食/睡眠 4 面板为 6 列卡片网格（`repeat(6, minmax(0,1fr))` + gridRef 实测列数）且 `maxRows` 钳制每页行数（password maxRows:3=18 卡/页、exercise/diet/sleep maxRows:1=6 卡/页）；筛选/排序/增删改/月份切换后 `goto(1)` 回页 1（items 变化仅 clampPage 钳制不自动回 1）；`!fitsOnePage` 时列表区回退 `overflow-y:auto` 区内滚动兜底（`*-scroll` 类，R7）；≤768px 移动端分页惰性（全量渲染、无切片、无 pager）；条件渲染列表（健康折叠/密码锁态/记账折叠）containerRef null → 分页惰性直到渲染（R8）

## ANTI-PATTERNS (THIS PROJECT)

- **NEVER edit** `src/composables/presetIcons.ts` — auto-generated by `scripts/generate-preset-icons.cjs` at build time
- **NEVER append `.html`** to game/file paths in routes — serve redirects cause content loss
- **Built-in search engines** (local, baidu, bing) cannot be deleted; local engine URL is immutable
- **Only `video` is a permanently built-in category** — others (office, tech, etc.) are legacy seeds users can delete
- **No built-in seed data** — `public/data/sites.md` was removed from the repo; `loadSites()` still fetches `/data/sites.md` (404 → caught → empty), so data comes solely from localStorage/imports
- **No ESLint/Prettier** — code quality relies solely on TypeScript strict mode
- **No test framework** — no vitest/jest/cypress; `countdownCore.ts`/`todoCore.ts`/`healthCore.ts`/`ledgerCore.ts`/`workbenchMenuCore.ts`/`noteCore.ts`/`diaryCore.ts`/`panelPagingCore.ts` pure functions are tested via `node --experimental-strip-types` (`npm run test:countdown` / `test:todo` / `test:health` / `test:ledger` / `test:menu` / `test:notes` / `test:diary` / `test:paging`), UI 验证走手动/Playwright QA
- **User data priority**: localStorage data overrides built-in data (same-URL merge in `loadSites()`)
- **No Pinia `persist` plugin** — persistence is manual: `localStorage.setItem` for sites/categories/engines/theme/icons; `idbPut` (via `useIdb.ts`) for countdowns/passwords/workbench todos/notes/diary/health/ledger

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
npm run test:diary      # Pure-function tests for diaryCore.ts (15 断言 T1-T15: 归一化/日期键/星期标签/排序/查找, node --experimental-strip-types)
npm run test:note-markdown  # Pure-function tests for noteMarkdown.ts (18 断言 T1-T18: markdown 渲染/breaks 换行/链接 target+rel/XSS 转义/javascript: 链接抑制/空输入, node --experimental-strip-types)
npm run test:menu       # Pure-function tests for workbenchMenuCore.ts (15 断言 T1-T15: 归一化/home 恒 0/移动/改名/解析/常量完整性, node --experimental-strip-types)
npm run test:paging     # Pure-function tests for panelPagingCore.ts (15 断言 T1-T15: calcRowsPerPage/clampPage/slicePage 边界, node --experimental-strip-types)
node scripts/qa-ledger-charts.mjs  # Playwright UI QA: 记账图表契约 S1-S7（后台 vite dev 16718-16726 + 注入 IndexedDB ledger 数据 → 趋势柱/环形图/回归断言 + 明暗全页截图存 .omo/evidence/ledger-charts/）
node scripts/qa-workbench-home.mjs  # Playwright UI QA: 主页概览折叠契约 S1-S8（后台/复用 vite dev 16718-16726 → /workbench 主页 UI 播种待办 → 折叠默认态/展开持久化/空数据隐藏/面板顺序/作用域 nav/视觉瘦身/移动端 375 无横向滚动 + 明暗全页截图存 .omo/evidence/workbench-home/）
node scripts/qa-workbench-onescreen.mjs  # Playwright UI QA: 一屏布局脚手架+行高测量（后台/复用 vite dev 16718-16726 → 注入 IDB v5 7 store + 密码 UI 播种 → 双视口首条行高 MAX+2px → row-heights.json 12 面板 + 明暗 40 截图存 .omo/evidence/workbench-onescreen/）
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
