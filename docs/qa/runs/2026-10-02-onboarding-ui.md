# Hasil Uji — UI onboarding di browser (2026-10-02)

- **Target:** develop lokal (instance QA terpisah: API :3100 dengan SMTP dimatikan, web :5174) · Auth & Storage Supabase staging.
- **Akun:** user uji sekali pakai di Auth staging (izin pemilik projek): `qa-ui-{sa,hr,calon1,calon2}-bed6@dev-oatse.login.akselerasi.invalid`; akun HRIS hanya di DB lokal. Aktivasi calon disimulasikan (tanpa email undangan).
- **Alat:** Playwright (script ad-hoc di scratchpad), desktop 1366×820 & mobile 390×844.
- **Bukti:** `/mnt/winD/WORK/Magang/QA/2026-10-02-onboarding-ui/` (01–46).

## Alur yang ditelusuri
SA: Penerimaan → Undang Karyawan Terdaftar → Impor calon (unggah → pemetaan → pilih → data kerja → pratinjau → konfirmasi tanpa undangan → progres) → calon login (terkunci ke wizard; `/personal` dialihkan ke `/onboarding`) → isi & kirim → HR ber-grant: notifikasi, tab Menunggu review, review → minta revisi Rekening → calon hanya melihat langkah Rekening + catatan HR → kirim ulang → HR setujui (PTKP) → calon login **dengan NIK** (berhasil), login email lama ditolak → Layanan Mandiri, Lupa password.

## Temuan & perbaikan

| # | Temuan | Jenis | Status |
|---|---|---|---|
| 1 | Klik "Penerimaan Karyawan Baru" → hotbar pindah ke Dashboard (grup Administrasi tidak mencocokkan `/penerimaan`) | Bug (laporan pemilik projek) | Diperbaiki + test `navigation.test.ts` (semua item menu ↔ grupnya) |
| 2 | Dialog undang karyawan: tombol Undang/Batal tertutup daftar; istilah "existing" | UX (laporan pemilik projek) | Diperbaiki: isi dialog bergulir, footer tetap; daftar dibatasi tinggi; karyawan yang sudah punya akun ditandai; "Undang Karyawan Terdaftar", "karyawan terdaftar" di semua teks |
| 3 | Impor: ubah **Tanggal masuk bawaan** tidak ikut ke baris (baris menyalin nilai saat masuk langkah) → nomor induk usulan memakai tanggal lama | Bug | Diperbaiki: baris kosong = ikut bawaan; ubah data kerja membatalkan pratinjau & nomor usulan (nomor ketikan dipertahankan) + test regresi |
| 4 | Konfirmasi tanpa undangan: "Simpan & kirim 0 undangan"; progres "0/0" penuh | UX | "Simpan tanpa mengirim undangan"; progres diganti keterangan status "Belum diundang" |
| 5 | Progres undangan: gangguan jaringan ditampilkan sebagai "batas per jam tercapai" | UX | Pesan dibedakan; progressbar diberi label & rentang (aksesibilitas) |
| 6 | Wizard desktop: langkah "Ringkasan & kirim" terpotong (gulir horizontal tersembunyi) | UX | Deretan langkah membungkus di layar ≥ sm |
| 7 | Setelah Setujui, halaman review sempat memuat ulang → "Data onboarding tidak ditemukan" | Bug | Data review tidak dimuat ulang setelah keputusan; pesan 404 dijelaskan (sudah disetujui / di luar cakupan) |
| 8 | Bilah aksi review (fixed) menutupi sidebar desktop | UX | Bilah menempel di bawah kolom isi (sticky) |

Tidak bermasalah: kunci akses calon, ringkasan kekurangan, revisi per bagian, notifikasi HR, login NIK, tampilan mobile wizard & review.

**Catatan data uji:** master data sisa test terputus (`Dept/Jab/Status RV 3E04FA`) terlihat di pilihan; dibersihkan bersama data QA. User uji di Auth staging di-ban setelah selesai.
