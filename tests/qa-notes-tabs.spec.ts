import { test, expect, type Locator, type Page } from '@playwright/test'

// ============================================================
// 便签分类 tabs 接受测试（恢复的分类 tabs 功能）
// ------------------------------------------------------------
// 运行（需 app 服务在 http://localhost:16718，全新浏览器 profile）：
//   npx playwright test qa-notes-tabs.spec.ts --reporter=list
//
// 数据完全通过 UI 播种（分类管理 + 新增便签表单），浏览器 profile
// 全新 → localStorage / IndexedDB 均为空，无预置数据依赖。
//
// testid 说明（与真实 DOM 核对过）：
//   - 播种表单：内容 textarea `note-content-input`，分类下拉 `nt-form-category`，
//     保存按钮 `note-save-button`（新增模式文案「添加」），新增入口 `note-add-button`
//   - 分类管理：弹框 `nt-cat-dialog`，新分类输入 `nt-catmgr-new-name`，
//     添加 `nt-catmgr-add`，行 `nt-catmgr-row-<id>`，删除 `nt-catmgr-del-<id>`
//   - 搜索卡：关键词 `nt-search-input`（类 `nt-field-keyword`），类型 `nt-type-select`，
//     查询 `nt-search-btn`，重置 `nt-reset-btn`，计数 `nt-toolbar-count`，
//     分类管理入口 `nt-cat-manager`
//   - 便签卡：`note-card`；空态：普通 `note-empty` / 时光轴 `note-timeline-empty`
//   - 新分类 tabs（恢复功能，按计划文档）：容器 `.nt-cat-tabs`，药丸 `nt-cat-tab`，
//     testid `nt-cat-all` / `nt-cat-uncategorized` / `nt-cat-<categoryId>`，激活类 `.active`
//   - 标签页显示勾选（S1-S5 新功能）：分类管理弹框首区 `.cat-tab-section`（标题 `.cat-tab-section-title`
//     + hint `.cat-tab-hint` + 列表 `.cat-tab-list`），行 `.cat-tab-row`（label 包裹 checkbox，
//     checkbox testid `nt-catmgr-tab-<categoryId>`，:checked 绑定 showInTabs !== false）
//   - 结构顺序（S1）：`.nt-search` 卡片 → `.nt-headbar` 操作栏 → `.nt-cat-tabs`（tabs 不在搜索卡内）
// ============================================================

test.describe.configure({ mode: 'serial', timeout: 60_000 })

let page: Page

// 播种出的分类 id（从分类管理弹框行 testid 解析，供 tab / 删除按钮使用）
let workId = ''
let lifeId = ''

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  // 所有 confirm()（删除分类等）一律接受
  page.on('dialog', (d) => d.accept())
})

test.afterAll(async () => {
  await page?.close()
})

// ===== 工具函数 =====

/** 关键词输入框：优先 data-testid，回退类名。 */
async function keywordInput(): Promise<Locator> {
  const byTestid = page.locator('[data-testid="nt-search-input"]')
  if ((await byTestid.count()) > 0) return byTestid.first()
  return page.locator('.nt-field-keyword').first()
}

/** 便签内容输入框（新增/编辑浮层）。 */
async function contentInput(): Promise<Locator> {
  const byTestid = page.locator('[data-testid="note-content-input"]')
  if ((await byTestid.count()) > 0) return byTestid.first()
  return page.locator('.note-content-input').first()
}

/** 保存按钮：新增模式文案为「添加」。 */
async function saveButton(): Promise<Locator> {
  const byTestid = page.locator('[data-testid="note-save-button"]')
  if ((await byTestid.count()) > 0) return byTestid.first()
  return page.locator('.note-form-actions button', { hasText: /^添加$/ }).first()
}

/** 通过 UI 新增一条便签：content + 可选分类名（省略 = 未分类）。 */
async function createNote(content: string, categoryName?: string): Promise<void> {
  await page.locator('[data-testid="note-add-button"]').click()
  await expect(page.locator('[data-testid="note-overlay"]')).toBeVisible()
  await (await contentInput()).fill(content)
  if (categoryName) {
    await page.locator('[data-testid="nt-form-category"]').selectOption({ label: categoryName })
  }
  await (await saveButton()).click()
  await expect(page.locator('[data-testid="note-overlay"]')).toBeHidden()
}

