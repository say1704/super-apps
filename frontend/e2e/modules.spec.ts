import { test, expect } from '@playwright/test';

test.describe('Tasks Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="username"]').fill('admin');
    await page.locator('input[name="password"]').fill('CHANGE_ME');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('/');
  });

  test('tasks page loads', async ({ page }) => {
    await page.goto('/modules/tasks');
    await expect(page.locator('h1')).toContainText(/Task/i);
  });

  test('task stats are visible', async ({ page }) => {
    await page.goto('/modules/tasks');
    await expect(page.locator('text=To Do')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Doing')).toBeVisible();
    await expect(page.locator('text=Done')).toBeVisible();
  });
});

test.describe('Assets Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="username"]').fill('admin');
    await page.locator('input[name="password"]').fill('CHANGE_ME');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('/');
  });

  test('assets page loads', async ({ page }) => {
    await page.goto('/modules/assets');
    await expect(page.locator('h1')).toContainText(/Asset/i);
  });
});

test.describe('Settings Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="username"]').fill('admin');
    await page.locator('input[name="password"]').fill('CHANGE_ME');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('/');
  });

  test('settings page loads', async ({ page }) => {
    await page.goto('/modules/settings');
    await expect(page.locator('h1')).toContainText(/Setting/i);
  });

  test('settings tabs are visible', async ({ page }) => {
    await page.goto('/modules/settings');
    await expect(page.locator('text=General')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Users')).toBeVisible();
    await expect(page.locator('text=Roles')).toBeVisible();
  });
});
