# QA HRIS — Indeks

Jejak **aturan (PLAN) → kasus uji → test otomatis/manual → hasil**. Format: skill `hris-qa-docs`.

| Jenis | File | Keterangan |
|---|---|---|
| Rencana | [plans/2026-09-29-staging.md](plans/2026-09-29-staging.md) | Staging Vercel (D-036): smoke, auth sungguhan, matriks akses, UI per role |
| Rencana | [plans/2026-09-29-personal-management.md](plans/2026-09-29-personal-management.md) | Target D-035: web Personal Management + API employee/organization |
| Rencana | [plans/2026-09-29-detail-print.md](plans/2026-09-29-detail-print.md) | Detail pegawai layar penuh, riwayat "diubah oleh", Print data (.xlsx) |
| Rencana | [plans/2026-09-29-foto-profil.md](plans/2026-09-29-foto-profil.md) | Foto profil + bucket Supabase `employee-photos` (D-037), foto ikut ter-print |
| Rencana | [plans/2026-09-30-seragam-admin.md](plans/2026-09-30-seragam-admin.md) | Seragam halaman Administrasi & Akun Saya, prefix Storage lokal, SMTP di test |
| Kasus | [cases/staging.md](cases/staging.md) | TC-STG-001 s.d. TC-STG-058 |
| Kasus | [cases/employee.md](cases/employee.md) | TC-EMP-001 s.d. TC-EMP-055 |
| Kasus | [cases/administrasi.md](cases/administrasi.md) | TC-ADM-001 s.d. TC-ADM-010 |
| Hasil | [runs/2026-09-29-staging.md](runs/2026-09-29-staging.md) | Staging `43b2b69`: API 43/43, UI 31/31 LULUS; BUG-001 (P3) |
| Hasil | [runs/2026-09-29-personal-management.md](runs/2026-09-29-personal-management.md) | Lokal, Linux; semua P1 & P2 LULUS; + sesi akun HR (18/18) |
| Hasil | [runs/2026-09-29-detail-print.md](runs/2026-09-29-detail-print.md) | Lokal, Linux: test api 248 · web 54, Playwright lokal 31/31 + staging 18/18 LULUS; 3 temuan diperbaiki saat uji |
| Hasil | [runs/2026-09-29-foto-profil.md](runs/2026-09-29-foto-profil.md) | Lokal + Storage staging: api 265 · web 64, smoke Storage, Playwright lokal 9/9 + staging 6/6 LULUS |
| Hasil | [runs/2026-09-30-seragam-admin.md](runs/2026-09-30-seragam-admin.md) | Lokal, Linux: api 271 · web 72 (SMTP terisi), Playwright 31/31 LULUS |
| Bukti visual | `/mnt/winD/WORK/Magang/QA/<tanggal>-<target>/` | Di luar repo (skill hris-qa-docs) |
| Bug | [bugs/BUG-001-hydratefallback-warning.md](bugs/BUG-001-hydratefallback-warning.md) | P3 DIPERBAIKI: warning konsol `HydrateFallback` (test `router-hydration.test.tsx`) |
