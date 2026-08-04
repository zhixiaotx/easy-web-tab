# Task 13 — 工作台 6 组件暗色模式审计与修复

日期：2026-08-04
范围：`WorkbenchView.vue` + `src/components/workbench/` 下 5 个面板组件（本次功能新增的 6 个组件）
方式：静态审计 scoped `:root.dark` 覆盖完整性 + Playwright 实际渲染 computed-style 抽查（本模型无法直接看图，按任务要求以 getComputedStyle 颜色对比度为准 + 全页截图留档）

## 环境

- 共享 dev server：http://localhost:16718/workbench（未自启/未停止）
- 暗色激活：`page.evaluate(() => document.documentElement.classList.add('dark'))`
- 密码面板：Playwright profile 主密码 `testpass123`（data-testid=pwd-unlock-input / pwd-unlock-submit），解锁后截图列表态（1 条密码条目）
- 全局暗色变量：`src/styles/dark.css:4-44`（--bg-primary:#111827 / --bg-secondary:#1f2937 / --text-primary:#f9fafb / --text-secondary:#d1d5db / --text-muted:#9ca3af / --border-color:#374151 / --accent-color:#3b82f6 / --hover-bg:#374151 / --input-bg:#374151）

## 审计清单结论（6 组件逐项）

所有组件均使用 `var(--bg-*)` / `var(--text-*)` / `var(--border-color)` / `var(--accent-color)` / `var(--hover-bg)` / `var(--input-bg)` / `var(--error-color)` 主题 token，且均自带 `:root.dark` 覆盖段。静态审计 + 实渲染发现 3 类问题（详见「问题与修复」）。

## 各面板检查结果

### 1. view（工作台外壳，WorkbenchView.vue）— 截图 `view-dark.png`
| 检查项 | computed 值 | 判定 |
|---|---|---|
| .wb-shell background | rgb(17,24,39) #111827 | ✓ 深底 |
| .wb-header background / border-bottom | #1f2937 / #374151 | ✓ |
| .wb-menu background / border-right | #1f2937 / #374151 | ✓ |
| .wb-menu-item.active bg / color | #1e3a5f / #60a5fa | ✓ 对比可读 |
| .wb-btn bg / color / border | #1f2937 / #d1d5db / #374151 | ✓ |
| .wb-clock color | #d1d5db | ✓ |

发现：移动端（≤768px）`.wb-menu` 底边框在暗色下沿用亮色 token `var(--color-border, #e2e8f0)`，亮色边框顶在深色背景上 → 已补 `:root.dark` 覆盖（见修复 3）。

### 2. home（主页仪表盘，WorkbenchHome.vue）— 截图 `home-dark.png`
| 检查项 | computed 值 | 判定 |
|---|---|---|
| .stat-card bg / border | #1f2937 / #374151 | ✓ |
| .panel-card 背景 | #1f2937 | ✓ |
| .stat-value / .panel-header h3 / .home-list-title | #f9fafb | ✓ |
| .stat-label / .stat-sub / .nav-btn | #d1d5db | ✓ |
| .home-list-item bg / border | #1f2937 / #374151 | ✓ |
| .prio-badge.prio-high | 文字 #fca5a5，bg rgba(185,28,28,.35) | ✓ 深色变体 |
| .cd-critical | #f87171 | ✓ |
| .home-empty / 空态 | 静态：bg-secondary + text-muted | ✓ |

### 3. todos（待办面板，WorkbenchTodo.vue）— 截图 `todos-dark.png`
| 检查项 | computed 值 | 判定 |
|---|---|---|
| .todo-form bg | #1f2937 | ✓ |
| input/select/date（title-input 等） | bg #374151 / text #f9fafb / border #374151 | ✓ |
| .todo-item bg / border | #1f2937 / #374151 | ✓ |
| .todo-title / .todo-desc | #f9fafb / #d1d5db | ✓ |
| .prio-high / .prio-medium | #fca5a5 / #fbbf24，深色半透明底 | ✓ |
| .overdue-tag「已逾期」 | 静态：白字 + var(--error-color)=#ef4444 底 | ✓（当前数据无逾期项，静态确认） |
| .filter-tab.active | **修复前** bg #1f2937 / text #d1d5db（与未选中态同色）→ **修复后** bg #3b82f6 / 白字 | ✗→✓ |

### 4. notes（便签面板，WorkbenchNotes.vue）— 截图 `notes-dark.png` + `notes-overlay-dark.png`（浮层补充证据）
| 检查项 | computed 值 | 判定 |
|---|---|---|
| .note-blue 卡片 | bg rgba(59,130,246,.18) / 文字 #93c5fd / 边框 #1d4ed8 | ✓ 深色变体 |
| .note-yellow 卡片 | bg rgba(234,179,8,.18) / 文字 #fde047 / 边框 #a16207 | ✓ 深色变体 |
| .note-green / .note-pink | 静态：rgba(34,197,94,.16)/#6ee7b7、rgba(236,72,153,.16)/#f9a8d4 | ✓（当前数据无绿/粉卡片，静态确认） |
| .note-overlay | rgba(0,0,0,.7) | ✓ |
| .note-form bg / .note-form-title | #1f2937 / #f9fafb | ✓ |
| .note-content-input | bg #374151 / text #f9fafb | ✓ |
| .color-option.active | accent 边框 + #f9fafb | ✓ |

