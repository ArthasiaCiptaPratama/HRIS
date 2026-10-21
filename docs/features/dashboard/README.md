# Dashboard SA/HR

> **Kode prefix:** `DSB` · **Fase:** 4 · **PIC:** Mat · **Branch:** `HRIS/Mat/windows` · **Saklar `FEATURES`:** –
> **Status:** ✔ staging (rilis gel. 3, 2026-10-09)

Ringkasan agregat per cakupan PT, pivot bebas atur, susunan widget per akun dengan drag & drop (D-065). Dashboard karyawan/atasan memakai widget Time Management.

Dokumen fitur ini: **README** (status, checklist, keputusan) · [log.md](log.md). Induk: [PROGRESS](../../PROGRESS.md).

## Checklist

Legenda: `[ ]` belum · `[~]` sedang · `[x]` selesai · `[-]` dibatalkan/ditunda. Langkah baru: sub-item `(tambahan YYYY-MM-DD) alasan`.

### Fase 4 — Employee (bagian Dashboard)
- [x] Dashboard SA/HR: `GET /dashboard` (agregat, tanpa data per orang) + grafik ECharts (kontribusi rekan tim `5211a25`, dilengkapi di jalur rilis); MANAGER/EMPLOYEE tetap sapaan; sejak 2026-10-01 angka mengikuti cakupan PT aktor (D-040) (tambahan 2026-09-30, permintaan pemilik projek)
  - [x] Dashboard bisa diatur (D-065): pivot `GET /dashboard/pivot` (baris × kolom + filter; dimensi pribadi ber-grant), susunan widget per akun `iam.dashboard_layouts` + `GET/PUT/DELETE /me/dashboard-layout`, board drag & drop (`@dnd-kit`), pembuat grafik dengan pratinjau, Menu Cepat pilihan sendiri, widget bawaan Pendidikan/Lokasi/Unit per kategori — test api 575 lulus, shared 184, web 216/218 (2 flaky timeout lama di import/arsip, lulus saat dijalankan sendiri) (tambahan 2026-10-09: permintaan pemilik projek)

- [x] **Dashboard analitik SDM & biaya (DSB-D1 / TM-D10)** (tambahan 2026-10-21: grill pemilik projek): modul API baru `analytics` (`GET /dashboard/analytics?month&companyId&scenario`, tanpa tabel; SA/HR PT/atasan tim; rupiah hanya ber-grant `labor.cost.read`; proyeksi pensiun hanya bila boleh data pribadi), rumus PP 35/2021 di `@hris/shared` `severance.ts`; widget baru: kartu Turnover, Sedang Cuti, Efisiensi, Kewajiban kompensasi (section Angka) + insight Pergerakan karyawan 12 bulan, Gender, Masa kerja vs cuti, Cuti, Efisiensi jam kerja, Proyeksi 12 bulan, Labor cost, Kewajiban kompensasi (pilih skenario) di section Grafik; "Periode analitik" di toolbar; widget biaya tersembunyi tanpa izin — branch `HRIS/Mat/Mac`, belum develop
  - Atasan (MANAGER) belum melihat papan dashboard (masih dashboard pribadi); API sudah mendukung cakupan tim (tambahan 2026-10-21)

- [x] **Dashboard analitik SDM & biaya (DSB-D1 / TM-D10)** (tambahan 2026-10-21: grill pemilik projek): modul API baru `analytics` (`GET /dashboard/analytics?month&companyId&scenario`, tanpa tabel; SA/HR PT/atasan tim; rupiah hanya ber-grant `labor.cost.read`; proyeksi pensiun hanya bila boleh data pribadi), rumus PP 35/2021 di `@hris/shared` `severance.ts`; widget baru: kartu Turnover, Sedang Cuti, Efisiensi, Kewajiban kompensasi (section Angka) + insight Pergerakan karyawan 12 bulan, Gender, Masa kerja vs cuti, Cuti, Efisiensi jam kerja, Proyeksi 12 bulan, Labor cost, Kewajiban kompensasi (pilih skenario) di section Grafik; "Periode analitik" di toolbar; widget biaya tersembunyi tanpa izin — branch `HRIS/Mat/Mac`, belum develop
  - Atasan (MANAGER) belum melihat papan dashboard (masih dashboard pribadi); API sudah mendukung cakupan tim (tambahan 2026-10-21)

## Keputusan

Isi lengkap di [decisions.md](../../decisions.md).

- [D-065](../../decisions.md#d-065) Dashboard SA/HR yang bisa diatur

**Keputusan baru** (prefix `DSB-D1`, `DSB-D2`, …; tulis lengkap di sini, lalu daftarkan di indeks [PLAN §8](../../PLAN.md#8-keputusan-adr-ringkas) saat digabung ke develop):

| ID | Keputusan | Alasan / sumber |
|---|---|---|
| DSB-D1 | **Dashboard analitik SDM & biaya** (rencana, menunggu Paket 3). Kartu: aktif awal bulan, + masuk, − keluar per alasan, = aktif akhir bulan + turnover (grafik 12 bulan); gender; masa kerja vs pemakaian cuti; cuti hari ini (sedang cuti, menunggu, terpakai, sisa); efisiensi = jam efektif ÷ jam terjadwal + % lembur/telat/Alpha per unit/lokasi; proyeksi 12 bulan (PKWT habis, ambang masa kerja pesangon/UPMK, pensiun); labor cost kontrak vs tetap; kewajiban pesangon/UPMK/UPH cuti dengan skenario PHK yang dipilih (TM-D10). **Tata letak:** kartu angka 1/4 lebar, grafik 1/3 lebar; persentase = porsi dari total + perubahan vs bulan lalu. **Akses:** SA & HR (PT cakupan) bagian non-rupiah; Atasan hanya timnya; kartu rupiah hanya SA + HR ber-grant "Biaya" (Atasan: total lembur Rp tim). | Pemilik projek 2026-10-21 (grill) |
| DSB-D2 | **Tata letak dashboard yang bisa diatur.** (1) Dashboard dibagi **3 section tetap**: atas *Angka ringkas* (widget stat), tengah *Menu Cepat*, bawah *Grafik*; widget hanya bisa digeser di dalam section-nya (`DASHBOARD_SECTIONS`, `orderBySection`, juga dinormalisasi saat disimpan API). (2) **Widget kecil (¼) hanya donut atau bar**; dikecilkan → otomatis donut, jenis lain nonaktif di menu (`fitWidgetToSize`, juga saat tampil & disimpan). (3) Grafik membaca lebar widget: sumbu & label diringkas, angka sel heatmap disembunyikan bila tak muat. (4) Angka tengah donut & persen tooltip mengikuti legenda yang dimatikan. | Pemilik projek 2026-10-21 |

## Keputusan terbuka

Tidak ada.

OD baru: `DSB-OD1`, … (tulis di sini + ringkasan di [PROGRESS](../../PROGRESS.md#keputusan-terbuka)).

## Kode

Detail modul: [employee](../../codemap/employee.md) · [iam](../../codemap/iam.md).

## QA

- [plans/2026-10-12-dashboard.md](../../qa/plans/2026-10-12-dashboard.md)
- [runs/2026-10-12-dashboard.md](../../qa/runs/2026-10-12-dashboard.md)
- [bugs/BUG-004-sapaan-dashboard-pakai-email.md](../../qa/bugs/BUG-004-sapaan-dashboard-pakai-email.md)

Aturan & templat QA: skill `hris-qa-docs` ([docs/qa/README.md](../../qa/README.md)).
