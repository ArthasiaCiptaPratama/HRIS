# Rencana Uji Penerimaan (UAT): Absen, Lembur & Cuti (Rina, Joko, Atasan, HR), lokal, 22 Okt 2026

- **Tujuan:** HR dan atasan Rina menerima (acceptance) alur absen, lembur, dan cuti dari sisi karyawan, atasan, dan HR. Fokusnya:
  - TM-D6 lembur (hari kerja, hari OFF, tanggal merah, lembur rutin jetty)
  - TM-D7 istirahat
  - TM-D9 cuti
  - TM-D12 (batas Clock Out, jendela istirahat, hari OFF)
- **Lingkungan:** lokal saja.
  - Web `http://localhost:5173`
  - API `http://localhost:3000`
  - DB Postgres.app dan Supabase lokal. Data Supabase remote tidak disentuh.
- **Menyiapkan / mengulang data** (menghapus data lama Rina, Budi, Joko, lalu mengisi ulang relatif ke hari ini):
  ```
  cd apps/api && bun run db:seed:acceptance
  ```
  Prasyarat sekali saja: `db:seed:time -- --demo --accounts` dan `db:seed:qa`.
- **Hasil uji otomatis:** [runs/2026-10-22-acceptance-rina.md](../runs/2026-10-22-acceptance-rina.md).

## Akun (password sama dengan akun uji lokal lain)

**Menguji beberapa akun sekaligus:**
1. Buka panel **DB · Lokal** di pojok kanan bawah.
2. Di **Akun uji (tab ini)**, pilih akunnya. Tanpa password, langsung masuk.
3. Untuk akun berikutnya, buka tab baru dan pilih akun lain. Contoh: tab 1 Rina absen, tab 2 Budi langsung memutuskan.

| Akun | Peran | Orang |
|---|---|---|
| karyawan.lokal@arthasia.test | Karyawan | Rina Lestari, kantor 08–17 |
| jetty.lokal@arthasia.test | Karyawan jetty | Joko Jetty, aturan JT |
| manager.lokal@arthasia.test | Atasan | Budi Santoso, atasan Rina & Joko |
| hr.biaya@arthasia.test | HR + grant Biaya | Melihat rupiah |
| hr.lokal@arthasia.test | HR tanpa grant | Rupiah harus tersembunyi |

## Data yang disiapkan (tanggal relatif ke hari seed dijalankan; contoh untuk Kamis 22 Okt)

- **Tanggal merah uji:** Sen 19 Okt dan Sen 26 Okt, bernama "Tanggal Merah (Uji QA)".
- **Shift Rina `UQA`:**
  - Jam kerja 08.00–17.00. Mulai istirahat hanya 12.00–13.00, jatah 60 menit, tidak dibayar.
  - Pola 5+2, sehingga rumus lembur memakai pola 5 hari.
- **Shift Joko `UJT`** (aturan jetty/JT):
  - Jam kerja 07.00–15.00, termasuk lembur rutin 1 jam di akhir shift. Istirahat 60 menit dibayar, Mulai istirahat 11.00–12.00.
  - Pola 6+1, sehingga rumus lembur memakai pola 6 hari.
- **Lokasi:** "Site Demo Absen (Lokal)", wajib absen istirahat.
- **Upah grade** (pokok + tunjangan tetap per bulan; ÷ 173 = upah sejam):

  | Grade | Upah/bulan | Upah sejam |
  |---|---|---|
  | Staf | 5,7 jt + 1,5 jt | Rp41.618 |
  | Staf Senior | 8 jt + 2 jt | Rp57.803 |
  | Supervisor | 14 jt + 4 jt | Rp104.046 |
  | Manajer | 30 jt + 8 jt | Rp219.653 |
  | Direktur | 100 jt + 25 jt | Rp722.543 |

  Semua di atas UMSP batubara Kalsel 2026 (Rp3,77 jt).
- **Jabatan demo:** Rina = Administrasi (Staf), Joko = Checker Jetty (Staf), Dimas = Helper Bor (Staf), Sari = GA Staff (Staf), Budi = Operations Manager (Manajer).

| Tanggal | Rina | Joko |
|---|---|---|
| Rab 14 Okt | Normal 07.55–17.05 | OFF |
| Kam 15 Okt | **Telat** 08.40 (alasan) | OFF |
| Jum 16 Okt | **Pulang darurat** 14.00 (alasan) | OFF |
| Sab 17 Okt | OFF → **Lembur hari libur** 08.00–13.00 (usulan 5 jam) | 07.00–15.00 (lembur rutin 1 j) |
| Min 18 Okt | OFF (libur biasa, tanpa absen) | 07.00–15.00 (lembur rutin 1 j) |
| Sen 19 Okt | **Tanggal merah**, kerja 07.57–17.02 (usulan 8 j 30 m) | **Tanggal merah**, 07.00–15.00 (usulan 8 j) |
| Sel 20 Okt | Pulang 19.10 → **lembur hari kerja** (usulan 2 j 30 m) | 07.00–15.00 (lembur rutin 1 j) |
| Rab 21 Okt | **Istirahat lebih** 12.00–13.30 | 07.00–15.00 (lembur rutin 1 j) |
| Kam 22 Okt (hari ini) | **OFF**, diuji langsung | Kerja, diuji langsung |
| Rab 28 – Kam 29 Okt | Cuti tahunan 2 hari, menunggu keputusan | — |

