# src/stores/ — Data Layer (Pinia)

## OVERVIEW

31 Pinia stores managing all application state. 16 workbench/business stores (`sites.ts` is the god store with highest centrality) + 15 student stores (`studentXxx.ts`, thin-delegates over `student*Core` pure functions).

## STRUCTURE

```
stores/
├── sites.ts              # Core data store (628 lines) — CRUD, filtering, pagination, import/export (localStorage `user-sites`)
├── categories.ts         # Legacy category migration + custom categories
├── searchEngines.ts      # 3 built-in (immutable) + custom engines (3 localStorage keys)
├── theme.ts              # Dark mode (class toggle) + background image state (two concerns)
├── settings.ts           # Dialog size settings contract + 工作台菜单状态/变更（顺序/名称/显示开关）+ 导航筛选栏展开态 + 提醒设置 6 字段（desktopNotifyEnabled + reminderEmailEnabled/reminderEmailTo/reminderEmailServiceId/reminderEmailTemplateId/reminderEmailPublicKey，6 个 setter set 后 persist；parseSettingsData 白名单归一：布尔仅采纳 true/false、字符串原样透传不 trim） (useAppSettingsStore, DIALOG_DEFAULTS / DIALOG_LABELS)
├── passwords.ts          # crypto-js AES-CBC encrypted password vault (171 lines, IndexedDB store 'passwords')
├── icons.ts              # User-uploaded custom icon storage (116 lines)
├── countdowns.ts         # Countdown CRUD + sort preference (5 modes, 6 重复规则对象 + 内置 6 分类 + 自定义分类注册表/tabCategories 偏好; addCountdown/updateCountdown 入参透传 emailReminder?: boolean; IndexedDB store 'countdowns')
├── workbenchTodos.ts     # 工作台待办 CRUD + 筛选/搜索/排序 + 分类注册表（全自定义分类 customCategories/tabCategories/allCategories + addCategory/updateCategory/deleteCategory/moveCategory/toggleTabCategory 返回 {ok, reason}，重命名同步存量 categoryId、被引用禁删，存量 work/life/study 迁移未分类 + 注册表清理（marker '2' 门控），偏好存 localStorage） (246 lines, IndexedDB store 'todos')
├── workbenchNotes.ts     # 工作台便签：便签 CRUD + 置顶 + 分类 CRUD（addCategory 默认 showInTabs:true / updateCategory patch 支持 showInTabs 标签页显隐 / moveCategory / deleteCategory，名称唯一、删除后该分类便签归未分类）+ 时光轴条目 CRUD（addTimelineEntry/updateTimelineEntry/deleteTimelineEntry） (204 lines, IndexedDB store 'notes' 存 NoteData `{categories, notes}`)
├── workbenchDiary.ts     # 工作台日记：每日一篇（date 本地 'YYYY-MM-DD' 唯一，upsert 语义），loadDiary/upsertEntry/deleteEntry，saveDiary 写 DiaryData 对象形状 `{ entries: toRaw(entries.value) }`（normalizeDiaryData 拒绝裸数组），排序委托 diaryCore (IndexedDB store 'diary')
├── workbenchPomodoro.ts  # 工作台番茄钟：设置/运行状态 CRUD (IndexedDB store 'pomodoro')
├── workbenchHabits.ts    # 工作台习惯打卡：习惯定义 + 打卡记录 CRUD (IndexedDB store 'habits')
├── workbenchHealth.ts    # 健康数据：height/plans/records 四模块（exercise/diet/sleep/weight）CRUD (IndexedDB store 'health')
├── workbenchLedger.ts    # 记账：categories/entries CRUD + 分组管理（内置 8 组不可删，被引用禁删）+ loadLedger 自动复制上月 salary/mortgage + 金额可见性开关 showAmount/toggleAmountVisibility（纯内存不持久化） (IndexedDB store 'ledger')
└── workbenchBusiness.ts  # 销售记账：商品/支出双分类 CRUD + 商品/进货/收摊/支出 CRUD + 设置（stallName/lowStockThreshold）+ importData（整包导入，normalizeBusinessData 归一化 → 七 ref 赋值 → saveBusiness）；全部薄委托 businessCore 纯函数；商品被进货/收摊引用禁删（in-use，停售用 active）；支出内置 5 不可删（builtin）；商品分类种子可删（删除后商品归未分类）；收摊 upsertDailyRecord date 唯一 + totalRevenue 由 core 算好落库；saveBusiness 七字段逐 toRaw (IndexedDB store 'business')

学生工作台 15 store（命名 `useStudentXxxStore`，全部薄委托 student*Core 纯函数 + useIdb 持久化；见 WHERE TO LOOK「学生工作台」行与 src/composables/AGENTS.md）：
├── studentSettings.ts     # 枢纽：学段 K/P/J + 菜单顺序/开关 + 家长 PIN（setParentPin/verifyPin/lockRemainingSeconds/hasParentPin）(IDB 'student_settings')
├── studentHabits.ts / studentHomework.ts / studentTimetable.ts / studentPlan.ts / studentReview.ts / studentMistakes.ts / studentReading.ts / studentExam.ts / studentEducation.ts / studentDiary.ts / studentPomodoro.ts / studentAchievements.ts / studentRewards.ts / studentParentTasks.ts  # 各面板数据（studentExam 复用共享 IDB 'student_countdowns'；studentDiary 复用 diaryCore/noteMarkdown；studentParentTasks 存 {tasks} 信封，单事务云端同步）
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
| Password vault | `passwords.ts` | Master-password-gated, uses `useCrypto.ts` for crypto-js AES-CBC + PBKDF2 |
| Custom icons | `icons.ts` | Merges preset icons with user uploads |
| Countdown CRUD | `countdowns.ts` | `addCountdown()`/`updateCountdown()`/`importCountdowns()`/`loadCountdowns()` 入口全部经 `normalizeCountdown` 归一化（保留自定义分类）；6 种 repeat 规则对象 + 内置 6 分类 + 自定义分类注册表（`addCustomCategory`/`renameCustomCategory`/`deleteCustomCategory`/`moveCustomCategory` 返回 { ok, reason: empty|builtin|duplicate|not-found|in-use|boundary }，重命名同步存量条目、被引用禁删、move 上移下移整体替换数组并持久化）；`tabCategories` 标签页偏好（默认 exercise/diet/sleep）+ `setTabCategory`；偏好存 localStorage `user-countdown-categories`/`user-countdown-tab-categories`（不随 JSON 备份导出）；sort modes (remaining/name/created/endTime/manual)；`addCountdown`/`updateCountdown` 入参含 `emailReminder?: boolean` 透传（缺省 undefined=opt-in 不发邮件，经 normalizeCountdown 归一化） |
| Dialog size settings | `settings.ts` | `useAppSettingsStore` — per-dialog width/height contract, clamp 400-1600px / 30-100vh；另含 `navFiltersExpanded`（导航筛选栏展开态，默认 false 收起）+ 提醒设置 6 扁平 ref（`desktopNotifyEnabled`/`reminderEmailEnabled`/`reminderEmailTo`/`reminderEmailServiceId`/`reminderEmailTemplateId`/`reminderEmailPublicKey`）+ 6 setters（set 后 persist）；`parseSettingsData` 白名单归一（布尔仅采纳 true/false、字符串原样透传不 trim）；`applySettings` 应用、`resetDefaults` 复位 |
| 工作台菜单状态/变更 | `settings.ts` | 状态 `workbenchMenuOrder`（string 数组 ref，初始 `[...WORKBENCH_MENU_DEFAULT_ORDER]` 拷贝，杜绝空菜单闪屏）/`workbenchMenuLabels`（对象 ref，默认 {}）/`workbenchMenuVisibility`（对象 ref，默认 {}，false=隐藏）；变更 `moveWorkbenchMenuItem(key, dir)`（上移/下移，home 恒 locked、边界 boundary，成功写回新 order + persist）/`renameWorkbenchMenuItem(key, name)`（trim 空 empty、未知键 not-found，成功写回新 labels + persist）/`setWorkbenchMenuVisibility(key, visible)`（false 写入、true 移除记录回缺省显示，persist）/`resetWorkbenchMenu()`（区块级重置顺序/名称/开关三字段，不碰 dialogSizes/opacity/CSS 变量，不调 resetDefaults）——全部委托 `workbenchMenuCore`；computed `workbenchMenuItems` = `resolveMenuItems(order, labels, visibility)`（label 回退默认名、icon 查表、false 键剔除，默认态恒 10 项 home 首位，WorkbenchView 左菜单消费）/`workbenchMenuAllItems`（不过滤全量 10 项，AppSettingsDialog 菜单列表消费——关闭项行保留可重新开启）/`workbenchMenuEnabled`（全键布尔视图）+ `isWorkbenchMenuEnabled(key)`（navigateTo/主页统计联动判定）；`setNavFiltersExpanded(v)` 控制导航站分类/标签栏展开收起 |
| 工作台待办 | `workbenchTodos.ts` | `addTodo()`, `toggleTodo()`, filter/search/sort; 未完成优先 → 优先级 → 截止日期 → 创建时间；分类注册表 `addCategory`/`updateCategory`/`deleteCategory`/`moveCategory`/`toggleTabCategory`（返回 { ok, reason: empty|duplicate|not-found|in-use|boundary }，重命名同步存量 categoryId + saveTodos、被引用禁删、move 上移下移整体替换数组并持久化）；`tabCategories` 标签页偏好（默认空数组，仅恢复用户勾选记录）+ `allCategories` 全量（仅自定义分类，表单下拉来源）；偏好存 localStorage `user-todo-categories`/`user-todo-tab-categories`（不随 JSON 备份导出，初始化 loadCategoryPreferences）；`loadTodos()` 经 localStorage marker `user-todo-categories-migrated`（数据版本化，当前 '2'）门控：`!== '2'` 时迁移存量 work/life/study → 未分类 + `purgeLegacyBuiltinCategories` 清理分类注册表残留，持久化后置 marker '2'，幂等 |
| 工作台便签 | `workbenchNotes.ts` | 便签 CRUD（`addNote()`/`updateNote()`/`deleteNote()`/`togglePin()`）+ 分类 CRUD（`addCategory`/`updateCategory`/`moveCategory`/`deleteCategory`：名称 trim 后非空 + 大小写不敏感唯一、追加 sort=现有最大+1、addCategory 默认 showInTabs:true、updateCategory patch 支持 showInTabs（标签页显隐）、删除后该分类下便签归未分类 categoryId:undefined）+ 时光轴条目 CRUD（`addTimelineEntry`/`updateTimelineEntry`/`deleteTimelineEntry`）；`sortedNotes`=置顶优先 → updatedAt 降序，排序/筛选/归一化一律走 `noteCore` 纯函数（store 只做薄委托 + 持久化） |
| 工作台日记 | `workbenchDiary.ts` | `loadDiary()`（idbGet + `normalizeDiaryData` 幂等归一，catch → 空）/`saveDiary()`（**写 DiaryData 对象形状 `{ entries: toRaw(entries.value) }`——normalizeDiaryData 拒绝裸数组，写裸数组会导致保存后刷新日记全部丢失，勿改回**）/`upsertEntry(date, content)`（content trim 空 → 跳过不保存；同日期 → 更新 content/updatedAt；新日期 → push `dy_${Date.now()}_${rand4}`，恒 saveDiary）/`deleteEntry(id)`（在 `toRaw` 原始数组上 filter，防残留 Proxy 元素 DataCloneError）；`sortedEntries`=date 降序 → createdAt 降序（公式走 `sortDiaryEntries`，store 只做薄委托 + 持久化） |
| 工作台健康 | `workbenchHealth.ts` | `loadHealth()`/`saveHealth()`/`setHeight()`/`setPlan()`/`addRecord()`/`updateRecord()`/`deleteRecord()`；数据归一化走 `normalizeHealthData`，达标率/BMI 等一律走 `healthCore` 纯函数（store 只保证状态与持久化） |
| 工作台记账 | `workbenchLedger.ts` | `loadLedger()`/`addEntry()`/`updateEntry()`/`deleteEntry()`/`addCategory()`/`updateCategory()`/`deleteCategory()`（内置 8 组 isBuiltIn 不可删改，自定义组被任意月份记录引用时删除返回 { ok:false, reason:'in-use' }）；月统计走 `ledgerCore`；`loadLedger()` 成功后调 `applyMonthlyAutoCopy()` 补当前月（目标月缺 salary/mortgage 且上月有该类记录 → 生成草稿 date=当月-01、金额取上月最新一条，幂等不跨月回溯，条目 id 前缀 `ld_`）；金额掩码状态 `showAmount` 为纯内存开关（不参与 idbPut/导出） |
| 销售记账 | `workbenchBusiness.ts` | `loadBusiness()`（normalizeBusinessData 幂等归一，内置支出缺失自动补回）/`saveBusiness()`（七字段逐 toRaw）/`importData(raw)`（整包导入：normalizeBusinessData 归一化 → 七 ref 赋值 → saveBusiness → 返回归一数据供 toast 计数）；双分类 CRUD（add/rename/toggleVisible/move/delete 返回 `{ok, reason}` 全委托 businessCore；商品分类删除后该分类商品归未分类）；商品 CRUD（`deleteProduct` 被进货/收摊引用 → in-use 禁删）；进货 CRUD（total 自动=数量×单价）；收摊 `upsertDailyRecord(date, items, note)`（date 唯一 upsert、totalRevenue=calcDailyRevenue）；支出 CRUD；设置 `setStallName`/`setLowStockThreshold`；IDB store 'business' |

## CONVENTIONS

- All stores use `defineStore('name', () => { ... })` (Composition API syntax)
- **Mixed storage**: sites/categories/searchEngines/theme/icons still persist via manual `localStorage.setItem`; countdowns/passwords/workbench todos/notes/diary/health/ledger/settings/pomodoro/habits persist to IndexedDB via `useIdb.ts` (`idbPut` / `idbGet`), DB `easy-web-tab` v12 (9 core stores + 3 aux stores + 1 icons + 16 student stores)
- **学生 store 规范**: 15 个 `studentXxx` store（`useStudentXxxStore`）全部薄委托 `student*Core` 纯函数 + useIdb 持久化；`studentSettings`=枢纽（学段 K/P/J + 菜单 + 家长 PIN，IDB 'student_settings'）；IDB store `student_settings/_habits/_homework/_timetable/_plans/_review/_mistakes/_reading/_countdowns/_education/_diary/_pomodoro/_achievements/_rewards/_parent_tasks/_images` 共 16 个；`studentExam` 复用共享 'student_countdowns' store；`studentDiary` 复用 diaryCore/noteMarkdown；**学生数据随云端 student.json 信封独立同步，不随工作台备份 v9**（student-backup 信封 STUDENT_DATA_VERSION=1）
- Before writing to IndexedDB, pass `toRaw()`-ed plain data — IDB structured clone cannot handle Vue reactive Proxy (DataCloneError). **注意：嵌套 reactive 数组需逐数组 `toRaw`**（整体 `toRaw({...})` 对嵌套数组无效）——如 `idbPut('ledger', toRaw({ categories: toRaw(categories.value), entries: toRaw(entries.value) }))`
- Built-in data (categories, engines) is hardcoded constant arrays, not loaded from files
- User data loaded at store initialization: `localStorage` for sites/categories/engines/theme/icons; `idbGet` for countdowns/passwords/workbench todos/notes/diary/health/ledger (with one-time non-destructive migration from legacy localStorage keys)
- **倒计时 repeat 归一化**: `once` 规范为 `null`；旧字符串 `'yearly'` → `{type:'yearly'}`；所有写入/加载入口（loadCountdowns 含 localStorage 迁移、addCountdown、updateCountdown、importCountdowns）都经 `normalizeCountdown`，幂等——IDB 存量旧结构也在加载时归一化
- **倒计时字段**: `category?: string`（任意 trim 后非空值，内置 6 类有专属徽标色，自定义统一 `cat-default` 灰；缺省按 `'work'` 展示）；`lastRemindedAt?: string`（YYYY-MM-DD HH:mm，提醒引擎写入去重用）
- **便签数据规范**: 双数组状态 `categories`（NoteCategory：id `nc_` 前缀 + name 唯一 + sort + showInTabs（undefined/true=标签页显示默认、false=隐藏））+ `notes`（WorkbenchNote：id `nt_` 前缀、`categoryId` undefined=未分类、`entries` 仅 type='timeline' 保留，条目 id `te_` 前缀）；`saveNotes()` 对两个 reactive 数组分别 `toRaw` 后写 `{ categories, notes }` 到 store 'notes'（整体 toRaw 不拆嵌套 Proxy）；`deleteCategory()` 在 `toRaw(notes.value)` 原始数组上 map 把该分类便签置未分类（同 deleteNote 的 toRaw filter 安全模式，防 DataCloneError）；加载入口 `loadNotes()` 经 `normalizeNoteData` 幂等归一（旧数组格式 → `{categories:[], notes:[...]}`）
- **日记 store 规范**: 单数组状态 `entries`（WorkbenchDiary：id `dy_` 前缀、date 本地 'YYYY-MM-DD' 唯一、content Markdown、createdAt/updatedAt ISO）；`saveDiary()` 写 **DiaryData 对象形状** `{ entries: toRaw(entries.value) }` 到 store 'diary'——`normalizeDiaryData` 拒绝裸数组（Array.isArray → empty），写裸数组会导致保存后刷新日记全部丢失（T5 round-trip bug 实证），勿改回数组写入；`deleteEntry()` 在 `toRaw(entries.value)` 原始数组上 filter（残留 Proxy 元素会 DataCloneError）；`upsertEntry` content trim 空直接跳过不保存；加载入口 `loadDiary()` 经 `normalizeDiaryData` 幂等归一；排序/星期标签一律走 `diaryCore` 纯函数（store 只做薄委托）
- **工作台菜单规范**: home 恒居 index 0 且显示开关锁定（`normalizeWorkbenchMenu` 强制前插/前移 + UI 层 home 开关 disabled，core/视图双保证，任何路径不得绕过）；所有排序/改名/开关归一化一律委托 `workbenchMenuCore`（组件/视图禁止内联重算 swap/trim/截断/过滤公式）；`persist()` 对菜单字段逐字段 `toRaw`（`toRaw(workbenchMenuOrder.value)` / `toRaw(workbenchMenuLabels.value)` / `toRaw(workbenchMenuVisibility.value)`，嵌套 reactive 整体 toRaw 是 no-op）；`initSettings` 两条生效来源（IDB 主路径 + localStorage 迁移结果）应用前均经 `normalizeWorkbenchMenu`/`normalizeWorkbenchMenuVisibility` 归一化，应用后 fire-and-forget `persist()` 写回归一化结果（导出/导入往返幂等）；菜单字段 optional、缺失回退默认（菜单自身从未触发备份版本升级；当前备份版本 6 由日记功能引入，向后兼容）；开关关闭 → 左菜单隐藏 + 面板不可进入（navigateTo 双守卫、激活区被关 watch 回退首项）+ 主页对应统计/面板/快捷添加隐藏（WorkbenchHome.menuOn 消费 `workbenchMenuEnabled`）；`navFiltersExpanded` 默认 false（收起），仅布尔持久化

## ANTI-PATTERNS

- **`sites.ts` is 628 lines** — avoid adding more responsibilities; extract if growing
- **`sites.ts` cross-references** `useCategoriesStore`, `useSearchEnginesStore`, and `usePasswordsStore` internally
- **Only `video` is truly built-in** — do NOT claim "office, tech, video" are all locked
- **Legacy categories** (office, tech, etc.) are seeded once as user-deletable custom categories — tracked via `user-deleted-legacy-ids` in localStorage
- **Built-in engines** (local, baidu, bing) — cannot be deleted; local engine URL is immutable
- **Data merge logic** in `loadSites()`: built-in data → user localStorage overlay (same-URL override)
- **`searchEngines.ts`** has 3 separate localStorage keys for 3 concerns: `user-search-engines`, `built-in-engine-overrides`, and `built-in-engine-default`
- **`theme.ts`** manages both dark mode AND background images — two concerns in one store
- **`passwords.ts`** stores encrypted data in IndexedDB (store 'passwords'); the `isUnlocked` flag is in-memory only (not persisted)
- **`countdowns.ts` / `passwords.ts`** switched to IndexedDB — `user-countdowns` / `user-passwords` legacy localStorage keys are one-time non-destructive migration sources only (IDB empty + legacy snapshot present → copy to IDB); do NOT read/write them directly
- **`workbenchHealth.ts` / `workbenchLedger.ts` / `workbenchNotes.ts` / `workbenchDiary.ts`** store no formatting/statistics logic — all math delegates to `healthCore`/`ledgerCore`/`noteCore`/`diaryCore` pure functions (components must call those too, never re-derive)
- **No store uses `persist` plugin** — persistence is manual: `localStorage.setItem` for sites/categories/engines/theme/icons; `idbPut` (via `useIdb.ts`) for countdowns/passwords/workbench todos/notes/diary/health/ledger
