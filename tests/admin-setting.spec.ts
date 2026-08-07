import { test, expect, Page, Locator } from "@playwright/test";

/**
 * Admin Settings E2E — non-destruktif.
 *
 * Test ini mengikuti PERSIS logika di source code:
 *  - Login: frontend/app/login/page.tsx + frontend/lib/auth.tsx (POST form /api/v1/token)
 *  - Gating tab: frontend/lib/rbac.ts (getVisibleTabs)
 *  - Validasi client-side & string pesan: frontend/app/modules/settings/page.tsx
 *  - Bug route-ordering: backend/api/settings.py (GET /settings/{category} menelan
 *    /settings/metrics & /settings/error-logs -> HTTP 400)
 *
 * Tidak ada aksi destruktif: hanya validasi client-side (tanpa hit backend) + GET read-only.
 */

// Credentials come from env — never hardcode real passwords in a committed file.
// Run with: SA_ADMIN_USER=admin SA_ADMIN_PASS='...' npx playwright test -c playwright.admin-setting.config.ts
const ADMIN_USER = process.env.SA_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.SA_ADMIN_PASS || "";
const SETTINGS_PATH = "/modules/settings";

// 15 tab yang seharusnya terlihat superadmin (rbac.ts ALL_SETTINGS_TABS; asset-metadata TIDAK termasuk)
const SUPERADMIN_TABS = [
  "Users",
  "Pending Approvals",
  "Roles",
  "Module Access",
  "SMTP",
  "General",
  "Security",
  "Notification",
  "API & Integrations",
  "Backup",
  "Admin UI",
  "Sessions",
  "Data Retention",
  "AI Audit Trail",
  "System Health",
];

/**
 * Login satu langkah (OTP default nonaktif) dan kembalikan token dari sessionStorage.
 * Backend membatasi /token ke 5/menit; bila kena 429 tunggu ~61s lalu coba lagi.
 * Skip bila OTP aktif.
 */
async function login(page: Page): Promise<string> {
  if (!ADMIN_PASS) throw new Error("Set SA_ADMIN_PASS (and optionally SA_ADMIN_USER) env before running.");
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto("/login");
    await page.locator('input[type="text"]').first().fill(ADMIN_USER);
    await page.locator('input[type="password"]').first().fill(ADMIN_PASS);
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
      await page.waitForTimeout(61000); // tunggu window rate-limit /token (5/menit) reset
      continue;
    }
    const err = (await page.locator(".bg-red-100").first().textContent().catch(() => null)) || "";
    throw new Error(
      `Login gagal (attempt ${attempt}): tidak sampai ke halaman utama. Pesan UI: "${err.trim()}". ` +
        `Pastikan app berjalan di 3443 dan akun ${ADMIN_USER} ada di DB.`,
    );
  }
  throw new Error("Login gagal setelah retry rate-limit.");
}

/** Locator sidebar nav settings (nav yang memuat tombol "System Health"). */
function settingsNav(page: Page): Locator {
  return page.locator("nav").filter({ has: page.getByRole("button", { name: "System Health" }) });
}

/** Buka halaman settings dan tunggu sidebar siap. */
async function gotoSettings(page: Page): Promise<Locator> {
  await page.goto(SETTINGS_PATH);
  const nav = settingsNav(page);
  await expect(nav.getByRole("button", { name: "General" })).toBeVisible({ timeout: 20000 });
  return nav;
}

/** Ambil <input> yang mengikuti sebuah <label> (struktur InputField: label lalu input). */
function inputByLabel(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator("xpath=following-sibling::input");
}

