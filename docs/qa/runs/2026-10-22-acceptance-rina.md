# Hasil Uji Penerimaan: Rina, Joko, Atasan & HR, lokal, 22 Okt 2026

- **Rencana & sekuens manual:** [plans/2026-10-22-acceptance-rina.md](../plans/2026-10-22-acceptance-rina.md)
- **Commit:** `62a9cb1` + perubahan TM-D12 yang belum di-commit (working tree `HRIS/Mat/Mac`)
- **Lingkungan:** lokal. Postgres.app, Supabase lokal, web `localhost:5173`, API `localhost:3000`, zona TM `Asia/Jakarta`.
- **Data:** `bun run db:seed:acceptance` (reset + isi ulang).
- **Cara uji:** Playwright 1.55 (Chromium), di luar repo:
  - Login per akun lewat magic link Supabase **lokal** (tanpa password).
  - Kamera & GPS dipalsukan ke koordinat site demo.
  - Tampilan HP 390 px untuk Rina & Joko; desktop 1366 px untuk Atasan & HR.
- **Waktu jalan:** 2026-10-22T04:07:00.359Z (UTC)
- **Bukti:** `~/Documents/QA/2026-10-22-acceptance-rina/`, berisi 28 screenshot dan `index.html` (halaman hasil bergambar). Folder ini di luar repo.
- **Ringkasan: 28/28 LULUS.**
  - Run pertama 26/26 lulus, tetapi saat screenshot diperiksa manual ditemukan dua masalah (temuan 1 & 2). Ceknya diperketat, lalu seluruh skenario dijalankan ulang dari seed bersih.
  - Setelah run ini, data di-seed ulang supaya HR & atasan memulai acceptance dari kondisi bersih.

| ID | Peran | Langkah | Harapan | Status | Catatan | Bukti |
|---|---|---|---|---|---|---|
| R01 | Rina | Buka Absen di hari OFF | Pesan libur 'Silakan beristirahat'; tombol Lembur hari libur; tanpa tombol Datang | **LULUS** | — | `R01.png` |
| R02 | Rina | Lembur hari libur → selfie + alasan → kirim | Absen datang tercatat dengan label Di luar jadwal roster | **LULUS** | — | `R02.png` |
| R03 | Rina | Beranda setelah Clock In lembur | Jam Datang terisi; berikutnya Clock Out (Pulang) | **LULUS** | — | `R03.png` |
| R04 | Rina | Riwayat absen 8 hari terakhir | Label Telat, Pulang cepat, Istirahat lebih tampil di riwayat | **LULUS** | — | `R04.png` |
| R05 | Rina | Kalender libur | Tanggal Merah (Uji QA) tampil | **LULUS** | — | `R05.png` |
| R06 | Rina | Cuti & Izin | Pengajuan cuti tahunan 2 hari menunggu persetujuan | **LULUS** | — | `R06.png` |
| R07 | Rina | Buka /time/lembur | Hanya tab 'Lembur saya' (lembur sendiri); tanpa tab Perlu keputusan/Semua/Rekap & tanpa rupiah | **LULUS** | — | `R07.png` |
| J01 | Joko | Beranda hari kerja shift UJT 07–15 | Tombol Datang aktif; roster UJT | **LULUS** | — | `J01.png` |
| J02 | Joko | Clock In (telat) dengan alasan | Absen datang tercatat; label Telat | **LULUS** | — | `J02.png` |
| J03 | Joko | Tombol pulang sebelum jam buka | Tombol 'Pulang darurat' + 'Clock Out dibuka 13.30' | **LULUS** | — | `J03.png` |
| J04 | Joko | Tombol istirahat sesuai jendela 11.00–12.00 | Di dalam jendela: Mulai istirahat aktif; di luar: terkunci dengan jam | **LULUS** | Jam 1106: di dalam jendela | `J04.png` |
| J05 | Joko | Riwayat 5 hari jetty | 5 hari kerja tercatat (17–21 Okt) | **LULUS** | — | `J05.png` |
| B01 | Budi (atasan) | Lembur › Perlu keputusan | Usulan lembur Rina (OFF, tanggal merah, hari kerja) & Joko (tanggal merah); tanpa rupiah | **LULUS** | — | `B01.png` |
| B02 | Budi (atasan) | Setujui lembur hari kerja Rina 20 Okt | Status langkah atasan disetujui | **LULUS** | — | `B02.png` |
| B03 | Budi (atasan) | Setujui lembur tanggal merah Rina 19 Okt & Joko 19 Okt | Keduanya disetujui atasan | **LULUS** | — | `B03.png` |
| B04 | Budi (atasan) | Tolak lembur hari OFF Rina 17 Okt dengan catatan | Ditolak; catatan wajib terisi | **LULUS** | — | `B04.png` |
| B05 | Budi (atasan) | Lembur › Semua | Status keputusan terbaru tampil | **LULUS** | — | `B05.png` |
| B06 | Budi (atasan) | Data Absen Harian › Perlu keputusan | Absen Rina & Joko menunggu keputusan atasan | **LULUS** | — | `B06.png` |
| B08 | Budi (atasan) | Setujui absen harian Joko (5 hari jetty) | Langkah atasan disetujui untuk hari-hari Joko | **LULUS** | 6 hari dipilih | `B08.png` |
| B07 | Budi (atasan) | Persetujuan Cuti | Pengajuan cuti Rina tampil | **LULUS** | — | `B07.png` |
| H01 | HR (hr.biaya) | Lembur › Perlu keputusan | Rupiah lembur tampil (grant Biaya) | **LULUS** | — | `H01.png` |
| H02 | HR (hr.biaya) | Setujui lembur Rina 20 Okt & tanggal merah Rina/Joko 19 Okt | Disetujui penuh (Atasan + HR) | **LULUS** | — | `H02.png` |
| H08 | HR (hr.biaya) | Setujui absen harian Joko | Hari Joko disetujui penuh (Atasan + HR) → lembur rutin diakui | **LULUS** | 6 hari dipilih | `H08.png` |
| H03 | HR (hr.biaya) | Lembur › Rekap bulanan | Joko: lembur rutin 4 jam (4 hari × 1 jam) + tanggal merah 8 jam disetujui; Rina: hari kerja + tanggal merah | **LULUS** | Joko Jetty (Demo) TMDEMO-JT 4 jam 8 jam — 23 Rp 957.225 | `H03.png` |
| H04 | HR (hr.biaya) | Kalender libur | Dua Tanggal Merah (Uji QA) | **LULUS** | — | `H04.png` |
| H05 | HR (hr.biaya) | Data Absen Harian | Hari absen Rina & Joko dengan label | **LULUS** | — | `H05.png` |
| H06 | HR (hr.biaya) | Rekap & Tutup Periode | Rekap bulan berjalan memuat Rina & Joko | **LULUS** | — | `H06.png` |
| H07 | HR (hr.lokal, tanpa grant) | Lembur › Semua | Rupiah tidak tampil | **LULUS** | — | `H07.png` |

