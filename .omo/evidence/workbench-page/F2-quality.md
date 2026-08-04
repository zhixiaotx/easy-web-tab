# F2 — Code Quality Review（最终代码质量审查）

日期：2026-08-04
审查范围基线：`fa58e5e`（首个工作台 commit `f53bbac feat-新增工作台类型定义` 的 parent）
审查范围：`git diff fa58e5e..HEAD`
审查方式：只读；git diff + grep + 行数统计 + `npm run build`（LSP 不可用替代，见下）

## 0. 审查范围界定

`git log --oneline fa58e5e..HEAD` 共 15 个 commit，全部为工作台功能 commit（无干扰 commit 需排除）：

```
2ca3d5b docs-更新AGENTS.md与README
3e14819 feat-工作台暗色模式样式
560843d feat-工作台主页仪表盘
348e402 feat-工作台密码管理面板
0eb921e feat-工作台倒计时面板
4cdba46 fix-倒计时删除DataCloneError
c0fd4a5 feat-工作台便签
d22dbb3 feat-工作台待办任务
89cc5bb feat-首页左上角增加工作台入口
08d1cce feat-新增工作台路由
f263645 feat-个人工作台页面框架
5797ad4 feat-密码库数据迁移到IndexedDB
3fadc9f feat-倒计时数据迁移到IndexedDB
9ea10a5 feat-IndexedDB数据层封装
f53bbac feat-新增工作台类型定义
```

`git diff --stat fa58e5e..HEAD`：34 文件，+4349/-82。源码改动文件清单（非 evidence/截图）：
`AGENTS.md`、`README.md`、`src/components/AGENTS.md`、`src/composables/AGENTS.md`、`src/stores/AGENTS.md`、`src/components/CountdownManager.vue`、`src/components/CountdownModal.vue`、`src/stores/countdowns.ts`、`src/stores/passwords.ts`、`src/stores/sites.ts`、`src/router/index.ts`、`src/views/DisplayView.vue`、`src/views/HomeView.vue`、`src/types/index.ts` + 新建 `useIdb.ts`、`workbenchTodos.ts`、`workbenchNotes.ts`、`WorkbenchView.vue`、`workbench/` 5 面板。未触碰：serve.json、Dockerfile、vite.config.js、server.cjs、pm2.config.cjs。

## 1. 逐项核验

### C1 无懒加载 — PASS

证据：`git diff fa58e5e..HEAD` 全文 Select-String 匹配 `defineAsyncComponent|\(\) => import` 零命中；全 `src/**/*.ts` + `src/**/*.vue` 再次扫描同样零命中。`src/router/index.ts` diff 为顶部并列的静态导入：

```diff
 import HomeView from '../views/HomeView.vue'
 import DisplayView from '../views/DisplayView.vue'
+import WorkbenchView from '../views/WorkbenchView.vue'
...
+    {
+      path: '/workbench',
+      name: 'workbench',
+      component: WorkbenchView
+    }
```

### C2 无新 npm 依赖 — PASS

证据：`git diff fa58e5e..HEAD -- package.json package-lock.json` 输出为空（零 diff）。

### C3 presetIcons.ts 未被编辑 — PASS

证据：`git diff fa58e5e..HEAD -- src/composables/presetIcons.ts` 输出为空。
注意（非 FAIL）：工作树中 `src/composables/presetIcons.ts` 有未提交改动，系 `npm run build` 时 `generate-preset-icons.cjs` 重新生成的产物（审查前即已存在，本次验证 build 再次生成），不属功能 commit 内容，未纳入 evidence commit。

### C4 保护文件零改动 — PASS

证据：`git diff fa58e5e..HEAD -- src/composables/countdownCore.ts src/composables/useCrypto.ts src/styles/dark.css` 输出为空——三个文件全部零改动（含 dark.css 的 CSS 变量与任何规则）。

### C5 sites.ts 改动仅限倒计时导入块 + importFromMarkdown 签名 async — PASS

证据（`git diff fa58e5e..HEAD -- src/stores/sites.ts` 全部 diff 行）：

1. 导入行：`-import type { Site, Countdown } from '../types'` → `+import type { Site } from '../types'`（`Countdown` 类型因直连块删除而不再需要，属同处改动）
2. `importFromMarkdown` 签名（原 :500）：
   ```diff
   -  function importFromMarkdown(markdownText: string): { added: number; skipped: number; passwordsImported?: number; error?: string } {
   +  async function importFromMarkdown(markdownText: string): Promise<{ added: number; skipped: number; passwordsImported?: number; error?: string }> {
   ```
   返回值形状不变，仅加 `async`/`Promise<>`。
