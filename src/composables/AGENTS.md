# src/composables/ — Reusable Logic

## OVERVIEW

18 composable files for reusable business logic. One (`presetIcons.ts`) is auto-generated at build time.

## STRUCTURE

```
composables/
├── useMarkdown.ts          # Parses sites.md (gray-matter → YAML frontmatter → Site[] + Countdown 规则对象)
├── useUrlMetadata.ts       # Auto-fetch title/desc/icon (Jina.ai → allorigins.win fallback)
├── useIconCache.ts         # Icon resolution chain: custom → localStorage cache → Google API → async background fetch
├── useKeyboardShortcuts.ts # Ctrl+N/B/D, Esc bindings; returns { isMac, shortcuts }
├── useBackup.ts            # Backup/restore (has its own regex-based parser — lower fidelity than useMarkdown)
├── useDeadLinkChecker.ts   # Batch link check with 500ms throttle per request
├── useToast.ts             # Singleton toast state (module-level shallowRef, NOT Pinia)
├── useCrypto.ts            # crypto-js AES-CBC + PBKDF2 encryption (98 lines) — used by passwords store
├── countdownCore.ts        # 倒计时纯逻辑引擎（550 行）: 6 种重复规则 + 分类（内置 6 + 任意自定义，normalizeCountdown 保留 trim 非空值、categoryLabel 未知回退原名）+ calcRemaining/sortCountdowns/moveCustomCategoryInList
├── useCountdownReminder.ts # Singleton 提醒弹框引擎：60s tick + 到点提醒 + 每天 9:00 最后3天摘要
├── useGames.ts             # Loads game list from /games/manifest.json (singleton)
├── useHelpModal.ts         # Singleton help modal state (same pattern as useToast)
├── useIdb.ts               # Zero-dep IndexedDB wrapper — DB `easy-web-tab` v2, 6 stores (todos/notes/countdowns/passwords/health/ledger); idbGet/idbPut/idbClear/idbExportAll/idbImportAll (备份 version 3，v1/v2 兼容导入)
├── healthCore.ts           # 健康纯逻辑引擎: BMI(国标 WS/T 428-2013 四档)/达标率(周/日)/睡眠时长/折线图坐标 + normalizeHealthData
├── ledgerCore.ts           # 记账纯逻辑引擎: 月统计(income/expense/balance/ratio/byCategory)/存款累计/自动复制计划(salary/mortgage)/金额格式化/敏感金额掩码 + normalizeLedgerData
├── noteCore.ts             # 便签纯逻辑引擎: normalizeNoteData(数组旧格式兼容)/sortNotes(置顶→updatedAt 降序)/filterNotes(type/categoryId/keyword，type='all' 不过滤)/partitionNotesByType({normal,timeline} 拆分)/sortTimelineEntries(datetime 升序→createdAt 升序)/findNoteCategory/tabCategoriesOf(showInTabs 过滤)/isUncategorized
├── todoCore.ts             # 待办纯逻辑引擎: normalizeTodo/TODO_PRIORITIES/filterTodos/localToday/dueInfo
└── presetIcons.ts          # AUTO-GENERATED — scanned from public/icons/ at build time (60 lines)
```

## WHERE TO LOOK

