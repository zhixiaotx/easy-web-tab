# src/composables/ — Reusable Logic

## OVERVIEW

33 composable files for reusable business logic. One (`presetIcons.ts`) is auto-generated at build time.

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
├── countdownCore.ts        # 倒计时纯逻辑引擎（550 行）: 6 种重复规则 + 分类（内置 6 + 任意自定义，normalizeCountdown 保留 trim 非空值、categoryLabel 未知回退原名）+ calcRemaining/sortCountdowns/moveCustomCategoryInList（normalizeCountdown 对 emailReminder 仅布尔透传、非布尔/缺失不输出字段=缺省不发邮件）
├── reminderCore.ts         # 提醒纯逻辑引擎（52 行）: ReminderEmailConfig{enabled,toEmail,serviceId,templateId,publicKey} + isEmailConfigured(enabled 且四字段 trim 非空)/shouldSendReminderEmail(c.emailReminder===true && 配置完整)/buildEmailParams({to_email,countdown_name,occurrence_time,app_url?}) — 纯函数零 vue/pinia，node --experimental-strip-types 可测
├── useCountdownReminder.ts # Singleton 提醒引擎（三通道）：60s tick 单例（每轮读一次 settings store）+ 到点→弹框（CountdownReminder.vue）+桌面通知（开关开时）+邮件（仅到点：isEmailConfigured && shouldSendReminderEmail 才发）+ 每天 9:00 最后3天摘要（弹框+桌面通知，**永不发邮件**）；lastRemindedAt 先落库不被邮件阻塞
├── useDesktopNotify.ts     # 桌面通知封装（38 行）: notificationsSupported()/notificationPermission()/requestNotifyPermission()（不支持→'unsupported'、异常→'denied'）/sendDesktopNotification(title,body,tag?)（仅 permission==='granted' 才 new Notification，tag 去重，失败 false 静默）；不主动请求权限（UI 层职责）
├── reminderEmail.ts        # EmailJS v4 邮件发送封装（21 行）: sendReminderEmail(cfg, params): Promise<boolean>（send 第 4 参传 { publicKey } 免全局 init），res?.status===200 判定，失败 console.warn 返回 false 不重试不 toast
├── useGames.ts             # Loads game list from /games/manifest.json (singleton)
├── useHelpModal.ts         # Singleton help modal state (same pattern as useToast)
├── useAppSettingsDialog.ts # AppSettingsDialog 逻辑（弹窗尺寸/工作台菜单 tab 状态）
├── useIdb.ts               # Zero-dep IndexedDB wrapper — DB `easy-web-tab` v5, 8 core stores (todos/notes/diary/countdowns/passwords/health/ledger/settings) + 3 aux stores (pomodoro/habits/snapshots); idbGet/idbPut/idbClear/idbExportAll/idbImportAll (备份 version 6，v1-v6 兼容导入，版本范围守卫 `<1 || >6` 拒绝)
├── useWeather.ts           # 天气数据获取（WorkbenchHome 天气卡 WeatherCard 消费）
├── healthCore.ts           # 健康纯逻辑引擎: BMI(国标 WS/T 428-2013 四档)/达标率(周/日)/睡眠时长/折线图坐标 + normalizeHealthData
├── ledgerCore.ts           # 记账纯逻辑引擎: 月统计(income/expense/balance/ratio/byCategory)/存款累计/自动复制计划(salary/mortgage)/近 6 月趋势序列(calcTrendSeries)/分组柱状图坐标(trendChartScale)/分类调色板(LEDGER_CATEGORY_COLORS)/金额格式化/敏感金额掩码 + normalizeLedgerData
├── businessCore.ts         # 销售记账纯逻辑引擎: empty/normalize（内置支出 5 缺失自动补回、商品分类空数组尊重存量）/双分类 CRUD 结果计算（{ok,reason} 不改入参）/soldCount/calcDailyRevenue/calcInventory/calcBusinessStats/lowStockProducts（停售商品排除）/calcPurchaseTotals/calcBroughtOutTotals/calcProductRanking/calcCategoryRanking/calcBusinessTrend/businessTrendScale（折线坐标）+ 排序/查找/可见列表
├── noteCore.ts               # 便签纯逻辑引擎: normalizeNoteData(数组旧格式兼容)/sortNotes(置顶→updatedAt 降序)/filterNotes(type/categoryId/keyword，type='all' 不过滤)/partitionNotesByType({normal,timeline} 拆分)/sortTimelineEntries(datetime 升序→createdAt 升序)/findNoteCategory/tabCategoriesOf(showInTabs 过滤)/isUncategorized
├── noteMarkdown.ts           # 便签 Markdown 渲染纯函数引擎: renderMarkdown(markdown-it 懒单例，html:false+linkify:true+breaks:true；自定义 link_open 复跑 normalizeLink+validateLink 抑制 javascript: 等协议、注入 target=_blank+rel=noopener nofollow；空输入返回 '')
├── diaryCore.ts             # 日记纯逻辑引擎（零 vue/pinia 依赖，type-only 导入）: emptyDiaryData/normalizeDiaryData(非对象/数组 → empty、非法 date 剔除、缺 id 回退 `dy_<date>`、content 强转字符串、时间戳回填，幂等)/dateKeyOf(本地日期防 UTC 偏移)/diaryDateLabel('YYYY-MM-DD 周X')/isValidDateKey(正则+月 1-12/日 1-31)/sortDiaryEntries(date 降序→createdAt 降序)/findDiaryByDate
├── todoCore.ts             # 待办纯逻辑引擎: LEGACY_BUILTIN_TODO_CATEGORIES/normalizeTodo(categoryId trim 后空值剔除)/TODO_PRIORITIES/migrateLegacyBuiltinCategories(旧内置 work/life/study → 未分类)/purgeLegacyBuiltinCategories(注册表过滤 work/life/study，不改入参幂等返回新数组)/isTodoUncategorized/filterTodos(title/description/priority/status/categoryId)/localToday/dueInfo/moveCustomCategoryInList
├── spotlightCore.ts        # 全局搜索纯逻辑引擎（spotlight 分组/过滤/排序）
├── snapshotCore.ts         # 快照纯逻辑（WorkbenchHome 数据快照导出）
├── habitCore.ts            # 习惯打卡纯逻辑引擎（习惯定义/打卡统计）
├── pomodoroCore.ts         # 番茄钟纯逻辑引擎（工作/休息周期状态机）
├── workbenchMenuCore.ts    # 工作台菜单纯逻辑引擎: WORKBENCH_MENU_KEYS(10 键 home/todos/notes/diary/countdowns/pomodoro/habits/passwords/health/ledger)/WORKBENCH_MENU_DEFAULT_ORDER/MENU_DEFAULT_LABELS(主页/工作待办/个人便签/日记本/定时提醒/番茄钟/习惯打卡/密码管理/健康管理/记账，逐字一致)/MENU_ICONS(diary 图标键 → Icon.vue MDI notebook path) + normalizeWorkbenchMenu(home 恒 index 0、未知键剔除、去重首次优先、缺失按默认序补全恒 10 项、label trim 去空截断 12 code point)/normalizeWorkbenchMenuVisibility(仅已知键布尔，缺失=显示)/moveMenuItem(上移下移，{ok,reason:'locked'|'boundary'|'not-found'|'ok'})/renameMenuLabel({ok,reason:'empty'|'not-found'|'ok'})/resolveMenuItems(label 回退默认、icon 查表，可选第 3 参 visibility 过滤 false 键)
├── panelPagingCore.ts      # 工作台面板自适应分页纯逻辑引擎: calcRowsPerPage(行槽公式 Math.max(1, Math.floor((availH+gap)/(rowHeight+gap)))，availH≤0 → 1，gap 缺省 12，第 4 参 maxRows 上限经 clampMaxRows 归一后 Math.min)/clampMaxRows(行数上限归一: undefined/NaN/±Infinity → Infinity，否则 Math.max(1, Math.floor(maxRows)))/clampPage(钳制 [1,totalPages]，totalPages≤0 → 1、分数四舍五入)/slicePage(等分切片，pageSize≤0 → []、越界钳末页、不改入参) — 零 vue/pinia/DOM 依赖
├── usePanelPaging.ts       # 工作台面板自适应分页 composable: options { items: () => T[], rowHeight, gap?, maxRows?, containerRef, gridRef? } → 普通对象（非 reactive）{ isDesktop, rowsPerPage, colsPerRow, currentPage, totalPages, pageItems, fitsOnePage, next, prev, goto };ResizeObserver 测高 + getComputedStyle(grid).gridTemplateColumns 实测列数;matchMedia ≥769px 桌面检测;maxRows 行数上限（RO 回调传 calcRowsPerPage 第 4 参，兜底 FALLBACK 走 Math.min(6, clampMaxRows(...))）;≤768px/未测量/区域未渲染 → 分页惰性;多实例安全（便签双实例）
├── useWorkbenchShortcuts.ts # 工作台快捷键: Alt+K(输入态跳过) 开浮层 / Ctrl+Alt+1..9(1-7 导航菜单、8 浮层、9 侧栏折叠) / Esc 关闭
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
| Countdown reminder | `useCountdownReminder.ts` | 单例三通道引擎：60s `setInterval` tick + init/visibilitychange 立即 tick（每轮读一次 settings store）；到点写 `lastRemindedAt` 去重（先落库不被邮件阻塞）→ 弹框（CountdownReminder.vue）+ 桌面通知（desktopNotifyEnabled 开时 sendDesktopNotification）+ 邮件（仅到点：isEmailConfigured && shouldSendReminderEmail 才发，buildEmailParams 带 window.location.href 作 app_url）；9:00 最后3天摘要用 `STORAGE_KEY`(`user-countdown-reminder-date`) 防同日重复，摘要只弹框+桌面通知**永不发邮件** |
| 提醒纯逻辑/邮件配置 | `reminderCore.ts` | `ReminderEmailConfig`(enabled/toEmail/serviceId/templateId/publicKey)/`isEmailConfigured`(enabled 且四字段 trim 非空，任一缺失 → false 短路)/`shouldSendReminderEmail`(c.emailReminder===true && 配置完整)/`buildEmailParams`(模板变量契约 to_email/countdown_name/occurrence_time 恒输出 + app_url 仅非空时附加) — 纯函数零 vue/pinia，`node --experimental-strip-types` 可测（scripts/test-reminder-core.ts 10 断言 T1-T10） |
| 桌面通知 | `useDesktopNotify.ts` | `notificationsSupported()`/`notificationPermission()`（不支持→'unsupported'）/`requestNotifyPermission()`（异常→'denied'，不向上抛）/`sendDesktopNotification(title,body,tag?)`（仅 permission==='granted' 才 new Notification，tag 同标签去重，失败静默 false）；发送前自行判定权限，绝不主动请求（请求属 UI 层，由设置页触发） |
| 邮件提醒发送 | `reminderEmail.ts` | `sendReminderEmail(cfg, params): Promise<boolean>` — EmailJS v4 `emailjs.send(serviceId, templateId, params, { publicKey })`（options 传公钥免全局 init），`res?.status===200` 判定；失败 console.warn 返回 false，不重试不 toast |
| Game listing | `useGames.ts` | Singleton: loads once from manifest.json, caches result |
| Help modal | `useHelpModal.ts` | Singleton: same module-level shallowRef pattern as useToast |
| IndexedDB data layer | `useIdb.ts` | `idbGet`/`idbPut`/`idbClear`/`idbExportAll`/`idbImportAll` — used by countdowns/passwords/settings stores + workbench todos/notes/diary/health/ledger/pomodoro/habits; `idbImportAll` validates backup version (导出 version 6；接受 v1-v6，范围守卫 `version < 1 || version > 6` 拒绝——勿改回裸 `!== 6`，曾拒旧备份 T1 回归已修；v1 补 health/ledger 空数据，v1/v2/v3 补 settings 空数据，v1-v4 补 pomodoro/habits 空数据，v1-v5 补 diary 空数据（兜底在范围守卫通过后执行），notes 数组旧格式 → `{categories:[], notes:[...]}` 归一化包装，snapshots 缺键跳过不 put) |
| 健康纯逻辑 | `healthCore.ts` | `emptyHealthData`/`normalizeHealthData`/`calcExerciseAttainment`/`calcDailyAttainment`/`calcBmi`/`classifyBmi`/`weightTarget`/`dietCalories`/`sleepDurationHours`(跨天 +24h、相等=24h)/`weightChartScale`/`weekKeyOf` — 纯函数，无 store 依赖，`node --experimental-strip-types` 可测 |
| 记账纯逻辑 | `ledgerCore.ts` | `emptyLedgerData`/`normalizeLedgerData`/`calcMonthlyStats`/`calcDepositTotal`/`monthKeyOf`/`prevMonthKeyOf`/`planAutoCopy`/`AUTO_COPY_CATEGORY_IDS`/`formatYuan`/`maskOrReveal` + `calcTrendSeries(entries, endMonthKey, categories, months=6): TrendMonth[]`（末月窗口恒 months 条升序、缺失月补 0、跨年走 prevMonthKeyOf、未知分类计支出、非法 endMonthKey → []、金额保留 2 位）/`trendChartScale(series, width, height, pad=24): TrendChartScale \| null`（全 0 → null、maxY {1,2,5}×10^k nice 天花板、5 网格线含 label、12 柱 `{monthKey,kind,x,y,height,value}`、monthLabels + barWidth）/`LEDGER_CATEGORY_COLORS`（8 色暗色安全 hex，[0]=`#10b981` emerald 等价应用主色）— 纯函数，无 store 依赖，`node --experimental-strip-types` 可测 |
| 便签纯逻辑 | `noteCore.ts` | `emptyNoteData`/`normalizeNoteData`(数组旧格式兼容，分类 showInTabs 仅布尔透传)/`normalizeNote`/`normalizeNotes`/`sortNotes`(置顶→updatedAt 降序)/`sortTimelineEntries`(datetime 升序→createdAt 升序)/`filterNotes`(type/categoryId/keyword，NoteFilter.type 接受 'all'=全部类型不过滤、categoryId='uncategorized' 匹配未分类)/`partitionNotesByType`(拆分过滤后便签为 {normal,timeline})/`findNoteCategory`/`tabCategoriesOf`(showInTabs!==false 过滤，返回新数组)/`isUncategorized` — 纯函数，无 store 依赖，`node --experimental-strip-types` 可测 |
| 便签 Markdown 渲染 | `noteMarkdown.ts` | `renderMarkdown(content)` — markdown-it 懒单例（html:false=原始 HTML 转义防 XSS、linkify:true=裸 URL 自动链接、breaks:true=单换行→`<br>` 保留原 pre-wrap 体验）；自定义 `link_open` 规则：复跑 `normalizeLink`+`validateLink`（无效协议如 javascript:/vbscript:/file: 渲染为空→锚点抑制为纯文本）并注入 `target="_blank" rel="noopener nofollow"`；空/null/undefined 输入返回 `''`；幂等确定性输出 — 纯函数零 vue 依赖，`node --experimental-strip-types` 可测（scripts/test-note-markdown.ts 18 断言），WorkbenchNotes.vue 卡面/时光轴条目与 WorkbenchDiary.vue 预览经 `:deep()` 排版消费 |
| 日记纯逻辑 | `diaryCore.ts` | `emptyDiaryData`/`normalizeDiaryData`(非对象/数组 → empty；条目级：非法 date 剔除、缺 id 回退 `dy_<date>`、content 强转字符串、时间戳回填；幂等)/`dateKeyOf`(本地日期防 UTC 偏移)/`diaryDateLabel`('YYYY-MM-DD 周X'，周日..周六，非法键原样返回)/`isValidDateKey`(正则+月 1-12/日 1-31)/`sortDiaryEntries`(date 降序→createdAt 降序，不改入参)/`findDiaryByDate` — 纯函数，零 vue/pinia 依赖（type-only 导入），`node --experimental-strip-types` 可测（scripts/test-diary-core.ts 15 断言/55 assertions） |
| 待办纯逻辑 | `todoCore.ts` | `LEGACY_BUILTIN_TODO_CATEGORIES`/`TODO_PRIORITIES`/`migrateLegacyBuiltinCategories`(旧内置 work/life/study → undefined 未分类，不改入参，幂等)/`purgeLegacyBuiltinCategories`(过滤 work/life/study 注册表名，不改入参、幂等、返回新数组)/`isTodoUncategorized`(falsy 即未分类)/`normalizeTodo`(categoryId trim 后空值剔除、color hex 校验)/`filterTodos`(title/description/priority/status/categoryId，categoryId='uncategorized' 字面量匹配未分类)/`localToday`(本地日期防 UTC 偏移)/`dueInfo`(剩余/今天/逾期)/`moveCustomCategoryInList`(自定义分类上移/下移一格，不改入参) — 纯函数，无 store 依赖，`node --experimental-strip-types` 可测 |
| 工作台菜单纯逻辑 | `workbenchMenuCore.ts` | `WORKBENCH_MENU_KEYS`(10 键 home/todos/notes/diary/countdowns/pomodoro/habits/passwords/health/ledger，顺序即默认展示序，diary 默认名 日记本、图标键 diary → Icon.vue MDI notebook path)/`WORKBENCH_MENU_DEFAULT_ORDER`/`MENU_DEFAULT_LABELS`(默认名逐字一致，load-bearing)/`MENU_ICONS` + `normalizeWorkbenchMenu`(幂等：home 强制 index 0、未知 key 剔除、去重首次优先、缺失按默认序补全恒 10 项、labels 仅已知键 trim 去空截断 12 code point)/`normalizeWorkbenchMenuVisibility`(幂等：仅已知键布尔值，缺失/非法=显示，非对象→{})/`moveMenuItem`(上移下移返回 `{ok, reason:'locked'|'boundary'|'not-found'|'ok', order?}`，home 恒 locked、不改入参)/`renameMenuLabel`(返回 `{ok, reason:'empty'|'not-found'|'ok', labels?}`，截断 12 code point)/`resolveMenuItems`(按 order 迭代 `{key,label,icon}[]`，label 回退默认名、icon 查表；可选第 3 参 `visibility` 过滤 false 键，未传全显示向后兼容) — 纯函数，零 vue/pinia 运行时依赖，`node --experimental-strip-types` 可测（scripts/test-workbench-menu-core.ts 18 断言 T1-T18） |
| 销售记账纯逻辑 | `businessCore.ts` | `emptyBusinessData`/`normalizeBusinessData`（幂等：内置支出 5 缺失自动补回、商品分类数组（含空）尊重存量、非法条目剔除、settings 白名单）/`localDateKey`/`isValidDateKey`/`newId`/`isCategoryNameTaken`/双分类 CRUD 结果函数（`addProductCategory`/`addExpenseCategory`/`renameCategory`/`toggleCategoryVisible`/`moveCategory`/`deleteProductCategory`/`deleteExpenseCategory` 返回 `{ok,reason:'empty'|'duplicate'|'not-found'|'in-use'|'builtin'|'boundary'}`，不改入参）/`soldCount`(max(0,带出−剩余−损耗))/`calcDailyRevenue`(Σ销售×售价，缺失商品计 0)/`calcInventory`(进货−带出+剩余)/`calcBusinessStats`(营业额/成本=纯 COGS 售出×进货价不计支出/利润/毛利率)/`lowStockProducts`(库存<阈值升序，停售商品 active=false 排除)/`calcPurchaseTotals`(按商品 Σ进货数量)/`calcBroughtOutTotals`(按商品 Σ带出数量，跨全部收摊记录)/`calcProductRanking`/`calcCategoryRanking`(含未分类)/`calcBusinessTrend`(近 N 天升序补 0)/`businessTrendScale`(nice 天花板+5 网格线+双折线点坐标) — 纯函数零 vue/pinia/DOM，`node --experimental-strip-types` 可测（scripts/test-business-core.ts 24 断言 T1-T24） |
| 面板自适应分页纯逻辑 | `panelPagingCore.ts` | `calcRowsPerPage`(行槽公式 `Math.max(1, Math.floor((availH+gap)/(rowHeight+gap)))`，末行无需 gap 故分子加 gap，availH≤0 → 1，gap 缺省 12，第 4 参 maxRows 上限经 `clampMaxRows` 归一后 `Math.min`)/`clampMaxRows`(行数上限归一：undefined/NaN/±Infinity → Infinity，否则 `Math.max(1, Math.floor(maxRows))`)/`clampPage`(钳制 [1,totalPages]，totalPages≤0 → 1，分数四舍五入后再钳)/`slicePage`(等分切片，pageSize≤0 → []、页越界钳末页、空列表钳第 1 页 → 空切片、返回新数组不改入参) — 纯函数，零 vue/pinia/DOM 依赖（运行期仅 Math + Array.prototype.slice），`node --experimental-strip-types` 可测（scripts/test-panel-paging-core.ts 20 断言 T1-T20） |
| 面板自适应分页 composable | `usePanelPaging.ts` | options `{ items: () => T[], rowHeight, gap=12, maxRows?, containerRef, gridRef? }` → 返回**普通对象（非 reactive）**`{ isDesktop, rowsPerPage, colsPerRow, currentPage, totalPages, pageItems, fitsOnePage, next, prev, goto }`（面板用 `reactive(...)` 包裹或解构取顶层 ref 自动解包）；桌面检测 matchMedia `(min-width: 769px)`；ResizeObserver 测列表区 contentRect.height（挂载立即测、卸载 → rowsPerPage 0 分页惰性）+ `getComputedStyle(grid).gridTemplateColumns` 空格计数实测列数（无 gridRef → colsPerRow 恒 1）；`pageSize = rowsPerPage × colsPerRow`；`maxRows` 行数上限（RO 回调传 `calcRowsPerPage` 第 4 参经 `clampMaxRows` 归一，兜底 FALLBACK_ROWS_PER_PAGE=6 时 `Math.min(6, clampMaxRows(maxRows))`，undefined → 不钳制）；`fitsOnePage` = availH ≥ rowHeight+gap，false 时列表区回退 overflow-y:auto 兜底（R7）；≤768px/rowsPerPage 0（未测量/containerRef null 区域未渲染）→ 分页惰性（pageItems 全量、totalPages 恒 1、无切片）；items/行数/列数/桌面态变化仅 clampPage 钳制不自动回 1（筛选/排序变化由调用方 goto(1)）；多实例安全（便签 normal+timeline 双实例）；`rowHeight` 常量来自 `.omo/evidence/workbench-onescreen/row-heights.json` 实测（MAX+2px） |

