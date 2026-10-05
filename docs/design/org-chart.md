# Desain — Bagan Organisasi Interaktif (Pos Jabatan, Unit per PT, Atasan Otomatis)

> Keputusan: **D-051** (pos jabatan & bagan kanvas), **D-052** (unit organisasi milik PT; unit tanpa PT = fungsi korporat grup), **D-053** (atasan langsung otomatis dari pos, boleh manual) di [PLAN §8](../PLAN.md#8-keputusan-adr-ringkas). Terkait: D-040 (cakupan PT), D-049 (master data), D-050 (unit berjenjang & level jabatan).
> Status: **[done] lokal 2026-10-05** (API + web + seed dummy + script data asli lokal). Hasil grill pemilik projek 2026-10-05. Sumber bentuk: dokumen kantor "(2026) ACP - Orgchart Site 18.09.2026" (4 halaman, Visio).
> Dokumen ini tidak memuat data asli. Nama asli hanya di file luar repo `DATA-ASLI/orgchart-acp.json` dan DB lokal.

## 1. Tujuan

1. Struktur organisasi tampil **seperti dokumen kantor**: kotak per jabatan, nama pemegang, **Vacant**, satu jabatan bisa berisi beberapa orang (mis. Helper Bor ×3), garis **putus-putus** atasan fungsional, panel **Corporate Function**.
2. **Kanvas interaktif**: geser & zoom hanya di dalam kanvas, lipat/buka cabang, cari orang/jabatan lalu kanvas mengarah ke kotaknya, minimap, layar penuh, unduh PNG.
3. **Selalu dari database**: setiap mutasi karyawan, perubahan pos, atau resign langsung mengubah bagan — tidak ada gambar statis yang harus diperbarui manual.
4. Klik orang → **detail karyawan** (SA/HR) atau **kartu profil kerja** (role lain, kolom direktori saja).

## 2. Model data

| Konsep | Tabel | Keterangan |
|---|---|---|
| Jabatan (job) | `organization.positions` | Katalog nama jabatan per unit (dipakai form & import, D-042). **Tidak berubah**. |
| **Pos jabatan** (position/seat) | `organization.org_posts` (baru) | Kursi di bagan: `position_id`, `reports_to_id` (garis tegas), `functional_reports_to_id` (garis putus-putus), `headcount` (slot 1–50), `sort_order` (kiri→kanan), `code` (opsional, unik, mis. `ACP-KTT`), `deleted_at` (arsip). Satu jabatan bisa punya banyak pos (tiga "Assisten Bor" di bawah operator berbeda). |
| PT pemilik unit | `organization.departments.company_id` (baru, nullable) | Pos milik PT lewat unit jabatannya. **Kosong = fungsi korporat grup** (tampil di bagan semua PT). Nama unit tetap unik di seluruh grup (pencocokan nama import). |
| Pemegang pos | `employee.employees.org_post_id` (baru) | Hanya karyawan aktif & disetujui yang dihitung. Jabatan karyawan **harus** sama dengan jabatan pos. |
| Atasan manual | `employee.employees.manager_override` (baru) | `false` = `manager_id` dihitung dari pos (D-053). |

Penjaga DB: `CHECK headcount BETWEEN 1 AND 50`, `CHECK reports_to_id/functional_reports_to_id <> id`, FK `ON DELETE RESTRICT`. Migrasi `20261005032136_add_org_posts_and_unit_company` (hanya menambah).

## 3. Aturan

1. **Garis tegas hanya di dalam PT yang sama** (korporat ke korporat). **Garis fungsional** boleh ke PT sendiri atau ke fungsi korporat (mis. HR Manager ACP ⇢ HC Senior Manager grup). `@hris/shared/org-chart.ts` `canReportTo`.
2. **Tanpa siklus** (`wouldCreatePostCycle`); atasan ≠ atasan fungsional; atasan harus pos aktif.
3. **Slot**: penempatan ditolak bila pos penuh; slot tidak bisa dikurangi di bawah jumlah pemegang; jabatan pos tidak bisa diganti selama ada pemegang; pos berisi pemegang / punya bawahan tidak bisa diarsipkan.
4. **PT**: jabatan milik unit PT lain tidak bisa dipakai karyawan PT ini; pos korporat boleh ditempati karyawan PT mana pun. Ganti PT unit dicek ke semua pos & pemegangnya.
5. **Atasan otomatis (D-053)**: `manager_id` = pemegang pos atasan **terdekat ke atas** yang **ber-akun MANAGER/SUPER_ADMIN aktif** (PLAN §4.1 — dipakai approval Fase 5); pos kosong & pemegang tanpa akun Manager dilewati; pos berisi banyak orang → pemegang pertama (urut nomor induk). Dihitung ulang otomatis saat: penempatan/pindah pos/jabatan/PT, karyawan dinonaktifkan (slot dilepas → bawahan naik), struktur pos berubah. Perubahan role akun (iam) **tidak** memicu otomatis → tombol **Sinkronkan atasan** (SA) / `POST /org-posts/sync-managers`. Atasan manual (`manager_override`) tidak disentuh.
6. Karyawan dinonaktifkan → `org_post_id` dikosongkan (pos tampil Kosong). Aktif kembali = ditempatkan ulang.

## 4. Akses

| Aksi | SA | HR | MANAGER | EMPLOYEE |
|---|---|---|---|---|
| Kelola pos jabatan & sinkron atasan | ✅ | 👁 | ❌ | ❌ |
| PT pemilik unit (Master Data › Unit organisasi) | ✅ | 👁 | ❌ | ❌ |
| Tempatkan karyawan ke pos (form karyawan) | ✅ | ✅ PT ditugaskan | ❌ | ❌ |
| Lihat bagan PT | ✅ semua PT | 👁 PT ditugaskan | 👁 PT sendiri | 👁 PT sendiri (API; menu web Personal Management belum untuk EMPLOYEE) |
| Klik orang | detail lengkap | detail (sesuai grant) | kartu profil kerja | kartu profil kerja |

Pemegang **pos korporat** terlihat di bagan semua PT (bagian bagan grup). Bagan & kartu hanya berisi kolom direktori (nama, foto, jabatan, unit, PT, lokasi, email kantor) — tanpa data pribadi/sensitif. Audit: `organization.org_post.{create,update,archive,restore,delete,sync_managers}`, unit `organization.department.*` (+ `companyId`), karyawan `employee.employee.update` (+ `orgPostId`, `managerOverride`).

## 5. API

| Method | Path | Fungsi |
|---|---|---|
| GET | `/org-posts?view=&q=&companyId=` | Daftar pos (SA/HR), `companyId=corporate` untuk fungsi korporat |
| POST/PATCH/DELETE | `/org-posts`, `/org-posts/{id}` | Tambah/ubah/hapus permanen (SA) |
| POST | `/org-posts/{id}/archive`, `/restore` | Arsip/pulihkan (SA) |
| POST | `/org-posts/sync-managers` | Hitung ulang atasan otomatis (SA) |
| GET | `/org-chart?companyId=` | Bagan PT: unit, pos, pemegang (foto URL bertanda tangan), `unplacedCount`, `canOpenDetail`, `canManage` |
| GET | `/org-chart/people/{id}` | Kartu profil kerja |
| PATCH | `/employees/{id}` | + `orgPostId`, `managerOverride` |
| POST/PATCH | `/departments` | + `companyId` |

## 6. Web

- **Personal Management › Struktur Organisasi**: tab **Bagan organisasi** (default) · Per unit · Atasan langsung (tampilan lama). Pemilih PT (bila > 1) & tombol **Kelola pos** (SA).
- Kanvas `@xyflow/react` (dimuat lazy; chunk ±68 kB gzip). Tata letak **pohon rapi tanpa pustaka** (anak kiri→kanan sesuai `sort_order`, induk di tengah, tiap tingkat sejajar); panel korporat ditumpuk vertikal di kanan. `elkjs` sempat dicoba lalu dilepas (chunk 512 kB gzip).
- Tampilan awal **ringkas sampai tingkat ke-3** (seperti halaman Direksi dokumen kantor; cabang site dibuka dengan klik). Toolbar: cari, buka semua, ringkas, pas ke layar, layar penuh, unduh PNG, keterangan.
- Kartu: aksen warna per level (token `--org-*` terang/gelap), slot **Kosong** bergaris putus merah, ringkasan "+n lainnya" bila > 4 slot, tombol lipat dengan jumlah bawahan.
- **Administrasi › Master Data › Pos jabatan**; kolom/pilihan **PT** di Unit organisasi; form karyawan: **Pos jabatan** + centang "Atur atasan langsung secara manual".

## 7. Data dummy & data asli

- **Seed** (`prisma/seed/org-chart.ts`): replika **bentuk** bagan ACP (18 unit, 71 pos, 86 slot, 20 kosong) + bagan kecil CD2, pemegang dummy berawalan `DMY-` bernama fiktif. Dipakai lokal & staging.
- **Nama asli khusus lokal**: `bun run --cwd apps/api org:import-local -- --file=/mnt/winD/WORK/Magang/DATA-ASLI/orgchart-acp.json [--apply]` — menolak DB selain localhost; membuat karyawan `ASLI-<kode>-<n>` di pos yang sama & menghapus dummy di pos itu. Seed ulang mengembalikan dummy → jalankan lagi.
- Staging tetap dummy (rotasi rahasia staging ditunda dengan syarat itu; bila nama asli perlu tampil di staging: rotasi dulu, lalu izin terpisah).

## 8. Di luar cakupan / berikutnya

- Edit struktur dengan seret-sambung di kanvas (tidak dipilih; edit lewat Master Data).
- Nama unit unik per PT (Backlog) — saat ini unik di seluruh grup.
- Pemicu sinkron atasan dari perubahan role akun (butuh hook iam → employee); sementara tombol sinkron.
- Menu web Struktur Organisasi untuk EMPLOYEE (ESS) — API sudah mendukung.
