import { test, expect, _electron } from '@playwright/test';

// Smoke test only — fuller e2e is a post-v1 milestone (PLAN.md §12).
// We just verify the app launches, the preload bridge is present, and
// the renderer reaches the Focus Blocker shell.

let electronApp: Awaited<ReturnType<typeof _electron.launch>>;
let mainPage: Awaited<ReturnType<typeof electronApp.firstWindow>>;

async function waitForPreloadScript() {
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      const bridge = await mainPage.evaluate(() => (window as any).blocker);
      if (bridge) {
        clearInterval(interval);
        resolve(true);
      }
    }, 100);
  });
}

test.beforeEach(async () => {
  electronApp = await _electron.launch({
    args: ['.'],
    env: { ...process.env, NODE_ENV: 'development' },
  });
  mainPage = await electronApp.firstWindow();
  await waitForPreloadScript();
});

test.afterEach(async () => {
  await electronApp.close();
});

test('app exposes the blocker bridge and renders the header', async () => {
  await expect(mainPage.locator('text=Focus Blocker')).toBeVisible();
  const cfg = await mainPage.evaluate(async () => (window as any).blocker.getConfig());
  expect(cfg.version).toBe(1);
});