3. 倒计时导入块（原 :523-543）：删除直连 `localStorage.getItem('user-countdowns')` / `setItem` 直读写与同步 `countdownsStore.loadCountdowns()` 调用，替换为：
   ```diff
   -    const existingRaw = localStorage.getItem('user-countdowns')
   -    const existingCountdowns: Countdown[] = existingRaw ? JSON.parse(existingRaw) : []
   -    const existingIds = new Set(existingCountdowns.map(c => c.id))
   -    let changed = false
   -    parsed.countdowns.forEach((countdown, index) => { ... localStorage.setItem ... })
   -    if (changed) { localStorage.setItem(...); countdownsStore.loadCountdowns() }
   +    const cdResult = await countdownsStore.importCountdowns(parsed.countdowns)
   +    console.log(`[Import] 倒计时：导入 ${cdResult.imported} 条，跳过 ${cdResult.skipped} 条`)
   ```
   （新增 console.log 位于倒计时导入块内部，属该块范围内；去重语义由新 store 方法 `importCountdowns` 承接，见 countdowns.ts diff。）
4. 除此之外 sites.ts 零改动——exportToMarkdown / loadSites / 站点/分类/引擎 CRUD 均未触碰；剩余全部 localStorage 引用仅限 `user-sites`/`site-click-counts`（无关工作台）。

对应调用点：`src/views/HomeView.vue:220` = `const result = await store.importFromMarkdown(content)`（onload 回调本就 async），与 plan :47/:48 约束一致。

### C6 CountdownModal.vue 改动仅限 :28 await — PASS

证据（`git diff fa58e5e..HEAD -- src/components/CountdownModal.vue` 全部 diff，仅 4 行）：

```diff
-onMounted(() => {
-  store.loadCountdowns()
+onMounted(async () => {
+  await store.loadCountdowns()
   window.addEventListener('keydown', handleKeydown)
 })
```

模板/样式/其余逻辑零改动。

### C7 新组件规范

- `<script setup lang="ts">`（6/6 新 SFC 第 1 行）— **PASS**（WorkbenchView.vue + workbench/ 下 5 面板均命中）。
- `@/` 别名 — **PARTIAL FAIL**：
  - **PASS**：5 个面板全部 import 使用 `@/` 别名（逐行核验：`@/stores/countdowns`、`@/stores/workbenchTodos`、`@/stores/workbenchNotes`、`@/stores/passwords`、`@/types` 等，零 `../`）。
  - **FAIL**：`src/views/WorkbenchView.vue` 有 10 处 `../` 相对导入（`:4-15`）：`../composables/useToast`、`../composables/useIdb`、`../stores/workbenchTodos`、`../stores/workbenchNotes`、`../types`、`../components/workbench/*`（5 面板）。同文件另混用 2 处 `@/`（`@/stores/countdowns`、`@/stores/passwords`）——风格不一致。
  - 背景说明：既有视图 HomeView.vue / DisplayView.vue 本身也大量使用 `../` 相对导入（如 `import type { Site } from '../types'`、`import SiteCard from '../components/SiteCard.vue'`），WorkbenchView 的相对导入实际沿用了视图层既有风格；但按 F2 约束字面（新增 .vue 一律 `@/`）判为 FAIL。判定不涉及功能正确性。

### C8 TS strict 无 any + 类型门

- 代码级：`Select-String` 扫描 `src/composables/useIdb.ts`、`src/stores/workbenchTodos.ts`、`src/stores/workbenchNotes.ts` 匹配 `as any|@ts-ignore|@ts-expect-error` 零命中 — **PASS**。
- lsp_diagnostics：**N/A** — typescript 与 vue LSP server 均未安装（用户此前拒绝安装），工具返回 "NOT INSTALLED; user previously declined installation"，无法产出诊断。
- 替代类型门（沿用 plan :61 既定质量门）：`npm run build`（`generate-preset-icons.cjs && vue-tsc -b && vite build`）**成功零错误**，`vue-tsc -b` 以 TS strict + noUnusedLocals + noUnusedParameters 覆盖全部新增 + 改动文件（sites/countdowns/passwords/workbenchTodos/workbenchNotes/useIdb/types/router + 全部 SFC）。构建输出：`dist/assets/index-Cj3nygZn.js`、`index-jdyVtXeM.css`。stderr 中的 "/backgrounds/preset-1.jpg ... didn't resolve at build time" 为既有背景图运行时解析警告，与工作台无关。— **PASS（经 build 门替代验证）**

### C9 无超大新文件 — FAIL（5 面板 + WorkbenchView 超限）

行数（`Get-Content ... | Measure` 与 git diff --stat insertions 一致）：

