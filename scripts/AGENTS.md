# scripts/ — Build & Serve Helpers

## OVERVIEW

3 helper scripts: build-time icon generation, production HTTP server, one-time utility. CommonJS + PowerShell (package is ESM — `.cjs` extension required).

## STRUCTURE

```
scripts/
├── generate-preset-icons.cjs # Build-time: scans public/icons/ → generates src/composables/presetIcons.ts (385 lines)
├── serve-with-rewrites.cjs   # Custom HTTP server: serves dist/ + game rewrites + SPA fallback (96 lines)
└── rename-icons.ps1          # One-time icon rename utility (99 lines)
```

## WHERE TO LOOK

| Task | Script | Notes |
|------|--------|-------|
| Regenerate preset icons | `generate-preset-icons.cjs` | Runs first in `npm run build`; also runnable standalone |
| Serve production build | `serve-with-rewrites.cjs` | `npm run serve`; PORT 16718 hardcoded |
| Add a game URL rewrite | `serve-with-rewrites.cjs` | if/else chain on `filePath`; redirects to trailing-slash for relative asset resolution |

## CONVENTIONS

- `.cjs` = CommonJS — required because `package.json` has `"type": "module"`
- `serve-with-rewrites.cjs` uses only Node stdlib (`http`/`fs`/`path`/`url`) — zero dependencies
- PORT 16718 + `DIST_DIR` hardcoded — keep in sync with vite.config.ts, Dockerfile, run.bat, pm2.config.cjs

## ANTI-PATTERNS

- **NEVER edit `src/composables/presetIcons.ts` directly** — regenerate via `generate-preset-icons.cjs`
- **NEVER append `.html`** to game paths — rewrites map extensionless URLs to `/{game}/index.html`
- **gushi has no rewrite** — manifest.json registers it, but `serve-with-rewrites.cjs` lacks a `/games/gushi` entry (relative assets may break)
- **`serve.json` ≠ custom server** — PM2's `serve -s` uses `serve.json` (only 2 rewrites); tetris mapping is stale (games now live in dirs with index.html)

## KEY GOTCHAS

- `npm run serve` → custom server WITH game rewrites; `pm2 start` → `server.cjs` → `npx serve -s` (NO game rewrites) — divergent serving
- SPA fallback: unknown paths serve `dist/index.html` (single-page routing for /display etc.)
- Build pipeline: `node scripts/generate-preset-icons.cjs && vue-tsc -b && vite build` — icons must regenerate BEFORE type-check
