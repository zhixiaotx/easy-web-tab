# src/components/ — UI Layer

## OVERVIEW

23 Vue 3 SFCs in the root plus 17 workbench SFCs (13 panels + WorkbenchHealth tabs container + WorkbenchHealthReminders 只读提醒区块 + WeatherCard/CalendarAnchorCard 主页内嵌卡) under `workbench/`, all using `<script setup lang="ts">` with scoped CSS, CSS custom properties, and class-based dark mode.

## STRUCTURE

```
components/
├── SiteModal.vue         # Add/edit bookmark modal (auto-fetch metadata, 1175 lines — largest file)
├── GlobalSearch.vue      # Multi-engine search bar (583 lines)
├── BackgroundManager.vue # Background image picker (876 lines)
├── BackupManager.vue     # Import/export UI
├── AppSettingsDialog.vue # 设置弹窗：弹窗尺寸设置 UI + 「工作台设置」tab「工作台菜单」区块（排序/改名/恢复默认，testid 前缀 wbmenu-；678 lines, uses `useAppSettingsStore` from settings.ts）
├── CategoryManager.vue   # Category CRUD modal (built-in: only `video` locked)
├── CategoryTabs.vue      # Horizontal tab bar
├── CountdownModal.vue    # 前台只读倒计时弹框（/display，repeatLabel + categoryLabel 徽标）
├── CountdownReminder.vue # 全局提醒弹框（z-index 2000，读 useCountdownReminder 单例，仅「关闭」可关）
├── IconManager.vue       # Custom icon upload & management (617 lines)
├── SearchBar.vue         # Search input
├── SearchEngineManager.vue # Search engine CRUD
├── SettingsButton.vue    # Settings gear
├── SiteCard.vue          # Bookmark card (hover → edit/delete)
├── TagFilter.vue         # Tag filter bar
├── ThemeToggle.vue       # Dark mode toggle
├── HelpModal.vue         # Keyboard shortcuts help
├── Pagination.vue        # Page navigation
├── SkeletonCard.vue      # Loading skeleton (card)
├── SkeletonGrid.vue      # Loading skeleton (grid)
├── Toast.vue             # Notification toast (receives `toasts` array as prop)
└── workbench/            # 个人工作台 13 SFC: 11 面板 + 健康管理 tabs 容器 + 定时提醒只读区块 (data persisted to IndexedDB via `useIdb.ts`)
    ├── WorkbenchHome.vue        # 工作台首页（行动台布局：9 张统计卡收进可折叠「📊 概览」区 section.bento-overview（testid home-overview，默认折叠，toggle home-overview-toggle 含数量徽标 + chevron home-overview-chevron，localStorage user-home-overview-collapsed '1'/'0' 记住、不随备份导出；卡按 visibleStatCards computed 纯占位隐藏，9 卡全空整区不渲染）；两行动面板（即将到期/未完成待办）前置统计卡之前；统计卡视觉瘦身（.bento-stat padding 12px 14px、.stat-value 20px、.stat-sub 12px、.nav-btn padding 3px 8px font 12px、.stat-header gap 6px，单行省略防溢出）+ 文案收敛（ledger 去「结余」、diet/sleep 值去单位、weight 去 BMI 状态标签）；既有 home-* testid 全保留）
    ├── WorkbenchTodo.vue        # 待办面板（增删改查 + 优先级/搜索/筛选 + 分类筛选 tabs + ⚙️分类管理弹框（标签页显示勾选/改名/上移下移/删除/新增，失败走 useToast）+ 表单分类下拉 + 卡片分类徽标，data-testid 前缀 td-）
    ├── WorkbenchNotes.vue       # 便签面板（顶部工具栏：左=新增便签/分类管理，右=搜索表单 关键词+分类下拉+类型下拉（全部类型默认 'all'/普通便签/时光轴便签）+查询/重置；'all' 双段渲染（普通网格+时光轴网格，经 partitionNotesByType 拆分，仅含数据的段才渲染）；操作栏下方分类筛选 tabs（仅勾选分类）+ 分类管理弹窗（标签页显示勾选 + 改名/上移下移/删除）+ 时光轴卡片竖排时间轴/快速追加/条目内联编辑删除，content 与时光轴条目经 noteMarkdown.renderMarkdown 渲染为 Markdown（v-html + :deep() 排版，链接 target=_blank、@click 锚点拦截不触发卡片编辑），data-testid 前缀 nt-）
    ├── WorkbenchDiary.vue       # 日记本面板（每日一篇：日期输入（默认今天）+ 今日/保存/删除 + 编辑/预览切换 + 字数，历史卡片网格 8 条/页分页，Markdown 预览走 noteMarkdown.renderMarkdown + :deep() 排版，日期切换脏检查 confirm，G3 空保存守卫 toast，data-testid 前缀 dj-）
    ├── WorkbenchCountdown.vue   # 倒计时面板（分类筛选 tabs + ⚙️分类管理弹框 + 规则/分类表单 + 徽标，data-testid 前缀 cd-）
    ├── WorkbenchPassword.vue    # 密码面板（主密码三态 + 新增/编辑弹窗 + 书签关联下拉 + 名称搜索，复用 usePasswordsStore / useCrypto.ts）
    ├── WorkbenchHealth.vue      # 健康管理 tabs 容器（受控组件：props activeTab + emit change；tab 栏前缀 hd-；内含运动/饮食/睡眠/体重 四面板）
    ├── WorkbenchHealthReminders.vue # 健康面板只读「定时提醒」区块（props module: exercise/diet/sleep；读倒计时 store 按分类 1:1 过滤，名称+下次触发+重复规则，升序、无下次显示「—」、空分类不渲染；testid 前缀 `${module}-reminders`）
    ├── WorkbenchExercise.vue    # 运动面板（周目标 times/minutes/calories + 记录 + 达标率，data-testid 前缀 ex-）
    ├── WorkbenchDiet.vue        # 饮食面板（每日热量目标 + 四餐次记录，前缀 dt-）
    ├── WorkbenchSleep.vue       # 睡眠面板（每日时长目标 + 入睡/起床时间自动算时长 + 质量星标，前缀 sl-）
    ├── WorkbenchWeight.vue      # 体重面板（身高 + BMI 国标四档徽章 + 减肥建议 + 内联 SVG 折线图，前缀 wt-）
    └── WorkbenchLedger.vue      # 记账面板（月份切换 + 六指标统计含存款累计 + 近 6 月收支趋势柱状图（ld-trend-*，内联 SVG，坐标全走 trendChartScale）+ 支出分类占比环形图（ld-donut-*，R=90 周长不变量）+ 分类占比条 + 行式记录列表可折叠 + 分组管理，前缀 ld-）
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
| Countdown management | `workbench/WorkbenchCountdown.vue` | 工作台表单：6 种重复规则选择器（weekly 周几多选 + 工作日快捷钮 / monthly 几号 / interval 分钟）+ 分类下拉取 `store.allCategories`（内置 6 + 自定义）+ 校验；`repeatLabel`/`categoryLabel` 徽标；面板分类筛选为 tabs（全部 + `tabCategories`，`cd-cat-all`/`cd-cat-<c>`，即时过滤）+ ⚙️ 分类管理弹框（`cd-cat-dialog`：标签页显示复选框 + 自定义分类内联改名（`cd-cat-rename-input-*`，blur/Enter 提交、Esc 还原）/上移下移（`cd-cat-up-*`/`cd-cat-down-*`）/删除（`cd-cat-del-*`，带 confirm）/添加（`cd-cat-new-input`/`cd-cat-add-btn`），失败走 useToast warning） |
| Countdown display | `CountdownModal.vue` | 前台只读展示（`frontCountdowns`），repeat-badge + cat-badge（work=蓝/life=绿/study=紫/exercise=橙/diet=琥珀/sleep=青，亮暗双主题；自定义分类统一默认灰 `cat-default`） |
| Reminder popup | `CountdownReminder.vue` | 全屏遮罩弹框，到点时间显示 `⏰ MM-DD HH:mm`；z-index 2000，点击遮罩不关闭 |
| Tag filtering | `TagFilter.vue` + `CategoryTabs.vue` | Tags extracted from all sites |
| Loading states | `SkeletonCard.vue` + `SkeletonGrid.vue` | Shimmer placeholders |
| Toast notifications | `Toast.vue` | Receives `toasts` array as prop from `useToast()` |
| 工作台便签 | `workbench/WorkbenchNotes.vue` | 顶部工具栏（左：新增便签 `note-add-button` / 分类管理 `nt-cat-manager`；右：搜索表单 关键词 `nt-search-input` + 类型下拉 `nt-type-select`（全部类型默认 'all'/普通便签/时光轴便签）+ 查询 `nt-search-btn` / 重置 `nt-reset-btn`，草稿→应用模式：控件绑草稿 ref，查询/回车才生效，重置一键清空回默认）+ 操作栏下方分类筛选 tabs `nt-cat-all`/`nt-cat-uncategorized`/`nt-cat-<id>`（全部/未分类/可见分类=showInTabs!==false，即时过滤，公式走 `noteCore.tabCategoriesOf`）+ 表单 overlay 内 radio `nt-form-type-normal`/`nt-form-type-timeline`（切换保留 content+entries 数据）+ 分类管理弹窗（首区「标签页显示」勾选 `nt-catmgr-tab-<id>` 控制标签页可见性，取消勾选正激活的分类回退全部；改名/上移下移/删除、名称唯一、删除后该分类便签归未分类、正被筛选的分类重置为全部）+ 时光轴卡片（竖排时间轴 `nt-timeline-card`，快速追加 `nt-entry-add`，条目行内编辑/删除 `nt-entry-edit-<id>`/`nt-entry-del-<id>`）；datetime 校验 `^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$` + 范围检查（月 1-12/日 1-31/时 0-23/分 0-59，纯正则拒绝不了 '2026-13-99 25:61'）；条目排序走 `noteCore.sortTimelineEntries`，筛选走 `filterNotes`；'all' 双段渲染（普通网格 + 时光轴网格，经 `noteCore.partitionNotesByType` 拆分，仅含数据的段才渲染）；`hasActiveNoteFilter` 激活判定：默认 'all' 与显式 'normal' 均不算类型激活（仅 'timeline' 算类型激活），categoryId/keyword 非空仍计激活 |
| 工作台日记 | `workbench/WorkbenchDiary.vue` | 每日一篇（date 本地唯一）：工具栏 日期输入 `dj-date-input`（默认今天）+ 今日 `dj-today-btn` + 保存 `dj-save-btn` + 删除 `dj-delete-btn`（仅选中条目时渲染）+ 编辑/预览切换 `dj-preview-toggle` + 字数 `dj-char-count`；编辑器 `dj-content-input` / Markdown 预览 `dj-preview`（走 `noteMarkdown.renderMarkdown` + `:deep()` 排版镜像 WorkbenchNotes，锚点点击不冒泡）；历史卡片网格（auto-fill minmax(240px,1fr)，8 条/页）+ 分页 `dj-page-prev`/`dj-page-info`（「第 X / Y 页」，边界禁用）/`dj-page-next`，新增条目回第 1 页、删除页码自动钳制；卡片 `dj-card-<id>` + 日期 `dj-card-date-<id>`（含中文星期 周X）+ 今天徽标 `dj-card-today-<id>` + 6 行 clamp 预览 `dj-card-preview-<id>`；空态 `dj-empty`「还没有日记，写下今天的第一篇吧」；日期切换脏检查 confirm；trim 空保存 → toast.warning「内容为空，未保存」；成功 → toast.success「日记已保存」；只消费 store（sortedEntries/upsertEntry/deleteEntry），不自加载（view 调 loadDiary）、不内联重排 |
| 工作台面板 | `workbench/WorkbenchHome.vue` + `workbench/WorkbenchTodo.vue` + `workbench/WorkbenchNotes.vue` + `workbench/WorkbenchDiary.vue` + `workbench/WorkbenchCountdown.vue` + `workbench/WorkbenchPomodoro.vue` + `workbench/WorkbenchHabits.vue` + `workbench/WorkbenchPassword.vue` + `workbench/WorkbenchHealth.vue` + `workbench/WorkbenchHealthReminders.vue` + `workbench/WorkbenchExercise.vue` + `workbench/WorkbenchDiet.vue` + `workbench/WorkbenchSleep.vue` + `workbench/WorkbenchWeight.vue` + `workbench/WorkbenchLedger.vue` + `workbench/WeatherCard.vue` + `workbench/CalendarAnchorCard.vue` | 个人工作台：左侧菜单 10 项（主页/待办/便签/日记本/倒计时/番茄钟/习惯打卡/密码/健康管理/记账）；健康管理=WorkbenchHealth.vue tabs 容器（受控 activeTab+change，前缀 hd-，内含运动/饮食/睡眠/体重四面板）；运动/饮食/睡眠面板顶部挂 WorkbenchHealthReminders.vue 只读提醒区块（1:1 分类映射）；待办/便签走 `useWorkbenchTodosStore` / `useWorkbenchNotesStore`，日记走 `useWorkbenchDiaryStore`，健康走 `useWorkbenchHealthStore`，记账走 `useWorkbenchLedgerStore`，倒计时/密码复用既有 store，均经 `useIdb.ts` 持久化到 IndexedDB |
| 工作台菜单设置（排序/改名/恢复默认） | `AppSettingsDialog.vue` | 「工作台设置」tab（activeTab==='wb'）body 内、弹窗尺寸表格上方 `.wb-menu-config` 区块：10 行来自 `store.workbenchMenuItems`（图标 + 改名 input `maxlength="12"`，blur/Enter 提交、Esc 还原、trim 空还原上值不调 store，提交前按 code point 校验 ≤12 防代理对截断 + 上移/下移按钮，home 恒 disabled + `aria-disabled`，index≤1 上移 / 末行下移达边界 disabled）；区块「恢复默认」→ `store.resetWorkbenchMenu()`；testid：`wbmenu-row-<key>`/`wbmenu-name-<key>`/`wbmenu-up-<key>`/`wbmenu-down-<key>`/`wbmenu-reset`；改名 input 直接绑 store 状态（`menuEditing` 仅暂存输入中文本，提交/还原后回落 computed label，无草稿机制——全局 resetAll 后自动刷新不残留旧值）；store 返回 ok:false（locked/boundary/not-found）静默忽略无 toast（有意偏离「可用+toast」惯例） |
| 工作台左菜单渲染 | `src/views/WorkbenchView.vue` | 菜单渲染自 `settingsStore.workbenchMenuItems`（computed 由 `workbenchMenuCore.resolveMenuItems` 解析，顺序/改名经设置弹窗调整后在此直接生效，视图禁止内联重算）；每项按钮 `data-testid="wb-menu-<key>"` + `:title="item.label"` 全名；label 溢出省略作用于内部 `.wb-menu-label` span（min-width:0 + overflow:hidden + text-overflow:ellipsis + white-space:nowrap，对按钮本身设 ellipsis 不截断子 span 文本）；`SECTION_KEYS`/`navigateTo`/内容 switch 仍 key 驱动不动 |

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

## ANTI-PATTERNS

- **Do NOT** put business logic in components — extract to `src/stores/` or `src/composables/`
- **Do NOT** append `.html` to game paths in SiteModal URL input (serve redirects cause content loss)
- **SiteModal.vue** is 1175 lines — avoid further growth, extract sub-components if adding features
- **GlobalSearch.vue** is 583 lines — same concern
- **BackgroundManager.vue** is 876 lines — same concern
- Components eagerly imported in views (no lazy loading)
