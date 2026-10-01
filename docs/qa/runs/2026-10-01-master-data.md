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
