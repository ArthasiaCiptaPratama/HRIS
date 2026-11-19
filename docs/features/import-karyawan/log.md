# Log — Import data karyawan

Entri terbaru di **atas**. Format satu entri (salin):

```
### 2026-11-19 — Pangkas paket A "sekali lihat" (IMP-D5) (Oatse)
- **Dikerjakan:** web `features/employee/import/`: `import-page.tsx` (mode dilipat, template tautan, 🔒 di Rincian, Pemetaan dilewati otomatis + `goMapping`, Selesai satu baris, dialog Simpan/lampiran pendek), `mapping-step.tsx` (`mappingHasIdentity`/`mappingReviewColumns` diekspor), `complete-step.tsx` (kartu wajib bernomor + `DoneLine` ✔, Mirip paling atas), `unit-matching.tsx` (hanya yang perlu dipilih/diubah di layar + "Lihat semua (N)"), `preview-step.tsx` (ringkasan satu baris, `issueShort` + tooltip), `attachments-panel.tsx` (satu baris progres + Rincian), `import-guide.tsx` (hanya langkah aktif terbuka), `info-tip.tsx` baru, `labels.ts` `issueShort`. Sesi hris-14 terputus restart 12:00; dilanjutkan dari working tree.
- **Keputusan:** IMP-D5 butir (7) "sekali lihat" + Pemetaan dilewati otomatis.
- **Verifikasi:** typecheck ✔; biome ✔ (1 warning lama `roster-edit.service.ts`); boundaries ✔; web 62 file / 434 test ✔ (employee-import 16, import-attachments 5). Uji visual Zen headless akun HR Admin 977 px + 1440 px (iframe) `QA/2026-11-19-import-ux/sesudah-pangkas/`; temuan uji visual diperbaiki: unit dari profil tersimpan ikut tampil, nilai dobel "PKWT [PKWT ▾]". Susulan (tinjauan supervisor): stepper 4 langkah sejak Unggah, "Pemetaan kolom" hanya disisipkan bila langkahnya tampil (test + screenshot `977-01-unggah`).
- **Masalah / catatan:** Selesai & panel lampiran belum diverifikasi visual (tidak menulis DB lokal); DB lokal tanpa job `qa-ux*`.
- **Berikutnya:** paket B spike B0 (TanStack Table + react-virtual).

### YYYY-MM-DD — <judul singkat> (<PIC>)
- **Dikerjakan:** … (rujuk item checklist README)
- **Keputusan:** <PREFIX>-Dn baru / OD terjawab
- **Verifikasi:** perintah + hasil nyata
- **Masalah / catatan:** …
- **Berikutnya:** …
```

### 2026-11-19 — Import ramah pengguna awam: analisis + paket A (IMP-D5) (Oatse + worker Codex)
- **Dikerjakan:** analisis alur (screenshot lokal `QA/2026-11-19-import-ux/01–07`, bukti staging: 5 import semuanya oleh Super Admin, 0 oleh HR; 20/121 baris error, ±60% masalah error = salah format NPWP/No. HP/email) → 6 jawaban pengguna → paket A: pesan error sehari-hari (`row.ts`, `labels.ts`), Pratinjau tanpa geser (`preview-step.tsx`), pemetaan ringkas (`mapping-step.tsx`, Codex), template HRIS (`template/build-template.ts`, Codex), Unggah mode di atas + catatan 🔒 + tombol template (`import-page.tsx`), daftar master baru + tanda mirip (`complete-step.tsx`, shared `findSimilarMaster`), panduan, teks dialog/toast/pesan file (`parse-file.ts`, `attachments-panel.tsx`).
- **Keputusan:** IMP-D5 (README).
- **Verifikasi:** lihat entri commit (test import shared/web, typecheck, biome, boundaries; uji visual lokal).
- **Masalah / catatan:** alasan lampiran Drive per item (`reason`) berasal dari API — belum ditinjau (paket A tanpa ubah API). Konfirmasi baru untuk "Ganti file"/"Simpan" tidak ditambahkan (butuh sketsa).
- **Tambahan (jawaban pengguna 11:23 WIB):** satu tautan pemegang bagan di atas tabel; dialog "Ganti file?" & "Simpan N karyawan?" (judul ikut lampiran bila tanpa karyawan); teks kartu/panel/alasan lampiran (`open-attachments.tsx`, `attachments-panel.tsx`, api `employee-import-attachments.service.ts` teks saja); bilah tombol Pratinjau bisa turun baris. Verifikasi: web import 45 ✔, api `import-attachments` 8 ✔, shared 138 ✔, typecheck/boundaries ✔. Catatan uji: tab headless di latar menahan animasi (judul halaman `animate-fade-up` kosong, dialog tertutup tetap terlihat) — perilaku browser untuk tab tersembunyi, bukan bug paket A. Data uji lokal: karyawan dummy QA-UX-01/02 + 2 job lampiran gagal (kartu "belum selesai" di akun HR lokal) — dibersihkan setelah ada kata pengguna.
- **Berikutnya:** rencana paket B versi spreadsheet (arahan pengguna 11:30 WIB).

