// Requires both Vite servers. Portal must use explicit synthetic demo mode:
// VITE_PORTAL_DEMO_FALLBACK=true VITE_DISABLE_PWA=1 pnpm dev:portal
// pnpm dev:admin
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('output/bluecollar');
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const report = { checkedAt: new Date().toISOString(), mode: 'synthetic offline demo', checks: [], pageErrors: [] };
const portalBase = process.env.PORTAL_URL || 'http://127.0.0.1:4320';
const adminBase = process.env.ADMIN_URL || 'http://127.0.0.1:5173';
const record = (name, details = {}) => { report.checks.push({ name, ...details }); console.log(`PASS ${name}`, JSON.stringify(details)); };
const capture = (page, name, fullPage = false) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage, animations: 'disabled' });
const overflow = async (page, name) => {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(size.document).toBeLessThanOrEqual(size.viewport);
  record(`${name}: no document horizontal overflow`, size);
};
const newPage = async (width, height = 1000) => {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on('pageerror', (error) => report.pageErrors.push({ url: page.url(), message: error.message }));
  return page;
};
const enterPortal = async (page) => {
  await page.goto(`${portalBase}/entry`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '进入个人端', exact: true }).click();
  await expect(page).toHaveURL(/\/personal\/home$/);
  await expect(page.locator('.job-card').first()).toBeVisible();
  await expect(page.locator('.portal-demo-notice')).toContainText('演示体验');
  await expect(page.locator('.portal-demo-notice')).toContainText('报名不会发送给真实企业');
};
const adminMenu = async (page, item, group = '招聘管理') => {
  const mobile = page.viewportSize().width < 992;
  if (mobile) await page.getByRole('button', { name: '打开菜单', exact: true }).click();
  const menu = page.locator(mobile ? '.ant-drawer .ant-menu' : '.ant-layout-sider .ant-menu');
  const title = menu.locator('.ant-menu-submenu-title').filter({ hasText: group });
  if (await title.getAttribute('aria-expanded') !== 'true') await title.click();
  await menu.getByText(item, { exact: true }).click();
  if (mobile) await expect(page.locator('.ant-drawer-open')).toHaveCount(0);
};