/** 分类 tab locator（容器内，避免误命中 nt-cat-manager 等）。 */
function catTab(id: string): Locator {
  return page.locator(`.nt-cat-tabs [data-testid="nt-cat-${id}"]`)
}

// ===== 流程 =====

test('1. 打开工作台并进入便签面板', async () => {
  await page.goto('http://localhost:16718/workbench', { waitUntil: 'load' })
  await page.locator('.wb-menu-item', { hasText: '个人便签' }).click()
  await expect(page.locator('.nt-search')).toBeVisible()
})

test('2. 通过分类管理创建「工作」「生活」分类', async () => {
  await page.locator('[data-testid="nt-cat-manager"]').click()
  await expect(page.locator('[data-testid="nt-cat-dialog"]')).toBeVisible()

  async function addCat(name: string, expectedRows: number): Promise<void> {
    await page.locator('[data-testid="nt-catmgr-new-name"]').fill(name)
    await page.locator('[data-testid="nt-catmgr-add"]').click()
    await expect(page.locator('.cat-manager-row')).toHaveCount(expectedRows)
  }
  await addCat('工作', 1)
  await addCat('生活', 2)

  // 解析分类 id：行 testid `nt-catmgr-row-<id>` + 行内名称输入值 → name→id
  const rows = await page.locator('.cat-manager-row').evaluateAll((els) =>
    els.map((r) => {
      const tid = r.getAttribute('data-testid') ?? ''
      const nameInput = r.querySelector('input')
      return { testid: tid, name: nameInput ? (nameInput as HTMLInputElement).value : '' }
    })
  )
  const byName = new Map<string, string>()
  for (const row of rows) {
    const id = row.testid.replace('nt-catmgr-row-', '')
    if (id && row.name) byName.set(row.name, id)
  }
  workId = byName.get('工作') ?? ''
  lifeId = byName.get('生活') ?? ''
  expect(workId, `未解析到「工作」分类 id，rows: ${JSON.stringify(rows)}`).toBeTruthy()
  expect(lifeId, `未解析到「生活」分类 id，rows: ${JSON.stringify(rows)}`).toBeTruthy()

  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="nt-cat-dialog"]')).toBeHidden()
})

test('3. 通过表单新增 4 条便签（2 工作 / 1 生活 / 1 未分类）', async () => {
  await createNote('工作A', '工作')
  await createNote('工作B', '工作')
  await createNote('生活C', '生活')
  await createNote('未分类D')
  await expect(page.locator('[data-testid="note-card"]')).toHaveCount(4)
})

test('4. 分类 tabs 渲染：全部/未分类/每分类，默认「全部」激活', async () => {
  const tabs = page.locator('.nt-cat-tabs')
  await expect(tabs).toBeVisible()
  await expect(page.locator('.nt-cat-tabs [data-testid="nt-cat-all"]')).toBeVisible()
  await expect(page.locator('.nt-cat-tabs [data-testid="nt-cat-uncategorized"]')).toBeVisible()

  const ids = await page.locator('.nt-cat-tabs [data-testid^="nt-cat-"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-testid') ?? '')
  )
  const catTabIds = ids.filter((i) => i !== 'nt-cat-all' && i !== 'nt-cat-uncategorized')
  expect(
    catTabIds.length,
    `分类 tab 应至少 2 个（工作+生活），实际 tabs: ${JSON.stringify(ids)}`
  ).toBeGreaterThanOrEqual(2)

  await expect(page.locator('.nt-cat-tabs [data-testid="nt-cat-all"]')).toHaveClass(/active/)
})

test('5. 点击「工作」tab 立即过滤（无需查询）→ 仅 2 条', async () => {
  expect(workId, '缺少「工作」分类 id（前置步骤失败？）').toBeTruthy()
  const tab = catTab(workId)
  await expect(tab).toBeVisible()
  await tab.click()

  const cards = page.locator('[data-testid="note-card"]')
  await expect(cards).toHaveCount(2)
  const text = (await cards.allTextContents()).join('|')
  expect(text).toContain('工作A')
  expect(text).toContain('工作B')
  expect(text).not.toContain('生活C')
  expect(text).not.toContain('未分类D')

  await expect(page.locator('[data-testid="nt-toolbar-count"]')).toContainText('筛选出')
  await expect(tab).toHaveClass(/active/)
})

