# Rencana Uji — Aset & APD gel. 2a, lokal (ARS-D1–D6, 2026-10-14)

- **Ruang lingkup:** fitur [arsip](../../features/arsip/README.md) gelombang 2a — kategori aset & jenis APD, aset per unit (kode otomatis, harga terbatas), serah-terima, BAST (PDF + scan), konfirmasi terima di Layanan Mandiri, pembagian APD, peringatan karyawan keluar, pengembalian & tandai hilang, cron `asset-daily`.
- **Aturan yang diuji:** ARS-D1–D6, PLAN §4.2 (`asset.manage`), §4.3 baris aset (SA / HR PT / MANAGER tim / diri sendiri), PROMPT §3.7 (notifikasi tanpa harga), PROMPT §4 (harga tanpa `number`).
- **Di luar lingkup:** staging (belum dirilis: migrasi `20261013095006_add_asset_module` + cron baru); import Excel inventaris (ARS-D4, menyusul); notifikasi email cron di lingkungan nyata (diuji di integration dengan dedupe).
- **Lingkungan:** lokal develop `e378730` + perbaikan nomor BAST (belum di-commit saat uji), API :3000 + web :5173 + PostgreSQL 17 Docker (`hris`), login Supabase Auth staging akun uji; storage file BAST = Supabase staging berawalan `dev/oatse/`. Playwright headless (playwright-core + chrome-headless-shell 1243), `pdftotext`/`pdftoppm` untuk isi PDF.
- **Data uji:** kategori `Q<RUN>`, jenis `H<RUN>`/`S<RUN>`, aset `Laptop QA <RUN>` (SN `SN-QA-<RUN>`), karyawan akun uji Rizky Ramadhan (bawahan Andi Wijaya / MGR uji).
- **Kriteria lulus:** semua P1 & P2 LULUS; tidak ada bug P1/P2 terbuka; 0 error JS/5xx.
- **Suite:** [cases/employee.md](../cases/employee.md) TC-EMP-215 s.d. TC-EMP-226 + test otomatis (shared `asset.test.ts`, api `asset.policy.test.ts`, `asset-bast.test.ts`, `tests/integration/asset/assets.test.ts`, web `tests/assets.test.tsx`).
