# Hasil Uji — Perbaikan UI/UX 8 temuan, lokal (2026-10-19)

- **Commit:** develop `b0f3817` + perubahan belum di-commit · **Branch:** `HRIS/Oatse/Linux-Windows` · **Env:** lokal (DB `hris` lokal, Auth staging, Gotenberg lokal)
- **Perintah & ringkasan:** `bun run typecheck` ✔ · `bunx biome ci .` ✔ (1 warning lama `employee-print.test.ts`) · `bun run check:boundaries` ✔ (473 modul) · test shared **250** · api **813** · web **294** + 5 dilewati (`--maxWorkers=4`)
- **Script:** `/mnt/winD/WORK/Magang/QA/2026-10-19-ui-ux/qa-ui-ux.ts` — **11/11**, 0 error JS/5xx (2× 404 = muat ulang detail draft yang baru dihapus, perilaku lama). Login memakai sesi SA (`admin.arthasia@gmail.com`) dari browser pemilik projek, tanpa password; HR tidak diuji visual (Q-11 dilewati, akses dicek test API & web).

| ID | Temuan | Hasil | Bukti / catatan |
|---|---|---|---|
| Q-01 | 2 Sidebar Administrasi bab → sub | LULUS | `Q-01.png` — Organisasi / Kepegawaian / Arsip & Disiplin |
| Q-02 | 5 Header tetap, isi scroll | LULUS | `Q-02.png` — setelah gulir isi & sidebar: header y = 0, `window.scrollY` = 0 |
| Q-03 | 6 Dialog SP scroll di layar 1280×700 | LULUS | `Q-03.png` — tombol Simpan di 648 px (terlihat) |
| Q-04 | 3 + 4 Pilih 2 karyawan, kolom rata, tanggal wajib | LULUS | `Q-04.png` — chip + centang, "Ikuti saran sistem", tiga kolom y = 549 px, tanpa "Opsional." |
| Q-05 | 3 Simpan 2 draft sekaligus | LULUS | `Q-05.png` |
| Q-06 | 1 Detail SP berkartu | LULUS | `Q-06.png`; draft uji dihapus (Q-06b) |
| Q-07 | 8 Formulir Data Karyawan (PDF via API; saklar web lokal mati) | LULUS | `Q-07-formulir.pdf` 3 halaman, tanpa pernyataan/daftar dokumen/Pelamar; contoh fiktif `contoh-fiktif-*.pdf` |
| Q-08 | 7 Tambah karyawan bertahap | LULUS | `Q-08a…d.png`, `Q-08e-sim-terpilih.png`; tersimpan → panel detail terbuka (karyawan fiktif "QA 040011 Fiktif" tertinggal di DB lokal) |
| Q-09 | Tampilan gelap | LULUS | `Q-09.png` |
| Q-10 | Layar HP 390 px tanpa scroll horizontal | LULUS | `Q-10.png` |

**Kesimpulan:** LEGIT untuk lokal. Belum: QA staging (setelah commit/rilis).
