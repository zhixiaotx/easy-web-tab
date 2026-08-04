# F4 — Scope Fidelity（guardrail 逐条验证）

- 日期：2026-08-04
- 基线：`fa58e5e`（首个工作台 commit `f53bbac` 的 parent）
- HEAD：`6b5d1f6`（含 16 个工作台 commit）
- 计划依据：`.omo/plans/workbench-page.md` 的 Scope 章节（:23-57）与 F4 任务定义（:215-217）
- 结论：**全部 Must have（15 项）与 Must NOT have（15 项）PASS**，零 FAIL

---

## 一、Scope Must have 逐条验证

| # | 条目 | 结果 | 证据 |
|---|------|------|------|
| M1 | 入口按钮「🧰 个人工作台」加入 HomeView 左上角工具栏，点击跳转 /workbench（eager） | **PASS** | `git diff fa58e5e..HEAD -- src/views/HomeView.vue` hunk `@@ -293,6 +293,7 @@`（:294-297 区域）：`.top-left-toolbar` 内、⚙️ 之前新增 `<button class="btn-help" @click="router.push('/workbench')" title="个人工作台">🧰 个人工作台</button>`；路由在 `src/router/index.ts` 静态 import（见 M 验证） |
| M2 | WorkbenchView 外壳：头部左=← 返回+标题「个人工作台」；右=实时时钟+导入/导出+隐藏 JSON 文件输入 | **PASS** | 新文件 `src/views/WorkbenchView.vue`（423 行，diff stat 新增）。Playwright 快照：`button "← 返回"` + `heading "个人工作台"`；时钟 `2026-08-04 13:07:17 星期二`（每秒更新）；`button "导入"` + `button "导出"` |
| M3 | 左右分栏：左 5 菜单（主页🏠/待办任务☑️/便签📝/倒计时⏳/密码管理🔑）激活高亮；右内容区按菜单切换 | **PASS** | Playwright 快照 `navigation` 下 5 个按钮逐一存在，`main` 内容区渲染主页仪表盘；browser_evaluate 断言 `activeSection: true`、`menuItems` 5 项；点击「⏳ 倒计时」后 `.wb-menu .active` 变为「⏳\n倒计时」，右侧渲染倒计时面板（含「每年重复/添加/剩余时间/前台显示/编辑/删除/已过期 1 天」等中文文案） |
| M4 | IndexedDB 数据层 useIdb.ts（零新依赖）：DB `easy-web-tab` v1，4 store（todos/notes/countdowns/passwords）out-of-line 键 `'items'`；openIdb/idbGet/idbPut/idbClear/idbExportAll/idbImportAll | **PASS** | 新文件 `src/composables/useIdb.ts`（108 行 ≤150 目标）。grep：`:9 export const DB_NAME = 'easy-web-tab'`、`:10 DB_VERSION = 1`、`:11 IDB_STORES = ['todos','notes','countdowns','passwords'] as const`、`:12 IDB_KEY = 'items'`、`:18 openIdb`、`:44 idbGet`、`:51 idbPut`、`:59 idbClear`、`:67 idbExportAll`、`:84 idbImportAll`（单事务 clear+put，:97-101）。`package.json`/`package-lock.json` 零 diff → 零新依赖 |
| M5 | JSON 导出导入：导出打包 4 store 为 `{version, exportedAt, ...}` 下载 `工作台备份-YYYY-MM-DD.json`；导入校验+confirm+清空重写+重载+toast | **PASS** | WorkbenchView.vue 实现（导出/导入分支含密码跨设备跳过逻辑）；功能级证据见 task-6-shell.md（导出下载含 `"version": 1`、导入双分支 toast）。F4 运行时：头部「导入」「导出」按钮渲染正常 |
| M6 | countdowns store 重构：localStorage → IDB，一次性非破坏迁移；loadCountdowns 异步化，5 调用点全 await；sites.ts 直连块替换为 importCountdowns() | **PASS** | `git diff fa58e5e..HEAD -- src/stores/countdowns.ts`：`saveCountdowns` async + `idbPut`（try/catch console.error）；`loadCountdowns` async，IDB 空 + `user-countdowns` 存在 → 复制到 IDB（:46-48，localStorage 保留不删）；6 处内部保存全 await（ensureSortOrders/moveCountdown/setShowOnDisplay/add/update/delete）；新增 `importCountdowns()`（id 去重、`cd_${Date.now()}_${index}`、只追加、返回 {imported, skipped}）。调用点：HomeView:76 ✓、DisplayView:25 ✓、CountdownModal:28 ✓、CountdownManager:51 ✓、sites.ts 原 :541 已替换为 importCountdowns（见 N4）✓；WorkbenchView:72/:145 均在 `await Promise.all` 内 ✓ |
| M7 | passwords store 重构：localStorage → IDB，迁移仅 v2 验证存在时；password-salt-v2/password-verification-v2/user-countdown-sort 仍留 localStorage | **PASS** | `git diff fa58e5e..HEAD -- src/stores/passwords.ts` 仅 3 个 hunk（import/loadPasswords/savePasswords）：loadPasswords 先 `idbGet('passwords')`，undefined 且 `user-passwords` 存在 **且** `password-verification-v2` 存在才迁移（v2-gate，:34）；savePasswords 改 `idbPut`。migrateLegacyVault（:175-223，含 :200 v2 检查、:223 直读 user-passwords）**零改动**（不在 diff）。保护键 grep 见 N2 |
| M8 | 待办任务（workbenchTodos.ts + WorkbenchTodo.vue）完整增删改查 | **PASS** | 新文件 `src/stores/workbenchTodos.ts`（131 行）+ `src/components/workbench/WorkbenchTodo.vue`（629 行）；功能证据 task-8-todos.md |
| M9 | 便签（workbenchNotes.ts + WorkbenchNotes.vue）增删改查+颜色+置顶 | **PASS** | 新文件 `src/stores/workbenchNotes.ts`（88 行）+ `src/components/workbench/WorkbenchNotes.vue`（584 行）；功能证据 task-9-notes.md |
| M10 | 倒计时面板（WorkbenchCountdown.vue）复用共享 store + calcRemaining/sortCountdowns | **PASS** | 新文件 626 行；F4 运行时面板渲染共享数据（「未来倒计时/主页QA倒计时/过期测试倒计时」「还剩 21 小时 22 分」「已过期 1 天」）与 5 种排序模式下拉；功能证据 task-10-countdown-panel.md |
| M11 | 密码面板（WorkbenchPassword.vue）设置/解锁/增删改/复制；无旧版迁移 UI | **PASS** | 新文件 765 行；F4 运行时主页密码卡片锁定态显示「🔒 解锁后可见」「未解锁」；功能证据 task-11-passwords-panel.md |
| M12 | 主页仪表盘（WorkbenchHome.vue）统计卡片+即将到期+未完成待办+快捷入口 | **PASS** | 新文件 479 行；F4 快照：统计卡「待办任务 3 / 2 未完成 · 0 已逾期」「便签 3 / 2 置顶」「倒计时 3 / 2 项 30 天内到期」「密码 🔒 解锁后可见」+「⏳即将到期倒计时」「☑️未完成待办」列表 + 各「前往 →」按钮 |
| M13 | 全部新 UI 暗色模式（scoped :root.dark 覆盖） | **PASS** | task-13-darkmode.md + 7 张暗色截图（view/home/todos/notes/notes-overlay/countdowns/passwords）；新 SFC 均使用 `var(--bg-*)/var(--text-*)` token 与 `:root.dark` 覆盖（沿用 DisplayView.vue:199-215 模式） |
| M14 | AGENTS.md 层级更新 + README 数据存储/清除说明 | **PASS** | diff stat：`AGENTS.md +26`、`src/components/AGENTS.md +12`、`src/stores/AGENTS.md +24`、`src/composables/AGENTS.md +5`、`README.md +7`；README 已含 IndexedDB 混合存储、F12 清除 IndexedDB、陈旧快照脚枪、跨设备密码不可恢复说明（task-14-agents.md 证据） |
| M15 | 现有弹窗组件行为不变，仅随 store 持久层切换自动用 IDB 数据 | **PASS** | `PasswordManager.vue` 在 diff name-only 列表中零命中；`CountdownModal.vue` 仅 onMounted 加 await（N5）；`CountdownManager.vue` 仅 onMounted/handleSave/handleDelete 处 await（脚本层，模板/样式零改动） |

