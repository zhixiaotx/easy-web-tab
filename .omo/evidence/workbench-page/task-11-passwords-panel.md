# T11 任务证据：工作台密码管理面板（WorkbenchPassword.vue）

- **日期**：2026-08-04
- **任务**：将 `src/components/workbench/WorkbenchPassword.vue` 从 T6 stub 替换为完整三态密码面板实现
- **挂载点**：`src/views/WorkbenchView.vue:15` import + `:208` `<WorkbenchPassword v-else />`（未改动，仅消费既有挂载）

---

## 1. 改动文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/components/workbench/WorkbenchPassword.vue` | 源文件（重写，stub → 完整实现） | 唯一改动的源码文件 |
| `.omo/evidence/workbench-page/task-11-passwords-panel.md` | 证据文件 | 本文件 |
| `.omo/evidence/workbench-page/workbench-password-dark.png` | QA 截图 | 暗色模式列表态截图 |

未改动：`src/stores/passwords.ts`、`src/composables/useCrypto.ts`、`WorkbenchView.vue`、路由、类型、任何其他源文件。未新增 npm 依赖。未使用 `as any` / `@ts-ignore` / `@ts-expect-error`。未调用 `loadPasswords()` / `exportEncryptedPasswords()` / `importPasswords()` / `migrateLegacyVault()`。无 onMounted 数据加载（解锁成功时 store 内部加载/解密）。

## 2. 实现要点

- **三态状态机**（复用共享 `usePasswordsStore`）：
  1. `!hasMasterPassword()` → 设置主密码表单（密码 + 确认，不一致提交提示「两次输入的密码不一致」，一致 `await setupMasterPassword(pwd)`）
  2. 有主密码但 `!isUnlocked` → 解锁表单（`await unlock(pwd)` 返回 false 提示「密码错误」）
  3. `isUnlocked` → 工具栏（搜索 + 🔒 锁定 + 「+ 新增密码」）+ 条目列表 + 新增/编辑共用表单
- **条目行**：siteName 粗体、url 可点击链接（target=_blank + noopener）、👁 显示/隐藏密码（隐藏显示 `••••••••`）、用户名/密码各一个复制按钮
- **复制**：与 `PasswordManager.vue:247-270` 一致 — `navigator.clipboard.writeText` + `show-toast` CustomEvent(detail: { type:'success', message })，catch 降级 textarea + `document.execCommand('copy')`
- **表单**：siteName/url/username/password 四字段全部必填（任一 trim 为空 → 保存按钮 disabled）；新增/编辑共用（编辑回填、保存走 updatePassword、新增走 addPassword）；取消关闭表单；删除需 `confirm('确定要删除这个密码条目吗？')` 后调 `deletePassword`
- **搜索**：本地 ref 绑定，computed 空则返回 `store.passwords`，否则 `store.searchPasswords(query)`
- **视觉**：亮色用全局 token（`--color-bg-card` / `--color-border` / `--color-text-secondary` / `--color-primary` 等 fallback），`:root.dark` 覆盖用 `--bg-secondary` / `--input-bg` / `--text-primary` / `--text-secondary` / `--border-color` / `--accent-color` / `--hover-bg`；面板根元素无 `position:fixed`（依赖 WorkbenchView `.wb-content` 滚动容器与背景）
- **data-testid**：`pwd-setup-input` / `pwd-setup-confirm` / `pwd-setup-submit` / `pwd-unlock-input` / `pwd-unlock-submit` / `pwd-auth-error` / `pwd-lock-btn` / `pwd-add-btn` / `pwd-search-input` / `pwd-form-site` / `pwd-form-url` / `pwd-form-username` / `pwd-form-password` / `pwd-save-btn` / `pwd-cancel-btn` / `pwd-empty` / `pwd-item` / `pwd-copy-username-<id>` / `pwd-copy-password-<id>` / `pwd-toggle-<id>` / `pwd-edit-<id>` / `pwd-delete-<id>`

## 3. Build 结果

命令：`npm run build`（`node scripts/generate-preset-icons.cjs && vue-tsc -b && vite build`）

