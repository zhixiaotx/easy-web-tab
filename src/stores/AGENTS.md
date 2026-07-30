# src/stores/ — Data Layer (Pinia)

## OVERVIEW

6 Pinia stores managing all application state. `sites.ts` is the god store with highest centrality.

## STRUCTURE

```
stores/
├── sites.ts              # Core data store (528 lines) — CRUD, filtering, pagination, import/export
├── categories.ts         # Legacy category migration + custom categories
├── searchEngines.ts      # 3 built-in (immutable) + custom engines (3 localStorage keys)
├── theme.ts              # Dark mode (class toggle) + background image state (two concerns)
├── passwords.ts          # AES-GCM encrypted password vault (171 lines)
└── icons.ts              # User-uploaded custom icon storage (116 lines)
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
| Password vault | `passwords.ts` | Master-password-gated, uses `useCrypto.ts` for AES-GCM + PBKDF2 |
| Custom icons | `icons.ts` | Merges preset icons with user uploads |

## CONVENTIONS

- All stores use `defineStore('name', () => { ... })` (Composition API syntax)
- State stored in `localStorage` — persistence is manual (`localStorage.setItem` in each store)
- Built-in data (categories, engines) is hardcoded constant arrays, not loaded from files
- User data loaded at store initialization from `localStorage`

## ANTI-PATTERNS

- **`sites.ts` is 528 lines** — avoid adding more responsibilities; extract if growing
- **`sites.ts` cross-references** `useCategoriesStore`, `useSearchEnginesStore`, and `usePasswordsStore` internally
- **Only `video` is truly built-in** — do NOT claim "office, tech, video" are all locked
- **Legacy categories** (office, tech, etc.) are seeded once as user-deletable custom categories — tracked via `user-deleted-legacy-ids` in localStorage
- **Built-in engines** (local, baidu, bing) — cannot be deleted; local engine URL is immutable
- **Data merge logic** in `loadSites()`: built-in data → user localStorage overlay (same-URL override)
- **`searchEngines.ts`** has 3 separate localStorage keys for 3 concerns: `user-search-engines`, `built-in-engine-overrides`, and `built-in-engine-default`
- **`theme.ts`** manages both dark mode AND background images — two concerns in one store
- **`passwords.ts`** stores encrypted data; the `isUnlocked` flag is in-memory only (not persisted)
- **No store uses `persist` plugin** — all persistence is manual `localStorage.setItem` calls
