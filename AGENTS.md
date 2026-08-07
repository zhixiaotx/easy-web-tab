# PROJECT KNOWLEDGE BASE

Personal browser new-tab page / bookmark manager. Vue 3 + Pinia + TypeScript SPA with Markdown-based data, dark mode, multi-engine search, password manager, and standalone mini-games. Chinese-language UI.

## HIERARCHICAL AGENTS.md

Subdirectory `AGENTS.md` files hold per-file detail not repeated here — read the relevant one before working in that area:
- `src/components/AGENTS.md` — the 21 root SFCs + 11 workbench SFCs (10 panels + WorkbenchHealth tabs container), sizes, component-level anti-patterns
- `src/stores/AGENTS.md` — the 12 Pinia stores and data-layer invariants
- `src/composables/AGENTS.md` — the 16 composables (incl. auto-generated `presetIcons.ts`)
- `scripts/AGENTS.md` — build/serve scripts, test scripts, and game rewrite rules

## STRUCTURE

```
easy-web-tab/
├── src/                          # Vue 3 SPA
│   ├── components/               # 21 root SFCs + workbench/ subdir (UI layer)
│   │   └── workbench/            # 10 工作台面板 + WorkbenchHealth tabs 容器（运动/饮食/睡眠/体重 四合一）
│   ├── composables/              # 16 composables (reusable logic, 1 auto-generated; incl. useIdb.ts IndexedDB wrapper, healthCore.ts, ledgerCore.ts)
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
| Countdown management | `src/stores/countdowns.ts` + `src/components/CountdownManager.vue` | 6 repeat rules (once/daily/weekly/monthly/yearly/interval), 3 categories, 5 sort modes |
| Countdown repeat/category math | `src/composables/countdownCore.ts` | `parseRepeat`/`normalizeCountdown`/`calcNextOccurrence`/`getReminderDue`/`repeatLabel`/`categoryLabel`/`serializeRepeatYaml` |
| Reminder engine | `src/composables/useCountdownReminder.ts` | Minute-level tick + daily 9am 3-day summary, singleton popup |
| 健康数据（运动/饮食/睡眠/体重） | `src/stores/workbenchHealth.ts` + `src/components/workbench/WorkbenchHealth.vue` | 目标计划+按天记录混合模型；IndexedDB store 'health'；tabs 容器 WorkbenchHealth.vue 内嵌面板 WorkbenchExercise/Diet/Sleep/Weight.vue（受控组件 activeTab + change emit） |
| 健康纯逻辑（BMI/达标率/睡眠时长/折线图坐标） | `src/composables/healthCore.ts` | `calcExerciseAttainment`/`calcDailyAttainment`/`calcBmi`/`classifyBmi`(国标 WS/T 428-2013)/`weightTarget`/`dietCalories`/`sleepDurationHours`/`weightChartScale`/`normalizeHealthData` |
| 记账数据 | `src/stores/workbenchLedger.ts` + `src/components/workbench/WorkbenchLedger.vue` | 六指标统计（收入/支出/结余/存款/笔数/支出比）+ 行式记录列表可折叠 + 分组管理（内置 8 组不可删）；IndexedDB store 'ledger' |
| 记账纯逻辑（月统计/分类占比/存款累计/自动复制） | `src/composables/ledgerCore.ts` | `calcMonthlyStats`/`calcDepositTotal`/`monthKeyOf`/`prevMonthKeyOf`/`planAutoCopy`/`AUTO_COPY_CATEGORY_IDS`/`formatYuan`/`normalizeLedgerData`/`findCategory`/`maskOrReveal`（金额掩码） |
| Custom icons | `src/stores/icons.ts` | User-uploaded icon storage |
| Game list | `public/games/manifest.json` | 4 entries loaded by `useGames.ts` |
| Game URL rewrites | `scripts/serve-with-rewrites.cjs` | Custom rewrite rules for /games/* |
| Icon generation | `scripts/generate-preset-icons.cjs` | Runs at build time, generates presetIcons.ts |
| 个人工作台 | `src/views/WorkbenchView.vue` + `src/components/workbench/` | 左侧菜单 7 项（主页/待办/便签/倒计时/密码/健康管理/记账）；健康管理=tabs 容器（运动/饮食/睡眠/体重 四合一，WorkbenchHealth.vue）；数据经 `useIdb.ts` 存 IndexedDB |

## CODE MAP

| Symbol | Type | Location | Notes |
|--------|------|----------|-------|
| `useSitesStore` | store | `src/stores/sites.ts` | Core data: CRUD, filtering, pagination, import/export |
| `useThemeStore` | store | `src/stores/theme.ts` | Dark mode + background state |
| `useCategoriesStore` | store | `src/stores/categories.ts` | Legacy categories (migrated user-deletable) + custom |
| `useSearchEnginesStore` | store | `src/stores/searchEngines.ts` | 3 built-in + custom engines |
| `usePasswordsStore` | store | `src/stores/passwords.ts` | Encrypted password vault |
| `useIconsStore` | store | `src/stores/icons.ts` | Custom icon uploads |
| `useCountdownsStore` | store | `src/stores/countdowns.ts` | Countdown CRUD + sort preference (rule-based repeat, IndexedDB) |
| `useWorkbenchTodosStore` | store | `src/stores/workbenchTodos.ts` | Workbench todo CRUD + filter/search/sort (IndexedDB) |
| `useWorkbenchNotesStore` | store | `src/stores/workbenchNotes.ts` | Workbench notes CRUD + pin (IndexedDB) |
| `useWorkbenchHealthStore` | store | `src/stores/workbenchHealth.ts` | 健康数据（height/plans/records 四模块 CRUD，IndexedDB store 'health'） |
| `useWorkbenchLedgerStore` | store | `src/stores/workbenchLedger.ts` | 记账（categories/entries CRUD + 分组管理，内置 8 组不可删，IndexedDB store 'ledger'）；金额可见性 `showAmount`+`toggleAmountVisibility()`（纯内存，不持久化） |
| `useToast` | composable | `src/composables/useToast.ts` | Singleton toast state |
| `getIconUrl` / `getFaviconImgSrc` | functions | `src/composables/useIconCache.ts` | Icon resolution chain |
| `calcRemaining` / `sortCountdowns` | functions | `src/composables/countdownCore.ts` | Pure countdown math + sorting |
| `parseRepeat` / `getReminderDue` / `serializeRepeatYaml` | functions | `src/composables/countdownCore.ts` | Repeat rule engine (parse/normalize, due detection, YAML serialization) |
| `calcExerciseAttainment` / `calcDailyAttainment` / `calcBmi` / `classifyBmi` / `weightChartScale` | functions | `src/composables/healthCore.ts` | 健康纯逻辑：达标率/BMI 国标四档/减肥建议/折线图坐标（组件禁止重算） |
| `calcMonthlyStats` / `monthKeyOf` / `formatYuan` | functions | `src/composables/ledgerCore.ts` | 记账纯逻辑：月统计（income/expense/balance/ratio/byCategory）/月份键/金额格式化；金额掩码由 `maskOrReveal`/`MASKED_TEXT` 统一提供 |
| `calcDepositTotal` | function | `src/composables/ledgerCore.ts` | 存款统计：累计结余（≤upToMonthKey，未知分类计支出） |
| `prevMonthKeyOf` / `planAutoCopy` / `AUTO_COPY_CATEGORY_IDS` | functions | `src/composables/ledgerCore.ts` | 每月自动复制计划：目标月缺 salary/mortgage 且上月有记录 → 生成草稿（金额取上月该分类最新一条）；幂等，不跨月回溯 |
| `useCountdownReminder` | composable | `src/composables/useCountdownReminder.ts` | Singleton reminder popup engine (60s tick + 9am summary) |
| `useCrypto` | composable | `src/composables/useCrypto.ts` | crypto-js AES-CBC + PBKDF2 encryption |
| `idbGet` / `idbPut` / `idbExportAll` / `idbImportAll` | functions | `src/composables/useIdb.ts` | IndexedDB wrapper (DB `easy-web-tab` v2, 6 stores: todos/notes/countdowns/passwords/health/ledger; backup v1 兼容导入) |

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
- **IndexedDB persistence**: 工作台数据（待办/便签/倒计时/密码/健康/记账）存浏览器 IndexedDB — DB 名 `easy-web-tab` v2，6 个 object store（todos/notes/countdowns/passwords/health/ledger），由 `useIdb.ts` 封装；写入前需 `toRaw()`（IDB 结构化克隆无法处理 Vue reactive Proxy，否则 DataCloneError）；导出备份 version 2，v1 旧备份导入时补默认空数据兼容（不拒绝）
- **倒计时 repeat 规范**: `once` 规范存 `null`；旧字符串 `'yearly'` → `{type:'yearly'}`；所有入口（loadCountdowns/importCountdowns/addCountdown/updateCountdown/useMarkdown 解析）经 `normalizeCountdown`/`parseRepeat` 归一化，幂等
- **健康/记账数据规范**: 健康=「目标计划(HealthPlan)+按天记录(HealthRecord 四模块)」混合模型，达标率/时长/BMI 一律走 `healthCore` 纯函数（组件禁止重算）；记账=内置 8 分组（工资=收入 + 房贷/车贷/早餐/午餐/晚餐/通勤/日常=支出，不可删改）+ 自定义分组（唯一名、被记录引用禁删），月统计/存款累计/自动复制计划一律走 `ledgerCore` 纯函数
- **记账自动复制规范**: `loadLedger()` 成功后调 `applyMonthlyAutoCopy()` 补当前月 — 目标月缺 `salary`/`mortgage` 且上月有该类记录 → 生成草稿（date=`当月-01`，金额取上月该类最新一条），幂等（已存在/上月无记录均跳过），不跨月回溯；生成的条目 id 前缀 `ld_`
- **记账敏感金额掩码规范**: 金额展示（收入/支出/结余/存款/支出比/分类占比金额+百分比/单条记录金额）默认隐藏显示 `****`，经 `ledgerCore` 的 `maskOrReveal`/`MASKED_TEXT` 统一掩码（组件禁止自造掩码串）；`showAmount`+`toggleAmountVisibility()` 为纯内存开关（刷新即重置，不写 IDB/localStorage）；空月 `—` 不掩码、消费笔数/共 N 条不掩码、`0.00` 存款照掩（真实值）；编辑弹框金额回填保持明文（用户主动编辑）；工作台 JSON 导出 `idbExportAll` 保持明文（与密码导出一致）

## ANTI-PATTERNS (THIS PROJECT)

- **NEVER edit** `src/composables/presetIcons.ts` — auto-generated by `scripts/generate-preset-icons.cjs` at build time
- **NEVER append `.html`** to game/file paths in routes — serve redirects cause content loss
- **Built-in search engines** (local, baidu, bing) cannot be deleted; local engine URL is immutable
- **Only `video` is a permanently built-in category** — others (office, tech, etc.) are legacy seeds users can delete
- **No built-in seed data** — `public/data/sites.md` was removed from the repo; `loadSites()` still fetches `/data/sites.md` (404 → caught → empty), so data comes solely from localStorage/imports
- **No ESLint/Prettier** — code quality relies solely on TypeScript strict mode
- **No test framework** — no vitest/jest/cypress; `countdownCore.ts`/`todoCore.ts`/`healthCore.ts`/`ledgerCore.ts` pure functions are tested via `node --experimental-strip-types` (`npm run test:countdown` / `test:todo` / `test:health` / `test:ledger`), UI 验证走手动/Playwright QA
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
npm run test:countdown  # Pure-function tests for countdownCore.ts (13 assertions, node --experimental-strip-types)
npm run test:todo       # Pure-function tests for todoCore.ts (node --experimental-strip-types)
npm run test:health     # Pure-function tests for healthCore.ts (BMI/达标率/睡眠/折线图, node --experimental-strip-types)
npm run test:ledger     # Pure-function tests for ledgerCore.ts (月统计/占比/自动复制, node --experimental-strip-types)
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