| 文件 | 行数 | 限额 | 判定 |
|------|------|------|------|
| `src/composables/useIdb.ts` | 108 | ≤150 | PASS |
| `src/stores/workbenchTodos.ts` | 131 | —（store 未限，128 行目标内） | PASS |
| `src/stores/workbenchNotes.ts` | 88 | — | PASS |
| `src/components/workbench/WorkbenchTodo.vue` | 628 | ≤300 | **FAIL** |
| `src/components/workbench/WorkbenchNotes.vue` | 583 | ≤300 | **FAIL** |
| `src/components/workbench/WorkbenchCountdown.vue` | 623 | ≤300 | **FAIL** |
| `src/components/workbench/WorkbenchPassword.vue` | 765 | ≤300 | **FAIL** |
| `src/components/workbench/WorkbenchHome.vue` | 474 | ≤300 | **FAIL** |
| `src/views/WorkbenchView.vue` | 418 | ≤250 | **FAIL** |

git diff --stat 佐证：WorkbenchPassword.vue +765、WorkbenchTodo.vue +629、WorkbenchCountdown.vue +626、WorkbenchNotes.vue +584、WorkbenchHome.vue +479、WorkbenchView.vue +423、useIdb.ts +108。

## 2. 附加核验（非 F2 列表项但已顺手确认）

- **countdowns.ts**（+87）：持久层切换 IndexedDB（`idbGet/idbPut('countdowns')`）；`saveCountdowns`/`loadCountdowns` 异步化；6 处内部 save 调用（ensureSortOrders/moveCountdown/setShowOnDisplay/addCountdown/updateCountdown/deleteCountdown）全部 await；`deleteCountdown` 与 `saveCountdowns` 均对 `toRaw()` 后写入（防 DataCloneError，4cdba46 修复点）；新增 `importCountdowns()` 承接 sites.md 倒计时导入语义；`STORAGE_KEY` 保留做一次性非破坏迁移；`loadSortPreference`/`persistSortPreference`/`SORT_STORAGE_KEY` 未动。`loadCountdowns` 全调用点（HomeView:76、DisplayView:25、CountdownModal:28、CountdownManager:51、WorkbenchView:72/:145）均 await（后两处位于 `Promise.all` 内）。
- **passwords.ts**（+31）：`loadPasswords` IDB 优先 + v2-gate 一次性迁移（`password-verification-v2` 缺失不复制，留给 migrateLegacyVault）；`savePasswords` → `idbPut`；`migrateLegacyVault`（:175-223）零改动，其 :200 直读 localStorage 有意保留。
- **DisplayView.vue**（+4）：仅 onMounted async + `await loadCountdowns()`，属 todo 3 调用点更新范围内。
- **CountdownManager.vue**（+14）：仅 onMounted/handleSave/handleDelete 处补 await（plan :49 允许）。
- **types/index.ts**（+41）：文件末尾纯追加工作台类型（WorkbenchTodo/WorkbenchNote/NOTE_COLORS/WORKBENCH_DATA_VERSION/WorkbenchData），既有接口零改动。
- **文档计数与磁盘一致**：根 `src/components/*.vue`=22、`workbench/*.vue`=5、`src/stores/*.ts`=10、`src/composables/*.ts`=13，与 AGENTS.md 所述一致。
- **工作树残留**（未提交、未纳入 evidence commit）：`M src/composables/presetIcons.ts`、`M tsconfig.tsbuildinfo`（build 再生成产物）、`?? F1-workbench-unlocked.png`（F1 截图）、`?? public/data/工作台备份-2026-08-04.json`（导出测试残留）。

## 3. 结论汇总

| 项 | 判定 |
|----|------|
| C1 无懒加载 | **PASS** |
| C2 无新 npm 依赖 | **PASS** |
| C3 presetIcons.ts 未被编辑 | **PASS** |
| C4 保护文件零改动（countdownCore/useCrypto/dark.css） | **PASS** |
| C5 sites.ts 改动仅限倒计时块 + importFromMarkdown async | **PASS** |
| C6 CountdownModal.vue 仅 :28 await | **PASS** |
| C7a 全部新 SFC `<script setup lang="ts">` | **PASS** |
| C7b 新 SFC 用 `@/` 别名 | **PARTIAL FAIL**（WorkbenchView.vue 10 处 `../`；5 面板全 `@/`） |
| C8a 新 .ts 无 as any/@ts-ignore/@ts-expect-error | **PASS** |
| C8b lsp_diagnostics | **N/A**（typescript/vue LSP 未安装）；以 `npm run build`（vue-tsc -b）替代，零错误 PASS |
| C9 文件行数上限 | **FAIL**（5 面板 474-765 行 > 300；WorkbenchView 418 > 250；useIdb 108 ≤ 150 PASS） |

发现的问题仅记录，按指示不修复：① C7b 相对导入（WorkbenchView.vue）；② C9 六个超大新文件。由编排器决定后续修复批次。
