// Focused account / permission checks against the explicit local portal demo.
// VITE_PORTAL_DEMO_FALLBACK=true VITE_DISABLE_PWA=1 pnpm dev:portal
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.PORTAL_URL || 'http://127.0.0.1:4320';
const output = path.resolve('output/bluecollar');
const tokenKey = 'xiangneng_core_token';
const identityKey = 'xiangneng.portal.demo-session.v2';
const report = { checkedAt: new Date().toISOString(), mode: 'isolated synthetic browser sessions', checks: [], pageErrors: [] };
const browser = await chromium.launch();
const record = (name, details = {}) => { report.checks.push({ name, ...details }); console.log(`PASS ${name}`, JSON.stringify(details)); };
const pageFor = async (width) => {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => report.pageErrors.push({ url: page.url(), message: error.message }));
  return page;
};
const identity = (page) => page.evaluate(({ tokenKey, identityKey }) => ({
  token: sessionStorage.getItem(tokenKey),
  identity: sessionStorage.getItem(identityKey)
}), { tokenKey, identityKey });
const enter = async (page) => {
  await page.goto(`${base}/entry`);
  await page.getByRole('button', { name: '进入个人端', exact: true }).click();
  await expect(page.locator('.job-card').first()).toBeVisible();
  await expect(page).toHaveURL(/\/personal\/home$/);
};

try {
  const desktop = await pageFor(1440);
  await enter(desktop);
  const beforeAvatar = await identity(desktop);
  expect(beforeAvatar.token).toBeTruthy();
  expect(beforeAvatar.identity).toBeTruthy();
  await desktop.getByRole('button', { name: '查看我的账号', exact: true }).click();
  await expect(desktop).toHaveURL(/\/personal\/me$/);
  await expect(desktop.locator('.profile-hero')).toBeVisible();
  expect(await identity(desktop)).toEqual(beforeAvatar);
  await expect(desktop.getByRole('button', { name: '进入个人端', exact: true })).toHaveCount(0);
  record('desktop avatar opens personal account and preserves logged-in identity');
  await desktop.context().close();

  const mobile = await pageFor(390);
  await enter(mobile);
  await mobile.locator('.bottom-nav').getByRole('link', { name: '我的', exact: true }).click();
  await expect(mobile.locator('.profile-hero')).toBeVisible();
  await mobile.getByRole('link', { name: '设置', exact: true }).first().click();
  await expect(mobile.getByRole('heading', { name: '设置', exact: true })).toBeVisible();
  await expect(mobile.getByRole('button', { name: '退出当前账号', exact: true })).toBeVisible();
  await mobile.getByRole('button', { name: '退出当前账号', exact: true }).click();
  await expect(mobile).toHaveURL(/\/entry$/);
  expect(await identity(mobile)).toEqual({ token: null, identity: null });
  await expect(mobile.locator('.recruit-account-button')).toHaveCount(0);
  record('mobile settings exposes logout; logout returns to entry and clears token / identity');
  await mobile.evaluate(() => {
    history.pushState({}, '', '/personal/me');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(mobile).toHaveURL(/\/entry\?redirect=/);
  await expect(mobile.locator('.profile-hero')).toHaveCount(0);
  await mobile.reload();
  await expect(mobile.getByRole('button', { name: '进入个人端', exact: true })).toBeVisible();
  expect(await identity(mobile)).toEqual({ token: null, identity: null });
  record('logged-out private-route navigation and reload cannot restore the previous account');
  await mobile.context().close();

  for (const personStatus of ['registered', 'employed']) {
    const noPermission = await pageFor(390);
    const session = { personaId: 'qa-no-referral', name: '权限质检合成账号', role: 'personal', subtitle: '隔离权限验证', personId: 'synthetic-person-004', personStatus, permissions: [] };
    await noPermission.context().addInitScript(({ session, tokenKey, identityKey }) => {
      sessionStorage.setItem(tokenKey, 'xiangneng-portal-offline-demo');
      sessionStorage.setItem(identityKey, JSON.stringify(session));
    }, { session, tokenKey, identityKey });
    // Serve an explicit API Session response to exercise the returned permissions field.
    await noPermission.route('**/api/portal/session', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data: session })
    }));
    const shareRequests = [];
    noPermission.on('request', (request) => {
      if (request.url().includes('/referrals/share-token')) shareRequests.push(request.url());
    });
    await noPermission.goto(`${base}/personal/referrals`);
    await expect(noPermission.getByRole('heading', { name: '推荐有奖', exact: true })).toBeVisible();
    await expect(noPermission.getByRole('link', { name: '先找合适的工作', exact: true })).toBeVisible();
    await expect(noPermission.getByRole('button', { name: '选择岗位，邀请好友', exact: true })).toHaveCount(0);
    await expect(noPermission.getByRole('button', { name: '生成专属邀请', exact: true })).toHaveCount(0);
    await noPermission.getByRole('link', { name: '先找合适的工作', exact: true }).click();
    await expect(noPermission).toHaveURL(/\/personal\/home$/);
    await expect(noPermission.locator('.job-card').first()).toBeVisible();
    expect(shareRequests).toEqual([]);
    record(`explicit permissions without referral:create (${personStatus}) hide invitation and make zero share-token requests`, { shareRequests: shareRequests.length });
    await noPermission.context().close();
  }
  expect(report.pageErrors).toEqual([]);
  record('focused account checks have no JavaScript page errors');
} catch (error) {
  report.failure = error.stack || String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'account-ui-smoke-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
