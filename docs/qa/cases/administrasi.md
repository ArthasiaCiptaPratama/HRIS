# Kasus Uji — Halaman Administrasi & Akun Saya (web) + infrastruktur test

Otomasi: `apps/web/tests/admin-pages.test.tsx` (ADM), `apps/web/tests/auth-routing.test.tsx` (NAV), `apps/api/src/core/__tests__/app.test.ts` (APP), `apps/api/src/core/__tests__/env.test.ts` (ENV). Manual: skrip Playwright `/mnt/winD/WORK/Magang/QA/2026-09-30-seragam-admin/ui.ts` (UI).

| ID | Prioritas | Aturan | Role/grant | Prasyarat | Langkah | Hasil diharapkan | Otomasi |
|---|---|---|---|---|---|---|---|
| TC-ADM-001 | P2 | PROMPT §7 (DataTable bersama, paginasi server) | SA | ≥ 1 akun | Buka /akun, ganti "Baris per halaman" | `PageHeader` (h1 tunggal + breadcrumb "Administrasi"), tabel "Daftar akun", ringkasan "x–y dari n", request `pageSize` mengikuti pilihan | ADM, UI |
| TC-ADM-002 | P2 | PROMPT §7 | SA | filter tanpa hasil / daftar kosong | Cari email tak ada | EmptyState "Tidak ada yang cocok" / "Belum ada akun" | ADM, UI |
| TC-ADM-003 | P2 | PROMPT §7 | SA | grant ada | Buka /grant, filter "Semua" | Tabel "Daftar grant", email penerima, tombol Cabut; filter mengirim tanpa `active=true` | ADM, UI |
| TC-ADM-004 | P2 | PROMPT §7 | SA | audit ada | Buka /audit | Tabel "Daftar audit log"; kosong → "Belum ada entri audit" | ADM, UI |
| TC-ADM-005 | P3 | a11y (temuan 2026-09-29) | semua role | — | Buka /profil | Tepat satu h1 "Profil" + breadcrumb "Akun Saya" (tanpa label ganda) | ADM, UI |
| TC-ADM-006 | P2 | PROMPT §7 | semua role | ada / tanpa notifikasi | Buka /notifikasi | Daftar "Daftar notifikasi", "Tandai semua dibaca" aktif bila ada yang belum dibaca; kosong → EmptyState | ADM, UI |
| TC-ADM-007 | P1 | PLAN §4.3 (akses tidak berubah) | HR / MGR / EMP | login sungguhan | Buka /akun & /grant | HR: Akun tanpa "Ubah role", Grant → Akses ditolak; MGR/EMP: Akun → Akses ditolak | NAV, UI |
| TC-ADM-008 | P2 | UI mobile | SA 390 px | — | Buka 5 halaman | Tanpa scroll horizontal halaman, konsol bersih | UI |
| TC-ADM-009 | P1 | D-025 + Backlog 2026-09-29 | — | `.env` berisi SMTP_* lengkap | `bun run test` | `NODE_ENV=test` → pengirim `log` (tidak ada email sungguhan, tanpa timeout); di luar test SMTP lengkap → `smtp` | APP |
| TC-ADM-010 | P2 | PLAN §3.3 | — | — | `parseEnv` dengan `STORAGE_PATH_PREFIX` | Kosong / `dev/<nama>/` diterima; tanpa `/` akhir, `/` awal, `..`, huruf besar, spasi ditolak | ENV |
| TC-ADM-011 | P1 | D-040 akun per PT | HR ACP / HR tanpa PT / SA | akun karyawan ACP, PT lain, akun belum tertaut | GET /accounts, GET /accounts/:id, POST deactivate | HR ACP: akun ACP + belum tertaut, akun PT lain 404; HR tanpa PT: hanya belum tertaut; SA semua | INT (`tests/integration/iam/companies.test.ts`) |
| TC-ADM-012 | P1 | D-040 penugasan PT | SA / HR | akun HR | PUT /accounts/:id/companies | SA 200 + audit `iam.account.assign_companies` + notifikasi; cakupan HR langsung berubah; HR 403; akun non-HR 403; PT tak dikenal 422; ganda 400 | INT, WEB, UI |
| TC-ADM-013 | P2 | D-040 + D-034 | SA | akun HR ber-PT | PATCH role → MANAGER | Penugasan PT dicabut, audit `removedCompanyIds` | INT |
| TC-ADM-014 | P1 | Bug CORS PUT | browser | — | Preflight OPTIONS metode PUT | `Access-Control-Allow-Methods` memuat PUT (dan GET/POST/PATCH/DELETE) | APP (`src/core/__tests__/app.test.ts`) |

### Master Data (Tahap 3, D-049)

