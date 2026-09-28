# PROGRESS — HRIS

> **Fungsi file ini:** mencatat **sudah sampai mana**: status fase, fokus saat ini, checklist, blocker, backlog, dan log setiap sesi kerja.
> Baca **§2 Fokus Saat Ini** di awal setiap sesi. Perbarui file ini di **akhir setiap sesi** (lihat PROMPT §2).

**Legenda:** `[ ]` belum · `[~]` sedang dikerjakan · `[x]` selesai · `[-]` dibatalkan/ditunda (beri alasan)

---

## 1. Ringkasan Status

| Fase | Nama             | Status       |
| ---- | ---------------- | ------------ |
| 0    | Instruksi Projek | Review       |
| 1    | Fondasi          | Belum mulai  |
| 2    | IAM              | Belum mulai  |
| 3    | Organization     | Belum mulai  |
| 4    | Employee         | Belum mulai  |
| 5    | Attendance       | Belum mulai  |
| 6    | Leave            | Belum mulai  |
| —    | **Rilis 1**      | –            |
| 7    | Contract         | Belum mulai  |
| —    | **Rilis 2**      | –            |
| 8    | Payroll          | Belum mulai  |
| 9    | Hardening        | Belum mulai  |
| —    | **Rilis 3**      | –            |

Status yang dipakai: `Belum mulai` · `Berjalan` · `Review` · `Selesai`

---

## 2. Fokus Saat Ini

- **Fase aktif:** 0 — Instruksi Projek
- **Langkah berikutnya:**
  1. Pemilik projek menyelesaikan review PLAN, CODEMAP, PROGRESS, PROMPT (sudah di-push ke `HRIS/Oatse/Linux-Windows`).
  2. Jawab OD-7; minta admin IT menyiapkan akun pengirim email (OD-5).
  3. Mulai Fase 1 (Fondasi).
- **Blocker aktif:** OD-7 (cara `db:deploy` ke staging) harus terjawab sebelum Fase 1 selesai. OD lain baru memblokir fase/rilis berikutnya.

---

## 3. Checklist Per Fase

### Fase 0 — Instruksi Projek
- [x] Sesi grill keputusan (D-001 s.d. D-022)
- [x] `docs/PLAN.md`
- [x] `docs/CODEMAP.md`
- [x] `docs/PROGRESS.md`
- [x] `docs/PROMPT.md`
- [x] `CLAUDE.md` + tautan di `README.md`
- [ ] Review & persetujuan pemilik projek
- [x] Branch `HRIS/Oatse/Linux-Windows` dibuat, di-commit & di-push

### Fase 1 — Fondasi
- [ ] Root: Bun workspaces, `tsconfig.base.json`, Biome, `.editorconfig`, `.gitattributes` (LF), `.gitignore`, `.env.example`
- [ ] Branch `HRIS/debug/database` dan `HRIS/debug/fe-be` dibuat dari `main`; proteksi `main`
- [ ] PostgreSQL lokal: `docker-compose.yml` (image Postgres, versi = Supabase) + script `db:up`/`db:down`
- [ ] Supabase project **staging**: self sign-up nonaktif, bucket private, *Redirect URLs* termasuk `http://localhost:5173`, Data API tidak mengekspos skema modul; dipakai untuk Auth & Storage saat develop
- [ ] Cocokkan versi major PostgreSQL di `docker-compose.yml` dengan project staging
- [ ] Custom SMTP Supabase staging memakai akun Google Workspace pengirim (D-025; menunggu OD-5)
- [ ] `packages/shared` (roles, permissions, enums)
- [ ] `apps/api`: Hono + `@hono/zod-openapi`, `env.ts`, `core/` (errors, response, logger, request-id, db), `/api/v1/health`, `/openapi.json`, `/docs`
- [ ] Prisma 7: `prisma.config.ts`, skema multi-file, multi-schema, driver adapter, migrasi awal (buat semua skema)
- [ ] `apps/web`: Vite + React + TS, Tailwind, shadcn/ui, React Router, TanStack Query, layout kosong
- [ ] dependency-cruiser + aturan batas modul
- [ ] Test: `bun test` (api) & Vitest (web) dengan contoh test
- [ ] GitHub Actions: typecheck, lint, boundaries, migrasi dari DB kosong + test (service container Postgres), build
- [ ] Keputusan OD-7, lalu `db:deploy` migrasi awal ke staging
- [ ] Vercel: project `api` (Bun runtime, region `sin1`) dan `web`; preview untuk `HRIS/debug/fe-be`
- [ ] `Dockerfile` api (build lokal berhasil)
- [ ] Verifikasi `bun install && bun run dev` di **Linux**
- [ ] Verifikasi `bun install && bun run dev` di **Windows**

