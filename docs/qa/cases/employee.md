# Kasus Uji — employee & organization (D-035)

Otomasi api: `apps/api/tests/integration/employee/employees.test.ts` (INT), `apps/api/src/modules/employee/__tests__/employee.policy.test.ts` (POL), `apps/api/src/modules/organization/__tests__/organization.policy.test.ts` (ORG). Web: `apps/web/tests/personal-management.test.tsx` (WEB), `apps/web/tests/auth-routing.test.tsx` (NAV), `apps/web/tests/employee-detail.test.tsx` (DET), `apps/web/tests/employee-print.test.ts` (PRN), `apps/web/tests/employee-status-actions.test.tsx` (STS); foto: `apps/api/tests/integration/employee/photo.test.ts` (FOTO). Manual: skrip Playwright `/mnt/winD/WORK/Magang/QA/2026-09-29-detail-print/ui.ts` (UI); D-038: `/mnt/winD/WORK/Magang/QA/2026-09-30-grup-kategori/ui.ts` (UI); Tahap 1: `/mnt/winD/WORK/Magang/QA/2026-09-30-menu-be/ui.ts` (UI). Import D-042 & dashboard: `apps/api/tests/integration/employee/{import,dashboard}.test.ts` (IMP, DSH), `packages/shared/tests/import.test.ts` (SHR), `apps/web/tests/{employee-import,dashboard}.test.tsx` (WIMP, WDSH), `/mnt/winD/WORK/Magang/QA/2026-09-30-rilis-import/e2e.ts` (UI). ID TC-EMP-072…078 dicadangkan untuk multi-perusahaan (belum dirilis).

