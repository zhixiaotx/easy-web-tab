# src/components/ — UI Layer

## OVERVIEW

23 Vue 3 SFCs in the root plus 18 workbench SFCs (13 panels + PanelPager 共享分页条 + WorkbenchHealth tabs container + WorkbenchHealthReminders 只读提醒区块 + WeatherCard/CalendarAnchorCard 主页内嵌卡) under `workbench/`, all using `<script setup lang="ts">` with scoped CSS, CSS custom properties, and class-based dark mode.

## STRUCTURE

```
components/
├── SiteModal.vue         # Add/edit bookmark modal (auto-fetch metadata, 1175 lines — largest file)
├── GlobalSearch.vue      # Multi-engine search bar (583 lines)
├── BackgroundManager.vue # Background image picker (876 lines)
├── BackupManager.vue     # Import/export UI
├── AppSettingsDialog.vue # 设置弹窗：弹窗尺寸设置 UI + 「导航设置」tab「导航筛选栏」开关（navfilter-switch，控制导航管理页分类/标签栏展开收起）+ 「工作台设置」tab「工作台菜单」区块（排序/改名/显示开关/恢复默认，testid 前缀 wbmenu-；列表走 store.workbenchMenuAllItems 全量渲染保证关闭项可重新开启；uses `useAppSettingsStore` from settings.ts）+ 「提醒设置」tab（activeTab 'nav'|'wb'|'remind'，testid 前缀 remind-）+ 「销售记账」tab（activeTab +'business'：摊位名称 bizsettings-stall/低库存阈值 bizsettings-threshold/商品与支出分类管理入口 bizsettings-product-cats、bizsettings-expense-cats → 打开共享 BusinessCategoryManager 弹框；uses `useWorkbenchBusinessStore`）
├── CategoryManager.vue   # Category CRUD modal (built-in: only `video` locked)
├── CategoryTabs.vue      # Horizontal tab bar
├── CountdownModal.vue    # 前台倒计时弹框（/display，repeatLabel + categoryLabel 徽标；卡片底部新增可交互邮件提醒开关 `cd-email-toggle`/`cd-email-switch`：`:checked="item.emailReminder === true"` 缺省关，@change → `store.updateCountdown(id, { emailReminder })` 即时持久化 IndexedDB；启用成功 toast 提示需在设置-提醒设置配置邮箱）
├── CountdownReminder.vue # 全局提醒弹框（z-index 2000，读 useCountdownReminder 单例，仅「关闭」可关）
├── IconManager.vue       # Custom icon upload & management (617 lines)
├── SearchBar.vue         # Search input
├── SearchEngineManager.vue # Search engine CRUD
├── SettingsButton.vue    # Settings gear
├── SiteCard.vue          # Bookmark card (hover → edit/delete)
├── TagFilter.vue         # Tag filter bar
└── business/              # 销售记账（摆摊进销存）8 SFC：BusinessView 页面的 7 功能面板 + 共享分类管理弹框
    ├── BusinessHome.vue        # 首页：4 统计卡（营业额/成本/利润/毛利率，calcBusinessStats）+ 摊位名称编辑 + 低库存概览 + 6 快捷入口（navigate emit）+ 分类/商品排行（calcCategoryRanking/calcProductRanking top 8，仅含有销量条目；容器 bizhome-rank-cat/prod，行 bizhome-cat-<categoryId>/bizhome-prod-<productId>）
    ├── BusinessProducts.vue    # 商品管理：分类 tabs（全部+可见分类+⚙️）+ 商品卡片网格（进价/售价/在售开关/编辑/删除）+ 新增/编辑弹框
    ├── BusinessPurchases.vue   # 进货记录：分类筛选 tabs（全部+可见商品分类，bizpur-cat-all/bizpur-cat-<id>，分类取自关联商品 categoryId）+ 卡片网格（桌面固定 5 列 repeat(5,minmax(0,1fr))、≤640px 单列，卡片 testid bizpur-card-<id>，含分类徽标 bizpur-cat-badge-<purchaseId>，已删商品/未分类仅在「全部」可见）+ 新增/编辑弹框（数量×单价自动合计）
    ├── BusinessDaily.vue       # 收摊记录：日记录卡片四项（date 唯一 upsert；营业额=落库 totalRevenue + 成本/利润/损耗实时按 items×现价走 calcDailyCost/calcDailyLossAmount，testid bizday-revenue/cost/profit/loss-<id>）+ 编辑弹框（动态商品行：带出/剩余/损耗 + 四项预览 营业额/成本/利润/损耗，bizday-form-revenue/cost/profit/loss）
    ├── BusinessExpenses.vue    # 支出记录：tabs 容器（受控 activeTab+change，仿 WorkbenchHealth）+ 4 列卡片 + ⚙️
    ├── BusinessInventory.vue   # 库存管理：低库存预警清单（停售商品排除）+ 库存卡片网格（桌面 5 列/≤640px 单列，bizinv-card-<id> 五项：商品/单位/进货合计/带出合计/库存剩余（row.stock 走 calcInventory），聚合走 businessCore.calcPurchaseTotals/calcBroughtOutTotals）+ 阈值可配置
    ├── BusinessStats.vue       # 统计报表：近 7/14/30 天趋势双折线 SVG（坐标走 businessCore；分类/商品排行已移至 BusinessHome）
    └── BusinessCategoryManager.vue # 共享分类管理弹框（props kind: product/expense；标签页勾选/改名/上下移/删除/新增；Esc 关闭）
├── ThemeToggle.vue       # Dark mode toggle
├── HelpModal.vue         # Keyboard shortcuts help
├── Pagination.vue        # Page navigation
├── SkeletonCard.vue      # Loading skeleton (card)
├── SkeletonGrid.vue      # Loading skeleton (grid)
├── Toast.vue             # Notification toast (receives `toasts` array as prop)
└── workbench/            # 个人工作台 18 SFC: 13 面板 + PanelPager 共享分页条 + 健康管理 tabs 容器 + 定时提醒只读区块 + WeatherCard/CalendarAnchorCard 主页内嵌卡 (data persisted to IndexedDB via `useIdb.ts`)
    ├── WorkbenchHome.vue        # 工作台首页（问候条 + 三屏轮播 home-carousel：行动台 home-slide-action（即将到期提醒 + 未完成待办）/数据概览 home-slide-overview（9 张统计卡，home-stats-* testid 保留）/工具 home-slide-tools（快捷添加 + 天气 + 日历锚点）；6s 自动轮播 AUTOPLAY_MS、hover 暂停（pauseCarousel/resumeCarousel）、箭头 home-carousel-prev/next + 圆点 home-carousel-dot-<i> 手动切换、track transform translateX；卡按 visibleStatCards computed 纯占位隐藏且随菜单开关联动（menuOn = settingsStore.workbenchMenuEnabled，关闭的功能其面板/快捷添加/统计卡全隐藏）；全空概览屏显 home-overview-empty、行动屏双关显 home-action-empty；统计卡视觉瘦身（.bento-stat padding 12px 14px、.stat-value 20px、.nav-btn 12px 等保留）；home-greeting/home-quick-add-* 静态 testid 全保留，旧 home-overview-toggle/chevron 折叠区已由轮播取代）
    ├── WorkbenchTodo.vue        # 待办面板（增删改查 + 优先级/搜索/筛选 + 分类筛选 tabs + ⚙️分类管理弹框（标签页显示勾选/改名/上移下移/删除/新增，失败走 useToast）+ 表单分类下拉 + 卡片分类徽标 + 自适应分页 usePanelPaging（rowHeight 214）+ PanelPager（筛选/分类/增删改/改名/标签页切换 goto(1) 回页 1），data-testid 前缀 td-）
    ├── WorkbenchNotes.vue       # 便签面板（顶部工具栏：左=新增便签/分类管理，右=搜索表单 关键词+分类下拉+类型下拉（全部类型默认 'all'/普通便签/时光轴便签）+查询/重置；'all' 双段渲染（普通网格+时光轴网格，经 partitionNotesByType 拆分，仅含数据的段才渲染）；操作栏下方分类筛选 tabs（仅勾选分类）+ 分类管理弹窗（标签页显示勾选 + 改名/上移下移/删除）+ 时光轴卡片竖排时间轴/快速追加/条目内联编辑删除 + 普通/时光轴双实例 usePanelPaging（rowHeight 287/2343）+ 双 PanelPager（类型/筛选/分类切换双实例 goto(1)，timeline 超高卡内滚动），content 与时光轴条目经 noteMarkdown.renderMarkdown 渲染为 Markdown（v-html + :deep() 排版，链接 target=_blank、@click 锚点拦截不触发卡片编辑），data-testid 前缀 nt-）
    ├── WorkbenchDiary.vue       # 日记本面板（每日一篇：日期输入（默认今天）+ 今日/保存/删除 + 编辑/预览切换 + 字数，历史卡片网格自适应分页（usePanelPaging rowHeight 192 + PanelPager 替换固定 8 条/页，dj-page-* 保留；≥1100px 编辑器|历史双栏、769-1099px 单列堆叠），Markdown 预览走 noteMarkdown.renderMarkdown + :deep() 排版，日期切换脏检查 confirm，G3 空保存守卫 toast，data-testid 前缀 dj-）
    ├── WorkbenchCountdown.vue   # 倒计时面板（分类筛选 tabs + ⚙️分类管理弹框 + 规则/分类表单 + 邮件提醒复选框 `cd-form-email`（默认关、startAdd 复位 false、startEdit 回填 item.emailReminder===true、handleSave 透传，opt-in 缺省不发邮件）+ 徽标 + 自适应分页 usePanelPaging（rowHeight 158）+ PanelPager（筛选/排序/分类改名/删除/新增 goto(1)），data-testid 前缀 cd-）
    ├── WorkbenchPassword.vue    # 密码面板（主密码三态 + 新增/编辑弹窗 + 书签关联下拉 + 名称搜索 + 6 列卡片网格自适应分页 usePanelPaging（rowHeight 116, maxRows:3 = 18 卡/页）+ PanelPager（搜索变化 goto(1)，锁态列表未渲染时分页惰性），复用 usePasswordsStore / useCrypto.ts）
    ├── WorkbenchHealth.vue      # 健康管理 tabs 容器（受控组件：props activeTab + emit change；tab 栏前缀 hd-；内含运动/饮食/睡眠/体重 四面板；`:global(.wb-health)` 补 flex 列容器——tabs 容器非 .wb-content 直接子级）
    ├── WorkbenchHealthReminders.vue # 健康面板只读「定时提醒」区块（props module: exercise/diet/sleep；读倒计时 store 按分类 1:1 过滤，名称+下次触发+重复规则，升序、无下次显示「—」、空分类不渲染；testid 前缀 `${module}-reminders`）
    ├── WorkbenchExercise.vue    # 运动面板（周目标 times/minutes/calories + 记录 + 达标率 + 6 列卡片网格自适应分页 usePanelPaging（rowHeight 533, maxRows:1 = 6 卡/页）+ PanelPager（展开/增删改 goto(1)，折叠未挂载时分页惰性），data-testid 前缀 ex-）
    ├── WorkbenchDiet.vue        # 饮食面板（每日热量目标 + 四餐次记录 + 6 列卡片网格自适应分页 usePanelPaging（rowHeight 537, maxRows:1 = 6 卡/页）+ PanelPager（展开/增删改 goto(1)，折叠未挂载时分页惰性），前缀 dt-）
    ├── WorkbenchSleep.vue       # 睡眠面板（每日时长目标 + 入睡/起床时间自动算时长 + 质量星标 + 6 列卡片网格自适应分页 usePanelPaging（rowHeight 563, maxRows:1 = 6 卡/页）+ PanelPager（展开/增删改 goto(1)，折叠未挂载时分页惰性），前缀 sl-）
    ├── WorkbenchWeight.vue      # 体重面板（身高 + BMI 国标四档徽章 + 减肥建议 + 内联 SVG 折线图 + 自适应分页 usePanelPaging（rowHeight 88）+ PanelPager（展开/增删改 goto(1)，折叠未挂载时分页惰性），前缀 wt-）
    ├── WorkbenchLedger.vue      # 记账面板（月份切换 + 六指标统计含存款累计 + 图表区可折叠（ld-charts-toggle + ld-charts-chevron，chartsExpanded 默认展开；toggleList 展开记录 → 自动收起图表、收起记录 → 恢复，防图表压塌列表区只剩 2-91px/0-1 行）+ 近 6 月收支趋势柱状图（ld-trend-*，内联 SVG，坐标全走 trendChartScale）+ 支出分类占比环形图（ld-donut-*，R=90 周长不变量）+ 行式记录列表可折叠 + 分组管理 + 自适应分页 usePanelPaging（rowHeight 49）+ PanelPager（月份切换/本月/新增/编辑/删除/分组管理/展开收起 goto(1)，折叠未挂载时分页惰性），前缀 ld-）
    ├── WorkbenchHabits.vue     # 习惯打卡面板（左栏 .hb-side=本周统计卡 + 新增/编辑表单；右栏 .hb-main=习惯卡片网格 .hb-list（repeat(auto-fill, minmax(250px,1fr)) 多列并排，gridRef=listEl 实测列数）+ PanelPager；≥1200px 双栏 grid（minmax(280px,340px) 1fr），其余单列；自适应分页 usePanelPaging（rowHeight 82，每页=rowsPerPage×colsPerRow）；testid hb-* 全保留）
    └── PanelPager.vue          # 工作台共享分页条（纯展示：props page/total，emit prev/next，无默认值/校验/业务逻辑；← 第 X / Y 页 →，testid panel-pager/panel-pager-prev/panel-pager-info/panel-pager-next，total≤1 不渲染、page≤1 上一页 disabled、page≥total 下一页 disabled；.panel-pager 置面板 flex 列底部 flex-shrink:0、面板自管上下间距，亮暗双主题 --color-* token + legacy 家族兜底；消费方绑 usePanelPaging 返回值 <PanelPager :page="paging.currentPage" :total="paging.totalPages" @prev="paging.prev()" @next="paging.next()" />）
```

