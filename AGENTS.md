# PROJECT KNOWLEDGE BASE

**Generated:** 2026-08-01
**Commit:** f6e8000
**Branch:** master

## OVERVIEW

Personal browser new-tab page / bookmark manager. Vue 3 + Pinia + TypeScript SPA with Markdown-based data, dark mode, multi-engine search, password manager, and standalone mini-games. Chinese-language UI.

## STRUCTURE

```
easy-web-tab/
├── src/                          # Vue 3 SPA
│   ├── components/               # 21 SFCs (UI layer)
│   ├── composables/              # 12 composables (reusable logic, 1 auto-generated)
│   ├── stores/                   # 7 Pinia stores (data layer)
│   ├── views/                    # 2 routes: HomeView (admin), DisplayView (read-only)
│   ├── router/index.ts           # / → admin, /display → new-tab page
│   ├── types/index.ts            # Site, Category interfaces + DEFAULT_CATEGORIES
│   └── styles/                   # dark.css, background.css
├── public/
│   ├── data/sites.md             # Seed data (YAML frontmatter Markdown)
│   ├── icons/                    # 15 brand icon files (scanned at build time; most icons are user-custom)
│   ├── backgrounds/              # 30 wallpaper images
│   └── games/                    # 4 standalone HTML apps (listed in manifest.json)
├── scripts/                      # Build helpers
│   ├── generate-preset-icons.cjs # Scans public/icons/ → generates presetIcons.ts
│   ├── serve-with-rewrites.cjs   # Production server with game URL rewrites
│   └── rename-icons.ps1          # One-time icon rename utility
├── dist/                         # Build output (gitignored)
├── serve.json                    # Rewrite rules for `serve -s` (games/tetris, schulte-grid)
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
| Change seed data | `public/data/sites.md` | YAML frontmatter, baked into build |
| Keyboard shortcuts | `src/composables/useKeyboardShortcuts.ts` | Ctrl+N/B/D, Esc |
| Icon caching | `src/composables/useIconCache.ts` | localStorage, 30-day expiry |
| Toast notifications | `src/composables/useToast.ts` | Singleton (module-level shallowRef, not Pinia) |
| Password management | `src/stores/passwords.ts` | crypto-js AES-CBC encrypted, `useCrypto.ts` for crypto |
| Countdown management | `src/stores/countdowns.ts` + `src/components/CountdownManager.vue` | Countdown timers, 5 sort modes, yearly repeat |
| Custom icons | `src/stores/icons.ts` | User-uploaded icon storage |
| Game list | `public/games/manifest.json` | 4 entries loaded by `useGames.ts` |
| Game URL rewrites | `scripts/serve-with-rewrites.cjs` | Custom rewrite rules for /games/* |
| Icon generation | `scripts/generate-preset-icons.cjs` | Runs at build time, generates presetIcons.ts |

## CODE MAP

| Symbol | Type | Location | Notes |
|--------|------|----------|-------|
| `useSitesStore` | store | `src/stores/sites.ts` | Core data: CRUD, filtering, pagination, import/export |
| `useThemeStore` | store | `src/stores/theme.ts` | Dark mode + background state |
| `useCategoriesStore` | store | `src/stores/categories.ts` | Legacy categories (migrated user-deletable) + custom |
| `useSearchEnginesStore` | store | `src/stores/searchEngines.ts` | 3 built-in + custom engines |
| `usePasswordsStore` | store | `src/stores/passwords.ts` | Encrypted password vault |
| `useIconsStore` | store | `src/stores/icons.ts` | Custom icon uploads |
| `useCountdownsStore` | store | `src/stores/countdowns.ts` | Countdown CRUD + sort preference |
| `useToast` | composable | `src/composables/useToast.ts` | Singleton toast state |
| `getIconUrl` / `getFaviconImgSrc` | functions | `src/composables/useIconCache.ts` | Icon resolution chain |
| `calcRemaining` / `sortCountdowns` | functions | `src/composables/countdownCore.ts` | Pure countdown math + sorting |
| `useCrypto` | composable | `src/composables/useCrypto.ts` | crypto-js AES-CBC + PBKDF2 encryption |

## CONVENTIONS

- **All components**: `<script setup lang="ts">` (Composition API only, no Options API)
- **State**: Pinia stores for domain state; `useToast` and `useHelpModal` are exceptions (module-level singletons)
- **Styling**: Scoped CSS + CSS custom properties (`var(--color-primary)` etc.)
- **Path alias**: `@` → `/src` (use `@/` imports, not relative `../`)
- **Package manager**: npm only (no pnpm/yarn/bun)
- **Port**: 16718 hardcoded in vite.config.ts, serve scripts, Dockerfile, run.bat
- **Module type**: ESM (`"type": "module"`, `.cjs` for CommonJS scripts including PM2 configs)
- **TypeScript**: Strict + noUnusedLocals + noUnusedParameters

## ANTI-PATTERNS (THIS PROJECT)

- **NEVER edit** `src/composables/presetIcons.ts` — auto-generated by `scripts/generate-preset-icons.cjs` at build time
- **NEVER append `.html`** to game/file paths in routes — serve redirects cause content loss
- **Built-in search engines** (local, baidu, bing) cannot be deleted; local engine URL is immutable
- **Only `video` is a permanently built-in category** — others (office, tech, etc.) are legacy seeds users can delete
- **Built-in data** (`public/data/sites.md`) is baked into build — cannot be modified at runtime
- **No ESLint/Prettier** — code quality relies solely on TypeScript strict mode
- **No test framework** — zero test files, no vitest/jest/cypress
- **User data priority**: localStorage data overrides built-in data (same-URL merge in `loadSites()`)
- **No Pinia `persist` plugin** — all state persistence is manual `localStorage.setItem` calls

## UNIQUE STYLES

- Data stored as YAML frontmatter Markdown (`sites.md`), parsed by `useMarkdown.ts`
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
npm run serve        # Production server WITH game rewrites (custom Node.js server)
npm start            # Build + serve
pm2 start pm2.config.cjs  # PM2 production (uses server.cjs, NO game rewrites, uses `serve` package)
```

## KEY GOTCHAS

- `pm2.config.cjs` → `server.cjs` → `npx serve -s dist -l 16718` (no game rewrites)
- `npm run serve` → `scripts/serve-with-rewrites.cjs` (custom HTTP server with game rewrites + SPA fallback)
- `serve.json` provides limited rewrites (tetris→tetris.html, schulte-grid) for use with the `serve` package — tetris mapping is stale (games now live in dirs with index.html)
- `.gitignore` excludes `*.md` except README.md — seed data `public/data/sites.md` is NOT tracked in git
- No lazy loading — both views are eagerly imported in router
- `run.bat` has hardcoded Node.js path (`E:\installSoftware\nodejs\`); `start-pm2.ps1` has hardcoded project path (`D:\IDEA\easyWebTab`)
- `presetIcons.ts` is code-generated — edit `scripts/generate-preset-icons.cjs` or add files to `public/icons/` instead
- `searchEngines.ts` stores engine state across 3 separate localStorage keys
- `sites.ts` is the largest store (628 lines) — avoid adding more responsibilities
- `public/games/schulte-grid/` is a leftover dir — NOT in manifest.json (4 registered games); serve rewrites still reference it