test('6. 点击「全部」→ 4 条可见且激活', async () => {
  await page.locator('.nt-cat-tabs [data-testid="nt-cat-all"]').click()
  await expect(page.locator('[data-testid="note-card"]')).toHaveCount(4)
  await expect(page.locator('.nt-cat-tabs [data-testid="nt-cat-all"]')).toHaveClass(/active/)
})

test('7. 分类 tab + 关键词组合过滤 → 仅 1 条', async () => {
  await catTab(workId).click()
  await (await keywordInput()).fill('工作A')
  await page.locator('[data-testid="nt-search-btn"]').click()
  const cards = page.locator('[data-testid="note-card"]')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('工作A')
})

test('8. 类型切到时光轴（分类激活）→ 空态不崩溃', async () => {
  await page.locator('[data-testid="nt-type-select"]').selectOption('timeline')
  await page.locator('[data-testid="nt-search-btn"]').click()
  await expect(page.locator('[data-testid="note-timeline-empty"]')).toBeVisible()

  // 复位：普通类型 + 重置全部筛选（分类回「全部」）
  await page.locator('[data-testid="nt-type-select"]').selectOption('normal')
  await page.locator('[data-testid="nt-reset-btn"]').click()
  await expect(page.locator('[data-testid="note-card"]')).toHaveCount(4)
  await expect(page.locator('.nt-cat-tabs [data-testid="nt-cat-all"]')).toHaveClass(/active/)
})

test('9. 暗色模式：激活 tab 保留强调色填充', async () => {
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  // .nt-cat-tab 有 transition: all 0.15s — 必须等动画结束再读 computed style，
  // 否则抓到过渡中间帧（如 rgb(133,146,164) = #64748b→#fff 的 t≈0.22 帧）
  await page.waitForTimeout(300)
  const active = page.locator('.nt-cat-tabs .nt-cat-tab.active').first()
  await expect(active).toBeVisible()
  const bg = await active.evaluate((el) => getComputedStyle(el).backgroundColor)
  const color = await active.evaluate((el) => getComputedStyle(el).color)
  const inactive = page.locator('.nt-cat-tabs .nt-cat-tab:not(.active)').first()
  const inactiveBg =
    (await inactive.count()) > 0
      ? await inactive.evaluate((el) => getComputedStyle(el).backgroundColor)
      : ''

  expect(
    bg,
    `激活 tab background-color=${bg} 不应是 #1f2937 (rgb(31, 41, 55))`
  ).not.toBe('rgb(31, 41, 55)')
  const accentOk = bg.includes('59, 130, 246') || (inactiveBg !== '' && bg !== inactiveBg)
  expect(
    accentOk,
    `激活 tab background-color=${bg} 应为蓝系强调色(含 59,130,246) 或与未激活 tab(${inactiveBg}) 不同`
  ).toBe(true)
  expect(
    color === 'rgb(255, 255, 255)' || color === 'rgba(255, 255, 255, 1)',
    `激活 tab color=${color} 应为白色 rgb(255,255,255)`
  ).toBe(true)
})

test('10. 移动端 375px：无横向溢出，tabs flex 换行', async () => {
  await page.setViewportSize({ width: 375, height: 667 })
  const noOverflow = await page.evaluate(() => {
    const se = document.scrollingElement
    return se ? se.scrollWidth <= se.clientWidth : true
  })
  expect(noOverflow, '移动端出现横向溢出（scrollWidth > clientWidth）').toBe(true)

  const tabsInfo = await page.locator('.nt-cat-tabs').evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      display: cs.display,
      flexWrap: cs.flexWrap,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth
    }
  })
  expect(tabsInfo.display, `.nt-cat-tabs display=${tabsInfo.display} 应为 flex`).toContain('flex')
  expect(
    tabsInfo.flexWrap === 'wrap' || tabsInfo.scrollWidth <= tabsInfo.clientWidth,
    `tabs flexWrap=${tabsInfo.flexWrap} scrollWidth=${tabsInfo.scrollWidth} clientWidth=${tabsInfo.clientWidth} 应换行或无溢出`
  ).toBe(true)
})

