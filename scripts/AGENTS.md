# scripts/ — Build & Serve Helpers

## OVERVIEW

4 helper scripts + 30 pure-function test runners (`node --experimental-strip-types`，其中 14 个学生 core 测试需 extensionless loader) + 1 Playwright UI QA。
一次性 Playwright QA 脚本（`qa-*.mjs` ×36）与已废弃的 IDB 版本校验脚本（`check-idb-v4/v8.ts`）已于开源清理中移除。

**关键：学生 core 测试（test:student-*）必须带 `--experimental-loader ./scripts/resolve-extensionless.mjs`**
（学生 cores 用无扩展名 `./countdownCore` 相对导入 + `@/` 别名，纯 `node --experimental-strip-types` 会
`ERR_MODULE_NOT_FOUND` / `ERR_UNSUPPORTED_DIR_IMPORT`）。

## STRUCTURE

```
scripts/
├── generate-preset-icons.cjs # Build-time: scans public/icons/ → generates src/composables/presetIcons.ts
├── serve-with-rewrites.cjs   # Custom HTTP server: serves dist/ + game rewrites + SPA fallback + WebDAV 代理（内置，端口 16718）
├── webdav-proxy-only.cjs     # 独立 WebDAV 同源代理（Nginx 静态托管时用，端口 16719；npm run webdav-proxy）
├── resolve-extensionless.mjs # Node 自定义 loader：解析无扩展名相对导入（`./countdownCore`）+ `@/` 别名 → 学生 core 测试运行必需
├── qa-student-ui.mjs         # Playwright UI QA：学生工作台 UI（npm run qa:student-ui）
├── test-countdown-core.ts    # countdownCore.ts（16 断言；npm run test:countdown）
├── test-reminder-core.ts     # reminderCore.ts（10 断言 T1-T10；npm run test:reminder）
├── test-todo-core.ts         # todoCore.ts（16 断言 T1-T16；npm run test:todo）
├── test-health-core.ts       # healthCore.ts（BMI 国标边界/达标率/睡眠时长/折线图坐标；npm run test:health）
├── test-ledger-core.ts       # ledgerCore.ts（32 断言 T1-T32；npm run test:ledger）
├── test-note-core.ts         # noteCore.ts（28 断言；npm run test:notes）
├── test-note-markdown.ts     # noteMarkdown.ts（18 断言 T1-T18；npm run test:note-markdown）
├── test-workbench-menu-core.ts # workbenchMenuCore.ts（18 断言 T1-T18；npm run test:menu）
├── test-diary-core.ts        # diaryCore.ts（15 断言/55 assertions；npm run test:diary）
├── test-panel-paging-core.ts # panelPagingCore.ts（20 断言 T1-T20；npm run test:paging）
├── test-business-core.ts     # businessCore.ts（24 断言 T1-T24；npm run test:business）
├── test-habit-core.ts        # habitCore.ts（15 断言/73 assertions；npm run test:habits）
├── test-pomodoro-core.ts     # pomodoroCore.ts（13 断言；npm run test:pomodoro）
├── test-spotlight-core.ts    # spotlightCore.ts（21 断言；npm run test:spotlight）
├── test-snapshot-core.ts     # snapshotCore.ts（10 断言；npm run test:snapshot）
├── test-student-menu-core.ts        # studentMenuCore（npm run test:student-menu）
├── test-student-habits-core.ts      # studentHabitsCore（npm run test:student-habits）
├── test-student-homework-core.ts    # studentHomeworkCore（npm run test:student-homework）
├── test-student-reward-core.ts      # studentRewardCore（npm run test:student-reward）
├── test-student-plan-core.ts        # studentPlanCore（npm run test:student-plan）
├── test-student-reading-core.ts     # studentReadingCore（npm run test:student-reading）
├── test-student-review-core.ts      # studentReviewCore（npm run test:student-review）
├── test-student-mistakes-core.ts    # studentMistakesCore（npm run test:student-mistakes）
├── test-student-timetable-core.ts   # studentTimetableCore（npm run test:student-timetable）
├── test-student-exam-core.ts        # studentExamCore（npm run test:student-exam）
├── test-student-stage-core.ts       # studentStageCore（npm run test:student-stage）
├── test-student-pomodoro-core.ts    # studentPomodoroCore（npm run test:student-pomodoro）
├── test-student-achievement-core.ts # studentAchievementCore（12 断言 T1-T11 + T2b；npm run test:student-achievement）
└── test-student-parenttask-core.ts  # studentParentTaskCore（9 断言；npm run test:student-parenttask）
```

