/**
 * QA: 导航设置页面命名与可见性
 *
 * Playwright 方案：后台 vite dev（端口 16718）→ 打开 / →
 * 断言：S1 默认按钮 / S2 打开设置→导航设置 tab / S3 重命名工作台→Header 更新 / S4 关闭工作台可见性→Tab+按钮隐藏 / S5 恢复
 *
 * 运行：node scripts/qa-nav-settings.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:16718';
const TIMEOUT = 15000;

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let passed = 0;
  let total = 0;

  async function assert(name, cond) {
    total++;
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { console.log(`  ❌ FAIL: ${name}`); }
  }

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForTimeout(3000);

    // S1: HomeView default buttons
    console.log('\n[S1] HomeView default buttons');
    const wbBtn = page.locator('button.btn-help', { hasText: '工作台' });
    const bizBtn = page.locator('[data-testid="nav-business-entry"]');
    await assert('Workbench button visible', await wbBtn.isVisible());
    await assert('Business button visible', await bizBtn.isVisible());

    // S2: Open settings → nav tab
    console.log('\n[S2] Settings dialog nav tab');
    await page.locator('button.btn-help[title="设置"]').click();
    await page.waitForSelector('.manager-overlay', { timeout: TIMEOUT });
    await page.locator('.tab-btn', { hasText: '导航设置' }).click();
    await page.waitForTimeout(500);
    const pageNavTitle = page.locator('.wb-menu-title', { hasText: '页面导航' });
    await assert('Page navigation section visible', await pageNavTitle.isVisible());

    // S3: Rename workbench → header updates
    console.log('\n[S3] Rename workbench');
    const wbNameInput = page.locator('.wb-menu-name-input').first();
    await wbNameInput.fill('测试工作台');
    await wbNameInput.press('Enter');
    await page.waitForTimeout(500);
    // Close settings
    await page.click('.close-btn');
    await page.waitForTimeout(500);
    // Button text should update
    const wbBtnAfter = page.locator('button.btn-help', { hasText: '测试工作台' });
    await assert('Workbench button shows custom name', await wbBtnAfter.isVisible());

    // Navigate to workbench page
    await wbBtnAfter.click();
    await page.waitForTimeout(1500);
    const wbHeader = page.locator('.wb-header h1');
    const wbHeaderText = await wbHeader.textContent();
    await assert('Workbench header shows custom name', wbHeaderText.includes('测试工作台'));

    // Go back
    await page.click('.wb-btn:has-text("管理页")');
    await page.waitForTimeout(1500);

    // S4: Toggle workbench visibility off
    console.log('\n[S4] Toggle workbench visibility off');
    await page.locator('button.btn-help[title="设置"]').click();
    await page.waitForSelector('.manager-overlay', { timeout: TIMEOUT });
    await page.locator('.tab-btn', { hasText: '导航设置' }).click();
    await page.waitForTimeout(300);

    const wbSwitch = page.locator('[data-testid="workbench-visible-switch"]');
    const isOn = await wbSwitch.evaluate(el => el.classList.contains('on'));
    if (isOn) {
      await wbSwitch.click();
      await page.waitForTimeout(500);
    }

    // Check tabs hidden
    const wbTab = page.locator('.tab-btn', { hasText: '工作台设置' });
    const remindTab = page.locator('.tab-btn', { hasText: '提醒设置' });
    await assert('Workbench settings tab hidden', !(await wbTab.isVisible()));
    await assert('Remind settings tab hidden', !(await remindTab.isVisible()));

    // Close settings
    await page.click('.close-btn');
    await page.waitForTimeout(500);

    // Check nav button hidden
    const wbBtnHidden = page.locator('button.btn-help', { hasText: '测试工作台' });
    await assert('Workbench nav button hidden', !(await wbBtnHidden.isVisible()));
    const bizBtnStill = page.locator('[data-testid="nav-business-entry"]');
    await assert('Business nav button still visible', await bizBtnStill.isVisible());

    // S5: Reset visibility + name
    console.log('\n[S5] Reset');
    await page.locator('button.btn-help[title="设置"]').click();
    await page.waitForSelector('.manager-overlay', { timeout: TIMEOUT });
    await page.locator('.tab-btn', { hasText: '导航设置' }).click();
    await page.waitForTimeout(300);

    const wbSwitchReset = page.locator('[data-testid="workbench-visible-switch"]');
    const isOnReset = await wbSwitchReset.evaluate(el => el.classList.contains('on'));
    if (!isOnReset) {
      await wbSwitchReset.click();
      await page.waitForTimeout(500);
    }
    // Reset name
    const wbNameReset = page.locator('.wb-menu-name-input').first();
    await wbNameReset.fill('');
    await wbNameReset.press('Enter');
    await page.waitForTimeout(300);
    await page.click('.close-btn');
    await page.waitForTimeout(500);

    const wbBtnRestore = page.locator('button.btn-help', { hasText: '工作台' });
    await assert('Workbench button restored', await wbBtnRestore.isVisible());

  } catch (e) {
    console.error('ERROR:', e.message);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTS: ${passed}/${total} passed`);
  if (passed < total) process.exit(1);
  await browser.close();
}

run();
