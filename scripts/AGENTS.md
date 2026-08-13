# scripts/ — Build & Serve Helpers

## OVERVIEW

3 helper scripts + 6 test scripts + 2 Playwright UI QA scripts: build-time icon generation, production HTTP server, one-time utility, pure-function test runners, chart UI QA (injects IndexedDB data before asserting) + workbench home layout UI QA. CommonJS + PowerShell + TS (package is ESM — `.cjs` extension required; test scripts run via `node --experimental-strip-types`).

## STRUCTURE

```
scripts/
├── generate-preset-icons.cjs # Build-time: scans public/icons/ → generates src/composables/presetIcons.ts (385 lines)
├── serve-with-rewrites.cjs   # Custom HTTP server: serves dist/ + game rewrites + SPA fallback (96 lines)
├── rename-icons.ps1          # One-time icon rename utility (99 lines)
├── test-countdown-core.ts    # countdownCore.ts 纯函数测试（16 断言，含自定义分类保留/筛选/categoryLabel 回退/moveCustomCategoryInList 上移下移；npm run test:countdown）
├── test-todo-core.ts         # todoCore.ts 纯函数测试（16 断言 T1-T16：归一化/筛选/dueInfo/categoryId 维度/未分类/移动/旧内置分类迁移/注册表清理；npm run test:todo）
├── test-health-core.ts       # healthCore.ts 纯函数测试（BMI 国标边界/达标率/睡眠时长/折线图坐标；npm run test:health）
├── test-ledger-core.ts       # ledgerCore.ts 纯函数测试（32 断言 T1-T32：月统计/占比/归一化/内置分组防脏改/趋势序列 calcTrendSeries/图表坐标 trendChartScale/调色板；npm run test:ledger）
├── test-note-markdown.ts     # noteMarkdown.ts 纯函数测试（18 断言 T1-T18：标题/加粗/breaks 换行/链接 target=_blank+rel/自动链接/XSS 转义/javascript: 链接抑制/空输入/列表/代码块/表格/引用/hr/图片/幂等；npm run test:note-markdown）
├── test-workbench-menu-core.ts # workbenchMenuCore.ts 纯函数测试（13 断言 T1-T13：归一化/home 恒 index 0/移动 locked+boundary+中段交换/改名 empty+not-found+截断 12/解析回退默认+icon 查表/常量完整性；npm run test:menu）
├── qa-ledger-charts.mjs        # Playwright UI QA：记账图表全量契约 S1-S7（后台/复用 vite dev 16718-16726 → /workbench → wb-menu-ledger；注入 IndexedDB easy-web-tab v4 store 'ledger' 键 'items' 数据后断言趋势柱/环形图几何 + 回归 + 空态；明暗全页截图 + JSON 证据日志存 .omo/evidence/ledger-charts/；node scripts/qa-ledger-charts.mjs）— 首个「注入 IDB 数据后断言图表」的 UI QA 模式
└── qa-workbench-home.mjs       # Playwright UI QA：主页概览折叠契约 S1-S8（后台/复用 vite dev 16718-16726 → /workbench 主页 UI 播种待办（home-quick-add-input/home-quick-add-btn）→ 折叠默认态/展开持久化（localStorage user-home-overview-collapsed）/空数据整区隐藏/两面板位于概览之前/作用域 nav/视觉瘦身 computed-style/移动端 375 无横向滚动；明暗全页截图 + JSON 证据日志存 .omo/evidence/workbench-home/；node scripts/qa-workbench-home.mjs）— 与其它 QA 脚本禁止并行（同端口域）
```

## WHERE TO LOOK

| Task | Script | Notes |
|------|--------|-------|
| Regenerate preset icons | `generate-preset-icons.cjs` | Runs first in `npm run build`; also runnable standalone |
| Serve production build | `serve-with-rewrites.cjs` | `npm run serve`; PORT 16718 hardcoded |
| Add a game URL rewrite | `serve-with-rewrites.cjs` | if/else chain on `filePath`; redirects to trailing-slash for relative asset resolution |
| 核心纯函数测试 | `test-*-core.ts` | `node --experimental-strip-types` 直跑，自研 assert 断言；被测核心（countdownCore/todoCore/healthCore/ledgerCore/workbenchMenuCore/noteMarkdown）禁止 import vue/pinia |
| 记账图表 UI QA | `qa-ledger-charts.mjs` | Playwright chromium headless：`page.evaluate` 直写 IndexedDB（easy-web-tab v4 / ledger / items）注入近 6 月流水再进面板断言图表契约（S1-S7）；后台 vite dev 16718-16726 自动上浮；证据存 `.omo/evidence/ledger-charts/`；运行 `node scripts/qa-ledger-charts.mjs` |
| 主页概览折叠 UI QA | `qa-workbench-home.mjs` | Playwright chromium headless：主页 UI 播种 1 条待办后断言概览折叠契约（S1-S8）：默认折叠/展开持久化（localStorage `user-home-overview-collapsed`）/空数据整区隐藏/两面板位于概览之前/作用域 nav/视觉瘦身 computed-style/移动端 375 无横向滚动/明暗截图；后台 vite dev 16718-16726 复用或自起（与其它 QA 脚本禁止并行）；证据存 `.omo/evidence/workbench-home/`；运行 `node scripts/qa-workbench-home.mjs` |

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
