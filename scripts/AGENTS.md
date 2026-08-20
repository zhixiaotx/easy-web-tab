# scripts/ — Build & Serve Helpers

## OVERVIEW

3 helper scripts + 10 test scripts + 7 Playwright UI QA scripts: build-time icon generation, production HTTP server, one-time utility, pure-function test runners, chart UI QA (injects IndexedDB data before asserting) + workbench home layout UI QA + diary panel UI QA (injects DiaryData before asserting) + workbench one-screen scaffold/row-height measurement QA + 定时提醒三通道升级 QA (injects IDB + mock emailjs/Notification) + 前台倒计时邮件提醒开关 QA (injects IDB countdowns, asserts cd-email-toggle/cd-email-switch toggle) + 销售记账 UI QA (injects IDB business). CommonJS + PowerShell + TS (package is ESM — `.cjs` extension required; test scripts run via `node --experimental-strip-types`).

## STRUCTURE

```
scripts/
├── generate-preset-icons.cjs # Build-time: scans public/icons/ → generates src/composables/presetIcons.ts (385 lines)
├── serve-with-rewrites.cjs   # Custom HTTP server: serves dist/ + game rewrites + SPA fallback (96 lines)
├── rename-icons.ps1          # One-time icon rename utility (99 lines)
├── test-countdown-core.ts    # countdownCore.ts 纯函数测试（16 断言，含自定义分类保留/筛选/categoryLabel 回退/moveCustomCategoryInList 上移下移；npm run test:countdown）
├── test-reminder-core.ts     # reminderCore.ts 纯函数测试（10 断言 T1-T10：isEmailConfigured 总开关关/全空/单字段缺/全填/纯空白、shouldSendReminderEmail 未开/显式关/未配置/开启+配置完整、buildEmailParams 三必填模板变量 + app_url 非空才附加；npm run test:reminder）
├── test-todo-core.ts         # todoCore.ts 纯函数测试（16 断言 T1-T16：归一化/筛选/dueInfo/categoryId 维度/未分类/移动/旧内置分类迁移/注册表清理；npm run test:todo）
├── test-health-core.ts       # healthCore.ts 纯函数测试（BMI 国标边界/达标率/睡眠时长/折线图坐标；npm run test:health）
├── test-ledger-core.ts       # ledgerCore.ts 纯函数测试（32 断言 T1-T32：月统计/占比/归一化/内置分组防脏改/趋势序列 calcTrendSeries/图表坐标 trendChartScale/调色板；npm run test:ledger）
├── test-note-markdown.ts     # noteMarkdown.ts 纯函数测试（18 断言 T1-T18：标题/加粗/breaks 换行/链接 target=_blank+rel/自动链接/XSS 转义/javascript: 链接抑制/空输入/列表/代码块/表格/引用/hr/图片/幂等；npm run test:note-markdown）
├── test-workbench-menu-core.ts # workbenchMenuCore.ts 纯函数测试（18 断言 T1-T18：归一化/home 恒 index 0/移动 locked+boundary+中段交换/改名 empty+not-found+截断 12/解析回退默认+icon 查表/常量完整性/可见性归一化 T16/过滤 T17/两参兼容 T18；npm run test:menu）
├── test-diary-core.ts        # diaryCore.ts 纯函数测试（15 断言/55 assertions T1-T15：归一化（数组/非对象 → empty）/日期键校验/星期标签/排序/按日期查找；npm run test:diary）
├── test-panel-paging-core.ts # panelPagingCore.ts 纯函数测试（20 断言 T1-T20：calcRowsPerPage 整除/余数向下/高 0/负高/缺省 gap/gap 0/maxRows 钳制上限+undefined 不钳制、clampMaxRows 归一 undefined/NaN/±Infinity/分数/0、clampPage 范围内/0/越界/退化 total≤0/分数四舍五入、slicePage 空守卫/精确 3 页/越界钳制/不改入参+泛型；npm run test:paging）
├── test-business-core.ts    # businessCore.ts 纯函数测试（24 断言 T1-T24：种子/归一化/内置支出补回/商品分类空数组尊重/分类 CRUD（add/rename/toggle/move/delete）/soldCount/calcDailyRevenue/calcDailyCost（纯 COGS）/calcDailyLossAmount/calcInventory/calcBusinessStats（纯 COGS 成本/负毛利率/缺失商品计 0/空数据）/lowStockProducts（停售过滤）/calcPurchaseTotals/calcBroughtOutTotals/排行/趋势/折线坐标/filterPurchasesByCategory（all/分类过滤/已删商品排除/未分类排除/空分类）；npm run test:business）
├── qa-ledger-charts.mjs        # Playwright UI QA：记账图表全量契约 S1-S7（后台/复用 vite dev 16718-16726 → /workbench → wb-menu-ledger；注入 IndexedDB easy-web-tab v6（`indexedDB.open('easy-web-tab', 6)`）store 'ledger' 键 'items' 数据后断言趋势柱/环形图几何 + 回归 + 空态；S6 回归含「展开列表自动收起图表」（ld-charts-toggle 存在 + .ld-charts-row display:none）后收起恢复默认视觉；明暗全页截图 + JSON 证据日志存 .omo/evidence/ledger-charts/；node scripts/qa-ledger-charts.mjs）— 首个「注入 IDB 数据后断言图表」的 UI QA 模式
├── qa-workbench-home.mjs       # Playwright UI QA：主页轮播契约 S1-S7（后台/复用 vite dev 16718-16726 → /workbench 主页 UI 播种待办（home-quick-add-input/home-quick-add-btn，先点 home-carousel-dot-2 切工具屏）→ 轮播骨架（3 圆点/双箭头/3 屏+概览空态）/播种后行动屏列表+概览屏统计卡/手动切换（next→dot1 active+translateX(-100%)）/6.5s 自动轮播推进/菜单开关联动（wbmenu-switch-todos 关闭→左菜单项+快捷添加+待办面板/统计卡隐藏，开启恢复）/移动端 375 无横向滚动；明暗全页截图 + JSON 证据日志存 .omo/evidence/workbench-home/；node scripts/qa-workbench-home.mjs）— 与其它 QA 脚本禁止并行（同端口域）
├── qa-diary.mjs                # Playwright UI QA：日记本面板契约 S1-S7（后台/复用 vite dev 16718-16726 → /workbench → wb-menu-diary；注入 IndexedDB easy-web-tab v6 store 'diary' 键 'items'（DiaryData {entries} 9 条含今天）→ 空态 dj-empty/8 卡第 1 页 + 「第 1 / 2 页」/周X 星期标签/今天徽标/分页/保存+reload 持久化/空保存守卫/删除流；明暗全页截图 + JSON 日志存 .omo/evidence/workbench-diary/；node scripts/qa-diary.mjs）— 与其它 QA 脚本禁止并行（同端口域）
├── qa-reminder-upgrade.mjs    # Playwright UI QA：定时提醒三通道升级契约 S4-S8（后台/复用 vite dev 16718-16726 → 注入 IDB 倒计时/设置 + mock emailjs/Notification → 断言设置弹窗「提醒设置」tab 开关与字段（remind-* testid）/到点三通道决策（弹框 + 桌面通知开关联动 + 邮件仅到点 isEmailConfigured && emailReminder 才发）/9:00 摘要桌面通知不发邮件/测试按钮 sendReminderEmail + toast 结果；明暗全页截图 + JSON 证据日志存 .omo/evidence/reminder-upgrade/；node scripts/qa-reminder-upgrade.mjs）— 与其它 QA 脚本禁止并行（同端口域）
├── qa-reminder-toggle.mjs  # Playwright UI QA：前台倒计时弹框卡片邮件提醒开关契约 S1-S4（后台/复用 vite dev 16718-16726 → 注入 IDB countdowns（emailReminder 缺省）+ 设置后进 /display 断言：S1 渲染缺省态（cd-email-toggle label + cd-email-switch checkbox 未勾选 + span「📧 邮件提醒」）/S2 点击切换 → store.updateCountdown 持久化 IndexedDB + toast 文案（开启「已开启邮件提醒，需在设置-提醒设置中配置邮箱后生效」/关闭「已关闭邮件提醒」）/S3 刷新后保持持久化/S4 明暗全页截图 + JSON 证据日志存 .omo/evidence/reminder-toggle/；node scripts/qa-reminder-toggle.mjs）— 与其它 QA 脚本禁止并行（同端口域）
├── qa-business.mjs        # Playwright UI QA：销售记账全量契约 S1-S9（后台/复用 vite dev 16718-16726 → 注入 IndexedDB easy-web-tab v6 store 'business' → /business 断言：S1 左树 7 项+首页统计卡数值/S2 商品页 tabs+新增+停售开关/S3 进货卡片网格（桌面 5 列）+分类 tabs（全部+5 可见分类）+ 卡片分类徽标（bizpur-cat-badge-qa-b1=小吃）+ 分类过滤（小吃 1 卡/饮品空态）+ 新增自动合计/S4 收摊卡片四项（营业额 200/成本 68/利润 132/损耗 5）+ 编辑弹框四项预览（50/20/30/0）+ 同日 upsert 四项重算/S5 支出 tabs+分类管理新增+新增支出/S6 库存卡片网格 3 卡 5 列+预警仅 1 张（停售爆米花不预警）+阈值 0 清空/S7 排行+趋势双折线/S8 设置弹窗销售记账 tab/S9 移动端 375 无横向滚动+明暗截图；证据存 .omo/evidence/business/；node scripts/qa-business.mjs）— 与其它 QA 脚本禁止并行（同端口域）
└── qa-workbench-onescreen.mjs # Playwright UI QA：一屏布局脚手架+行高测量（后台/复用 vite dev 16718-16726 → /workbench；注入 IndexedDB easy-web-tab v6（`indexedDB.open('easy-web-tab', 6)`，out-of-line 键 'items'）7 store（todos 15 条/notes NoteData 12 普通+1 时光轴 20 条目/diary DiaryData 12 条唯一本地日期/countdowns 10 条 once 偏移≥6 天防 reminder-overlay/habits 15 条/health 四模块各 15 条/ledger 25 条跨月）+ 密码不注入 IDB 改走 UI 播种 12 条（crypto-js 加密 blob 需设备密钥，裸注入损坏）→ 双视口（1366x768/1920x1080）测各面板列表首条外层高度取 MAX+2px → 写 .omo/evidence/workbench-onescreen/row-heights.json（12 面板：todo 214/notes 287/timeline 2343/diary 192/countdown 158/habits 82/password 116/exercise 533/diet 537/sleep 563/weight 88/ledger 49）+ 10 面板明暗全页截图 40 张；主页 S1 断言轮播骨架 + 默认第 1 屏 active（home-carousel/home-carousel-dot-0）；node scripts/qa-workbench-onescreen.mjs）— 与其它 QA 脚本禁止并行（同端口域）
```