## Angka lembur yang diverifikasi

| Karyawan | Tanggal | Jenis | Usulan | Jam setara | Keputusan (run) |
|---|---|---|---|---|---|
| Rina | 17 Okt | Hari OFF (lembur hari libur) | 5 j | 9,5 (1,5 + 4×2) | Ditolak atasan (catatan wajib) |
| Rina | 19 Okt | Tanggal merah, pola 5 hari | 8 j 30 m | 17,5 (8×2 + 0,5×3) | Disetujui Atasan + HR |
| Rina | 20 Okt | Hari kerja, pulang 19.10 + datang awal 4 mnt | 2 j 30 m | 4,5 (1,5 + 1,5×2) | Disetujui Atasan + HR |
| Joko | 17, 18, 20, 21 Okt | Lembur rutin JT | 1 j/hari | 1,5/hari | Ikut approval absen harian (disetujui) |
| Joko | 19 Okt | Tanggal merah, pola 6 hari | 8 j | 17 (7×2 + 1×3) | Disetujui Atasan + HR |

Rekap bulanan HR:
- **Joko:** lembur rutin 4 jam, tambahan 8 jam, 23 jam setara, Rp957.225.
- **Rina:** tambahan 11 jam, 22 jam setara, Rp915.607.
- Upah Staf Rp7,2 jt ÷ 173 per jam.
- Atasan dan `hr.lokal` tidak melihat rupiah.

## Temuan

1. **Data sisa test integrasi tampil di layar HR (P2, data uji):**
   - Penyebab: `attendance.test.ts` dan `mobile-punch.test.ts` tidak menghapus `overtime_requests` maupun approval punch/lembur milik karyawan uji (approval hanya dihapus per id hari).
   - Akibat: 15 usulan lembur dan 229 approval yatim muncul sebagai baris "—" di Rekap Lembur HR.
   - Penanganan: `db:seed:acceptance` sekarang membersihkan baris yatim. **Perbaikan cleanup di kedua test belum dilakukan**; `mobile-punch.test.ts` milik develop.
2. **Lembur rutin hanya terhitung setelah hari absen disetujui (perilaku, bukan bug).** Rekap menampilkan "Lembur rutin (hari disetujui) 0 menit" sampai absen harian Joko disetujui Atasan & HR. Sekuens acceptance sudah memuat langkah ini (3.5, 4.3).
3. **JT: menit lebih kecil ikut dibulatkan ke atas (P2, aturan TM-D6, perlu keputusan pemilik projek):**
   - Contoh: datang 06.55 dan pulang 15.02 → 60 mnt lembur rutin + 7 mnt → dibulatkan ke 90 → usulan tambahan **30 menit** setiap hari.
   - Pada karyawan tanpa lembur rutin, kelebihan < 60 mnt tidak diakui. Pada JT, lembur rutin sudah memenuhi minimum, jadi kelebihan beberapa menit langsung jadi +30 mnt.
   - Seed memakai jam tepat 07.00–15.00 supaya skenario "1 jam/hari" sesuai permintaan.
4. **Label "Tanpa absen istirahat" di hari OFF (P3):** Rina lembur hari libur 17 Okt tanpa absen istirahat. Lokasi wajib istirahat, tetapi hari OFF tidak punya jatah istirahat shift. Perlu diputuskan apakah label ini tetap dipasang.
5. **Artefak seed (bukan bug):** absen riwayat hasil seed menampilkan "Batalkan (salah pencet)", karena batas 15 menit dihitung dari waktu baris dibuat (saat seed), bukan jam absen. Absen dari HP sungguhan tidak terdampak.