Semua absen dan usulan lembur di atas berstatus **menunggu** keputusan Atasan dan HR.

## Sekuens 1: Karyawan (Rina, HP), ±10 menit

| # | Langkah | Hasil yang diharapkan | Lulus/Gagal | Catatan |
|---|---|---|---|---|
| 1.1 | Login karyawan.lokal, buka **Absen** | Kotak biru "Hari ini jadwal Anda libur (OFF). Silakan beristirahat."; tombol **Lembur hari libur** menggantikan Datang | | |
| 1.2 | Tekan tombol bulat **Clock In** di bawah | Muncul pesan libur; absen tidak dimulai | | |
| 1.3 | Tekan **Lembur hari libur** → izinkan kamera & lokasi → Ambil foto → isi alasan → Kirim | "Absen datang tercatat"; label **Di luar jadwal roster**; tanpa alasan tidak bisa dikirim | | |
| 1.4 | Buka **Riwayat** | Label tampil: Telat (15 Okt), Pulang cepat (16 Okt), Di luar jadwal roster (17 Okt), Istirahat lebih (21 Okt) | | |
| 1.5 | Buka **Kalender** | Tanggal merah 19 & 26 Okt "Tanggal Merah (Uji QA)" | | |
| 1.6 | Buka **Cuti & Izin** | Cuti 28–29 Okt **Menunggu**; saldo 12 hari, 2 ditahan | | |

## Sekuens 2: Karyawan jetty (Joko, HP), ±5 menit

| # | Langkah | Hasil yang diharapkan | Lulus/Gagal | Catatan |
|---|---|---|---|---|
| 2.1 | Login jetty.lokal, buka **Absen** | Roster UJT 07.00–15.00; tombol **Datang** aktif | | |
| 2.2 | Datang → foto → alasan (bila telat) → Kirim | Tercatat; lewat 07.15 berlabel **Telat** | | |
| 2.3 | Lihat tombol Pulang sebelum 13.30 | **Pulang darurat** + "Clock Out dibuka 13.30" (jam pulang normal 14.00 karena 1 jam terakhir = lembur rutin) | | |
| 2.4 | Lihat tombol istirahat | 11.00–12.00: **Mulai istirahat** aktif; sebelum 11.00 "Istirahat dibuka 11.00"; lewat 12.00 tanpa mulai: "sudah lewat" | | |
| 2.5 | Setelah 13.30 lihat tombol Pulang | Kembali "Pulang" biasa, tanpa wajib alasan | | |

## Sekuens 3: Atasan (Budi, web), ±10 menit

| # | Langkah | Hasil yang diharapkan | Lulus/Gagal | Catatan |
|---|---|---|---|---|
| 3.1 | Login manager.lokal → Time Management › **Lembur** › Perlu keputusan | 4 usulan: Rina 17 Okt (Hari OFF, 5 j, bendera "Lebih dari 4 jam sehari"), Rina 19 Okt (Tanggal merah), Rina 20 Okt (Hari kerja, 2 j 30 m, datang awal 4 mnt), Joko 19 Okt (Tanggal merah 8 j); **tanpa rupiah** | | |
| 3.2 | Detail Rina 20 Okt → **Setujui** | Langkah Atasan disetujui; status menunggu HR | | |
| 3.3 | Setujui Rina 19 Okt & Joko 19 Okt | Keduanya disetujui Atasan | | |
| 3.4 | Detail Rina 17 Okt → **Tolak** tanpa catatan, lalu dengan catatan | Tanpa catatan ditolak sistem; dengan catatan → **Ditolak** | | |
| 3.5 | **Data Absen Harian** › Perlu keputusan → centang semua hari Joko → Setujui | Hari Joko disetujui Atasan (lembur rutin ikut approval absen) | | |
| 3.6 | **Persetujuan Cuti** | Cuti Rina 28–29 Okt tampil; setujui/tolak sesuai kebijakan | | |

## Sekuens 4: HR (hr.biaya lalu hr.lokal, web), ±10 menit

| # | Langkah | Hasil yang diharapkan | Lulus/Gagal | Catatan |
|---|---|---|---|---|
| 4.1 | Login hr.biaya → **Lembur** › Perlu keputusan | Usulan yang sudah disetujui Atasan tampil **dengan rupiah** | | |
| 4.2 | Setujui Rina 20 Okt, Rina 19 Okt, Joko 19 Okt | Status **Disetujui** penuh | | |
| 4.3 | **Data Absen Harian** → setujui hari-hari Joko | Disetujui penuh | | |
| 4.4 | **Lembur** › Rekap bulanan (bulan berjalan) | Joko: lembur rutin **4 jam** + tambahan **8 jam** (23 jam setara); Rina: tambahan **11 jam** (2 j 30 m + 8 j 30 m, 22 jam setara); 17 Okt (ditolak) tidak dihitung | | |
| 4.5 | **Kalender Libur** | Dua "Tanggal Merah (Uji QA)" | | |
| 4.6 | Logout → login hr.lokal → Lembur › Semua | Data sama, **tanpa rupiah** | | |

## Persetujuan

| Peran | Nama | Tanggal | Diterima / Ditolak | Catatan |
|---|---|---|---|---|
| HR | | | | |
| Atasan Rina | | | | |
