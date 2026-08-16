import { test, expect, type Page } from '@playwright/test'

// ============================================================
// 工作台改进 接受测试（Wave 7，Todo 23）
// ------------------------------------------------------------
// 运行（需 app 服务在 http://localhost:16718，全新浏览器 profile）：
//   npx playwright test qa-workbench-improvements.spec.ts --reporter=list
//
// 覆盖范围：
//   a) 工作台菜单 10 项可达性：wb-menu-<key> 按钮 + 逐项点击 → 面板 testid 渲染
//   b) 番茄钟/习惯打卡渲染：pm-*/hb-* testid
//   c) Alt+K 全局搜索：打开/输入/结果/Enter 跳转 + Ctrl+Alt+1..9 菜单跳转 + 输入框内跳过
//   d) 普通字符输入不触发搜索（Alt+K 是唯一唤起键，见 useWorkbenchShortcuts.ts）
//   e) 侧栏折叠：wb-sidebar-toggle 点击折叠/展开，刷新后状态持久化（IDB settings）
//   f) 无背景图片（默认 none）时面板正常渲染不崩溃
//
// 菜单 10 项契约（workbenchMenuCore.MENU_DEFAULT_LABELS，逐字一致）：
//   home=主页 todos=工作待办 notes=个人便签 diary=日记本 countdowns=定时提醒 pomodoro=番茄钟
//   habits=习惯打卡 passwords=密码管理 health=健康管理 ledger=记账
//
// testid 说明（与真实 DOM 核对过）：
//   - 左菜单：`wb-menu-<key>`；折叠按钮 `wb-sidebar-toggle`（点击后 nav.wb-menu 加 .collapsed）
//   - 面板：主页 home-greeting / 待办 td-toolbar-count / 便签 nt-search-input /
//     日记 dj-date-input / 倒计时 cd-add-button / 番茄钟 pm-remaining / 习惯 hb-total-count /
//     密码 pwd-setup-input（全新 profile=设置主密码态）/ 健康 hd-tabs / 记账 ld-stat-income
//   - Spotlight：浮层 `sp-overlay`、输入 `sp-input`、结果 `sp-result-todo-<id>` /
//     `sp-result-note-<id>`（前缀 sp-result-），Enter 选中跳转、Esc 关闭
//   - 数据播种全部经 UI（待办 td-add-button/td-title-input/td-save-button，
//     便签 note-add-button/note-content-input/note-save-button）
// ============================================================

test.describe.configure({ mode: 'serial', timeout: 60_000 })

let page: Page

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  // 所有 confirm()（删除分类等）一律接受
  page.on('dialog', (d) => d.accept())
})

test.afterAll(async () => {
  await page?.close()
})

// 菜单 10 项契约（键序 + 默认标签逐字来自 workbenchMenuCore.MENU_DEFAULT_LABELS）
const MENU: ReadonlyArray<readonly [string, string]> = [
  ['home', '主页'],
  ['todos', '工作待办'],
  ['notes', '个人便签'],
  ['diary', '日记本'],
  ['countdowns', '定时提醒'],
  ['pomodoro', '番茄钟'],
  ['habits', '习惯打卡'],
  ['passwords', '密码管理'],
  ['health', '健康管理'],
  ['ledger', '记账']
]

const MENU_KEYS = MENU.map(([k]) => k)

// 面板渲染探针 testid（与各面板 data-testid 前缀约定核对过）
const PANEL_PROBE: ReadonlyArray<readonly [string, string]> = [
  ['home', 'home-greeting'],
  ['todos', 'td-toolbar-count'],
  ['notes', 'nt-search-input'],
  ['diary', 'dj-date-input'],
  ['countdowns', 'cd-add-button'],
  ['pomodoro', 'pm-remaining'],
  ['habits', 'hb-total-count'],
  ['passwords', 'pwd-setup-input'],
  ['health', 'hd-tabs'],
  ['ledger', 'ld-stat-income']
]

// ===== 流程 =====

test('1. 打开工作台：10 个菜单项可见，顺序与默认标签逐字正确', async () => {
  await page.goto('http://localhost:16718/workbench', { waitUntil: 'load' })

  // 菜单项（排除折叠按钮与底部的全局搜索入口）恰好 10 个
  const items = page.locator('[data-testid^="wb-menu-"]')
  await expect(items).toHaveCount(10)

  // 顺序 = 默认契约序
  const order = await items.evaluateAll((els) =>
    els.map((e) => (e.getAttribute('data-testid') ?? '').replace('wb-menu-', ''))
  )
  expect(order, `菜单顺序 ${JSON.stringify(order)} 应为 10 项契约序`).toEqual(MENU_KEYS)

  // 逐项标签（title 属性 = 全名，防 label 溢出截断误判）
  for (const [key, label] of MENU) {
    const btn = page.locator(`[data-testid="wb-menu-${key}"]`)
    await expect(btn).toBeVisible()
    await expect(btn).toHaveAttribute('title', label)
  }
})

