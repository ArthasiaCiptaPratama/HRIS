# Hasil Uji — CRUD Master Data (Tahap 3, 2026-10-01)

- **Commit:** working tree di atas `ecd5bf3` (lihat antrean PROGRESS §2) · **Branch:** `HRIS/Oatse/Linux-Windows` · **Env:** lokal Linux · **Bun/PG:** 1.4.2 / PostgreSQL 17
- **Perintah & ringkasan:**
  - Policy ditulis dulu (merah: fungsi belum ada) → hijau: `organization.policy.test.ts` 11.
  - `bun run typecheck` ✔ · `bunx biome ci .` ✔ (256 file) · `bun run check:boundaries` ✔ (227 modul) · `bun run db:check` ✔ (tanpa migrasi baru) · `bun run test` ✔ (shared 73 · api 370 · web 105 + 1 dilewati) · `bun run build` ✔
  - **Uji mutasi** (perbaikan dimatikan sementara → test harus gagal): (1) validasi rujukan hanya yang berubah saat ubah karyawan, (2) `MASTER_ARCHIVED` di pratinjau import, (3) nilai "(diarsipkan)" di form web → masing-masing gagal, lalu hijau setelah dikembalikan.

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-ADM-015, TC-ADM-016 | LULUS | MD "akses" (3) + POL (6 baris baru) |
| TC-ADM-017, TC-ADM-018 | LULUS | MD "validasi & konflik" (3) + SH (8) + WMD (geofence) |
| TC-ADM-019, TC-ADM-020 | LULUS | MD "arsip, pulihkan, hapus" + WMD (arsip lewat menu) |
| TC-ADM-021, TC-ADM-022 | LULUS | MD "gabungkan" (jabatan, departemen, tujuan tidak sah) |
| TC-ADM-023, TC-ADM-024 | LULUS | MD (siklus induk, departemen berjabatan aktif, status berkategori) |
| TC-ADM-025 | LULUS | MD "perusahaan" |
| TC-ADM-026 | LULUS | WMD (SA, HR, MANAGER, tempel koordinat) |
| TC-ADM-028 | LULUS (otomatis) | WMD "peta: klik … cari tempat" (komponen Leaflet di-mock); build: chunk `geofence-map` terpisah; browser sungguhan belum |
| TC-ADM-027 | **BELUM** | perubahan web kecil (dialog Atur PT), belum diuji di browser |
| TC-EMP-094 | LULUS | MD "dampak ke fitur lain" + WEB `employee-detail.test.tsx` |
| TC-EMP-095 | LULUS | MD "import: nama jabatan terarsip" |
| Regresi TC-EMP-001…093, TC-ADM-001…014 | LULUS | suite penuh |

**Temuan selama pengerjaan (diperbaiki):**
1. Ubah karyawan yang jabatan/grade/lokasi/PT-nya diarsipkan selalu ditolak, karena form mengirim ulang nilai lama → API kini hanya memvalidasi rujukan yang berubah; form menampilkan nilai lama "(diarsipkan)".
2. Import: nama master data yang sama dengan item terarsip akan gagal 500 (nama unik termasuk arsip) → kini error baris `MASTER_ARCHIVED`.
3. Import mode perbarui menghitung nama master data dari field yang **tidak** berubah sebagai "baru" (bug lama) → kini hanya field yang berubah.
4. Dialog "Atur PT" mengirim ulang PT terarsip yang tidak terlihat sehingga penyimpanan selalu ditolak → PT terarsip dilepas saat disimpan + keterangan.

**Kesimpulan:** kriteria otomatis terpenuhi di lokal. **Bug terbuka:** tidak ada.
**Belum diverifikasi:** uji browser (Playwright login sungguhan), staging, Windows.

## Tambahan 2026-10-02 — D-050 unit organisasi & level jabatan
- `bun run test` ✔ (shared 88 · api 375 · web 109) · typecheck ✔ · biome ✔ · boundaries ✔ · `db:check` ✔ · build ✔.

