# src/components/ — UI Layer

## OVERVIEW

23 Vue 3 SFCs in the root plus 12 workbench SFCs (10 panels + WorkbenchHealth tabs container + WorkbenchHealthReminders 只读提醒区块) under `workbench/`, all using `<script setup lang="ts">` with scoped CSS, CSS custom properties, and class-based dark mode.

## STRUCTURE

```
components/
├── SiteModal.vue         # Add/edit bookmark modal (auto-fetch metadata, 1175 lines — largest file)
├── GlobalSearch.vue      # Multi-engine search bar (583 lines)
├── BackgroundManager.vue # Background image picker (876 lines)
├── BackupManager.vue     # Import/export UI
├── AppSettingsDialog.vue # Dialog size settings UI (389 lines, uses `useAppSettingsStore` from settings.ts)
├── CategoryManager.vue   # Category CRUD modal (built-in: only `video` locked)
├── CategoryTabs.vue      # Horizontal tab bar
├── CountdownManager.vue  # 倒计时管理弹框（列表+CRUD+规则/分类表单，~983 行）
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
└── workbench/            # 个人工作台 12 SFC: 10 面板 + 健康管理 tabs 容器 + 定时提醒只读区块 (data persisted to IndexedDB via `useIdb.ts`)
    ├── WorkbenchHome.vue        # 工作台首页（聚合概览入口，9 张概览卡：4 旧 + 健康/记账 5 新）
    ├── WorkbenchTodo.vue        # 待办面板（增删改查 + 优先级/搜索/筛选）
    ├── WorkbenchNotes.vue       # 便签面板（顶部工具栏：左=新增便签/分类管理，右=搜索表单 关键词+分类下拉+类型下拉（全部类型默认 'all'/普通便签/时光轴便签）+查询/重置；'all' 双段渲染（普通网格+时光轴网格，经 partitionNotesByType 拆分，仅含数据的段才渲染）；操作栏下方分类筛选 tabs（仅勾选分类）+ 分类管理弹窗（标签页显示勾选 + 改名/上移下移/删除）+ 时光轴卡片竖排时间轴/快速追加/条目内联编辑删除，data-testid 前缀 nt-）
    ├── WorkbenchCountdown.vue   # 倒计时面板（分类筛选 tabs + ⚙️分类管理弹框 + 规则/分类表单 + 徽标，data-testid 前缀 cd-）
    ├── WorkbenchPassword.vue    # 密码面板（主密码三态 + 新增/编辑弹窗 + 书签关联下拉 + 名称搜索，复用 usePasswordsStore / useCrypto.ts）
    ├── WorkbenchHealth.vue      # 健康管理 tabs 容器（受控组件：props activeTab + emit change；tab 栏前缀 hd-；内含运动/饮食/睡眠/体重 四面板）
    ├── WorkbenchHealthReminders.vue # 健康面板只读「定时提醒」区块（props module: exercise/diet/sleep；读倒计时 store 按分类 1:1 过滤，名称+下次触发+重复规则，升序、无下次显示「—」、空分类不渲染；testid 前缀 `${module}-reminders`）
    ├── WorkbenchExercise.vue    # 运动面板（周目标 times/minutes/calories + 记录 + 达标率，data-testid 前缀 ex-）
    ├── WorkbenchDiet.vue        # 饮食面板（每日热量目标 + 四餐次记录，前缀 dt-）
    ├── WorkbenchSleep.vue       # 睡眠面板（每日时长目标 + 入睡/起床时间自动算时长 + 质量星标，前缀 sl-）
    ├── WorkbenchWeight.vue      # 体重面板（身高 + BMI 国标四档徽章 + 减肥建议 + 内联 SVG 折线图，前缀 wt-）
    └── WorkbenchLedger.vue      # 记账面板（月份切换 + 六指标统计含存款累计 + 分类占比条 + 行式记录列表可折叠 + 分组管理，前缀 ld-）
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
| Countdown management | `CountdownManager.vue` + `workbench/WorkbenchCountdown.vue` | 管理端/工作台表单：6 种重复规则选择器（weekly 周几多选 + 工作日快捷钮 / monthly 几号 / interval 分钟）+ 分类下拉取 `store.allCategories`（内置 6 + 自定义）+ 校验；`repeatLabel`/`categoryLabel` 徽标；工作台面板分类筛选为 tabs（全部 + `tabCategories`，`cd-cat-all`/`cd-cat-<c>`，即时过滤）+ ⚙️ 分类管理弹框（`cd-cat-dialog`：标签页显示复选框 + 自定义分类重命名/删除/添加，`cd-cat-rename-*`/`cd-cat-del-*`/`cd-cat-new-input`/`cd-cat-add-btn`，失败走 useToast warning） |
| Countdown display | `CountdownModal.vue` | 前台只读展示（`frontCountdowns`），repeat-badge + cat-badge（work=蓝/life=绿/study=紫/exercise=橙/diet=琥珀/sleep=青，亮暗双主题；自定义分类统一默认灰 `cat-default`） |
| Reminder popup | `CountdownReminder.vue` | 全屏遮罩弹框，到点时间显示 `⏰ MM-DD HH:mm`；z-index 2000，点击遮罩不关闭 |
| Tag filtering | `TagFilter.vue` + `CategoryTabs.vue` | Tags extracted from all sites |
| Loading states | `SkeletonCard.vue` + `SkeletonGrid.vue` | Shimmer placeholders |
| Toast notifications | `Toast.vue` | Receives `toasts` array as prop from `useToast()` |
| 工作台便签 | `workbench/WorkbenchNotes.vue` | 顶部工具栏（左：新增便签 `note-add-button` / 分类管理 `nt-cat-manager`；右：搜索表单 关键词 `nt-search-input` + 类型下拉 `nt-type-select`（全部类型默认 'all'/普通便签/时光轴便签）+ 查询 `nt-search-btn` / 重置 `nt-reset-btn`，草稿→应用模式：控件绑草稿 ref，查询/回车才生效，重置一键清空回默认）+ 操作栏下方分类筛选 tabs `nt-cat-all`/`nt-cat-uncategorized`/`nt-cat-<id>`（全部/未分类/可见分类=showInTabs!==false，即时过滤，公式走 `noteCore.tabCategoriesOf`）+ 表单 overlay 内 radio `nt-form-type-normal`/`nt-form-type-timeline`（切换保留 content+entries 数据）+ 分类管理弹窗（首区「标签页显示」勾选 `nt-catmgr-tab-<id>` 控制标签页可见性，取消勾选正激活的分类回退全部；改名/上移下移/删除、名称唯一、删除后该分类便签归未分类、正被筛选的分类重置为全部）+ 时光轴卡片（竖排时间轴 `nt-timeline-card`，快速追加 `nt-entry-add`，条目行内编辑/删除 `nt-entry-edit-<id>`/`nt-entry-del-<id>`）；datetime 校验 `^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$` + 范围检查（月 1-12/日 1-31/时 0-23/分 0-59，纯正则拒绝不了 '2026-13-99 25:61'）；条目排序走 `noteCore.sortTimelineEntries`，筛选走 `filterNotes`；'all' 双段渲染（普通网格 + 时光轴网格，经 `noteCore.partitionNotesByType` 拆分，仅含数据的段才渲染）；`hasActiveNoteFilter` 激活判定：默认 'all' 与显式 'normal' 均不算类型激活（仅 'timeline' 算类型激活），categoryId/keyword 非空仍计激活 |
| 工作台面板 | `workbench/WorkbenchHome.vue` + `workbench/WorkbenchTodo.vue` + `workbench/WorkbenchNotes.vue` + `workbench/WorkbenchCountdown.vue` + `workbench/WorkbenchPassword.vue` + `workbench/WorkbenchHealth.vue` + `workbench/WorkbenchHealthReminders.vue` + `workbench/WorkbenchExercise.vue` + `workbench/WorkbenchDiet.vue` + `workbench/WorkbenchSleep.vue` + `workbench/WorkbenchWeight.vue` + `workbench/WorkbenchLedger.vue` | 个人工作台：左侧菜单 7 项（主页/待办/便签/倒计时/密码/健康管理/记账）；健康管理=WorkbenchHealth.vue tabs 容器（受控 activeTab+change，前缀 hd-，内含运动/饮食/睡眠/体重四面板）；运动/饮食/睡眠面板顶部挂 WorkbenchHealthReminders.vue 只读提醒区块（1:1 分类映射）；待办/便签走 `useWorkbenchTodosStore` / `useWorkbenchNotesStore`，健康走 `useWorkbenchHealthStore`，记账走 `useWorkbenchLedgerStore`，倒计时/密码复用既有 store，均经 `useIdb.ts` 持久化到 IndexedDB |

## CONVENTIONS

- All components: `<script setup lang="ts">`
- Scoped styles use CSS variables: `var(--color-primary)`, `var(--bg-card)`, etc.
- Dark mode: class-based (`document.documentElement.classList.toggle('dark')`)
- Props via `defineProps<{}>()`, emits via `defineEmits`
- No state management inside components — delegate to stores or composables
- **WorkbenchNotes.vue testid 约定**：工具栏 搜索输入 `nt-search-input`、分类筛选 tabs `nt-cat-all`/`nt-cat-uncategorized`/`nt-cat-<id>`、类型下拉 `nt-type-select`（选项：全部类型默认 'all'/普通便签/时光轴便签）、查询 `nt-search-btn`、重置 `nt-reset-btn`、新增 `note-add-button`、分类管理入口 `nt-cat-manager`（弹窗行 `nt-catmgr-*`，含标签页显示勾选 `nt-catmgr-tab-<id>`）、表单 overlay 类型 radio `nt-form-type-normal`/`nt-form-type-timeline`、时光轴快速追加 `nt-entry-add`、条目行内编辑/删除 `nt-entry-edit-<id>`/`nt-entry-del-<id>`、空态 `note-empty`（普通）/`note-timeline-empty`（时光轴）；其余表单 `note-*` / `nt-form-*` 前缀

## ANTI-PATTERNS

- **Do NOT** put business logic in components — extract to `src/stores/` or `src/composables/`
- **Do NOT** append `.html` to game paths in SiteModal URL input (serve redirects cause content loss)
- **SiteModal.vue** is 1175 lines — avoid further growth, extract sub-components if adding features
- **GlobalSearch.vue** is 583 lines — same concern
- **BackgroundManager.vue** is 876 lines — same concern
- Components eagerly imported in views (no lazy loading)