test.describe("Admin Settings (non-destruktif)", () => {
  // Login SEKALI saja (backend /token dibatasi 5/menit). Token dipakai ulang di tiap test
  // dengan menyuntikkannya ke sessionStorage sebelum SPA hidrasi — tanpa login berulang.
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

  test("T1: superadmin melihat 15 tab dan TIDAK melihat Asset Metadata", async ({ page }) => {
    const nav = await gotoSettings(page);
    for (const label of SUPERADMIN_TABS) {
      await expect(nav.getByRole("button", { name: label })).toBeVisible();
    }
    // rbac.ts: asset-metadata tidak ada di ALL_SETTINGS_TABS -> tersaring keluar
    await expect(nav.getByRole("button", { name: "Asset Metadata" })).toHaveCount(0);
    await expect(nav.getByRole("button")).toHaveCount(SUPERADMIN_TABS.length);
  });

  test("T2: validasi client-side tab Users (wajib diisi)", async ({ page }) => {
    const nav = await gotoSettings(page);
    await nav.getByRole("button", { name: "Users", exact: true }).click();
    await page.getByRole("button", { name: "+ Tambah User" }).click();

    // Simpan tanpa isi apa pun -> pesan merah "wajib diisi" (tanpa hit backend)
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page.getByText("Username, email, dan nama wajib diisi")).toBeVisible();

    // Isi username/email/nama, kosongkan password (user baru) -> "Password wajib untuk user baru"
    await inputByLabel(page, "Username").fill("qa_tester");
    await inputByLabel(page, "Email").fill("qa@example.com");
    await inputByLabel(page, "Nama Lengkap").fill("QA Tester");
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page.getByText("Password wajib untuk user baru")).toBeVisible();
  });

  test("T3: validasi client-side tab Roles (nama role wajib)", async ({ page }) => {
    const nav = await gotoSettings(page);
    await nav.getByRole("button", { name: "Roles", exact: true }).click();
    await page.getByRole("button", { name: "+ Tambah Role" }).click();
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page.getByText("Nama role wajib diisi")).toBeVisible();
  });

  test("T4: validasi client-side SMTP test (email kosong) -> banner MERAH", async ({ page }) => {
    const nav = await gotoSettings(page);
    await nav.getByRole("button", { name: "SMTP" }).click();
    await page.getByRole("button", { name: "Kirim Test" }).click();
    const msg = "Masukkan email tujuan untuk test";
    await expect(page.getByText(msg)).toBeVisible();
    // Pesan validasi harus berwarna merah (bukan hijau) — regresi warna banner.
    await expect(page.locator("div.mb-5").filter({ hasText: msg })).toHaveClass(/bg-red-900/);
  });

  test("T5: validasi client-side Admin UI (password kosong) -> banner MERAH", async ({ page }) => {
    const nav = await gotoSettings(page);
    await nav.getByRole("button", { name: "Admin UI" }).click();
    await page.getByRole("button", { name: "Save & Restart" }).click();
    const msg = "Password tidak boleh kosong";
    await expect(page.getByText(msg)).toBeVisible();
    await expect(page.locator("div.mb-5").filter({ hasText: msg })).toHaveClass(/bg-red-900/);
  });

  test("T6: kontras — GET kategori valid /settings/security balas 200", async ({ page }) => {
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/settings/security"), { timeout: 20000 }),
      page.goto(SETTINGS_PATH),
    ]);
    expect(resp.status(), "GET /settings/security (kategori valid) seharusnya 200").toBe(200);
  });

  test("T7: BUG — System Health metrics & error-logs seharusnya 200 (aktual 400)", async ({ page }) => {
    const nav = await gotoSettings(page);
    const metricsP = page.waitForResponse((r) => r.url().includes("/settings/metrics"), {
      timeout: 20000,
    });
    const logsP = page.waitForResponse((r) => r.url().includes("/settings/error-logs"), {
      timeout: 20000,
    });
    await nav.getByRole("button", { name: "System Health" }).click();

    const metrics = await metricsP;
    const logs = await logsP;
    expect(
      metrics.status(),
      "GET /settings/metrics seharusnya 200; jika 400 => route /settings/{category} menelannya (bug)",
    ).toBe(200);
    expect(
      logs.status(),
      "GET /settings/error-logs seharusnya 200; jika 400 => route /settings/{category} menelannya (bug)",
    ).toBe(200);
  });
});
