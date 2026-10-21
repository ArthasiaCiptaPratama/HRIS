# Desain — Time Management (Roster Tambang, Absensi PWA, Approval, Cuti/Izin/Sakit)

> Keputusan: **D-067** (absensi lewat PWA), **D-068** (approval setiap hari absen), **D-069** (roster tambang), **D-070** (validasi absen), **D-071** (tutup periode & surat pernyataan), **D-072** (aturan cuti tahunan) di [PLAN §8](../../PLAN.md#8-keputusan-adr-ringkas). Terkait: D-009 (tim = bawahan langsung), D-010 (approval paralel), D-011 (tutup periode ber-grant), D-013 (geofence + selfie + waktu server), D-037 (pola unggah Storage), D-040 (cakupan PT), D-049 (geofence lokasi kerja), D-053 (`manager_id` otomatis dari pos), D-057 (surat peringatan, rencana).
> Status: **rencana** — hasil grill pemilik projek 2026-10-12. Belum ada kode. Checklist: PROGRESS Fase 5–6 (Tahap A–F).
> Keputusan terbuka yang masih perlu dijawab: OD-13, OD-14, OD-15 (§11). Dokumen ini tidak memuat data asli.

## 1. Tujuan & prinsip

1. Karyawan site tambang **absen dari HP** (masuk & pulang) dengan **selfie kamera langsung + lokasi GPS**, sesuai **roster** yang sudah disusun.
2. **Setiap hari absen** diperiksa dan disetujui **atasan langsung (MANAGER) dan HR** — pencegahan kecurangan dari dua sisi.
3. **Roster tambang** (siklus kerja/OFF, shift siang/malam, crew) menjadi acuan sah: absen di luar roster tetap tercatat tetapi ditandai dan harus diputuskan approver.
4. **Cuti tahunan, izin, dan sakit** diajukan dari HP/web dan diputuskan dengan alur approval yang sama.
5. Hasil akhir per bulan = **rekap kehadiran yang final** untuk payroll (Fase 8) setelah periode ditutup.
6. Aturan PLAN tetap berlaku: waktu **server** (jam HP tidak pernah dipakai), bucket **private**, retensi selfie 12 bulan, cakupan PT HR (D-040), audit, tanpa data sensitif di log/email.

## 2. Peran & alur besar

```
 KARYAWAN (HP, PWA /absen)            MANAGER (web)                  HR_ADMIN (web, PT ditugaskan)       SUPER_ADMIN
 ────────────────────────             ─────────────                  ──────────────────────────────      ───────────
 Login NIK/email (sama dgn web)
 Beranda: shift hari ini (roster)
 Absen MASUK: selfie + GPS ──────┐
 Absen PULANG: selfie + GPS ─────┤
   (di luar roster/radius →      │
    label + alasan wajib)        ▼
                        Hari absen "Menunggu" ───▶ Inbox Approval Absensi      Inbox Approval Absensi          override langkah
                                                   (tim; setujui massal)       (PT; setujui massal)            atasan (alasan)
                                                        │                            │
                                                        └──── keduanya setuju → DISETUJUI; salah satu tolak → DITOLAK
 Riwayat & status ◀──────────────────────────────────────────────────────────────────────────
 Ajukan cuti/izin/sakit ─────────────▶ approval paralel (sama) ─────────────▶ saldo & roster diperbarui
                                                                             Tutup periode (grant payroll.period.prepare)
                                                                             └ hari belum disetujui → ALPHA
 Surat pernyataan absensi ◀───────────────────────────────────────────────── (wajib untuk setiap ALPHA)
```

Penyusun roster: SUPER_ADMIN & HR_ADMIN (PT-nya); MANAGER melihat roster timnya (PLAN §4.3 "Tugaskan shift/jadwal": MANAGER ✅ tim — lihat §9).

## 3. Konsep & istilah

| Istilah | Arti |
|---|---|
| **Shift** | Definisi jam kerja: kode (mis. `D` siang 07:00–19:00, `N` malam 19:00–07:00), jendela absen, toleransi telat. |
| **OFF** | Hari tidak bekerja dalam siklus roster. **Bukan cuti** (tidak memotong saldo). |
| **Pola roster** | Urutan berulang kode shift/OFF, mis. `10/4` = D×10, OFF×4; `14/7`; `2D-2N-2OFF`. |
| **Crew** | Kelompok karyawan di satu lokasi kerja yang mengikuti pola + tanggal mulai siklus yang sama (Crew A/B/C/D). |
| **Hari roster** | Satu baris per karyawan per tanggal: shift atau OFF, beserta sumbernya (pola, edit grid, import, perubahan disetujui). |
| **Tanggal kerja** | Tanggal **mulai** shift. Shift malam 19:00 Senin – 07:00 Selasa adalah hari kerja **Senin**. |
| **Hari absen** | Pasangan absen masuk + pulang untuk satu hari roster; satuan yang disetujui. |
| **Label** | Penanda penyimpangan pada hari absen (§5.3) — tidak memblokir, wajib alasan. |

## 4. Roster (D-069)

### 4.1 Data yang disusun admin
1. **Master shift** per PT (bisa dipakai lintas lokasi): kode, nama, jam mulai/selesai, lintas tengah malam (otomatis bila selesai ≤ mulai), dan **jendela absen per shift**:
   - `checkInOpenMin` — boleh absen masuk mulai X menit sebelum jam mulai (contoh 60).
   - `lateToleranceMin` — telat > Y menit setelah jam mulai = label **Telat** (contoh 15).
   - `checkOutCloseMin` — absen pulang paling lambat Z menit setelah jam selesai (contoh 240); lewat = label **Lupa pulang**.
   - `earlyLeaveToleranceMin` — pulang lebih awal > W menit sebelum jam selesai = label **Pulang cepat**.
2. **Pola roster**: nama + daftar langkah (kode shift atau OFF), panjang siklus = jumlah langkah.
3. **Crew**: nama, PT, lokasi kerja (geofence), pola, **tanggal mulai siklus**, anggota (karyawan + berlaku dari/sampai — pindah crew tidak menghapus riwayat).

### 4.2 Cara roster terbentuk (keempatnya dipakai)
| Cara | Perilaku |
|---|---|
| **Pola siklus** | Sistem membangkitkan hari roster per anggota crew untuk rentang (mis. 3 bulan ke depan, diperpanjang otomatis harian). Hari yang sudah diedit manual / hasil perubahan disetujui **tidak ditimpa**. |
| **Grid bulanan** | Tabel karyawan × tanggal (seperti contoh web lama) berisi kode shift; admin mengubah sel. Sel menandai sumber (pola/manual/import/perubahan). |
| **Import Excel** | Unggah file roster site → pemetaan (kolom NIK/nama + kolom tanggal berisi kode) → **pratinjau** (kode tak dikenal, karyawan tak ditemukan, bentrok dengan absen yang sudah disetujui) → simpan satu transaksi. Memakai pola mesin Import D-042 (file tidak disimpan). Format file: **OD-13**. |
| **Perubahan / tukar shift** | Karyawan (atau atasannya atas nama tim) mengajukan perubahan satu/beberapa tanggal, atau **tukar** dengan rekan (kedua hari roster berubah). Disetujui **MANAGER + HR** (paralel); rekan yang ditukar ikut **menyetujui** lebih dulu. Setelah disetujui, hari roster sumber = "perubahan". |

Aturan: hari roster yang **sudah punya absen disetujui** atau berada di **periode tertutup** tidak bisa diubah lewat grid/import (harus koreksi absensi). Setiap perubahan roster tercatat di audit.

## 5. Absensi PWA (D-067, D-070)

### 5.1 Aplikasi
- **PWA** = bagian dari web yang sama (`apps/web`), route **`/absen`** dengan tata letak khusus HP, bisa *Add to Home Screen* (manifest + service worker; dependency diputuskan di Tahap C). Login sama (NIK atau email + password, D-048).
- Hanya akun yang **terhubung ke data karyawan** (PLAN §4.1). Wajib **online**; tanpa koneksi tombol absen nonaktif dengan pesan jelas.
- Beranda: shift hari ini (atau "OFF"), jendela absen, lokasi crew + jarak saat ini, status hari ini, tombol **Absen Masuk / Absen Pulang**; menu Riwayat, Pengajuan (cuti/izin/sakit/perubahan roster), Surat Pernyataan.

### 5.2 Langkah absen (masuk & pulang sama)
1. App meminta **lokasi** (akurasi tinggi) → menampilkan jarak ke titik geofence lokasi crew; akurasi GPS ikut dikirim.
2. **Selfie dari kamera langsung** (`getUserMedia`, tanpa pilih galeri), dikompres di browser (± 200 KB, JPEG).
3. API memberi **signed upload URL** (pola D-037), app mengunggah foto ke bucket private **`attendance-selfies`**.
4. App mengirim konfirmasi absen: path foto, koordinat, akurasi. **Waktu = jam server saat API menerima.**
5. API menentukan hari roster, menghitung label (§5.3); bila ada label, **alasan wajib** (ditanyakan sebelum kirim berdasarkan pra-cek dari API).
6. Hari absen berstatus **Menunggu persetujuan**; karyawan melihat status di Riwayat.

### 5.3 Penentuan hari & label (tidak pernah memblokir — D-070)
| Kondisi | Label | Catatan |
|---|---|---|
| Waktu absen masuk di luar jendela shift mana pun pada hari roster | `OUTSIDE_ROSTER` | termasuk absen pada hari **OFF** |
| Karyawan tidak punya hari roster pada tanggal itu | `NO_ROSTER` | |
| Jarak > radius geofence lokasi crew (dan tidak bertanda "boleh di luar lokasi") | `OUTSIDE_RADIUS` | jarak & akurasi disimpan |
| Akurasi GPS buruk (> ambang, mis. 100 m) | `LOW_ACCURACY` | ambang = pengaturan sistem |
| Masuk > jam mulai + `lateToleranceMin` | `LATE` | |
| Pulang < jam selesai − `earlyLeaveToleranceMin` | `EARLY_LEAVE` | |
| Tidak ada absen pulang sampai `checkOutCloseMin` lewat | `NO_CHECKOUT` | ditandai oleh cron harian |
| Absen di lokasi lain dari lokasi crew | `OTHER_LOCATION` | lokasi terdekat dicatat |

Hari absen dikaitkan ke **tanggal kerja** shift yang jendelanya memuat waktu absen (shift malam → tanggal mulai). Absen ganda (masuk dua kali) ditolak dengan pesan; koreksi lewat pengajuan koreksi.

### 5.4 Selfie
Bukti visual saja (tanpa pencocokan wajah — tetap backlog). Bucket private `attendance-selfies`, signed URL baca ± 10 menit, yang bisa melihat: pemilik, MANAGER (tim), HR_ADMIN (PT), SUPER_ADMIN. **Retensi 12 bulan** → cron `purge-selfies` menghapus file & mengisi `selfie_purged_at` (data absen tetap).

## 6. Approval absen (D-068, diubah D-073)

- ~~Satuan approval = hari absen~~ → **D-073: satuan approval = satu absen** (Clock In dan Clock Out masing-masing). Hari `APPROVED` bila keduanya disetujui; `REJECTED` bila salah satu ditolak; hari `NO_CHECKOUT` menunggu input manual / koreksi.
- **Cegah salah pencet (D-073):** jam sekarang dibandingkan dengan jadwal pulang — Clock Out sebelum jam pulang − toleransi, Clock In ≤ 60 menit sebelum/lewat jam pulang, atau Clock In saat masih Clock In → peringatan di HP + konfirmasi wajib (server menolak tanpa konfirmasi). Karyawan dapat membatalkan absennya ≤ 15 menit selama belum diputuskan.
- **Autentikasi manual (D-073):** HR PT / SA memasukkan atau mengganti jam absen (alasan wajib, label `MANUAL`, audit, tanpa foto) — tetap disetujui Atasan; langkah HR otomatis disetujui bila HR yang memasukkan.
- **Paralel MANAGER + HR_ADMIN** (mesin approval PLAN §5.2): keduanya setuju → `APPROVED`; salah satu menolak → `REJECTED` final; kasus khusus (pengaju MANAGER/HR/tanpa atasan) & override SA sama dengan §5.2.
- **Persetujuan massal**: inbox dengan filter (tanggal, crew, lokasi, **hanya yang berlabel**), centang banyak → Setujui. Tolak wajib alasan (per hari).
- Tampilan per hari: dua foto (masuk/pulang), peta titik vs lingkaran geofence, jam server, label + alasan karyawan, shift roster.
- Notifikasi: **tidak** satu notifikasi per absen (terlalu banyak); badge jumlah menunggu + ringkasan harian (lihat OD-15 untuk batas waktu & pengingat).
- Hari `REJECTED` dihitung **tidak hadir** untuk rekap; karyawan bisa mengajukan **koreksi absensi** (approval paralel, sudah di PLAN) selama periode masih terbuka.

## 7. Cuti, izin, sakit (D-072)

### 7.1 Jenis
| Jenis | Memotong saldo cuti? | Catatan |
|---|---|---|
| **Cuti tahunan** | Ya | Satu-satunya "cuti" (PLAN §5.3). |
| **Izin** (menikah, duka, melahirkan, dll.) | Tidak | Jenis & kuota per kejadian diatur SA; dokumen sesuai jenis. |
| **Sakit** | Tidak | Surat dokter wajib di atas N hari (pengaturan per jenis). |
| **OFF roster** | Tidak | Bukan pengajuan; berasal dari roster. |
| **Tanggal merah & cuti bersama** | Tidak | Dari kalender libur — kecuali kasus §7.3. |

### 7.2 Saldo cuti tahunan
- **Master Cuti per tahun** (seperti contoh web lama): tahun, kuota penuh (default 12 hari), tanggal berlaku 1 Jan–31 Des, status aktif.
- **Jatah diberikan 1 Januari** (cron `leave-annual-grant`):
  - Karyawan dengan masa kerja penuh tahun sebelumnya → kuota penuh.
  - Karyawan baru → **prorata 1 hari per bulan kerja penuh** sampai 31 Desember tahun sebelumnya: masuk tanggal **1–15** → bulan itu dihitung; masuk **> 15** → mulai bulan berikutnya. Contoh: masuk 10 November 2025 → November + Desember = **2 hari** untuk 2026. ⚠ Contoh pemilik projek saat grill menyebut 1 hari; rumus mengikuti pilihan "1 hari per bulan kerja penuh" — dikonfirmasi ulang sebelum Tahap E.
- ~~**Sisa tahun lalu berlaku sampai 31 Maret**, lalu hangus (cron `leave-carry-expiry` 1 April). Pemakaian mengambil sisa tahun lalu lebih dulu.~~ **TM-D9 (2026-10-21):** mulai saldo 2026 sisa **hangus 31 Desember** tahunnya (cron `leave-daily` mulai 1 Januari); seluruh hari pengajuan dibebankan ke tahun hari terhitung pertama; tidak ada pemakaian sisa tahun lalu.
- **Hutang cuti** diperbolehkan (saldo boleh minus) — mengubah PLAN §5.3 "saldo tidak boleh negatif". Hutang **dilunasi akhir Januari** dengan memotong jatah baru; bila jatah baru tidak cukup, sisa hutang tetap tercatat dan ditandai untuk HR (tindak lanjut di luar sistem, mis. potong gaji — keputusan payroll Fase 8).
- **Hold** saat pengajuan, dikembalikan bila ditolak/dibatalkan, menjadi terpakai bila disetujui (tetap seperti PLAN). Setiap perubahan saldo = baris **buku besar** (grant, carry, expire, hold, release, use, debt, settle, adjust) supaya saldo selalu bisa ditelusuri.

### 7.3 Menghitung hari cuti
- Yang dihitung hanya **hari kerja roster** di dalam rentang pengajuan; hari OFF dan tanggal merah nasional tidak dihitung.
- **Cuti bersama**: tidak memotong cuti — **kecuali** karyawan yang pada hari itu **dijadwalkan bekerja di roster** dan **tidak masuk** → dihitung **1 hari cuti** (boleh menjadi hutang). Diproses saat rekap harian/tutup periode.
- ⚠ Asumsi untuk dikonfirmasi: tanggal merah **nasional** yang jatuh pada hari kerja roster dan karyawan tidak masuk tanpa pengajuan → dihitung tidak hadir (bukan cuti otomatis), sama seperti hari kerja biasa.

### 7.4 Pengajuan
Dari HP/web: jenis, rentang tanggal, alasan, lampiran (dokumen sesuai jenis). Approval **paralel MANAGER + HR** (PLAN §5.2). Saat disetujui: hari roster dalam rentang ditandai **Cuti/Izin/Sakit** (hari absen tidak diperlukan), saldo diperbarui.

## 8. Tutup periode & surat pernyataan (D-071)

1. HR ber-grant `payroll.period.prepare` (atau SA) membuka layar **Tutup Periode** (bulan): ringkasan hari menunggu, ditolak, tanpa absen, cuti/izin/sakit.
2. Saat ditutup: setiap hari kerja roster yang **belum disetujui keduanya** atau **tanpa absen** dan tanpa cuti/izin/sakit disetujui → status **ALPHA** (tidak hadir).
3. Untuk setiap ALPHA, karyawan **wajib membuat Surat Pernyataan Absensi** (alasan + lampiran opsional) dari HP/web — catatan **kepatuhan** untuk sanksi; tidak mengubah status ALPHA dan tidak membuka periode. HR melihat daftar ALPHA beserta pernyataannya; tindak lanjut sanksi memakai **Surat Peringatan** (D-057, rencana).
4. Periode tertutup terkunci: absen, roster, cuti di periode itu tidak bisa diubah (koreksi setelah tutup = keputusan payroll, di luar cakupan ini).

## 9. Akses (tambahan/ubahan PLAN §4.3)

| Aksi | SA | HR | MGR | EMP |
|---|---|---|---|---|
| Master shift, pola roster, crew & anggota | ✅ | ✅ PT ditugaskan | 👁 tim | ❌ |
| Grid roster & import Excel roster | ✅ | ✅ PT ditugaskan | 👁 tim | 👁 sendiri |
| Ajukan perubahan/tukar shift | ✅* | ✅ | ✅ (sendiri & atas nama tim) | ✅ sendiri |
| Keputusan perubahan/tukar shift | override | ✅ | ✅ tim | ✅ rekan yang ditukar (persetujuan rekan) |
| Absen lewat PWA | ✅* | ✅* | ✅* | ✅ |
| Keputusan hari absen | override | ✅ PT ditugaskan | ✅ tim | ❌ |
| Master Cuti per tahun & jenis izin/sakit | ✅ | 👁 | 👁 | 👁 |
| Tutup periode | ✅ | 🔑 `payroll.period.prepare` | ❌ | ❌ |
| Surat pernyataan absensi | 👁 semua | 👁 PT ditugaskan | 👁 tim | ✅ buat sendiri |

\* akun terhubung ke data karyawan. Baris lama (lihat absensi & selfie, koreksi, lembur, cuti) tetap. Perubahan dari PLAN: "Template shift" kini juga dikelola HR untuk PT-nya (roster disusun di site), bukan hanya SA.

## 10. Rancangan data (ringkas; detail saat migrasi)

| Skema | Tabel | Isi utama |
|---|---|---|
| `organization` | `holidays` | tanggal, nama, jenis `NATIONAL` / `COLLECTIVE_LEAVE` |
| `organization` | `system_settings` | ambang akurasi GPS, retensi selfie, dll. |
| `approval` | `approval_requests`, `approval_steps` | subjek baru: `ATTENDANCE_DAY`, `ROSTER_CHANGE` (+ yang ada: LEAVE, PERMIT, ATTENDANCE_CORRECTION, OVERTIME) |
| `attendance` | `shifts` | PT, kode, jam, jendela & toleransi |
| `attendance` | `roster_patterns` | nama, langkah (array kode shift / OFF) |
| `attendance` | `crews`, `crew_members` | PT, lokasi kerja, pola, tanggal mulai siklus; anggota berlaku dari/sampai |
| `attendance` | `roster_days` | karyawan, tanggal kerja, shift (null = OFF), sumber, unik (karyawan, tanggal) |
| `attendance` | `roster_change_requests` | tanggal, shift lama/baru, rekan tukar, alasan, referensi approval |
| `attendance` | `attendance_days` | karyawan, tanggal kerja, snapshot shift, status (`PENDING`/`APPROVED`/`REJECTED`/`ALPHA`/`LEAVE`), label[], alasan, referensi approval |
| `attendance` | `attendance_punches` | hari, jenis `IN`/`OUT`, waktu server, lat/lng, akurasi, jarak, lokasi, di dalam geofence, path selfie, `selfie_purged_at` |
| `attendance` | `attendance_corrections`, `overtime_requests` | (sudah direncanakan PLAN) |
| `attendance` | `attendance_periods`, `attendance_statements` | periode OPEN/CLOSED; surat pernyataan per hari ALPHA |
| `leave` | `leave_types`, `leave_years` | jenis (ANNUAL/PERMIT/SICK), dokumen wajib; Master Cuti per tahun (kuota) |
| `leave` | `leave_balances`, `leave_ledger` | saldo per karyawan per tahun (jatah, sisa lalu + kedaluwarsa, terpakai, hold, hutang) + buku besar |
| `leave` | `leave_requests` | jenis, rentang, hari terhitung, lampiran, status, referensi approval |

Cron baru (Vercel, harian): `roster-extend`, `attendance-no-checkout`, `purge-selfies`, `leave-annual-grant` (1 Jan), `leave-debt-settle` (31 Jan), `leave-carry-expiry` (1 Apr).

## 10a. Menyiapkan data di DB lokal (pengembang)

Setiap pengembang memakai DB lokalnya sendiri; tidak ada langkah yang menyentuh database Supabase.

1. `bun run db:migrate` — menerapkan migrasi Time Management (skema `approval`, `attendance`, `leave`).
2. `bun run db:seed` — PT ACP & master data dasar (bila belum).
3. `bun run db:seed:time` — libur resmi SKB 3 Menteri (2026–2027) & Master Cuti tahun berjalan.
4. Opsional `bun run db:seed:time -- --demo` — site ber-geofence (`DEMO_LAT`/`DEMO_LNG`), shift D/N, pola
   4D-4N-2OFF, crew, karyawan demo `TMDEMO-*`, roster, saldo cuti; akun SA lokal (bila ada) ditautkan ke
   karyawan demo supaya bisa absen.
5. Opsional `-- --demo --accounts` — akun login demo (manager, karyawan, HR). **Membuat user di Supabase Auth**
   project pada `SUPABASE_URL`; jalankan hanya bila project Auth itu milik/izin Anda.

Script menolak berjalan bila `DATABASE_URL` bukan lokal, dan aman dijalankan berulang (tanggal libur yang
sudah ada & data demo yang sudah ada tidak ditimpa). Jenis cuti/izin/sakit bawaan dibuat otomatis saat
halaman cuti pertama kali dibuka.

## 11. Keputusan terbuka (dicatat di PLAN §9)

| ID | Pertanyaan | Sebelum |
|---|---|---|
| **OD-13** | Format file Excel roster yang dipakai site saat ini (contoh file anonim). | Tahap B (import roster) |
| **OD-14** | Lembur: dihitung otomatis dari jam pulang melebihi shift, atau tetap pengajuan (PLAN: MANAGER saja)? | Tahap F |
| **OD-15** | Batas waktu approval hari absen & pengingat (mis. H+2), siapa yang diingatkan. | Tahap D |

Asumsi yang perlu dikonfirmasi saat tahapnya dikerjakan: contoh prorata (§7.2), tanggal merah nasional pada hari kerja roster (§7.3), sisa hutang setelah pelunasan Januari (§7.2).

## 12. Tahapan (PROGRESS Fase 5–6)

| Tahap | Isi | Selesai bila |
|---|---|---|
| **A. Fondasi** | Modul `approval` (paralel/tunggal, override, kasus khusus), `holidays`, `system_settings`, bucket `attendance-selfies` | Test matriks approval & kasus khusus lulus |
| **B. Roster** | Shift, pola, crew, generator, grid bulanan, import Excel, perubahan/tukar shift + approval | Roster 3 bulan untuk 4 crew terbentuk benar (teruji, termasuk shift malam) |
| **C. Absen PWA** | `/absen` (PWA), selfie + GPS, pra-cek label, riwayat, cron `attendance-no-checkout` & `purge-selfies` | Absen masuk/pulang dari HP tercatat dengan label benar (teruji) |
| **D. Approval absen** | Data Absen Harian, inbox MANAGER/HR, persetujuan massal, override | Alur karyawan → manager + HR → disetujui/ditolak teruji |
| **E. Cuti/izin/sakit** | Master Cuti, jenis, saldo + buku besar (grant, prorata, carry 31 Mar, hutang), pengajuan + approval | Skenario saldo (prorata, hangus, hutang, cuti bersama) teruji |
| **F. Tutup periode** | Rekap bulanan, koreksi & lembur, tutup periode → ALPHA, surat pernyataan | Rekap bulanan akurat untuk skenario roster, libur, cuti (teruji) |