### 2026-11-16 — Kolom Grade/Level = kode level HR (IMP-D4) (Oatse)
- **Dikerjakan:** `employee-import.service.ts` — diff kode HR (`hrLevelCode`), tanpa master Grade (cek arsip & nama baru dihapus), peringatan `HR_LEVEL_*` di Pratinjau (`levelVotes`, `knownPosition`), simpan `hrLevelCode` + `fillEmptyPositionLevels`; shared label "Level (kode HR)" + pesan isu; web teks "Lengkapi data" tanpa grade.
- **Keputusan:** IMP-D4 (README).
- **Verifikasi:** `import.test.ts` 44/44 (+1 ORG-D8: peringatan per kode, penanda tersimpan, level jabatan kosong terisi, bentrok tidak diisi, ber-level tidak diubah; 2 test lama disesuaikan); web `employee-import.test.tsx` ✔.
- **Masalah / catatan:** —
- **Berikutnya:** commit bersama ORG-D8.

### 2026-11-13 — Status keluar di file menonaktifkan karyawan yang sudah ada (IMP-D3) (Oatse)
- **Dikerjakan:** `employee-import.service.ts`: `EXIT_EXISTING_IGNORED` diganti `plan.deactivate` (aktif, berizin, bukan akun sendiri, tanggal ≥ tanggal masuk); simpan = `updateEmployee` nonaktif + lepas pos + `syncPostManagers`, riwayat DEACTIVATED, `deactivateAccountOfEmployee`, audit deactivate; baris dengan `deactivate` tidak jadi SKIP; pratinjau `rows[].deactivate`. Shared: pesan `EXIT_ALREADY_INACTIVE` / `EXIT_OWN_ACCOUNT` / `EXIT_FORBIDDEN`. Web: "Akan dinonaktifkan: <alasan> per <tanggal>" di Keterangan Pratinjau.
- **Keputusan:** IMP-D3 (mengubah design.md §6 butir 4).
- **Verifikasi:** test import api 43 ✔ (+3: UPSERT & FILL_EMPTY aktif → nonaktif + riwayat + akun + audit, sudah nonaktif tidak berubah; tanggal sebelum masuk → error, CREATE_ONLY dilewati); web import 15 ✔ (baris "Akan dinonaktifkan").
- **Masalah / catatan:** tanpa migrasi. Smoke browser tidak dilakukan (hanya satu baris teks di Pratinjau; dicakup test web).