test('11. 删除激活分类「工作」→ 回退「全部」且全部便签可见', async () => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const tab = catTab(workId)
  await expect(tab).toBeVisible()
  await tab.click()
  await expect(tab).toHaveClass(/active/)

  await page.locator('[data-testid="nt-cat-manager"]').click()
  await expect(page.locator('[data-testid="nt-cat-dialog"]')).toBeVisible()
  const delBtn = page.locator(`[data-testid="nt-catmgr-del-${workId}"]`)
  await expect(delBtn).toBeVisible()
  await delBtn.click() // confirm() 已由 beforeAll 注册的 dialog handler 接受
  await expect(delBtn).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="nt-cat-dialog"]')).toBeHidden()
  await expect(page.locator('.nt-cat-tabs [data-testid="nt-cat-all"]')).toHaveClass(/active/)
  await expect(catTab(workId)).toHaveCount(0)
  await expect(page.locator('[data-testid="note-card"]')).toHaveCount(4)
})

test('12. 桌面浅色模式截图', async () => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await page.waitForTimeout(200)
  await page.screenshot({ path: 'notes-tabs-light.png', fullPage: false })
})

// ============================================================
// S1-S5：标签页显示勾选（showInTabs）接受测试
// 承接 test 12 状态：工作分类已删，生活分类保留（lifeId），
// 4 条便签 = 工作A(未分类) 工作B(未分类) 生活C(生活) 未分类D(未分类)，
// 浅色模式，1280×800，激活 tab = 全部
// ============================================================

test('13. S1 tabs 位置：操作栏(nt-headbar)下方，且不在搜索卡片内', async () => {
  const search = page.locator('.nt-search')
  const headbar = page.locator('.nt-headbar')
  const tabs = page.locator('.nt-cat-tabs')
  await expect(search).toBeVisible()
  await expect(headbar).toBeVisible()
  await expect(tabs).toBeVisible()

  // 1) tabs 不是 .nt-search 的后代
  expect(await search.locator('.nt-cat-tabs').count(), 'tabs 不应位于 .nt-search 内部').toBe(0)

  // 2) DOM 顺序：search → headbar → tabs
  const order = await page.evaluate(() => {
    const a = document.querySelector('.nt-search')
    const b = document.querySelector('.nt-headbar')
    const c = document.querySelector('.nt-cat-tabs')
    if (!a || !b || !c) return { ok: false, missing: [!!a, !!b, !!c] }
    const isBefore = (x: Element, y: Element) =>
      Boolean(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING)
    return { ok: true, searchBeforeHeadbar: isBefore(a, b), headbarBeforeTabs: isBefore(b, c) }
  })
  expect(order.ok, `缺 DOM 节点: ${JSON.stringify(order)}`).toBe(true)
  expect(order.searchBeforeHeadbar, 'DOM 顺序应为 .nt-search → .nt-headbar').toBe(true)
  expect(order.headbarBeforeTabs, 'DOM 顺序应为 .nt-headbar → .nt-cat-tabs').toBe(true)
})

test('14. S2 取消勾选「生活」→ tab 消失；刷新后仍隐藏（持久化）', async () => {
  expect(lifeId, '缺少「生活」分类 id（前置步骤失败？）').toBeTruthy()
  await expect(catTab(lifeId)).toBeVisible()

  // 打开分类管理，取消勾选「标签页显示」
  await page.locator('[data-testid="nt-cat-manager"]').click()
  await expect(page.locator('[data-testid="nt-cat-dialog"]')).toBeVisible()
  const cb = page.locator(`[data-testid="nt-catmgr-tab-${lifeId}"]`)
  await expect(cb).toBeVisible()
  await expect(cb).toBeChecked()
  await cb.uncheck()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="nt-cat-dialog"]')).toBeHidden()

  // tab 消失；隐藏只影响筛选入口，便签仍全部可见
  await expect(catTab(lifeId)).toHaveCount(0)
  await expect(page.locator('.nt-cat-tabs [data-testid="nt-cat-all"]')).toHaveClass(/active/)
  await expect(page.locator('[data-testid="note-card"]')).toHaveCount(4)

  // 刷新 → IndexedDB 持久化
  await page.goto('http://localhost:16718/workbench', { waitUntil: 'load' })
  await page.locator('.wb-menu-item', { hasText: '个人便签' }).click()
  await expect(page.locator('.nt-search')).toBeVisible()
  await expect(catTab(lifeId)).toHaveCount(0)
  await expect(page.locator('.nt-cat-tabs [data-testid="nt-cat-all"]')).toHaveClass(/active/)
  await expect(page.locator('[data-testid="note-card"]')).toHaveCount(4)
})

