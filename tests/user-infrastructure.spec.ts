import { test, expect, Page } from "@playwright/test";

/**
 * Infrastructure E2E (akun NON-ADMIN) — Server Capacity & iRMC Checks.
 *
 * Strategi HYBRID (mengikuti source code):
 *  - Server Capacity: frontend/app/modules/monthly-server-check/page.tsx
 *      loadDashboard() -> GET /api/v1/capacity-planning/dashboard/stats (metrik)
 *                       + GET /api/v1/capacity-planning/servers
 *      fetchScanModeInfo() -> GET /api/v1/capacity-planning/scan-mode
 *      UI: <h1>📈 Server Capacity Monitoring</h1> + tabel dashboard server.
 *  - iRMC Checks: frontend/app/modules/irmc/page.tsx
 *      fetchFolders() -> GET /api/v1/irmc-folders
 *      fetchStats()   -> GET /api/v1/irmc-check/stats
 *      fetchChecks()  -> GET /api/v1/irmc-check
 *      UI: <h1>IRMC Checks</h1> + panel/tabel "Folders".
 *
 * Semua endpoint di atas hanya butuh get_current_user (autentikasi biasa, tanpa role
 * khusus) -> akun non-admin harus dapat 200. Test NON-DESTRUKTIF: hanya GET read-only.
 *
 * Login sekali (beforeAll), token disuntik ke sessionStorage tiap test (hindari rate-limit
 * /token 5/menit). Lihat tests/admin-setting.spec.ts untuk pola yang sama.
 */

// Credentials from env — never hardcode real passwords in a committed file.
// Run with: SA_USER=soni SA_USER_PASS='...' npx playwright test -c playwright.admin-setting.config.ts
const USER = process.env.SA_USER || "soni";
const PASS = process.env.SA_USER_PASS || "";

/** URL request browser (via proxy Next.js): /api/proxy/api/v1/<path> */
const CAPACITY_STATS = "capacity-planning/dashboard/stats";
const CAPACITY_SERVERS = "capacity-planning/servers";
const IRMC_STATS = "irmc-check/stats";
const IRMC_FOLDERS = "irmc-folders";

/**
 * Login satu langkah (OTP default nonaktif) -> kembalikan token sessionStorage.
 * Backend membatasi /token ke 5/menit; bila 429 tunggu ~61s lalu ulang sekali.
 * Skip bila OTP aktif.
 */
async function login(page: Page): Promise<string> {
  if (!PASS) throw new Error("Set SA_USER_PASS (and optionally SA_USER) env before running.");
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto("/login");
    await page.locator('input[type="text"]').first().fill(USER);
    await page.locator('input[type="password"]').first().fill(PASS);
    await page.locator('button[type="submit"]').click();

    const outcome = await Promise.race([
      page
        .waitForURL((u) => new URL(u).pathname === "/", { timeout: 20000 })
        .then(() => "home" as const),
      page
        .getByText("Send OTP Code")
        .waitFor({ state: "visible", timeout: 20000 })
        .then(() => "otp" as const),
      page
        .getByText("Too many requests")
        .first()
        .waitFor({ state: "visible", timeout: 20000 })
        .then(() => "ratelimited" as const),
    ]).catch(() => "error" as const);

    if (outcome === "home") {
      const token = await page.evaluate(() => sessionStorage.getItem("sa_auth_token"));
      if (!token) throw new Error("Login sukses tapi token sa_auth_token tidak ditemukan.");
      return token;
    }
    if (outcome === "otp") {
      test.skip(true, "OTP aktif (security.otp_enabled=true); test butuh OTP nonaktif.");
    }
    if (outcome === "ratelimited" && attempt === 1) {
      await page.waitForTimeout(61000); // window rate-limit /token (5/menit) reset
      continue;
    }
    const err = (await page.locator(".bg-red-100").first().textContent().catch(() => null)) || "";
    throw new Error(
      `Login gagal (attempt ${attempt}): tidak sampai ke halaman utama. Pesan UI: "${err.trim()}". ` +
        `Pastikan app berjalan di 3443 dan akun ${USER} ada di DB.`,
    );
  }
  throw new Error("Login gagal setelah retry rate-limit.");
}

test.describe("Infrastructure — akun non-admin (non-destruktif)", () => {
  // Login SEKALI (backend /token dibatasi 5/menit); token dipakai ulang lewat injeksi
  // sessionStorage sebelum SPA hidrasi — tanpa login berulang.
  let authToken: string;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      baseURL: "https://127.0.0.1:3443",
    });
    const p = await ctx.newPage();
    try {
      authToken = await login(p);
    } finally {
      await ctx.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((t) => {
      try {
        sessionStorage.setItem("sa_auth_token", t as string);
      } catch {
        /* ignore */
      }
    }, authToken);
  });

  // ---------------- Server Capacity ----------------

  test("C1: Server Capacity — GET metrik dashboard & servers balas 200", async ({ page }) => {
    const statsP = page.waitForResponse(
      (r) => r.url().includes(CAPACITY_STATS) && r.request().method() === "GET",
      { timeout: 25000 },
    );
    const serversP = page.waitForResponse(
      (r) => r.url().includes(CAPACITY_SERVERS) && r.request().method() === "GET",
      { timeout: 25000 },
    );
    await page.goto("/modules/monthly-server-check");

    const stats = await statsP;
    const servers = await serversP;
    expect(stats.status(), "GET capacity-planning/dashboard/stats seharusnya 200").toBe(200);
    expect(servers.status(), "GET capacity-planning/servers seharusnya 200").toBe(200);
  });

  test("C2: Server Capacity — UI smoke (judul & tabel server ter-render)", async ({ page }) => {
    await page.goto("/modules/monthly-server-check");
    await expect(
      page.getByRole("heading", { name: /Server Capacity Monitoring/i }),
    ).toBeVisible({ timeout: 20000 });
    // Kontrol pencarian server & tabel dashboard selalu dirender di bagian dashboard.
    await expect(page.getByPlaceholder("Search server...")).toBeVisible();
    await expect(page.locator("table").first()).toBeVisible();
  });

  // ---------------- iRMC Checks ----------------

  test("R1: iRMC Checks — GET status/stats & folders balas 200", async ({ page }) => {
    const statsP = page.waitForResponse(
      (r) => r.url().includes(IRMC_STATS) && r.request().method() === "GET",
      { timeout: 25000 },
    );
    const foldersP = page.waitForResponse(
      (r) => r.url().includes(IRMC_FOLDERS) && r.request().method() === "GET",
      { timeout: 25000 },
    );
    await page.goto("/modules/irmc");

    const stats = await statsP;
    const folders = await foldersP;
    expect(stats.status(), "GET irmc-check/stats seharusnya 200").toBe(200);
    expect(folders.status(), "GET irmc-folders seharusnya 200").toBe(200);
  });

  test("R2: iRMC Checks — UI smoke (judul & panel/tabel status ter-render)", async ({ page }) => {
    await page.goto("/modules/irmc");
    await expect(page.getByRole("heading", { name: "IRMC Checks", exact: true })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByRole("heading", { name: "Folders", exact: true })).toBeVisible();
    await expect(page.locator("table").first()).toBeVisible();
  });
});
