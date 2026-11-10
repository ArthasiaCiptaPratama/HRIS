# Organisasi — master data & bagan

> **Kode prefix:** `ORG` · **Fase:** 3 · **PIC:** Oatse · **Branch:** `HRIS/Oatse/Linux-Windows` (develop) · **Saklar `FEATURES`:** –
> **Status:** Berjalan — master data, geofence, unit berjenjang, bagan pos jabatan ✔ staging; sisa: profil perusahaan & pengaturan sistem

Multi-PT (D-039), 6 master data (D-049), peta geofence lokasi kerja, unit organisasi berjenjang & level jabatan (D-050), bagan organisasi berbasis pos jabatan + atasan otomatis (D-051–D-053, D-066).

Dokumen fitur ini: **README** (status, checklist, keputusan) · [design.md](design.md) · [log.md](log.md). Induk: [PROGRESS](../../PROGRESS.md).

## Checklist

Legenda: `[ ]` belum · `[~]` sedang · `[x]` selesai · `[-]` dibatalkan/ditunda. Langkah baru: sub-item `(tambahan YYYY-MM-DD) alasan`.

### Fase 3 — Organization
- [~] Skema + migrasi + seed dummy — tabel ERD (departments, positions, employment_statuses, grades, work_locations) + seed dummy ✔; company_profile, system_settings, holidays belum
- [ ] Profil perusahaan, pengaturan sistem
  - [x] Multi-perusahaan: tabel `companies` + ACP (migrasi) + CD2 dummy (seed), `employees.company_id` wajib (expand → backfill ACP → NOT NULL), riwayat `COMPANY_CHANGED` (tambahan 2026-09-30: D-039, Tahap 2) — migrasi `20261001100000_add_companies_and_account_scope` (semula `20260930061627`); commit lokal `4441206`, staging ✔ 2026-10-05 (antrean #2)
  - [x] Cakupan PT akun HR_ADMIN: `iam.account_companies`, policy & semua endpoint employee/iam dibatasi PT (di luar cakupan → 404), `PUT /accounts/:id/companies`, dialog "Atur PT" di halaman Akun, pemilih PT & kolom Perusahaan di web (tambahan 2026-09-30: D-040, Tahap 2) — api 318 · web 88, Playwright lokal 16/16 (`docs/qa/runs/2026-09-30-multi-pt.md`); staging ✔ 2026-10-05
- [x] Unit organisasi berjenjang (Direktorat/Divisi/Departemen/Seksi) + level jabatan (D-050) ✔ 2026-10-02 — migrasi, aturan induk, Master Data "Unit Organisasi", label "Unit organisasi", Struktur Organisasi, seed contoh direktorat (tambahan 2026-10-01: permintaan pemilik projek, dari org chart site ACP)
- [x] Departemen (hierarki), jabatan, level, lokasi kerja (geofence) — baca `GET /master-data` + struktur (D-035) ✔; **CRUD Tahap 3 (D-049)** ✔ 2026-10-01: 6 master data × tambah/ubah/arsip/pulihkan/hapus/gabungkan, geofence angka; hari libur dipindah ke Fase 5
  - [x] Pemilih peta geofence **Leaflet** (klik/geser pin, lingkaran radius, "Pakai lokasi saya", cari tempat Nominatim) di dialog lokasi, dimuat lazy (tambahan 2026-10-01: permintaan pemilik projek, mengganti D-049 poin 5 "peta di Fase 5") — web test 1 baru
  - [x] Radius geofence minimal **1 m** (sebelumnya 10 m; maks tetap 10.000 m), peta boleh zoom 19; label aksesibel peta (BUG-002); teks "pemilih peta menyusul" diganti — commit `d4d66f1` (tambahan 2026-10-05: permintaan pemilik projek & temuan QA staging)
  - [x] Dampak master data terarsip ke fitur lain: ubah karyawan (validasi rujukan yang berubah saja + nilai "(diarsipkan)" di form), import (`MASTER_ARCHIVED`; baris perbarui hanya field berubah), dialog Atur PT (PT terarsip dilepas) (tambahan 2026-10-01: permintaan pemilik projek "cek fitur yang terhubung")
 - [x] Kategori status kepegawaian (enum `EmploymentCategory` di `employment_statuses.category`) + seed 5 kategori (tambahan 2026-09-29: D-035 navigasi Data Pegawai Aktif)
  - [x] Kategori Karyawan Percobaan & Vendor (migrasi `20260930035548_add_probation_and_vendor_categories`) + seed 7 status (tambahan 2026-09-30: D-038, permintaan pemilik projek)
- [x] Policy + test — `canReadMasterData`, `canViewMasterDataAdmin`, `canManageMasterData` (11 test, TDD) ✔; integration `organization/master-data.test.ts` 17 ✔
- [x] Web: halaman master data (Administrasi → Master Data: perusahaan, departemen, jabatan, status, grade, site/lokasi; Tahap 3) — `features/organization/`, web test 5 ✔; uji browser belum (butuh password akun uji)
 - [x] Web: Struktur Organisasi (per departemen + bagan atasan, pencarian) (tambahan 2026-09-29: D-035 menu e)
 - [x] Level jabatan bernomor 1b–7 + warna bagan sesuai legenda (ORG-D1) ✔ lokal 2026-11-10 — migrasi enum + pemetaan data lama, shared/report/dashboard/master data/seed/test (tambahan 2026-11-10: handoff supervisor 10:12, bagan site 06.11.2026)
 - [x] **Bagan organisasi interaktif berbasis pos jabatan** (D-051–D-053, desain `docs/features/organisasi/design.md`) ✔ lokal 2026-10-05 · ✔ staging 2026-10-08 (rilis gel. 2, seed replika bagan) (tambahan 2026-10-05: permintaan pemilik projek, dari org chart site ACP)
  - [x] Skema: `org_posts`, `departments.company_id`, `employees.org_post_id/manager_override` (migrasi `20261005032136`, hanya menambah) + aturan shared (siklus, PT, atasan otomatis — TDD)
  - [x] API `/org-posts` (+ sinkron atasan), `/org-chart`, `/org-chart/people/:id`, penempatan pos di `/employees` + integration 9
  - [x] Web: kanvas React Flow (tab Bagan organisasi), Master Data › Pos jabatan, PT di unit, pos + atasan otomatis/manual di form karyawan + web test 11
  - [x] Seed replika bentuk bagan ACP + CD2 (nama fiktif); script `org:import-local` nama asli khusus DB lokal (file di luar repo)
  - [x] **Staging berisi nama asli bagan ACP** (D-066; tambahan 2026-10-12: permintaan pemilik projek — staging dibersihkan, sisa akun + master data; 63 karyawan `ASLI-` di 54 pos; Site = unit + lokasi "Site (ACP)") — `org:import-local --remote`, verifikasi MCP ✔; koordinat Site asli menyusul
  - [x] Rilis ke staging + seed ulang staging (izin) — rilis gel. 2 2026-10-08 (PR #35/#36, Deploy #37762327378); seed ulang replika bagan + pembersihan karyawan dummy lain

## Keputusan

Isi lengkap di [decisions.md](../../decisions.md).

- [D-039](../../decisions.md#d-039) Satu sistem, banyak entitas (multi-PT)
- [D-049](../../decisions.md#d-049) Kelola 6 master data
- [D-050](../../decisions.md#d-050) Unit organisasi berjenjang & level jabatan
- [D-051](../../decisions.md#d-051) Bagan organisasi berbasis pos jabatan
- [D-052](../../decisions.md#d-052) Unit organisasi milik PT
- [D-053](../../decisions.md#d-053) Atasan langsung otomatis dari pos
- [D-066](../../decisions.md#d-066) Nama asli bagan organisasi di staging

**Keputusan baru** (prefix `ORG-D1`, `ORG-D2`, …; tulis lengkap di sini, lalu daftarkan di indeks [PLAN §8](../../PLAN.md#8-keputusan-adr-ringkas) saat digabung ke develop):

| ID | Keputusan | Alasan / sumber |
|---|---|---|
| <a id="org-d1"></a>ORG-D1 | **Level jabatan bernomor 1b–7 + warna bagan (2026-11-10, mengubah [D-050](../../decisions.md#d-050) (4)):** enum `PositionLevel` = `L7` Direktur Utama · `L6` Direksi · `L5` KTT · `L4` Superintendent · `L3` Supervisor/Manager · `L2` Foreman · `L1A` Staff/Officer · `L1B` Helper (label "L4 · Superintendent"; urutan bagan & laporan dari L7 ke L1B). Warna kartu bagan: abu L7, merah L6, hijau L5, oranye L4, biru muda L3, ungu L2, cokelat L1a, biru tua L1b (token `--org-l*`, terang & gelap; warna hanya strip & latar tipis, teks tetap foreground). Data lama dipetakan migrasi `20261110040000_position_level_numbered`: NON_STAFF→L1B, STAFF→L1A, FOREMAN→L2, SUPERVISOR & MANAGER→L3, SUPERINTENDENT→L4, GENERAL_MANAGER→L5 (GM hijau di PDF = setara KTT), DIRECTOR→L6 (Direktur Utama diisi L7 lewat data). | Legenda pengguna (kutipan 2026-11-10 10:05 WIB via supervisor `supervisor-e0`, otoritatif bila PDF beda) + bagan `ACP - Orgchart Site 06.11.2026`; pemetaan GM→L5 = keputusan supervisor. |

## Keputusan terbuka

Tidak ada.

OD baru: `ORG-OD1`, … (tulis di sini + ringkasan di [PROGRESS](../../PROGRESS.md#keputusan-terbuka)).

## Kode

Detail modul: [organization](../../codemap/organization.md).

## QA

- [plans/2026-10-01-master-data.md](../../qa/plans/2026-10-01-master-data.md)
- [runs/2026-10-01-master-data.md](../../qa/runs/2026-10-01-master-data.md)
- [plans/2026-10-05-org-chart.md](../../qa/plans/2026-10-05-org-chart.md)
- [runs/2026-10-05-org-chart.md](../../qa/runs/2026-10-05-org-chart.md)
- [plans/2026-09-30-multi-pt.md](../../qa/plans/2026-09-30-multi-pt.md)
- [runs/2026-09-30-multi-pt.md](../../qa/runs/2026-09-30-multi-pt.md)
- [bugs/BUG-002-peta-tanpa-label-aksesibel.md](../../qa/bugs/BUG-002-peta-tanpa-label-aksesibel.md)

Aturan & templat QA: skill `hris-qa-docs` ([docs/qa/README.md](../../qa/README.md)).