## WHERE TO LOOK

| Task | Script | Notes |
|------|--------|-------|
| Regenerate preset icons | `generate-preset-icons.cjs` | Runs first in `npm run build`; also runnable standalone |
| Serve production build | `serve-with-rewrites.cjs` | `npm run serve`; PORT 16718 hardcoded |
| Add a game URL rewrite | `serve-with-rewrites.cjs` | if/else chain on `filePath`; redirects to trailing-slash for relative asset resolution |
| Nginx 静态托管下的云同步 | `webdav-proxy-only.cjs` | `npm run webdav-proxy`；端口 16719（可 `WEBDAV_PROXY_HOST`/`WEBDAV_PROXY_PORT` 覆盖）；Nginx 把 `/api/webdav-proxy` 反代到它，见 README「方式五」 |
| 核心纯函数测试 | `test-*-core.ts` | `node --experimental-strip-types` 直跑，自研 assert 断言；被测核心禁止 import vue/pinia |
| 学生 core 纯函数测试 | `test-student-*-core.ts` + `resolve-extensionless.mjs` | 14 个 `test:student-*`，每个都带 `--experimental-loader ./scripts/resolve-extensionless.mjs`；`npm run test:student` 聚合全部 |
| 学生工作台 UI QA | `qa-student-ui.mjs` | `npm run qa:student-ui`；需要 `playwright` 依赖与已安装的 chromium |

## CONVENTIONS

- `.cjs` = CommonJS — required because `package.json` has `"type": "module"`
- `serve-with-rewrites.cjs` / `webdav-proxy-only.cjs` 只用 Node stdlib — zero dependencies
- PORT 16718（页面）+ 16719（WebDAV 代理）hardcoded — keep in sync with vite.config.js, Dockerfile, run.bat, pm2.config.cjs
- **学生 core 测试 loader**: 全部 `test:student-*` 必须带 `--experimental-loader ./scripts/resolve-extensionless.mjs`（学生 cores 用无扩展名相对导入 `./countdownCore`/`./diaryCore`/`./habitCore`/`./studentMenuCore` + `@/` 别名；纯 `node --experimental-strip-types` 报 `ERR_MODULE_NOT_FOUND`/`ERR_UNSUPPORTED_DIR_IMPORT`）— `resolve-extensionless.mjs` 自解析 `.ts`/`/index.ts` + `@/` → `src/` 映射；勿改成带扩展名导入（那会被 Vite/真实运行时拒绝）

## ANTI-PATTERNS

- **NEVER edit `src/composables/presetIcons.ts` directly** — regenerate via `generate-preset-icons.cjs`
- **NEVER append `.html`** to game paths — rewrites map extensionless URLs to `/{game}/index.html`
- **gushi has no rewrite** — manifest.json registers it, but `serve-with-rewrites.cjs` lacks a `/games/gushi` entry (relative assets may break)
- **不要在 scripts/ 里加一次性 Playwright 脚本** — 历史上有 36 个 `qa-*.mjs`（约 577 KB），全部依赖 16718 dev server 且证据写进已删除的 `.omo/evidence/`，维护成本远大于收益，已整体移除。要做 UI 回归请写进 `tests/` 并接真正的 test runner

## KEY GOTCHAS

- `npm run serve` → custom server WITH game rewrites; `pm2 start` → `server.cjs` → `npx serve -s` (NO game rewrites) — divergent serving
- SPA fallback: unknown paths serve `dist/index.html` (single-page routing for /display etc.)
- Build pipeline: `node scripts/generate-preset-icons.cjs && vue-tsc -b && vite build` — icons must regenerate BEFORE type-check
- 本机内存紧张时构建需 `NODE_OPTIONS=--max-old-space-size=3072 npm run build`（默认会 OOM）
- `test-student-achievement-core.ts` 曾因内置勋章从 10 个扩到 26 个而失效——改 `studentAchievementCore.ts` 的
  `BUILTIN_ACHIEVEMENT_IDS` 后**必须同步更新该测试的期望值**（T1 长度 / T2 首条 name / T2b 分类分布 / T11 统计口径）
- `store/workbenchBusiness.saveBusiness()` 对商品/支出两个分类数组做 `toRaw().map(c => ({...toRaw(c)}))` 元素级深拷贝：
  `businessCore` 分类 CRUD 把 reactive 数组传入后经 `[...list, next]` / `list.map(...)` 返回新数组，元素仍是 Proxy——整体
  `toRaw` 只解外层、IDB structured clone 抛 `DataCloneError`；勿改回仅整体 `toRaw`