test('15. S4 隐藏分类仍可在新增表单下拉中选择', async () => {
  // 此时「生活」已被取消勾选（上一测试），但表单 select 应列出全量分类
  await page.locator('[data-testid="note-add-button"]').click()
  await expect(page.locator('[data-testid="note-overlay"]')).toBeVisible()
  const select = page.locator('[data-testid="nt-form-category"]')
  await expect(select).toBeVisible()
  const labels = await select.locator('option').allTextContents()
  expect(labels, `下拉选项 ${JSON.stringify(labels)} 应包含「生活」`).toContain('生活')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="note-overlay"]')).toBeHidden()
})

test('16. S3 激活「生活」tab 后取消勾选 → 回退「全部」，全部便签可见', async () => {
  expect(lifeId, '缺少「生活」分类 id（前置步骤失败？）').toBeTruthy()

  // 重新勾选 → tab 重现
  await page.locator('[data-testid="nt-cat-manager"]').click()
  await expect(page.locator('[data-testid="nt-cat-dialog"]')).toBeVisible()
  await page.locator(`[data-testid="nt-catmgr-tab-${lifeId}"]`).check()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="nt-cat-dialog"]')).toBeHidden()
  await expect(catTab(lifeId)).toBeVisible()

  // 激活「生活」tab → 仅 1 条（生活C）
  await catTab(lifeId).click()
  await expect(catTab(lifeId)).toHaveClass(/active/)
  await expect(page.locator('[data-testid="note-card"]')).toHaveCount(1)
  await expect(page.locator('[data-testid="note-card"]').first()).toContainText('生活C')

  // 取消勾选正激活的分类 → 回退「全部」
  await page.locator('[data-testid="nt-cat-manager"]').click()
  await expect(page.locator('[data-testid="nt-cat-dialog"]')).toBeVisible()
  await page.locator(`[data-testid="nt-catmgr-tab-${lifeId}"]`).uncheck()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="nt-cat-dialog"]')).toBeHidden()

  await expect(catTab(lifeId)).toHaveCount(0)
  await expect(page.locator('.nt-cat-tabs [data-testid="nt-cat-all"]')).toHaveClass(/active/)
  await expect(page.locator('[data-testid="note-card"]')).toHaveCount(4)
})

test('17. S5 暗色模式：「标签页显示」checkbox 行渲染正常（与浅色可区分且文字可读）', async () => {
  // 暗色下实测背景/文字
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(300)
  await page.locator('[data-testid="nt-cat-manager"]').click()
  await expect(page.locator('[data-testid="nt-cat-dialog"]')).toBeVisible()
  const row = page.locator('.cat-tab-row').first()
  await expect(row).toBeVisible()

  const readStyle = (): Promise<{ bg: string; color: string }> =>
    row.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { bg: cs.backgroundColor, color: cs.color }
    })
  const dark = await readStyle()

  // 切回浅色实测，再恢复暗色（保持最终状态）
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await page.waitForTimeout(300)
  const light = await readStyle()
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(300)

  expect(
    dark.bg !== light.bg,
    `暗色 .cat-tab-row background=${dark.bg} 应与浅色(${light.bg})不同`
  ).toBe(true)
  const lum = (c: string): number => {
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (!m) return 0
    return (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3
  }
  expect(
    lum(dark.color) > 150,
    `暗色 .cat-tab-row 文字 color=${dark.color} 应为浅色（可读）`
  ).toBe(true)

  await page.screenshot({ path: 'notes-tabs-dark-catmgr.png', fullPage: false })
})

// ============================================================
// S6：全部类型默认（type='all' 双段渲染）
// 前置状态：4 条普通便签（工作A/工作B 已随「工作」分类删除归未分类，生活C 属
// 生活分类且其标签页显示已被取消勾选，未分类D）；无时光轴便签。
// 类型下拉默认 'all' → 双段渲染：普通网格（note-card）+ 时光轴网格（nt-timeline-card）。
// ============================================================