## WHERE TO LOOK

| Task | Script | Notes |
|------|--------|-------|
| Regenerate preset icons | `generate-preset-icons.cjs` | Runs first in `npm run build`; also runnable standalone |
| Serve production build | `serve-with-rewrites.cjs` | `npm run serve`; PORT 16718 hardcoded |
| Add a game URL rewrite | `serve-with-rewrites.cjs` | if/else chain on `filePath`; redirects to trailing-slash for relative asset resolution |
| 核心纯函数测试 | `test-*-core.ts` | `node --experimental-strip-types` 直跑，自研 assert 断言；被测核心（countdownCore/todoCore/healthCore/ledgerCore/workbenchMenuCore/noteMarkdown/diaryCore/panelPagingCore/reminderCore）禁止 import vue/pinia |
| 记账图表 UI QA | `qa-ledger-charts.mjs` | Playwright chromium headless：`page.evaluate` 直写 IndexedDB（easy-web-tab v6 / ledger / items，`indexedDB.open('easy-web-tab', 6)`）注入近 6 月流水再进面板断言图表契约（S1-S7）；S6 回归含展开列表自动收起图表（ld-charts-toggle + .ld-charts-row display:none）；后台 vite dev 16718-16726 自动上浮；证据存 `.omo/evidence/ledger-charts/`；运行 `node scripts/qa-ledger-charts.mjs` |
| 主页轮播 UI QA | `qa-workbench-home.mjs` | Playwright chromium headless：主页 UI 播种 1 条待办后断言轮播契约（S1-S7）：轮播骨架（home-carousel/3 圆点/箭头/3 屏）/播种后统计卡与列表出现/手动切换（track translateX + 圆点 active）/6.5s 自动轮播/菜单开关联动（设置弹窗 wbmenu-switch-todos 关闭→菜单项+快捷添加+待办面板/统计卡隐藏，开启恢复）/移动端 375 无横向滚动/明暗截图；后台 vite dev 16718-16726 复用或自起（与其它 QA 脚本禁止并行）；证据存 `.omo/evidence/workbench-home/`；运行 `node scripts/qa-workbench-home.mjs` |
| 日记本面板 UI QA | `qa-diary.mjs` | Playwright chromium headless：`page.evaluate` 直写 IndexedDB（easy-web-tab v6 / diary / items，值 = DiaryData `{entries}` 9 条含今天）再进面板断言契约（S1-S7）：空态 dj-empty/第 1 页恰好 8 卡 + 「第 1 / 2 页」/next 可用 prev 禁用/`dj-card-date-*` 含中文星期 周X/今天卡 `dj-card-today-*`/分页往返/保存+reload 持久化/空保存守卫（toast「内容为空，未保存」）/删除流；注入形状与 store.saveDiary 实际写入一致（T5 曾实证裸数组被 normalizeDiaryData 拒绝）；后台 vite dev 16718-16726 复用或自起（与其它 QA 脚本禁止并行）；证据存 `.omo/evidence/workbench-diary/`；运行 `node scripts/qa-diary.mjs` |
| 分页纯逻辑测试 | `test-panel-paging-core.ts` | 20 断言 T1-T20（calcRowsPerPage/clampMaxRows/clampPage/slicePage 边界全覆盖，含 gap 缺省/分数页/maxRows 钳制/不改入参+泛型）；`node --experimental-strip-types` 直跑；`npm run test:paging` |
| 销售记账纯逻辑测试 | `test-business-core.ts` | 24 断言 T1-T24（种子分类/归一化幂等/内置支出补回/商品分类空数组尊重/双分类 CRUD 结果（empty/duplicate/not-found/in-use/builtin/boundary）/soldCount 负值钳 0/calcDailyRevenue 缺失商品计 0/calcDailyCost 纯 COGS 售出×进货价（正常 68 + 缺失商品计 0 + 空数组 0）/calcDailyLossAmount 损耗×售价（正常 5 + 缺失商品计 0 + 全损耗 50）/calcInventory/calcBusinessStats（成本=纯 COGS 售出×进货价、负毛利率、缺失商品计 0、空数据）/lowStockProducts 阈值+升序+停售过滤/calcPurchaseTotals/calcBroughtOutTotals/商品与分类排行/calcBusinessTrend 窗口补零/businessTrendScale 全零态/filterPurchasesByCategory（all 全量、分类过滤、已删商品进货仅 all 可见、未分类商品进货仅 all 可见、空输入））；`node --experimental-strip-types` 直跑；`npm run test:business` |
| 一屏布局脚手架/行高测量 QA | `qa-workbench-onescreen.mjs` | Playwright chromium headless：IDB v6 注入（`indexedDB.open('easy-web-tab', 6)`，out-of-line 键 'items'）+ 密码 UI 播种（不裸注入 crypto-js 加密 blob）→ 双视口行高测量 MAX+2px → `row-heights.json`（usePanelPaging 的 rowHeight 常量来源，被测文件勿手改）；主页 S1 断言轮播骨架 + 默认第 1 屏 active；明暗截图 40 张存 `.omo/evidence/workbench-onescreen/`；后台 vite dev 16718-16726 复用或自起（与其它 QA 脚本禁止并行）；运行 `node scripts/qa-workbench-onescreen.mjs` |
| 提醒纯逻辑测试 | `test-reminder-core.ts` | 10 断言 T1-T10（isEmailConfigured 配置校验边界：总开关关/全空/单字段缺/全填/纯空白 trim；shouldSendReminderEmail 决策：未开/显式关/未配置/开启+配置完整；buildEmailParams 模板变量形状：三必填恒输出 + app_url 非空才附加/空串不附加）；`node --experimental-strip-types` 直跑；`npm run test:reminder` |
| 提醒三通道升级 QA | `qa-reminder-upgrade.mjs` | Playwright chromium headless：注入 IDB 倒计时/设置数据 + mock emailjs/Notification → 断言 S4-S8 契约（设置弹窗「提醒设置」tab remind-* 开关与字段/到点三通道决策/摘要桌面通知不发邮件/测试按钮 sendReminderEmail + toast）；后台 vite dev 16718-16726 复用或自起（与其它 QA 脚本禁止并行）；证据存 `.omo/evidence/reminder-upgrade/`；运行 `node scripts/qa-reminder-upgrade.mjs` |
| 前台倒计时邮件提醒开关 QA | `qa-reminder-toggle.mjs` | Playwright chromium headless：注入 IDB 倒计时（emailReminder 缺省）+ 设置后进 /display 断言 S1-S4 契约（S1 渲染缺省态：`cd-email-toggle` label + `cd-email-switch` checkbox 未勾选 + span「📧 邮件提醒」/S2 点击切换 → `store.updateCountdown` 持久化 IndexedDB + toast 文案：开启「已开启邮件提醒，需在设置-提醒设置中配置邮箱后生效」/关闭「已关闭邮件提醒」/S3 刷新后保持持久化/S4 明暗全页截图）；后台 vite dev 16718-16726 复用或自起（与其它 QA 脚本禁止并行）；证据存 `.omo/evidence/reminder-toggle/`；运行 `node scripts/qa-reminder-toggle.mjs` |
| 销售记账 UI QA | `qa-business.mjs` | Playwright chromium headless：注入 IDB v6 store 'business'（2 商品/1 进货/1 收摊/2 支出/阈值 100）→ /business 断言 S1-S9（左树 7 项+统计卡数值/商品 tabs+新增+停售/进货卡片网格 5 列（bizpur-card-<id>）+分类 tabs（bizpur-cat-* 全部+5 可见分类）+ 卡片分类徽标（bizpur-cat-badge-<id>=小吃）+ 分类过滤（小吃 1 卡/饮品空态）+ 新增自动合计/收摊卡片四项（营业额 200.00/成本 68.00/利润 132.00/损耗 5.00）+ 编辑弹框四项预览（50.00/20.00/30.00/0.00）+ 同日 upsert 四项重算/支出 tabs+分类管理新增分类/库存卡片网格 3 卡 5 列+预警仅 1 张（停售爆米花不预警）+阈值 0 清空/排行+趋势双折线 SVG/设置弹窗销售记账 tab/移动端 375 无横向滚动+明暗截图）；后台 vite dev 16718-16726 复用或自起（与其它 QA 脚本禁止并行）；证据存 `.omo/evidence/business/`；运行 `node scripts/qa-business.mjs` |

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
- `qa-diary.mjs` / `qa-ledger-charts.mjs` / `qa-workbench-home.mjs` / `qa-workbench-onescreen.mjs` / `qa-reminder-upgrade.mjs` / `qa-reminder-toggle.mjs` / `qa-business.mjs` 共用 16718-16726 端口域 — 七个 QA 脚本禁止相互并行（同端口域抢占 dev server / 端口冲突）
