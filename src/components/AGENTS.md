# src/components/ — UI Layer

## OVERVIEW

21 Vue 3 SFCs using `<script setup lang="ts">` with scoped CSS, CSS custom properties, and class-based dark mode.

## STRUCTURE

```
components/
├── SiteModal.vue         # Add/edit bookmark modal (auto-fetch metadata, 1175 lines — largest file)
├── GlobalSearch.vue      # Multi-engine search bar (583 lines)
├── BackgroundManager.vue # Background image picker (876 lines)
├── BackupManager.vue     # Import/export UI
├── CategoryManager.vue   # Category CRUD modal (built-in: only `video` locked)
├── CategoryTabs.vue      # Horizontal tab bar
├── CountdownManager.vue  # Countdown list + CRUD (750 lines)
├── CountdownModal.vue    # Countdown add/edit form (237 lines)
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
└── Toast.vue             # Notification toast (receives `toasts` array as prop)
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
| Countdown management | `CountdownManager.vue` + `CountdownModal.vue` | Timers with 5 sort modes, yearly repeat |
| Tag filtering | `TagFilter.vue` + `CategoryTabs.vue` | Tags extracted from all sites |
| Loading states | `SkeletonCard.vue` + `SkeletonGrid.vue` | Shimmer placeholders |
| Toast notifications | `Toast.vue` | Receives `toasts` array as prop from `useToast()` |

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
