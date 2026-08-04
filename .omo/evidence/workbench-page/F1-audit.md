# F1 — Plan Compliance Audit（最终合规审计）

- 日期：2026-08-04
- 审计范围：`.omo/plans/workbench-page.md` 全部 14 个实现 todo + Scope Must have 运行时清单
- 审计方式：证据文件逐 todo 核对 + `npm run build` 最终状态零错误 + Playwright（dev server http://localhost:16718）运行时验证
- 结论：**PASS**（四项全部通过）

---

## 1. 逐 todo 证据核对

### 1.1 Todo 勾选状态（.omo/plans/workbench-page.md:95-202）

14 个实现 todo 全部 `- [x]` 勾选（逐行核对）：

| Todo | 计划行号 | 勾选 | 证据文件 |
|------|---------|------|----------|
| 1 types 类型定义 | :95 | `- [x]` | task-1-workbench-page.md |
| 2 useIdb.ts | :105 | `- [x]` | task-2-useIdb.md |
| 3 countdowns 迁移重构 | :112 | `- [x]` | task-3-countdowns.md |
| 4 passwords 迁移重构 | :119 | `- [x]` | task-4-passwords.md |
| 5 路由注册 | :126 | `- [x]` | task-5-router.md |
| 6 WorkbenchView 外壳 | :133 | `- [x]` | task-6-shell.md |
| 7 HomeView 入口 | :147 | `- [x]` | task-7-entry.md |
| 8 待办任务 | :154 | `- [x]` | task-8-todos.md |
| 9 便签 | :161 | `- [x]` | task-9-notes.md |
| 10 倒计时面板 | :168 | `- [x]` | task-10-countdown-panel.md |
| 11 密码面板 | :175 | `- [x]` | task-11-passwords-panel.md |
| 12 主页仪表盘 | :182 | `- [x]` | task-12-home.md |
| 13 暗色模式审计 | :189 | `- [x]` | task-13-darkmode.md |
| 14 AGENTS.md 更新 | :196 | `- [x]` | task-14-agents.md |

### 1.2 证据文件清单（.omo/evidence/workbench-page/）

`Get-ChildItem .omo/evidence/workbench-page/task-*.md` 返回 14 个证据文件，与 14 个 todo 一一对应：

```
task-1-workbench-page.md      task-8-todos.md
task-2-useIdb.md              task-9-notes.md
task-3-countdowns.md          task-10-countdown-panel.md
task-4-passwords.md           task-11-passwords-panel.md
task-5-router.md              task-12-home.md
task-6-shell.md               task-13-darkmode.md
task-7-entry.md               task-14-agents.md
```

### 1.3 截图证据核对

各 todo Acceptance criteria 要求的截图/Playwright 断言均在证据目录中：

| Todo | 截图/断言证据 | 存在 |
|------|--------------|------|
| 2 useIdb | console 写入/读取回环 + 版本拒绝断言（task-2-useIdb.md） | ✅ |
| 3 countdowns | 迁移+幂等+markdown 导入断言（task-3-countdowns.md） | ✅ |
| 4 passwords | task4-scenarioA-unlocked.png / task4-scenarioB-legacy-no-migrate.png | ✅ |
| 6 shell | task-6-shell.png（导出下载/双分支断言） | ✅ |
| 8 todos | task-8-todos.md 断言（增删改查/筛选/搜索/逾期） | ✅ |
| 9 notes | task-9-notes-dark.png / task-9-notes-light.png / task-9-notes-overlay.png | ✅ |
| 10 countdown | task-10-countdown-panel.png | ✅ |
| 11 passwords | workbench-password-dark.png | ✅ |
| 12 home | task-12-home.png | ✅ |
| 13 darkmode | task-13-darkmode/ 子目录 7 张截图（view/home/todos/notes/notes-overlay/countdowns/passwords -dark.png） | ✅ |
| 14 agents | task-14-agents.md（文件计数 + grep 核对） | ✅ |

**结论：PASS** — 14/14 todo 勾选，14/14 证据文件存在，截图与 Acceptance criteria 对应。

---

## 2. 最终 build 零错误

在最终状态（工作树现状）执行 `npm run build`（脚本 = `generate-preset-icons → vue-tsc -b → vite build`）：

```
> node scripts/generate-preset-icons.cjs && vue-tsc -b && vite build
Generated 14 icons -> src/composables/presetIcons.ts
✓ 172 modules transformed.
dist/assets/index-jdyVtXeM.css  144.88 kB │ gzip:  18.80 kB
dist/assets/index-Cj3nygZn.js   377.66 kB │ gzip: 126.57 kB
✓ built in 1.16s
BUILD_EXIT_CODE=0
```