| ID | Prioritas | Aturan | Role/grant | Prasyarat | Langkah | Hasil diharapkan | Otomasi |
|---|---|---|---|---|---|---|---|
| TC-EMP-001 | P1 | §4.3 matriks karyawan | semua role | — | Tabel `(role, grant, aksi, target)` | Sesuai matriks (45 baris) | POL |
| TC-EMP-002 | P1 | §4.3 data kerja | SA | 4 pegawai uji | GET /employees?q= | 200, meta.total 4, nama jabatan/departemen dirakit, TANPA key sensitif, `Cache-Control: private, no-store` | INT |
| TC-EMP-003 | P2 | D-035 kategori | HR | status berkategori | GET /employees?category=OUTSOURCING | Hanya pegawai kategori itu | INT |
| TC-EMP-004 | P2 | PROMPT §5 paginasi | HR | — | ?departmentId=&pageSize=2&page=2 | meta {2,2,4}, 2 baris | INT |
| TC-EMP-005 | P1 | D-035 MANAGER tim | MANAGER | tim 1 orang | GET /employees | Hanya bawahan langsung | INT |
| TC-EMP-006 | P1 | §4.3 EMPLOYEE | EMPLOYEE | — | GET /employees | 403 FORBIDDEN | INT |
| TC-EMP-007 | P1 | PROMPT §5 | tanpa token | — | GET /employees | 401 | INT |
| TC-EMP-008 | P2 | PROMPT §5 validasi | SA | — | ?category=RAJA; ?pageSize=101 | 400 VALIDATION_ERROR | INT |
| TC-EMP-009 | P2 | D-035 ringkasan | MANAGER / EMPLOYEE | — | GET /employees/summary | MANAGER: hitungan tim; EMPLOYEE 403 | INT |
| TC-EMP-010 | P1 | §4.2 data pribadi 🔑 | HR tanpa grant | — | GET /employees/:id | key `personal`, `bankAccount`, `familyMembers` tidak ada | INT |
| TC-EMP-011 | P1 | §4.2 grant + audit | HR + grant personal & bank | — | GET /employees/:id | Data sensitif ada; audit `employee.sensitive.read` {sections} | INT |
| TC-EMP-012 | P1 | D-035 need-to-know | SA | — | GET /employees/:id?view=work | Tanpa key sensitif, tanpa audit baru; view tidak dikenal 400 | INT |
| TC-EMP-013 | P1 | §4.3 tim | MANAGER | — | GET detail tim / di luar tim | 200 (tanpa sensitif) / 404 | INT |
| TC-EMP-014 | P1 | §4.3 sendiri | EMPLOYEE | tertaut pegawai | GET detail sendiri / orang lain | 200 + sensitif tanpa audit / 404; id tak dikenal 404; bukan UUID 400 | INT |
| TC-EMP-015 | P2 | §5.1 & D-035 riwayat | HR | — | POST /employees | 201; email disimpan huruf kecil; riwayat HIRED; audit create | INT |
| TC-EMP-016 | P2 | ERD unik | SA | nomor dipakai | POST nomor sama | 409 CONFLICT | INT |
| TC-EMP-017 | P1 | §4.1 manager_id | SA | atasan tanpa akun MANAGER | POST managerId | 422 | INT |
| TC-EMP-018 | P1 | §4.3 tambah | MANAGER | — | POST /employees | 403 | INT |
| TC-EMP-019 | P2 | PROMPT §5 | SA | — | POST joinDate format salah; PATCH body kosong | 400 | INT |
| TC-EMP-020 | P2 | D-035 riwayat jabatan | HR | atasan ber-akun MANAGER | POST dgn managerId lalu PATCH positionId | 201 + 200; riwayat HIRED → POSITION_CHANGED | INT |
| TC-EMP-021 | P2 | §4.1 atasan | SA | — | PATCH managerId = diri sendiri / bukan akun MANAGER | 422 | INT |
| TC-EMP-022 | P2 | D-035 ubah status | HR | — | POST status-change | 200 + riwayat; status sama 409; sebelum tgl masuk 422; MANAGER 403 | INT |
| TC-EMP-023 | P1 | D-035 nonaktif diri | HR tertaut | — | POST deactivate diri sendiri | 403 | INT |
| TC-EMP-024 | P1 | §4.5 + D-035 | HR | pegawai punya akun | POST deactivate | Pegawai nonaktif + exit_reason; akun nonaktif + ban; token akun itu 401; masuk daftar nonaktif; ulang 409; PATCH arsip 422 | INT |
| TC-EMP-025 | P2 | D-035 aktif kembali | HR | pegawai nonaktif | POST reactivate | Aktif, exit_reason/endDate null, akun TETAP nonaktif, riwayat REACTIVATED | INT |
| TC-EMP-026 | P3 | §4.3 direktori | EMPLOYEE | — | GET /org-structure | 200 berisi departemen → jabatan → pegawai; tanpa token 401 | INT |
| TC-EMP-027 | P3 | §4.3 kebijakan 👁 | MANAGER | — | GET /master-data | 200 | INT, ORG |
| TC-EMP-028 | P2 | §4.1 pilihan atasan | HR / MANAGER | — | GET /employees/manager-options | Hanya pegawai ber-akun MANAGER/SA; MANAGER 403 | INT |
| TC-EMP-029 | P2 | D-035 navigasi | SA/HR/MANAGER/EMPLOYEE | — | `visibleGroups()` | Menu sesuai role; MANAGER tanpa ubah status/arsip; EMPLOYEE tanpa Personal Management | WEB, NAV |
| TC-EMP-030 | P2 | D-035 daftar web | SA | API tiruan | Buka /personal/pegawai-aktif/pkwt, ketik cari | Query `category=PKWT&active=true`, pencarian → `?q=`, badge sidebar | WEB |
| TC-EMP-031 | P3 | D-035 Maintenance | HR | — | Buka /personal/arsip/keluarga | Halaman Maintenance "Data Keluarga sedang disiapkan" | WEB |
| TC-EMP-032 | P2 | D-035 alur UI penuh | SA | DB lokal + seed | Tambah → ubah status → nonaktifkan → aktifkan kembali lewat browser | Toast sukses tiap langkah; timeline riwayat 4 entri; 4 baris audit | manual (Playwright, harness lokal) |
| TC-EMP-033 | P3 | Permintaan pemilik projek 2026-09-29 | HR | — | Buka detail pegawai (`?pegawai=`) | Panel selebar layar (desktop & mobile); avatar ±112 px (mobile 96 px) di tengah paling atas; nama, badge, tombol di tengah | DET, UI |
| TC-EMP-034 | P3 | idem | HR | konten panjang (mobile) | Gulir panel | Baris tab menempel di atas; tombol "Kembali" tetap di atas baris tab & sejajar tengahnya | UI |
| TC-EMP-045 | P3 | Permintaan pemilik projek 2026-09-29 | HR / SA | — | Lihat pojok panel; klik "Kembali" | Tombol "← Kembali" (ikon panah kiri) di kiri atas, tanpa tombol X; klik menutup panel & `?pegawai` hilang dari URL | DET, UI |
| TC-EMP-035 | P2 | Riwayat "diubah oleh" | SA | riwayat oleh HR (tertaut pegawai + lokasi) & oleh SA tanpa data pegawai | GET /employees/:id | `changedBy` = {nama pegawai, role, lokasi kerja}; SA tanpa pegawai → email akun, lokasi null; riwayat tanpa pelaku → null | INT |
| TC-EMP-036 | P3 | idem | HR | — | Tab Riwayat di web | "Diubah oleh <nama> · <role> · <lokasi>"; tanpa pelaku → "sistem (data awal/impor)" | DET, UI |
| TC-EMP-037 | P1 | §4.3 + print SA/HR | semua role | — | `canPrintEmployee` | SA & HR boleh (termasuk data sendiri); MANAGER & EMPLOYEE tidak | POL |
| TC-EMP-038 | P1 | §4.2 need-to-know | HR tanpa grant | — | GET /employees/:id?view=print | 200 tanpa key `personal`/`familyMembers`/`bankAccount`; audit `employee.printed` {format: xlsx, sections: []} | INT |
| TC-EMP-039 | P1 | §4.2 + §4.5 audit | HR + grant | anggota keluarga | GET ?view=print | Data pribadi & keluarga (termasuk alamat) ada, rekening TIDAK dibaca; satu audit `employee.printed` {sections: [personal]}, tanpa `sensitive.read` ganda | INT |
| TC-EMP-040 | P1 | §4.3 | MANAGER / EMPLOYEE / tanpa token | — | GET ?view=print | MANAGER tim 403, EMPLOYEE sendiri 403, di luar tim 404, tanpa token 401; tanpa audit | INT |
| TC-EMP-041 | P2 | Template Excel | — | template asli | Isi template | Nilai di sel benar (biodata, periode `dd.mm.yyyy s/d dd.mm.yyyy`, departemen, posisi, pendidikan/pelatihan maks 5 urut tahun, keluarga ke baris Ayah/Ibu/Suami/Isteri/Anak, usia, kontak darurat); karakter `& < >` aman | PRN |
| TC-EMP-042 | P2 | Template Excel | — | template asli | Bandingkan dengan template | 244 merge, gaya sel, pengaturan cetak, logo & file lain identik; urutan sel naik; tepat satu deklarasi XML; file bukan xlsx/alamat sel salah ditolak | PRN |
| TC-EMP-043 | P2 | Print dari detail | HR / SA | login Supabase sungguhan | Klik "Print data" | Unduh `Data Pegawai - <nomor> - <nama>.xlsx`; toast di bawah-tengah; HR tanpa grant → catatan bagian pribadi dikosongkan; file terbaca pembaca Excel independen (openpyxl) | DET, UI |
| TC-EMP-044 | P1 | §4.3 | MANAGER | — | Buka detail | Tombol "Print data" & "Ubah data" tidak tampil | DET, UI |
| TC-EMP-046 | P1 | D-037 + §4.3 foto sendiri | semua role | — | `canChangePhoto` | SA/HR: pegawai lain & sendiri; MANAGER & EMPLOYEE: hanya sendiri; MANAGER→tim ditolak; akun tanpa pegawai tidak | POL |
| TC-EMP-047 | P1 | D-037 akses | HR / EMP / MGR / tanpa token | — | POST /employees/:id/photo/upload-url | HR 200 (path `employees/<id>/<uuid>.<ext>` + token); EMP/MGR diri sendiri 200; MGR→tim 403; EMP→lain 404; tanpa token 401; tipe gif 400 | FOTO |
| TC-EMP-048 | P2 | D-037 konfirmasi | HR | objek belum/sudah terunggah | POST /employees/:id/photo | Belum terunggah 422; terunggah → 200 + URL bertanda tangan, `photo_path` tersimpan, audit `employee.photo.update`; `photoUrl` di detail & daftar | FOTO |
| TC-EMP-049 | P1 | D-037 validasi | HR | objek bukan gambar / > 2 MB / milik pegawai lain / path aneh | POST konfirmasi | 422 + objek dibuang; path pegawai lain 422; `../`, nama bukan UUID, `.svg` → 400 | FOTO |
| TC-EMP-050 | P2 | D-037 ganti & hapus | HR / EMP | sudah ada foto | Ganti foto; DELETE | Objek lama terhapus; DELETE → null + audit `employee.photo.delete`; DELETE ulang tanpa audit baru; MGR→tim 403 | FOTO |
| TC-EMP-051 | P1 | D-037 bucket (staging) | anon / service role | bucket `employee-photos` | Smoke Storage sungguhan | Unggah via token OK; URL publik 400; anon list kosong; token dipakai ke path lain ditolak; GIF ditolak bucket; objek uji dibersihkan | manual (script) |
| TC-EMP-052 | P2 | D-037 UI | HR (desktop) / EMP (Profil, mobile) / MGR | login sungguhan | Unggah → ganti → print; unggah & hapus di Profil | Foto 600×800 (3:4) tampil di header & daftar; EMP ganti/hapus foto sendiri; MGR tanpa tombol kamera; konsol bersih | DET, UI |
| TC-EMP-053 | P2 | D-037 cetak | HR | foto ada | Print data | .xlsx berisi `xl/media/hris-image-1.jpeg` (600×787, rasio bingkai 0,762) tertambat B9→J25 jarak 3 px; logo & 244 merge utuh | PRN, UI |
| TC-EMP-054 | P2 | PLAN §3.3 prefix Storage lokal | HR | app dengan `storagePathPrefix` `dev/qa-test/` | POST upload-url → unggah → POST /photo | Path `dev/qa-test/employees/<id>/<uuid>.png`; konfirmasi 200; path lengkap tersimpan & tetap terbaca oleh app tanpa prefix | FOTO |
| TC-EMP-055 | P1 | PLAN §3.3 + D-037 kepemilikan path | HR | objek tanpa prefix / prefix developer lain | POST /photo dengan path lingkungan lain | 422 BUSINESS_RULE_VIOLATION di app berprefix maupun tanpa prefix | FOTO |
| TC-EMP-056 | P2 | D-038 filter grup | HR | status OUTSOURCING & VENDOR | GET /employees?group=EXTERNAL; ?group=INTERNAL; ?category=VENDOR | EXTERNAL = Outsourcing + Vendor (urut nama); INTERNAL tanpa keduanya; VENDOR hanya vendor | INT |
| TC-EMP-057 | P1 | D-038 + D-035 tim | MANAGER | anggota tim tanpa kategori eksternal | GET /employees?group=EXTERNAL | Hanya tim (kosong); cakupan tim tetap berlaku di filter grup | INT, UI |
| TC-EMP-058 | P2 | PROMPT §5 validasi | SA | — | GET /employees?group=PUSAT | 400 VALIDATION_ERROR | INT |
| TC-EMP-059 | P3 | D-038 navigasi | SA/HR | — | `visibleGroups()` | Seksi: Data Karyawan Aktif → Pengelolaan Karyawan → Arsip → Laporan & Rekap; isi: Semua Karyawan Aktif · Karyawan Internal (Tetap, Percobaan, PKWT, Pekerja Harian, Semua Karyawan Internal) · Program Magang (Magang) · Tenaga Kerja Eksternal (Outsourcing, Vendor, Semua Tenaga Kerja Eksternal) | WEB, UI |
| TC-EMP-060 | P3 | D-038 breadcrumb | HR | — | `activeTrail()` untuk slug pkwt, internal, magang, vendor, eksternal, semua | Seksi Data Karyawan Aktif › grup › anak; semua = item tanpa anak | WEB, UI |
| TC-EMP-061 | P2 | D-038 badge | HR | summary per kategori | Buka sidebar | Badge "Semua …" grup = jumlah kategorinya; Semua Karyawan Aktif = total | WEB, UI |
| TC-EMP-062 | P2 | D-038 halaman | HR | — | Buka `/pegawai-aktif/eksternal`, `/internal`, `/pkwt`, `/semua` | API `?group=`/`?category=` sesuai; chip = saudara dalam grup (di semua: per grup); judul & deskripsi sesuai | WEB, UI |
| TC-EMP-063 | P3 | D-038 slug lama | HR | — | Buka `/internship`, `/daily-worker`, slug tak dikenal | → `/magang`, `/harian`, `/semua` | WEB, UI |
| TC-EMP-064 | P3 | D-038 istilah | SA/HR | — | Sidebar, halaman, dialog, Ctrl+K, nama file print | Memakai "Karyawan" (Ubah Status Karyawan, Tambah karyawan, "Data Karyawan - … .xlsx"); URL tidak berubah | WEB, DET, PRN, UI |
| TC-EMP-065 | P2 | D-038 kategori baru | HR | seed Karyawan Percobaan & Vendor | Buka Karyawan Percobaan → Tambah karyawan | Nadia Putri berbadge Karyawan Percobaan; status default dialog = Karyawan Percobaan | UI |
| TC-EMP-066 | P3 | D-038 mobile | SA | 390 px | Buka drawer, klik Vendor | Tanpa scroll horizontal; grup tampil; berpindah ke `/vendor` | UI |
| TC-EMP-067 | P2 | D-035 ubah status (web) | HR | karyawan Percobaan tanpa akun | Detail → Ubah status → pilih Karyawan Tetap → Simpan | POST `/status-change` {status, tanggal, catatan}; status saat ini tidak bisa dipilih; DB berubah + riwayat STATUS_CHANGED | STS, UI |
| TC-EMP-068 | P1 | D-035 nonaktif (web) | HR | karyawan tanpa akun | Tab Nonaktifkan → alasan → konfirmasi → Nonaktifkan | Tombol mati sebelum alasan & konfirmasi; POST `/deactivate` RESIGNATION; masuk Data Karyawan Tidak Aktif | STS, UI |
| TC-EMP-069 | P2 | D-035 aktif kembali (web; menu belum ditampilkan) | HR | karyawan nonaktif | Pengaktifan → Aktifkan → Aktifkan kembali | POST `/reactivate` tanpa ubah status bila tidak dipilih; aktif lagi + riwayat REACTIVATED | STS, UI |
| TC-EMP-070 | P2 | Menu b–e mengikuti `FEATURES` | HR / MANAGER / EMPLOYEE | — | Buka 4 halaman b–e | HR: menu aktif → halaman asli, menu nonaktif → Maintenance "Segera"; MANAGER: hanya Struktur Organisasi; EMPLOYEE: Akses ditolak | WEB, UI |
| TC-EMP-071 | P3 | Tahap 1 pemilih karyawan | HR | 2 karyawan bernama sama | Cari di daftar kiri Ubah Status | Baris menampilkan nomor induk · jabatan; cari nomor induk menyaring | UI |
| TC-EMP-079 | P2 | D-042 deteksi | — | template dummy (judul, baris Control, header baris 5, kolom turunan) | Deteksi sheet/header, pemetaan otomatis | Header baris 5, 9 baris data, 31 kolom terpetakan; kolom turunan diabaikan; "NIK" berisi nomor induk → nomor induk | SHR, UI |
| TC-EMP-080 | P2 | D-042 normalisasi | — | variasi penulisan | Tanggal (serial Excel, dd-mm-yyyy, bulan ID), gender, agama, PTKP, pendidikan, status → kategori, NIK 15 digit | Nilai baku; NIK salah → error baris | SHR |
| TC-EMP-081 | P1 | D-042 pratinjau tanpa menulis | SA | — | POST /employee-imports/preview | Aksi per baris, master data baru, `previewHash`; DB tidak berubah; baris kosong di `counts.blank` | IMP |
| TC-EMP-082 | P1 | D-042 simpan | SA / HR | — | POST /employee-imports | Satu transaksi: karyawan + data pribadi + master data baru (audit source import) + riwayat; resign → nonaktif; job + `employee.import.completed` | IMP, UI |
| TC-EMP-083 | P2 | D-042 mode | SA | karyawan ada | UPSERT sel kosong / CREATE_ONLY | Sel kosong tidak menimpa; CREATE_ONLY melewati yang sudah ada | IMP |
| TC-EMP-084 | P1 | D-042 poin 5 grant | HR tanpa grant / HR ber-grant | — | Import kolom KTP & rekening | Tanpa grant: `skippedFields`, tidak tertulis, peringatan; ber-grant: tertulis + audit `employee.sensitive.write` | IMP, WIMP, UI |
| TC-EMP-085 | P1 | D-040 cakupan PT via import | HR | — | — | BELUM: menunggu rilis multi-perusahaan; rilis ini: kolom perusahaan dikenali tetapi tidak disimpan | IMP |
| TC-EMP-086 | P1 | D-042 akses | MANAGER / EMPLOYEE / tanpa token | — | POST preview; buka `/personal/import` | 403 / 401; body tidak valid 400; EMPLOYEE tidak bisa membuka halaman | IMP, WIMP, UI |
| TC-EMP-087 | P2 | D-042 `previewHash` | SA | data berubah setelah pratinjau | Simpan dengan hash lama | 409; web memuat ulang pratinjau lalu simpan berhasil | IMP, WIMP |
| TC-EMP-088 | P2 | D-040 PT bawaan | — | — | — | BELUM: menunggu rilis multi-perusahaan | — |
| TC-EMP-089 | P2 | D-042 alur web | HR | — | Tombol Import di Data Karyawan Aktif → unggah → pemetaan → pratinjau → simpan | Layar selesai; daftar & badge bertambah; kembali ke kategori asal; import ulang memakai profil pemetaan & 0 dibuat | WIMP, UI |
| TC-EMP-090 | P3 | D-042 laporan masalah | HR | baris error | Unduh baris bermasalah | .xlsx: header asli + "Keterangan import"; .xls ditolak; mobile tanpa scroll horizontal | WIMP, UI |
| TC-EMP-091 | P1 | Dashboard akses | SA / HR / MANAGER / EMPLOYEE / tanpa token | — | GET /dashboard; buka `/` | SA/HR 200 + grafik; MANAGER/EMPLOYEE 403 & web tidak meminta `/dashboard` (sapaan); tanpa token 401 | DSH, WDSH, UI |
| TC-EMP-092 | P2 | Dashboard agregat | HR | 2 aktif + 1 nonaktif baru | GET /dashboard | Total/aktif/nonaktif bertambah 3/2/1; lokasi, departemen, jabatan, tahun masuk, jenjang tertinggi terhitung; respons tanpa nama/nomor induk | DSH, UI |
