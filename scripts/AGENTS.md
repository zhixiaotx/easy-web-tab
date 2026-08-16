# scripts/ — Build & Serve Helpers

## OVERVIEW

3 helper scripts + 8 test scripts + 4 Playwright UI QA scripts: build-time icon generation, production HTTP server, one-time utility, pure-function test runners, chart UI QA (injects IndexedDB data before asserting) + workbench home layout UI QA + diary panel UI QA (injects DiaryData before asserting) + workbench one-screen scaffold/row-height measurement QA. CommonJS + PowerShell + TS (package is ESM — `.cjs` extension required; test scripts run via `node --experimental-strip-types`).

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
├── test-workbench-menu-core.ts # workbenchMenuCore.ts 纯函数测试（18 断言 T1-T18：归一化/home 恒 index 0/移动 locked+boundary+中段交换/改名 empty+not-found+截断 12/解析回退默认+icon 查表/常量完整性/可见性归一化 T16/过滤 T17/两参兼容 T18；npm run test:menu）
├── test-diary-core.ts        # diaryCore.ts 纯函数测试（15 断言/55 assertions T1-T15：归一化（数组/非对象 → empty）/日期键校验/星期标签/排序/按日期查找；npm run test:diary）
├── test-panel-paging-core.ts # panelPagingCore.ts 纯函数测试（20 断言 T1-T20：calcRowsPerPage 整除/余数向下/高 0/负高/缺省 gap/gap 0/maxRows 钳制上限+undefined 不钳制、clampMaxRows 归一 undefined/NaN/±Infinity/分数/0、clampPage 范围内/0/越界/退化 total≤0/分数四舍五入、slicePage 空守卫/精确 3 页/越界钳制/不改入参+泛型；npm run test:paging）
├── qa-ledger-charts.mjs        # Playwright UI QA：记账图表全量契约 S1-S7（后台/复用 vite dev 16718-16726 → /workbench → wb-menu-ledger；注入 IndexedDB easy-web-tab v5（`indexedDB.open('easy-web-tab', 5)`）store 'ledger' 键 'items' 数据后断言趋势柱/环形图几何 + 回归 + 空态；S6 回归含「展开列表自动收起图表」（ld-charts-toggle 存在 + .ld-charts-row display:none）后收起恢复默认视觉；明暗全页截图 + JSON 证据日志存 .omo/evidence/ledger-charts/；node scripts/qa-ledger-charts.mjs）— 首个「注入 IDB 数据后断言图表」的 UI QA 模式
├── qa-workbench-home.mjs       # Playwright UI QA：主页轮播契约 S1-S7（后台/复用 vite dev 16718-16726 → /workbench 主页 UI 播种待办（home-quick-add-input/home-quick-add-btn，先点 home-carousel-dot-2 切工具屏）→ 轮播骨架（3 圆点/双箭头/3 屏+概览空态）/播种后行动屏列表+概览屏统计卡/手动切换（next→dot1 active+translateX(-100%)）/6.5s 自动轮播推进/菜单开关联动（wbmenu-switch-todos 关闭→左菜单项+快捷添加+待办面板/统计卡隐藏，开启恢复）/移动端 375 无横向滚动；明暗全页截图 + JSON 证据日志存 .omo/evidence/workbench-home/；node scripts/qa-workbench-home.mjs）— 与其它 QA 脚本禁止并行（同端口域）
├── qa-diary.mjs                # Playwright UI QA：日记本面板契约 S1-S7（后台/复用 vite dev 16718-16726 → /workbench → wb-menu-diary；注入 IndexedDB easy-web-tab v5 store 'diary' 键 'items'（DiaryData {entries} 9 条含今天）→ 空态 dj-empty/8 卡第 1 页 + 「第 1 / 2 页」/周X 星期标签/今天徽标/分页/保存+reload 持久化/空保存守卫/删除流；明暗全页截图 + JSON 日志存 .omo/evidence/workbench-diary/；node scripts/qa-diary.mjs）— 与其它 QA 脚本禁止并行（同端口域）
└── qa-workbench-onescreen.mjs # Playwright UI QA：一屏布局脚手架+行高测量（后台/复用 vite dev 16718-16726 → /workbench；注入 IndexedDB easy-web-tab v5（`indexedDB.open('easy-web-tab', 5)`，out-of-line 键 'items'）7 store（todos 15 条/notes NoteData 12 普通+1 时光轴 20 条目/diary DiaryData 12 条唯一本地日期/countdowns 10 条 once 偏移≥6 天防 reminder-overlay/habits 15 条/health 四模块各 15 条/ledger 25 条跨月）+ 密码不注入 IDB 改走 UI 播种 12 条（crypto-js 加密 blob 需设备密钥，裸注入损坏）→ 双视口（1366x768/1920x1080）测各面板列表首条外层高度取 MAX+2px → 写 .omo/evidence/workbench-onescreen/row-heights.json（12 面板：todo 214/notes 287/timeline 2343/diary 192/countdown 158/habits 82/password 116/exercise 533/diet 537/sleep 563/weight 88/ledger 49）+ 10 面板明暗全页截图 40 张；主页 S1 断言轮播骨架 + 默认第 1 屏 active（home-carousel/home-carousel-dot-0）；node scripts/qa-workbench-onescreen.mjs）— 与其它 QA 脚本禁止并行（同端口域）
```

## WHERE TO LOOK

| Task | Script | Notes |
|------|--------|-------|
| Regenerate preset icons | `generate-preset-icons.cjs` | Runs first in `npm run build`; also runnable standalone |
| Serve production build | `serve-with-rewrites.cjs` | `npm run serve`; PORT 16718 hardcoded |
| Add a game URL rewrite | `serve-with-rewrites.cjs` | if/else chain on `filePath`; redirects to trailing-slash for relative asset resolution |
| 核心纯函数测试 | `test-*-core.ts` | `node --experimental-strip-types` 直跑，自研 assert 断言；被测核心（countdownCore/todoCore/healthCore/ledgerCore/workbenchMenuCore/noteMarkdown/diaryCore）禁止 import vue/pinia |
| 记账图表 UI QA | `qa-ledger-charts.mjs` | Playwright chromium headless：`page.evaluate` 直写 IndexedDB（easy-web-tab v5 / ledger / items，`indexedDB.open('easy-web-tab', 5)`）注入近 6 月流水再进面板断言图表契约（S1-S7）；S6 回归含展开列表自动收起图表（ld-charts-toggle + .ld-charts-row display:none）；后台 vite dev 16718-16726 自动上浮；证据存 `.omo/evidence/ledger-charts/`；运行 `node scripts/qa-ledger-charts.mjs` |
| 主页轮播 UI QA | `qa-workbench-home.mjs` | Playwright chromium headless：主页 UI 播种 1 条待办后断言轮播契约（S1-S7）：轮播骨架（home-carousel/3 圆点/箭头/3 屏）/播种后统计卡与列表出现/手动切换（track translateX + 圆点 active）/6.5s 自动轮播/菜单开关联动（设置弹窗 wbmenu-switch-todos 关闭→菜单项+快捷添加+待办面板/统计卡隐藏，开启恢复）/移动端 375 无横向滚动/明暗截图；后台 vite dev 16718-16726 复用或自起（与其它 QA 脚本禁止并行）；证据存 `.omo/evidence/workbench-home/`；运行 `node scripts/qa-workbench-home.mjs` |
| 日记本面板 UI QA | `qa-diary.mjs` | Playwright chromium headless：`page.evaluate` 直写 IndexedDB（easy-web-tab v5 / diary / items，值 = DiaryData `{entries}` 9 条含今天）再进面板断言契约（S1-S7）：空态 dj-empty/第 1 页恰好 8 卡 + 「第 1 / 2 页」/next 可用 prev 禁用/`dj-card-date-*` 含中文星期 周X/今天卡 `dj-card-today-*`/分页往返/保存+reload 持久化/空保存守卫（toast「内容为空，未保存」）/删除流；注入形状与 store.saveDiary 实际写入一致（T5 曾实证裸数组被 normalizeDiaryData 拒绝）；后台 vite dev 16718-16726 复用或自起（与其它 QA 脚本禁止并行）；证据存 `.omo/evidence/workbench-diary/`；运行 `node scripts/qa-diary.mjs` |
| 分页纯逻辑测试 | `test-panel-paging-core.ts` | 20 断言 T1-T20（calcRowsPerPage/clampMaxRows/clampPage/slicePage 边界全覆盖，含 gap 缺省/分数页/maxRows 钳制/不改入参+泛型）；`node --experimental-strip-types` 直跑；`npm run test:paging` |
| 一屏布局脚手架/行高测量 QA | `qa-workbench-onescreen.mjs` | Playwright chromium headless：IDB v5 注入（`indexedDB.open('easy-web-tab', 5)`，out-of-line 键 'items'）+ 密码 UI 播种（不裸注入 crypto-js 加密 blob）→ 双视口行高测量 MAX+2px → `row-heights.json`（usePanelPaging 的 rowHeight 常量来源，被测文件勿手改）；主页 S1 断言轮播骨架 + 默认第 1 屏 active；明暗截图 40 张存 `.omo/evidence/workbench-onescreen/`；后台 vite dev 16718-16726 复用或自起（与其它 QA 脚本禁止并行）；运行 `node scripts/qa-workbench-onescreen.mjs` |

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
- `qa-diary.mjs` / `qa-ledger-charts.mjs` / `qa-workbench-home.mjs` / `qa-workbench-onescreen.mjs` 共用 16718-16726 端口域 — 四个 QA 脚本禁止相互并行（同端口域抢占 dev server / 端口冲突）
