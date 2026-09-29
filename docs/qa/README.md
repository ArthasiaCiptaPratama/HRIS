# QA HRIS — Indeks

Jejak **aturan (PLAN) → kasus uji → test otomatis/manual → hasil**. Format: skill `hris-qa-docs`.

| Jenis | File | Keterangan |
|---|---|---|
| Rencana | [plans/2026-09-29-staging.md](plans/2026-09-29-staging.md) | Staging Vercel (D-036): smoke, auth sungguhan, matriks akses, UI per role |
| Rencana | [plans/2026-09-29-personal-management.md](plans/2026-09-29-personal-management.md) | Target D-035: web Personal Management + API employee/organization |
| Kasus | [cases/staging.md](cases/staging.md) | TC-STG-001 s.d. TC-STG-058 |
| Kasus | [cases/employee.md](cases/employee.md) | TC-EMP-001 s.d. TC-EMP-032 |
| Hasil | [runs/2026-09-29-staging.md](runs/2026-09-29-staging.md) | Staging `43b2b69`: API 43/43, UI 31/31 LULUS; BUG-001 (P3) |
| Hasil | [runs/2026-09-29-personal-management.md](runs/2026-09-29-personal-management.md) | Lokal, Linux; semua P1 & P2 LULUS; + sesi akun HR (18/18) |
| Bukti visual | `/mnt/winD/WORK/Magang/QA/<tanggal>-<target>/` | Di luar repo (skill hris-qa-docs) |
| Bug | [bugs/BUG-001-hydratefallback-warning.md](bugs/BUG-001-hydratefallback-warning.md) | P3 DIPERBAIKI: warning konsol `HydrateFallback` (test `router-hydration.test.tsx`) |
