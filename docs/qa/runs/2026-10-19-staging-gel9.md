# Hasil Uji — Staging rilis gelombang 9 (2026-10-19)

- **Rilis:** rilis `db4e716` → PR #53/#54 → `Deploy staging` #39199139468 ✔ · **Env:** staging (`hris-staging-web` / `hris-staging-api`, Supabase staging)
- **Login:** sesi SA `admin.arthasia@gmail.com` dari browser pemilik projek (tanpa password; salinan sesi dihapus setelah uji). HR tidak diuji visual di staging.
- **Script:** `/mnt/winD/WORK/Magang/QA/2026-10-19-staging-gel9/qa-staging.ts` — **15/15** (Q-07 diulang lewat `?pegawai=` karena klik baris pada script belum membuka panel), 0 error JS/5xx (2× 404 = muat ulang detail draft yang baru dihapus, perilaku lama, Backlog).

| ID | Isi | Hasil | Bukti |
|---|---|---|---|
| Q-01 | Sidebar Master Data bertingkat | LULUS | `Q-01.png` |
| Q-02 | Header & sidebar tetap, hanya isi scroll | LULUS | `Q-02.png` (header y = 0, `window.scrollY` = 0) |
| Q-03 | Dialog Buat SP 1280×700 | LULUS | `Q-03.png` (tombol Simpan terlihat) |
| Q-04 | Pilih 2 karyawan, "Ikuti saran sistem", kolom rata, tanggal wajib | LULUS | `Q-04.png` |
| Q-05 | Simpan 2 draft sekaligus (`POST /warning-letters/bulk`) | LULUS | `Q-05.png` |
| Q-06 | Detail SP berkartu; draft uji dihapus | LULUS | `Q-06.png` |
| Q-07 | Formulir Aplikasi tersembunyi (saklar rilis `false`) | LULUS | `Q-07.png` |
| L-1…4 | Laporan headcount, dokumen, kelengkapan, SP: tampil + ekspor Excel | LULUS | `L-*.png`; file .xlsx hanya di folder QA lokal (berisi nama asli staging, tidak diunggah) |
| Q-08 | Tambah karyawan bertahap sampai Ringkasan (tidak disimpan di staging) | LULUS | `Q-08*.png` |
| Q-09 | Tampilan gelap | LULUS | `Q-09.png` |
| Q-10 | Layar HP 390 px tanpa scroll horizontal | LULUS | `Q-10.png` |

**Kesimpulan:** rilis gel. 9 **LEGIT** di staging. Arsip Drive `hris-qa:2026-10-19-staging-gel9` (screenshot, script, catatan; tanpa .xlsx).
