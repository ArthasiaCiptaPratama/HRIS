# Hasil Uji — Aset & APD di staging (rilis gel. 7, 2026-10-14)

- **Commit:** develop `5859111` → rilis merge `df9776e` + saklar `219b372` (`feat: tampilkan aset dan apd di jalur rilis, time management disembunyikan`) · **Branch:** `HRIS/Oatse/rilis` → PR #49 (`HRIS/debug/database`, merge `6864a1a`) → PR #50 (`HRIS/debug/fe-be`, merge `03dac3b`) · **Env:** staging (Vercel `hris-staging-api`/`hris-staging-web`, Supabase staging)
- **Verifikasi develop sebelum push:** typecheck ✔ · `biome ci` ✔ (510 file, 1 warning lama `employee-print.test.ts:485`) · boundaries ✔ (418 modul) · `db:check` ✔ · test shared **215** · api **717** · web **262** (`--maxWorkers=4`) · build ✔ · CI #38509210626 ✔.
- **Verifikasi rilis (folder `HRIS-rilis`, DB `hris_release`):** `db:deploy` 8 migrasi ✔ · `db:check` ✔ · typecheck ✔ · biome ✔ · boundaries ✔ · test shared 215 · api 717 · web 262 · build ✔ · CI PR #49 & #50 ✔ · `Deploy staging` #38509894453 ✔ (migrasi, api, web).
- **Staging sebelum deploy (MCP read-only):** 27 migrasi, 0 gagal.
- **Script:** `/mnt/winD/WORK/Magang/QA/2026-10-14-staging-aset/qa-aset.ts` (salinan QA lokal, URL staging; putaran 2 memilih PT eksplisit) + `tm-hidden.ts`.

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-STG-073 | LULUS | 35 migrasi, 0 gagal, terakhir `20261013095006_add_asset_module`; skema `asset` 5 tabel; skema `attendance`/`leave`/`approval` 19 tabel; health 200 `database ok`; web 200; advisor security tanpa temuan baru (INFO RLS `_prisma_migrations`, WARN leaked password — lama) |
| TC-STG-074 | LULUS | cron `asset-daily` tanpa secret 401; `/api/v1/asset-categories` tanpa login 401 |
| TC-STG-075 | LULUS | SA: absen-harian, roster, kalender → Maintenance, `/time/cuti` & `/absen` → "Akses ditolak" (SA tanpa data karyawan; menu semua SEGERA); EMP: `/absen`, `/time/cuti` → Maintenance — `T-01-tm-segera.png` |
| TC-STG-076 | LULUS | L-01 — `L-01.png` |
| TC-STG-077 | LULUS | L-02: kode `ACP-Q1440-0001`, harga Rp 15.250.000 untuk SA — `L-02.png` |
| TC-STG-078 | LULUS | L-03 — `L-03.png` |
| TC-STG-079 | LULUS | L-04: `BAST-serah-ACP-Q1440-0001-2026-10-14.pdf`, logo Arthasia, tanpa harga — `L-04-bast-serah.png` |
| TC-STG-080 | LULUS | L-05 — `L-05.png` |
| TC-STG-081 | LULUS | L-06 — `L-06.png` |
| TC-STG-082 | LULUS | L-07 — `L-07.png` |
| TC-STG-083 | LULUS | L-08 — `L-08.png` |
| TC-STG-084 | LULUS | L-09 — `L-09.png` |
| TC-STG-085 | LULUS | L-10: scroll 0 — `L-10.png` |
| TC-STG-086 | LULUS | L-11: peringatan 2 item (tidak disimpan) — `L-11.png` |
| TC-STG-087 | LULUS | L-12: Perbaikan; `BAST-K/ACP-Q1440-0001/20261014/756B7A` ≠ `BAST-S/…`; 0 error konsol/5xx — `L-12-bast-kembali.png` |

**Catatan:**
- **Putaran 1 (RUN 1134): 3/12.** L-02 gagal karena kolom **Perusahaan** di form Tambah aset kosong ("Pilih PT") → server 400 → langkah L-03…L-07, L-09, L-10, L-12 ikut gagal (bergantung aset). Penyebab: nilai bawaan PT diisi `companies[0]` saat dialog dibuka, tetapi di staging data master belum termuat pada saat itu (efek hanya bergantung pada `open`); di lokal data sudah tercache. Pengguna tetap bisa memilih PT dan mendapat toast error bila lupa — **temuan P3** (bawaan PT tidak terisi bila data master terlambat), dicatat di Backlog, tidak diperbaiki di rilis ini. Bukti putaran 1 di `run1/`.
- **Putaran 2 (RUN 1440): 12/12**, script memilih PT eksplisit (seperti pengguna).
- Screenshot diperiksa: hanya karyawan akun uji (Rizky Ramadhan) yang tampil, tanpa nama asli D-066.
- Data uji tersisa di staging: kategori & jenis APD `Q1134`, `Q1440`; aset `ACP-Q1440-0001` (status Perbaikan); pembagian Helm `Q1440` (dikonfirmasi) dan Helm `Q1134` (belum dikonfirmasi) untuk Rizky; scan BAST (dokumen `BAST_ASSET`) di storage staging; notifikasi in-app terkait.

**Arsip Drive:** `hris-qa:2026-10-14-staging-aset` — 21 file (plan, run, cases 15 kasus, 15 screenshot, 2 PDF BAST + hasil.json), 2026-10-14.

**Kesimpulan:** semua P1/P2 LULUS di staging; QA lokal 12/12 (run `2026-10-14-aset-lokal`) → fitur Aset & APD gel. 2a **LEGIT**. **Bug terbuka:** tidak ada P1/P2; 1 temuan P3 (Backlog).