Otomasi: `apps/api/tests/integration/organization/master-data.test.ts` (MD), `apps/api/src/modules/organization/__tests__/organization.policy.test.ts` (POL), `packages/shared/tests/organization.test.ts` (SH), `apps/web/tests/master-data.test.tsx` (WMD).

| ID | Prioritas | Aturan | Role/grant | Prasyarat | Langkah | Hasil diharapkan | Otomasi |
|---|---|---|---|---|---|---|---|
| TC-ADM-015 | P1 | D-049 akses | SA / HR / MGR / EMP / tanpa token | — | GET `/<jenis>`; POST `/<jenis>` | Daftar: SA & HR 200, MGR/EMP 403, tanpa token 401; tulis: hanya SA (HR/MGR/EMP 403); grant apa pun tidak memberi HR hak kelola | MD, POL |
| TC-ADM-016 | P1 | D-040 | HR | HR ditugaskan ACP, ada PT lain | GET /companies | HR hanya melihat PT yang ditugaskan | MD |
| TC-ADM-017 | P2 | D-049 validasi | SA | — | Nama kosong, kode PT `A.B`, NPWP 3 digit, geofence sebagian, radius 5 m | 400 `VALIDATION_ERROR`; form web menampilkan pesan tanpa mengirim request | MD, SH, WMD |
| TC-ADM-018 | P2 | D-049 nama unik | SA | grade "X" ada (aktif/arsip) | Tambah "X" lagi | 409 `CONFLICT` "… pulihkan saja" | MD |
| TC-ADM-019 | P1 | D-049 arsip & pulihkan | SA | grade dipakai | Arsipkan → cek /master-data → pulihkan | Hilang dari pilihan (/master-data) tetapi tampil di "Diarsipkan"; ubah item terarsip 422; arsip ulang 409; pulihkan kembali tampil; audit `organization.grade.archive` | MD, WMD |
| TC-ADM-020 | P1 | D-049 hapus permanen | SA | item belum/sudah dipakai | DELETE | Belum dipakai 200 (hilang); sudah dipakai 409 "arsipkan saja", data & audit tidak berubah | MD |
| TC-ADM-021 | P1 | D-049 gabungkan jabatan | SA | 2 jabatan, karyawan + riwayat di sumber | POST /positions/:id/merge | Karyawan & riwayat (from/to) pindah ke tujuan, sumber diarsipkan, audit `organization.position.merge`; tujuan = sumber atau tujuan terarsip → 422 | MD |
| TC-ADM-022 | P1 | D-049 gabungkan departemen | SA | sumber punya jabatan bernama sama dengan tujuan + jabatan unik + sub-departemen | POST /departments/:id/merge | Jabatan bernama sama digabung (karyawan pindah), jabatan unik dipindah ke tujuan, sub-departemen pindah induk, sumber diarsipkan | MD |
| TC-ADM-023 | P2 | D-049 departemen | SA | A induk B | Ubah induk A → B / A → A; arsipkan departemen berjabatan aktif | 422 (siklus / masih ada jabatan aktif) | MD |
| TC-ADM-024 | P2 | D-038 + D-049 | SA | status berkategori | Arsipkan | 422 (pindahkan kategori dulu) | MD |
| TC-ADM-025 | P1 | D-045 + D-049 perusahaan | SA | PT baru → dipakai karyawan | Ubah kode sebelum & sesudah dipakai; arsipkan; gabungkan | Kode bisa diubah sebelum dipakai, terkunci (422) sesudahnya; nama tetap bisa diubah; arsip ditolak selama ada karyawan aktif; gabungkan PT tidak tersedia (404) | MD |
| TC-ADM-026 | P2 | D-049 UI | SA / HR / MGR | — | Buka Administrasi › Master Data | SA: tombol Tambah, menu aksi (Ubah, Gabungkan, Arsipkan/Pulihkan, Hapus); HR: tabel saja + penjelasan; MGR: halaman tidak terbuka; tempel koordinat "lat, long" mengisi dua kolom | WMD |
| TC-ADM-027 | P2 | D-040 + D-049 | SA | HR ditugaskan ke PT yang kemudian diarsipkan | Buka "Atur PT" | PT terarsip tidak dicentang & diberi keterangan "akan dilepas saat disimpan"; badge "PT diarsipkan" di tabel akun | (manual, belum diuji di browser) |
| TC-ADM-028 | P2 | D-049 poin 5 (peta) | SA | — | Dialog Tambah lokasi: klik peta, geser pin, ketik angka, "Pakai lokasi saya", cari tempat | Klik/GPS/hasil cari mengisi latitude & longitude (radius kosong → 100 m); ketik angka menggeser titik; lingkaran radius tampil; atribusi © OpenStreetMap tampil | WMD (peta di-mock); browser: manual |
