# Kasus Uji — employee & organization (D-035)

Otomasi api: `apps/api/tests/integration/employee/employees.test.ts` (INT), `apps/api/src/modules/employee/__tests__/employee.policy.test.ts` (POL), `apps/api/src/modules/organization/__tests__/organization.policy.test.ts` (ORG). Web: `apps/web/tests/personal-management.test.tsx` (WEB), `apps/web/tests/auth-routing.test.tsx` (NAV).

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
