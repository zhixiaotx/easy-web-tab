# src/composables/ — Reusable Logic

## OVERVIEW

14 composable files for reusable business logic. One (`presetIcons.ts`) is auto-generated at build time.

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
├── countdownCore.ts        # 倒计时纯逻辑引擎（494 行）: 6 种重复规则 + 3 分类 + calcRemaining/sortCountdowns
├── useCountdownReminder.ts # Singleton 提醒弹框引擎：60s tick + 到点提醒 + 每天 9:00 最后3天摘要
├── useGames.ts             # Loads game list from /games/manifest.json (singleton)
├── useHelpModal.ts         # Singleton help modal state (same pattern as useToast)
├── useIdb.ts               # Zero-dep IndexedDB wrapper — DB `easy-web-tab` v1, 4 stores (todos/notes/countdowns/passwords); idbGet/idbPut/idbClear/idbExportAll/idbImportAll
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
| Countdown math | `countdownCore.ts` | `parseRepeat`/`normalizeCountdown`/`calcNextOccurrence`/`getReminderDue`/`calcRemaining`/`sortCountdowns`/`repeatLabel`/`categoryLabel`/`serializeRepeatYaml` — 纯函数，无 store 依赖，`node --experimental-strip-types` 可测 |
| Countdown reminder | `useCountdownReminder.ts` | 单例弹框引擎：60s `setInterval` tick + init 立即 tick + visibilitychange 立即 tick；到点写 `lastRemindedAt` 去重；9:00 最后3天摘要用 `STORAGE_KEY`(`user-countdown-reminder-date`) 防同日重复 |
| Game listing | `useGames.ts` | Singleton: loads once from manifest.json, caches result |
| Help modal | `useHelpModal.ts` | Singleton: same module-level shallowRef pattern as useToast |
| IndexedDB data layer | `useIdb.ts` | `idbGet`/`idbPut`/`idbClear`/`idbExportAll`/`idbImportAll` — used by countdowns/passwords stores + workbench todos/notes; `idbImportAll` validates backup version |

## CONVENTIONS

- Composables follow `use*` naming convention
- Export functions, not classes
- `useToast` and `useHelpModal` are singletons (module-level state, not in Pinia)
- `useCountdownReminder` is also a singleton (module-level shallowRef + `init()` 幂等守卫)
- `useGames` is also a singleton with a `loaded` guard flag
- `presetIcons.ts` is auto-generated — never edit manually

## ANTI-PATTERNS

- **NEVER edit `presetIcons.ts`** — regenerated on every `npm run build`
- **`useBackup.ts` has its own markdown parser** — uses regex instead of `useMarkdown.ts` or `js-yaml`. Lower fidelity than the main parser. Import may silently drop data the main parser would accept.
- **`useDeadLinkChecker.ts`** has 500ms throttle — rapid sequential requests are an anti-pattern
- **`useToast.ts`** and **`useHelpModal.ts`** deviate from Pinia pattern — use module-level `shallowRef` for singleton state
- **`useIdb.ts`** rejects on failure and does NOT fall back to localStorage — callers must `toRaw()` reactive arrays before `idbPut` (IDB structured clone throws DataCloneError on Vue Proxy)
- **Icon fetch timeout** in `useIconCache.ts`: 8000ms (`AbortSignal.timeout(8000)`) — may need adjustment for slow networks