### 5. countdowns（倒计时面板，WorkbenchCountdown.vue）— 截图 `countdowns-dark.png`
| 检查项 | computed 值 | 判定 |
|---|---|---|
| .cd-form bg | #1f2937 | ✓ |
| .sort-select | bg #374151 / text #f9fafb | ✓ |
| .cd-item bg / border | #1f2937 / #374151 | ✓ |
| .cd-name / .cd-time / .front-toggle | #f9fafb / #9ca3af / #9ca3af | ✓ |
| 状态色 status-critical | #f87171 | ✓ |
| status-expired | #9ca3af（muted，深底可读） | ✓ |
| status-normal / status-urgent | 静态：#4ade80 / #fbbf24 | ✓ |
| .btn-move / .repeat-badge | 静态：dark 覆盖存在 | ✓ |

### 6. passwords（密码面板，WorkbenchPassword.vue）— 截图 `passwords-dark.png`（解锁态，1 条条目）
| 检查项 | computed 值 | 判定 |
|---|---|---|
| .pwd-search | bg #374151 / text #f9fafb | ✓ |
| .pwd-btn-lock / .pwd-btn-cancel | #1f2937 / #d1d5db / border #374151 | ✓ |
| .pwd-item bg / border | #1f2937 / #374151 | ✓ |
| .pwd-site-name / .pwd-site-url / .pwd-details | #f9fafb / #d1d5db / #d1d5db | ✓ |
| .pwd-form（新增表单） | bg #1f2937，h3 #f9fafb，input #374151/#f9fafb，label #f9fafb | ✓ |
| .pwd-auth-card（解锁态） | 静态：dark 覆盖存在 | ✓ |

## 问题与修复（仅 scoped `<style>` 的 `:root.dark` 覆盖段）

1. **WorkbenchTodo.vue — 选中筛选页签暗色失效**
   - 原因：`:root.dark .filter-tab`（特异性 0,3,0）覆盖亮色的 `.filter-tab.active`（0,2,0），导致暗色下选中页签与未选中同色（bg #1f2937、text #d1d5db），无法区分当前筛选。
   - 修复：新增
     ```css
     :root.dark .filter-tab.active {
       background-color: var(--accent-color, #3b82f6);
       border-color: var(--accent-color, #3b82f6);
       color: #fff;
     }
     ```
   - 实测：bg #3b82f6 + 白字 ✓

2. **WorkbenchTodo / WorkbenchCountdown / WorkbenchNotes / WorkbenchPassword — 禁用态主按钮暗色低对比**
   - 原因：亮色 `.btn-save:disabled { background: var(--text-muted) }` 在暗色下解析为 #9ca3af 亮灰底 + 白字（对比度约 2.5:1，且为暗色页面上明显的亮块）。
   - 修复：4 个组件各补禁用态覆盖（Todo/Countdown/Notes 用 `.btn-save:disabled`，Password 用 `.pwd-btn-primary:disabled`）：
     ```css
     :root.dark .btn-save:disabled {   /* pwd-btn-primary:disabled 同理 */
       background-color: var(--input-bg, #374151);
       color: var(--text-muted, #9ca3af);
     }
     ```
   - 实测：bg #374151 + text #9ca3af，深底灰字 ✓（4 组件均已实测）

3. **WorkbenchView.vue — 移动端菜单底边框暗色漏覆盖**
   - 原因：≤768px 时 `.wb-menu` 底边框用亮色 `var(--color-border, #e2e8f0)`，暗色下无覆盖，亮边框出现在深色菜单底部。
   - 修复：dark 段后补
     ```css
     @media (max-width: 768px) {
       :root.dark .wb-menu {
         border-bottom-color: var(--border-color, #374151);
       }
     }
     ```

## 构建结果

`npm run build`（generate-preset-icons → vue-tsc -b → vite build）：**零错误**，172 modules transformed，1.39s。

## 证据截图清单（`.omo/evidence/workbench-page/task-13-darkmode/`）

- `view-dark.png` — 工作台外壳暗色
- `home-dark.png` — 主页仪表盘暗色
- `todos-dark.png` — 待办面板暗色（修复后重截）
- `notes-dark.png` — 便签面板暗色（修复后重截）
- `notes-overlay-dark.png` — 便签编辑浮层暗色（补充证据）
- `countdowns-dark.png` — 倒计时面板暗色（修复后重截）
- `passwords-dark.png` — 密码面板解锁态暗色（修复后重截）

## 改动文件清单

- `src/views/WorkbenchView.vue`（scoped `:root.dark` 补移动端边框覆盖）
- `src/components/workbench/WorkbenchTodo.vue`（`:root.dark .filter-tab.active` + `.btn-save:disabled`）
- `src/components/workbench/WorkbenchCountdown.vue`（`:root.dark .btn-save:disabled`）
- `src/components/workbench/WorkbenchNotes.vue`（`:root.dark .btn-save:disabled`）
- `src/components/workbench/WorkbenchPassword.vue`（`:root.dark .pwd-btn-primary:disabled`）

未改动：`src/styles/dark.css`、任何既有组件/视图、模板与 script 逻辑、`presetIcons.ts`。
