# F3 — 手动 QA 验收（8 步用户旅程端到端验证）

日期：2026-08-04
范围：`.omo/plans/workbench-page.md` 的「F3 — 手动QA」8 步旅程
方式：Playwright MCP 真实浏览器操作（http://localhost:16718，Vite dev server）+ 截图存证；断言含 DOM 文本、computed style、IndexedDB 计数
环境：Windows + Chrome（Playwright MCP 持久 profile）；种子数据 3 待办 / 3 便签 / 3 倒计时 / 1 密码（主密码 `testpass123`）
结论：**8/8 步全部 PASS**（含 1 项非阻塞观察项，见 Step 8）

截图共 22 张，全部存于 `.omo/evidence/workbench-page/F3-step*.png`。

---

## Step 1 — 入口跳转 PASS

- 首页（`/`）可见「🧰 个人工作台」入口按钮 → 点击 → URL 变为 `http://localhost:16718/workbench`。
- 仪表盘统计：待办 3（2 未完成 · 0 逾期）、便签 3（2 置顶）、倒计时 3（2 项在 30 天内）、密码 🔒（锁定态）。
- 截图：`F3-step1-home-entry.png`（入口）、`F3-step1-dashboard.png`（仪表盘）。

## Step 2 — 待办 CRUD PASS

- 新增「F3待办-逾期验证」（高优先级，截止 2026-08-03，早于今天 2026-08-04）→ 卡片出现红色「已逾期」徽章（computed：背景 `rgb(239,68,68)`，文字白色）。
- 勾选完成 → 该条移入「已完成」页签；「全部 4 / 待办 2 / 已完成 2」计数正确。
- 编辑标题为「F3待办-逾期验证已编辑」→ 列表即时更新（编辑生效）。
- 筛选页签切换正常（全部/待办/已完成）。
- 删除（确认框确认）→ 卡片消失，计数回「全部 3 / 待办 2 / 已完成 1」（种子状态复原）。
- 截图：`F3-step2-todo-overdue-added.png`、`F3-step2-todo-after-delete.png`。

## Step 3 — 便签 PASS

- 新增「F3便签-蓝色验证」（内容「F3QA新增蓝色便签内容」，蓝色）→ 卡片 `note-blue` 类生效（computed 背景 `rgb(219,234,254)`）。
- 置顶 → 卡片移至列表最前且带「📌 置顶」徽标（`is-pinned` 类）。
- 编辑内容为「F3QA便签内容已编辑（编辑生效验证）」并换粉色 → `note-pink` 背景 `rgb(252,231,243)`、新内容即时显示。
- 删除（确认）→ 卡片消失。
- 截图：`F3-step3-note-added-blue.png`、`F3-step3-note-edited-pink.png`。

## Step 4 — 倒计时（含前台共享）PASS

- 新增「F3倒计时-共享验证」（2026-08-05 18:00，勾选「前台显示」）→ 列表出现，剩余时间 label「还剩 1 天 4 小时」。
- 排序切至「名称」→ 顺序变化，使「过期测试倒计时」居首（排序生效）。
- 导航 `/display` → 点击 ⏳ 弹窗 → 可见「F3倒计时-共享验证」（前台共享断言 PASS）。
- 返回工作台删除该倒计时（确认）→ 消失；期间误删了种子「主页QA倒计时」，已即时重建（同名、同时间 2026-08-05 18:00）复原数据。
- 截图：`F3-step4-countdown-added.png`、`F3-step4-countdown-sorted-by-name.png`、`F3-step4-display-popup-shared.png`。

## Step 5 — 密码 PASS

- 锁定态输入错误密码 `wrongpass` → 提示「密码错误」，保持锁定（不进入）。
- 输入正确主密码 `testpass123` → 解锁成功，可见「测试站点」。
- 新增「F3QA站点」（`https://f3-qa.example.com`、`f3user`、`S3cret!P@ss`）→ 保存后列表可见。
- 复制校验：点 📋 复制用户名、🔐 复制密码；因 `navigator.clipboard.readText` 权限受限，用 `window.__spy` 包装 `navigator.clipboard.writeText` 捕获 → spy 记录为 `S3cret!P@ss`（复制功能 PASS）。
- 重新锁定 → 再解锁 → 删除「F3QA站点」（确认）→ 再锁定。
- 截图：`F3-step5-wrong-password.png`、`F3-step5-unlocked.png`、`F3-step5-copy-password.png`。