## 二、Scope Must NOT have 逐条验证

| # | 条目 | 结果 | 证据 |
|---|------|------|------|
| N1 | 不删除/不修改任何遗留 localStorage 数据（user-countdowns、user-passwords、user-sites 等） | **PASS** | grep：`countdowns.ts:16 STORAGE_KEY='user-countdowns'` 仍在 :46-48 读取（迁移源）；`passwords.ts:15 STORAGE_KEY='user-passwords'` 仍在 :34（v2-gate 迁移源）与 :223（migrateLegacyVault 直读）读取。全 src grep `localStorage.removeItem`：**无任何代码删除这 3 个 key**（唯一相关是 migrateLegacyVault 删除 v1 旧键 `password-verification`/`password-salt`——:226/:239/:240，属基线既有流程，passwords.ts 该区域零 diff）。全 src grep `setItem('user-countdowns'|'user-passwords'`：**零命中**——不再写入（写入已全部走 IDB），旧数据原样保留只读 |
| N2 | 不动 password-salt-v2 / password-verification-v2 / user-countdown-sort（留 localStorage） | **PASS** | `src/composables/useCrypto.ts` **零 diff**（`SALT_KEY='password-salt-v2'` :8、`VERIFICATION_KEY='password-verification-v2'` :9 原样）；passwords.ts :34/:200 仍读 `password-verification-v2`；countdowns.ts `SORT_STORAGE_KEY='user-countdown-sort'` :17 + `loadSortPreference` :58-62（读）+ `persistSortPreference` :75-76（写）未出现在 countdowns.ts 任何 diff hunk（hunk 仅覆盖 imports/save/load/mutations/importCountdowns/return 区域） |
| N3 | 不改 useCrypto.ts、countdownCore.ts、sites.ts 的 markdown 导入导出格式 | **PASS** | `git diff fa58e5e..HEAD -- src/composables/useCrypto.ts src/composables/countdownCore.ts` 输出为空（EXIT_CODE=0）；sites.ts 的 parse/exportToMarkdown/loadSites 区域零改动（见 N4） |
| N4 | sites.ts 改动仅限两处：倒计时导入块替换为 importCountdowns() + importFromMarkdown 签名 async | **PASS** | `git diff fa58e5e..HEAD -- src/stores/sites.ts` 仅 3 个 hunk：① `import type { Site, Countdown }` → `import type { Site }`（Countdown 仅旧块使用）；② :500 `function importFromMarkdown(...)` → `async function importFromMarkdown(...): Promise<{...}>`（:497 区域）；③ :523-543 直连 localStorage 块整体替换为 `const cdResult = await countdownsStore.importCountdowns(parsed.countdowns)` + console.log（删除 getItem/setItem/同步 loadCountdowns）。其余（exportToMarkdown、loadSites、站点/分类/引擎 CRUD）零改动 |
| N5 | CountdownModal.vue 仅 :28 为 loadCountdowns() 加 await | **PASS** | diff 仅 4 行：`onMounted(() => { store.loadCountdowns() ... })` → `onMounted(async () => { await store.loadCountdowns() ... })`（新文件 :27-28）；模板/样式/其余逻辑零改动 |
| N6 | importFromMarkdown 返回值形状 `{added, skipped, passwordsImported?, error?}` 不变 | **PASS** | 签名保留完整字段形状，仅包装为 `Promise<...>`；toast 计数逻辑零改动（diff 中 handleImport 的 result.error/计数代码未动，HomeView:220 仅加 `await`） |
| N7 | 不修改现有弹窗组件模板与样式，只允许 onMounted/handler 处 await | **PASS** | PasswordManager.vue 零 diff；CountdownModal.vue 仅 onMounted；CountdownManager.vue 仅 onMounted + handleSave/handleDelete 函数体 await（:51/:107-109/:116），模板与样式零改动 |
| N8 | 不编辑 src/composables/presetIcons.ts | **PASS** | 零 diff（git diff name-only 无此文件；F2 亦核验） |
| N9 | 不使用懒加载 / 路由级代码分割（eager） | **PASS** | 全 src（`src\**\*.ts` + `src\**\*.vue`）grep `defineAsyncComponent` / `() => import(` **零命中**；`import(` 唯一命中是 `function handleImport(event)`（函数名，误报）。router/index.ts diff 为静态 `import WorkbenchView from '../views/WorkbenchView.vue'` |
| N10 | 不引入测试框架 | **PASS** | diff name-only 无 `.test.`/`.spec.`/vitest/jest/cypress 文件；package.json 零 diff（脚本无 test 条目变更） |
| N11 | 不做浏览器页签管理 / iframe 嵌入 | **PASS** | 全 src grep `<iframe` **零命中**；新组件均为 SPA 面板（v-if 切换） |
| N12 | 不修改 sites.ts 其余逻辑；不修 HomeView.vue:220 缺失 await 的既有问题（越界） | **PASS** | sites.ts 仅 N4 所述两区域；HomeView.vue diff 仅 3 处：:76 onMounted await loadCountdowns（必需调用点）、:220 `await store.importFromMarkdown(content)`（计划明确要求的对应改动，属 N6 签名异步化的必需伴随修改，非越界修复）、:294 入口按钮 |
| N13 | 不新增任何 npm 依赖 | **PASS** | `git diff fa58e5e..HEAD -- package.json package-lock.json` 输出为空（EXIT_CODE=0） |
| N14 | IDB 完全不可用时不做 localStorage 回退写 | **PASS** | countdowns.ts `saveCountdowns`：`try { await idbPut(...) } catch (e) { console.error('[Countdowns] save failed', e) }`；`loadCountdowns` 失败 → console.error + `stored = undefined`（迁移块内 put 失败同样仅 console.error）。passwords.ts `savePasswords`/迁移 put 同模式。全仓库无「IDB 失败 → localStorage.setItem 兜底写」代码 |
| N15 | 脚枪（只清 IDB 而 localStorage 有陈旧快照会重新迁移）写进 README | **PASS** | README diff +7 行，含「只清 IndexedDB 时，若 Local storage 仍残留旧快照（`user-countdowns`/`user-passwords`），下次启动会从这些陈旧快照重新迁移出旧数据，需要一并清除」；「多浏览器迁移提示：导出不含密码加密密钥」亦在 |

