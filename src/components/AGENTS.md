# src/components/ — UI Layer

## OVERVIEW

23 Vue 3 SFCs in the root plus 5 workbench panel SFCs under `workbench/`, all using `<script setup lang="ts">` with scoped CSS, CSS custom properties, and class-based dark mode.

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
├── PasswordManager.vue   # Password vault UI (master-password-gated, 1014 lines)
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
└── workbench/            # 个人工作台 5 面板 (data persisted to IndexedDB via `useIdb.ts`)
    ├── WorkbenchHome.vue        # 工作台首页（聚合概览入口）
    ├── WorkbenchTodo.vue        # 待办面板（增删改查 + 优先级/搜索/筛选）
    ├── WorkbenchNotes.vue       # 便签面板（增删改查 + 置顶 + 颜色）
    ├── WorkbenchCountdown.vue   # 倒计时面板（规则/分类表单 + 徽标，data-testid 前缀 cd-）
    └── WorkbenchPassword.vue    # 密码面板（复用 usePasswordsStore / useCrypto.ts）
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
| Password vault | `PasswordManager.vue` | Master-password-gated, tied to `usePasswordsStore` |
| Countdown management | `CountdownManager.vue` + `workbench/WorkbenchCountdown.vue` | 管理端/工作台表单：6 种重复规则选择器（weekly 周几多选 + 工作日快捷钮 / monthly 几号 / interval 分钟）+ 分类 3 选 + 校验；`repeatLabel`/`categoryLabel` 徽标 |
| Countdown display | `CountdownModal.vue` | 前台只读展示（`frontCountdowns`），repeat-badge + cat-badge（work=蓝/life=绿/study=紫） |
| Reminder popup | `CountdownReminder.vue` | 全屏遮罩弹框，到点时间显示 `⏰ MM-DD HH:mm`；z-index 2000，点击遮罩不关闭 |
| Tag filtering | `TagFilter.vue` + `CategoryTabs.vue` | Tags extracted from all sites |
| Loading states | `SkeletonCard.vue` + `SkeletonGrid.vue` | Shimmer placeholders |
| Toast notifications | `Toast.vue` | Receives `toasts` array as prop from `useToast()` |
| 工作台面板 | `workbench/WorkbenchHome.vue` + `workbench/WorkbenchTodo.vue` + `workbench/WorkbenchNotes.vue` + `workbench/WorkbenchCountdown.vue` + `workbench/WorkbenchPassword.vue` | 个人工作台页面板；待办/便签走 `useWorkbenchTodosStore` / `useWorkbenchNotesStore`，倒计时/密码复用既有 store，均经 `useIdb.ts` 持久化到 IndexedDB |

## CONVENTIONS

- All components: `<script setup lang="ts">`
- Scoped styles use CSS variables: `var(--color-primary)`, `var(--bg-card)`, etc.
- Dark mode: class-based (`document.documentElement.classList.toggle('dark')`)
- Props via `defineProps<{}>()`, emits via `defineEmits`
- No state management inside components — delegate to stores or composables

## ANTI-PATTERNS

- **Do NOT** put business logic in components — extract to `src/stores/` or `src/composables/`
- **Do NOT** append `.html` to game paths in SiteModal URL input (serve redirects cause content loss)
- **SiteModal.vue** is 1175 lines — avoid further growth, extract sub-components if adding features
- **GlobalSearch.vue** is 583 lines — same concern
- **BackgroundManager.vue** is 876 lines — same concern
- Components eagerly imported in views (no lazy loading)