- 退出码 **0**
- 无任何 error 输出（唯一提示为 `/backgrounds/preset-1.jpg` 运行时解析的良性信息，非错误）
- build 自动重新生成 `src/composables/presetIcons.ts`（计划禁止手编该文件，生成通过）

**结论：PASS**

---

## 3. Scope Must have 运行时验证（Playwright，dev server http://localhost:16718）

### 3.1 路由 /workbench 可访问

- `browser_navigate` → `http://localhost:16718/workbench`，URL 正常加载，页面 Title「网页导航」
- Snapshot 断言：`heading "个人工作台" [level=1]` 存在；非 404、非空白页

**PASS**

### 3.2 头部：返回按钮 + 实时时钟 + 导入/导出

Snapshot（初始加载）：
- `button "← 返回"` 存在
- `heading "个人工作台" [level=1]` 存在
- 时钟 `generic: 2026-08-04 08:22:34 星期二`（YYYY-MM-DD HH:mm:ss 星期X 格式）
- `button "导入"`、`button "导出"` 存在

**PASS**

### 3.3 5 个菜单面板可切换（逐个点击并断言对应内容）

按 `getByRole('button', { name: ... })` 精确 target 逐个点击（避免 strict mode 撞「待办任务」侧栏按钮+主页 stat-label 双匹配）：

| 菜单按钮 | 点击后主内容区断言 | 结果 |
|---------|-------------------|------|
| 🏠 主页（默认） | 统计卡片（待办 3 / 便签 3 / 倒计时 3 / 密码 🔒 解锁后可见）、「⏳即将到期倒计时」「☑️未完成待办」列表 | ✅ |
| ☑️ 待办任务 | 添加表单 + 筛选页签「全部 3 / 待办 2 / 已完成 1」+ 搜索框 + 3 条待办行（含高优先级徽章「高」、日期、编辑/删除） | ✅ |
| 📝 便签 | 「＋ 新增便签」按钮 + 便签卡片网格（含「📌 置顶」标记、内容、颜色标签） | ✅ |
| ⏳ 倒计时 | 添加表单 + 排序下拉（剩余时间 默认）+ 3 条倒计时（「还剩 1 天 2 小时」「还剩 1 天 9 小时」「已过期 1 天」+ 前台显示 checkbox） | ✅ |
| 🔑 密码管理 | 解锁表单（heading「输入主密码」+ 主密码输入 + 解锁按钮）→ 用 testpass123 解锁成功 → 工具栏（搜索密码 + 🔒 锁定 + ＋ 新增密码）+ 条目列表 | ✅ |

菜单激活态：每次点击后 snapshot 中对应按钮带 `[active]` 标记（如「☑️ 待办任务 [active]」）。

**PASS**（5/5 面板）

### 3.4 IDB 4 store 落库

`browser_evaluate` 传 `{"function": ...}`（open 'easy-web-tab' → 枚举 objectStoreNames + 各 store count）：

```json
{"stores":["countdowns","notes","passwords","todos"],"counts":{"countdowns":1,"notes":1,"passwords":1,"todos":1},"version":1}
```

- `objectStoreNames` 恰为 todos / notes / countdowns / passwords 4 个（DB version 1）
- 4 store 均有数据（count=1），与主页仪表盘统计（待办 3、便签 3、倒计时 3、密码已解锁）一致
- 无 console error（`browser_console_messages` level=error 返回 0 条；total 5 条均为 info）

**PASS**

### 3.5 导入导出入口 + 导出功能实测

- 头部「导入」「导出」按钮元素存在（见 3.2 snapshot）
- 导出实测：点击「导出」→ `waitForEvent('download')` 触发下载，文件 `工作台备份-2026-08-04.json`，内容 `JSON.parse` 断言：
  - `version: 1`、`exportedAt` 为字符串
  - storeKeys = `["countdowns","exportedAt","notes","passwords","todos","version"]`（4 store 全含）
  - `todos/notes/countdowns` 均为数组、`passwords` 为字符串（加密 blob 契约）

**PASS**

---

## 4. 综合结论

| 审计项 | 结果 |
|--------|------|
| 14 todo 勾选 + 14 证据文件 + 截图对应 | **PASS** |
| `npm run build` 最终状态零错误（exit 0） | **PASS** |
| /workbench 路由可访问（标题「个人工作台」） | **PASS** |
| 5 个菜单面板可切换（主页/待办/便签/倒计时/密码） | **PASS** |
| IDB 4 store 落库（todos/notes/countdowns/passwords, v1） | **PASS** |
| 导入导出入口存在 + 导出 JSON 结构正确 | **PASS** |

**F1 审计：全部 PASS。** 证据截图：`F1-workbench-unlocked.png`（密码面板解锁态 + 工作台整体渲染）。