## WHERE TO LOOK

| Task | Component | Notes |
|------|-----------|-------|
| Bookmark creation/editing | `SiteModal.vue` | Auto-fetches title/desc/icon via Jina.ai |
| Search UI | `GlobalSearch.vue` | Multi-engine dropdown, switches between engines |
| Background customization | `BackgroundManager.vue` | 30 built-in wallpapers + custom upload |
| Data import/export | `BackupManager.vue` | Markdown file upload/download |
| Category CRUD | `CategoryManager.vue` | Only `video` locked; legacy categories deletable |
| Icon management | `IconManager.vue` | Upload & manage custom site icons |
| Password vault | `workbench/WorkbenchPassword.vue` | 主密码三态（设置/解锁/锁定），新增/编辑弹窗 + 书签库名称关联下拉，按网站名称搜索，AES-CBC 加密存 IndexedDB |
| Countdown management | `workbench/WorkbenchCountdown.vue` | 工作台表单：6 种重复规则选择器（weekly 周几多选 + 工作日快捷钮 / monthly 几号 / interval 分钟）+ 分类下拉取 `store.allCategories`（内置 6 + 自定义）+ 校验；`repeatLabel`/`categoryLabel` 徽标；面板分类筛选为 tabs（全部 + `tabCategories`，`cd-cat-all`/`cd-cat-<c>`，即时过滤）+ ⚙️ 分类管理弹框（`cd-cat-dialog`：标签页显示复选框 + 自定义分类内联改名（`cd-cat-rename-input-*`，blur/Enter 提交、Esc 还原）/上移下移（`cd-cat-up-*`/`cd-cat-down-*`）/删除（`cd-cat-del-*`，带 confirm）/添加（`cd-cat-new-input`/`cd-cat-add-btn`），失败走 useToast warning）；表单「发送邮件提醒」复选框 `cd-form-email`（默认关、startAdd 复位 false、startEdit 回填 `item.emailReminder === true`、handleSave 透传，opt-in——未勾选即不发邮件） |
| Countdown display | `CountdownModal.vue` | 前台展示（`frontCountdowns`），repeat-badge + cat-badge（work=蓝/life=绿/study=紫/exercise=橙/diet=琥珀/sleep=青，亮暗双主题；自定义分类统一默认灰 `cat-default`）；卡片底部可交互邮件提醒开关 `cd-email-toggle`（label）/`cd-email-switch`（checkbox），`:checked="item.emailReminder === true"` 缺省关，@change → `store.updateCountdown(id, { emailReminder })` 即时持久化 IndexedDB，开启 toast「已开启邮件提醒，需在设置-提醒设置中配置邮箱后生效」/关闭 toast「已关闭邮件提醒」 |
| Reminder popup | `CountdownReminder.vue` | 全屏遮罩弹框，到点时间显示 `⏰ MM-DD HH:mm`；z-index 2000，点击遮罩不关闭 |
| Tag filtering | `TagFilter.vue` + `CategoryTabs.vue` | Tags extracted from all sites |
| Loading states | `SkeletonCard.vue` + `SkeletonGrid.vue` | Shimmer placeholders |
| Toast notifications | `Toast.vue` | Receives `toasts` array as prop from `useToast()` |
| 工作台便签 | `workbench/WorkbenchNotes.vue` | 顶部工具栏（左：新增便签 `note-add-button` / 分类管理 `nt-cat-manager`；右：搜索表单 关键词 `nt-search-input` + 类型下拉 `nt-type-select`（全部类型默认 'all'/普通便签/时光轴便签）+ 查询 `nt-search-btn` / 重置 `nt-reset-btn`，草稿→应用模式：控件绑草稿 ref，查询/回车才生效，重置一键清空回默认）+ 操作栏下方分类筛选 tabs `nt-cat-all`/`nt-cat-uncategorized`/`nt-cat-<id>`（全部/未分类/可见分类=showInTabs!==false，即时过滤，公式走 `noteCore.tabCategoriesOf`）+ 表单 overlay 内 radio `nt-form-type-normal`/`nt-form-type-timeline`（切换保留 content+entries 数据）+ 分类管理弹窗（首区「标签页显示」勾选 `nt-catmgr-tab-<id>` 控制标签页可见性，取消勾选正激活的分类回退全部；改名/上移下移/删除、名称唯一、删除后该分类便签归未分类、正被筛选的分类重置为全部）+ 时光轴卡片（竖排时间轴 `nt-timeline-card`，快速追加 `nt-entry-add`，条目行内编辑/删除 `nt-entry-edit-<id>`/`nt-entry-del-<id>`）；datetime 校验 `^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$` + 范围检查（月 1-12/日 1-31/时 0-23/分 0-59，纯正则拒绝不了 '2026-13-99 25:61'）；条目排序走 `noteCore.sortTimelineEntries`，筛选走 `filterNotes`；'all' 双段渲染（普通网格 + 时光轴网格，经 `noteCore.partitionNotesByType` 拆分，仅含数据的段才渲染）；`hasActiveNoteFilter` 激活判定：默认 'all' 与显式 'normal' 均不算类型激活（仅 'timeline' 算类型激活），categoryId/keyword 非空仍计激活 |
| 工作台日记 | `workbench/WorkbenchDiary.vue` | 每日一篇（date 本地唯一）：工具栏 日期输入 `dj-date-input`（默认今天）+ 今日 `dj-today-btn` + 保存 `dj-save-btn` + 删除 `dj-delete-btn`（仅选中条目时渲染）+ 编辑/预览切换 `dj-preview-toggle` + 字数 `dj-char-count`；编辑器 `dj-content-input` / Markdown 预览 `dj-preview`（走 `noteMarkdown.renderMarkdown` + `:deep()` 排版镜像 WorkbenchNotes，锚点点击不冒泡）；历史卡片网格（auto-fill minmax(240px,1fr)，8 条/页）+ 分页 `dj-page-prev`/`dj-page-info`（「第 X / Y 页」，边界禁用）/`dj-page-next`，新增条目回第 1 页、删除页码自动钳制；卡片 `dj-card-<id>` + 日期 `dj-card-date-<id>`（含中文星期 周X）+ 今天徽标 `dj-card-today-<id>` + 6 行 clamp 预览 `dj-card-preview-<id>`；空态 `dj-empty`「还没有日记，写下今天的第一篇吧」；日期切换脏检查 confirm；trim 空保存 → toast.warning「内容为空，未保存」；成功 → toast.success「日记已保存」；只消费 store（sortedEntries/upsertEntry/deleteEntry），不自加载（view 调 loadDiary）、不内联重排 |
| 工作台面板 | `workbench/WorkbenchHome.vue` + `workbench/WorkbenchTodo.vue` + `workbench/WorkbenchNotes.vue` + `workbench/WorkbenchDiary.vue` + `workbench/WorkbenchCountdown.vue` + `workbench/WorkbenchPomodoro.vue` + `workbench/WorkbenchHabits.vue` + `workbench/WorkbenchPassword.vue` + `workbench/WorkbenchHealth.vue` + `workbench/WorkbenchHealthReminders.vue` + `workbench/WorkbenchExercise.vue` + `workbench/WorkbenchDiet.vue` + `workbench/WorkbenchSleep.vue` + `workbench/WorkbenchWeight.vue` + `workbench/WorkbenchLedger.vue` + `workbench/WeatherCard.vue` + `workbench/CalendarAnchorCard.vue` | 个人工作台：左侧菜单 10 项（主页/待办/便签/日记本/倒计时/番茄钟/习惯打卡/密码/健康管理/记账）；健康管理=WorkbenchHealth.vue tabs 容器（受控 activeTab+change，前缀 hd-，内含运动/饮食/睡眠/体重四面板）；运动/饮食/睡眠面板顶部挂 WorkbenchHealthReminders.vue 只读提醒区块（1:1 分类映射）；待办/便签走 `useWorkbenchTodosStore` / `useWorkbenchNotesStore`，日记走 `useWorkbenchDiaryStore`，健康走 `useWorkbenchHealthStore`，记账走 `useWorkbenchLedgerStore`，倒计时/密码复用既有 store，均经 `useIdb.ts` 持久化到 IndexedDB |
| 工作台菜单设置（排序/改名/显示开关/恢复默认） | `AppSettingsDialog.vue` | 「工作台设置」tab（activeTab==='wb'）body 内、弹窗尺寸表格上方 `.wb-menu-config` 区块：10 行来自 `store.workbenchMenuAllItems`（**全量不过滤——开关关闭的行仍保留可重新开启**；图标 + 显示开关 switch-btn（`wbmenu-switch-<key>`，home 恒 disabled 标题「主页为默认页，不可关闭」，click → `store.setWorkbenchMenuVisibility(key, !enabled)`，行 is-disabled-item 弱化）+ 改名 input `maxlength="12"`，blur/Enter 提交、Esc 还原、trim 空还原上值不调 store，提交前按 code point 校验 ≤12 防代理对截断 + 上移/下移按钮，home 恒 disabled + `aria-disabled`，index≤1 上移 / 末行（全量长度-1）下移达边界 disabled）；区块「恢复默认」→ `store.resetWorkbenchMenu()`（顺序/名称/开关三字段）；testid：`wbmenu-row-<key>`/`wbmenu-switch-<key>`/`wbmenu-name-<key>`/`wbmenu-up-<key>`/`wbmenu-down-<key>`/`wbmenu-reset`；改名 input 直接绑 store 状态（`menuEditing` 仅暂存输入中文本，提交/还原后回落 computed label，无草稿机制——全局 resetAll 后自动刷新不残留旧值）；store 返回 ok:false（locked/boundary/not-found）静默忽略无 toast（有意偏离「可用+toast」惯例）；导航设置 tab 另含「导航筛选栏」区块（navfilter-switch → `store.setNavFiltersExpanded`，控制 HomeView 分类/标签栏展开收起，默认收起） |
| 提醒设置 tab | `AppSettingsDialog.vue` | 「提醒设置」tab（activeTab==='remind'）：桌面通知开关 `remind-desktop-switch`（开启时同步 `requestNotifyPermission`）+ 邮件总开关 `remind-email-switch` + 四字段 `remind-email-to`/`remind-email-service`/`remind-email-template`/`remind-email-key` + 测试按钮 `remind-email-test`（canTestEmail 由 `isEmailConfigured` 驱动，点击 handleTestEmail 走 `sendReminderEmail` + toast 结果）；模板变量契约 to_email/countdown_name/occurrence_time/app_url（`buildEmailParams` 唯一来源）；字段经 store setters 持久化（set 后 persist）、parseSettingsData 白名单归一 |
| 工作台左菜单渲染 | `src/views/WorkbenchView.vue` | 菜单渲染自 `settingsStore.workbenchMenuItems`（computed 由 `workbenchMenuCore.resolveMenuItems` 解析，顺序/改名/显示开关（false 键剔除）经设置弹窗调整后在此直接生效，视图禁止内联重算）；每项按钮 `data-testid="wb-menu-<key>"` + `:title="item.label"` 全名；label 溢出省略作用于内部 `.wb-menu-label` span（min-width:0 + overflow:hidden + text-overflow:ellipsis + white-space:nowrap，对按钮本身设 ellipsis 不截断子 span 文本）；`navigateTo` 白名单 + `isWorkbenchMenuEnabled` 开关双守卫；watch menuItems 键列表 → 当前激活区被关时回退首个可见项（home 恒可见）；`SECTION_KEYS`/内容 switch 仍 key 驱动不动 |
| 工作台一屏布局/共享分页条 | `workbench/PanelPager.vue` + `src/composables/usePanelPaging.ts` + `src/composables/panelPagingCore.ts` | 桌面 ≥769px：`.wb-content` flex 列 + 面板根 `flex:1; min-height:0` 钉满（健康 tabs 容器经 `:global(.wb-health)` 补 flex 列）；长列表经 PanelPager 翻页（page/total props + prev/next emit，testid `panel-pager`/`panel-pager-prev`/`panel-pager-info`/`panel-pager-next`，total≤1 不渲染、边界禁用）；11 面板接入，rowHeight 常量（todo 214/notes 287/timeline 2343/diary 192/countdown 158/habits 82/password 116/exercise 533/diet 537/sleep 563/weight 88/ledger 49）与公式唯一来源 `usePanelPaging`/`panelPagingCore`（组件禁止自造）；密码/运动/饮食/睡眠 4 面板为 6 列卡片网格（`repeat(6, minmax(0,1fr))` + gridRef 实测列数）+ `maxRows` 钳制每页行数（password 3 行=18 卡/页、exercise/diet/sleep 1 行=6 卡/页，行数经 clampMaxRows 归一）；`!fitsOnePage` 时列表区回退 overflow-y:auto 区内滚动兜底（`*-scroll` 类）；≤768px 移动端分页惰性 |
| 销售记账页面 | `src/views/BusinessView.vue` + `business/*.vue` | 左树 7 项固定（bs-menu-<key>，emoji 图标）+ 右内容 switch；支出 tabs 受控（expenseTab 存视图，change emit）；⚙️ 设置按钮打开 AppSettingsDialog；桌面一屏契约复刻 WorkbenchView（.bs-content/.bs-menu ≥769px flex 钉满、≤768px 横排）；BusinessHome 经 @navigate 跳转（视图白名单收窄）；数据经 useWorkbenchBusinessStore（IDB 'business'）自加载 |

