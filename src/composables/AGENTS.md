# src/composables/ — Reusable Logic

## OVERVIEW

12 composable files for reusable business logic. One (`presetIcons.ts`) is auto-generated at build time.

## STRUCTURE

```
composables/
├── useMarkdown.ts          # Parses sites.md (gray-matter → YAML frontmatter → Site[])
├── useUrlMetadata.ts       # Auto-fetch title/desc/icon (Jina.ai → allorigins.win fallback)
├── useIconCache.ts         # Icon resolution chain: custom → localStorage cache → Google API → async background fetch
├── useKeyboardShortcuts.ts # Ctrl+N/B/D, Esc bindings; returns { isMac, shortcuts }
├── useBackup.ts            # Backup/restore (has its own regex-based parser — lower fidelity than useMarkdown)
├── useDeadLinkChecker.ts   # Batch link check with 500ms throttle per request
├── useToast.ts             # Singleton toast state (module-level shallowRef, NOT Pinia)
├── useCrypto.ts            # crypto-js AES-CBC + PBKDF2 encryption (98 lines) — used by passwords store
├── countdownCore.ts        # Pure countdown math: calcRemaining (yearly repeat), sortCountdowns (5 modes)
├── useGames.ts             # Loads game list from /games/manifest.json (singleton)
├── useHelpModal.ts         # Singleton help modal state (same pattern as useToast)
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
| Countdown math | `countdownCore.ts` | `calcRemaining()` + `sortCountdowns()` — pure functions, no store deps |
| Game listing | `useGames.ts` | Singleton: loads once from manifest.json, caches result |
| Help modal | `useHelpModal.ts` | Singleton: same module-level shallowRef pattern as useToast |

## CONVENTIONS

- Composables follow `use*` naming convention
- Export functions, not classes
- `useToast` and `useHelpModal` are singletons (module-level state, not in Pinia)
- `useGames` is also a singleton with a `loaded` guard flag
- `presetIcons.ts` is auto-generated — never edit manually

## ANTI-PATTERNS

- **NEVER edit `presetIcons.ts`** — regenerated on every `npm run build`
- **`useBackup.ts` has its own markdown parser** — uses regex instead of `useMarkdown.ts` or `js-yaml`. Lower fidelity than the main parser. Import may silently drop data the main parser would accept.
- **`useDeadLinkChecker.ts`** has 500ms throttle — rapid sequential requests are an anti-pattern
- **`useToast.ts`** and **`useHelpModal.ts`** deviate from Pinia pattern — use module-level `shallowRef` for singleton state
- **Icon fetch timeout** in `useIconCache.ts`: 8000ms (`AbortSignal.timeout(8000)`) — may need adjustment for slow networks