## CONVENTIONS

- Composables follow `use*` naming convention
- Export functions, not classes
- `useToast` and `useHelpModal` are singletons (module-level state, not in Pinia)
- `useCountdownReminder` is also a singleton (module-level shallowRef + `init()` 幂等守卫)
- `useGames` is also a singleton with a `loaded` guard flag
- `presetIcons.ts` is auto-generated — never edit manually
- `healthCore.ts` / `ledgerCore.ts` / `noteCore.ts` / `diaryCore.ts` / `panelPagingCore.ts` / `reminderCore.ts` are pure-logic engines — **禁止 import vue/pinia/DOM**（`node --experimental-strip-types` 测试运行器无法执行）；组件/面板只调用它们，禁止重算公式
- 便签分类 `showInTabs` 归一化规则：仅布尔值透传（false 隐藏 / true 显式显示），缺失不新增字段（undefined=默认显示）；`normalizeNoteCategory` + `tabCategoriesOf` 是标签页可见性唯一来源，组件禁止自造过滤公式
- 记账金额掩码格式唯一来源 `ledgerCore` 的 `MASKED_TEXT`（'****'），组件不得自行硬编码掩码串
- **工作台一屏布局规范**: 桌面 ≥769px 一屏布局（`.wb-content` flex 列 + 面板根 flex:1 min-height:0 钉满），长列表分页一律走 `usePanelPaging` composable，核心公式委托 `panelPagingCore` 纯函数（组件禁止内联重算）；rowHeight 常量唯一来源 `.omo/evidence/workbench-onescreen/row-heights.json` 实测 MAX+2px（todo 214/notes 287/timeline 2343/diary 192/countdown 158/habits 82/password 116/exercise 533/diet 537/sleep 563/weight 88/ledger 49，被测文件勿手改）；密码/运动/饮食/睡眠 4 面板为 6 列卡片网格（`repeat(6, minmax(0,1fr))` + gridRef 实测列数）且 `maxRows` 钳制每页行数（password maxRows:3=18 卡/页、exercise/diet/sleep maxRows:1=6 卡/页，行数经 clampMaxRows 归一）；筛选/排序/增删改/月份切换后 `goto(1)` 回页 1（items 变化仅 clampPage 钳制不自动回 1）；`fitsOnePage` = 一屏容纳 ≥1 整行（availH ≥ rowHeight+gap），false 时列表区回退 `overflow-y:auto` 区内滚动兜底（`*-scroll` 类，R7）；≤768px 移动端分页惰性（全量渲染、无切片、无 pager）；条件渲染列表（健康折叠/密码锁态/记账折叠）containerRef null → 分页惰性直到渲染（R8）

## ANTI-PATTERNS

- **NEVER edit `presetIcons.ts`** — regenerated on every `npm run build`
- **`useBackup.ts` has its own markdown parser** — uses regex instead of `useMarkdown.ts` or `js-yaml`. Lower fidelity than the main parser. Import may silently drop data the main parser would accept.
- **`useDeadLinkChecker.ts`** has 500ms throttle — rapid sequential requests are an anti-pattern
- **`useToast.ts`** and **`useHelpModal.ts`** deviate from Pinia pattern — use module-level `shallowRef` for singleton state
- **`useIdb.ts`** rejects on failure and does NOT fall back to localStorage — callers must `toRaw()` reactive arrays before `idbPut` (IDB structured clone throws DataCloneError on Vue Proxy); nested reactive arrays need per-array `toRaw` (whole-object `toRaw({...})` doesn't unwrap nested proxies)
- **Icon fetch timeout** in `useIconCache.ts`: 8000ms (`AbortSignal.timeout(8000)`) — may need adjustment for slow networks