### Fase 2 — IAM
- [ ] Skema `iam`, `audit`, `notification` + migrasi
- [ ] `core/auth`: verifikasi JWT Supabase (JWKS) + verifier pengganti untuk test
- [ ] `core/access`: muat role, grant (cek kedaluwarsa), tim; `requireRole`/`requireGrant`
- [ ] Test matriks akses (TDD) untuk aksi IAM
- [ ] `GET /me`
- [ ] Kelola role HR_ADMIN/MANAGER; aturan Super Admin Utama (4 hak eksklusif, tidak boleh 0 SUPER_ADMIN)
- [ ] Grant: beri, cabut, kedaluwarsa, audit
- [ ] Audit log (core) + halaman audit untuk SUPER_ADMIN
- [ ] Notifikasi in-app + pengiriman email via SMTP (lokal: dicatat ke log; staging/produksi: Google Workspace) + `email_outbox`
- [ ] Keputusan OD-5 (akun pengirim Workspace + App Password) sebelum uji undangan
- [ ] Script `bootstrap-super-admin` dan `recover-primary-admin`
- [ ] Web: halaman login, sesi, route guard per role, menu per role, manajemen akun & grant

### Fase 3 — Organization
- [ ] Skema + migrasi + seed dummy
- [ ] Profil perusahaan, pengaturan sistem
- [ ] Departemen (hierarki), jabatan, level, lokasi kerja (geofence), hari libur
- [ ] Policy + test
- [ ] Web: halaman master data

### Fase 4 — Employee
- [ ] Keputusan OD-6 (ubah data sensitif milik sendiri)
- [ ] Skema + migrasi + seed dummy (NIK/NPWP fiktif berformat valid)
- [ ] CRUD karyawan + filter, pencarian, paginasi
- [ ] `manager_id` + validasi (harus MANAGER/SUPER_ADMIN)
- [ ] Data sensitif & rekening dengan grant (HR: semua, MANAGER: tim)
- [ ] Dokumen (signed upload URL), kontak darurat, riwayat
- [ ] Karyawan ubah data diri terbatas
- [ ] Undangan akun dari data karyawan
- [ ] Import CSV/Excel (template, validasi per baris, laporan error)
- [ ] Policy + test
- [ ] Web: daftar, detail, form, import

### Fase 5 — Attendance (+ Approval)
- [ ] Modul `approval`: mode paralel & tunggal, override, kasus khusus (PLAN §5.2) + test
- [ ] Skema attendance + migrasi
- [ ] Template shift, jadwal & penugasan
- [ ] Absen: geofence, selfie (kamera langsung, kompres, bucket private), waktu server, penanda "boleh di luar lokasi"
- [ ] Koreksi absensi (paralel) & lembur (MANAGER)
- [ ] Rekap harian/bulanan
- [ ] Tutup periode absensi (`payroll.period.prepare`)
- [ ] Cron `purge-selfies`
- [ ] Policy + test
- [ ] Web: tombol absen + kamera, riwayat, inbox approval, rekap

