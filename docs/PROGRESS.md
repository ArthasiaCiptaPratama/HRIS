# PROGRESS — HRIS (induk)

> **Fungsi file ini:** gambaran besar — status **per fitur**, fokus sekarang, blocker, keputusan terbuka, backlog, dan log ringkas. **Detail** (checklist, keputusan fitur, log sesi) ada di `features/<fitur>/`. Cara baca: [docs/README.md](README.md).
> **Siapa mengubah file ini:** baris fitur & fokus diperbarui **saat branch digabung ke develop** (oleh yang melakukan merge). Sehari-hari setiap PIC hanya menulis folder fiturnya sendiri (PROMPT §8).

**Legenda status:** `Belum mulai` · `Berjalan` · `Review` · `Selesai` · ✔ develop / ✔ staging = sudah ada di jalur itu.

## Status per fitur

| Fitur | Fase | PIC | Branch kerja | Status | Staging |
|---|---|---|---|---|---|
| [fondasi](features/fondasi/README.md) | 0–1 | Oatse | `HRIS/Oatse/Linux-Windows` | Selesai (sisa: uji Windows, OD-9, OD-12) | ✔ |
| [iam](features/iam/README.md) | 2 | Oatse | `HRIS/Oatse/Linux-Windows` | Review (sisa: captcha ditunda, OD-5) | ✔ |
| [organisasi](features/organisasi/README.md) | 3 | Oatse | `HRIS/Oatse/Linux-Windows` | Berjalan (sisa: profil perusahaan, pengaturan sistem) | ✔ |
| [karyawan](features/karyawan/README.md) | 4 | Oatse | `HRIS/Oatse/Linux-Windows` | Berjalan | ✔ |
| [import-karyawan](features/import-karyawan/README.md) | 4 | Oatse | `HRIS/Oatse/Linux-Windows` | Selesai untuk Form asli (D-059–D-064) | ✔ gel. 2–4.1 |
| [onboarding](features/onboarding/README.md) | 4 | Oatse | `HRIS/Oatse/Linux-Windows` | Selesai, QA LEGIT | ✔ aktif gel. 5 |
| [arsip](features/arsip/README.md) | 4 | Oatse | `HRIS/Oatse/Linux-Windows` | Berjalan — gel. 1a–1d ✔ staging; gel. 2a Aset & APD ✔ staging (QA LEGIT); gel. 2b SP ✔ lokal (QA 12/12, belum rilis); sisa rilis 2b, gel. 3, OD-11 | ✔ gel. 6 & gel. 7 Aset (QA LEGIT) |
| [dashboard](features/dashboard/README.md) | 4 | Mat | `HRIS/Mat/windows` | Selesai (D-065) | ✔ gel. 3 |
| [time-management](features/time-management/README.md) | 5–6 | Mat | `HRIS/Mat/Mac` (sebelumnya `HRIS/Mat/windows`) | Berjalan — ✔ develop 2026-10-13 (`e31e934`); lokasi absen per karyawan TM-D1 ✔ develop 2026-10-15; sisa: lembur OD-14, uji HP, cron, adapter | terpasang tersembunyi (gel. 7, saklar `false`) |
| [kontrak](features/kontrak/README.md) | 7 | – | – | Belum mulai | – |
| [payroll](features/payroll/README.md) | 8 | – | – | Belum mulai (OD-1–OD-3) | – |
| [hardening](features/hardening/README.md) | 9 | – | – | Belum mulai | – |

Fase (PLAN §7) → fitur: 0–1 fondasi · 2 iam · 3 organisasi · 4 karyawan, import, onboarding, arsip, dashboard · 5–6 time-management · 7 kontrak · 8 payroll · 9 hardening · Rilis 1–3 → [RELEASE.md](RELEASE.md).

## Fokus saat ini