### 2026-11-13 — Mode import "Isi yang kosong saja" (IMP-D2) (Oatse)
- **Dikerjakan:** handoff supervisor 14:21 (keputusan pengguna 14:20). Migrasi `20261113073214_add_import_mode_fill_empty` (enum `ImportMode` + `FILL_EMPTY`). API `employee-import.service.ts`: `diff` memisah `changes` (field kosong → diisi) dan `kept` (sudah berisi & beda → dibiarkan) bila `fillEmpty`; status nikah turunan PTKP ikut dibiarkan bila PTKP dibiarkan; baris yang jabatannya sudah terisi tidak ikut `resolveUnits` (tanpa unit baru); simpan: data pribadi per kunci yang masih kosong, bank per field; pratinjau `rows[].kept`. Shared `detect.ts`: kolom email berisi email gratis tanpa kata kantor → Email pribadi. Web: kartu "Isi yang kosong saja" (tengah, bawaan tetap "Tambah + perbarui"), Pratinjau "Diisi:" + "Dibiarkan (sudah berisi, beda):", mode di ringkasan Pengaturan.
- **Keputusan:** IMP-D2.
- **Verifikasi:** test import api 40 ✔ (+1 FILL_EMPTY: isi kosong, kept, tanpa master baru, baris baru, EMP-D5 IMPORT), employee integration 243 ✔, shared 375 ✔ (+3 deteksi email), web import 15 ✔ (+1); smoke pratinjau ke DB lokal (Rizky, tanpa simpan): UPSERT 6 field berubah + unit baru, FILL_EMPTY diisi Email pribadi & PTKP, dibiarkan HP/jabatan/kota asal/status nikah, tanpa unit baru.
- **Masalah / catatan:** ada migrasi → rilis staging perlu `db:deploy`; Mat perlu dikabari (migrasi baru di develop).
- **Berikutnya:** rilis staging (sesi HRIS-rilis), lalu import pelengkapan data staging dengan mode ini.

Log sebelum 2026-10-13 ada di [archive/log-2026-09.md](../../archive/log-2026-09.md) dan [archive/log-2026-10.md](../../archive/log-2026-10.md) (cari judul atau D-xxx fitur ini).

### 2026-11-10 — IMP-D1 ke staging (Oatse)
- **Dikerjakan:** IMP-D1 dirilis ke staging gel. 23 (develop `a95d62d`, oleh `hris-rilis-0d`); contoh nama di README, komentar `chart-holder.ts`, dan test diganti nama fiktif (`a95d62d`).
- **Keputusan:** —
- **Verifikasi:** `Deploy staging` #42796846160 ✔ (`openapi.json` memuat `chartHolderChoices`); CI develop #42793861373 ✔.
- **Masalah / catatan:** belum ada import file data asli di staging.
- **Berikutnya:** import file data asli di staging memakai IMP-D1 setelah file dari pengguna tersedia.

### 2026-11-10 — Import melengkapi pemegang bagan ASLI- (IMP-D1) (Oatse)
- **Dikerjakan:** shared `import/chart-holder.ts` (kunci nama tanpa gelar/tanda baca, saran inisial, `NAME_TITLES`), pesan issue; API: `chartHolderChoices` di body, `rows[].chartHolder` & `chartHolders` di pratinjau, gabung = UPDATE (NIP diganti/dikosongkan, jabatan pos dipertahankan, CREATE_ONLY tetap boleh), audit `employee.import.chart_holder_merged`, stempel hash pratinjau memuat target; web: pemilih "Gabungkan dengan pemegang bagan…" per baris (saran nama/inisial + pemegang lain PT sama) & blok "Pemegang bagan yang belum dilengkapi".
- **Keputusan:** IMP-D1 (menutup catatan risiko D-066).
- **Verifikasi:** typecheck ✔, biome ✔, boundaries ✔; shared import-chart-holder 11 · integration import 50 (baru 3) · web employee-import 13 ✔.
- **Masalah / catatan:** nama dengan susunan kata berbeda (mis. nama panggilan) tetap perlu dipilih manual.
- **Berikutnya:** rilis staging gelombang berikutnya (setelah `hris-rilis-0d`).