| Task | Composable | Notes |
|------|-----------|-------|
| Parse markdown data | `useMarkdown.ts` | Uses `gray-matter` + `markdown-it` |
| Fetch page metadata | `useUrlMetadata.ts` | Tries Jina.ai first, falls back to allorigins.win |
| Icon resolution | `useIconCache.ts` | Chain: custom → localStorage cache → Google API → async background fetch from page HTML |
| Keyboard bindings | `useKeyboardShortcuts.ts` | Returns `{ isMac, shortcuts }` |
| Data import/export | `useBackup.ts` | Separate from `useMarkdown` — own regex parser for import |
| Link checking | `useDeadLinkChecker.ts` | Batch check with 500ms throttle per request |
| Toast notifications | `useToast.ts` | Singleton pattern — shared across entire app |
| Encryption | `useCrypto.ts` | crypto-js: AES-CBC + PBKDF2 key derivation (pure JS, works over HTTP) |
| Countdown math | `countdownCore.ts` | `parseRepeat`/`normalizeCountdown`（保留任意 trim 后非空分类，'once'→null）/`calcNextOccurrence`/`getReminderDue`/`calcRemaining`/`sortCountdowns`/`moveCustomCategoryInList`（自定义分类上移/下移一格，不改入参）/`repeatLabel`/`categoryLabel`（未知分类回退原名）/`serializeRepeatYaml` — 纯函数，无 store 依赖，`node --experimental-strip-types` 可测 |
| Countdown reminder | `useCountdownReminder.ts` | 单例弹框引擎：60s `setInterval` tick + init 立即 tick + visibilitychange 立即 tick；到点写 `lastRemindedAt` 去重；9:00 最后3天摘要用 `STORAGE_KEY`(`user-countdown-reminder-date`) 防同日重复 |
| Game listing | `useGames.ts` | Singleton: loads once from manifest.json, caches result |
| Help modal | `useHelpModal.ts` | Singleton: same module-level shallowRef pattern as useToast |
| IndexedDB data layer | `useIdb.ts` | `idbGet`/`idbPut`/`idbClear`/`idbExportAll`/`idbImportAll` — used by countdowns/passwords stores + workbench todos/notes/health/ledger; `idbImportAll` validates backup version (导出 version 3；仅接受 v1/v2/v3，v1 补 health/ledger 空数据，notes 数组旧格式 → `{categories:[], notes:[...]}` 归一化包装) |
| 健康纯逻辑 | `healthCore.ts` | `emptyHealthData`/`normalizeHealthData`/`calcExerciseAttainment`/`calcDailyAttainment`/`calcBmi`/`classifyBmi`/`weightTarget`/`dietCalories`/`sleepDurationHours`(跨天 +24h、相等=24h)/`weightChartScale`/`weekKeyOf` — 纯函数，无 store 依赖，`node --experimental-strip-types` 可测 |
| 记账纯逻辑 | `ledgerCore.ts` | `emptyLedgerData`/`normalizeLedgerData`/`calcMonthlyStats`/`calcDepositTotal`/`monthKeyOf`/`prevMonthKeyOf`/`planAutoCopy`/`AUTO_COPY_CATEGORY_IDS`/`formatYuan`/`maskOrReveal` — 纯函数，无 store 依赖，`node --experimental-strip-types` 可测 |
| 便签纯逻辑 | `noteCore.ts` | `emptyNoteData`/`normalizeNoteData`(数组旧格式兼容，分类 showInTabs 仅布尔透传)/`normalizeNote`/`normalizeNotes`/`sortNotes`(置顶→updatedAt 降序)/`sortTimelineEntries`(datetime 升序→createdAt 升序)/`filterNotes`(type/categoryId/keyword，NoteFilter.type 接受 'all'=全部类型不过滤、categoryId='uncategorized' 匹配未分类)/`partitionNotesByType`(拆分过滤后便签为 {normal,timeline})/`findNoteCategory`/`tabCategoriesOf`(showInTabs!==false 过滤，返回新数组)/`isUncategorized` — 纯函数，无 store 依赖，`node --experimental-strip-types` 可测 |

## CONVENTIONS

- Composables follow `use*` naming convention
- Export functions, not classes
- `useToast` and `useHelpModal` are singletons (module-level state, not in Pinia)
- `useCountdownReminder` is also a singleton (module-level shallowRef + `init()` 幂等守卫)
- `useGames` is also a singleton with a `loaded` guard flag
- `presetIcons.ts` is auto-generated — never edit manually
- `healthCore.ts` / `ledgerCore.ts` / `noteCore.ts` are pure-logic engines — **禁止 import vue/pinia**（`node --experimental-strip-types` 测试运行器无法执行）；组件/面板只调用它们，禁止重算公式
- 便签分类 `showInTabs` 归一化规则：仅布尔值透传（false 隐藏 / true 显式显示），缺失不新增字段（undefined=默认显示）；`normalizeNoteCategory` + `tabCategoriesOf` 是标签页可见性唯一来源，组件禁止自造过滤公式
- 记账金额掩码格式唯一来源 `ledgerCore` 的 `MASKED_TEXT`（'****'），组件不得自行硬编码掩码串

## ANTI-PATTERNS

- **NEVER edit `presetIcons.ts`** — regenerated on every `npm run build`
- **`useBackup.ts` has its own markdown parser** — uses regex instead of `useMarkdown.ts` or `js-yaml`. Lower fidelity than the main parser. Import may silently drop data the main parser would accept.
- **`useDeadLinkChecker.ts`** has 500ms throttle — rapid sequential requests are an anti-pattern
- **`useToast.ts`** and **`useHelpModal.ts`** deviate from Pinia pattern — use module-level `shallowRef` for singleton state
- **`useIdb.ts`** rejects on failure and does NOT fall back to localStorage — callers must `toRaw()` reactive arrays before `idbPut` (IDB structured clone throws DataCloneError on Vue Proxy); nested reactive arrays need per-array `toRaw` (whole-object `toRaw({...})` doesn't unwrap nested proxies)
- **Icon fetch timeout** in `useIconCache.ts`: 8000ms (`AbortSignal.timeout(8000)`) — may need adjustment for slow networks
