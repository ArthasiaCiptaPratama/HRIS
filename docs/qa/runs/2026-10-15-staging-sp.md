# Hasil Uji — Surat Peringatan & header detail karyawan di staging (rilis gel. 8, 2026-10-15)

- **Commit:** develop `7de4d1f` → rilis merge `905649a` (`merge: rilis gel. 8 — surat peringatan tampil, header detail karyawan, time management tetap tersembunyi`) · **Branch:** `HRIS/Oatse/rilis` → PR #51 (`HRIS/debug/database`, merge `d2a70b6`) → PR #52 (`HRIS/debug/fe-be`, merge `3e31d9d`) → `Deploy staging` #38718943479 ✔
- **Verifikasi develop sebelum push:** typecheck ✔ · biome ✔ (1 warning lama) · boundaries ✔ (444 modul) · test shared **230** · api **777** · web **283** (`--maxWorkers=4`) · build ✔ · CI #38717387758 ✔
- **Verifikasi rilis (folder `HRIS-rilis`, DB `hris_release`):** `db:deploy` 2 migrasi ✔ (sempat 17 test api gagal karena DB rilis belum dimigrasi — bukan kode) · `db:check` ✔ · typecheck ✔ · biome ✔ · boundaries ✔ · test shared 230 · api 777 · web 279 + 4 dilewati (Lokasi Absen, saklar TM `false`) · build ✔ · CI PR #51 & #52 ✔
- **Staging sebelum deploy:** 35 migrasi, 0 gagal.
- **Script:** `/mnt/winD/WORK/Magang/QA/2026-10-15-staging-sp/qa-staging-sp.ts` (RUN 9549; salinan QA lokal, URL staging, tanpa hari ALPHA) + `qa-staging-s12.ts` (header + TM) + `tm-check.ts`.

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-STG-088 | LULUS | 37 migrasi, 0 gagal; `discipline.violation_types` DISIPLIN, K3, LAIN, MANGKIR, TELAT; `discipline_settings` 6; health 200 `database ok`; web 200; advisor security tanpa temuan baru (INFO RLS `_prisma_migrations`, WARN leaked password — sudah di Backlog); performance: INFO unused index (tabel baru) & FK `leave_requests` (lama) |
| TC-STG-089 | LULUS | `/api/cron/discipline-daily` tanpa secret 401 |
| TC-STG-090 | LULUS | `/time/absen-harian`, `/time/lokasi-absen` → "sedang disiapkan"; `/absen` → Akses ditolak (SA tanpa data karyawan, sama dengan gel. 7) — `S-12-tm-segera.png` |
| TC-STG-091 | LULUS | S-01 — `S-01.png`; jenis `Q9549` diarsipkan di akhir (PUT 200) |
| TC-STG-092 | LULUS | S-02: saran SP 1, "Karyawan ini tidak punya hari ALPHA." — `S-02.png` |
| TC-STG-093 | LULUS | S-03 — `S-03-pdf.png` |
| TC-STG-094 | LULUS | S-04: `001/SP1/HRD-ACP/X/2026` — `S-04.png` |
| TC-STG-095 | LULUS | S-05 — `S-05-pdf.png` |
| TC-STG-096 | LULUS | S-06: scan ke storage staging, terlampir — `S-06.png` |
| TC-STG-097 | LULUS | S-07: `QA/9549/SP3`, alasan & catatan PHK — `S-07.png` |
| TC-STG-098 | LULUS | S-08 — `S-08.png` |
| TC-STG-099 | LULUS | S-09: 2 notifikasi tanpa isi; dikonfirmasi — `S-09.png` |
| TC-STG-100 | LULUS | S-10: scroll 0 — `S-10.png` |
| TC-STG-101 | LULUS | S-11 — `S-11.png` |
| TC-STG-102 | LULUS | "Karyawan Tetap \| Masih bekerja", "Bisa login", banner ada, 0 error JS — `S-12-header.png` |

**Catatan:**
- Putaran 1 (RUN 9549): S-01…S-11 LULUS, S-12 GAGAL karena selector script ("Status Karyawan" muncul di header & tabel di belakang panel) → diulang dengan selector di dalam header (`qa-staging-s12.ts`) → LULUS. Bukan bug aplikasi.
- Grant `employee.discipline.write` untuk HR uji (Siti) diberikan SA lewat API (audit) dan **dipertahankan** (izin pemilik projek). Data uji di staging: SP Rizky `001/SP1/HRD-ACP/X/2026` (berlaku, dikonfirmasi) & `QA/9549/SP3` (dicabut); jenis `Q9549` diarsipkan.
- Pendaftaran cron `discipline-daily` di dashboard Vercel **belum diverifikasi** (MCP Vercel 403 untuk scope tim `oatses-projects`); endpoint ter-deploy (401 tanpa secret) dan `apps/api/vercel.json` di commit deploy memuat jadwal `45 0 * * *`.
- Screenshot diperiksa: hanya karyawan akun uji (Rizky Ramadhan, Andi Wijaya, Siti Rahmawati) yang tampil, tanpa data asli.

**Arsip Drive:** `hris-qa:2026-10-15-staging-sp` — 39 file (plan, run, plan/run lokal, cases, 33 screenshot `lokal-`/`staging-`), 2026-10-15.

**Kesimpulan:** semua P1/P2 LULUS di lokal (`2026-10-15-sp-lokal`) dan staging → Surat Peringatan **LEGIT**.