```
Generated 14 icons -> src/composables/presetIcons.ts
vite v8.0.0 building client environment for production...
✓ 172 modules transformed.
dist/index.html                   0.47 kB │ gzip:  0.33 kB
dist/assets/index-DTQg_762.css  138.60 kB │ gzip:  18.23 kB
dist/assets/index-CNh9GZd4.js   372.95 kB │ gzip: 125.21 kB
✓ built in 738ms
```

**结果：通过（PASS）** — vue-tsc 严格模式（strict + noUnusedLocals + noUnusedParameters）零错误，vite build 成功。

## 4. Playwright QA 断言逐条结果

环境：共享 dev server `http://localhost:16718`（已有，未启动/停止）。Playwright 独立 profile（首次进入，localStorage 无 `password-verification-v2`）。主密码 `testpass123`，测试条目 `测试站点 / https://example.com / testuser / testpass123`。

| # | 断言 | 结果 |
|---|------|------|
| a | 导航 `http://localhost:16718/workbench` → 点击「🔑 密码管理」菜单 → 密码面板渲染 | ✅ PASS |
| b | 首次进入（无 `password-verification-v2`）→ 设置主密码表单出现（「设置主密码」标题 + 密码/确认两输入 + 设置按钮） | ✅ PASS |
| c | 输入不一致两次密码 → 提交 → 出现「两次输入的密码不一致」且仍在设置态（标题/输入保留） | ✅ PASS |
| d | 输入一致密码 → 提交 → 进入列表态（工具栏出现：搜索框 + 🔒 锁定 + 「+ 新增密码」），空态「暂无保存的密码」 | ✅ PASS |
| e | 新增条目（测试站点/https://example.com/testuser/testpass123）→ 条目行出现（siteName 粗体、url 链接、👤 testuser、🔑 ••••••••） | ✅ PASS |
| f | 点击「🔒 锁定」→ 回到解锁态（「输入主密码」表单，非设置态） | ✅ PASS |
| g | 输入错误密码 → 提交 → 出现「密码错误」且仍在解锁态（输入保留） | ✅ PASS |
| h | 输入正确密码 → 提交 → 条目恢复可见 | ✅ PASS |
| i | 刷新页面 → 仍需要解锁（主密码验证 localStorage 持久化、isUnlocked 内存态重置）→ 正确密码 → 条目仍在；`page.evaluate` 直读 IDB `easy-web-tab` → store `passwords` → key `items` 有加密记录（string，305 字符） | ✅ PASS |
| j | 空字段（四个输入全空）时保存按钮 disabled | ✅ PASS |
| k | 暗色模式（`document.documentElement.classList.add('dark')`）下列表态截图存至 `.omo/evidence/workbench-page/workbench-password-dark.png`；computeStyle 复核无白底：`.pwd-item` bg `#1f2937`、`.pwd-site-name` color `#f9fafb`、`.pwd-search` bg `#374151`、`.pwd-btn-lock` bg `#1f2937`/color `#d1d5db`（均非白底、文本对比可读） | ✅ PASS |
| l | 复制密码按钮（🔐）点击执行无异常、无 console error，`show-toast` 事件触发后 toast 元素出现在 DOM（自动消失属预期）；Playwright 环境剪贴板权限未受限，未阻塞 | ✅ PASS |
| 附加 | 👁 显示/隐藏：点击后 `.pwd-masked` 显示明文 `testpass123`，再点恢复 `••••••••` | ✅ PASS |
| 附加 | 搜索：`zzzz-no-match` → 空态「没有找到匹配的密码」且条目数为 0；`测试站点` → 命中 1 条 | ✅ PASS |

### 说明

- 控制台唯一 error 来自 QA 阶段一次探测性 `indexedDB.open('passwords')`（错误 DB 名）调用，非应用代码产生；修正为 `easy-web-tab` + key `items` 后读取成功。
- 测试主密码与条目仅存在于 Playwright 独立 profile，不影响用户真实浏览器数据。

## 5. 验收结论

**通过** — 三态状态机、CRUD、搜索、复制、暗色适配、IDB 持久化全部按 T11 规格实现并通过 Playwright 逐条验证；`npm run build` 零错误；改动范围严格限定于 1 个源文件 + 1 个证据文件 + 1 张截图。
