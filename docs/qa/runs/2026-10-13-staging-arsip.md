# Hasil Uji — Arsip karyawan gel. 1 & Layanan Mandiri di staging (2026-10-13)

- **Commit:** rilis `42df46e` (`feat: tampilkan arsip karyawan dan layanan mandiri di jalur rilis`) · **Branch:** `HRIS/Oatse/rilis` → PR #47 (`HRIS/debug/database`, merge `62632e2`) → PR #48 (`HRIS/debug/fe-be`, merge `d0e652b`) · **Env:** staging (Vercel `hris-staging-api`/`hris-staging-web`, Supabase staging)
- **Verifikasi rilis (folder `HRIS-rilis`, DB `hris_release`):** typecheck ✔ · `biome ci` ✔ (418 file, 1 warning lama) · boundaries ✔ (338 modul) · `db:check` ✔ · `db:migrate` already in sync · test shared **200** · api **600** · web **233 (0 dilewati — 15 test Arsip/Layanan Mandiri yang sebelumnya dilewati saklar kini jalan & lulus)** · build ✔ · CI PR #47 & #48 ✔ · `Deploy staging` #38374784477 ✔ (migrasi, api, web) · health api 200 (database ok), web 200 · advisor security tanpa temuan baru (hanya INFO RLS `_prisma_migrations` disengaja & WARN leaked password protection, Backlog).
- **Staging sebelum uji (MCP read-only):** 27 migrasi, 0 tertunda · 26 jenis dokumen · bucket private `employee-documents` ada · grant aktif hanya `employee.onboarding.review` (HR).
- **Script:** `/mnt/winD/WORK/Magang/QA/2026-10-13-staging-arsip/stg-arsip.ts` (3 putaran: putaran 1 penuh 12/14; dua kegagalan = asumsi script yang salah, diperbaiki lalu langkah itu saja diulang — lihat catatan).

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-STG-059 | LULUS | HR tanpa grant: GET /data-changes 403 |
| TC-STG-060 | LULUS | POST /grants 201 (audit); HR GET /data-changes 200 tanpa login ulang |
| TC-STG-061 | LULUS | contacts SA/HR/MGR 200, EMP 403; families SA 200, HR/EMP 403; bank SA 200, HR/MGR 403 |
| TC-STG-062 | LULUS | SA & HR 200 `arsip-educations-semua-pt-2026-10-13.xlsx` (3 baris, isi zip `PK`); MGR 403 |
| TC-STG-063 | LULUS | 26 jenis dokumen |
| TC-STG-064 | LULUS | EMP GET /self/employee-data 200 |
| TC-STG-065 | LULUS | Ajukan kontak darurat 201; ganda 409 |
| TC-STG-066 | LULUS | Pemilik memutus 403; tolak tanpa alasan 400; tolak beralasan 200 |
| TC-STG-067 | LULUS | Ajukan ulang 201 → setujui 200 → data diri memuat kontak baru — `staging-SA_personal_arsip_kontak.png` |
| TC-STG-068 | LULUS | Notifikasi keputusan ada, tanpa nama/nomor kontak |
| TC-STG-069 | LULUS | Judul: Data Kontak, Data File, Data Keluarga (SA), Jenis dokumen, Pengajuan Perubahan Data (SA & HR), Data Pendidikan (HR), Data Kontak (MGR), Layanan Mandiri (EMP) — `staging-*.png` |
| TC-STG-070 | LULUS | EMP deep link Arsip → "Akses ditolak" |
| TC-STG-071 | LULUS | scrollWidth 390/390 — `staging-EMP_ess_hp.png` |
| TC-STG-072 | LULUS | 0 error JS, 0 respons ≥ 400 selain 403/404 disengaja |

**Catatan:**
- Putaran 1: TC-STG-062 gagal karena script mengharapkan file biner, padahal ekspor (D-058) memang mengembalikan JSON `{fileName, rows, contentBase64}`; pengecek diganti mendekode isi → lulus. TC-STG-069 gagal karena pengecek kata "Maintenance" cocok dengan jabatan staging "Traffic Man Road Maintenance"; pengecek diganti ke judul halaman Maintenance ("… sedang disiapkan") → lulus. Tidak ada perubahan aplikasi.
- Screenshot pertama Data Kontak (sebelum daftar tersaring) memuat nama asli staging (D-066) → **dihapus**; script kini hanya menyimpan screenshot daftar bila tidak ada baris `ASLI-`.
- Data uji tersisa: kontak darurat karyawan akun uji "Rizky Ramadhan" kini `QA STG Kontak qa101383124 (Saudara) 081200001013` (sebelumnya kosong, jadi tidak dipulihkan); 2 pengajuan (1 ditolak, 1 disetujui) tercatat atas akun EMP uji. Grant `employee.changes.review` HR uji tetap aktif (untuk uji berikutnya).
- Temuan: bucket `attendance-selfies` sudah ada di staging walau Time Management belum dirilis (kemungkinan dibuat otomatis saat uji lokal yang memakai storage staging; private).

**Arsip Drive:** `hris-qa:2026-10-13-staging-arsip` — 13 file (plan, run, cases 14 kasus, 10 screenshot), 2026-10-13.

**Kesimpulan:** semua P1/P2 LULUS di staging; gel. 1a–1d sudah LULUS lokal (runs 2026-10-05 s.d. 2026-10-08) → fitur Arsip gel. 1 + Layanan Mandiri **LEGIT**. **Bug terbuka:** tidak ada.
