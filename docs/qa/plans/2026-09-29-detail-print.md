# Rencana Uji — Detail Pegawai Layar Penuh & Print Data (2026-09-29)

- **Ruang lingkup (permintaan pemilik projek 2026-09-29):** (1) panel detail pegawai layar penuh, (2) avatar di tengah paling atas dan diperbesar, (3) tab Riwayat menampilkan pengubah (nama, lokasi kerja, role), (4) fitur **Print data**: formulir `apps/web/public/template/Template-excel.xlsx` diisi data satu pegawai lalu diunduh (.xlsx), (5) tombol Print di detail pegawai, (6) tombol tutup diganti "← Kembali" di kiri atas (permintaan lanjutan). Terkait PROGRESS Fase 4 "Web: daftar, detail, form, import".
- **Keputusan pemilik projek:** hasil = unduhan .xlsx terisi; hanya dari detail (satu pegawai per file); periode = tanggal masuk s/d tanggal keluar; "lokasi" = lokasi kerja pengubah.
- **Aturan yang diuji:** PLAN §4.3 (unduh hanya SA & HR_ADMIN; MANAGER/EMPLOYEE ditolak), §4.2 (bagian pribadi hanya bila berhak; rekening tidak dibaca), §4.5 (unduhan tercatat audit `employee.printed`), PROMPT §5 (403/404/401), §3.2 (batas modul: pengubah dirakit lewat `iam/index.ts`).
- **Di luar lingkup:** cetak banyak pegawai sekaligus, pratinjau/cetak PDF, kolom template tanpa sumber data (nama panggilan, suku, golongan darah, pengalaman organisasi/kerja, foto).
- **Lingkungan:** lokal Linux — PostgreSQL 17 (Docker), API `bun --watch` :3000, web Vite :5173; login Supabase staging sungguhan dengan akun uji SA/HR/MGR; Playwright Chromium 1440×900 & 390×844.
- **Kriteria lulus:** semua P1 & P2 LULUS; typecheck, lint, boundaries, `db:check`, seluruh test hijau; file .xlsx terbaca pembaca Excel independen.
- **Suite:** [cases/employee.md](../cases/employee.md) TC-EMP-033 s.d. TC-EMP-045.