### Fase 6 — Leave
- [ ] Skema + migrasi
- [ ] Jenis cuti tahunan & izin, kuota, wajib dokumen
- [ ] Saldo: akrual, hold, penyesuaian, import saldo CSV/Excel
- [ ] Pengajuan + approval paralel + pembatalan
- [ ] Hitung hari kerja (jadwal & libur); tandai absensi saat disetujui
- [ ] Cron `leave-accrual`
- [ ] Policy + test
- [ ] Web: pengajuan, saldo, inbox approval

### Rilis 1
- [ ] Keputusan OD-4 (akun & paket), OD-8 (rollback & backup)
- [ ] Supabase produksi + migrasi + bootstrap SUPER_ADMIN Utama
- [ ] Vercel production + env
- [ ] Uji asap (smoke test) di produksi

### Fase 7 — Contract
- [ ] Skema + migrasi
- [ ] Jenis kontrak, CRUD kontrak, perpanjangan, terminasi
- [ ] Aturan 1 kontrak aktif per karyawan, cek overlap
- [ ] Cron `contract-expiry`
- [ ] Policy + test
- [ ] Web: tab kontrak, daftar kontrak akan habis

### Fase 8 — Payroll
- [ ] Keputusan OD-1 (metode pajak), OD-2 (THR), OD-3 (verifikator)
- [ ] Golden cases disusun & diverifikasi pihak luar
- [ ] Skema + migrasi
- [ ] Konfigurasi tarif BPJS, TER, PTKP
- [ ] Komponen gaji & struktur gaji per karyawan
- [ ] Perhitungan (TDD): BPJS, PPh 21 TER, perhitungan ulang masa pajak terakhir, lembur, potongan
- [ ] Periode: hitung → review → lock → terbit; snapshot
- [ ] Slip gaji (lihat & unduh)
- [ ] Policy + test
- [ ] Web: konfigurasi, struktur gaji, proses payroll, slip

### Fase 9 — Hardening
- [ ] E2E Playwright: login, cuti paralel, absen + selfie, payroll
- [ ] Review keamanan (akses, PII di log, bucket, CORS, rahasia)
- [ ] Uji performa dasar
- [ ] Runbook: deploy, rollback, pemulihan Super Admin Utama

---

## 4. Keputusan Terbuka

| ID   | Ringkasan                                   | Memblokir | Status              |
| ---- | ------------------------------------------- | --------- | ------------------- |
| OD-1 | Metode PPh 21 (gross/gross-up/net)          | Fase 8    | Menunggu keputusan  |
| OD-2 | THR dihitung sistem?                        | Fase 8    | Menunggu keputusan  |
| OD-3 | Verifikator golden cases payroll            | Fase 8    | Menunggu keputusan  |
| OD-4 | Kepemilikan akun Vercel/Supabase & paket     | Rilis 1   | Menunggu keputusan  |
| OD-5 | Email: penyedia = Google Workspace (D-025); sisa akun pengirim & App Password | Fase 2      | Sebagian terjawab |
| OD-6 | Ubah data sensitif/gaji milik sendiri       | Fase 4    | Menunggu keputusan  |
| OD-7 | Cara `db:deploy` & env per environment      | Fase 1    | Menunggu keputusan  |
| OD-8 | Rollback migrasi & backup produksi          | Rilis 1   | Menunggu keputusan  |

