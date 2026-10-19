# Log — Karyawan — Personal Management

Entri terbaru di **atas**. Format satu entri (salin):

```
### YYYY-MM-DD — <judul singkat> (<PIC>)
- **Dikerjakan:** … (rujuk item checklist README)
- **Keputusan:** <PREFIX>-Dn baru / OD terjawab
- **Verifikasi:** perintah + hasil nyata
- **Masalah / catatan:** …
- **Berikutnya:** …
```

Log sebelum 2026-10-13 ada di [archive/log-2026-09.md](../../archive/log-2026-09.md) dan [archive/log-2026-10.md](../../archive/log-2026-10.md) (cari judul atau D-xxx fitur ini).

### 2026-10-19 — Print data jadi PDF dari template Formulir Data Karyawan; Formulir Aplikasi Word dihapus (Oatse)
- **Dikerjakan:** checklist "Print data → PDF" — renderer pdf-lib berlatar template PDF HR, `POST /employees/{id}/print`, tombol web (foto WebP → JPEG di browser), hapus Excel & seluruh Formulir Aplikasi Word/Gotenberg.
- **Keputusan:** EMP-D3; EMP-OD1 gugur.
- **Verifikasi:** typecheck ✔ · biome ✔ (tanpa warning) · boundaries ✔ (469 modul) · test shared 250 · api 812 · web 268 + 5 dilewati · QA browser lokal: PDF 3 halaman, foto tampil, tanpa tombol Formulir Aplikasi.
- **Masalah / catatan:** (1) foto profil tersimpan WebP → pdf-lib tidak bisa; diselesaikan dengan konversi di browser (sama seperti Excel lama). (2) **Data Rekening di PDF selalu kosong**: Print data sejak awal tidak membaca rekening (view=print) — perlu keputusan pemilik projek bila rekening mau ikut tercetak. (3) Sheet arsip per kategori dari Excel lama (D-058) tidak ada di PDF.
- **Berikutnya:** izin commit → rilis staging + QA staging.

### 2026-10-19 — Arahan: Print data jadi PDF dari template, Formulir Aplikasi Word dihapus (Oatse)
- **Dikerjakan:** hanya dokumen — rencana dicatat di checklist ("Print data → PDF dari template Formulir Data Karyawan") & Backlog PROGRESS; belum ada kode.
- **Keputusan:** arahan pemilik projek: temuan poin 8 maksudnya tombol **Print data** (bukan Formulir Aplikasi) → PDF memakai template PDF yang diberikan; Formulir Aplikasi Word dihapus. EMP-OD1 akan gugur; **EMP-OD2** baru (template dinamis vs posisi tetap).
- **Verifikasi:** – (dokumen saja)
- **Masalah / catatan:** salah tafsir sebelumnya — poin 8 sempat dikerjakan pada Formulir Aplikasi (EMP-D1, tersembunyi di rilis), bukan Print data.
- **Berikutnya:** kerjakan checklist Print data PDF bila diminta.

### 2026-10-19 — Template Formulir Data Karyawan + Tambah karyawan bertahap (Oatse)
- **Dikerjakan:** template Formulir Aplikasi diganti "Formulir Data Karyawan" HR (tanpa pernyataan, daftar dokumen, tanda tangan; + kepegawaian, divisi, rekening, tabel kontak darurat); halaman Tambah karyawan 7 langkah urutan Google Form + `POST /employees` `profile` (checklist EMP-D1 sub-item, EMP-D2).
- **Keputusan:** EMP-D2 (form bertahap, simpan sekali, grant tulis per bagian, audit tanpa nilai).
- **Verifikasi:** typecheck ✔ 3 workspace · `bunx biome ci .` ✔ (1 warning lama `employee-print.test.ts`) · boundaries ✔ (473 modul) · test shared **250** · api **813** · web **294** + 5 dilewati (`--maxWorkers=4`; suite 12 worker: 5 gagal acak karena batas waktu, termasuk Backlog flaky lama); application-form 12, integration employees 38, shared profil 3, web tambah karyawan 3; PDF fiktif Gotenberg lokal 3 halaman (`QA/2026-10-19-ui-ux/contoh-fiktif-*.pdf`).
- **Masalah / catatan:** kolom "No. Sertifikasi" formulir masih memakai penyelenggara (data `certificateNumber` belum dikirim di detail); log audit menyamarkan kunci `personal`/`bank` (disengaja). QA visual Playwright lokal 11/11 (`docs/qa/runs/2026-10-19-ui-ux-lokal.md`).
- **Berikutnya:** izin commit (Formulir tetap lokal, EMP-OD1).


