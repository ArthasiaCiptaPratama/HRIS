# Organisasi — master data & bagan

> **Kode prefix:** `ORG` · **Fase:** 3 · **PIC:** Oatse · **Branch:** `HRIS/Oatse/Linux-Windows` (develop) · **Saklar `FEATURES`:** –
> **Status:** Berjalan — master data, geofence, unit berjenjang, bagan pos jabatan ✔ staging; level 1b–7 (ORG-D1), mode edit bagan (ORG-D2), jabatan rangkap ORG-D3 dibatalkan (ralat pengguna) ✔ develop 2026-11-10 (belum staging); sisa: profil perusahaan & pengaturan sistem

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
  - [x] Rilis ke staging + seed ulang staging (izin)
 - [x] **Mode edit bagan organisasi (ORG-D2)** ✔ develop 2026-11-10 — handoff supervisor 2026-11-10 10:12 (tambahan 2026-11-10: permintaan pengguna, hasil grill)
  - [x] 2a API: izin `org.structure.manage`, revisi bagan, `POST /org-chart/changes` (+ `/preview`), `/org-posts` tulis per PT + revisi — integration 16 (403/409/atomik/D-053/preview) ✔ lokal
  - [x] 2b Web: mode edit (draf, undo/redo, titik biru, seret titik/kartu/avatar, toolbar, dialog pos/atasan/hapus), desktop saja — web test draf ✔
  - [x] 2c Pratinjau dampak + simpan (409 → muat ulang, beforeunload) ✔ lokal
  - [-] ~~2d Jabatan rangkap (ORG-D3)~~ — **dibatalkan 2026-11-10 (ralat pengguna 11:30: tidak ada sistem rangkap)**; kode di-revert, tabel di-drop migrasi `20261110070000_drop_employee_secondary_posts`. Semula: tabel `employee_secondary_posts`, slot & D-053, operasi batch tambah/lepas rangkap, badge "Rangkap", dialog, profil, import `secondary` — integration + shared + web ✔
  - [x] Reset DB lokal + bagan PDF 06.11 (kutipan pengguna 10:57 & 11:02): seed 90 pos ACP nama fiktif, 55 nama asli lewat `org:import-local`, 4 akun uji dipulihkan, dummy lain dihapus; ralat 11:30: Superintendent HR & GA & Assistant Manager F A T Vacant, Seifal hanya HR Operational & IR Manager, Anggi hanya Finance Site, Foreman Finance dihapus
  - [x] Penanda HO/Site di bagan (ORG-D4): chip "HO"/"Site" di kartu + filter Semua | HO | Site; pos zona lain yang tersambung garis tampil redup (tambahan 2026-11-10: ralat pengguna 11:30 — hlm 4 PDF = HO, hlm 1–3 = Site; kutipan 11:40 "Chip + filter di bagan")
  - [x] Uji di Zen (headless, akun SA lokal) — 12 screenshot `QA/2026-11-10-org-chart-edit/`; 3 temuan diperbaiki (`089cb78`) — rilis gel. 2 2026-10-08 (PR #35/#36, Deploy #37762327378); seed ulang replika bagan + pembersihan karyawan dummy lain

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
| <a id="org-d4"></a>ORG-D4 | **Penanda Head Office vs Site di bagan (2026-11-10), tanpa migrasi:** akar Site = unit organisasi yang namanya **diawali kata "Site"** (tanpa beda huruf besar; mis. "Site Operasional (ACP)", "Site (ACP)" D-066); unit itu dan semua turunannya = **Site**, unit lain = **HO**; pos korporat tanpa chip. Zona pos mengikuti **unit jabatan pos** (bukan atasannya) — jadi di mode edit zona berubah bila jabatan/unit pos diganti, tidak bila hanya atasannya dipindah. Kartu diberi chip "HO"/"Site"; bagan diberi filter **Semua · HO · Site**; pos zona lain yang tersambung garis (atasan/bawahan langsung, atasan/bawahan fungsional) tetap tampil **redup** beserta garisnya (mis. Finance Site di HO dengan garis fungsional ke KTT di Site). Helper `unitZones` (shared). Kolom resmi zona di unit → Backlog. Orang yang tampil di bagan HO & Site = satu pos. | Ralat pengguna 2026-11-10 11:30 WIB ("Untuk slide 4 itu HO dan untuk 1-3 itu Site") + kutipan ±11:40 WIB "Chip + filter di bagan"; aturan nama akar & tampilan redup = keputusan supervisor atas nama pengguna. |
| <a id="org-d3"></a>ORG-D3 | **~~Jabatan rangkap~~ — DIBATALKAN 2026-11-10 (ralat pengguna 11:30 WIB: "Jadi tidak ada sistem rangkap"; orang yang tampil di bagan HO & Site = satu pos).** Isi semula: setiap karyawan punya 1 pos **utama** (`employees.org_post_id`: jabatan resmi, laporan, atasan dirinya) dan boleh **maks 5 pos rangkap** (`employee.employee_secondary_posts`; pos utama tidak dihitung), **PT sama** (pos korporat hanya SA). Pemegang rangkap mengisi slot pos, tampil di bagan bertanda "Rangkap", dan menjadi kandidat atasan bawahan pos itu (D-053: pemegang utama didahulukan; atasan dirinya tetap dari pos utama) → persetujuan cuti/lembur/SPL ikut. Diubah lewat mode edit bagan (operasi `addSecondaryPost`/`removeSecondaryPost`, pratinjau "Jabatan rangkap"); profil karyawan menampilkan "Pos rangkap" (baca saja); laporan & dashboard tetap memakai pos utama. Nonaktif/pindah PT → semua rangkap dilepas; menjadi pemegang utama pos yang dirangkap → baris rangkap dilepas. Data: Seifal (utama HR Operational & IR Manager; rangkap Superintendent HR & GA, Assistant Manager F A T), Anggi (utama Finance Site; rangkap Foreman Finance di bawah Supervisor F&T, fungsional ke KTT). | Kutipan pengguna 2026-11-10 ±11:10–11:35 WIB via supervisor ("Apakah tidak bisa 3 3 nya??", "jika 2 2nya gmn?", "Ya, buat jabatan rangkap", U1 "batasin 5 aja", U2 "harus satu PT", U3 "Bagan + profil", U4 "Di bawah Supervisor F&T"). |
| <a id="org-d2"></a>ORG-D2 | **Mode edit bagan organisasi (2026-11-10):** (1) bagan hanya bisa diubah setelah tombol "Mode edit" (desktop; HP read-only); (2) interaksi: titik biru 4 sisi (bawah = bawahan, samping = setingkat, atas diseret = ganti atasan), seret kartu ke kartu = pindah atasan / ke celah saudara = `sortOrder`, seret avatar = pindah orang, klik kartu = toolbar (Tambah bawahan, Ubah atasan, Atasan fungsional, Edit, Hapus) sebagai jalur keyboard; tata letak tetap otomatis (tanpa x,y); (3) tambah orang = pos baru + pilih karyawan yang ada (karyawan baru tetap lewat Penerimaan/Import); (4) izin baru `org.structure.manage` (SA otomatis; HR diberi SA) — HR hanya pos yang unitnya milik PT cakupannya; pos korporat, Direksi (L6/L7), dan pos tanpa PT hanya SA; penempatan pos cukup izin ini (diaudit; karyawan di luar cakupan ditolak); jabatan baru boleh dibuat di dalam batch (nama + unit + level, unit di PT cakupan) — **pengecualian D-049**; ubah/arsip jabatan tetap SA; halaman Pos jabatan tetap ada, tulisnya memakai izin ini; (5) draf di klien + undo/redo (hanya selama sesi, peringatan `beforeunload`), "Simpan" → pratinjau dampak (pos, penempatan, atasan D-053 berganti, pengajuan PENDING yang tetap diproses penyetuju lama) → satu transaksi + audit; revisi bagan global (`org_chart_state`), beda → 409 muat ulang; (6) hapus = arsip lunak, hanya pos kosong tanpa bawahan (bawahan ditawarkan naik ke atasan pos itu); slot penuh ditolak; (7) garis tegas siku, fungsional putus-putus, tanpa pemilih gaya garis; (8) validasi server = aturan shared klien (siklus, PT D-052, slot 1–50). | Grill pengguna 2026-11-10 10:05–10:12 WIB (handoff supervisor `2026-11-10-1012`); Q1–Q4 jawaban supervisor atas nama pengguna (rekomendasi); revisi global & kode L1B..L7 = keputusan kecil disetujui supervisor. |
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