## Step 6 — 导出 → 清空 → 导入 PASS

- 导出：点「导出」→ 浏览器下载 `工作台备份-2026-08-04.json`（落盘 `.playwright-mcp\`）。内容校验：`version: 1`、`exportedAt` 时间戳、todos 3 / notes 3 / countdowns 3（含 `endDateTime`、`repeat`、`sortOrder` 字段）、passwords 1（加密对象，非明文）。
- 清空：页面内 `indexedDB.deleteDatabase('easy-web-tab')` 在普通页面抛 `SecurityError`（opaque origin 限制），改用 CDP `Storage.clearDataForOrigin {origin:'http://localhost:16718', storageTypes:'indexeddb'}` → reload → 仪表盘 全部 0/0/0；IDB 计数 `{todos:0, notes:0, countdowns:0, passwords:0}`（清空生效）。
- 导入：`browser_file_upload` 上传同一 JSON 备份 → 仪表盘恢复 待办 3 / 便签 3 / 倒计时 3；IDB 4 个 store 均有记录（todos/notes/countdowns 各 1 条数组记录 `array(3)`，passwords 1 条加密对象）；`testpass123` 解锁可见「测试站点」（密码恢复）。
- 截图：`F3-step6-cleared-idb.png`、`F3-step6-import-restored-pwd.png`。

## Step 7 — 刷新持久化 PASS

- 导入恢复后刷新页面 → 仪表盘仍为 待办 3 / 便签 3 / 倒计时 3；IDB 4 store 记录均在（`{todos:1, notes:1, countdowns:1, passwords:1}`，各 store 内含数组/对象记录）。
- 截图：`F3-step7-reload-persisted.png`。

## Step 8 — 暗色模式 6 视图 PASS（附 1 项观察）

- 注入 `document.documentElement.classList.add('dark')`。
- computed 校验暗色生效：html 背景 `rgb(31,41,55)`（gray-800）、主内容背景 `rgb(17,24,39)`（gray-900）、正文文字 `rgb(249,250,251)`（gray-50）。
- 6 视图全量截图（`F3-step8-dark-view/home/todos/notes/countdowns/passwords.png`）。
- 程序化目检（本模型不支持图像输入，改用 alpha 合成 computed-style 审计替代肉眼审查；已截图供人工复核）：
  - 全站扫描可见元素：**0 个近白背景**（亮度 > 0.88）、**0 处低对比文本**（对比度 < 2.2，alpha 正确合成到最终底色）。
  - 唯一命中项（记录为观察，非 FAIL）：主页 4 个统计卡标题图标（☑️📝⏳🔑，父元素 `stat-header`）computed `color` 为 `rgb(30,41,59)`（深色），未随暗色切换；但 4 个码点均为 emoji 呈现（U+2611/1F4DD/23F3/1F511 带 VS16），Windows Chrome 下由 Segoe UI Emoji 彩色字形渲染，暗底上仍清晰可读。若将来更换字体/系统可能导致不可见，建议后续补 `dark` 下图标颜色变量。
- 截图：`F3-step8-dark-view.png`、`F3-step8-dark-home.png`、`F3-step8-dark-todos.png`、`F3-step8-dark-notes.png`、`F3-step8-dark-countdowns.png`、`F3-step8-dark-passwords.png`。

---

## 收尾

- F3 新增数据已全部删除，Playwright profile 数据复原为种子（3/3/3/1）。
- 全程未修改任何源码文件；未触碰 `presetIcons.ts` / `tsconfig.tsbuildinfo` / `dist` / `node_modules` / `public/data` 下文件。
- 产物：本文件 + 22 张截图，经 `git add -f` 纳入 evidence 提交。