Detail & rekomendasi: [PLAN §9](./PLAN.md#9-keputusan-terbuka).

---

## 5. Backlog

Ide atau fitur di luar fase aktif dicatat di sini dulu, **tidak langsung dikerjakan**.

- Aplikasi mobile (projek terpisah, memakai API yang sama)
- MFA untuk SUPER_ADMIN/HR_ADMIN
- Notifikasi WhatsApp
- Pencocokan wajah pada selfie absensi
- Approval berjenjang lebih dari satu atasan

---

## 6. Log Sesi

Entri terbaru di **atas**. Salin template di bagian bawah.

### 2026-09-28 — Fase 0: ganti penyedia email ke Google Workspace
- **Dikerjakan:** mengganti rencana SMTP dari Resend ke SMTP Google Workspace kantor di PLAN, CODEMAP, PROGRESS.
- **Keputusan:** D-025 menggantikan D-024. OD-5 tinggal akun pengirim & izin App Password (sebelum uji undangan Fase 2); pertanyaan kuota produksi dihapus karena batas Workspace cukup.
- **File berubah:** `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROGRESS.md`.
- **Verifikasi:** perubahan dokumen saja; grep memastikan tidak ada rujukan Resend yang masih berlaku.
- **Berikutnya:** minta admin IT membuat akun pengirim (OD-5), jawab OD-7, review akhir → branch kerja → Fase 1.

### 2026-09-28 — Fase 0: review dokumen pasca D-023 & keputusan email
- **Dikerjakan:** review menyeluruh dokumen instruksi; menyelaraskan alur dengan database lokal (D-023): aturan portabilitas migrasi, tidak ada FK/skema `auth` lokal, Data API tidak mengekspos skema modul, bootstrap cari/buat user Auth, plus-addressing untuk akun uji, redirect URL lokal, cron manual di lokal, CI dengan service container Postgres, E2E di lokal + Auth staging.
- **Keputusan:** D-024 (Resend SMTP free plan untuk Auth & email aplikasi). OD-5 sebagian terjawab (sisa domain & kuota). OD baru: OD-7 (cara `db:deploy`), OD-8 (rollback & backup). Skema `auth` tiruan di lokal dipertimbangkan dan **tidak** dipakai (FK lokal tidak menjaga apa pun, dan skema `auth` dikelola Supabase).
- **File berubah:** `docs/PLAN.md` (v1.1), `docs/CODEMAP.md`, `docs/PROMPT.md`, `docs/PROGRESS.md`, `README.md`.
- **Verifikasi:** perubahan dokumen saja; dicek konsistensi antar-file dengan grep.
- **Berikutnya:** jawab OD-7, review akhir → buat branch kerja → Fase 1.

### 2026-09-28 — Fase 0: revisi database development
- **Dikerjakan:** mengganti Supabase CLI lokal dengan PostgreSQL 17 di container Docker; Auth & Storage saat develop memakai Supabase staging.
- **Keputusan:** D-023. Konsekuensi: tidak ada FK ke `auth.users`; develop butuh internet; project staging dibuat di Fase 1.
- **File berubah:** `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROMPT.md`, `docs/PROGRESS.md`.
- **Verifikasi:** belum ada kode; perubahan dokumen saja.
- **Berikutnya:** review dokumen → buat branch kerja → Fase 1.

### 2026-09-25 — Fase 0: grill keputusan & file instruksi
- **Dikerjakan:** sesi grill 28 pertanyaan, lalu menulis `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROGRESS.md`, `docs/PROMPT.md`, `CLAUDE.md`, dan memperbarui `README.md`.
- **Keputusan:** D-001 s.d. D-022 (PLAN §8). Perubahan besar dari brief awal:
  - microservice → **modular monolith**
  - Drizzle → **Prisma 7**
  - Vanilla JS → **TypeScript**
  - Docker produksi → **Vercel** (Docker hanya lokal)
  - Auth sendiri → **Supabase Auth**
- **Keputusan terbuka:** OD-1 s.d. OD-6.
- **File berubah:** `docs/*`, `CLAUDE.md`, `README.md`.
- **Verifikasi:** belum ada kode; menunggu review pemilik projek.
- **Berikutnya:** review dokumen → buat branch kerja → Fase 1.

<!--
### YYYY-MM-DD — Fase N: <judul singkat>
- **Dikerjakan:** apa yang selesai (rujuk item checklist).
- **Keputusan:** D-xxx baru atau OD yang terjawab.
- **File berubah:** file/folder utama.
- **Verifikasi:** perintah yang dijalankan (typecheck/lint/test/manual) dan hasilnya.
- **Masalah / catatan:** bug, workaround, hal yang perlu diwaspadai.
- **Berikutnya:** langkah konkret sesi selanjutnya.
-->
