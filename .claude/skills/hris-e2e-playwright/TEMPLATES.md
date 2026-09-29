# Templat Playwright

## playwright.config.ts
```ts
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const ROLES = ["super-admin", "hr-admin", "manager", "employee"] as const;

export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Artefak QA di luar repo (skill hris-e2e-playwright "Lokasi artefak").
  outputDir: `/mnt/winD/WORK/Magang/QA/${process.env.QA_RUN ?? new Date().toISOString().slice(0, 10)}-e2e/`,
  reporter: [["list"], ["html", { open: "never", outputFolder: "/mnt/winD/WORK/Magang/QA/e2e-report" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testDir: "setup", testMatch: /.*\.setup\.ts/ },
    ...ROLES.map((role) => ({
      name: role,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: path.join(".auth", `${role}.json`) },
      grep: new RegExp(`@${role}`),
    })),
  ],
  webServer: {
    command: "bun run dev",
    cwd: "..",
    url: "http://localhost:3000/api/v1/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

## setup/auth.setup.ts
```ts
import { expect, test as setup } from "@playwright/test";

const ACCOUNTS = {
  "hr-admin": { email: process.env.E2E_HR_ADMIN_EMAIL, password: process.env.E2E_HR_ADMIN_PASSWORD },
  // super-admin, manager, employee ...
};

for (const [role, { email, password }] of Object.entries(ACCOUNTS)) {
  setup(`login ${role}`, async ({ page }) => {
    if (!email || !password) throw new Error(`E2E credentials for ${role} are not set`);
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Kata sandi").fill(password);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page.getByRole("navigation", { name: "Menu utama" })).toBeVisible();
    await page.context().storageState({ path: `.auth/${role}.json` });
  });
}
```

## pages/employee-list.page.ts
```ts
import type { Page } from "@playwright/test";

export class EmployeeListPage {
  constructor(private readonly page: Page) {}
  goto() { return this.page.goto("/employees"); }
  search(text: string) { return this.page.getByRole("searchbox", { name: "Cari karyawan" }).fill(text); }
  row(name: string) { return this.page.getByRole("row", { name: new RegExp(name) }); }
}
```

## tests/employee/list.spec.ts
```ts
import { expect, test } from "@playwright/test";
import { EmployeeListPage } from "../../pages/employee-list.page";

test("@hr-admin mencari karyawan berdasarkan nama", async ({ page }) => {
  const list = new EmployeeListPage(page);
  await list.goto();
  await list.search("Budi");
  await expect(list.row("Budi")).toBeVisible();
});

test("@employee tidak bisa membuka daftar karyawan", async ({ page }) => {
  await page.goto("/employees");
  await expect(page.getByText("Anda tidak memiliki akses")).toBeVisible();
});
```

Label/teks di templat ini adalah contoh; sesuaikan dengan UI nyata saat halaman dibuat.