### 2026-10-15 — Tampilan header detail karyawan (Oatse)
- **Dikerjakan (rencana disetujui pemilik projek):** checklist "Tampilan header detail karyawan". Banner warna logo + pola statis (revisi atas masukan: celah putih di kiri banner = `border-l` panel → dihapus; pola shape ditambah; tanpa animasi), kartu header, status karyawan vs status akun dipisah (beberapa putaran masukan: dua "Aktif" membingungkan → Status Karyawan "Magang | Masih bekerja", Akses Aplikasi "Bisa login / Tidak bisa login", teks rapi tanpa badge & titik, sebab di tooltip, peran akun hanya di tab Kepegawaian; pemilik projek: "untuk sementara boleh gini"), pop-up perbesar foto profil.
- **Keputusan:** tidak ada keputusan baru (warna logo hanya token lokal halaman ini; tetap tanpa gradien sesuai tema D-035).
- **Verifikasi:** typecheck ✔ · biome ✔ (1 warning lama) · boundaries ✔ · test web **283** (`employee-detail.test.tsx` +3: status terpisah, pop-up foto & tombol kamera, tanpa foto) · build ✔ · screenshot Playwright 1440/1024/390 px terang & gelap, scroll horizontal 0, 0 error JS.
- **Masalah / catatan:** header sempat diubah Mat (template pas foto, merge `e400586`) — perubahan ini hanya tampilan di atasnya. Istilah "Akses Aplikasi" masih bisa diganti (opsi: hapus dari header / "Akun HRIS") — sementara dipertahankan.
- **Berikutnya:** ✔ commit `bfd43d0` + push; ✔ staging rilis gel. 8 (TC-STG-102 LULUS). Usulan terpisah: warna brand aplikasi mengikuti logo.


### 2026-10-16 — Formulir Aplikasi Word/PDF dari template (EMP-D1) (Oatse)
- **Dikerjakan:** purwarupa dari `Formulir_Aplikasi_PT_CAP_Rev_1.docx` (data asli Sefail Sutanto dari staging + data fiktif; hasil di `/mnt/winD/WORK/Magang/QA/2026-10-16-docx-formulir/`), lalu tahap 1 di repo:
  - `apps/api/templates/formulir-aplikasi.docx` (template bertanda; footer "of 7" → field NUMPAGES; kontak darurat "Nama / Name : …"; foto = gambar mengambang `FOTO_KARYAWAN` di tengah sel, rasio dijaga) + `scripts/embed-templates.ts` → `src/modules/employee/application-form-template.ts` (base64).
  - `application-form.ts` (pemetaan data, isi docxtemplater, foto JPEG/PNG; WebP tidak didukung), `application-form.service.ts`, `core/pdf-convert.ts` (Gotenberg), env `GOTENBERG_URL`, route `GET /employees/{id}/application-form?format=docx|pdf`, `getEmployee(..., printFormat)` untuk audit.
  - `docker/gotenberg/` (font Liberation Sans Narrow, sha256 dicek) + layanan `gotenberg` (profil `pdf`) di `docker-compose.yml`, skrip `pdf:up`; `.env.example` + `.env` lokal `GOTENBERG_URL=http://localhost:3999`.
  - Web: `ApplicationFormButton` (PDF / Word) di header detail, saklar `FEATURES.applicationForm` (develop `true`).
- **Verifikasi:** typecheck api & web ✔ · biome berkas baru ✔ · unit `application-form.test.ts` **11/11** · integration employees `-t application-form` **3/3** (dengan Gotenberg: PDF nyata; tanpa `GOTENBERG_URL`: 422) · web `employee-detail.test.tsx` **12/12**. **Belum:** suite penuh + boundaries, QA browser `/mnt/winD/WORK/Magang/QA/2026-10-16-formulir-lokal/qa-formulir.ts` **4/4** (SA: tombol tampil, unduh PDF via Gotenberg lokal 3 halaman + Word; MANAGER tanpa tombol), 0 error JS/5xx. Putaran awal gagal karena skrip mengklik baris kerangka & saklar `applicationForm` di salinan kerja sedang `false` (diatur pemilik projek) — QA dijalankan dengan saklar dinyalakan sementara lalu berkas dikembalikan persis.
- **Verifikasi penuh:** typecheck ✔ · `biome ci` ✔ (1 warning lama) · boundaries ✔ (468) · shared 246 · api **806** · web 287 (+5 dilewati sesuai saklar salinan kerja) ✔.
- **Berikutnya:** commit lokal (izin 2026-10-16), **tidak di-push** sampai instruksi pemilik projek; tahap 2 halaman Template Dokumen; keputusan tempat Gotenberg staging/produksi.
- **Catatan:** pengambilan data Sefail (staging, view=print) tercatat di audit staging atas nama akun QA SA. Data Sefail tampak data asli → konfirmasi ke pemilik projek (memicu rotasi kredensial OD-4). `FEATURES.reports` di develop diubah pemilik projek ke `true` (belum di-commit; jangan disentuh).

### 2026-10-16 — Arahan pemilik projek setelah commit `a2ce380` (Oatse)
- **Saklar `FEATURES`:** nilai saklar di salinan kerja develop (saat ini `reports: true`, `timeManagement: false`, `applicationForm: false`) adalah pengaturan lokal pemilik projek → **jangan disentuh/di-commit** sampai ada instruksi; commit hanya membawa saklar baru milik tugas (dibuat dari HEAD).
- **Push:** `a2ce380` (+ commit lain yang belum di-push) menunggu instruksi.
- **Layanan PDF (EMP-OD1):** tempat Gotenberg staging/produksi menunggu instruksi tambahan; sementara hanya lokal (`bun run pdf:up`).
- **Data staging:** database staging akan di-reset pemilik projek (data Sefail Sutanto yang dipakai uji formulir ikut hilang) → tidak perlu tindak lanjut sekarang; rotasi kredensial tetap wajib sebelum data asli (RELEASE §6).
- **Berikutnya (setelah instruksi):** tahap 2 halaman Template Dokumen (unggah, cek penanda, pratinjau, versi, audit); bila template baru datang (bagian kontak darurat berubah), ganti `apps/api/templates/formulir-aplikasi.docx` → `bun run templates:embed`.
