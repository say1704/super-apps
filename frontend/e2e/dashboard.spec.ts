import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="username"]').fill('admin');
    await page.locator('input[name="password"]').fill('CHANGE_ME');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('/');
  });

  test('dashboard page loads with title', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('IT Management Dashboard');
  });

  test('stat cards are visible', async ({ page }) => {
    await expect(page.locator('text=Open Incidents')).toBeVisible();
    await expect(page.locator('text=High Vulnerabilities')).toBeVisible();
    await expect(page.locator('text=Active Tasks')).toBeVisible();
    await expect(page.locator('text=Total Documents')).toBeVisible();
    await expect(page.locator('text=L&M Records')).toBeVisible();
    await expect(page.locator('text=Server Checks')).toBeVisible();
  });

  test('quick actions bar is visible', async ({ page }) => {
    await expect(page.locator('text=Quick Actions')).toBeVisible();
    await expect(page.locator('text=+ New Task')).toBeVisible();
    await expect(page.locator('text=+ Log Work')).toBeVisible();
    await expect(page.locator('text=+ Report Incident')).toBeVisible();
  });

  test('module grid displays modules', async ({ page }) => {
    await expect(page.locator('text=Log & Maintenance')).toBeVisible();
    await expect(page.locator('text=Server Capacity')).toBeVisible();
    await expect(page.locator('text=Vulnerability Report')).toBeVisible();
    await expect(page.locator('text=Incident Report')).toBeVisible();
    await expect(page.locator('text=Asset Register')).toBeVisible();
  });

  test('notification bell is visible', async ({ page }) => {
    await expect(page.locator('svg[class*="bell"]')).toBeVisible();
  });

  test('refresh button works', async ({ page }) => {
    const refreshBtn = page.locator('button[title="Refresh dashboard"]');
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    await page.waitForTimeout(1000);
  });

  test('stat card navigates to module', async ({ page }) => {
    await page.locator('text=Active Tasks').click();
    await page.waitForURL(/\/modules\/tasks/);
    await expect(page).toHaveURL(/\/modules\/tasks/);
  });
});
