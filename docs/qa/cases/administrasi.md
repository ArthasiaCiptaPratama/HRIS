# Kasus Uji — Halaman Administrasi & Akun Saya (web) + infrastruktur test

Otomasi: `apps/web/tests/admin-pages.test.tsx` (ADM), `apps/web/tests/auth-routing.test.tsx` (NAV), `apps/api/src/core/__tests__/app.test.ts` (APP), `apps/api/src/core/__tests__/env.test.ts` (ENV). Manual: skrip Playwright `/mnt/winD/WORK/Magang/QA/2026-09-30-seragam-admin/ui.ts` (UI).

| ID | Prioritas | Aturan | Role/grant | Prasyarat | Langkah | Hasil diharapkan | Otomasi |
|---|---|---|---|---|---|---|---|
| TC-ADM-001 | P2 | PROMPT §7 (DataTable bersama, paginasi server) | SA | ≥ 1 akun | Buka /akun, ganti "Baris per halaman" | `PageHeader` (h1 tunggal + breadcrumb "Administrasi"), tabel "Daftar akun", ringkasan "x–y dari n", request `pageSize` mengikuti pilihan | ADM, UI |
| TC-ADM-002 | P2 | PROMPT §7 | SA | filter tanpa hasil / daftar kosong | Cari email tak ada | EmptyState "Tidak ada yang cocok" / "Belum ada akun" | ADM, UI |
| TC-ADM-003 | P2 | PROMPT §7 | SA | grant ada | Buka /grant, filter "Semua" | Tabel "Daftar grant", email penerima, tombol Cabut; filter mengirim tanpa `active=true` | ADM, UI |
| TC-ADM-004 | P2 | PROMPT §7 | SA | audit ada | Buka /audit | Tabel "Daftar audit log"; kosong → "Belum ada entri audit" | ADM, UI |
| TC-ADM-005 | P3 | a11y (temuan 2026-09-29) | semua role | — | Buka /profil | Tepat satu h1 "Profil" + breadcrumb "Akun Saya" (tanpa label ganda) | ADM, UI |
| TC-ADM-006 | P2 | PROMPT §7 | semua role | ada / tanpa notifikasi | Buka /notifikasi | Daftar "Daftar notifikasi", "Tandai semua dibaca" aktif bila ada yang belum dibaca; kosong → EmptyState | ADM, UI |
| TC-ADM-007 | P1 | PLAN §4.3 (akses tidak berubah) | HR / MGR / EMP | login sungguhan | Buka /akun & /grant | HR: Akun tanpa "Ubah role", Grant → Akses ditolak; MGR/EMP: Akun → Akses ditolak | NAV, UI |
| TC-ADM-008 | P2 | UI mobile | SA 390 px | — | Buka 5 halaman | Tanpa scroll horizontal halaman, konsol bersih | UI |
| TC-ADM-009 | P1 | D-025 + Backlog 2026-09-29 | — | `.env` berisi SMTP_* lengkap | `bun run test` | `NODE_ENV=test` → pengirim `log` (tidak ada email sungguhan, tanpa timeout); di luar test SMTP lengkap → `smtp` | APP |
| TC-ADM-010 | P2 | PLAN §3.3 | — | — | `parseEnv` dengan `STORAGE_PATH_PREFIX` | Kosong / `dev/<nama>/` diterima; tanpa `/` akhir, `/` awal, `..`, huruf besar, spasi ditolak | ENV |
| TC-ADM-011 | P1 | D-040 akun per PT | HR ACP / HR tanpa PT / SA | akun karyawan ACP, PT lain, akun belum tertaut | GET /accounts, GET /accounts/:id, POST deactivate | HR ACP: akun ACP + belum tertaut, akun PT lain 404; HR tanpa PT: hanya belum tertaut; SA semua | INT (`tests/integration/iam/companies.test.ts`) |
| TC-ADM-012 | P1 | D-040 penugasan PT | SA / HR | akun HR | PUT /accounts/:id/companies | SA 200 + audit `iam.account.assign_companies` + notifikasi; cakupan HR langsung berubah; HR 403; akun non-HR 403; PT tak dikenal 422; ganda 400 | INT, WEB, UI |
| TC-ADM-013 | P2 | D-040 + D-034 | SA | akun HR ber-PT | PATCH role → MANAGER | Penugasan PT dicabut, audit `removedCompanyIds` | INT |
| TC-ADM-014 | P1 | Bug CORS PUT | browser | — | Preflight OPTIONS metode PUT | `Access-Control-Allow-Methods` memuat PUT (dan GET/POST/PATCH/DELETE) | APP (`src/core/__tests__/app.test.ts`) |