- **Perapihan dokumen (2026-10-13):** struktur induk + `features/` + `codemap/` + `decisions.md` + `RELEASE.md` (lihat log ringkas). Mat diminta **pull develop** sebelum lanjut dan sejak itu hanya menulis `features/time-management/` & `features/dashboard/`.
- **Rilis gel. 7 ke staging (2026-10-14):** develop di-push sampai `5859111` (CI #38509210626 ✔) lalu dirilis: **Aset & APD tampil** (QA staging 15/15 LEGIT), **Time Management terpasang tersembunyi** (kode + 7 migrasi, saklar `timeManagement` `false`, cron TM belum terdaftar) — [RELEASE §4](RELEASE.md#4-riwayat-rilis-staging).
- **Arsip gel. 1 + Layanan Mandiri tampil di staging (rilis gel. 6, 2026-10-13)** — QA 14/14 LEGIT.
- **Arsip gel. 2a Aset & APD (ARS-D1–D6):** ✔ develop & ✔ staging (rilis gel. 7, QA LEGIT).
- **Arsip gel. 2b Surat Peringatan (D-057, ARS-D7–D15):** ✔ lokal 2026-10-15 — modul `discipline` + web + QA lokal 12/12; menunggu izin commit/push lalu rilis staging (1 migrasi, cron `discipline-daily`, saklar `discipline`). Berikutnya gel. 3 Laporan.
- **Time Management sebelum rilis:** adapter `attendance/directory.ts` → `index.ts` (aturan emas #3), cron di `vercel.json`, uji HP kamera/GPS, OD-13–OD-15, konfirmasi contoh prorata (D-072) — [features/time-management](features/time-management/README.md).

## Blocker & wajib sebelum produksi

- OD-9 (proteksi `main`), OD-4 (akun Vercel/Supabase kantor), OD-5 (akun email produksi), OD-11 (masa simpan data keluar), OD-12 (repo public).
- **Rotasi rahasia & keamanan** (password DB staging, token Vercel, akun uji, akun Google/Cloudflare, folder Drive, rclone) — ditunda pemilik projek, **wajib** sebelum data asli/produksi: [RELEASE §6](RELEASE.md#6-wajib-sebelum-produksi).
- `node_modules` dipasang dari Linux → di Windows typecheck/biome/test gagal EPERM; verifikasi dilakukan di Linux.

## Keputusan terbuka

Ringkasan & status. Pertanyaan lengkap + rekomendasi: [decisions.md](decisions.md#keputusan-terbuka-od-1od-15). OD baru berprefix fitur (`TM-OD1`) ditambahkan di bawah saat digabung ke develop.

| ID   | Ringkasan                                   | Memblokir | Status              |
| ---- | ------------------------------------------- | --------- | ------------------- |
| OD-1 | Metode PPh 21 (gross/gross-up/net)          | Fase 8    | Menunggu keputusan  |
| OD-2 | THR dihitung sistem?                        | Fase 8    | Menunggu keputusan  |
| OD-3 | Verifikator golden cases payroll            | Fase 8    | Menunggu keputusan  |
| OD-4 | Kepemilikan akun Vercel/Supabase & paket     | Rilis 1   | Menunggu keputusan  |
| OD-5 | Email: penyedia = Google Workspace (D-025); akun pengirim final (produksi) | Rilis 1   | Sebagian: staging `admin.arthasia@gmail.com` (D-032) |
| OD-6 | Ubah data sensitif/gaji milik sendiri       | Fase 4    | Terjawab → D-054 (lewat pengajuan; saat onboarding D-046) |
| OD-7 | Cara `db:deploy` & env per environment      | Fase 1    | Terjawab → D-030 (GitHub Actions) |
| OD-8 | Rollback migrasi & backup produksi          | Rilis 1   | Menunggu keputusan  |
| OD-9 | Proteksi `main` butuh GitHub Team (repo private) | Rilis 1 | Ditunda pemilik projek (GitHub Pro pribadi tidak berlaku untuk repo organisasi) |
| OD-10 | Bentuk role akun | Fase 2 | Terjawab → D-028 (satu akun satu role) |
| OD-11 | Masa simpan data karyawan keluar (UU PDP)    | Rilis Arsip gel. 1 | Menunggu keputusan (usulan: kepegawaian & pajak 10 thn, identitas/kesehatan 5 thn) |
| OD-12 | Repo GitHub ternyata PUBLIC (2026-10-12; 2026-09-28 masih private) | Rilis 1 | Menunggu keputusan pemilik organisasi (usulan: kembalikan private) |
| OD-13 | Format file Excel roster dari site (D-069) | Tahap B import roster | Menunggu keputusan (nomor awal OD-12 di branch Mat; import sementara mengenali dua bentuk umum) |
| OD-14 | Lembur: otomatis dari absen vs shift, atau pengajuan | Tahap F | Menunggu keputusan (nomor awal OD-13; usulan: pengajuan + usulan jam otomatis) |
| OD-15 | Batas waktu approval absen & pengingat (D-068) | Tahap D | Menunggu keputusan (nomor awal OD-14; sementara pengaturan 2 hari) |

## Backlog

Ide atau fitur di luar fase aktif dicatat di sini dulu, **tidak langsung dikerjakan**.

- ~~**(2026-10-14, QA staging Aset)** Form Tambah aset: PT bawaan kosong bila data master terlambat~~ → diperbaiki develop 2026-10-14
- ~~**(2026-10-14)** Top bar melebar 34 px untuk SA di layar 1440 px (Personal Management)~~ → diperbaiki develop 2026-10-14 (kotak cari menyempit)
- **(2026-10-13, dari gabung Time Management)** Ganti adapter baca `apps/api/src/modules/attendance/directory.ts` (query langsung `employee`/`company`/`workLocation`, melanggar aturan emas #3) dengan fungsi publik di `modules/employee/index.ts` & `modules/organization/index.ts`.
- **(2026-10-13)** Daftarkan cron `roster-extend`, `attendance-daily`, `leave-daily` di `vercel.json` (cek batas cron Vercel Hobby) sebelum rilis Time Management.
- ~~**(2026-10-13)** Badge "DB · Lokal" (tukar DB, dev saja) menumpuk teks di kaki sidebar~~ → bawaan kanan-bawah, develop 2026-10-14
- ~~Atasan fungsional (garis putus-putus)~~ → dikerjakan D-051 (2026-10-05)
- ~~Slot posisi / headcount~~ → dikerjakan D-051 (2026-10-05)
- ~~Unit organisasi per PT~~ → dikerjakan D-052 (2026-10-05); sisa: nama unit unik per PT (saat ini unik se-grup)
- Sinkron atasan otomatis saat role akun berubah (hook iam → employee; sementara tombol Sinkronkan atasan) (D-053)
- Edit struktur bagan dengan seret-sambung di kanvas (D-051, tidak dipilih saat ini)
- Menu web Struktur Organisasi untuk EMPLOYEE (lewat ESS; API sudah mendukung) (D-051)
- Aktifkan *Leaked Password Protection* Supabase Auth bila tersedia di paket (advisor WARN, dari tugas deploy Vercel 2026-09-29)
- **(2026-10-15, dari audit Surat Peringatan)** Helper `todayInJakarta` / `isUniqueViolation` (P2002) terduplikasi ±7 kali di modul `asset`, `discipline`, `employee`, `leave`, `attendance` → satukan di `core/` (mis. `core/dates.ts`, `core/prisma-errors.ts`); cron `discipline-daily` lalu tidak perlu mengimpor `discipline.service.ts`.
- Aplikasi mobile (projek terpisah, memakai API yang sama)
- MFA untuk SUPER_ADMIN/HR_ADMIN
- Notifikasi WhatsApp
- Pencocokan wajah pada selfie absensi
- Approval berjenjang lebih dari satu atasan
- Test web flaky `documents.test.tsx` "versi aktif + versi sebelumnya" (gagal ±2/3 saat suite penuh, batas waktu `findByRole` 1 detik; sudah ada sebelum 2026-10-09) — 2026-10-12: suite penuh dengan 12 worker membuat beberapa test lain ikut acak gagal (`personal-management`, `import-attachments`); dengan `--maxWorkers=4` stabil 205/205 dua kali. Usul: batasi worker vitest / naikkan batas waktu `findBy*` — 2026-10-15: juga `import-attachments` & `archive.test.tsx` (riwayat jabatan) gagal acak di suite penuh, lulus saat sendiri / `--maxWorkers=4` (283/283)
- **Pekerja latar belakang untuk lampiran Drive** (2026-10-12; butuh keputusan, mengubah D-060): proses tetap jalan walau tab ditutup (mis. Vercel Queues/Workflow, atau pg_cron + Edge Function), browser cukup memantau status. Saat ini diproses dari browser per ±8 dtk + coba ulang otomatis
- Rotasi password DB Supabase staging setelah `.env.supabase.enc` sempat di-push di branch `HRIS/Mat/windows` (2026-10-09; bagian dari daftar keamanan §2)
- Login dengan NIP **atau** email kantor ber-domain Arthasia (D-063; tugas berikutnya setelah Import data Form asli lolos uji staging; mekanisme menyentuh D-033/D-048, butuh data email kantor dari HR)
- **rclone `hris-qa:` memakai client_id Google bawaan yang akan dihentikan 2026** → buat client_id sendiri (Google Cloud) lalu `rclone config reconnect hris-qa:` (2026-10-12)
- Kode wilayah resmi (Kemendagri) untuk rincian alamat: tabel wilayah + kolom kode di samping teks, terisi otomatis bila cocok persis, dropdown berjenjang di form (D-061 opsi C tahap 2; dari tugas Import Form 171 kolom, 2026-10-08)

## Log ringkas

Satu baris per sesi (terbaru di atas); rincian di `features/<fitur>/log.md`. Log sebelum 2026-10-13: [archive/log-2026-10.md](archive/log-2026-10.md) · [archive/log-2026-09.md](archive/log-2026-09.md).

- **2026-10-15** — Tampilan header detail karyawan: banner warna logo + pola statis, status karyawan vs akses aplikasi, perbesar foto; web 283. (Oatse) → [karyawan/log](features/karyawan/log.md)
- **2026-10-15** — Gabung `HRIS/Mat/Mac` ke develop (merge lokal): lokasi absen per karyawan TM-D1 (migrasi `20261015064508_employee_location_setting`), header profil model pas foto, switch DB dev + Auth/Storage lokal; tanpa konflik; api 777 · web 280. (Oatse) → [time-management/log](features/time-management/log.md)
- **2026-10-15** — Audit gel. 2b SP: 7 temuan diperbaiki (termasuk bocor akses filter MANAGER), api 764 · web 271, QA ulang 12/12. (Oatse) → [arsip/log](features/arsip/log.md)
- **2026-10-15** — Arsip gel. 2b Surat Peringatan (ARS-D7–D15): modul `discipline` + migrasi, Riwayat Peringatan, Jenis Pelanggaran, tab SP, SP di Layanan Mandiri; api 759 · web 270, QA lokal 12/12. (Oatse) → [arsip/log](features/arsip/log.md)
- **2026-10-14** — PT bawaan form aset (temuan QA staging) + Backlog tampilan: top bar 1440 px, teks Kalender Libur HR, badge DB dev; web 263. (Oatse) → [arsip/log](features/arsip/log.md)
- **2026-10-14** — Push develop `5859111` + rilis gel. 7: Aset & APD tampil di staging (PR #49/#50, Deploy #38509894453, 35 migrasi), Time Management terpasang tersembunyi; QA staging 15/15 LEGIT. (Oatse) → [arsip/log](features/arsip/log.md)
- **2026-10-14** — Logo Arthasia (sama dengan email) di kop PDF BAST; dokumen instruksi diselaraskan (Fokus, RELEASE antrean #50, CODEMAP). (Oatse) → [arsip/log](features/arsip/log.md)
- **2026-10-14** — Audit ulang Aset & APD: 5 temuan diperbaiki (BAST pelaku, race condition, tanggal masa depan, urutan APD, teks dialog); api 717, QA 12/12. (Oatse) → [arsip/log](features/arsip/log.md)
- **2026-10-14** — Aset & APD gel. 2a tahap C QA lokal 12/12 + perbaikan nomor BAST unik (api 713). (Oatse) → [arsip/log](features/arsip/log.md)
- **2026-10-14** — Aset & APD gel. 2a tahap B web (Data Assets, master, tab Aset, Aset saya; test web 262). (Oatse) → [arsip/log](features/arsip/log.md)
- **2026-10-13** — Aset & APD gel. 2a: grill ARS-D1–D6 + tahap A API (migrasi skema `asset`, modul, cron, test api 710). (Oatse) → [arsip/log](features/arsip/log.md)
- **2026-10-13** — Rilis gel. 6: Arsip gel. 1 + Layanan Mandiri tampil di staging (saklar, PR #47/#48, Deploy #38374784477), QA 14/14 LEGIT + arsip Drive. (Oatse) → [arsip/log](features/arsip/log.md)
- **2026-10-13** — Perapihan dokumen: induk PROGRESS + `features/` (12) + `codemap/` + `decisions.md` + `RELEASE.md` + arsip log; aturan prefix keputusan & aturan rekan tim. (Oatse) → [fondasi/log](features/fondasi/log.md)
- **2026-10-13** — Gabung Time Management + aplikasi HP dari `HRIS/Mat/windows` (merge `e31e934`, nomor D/OD Mat digeser +1, perbaikan grid kalender). (Oatse) → [time-management/log](features/time-management/log.md)