test('2. 逐项点击 10 个菜单 → 对应面板渲染', async () => {
  const results: Array<{ key: string; probe: string; ok: boolean }> = []
  for (const [key, probe] of PANEL_PROBE) {
    await page.locator(`[data-testid="wb-menu-${key}"]`).click()
    const loc = page.locator(`[data-testid="${probe}"]`)
    let ok = true
    try {
      await expect(loc).toBeVisible()
    } catch {
      ok = false
    }
    results.push({ key, probe, ok })
  }
  const failed = results.filter((r) => !r.ok)
  expect(
    failed,
    `以下面板未渲染：${JSON.stringify(failed)}，全量：${JSON.stringify(results)}`
  ).toEqual([])
})

test('3. 番茄钟面板渲染：计时器 + 控制 + 今日统计 + 设置', async () => {
  await page.locator('[data-testid="wb-menu-pomodoro"]').click()
  const ids = [
    'pm-timer-ring',
    'pm-phase',
    'pm-remaining',
    'pm-start',
    'pm-pause',
    'pm-reset',
    'pm-today-count',
    'pm-settings-work',
    'pm-settings-break'
  ]
  for (const id of ids) {
    await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible()
  }
  await expect(page.locator('[data-testid="pm-remaining"]')).toContainText(/^\d{2}:\d{2}$/)
})

test('4. 习惯打卡渲染：统计 + 表单 + 空态；新增习惯并打卡', async () => {
  await page.locator('[data-testid="wb-menu-habits"]').click()
  for (const id of ['hb-total-count', 'hb-today-count', 'hb-week-count', 'hb-form-name', 'hb-form-frequency', 'hb-form-color', 'hb-add-btn']) {
    await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible()
  }
  // 全新 profile → 空态（习惯列表为空）
  await expect(page.locator('[data-testid="hb-empty"]')).toBeVisible()

  // 新增习惯 → 列表出现卡片
  await page.locator('[data-testid="hb-form-name"]').fill('每天喝水 8 杯')
  await page.locator('[data-testid="hb-add-btn"]').click()
  const card = page.locator('[data-testid^="hb-card-"]')
  await expect(card).toHaveCount(1)
  await expect(page.locator('[data-testid="hb-empty"]')).toHaveCount(0)

  // 今日打卡 → 卡片 is-checked + 今日统计更新
  await page.locator('[data-testid^="hb-check-"]').check()
  await expect(card.first()).toHaveClass(/is-checked/)
  await expect(page.locator('[data-testid="hb-today-count"]')).toContainText('1/1')
})

test('5. 播种可搜索数据：UI 新增待办「github 任务」+ 便签「github 便签」', async () => {
  await page.locator('[data-testid="wb-menu-todos"]').click()
  await page.locator('[data-testid="td-add-button"]').click()
  await expect(page.locator('[data-testid="td-dialog"]')).toBeVisible()
  await page.locator('[data-testid="td-title-input"]').fill('github 任务')
  await page.locator('[data-testid="td-save-button"]').click()
  await expect(page.locator('[data-testid="td-dialog"]')).toBeHidden()
  await expect(page.locator('[data-testid="td-item"]')).toHaveCount(1)

  await page.locator('[data-testid="wb-menu-notes"]').click()
  await page.locator('[data-testid="note-add-button"]').click()
  await expect(page.locator('[data-testid="note-overlay"]')).toBeVisible()
  await page.locator('[data-testid="note-content-input"]').fill('github 便签')
  await page.locator('[data-testid="note-save-button"]').click()
  await expect(page.locator('[data-testid="note-overlay"]')).toBeHidden()
  await expect(page.locator('[data-testid="note-card"]')).toHaveCount(1)
})