## 三、F4 任务指定 guardrail（计划 :216）专项

| guardrail | 结果 | 证据 |
|-----------|------|------|
| localStorage 旧 key 未被删除（user-countdowns/user-passwords 仍被代码读取） | **PASS** | 见 N1：countdowns.ts:46-48 读取 user-countdowns；passwords.ts:34/:223 读取 user-passwords；无 removeItem/setItem 触碰；仓库无删除这些 key 的代码 |
| 保护键未动（password-salt-v2/password-verification-v2/user-countdown-sort 与基线一致） | **PASS** | 见 N2：useCrypto.ts 零 diff；password-verification-v2 读点 :34/:200 原样；user-countdown-sort 读写 :60/:76 原样（不在 diff hunk） |
| sites.ts 改动仅限倒计时导入块 + importFromMarkdown 签名 async | **PASS** | 见 N4：diff 仅 3 个 hunk，全部落在两区域 |
| CountdownModal.vue 仅加 await | **PASS** | 见 N5：仅 onMounted async/await（4 行 diff） |
| 无懒加载引入 | **PASS** | 见 N9：defineAsyncComponent / `() => import(` 零命中；router eager |
| 无新依赖 | **PASS** | 见 N13：package.json/package-lock.json 零 diff |
| 无越界修改：serve.json / Dockerfile / vite.config.js / server.cjs / pm2.config.cjs / run.bat / start-pm2.ps1 | **PASS** | `git diff fa58e5e..HEAD -- serve.json Dockerfile vite.config.js server.cjs pm2.config.cjs run.bat start-pm2.ps1` 输出为空（EXIT_CODE=0）——7 个文件在 diff 中零改动 |
| 中文 UI（产品语言） | **PASS** | Playwright（dev server http://localhost:16718，未重启）：导航 /workbench → 标题「个人工作台」、按钮「← 返回」「导入」「导出」、5 菜单「🏠 主页 / ☑️ 待办任务 / 📝 便签 / ⏳ 倒计时 / 🔑 密码管理」、时钟「2026-08-04 13:07:17 星期二」、仪表盘中文统计文案，全部中文。browser_evaluate 11/11 断言通过（title/backBtn/clock/importBtn/exportBtn/menuHome/menuTodos/menuNotes/menuCountdown/menuPassword/activeSection）；点击「⏳ 倒计时」切换成功（active=「⏳\n倒计时」，面板含「每年重复/前台显示/已过期 1 天」中文）；控制台 0 error 0 warning；截图 `.omo/evidence/workbench-page/F4-scope-workbench.png` |

## 四、附：loadCountdowns 5 调用点 await（Metis 核验点）

| 调用点 | 结果 |
|--------|------|
| `src/views/HomeView.vue:76` | `await countdownsStore.loadCountdowns()` ✓ |
| `src/views/DisplayView.vue:25` | `await countdownsStore.loadCountdowns()` ✓ |
| `src/components/CountdownModal.vue:28` | `await store.loadCountdowns()` ✓ |
| `src/components/CountdownManager.vue:51` | `await store.loadCountdowns()` ✓ |
| 原 `sites.ts:541`（同步调用） | 已随直连块删除，由 `await countdownsStore.importCountdowns(...)` 取代 ✓ |
| （新增）`WorkbenchView.vue:72/:145` | 均在 `await Promise.all([...])` 内 ✓ |

## 五、结论

Scope Must have 15/15 PASS、Must NOT have 15/15 PASS、F4 专项 guardrail 8/8 PASS。无 FAIL 项，无越界修改，无需修复建议。
