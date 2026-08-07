import { defineConfig, devices } from "@playwright/test";

/**
 * Dedicated Playwright config for the Admin Settings E2E test.
 * Kept separate from frontend/playwright.config.ts so it does not disturb the
 * existing e2e suite. Points at the root-level tests/ dir and targets the real
 * HTTPS port 3443 (frontend/playwright.config.ts uses 3001 which is only the
 * HTTP->HTTPS redirect listener).
 *
 * Run from the frontend dir so @playwright/test resolves:
 *   cd frontend && npx playwright test -c ../playwright.admin-setting.config.ts
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "https://127.0.0.1:3443",
    ignoreHTTPSErrors: true,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