test('6. Alt+K 打开全局搜索：输入命中 → Enter 跳转待办面板', async () => {
  // 焦点移出输入框（点击菜单按钮，BUTTON 不是输入类目标）
  await page.locator('[data-testid="wb-menu-home"]').click()
  await page.keyboard.press('Alt+k')
  await expect(page.locator('[data-testid="sp-overlay"]')).toBeVisible()

  // 输入普通字符 → 结果列表更新（待办 + 便签均命中 'github'）
  await page.locator('[data-testid="sp-input"]').click()
  await page.keyboard.type('github')
  await expect(page.locator('[data-testid^="sp-result-todo-"]')).toBeVisible()
  await expect(page.locator('[data-testid^="sp-result-note-"]')).toBeVisible()
  const resultCount = await page.locator('.sp-results [data-testid^="sp-result-"]').count()
  expect(resultCount, `Alt+K 搜索 'github' 结果数=${resultCount} 应 ≥ 2`).toBeGreaterThanOrEqual(2)

  // ↑↓ 移动选中 + Enter 跳转 → 待办面板激活
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="wb-menu-todos"]')).toHaveClass(/active/)
  await expect(page.locator('[data-testid="td-toolbar-count"]')).toBeVisible()
})

// Ctrl+Alt+1..9 → 菜单第 1..9 项（useWorkbenchShortcuts 1-indexed：数字 n → menuKeys[n-1]）。
// 10 项菜单插入 diary（index 3）后：index 7=passwords、index 8=health、index 9=ledger，
// 快捷键仅覆盖前 9 项 → ledger 经快捷键不可达（第 10 项），故不再断言记账快捷键。
test('7. Ctrl+Alt+1..9 菜单跳转（焦点不在输入框）：8=密码 / 9=健康（ledger 第 10 项快捷键不可达）', async () => {
  // 确保焦点不在输入类元素（点菜单按钮 → BUTTON）
  await page.locator('[data-testid="wb-menu-home"]').click()
  await page.keyboard.press('Control+Alt+8')
  await expect(page.locator('[data-testid="pwd-setup-input"]')).toBeVisible()
  await expect(page.locator('[data-testid="wb-menu-passwords"]')).toHaveClass(/active/)

  await page.keyboard.press('Control+Alt+9')
  await expect(page.locator('[data-testid="hd-tabs"]')).toBeVisible()
  await expect(page.locator('[data-testid="wb-menu-health"]')).toHaveClass(/active/)
})

test('8. Alt+K 输入框内跳过（skip-input guard）→ 不打开浮层', async () => {
  await page.locator('[data-testid="wb-menu-todos"]').click()
  await page.locator('[data-testid="td-search-title"]').click() // 焦点在输入框内
  await page.keyboard.press('Alt+k')
  await expect(page.locator('[data-testid="sp-overlay"]')).toHaveCount(0)
})

test('9. 普通字符输入（无修饰键）不触发搜索', async () => {
  await page.locator('.wb-content').click() // 焦点回 body
  await page.keyboard.type('abc')
  await expect(page.locator('[data-testid="sp-overlay"]')).toHaveCount(0)
})

test('10. 侧栏折叠：点击折叠 → 再点展开 → 再折叠 → 刷新后状态持久化', async () => {
  const nav = page.locator('nav.wb-menu')
  await expect(nav).not.toHaveClass(/collapsed/)

  // 折叠
  await page.locator('[data-testid="wb-sidebar-toggle"]').click()
  await expect(nav).toHaveClass(/collapsed/)

  // 再点展开
  await page.locator('[data-testid="wb-sidebar-toggle"]').click()
  await expect(nav).not.toHaveClass(/collapsed/)

  // 再折叠（为刷新持久化做准备）；IDB persist 为 fire-and-forget，稍候再刷新
  await page.locator('[data-testid="wb-sidebar-toggle"]').click()
  await expect(nav).toHaveClass(/collapsed/)
  await page.waitForTimeout(600)

  // 刷新 → 折叠态自 IDB settings 恢复
  await page.goto('http://localhost:16718/workbench', { waitUntil: 'load' })
  await expect(page.locator('nav.wb-menu')).toHaveClass(/collapsed/)
})

test('11. 无背景图片（默认 none）：面板正常渲染不崩溃，布局不破', async () => {
  // 全新 profile 默认无背景（theme store backgroundType='none'，root 变量无内联覆盖）
  const bgType = await page.evaluate(
    () => getComputedStyle(document.documentElement).getPropertyValue('--app-bg-type').trim()
  )
  expect(bgType === 'none' || bgType === '', `--app-bg-type=${bgType} 应为 none/空`).toBe(true)

  // 无背景下逐面板渲染探针（不崩溃、面板可见）
  for (const [key, probe] of PANEL_PROBE) {
    await page.locator(`[data-testid="wb-menu-${key}"]`).click()
    await expect(page.locator(`[data-testid="${probe}"]`)).toBeVisible()
  }
})
