---
name: hris-e2e-playwright
description: Konvensi & templat menulis dan menjalankan test end-to-end Playwright untuk web HRIS (login Supabase staging per role, data uji, selector bahasa Indonesia, artefak). Use when writing, running, or debugging Playwright/E2E/UI automation scripts, browser tests, login-as-role flows, or when the user asks for "script playwright", "uji coba UI", "e2e".
---

# E2E Playwright HRIS

Sumber: PROMPT §10 (E2E = alur utama, lokal: API + PostgreSQL lokal, login sungguhan ke Supabase **staging** dengan akun uji), PLAN §3.3 (plus-addressing), PLAN §7 Fase 9.

## Setup pertama (sekali, bila folder `e2e/` belum ada)

1. Workspace baru `e2e/` (`name: @hris/e2e`) + tambahkan `"e2e"` ke `workspaces` root.
2. `bun add -d @playwright/test@<versi-terbaru-exact>` di `e2e/`, lalu `bunx playwright install chromium`.
3. Script root `test:e2e` = `bun run --filter @hris/e2e test`. Catat di CODEMAP §1 & §9.
4. `playwright.config.ts` dari [TEMPLATES.md](TEMPLATES.md): `baseURL` `http://localhost:5173`, `webServer` menjalankan `bun run dev` dari root, `trace: "retain-on-failure"`, project `setup` untuk login.

## Aturan

- **Akun uji saja**, email plus-addressing developer dengan penanda env: `nama+e2e-hr@gmail.com`. Password dari env `E2E_<ROLE>_PASSWORD` (tidak pernah di-commit; tambahkan ke `.env.example` tanpa nilai).
- Login sekali per role di project `setup` → `storageState` di `e2e/.auth/<role>.json` (gitignore).
- Selector: `getByRole` / `getByLabel` / `getByText` dengan teks UI bahasa Indonesia. `data-testid` hanya bila tidak ada alternatif yang aksesibel.
- Data uji dibuat lewat API (bukan klik UI panjang) dan diberi penanda `RUN` unik; dibersihkan di `afterAll`.
- Jangan pakai `waitForTimeout`; tunggu kondisi (`expect(...).toBeVisible()`, `waitForResponse`).
- Setiap test memeriksa juga **akses ditolak** untuk role yang tidak berhak (PLAN §4.3), bukan hanya jalur sukses.
- Tidak ada data asli / NIK asli di fixture. NIK/NPWP fiktif berformat valid.
- Artefak (`playwright-report/`, `test-results/`) tidak di-commit.

## Struktur

```
e2e/
├── playwright.config.ts
├── fixtures/           # test.extend: api client ber-token, factory data, RUN
├── pages/              # page object tipis per halaman (locator + aksi), tanpa assertion
├── setup/auth.setup.ts # login per role → .auth/<role>.json
└── tests/<modul>/<alur>.spec.ts
```

Nama test: kalimat bahasa Indonesia yang menjelaskan perilaku, mis. `"HR_ADMIN tanpa grant tidak melihat NIK karyawan"`.

## Menjalankan

```
bun run db:up && bun run test:e2e                       # headless
bunx --cwd e2e playwright test --ui                      # mode UI
bunx --cwd e2e playwright show-report                    # laporan terakhir
```

Hasil & bukti (screenshot/trace) untuk laporan QA → skill `hris-qa-docs`.

Templat config, auth setup, page object, dan spec: [TEMPLATES.md](TEMPLATES.md).
