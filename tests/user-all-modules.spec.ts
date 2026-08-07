import { test, expect, Page } from "@playwright/test";

/**
 * E2E Hybrid — SELURUH modul yang diizinkan untuk akun NON-ADMIN (`soni`).
 *
 * Untuk tiap modul: pendekatan HYBRID, murni READ-ONLY / non-destruktif:
 *   1. API   : authenticated GET ke endpoint utama modul -> harus 200.
 *   2. UI    : navigasi ke route modul -> heading/elemen utama ter-render.
 *
 * Endpoint & heading diambil dari source code:
 *   - Routing menu : frontend/lib/navigation.ts
 *   - GET per modul: apiRequest(...) di tiap frontend/app/(modules/<x>)/page.tsx
 *   - Heading      : <h1>/<h2> utama tiap page (mis. PageContainer -> <h1>{title}</h1>)
 *
 * Semua endpoint hanya butuh get_current_user (autentikasi biasa) sehingga non-admin
 * dapat 200. Endpoint kategori settings "security"/"api" khusus superadmin (403) TIDAK
 * dipakai; modul Settings memakai /settings/general yang boleh dibaca non-admin.
 *
 * Login 1x di beforeAll; token dipakai ulang (API) & diinjeksi ke sessionStorage (UI)
 * agar tidak kena rate-limit /token (5/menit). Lihat tests/admin-setting.spec.ts.
 */

// Credentials from env — never hardcode real passwords in a committed file.
// Run with: SA_USER=soni SA_USER_PASS='...' npx playwright test -c playwright.admin-setting.config.ts
const USER = process.env.SA_USER || "soni";
const PASS = process.env.SA_USER_PASS || "";

/** Prefiks proxy Next.js untuk API backend v1 (lihat frontend/lib/auth.tsx). */
const API_PREFIX = "/api/proxy/api/v1";

interface ModuleCase {
  name: string; // label modul (dipakai sbagai judul test)
  route: string; // path halaman SPA
  api: string; // endpoint GET utama (relatif ke /api/v1)
  heading: RegExp; // teks heading utama yang harus tampil
}

// 21 leaf-menu yang diizinkan non-admin (grup Infrastructure/Security/Operations/Log/Backup
// diuraikan jadi submenu masing-masing).
const MODULES: ModuleCase[] = [
  { name: "01 Dashboard", route: "/", api: "/dashboard/enhanced", heading: /IT Management Dashboard/i },
  { name: "02 Server Capacity", route: "/modules/monthly-server-check", api: "/capacity-planning/dashboard/stats", heading: /Server Capacity Monitoring/i },
  { name: "03 iRMC Checks", route: "/modules/irmc", api: "/irmc-check/stats", heading: /IRMC Checks/i },
  { name: "04 Vulnerability Report", route: "/modules/vulnerability", api: "/vulnerability-report/stats", heading: /Vulnerability Report/i },
  { name: "05 Incident Report", route: "/modules/incident", api: "/incident-report/stats", heading: /Incident Report/i },
  { name: "06 Risk Assessment", route: "/modules/risk", api: "/isu-matrix?page=1&page_size=1", heading: /Risk Assessment/i },
  { name: "07 Quality Objectives", route: "/modules/quality", api: "/quality-objectives/stats", heading: /Quality Objectives/i },
  { name: "08 Audit File", route: "/modules/audit", api: "/audit/dashboard/stats", heading: /Audit File/i },
  { name: "09 Asset Management", route: "/modules/assets", api: "/assets/stats", heading: /Asset Register/i },
  { name: "10 Worklog", route: "/modules/worklog", api: "/worklog/stats", heading: /Worklog/i },
  { name: "11 Project Tasks", route: "/modules/tasks", api: "/project-tasks/stats", heading: /Project Tasks/i },
  { name: "12 Documentation", route: "/modules/documentation", api: "/documents/stats", heading: /Document Library/i },
  { name: "13 Form Uploads", route: "/modules/forms", api: "/form-types", heading: /Form Uploads/i },
  { name: "14 Log Deletion", route: "/modules/log-deletion", api: "/log-maintenance?page=1&page_size=1", heading: /Log Deletion/i },
  { name: "15 Log Compression", route: "/modules/log-compression", api: "/log-compression?page=1&page_size=1", heading: /Log Compression/i },
  { name: "16 SSH Report", route: "/modules/ssh-report", api: "/ssh-report/dashboard/stats", heading: /SSH Login Report/i },
  { name: "17 Backup Check", route: "/modules/backup-check", api: "/backup-check/servers", heading: /Backup Check/i },
  { name: "18 Backup Analytics", route: "/modules/backup-analytics", api: "/backup-analytics/analytics/dashboard", heading: /Analytics Backup/i },
  { name: "19 Activity Logs", route: "/modules/activity", api: "/activity-logs?page=1&page_size=1", heading: /Activity Logs/i },
  { name: "20 Notifications", route: "/modules/notifications", api: "/notifications/unread-count", heading: /Notifications/i },
  { name: "21 Settings", route: "/modules/settings", api: "/settings/general", heading: /^Settings$/ },
];

/**
 * Login satu langkah (OTP default nonaktif) -> kembalikan token sessionStorage.
 * Backend membatasi /token ke 5/menit; bila 429 tunggu ~61s lalu ulang sekali.
 */
async function login(page: Page): Promise<string> {
  if (!PASS) throw new Error("Set SA_USER_PASS (and optionally SA_USER) env before running.");
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto("/login");
    await page.locator('input[type="text"]').first().fill(USER);
    await page.locator('input[type="password"]').first().fill(PASS);
    await page.locator('button[type="submit"]').click();

    const outcome = await Promise.race([
      page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 20000 }).then(() => "home" as const),
      page.getByText("Send OTP Code").waitFor({ state: "visible", timeout: 20000 }).then(() => "otp" as const),
      page.getByText("Too many requests").first().waitFor({ state: "visible", timeout: 20000 }).then(() => "ratelimited" as const),
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

test.describe("Non-admin — semua modul (Hybrid, non-destruktif)", () => {
  let authToken: string;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: "https://127.0.0.1:3443" });
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

  for (const m of MODULES) {
    test(m.name, async ({ page }) => {
      // 1) API: GET endpoint utama -> 200 (bukti akses baca non-admin ke modul)
      const resp = await page.request.get(`${API_PREFIX}${m.api}`, {
        headers: { Authorization: `Bearer ${authToken}`, Origin: "https://127.0.0.1:3443" },
      });
      expect(resp.status(), `[API] GET ${m.api} untuk "${m.name}" seharusnya 200`).toBe(200);

      // 2) UI smoke: navigasi & heading utama ter-render
      await page.goto(m.route);
      await expect(
        page.getByRole("heading", { name: m.heading }).first(),
        `[UI] heading modul "${m.name}" (${m.heading}) tidak tampil di ${m.route}`,
      ).toBeVisible({ timeout: 20000 });
    });
  }
});