| ID | Hasil | Bukti |
|---|---|---|
| TC-ADM-029 | LULUS | MD "D-050" (induk tidak sah, Departemen di bawah Direktorat) + SH `canBeChildOf` (14) + WMD (induk tersaring) |
| TC-ADM-030 | LULUS | MD (ubah jenis vs sub-unit, gabungkan beda jenis) |
| TC-ADM-031 | LULUS | MD (`/master-data`, `/org-structure` + urut level) + WMD (level terkirim) |
| TC-ADM-032 | LULUS | WMD (slug lama dialihkan) |
| Regresi | LULUS | 2 test lama disesuaikan (Departemen di bawah Departemen kini tidak sah → memakai Direktorat/Divisi) |


## Sesi staging 2026-10-05 (rilis gelombang 1, `42e53fc` = develop `38f29c1`, `Deploy staging` #37253110211)
- **Env:** https://hris-staging-web.vercel.app + api staging, Supabase staging (12 migrasi, seed ulang dengan izin: PT ACP 23 + CD2 3 karyawan, 2 direktorat), login Supabase sungguhan SA/HR/MGR/EMP, Playwright 1.63 Chromium 1440×900 + 390×844.
- **Script & bukti:** `/mnt/winD/WORK/Magang/QA/2026-10-05-gelombang-1-staging/` (`ui.ts`, `ui-results.json`, 19 screenshot). Satu script untuk seluruh gelombang 1: **38/39 LULUS**; satu-satunya GAGAL = GF-03 (P3, BUG-002). Percobaan pertama 36/38: MP-02 & MN-02 menghitung baris sebelum data/kerangka loading selesai, GF-01 mencari peta lewat label yang tidak ada (BUG-002) → script menunggu kondisi; fitur tidak berubah.
- **Efek samping staging (disengaja, dibersihkan):** penugasan PT akun HR → ACP,CD2 → kembali ACP; master data berpenanda `QA-…` dibuat/diarsipkan/dipulihkan/dihapus permanen (sisa 0, dicek SQL); pratinjau import tidak menyimpan (`import_jobs` = 0); 18 baris audit log (2 run).

| ID | Hasil staging | Bukti (ID di `ui-results.json`) |
|---|---|---|
| TC-ADM-015 | LULUS | SA kelola (MD-04…MD-08); HR hanya baca (MD-09: pemberitahuan, tanpa tombol Tambah); MANAGER & EMPLOYEE → Akses ditolak (AK-01, AK-02) |
| TC-ADM-019 | LULUS | MD-07: arsipkan → hilang dari Aktif, tampil di Semua → pulihkan (DB `deleted_at` null) |
| TC-ADM-020 | LULUS | MD-08: hapus permanen lokasi, jabatan, unit uji → sisa 0 |
| TC-ADM-026 | LULUS | MD-01 × 6 halaman (judul, tabel, tombol Tambah) + mobile 390 px tanpa scroll horizontal (MB-*) |
| TC-ADM-027 | LULUS | MP-04/MP-06: dialog Atur PT di browser (sebelumnya BELUM) |
| TC-ADM-028 | LULUS (klik peta) | GF-01: peta Leaflet + tile OSM tampil, klik → lat/lng terisi, radius 100; GF-02: tersimpan di DB. "Pakai lokasi saya" & cari tempat Nominatim **tidak** diuji (butuh izin lokasi/layanan luar) |
| TC-ADM-029 | LULUS (sebagian) | MD-04: tambah unit berjenis Direktorat; aturan induk tidak sah diuji di integration lokal |
| TC-ADM-031 | LULUS | MD-03 (Direktur Utama = Direksi), MD-05 (jabatan uji level Direksi), MD-06 (Struktur Organisasi: "Direktorat · n jabatan" + level) |
| TC-ADM-032 | LULUS | MD-02: `/master-data/departemen` → `/unit-organisasi` |
| TC-ADM-033 | **GAGAL** (P3) | GF-03: elemen peta tanpa `aria-label` → BUG-002 |
| TC-ADM-016…018, 021…025, 030 | BELUM (staging) | hanya lokal (integration) |

**Kesimpulan staging:** semua case P1/P2 yang dijalankan LULUS; bug terbuka hanya **BUG-002 (P3)**. Fitur **LEGIT** (lokal + staging).

**Arsip Drive:** `hris-qa:2026-10-01-master-data` — 14 file, 2026-10-05 (fitur LEGIT: lokal + staging).
