# Rencana Uji — Time Management Paket 1–3 + Dashboard Analitik, lokal (2026-10-21)

- **Ruang lingkup:**
  - Paket 1: lembur (TM-D6), absen istirahat (TM-D7), upah grade, template roster JT, 13+1, 5+2 (TM-D8).
  - Paket 2: aturan cuti TM-D9 (hangus 31 Des, ajukan ulang, karyawan keluar, cuti bersama).
  - TM-D11 (Alpha pindah ke Rekap) dan feature flag TM.
  - Paket 3: dashboard analitik DSB-D1, analitik tim atasan, 3 seksi, widget kecil, donut.
- **Di luar lingkup:**
  - Staging/Supabase: migrasi Paket 1–2 belum dirilis, dan data Supabase tidak disentuh.
  - Cron `leave-daily` / `attendance-daily` di Vercel (belum terdaftar).
  - Ekspor payroll.
- **Lingkungan:** lokal. Postgres.app `localhost:5432/hris`, Supabase lokal `127.0.0.1:54321`, web `http://localhost:5173`, API `http://localhost:3000`.
- **Data uji:**
  1. `cd apps/api && bun run db:seed:time -- --demo --accounts`
  2. `DEV_ACCOUNT_PASSWORD='<password uji>' bun run db:seed:qa`
  3. Kedua script dijaga `guard-local-db` (menolak DB/Auth remote) dan idempoten.
- **Kriteria lulus:** semua P1 & P2 LULUS, tidak ada bug P1 terbuka.
- **Suite:** [cases/time-management.md](../cases/time-management.md). Ada dua kelompok:
  - TC-TM-001 s.d. TC-TM-027
  - TC-DSB-001 s.d. TC-DSB-009

## Akun uji (lokal saja, password sama untuk semua)

| Akun | Role | Terhubung ke | Dipakai untuk |
|---|---|---|---|
| superadmin.lokal@arthasia.test | SUPER_ADMIN | — | Semua menu, flag, dashboard penuh |
| hr.lokal@arthasia.test | HR_ADMIN **tanpa grant** | — | Pembanding: rupiah & pensiun harus tersembunyi |
| hr.biaya@arthasia.test | HR_ADMIN + `labor.cost.read` + `employee.personal.read` | PT demo | Rupiah lembur, upah grade, kompensasi keluar, biaya & liabilitas |
| manager.lokal@arthasia.test | MANAGER | Budi (TMDEMO-MGR) | Persetujuan lembur/cuti tim, analitik tim |
| karyawan.lokal@arthasia.test | EMPLOYEE | Rina (TMDEMO-EMP) | Cuti: saldo, ajukan, ajukan ulang |
| lapangan.lokal@arthasia.test | EMPLOYEE | Dimas (TMDEMO-LAP) | Absen HP + istirahat + lembur (shift QA 08–17, 14 hari ke depan) |

Data pendukung:
- Grade Staf memakai upah 5,7 jt + tunjangan 1,5 jt (Rp41.618/jam).
- Lokasi "Site Demo Absen (Lokal)" wajib absen istirahat.
- "Sari Keluar (Demo)" resign 30 Sep 2026 dengan sisa cuti 9 hari.

## Urutan uji yang disarankan

1. **Lembur & istirahat.**
   - Login `lapangan.lokal` di HP atau mode responsif.
   - Uji TC-TM-001 s.d. 006. Gunakan satu hari per skenario, karena Dimas punya roster 14 hari.
   - Absen di luar geofence bisa disimulasikan lewat lokasi browser, atau koreksi jam oleh HR.
2. **Persetujuan lembur.**
   - `manager.lokal` lalu `hr.biaya` → TC-TM-007.
   - Bandingkan `hr.biaya` dengan `hr.lokal` → TC-TM-008.
3. **Template roster.** Login `superadmin.lokal` → TC-TM-009 s.d. 011.
4. **Alpha.** Login HR → TC-TM-012, 013, 027.
5. **Cuti.**
   - `karyawan.lokal` mengajukan, `manager.lokal` menolak, lalu `karyawan.lokal` mengajukan ulang → TC-TM-020 s.d. 023.
   - `hr.biaya`, lalu `hr.lokal` → TC-TM-024 s.d. 026.
6. **Dashboard.**
   - Masuk bergantian ke `karyawan.lokal`, `hr.lokal`, `hr.biaya`, `manager.lokal`, `superadmin.lokal` → TC-DSB-001 s.d. 009.
7. **Feature flag (opsional).** TC-TM-014 di `apps/web/src/app/feature-flags.ts`. Kembalikan flag sesudahnya.

Bukti visual disimpan di luar repo: `/mnt/winD/WORK/Magang/QA/2026-10-21-tm-paket-lokal/` (di Mac pakai folder QA yang setara). Hasil dicatat di `runs/2026-10-21-tm-paket-lokal.md`.