test('18. 类型下拉默认「全部类型」：仅普通段渲染、无空态、计数=共 4 个便签', async () => {
  // test 17 结束时分类管理弹框仍打开且处于暗色 → 先关闭并切回浅色
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="nt-cat-dialog"]')).toBeHidden()
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await page.waitForTimeout(300)

  await expect(page.locator('[data-testid="nt-type-select"]')).toHaveValue('all')
  await expect(page.locator('[data-testid="note-card"]')).toHaveCount(4)
  await expect(page.locator('[data-testid="nt-timeline-card"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="note-empty"]')).toBeHidden()
  await expect(page.locator('[data-testid="note-timeline-empty"]')).toBeHidden()
  await expect(page.locator('[data-testid="nt-toolbar-count"]')).toContainText('共 4 个便签')
})

test('19. 新增时光轴便签 → 「全部类型」下普通+时光轴双段同显', async () => {
  await page.locator('[data-testid="note-add-button"]').click()
  await expect(page.locator('[data-testid="note-overlay"]')).toBeVisible()
  await page.locator('.note-type-radios .type-radio-option', { hasText: '时光轴' }).click()
  await page.locator('[data-testid="note-title-input"]').fill('时光轴E')
  await (await saveButton()).click()
  await expect(page.locator('[data-testid="note-overlay"]')).toBeHidden()

  await expect(page.locator('[data-testid="note-card"]')).toHaveCount(4)
  await expect(page.locator('[data-testid="nt-timeline-card"]')).toHaveCount(1)
  await expect(page.locator('[data-testid="nt-toolbar-count"]')).toContainText('共 5 个便签')
})

test('20. 切「普通便签」仅普通段；切「时光轴便签」仅时光轴段；重置回全部', async () => {
  await page.locator('[data-testid="nt-type-select"]').selectOption('normal')
  await page.locator('[data-testid="nt-search-btn"]').click()
  await expect(page.locator('[data-testid="note-card"]')).toHaveCount(4)
  await expect(page.locator('[data-testid="nt-timeline-card"]')).toHaveCount(0)

  await page.locator('[data-testid="nt-type-select"]').selectOption('timeline')
  await page.locator('[data-testid="nt-search-btn"]').click()
  await expect(page.locator('[data-testid="nt-timeline-card"]')).toHaveCount(1)
  await expect(page.locator('[data-testid="note-card"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="note-timeline-empty"]')).toBeHidden()

  await page.locator('[data-testid="nt-reset-btn"]').click()
  await expect(page.locator('[data-testid="nt-type-select"]')).toHaveValue('all')
  await expect(page.locator('[data-testid="note-card"]')).toHaveCount(4)
  await expect(page.locator('[data-testid="nt-timeline-card"]')).toHaveCount(1)
})

test('21. 全部类型 + 关键词命中时光轴 → 仅时光轴段、无空态', async () => {
  await (await keywordInput()).fill('时光轴E')
  await page.locator('[data-testid="nt-search-btn"]').click()
  await expect(page.locator('[data-testid="nt-timeline-card"]')).toHaveCount(1)
  await expect(page.locator('[data-testid="note-card"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="note-empty"]')).toBeHidden()
  await expect(page.locator('[data-testid="note-timeline-empty"]')).toBeHidden()
})

test('22. 全部类型 + 无匹配关键词 → 恰一个空态（note-empty，时光轴空态不出现）', async () => {
  await (await keywordInput()).fill('zzz不存在的关键词')
  await page.locator('[data-testid="nt-search-btn"]').click()
  await expect(page.locator('[data-testid="note-card"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="nt-timeline-card"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="note-empty"]')).toBeVisible()
  await expect(page.locator('[data-testid="note-timeline-empty"]')).toHaveCount(0)
})

test('23. 重置回「全部类型」默认 → 双段恢复 + 计数=共 5 个便签', async () => {
  await page.locator('[data-testid="nt-reset-btn"]').click()
  await expect(page.locator('[data-testid="nt-type-select"]')).toHaveValue('all')
  await expect(page.locator('[data-testid="nt-search-input"]')).toHaveValue('')
  await expect(page.locator('[data-testid="note-card"]')).toHaveCount(4)
  await expect(page.locator('[data-testid="nt-timeline-card"]')).toHaveCount(1)
  await expect(page.locator('[data-testid="nt-toolbar-count"]')).toContainText('共 5 个便签')
  await page.screenshot({ path: 'notes-all-default.png', fullPage: false })
})