try {
  if (process.env.UI_TARGET !== 'admin') for (const width of [390, 1440]) {
    const label = width === 390 ? 'mobile' : 'desktop';
    const page = await newPage(width, width === 390 ? 844 : 1000);
    await enterPortal(page);
    record(`portal ${label}: initial identity entry stays logged in`);
    await overflow(page, `portal ${label} home`);
    await capture(page, `portal-${label}-home-first-screen`);
    await capture(page, `portal-${label}-home`, true);

    const navigation = page.locator(width === 390 ? '.bottom-nav' : '.recruit-desktop-nav');
    await expect(navigation.getByRole('link')).toHaveCount(4);
    await navigation.getByRole('link', { name: '我的报名', exact: true }).click();
    await expect(page.getByRole('heading', { name: '我的报名', exact: true })).toBeVisible();
    await expect(navigation.getByRole('link', { name: '我的报名', exact: true })).toHaveClass('active');
    await expect(navigation.getByRole('link', { name: '我的', exact: true })).not.toHaveClass('active');
    await navigation.getByRole('link', { name: '找工作', exact: true }).click();
    await expect(page.locator('.job-card').first()).toBeVisible();
    record(`portal ${label}: four primary destinations and exclusive application navigation`);

    const first = page.locator('.job-card').first();
    await expect(first.locator('.bluecollar-salary')).toContainText(/元/);
    await expect(first.locator('.job-meta')).not.toHaveText('');
    const firstAction = await first.getByRole('button', { name: '立即报名' }).boundingBox();
    expect(firstAction.height).toBeGreaterThanOrEqual(44);
    const nav = await page.locator('.bottom-nav').isVisible() ? await page.locator('.bottom-nav').boundingBox() : null;
    record(`portal ${label}: first job salary, city, apply action`, { firstAction, nav, firstActionAboveNavigation: !nav || firstAction.y + firstAction.height <= nav.y });
    if (nav) expect(firstAction.y + firstAction.height).toBeLessThanOrEqual(nav.y);

    await page.getByRole('button', { name: '成都', exact: true }).click();
    await expect(page.getByRole('heading', { name: '成都岗位', exact: true })).toBeVisible();
    await expect.poll(async () => (await page.locator('.job-card .job-meta').allTextContents()).every((text) => text.includes('成都')) && await page.locator('.job-card').count() > 0).toBe(true);
    await page.getByRole('button', { name: '仓储物流', exact: true }).click();
    await expect.poll(async () => await page.locator('.job-card').count()).toBe(1);
    await expect(page.locator('.job-card').first()).toContainText('仓库管理员');
    record(`portal ${label}: city and category filters`);
    await capture(page, `portal-${label}-filtered`);

    await page.locator('.job-card').first().getByRole('link', { name: /详情/ }).click();
    await expect(page.getByRole('heading', { name: '岗位详情', exact: true })).toBeVisible();
    await expect(page.getByText('工资待遇', { exact: true })).toBeVisible();
    await overflow(page, `portal ${label} detail`);
    await expect(page.locator('.bottom-nav')).toHaveCount(0);
    await expect(page.locator('.fixed-action-bar').getByRole('button', { name: '立即报名' })).toBeVisible();
    if (width > 760) await page.locator('.fixed-action-bar').getByRole('button', { name: '立即报名' }).scrollIntoViewIfNeeded();
    const applyBounds = await page.locator('.fixed-action-bar').getByRole('button', { name: '立即报名' }).boundingBox();
    expect(applyBounds.y + applyBounds.height).toBeLessThanOrEqual(page.viewportSize().height);
    record(`portal ${label}: detail action visible without tab-bar overlap`, { applyBounds });
    await capture(page, `portal-${label}-detail`, true);

    await page.getByRole('button', { name: '立即报名', exact: true }).click();
    await expect(page.getByRole('button', { name: '确认报名', exact: true })).toBeDisabled();
    await capture(page, `portal-${label}-apply-consent`);
    await page.getByRole('checkbox').check();
    await expect(page.getByRole('button', { name: '确认报名', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '确认报名', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '报名成功' })).toBeVisible();
    await capture(page, `portal-${label}-apply-success`);
    await page.getByRole('link', { name: '查看我的报名', exact: true }).click();
    await expect(page.getByRole('heading', { name: '我的报名', exact: true })).toBeVisible();
    await expect(page.locator('.application-card').filter({ hasText: '仓库管理员' })).toBeVisible();
    await overflow(page, `portal ${label} applications`);
    record(`portal ${label}: consent required, apply succeeds, new job appears in my applications`);
    await capture(page, `portal-${label}-applications`, true);

    await page.goto(`${portalBase}/personal/referrals`);
    await page.getByRole('button', { name: '选择岗位，邀请好友', exact: true }).click();
    await expect(page.getByRole('button', { name: '生成专属邀请', exact: true })).toBeDisabled();
    const select = page.getByRole('dialog').getByRole('combobox');
    await expect.poll(() => select.locator('option').count()).toBeGreaterThan(1);
    const jobId = await select.locator('option').nth(1).getAttribute('value');
    await select.selectOption(jobId);
    await page.getByRole('button', { name: '生成专属邀请', exact: true }).click();
    await expect(page.getByRole('button', { name: '复制邀请链接', exact: true })).toBeVisible();
    await expect(page.getByLabel('专属邀请链接')).toHaveValue(/\/personal\/jobs\/.*\?ref=/);
    record(`portal ${label}: referral invite generates a job-bound share token`);
    await overflow(page, `portal ${label} share dialog`);
    await capture(page, `portal-${label}-referral-share`);
    await page.context().close();
  }

  if (process.env.UI_TARGET !== 'portal') {
  const admin = await newPage(1440);
  // Isolated browser fixture only: exercises the payment form without paying anyone.
  await admin.context().addInitScript(() => localStorage.setItem('xiangneng.demo.shared-state.v2', JSON.stringify({
    rewards: [{ id: 'reward-demo-ui-approved', personId: 'synthetic-person-004', amount: 500, status: 'APPROVED', approvedAt: '2026-10-01T08:00:00.000Z', createdAt: '2026-08-01T08:00:00.000Z', recommender: { displayName: 'UI 质检推荐样例' }, policy: { id: 'ui-policy', name: '合成奖励规则', amount: 500, retentionDays: 30, version: 1 }, eligibility: { eligible: true, reason: '合成样例已达成，专用于表单校验', retentionDays: 30 } }]
  })));
  await admin.goto(`${adminBase}/login`);
  await admin.getByPlaceholder('请输入 8888').fill('8888');
  await admin.getByRole('button', { name: '进入系统', exact: true }).click();
  await expect(admin.locator('.ant-layout-sider')).toBeVisible();
  await adminMenu(admin, '岗位发布');
  await expect(admin.getByRole('heading', { name: '岗位发布', exact: true })).toBeVisible();
  await expect(admin.locator('.ant-table-row').first()).toBeVisible();
  await expect(admin.locator('.ant-spin-spinning')).toHaveCount(0);
  await overflow(admin, 'admin desktop job publishing');
  await capture(admin, 'admin-desktop-jobs');
  await admin.getByRole('button', { name: /发布新岗位/ }).click();
  await expect(admin.getByRole('dialog')).toBeVisible();
  await capture(admin, 'admin-desktop-publish', true);
  await admin.getByRole('button', { name: '发布并同步', exact: true }).click();
  await expect(admin.getByText('请选择项目', { exact: true })).toBeVisible();
  await expect(admin.getByText('请输入薪资待遇', { exact: true })).toBeVisible();
  await expect(admin.getByText('请输入工作时间', { exact: true })).toBeVisible();
  record('admin desktop: publishing form requires project, pay, schedule, address and deadline');
  const publish = admin.getByRole('dialog');
  await publish.getByLabel('归属项目', { exact: true }).click();
  await admin.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click();
  const publishedTitle = 'UI 质检合成仓储岗';
  await publish.getByLabel('招聘岗位', { exact: true }).fill(publishedTitle);
  await publish.getByLabel('工资与计薪方式', { exact: true }).fill('综合 5500–6500 元/月，次月 15 日发薪');
  await publish.getByLabel('班次与工作时间', { exact: true }).fill('长白班 08:00–17:00，月休 4 天');
  await publish.getByLabel('工作地点', { exact: true }).fill('成都市合成演示园区，仅用于本地 UI 测试');
  await publish.getByLabel('报名截止时间', { exact: true }).fill('2026-12-31 18:00:00');
  await publish.getByLabel('报名截止时间', { exact: true }).press('Enter');
  await publish.getByLabel('工作内容', { exact: true }).fill('仓库货品整理与分拣，仅用于合成演示。');
  await publish.getByLabel('报名要求', { exact: true }).fill('年满 18 岁，具备岗位所需工作能力。');
  await admin.getByRole('button', { name: '发布并同步', exact: true }).click();
  await expect(admin.getByRole('dialog')).toHaveCount(0);
  await expect(admin.locator('.ant-table-row').filter({ hasText: publishedTitle })).toBeVisible();
  record('admin desktop: new synthetic job publishes and appears in the job list');

  await adminMenu(admin, '报名跟进');
  await expect(admin.getByRole('heading', { name: '报名跟进', exact: true })).toBeVisible();
  await expect(admin.locator('.ant-table-row').first()).toBeVisible();
  await expect(admin.locator('.ant-spin-spinning')).toHaveCount(0);
  await overflow(admin, 'admin desktop application follow-up');
  await capture(admin, 'admin-desktop-applications');
  await adminMenu(admin, '内部推荐政策', '政策管理');
  await expect(admin.getByRole('heading', { name: /推荐奖励规则|内部推荐政策|推荐奖励政策/ })).toBeVisible();
  await expect(admin.locator('.ant-table-row').first()).toBeVisible();
  await expect(admin.locator('.ant-spin-spinning')).toHaveCount(0);
  await overflow(admin, 'admin desktop reward policies');
  await capture(admin, 'admin-desktop-reward-policies');
  await adminMenu(admin, '推荐奖励');
  await expect(admin.getByRole('heading', { name: '推荐奖励', exact: true })).toBeVisible();
  await expect(admin.locator('.ant-table-row').first()).toBeVisible();
  await expect(admin.locator('.ant-spin-spinning')).toHaveCount(0);
  await overflow(admin, 'admin desktop reward review');
  await capture(admin, 'admin-desktop-reward-review');
  const paymentButtons = admin.getByRole('button', { name: /登记发放/ });
  if (await paymentButtons.count()) {
    await paymentButtons.first().click();
    await expect(admin.getByRole('dialog', { name: '登记奖励发放' })).toBeVisible();
    await admin.getByRole('button', { name: '保存付款记录', exact: true }).click();
    await expect(admin.getByText('请输入付款流水号', { exact: true })).toBeVisible();
    await expect(admin.getByText('请填写至少 4 字的凭证说明或凭证链接', { exact: true })).toBeVisible();
    await expect(admin.getByText('请填写本次操作说明', { exact: true })).toBeVisible();
    await capture(admin, 'admin-desktop-reward-payment');
    record('admin desktop: payment registration requires transaction reference, proof and notes');
    await admin.getByRole('dialog').getByRole('button', { name: /取\s*消/ }).click();
  } else {
    record('admin desktop: payment form unavailable for current synthetic statuses', { tested: false });
  }
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.waitForTimeout(300);
  await capture(admin, 'admin-mobile-reward-review');
  await overflow(admin, 'admin mobile reward review');
  await adminMenu(admin, '岗位发布');
  await expect(admin.getByRole('heading', { name: '岗位发布', exact: true })).toBeVisible();
  await expect(admin.locator('.ant-table-row').first()).toBeVisible();
  await expect(admin.locator('.ant-spin-spinning')).toHaveCount(0);
  await overflow(admin, 'admin mobile job publishing');
  await capture(admin, 'admin-mobile-jobs');
  await admin.getByRole('button', { name: /发布新岗位/ }).click();
  await expect(admin.getByRole('dialog', { name: '发布新岗位', exact: true })).toBeVisible();
  await overflow(admin, 'admin mobile publishing form');
  await capture(admin, 'admin-mobile-publish', true);
  await admin.context().close();
  }
  expect(report.pageErrors).toEqual([]);
  record('no JavaScript page errors');
} catch (error) {
  report.failure = error.stack || String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(out, `ui-smoke-report${process.env.UI_TARGET ? `-${process.env.UI_TARGET}` : ''}.json`), JSON.stringify(report, null, 2));
  await browser.close();
}
