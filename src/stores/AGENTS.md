# src/stores/ — Data Layer (Pinia)

## OVERVIEW

10 Pinia stores managing all application state. `sites.ts` is the god store with highest centrality.

## STRUCTURE

```
stores/
├── sites.ts              # Core data store (628 lines) — CRUD, filtering, pagination, import/export (localStorage `user-sites`)
├── categories.ts         # Legacy category migration + custom categories
├── searchEngines.ts      # 3 built-in (immutable) + custom engines (3 localStorage keys)
├── theme.ts              # Dark mode (class toggle) + background image state (two concerns)
├── settings.ts           # Dialog size settings contract (useAppSettingsStore, DIALOG_DEFAULTS / DIALOG_LABELS, 216 lines)
├── passwords.ts          # crypto-js AES-CBC encrypted password vault (171 lines, IndexedDB store 'passwords')
├── icons.ts              # User-uploaded custom icon storage (116 lines)
├── countdowns.ts         # Countdown CRUD + sort preference (5 modes, 6 重复规则对象 + 3 分类; IndexedDB store 'countdowns')
├── workbenchTodos.ts     # 工作台待办 CRUD + 筛选/搜索/排序 (131 lines, IndexedDB store 'todos')
└── workbenchNotes.ts     # 工作台便签 CRUD + 置顶 (88 lines, IndexedDB store 'notes')
```

## WHERE TO LOOK

| Task | Store | Notes |
|------|-------|-------|
| Bookmark CRUD | `sites.ts` | `addSite()`, `updateSite()`, `deleteSite()`, `loadSites()` |
| Filter/paginate | `sites.ts` | `filteredSites`, `paginatedSites`, `currentPage` |
| Import/export | `sites.ts` | `exportToMarkdown()`, `importFromMarkdown()` |
| Dead link check | `sites.ts` | Delegates to `useDeadLinkChecker.ts` composable |
| Category management | `categories.ts` | Only `video` is permanently built-in; legacy categories (office, tech, etc.) are seeds users can delete |
| Search engine CRUD | `searchEngines.ts` | Built-in: local, baidu, bing (locked, immutable URLs) |
| Theme/background | `theme.ts` | `initTheme()`, `initBackground()`, toggle methods |
| Password vault | `passwords.ts` | Master-password-gated, uses `useCrypto.ts` for crypto-js AES-CBC + PBKDF2 |
| Custom icons | `icons.ts` | Merges preset icons with user uploads |
| Countdown CRUD | `countdowns.ts` | `addCountdown()`/`updateCountdown()`/`importCountdowns()`/`loadCountdowns()` 入口全部经 `normalizeCountdown` 归一化；6 种 repeat 规则对象 + 3 分类；sort modes (remaining/name/created/endTime/manual) |
| Dialog size settings | `settings.ts` | `useAppSettingsStore` — per-dialog width/height contract, clamp 400-1600px / 30-100vh |
| 工作台待办 | `workbenchTodos.ts` | `addTodo()`, `toggleTodo()`, filter/search/sort; 未完成优先 → 优先级 → 截止日期 → 创建时间 |
| 工作台便签 | `workbenchNotes.ts` | `addNote()`, `togglePin()`, `sortedNotes`; 置顶优先 → updatedAt 降序 |

## CONVENTIONS

- All stores use `defineStore('name', () => { ... })` (Composition API syntax)
- **Mixed storage**: sites/categories/searchEngines/theme/icons still persist via manual `localStorage.setItem`; countdowns/passwords/workbench todos/notes persist to IndexedDB via `useIdb.ts` (`idbPut` / `idbGet`), DB `easy-web-tab`
- Before writing to IndexedDB, pass `toRaw()`-ed plain data — IDB structured clone cannot handle Vue reactive Proxy (DataCloneError)
- Built-in data (categories, engines) is hardcoded constant arrays, not loaded from files
- User data loaded at store initialization: `localStorage` for sites/categories/engines/theme/icons; `idbGet` for countdowns/passwords/workbench todos/notes (with one-time non-destructive migration from legacy localStorage keys)
- **倒计时 repeat 归一化**: `once` 规范为 `null`；旧字符串 `'yearly'` → `{type:'yearly'}`；所有写入/加载入口（loadCountdowns 含 localStorage 迁移、addCountdown、updateCountdown、importCountdowns）都经 `normalizeCountdown`，幂等——IDB 存量旧结构也在加载时归一化
- **倒计时字段**: `category?: 'work'|'life'|'study'`（缺省按 `'work'` 展示）；`lastRemindedAt?: string`（YYYY-MM-DD HH:mm，提醒引擎写入去重用）

## ANTI-PATTERNS

- **`sites.ts` is 628 lines** — avoid adding more responsibilities; extract if growing
- **`sites.ts` cross-references** `useCategoriesStore`, `useSearchEnginesStore`, and `usePasswordsStore` internally
- **Only `video` is truly built-in** — do NOT claim "office, tech, video" are all locked
- **Legacy categories** (office, tech, etc.) are seeded once as user-deletable custom categories — tracked via `user-deleted-legacy-ids` in localStorage
- **Built-in engines** (local, baidu, bing) — cannot be deleted; local engine URL is immutable
- **Data merge logic** in `loadSites()`: built-in data → user localStorage overlay (same-URL override)
- **`searchEngines.ts`** has 3 separate localStorage keys for 3 concerns: `user-search-engines`, `built-in-engine-overrides`, and `built-in-engine-default`
- **`theme.ts`** manages both dark mode AND background images — two concerns in one store
- **`passwords.ts`** stores encrypted data in IndexedDB (store 'passwords'); the `isUnlocked` flag is in-memory only (not persisted)
- **`countdowns.ts` / `passwords.ts`** switched to IndexedDB — `user-countdowns` / `user-passwords` legacy localStorage keys are one-time non-destructive migration sources only (IDB empty + legacy snapshot present → copy to IDB); do NOT read/write them directly
- **No store uses `persist` plugin** — persistence is manual: `localStorage.setItem` for sites/categories/engines/theme/icons; `idbPut` (via `useIdb.ts`) for countdowns/passwords/workbench todos/notes