## CONVENTIONS

- All components: `<script setup lang="ts">`
- Scoped styles use CSS variables: `var(--color-primary)`, `var(--bg-card)`, etc.
- Dark mode: class-based (`document.documentElement.classList.toggle('dark')`)
- Props via `defineProps<{}>()`, emits via `defineEmits`
- No state management inside components — delegate to stores or composables
- **WorkbenchNotes.vue testid 约定**：工具栏 搜索输入 `nt-search-input`、分类筛选 tabs `nt-cat-all`/`nt-cat-uncategorized`/`nt-cat-<id>`、类型下拉 `nt-type-select`（选项：全部类型默认 'all'/普通便签/时光轴便签）、查询 `nt-search-btn`、重置 `nt-reset-btn`、新增 `note-add-button`、分类管理入口 `nt-cat-manager`（弹窗行 `nt-catmgr-*`，含标签页显示勾选 `nt-catmgr-tab-<id>`）、表单 overlay 类型 radio `nt-form-type-normal`/`nt-form-type-timeline`、时光轴快速追加 `nt-entry-add`、条目行内编辑/删除 `nt-entry-edit-<id>`/`nt-entry-del-<id>`、空态 `note-empty`（普通）/`note-timeline-empty`（时光轴）；其余表单 `note-*` / `nt-form-*` 前缀
- **WorkbenchTodo.vue testid 约定**：分类筛选 tabs `td-cat-all`/`td-cat-<分类名>`（点击即时过滤，与查询条件叠加，重置恢复全部）、表单分类下拉 `td-form-category`（未分类 + store.allCategories）、卡片分类徽标 `td-cat-badge-<todoId>`、分类管理入口 `td-cat-manager`（弹窗 `td-cat-dialog`：标签页显示勾选 `td-catmgr-tab-<分类名>`、改名 `td-catmgr-name-<分类名>` blur/Enter 提交 Esc 还原、上移下移 `td-catmgr-up-<分类名>`/`td-catmgr-down-<分类名>`、删除 `td-catmgr-del-<分类名>` 带 confirm、新增 `td-catmgr-new-input`/`td-catmgr-add-btn`，失败走 useToast、删除/隐藏激活分类回退「全部」）；其余表单 `td-*` 前缀
- **WorkbenchLedger.vue testid 约定**：趋势卡 `ld-trend`「近 6 月收支趋势」（坐标全走 `ledgerCore.trendChartScale`，组件零重算；柱 `ld-trend-bar-<月索引>-<income|expense>` 6 月×2=12 根、网格线 `.ld-trend-gridline` 5 条 + axis-label、maxY 标签 `ld-trend-max`、月标签 `ld-trend-month-<i>` 6 个、空态 `ld-trend-empty`「暂无收支数据」当 scale null；收入柱=accent 主色、支出柱=`LEDGER_CATEGORY_COLORS[1]`）；分类占比容器保持 `ld-ratio-block`（v-if 当月 expense>0，标题「支出分类占比」）+ svg `ld-donut`（viewBox 220×220、R=90、C=2π×90≈565.4867、rotate(-90 110 110)、stroke-width 16）+ 段 `ld-donut-seg-<idx>`（stroke-dasharray=`${dashLen} ${C-dashLen}`、dashoffset 累积、首段 `is-accent`=应用主色、后续轮循 `LEDGER_CATEGORY_COLORS`、linecap ≤3 段 round / >3 段 butt）+ 中心 `ld-donut-center`（当月支出总额经 `masked()` 掩码 `****`）+ 图例行 `ld-donut-legend-<categoryId>`（未知分类 id='unknown' 名=未知，含色点 `ld-donut-dot` + 名称 + `masked(formatYuan) · masked(percentLabel)`）；几何不变量：所有段 dasharray 第一个数之和 ≈ RING_C（QA 断言）
- **WorkbenchDiary.vue testid 约定**：工具栏 日期输入 `dj-date-input`（默认今天）、今日 `dj-today-btn`、保存 `dj-save-btn`、删除 `dj-delete-btn`（仅选中条目时渲染）、编辑/预览切换 `dj-preview-toggle`、字数 `dj-char-count`、内容编辑 `dj-content-input`、Markdown 预览 `dj-preview`（`noteMarkdown.renderMarkdown` + `:deep()` 排版镜像 WorkbenchNotes）、空态 `dj-empty`「还没有日记，写下今天的第一篇吧」；历史卡片 `dj-card-<id>` + 日期标签 `dj-card-date-<id>`（含中文星期 周X）+ 今天徽标 `dj-card-today-<id>`（今天）+ 6 行 clamp 预览 `dj-card-preview-<id>`；分页 `dj-page-prev`/`dj-page-info`（「第 X / Y 页」）/`dj-page-next`（边界禁用），8 条/页、新增条目回第 1 页、删除页码自动钳制；G3 空保存守卫（trim 空 → toast「内容为空，未保存」）；日期切换脏检查 confirm；其余 `dj-*` 前缀
- **AppSettingsDialog.vue 提醒设置 tab testid 约定**：桌面通知开关 `remind-desktop-switch`（onToggleDesktopNotify，开启时同步 `requestNotifyPermission`）、邮件总开关 `remind-email-switch`、收件箱 `remind-email-to`、Service ID `remind-email-service`、Template ID `remind-email-template`、Public Key `remind-email-key`、测试按钮 `remind-email-test`（canTestEmail=isEmailConfigured，点击走 `sendReminderEmail` + toast 结果）；模板变量契约 to_email/countdown_name/occurrence_time/app_url 由 `reminderCore.buildEmailParams` 唯一提供，组件禁止内联拼参
- **WorkbenchCountdown.vue testid 约定**：邮件提醒复选框 `cd-form-email`（默认关；startAdd 复位 false；startEdit 回填 `item.emailReminder === true`；handleSave 透传 emailReminder，opt-in 缺省不发邮件）
- **CountdownModal.vue testid 约定**：卡片底部邮件提醒开关 `cd-email-toggle`（label.countdown-email-toggle，内含 span「📧 邮件提醒」+ checkbox `cd-email-switch`）；`:checked="item.emailReminder === true"` 缺省关，@change → `store.updateCountdown(id, { emailReminder })` 即时持久化 IndexedDB；开启 toast「已开启邮件提醒，需在设置-提醒设置中配置邮箱后生效」、关闭 toast「已关闭邮件提醒」；缺省（无 emailReminder 字段）= 不发邮件
- **PanelPager.vue testid 约定**：容器 `panel-pager`（仅 total>1 渲染）、上一页 `panel-pager-prev`（page≤1 disabled）、信息 `panel-pager-info`（「第 X / Y 页」）、下一页 `panel-pager-next`（page≥total disabled）；纯展示组件（props page/total、emit prev/next，无默认值/校验/业务逻辑），Wave-3 QA 脚本断言 testid 勿改名；消费方绑 `usePanelPaging` 返回值（`reactive(...)` 包裹或解构顶层 ref 自动解包）

## ANTI-PATTERNS

- **Do NOT** put business logic in components — extract to `src/stores/` or `src/composables/`
- **Do NOT** append `.html` to game paths in SiteModal URL input (serve redirects cause content loss)
- **SiteModal.vue** is 1175 lines — avoid further growth, extract sub-components if adding features
- **GlobalSearch.vue** is 583 lines — same concern
- **BackgroundManager.vue** is 876 lines — same concern
- Components eagerly imported in views (no lazy loading)
