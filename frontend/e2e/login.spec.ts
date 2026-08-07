import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Super Apps/);
    await expect(page.locator('h1')).toContainText(/Login/i);
  });

  test('login with valid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="username"]').fill('admin');
    await page.locator('input[name="password"]').fill('CHANGE_ME');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="username"]').fill('admin');
    await page.locator('input[name="password"]').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('text=Invalid')).toBeVisible({ timeout: 5000 });
  });

  test('unauthenticated user redirected to login', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });
});
